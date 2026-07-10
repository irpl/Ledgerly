import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import type { VendorSuggestion } from "@/lib/transaction-shared";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const vendors = await prisma.vendor.findMany({
    where: { userId, ...(q ? { nameNormalized: { contains: q } } : {}) },
    orderBy: [{ usageCount: "desc" }, { lastUsedAt: "desc" }],
    take: 8,
  });
  const suggestions: VendorSuggestion[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    defaultCategoryId: v.defaultCategoryId,
  }));
  return NextResponse.json({ vendors: suggestions });
}
