"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Trash2, RefreshCw, EyeOff, Plus, Pencil, ChevronDown } from "lucide-react";
import type { AccountDTO } from "@/lib/account-shared";
import type { TransactionDTO } from "@/lib/transaction-shared";
import type { CategoryDTO } from "@/lib/category-shared";
import { kindFitsDirection, type CategoryRuleDTO } from "@/lib/category-rule-shared";
import { RememberCategoryPrompt, useRememberCategory } from "@/components/remember-category";
import { formatMoney, amountClass } from "@/lib/money";
import { localDate } from "@/lib/dates";
import { ParserRuleForm } from "@/components/parser-rule-form";

export type PendingItem = TransactionDTO & {
  email: { from: string; subject: string } | null;
};

export type UnmatchedEmail = {
  id: string;
  fromAddress: string;
  subject: string;
  body: string;
  receivedAt: string;
  parseStatus: string;
  parseError: string | null;
};

export type RuleItem = {
  id: string;
  name: string;
  senderMatch: string;
  subjectPattern: string | null;
  bodyPattern: string;
  defaultDirection: string;
  accountId: string;
  accountName: string;
  priority: number;
  parsedEmails: number;
};

function PendingRow({
  item,
  categories,
  categoryRules,
  onChanged,
}: {
  item: PendingItem;
  categories: CategoryDTO[];
  categoryRules: CategoryRuleDTO[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follows the item (a rule saved on another row can file this one) until
  // the user picks something here.
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(null);
  const categoryId = pickedCategoryId ?? item.categoryId ?? "";
  const direction = item.amount < 0 ? "out" : "in";
  const visibleCategories = categories.filter((c) => kindFitsDirection(c.kind, direction));
  const remember = useRememberCategory({
    rules: categoryRules,
    categories,
    categoryId,
    vendorName: item.vendorName,
    description: item.description,
    direction,
  });

  async function confirm() {
    if (remember.invalid) {
      setError("Enter the text to match, or untick “Remember”.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/transactions/${item.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: categoryId || null,
        rememberCategory: remember.payload,
      }),
    });
    setBusy(false);
    if (res.ok) onChanged();
    else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Confirming failed.");
    }
  }

  async function discard() {
    if (!window.confirm("Discard this transaction? The email will be marked ignored.")) return;
    setBusy(true);
    const res = await fetch(`/api/transactions/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
  }

  return (
    <li className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {item.vendorName ?? item.description ?? "—"}
          </div>
          <div className="text-xs text-muted truncate">
            {item.accountName} · {localDate(item.occurredAt)}
          </div>
          {item.email && (
            <div className="text-xs text-muted truncate mt-0.5">
              ✉ {item.email.from} — {item.email.subject}
            </div>
          )}
        </div>
        <div className={`text-sm font-semibold shrink-0 ${amountClass(item.amount)}`}>
          {formatMoney(item.amount, item.accountCurrency, { sign: true })}
        </div>
      </div>
      <div className="max-w-sm">
        <label htmlFor={`pending-${item.id}-category`} className="sr-only">
          Category
        </label>
        <select
          id={`pending-${item.id}-category`}
          value={categoryId}
          onChange={(e) => setPickedCategoryId(e.target.value)}
          className="input py-1.5! text-sm"
        >
          <option value="">— uncategorized —</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <RememberCategoryPrompt state={remember} idPrefix={`pending-${item.id}`} compact />
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex gap-2">
        <button onClick={confirm} disabled={busy} className="btn-primary px-3! py-1.5! text-xs">
          <Check size={14} aria-hidden />
          Confirm
        </button>
        <Link href={`/transactions/${item.id}/edit`} className="btn-ghost px-3! py-1.5! text-xs">
          Edit first
        </Link>
        <button onClick={discard} disabled={busy} className="btn-danger px-3! py-1.5! text-xs">
          <Trash2 size={14} aria-hidden />
          Discard
        </button>
      </div>
    </li>
  );
}

function EmailRow({
  email,
  accounts,
  onChanged,
}: {
  email: UnmatchedEmail;
  accounts: AccountDTO[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function reparse() {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/raw-emails/${email.id}/reparse`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      if (data.outcome?.status === "parsed") onChanged();
      else if (data.outcome?.status === "failed") setNotice(`Still failing: ${data.outcome.reason}`);
      else setNotice("Still no rule matches this sender/subject.");
    }
  }

  async function ignore() {
    setBusy(true);
    const res = await fetch(`/api/raw-emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parseStatus: "ignored" }),
    });
    setBusy(false);
    if (res.ok) onChanged();
  }

  async function remove() {
    if (!window.confirm("Delete this email permanently?")) return;
    setBusy(true);
    const res = await fetch(`/api/raw-emails/${email.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
  }

  return (
    <li className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{email.subject || "(no subject)"}</div>
          <div className="text-xs text-muted truncate">
            {email.fromAddress} · {localDate(email.receivedAt)} ·{" "}
            <span className={email.parseStatus === "failed" ? "text-negative" : ""}>
              {email.parseStatus}
            </span>
          </div>
          {email.parseError && (
            <div className="text-xs text-negative mt-0.5 break-words">{email.parseError}</div>
          )}
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors">
          Show email body
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-raised p-3 max-h-48 overflow-y-auto">
          {email.body || "(empty)"}
        </pre>
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowRuleForm((s) => !s)}
          className="btn-secondary px-3! py-1.5! text-xs"
        >
          <Plus size={14} aria-hidden />
          Create rule from this
        </button>
        <button onClick={reparse} disabled={busy} className="btn-ghost px-3! py-1.5! text-xs">
          <RefreshCw size={14} aria-hidden />
          Re-parse
        </button>
        <button onClick={ignore} disabled={busy} className="btn-ghost px-3! py-1.5! text-xs">
          <EyeOff size={14} aria-hidden />
          Ignore
        </button>
        <button onClick={remove} disabled={busy} className="btn-danger px-3! py-1.5! text-xs">
          <Trash2 size={14} aria-hidden />
          Delete
        </button>
      </div>
      {notice && <p className="text-xs text-negative">{notice}</p>}
      {showRuleForm && (
        <div className="rounded-lg border border-border-subtle p-3 mt-2">
          <ParserRuleForm
            accounts={accounts}
            initial={{ senderMatch: email.fromAddress }}
            sampleBody={email.body}
            onDone={() => {
              setShowRuleForm(false);
              reparse();
            }}
            onCancel={() => setShowRuleForm(false)}
          />
        </div>
      )}
    </li>
  );
}

