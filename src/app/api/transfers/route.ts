import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transferInput } from "@/lib/validation";
import { recomputeBalance } from "@/lib/accounts";
import { toTransactionDTO } from "@/lib/transactions";
import { majorToMinor } from "@/lib/money";

const INCLUDE = { account: true, category: true, vendor: true } as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = transferInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const [from, to] = await Promise.all([
    prisma.account.findUnique({ where: { id: data.fromAccountId } }),
    prisma.account.findUnique({ where: { id: data.toAccountId } }),
  ]);
  if (!from || !to) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (from.currency !== to.currency && data.toAmount == null) {
    return NextResponse.json(
      { error: `Accounts use different currencies (${from.currency} → ${to.currency}); specify the amount received.` },
      { status: 400 }
    );
  }
  const occurredAt = new Date(data.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const outMinor = BigInt(majorToMinor(data.amount));
  const inMinor = BigInt(majorToMinor(data.toAmount ?? data.amount));

  // Both legs share the seeded Transfer category when it still exists.
  const transferCategory = await prisma.category.findUnique({
    where: { name_kind: { name: "Transfer", kind: "both" } },
  });

  const transferGroupId = randomUUID();
  const description = data.description ?? `Transfer: ${from.name} → ${to.name}`;

  const [outLeg] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        accountId: from.id,
        amount: -outMinor,
        occurredAt,
        categoryId: transferCategory?.id ?? null,
        description,
        notes: data.notes ?? null,
        source: "manual",
        status: "confirmed",
        transferGroupId,
      },
      include: INCLUDE,
    }),
    prisma.transaction.create({
      data: {
        accountId: to.id,
        amount: inMinor,
        occurredAt,
        categoryId: transferCategory?.id ?? null,
        description,
        notes: data.notes ?? null,
        source: "manual",
        status: "confirmed",
        transferGroupId,
      },
      include: INCLUDE,
    }),
  ]);

  await recomputeBalance(from.id);
  await recomputeBalance(to.id);

  return NextResponse.json(
    { transfer: { transferGroupId, out: toTransactionDTO(outLeg) } },
    { status: 201 }
  );
}
