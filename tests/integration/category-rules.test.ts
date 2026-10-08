import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { applyParserRules } from "@/lib/email-parser";
import { rememberCategory } from "@/lib/category-rules";

const BODY_PATTERN = String.raw`(?<direction>debited|credited).*?(?<amount>[\d,]+\.\d{2}).*?at (?<merchant>.+?) on (?<date>\d{2}-\w{3}-\d{4})`;

let user: Awaited<ReturnType<typeof createTestUser>>;
let accountId: string;

async function category(name: string, kind: "expense" | "income" | "both" = "expense", ownerId = user.id) {
  return prisma.category.create({ data: { userId: ownerId, name, kind } });
}

async function ingest(body: string, ownerId = user.id) {
  const email = await prisma.rawEmail.create({
    data: {
      userId: ownerId,
      fromAddress: "alerts@jncb.com",
      subject: "Transaction Alert",
      body,
      receivedAt: new Date(),
    },
  });
  const outcome = await applyParserRules(email);
  if (outcome.status !== "parsed") throw new Error(`not parsed: ${outcome.status}`);
  return prisma.transaction.findUniqueOrThrow({ where: { id: outcome.transactionId } });
}

describe("remembered categories", () => {
  beforeEach(async () => {
    await resetDb();
    user = await createTestUser();
    const account = await prisma.account.create({
      data: { userId: user.id, name: "NCB", type: "checking", currency: "JMD" },
    });
    accountId = account.id;
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId,
      },
    });
  });
  afterAll(() => prisma.$disconnect());

  it("files a matching incoming email transaction under the remembered category", async () => {
    const groceries = await category("Groceries");
    await prisma.$transaction((tx) => rememberCategory(tx, user.id, "  HI-LO ", groceries.id));

    const txn = await ingest("Your account was debited JMD 4,512.35 at HI-LO PORTMORE on 02-Jul-2026.");
    expect(txn.categoryId).toBe(groceries.id);
    expect(txn.status).toBe("pending_review"); // still waits for confirmation

    const rule = await prisma.categoryRule.findFirstOrThrow({ where: { userId: user.id } });
    expect(rule.pattern).toBe("hi-lo");
    expect(rule.matchCount).toBe(1);

    const other = await ingest("Your account was debited JMD 900.00 at TEXACO on 03-Jul-2026.");
    expect(other.categoryId).toBeNull();
  });

  it("does not apply an expense category to money coming in", async () => {
    const groceries = await category("Groceries");
    await prisma.$transaction((tx) => rememberCategory(tx, user.id, "hi-lo", groceries.id));
    const refund = await ingest("Your account was credited JMD 500.00 at HI-LO PORTMORE on 04-Jul-2026.");
    expect(refund.categoryId).toBeNull();
  });

  it("files uncategorized transactions already waiting in Review", async () => {
    const pending = await ingest("Your account was debited JMD 4,512.35 at HI-LO PORTMORE on 02-Jul-2026.");
    expect(pending.categoryId).toBeNull();
    const groceries = await category("Groceries");

    const result = await prisma.$transaction((tx) =>
      rememberCategory(tx, user.id, "hi-lo", groceries.id)
    );
    expect(result?.applied).toBe(1);
    const fresh = await prisma.transaction.findUniqueOrThrow({ where: { id: pending.id } });
    expect(fresh.categoryId).toBe(groceries.id);
  });

  it("repoints an existing rule instead of duplicating it", async () => {
    const groceries = await category("Groceries");
    const dining = await category("Dining");
    await prisma.$transaction((tx) => rememberCategory(tx, user.id, "hi-lo", groceries.id));
    await prisma.$transaction((tx) => rememberCategory(tx, user.id, "HI-LO", dining.id));
    const rules = await prisma.categoryRule.findMany({ where: { userId: user.id } });
    expect(rules).toHaveLength(1);
    expect(rules[0].categoryId).toBe(dining.id);
  });

  it("only uses the email owner's rules", async () => {
    const stranger = await createTestUser();
    const theirs = await category("Groceries", "expense", stranger.id);
    await prisma.$transaction((tx) => rememberCategory(tx, stranger.id, "hi-lo", theirs.id));
    const txn = await ingest("Your account was debited JMD 4,512.35 at HI-LO PORTMORE on 02-Jul-2026.");
    expect(txn.categoryId).toBeNull();
  });
});
