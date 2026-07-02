"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AccountDTO } from "@/lib/account-shared";
import type { CategoryDTO } from "@/lib/category-shared";
import type { TransactionDTO, VendorSuggestion } from "@/lib/transaction-shared";
import { minorToMajor } from "@/lib/money";

type Direction = "out" | "in";

function toLocalDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransactionForm({
  accounts,
  categories,
  transaction,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  transaction?: TransactionDTO;
}) {
  const router = useRouter();
  const isEdit = !!transaction;

  const [direction, setDirection] = useState<Direction>(
    transaction ? (transaction.amount < 0 ? "out" : "in") : "out"
  );
  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts[0]?.id ?? "");
  const [amountStr, setAmountStr] = useState(
    transaction ? String(Math.abs(minorToMajor(transaction.amount))) : ""
  );
  const [date, setDate] = useState(toLocalDate(transaction?.occurredAt));
  const [time, setTime] = useState(toLocalTime(transaction?.occurredAt));
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [vendorName, setVendorName] = useState(transaction?.vendorName ?? "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [notes, setNotes] = useState(transaction?.notes ?? "");

  const [suggestions, setSuggestions] = useState<VendorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleCategories = categories.filter((c) =>
    direction === "out" ? c.kind !== "income" : c.kind !== "expense"
  );

  // Debounced vendor lookup for autocomplete.
  function onVendorChange(value: string) {
    setVendorName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/vendors?q=${encodeURIComponent(value.trim())}`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.vendors ?? []);
      setShowSuggestions(true);
    }, 200);
  }

  function pickVendor(v: VendorSuggestion) {
    setVendorName(v.name);
    setShowSuggestions(false);
    // Remembered category fills in only if none chosen yet.
    if (!categoryId && v.defaultCategoryId) {
      const stillVisible = visibleCategories.some((c) => c.id === v.defaultCategoryId);
      if (stillVisible) setCategoryId(v.defaultCategoryId);
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!suggestionsRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(amountStr);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (!accountId) {
      setError("Pick an account.");
      return;
    }
    setSaving(true);
    const res = await fetch(isEdit ? `/api/transactions/${transaction.id}` : "/api/transactions", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amount,
        direction,
        occurredAt: `${date}T${time}:00`,
        categoryId: categoryId || null,
        vendorName: vendorName || null,
        description: description || null,
        notes: notes || null,
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

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
        <button
          type="button"
          role="radio"
          aria-checked={direction === "out"}
          onClick={() => setDirection("out")}
          className={`btn justify-center border ${
            direction === "out"
              ? "border-destructive/60 bg-destructive/15 text-negative"
              : "border-border-strong text-muted hover:bg-surface-raised"
          }`}
        >
          <ArrowUpRight size={16} aria-hidden />
          Money out
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={direction === "in"}
          onClick={() => setDirection("in")}
          className={`btn justify-center border ${
            direction === "in"
              ? "border-accent/60 bg-accent/15 text-positive"
              : "border-border-strong text-muted hover:bg-surface-raised"
          }`}
        >
          <ArrowDownLeft size={16} aria-hidden />
          Money in
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="txn-account" className="label">
            Account
          </label>
          <select
            id="txn-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
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
        <div>
          <label htmlFor="txn-amount" className="label">
            Amount{selectedAccount ? ` (${selectedAccount.currency})` : ""}
          </label>
          <input
            id="txn-amount"
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="txn-date" className="label">
            Date
          </label>
          <input
            id="txn-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="txn-time" className="label">
            Time
          </label>
          <input
            id="txn-time"
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="relative" ref={suggestionsRef}>
          <label htmlFor="txn-vendor" className="label">
            Vendor
          </label>
          <input
            id="txn-vendor"
            value={vendorName}
            onChange={(e) => onVendorChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className="input"
            placeholder="e.g. Google"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls="vendor-suggestions"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              id="vendor-suggestions"
              role="listbox"
              className="absolute z-10 mt-1 w-full rounded-lg border border-border-strong bg-surface-raised shadow-lg shadow-black/40 overflow-hidden"
            >
              {suggestions.map((v) => (
                <li key={v.id} role="option" aria-selected={v.name === vendorName}>
                  <button
                    type="button"
                    onClick={() => pickVendor(v)}
                    className="w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors duration-150 hover:bg-primary/20"
                  >
                    {v.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="txn-category" className="label">
            Category
          </label>
          <select
            id="txn-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">— none —</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="txn-description" className="label">
          Description
        </label>
        <input
          id="txn-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          placeholder="What was this for?"
        />
      </div>

      <div>
        <label htmlFor="txn-notes" className="label">
          Notes
        </label>
        <textarea
          id="txn-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input min-h-20"
          placeholder="Anything extra…"
        />
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-5">
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add transaction"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost px-5">
          Cancel
        </button>
      </div>
    </form>
  );
}
