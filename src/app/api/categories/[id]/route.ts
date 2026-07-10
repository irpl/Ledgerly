import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { categoryInput } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = categoryInput.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Renames must not collide with another category on the per-user unique.
  const nextName = data.name ?? existing.name;
  const nextKind = data.kind ?? existing.kind;
  const duplicate = await prisma.category.findFirst({
    where: { userId, name: nextName, kind: nextKind, NOT: { id } },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "A category with that name and kind already exists." },
      { status: 409 }
    );
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      kind: data.kind,
      parentId: data.parentId !== undefined ? data.parentId : undefined,
      color: data.color !== undefined ? data.color : undefined,
      icon: data.icon !== undefined ? data.icon : undefined,
    },
  });
  return NextResponse.json({ category });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findFirst({
    where: { id, userId },
    include: { _count: { select: { budgetLines: true, transactions: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing._count.budgetLines > 0) {
    return NextResponse.json(
      { error: "This category is used by budget lines. Reassign them first." },
      { status: 409 }
    );
  }

  // Transactions keep their history; their categoryId becomes null (SetNull).
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true, orphanedTransactions: existing._count.transactions });
}
