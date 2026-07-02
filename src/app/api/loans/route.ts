import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLiabilityRows } from "@/lib/liabilities";
import { availableCredit } from "@/lib/account-shared";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getLiabilityRows();
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
