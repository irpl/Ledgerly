import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { budgetVsActual } from "@/lib/analytics";
import { monthLabel, parseMonthLabel } from "@/lib/period";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("period") ?? monthLabel(new Date());
  const range = parseMonthLabel(raw);
  if (!range) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const rows = await budgetVsActual(userId, raw, range.start, range.end);
  return NextResponse.json({ period: raw, rows });
}
