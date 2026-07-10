import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, createTestUser } from "../helpers/db";
import { ingestInboundEmail, resolveInboundUser, normalizeAddress } from "@/lib/inbound-email";
import { createDefaultCategories } from "@/lib/default-categories";

describe("normalizeAddress", () => {
  it("extracts and lowercases bare addresses", () => {
    expect(normalizeAddress("Jane Doe <Jane@Example.COM>")).toBe("jane@example.com");
    expect(normalizeAddress("  a@b.co  ")).toBe("a@b.co");
    expect(normalizeAddress("not-an-address")).toBeNull();
    expect(normalizeAddress(null)).toBeNull();
  });
});

describe("resolveInboundUser (per-user email routing)", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("routes by inboundKey local-part", async () => {
    const user = await createTestUser();
    const resolved = await resolveInboundUser(`${user.inboundKey}@ledger.example.com`, "bank@bank.com");
    expect(resolved).toBe(user.id);
  });

  it("routes by plus-tag", async () => {
    const user = await createTestUser();
    const resolved = await resolveInboundUser(
      `bank+${user.inboundKey}@ledger.example.com`,
      "bank@bank.com"
    );
    expect(resolved).toBe(user.id);
  });

  it("falls back to a registered forward-from address", async () => {
    const user = await createTestUser();
    await prisma.forwardAddress.create({
      data: { userId: user.id, address: "jan@gmail.com" },
    });
    const resolved = await resolveInboundUser("bank@ledger.example.com", "Jan B <Jan@Gmail.com>");
    expect(resolved).toBe(user.id);
  });

  it("prefers the recipient key over the sender mapping", async () => {
    const keyed = await createTestUser();
    const forwarded = await createTestUser();
    await prisma.forwardAddress.create({
      data: { userId: forwarded.id, address: "jan@gmail.com" },
    });
    const resolved = await resolveInboundUser(
      `${keyed.inboundKey}@ledger.example.com`,
      "jan@gmail.com"
    );
    expect(resolved).toBe(keyed.id);
  });

  it("returns null when nothing matches", async () => {
    await createTestUser();
    const resolved = await resolveInboundUser("bank@ledger.example.com", "stranger@example.com");
    expect(resolved).toBeNull();
  });
});

describe("ingestInboundEmail routing", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("stores the routed owner and recipient on the RawEmail", async () => {
    const user = await createTestUser();
    const { id } = await ingestInboundEmail({
      from: "alerts@bank.com",
      to: `${user.inboundKey}@ledger.example.com`,
      subject: "Alert",
      text: "hello",
    });
    const email = await prisma.rawEmail.findUniqueOrThrow({ where: { id } });
    expect(email.userId).toBe(user.id);
    expect(email.toAddress).toBe(`${user.inboundKey}@ledger.example.com`);
  });

  it("leaves unmatched emails unrouted and unparsed", async () => {
    await createTestUser();
    const { id, outcome } = await ingestInboundEmail({
      from: "stranger@example.com",
      to: "bank@ledger.example.com",
      subject: "Alert",
      text: "hello",
    });
    expect(outcome.status).toBe("unparsed");
    const email = await prisma.rawEmail.findUniqueOrThrow({ where: { id } });
    expect(email.userId).toBeNull();
  });
});

describe("createDefaultCategories", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("clones the default set per user, including Transfer", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await createDefaultCategories(prisma, a.id);
    await createDefaultCategories(prisma, b.id);

    const aCats = await prisma.category.findMany({ where: { userId: a.id } });
    const bCats = await prisma.category.findMany({ where: { userId: b.id } });
    expect(aCats.length).toBeGreaterThan(10);
    expect(aCats.length).toBe(bCats.length);
    expect(aCats.some((c) => c.name === "Transfer" && c.kind === "both")).toBe(true);
    expect(aCats.every((c) => c.isDefault)).toBe(true);
  });

  it("is idempotent (skipDuplicates)", async () => {
    const a = await createTestUser();
    await createDefaultCategories(prisma, a.id);
    const first = await prisma.category.count({ where: { userId: a.id } });
    await createDefaultCategories(prisma, a.id);
    const second = await prisma.category.count({ where: { userId: a.id } });
    expect(second).toBe(first);
  });
});
