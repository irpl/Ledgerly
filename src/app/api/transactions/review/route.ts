import { NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { toTransactionDTO } from "@/lib/transactions";

/** The review queue: pending email transactions + emails that need attention. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [pending, emails] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "pending_review", account: { userId } },
      include: { account: true, category: true, vendor: true, rawEmail: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rawEmail.findMany({
      where: { userId, parseStatus: { in: ["unparsed", "failed"] } },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    pending: pending.map((t) => ({
      ...toTransactionDTO(t),
      email: t.rawEmail
        ? { from: t.rawEmail.fromAddress, subject: t.rawEmail.subject }
        : null,
    })),
    unmatchedEmails: emails,
  });
}
