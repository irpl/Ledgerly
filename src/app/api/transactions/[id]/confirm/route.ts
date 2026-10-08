import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { recomputeBalance } from "@/lib/accounts";
import { toTransactionDTO } from "@/lib/transactions";
import { confirmInput } from "@/lib/validation";
import { ownsCategory } from "@/lib/ownership";
import { rememberCategory } from "@/lib/category-rules";

type Params = { params: Promise<{ id: string }> };

/**
 * Confirm a pending-review transaction — only now does it affect the balance.
 * The Review queue may send a category to set in the same step (omitted =
 * keep the current one) and ask to remember it for look-alike transactions.
 */
export async function POST(req: NextRequest, { params }: Params) {
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

  // The body is optional: the edit form's "Save & confirm" posts none.
  const text = await req.text();
  let body: unknown = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = confirmInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { categoryId, rememberCategory: remember } = parsed.data;
  if (categoryId && !(await ownsCategory(userId, categoryId))) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }

  const { updated, remembered } = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id },
      data: { status: "confirmed", categoryId },
      include: { account: true, category: true, vendor: true },
    });
    const finalCategoryId = categoryId !== undefined ? categoryId : existing.categoryId;
    const remembered =
      finalCategoryId && remember
        ? await rememberCategory(tx, userId, remember.pattern, finalCategoryId)
        : null;
    return { updated, remembered };
  });
  await recomputeBalance(existing.accountId);
  return NextResponse.json({ transaction: toTransactionDTO(updated), rememberedRule: remembered });
}
