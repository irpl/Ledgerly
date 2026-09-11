// End-to-end tests for the MCP server against a real database: tokens resolve
// to the right user, tools do what they claim to the ledger, and one user's
// token can never reach another user's data.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { authenticateToken, createApiToken } from "@/lib/api-tokens";
import { handleRpcMessage } from "@/lib/mcp/protocol";
import type { ToolContext } from "@/lib/mcp/types";

type ToolOutcome = Record<string, unknown> & { isError: boolean };

/** Call a tool the way a client would: through the JSON-RPC dispatcher. */
async function call(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolOutcome> {
  const response = (await handleRpcMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    ctx
  )) as { result?: { content: { text: string }[]; isError?: boolean }; error?: unknown };

  expect(response.error, JSON.stringify(response.error)).toBeUndefined();
  const result = response.result!;
  return { ...JSON.parse(result.content[0].text), isError: result.isError ?? false };
}

/** Same call, asserting it succeeded — most tests want the happy path only. */
async function ok(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const outcome = await call(ctx, name, args);
  expect(outcome.isError, `${name}: ${String(outcome.error)}`).toBe(false);
  return outcome;
}

async function contextFor(scope: "read" | "full" = "full"): Promise<ToolContext> {
  const user = await createTestUser();
  return { userId: user.id, scope };
}

const TODAY = "2026-09-11";

