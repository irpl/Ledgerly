import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { transactionInput } from "@/lib/validation";
import { toTransactionDTO, upsertVendor, signedMinorAmount } from "@/lib/transactions";
import { recomputeBalance } from "@/lib/accounts";
import { ownsCategory } from "@/lib/ownership";

const INCLUDE = { account: true, category: true, vendor: true } as const;

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId") ?? undefined;
  const categoryId = sp.get("categoryId") ?? undefined;
  const take = Math.min(parseInt(sp.get("take") ?? "50", 10) || 50, 200);
  const cursor = sp.get("cursor") ?? undefined;

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { userId },
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    include: INCLUDE,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > take;
  const page = hasMore ? transactions.slice(0, take) : transactions;
  return NextResponse.json({
    transactions: page.map(toTransactionDTO),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = transactionInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (data.categoryId && !(await ownsCategory(userId, data.categoryId))) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }
  const occurredAt = new Date(data.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const vendorId = await upsertVendor(tx, userId, data.vendorName, data.categoryId ?? null);
    return tx.transaction.create({
      data: {
        accountId: data.accountId,
        amount: signedMinorAmount(data),
        occurredAt,
        categoryId: data.categoryId ?? null,
        vendorId,
        description: data.description ?? null,
        notes: data.notes ?? null,
        source: "manual",
        status: "confirmed",
      },
      include: INCLUDE,
    });
  });
  await recomputeBalance(data.accountId);

  return NextResponse.json({ transaction: toTransactionDTO(created) }, { status: 201 });
}
