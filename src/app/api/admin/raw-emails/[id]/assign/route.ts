import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { applyParserRules } from "@/lib/email-parser";

type Params = { params: Promise<{ id: string }> };

const assignInput = z.object({ userId: z.string().min(1) });

/** Assign an unrouted email to a user, then run that user's parser rules. */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const email = await prisma.rawEmail.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email.userId !== null) {
    return NextResponse.json({ error: "Email is already routed." }, { status: 409 });
  }
  if (email.transaction) {
    return NextResponse.json(
      { error: "This email already created a transaction." },
      { status: 409 }
    );
  }

  const parsed = assignInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 400 });

  const updated = await prisma.rawEmail.update({
    where: { id },
    data: { userId: target.id, parseStatus: "unparsed" },
  });
  const outcome = await applyParserRules(updated);
  return NextResponse.json({ ok: true, outcome });
}