describe("API tokens against the database", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("resolves a minted token to its owner and scope", async () => {
    const user = await createTestUser();
    const { token, summary } = await createApiToken(user.id, { name: "laptop", scope: "read" });

    const authenticated = await authenticateToken(token);
    expect(authenticated).toEqual({ tokenId: summary.id, userId: user.id, scope: "read" });
    // Stored hashed: the secret itself is nowhere in the row.
    const stored = await prisma.apiToken.findUniqueOrThrow({ where: { id: summary.id } });
    expect(stored.tokenHash).not.toContain(token);
    expect(summary.prefix.length).toBeLessThan(token.length);
  });

  it("rejects unknown, revoked and expired tokens", async () => {
    const user = await createTestUser();
    const { token, summary } = await createApiToken(user.id, { name: "laptop", scope: "full" });

    expect(await authenticateToken("ldg_not-a-real-token")).toBeNull();
    expect(await authenticateToken("no-prefix")).toBeNull();

    await prisma.apiToken.update({
      where: { id: summary.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await authenticateToken(token)).toBeNull();

    await prisma.apiToken.delete({ where: { id: summary.id } });
    expect(await authenticateToken(token)).toBeNull();
  });
});

describe("MCP tools: accounts and transactions", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates an account, records spending, and keeps the balance right", async () => {
    const ctx = await contextFor();
    const created = await ok(ctx, "create_account", {
      name: "NCB Chequing",
      type: "checking",
      openingBalance: 150000,
    });
    const accountId = (created.account as { id: string; currency: string }).id;
    expect((created.account as { currency: string }).currency).toBe("JMD");

    await ok(ctx, "create_transaction", {
      accountId,
      amount: 5412.5,
      direction: "out",
      occurredAt: TODAY,
      vendorName: "Hi-Lo",
      description: "Groceries",
    });
    await ok(ctx, "create_transaction", {
      accountId,
      amount: 1750,
      direction: "in",
      occurredAt: TODAY,
      description: "Refund",
    });

    const listed = await ok(ctx, "list_accounts");
    const account = (listed.accounts as { id: string; balance: number }[])[0];
    expect(account.balance).toBeCloseTo(150000 - 5412.5 + 1750, 2);
    expect((listed.netWorthByCurrency as Record<string, number>).JMD).toBeCloseTo(
      146337.5,
      2
    );

    // Amounts are signed on the way out: spending is negative.
    const transactions = await ok(ctx, "list_transactions", { accountId });
    const amounts = (transactions.transactions as { amount: number }[]).map((t) => t.amount);
    expect(amounts).toContain(-5412.5);
    expect(amounts).toContain(1750);
    expect(transactions.matchCount).toBe(2);
    const totals = (transactions.totalsByCurrency as Record<string, { in: number; out: number }>)
      .JMD;
    expect(totals.out).toBeCloseTo(5412.5, 2);
    expect(totals.in).toBeCloseTo(1750, 2);

    // The vendor memory learned from the description.
    const vendors = await ok(ctx, "list_vendors", { search: "hi" });
    expect((vendors.vendors as { name: string }[])[0].name).toBe("Hi-Lo");
  });

  it("edits and deletes a transaction, recomputing both accounts", async () => {
    const ctx = await contextFor();
    const first = await ok(ctx, "create_account", {
      name: "Cash",
      type: "cash",
      openingBalance: 10000,
    });
    const second = await ok(ctx, "create_account", { name: "Wallet", type: "cash" });
    const fromId = (first.account as { id: string }).id;
    const toId = (second.account as { id: string }).id;

    const created = await ok(ctx, "create_transaction", {
      accountId: fromId,
      amount: 2000,
      direction: "out",
      occurredAt: TODAY,
    });
    const transactionId = (created.transaction as { id: string }).id;

    const moved = await ok(ctx, "update_transaction", {
      transactionId,
      accountId: toId,
      amount: 2500,
    });
    expect((moved.transaction as { amount: number }).amount).toBe(-2500);

    const accounts = await ok(ctx, "list_accounts");
    const byId = new Map(
      (accounts.accounts as { id: string; balance: number }[]).map((a) => [a.id, a.balance])
    );
    expect(byId.get(fromId)).toBe(10000);
    expect(byId.get(toId)).toBe(-2500);

    await ok(ctx, "delete_transaction", { transactionId });
    expect(await prisma.transaction.count()).toBe(0);
    const after = await ok(ctx, "get_account", { accountId: toId });
    expect((after.account as { balance: number }).balance).toBe(0);
  });

  it("writes both legs of a transfer and deletes them together", async () => {
    const ctx = await contextFor();
    const cheq = await ok(ctx, "create_account", {
      name: "Chequing",
      type: "checking",
      openingBalance: 50000,
    });
    const card = await ok(ctx, "create_account", {
      name: "Visa",
      type: "credit_card",
      openingBalance: -12000,
      creditLimit: 100000,
    });
    const cheqId = (cheq.account as { id: string }).id;
    const cardId = (card.account as { id: string }).id;

    const transfer = await ok(ctx, "create_transfer", {
      fromAccountId: cheqId,
      toAccountId: cardId,
      amount: 12000,
      occurredAt: TODAY,
    });
    expect((transfer.out as { amount: number }).amount).toBe(-12000);
    expect((transfer.in as { amount: number }).amount).toBe(12000);

    const card2 = await ok(ctx, "get_account", { accountId: cardId });
    expect((card2.account as { balance: number }).balance).toBe(0);
    expect((card2.account as { availableCredit: number }).availableCredit).toBe(100000);

    // Transfers are not spending: the overview must ignore both legs.
    const overview = await ok(ctx, "get_financial_overview");
    expect(overview.periodTotalsByCurrency).toEqual({});

    // Either leg deletes the pair.
    const legs = await ok(ctx, "list_transactions", { accountId: cardId });
    const legId = (legs.transactions as { id: string }[])[0].id;
    const deleted = await ok(ctx, "delete_transaction", { transactionId: legId });
    expect(deleted.deletedLegs).toBe(2);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("refuses a cross-currency transfer without the received amount", async () => {
    const ctx = await contextFor();
    const jmd = await ok(ctx, "create_account", { name: "JMD", type: "checking" });
    const usd = await ok(ctx, "create_account", {
      name: "USD",
      type: "savings",
      currency: "usd",
    });
    expect((usd.account as { currency: string }).currency).toBe("USD");

    const refused = await call(ctx, "create_transfer", {
      fromAccountId: (jmd.account as { id: string }).id,
      toAccountId: (usd.account as { id: string }).id,
      amount: 15000,
      occurredAt: TODAY,
    });
    expect(refused.isError).toBe(true);
    expect(String(refused.error)).toContain("toAmount");
  });

  it("confirms a pending email transaction before it touches the balance", async () => {
    const ctx = await contextFor();
    const account = await ok(ctx, "create_account", {
      name: "NCB",
      type: "checking",
      openingBalance: 20000,
    });
    const accountId = (account.account as { id: string }).id;
    const pending = await prisma.transaction.create({
      data: {
        accountId,
        amount: -3500n * 100n,
        occurredAt: new Date(),
        source: "email",
        status: "pending_review",
        description: "POS purchase",
      },
    });

    const queue = await ok(ctx, "list_review_queue");
    expect((queue.pending as unknown[]).length).toBe(1);
    expect((await ok(ctx, "get_account", { accountId })).account).toMatchObject({
      balance: 20000,
    });

    await ok(ctx, "confirm_transaction", { transactionId: pending.id });
    expect((await ok(ctx, "get_account", { accountId })).account).toMatchObject({
      balance: 16500,
    });

    // Confirming twice is a clear error, not a silent double count.
    const again = await call(ctx, "confirm_transaction", { transactionId: pending.id });
    expect(again.isError).toBe(true);
  });
});

