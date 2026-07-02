import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { totalsByCurrency } from "@/lib/account-shared";
import { resolvePeriod } from "@/lib/period";
import { monthlyIncomeExpense, categorySpend, periodTotals } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = resolvePeriod(req.nextUrl.searchParams.get("period") ?? undefined);
  const [accounts, overTime, byCategory, totals] = await Promise.all([
    prisma.account.findMany({
      where: { archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
    monthlyIncomeExpense(period.chartMonths),
    categorySpend(period.start, period.end),
    periodTotals(period.start, period.end),
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
