"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  CATEGORICAL_SLOTS,
  OTHER_COLOR,
  GRID_COLOR,
  TOOLTIP_BG,
  SURFACE_COLOR,
} from "@/lib/chart-colors";
import { minorToMajor, formatMoney } from "@/lib/money";
import type { CategorySpend } from "@/lib/analytics";

const MAX_SLICES = 7; // ≤8 classes total incl. "Other"; never generate more hues

export function CategoryDonut({
  data,
  currency,
}: {
  data: CategorySpend[];
  currency: string;
}) {
  const top = data.slice(0, MAX_SLICES);
  const tail = data.slice(MAX_SLICES);
  const otherTotal = tail.reduce((sum, d) => sum + d.spent, 0);

  // Slots are assigned in a stable order (alphabetical by name), not by rank,
  // so a category keeps its hue as spend changes.
  const alphabetical = [...top].sort((a, b) => a.name.localeCompare(b.name));
  const slotByKey = new Map(alphabetical.map((d, i) => [d.categoryId ?? d.name, i]));

  const slices = [
    ...alphabetical.map((d) => ({
      name: d.name,
      value: minorToMajor(d.spent),
      minor: d.spent,
      color: CATEGORICAL_SLOTS[slotByKey.get(d.categoryId ?? d.name) ?? 0],
    })),
    ...(otherTotal > 0
      ? [{ name: "Other", value: minorToMajor(otherTotal), minor: otherTotal, color: OTHER_COLOR }]
      : []),
  ];
  const total = slices.reduce((sum, s) => sum + s.minor, 0);

  if (slices.length === 0) {
    return <p className="text-sm text-muted">No spending in this period.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-44 w-44 shrink-0" role="img" aria-label={`Spending by category (${currency})`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="95%"
              paddingAngle={1}
              stroke={SURFACE_COLOR}
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: TOOLTIP_BG,
                border: `1px solid ${GRID_COLOR}`,
                borderRadius: 8,
                color: "#f1f5f9",
                fontSize: 12,
              }}
              formatter={(value) =>
                new Intl.NumberFormat("en-JM", {
                  style: "currency",
                  currency,
                  currencyDisplay: "narrowSymbol",
                }).format(Number(value ?? 0))
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Direct labels: the CVD-relief channel — every slice named with its value. */}
      <ul className="w-full space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="amount text-muted shrink-0">
              {formatMoney(s.minor, currency)}
              <span className="ml-1.5 text-xs">
                {total > 0 ? `${Math.round((s.minor / total) * 100)}%` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
