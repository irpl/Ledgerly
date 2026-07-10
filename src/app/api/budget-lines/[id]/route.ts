import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { budgetLineInput } from "@/lib/validation";
import { normalizedMonthly } from "@/lib/budget-shared";
import { toBudgetLineDTO } from "@/lib/budget";
import { majorToMinor } from "@/lib/money";
import { ownsAccount, ownsCategory } from "@/lib/ownership";

const INCLUDE = { category: true, fundingAccount: true } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.budgetLine.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = budgetLineInput.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (
    (data.categoryId && !(await ownsCategory(userId, data.categoryId))) ||
    (data.fundingAccountId && !(await ownsAccount(userId, data.fundingAccountId)))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Editing amount or frequency recomputes the derived monthly figure.
  const nextAmount =
    data.amount !== undefined ? majorToMinor(data.amount) : Number(existing.amount);
  const nextFrequency =
    data.frequency ?? (existing.frequency as NonNullable<typeof data.frequency>);

  const line = await prisma.budgetLine.update({
    where: { id },
    data: {
      name: data.name,
      categoryId: data.categoryId,
      amount: data.amount !== undefined ? BigInt(nextAmount) : undefined,
      frequency: data.frequency,
      paymentMethod: data.paymentMethod,
      fundingAccountId: data.fundingAccountId,
      normalizedMonthly: BigInt(normalizedMonthly(nextAmount, nextFrequency)),
      active: data.active,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ budgetLine: toBudgetLineDTO(line) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.budgetLine.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.budgetLine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
