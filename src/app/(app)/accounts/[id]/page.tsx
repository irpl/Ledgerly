import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import {
  availableCredit,
  payoffProgress,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/account-shared";
import { formatMoney, amountClass } from "@/lib/money";
import { ArchiveButton } from "@/components/archive-button";
import { RunningBalanceChart } from "@/components/charts/running-balance-chart";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { runningBalance, monthlyIncomeExpense, categorySpend } from "@/lib/analytics";
import { resolvePeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const row = await prisma.account.findUnique({
    where: { id },
    include: { loanDetails: true },
  });
  if (!row) notFound();

  const account = toAccountDTO(row);
  const credit = availableCredit(account);
  const payoff = payoffProgress(account);

  const period = resolvePeriod(undefined); // this month
  const [transactions, balancePoints, overTime, spendByCurrency] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: id },
      orderBy: { occurredAt: "desc" },
      take: 20,
      include: { category: true, vendor: true },
    }),
    runningBalance(id, 90),
    monthlyIncomeExpense(6, id),
    categorySpend(period.start, period.end, id),
  ]);
  const accountOverTime = overTime.get(account.currency);
  const accountSpend = spendByCurrency.get(account.currency) ?? [];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            {account.icon && <span className="mr-2">{account.icon}</span>}
            {account.name}
            {account.archived && (
              <span className="ml-2 align-middle text-xs rounded bg-surface-raised px-1.5 py-0.5 text-muted">
                archived
              </span>
            )}
          </h1>
          <p className="text-sm text-muted">
            {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
          </p>
        </div>
        <div className="flex gap-2">
          {(account.type === "credit_card" || account.type === "loan") && (
            <Link href={`/transfers/new?to=${account.id}`} className="btn-primary">
              Record payment
            </Link>
          )}
          <Link
            href={`/accounts/${account.id}/edit`}
            className="btn-ghost"
          >
            Edit
          </Link>
          <ArchiveButton accountId={account.id} archived={account.archived} />
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs text-muted mb-1">Current balance</div>
          <div className={`text-2xl font-bold tabular-nums ${amountClass(account.currentBalance)}`}>
            {formatMoney(account.currentBalance, account.currency)}
          </div>
        </div>

        {credit !== null && account.creditLimit !== null && (
          <>
            <div className="card">
              <div className="text-xs text-muted mb-1">Available credit</div>
              <div className="text-2xl font-bold tabular-nums">
                {formatMoney(credit, account.currency)}
              </div>
              <div className="text-xs text-muted mt-1">
                of {formatMoney(account.creditLimit, account.currency)} limit
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted mb-1">Utilization</div>
              <div className="text-2xl font-bold tabular-nums">
                {Math.round(((account.creditLimit - credit) / account.creditLimit) * 100)}%
              </div>
            </div>
          </>
        )}

        {account.loanDetails && (
          <>
            <div className="card">
              <div className="text-xs text-muted mb-1">Payoff progress</div>
              <div className="text-2xl font-bold tabular-nums">
                {payoff !== null ? `${Math.round(payoff * 100)}%` : "—"}
              </div>
              <div className="text-xs text-muted mt-1">
                of {formatMoney(account.loanDetails.originalPrincipal, account.currency)} principal
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted mb-1">Monthly payment</div>
              <div className="text-2xl font-bold tabular-nums">
                {formatMoney(account.loanDetails.monthlyPayment, account.currency)}
              </div>
              {account.loanDetails.nextPaymentDate && (
                <div className="text-xs text-muted mt-1">
                  next {account.loanDetails.nextPaymentDate.slice(0, 10)}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-xs text-muted mb-2">Running balance · last 90 days</div>
          <RunningBalanceChart data={balancePoints} currency={account.currency} />
        </div>
        {accountOverTime && (
          <div className="card">
            <div className="text-xs text-muted mb-2">Income vs expenses · last 6 months</div>
            <IncomeExpenseChart data={accountOverTime} currency={account.currency} />
          </div>
        )}
      </section>

      {accountSpend.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Spending by category · this month
          </h2>
          <div className="card max-w-xl">
            <CategoryDonut data={accountSpend} currency={account.currency} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Recent transactions
        </h2>
        {transactions.length === 0 ? (
          <p className="text-muted text-sm">No transactions yet.</p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {t.vendor?.name ?? t.description ?? "—"}
                  </div>
                  <div className="text-xs text-muted">
                    {t.occurredAt.toISOString().slice(0, 10)}
                    {t.category ? ` · ${t.category.name}` : ""}
                  </div>
                </div>
                <div className={`text-sm font-semibold tabular-nums ${amountClass(Number(t.amount))}`}>
                  {formatMoney(Number(t.amount), account.currency, { sign: true })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}


