import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categoryInput } from "@/lib/validation";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  const dtos: CategoryDTO[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKindValue,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
    isDefault: c.isDefault,
    transactionCount: c._count.transactions,
  }));
  return NextResponse.json({ categories: dtos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = categoryInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const existing = await prisma.category.findUnique({
    where: { name_kind: { name: data.name, kind: data.kind } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A category with that name and kind already exists." },
      { status: 409 }
    );
  }
  const category = await prisma.category.create({
    data: {
      name: data.name,
      kind: data.kind,
      parentId: data.parentId ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });
  return NextResponse.json({ category }, { status: 201 });
}
