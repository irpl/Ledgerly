// Client-safe period presets for dashboards (§5.6 period selector).

export const PERIOD_PRESETS = ["this-month", "last-month", "this-year"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
};

export type PeriodRange = {
  preset: PeriodPreset;
  start: Date;
  end: Date; // exclusive
  /** How many monthly buckets the over-time chart should show. */
  chartMonths: number;
};

export function resolvePeriod(raw: string | undefined): PeriodRange {
  const preset: PeriodPreset = PERIOD_PRESETS.includes(raw as PeriodPreset)
    ? (raw as PeriodPreset)
    : "this-month";
  const now = new Date();
  if (preset === "last-month") {
    return {
      preset,
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
      chartMonths: 6,
    };
  }
  if (preset === "this-year") {
    return {
      preset,
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
      chartMonths: 12,
    };
  }
  return {
    preset,
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    chartMonths: 6,
  };
}

// ---------- Budget periods (§5.4, per-user anchor day) ----------

export const MIN_BUDGET_START_DAY = 1;
export const MAX_BUDGET_START_DAY = 31;
export const DEFAULT_BUDGET_START_DAY = 1;

export type BudgetPeriod = {
  /** Calendar month the period *starts* in, e.g. "2026-07" for 25 Jul – 24 Aug. */
  label: string;
  start: Date;
  end: Date; // exclusive
};

export function normalizeBudgetStartDay(day: number | null | undefined): number {
  if (typeof day !== "number" || !Number.isFinite(day)) return DEFAULT_BUDGET_START_DAY;
  const rounded = Math.round(day);
  if (rounded < MIN_BUDGET_START_DAY) return MIN_BUDGET_START_DAY;
  if (rounded > MAX_BUDGET_START_DAY) return MAX_BUDGET_START_DAY;
  return rounded;
}

/**
 * The anchor date in a given month, clamped to months that are too short —
 * day 31 becomes 30 in April and 28/29 in February. Clamping keeps anchors
 * strictly increasing month to month, so periods never gap or overlap.
 * `month` may be out of range (-1, 12); Date normalizes it.
 */
function anchorDate(year: number, month: number, day: number): Date {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, daysInMonth));
}

/** The budget period containing `ref` for a user whose period starts on `startDay`. */
export function resolveBudgetPeriod(
  startDay: number | null | undefined,
  ref: Date = new Date()
): BudgetPeriod {
  const day = normalizeBudgetStartDay(startDay);
  // Before this month's anchor, we're still inside the period that began last month.
  const month = ref < anchorDate(ref.getFullYear(), ref.getMonth(), day)
    ? ref.getMonth() - 1
    : ref.getMonth();
  return periodFromMonth(ref.getFullYear(), month, day);
}

function periodFromMonth(year: number, month: number, day: number): BudgetPeriod {
  const start = anchorDate(year, month, day);
  return {
    label: monthLabel(start),
    start,
    end: anchorDate(year, month + 1, day),
  };
}

/** Expand a "YYYY-MM" budget-period label into its real range, or null if malformed. */
export function parseBudgetPeriodLabel(
  label: string,
  startDay: number | null | undefined
): BudgetPeriod | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return periodFromMonth(parseInt(m[1], 10), month, normalizeBudgetStartDay(startDay));
}

/** Step a budget-period label forward/back by whole periods. */
export function shiftBudgetPeriod(label: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return label;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1 + delta, 1);
  return monthLabel(d);
}

/** "25 Jul – 24 Aug 2026" (end is exclusive, so show the last included day). */
export function formatBudgetPeriod(period: BudgetPeriod): string {
  // Calendar arithmetic, not minus-24h — the latter lands on the wrong day
  // across a DST fall-back.
  const { end } = period;
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const day = (d: Date) =>
    `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
  const sameYear = period.start.getFullYear() === lastDay.getFullYear();
  return sameYear
    ? `${day(period.start)} – ${day(lastDay)} ${lastDay.getFullYear()}`
    : `${day(period.start)} ${period.start.getFullYear()} – ${day(lastDay)} ${lastDay.getFullYear()}`;
}

export function monthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthLabel(label: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}