function RuleDetail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-xs break-all ${mono ? "amount" : ""}`}>{value}</div>
    </div>
  );
}

function RuleRow({
  rule,
  accounts,
  onChanged,
}: {
  rule: RuleItem;
  accounts: AccountDTO[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    setBusy(true);
    const res = await fetch(`/api/parser-rules/${rule.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
  }

  return (
    <li className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 text-left cursor-pointer group"
        >
          <ChevronDown
            size={15}
            aria-hidden
            className={`mt-0.5 shrink-0 text-muted transition-transform duration-200 group-hover:text-foreground motion-reduce:transition-none ${
              expanded ? "rotate-0" : "-rotate-90"
            }`}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate transition-colors group-hover:text-accent">
              {rule.name}
            </span>
            <span className="block text-xs text-muted truncate">
              #{rule.priority} · {rule.senderMatch} → {rule.accountName} ·{" "}
              {rule.defaultDirection === "outflow" ? "out" : "in"} by default ·{" "}
              {rule.parsedEmails} parsed
            </span>
            {!expanded && (
              <span className="block text-xs text-muted amount truncate mt-0.5">
                {rule.bodyPattern}
              </span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => {
              setEditing((s) => !s);
              setExpanded(true);
            }}
            disabled={busy}
            className="btn-ghost p-2!"
            aria-label={`Edit ${rule.name}`}
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="btn-danger p-2!"
            aria-label={`Delete ${rule.name}`}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      {expanded && !editing && (
        <div className="rounded-lg border border-border-subtle p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <RuleDetail label="Rule name" value={rule.name} />
            <RuleDetail label="Sender contains" value={rule.senderMatch} mono />
            <RuleDetail label="Subject pattern" value={rule.subjectPattern ?? "— (any subject)"} mono />
            <RuleDetail label="Account" value={rule.accountName} />
            <RuleDetail label="Priority" value={`${rule.priority} (lower is tried first)`} />
            <RuleDetail label="Emails parsed" value={String(rule.parsedEmails)} />
            <RuleDetail
              label="Default direction"
              value={rule.defaultDirection === "outflow" ? "Money out" : "Money in"}
            />
          </div>
          <div>
            <div className="label">Body pattern</div>
            <pre className="amount mt-1 whitespace-pre-wrap break-all rounded-lg bg-surface-raised p-3 text-xs">
              {rule.bodyPattern}
            </pre>
          </div>
          <button onClick={() => setEditing(true)} className="btn-ghost px-3! py-1.5! text-xs">
            <Pencil size={14} aria-hidden />
            Edit rule
          </button>
        </div>
      )}

      {editing && (
        <div className="rounded-lg border border-border-subtle p-3">
          <ParserRuleForm
            accounts={accounts}
            ruleId={rule.id}
            initial={{
              name: rule.name,
              senderMatch: rule.senderMatch,
              subjectPattern: rule.subjectPattern ?? "",
              bodyPattern: rule.bodyPattern,
              accountId: rule.accountId,
              defaultDirection: rule.defaultDirection === "inflow" ? "inflow" : "outflow",
              priority: String(rule.priority),
            }}
            onDone={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}

export function ReviewQueue({
  pending,
  unmatchedEmails,
  rules,
  accounts,
  categories,
  categoryRules,
}: {
  pending: PendingItem[];
  unmatchedEmails: UnmatchedEmail[];
  rules: RuleItem[];
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  categoryRules: CategoryRuleDTO[];
}) {
  const router = useRouter();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const refresh = () => router.refresh();

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Pending transactions ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting for review.</p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {pending.map((item) => (
              <PendingRow
                key={item.id}
                item={item}
                categories={categories}
                categoryRules={categoryRules}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Unmatched emails ({unmatchedEmails.length})
        </h2>
        {unmatchedEmails.length === 0 ? (
          <p className="text-sm text-muted">No unmatched emails.</p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {unmatchedEmails.map((email) => (
              <EmailRow key={email.id} email={email} accounts={accounts} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
            Parser rules ({rules.length})
          </h2>
          <button onClick={() => setShowRuleForm((s) => !s)} className="btn-primary">
            <Plus size={16} aria-hidden />
            Rule
          </button>
        </div>
        {showRuleForm && (
          <div className="card mb-4">
            <ParserRuleForm
              accounts={accounts}
              onDone={() => {
                setShowRuleForm(false);
                refresh();
              }}
              onCancel={() => setShowRuleForm(false)}
            />
          </div>
        )}
        {rules.length === 0 ? (
          <p className="text-sm text-muted">
            No rules yet. Rules match incoming bank alerts by sender and extract the
            amount, merchant, and date with a regex.
          </p>
        ) : (
          <ul className="card p-0! divide-y divide-border-subtle">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} accounts={accounts} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
