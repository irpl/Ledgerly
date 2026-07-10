import { NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { getLiabilityRows } from "@/lib/liabilities";
import { availableCredit } from "@/lib/account-shared";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getLiabilityRows(userId);
  return NextResponse.json({
    liabilities: rows.map(({ account, budget, spent, remaining }) => ({
      account,
      availableCredit: availableCredit(account),
      budget,
      spent,
      remaining,
    })),
  });
}
