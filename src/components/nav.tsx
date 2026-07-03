"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Landmark,
  Tags,
  Inbox,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", Icon: Wallet },
  { href: "/transactions", label: "Transactions", Icon: ArrowLeftRight },
  { href: "/budget", label: "Budget", Icon: PiggyBank },
  { href: "/liabilities", label: "Loans & credit", Icon: Landmark },
  { href: "/categories", label: "Categories", Icon: Tags },
  { href: "/review", label: "Review", Icon: Inbox },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border-subtle p-4 gap-1 min-h-dvh sticky top-0">
      <div className="font-bold text-lg mb-4 px-2">Ledgerly</div>
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            isActive(pathname, href)
              ? "bg-primary/20 text-secondary"
              : "text-muted hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          <Icon size={18} strokeWidth={2} aria-hidden />
          {label}
        </Link>
      ))}
      <div className="mt-auto">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            isActive(pathname, "/settings")
              ? "bg-primary/20 text-secondary"
              : "text-muted hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted cursor-pointer transition-colors duration-200 hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <LogOut size={18} strokeWidth={2} aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border-subtle bg-background/90 backdrop-blur flex z-40">
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium cursor-pointer transition-colors duration-200 ${
            isActive(pathname, href) ? "text-secondary" : "text-muted"
          }`}
        >
          <Icon size={20} strokeWidth={2} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
