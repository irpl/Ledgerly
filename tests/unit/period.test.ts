import { describe, it, expect } from "vitest";
import {
  resolvePeriod,
  parseMonthLabel,
  monthLabel,
  resolveBudgetPeriod,
  parseBudgetPeriodLabel,
  shiftBudgetPeriod,
  formatBudgetPeriod,
  normalizeBudgetStartDay,
} from "@/lib/period";

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

describe("budget periods (per-user anchor day)", () => {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  it("day 1 behaves exactly like a calendar month", () => {
    const p = parseBudgetPeriodLabel("2026-07", 1)!;
    const legacy = parseMonthLabel("2026-07")!;
    expect(p.start.getTime()).toBe(legacy.start.getTime());
    expect(p.end.getTime()).toBe(legacy.end.getTime());
  });

  it("anchors the period on the chosen day", () => {
    const p = parseBudgetPeriodLabel("2026-07", 25)!;
    expect(iso(p.start)).toBe("2026-07-25");
    expect(iso(p.end)).toBe("2026-08-25");
  });

  it("labels a period by the month it starts in", () => {
    // 20 Aug falls inside the period that began 25 Jul.
    expect(resolveBudgetPeriod(25, new Date(2026, 7, 20)).label).toBe("2026-07");
    // 25 Aug is the first day of the next one.
    expect(resolveBudgetPeriod(25, new Date(2026, 7, 25)).label).toBe("2026-08");
  });

  it("treats the anchor day itself as inside the new period, all day", () => {
    const early = resolveBudgetPeriod(25, new Date(2026, 7, 25, 0, 0));
    const late = resolveBudgetPeriod(25, new Date(2026, 7, 25, 23, 59));
    expect(early.label).toBe("2026-08");
    expect(late.label).toBe("2026-08");
  });

  it("clamps day 31 to short months without gapping or overlapping", () => {
    const jan = parseBudgetPeriodLabel("2026-01", 31)!;
    const feb = parseBudgetPeriodLabel("2026-02", 31)!;
    expect(iso(jan.start)).toBe("2026-01-31");
    expect(iso(feb.start)).toBe("2026-02-28"); // clamped
    expect(jan.end.getTime()).toBe(feb.start.getTime()); // no gap, no overlap
  });

  it("chains consecutive periods with no gaps for every anchor day", () => {
    for (const day of [1, 15, 28, 29, 30, 31]) {
      for (let m = 0; m < 12; m++) {
        const label = `2026-${String(m + 1).padStart(2, "0")}`;
        const current = parseBudgetPeriodLabel(label, day)!;
        const next = parseBudgetPeriodLabel(shiftBudgetPeriod(label, 1), day)!;
        expect(current.end.getTime()).toBe(next.start.getTime());
      }
    }
  });

  it("round-trips a resolved period through its own label", () => {
    const p = resolveBudgetPeriod(9, new Date(2026, 2, 3));
    const reparsed = parseBudgetPeriodLabel(p.label, 9)!;
    expect(reparsed.start.getTime()).toBe(p.start.getTime());
    expect(reparsed.end.getTime()).toBe(p.end.getTime());
  });

  it("formats the range with an inclusive last day", () => {
    const p = parseBudgetPeriodLabel("2026-07", 25)!;
    expect(formatBudgetPeriod(p)).toBe("25 Jul – 24 Aug 2026");
  });

  it("spells out the year on both sides when a period crosses new year", () => {
    const p = parseBudgetPeriodLabel("2026-12", 25)!;
    expect(formatBudgetPeriod(p)).toBe("25 Dec 2026 – 24 Jan 2027");
  });

  it("clamps out-of-range and junk start days to a usable value", () => {
    expect(normalizeBudgetStartDay(0)).toBe(1);
    expect(normalizeBudgetStartDay(99)).toBe(31);
    expect(normalizeBudgetStartDay(null)).toBe(1);
    expect(normalizeBudgetStartDay(undefined)).toBe(1);
    expect(normalizeBudgetStartDay(NaN)).toBe(1);
  });

  it("rejects malformed budget labels", () => {
    expect(parseBudgetPeriodLabel("2026-13", 25)).toBeNull();
    expect(parseBudgetPeriodLabel("garbage", 25)).toBeNull();
  });
});
