"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  INCOME_COLOR,
  EXPENSE_COLOR,
  GRID_COLOR,
  AXIS_TEXT_COLOR,
  TOOLTIP_BG,
} from "@/lib/chart-colors";
import { minorToMajor } from "@/lib/money";
import type { MonthlyIncomeExpense } from "@/lib/analytics";

function compactMoney(value: number): string {
  return new Intl.NumberFormat("en-JM", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: MonthlyIncomeExpense[];
  currency: string;
}) {
  const chartData = data.map((d) => ({
    month: d.month.slice(2), // "26-07"
    Income: minorToMajor(d.income),
    Expenses: minorToMajor(d.expense),
  }));

  return (
    <div className="h-64" role="img" aria-label={`Income vs expenses per month (${currency})`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: AXIS_TEXT_COLOR, fontSize: 11 }}
            tickFormatter={compactMoney}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
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
          <Legend
            wrapperStyle={{ fontSize: 12, color: AXIS_TEXT_COLOR }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
