import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parserRuleInput } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.parserRule.findMany({
    include: { account: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parserRuleInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const rule = await prisma.parserRule.create({
    data: {
      name: data.name,
      senderMatch: data.senderMatch,
      subjectPattern: data.subjectPattern ?? null,
      bodyPattern: data.bodyPattern,
      accountId: data.accountId,
      defaultDirection: data.defaultDirection,
    },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
