import { describe, it, expect } from "vitest";
import { resolvePeriod, parseMonthLabel, monthLabel } from "@/lib/period";

describe("resolvePeriod", () => {
  it("defaults to this-month with a half-open range", () => {
    const p = resolvePeriod(undefined);
    const now = new Date();
    expect(p.preset).toBe("this-month");
    expect(p.start.getDate()).toBe(1);
    expect(p.start.getMonth()).toBe(now.getMonth());
    expect(p.end.getTime()).toBeGreaterThan(p.start.getTime());
  });

  it("last-month ends exactly where this-month starts", () => {
    const last = resolvePeriod("last-month");
    const current = resolvePeriod("this-month");
    expect(last.end.getTime()).toBe(current.start.getTime());
  });

  it("this-year spans Jan 1 to next Jan 1 with 12 chart months", () => {
    const p = resolvePeriod("this-year");
    expect(p.start.getMonth()).toBe(0);
    expect(p.start.getDate()).toBe(1);
    expect(p.chartMonths).toBe(12);
  });

  it("falls back to this-month on junk input", () => {
    expect(resolvePeriod("nonsense").preset).toBe("this-month");
  });
});

describe("month labels", () => {
  it("round-trips label ↔ range", () => {
    const range = parseMonthLabel("2026-07")!;
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(6);
    expect(range.end.getMonth()).toBe(7);
    expect(monthLabel(range.start)).toBe("2026-07");
  });

  it("rejects malformed labels", () => {
    expect(parseMonthLabel("2026-13")).toBeNull();
    expect(parseMonthLabel("garbage")).toBeNull();
    expect(parseMonthLabel("2026-7")).toBeNull();
  });
});
