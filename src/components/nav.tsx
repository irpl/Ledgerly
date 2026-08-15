"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
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
  MoreHorizontal,
  X,
} from "lucide-react";

type NavItem = { href: string; label: string; Icon: typeof LayoutDashboard };

// Shown in the mobile bottom bar (and, with the rest, in the desktop sidebar).
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", Icon: Wallet },
  { href: "/transactions", label: "Transactions", Icon: ArrowLeftRight },
  { href: "/budget", label: "Budget", Icon: PiggyBank },
  { href: "/review", label: "Review", Icon: Inbox },
];

// Lower-traffic destinations: sidebar on desktop, "More" sheet on mobile.
const SECONDARY_ITEMS: NavItem[] = [
  { href: "/liabilities", label: "Loans & credit", Icon: Landmark },
  { href: "/categories", label: "Categories", Icon: Tags },
];

const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", Icon: Settings };

// Desktop sidebar order — unchanged from before the mobile split.
const NAV_ITEMS: NavItem[] = [
  ...PRIMARY_ITEMS.slice(0, 4),
  ...SECONDARY_ITEMS,
  PRIMARY_ITEMS[4],
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const SIDEBAR_LINK =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary";

function sidebarLinkClass(active: boolean) {
  return `${SIDEBAR_LINK} ${
    active
      ? "bg-primary/20 text-secondary"
      : "text-muted hover:bg-surface-raised hover:text-foreground"
  }`;
}

export function SidebarNav({ version }: { version?: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border-subtle p-4 gap-1 min-h-dvh sticky top-0">
      <div className="mb-4 px-2">
        <div className="font-bold text-lg leading-tight">Ledgerly</div>
        {version && (
          <div className="text-xs text-muted amount">v{version}</div>
        )}
      </div>
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className={sidebarLinkClass(isActive(pathname, href))}>
          <Icon size={18} strokeWidth={2} aria-hidden />
          {label}
        </Link>
      ))}
      <div className="mt-auto">
        <Link
          href={SETTINGS_ITEM.href}
          className={sidebarLinkClass(isActive(pathname, SETTINGS_ITEM.href))}
        >
          <SETTINGS_ITEM.Icon size={18} strokeWidth={2} aria-hidden />
          {SETTINGS_ITEM.label}
        </Link>
        <SignOutButton className={`${SIDEBAR_LINK} w-full text-muted hover:bg-surface-raised hover:text-foreground`} />
      </div>
    </aside>
  );
}

function SignOutButton({ className }: { className: string }) {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className={className}>
      <LogOut size={18} strokeWidth={2} aria-hidden />
      Sign out
    </button>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Settings and Sign out live only in here on mobile, so the sheet is the
  // sole route to them — it has to close reliably.
  const moreActive =
    SECONDARY_ITEMS.some((i) => isActive(pathname, i.href)) ||
    isActive(pathname, SETTINGS_ITEM.href);

  useEffect(() => {
    if (!moreOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    // Stop the page behind the sheet from scrolling under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [moreOpen]);

  function closeMore() {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  }

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeMore}
            className="absolute inset-0 w-full bg-black/60 cursor-pointer"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border-subtle bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg shadow-black/40 focus:outline-none motion-safe:animate-[slideUp_200ms_ease-out]"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold">More</span>
              <button
                type="button"
                onClick={closeMore}
                aria-label="Close menu"
                className="btn-ghost px-2! py-1!"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
            {[...SECONDARY_ITEMS, SETTINGS_ITEM].map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                // Tapping a destination dismisses the sheet, including when it
                // links to the page you're already on.
                onClick={() => setMoreOpen(false)}
                className={sidebarLinkClass(isActive(pathname, href))}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
                {label}
              </Link>
            ))}
            <SignOutButton
              className={`${SIDEBAR_LINK} w-full text-muted hover:bg-surface-raised hover:text-foreground`}
            />
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border-subtle bg-background/90 backdrop-blur flex z-40">
        {PRIMARY_ITEMS.map(({ href, label, Icon }) => (
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
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            moreActive || moreOpen ? "text-secondary" : "text-muted"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
