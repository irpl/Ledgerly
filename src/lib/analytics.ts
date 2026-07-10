// Server-only dashboard analytics. Transfers (transferGroupId != null) are
// excluded from all income/expense rollups per §3.2.
import { prisma } from "@/lib/prisma";
import { monthLabel } from "@/lib/period";

export type MonthlyIncomeExpense = {
  month: string; // "2026-07"
  income: number; // minor units, positive
  expense: number; // minor units, positive
};

/** Income vs expense per month for the last `months` months, grouped by account currency. */
export async function monthlyIncomeExpense(
  userId: string,
  months: number,
  accountId?: string
): Promise<Map<string, MonthlyIncomeExpense[]>> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      status: "confirmed",
      transferGroupId: null,
      occurredAt: { gte: start },
      ...(accountId ? { accountId } : {}),
    },
    select: { amount: true, occurredAt: true, account: { select: { currency: true } } },
  });

  const byCurrency = new Map<string, Map<string, MonthlyIncomeExpense>>();
  for (const row of rows) {
    const currency = row.account.currency;
    const label = monthLabel(row.occurredAt);
    let monthsMap = byCurrency.get(currency);
    if (!monthsMap) {
      monthsMap = new Map();
      byCurrency.set(currency, monthsMap);
    }
    let bucket = monthsMap.get(label);
    if (!bucket) {
      bucket = { month: label, income: 0, expense: 0 };
      monthsMap.set(label, bucket);
    }
    const amount = Number(row.amount);
    if (amount >= 0) bucket.income += amount;
    else bucket.expense += Math.abs(amount);
  }

  // Fill empty months so the x-axis is continuous.
  const labels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    labels.push(monthLabel(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const result = new Map<string, MonthlyIncomeExpense[]>();
  for (const [currency, monthsMap] of byCurrency) {
    result.set(
      currency,
      labels.map((label) => monthsMap.get(label) ?? { month: label, income: 0, expense: 0 })
    );
  }
  return result;
}

export type CategorySpend = {
  categoryId: string | null;
  name: string;
  spent: number; // minor units, positive
};

/** Confirmed non-transfer expense totals per category in [start, end), grouped by currency. */
export async function categorySpend(
  userId: string,
  start: Date,
  end: Date,
  accountId?: string
): Promise<Map<string, CategorySpend[]>> {
  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      status: "confirmed",
      transferGroupId: null,
      amount: { lt: 0 },
      occurredAt: { gte: start, lt: end },
      ...(accountId ? { accountId } : {}),
    },
    select: {
      amount: true,
      categoryId: true,
      category: { select: { name: true } },
      account: { select: { currency: true } },
    },
  });

  const byCurrency = new Map<string, Map<string, CategorySpend>>();
  for (const row of rows) {
    const currency = row.account.currency;
    const key = row.categoryId ?? "__uncategorized";
    let catMap = byCurrency.get(currency);
    if (!catMap) {
      catMap = new Map();
      byCurrency.set(currency, catMap);
    }
    let entry = catMap.get(key);
    if (!entry) {
      entry = {
        categoryId: row.categoryId,
        name: row.category?.name ?? "Uncategorized",
        spent: 0,
      };
      catMap.set(key, entry);
    }
    entry.spent += Math.abs(Number(row.amount));
  }

  const result = new Map<string, CategorySpend[]>();
  for (const [currency, catMap] of byCurrency) {
    result.set(
      currency,
      [...catMap.values()].sort((a, b) => b.spent - a.spent)
    );
  }
  return result;
}

export type IncomeExpenseTotals = { income: number; expense: number };

