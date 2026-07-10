import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { recomputeBalance } from "@/lib/accounts";
import { toTransactionDTO } from "@/lib/transactions";

type Params = { params: Promise<{ id: string }> };

/** Confirm a pending-review transaction — only now does it affect the balance. */
export async function POST(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.transaction.findFirst({
    where: { id, account: { userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending_review") {
    return NextResponse.json({ error: "Not pending review" }, { status: 409 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: { status: "confirmed" },
    include: { account: true, category: true, vendor: true },
  });
  await recomputeBalance(existing.accountId);
  return NextResponse.json({ transaction: toTransactionDTO(updated) });
}
