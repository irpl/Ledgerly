import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/current-user";
import { toAccountDTO } from "@/lib/accounts";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";
import { TransactionForm } from "@/components/transaction-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const userId = await requireUserId();
  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);

  const categoryDTOs: CategoryDTO[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKindValue,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
    isDefault: c.isDefault,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Add transaction</h1>
      {accounts.length === 0 ? (
        <p className="text-muted">Create an account first.</p>
      ) : (
        <TransactionForm accounts={accounts.map(toAccountDTO)} categories={categoryDTOs} />
      )}
    </div>
  );
}
