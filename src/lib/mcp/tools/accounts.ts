// MCP tools: accounts (the money containers — checking, cards, loans, …).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_TYPES, LOAN_KINDS, totalsByCurrency } from "@/lib/account-shared";
import { toAccountDTO, recomputeBalance } from "@/lib/accounts";
import { minorToMajor } from "@/lib/money";
import { defineTool, ToolError } from "@/lib/mcp/types";
import { accountView, parseDateArg, requireAccount, toMinor } from "@/lib/mcp/shared";

const loanSchema = z.object({
  kind: z.enum(LOAN_KINDS),
  originalPrincipal: z.number().nonnegative().describe("Amount borrowed, major units."),
  interestRate: z.number().min(0).max(100).describe("Annual rate as a percentage, e.g. 7.25."),
  termMonths: z.number().int().positive(),
  startDate: z.string().describe("YYYY-MM-DD."),
  monthlyPayment: z.number().nonnegative().describe("Contractual payment, major units."),
  monthlyBudget: z
    .number()
    .nonnegative()
    .optional()
    .describe("Planned monthly payment when it differs from the contractual one."),
  lender: z.string().max(200).optional(),
  nextPaymentDate: z.string().optional().describe("YYYY-MM-DD."),
});

type LoanArgs = z.infer<typeof loanSchema>;

function loanData(loan: LoanArgs) {
  return {
    loanKind: loan.kind,
    originalPrincipal: toMinor(loan.originalPrincipal),
    interestRate: loan.interestRate,
    termMonths: loan.termMonths,
    startDate: parseDateArg(loan.startDate, "loan.startDate"),
    monthlyPayment: toMinor(loan.monthlyPayment),
    monthlyBudget: loan.monthlyBudget != null ? toMinor(loan.monthlyBudget) : null,
    lender: loan.lender ?? null,
    nextPaymentDate: loan.nextPaymentDate
      ? parseDateArg(loan.nextPaymentDate, "loan.nextPaymentDate")
      : null,
  };
}

export const listAccounts = defineTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "List the user's accounts with balances, credit limits and loan details, plus net worth per currency. " +
    "Balances are signed major units: a credit card or loan the user owes on is negative. " +
    "Start here to discover account ids for the other tools.",
  readOnly: true,
  inputSchema: z.object({
    includeArchived: z
      .boolean()
      .default(false)
      .describe("Include archived (closed) accounts. They are excluded from net worth."),
  }),
  handler: async (args, ctx) => {
    const accounts = await prisma.account.findMany({
      where: { userId: ctx.userId, ...(args.includeArchived ? {} : { archived: false }) },
      include: { loanDetails: true },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    });
    const netWorth = totalsByCurrency(accounts.map(toAccountDTO));
    return {
      accounts: accounts.map(accountView),
      netWorthByCurrency: Object.fromEntries(
        [...netWorth].map(([currency, minor]) => [currency, minorToMajor(minor)])
      ),
    };
  },
});

export const getAccount = defineTool({
  name: "get_account",
  title: "Get account",
  description:
    "Full detail for one account: balance, credit limit and available credit, loan terms and payoff progress, " +
    "and how many transactions it holds.",
  readOnly: true,
  inputSchema: z.object({ accountId: z.string() }),
  handler: async (args, ctx) => {
    const account = await requireAccount(ctx, args.accountId);
    const [transactionCount, lastTransaction] = await Promise.all([
      prisma.transaction.count({ where: { accountId: account.id } }),
      prisma.transaction.findFirst({
        where: { accountId: account.id },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { occurredAt: true },
      }),
    ]);
    return {
      account: accountView(account),
      transactionCount,
      lastTransactionAt: lastTransaction?.occurredAt.toISOString() ?? null,
    };
  },
});