/** Period totals per currency (confirmed, non-transfer). */
export async function periodTotals(
  userId: string,
  start: Date,
  end: Date,
  accountId?: string
): Promise<Map<string, IncomeExpenseTotals>> {
  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      status: "confirmed",
      transferGroupId: null,
      occurredAt: { gte: start, lt: end },
      ...(accountId ? { accountId } : {}),
    },
    select: { amount: true, account: { select: { currency: true } } },
  });
  const result = new Map<string, IncomeExpenseTotals>();
  for (const row of rows) {
    const currency = row.account.currency;
    const totals = result.get(currency) ?? { income: 0, expense: 0 };
    const amount = Number(row.amount);
    if (amount >= 0) totals.income += amount;
    else totals.expense += Math.abs(amount);
    result.set(currency, totals);
  }
  return result;
}

export type BalancePoint = { date: string; balance: number };

/**
 * Daily running balance for an account over the last `days` days (all
 * confirmed txns count). Not user-scoped: callers must have already verified
 * the account belongs to the current user.
 */
export async function runningBalance(accountId: string, days: number): Promise<BalancePoint[]> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  const rows = await prisma.transaction.findMany({
    where: { accountId, status: "confirmed", occurredAt: { gte: start } },
    select: { amount: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });

  // Walk backwards from today's cached balance.
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deltaByDay = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.occurredAt);
    deltaByDay.set(key, (deltaByDay.get(key) ?? 0) + Number(row.amount));
  }

  const points: BalancePoint[] = [];
  let balance = Number(account.currentBalance);
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    points.push({ date: key, balance });
    balance -= deltaByDay.get(key) ?? 0;
  }
  return points.reverse();
}

export type BudgetActualRow = {
  categoryId: string;
  name: string;
  budgeted: number; // minor units
  spent: number; // minor units, positive
};

/**
 * Budget vs actual by category for one month (§ Table 3-1): budgeted = Σ
 * normalizedMonthly of the category's active budget lines; spent = Σ confirmed
 * non-transfer expenses. Rows are persisted into BudgetPeriodActual.
 */
export async function budgetVsActual(userId: string, periodLabel: string, start: Date, end: Date) {
  const [lines, spendRows] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { userId, active: true },
      select: { categoryId: true, normalizedMonthly: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        account: { userId },
        status: "confirmed",
        transferGroupId: null,
        amount: { lt: 0 },
        occurredAt: { gte: start, lt: end },
        categoryId: { not: null },
      },
      _sum: { amount: true },
    }),
  ]);

  const budgetedByCategory = new Map<string, number>();
  for (const line of lines) {
    budgetedByCategory.set(
      line.categoryId,
      (budgetedByCategory.get(line.categoryId) ?? 0) + Number(line.normalizedMonthly)
    );
  }
  const spentByCategory = new Map<string, number>();
  for (const row of spendRows) {
    if (row.categoryId) {
      spentByCategory.set(row.categoryId, Math.abs(Number(row._sum.amount ?? 0n)));
    }
  }

  const categoryIds = [...new Set([...budgetedByCategory.keys(), ...spentByCategory.keys()])];
  if (categoryIds.length === 0) return [] as BudgetActualRow[];

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds }, userId },
    select: { id: true, name: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const result: BudgetActualRow[] = categoryIds
    .map((categoryId) => ({
      categoryId,
      name: nameById.get(categoryId) ?? "Unknown",
      budgeted: budgetedByCategory.get(categoryId) ?? 0,
      spent: spentByCategory.get(categoryId) ?? 0,
    }))
    .sort((a, b) => b.budgeted - a.budgeted || b.spent - a.spent);

  // Materialize the month's snapshot (mirrors the sheet's Table 3-1 history).
  await prisma.$transaction(
    result.map((row) =>
      prisma.budgetPeriodActual.upsert({
        where: { periodLabel_categoryId: { periodLabel, categoryId: row.categoryId } },
        update: { budgeted: BigInt(row.budgeted), spent: BigInt(row.spent) },
        create: {
          periodLabel,
          categoryId: row.categoryId,
          budgeted: BigInt(row.budgeted),
          spent: BigInt(row.spent),
        },
      })
    )
  );

  return result;
}
