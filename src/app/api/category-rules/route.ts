import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { categoryRuleInput } from "@/lib/validation";
import { ownsCategory } from "@/lib/ownership";
import { listCategoryRules, rememberCategory } from "@/lib/category-rules";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ rules: await listCategoryRules(prisma, userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = categoryRuleInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { pattern, categoryId } = parsed.data;
  if (!(await ownsCategory(userId, categoryId))) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }
  const result = await prisma.$transaction((tx) =>
    rememberCategory(tx, userId, pattern, categoryId)
  );
  if (!result) return NextResponse.json({ error: "Pattern is blank" }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
