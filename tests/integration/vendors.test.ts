import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "../helpers/db";
import { upsertVendor } from "@/lib/transactions";

describe("upsertVendor (autocomplete memory, spec §4 Vendor)", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("is case-insensitively unique and bumps usage", async () => {
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "Hi-Lo", null);
    });
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "HI-LO", null);
    });
    const vendors = await prisma.vendor.findMany();
    expect(vendors).toHaveLength(1);
    expect(vendors[0].usageCount).toBe(2);
    expect(vendors[0].name).toBe("Hi-Lo"); // first-seen casing kept
  });

  it("remembers the most recent category", async () => {
    const food = await prisma.category.create({ data: { name: "Food", kind: "expense" } });
    const misc = await prisma.category.create({ data: { name: "Misc", kind: "expense" } });
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "Hi-Lo", food.id);
    });
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "hi-lo", misc.id);
    });
    const vendor = await prisma.vendor.findFirstOrThrow();
    expect(vendor.defaultCategoryId).toBe(misc.id);
  });

  it("keeps the remembered category when a later save has none", async () => {
    const food = await prisma.category.create({ data: { name: "Food", kind: "expense" } });
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "Hi-Lo", food.id);
    });
    await prisma.$transaction(async (tx) => {
      await upsertVendor(tx, "Hi-Lo", null);
    });
    const vendor = await prisma.vendor.findFirstOrThrow();
    expect(vendor.defaultCategoryId).toBe(food.id);
  });

  it("returns null for blank names", async () => {
    const id = await prisma.$transaction((tx) => upsertVendor(tx, "   ", null));
    expect(id).toBeNull();
    expect(await prisma.vendor.count()).toBe(0);
  });
});
