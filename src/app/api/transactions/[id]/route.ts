import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { transactionInput } from "@/lib/validation";
import { toTransactionDTO, upsertVendor, signedMinorAmount } from "@/lib/transactions";
import { recomputeBalance } from "@/lib/accounts";
import { ownsAccount, ownsCategory } from "@/lib/ownership";

const INCLUDE = { account: true, category: true, vendor: true } as const;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const transaction = await prisma.transaction.findFirst({
    where: { id, account: { userId } },
    include: INCLUDE,
  });
  if (!transaction) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ transaction: toTransactionDTO(transaction) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.transaction.findFirst({
    where: { id, account: { userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.transferGroupId) {
    return NextResponse.json(
      { error: "Transfer legs cannot be edited. Delete the transfer and recreate it." },
      { status: 409 }
    );
  }

  const parsed = transactionInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (!(await ownsAccount(userId, data.accountId))) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (data.categoryId && !(await ownsCategory(userId, data.categoryId))) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }
  const occurredAt = new Date(data.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const vendorId = await upsertVendor(tx, userId, data.vendorName, data.categoryId ?? null);
    return tx.transaction.update({
      where: { id },
      data: {
        accountId: data.accountId,
        amount: signedMinorAmount(data),
        occurredAt,
        categoryId: data.categoryId ?? null,
        vendorId,
        description: data.description ?? null,
        notes: data.notes ?? null,
      },
      include: INCLUDE,
    });
  });

  // Recompute both sides if the transaction moved between accounts.
  await recomputeBalance(data.accountId);
  if (existing.accountId !== data.accountId) {
    await recomputeBalance(existing.accountId);
  }

  return NextResponse.json({ transaction: toTransactionDTO(updated) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.transaction.findFirst({
    where: { id, account: { userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.transferGroupId) {
    // Deleting a transfer removes both legs so the pair never dangles.
    const legs = await prisma.transaction.findMany({
      where: { transferGroupId: existing.transferGroupId },
      select: { accountId: true },
    });
    await prisma.transaction.deleteMany({
      where: { transferGroupId: existing.transferGroupId },
    });
    for (const accountId of new Set(legs.map((l) => l.accountId))) {
      await recomputeBalance(accountId);
    }
    return NextResponse.json({ ok: true, deletedGroup: true });
  }

  await prisma.transaction.delete({ where: { id } });
  if (existing.rawEmailId) {
    // Discarding an email-sourced transaction: keep the email but mark it
    // ignored so it doesn't resurface in the review queue.
    await prisma.rawEmail.update({
      where: { id: existing.rawEmailId },
      data: { parseStatus: "ignored", createdTransactionId: null },
    });
  }
  await recomputeBalance(existing.accountId);
  return NextResponse.json({ ok: true });
}
