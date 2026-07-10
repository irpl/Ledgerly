import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { recomputeBalance } from "@/lib/accounts";

describe("recomputeBalance", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function makeAccount(openingBalance: bigint) {
    const user = await createTestUser();
    return prisma.account.create({
      data: {
        userId: user.id,
        name: "NCB",
        type: "checking",
        currency: "JMD",
        openingBalance,
        currentBalance: openingBalance,
      },
    });
  }

  it("sums confirmed transactions onto the opening balance", async () => {
    const account = await makeAccount(15_000_000n); // 150,000.00
    await prisma.transaction.createMany({
      data: [
        { accountId: account.id, amount: -541_250n, occurredAt: new Date(), status: "confirmed" },
        { accountId: account.id, amount: 175_000n, occurredAt: new Date(), status: "confirmed" },
      ],
    });
    await recomputeBalance(account.id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(fresh.currentBalance).toBe(15_000_000n - 541_250n + 175_000n);
  });

  it("excludes pending_review transactions (spec: parsing never trusted blindly)", async () => {
    const account = await makeAccount(10_000_000n);
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        amount: -999_999n,
        occurredAt: new Date(),
        status: "pending_review",
      },
    });
    await recomputeBalance(account.id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(fresh.currentBalance).toBe(10_000_000n);
  });

  it("handles balances beyond 32-bit cents (mortgage-sized)", async () => {
    const account = await makeAccount(-2_500_000_000n); // owes 25M JMD
    await prisma.transaction.create({
      data: { accountId: account.id, amount: 4_500_000n, occurredAt: new Date(), status: "confirmed" },
    });
    await recomputeBalance(account.id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(fresh.currentBalance).toBe(-2_495_500_000n);
  });
});
