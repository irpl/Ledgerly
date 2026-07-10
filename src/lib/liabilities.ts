// Server-only: shared loans + credit-card liability view (§5.7).
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import type { AccountDTO } from "@/lib/account-shared";

export type LiabilityRow = {
  account: AccountDTO;
  /** Planned monthly amount (minor units): card budget, or loan budget falling back to the loan's monthly payment. */
  budget: number | null;
  /** This month's activity (minor units, positive): card purchases, or loan payments received. */
  spent: number;
  /** budget − spent; null when no budget is set. */
  remaining: number | null;
};

export function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export async function getLiabilityRows(userId: string): Promise<LiabilityRow[]> {
  const { start, end } = currentMonthRange();

  const accounts = await prisma.account.findMany({
    where: { userId, archived: false, type: { in: ["credit_card", "loan"] } },
    include: { loanDetails: true },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    accounts.map(async (raw) => {
      const account = toAccountDTO(raw);
      const isLoan = account.type === "loan";

      // Cards: what was charged this month (purchases, not transfer payments).
      // Loans: what was paid in this month (transfers/payments into the loan).
      const agg = await prisma.transaction.aggregate({
        where: {
          accountId: account.id,
          status: "confirmed",
          occurredAt: { gte: start, lt: end },
          amount: isLoan ? { gt: 0 } : { lt: 0 },
          ...(isLoan ? {} : { transferGroupId: null }),
        },
        _sum: { amount: true },
      });
      const spent = Math.abs(Number(agg._sum.amount ?? 0n));

      const budget = isLoan
        ? account.loanDetails?.monthlyBudget ?? account.loanDetails?.monthlyPayment ?? null
        : account.monthlyBudget;

      return {
        account,
        budget,
        spent,
        remaining: budget === null ? null : budget - spent,
      };
    })
  );
}
