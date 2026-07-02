import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categoryInput } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = categoryInput.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findUnique({
    where: { id },
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
