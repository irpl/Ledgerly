// Server-only transaction helpers.
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionDTO } from "@/lib/transaction-shared";
import { majorToMinor } from "@/lib/money";
import type { TransactionInput } from "@/lib/validation";

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { account: true; category: true; vendor: true };
}>;

export function toTransactionDTO(t: TransactionWithRelations): TransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: t.account.name,
    accountCurrency: t.account.currency,
    amount: Number(t.amount),
    occurredAt: t.occurredAt.toISOString(),
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    vendorId: t.vendorId,
    vendorName: t.vendor?.name ?? null,
    description: t.description,
    notes: t.notes,
    source: t.source as TransactionDTO["source"],
    status: t.status as TransactionDTO["status"],
    transferGroupId: t.transferGroupId,
  };
}

export function signedMinorAmount(input: Pick<TransactionInput, "amount" | "direction">): bigint {
  const minor = BigInt(majorToMinor(Math.abs(input.amount)));
  return input.direction === "out" ? -minor : minor;
}

/**
 * Upsert a vendor by case-insensitive name: bump usage, remember the
 * category last used with it. Returns the vendor id, or null for blank names.
 */
export async function upsertVendor(
  tx: Prisma.TransactionClient,
  userId: string,
  name: string | null | undefined,
  categoryId: string | null | undefined
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const vendor = await tx.vendor.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized: normalized } },
    update: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
      ...(categoryId ? { defaultCategoryId: categoryId } : {}),
    },
    create: {
      userId,
      name: trimmed,
      nameNormalized: normalized,
      usageCount: 1,
      lastUsedAt: new Date(),
      defaultCategoryId: categoryId ?? null,
    },
  });
  return vendor.id;
}
