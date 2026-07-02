import { Download } from "lucide-react";

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

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

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
          Amounts are exported in major units (e.g. 4512.35). For full database
          backups, use the scheduled Postgres backups on the server (see
          docs/deploy-coolify.md).
        </p>
      </section>
    </div>
  );
}