describe("MCP tools: budget", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("normalizes any frequency to a monthly equivalent and reports the surplus", async () => {
    const ctx = await contextFor();
    const account = await ok(ctx, "create_account", { name: "Chequing", type: "checking" });
    const category = await ok(ctx, "create_category", { name: "Insurance", kind: "expense" });

    await ok(ctx, "create_budget_line", {
      name: "Car insurance",
      categoryId: (category.category as { id: string }).id,
      amount: 20000,
      frequency: "quarterly",
      paymentMethod: "cash",
      fundingAccountId: (account.account as { id: string }).id,
    });
    await ok(ctx, "add_income_plan_entry", { label: "Salary", monthlyAmount: 250000 });

    const budget = await ok(ctx, "list_budget_lines");
    const line = (budget.budgetLines as { monthlyEquivalent: number }[])[0];
    // 20,000 × 4 ÷ 12
    expect(line.monthlyEquivalent).toBeCloseTo(6666.67, 2);
    expect(budget.plannedMonthlyIncome).toBe(250000);
    expect(budget.monthlySurplus).toBeCloseTo(250000 - 6666.67, 2);
  });

  it("keeps a category that budget lines still depend on", async () => {
    const ctx = await contextFor();
    const account = await ok(ctx, "create_account", { name: "Chequing", type: "checking" });
    const category = await ok(ctx, "create_category", { name: "Rent", kind: "expense" });
    const categoryId = (category.category as { id: string }).id;

    await ok(ctx, "create_budget_line", {
      name: "Rent",
      categoryId,
      amount: 90000,
      frequency: "monthly",
      paymentMethod: "cash",
      fundingAccountId: (account.account as { id: string }).id,
    });

    const refused = await call(ctx, "delete_category", { categoryId });
    expect(refused.isError).toBe(true);
    expect(String(refused.error)).toContain("budget line");
    expect(await prisma.category.count()).toBe(1);
  });
});

describe("MCP tools: access control", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("cannot see or touch another user's account", async () => {
    const mine = await contextFor();
    const theirs = await contextFor();
    const theirAccount = await ok(theirs, "create_account", {
      name: "Their savings",
      type: "savings",
      openingBalance: 999999,
    });
    const theirAccountId = (theirAccount.account as { id: string }).id;

    expect((await ok(mine, "list_accounts")).accounts).toEqual([]);

    for (const [tool, args] of [
      ["get_account", { accountId: theirAccountId }],
      ["update_account", { accountId: theirAccountId, name: "Mine now" }],
      ["set_account_archived", { accountId: theirAccountId, archived: true }],
      ["get_balance_history", { accountId: theirAccountId }],
      [
        "create_transaction",
        { accountId: theirAccountId, amount: 1, direction: "out", occurredAt: TODAY },
      ],
    ] as const) {
      const outcome = await call(mine, tool, args);
      expect(outcome.isError, `${tool} should not reach another tenant`).toBe(true);
      expect(String(outcome.error)).toContain("No account with id");
    }

    const untouched = await prisma.account.findUniqueOrThrow({ where: { id: theirAccountId } });
    expect(untouched.name).toBe("Their savings");
    expect(untouched.archived).toBe(false);
  });

  it("lets a read-only token read but never write", async () => {
    const user = await createTestUser();
    const full: ToolContext = { userId: user.id, scope: "full" };
    const readOnly: ToolContext = { userId: user.id, scope: "read" };
    await ok(full, "create_account", { name: "Chequing", type: "checking", openingBalance: 100 });

    expect(((await ok(readOnly, "list_accounts")).accounts as unknown[]).length).toBe(1);

    const refused = await call(readOnly, "create_account", { name: "Sneaky", type: "cash" });
    expect(refused.isError).toBe(true);
    expect(String(refused.error)).toContain("read-only");
    expect(await prisma.account.count()).toBe(1);
  });
});

describe("MCP tools: profile", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("reports the budget period and moves its anchor day", async () => {
    const ctx = await contextFor();
    const before = await ok(ctx, "get_profile");
    expect((before.budgetPeriod as { startDay: number }).startDay).toBe(1);

    const updated = await ok(ctx, "update_profile", { budgetStartDay: 25, displayName: "Jan" });
    expect((updated.user as { budgetStartDay: number }).budgetStartDay).toBe(25);

    const after = await ok(ctx, "get_profile");
    const period = after.budgetPeriod as { startDay: number; start: string };
    expect(period.startDay).toBe(25);
    expect(new Date(period.start).getDate()).toBe(25);
  });
});
