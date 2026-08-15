import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { budgetVsActual } from "@/lib/analytics";
import { parseBudgetPeriodLabel, resolveBudgetPeriod } from "@/lib/period";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Period bounds follow the user's own anchor day, not the calendar month.
  const { budgetStartDay } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { budgetStartDay: true },
  });

  const raw = req.nextUrl.searchParams.get("period");
  const period = raw
    ? parseBudgetPeriodLabel(raw, budgetStartDay)
    : resolveBudgetPeriod(budgetStartDay);
  if (!period) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const rows = await budgetVsActual(userId, period.label, period.start, period.end);
  return NextResponse.json({
    period: period.label,
    start: period.start.toISOString(),
    end: period.end.toISOString(),
    rows,
  });
}
