import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { incomePlanInput } from "@/lib/validation";
import { majorToMinor } from "@/lib/money";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.incomePlan.findMany({
    where: { userId },
    orderBy: { label: "asc" },
  });
  return NextResponse.json({
    incomePlan: items.map((i) => ({
      id: i.id,
      label: i.label,
      monthlyAmount: Number(i.monthlyAmount),
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = incomePlanInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const item = await prisma.incomePlan.create({
    data: {
      userId,
      label: parsed.data.label,
      monthlyAmount: BigInt(majorToMinor(parsed.data.monthlyAmount)),
    },
  });
  return NextResponse.json(
    { incomePlan: { id: item.id, label: item.label, monthlyAmount: Number(item.monthlyAmount) } },
    { status: 201 }
  );
}
