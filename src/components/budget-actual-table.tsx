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
    <>
      <MobileList rows={rows} totals={totals} currency={currency} />
      <div className="hidden lg:block overflow-x-auto">
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
    </>
  );
}

/**
 * Phone layout: five columns don't fit at 375px, so each category becomes a
 * stacked row — name and % on top, the meter full width, then spent-of-budget
 * and what's left underneath. Same colors and over-budget wording as the table.
 */
function MobileList({
  rows,
  totals,
  currency,
}: {
  rows: BudgetActualRow[];
  totals: { budgeted: number; spent: number };
  currency: string;
}) {
  const money = (minor: number) => formatMoney(minor, currency, { code: false });
  const totalLeft = totals.budgeted - totals.spent;

  return (
    <div className="lg:hidden">
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => {
          const over = row.budgeted > 0 && row.spent > row.budgeted;
          const noBudget = row.budgeted === 0;
          const pct = noBudget ? 100 : Math.min(100, (row.spent / row.budgeted) * 100);
          const remaining = row.budgeted - row.spent;
          return (
            <li key={row.categoryId} className="p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium truncate">{row.name}</span>
                <span className="text-xs text-muted amount shrink-0">
                  {noBudget ? "no budget" : `${Math.round((row.spent / row.budgeted) * 100)}%`}
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
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted">
                  <span className="amount text-foreground">{money(row.spent)}</span>
                  {!noBudget && <> of <span className="amount">{money(row.budgeted)}</span></>}
                </span>
                {!noBudget && (
                  <span className="amount shrink-0">
                    {over ? (
                      <span style={{ color: CRITICAL_COLOR }}>over by {money(-remaining)}</span>
                    ) : (
                      <>
                        {money(remaining)} <span className="text-muted">left</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border-subtle p-4 space-y-1 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total</span>
          <span className="amount font-semibold">
            {money(totals.spent)} <span className="text-muted font-normal">of</span>{" "}
            {money(totals.budgeted)}
          </span>
        </div>
        <div className="text-right text-xs amount">
          {totalLeft < 0 ? (
            <span style={{ color: CRITICAL_COLOR }}>over by {money(-totalLeft)}</span>
          ) : (
            <>
              {money(totalLeft)} <span className="text-muted">left</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
