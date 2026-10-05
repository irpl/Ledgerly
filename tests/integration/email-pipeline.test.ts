import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { applyParserRules, lostParseRace } from "@/lib/email-parser";

const BODY_PATTERN = String.raw`(?<direction>debited|credited).*?(?<amount>[\d,]+\.\d{2}).*?at (?<merchant>.+?) on (?<date>\d{2}-\w{3}-\d{4})`;

let user: Awaited<ReturnType<typeof createTestUser>>;

async function makeAccount(ownerId = user.id) {
  return prisma.account.create({
    data: { userId: ownerId, name: "NCB", type: "checking", currency: "JMD", openingBalance: 0n, currentBalance: 0n },
  });
}

async function makeEmail(body: string, from = "alerts@jncb.com", ownerId: string | null = null) {
  return prisma.rawEmail.create({
    data: {
      userId: ownerId ?? user.id,
      fromAddress: from,
      subject: "Transaction Alert",
      body,
      receivedAt: new Date(),
    },
  });
}

describe("applyParserRules (spec §5.5 pipeline)", () => {
  beforeEach(async () => {
    await resetDb();
    user = await createTestUser();
  });
  afterAll(() => prisma.$disconnect());

  it("creates a pending_review transaction with extracted fields", async () => {
    const account = await makeAccount();
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId: account.id,
        defaultDirection: "outflow",
      },
    });
    const email = await makeEmail(
      "Your account was debited JMD 4,512.35 at HI-LO PORTMORE on 02-Jul-2026."
    );

    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("parsed");

    const txn = await prisma.transaction.findFirstOrThrow({ include: { vendor: true } });
    expect(txn.amount).toBe(-451_235n); // debited → negative
    expect(txn.status).toBe("pending_review");
    expect(txn.source).toBe("email");
    expect(txn.vendor?.name).toBe("HI-LO PORTMORE");
    expect(txn.occurredAt.getFullYear()).toBe(2026);
    expect(txn.occurredAt.getMonth()).toBe(6);
    expect(txn.rawEmailId).toBe(email.id);

    const fresh = await prisma.rawEmail.findUniqueOrThrow({ where: { id: email.id } });
    expect(fresh.parseStatus).toBe("parsed");
    expect(fresh.createdTransactionId).toBe(txn.id);
  });

  it("signs credits positive from the direction group", async () => {
    const account = await makeAccount();
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId: account.id,
        defaultDirection: "outflow",
      },
    });
    const email = await makeEmail(
      "Your account was credited JMD 1,750.00 at PAYROLL DEPOSIT on 25-Jun-2026."
    );
    await applyParserRules(email);
    const txn = await prisma.transaction.findFirstOrThrow();
    expect(txn.amount).toBe(175_000n);
  });

  it("marks unparsed when no rule matches the sender", async () => {
    const email = await makeEmail("whatever", "spam@example.com");
    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("unparsed");
    const fresh = await prisma.rawEmail.findUniqueOrThrow({ where: { id: email.id } });
    expect(fresh.parseStatus).toBe("unparsed");
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("marks failed when the rule matches but extraction fails", async () => {
    const account = await makeAccount();
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId: account.id,
        defaultDirection: "outflow",
      },
    });
    const email = await makeEmail("Your OTP code is 123456."); // no amount pattern
    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("failed");
    const fresh = await prisma.rawEmail.findUniqueOrThrow({ where: { id: email.id } });
    expect(fresh.parseStatus).toBe("failed");
    expect(fresh.parseError).toMatch(/Tried 1 rule.*"NCB"/);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("respects subjectPattern filtering", async () => {
    const account = await makeAccount();
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        subjectPattern: "^Statement Ready$",
        bodyPattern: BODY_PATTERN,
        accountId: account.id,
        defaultDirection: "outflow",
      },
    });
    const email = await makeEmail("debited JMD 100.00 at X on 01-Jan-2026"); // subject: Transaction Alert
    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("unparsed");
  });

  it("never applies another user's rules (tenant isolation)", async () => {
    const other = await createTestUser();
    const otherAccount = await makeAccount(other.id);
    await prisma.parserRule.create({
      data: {
        userId: other.id,
        name: "Other user's NCB rule",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId: otherAccount.id,
        defaultDirection: "outflow",
      },
    });
    // Email routed to `user`, who has no rules — the other user's rule must not fire.
    const email = await makeEmail("debited JMD 100.00 at X on 01-Jan-2026");
    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("unparsed");
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("never parses an unrouted email", async () => {
    const account = await makeAccount();
    await prisma.parserRule.create({
      data: {
        userId: user.id,
        name: "NCB",
        senderMatch: "jncb.com",
        bodyPattern: BODY_PATTERN,
        accountId: account.id,
        defaultDirection: "outflow",
      },
    });
    const email = await prisma.rawEmail.create({
      data: {
        userId: null,
        fromAddress: "alerts@jncb.com",
        subject: "Transaction Alert",
        body: "debited JMD 100.00 at X on 01-Jan-2026",
        receivedAt: new Date(),
      },
    });
    const outcome = await applyParserRules(email);
    expect(outcome.status).toBe("unparsed");
    expect(await prisma.transaction.count()).toBe(0);
  });

  describe("several rules for one sender and subject", () => {
    // Shaped like the Uber case that motivated fall-through: same sender, same
    // subject, told apart only by the body.
    const TIP = String.raw`Thanks for tipping[\s\S]*?Tip JMD (?<amount>[\d,]+\.\d{2})`;
    const FARE = String.raw`charge summary[\s\S]*?Total JMD (?<amount>[\d,]+\.\d{2})`;

    async function makeRule(name: string, bodyPattern: string, extra: { priority?: number; senderMatch?: string } = {}) {
      const account = await prisma.account.findFirst({ where: { userId: user.id } }) ?? (await makeAccount());
      return prisma.parserRule.create({
        data: {
          userId: user.id,
          name,
          senderMatch: extra.senderMatch ?? "uber.com",
          subjectPattern: "trip with Uber",
          bodyPattern,
          accountId: account.id,
          defaultDirection: "outflow",
          priority: extra.priority,
        },
      });
    }

    async function makeUberEmail(body: string) {
      return prisma.rawEmail.create({
        data: {
          userId: user.id,
          fromAddress: "noreply@uber.com",
          subject: "Your Sunday evening trip with Uber",
          body,
          receivedAt: new Date(),
        },
      });
    }

    it("falls through to the next rule when the first one's body doesn't match", async () => {
      await makeRule("Uber — tip", TIP); // sorts first by name
      const fare = await makeRule("Uber — trip fare", FARE);
      const email = await makeUberEmail("This is your charge summary. Total JMD 494.77");

      const outcome = await applyParserRules(email);
      expect(outcome).toMatchObject({ status: "parsed", ruleId: fare.id });
      const txn = await prisma.transaction.findFirstOrThrow();
      expect(txn.amount).toBe(-49_477n);
      const fresh = await prisma.rawEmail.findUniqueOrThrow({ where: { id: email.id } });
      expect(fresh.matchedRuleId).toBe(fare.id);
      expect(fresh.parseError).toBeNull();
    });

    it("creates one transaction even when several rules would parse", async () => {
      const loose = String.raw`JMD (?<amount>[\d,]+\.\d{2})`;
      const first = await makeRule("B", loose, { priority: 10 });
      await makeRule("A", loose, { priority: 20 });
      const email = await makeUberEmail("Total JMD 10.00");

      const outcome = await applyParserRules(email);
      expect(outcome).toMatchObject({ status: "parsed", ruleId: first.id });
      expect(await prisma.transaction.count()).toBe(1);
    });

    it("orders by priority before name", async () => {
      await makeRule("A — tip", TIP, { priority: 50 });
      const fare = await makeRule("Z — fare", FARE, { priority: 5 });
      const email = await makeUberEmail("This is your charge summary. Total JMD 1.00");
      const outcome = await applyParserRules(email);
      expect(outcome).toMatchObject({ status: "parsed", ruleId: fare.id });
    });

    it("fails only after every candidate fails, naming each rule tried", async () => {
      const tip = await makeRule("Uber — tip", TIP);
      const fare = await makeRule("Uber — trip fare", FARE);
      // A rule for another sender is never a candidate, even if its body would match.
      await makeRule("Other sender", String.raw`(?<amount>\d+\.\d{2})`, { senderMatch: "lyft.com" });
      const email = await makeUberEmail("Thanks for riding. JMD 494.77");

      const outcome = await applyParserRules(email);
      expect(outcome.status).toBe("failed");
      if (outcome.status !== "failed") return;
      expect(outcome.attempts.map((a) => a.ruleId)).toEqual([tip.id, fare.id]);
      expect(outcome.reason).toMatch(/^Tried 2 rules/);
      expect(outcome.reason).toContain('"Uber — tip"');
      expect(outcome.reason).toContain('"Uber — trip fare"');

      const fresh = await prisma.rawEmail.findUniqueOrThrow({ where: { id: email.id } });
      expect(fresh.parseStatus).toBe("failed");
      expect(fresh.parseError).toBe(outcome.reason);
      expect(fresh.matchedRuleId).toBeNull();
      expect(await prisma.transaction.count()).toBe(0);
    });
  });

  describe("lostParseRace", () => {
    it("recognises the unique-rawEmailId rejection when another parse already won", async () => {
      const account = await makeAccount();
      await prisma.parserRule.create({
        data: {
          userId: user.id,
          name: "NCB",
          senderMatch: "jncb.com",
          bodyPattern: BODY_PATTERN,
          accountId: account.id,
          defaultDirection: "outflow",
        },
      });
      const email = await makeEmail("debited JMD 100.00 at X on 01-Jan-2026");
      // The winning re-parse, finished after the loser read the email.
      await applyParserRules(email);

      const error = await applyParserRules(email).then(
        () => null,
        (e: unknown) => e
      );
      expect(error).not.toBeNull();
      expect(await lostParseRace(error, email.id)).toBe(true);
      expect(await prisma.transaction.count()).toBe(1);
    });

    it("leaves every other error to the caller", async () => {
      const email = await makeEmail("whatever");
      expect(await lostParseRace(new Error("boom"), email.id)).toBe(false);
    });
  });
});
