import { describe, it, expect } from "vitest";
import { normalizedMonthly, OCCURRENCES_PER_YEAR, FREQUENCIES } from "@/lib/budget-shared";

describe("normalizedMonthly (true 12-month calendar, spec §5.4)", () => {
  it("matches the spec's annual example: 65,000/yr ≈ 5,416.67/mo", () => {
    expect(normalizedMonthly(6_500_000, "annual")).toBe(541_667);
  });

  it("matches the spec's monthly example: 150,000/mo stays 150,000", () => {
    expect(normalizedMonthly(15_000_000, "monthly")).toBe(15_000_000);
  });

  it("annualizes weekly by 52", () => {
    // 1,000 weekly → 52,000/yr → 4,333.33/mo
    expect(normalizedMonthly(100_000, "weekly")).toBe(433_333);
  });

  it("annualizes biweekly by 26", () => {
    expect(normalizedMonthly(100_000, "biweekly")).toBe(Math.round((100_000 * 26) / 12));
  });

  it("has the full spec frequency table", () => {
    expect(OCCURRENCES_PER_YEAR).toEqual({
      weekly: 52,
      biweekly: 26,
      monthly: 12,
      bimonthly: 6,
      quarterly: 4,
      semiannual: 2,
      annual: 1,
    });
    expect(FREQUENCIES).toHaveLength(7);
  });
});
