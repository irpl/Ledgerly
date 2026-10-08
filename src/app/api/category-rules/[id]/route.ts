import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { categoryRuleInput } from "@/lib/validation";
import { ownsCategory } from "@/lib/ownership";
import { toCategoryRuleDTO } from "@/lib/category-rules";
import { normalizeMatchText } from "@/lib/category-rule-shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.categoryRule.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = categoryRuleInput.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { categoryId } = parsed.data;
  if (categoryId && !(await ownsCategory(userId, categoryId))) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }
  const pattern = parsed.data.pattern !== undefined ? normalizeMatchText(parsed.data.pattern) : undefined;
  if (pattern !== undefined && pattern !== existing.pattern) {
    const duplicate = await prisma.categoryRule.findFirst({ where: { userId, pattern } });
    if (duplicate) {
      return NextResponse.json(
        { error: "A rule with that match text already exists." },
        { status: 409 }
      );
    }
  }

  const rule = await prisma.categoryRule.update({
    where: { id },
    data: { pattern, categoryId },
    include: { category: true },
  });
  return NextResponse.json({ rule: toCategoryRuleDTO(rule) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.categoryRule.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Transactions it already categorized keep their category.
  await prisma.categoryRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
