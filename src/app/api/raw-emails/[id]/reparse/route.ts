import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyParserRules } from "@/lib/email-parser";

type Params = { params: Promise<{ id: string }> };

/** Re-run parser rules against an email (after creating/fixing a rule). */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const email = await prisma.rawEmail.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email.transaction) {
    return NextResponse.json(
      { error: "This email already created a transaction." },
      { status: 409 }
    );
  }
  const outcome = await applyParserRules(email);
  return NextResponse.json({ outcome });
}
