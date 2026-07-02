"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import type { AccountDTO } from "@/lib/account-shared";
import type { CategoryDTO } from "@/lib/category-shared";
import type {
  BudgetLineDTO,
  IncomePlanDTO,
  FrequencyValue,
  PaymentMethodValue,
} from "@/lib/budget-shared";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  PAYMENT_METHODS,
  normalizedMonthly,
} from "@/lib/budget-shared";
import { formatMoney, minorToMajor, majorToMinor } from "@/lib/money";

type LineFormValues = {
  name: string;
  categoryId: string;
  amountStr: string;
  frequency: FrequencyValue;
  paymentMethod: PaymentMethodValue;
  fundingAccountId: string;
};

function LineForm({
  categories,
  accounts,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  initial: LineFormValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: LineFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<LineFormValues>(initial);
  const set = <K extends keyof LineFormValues>(key: K, value: LineFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const amount = parseFloat(values.amountStr);
  const currency =
    accounts.find((a) => a.id === values.fundingAccountId)?.currency ?? "JMD";
  const monthlyPreview =
    !Number.isNaN(amount) && amount > 0
      ? normalizedMonthly(majorToMinor(amount), values.frequency)
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="grid grid-cols-2 md:grid-cols-3 gap-3"
    >
      <div className="col-span-2 md:col-span-1">
        <label className="label">Name</label>
        <input
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          className="input"
          placeholder="e.g. Rent, Netflix"
        />
      </div>
      <div>
        <label className="label">Category</label>
        <select
          required
          value={values.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          className="input"
        >
          <option value="" disabled>
            Pick…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Amount</label>
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          value={values.amountStr}
          onChange={(e) => set("amountStr", e.target.value)}
          className="input amount"
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="label">Frequency</label>
        <select
          value={values.frequency}
          onChange={(e) => set("frequency", e.target.value as FrequencyValue)}
          className="input"
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Paid by</label>
        <select
          value={values.paymentMethod}
          onChange={(e) => set("paymentMethod", e.target.value as PaymentMethodValue)}
          className="input"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m === "cash" ? "Cash" : "Credit"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Funding account</label>
        <select
          required
          value={values.fundingAccountId}
          onChange={(e) => set("fundingAccountId", e.target.value)}
          className="input"
        >
          <option value="" disabled>
            Pick…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 md:col-span-3 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
        {monthlyPreview !== null && (
          <span className="text-sm text-muted">
            ≈ <span className="amount">{formatMoney(monthlyPreview, currency)}</span>/mo
          </span>
        )}
      </div>
    </form>
  );
}

function BudgetLineRow({
  line,
  categories,
  accounts,
  onChanged,
}: {
  line: BudgetLineDTO;
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(values: LineFormValues) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/budget-lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        categoryId: values.categoryId,
        amount: parseFloat(values.amountStr),
        frequency: values.frequency,
        paymentMethod: values.paymentMethod,
        fundingAccountId: values.fundingAccountId,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to save.");
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function toggleActive() {
    setBusy(true);
    await fetch(`/api/budget-lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !line.active }),
    });
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Delete budget line "${line.name}"?`)) return;
    setBusy(true);
    const res = await fetch(`/api/budget-lines/${line.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
  }

  if (editing) {
    return (
      <li className="p-4 space-y-2">
        <LineForm
          categories={categories}
          accounts={accounts}
          initial={{
            name: line.name,
            categoryId: line.categoryId,
            amountStr: String(minorToMajor(line.amount)),
            frequency: line.frequency,
            paymentMethod: line.paymentMethod,
            fundingAccountId: line.fundingAccountId,
          }}
          submitLabel="Save"
          busy={busy}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
        {error && <p className="text-sm text-negative">{error}</p>}
      </li>
    );
  }

  return (
    <li className={`flex items-center justify-between gap-3 p-3 ${line.active ? "" : "opacity-50"}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {line.name}
          {!line.active && (
            <span className="ml-2 text-xs rounded bg-surface-raised px-1.5 py-0.5 text-muted">
              paused
            </span>
          )}
        </div>
        <div className="text-xs text-muted truncate">
          {line.categoryName} · {FREQUENCY_LABELS[line.frequency]} ·{" "}
          {line.paymentMethod === "cash" ? "Cash" : "Credit"} · {line.fundingAccountName}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className="text-sm font-semibold amount">
            {formatMoney(line.normalizedMonthly, line.fundingAccountCurrency)}/mo
          </div>
          <div className="text-xs text-muted amount">
            {formatMoney(line.amount, line.fundingAccountCurrency)}{" "}
            {FREQUENCY_LABELS[line.frequency].toLowerCase()}
          </div>
        </div>
        <button
          onClick={toggleActive}
          disabled={busy}
          className="btn-ghost px-2.5! py-1.5! text-xs"
        >
          {line.active ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="btn-ghost p-2!"
          aria-label={`Edit ${line.name}`}
        >
          <Pencil size={15} aria-hidden />
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="btn-danger p-2!"
          aria-label={`Delete ${line.name}`}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

function IncomeRow({ item, onChanged }: { item: IncomePlanDTO; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [amountStr, setAmountStr] = useState(String(minorToMajor(item.monthlyAmount)));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/income-plan/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, monthlyAmount: parseFloat(amountStr) }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      onChanged();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete income "${item.label}"?`)) return;
    setBusy(true);
    const res = await fetch(`/api/income-plan/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
  }

  if (editing) {
    return (
      <li className="p-3">
        <form onSubmit={save} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Label</label>
            <input required value={label} onChange={(e) => setLabel(e.target.value)} className="input" />
          </div>
          <div className="w-40">
            <label className="label">Monthly</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="input amount"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <span className="text-sm font-medium">{item.label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold amount amount-positive">
          {formatMoney(item.monthlyAmount, "JMD")}/mo
        </span>
        <button
          onClick={() => setEditing(true)}
          className="btn-ghost p-2!"
          aria-label={`Edit ${item.label}`}
        >
          <Pencil size={15} aria-hidden />
        </button>
        <button onClick={remove} disabled={busy} className="btn-danger p-2!" aria-label={`Delete ${item.label}`}>
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function BudgetManager({
  budgetLines,
  incomePlan,
  categories,
  accounts,
}: {
  budgetLines: BudgetLineDTO[];
  incomePlan: IncomePlanDTO[];
  categories: CategoryDTO[];
  accounts: AccountDTO[];
}) {
  const router = useRouter();
  const [showLineForm, setShowLineForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomeLabel, setIncomeLabel] = useState("");
  const [incomeAmountStr, setIncomeAmountStr] = useState("");

  const refresh = () => router.refresh();

  async function createLine(values: LineFormValues) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        categoryId: values.categoryId,
        amount: parseFloat(values.amountStr),
        frequency: values.frequency,
        paymentMethod: values.paymentMethod,
        fundingAccountId: values.fundingAccountId,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to create.");
      return;
    }
    setShowLineForm(false);
    refresh();
  }

  async function createIncome(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/income-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: incomeLabel, monthlyAmount: parseFloat(incomeAmountStr) }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to create.");
      return;
    }
    setIncomeLabel("");
    setIncomeAmountStr("");
    setShowIncomeForm(false);
    refresh();
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
            Budget lines
          </h2>
          <button onClick={() => setShowLineForm((s) => !s)} className="btn-primary">
            <Plus size={16} aria-hidden />
            Budget line
          </button>
        </div>

        {showLineForm && (
          <div className="card mb-4">
            <LineForm
              categories={categories}
              accounts={accounts}
              initial={{
                name: "",
                categoryId: categories[0]?.id ?? "",
                amountStr: "",
                frequency: "monthly",
                paymentMethod: "cash",
                fundingAccountId: accounts[0]?.id ?? "",
              }}
              submitLabel="Add line"
              busy={busy}
              onSubmit={createLine}
              onCancel={() => setShowLineForm(false)}
            />
            {error && <p className="mt-2 text-sm text-negative">{error}</p>}
          </div>
        )}

        {budgetLines.length === 0 ? (
          <p className="text-muted text-sm">
            No budget lines yet — add your recurring planned expenses.
          </p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {budgetLines.map((line) => (
              <BudgetLineRow
                key={line.id}
                line={line}
                categories={categories}
                accounts={accounts}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
            Planned income
          </h2>
          <button onClick={() => setShowIncomeForm((s) => !s)} className="btn-primary">
            <Plus size={16} aria-hidden />
            Income
          </button>
        </div>

        {showIncomeForm && (
          <form onSubmit={createIncome} className="card mb-4 flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="income-label" className="label">
                Label
              </label>
              <input
                id="income-label"
                required
                value={incomeLabel}
                onChange={(e) => setIncomeLabel(e.target.value)}
                className="input"
                placeholder="e.g. Salary"
              />
            </div>
            <div className="w-40">
              <label htmlFor="income-amount" className="label">
                Monthly
              </label>
              <input
                id="income-amount"
                required
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={incomeAmountStr}
                onChange={(e) => setIncomeAmountStr(e.target.value)}
                className="input amount"
                placeholder="0.00"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary">
              Add
            </button>
            <button type="button" onClick={() => setShowIncomeForm(false)} className="btn-ghost">
              Cancel
            </button>
          </form>
        )}

        {incomePlan.length === 0 ? (
          <p className="text-muted text-sm">
            No planned income yet — add salary and other regular income.
          </p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {incomePlan.map((item) => (
              <IncomeRow key={item.id} item={item} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
