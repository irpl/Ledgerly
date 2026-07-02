import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { totalsByCurrency } from "@/lib/account-shared";
import { formatMoney, amountClass } from "@/lib/money";
import { AccountCard } from "@/components/account-card";

export const dynamic = "force-dynamic";

export default async function AccountsPage(props: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const searchParams = await props.searchParams;
  const showArchived = searchParams.archived === "1";

  const rows = await prisma.account.findMany({
    where: showArchived ? {} : { archived: false },
    include: { loanDetails: true },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
  const accounts = rows.map(toAccountDTO);
  const totals = totalsByCurrency(accounts);

  const byCurrency = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const list = byCurrency.get(a.currency) ?? [];
    list.push(a);
    byCurrency.set(a.currency, list);
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/accounts" : "/accounts?archived=1"}
            className="text-sm text-muted hover:underline cursor-pointer"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
          <Link
            href="/accounts/new"
            className="btn-primary"
          >
            + Account
          </Link>
        </div>
      </header>

      {accounts.length === 0 ? (
        <p className="text-muted">
          No accounts yet.{" "}
          <Link href="/accounts/new" className="text-secondary underline">
            Create your first account
          </Link>
          .
        </p>
      ) : (
        [...byCurrency.entries()].map(([currency, list]) => (
          <section key={currency}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
                {currency}
              </h2>
              <span
                className={`text-sm font-semibold tabular-nums ${amountClass(totals.get(currency) ?? 0)}`}
              >
                {formatMoney(totals.get(currency) ?? 0, currency)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {list.map((a) => (
                <AccountCard key={a.id} account={a} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
