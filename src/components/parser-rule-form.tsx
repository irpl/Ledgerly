"use client";

import { useState } from "react";
import type { AccountDTO } from "@/lib/account-shared";

const inputCls = "input";

export type RuleFormValues = {
  name: string;
  senderMatch: string;
  subjectPattern: string;
  bodyPattern: string;
  accountId: string;
  defaultDirection: "outflow" | "inflow";
};

function TesterResult({ pattern, sample }: { pattern: string; sample: string }) {
  if (!pattern || !sample) return null;
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch (e) {
    return <p className="text-xs text-negative">Invalid regex: {String(e)}</p>;
  }
  const match = re.exec(sample);
  if (!match) return <p className="text-xs text-negative">Pattern does not match the sample.</p>;
  const groups = match.groups ?? {};
  return (
    <div className="text-xs space-y-0.5">
      <p className="text-positive">Pattern matches ✓</p>
      {(["amount", "date", "merchant", "direction"] as const).map((g) => (
        <p key={g} className="text-muted">
          {g}:{" "}
          <span className="amount text-foreground">
            {groups[g] !== undefined ? `"${groups[g]}"` : "—"}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ParserRuleForm({
  accounts,
  initial,
  sampleBody,
  onDone,
  onCancel,
}: {
  accounts: AccountDTO[];
  initial?: Partial<RuleFormValues>;
  sampleBody?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<RuleFormValues>({
    name: initial?.name ?? "",
    senderMatch: initial?.senderMatch ?? "",
    subjectPattern: initial?.subjectPattern ?? "",
    bodyPattern:
      initial?.bodyPattern ??
      String.raw`(?<direction>debited|credited).*?(?<amount>[\d,]+\.\d{2}).*?at (?<merchant>.+?) on (?<date>\d{2}-\w{3}-\d{4})`,
    accountId: initial?.accountId ?? accounts[0]?.id ?? "",
    defaultDirection: initial?.defaultDirection ?? "outflow",
  });
  const [sample, setSample] = useState(sampleBody ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/parser-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        subjectPattern: values.subjectPattern || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to create rule.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Rule name</label>
          <input
            required
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
            placeholder="e.g. NCB debit alerts"
          />
        </div>
        <div>
          <label className="label">Sender contains</label>
          <input
            required
            value={values.senderMatch}
            onChange={(e) => set("senderMatch", e.target.value)}
            className={inputCls}
            placeholder="alerts@jncb.com"
          />
        </div>
        <div>
          <label className="label">Subject pattern (regex, optional)</label>
          <input
            value={values.subjectPattern}
            onChange={(e) => set("subjectPattern", e.target.value)}
            className={`${inputCls} amount`}
            placeholder="Transaction Alert"
          />
        </div>
        <div>
          <label className="label">Account</label>
          <select
            required
            value={values.accountId}
            onChange={(e) => set("accountId", e.target.value)}
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">
          Body pattern (regex with named groups: amount required; date, merchant, direction optional)
        </label>
        <textarea
          required
          value={values.bodyPattern}
          onChange={(e) => set("bodyPattern", e.target.value)}
          className={`${inputCls} amount min-h-16 text-xs`}
          spellCheck={false}
        />
      </div>

      <div>
        <label className="label">Default direction (when the email doesn&apos;t say)</label>
        <select
          value={values.defaultDirection}
          onChange={(e) => set("defaultDirection", e.target.value as "outflow" | "inflow")}
          className={`${inputCls} max-w-48`}
        >
          <option value="outflow">Money out</option>
          <option value="inflow">Money in</option>
        </select>
      </div>

      <div>
        <label className="label">Test against a sample email body</label>
        <textarea
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className={`${inputCls} min-h-20 text-xs`}
          placeholder="Paste a bank alert here to preview extraction…"
          spellCheck={false}
        />
        <div className="mt-2">
          <TesterResult pattern={values.bodyPattern} sample={sample} />
        </div>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Create rule"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
