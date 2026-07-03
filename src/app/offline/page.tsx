export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-muted max-w-sm">
        Ledgerly needs a connection to load your data. Reconnect and try again.
      </p>
    </main>
  );
}
