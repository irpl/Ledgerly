// Client-safe category types and constants.

export const CATEGORY_KINDS = ["expense", "income", "both"] as const;
export type CategoryKindValue = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_KIND_LABELS: Record<CategoryKindValue, string> = {
  expense: "Expense",
  income: "Income",
  both: "Both",
};

export type CategoryDTO = {
  id: string;
  name: string;
  kind: CategoryKindValue;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  transactionCount?: number;
};

/** Preset palette tuned for the dark surface. */
export const CATEGORY_COLORS = [
  "#3b82f6", // blue
  "#059669", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#64748b", // slate
] as const;
