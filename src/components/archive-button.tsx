"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveButton({
  accountId,
  archived,
}: {
  accountId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = archived
      ? await fetch(`/api/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        })
      : await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/accounts");
      router.refresh();
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="btn-ghost"
    >
      {busy ? "Working…" : archived ? "Unarchive" : "Archive"}
    </button>
  );
}
