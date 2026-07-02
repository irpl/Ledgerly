import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** Mark an email ignored (or back to unparsed). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.rawEmail.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.rawEmail.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.transaction) {
    return NextResponse.json(
      { error: "This email created a transaction — discard that first." },
      { status: 409 }
    );
  }
  await prisma.rawEmail.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
