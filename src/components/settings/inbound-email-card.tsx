"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type ForwardAddress = { id: string; address: string };

export function InboundEmailCard({
  inboundKey,
  inboundDomain,
  forwardAddresses,
}: {
  inboundKey: string;
  inboundDomain: string | null;
  forwardAddresses: ForwardAddress[];
}) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addAddress(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/forward-addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: address.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not add address.");
      return;
    }
    setAddress("");
    router.refresh();
  }

  async function removeAddress(id: string) {
    const res = await fetch(`/api/me/forward-addresses/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="card max-w-lg space-y-4">
      <div>
        <div className="label">Your inbound address</div>
        {inboundDomain ? (
          <>
            <code className="amount text-sm text-secondary break-all">
              {inboundKey}@{inboundDomain}
            </code>
            <p className="mt-1 text-xs text-muted">
              Bank alerts forwarded to this address are routed to your account
              automatically. Plus-addressing works too (anything+{inboundKey}@
              {inboundDomain}).
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            Inbound key: <code className="amount">{inboundKey}</code> (ask the
            administrator for the inbound email domain).
          </p>
        )}
      </div>

      <div>
        <div className="label">Forward-from addresses</div>
        <p className="text-xs text-muted mb-2">
          Emails you forward manually arrive “from” your own mailbox. Register those
          addresses here so they route to you.
        </p>
        {forwardAddresses.length > 0 && (
          <ul className="divide-y divide-border-subtle mb-3">
            {forwardAddresses.map((fa) => (
              <li key={fa.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm break-all">{fa.address}</span>
                <button
                  type="button"
                  onClick={() => removeAddress(fa.id)}
                  className="btn-ghost px-2! py-1! text-xs shrink-0"
                  aria-label={`Remove ${fa.address}`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addAddress} className="flex gap-2">
          <input
            className="input flex-1"
            type="email"
            placeholder="you@gmail.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
