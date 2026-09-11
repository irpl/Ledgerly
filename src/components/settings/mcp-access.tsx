"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Trash2, TriangleAlert } from "lucide-react";
import {
  API_TOKEN_LIFETIMES,
  API_TOKEN_SCOPE_LABELS,
  type ApiTokenSummary,
} from "@/lib/api-token-shared";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Copy button that reverts itself; used for both the token and the setup command. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context; the text stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="btn-ghost px-2.5! py-2! shrink-0"
    >
      {copied ? (
        <Check size={15} className="text-positive" aria-hidden />
      ) : (
        <Copy size={15} aria-hidden />
      )}
    </button>
  );
}

export function McpAccess({
  tokens,
  mcpUrl,
}: {
  tokens: ApiTokenSummary[];
  mcpUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"full" | "read">("full");
  const [lifetime, setLifetime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once, right after minting: the only moment the secret is readable.
  const [freshToken, setFreshToken] = useState<string | null>(null);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        scope,
        expiresInDays: API_TOKEN_LIFETIMES[lifetime].days,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not create the token.");
      return;
    }
    const data = await res.json();
    setFreshToken(data.token);
    setName("");
    router.refresh();
  }

  async function revoke(id: string, tokenName: string) {
    if (!confirm(`Revoke "${tokenName}"? Anything using it stops working immediately.`)) return;
    const res = await fetch(`/api/me/tokens/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const setupCommand = `claude mcp add --transport http ledgerly ${mcpUrl} --header "Authorization: Bearer ${
    freshToken ?? "YOUR_TOKEN"
  }"`;

  return (
    <div className="card max-w-2xl space-y-5">
      <p className="text-xs text-muted">
        Connect Claude to this ledger with an MCP server, so it can read your accounts and record
        transactions for you. Create a token below, then point your MCP client at{" "}
        <code className="amount text-secondary break-all">{mcpUrl}</code> with the token as a
        bearer credential. A token acts as you — treat it like a password.
      </p>

      {freshToken && (
        <div className="rounded-lg border border-accent/50 bg-accent/10 p-3 space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <TriangleAlert size={16} className="text-accent shrink-0 mt-0.5" aria-hidden />
            <span>
              Copy this token now — it is shown once and cannot be recovered. Revoke it here if it
              ever leaks.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="amount flex-1 min-w-0 text-sm text-secondary break-all rounded-lg border border-border-strong bg-surface-raised px-3 py-2">
              {freshToken}
            </code>
            <CopyButton value={freshToken} label="API token" />
          </div>
          <div>
            <div className="label text-xs">Add it to Claude Code</div>
            <div className="flex items-center gap-2">
              <code className="amount flex-1 min-w-0 text-xs text-muted break-all rounded-lg border border-border-strong bg-surface-raised px-3 py-2">
                {setupCommand}
              </code>
              <CopyButton value={setupCommand} label="setup command" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFreshToken(null)}
            className="btn-ghost px-3! py-1.5! text-xs"
          >
            Done
          </button>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {tokens.map((token) => {
            return (
              <li key={token.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound size={14} className="text-muted shrink-0" aria-hidden />
                    <span className="truncate">{token.name}</span>
                    <span className="text-xs text-muted shrink-0">
                      {API_TOKEN_SCOPE_LABELS[token.scope]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    <code className="amount">{token.prefix}…</code> · created{" "}
                    {formatDate(token.createdAt)} · last used{" "}
                    {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}
                    {token.expiresAt &&
                      (token.expired
                        ? " · expired"
                        : ` · expires ${formatDate(token.expiresAt)}`)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(token.id, token.name)}
                  className="btn-danger px-2.5! py-1.5! text-xs shrink-0"
                  aria-label={`Revoke ${token.name}`}
                >
                  <Trash2 size={14} aria-hidden />
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={createToken} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <label className="label text-xs" htmlFor="token-name">
              Token name
            </label>
            <input
              id="token-name"
              className="input"
              placeholder="Claude on my laptop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="sm:w-40">
            <label className="label text-xs" htmlFor="token-scope">
              Access
            </label>
            <select
              id="token-scope"
              className="input cursor-pointer"
              value={scope}
              onChange={(e) => setScope(e.target.value as "full" | "read")}
            >
              <option value="full">Full access</option>
              <option value="read">Read-only</option>
            </select>
          </div>
          <div className="sm:w-36">
            <label className="label text-xs" htmlFor="token-lifetime">
              Expires
            </label>
            <select
              id="token-lifetime"
              className="input cursor-pointer"
              value={lifetime}
              onChange={(e) => setLifetime(Number(e.target.value))}
            >
              {API_TOKEN_LIFETIMES.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted">
          Read-only tokens can look at everything but change nothing — the safest choice for
          questions and reports. Neither kind can change your password or create more tokens.
        </p>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create token"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}
