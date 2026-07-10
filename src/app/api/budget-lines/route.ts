import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { budgetLineInput } from "@/lib/validation";
import { normalizedMonthly } from "@/lib/budget-shared";
import { toBudgetLineDTO } from "@/lib/budget";
import { majorToMinor } from "@/lib/money";
import { ownsAccount, ownsCategory } from "@/lib/ownership";

const INCLUDE = { category: true, fundingAccount: true } as const;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lines = await prisma.budgetLine.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ budgetLines: lines.map(toBudgetLineDTO) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = budgetLineInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (
    !(await ownsCategory(userId, data.categoryId)) ||
    !(await ownsAccount(userId, data.fundingAccountId))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const amountMinor = majorToMinor(data.amount);

  const line = await prisma.budgetLine.create({
    data: {
      userId,
      name: data.name,
      categoryId: data.categoryId,
      amount: BigInt(amountMinor),
      frequency: data.frequency,
      paymentMethod: data.paymentMethod,
      fundingAccountId: data.fundingAccountId,
      normalizedMonthly: BigInt(normalizedMonthly(amountMinor, data.frequency)),
      active: data.active ?? true,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ budgetLine: toBudgetLineDTO(line) }, { status: 201 });
}
