// Server-only account helpers (touch Prisma). Client-safe pieces live in
// account-shared.ts.
import { prisma } from "@/lib/prisma";
import type { Account, LoanDetails } from "@/generated/prisma/client";
import type { AccountDTO, AccountTypeValue, LoanKindValue } from "@/lib/account-shared";

export function toAccountDTO(
  account: Account & { loanDetails?: LoanDetails | null }
): AccountDTO {
  return {
    id: account.id,
    name: account.name,
    type: account.type as AccountTypeValue,
    currency: account.currency,
    openingBalance: Number(account.openingBalance),
    currentBalance: Number(account.currentBalance),
    creditLimit: account.creditLimit === null ? null : Number(account.creditLimit),
    monthlyBudget: account.monthlyBudget === null ? null : Number(account.monthlyBudget),
    color: account.color,
    icon: account.icon,
    archived: account.archived,
    createdAt: account.createdAt.toISOString(),
    loanDetails: account.loanDetails
      ? {
          loanKind: account.loanDetails.loanKind as LoanKindValue,
          originalPrincipal: Number(account.loanDetails.originalPrincipal),
          interestRate: Number(account.loanDetails.interestRate),
          termMonths: account.loanDetails.termMonths,
          startDate: account.loanDetails.startDate.toISOString(),
          monthlyPayment: Number(account.loanDetails.monthlyPayment),
          monthlyBudget:
            account.loanDetails.monthlyBudget === null
              ? null
              : Number(account.loanDetails.monthlyBudget),
          lender: account.loanDetails.lender,
          nextPaymentDate: account.loanDetails.nextPaymentDate?.toISOString() ?? null,
        }
      : null,
  };
}

/** Recompute the cached balance: opening + Σ confirmed transactions. */
export async function recomputeBalance(accountId: string): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { openingBalance: true },
  });
  const agg = await prisma.transaction.aggregate({
    where: { accountId, status: "confirmed" },
    _sum: { amount: true },
  });
  await prisma.account.update({
    where: { id: accountId },
    data: { currentBalance: account.openingBalance + (agg._sum.amount ?? 0n) },
  });
}
