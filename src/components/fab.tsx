"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

export function AddTransactionFab() {
  const pathname = usePathname();
  // Hide on the form itself.
  if (pathname.startsWith("/transactions/new")) return null;
  return (
    <Link
      href="/transactions/new"
      aria-label="Add transaction"
      className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/40 cursor-pointer transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <Plus size={26} strokeWidth={2.5} aria-hidden />
    </Link>
  );
}
