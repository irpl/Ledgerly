import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { toTransactionDTO } from "@/lib/transactions";
import { formatMoney, amountClass } from "@/lib/money";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";
import { TransactionForm } from "@/components/transaction-form";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";

export const dynamic = "force-dynamic";

export default async function EditTransactionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [transaction, accounts, categories] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id },
      include: { account: true, category: true, vendor: true },
    }),
    prisma.account.findMany({
      where: { archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  if (!transaction) notFound();

  const categoryDTOs: CategoryDTO[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKindValue,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
    isDefault: c.isDefault,
  }));

  if (transaction.transferGroupId) {
    const legs = await prisma.transaction.findMany({
      where: { transferGroupId: transaction.transferGroupId },
      include: { account: true },
      orderBy: { amount: "asc" },
    });
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Transfer</h1>
          <DeleteTransactionButton transactionId={transaction.id} isTransfer />
        </header>
        <div className="card max-w-lg space-y-3">
          {legs.map((leg) => (
            <div key={leg.id} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{leg.account.name}</div>
                <div className="text-xs text-muted">
                  {leg.occurredAt.toISOString().slice(0, 10)}
                  {leg.description ? ` · ${leg.description}` : ""}
                </div>
              </div>
              <div className={`text-sm font-semibold ${amountClass(Number(leg.amount))}`}>
                {formatMoney(Number(leg.amount), leg.account.currency, { sign: true })}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">
            Transfer legs stay linked and cannot be edited — delete the transfer and
            recreate it to change anything.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit transaction</h1>
        <DeleteTransactionButton transactionId={transaction.id} />
      </header>
      <TransactionForm
        accounts={accounts.map(toAccountDTO)}
        categories={categoryDTOs}
        transaction={toTransactionDTO(transaction)}
      />
    </div>
  );
}
