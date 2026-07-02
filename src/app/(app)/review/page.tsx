import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { toTransactionDTO } from "@/lib/transactions";
import {
  ReviewQueue,
  type PendingItem,
  type UnmatchedEmail,
  type RuleItem,
} from "@/components/review-queue";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [pendingRows, emailRows, ruleRows, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "pending_review" },
      include: { account: true, category: true, vendor: true, rawEmail: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rawEmail.findMany({
      where: { parseStatus: { in: ["unparsed", "failed"] } },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
    prisma.parserRule.findMany({
      include: { account: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { archived: false },
      include: { loanDetails: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const pending: PendingItem[] = pendingRows.map((t) => ({
    ...toTransactionDTO(t),
    email: t.rawEmail ? { from: t.rawEmail.fromAddress, subject: t.rawEmail.subject } : null,
  }));
  const unmatchedEmails: UnmatchedEmail[] = emailRows.map((e) => ({
    id: e.id,
    fromAddress: e.fromAddress,
    subject: e.subject,
    body: e.body.length > 4000 ? `${e.body.slice(0, 4000)}…` : e.body,
    receivedAt: e.receivedAt.toISOString(),
    parseStatus: e.parseStatus,
  }));
  const rules: RuleItem[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    senderMatch: r.senderMatch,
    subjectPattern: r.subjectPattern,
    bodyPattern: r.bodyPattern,
    defaultDirection: r.defaultDirection,
    accountName: r.account.name,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Review</h1>
      <p className="text-sm text-muted max-w-2xl">
        Bank-alert emails land here first. Nothing affects a balance until you confirm
        it. Emails that no rule matched can be turned into rules below.
      </p>
      <ReviewQueue
        pending={pending}
        unmatchedEmails={unmatchedEmails}
        rules={rules}
        accounts={accounts.map(toAccountDTO)}
      />
    </div>
  );
}
