import { LINE_COLOR, CRITICAL_COLOR } from "@/lib/chart-colors";
import { formatMoney } from "@/lib/money";
import type { BudgetActualRow } from "@/lib/analytics";

/**
 * Budget vs actual as meters (a ratio against a limit → meter, not a pie).
 * Nominal rows share one hue; over-budget switches to the status color and
 * is always paired with a text label, never color alone.
 */
export function BudgetActualMeters({
  rows,
  currency,
}: {
  rows: BudgetActualRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing to compare for this month — add budget lines or record expenses.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const over = row.budgeted > 0 && row.spent > row.budgeted;
        const noBudget = row.budgeted === 0;
        const pct = noBudget ? 100 : Math.min(100, (row.spent / row.budgeted) * 100);
        return (
          <li key={row.categoryId}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm font-medium truncate">{row.name}</span>
              <span className="text-xs text-muted amount shrink-0">
                {formatMoney(row.spent, currency)}
                {" of "}
                {noBudget ? "no budget" : formatMoney(row.budgeted, currency)}
                {over && (
                  <span className="ml-2 font-semibold" style={{ color: CRITICAL_COLOR }}>
                    over by {formatMoney(row.spent - row.budgeted, currency)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: over || noBudget ? CRITICAL_COLOR : LINE_COLOR,
                  opacity: noBudget ? 0.5 : 1,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