export const createAccount = defineTool({
  name: "create_account",
  title: "Create account",
  description:
    "Create an account. `openingBalance` is the balance before any tracked transaction — negative for money owed " +
    "(a card with a 25,000 balance owed opens at -25000). Pass `loan` only for type \"loan\"; " +
    "`creditLimit` and `monthlyBudget` apply only to type \"credit_card\".",
  readOnly: false,
  inputSchema: z.object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(ACCOUNT_TYPES),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((s) => s.toUpperCase())
      .default("JMD")
      .describe("ISO 4217 code, e.g. JMD or USD."),
    openingBalance: z.number().default(0).describe("Signed, major units."),
    creditLimit: z.number().positive().optional().describe("Credit cards only, major units."),
    monthlyBudget: z
      .number()
      .nonnegative()
      .optional()
      .describe("Credit cards only: planned monthly spend, major units."),
    color: z.string().max(50).optional(),
    icon: z.string().max(50).optional(),
    loan: loanSchema.optional(),
  }),
  handler: async (args, ctx) => {
    if (args.type === "loan" && !args.loan) {
      throw new ToolError('Accounts of type "loan" need the `loan` argument (terms and payment).');
    }
    const opening = toMinor(args.openingBalance);
    const account = await prisma.account.create({
      data: {
        userId: ctx.userId,
        name: args.name,
        type: args.type,
        currency: args.currency,
        openingBalance: opening,
        currentBalance: opening,
        creditLimit:
          args.type === "credit_card" && args.creditLimit != null
            ? toMinor(args.creditLimit)
            : null,
        monthlyBudget:
          args.type === "credit_card" && args.monthlyBudget != null
            ? toMinor(args.monthlyBudget)
            : null,
        color: args.color ?? null,
        icon: args.icon ?? null,
        loanDetails:
          args.type === "loan" && args.loan ? { create: loanData(args.loan) } : undefined,
      },
      include: { loanDetails: true },
    });
    return { account: accountView(account) };
  },
});

export const updateAccount = defineTool({
  name: "update_account",
  title: "Update account",
  description:
    "Change an account's details. Only the fields you pass change. Changing `openingBalance` re-derives the " +
    "current balance from the account's transactions — use it to correct a wrong starting figure, not to record " +
    "spending (create a transaction for that). Changing `type` away from loan or credit_card drops the details " +
    "that no longer apply.",
  readOnly: false,
  inputSchema: z.object({
    accountId: z.string(),
    name: z.string().trim().min(1).max(200).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((s) => s.toUpperCase())
      .optional(),
    openingBalance: z.number().optional().describe("Signed, major units."),
    creditLimit: z.number().positive().nullable().optional(),
    monthlyBudget: z.number().nonnegative().nullable().optional(),
    color: z.string().max(50).nullable().optional(),
    icon: z.string().max(50).nullable().optional(),
    loan: loanSchema.optional().describe("Loan terms; only meaningful when the type is \"loan\"."),
  }),
  handler: async (args, ctx) => {
    const existing = await requireAccount(ctx, args.accountId);
    const nextType = args.type ?? existing.type;

    await prisma.$transaction(async (tx) => {
      // Type moved away from loan → drop loan details, mirroring PATCH /api/accounts/[id].
      if (nextType !== "loan") {
        await tx.loanDetails.deleteMany({ where: { accountId: existing.id } });
      }
      await tx.account.update({
        where: { id: existing.id },
        data: {
          name: args.name,
          type: args.type,
          currency: args.currency,
          openingBalance:
            args.openingBalance !== undefined ? toMinor(args.openingBalance) : undefined,
          creditLimit:
            nextType !== "credit_card"
              ? null
              : args.creditLimit !== undefined
                ? args.creditLimit === null
                  ? null
                  : toMinor(args.creditLimit)
                : undefined,
          monthlyBudget:
            nextType !== "credit_card"
              ? null
              : args.monthlyBudget !== undefined
                ? args.monthlyBudget === null
                  ? null
                  : toMinor(args.monthlyBudget)
                : undefined,
          color: args.color !== undefined ? args.color : undefined,
          icon: args.icon !== undefined ? args.icon : undefined,
        },
      });
      if (nextType === "loan" && args.loan) {
        const data = loanData(args.loan);
        await tx.loanDetails.upsert({
          where: { accountId: existing.id },
          update: data,
          create: { accountId: existing.id, ...data },
        });
      }
    });

    if (args.openingBalance !== undefined) await recomputeBalance(existing.id);

    const fresh = await prisma.account.findUniqueOrThrow({
      where: { id: existing.id },
      include: { loanDetails: true },
    });
    return { account: accountView(fresh) };
  },
});

export const setAccountArchived = defineTool({
  name: "set_account_archived",
  title: "Archive or restore account",
  description:
    "Archive a closed account or restore an archived one. Archiving is how accounts are retired — history and " +
    "transactions stay intact, but the account drops out of net worth, pickers and dashboards. " +
    "Accounts are never deleted.",
  readOnly: false,
  idempotent: true,
  inputSchema: z.object({
    accountId: z.string(),
    archived: z.boolean().describe("true archives, false restores."),
  }),
  handler: async (args, ctx) => {
    const existing = await requireAccount(ctx, args.accountId);
    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { archived: args.archived },
      include: { loanDetails: true },
    });
    return { account: accountView(account) };
  },
});
