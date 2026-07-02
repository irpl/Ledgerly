"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { AccountDTO } from "@/lib/account-shared";

function nowLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function TransferForm({
  accounts,
  initialFromId,
  initialToId,
}: {
  accounts: AccountDTO[];
  initialFromId?: string;
  initialToId?: string;
}) {
  const router = useRouter();
  const initial = nowLocal();

  const [fromAccountId, setFromAccountId] = useState(
    initialFromId ?? accounts.find((a) => a.id !== initialToId)?.id ?? ""
  );
  const [toAccountId, setToAccountId] = useState(
    initialToId ?? accounts.find((a) => a.id !== (initialFromId ?? accounts[0]?.id))?.id ?? ""
  );
  const [amountStr, setAmountStr] = useState("");
  const [toAmountStr, setToAmountStr] = useState("");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const from = accounts.find((a) => a.id === fromAccountId);
  const to = accounts.find((a) => a.id === toAccountId);
  const crossCurrency = !!from && !!to && from.currency !== to.currency;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(amountStr);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (fromAccountId === toAccountId) {
      setError("Source and destination must differ.");
      return;
    }
    let toAmount: number | null = null;
    if (crossCurrency) {
      toAmount = parseFloat(toAmountStr);
      if (Number.isNaN(toAmount) || toAmount <= 0) {
        setError(`Enter the amount received in ${to?.currency}.`);
        return;
      }
    }
    setSaving(true);
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAccountId,
        toAccountId,
        amount,
        toAmount,
        occurredAt: `${date}T${time}:00`,
        description: description || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.push("/transactions");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <label htmlFor="tf-from" className="label">
            From
          </label>
          <select
            id="tf-from"
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="input"
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </div>
        <ArrowRight size={18} className="mb-2.5 text-muted" aria-hidden />
        <div>
          <label htmlFor="tf-to" className="label">
            To
          </label>
          <select
            id="tf-to"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="input"
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tf-amount" className="label">
            Amount{from ? ` (${from.currency})` : ""}
          </label>
          <input
            id="tf-amount"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            required
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="input amount"
            placeholder="0.00"
          />
        </div>
        {crossCurrency && (
          <div>
            <label htmlFor="tf-to-amount" className="label">
              Received ({to?.currency})
            </label>
            <input
              id="tf-to-amount"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              required
              value={toAmountStr}
              onChange={(e) => setToAmountStr(e.target.value)}
              className="input amount"
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tf-date" className="label">
            Date
          </label>
          <input
            id="tf-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="tf-time" className="label">
            Time
          </label>
          <input
            id="tf-time"
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="tf-description" className="label">
          Description
        </label>
        <input
          id="tf-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          placeholder="e.g. Credit card payment"
        />
      </div>

      <p className="text-xs text-muted">
        A transfer records two linked entries — money out of the source and into the
        destination — and is excluded from income/expense totals.
      </p>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-5">
          {saving ? "Saving…" : "Transfer"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost px-5">
          Cancel
        </button>
      </div>
    </form>
  );
}
