"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UnroutedEmail = {
  id: string;
  fromAddress: string;
  toAddress: string | null;
  subject: string;
  receivedAt: string;
};

type UserOption = { id: string; label: string };

/** Admin-only: emails no user matched, with an assign-to-user action. */
export function UnroutedEmails({
  emails,
  users,
}: {
  emails: UnroutedEmail[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(emailId: string) {
    const userId = selection[emailId] || users[0]?.id;
    if (!userId) return;
    setBusyId(emailId);
    setError(null);
    const res = await fetch(`/api/admin/raw-emails/${emailId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not assign email.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Unrouted emails ({emails.length})</h2>
      <p className="text-sm text-muted max-w-2xl">
        These arrived without a matching recipient key or registered sender, so they
        belong to no one yet. Assign each to a user to run their parser rules.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="card p-0! divide-y divide-border-subtle max-w-3xl">
        {emails.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 p-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{e.subject || "(no subject)"}</div>
              <div className="text-xs text-muted truncate">
                {e.fromAddress}
                {e.toAddress ? ` → ${e.toAddress}` : ""} · {e.receivedAt.slice(0, 10)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                className="input py-1.5! text-xs w-auto"
                value={selection[e.id] ?? users[0]?.id ?? ""}
                onChange={(ev) => setSelection({ ...selection, [e.id]: ev.target.value })}
                aria-label="Assign to user"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary px-3! py-1.5! text-xs"
                disabled={busyId === e.id}
                onClick={() => assign(e.id)}
              >
                {busyId === e.id ? "Assigning…" : "Assign"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
