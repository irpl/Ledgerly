"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LINE_COLOR, GRID_COLOR, AXIS_TEXT_COLOR, TOOLTIP_BG } from "@/lib/chart-colors";
import { minorToMajor } from "@/lib/money";
import type { BalancePoint } from "@/lib/analytics";

function compactMoney(value: number): string {
  return new Intl.NumberFormat("en-JM", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export function RunningBalanceChart({
  data,
  currency,
}: {
  data: BalancePoint[];
  currency: string;
}) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5), // "MM-DD"
    Balance: minorToMajor(d.balance),
  }));

  return (
    <div className="h-56" role="img" aria-label={`Running balance, last ${data.length} days (${currency})`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }}
            tickFormatter={compactMoney}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: GRID_COLOR }}
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
          <Area
            type="monotone"
            dataKey="Balance"
            stroke={LINE_COLOR}
            strokeWidth={2}
            fill="url(#balanceFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
