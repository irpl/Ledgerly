import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toBudgetLineDTO } from "@/lib/budget";
import { toAccountDTO } from "@/lib/accounts";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";
import type { IncomePlanDTO } from "@/lib/budget-shared";
import { formatMoney, amountClass } from "@/lib/money";
import { BudgetManager } from "@/components/budget-manager";
import { BudgetActualMeters } from "@/components/budget-actual-meters";
import { budgetVsActual } from "@/lib/analytics";
import { monthLabel, parseMonthLabel } from "@/lib/period";
import { requireUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const REPORTING_CURRENCY = process.env.REPORTING_CURRENCY ?? "JMD";

function shiftMonth(label: string, delta: number): string {
  const range = parseMonthLabel(label)!;
  const d = new Date(range.start.getFullYear(), range.start.getMonth() + delta, 1);
  return monthLabel(d);
}

export default async function BudgetPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const currentLabel = monthLabel(new Date());
  const selectedMonth =
    searchParams.month && parseMonthLabel(searchParams.month)
      ? searchParams.month
      : currentLabel;
  const monthRange = parseMonthLabel(selectedMonth)!;

  const [lines, incomeRows, categories, accounts] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { userId },
      include: { category: true, fundingAccount: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.incomePlan.findMany({ where: { userId }, orderBy: { label: "asc" } }),
    prisma.category.findMany({
      where: { userId, kind: { in: ["expense", "both"] } },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { userId, archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const budgetLines = lines.map(toBudgetLineDTO);
  const incomePlan: IncomePlanDTO[] = incomeRows.map((i) => ({
    id: i.id,
    label: i.label,
    monthlyAmount: Number(i.monthlyAmount),
  }));
  const categoryDTOs: CategoryDTO[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKindValue,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
    isDefault: c.isDefault,
  }));

  // Cash/credit split and totals, grouped by funding-account currency (§5.4).
  const byCurrency = new Map<string, { total: number; cash: number; credit: number }>();
  for (const line of budgetLines) {
    if (!line.active) continue;
    const entry =
      byCurrency.get(line.fundingAccountCurrency) ?? { total: 0, cash: 0, credit: 0 };
    entry.total += line.normalizedMonthly;
    if (line.paymentMethod === "cash") entry.cash += line.normalizedMonthly;
    else entry.credit += line.normalizedMonthly;
    byCurrency.set(line.fundingAccountCurrency, entry);
  }

  const plannedIncome = incomePlan.reduce((sum, i) => sum + i.monthlyAmount, 0);
  const reportingExpenses = byCurrency.get(REPORTING_CURRENCY)?.total ?? 0;
  const surplus = plannedIncome - reportingExpenses;

  const actualRows = await budgetVsActual(userId, selectedMonth, monthRange.start, monthRange.end);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Budget</h1>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-muted mb-1">Planned income / mo</div>
          <div className="text-xl font-bold amount amount-positive">
            {formatMoney(plannedIncome, REPORTING_CURRENCY)}
          </div>
        </div>
        {[...byCurrency.entries()].map(([currency, s]) => (
          <div key={currency} className="card">
            <div className="text-xs text-muted mb-1">Planned expenses / mo ({currency})</div>
            <div className="text-xl font-bold amount amount-negative">
              {formatMoney(s.total, currency)}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>
                Cash <span className="amount">{formatMoney(s.cash, currency)}</span>
              </span>
              <span>
                Credit <span className="amount">{formatMoney(s.credit, currency)}</span>
              </span>
            </div>
          </div>
        ))}
        <div className="card">
          <div className="text-xs text-muted mb-1">
            {surplus >= 0 ? "Surplus" : "Deficit"} / mo ({REPORTING_CURRENCY})
          </div>
          <div className={`text-xl font-bold ${amountClass(surplus)}`}>
            {formatMoney(surplus, REPORTING_CURRENCY, { sign: true })}
          </div>
          <div className="mt-2 text-xs text-muted">income − planned expenses</div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
            Budget vs actual
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/budget?month=${shiftMonth(selectedMonth, -1)}`}
              className="btn-ghost px-2.5! py-1!"
              aria-label="Previous month"
            >
              ‹
            </Link>
            <span className="font-medium amount">{selectedMonth}</span>
            <Link
              href={`/budget?month=${shiftMonth(selectedMonth, 1)}`}
              className={`btn-ghost px-2.5! py-1! ${
                selectedMonth >= currentLabel ? "pointer-events-none opacity-40" : ""
              }`}
              aria-label="Next month"
              aria-disabled={selectedMonth >= currentLabel}
            >
              ›
            </Link>
          </div>
        </div>
        <div className="card">
          <BudgetActualMeters rows={actualRows} currency={REPORTING_CURRENCY} />
        </div>
      </section>

      <BudgetManager
        budgetLines={budgetLines}
        incomePlan={incomePlan}
        categories={categoryDTOs}
        accounts={accounts.map(toAccountDTO)}
      />
    </div>
  );
}
