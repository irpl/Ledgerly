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
