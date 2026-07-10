import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/current-user";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";
import { CategoryManager } from "@/components/category-manager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const userId = await requireUserId();
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  const categories: CategoryDTO[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKindValue,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
    isDefault: c.isDefault,
    transactionCount: c._count.transactions,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>
      <CategoryManager initial={categories} />
    </div>
  );
}
