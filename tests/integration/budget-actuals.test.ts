import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { budgetVsActual, monthlyIncomeExpense } from "@/lib/analytics";

describe("budgetVsActual (spec Table 3-1)", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("pairs budgeted vs spent per category, persisting a snapshot", async () => {
    const user = await createTestUser();
    const account = await prisma.account.create({
      data: { userId: user.id, name: "NCB", type: "checking", currency: "JMD", openingBalance: 0n, currentBalance: 0n },
    });
    const housing = await prisma.category.create({
      data: { userId: user.id, name: "Housing", kind: "expense" },
    });
    const food = await prisma.category.create({
      data: { userId: user.id, name: "Food", kind: "expense" },
    });

    await prisma.budgetLine.create({
      data: {
        userId: user.id,
        name: "Rent",
        categoryId: housing.id,
        amount: 15_000_000n,
        frequency: "monthly",
        paymentMethod: "cash",
        fundingAccountId: account.id,
        normalizedMonthly: 15_000_000n,
      },
    });
    // Food spend inside the month, plus a transfer that must be excluded.
    await prisma.transaction.createMany({
      data: [
        {
          accountId: account.id,
          amount: -541_250n,
          occurredAt: new Date(2026, 6, 10),
          categoryId: food.id,
          status: "confirmed",
        },
        {
          accountId: account.id,
          amount: -4_500_000n,
          occurredAt: new Date(2026, 6, 12),
          categoryId: food.id,
          status: "confirmed",
          transferGroupId: "tg1",
        },
        {
          accountId: account.id,
          amount: -100_000n,
          occurredAt: new Date(2026, 7, 1), // next month — outside range
          categoryId: food.id,
          status: "confirmed",
        },
      ],
    });

    const rows = await budgetVsActual(user.id, "2026-07", new Date(2026, 6, 1), new Date(2026, 7, 1));
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    expect(byName.Housing.budgeted).toBe(15_000_000);
    expect(byName.Housing.spent).toBe(0);
    expect(byName.Food.budgeted).toBe(0);
    expect(byName.Food.spent).toBe(541_250); // transfer + next-month excluded

    const persisted = await prisma.budgetPeriodActual.findMany({ where: { periodLabel: "2026-07" } });
    expect(persisted).toHaveLength(2);
  });

  it("ignores paused budget lines", async () => {
    const user = await createTestUser();
    const account = await prisma.account.create({
      data: { userId: user.id, name: "NCB", type: "checking", currency: "JMD", openingBalance: 0n, currentBalance: 0n },
    });
    const cat = await prisma.category.create({
      data: { userId: user.id, name: "Housing", kind: "expense" },
    });
    await prisma.budgetLine.create({
      data: {
        userId: user.id,
        name: "Rent",
        categoryId: cat.id,
        amount: 15_000_000n,
        frequency: "monthly",
        paymentMethod: "cash",
        fundingAccountId: account.id,
        normalizedMonthly: 15_000_000n,
        active: false,
      },
    });
    const rows = await budgetVsActual(user.id, "2026-07", new Date(2026, 6, 1), new Date(2026, 7, 1));
    expect(rows).toHaveLength(0);
  });
});

describe("monthlyIncomeExpense", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("buckets by month per currency, excluding transfers and pending", async () => {
    const user = await createTestUser();
    const account = await prisma.account.create({
      data: { userId: user.id, name: "NCB", type: "checking", currency: "JMD", openingBalance: 0n, currentBalance: 0n },
    });
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
    await prisma.transaction.createMany({
      data: [
        { accountId: account.id, amount: 35_000_000n, occurredAt: thisMonth, status: "confirmed" },
        { accountId: account.id, amount: -541_250n, occurredAt: thisMonth, status: "confirmed" },
        { accountId: account.id, amount: -4_500_000n, occurredAt: thisMonth, status: "confirmed", transferGroupId: "tg" },
        { accountId: account.id, amount: -999_999n, occurredAt: thisMonth, status: "pending_review" },
      ],
    });
    const result = await monthlyIncomeExpense(user.id, 6);
    const jmd = result.get("JMD")!;
    expect(jmd).toHaveLength(6); // continuous axis
    const current = jmd[jmd.length - 1];
    expect(current.income).toBe(35_000_000);
    expect(current.expense).toBe(541_250);
  });
});
