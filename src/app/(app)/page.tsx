import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { totalsByCurrency, LIABILITY_TYPES } from "@/lib/account-shared";
import { formatMoney, amountClass } from "@/lib/money";
import { AccountCard } from "@/components/account-card";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { resolvePeriod, PERIOD_PRESETS, PERIOD_LABELS } from "@/lib/period";
import { monthlyIncomeExpense, categorySpend, periodTotals } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const REPORTING_CURRENCY = process.env.REPORTING_CURRENCY ?? "JMD";

export default async function DashboardPage(props: {
  searchParams: Promise<{ period?: string }>;
}) {
  const searchParams = await props.searchParams;
  const period = resolvePeriod(searchParams.period);

  const [rows, overTime, byCategory, totals, budgetLines, incomeRows] = await Promise.all([
    prisma.account.findMany({
      where: { archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
    monthlyIncomeExpense(period.chartMonths),
    categorySpend(period.start, period.end),
    periodTotals(period.start, period.end),
    prisma.budgetLine.findMany({
      where: { active: true },
      include: { fundingAccount: { select: { currency: true } } },
    }),
    prisma.incomePlan.findMany(),
  ]);

  const accounts = rows.map(toAccountDTO);
  const netWorth = totalsByCurrency(accounts);
  const assets = accounts.filter((a) => !LIABILITY_TYPES.includes(a.type));
  const liabilities = accounts.filter((a) => LIABILITY_TYPES.includes(a.type));

  // Planned figures (§5.6): income plan vs budget lines, cash/credit split.
  let plannedCash = 0;
  let plannedCredit = 0;
  let plannedExpenses = 0;
  for (const line of budgetLines) {
    if (line.fundingAccount.currency !== REPORTING_CURRENCY) continue;
    const monthly = Number(line.normalizedMonthly);
    plannedExpenses += monthly;
    if (line.paymentMethod === "cash") plannedCash += monthly;
    else plannedCredit += monthly;
  }
  const plannedIncome = incomeRows.reduce((sum, i) => sum + Number(i.monthlyAmount), 0);
  const surplus = plannedIncome - plannedExpenses;

  // Budget progress for the selected period (budget scaled to months covered).
  const monthsInPeriod =
    period.preset === "this-year" ? new Date().getMonth() + 1 : 1;
  const periodBudget = plannedExpenses * monthsInPeriod;
  const periodSpent = totals.get(REPORTING_CURRENCY)?.expense ?? 0;
  const budgetPct = periodBudget > 0 ? Math.min(100, (periodSpent / periodBudget) * 100) : null;

  const chartCurrencies = [...overTime.keys()].sort((a, b) =>
    a === REPORTING_CURRENCY ? -1 : b === REPORTING_CURRENCY ? 1 : a.localeCompare(b)
  );
  const donutCurrencies = [...byCategory.keys()].sort((a, b) =>
    a === REPORTING_CURRENCY ? -1 : b === REPORTING_CURRENCY ? 1 : a.localeCompare(b)
  );

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector — one row, applies to charts and period totals. */}
          <nav className="flex gap-1.5" aria-label="Period">
            {PERIOD_PRESETS.map((p) => (
              <Link
                key={p}
                href={p === "this-month" ? "/" : `/?period=${p}`}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors duration-200 ${
                  period.preset === p
                    ? "border-secondary text-secondary bg-primary/20"
                    : "border-border-strong text-muted hover:bg-surface-raised"
                }`}
              >
                {PERIOD_LABELS[p]}
              </Link>
            ))}
          </nav>
          <Link href="/accounts/new" className="btn-primary">
            + Account
          </Link>
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Net worth by currency
        </h2>
        {netWorth.size === 0 ? (
          <p className="text-muted">
            No accounts yet.{" "}
            <Link href="/accounts/new" className="text-secondary underline">
              Create your first account
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...netWorth.entries()].map(([currency, total]) => (
              <div key={currency} className="card">
                <div className="text-xs text-muted mb-1">{currency}</div>
                <div className={`text-2xl font-bold ${amountClass(total)}`}>
                  {formatMoney(total, currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(plannedIncome > 0 || plannedExpenses > 0) && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card">
            <div className="text-xs text-muted mb-1">
              Planned {surplus >= 0 ? "surplus" : "deficit"} / mo
            </div>
            <div className={`text-xl font-bold ${amountClass(surplus)}`}>
              {formatMoney(surplus, REPORTING_CURRENCY, { sign: true })}
            </div>
            <div className="mt-1 text-xs text-muted">
              {formatMoney(plannedIncome, REPORTING_CURRENCY)} income −{" "}
              {formatMoney(plannedExpenses, REPORTING_CURRENCY)} expenses
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-muted mb-1">Cash vs credit / mo</div>
            <div className="text-xl font-bold amount">
              {formatMoney(plannedCash, REPORTING_CURRENCY)}
            </div>
            <div className="mt-1 text-xs text-muted">
              cash · credit <span className="amount">{formatMoney(plannedCredit, REPORTING_CURRENCY)}</span>
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-muted mb-1">
              Budget used ({PERIOD_LABELS[period.preset].toLowerCase()})
            </div>
            {budgetPct === null ? (
              <div className="text-sm text-muted mt-1">No budget set</div>
            ) : (
              <>
                <div className="text-xl font-bold amount">{Math.round(budgetPct)}%</div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted amount">
                  {formatMoney(periodSpent, REPORTING_CURRENCY)} of{" "}
                  {formatMoney(periodBudget, REPORTING_CURRENCY)}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {chartCurrencies.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Income vs expenses
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartCurrencies.map((currency) => (
              <div key={currency} className="card">
                <div className="text-xs text-muted mb-2">
                  {currency} · last {period.chartMonths} months
                </div>
                <IncomeExpenseChart data={overTime.get(currency)!} currency={currency} />
              </div>
            ))}
          </div>
        </section>
      )}

      {donutCurrencies.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Spending by category · {PERIOD_LABELS[period.preset].toLowerCase()}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {donutCurrencies.map((currency) => (
              <div key={currency} className="card">
                <div className="text-xs text-muted mb-2">{currency}</div>
                <CategoryDonut data={byCategory.get(currency)!} currency={currency} />
              </div>
            ))}
          </div>
        </section>
      )}

      {assets.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Accounts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assets.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        </section>
      )}

      {liabilities.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Liabilities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {liabilities.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
