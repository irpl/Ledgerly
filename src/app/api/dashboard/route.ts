import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { totalsByCurrency } from "@/lib/account-shared";
import { resolvePeriod } from "@/lib/period";
import { monthlyIncomeExpense, categorySpend, periodTotals } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = resolvePeriod(req.nextUrl.searchParams.get("period") ?? undefined);
  const [accounts, overTime, byCategory, totals] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
    monthlyIncomeExpense(userId, period.chartMonths),
    categorySpend(userId, period.start, period.end),
    periodTotals(userId, period.start, period.end),
  ]);
  const dtos = accounts.map(toAccountDTO);

  return NextResponse.json({
    period: period.preset,
    netWorthByCurrency: Object.fromEntries(totalsByCurrency(dtos)),
    accounts: dtos,
    incomeExpenseByMonth: Object.fromEntries(overTime),
    categorySpend: Object.fromEntries(byCategory),
    periodTotals: Object.fromEntries(totals),
  });
}
