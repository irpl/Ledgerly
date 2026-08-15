import { SidebarNav, BottomNav } from "@/components/nav";
import { AddTransactionFab } from "@/components/fab";
import { APP_VERSION } from "@/lib/version";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <SidebarNav version={APP_VERSION} />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-5xl">{children}</main>
      <AddTransactionFab />
      <BottomNav />
    </div>
  );
}
