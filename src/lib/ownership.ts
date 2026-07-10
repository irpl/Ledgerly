// Server-only: cross-entity ownership checks for API route inputs.
// Any id a client submits that references another entity (accountId,
// categoryId, ...) must be verified to belong to the caller.
import { prisma } from "@/lib/prisma";

export async function ownsAccount(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  return account !== null;
}

export async function ownsCategory(userId: string, categoryId: string): Promise<boolean> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  return category !== null;
}
