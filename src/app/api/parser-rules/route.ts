import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { parserRuleInput } from "@/lib/validation";
import { ownsAccount } from "@/lib/ownership";
import { PARSER_RULE_ORDER } from "@/lib/email-parser";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.parserRule.findMany({
    where: { userId },
    include: { account: { select: { name: true } } },
    orderBy: PARSER_RULE_ORDER,
  });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parserRuleInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (!(await ownsAccount(userId, data.accountId))) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  const rule = await prisma.parserRule.create({
    data: {
      userId,
      name: data.name,
      senderMatch: data.senderMatch,
      subjectPattern: data.subjectPattern ?? null,
      bodyPattern: data.bodyPattern,
      accountId: data.accountId,
      defaultDirection: data.defaultDirection,
      priority: data.priority,
    },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
