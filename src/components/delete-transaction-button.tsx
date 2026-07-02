"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteTransactionButton({
  transactionId,
  isTransfer = false,
}: {
  transactionId: string;
  isTransfer?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const message = isTransfer
      ? "Delete this transfer? Both linked entries will be removed and balances recalculated."
      : "Delete this transaction? The account balance will be recalculated.";
    if (!window.confirm(message)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/transactions/${transactionId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/transactions");
      router.refresh();
    }
  }

  return (
    <button onClick={remove} disabled={busy} className="btn-danger">
      <Trash2 size={15} aria-hidden />
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
