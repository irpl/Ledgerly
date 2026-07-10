import { Download } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/current-user";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { InboundEmailCard } from "@/components/settings/inbound-email-card";
import { UserManagement, type ManagedUser } from "@/components/settings/user-management";

export const dynamic = "force-dynamic";

const EXPORTS: { entity: string; label: string; note: string }[] = [
  { entity: "transactions", label: "Transactions", note: "every transaction with account, category, vendor" },
  { entity: "accounts", label: "Accounts", note: "balances, limits, budgets" },
  { entity: "loans", label: "Loan details", note: "principal, rate, term, payments" },
  { entity: "categories", label: "Categories", note: "names, kinds, colors" },
  { entity: "vendors", label: "Vendors", note: "autocomplete memory" },
  { entity: "budget-lines", label: "Budget lines", note: "planned expenses with normalized monthly" },
  { entity: "income-plan", label: "Income plan", note: "planned monthly income" },
  { entity: "budget-actuals", label: "Budget vs actual history", note: "monthly snapshots per category" },
  { entity: "parser-rules", label: "Parser rules", note: "email matching rules" },
  { entity: "raw-emails", label: "Raw emails", note: "ingested bank alerts, full bodies" },
];

export default async function SettingsPage() {
  const userId = await requireUserId();
  // A JWT can outlive its user (deleted account, restored DB) — treat as logged out.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      inboundKey: true,
      forwardAddresses: {
        select: { id: true, address: true },
        orderBy: { address: "asc" },
      },
    },
  });
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin";
  const managedUsers: ManagedUser[] = isAdmin
    ? (
        await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            createdAt: true,
            _count: { select: { accounts: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      ).map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        accountCount: u._count.accounts,
      }))
    : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Profile
        </h2>
        <ProfileForm initialEmail={user.email} initialDisplayName={user.displayName} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Password
        </h2>
        <PasswordForm />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Email ingestion
        </h2>
        <InboundEmailCard
          inboundKey={user.inboundKey}
          inboundDomain={process.env.INBOUND_EMAIL_DOMAIN ?? null}
          forwardAddresses={user.forwardAddresses}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          Export data (CSV backup)
        </h2>
        <ul className="card p-0! divide-y divide-border-subtle max-w-2xl">
          {EXPORTS.map(({ entity, label, note }) => (
            <li key={entity} className="flex items-center justify-between gap-3 p-3">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted">{note}</div>
              </div>
              <a
                href={`/api/export?entity=${entity}`}
                download
                className="btn-ghost px-3! py-1.5! text-xs shrink-0"
              >
                <Download size={14} aria-hidden />
                CSV
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted max-w-2xl">
          Amounts are exported in major units (e.g. 4512.35). Exports contain your data
          only. For full database backups, use the scheduled Postgres backups on the
          server (see docs/deploy-coolify.md).
        </p>
      </section>

      {isAdmin && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Users (admin)
          </h2>
          <UserManagement users={managedUsers} currentUserId={user.id} />
        </section>
      )}
    </div>
  );
}
