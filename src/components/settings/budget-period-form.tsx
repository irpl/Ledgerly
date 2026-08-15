"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_BUDGET_START_DAY,
  MIN_BUDGET_START_DAY,
  formatBudgetPeriod,
  resolveBudgetPeriod,
} from "@/lib/period";

const DAYS = Array.from(
  { length: MAX_BUDGET_START_DAY - MIN_BUDGET_START_DAY + 1 },
  (_, i) => i + MIN_BUDGET_START_DAY
);

function ordinal(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${day}${suffix}`;
}

export function BudgetPeriodForm({ initialStartDay }: { initialStartDay: number }) {
  const router = useRouter();
  const [startDay, setStartDay] = useState(initialStartDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Preview the period the chosen day produces right now, before saving.
  const preview = formatBudgetPeriod(resolveBudgetPeriod(startDay));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetStartDay: startDay }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save budget period.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-lg space-y-4">
      <div>
        <label className="label" htmlFor="budget-start-day">
          Period starts on day
        </label>
        <select
          id="budget-start-day"
          className="input"
          value={startDay}
          onChange={(e) => setStartDay(Number(e.target.value))}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {ordinal(d)}
              {d === 1 ? " (calendar month)" : ""}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted">
          Current period:{" "}
          <span className="amount text-secondary">{preview}</span>
        </p>
        {startDay > 28 && (
          <p className="mt-1 text-xs text-muted">
            Months without a {ordinal(startDay)} start on their last day instead.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-secondary">Saved.</p>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save budget period"}
      </button>
    </form>
  );
}
