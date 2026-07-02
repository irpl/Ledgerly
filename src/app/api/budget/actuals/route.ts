import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { budgetVsActual } from "@/lib/analytics";
import { monthLabel, parseMonthLabel } from "@/lib/period";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("period") ?? monthLabel(new Date());
  const range = parseMonthLabel(raw);
  if (!range) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const rows = await budgetVsActual(raw, range.start, range.end);
  return NextResponse.json({ period: raw, rows });
}
