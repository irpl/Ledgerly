import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** Owner may act on their emails; admins may also act on unrouted ones. */
async function canAccessEmail(userId: string, email: { userId: string | null }) {
  if (email.userId === userId) return true;
  if (email.userId === null) return (await getAdminUser()) !== null;
  return false;
}

/** Mark an email ignored (or back to unparsed). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.rawEmail.findUnique({ where: { id } });
  if (!existing || !(await canAccessEmail(userId, existing))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parseStatus = body?.parseStatus;
  if (parseStatus !== "ignored" && parseStatus !== "unparsed") {
    return NextResponse.json(
      { error: "parseStatus must be 'ignored' or 'unparsed'" },
      { status: 400 }
    );
  }
  const email = await prisma.rawEmail.update({ where: { id }, data: { parseStatus } });
  return NextResponse.json({ email });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.rawEmail.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!existing || !(await canAccessEmail(userId, existing))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.transaction) {
    return NextResponse.json(
      { error: "This email created a transaction — discard that first." },
      { status: 409 }
    );
  }
  await prisma.rawEmail.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
