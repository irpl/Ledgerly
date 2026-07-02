// Chart color system — validated with the dataviz skill's palette validator
// against the app's dark card surface (#101a34). Do not eyeball changes;
// re-run scripts/validate_palette.js when touching these.

/** Categorical slots (identity). Fixed order = the CVD-safety mechanism; never cycle. */
export const CATEGORICAL_SLOTS = [
  "#3987e5", // blue
  "#199e70", // aqua
  "#c98500", // yellow
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
  "#d55181", // magenta
  "#d95926", // orange
] as const;

/** Fold-tail color for "Other". Neutral by design; direct labels carry identity. */
export const OTHER_COLOR = "#64748b";

/** Income/expense pair — passes lightness band, CVD ΔE 23.0, contrast ≥3:1. */
export const INCOME_COLOR = "#059669";
export const EXPENSE_COLOR = "#dc2626";

/** Single-series line/area (running balance). */
export const LINE_COLOR = "#3987e5";

/** Over-budget marker (status critical; always paired with a label). */
export const CRITICAL_COLOR = "#d03b3b";

/** Chart chrome. */
export const GRID_COLOR = "rgba(255,255,255,0.08)";
export const AXIS_TEXT_COLOR = "#8ba0bf";
export const TOOLTIP_BG = "#16223f";
export const SURFACE_COLOR = "#101a34";
