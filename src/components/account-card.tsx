import Link from "next/link";
import type { AccountDTO } from "@/lib/account-shared";
import { ACCOUNT_TYPE_LABELS, availableCredit, payoffProgress } from "@/lib/account-shared";
import { formatMoney, amountClass } from "@/lib/money";

export function AccountCard({ account }: { account: AccountDTO }) {
  const credit = availableCredit(account);
  const payoff = payoffProgress(account);

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="card block cursor-pointer transition-colors duration-200 hover:border-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {account.name}
            {account.archived && (
              <span className="ml-2 text-xs rounded bg-surface-raised px-1.5 py-0.5 text-muted">
                archived
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
          </div>
        </div>
        <div className={`text-right font-semibold ${amountClass(account.currentBalance)}`}>
          {formatMoney(account.currentBalance, account.currency)}
        </div>
      </div>

      {credit !== null && account.creditLimit !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Available {formatMoney(credit, account.currency)}</span>
            <span>
              {Math.round(((account.creditLimit - credit) / account.creditLimit) * 100)}% used
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.min(100, ((account.creditLimit - credit) / account.creditLimit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {payoff !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Payoff progress</span>
            <span>{Math.round(payoff * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${payoff * 100}%` }} />
          </div>
        </div>
      )}
    </Link>
  );
}
