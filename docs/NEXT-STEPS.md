# Project status & next steps

> Hand-off note (last updated 2026-07-02). Read this first when resuming work
> in a new session. The full build spec is `docs/finance-app-plan.md` (v2);
> dev-environment quirks and conventions are in `AGENTS.md`.

## Where things stand

**All 7 phases of the spec's build order are implemented and were verified in
the browser**, including a production build (`npm run build` + `npm start`
with the service worker active). Committed as `fcd83b5`.

**The app is deployed and live** (as of 2026-07-02): the repo is on
github.com/irpl/Ledgerly, running on Coolify at
`https://ledgerly.philliplogan.com`, with DNS on Cloudflare and email
ingestion working end-to-end (Cloudflare Email Routing → Worker →
`/api/inbound-email`, raw MIME parsed server-side by postal-mime). See
`docs/email-ingestion.md` (Option A) and `docs/deploy-coolify.md`.

| Phase | Feature | State |
|---|---|---|
| 1 | Auth, accounts CRUD, signed balances, per-currency totals | done |
| 2 | Categories, manual transactions, vendor autocomplete w/ memory | done |
| 3 | Linked transfers, loans + credit-card liability table | done |
| 4 | Budget lines (12-month normalization), cash/credit split, income plan, surplus/deficit | done |
| 5 | Dashboards/charts, period selector, budget-vs-actual (BudgetPeriodActual) | done |
| 6 | Email ingestion: webhook, parser rules, review queue | done |
| 7 | PWA (manifest/SW/offline), CSV export, Dockerfile + deploy docs | done |

The FX/combined-currency toggle (spec §3.1, optional, off by default) was
intentionally **not** built — the `FxRate` table and seed exist; the toggle,
daily fetch, and converted rollups do not.

## To resume development

```powershell
npx prisma dev --detach    # Prisma Postgres local server (NOT Docker — see AGENTS.md)
# ports change per restart: check `npx prisma dev ls`, then update
# DATABASE_URL / SHADOW_DATABASE_URL in .env
npm run dev                # http://localhost:3000
# login: ADMIN_EMAIL / ADMIN_PASSWORD from .env (seeded; re-run npx prisma db seed after changing)
```

Schema changes: edit `prisma/schema.prisma` → `npx prisma db push` (local dev;
`migrate dev` fails P1017 against the PGlite dev server) → **restart the dev
server** (it caches the generated client). For deployable migrations, generate
SQL offline with `prisma migrate diff` into `prisma/migrations/`.

## Done ✓

1. ~~Change the login password~~ — done (admin password changed from the
   `changeme123` placeholder).
2. ~~Push the repo~~ — done (github.com/irpl/Ledgerly, `main`).
3. ~~Deploy on Coolify~~ — done (live at `https://ledgerly.philliplogan.com`,
   `AUTH_TRUST_HOST=true`, HTTPS via Cloudflare).
4. ~~Wire up email ingestion~~ — done (Cloudflare Email Routing → Worker →
   `/api/inbound-email`; the Worker's source is `~/Downloads/ledgerly-email-worker.js`).

## Next steps (in rough order)

1. **Build parser rules from real bank alerts** — forward an alert, then on
   the **Review** page use "Create rule from this" (sender + live regex
   tester) to add a named-group rule (`amount` required; `date`/`merchant`/
   `direction` optional). Confirm the resulting `pending_review` transaction.
2. **Enable scheduled DB backups** on the Coolify Postgres resource if not
   already on. CSV export (/settings) is the secondary human-readable backup.
3. **Test the iOS install path** on a real device (Share → Add to Home
   Screen) — spec §6 calls this out explicitly. Android Chrome install should
   also be sanity-checked.
4. **Import historical data** (optional) — the spreadsheet's transaction
   history could be imported via `POST /api/transactions` per row, or a
   one-off script; vendor memory will seed itself from descriptions.

## Known gaps / future enhancements (spec §12 + observations)

- Optional FX combined view (§3.1): daily rate fetch, manual override, single
  JMD-converted net-worth figure behind a toggle.
- Custom date range for the dashboard period selector (presets only today:
  this month / last month / this year).
- Recurring-transaction reminders from budget lines; receipt uploads;
  rule-based auto-categorization; scheduled email/report digests.
- Mobile bottom nav has 7 items (Settings is sidebar-only) — could use a
  "More" sheet.
- Income plan + surplus/deficit assume the reporting currency (JMD); budget
  lines funded from non-JMD accounts show as separate expense cards but don't
  fold into the surplus figure.
- The inbound-email rate limiter is in-memory (fine for the single-container
  deploy; revisit if ever scaled out).

## Conventions worth knowing (details in AGENTS.md)

- Money = signed BigInt minor units; out negative, in positive; DTOs convert
  to Number at the API boundary.
- Transfers = two transactions sharing `transferGroupId`; excluded from every
  income/expense rollup; edit blocked, delete removes both legs.
- `pending_review` transactions never affect balances until confirmed.
- Client components must not import `@/lib/prisma` (or anything that does) —
  use the `*-shared.ts` modules.
- Chart colors in `src/lib/chart-colors.ts` are CVD-validated against surface
  `#101a34` — re-run the dataviz validator before changing them.
