import Link from "next/link";
import { getLiabilityRows } from "@/lib/liabilities";
import { requireUserId } from "@/lib/current-user";
import { availableCredit, payoffProgress } from "@/lib/account-shared";
import { formatMoney, amountClass } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function LiabilitiesPage() {
  const userId = await requireUserId();
  const rows = await getLiabilityRows(userId);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Loans &amp; credit</h1>
        <Link href="/transfers/new" className="btn-primary">
          Record payment
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted">
          No loans or credit cards yet.{" "}
          <Link href="/accounts/new" className="text-secondary underline">
            Add one as an account
          </Link>
          .
        </p>
      ) : (
        <div className="card p-0! overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold text-right">Limit</th>
                <th className="p-3 font-semibold text-right">Balance</th>
                <th className="p-3 font-semibold text-right">Available</th>
                <th className="p-3 font-semibold text-right">Budget</th>
                <th className="p-3 font-semibold text-right">Spent</th>
                <th className="p-3 font-semibold text-right">Remaining</th>
                <th className="p-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(({ account, budget, spent, remaining }) => {
                const available = availableCredit(account);
                const payoff = payoffProgress(account);
                const isLoan = account.type === "loan";
                return (
                  <tr key={account.id} className="hover:bg-surface-raised transition-colors duration-150">
                    <td className="p-3">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="font-medium hover:underline cursor-pointer"
                      >
                        {account.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {isLoan ? (
                          <>
                            {payoff !== null && `${Math.round(payoff * 100)}% paid off`}
                            {account.loanDetails?.interestRate != null &&
                              ` · ${account.loanDetails.interestRate}%`}
                            {account.loanDetails?.nextPaymentDate &&
                              ` · next ${account.loanDetails.nextPaymentDate.slice(0, 10)}`}
                          </>
                        ) : (
                          `Credit card · ${account.currency}`
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right amount whitespace-nowrap">
                      {account.creditLimit !== null
                        ? formatMoney(account.creditLimit, account.currency)
                        : "—"}
                    </td>
                    <td className={`p-3 text-right whitespace-nowrap ${amountClass(account.currentBalance)}`}>
                      {formatMoney(account.currentBalance, account.currency)}
                    </td>
                    <td className="p-3 text-right amount whitespace-nowrap">
                      {available !== null ? formatMoney(available, account.currency) : "—"}
                    </td>
                    <td className="p-3 text-right amount whitespace-nowrap">
                      {budget !== null ? formatMoney(budget, account.currency) : "—"}
                    </td>
                    <td className="p-3 text-right amount whitespace-nowrap">
                      {formatMoney(spent, account.currency)}
                    </td>
                    <td
                      className={`p-3 text-right whitespace-nowrap ${
                        remaining === null ? "amount" : amountClass(remaining)
                      }`}
                    >
                      {remaining !== null ? formatMoney(remaining, account.currency) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/transfers/new?to=${account.id}`}
                        className="btn-ghost px-3! py-1.5! text-xs"
                      >
                        Pay
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted max-w-2xl">
        Spent counts this calendar month: purchases for cards, payments received for
        loans. Remaining = budget − spent. Loan payments are recorded as transfers and
        reduce the remaining principal in full.
      </p>
    </div>
  );
}

