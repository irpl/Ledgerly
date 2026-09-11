import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** Revoke a token: deleted outright, so the credential stops working at once. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.apiToken.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.apiToken.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
