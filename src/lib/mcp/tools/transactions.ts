// MCP tools: transactions, transfers, and the email review queue.
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { recomputeBalance } from "@/lib/accounts";
import { upsertVendor } from "@/lib/transactions";
import { minorToMajor } from "@/lib/money";
import { applyParserRules } from "@/lib/email-parser";
import { defineTool, ToolError } from "@/lib/mcp/types";
import {
  TRANSACTION_INCLUDE,
  parseDateArg,
  requireAccount,
  requireCategory,
  toMinor,
  transactionView,
} from "@/lib/mcp/shared";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `to` is inclusive the way a person means it: "to 2026-09-30" covers that
 * whole day. Returned bound is exclusive, matching the app's range queries.
 */
function exclusiveEnd(value: string): Date {
  const parsed = parseDateArg(value, "to");
  if (!DATE_ONLY.test(value.trim())) return parsed;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1);
}

export const listTransactions = defineTool({
  name: "list_transactions",
  title: "List transactions",
  description:
    "Search transactions across every account, newest first. Filters combine (AND). Amounts are signed major " +
    "units: out negative, in positive. `totals` covers every matching transaction, not just the returned page, " +
    "so it answers 'how much did I spend on X' directly. Set `excludeTransfers` for spending questions — " +
    "transfers move money between the user's own accounts and are not income or expense.",
  readOnly: true,
  inputSchema: z.object({
    accountId: z.string().optional(),
    categoryId: z.string().optional(),
    direction: z.enum(["out", "in"]).optional().describe("out = spending, in = income."),
    status: z.enum(["confirmed", "pending_review"]).optional(),
    source: z.enum(["manual", "email"]).optional(),
    from: z.string().optional().describe("Earliest date, inclusive. YYYY-MM-DD or ISO timestamp."),
    to: z.string().optional().describe("Latest date, inclusive. YYYY-MM-DD or ISO timestamp."),
    search: z
      .string()
      .optional()
      .describe("Case-insensitive text match on description, notes or vendor name."),
    excludeTransfers: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z.string().optional().describe("`nextCursor` from a previous call."),
  }),
  handler: async (args, ctx) => {
    if (args.accountId) await requireAccount(ctx, args.accountId);
    if (args.categoryId) await requireCategory(ctx, args.categoryId);

    const where: Prisma.TransactionWhereInput = {
      account: { userId: ctx.userId },
      ...(args.accountId ? { accountId: args.accountId } : {}),
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.direction ? { amount: args.direction === "out" ? { lt: 0 } : { gt: 0 } } : {}),
      ...(args.excludeTransfers ? { transferGroupId: null } : {}),
      ...(args.from || args.to
        ? {
            occurredAt: {
              ...(args.from ? { gte: parseDateArg(args.from, "from") } : {}),
              ...(args.to ? { lt: exclusiveEnd(args.to) } : {}),
            },
          }
        : {}),
      ...(args.search
        ? {
            OR: [
              { description: { contains: args.search, mode: "insensitive" } },
              { notes: { contains: args.search, mode: "insensitive" } },
              { vendor: { name: { contains: args.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    // Totals are aggregated in the database, per account, so a broad filter
    // never pulls every matching row into memory.
    const [rows, byAccount, accounts] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: args.limit + 1,
        ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      }),
      prisma.transaction.groupBy({
        by: ["accountId"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.account.findMany({
        where: { userId: ctx.userId },
        select: { id: true, currency: true },
      }),
    ]);
    const outflows = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { AND: [where, { amount: { lt: 0 } }] },
      _sum: { amount: true },
    });

    const hasMore = rows.length > args.limit;
    const page = hasMore ? rows.slice(0, args.limit) : rows;

    // Per-currency totals — accounts can be JMD or USD and must never be summed together.
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const outByAccount = new Map(
      outflows.map((row) => [row.accountId, Math.abs(minorToMajor(row._sum.amount ?? 0n))])
    );
    const totals = new Map<string, { in: number; out: number; net: number; count: number }>();
    let matchCount = 0;
    for (const row of byAccount) {
      const currency = currencyOf.get(row.accountId) ?? "???";
      const bucket = totals.get(currency) ?? { in: 0, out: 0, net: 0, count: 0 };
      const net = minorToMajor(row._sum.amount ?? 0n);
      const out = outByAccount.get(row.accountId) ?? 0;
      bucket.net += net;
      bucket.out += out;
      bucket.in += net + out;
      bucket.count += row._count._all;
      matchCount += row._count._all;
      totals.set(currency, bucket);
    }

    return {
      transactions: page.map(transactionView),
      matchCount,
      totalsByCurrency: Object.fromEntries(
        [...totals].map(([currency, t]) => [
          currency,
          {
            in: Number(t.in.toFixed(2)),
            out: Number(t.out.toFixed(2)),
            net: Number(t.net.toFixed(2)),
            count: t.count,
          },
        ])
      ),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },
});

export const getTransaction = defineTool({
  name: "get_transaction",
  title: "Get transaction",
  description:
    "One transaction in full, including the source email when it came from a bank alert.",
  readOnly: true,
  inputSchema: z.object({ transactionId: z.string() }),
  handler: async (args, ctx) => {
    const transaction = await prisma.transaction.findFirst({
      where: { id: args.transactionId, account: { userId: ctx.userId } },
      include: { ...TRANSACTION_INCLUDE, rawEmail: true },
    });
    if (!transaction) throw new ToolError(`No transaction with id "${args.transactionId}".`);
    return {
      transaction: transactionView(transaction),
      email: transaction.rawEmail
        ? {
            id: transaction.rawEmail.id,
            from: transaction.rawEmail.fromAddress,
            subject: transaction.rawEmail.subject,
            receivedAt: transaction.rawEmail.receivedAt.toISOString(),
          }
        : null,
    };
  },
});

export const createTransaction = defineTool({
  name: "create_transaction",
  title: "Record a transaction",
  description:
    "Record one transaction and update the account balance. `amount` is always positive — `direction` carries " +
    'the sign ("out" for spending, "in" for income). To move money between the user\'s own accounts use ' +
    "create_transfer instead, so both sides stay linked. `vendorName` feeds the vendor memory used for " +
    "autocomplete and default categories.",
  readOnly: false,
  inputSchema: z.object({
    accountId: z.string(),
    amount: z.number().positive().describe("Positive major units, e.g. 4512.35."),
    direction: z.enum(["out", "in"]),
    occurredAt: z.string().describe("When it happened. YYYY-MM-DD or ISO timestamp."),
    categoryId: z.string().optional(),
    vendorName: z.string().trim().max(200).optional().describe("Merchant or payer name."),
    description: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  handler: async (args, ctx) => {
    await requireAccount(ctx, args.accountId);
    if (args.categoryId) await requireCategory(ctx, args.categoryId);
    const occurredAt = parseDateArg(args.occurredAt, "occurredAt");
    const amount = toMinor(args.amount);

    const created = await prisma.$transaction(async (tx) => {
      const vendorId = await upsertVendor(
        tx,
        ctx.userId,
        args.vendorName,
        args.categoryId ?? null
      );
      return tx.transaction.create({
        data: {
          accountId: args.accountId,
          amount: args.direction === "out" ? -amount : amount,
          occurredAt,
          categoryId: args.categoryId ?? null,
          vendorId,
          description: args.description ?? null,
          notes: args.notes ?? null,
          source: "manual",
          status: "confirmed",
        },
        include: TRANSACTION_INCLUDE,
      });
    });
    await recomputeBalance(args.accountId);
    return { transaction: transactionView(created) };
  },
});

export const updateTransaction = defineTool({
  name: "update_transaction",
  title: "Update transaction",
  description:
    "Edit a transaction — recategorize it, fix an amount or date, move it to another account. Only the fields " +
    "you pass change, and balances are recomputed. Transfer legs cannot be edited: delete the transfer and " +
    "create it again.",
  readOnly: false,
  inputSchema: z.object({
    transactionId: z.string(),
    accountId: z.string().optional().describe("Move the transaction to another account."),
    amount: z.number().positive().optional().describe("Positive major units."),
    direction: z.enum(["out", "in"]).optional(),
    occurredAt: z.string().optional(),
    categoryId: z.string().nullable().optional().describe("null clears the category."),
    vendorName: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  handler: async (args, ctx) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: args.transactionId, account: { userId: ctx.userId } },
    });
    if (!existing) throw new ToolError(`No transaction with id "${args.transactionId}".`);
    if (existing.transferGroupId) {
      throw new ToolError(
        "This is one leg of a transfer. Delete the transfer with delete_transaction and create it again."
      );
    }
    if (args.accountId) await requireAccount(ctx, args.accountId);
    if (args.categoryId) await requireCategory(ctx, args.categoryId);

    const currentMinor = existing.amount < 0n ? -existing.amount : existing.amount;
    const magnitude = args.amount !== undefined ? toMinor(args.amount) : currentMinor;
    const direction = args.direction ?? (existing.amount < 0n ? "out" : "in");
    const categoryId = args.categoryId !== undefined ? args.categoryId : existing.categoryId;

    const updated = await prisma.$transaction(async (tx) => {
      // A blank vendorName clears the link; omitting it leaves the vendor alone.
      const vendorId =
        args.vendorName === undefined
          ? undefined
          : args.vendorName === null
            ? null
            : await upsertVendor(tx, ctx.userId, args.vendorName, categoryId);
      return tx.transaction.update({
        where: { id: existing.id },
        data: {
          accountId: args.accountId,
          amount: direction === "out" ? -magnitude : magnitude,
          occurredAt: args.occurredAt
            ? parseDateArg(args.occurredAt, "occurredAt")
            : undefined,
          categoryId: args.categoryId !== undefined ? args.categoryId : undefined,
          vendorId,
          description: args.description !== undefined ? args.description : undefined,
          notes: args.notes !== undefined ? args.notes : undefined,
        },
        include: TRANSACTION_INCLUDE,
      });
    });

    await recomputeBalance(updated.accountId);
    if (existing.accountId !== updated.accountId) await recomputeBalance(existing.accountId);
    return { transaction: transactionView(updated) };
  },
});

export const deleteTransaction = defineTool({
  name: "delete_transaction",
  title: "Delete transaction",
  description:
    "Delete a transaction and recompute the account balance. Deleting either leg of a transfer removes both. " +
    "An email-sourced transaction leaves its email behind, marked ignored so it does not return to the review " +
    "queue. This cannot be undone — confirm with the user first.",
  readOnly: false,
  destructive: true,
  inputSchema: z.object({ transactionId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: args.transactionId, account: { userId: ctx.userId } },
    });
    if (!existing) throw new ToolError(`No transaction with id "${args.transactionId}".`);

    if (existing.transferGroupId) {
      const legs = await prisma.transaction.findMany({
        where: { transferGroupId: existing.transferGroupId },
        select: { accountId: true },
      });
      await prisma.transaction.deleteMany({
        where: { transferGroupId: existing.transferGroupId },
      });
      for (const accountId of new Set(legs.map((l) => l.accountId))) {
        await recomputeBalance(accountId);
      }
      return { deleted: true, deletedLegs: legs.length, transferGroupId: existing.transferGroupId };
    }

    await prisma.transaction.delete({ where: { id: existing.id } });
    if (existing.rawEmailId) {
      await prisma.rawEmail.update({
        where: { id: existing.rawEmailId },
        data: { parseStatus: "ignored", createdTransactionId: null },
      });
    }
    await recomputeBalance(existing.accountId);
    return { deleted: true, deletedLegs: 1 };
  },
});

export const createTransfer = defineTool({
  name: "create_transfer",
  title: "Transfer between accounts",
  description:
    "Move money between two of the user's own accounts. Writes both legs at once and links them, so the pair " +
    "stays consistent and is excluded from income/expense rollups. Paying down a credit card or loan is a " +
    "transfer, not an expense. When the accounts use different currencies, pass `toAmount` — the amount that " +
    "actually landed.",
  readOnly: false,
  inputSchema: z.object({
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: z.number().positive().describe("Amount leaving the source, major units."),
    toAmount: z
      .number()
      .positive()
      .optional()
      .describe("Amount arriving, major units. Required when the currencies differ."),
    occurredAt: z.string().describe("YYYY-MM-DD or ISO timestamp."),
    description: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  handler: async (args, ctx) => {
    if (args.fromAccountId === args.toAccountId) {
      throw new ToolError("Source and destination accounts must differ.");
    }
    const [from, to] = await Promise.all([
      requireAccount(ctx, args.fromAccountId),
      requireAccount(ctx, args.toAccountId),
    ]);
    if (from.currency !== to.currency && args.toAmount == null) {
      throw new ToolError(
        `These accounts use different currencies (${from.currency} → ${to.currency}). ` +
          "Pass `toAmount`: how much arrived in the destination account."
      );
    }
    const occurredAt = parseDateArg(args.occurredAt, "occurredAt");
    const outMinor = toMinor(args.amount);
    const inMinor = toMinor(args.toAmount ?? args.amount);

    // Both legs share the seeded Transfer category when it still exists.
    const transferCategory = await prisma.category.findUnique({
      where: { userId_name_kind: { userId: ctx.userId, name: "Transfer", kind: "both" } },
    });
    const transferGroupId = randomUUID();
    const description = args.description ?? `Transfer: ${from.name} → ${to.name}`;
    const common = {
      occurredAt,
      categoryId: transferCategory?.id ?? null,
      description,
      notes: args.notes ?? null,
      source: "manual",
      status: "confirmed",
      transferGroupId,
    } as const;

    const [outLeg, inLeg] = await prisma.$transaction([
      prisma.transaction.create({
        data: { accountId: from.id, amount: -outMinor, ...common },
        include: TRANSACTION_INCLUDE,
      }),
      prisma.transaction.create({
        data: { accountId: to.id, amount: inMinor, ...common },
        include: TRANSACTION_INCLUDE,
      }),
    ]);
    await recomputeBalance(from.id);
    await recomputeBalance(to.id);

    return {
      transferGroupId,
      out: transactionView(outLeg),
      in: transactionView(inLeg),
    };
  },
});

export const listReviewQueue = defineTool({
  name: "list_review_queue",
  title: "List the review queue",
  description:
    "Transactions parsed from bank-alert emails that are waiting for confirmation, plus emails no parser rule " +
    "matched. Pending transactions do not affect balances until confirmed with confirm_transaction. " +
    "Unmatched emails usually mean a parser rule is missing — see list_parser_rules and create_parser_rule.",
  readOnly: true,
  inputSchema: z.object({
    emailLimit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("How many unmatched emails to return."),
  }),
  handler: async (args, ctx) => {
    const [pending, emails] = await Promise.all([
      prisma.transaction.findMany({
        where: { status: "pending_review", account: { userId: ctx.userId } },
        include: { ...TRANSACTION_INCLUDE, rawEmail: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.rawEmail.findMany({
        where: { userId: ctx.userId, parseStatus: { in: ["unparsed", "failed"] } },
        orderBy: { receivedAt: "desc" },
        take: args.emailLimit,
      }),
    ]);

    return {
      pending: pending.map((t) => ({
        ...transactionView(t),
        email: t.rawEmail
          ? { id: t.rawEmail.id, from: t.rawEmail.fromAddress, subject: t.rawEmail.subject }
          : null,
      })),
      unmatchedEmails: emails.map((e) => ({
        id: e.id,
        from: e.fromAddress,
        subject: e.subject,
        receivedAt: e.receivedAt.toISOString(),
        parseStatus: e.parseStatus,
        // Enough body to write a parser rule against without dumping whole alerts.
        bodyPreview: e.body.slice(0, 1000),
      })),
    };
  },
});

export const confirmTransaction = defineTool({
  name: "confirm_transaction",
  title: "Confirm a pending transaction",
  description:
    "Accept a transaction that came from a bank alert. Only on confirmation does it count toward the account " +
    "balance. Review the amount, account and category first — update_transaction can fix them beforehand.",
  readOnly: false,
  inputSchema: z.object({ transactionId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: args.transactionId, account: { userId: ctx.userId } },
    });
    if (!existing) throw new ToolError(`No transaction with id "${args.transactionId}".`);
    if (existing.status !== "pending_review") {
      throw new ToolError("That transaction is already confirmed.");
    }
    const updated = await prisma.transaction.update({
      where: { id: existing.id },
      data: { status: "confirmed" },
      include: TRANSACTION_INCLUDE,
    });
    await recomputeBalance(existing.accountId);
    return { transaction: transactionView(updated) };
  },
});

export const reparseEmail = defineTool({
  name: "reparse_email",
  title: "Re-run parser rules on an email",
  description:
    "Re-run the parser rules against a stored email — the way to test a rule you just created or fixed. " +
    "A match creates a pending-review transaction.",
  readOnly: false,
  inputSchema: z.object({ emailId: z.string().describe("Id from list_review_queue.") }),
  handler: async (args, ctx) => {
    const email = await prisma.rawEmail.findFirst({
      where: { id: args.emailId, userId: ctx.userId },
      include: { transaction: true },
    });
    if (!email) throw new ToolError(`No email with id "${args.emailId}".`);
    if (email.transaction) {
      throw new ToolError("That email already created a transaction.");
    }
    return { outcome: await applyParserRules(email) };
  },
});
