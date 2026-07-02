"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import type { CategoryDTO, CategoryKindValue } from "@/lib/category-shared";
import { CATEGORY_KINDS, CATEGORY_KIND_LABELS, CATEGORY_COLORS } from "@/lib/category-shared";

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full cursor-pointer transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            value === c ? "ring-2 ring-white/80 scale-110" : ""
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  category,
  onChanged,
}: {
  category: CategoryDTO;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
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
    const count = category.transactionCount ?? 0;
    const msg =
      count > 0
        ? `Delete "${category.name}"? ${count} transaction(s) will lose this category.`
        : `Delete "${category.name}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
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
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input flex-1"
            aria-label="Category name"
          />
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary px-2.5!" aria-label="Save">
            <Check size={16} aria-hidden />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(category.name);
              setColor(category.color);
            }}
            className="btn-ghost px-2.5!"
            aria-label="Cancel"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="text-sm text-negative">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color ?? "#64748b" }}
          aria-hidden
        />
        <span className="truncate font-medium">{category.name}</span>
        {(category.transactionCount ?? 0) > 0 && (
          <span className="text-xs text-muted">{category.transactionCount} txns</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => setEditing(true)} className="btn-ghost p-2!" aria-label={`Edit ${category.name}`}>
          <Pencil size={15} aria-hidden />
        </button>
        <button onClick={remove} disabled={busy} className="btn-danger p-2!" aria-label={`Delete ${category.name}`}>
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
    </li>
  );
}

export function CategoryManager({ initial }: { initial: CategoryDTO[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKindValue>("expense");
  const [color, setColor] = useState<string | null>(CATEGORY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, color }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to create.");
      return;
    }
    setName("");
    refresh();
  }

  const groups = CATEGORY_KINDS.map((k) => ({
    kind: k,
    items: initial.filter((c) => c.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="card space-y-3 max-w-lg">
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="cat-name" className="label">
              New category
            </label>
            <input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Subscriptions"
              required
            />
          </div>
          <div>
            <label htmlFor="cat-kind" className="label">
              Kind
            </label>
            <select
              id="cat-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CategoryKindValue)}
              className="input"
            >
              {CATEGORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary">
          <Plus size={16} aria-hidden />
          Add category
        </button>
      </form>

      {groups.map((g) => (
        <section key={g.kind}>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            {CATEGORY_KIND_LABELS[g.kind]}
          </h2>
          <ul className="card p-0! divide-y divide-border-subtle">
            {g.items.map((c) => (
              <CategoryRow key={c.id} category={c} onChanged={refresh} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

