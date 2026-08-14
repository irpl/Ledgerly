import { LINE_COLOR, CRITICAL_COLOR } from "@/lib/chart-colors";
import { formatMoney } from "@/lib/money";
import type { BudgetActualRow } from "@/lib/analytics";

/**
 * Budget vs actual as a table, one row per category. The used/limit ratio still
 * reads as a meter (a ratio against a limit → meter, not a pie), but it lives in
 * its own column so the money columns stay scannable. Nominal rows share one
 * hue; over-budget switches to the status color and is always paired with a text
 * label, never color alone.
 */
export function BudgetActualTable({
  rows,
  currency,
}: {
  rows: BudgetActualRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted">
        Nothing to compare for this month — add budget lines or record expenses.
      </p>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({ budgeted: acc.budgeted + r.budgeted, spent: acc.spent + r.spent }),
    { budgeted: 0, spent: 0 }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
            <th className="p-3 font-semibold">Category</th>
            <th className="p-3 font-semibold text-right whitespace-nowrap">
              Budgeted ({currency})
            </th>
            <th className="p-3 font-semibold text-right whitespace-nowrap">Spent ({currency})</th>
            <th className="p-3 font-semibold text-right whitespace-nowrap">Left ({currency})</th>
            <th className="p-3 font-semibold w-40">Used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => {
            const over = row.budgeted > 0 && row.spent > row.budgeted;
            const noBudget = row.budgeted === 0;
            const pct = noBudget ? 100 : Math.min(100, (row.spent / row.budgeted) * 100);
            const remaining = row.budgeted - row.spent;
            return (
              <tr
                key={row.categoryId}
                className="hover:bg-surface-raised transition-colors duration-150"
              >
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-right amount whitespace-nowrap">
                  {noBudget ? (
                    <span className="text-muted">no budget</span>
                  ) : (
                    formatMoney(row.budgeted, currency, { code: false })
                  )}
                </td>
                <td className="p-3 text-right amount whitespace-nowrap">
                  {formatMoney(row.spent, currency, { code: false })}
                </td>
                <td className="p-3 text-right amount whitespace-nowrap">
                  {noBudget ? (
                    <span className="text-muted">—</span>
                  ) : over ? (
                    <span style={{ color: CRITICAL_COLOR }}>
                      over by {formatMoney(-remaining, currency, { code: false })}
                    </span>
                  ) : (
                    formatMoney(remaining, currency, { code: false })
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-surface-raised overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: over || noBudget ? CRITICAL_COLOR : LINE_COLOR,
                          opacity: noBudget ? 0.5 : 1,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted amount w-10 text-right shrink-0">
                      {noBudget ? "—" : `${Math.round((row.spent / row.budgeted) * 100)}%`}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-subtle">
            <td className="p-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Total
            </td>
            <td className="p-3 text-right font-semibold amount whitespace-nowrap">
              {formatMoney(totals.budgeted, currency, { code: false })}
            </td>
            <td className="p-3 text-right font-semibold amount whitespace-nowrap">
              {formatMoney(totals.spent, currency, { code: false })}
            </td>
            <td className="p-3 text-right font-semibold amount whitespace-nowrap">
              {formatMoney(totals.budgeted - totals.spent, currency, { code: false })}
            </td>
            <td className="p-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
