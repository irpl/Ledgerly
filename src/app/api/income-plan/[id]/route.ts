import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { incomePlanInput } from "@/lib/validation";
import { majorToMinor } from "@/lib/money";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.incomePlan.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = incomePlanInput.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const item = await prisma.incomePlan.update({
    where: { id },
    data: {
      label: parsed.data.label,
      monthlyAmount:
        parsed.data.monthlyAmount !== undefined
          ? BigInt(majorToMinor(parsed.data.monthlyAmount))
          : undefined,
    },
  });
  return NextResponse.json({
    incomePlan: { id: item.id, label: item.label, monthlyAmount: Number(item.monthlyAmount) },
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.incomePlan.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.incomePlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
