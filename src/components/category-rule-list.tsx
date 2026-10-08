"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { CategoryDTO } from "@/lib/category-shared";
import { MAX_RULE_PATTERN_LENGTH, type CategoryRuleDTO } from "@/lib/category-rule-shared";

function RuleRow({
  rule,
  categories,
  onChanged,
}: {
  rule: CategoryRuleDTO;
  categories: CategoryDTO[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pattern, setPattern] = useState(rule.pattern);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/category-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, categoryId }),
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

  async function remove() {
    if (
      !window.confirm(
        `Stop filing “${rule.pattern}” under ${rule.categoryName}? Transactions already categorized keep their category.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/category-rules/${rule.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to delete.");
      return;
    }
    onChanged();
  }

  if (editing) {
    return (
      <li className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            maxLength={MAX_RULE_PATTERN_LENGTH}
            className="input amount flex-1 min-w-40"
            aria-label="Match text"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input w-auto!"
            aria-label="Category"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={busy || !pattern.trim()}
            className="btn-primary px-2.5!"
            aria-label="Save"
          >
            <Check size={16} aria-hidden />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setPattern(rule.pattern);
              setCategoryId(rule.categoryId);
              setError(null);
            }}
            className="btn-ghost px-2.5!"
            aria-label="Cancel"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="text-sm truncate">
          <span className="amount">{rule.pattern}</span>
          <span className="text-muted"> → </span>
          <span className="font-medium">{rule.categoryName}</span>
        </div>
        <div className="text-xs text-muted">
          {rule.matchCount === 1 ? "1 match" : `${rule.matchCount} matches`}
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="btn-ghost p-2!"
          aria-label={`Edit rule for ${rule.pattern}`}
        >
          <Pencil size={15} aria-hidden />
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="btn-danger p-2!"
          aria-label={`Delete rule for ${rule.pattern}`}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** Remembered "looks like this → category" rules, created from the transaction form. */
export function CategoryRuleList({
  rules,
  categories,
}: {
  rules: CategoryRuleDTO[];
  categories: CategoryDTO[];
}) {
  const router = useRouter();
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
        Remembered categories ({rules.length})
      </h2>
      {rules.length === 0 ? (
        <p className="text-sm text-muted max-w-lg">
          None yet. When you pick a category on a transaction, tick “Remember this category?”
          and later transactions that look the same — including ones that arrive by email —
          are filed under it automatically.
        </p>
      ) : (
        <ul className="card p-0! divide-y divide-border-subtle">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              categories={categories}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
