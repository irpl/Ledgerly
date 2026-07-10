"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ManagedUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  accountCount: number;
};

export function UserManagement({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        displayName: displayName.trim() || null,
        password,
        role,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not create user.");
      return;
    }
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("user");
    setShowCreate(false);
    router.refresh();
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    setBusy(true);
    setResetError(null);
    const res = await fetch(`/api/admin/users/${resetFor}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setResetError(data?.error ?? "Could not reset password.");
      return;
    }
    setResetDone(resetFor);
    setResetFor(null);
    setResetPassword("");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card p-0! overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3 font-semibold">User</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold text-right">Accounts</th>
              <th className="p-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-raised transition-colors duration-150">
                <td className="p-3">
                  <div className="font-medium">
                    {u.displayName ?? u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    )}
                  </div>
                  {u.displayName && <div className="text-xs text-muted">{u.email}</div>}
                </td>
                <td className="p-3">{u.role}</td>
                <td className="p-3 text-right amount">{u.accountCount}</td>
                <td className="p-3 text-right">
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      className="btn-ghost px-3! py-1.5! text-xs"
                      onClick={() => {
                        setResetFor(resetFor === u.id ? null : u.id);
                        setResetDone(null);
                        setResetError(null);
                      }}
                    >
                      Reset password
                    </button>
                  )}
                  {resetDone === u.id && (
                    <span className="ml-2 text-xs text-secondary">Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetFor && (
        <form onSubmit={submitReset} className="card max-w-lg space-y-3">
          <div className="label">
            New password for {users.find((u) => u.id === resetFor)?.email}
          </div>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {resetError && <p className="text-sm text-danger">{resetError}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Setting…" : "Set password"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setResetFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {showCreate ? (
        <form onSubmit={createUser} className="card max-w-lg space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nu-email">
                Email
              </label>
              <input
                id="nu-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="nu-name">
                Display name (optional)
              </label>
              <input
                id="nu-name"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nu-password">
                Initial password
              </label>
              <input
                id="nu-password"
                className="input"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="nu-role">
                Role
              </label>
              <select
                id="nu-role"
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as "user" | "admin")}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">
            The new user starts with the default category set and an empty ledger.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
          + User
        </button>
      )}
    </div>
  );
}
