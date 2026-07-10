import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/current-user";
import { toTransactionDTO } from "@/lib/transactions";
import type { TransactionDTO } from "@/lib/transaction-shared";
import { formatMoney, amountClass } from "@/lib/money";

export const dynamic = "force-dynamic";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-JM", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function groupByDay(transactions: TransactionDTO[]): Map<string, TransactionDTO[]> {
  const groups = new Map<string, TransactionDTO[]>();
  for (const t of transactions) {
    const key = dateLabel(t.occurredAt);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return groups;
}

export default async function TransactionsPage(props: {
  searchParams: Promise<{ account?: string }>;
}) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const accountFilter = searchParams.account;

  const [rows, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        account: { userId },
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
      include: { account: true, category: true, vendor: true },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    prisma.account.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const transactions = rows.map(toTransactionDTO);
  const groups = groupByDay(transactions);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex items-center gap-3">
          <nav className="flex gap-1.5 flex-wrap" aria-label="Filter by account">
            <Link
              href="/transactions"
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors duration-200 ${
                !accountFilter
                  ? "border-secondary text-secondary bg-primary/20"
                  : "border-border-strong text-muted hover:bg-surface-raised"
              }`}
            >
              All
            </Link>
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/transactions?account=${a.id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors duration-200 ${
                  accountFilter === a.id
                    ? "border-secondary text-secondary bg-primary/20"
                    : "border-border-strong text-muted hover:bg-surface-raised"
                }`}
              >
                {a.name}
              </Link>
            ))}
          </nav>
          <Link href="/transfers/new" className="btn-ghost">
            Transfer
          </Link>
          <Link href="/transactions/new" className="btn-primary">
            + Transaction
          </Link>
        </div>
      </header>

      {transactions.length === 0 ? (
        <p className="text-muted">
          No transactions yet.{" "}
          <Link href="/transactions/new" className="text-secondary underline">
            Add your first one
          </Link>
          .
        </p>
      ) : (
        [...groups.entries()].map(([label, items]) => (
          <section key={label}>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              {label}
            </h2>
            <ul className="card p-0! divide-y divide-border-subtle">
              {items.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}/edit`}
                    className="flex items-center justify-between gap-3 p-3 cursor-pointer transition-colors duration-200 hover:bg-surface-raised"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.vendorName ?? t.description ?? "—"}
                        {t.transferGroupId && (
                          <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                            Transfer
                          </span>
                        )}
                        {t.status === "pending_review" && (
                          <span className="ml-2 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-negative">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {t.accountName}
                        {t.categoryName ? ` · ${t.categoryName}` : ""}
                        {t.vendorName && t.description ? ` · ${t.description}` : ""}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${amountClass(t.amount)}`}>
                      {formatMoney(t.amount, t.accountCurrency, { sign: true })}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

