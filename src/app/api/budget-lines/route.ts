import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { budgetLineInput } from "@/lib/validation";
import { normalizedMonthly } from "@/lib/budget-shared";
import { toBudgetLineDTO } from "@/lib/budget";
import { majorToMinor } from "@/lib/money";

const INCLUDE = { category: true, fundingAccount: true } as const;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lines = await prisma.budgetLine.findMany({
    include: INCLUDE,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ budgetLines: lines.map(toBudgetLineDTO) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = budgetLineInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const amountMinor = majorToMinor(data.amount);

  const line = await prisma.budgetLine.create({
    data: {
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
