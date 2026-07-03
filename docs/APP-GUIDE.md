# Ledgerly — App Guide & Technical Reference

A complete guide to what this app does, how to use every feature, and how it's
built. It's a **single-user, self-hosted personal finance tracker**: track
accounts across currencies, record transactions and transfers, plan a budget,
watch dashboards, and auto-ingest bank-alert emails into a review queue.

> The app is **"Ledgerly"** everywhere — repository and domain
> (`github.com/irpl/Ledgerly`, `ledgerly.philliplogan.com`) as well as the
> in-app brand (sidebar title, login heading, PWA manifest, browser tab title).

---

## 1. Core concepts (read this first)

These conventions run through every screen and every table.

- **Money is stored as signed integer minor units (cents), as `BigInt`.**
  `4,512.35` JMD is stored as `451235`. `BigInt` (not `Int`) is used so
  mortgage-sized balances don't overflow 32-bit cents.
- **Sign encodes direction: money *out* is negative, money *in* is positive.**
  Expenses, purchases, and amounts owed are negative; income and deposits are
  positive. The UI colors negative red and positive green.
- **You always type a positive number.** A "Money out / Money in" toggle (on
  transactions) or the account being a liability (opening balance) decides the
  stored sign. Liability "amount owed" is entered positive, stored negative.
- **Every account has its own currency; there is no FX conversion.** Totals,
  charts, and net worth are always **grouped by currency** (JMD and USD shown
  side by side). Amounts render `en-JM`, e.g. `-$312.98 JMD`.
- **Balances are cached and recomputed server-side.** `Account.currentBalance`
  = `openingBalance + Σ(confirmed transaction amounts)`. It's recalculated after
  every create/edit/delete/confirm/transfer.
- **`pending_review` transactions never affect a balance until confirmed.**
  Email-parsed transactions arrive as `pending_review`; only confirming them in
  the Review page flips them to `confirmed` and moves the balance.
- **A transfer is two linked transactions** sharing a `transferGroupId` (out on
  the source, in on the destination). Transfers are **excluded from all
  income/expense/category rollups**, their legs **can't be edited**, and
  deleting either leg removes both.
- **DTOs convert `BigInt → Number` at the API boundary.** The database holds
  `BigInt`; API responses and the UI use plain numbers. CSV export renders major
  units (`4512.35`).

---

## 2. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16.2.10** (App Router, RSC) | `next dev` / `next build` / `next start` |
| UI runtime | **React 19.2.4** | Server + client components |
| Language | **TypeScript 5** | `strict`, path alias `@/* → src/*` |
| Auth | **NextAuth v5** (`next-auth@5.0.0-beta.31`) | Credentials provider, JWT sessions |
| Password hashing | **bcryptjs 3** | Cost factor 12 |
| ORM | **Prisma 7.8** | Client generated to `src/generated/prisma` |
| DB driver | **@prisma/adapter-pg 7.8** (`PrismaPg` over `pg`) | Postgres driver adapter |
| Database | **PostgreSQL** | Prod: Coolify Postgres; dev: `prisma dev` (PGlite) |
| Validation | **Zod 4** | All input schemas in `src/lib/validation.ts` |
| Charts | **Recharts 3** | Donut, income/expense bars, running-balance area |
| Icons | **lucide-react 1** | Icons-only rule (no emoji in UI chrome) |
| Styling | **Tailwind CSS v4** (CSS-first, `@utility` tokens) | Dark-only OLED theme |
| Email parsing | **postal-mime 2** | Server-side raw-MIME decode |
| Fonts | **Fira Sans** (body) / **Fira Code** (amounts) | via `next/font/google` |
| Icon gen | **sharp 0.35** | `scripts/generate-icons.mjs` (manual) |
| Testing | **Vitest 4** | Unit + integration + live webhook |
| Seed runner | **tsx 4** | `tsx prisma/seed.ts` |
| Deploy | **Docker** on **Coolify**; email via **Cloudflare Email Routing** | Auto-deploy on push (GitHub App) |

**npm scripts:** `dev`, `build`, `start`, `lint` (eslint), `test` (`vitest run`),
`test:watch`.

---

## 3. Architecture

- **App Router route groups.** Authenticated screens live under
  `src/app/(app)/` (wrapped by a layout with sidebar + mobile nav + FAB).
  `/login` and `/offline` sit outside it. API routes are `src/app/api/**/route.ts`.
- **Server/client split for DB safety.** Modules that touch Postgres are
  server-only (`src/lib/prisma.ts`, `accounts.ts`, `transactions.ts`,
  `analytics.ts`, `liabilities.ts`, `email-parser.ts`, …). Their **client-safe
  counterparts** hold pure logic + types (`account-shared.ts`,
  `transaction-shared.ts`, `budget-shared.ts`, `category-shared.ts`,
  `money.ts`). Client components import only the `*-shared` modules — importing a
  server module into the browser bundle breaks on `pg`/Node built-ins.
- **Auth at the edge, credentials at the server.** `src/lib/auth.config.ts` is a
  DB-free config (JWT strategy, callbacks). `src/lib/auth.ts` adds the
  Credentials provider (needs Prisma + bcrypt). `src/proxy.ts` (the Next 16
  proxy/middleware) does a JWT-only check with no DB call.
- **Request flow.** Browser → `proxy.ts` (redirects to `/login` if no session,
  except public paths) → RSC page or API route → server lib → Prisma →
  Postgres. Writes recompute the affected account balance(s) in the same
  transaction path.
- **Money boundary.** DB `BigInt` (minor units) → DTO mappers `Number(...)` →
  UI. Inbound writes convert major → minor via `BigInt(majorToMinor(x))`.

---

## 4. Data model

Generated Prisma client outputs to `src/generated/prisma`. All money fields are
signed `BigInt` minor units; non-money decimals use Postgres `Decimal`.

### Entities

- **User** — `id`, `email` (unique), `passwordHash`, `createdAt`. Single user.
- **Account** — `name`, `type` (AccountType), `currency` (default `JMD`),
  `openingBalance`, `currentBalance` (cached), `creditLimit?`, `monthlyBudget?`
  (planned monthly spend for liabilities), `color?`, `icon?`, `archived`,
  `createdAt`. Has `loanDetails?`, `transactions[]`, `budgetLines[]`,
  `parserRules[]`.
- **LoanDetails** — PK **is** `accountId` (1:1, `onDelete: Cascade`).
  `loanKind`, `originalPrincipal`, `interestRate` `Decimal(6,3)`, `termMonths`,
  `startDate`, `monthlyPayment`, `monthlyBudget?`, `lender?`, `nextPaymentDate?`.
- **Category** — `name`, `kind` (CategoryKind), self-relation tree
  `parentId?`/`children` (`onDelete: SetNull`), `color?`, `icon?`, `isDefault`.
  `@@unique([name, kind])`.
- **Vendor** — `name`, `nameNormalized` (unique, lowercased),
  `defaultCategoryId?` (remembered category), `usageCount`, `lastUsedAt?`.
- **Transaction** — `accountId` (`Cascade`), `amount` (signed), `occurredAt`,
  `categoryId?` (`SetNull`), `vendorId?` (`SetNull`), `description?`, `notes?`,
  `source` (TransactionSource), `status` (TransactionStatus), `rawEmailId?`
  (unique, `SetNull`), `transferGroupId?`, `createdAt`. Indexes on
  `[accountId, occurredAt]`, `[transferGroupId]`, `[status]`.
- **BudgetLine** — `name`, `categoryId` (`Restrict`), `amount`, `frequency`
  (BudgetFrequency), `paymentMethod` (PaymentMethod), `fundingAccountId`
  (`Restrict`), `normalizedMonthly`, `active`.
- **BudgetPeriodActual** — `periodLabel` (`"YYYY-MM"`), `categoryId` (`Cascade`),
  `budgeted`, `spent`. `@@unique([periodLabel, categoryId])`. A persisted
  monthly snapshot written whenever budget-vs-actual is computed.
- **IncomePlan** — `label`, `monthlyAmount`.
- **RawEmail** — `fromAddress`, `subject`, `body` (Text), `receivedAt`,
  `matchedRuleId?` (`SetNull`), `parseStatus` (ParseStatus),
  `createdTransactionId?`, `createdAt`.
- **ParserRule** — `name`, `senderMatch` (substring), `subjectPattern?` (regex),
  `bodyPattern` (regex w/ named groups), `accountId` (`Cascade`),
  `defaultDirection` (TxnDirection).
- **FxRate** — `fromCurrency`, `toCurrency`, `rate` `Decimal(14,6)`, `asOf`
  (Date), `source` (FxSource). `@@unique([fromCurrency, toCurrency, asOf])`.
  **Used only by the optional combined-currency view, which is not built** — the
  table and seed exist; no UI consumes it.

### Enums (all values)

| Enum | Values |
|---|---|
| `AccountType` | checking, savings, cash, credit_card, loan, investment, pension, ewallet, other |
| `LoanKind` | mortgage, auto, bank, personal, other |
| `CategoryKind` | expense, income, both |
| `TransactionSource` | manual, email |
| `TransactionStatus` | confirmed, pending_review |
| `BudgetFrequency` | weekly, biweekly, monthly, bimonthly, quarterly, semiannual, annual |
| `PaymentMethod` | cash, credit |
| `ParseStatus` | unparsed, parsed, failed, ignored |
| `TxnDirection` | outflow, inflow |
| `FxSource` | auto, manual |

### Seed (`prisma/seed.ts`, idempotent)

1. **Admin user** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt cost 12; throws
   if unset; re-run updates the password hash).
2. **Default categories** (`isDefault: true`): expense — Housing, Food,
   Transportation, Loans, Insurance, Health and Beauty, Personal Spending,
   Savings and Investments, Miscellaneous, Entertainment, Credit Card; income —
   Salary, Other Income; and a `both` category **Transfer**.
3. **One FX rate**: USD→JMD `155` (for the unbuilt combined view).

---

## 5. Feature guide (how to use each)

### 5.1 Signing in
Single-user credentials login at `/login`. Enter **Email** and **Password** →
**Sign in**. Bad credentials show "Invalid email or password." On success you
land on the Dashboard (or the `callbackUrl` you were redirected from). Sign out
from the desktop sidebar ("Sign out").

### 5.2 Navigation
Seven primary items (desktop sidebar **and** mobile bottom bar):
**Dashboard** (`/`), **Accounts** (`/accounts`), **Transactions**
(`/transactions`), **Budget** (`/budget`), **Loans & credit** (`/liabilities`),
**Categories** (`/categories`), **Review** (`/review`).

- **Desktop only:** a pinned **Settings** link and **Sign out** button at the
  bottom of the sidebar.
- **Mobile:** the 7 items as icons; **Settings and Sign out are not in the
  bottom nav** — reach Settings by URL.
- A floating **+ (Add Transaction)** button appears on every screen (hidden on
  the new-transaction page itself) and links to `/transactions/new`.

### 5.3 Dashboard (`/`)
A **period selector** (This month / Last month / This year — the only three
presets) drives the charts and totals. Sections:

1. **Net worth by currency** — one card per currency (liabilities already
   negative, so they subtract).
2. **Planned KPIs** (only if you have income or budget lines): **Planned surplus
   / deficit per month** (income − JMD expenses), **Cash vs credit per month**,
   and **Budget used** (% with progress bar; for This year the budget is scaled
   by months elapsed).
3. **Income vs expenses** — a bar chart per currency (last 6 or 12 months).
4. **Spending by category** — a donut per currency.
5. **Accounts** and **Liabilities** — grids of account cards. Credit cards show a
   utilization bar; loans show a payoff-progress bar. Cards link to the account
   detail page.

### 5.4 Accounts
**List (`/accounts`):** grouped by currency with a signed total per group;
toggle **Show/Hide archived**; **+ Account** to create.

**Create/edit (`account-form.tsx`):**
- **Name**, **Type** (the 9 account types), **Currency** (3-letter, upper-cased;
  suggests JMD/USD), **Opening balance** (labeled **"Amount owed"** for
  liabilities — enter positive, stored negative), **Icon** (emoji, optional).
- **Credit card** reveals **Credit limit** (required, > 0) and **Monthly budget**.
- **Loan** reveals a **Loan details** fieldset: Kind, Lender?, Original
  principal, Interest rate %, Term (months), Start date, Monthly payment,
  Monthly budget?, Next payment date?.

**Detail (`/accounts/{id}`):** KPI cards (current balance; cards → available
credit + utilization %; loans → payoff % + monthly payment), a running-balance
area chart (90 days), income-vs-expenses bars (6 months), a category donut, and
the last 20 transactions. **Record payment** (liabilities) deep-links to a
prefilled transfer.

**Archive vs delete:** accounts are **never hard-deleted** — the delete action
sets `archived: true` (history preserved). Toggle Archive/Unarchive (no confirm
dialog). Changing type away from loan/credit-card drops the loan details /
limit.

### 5.5 Transactions
**List (`/transactions`):** latest 100 grouped by day; filter by account (pill
nav); chips mark **Transfer** legs and **Pending** (review) items. Buttons:
**Transfer** and **+ Transaction**.

**Create/edit (`transaction-form.tsx`):**
- **Direction toggle:** **Money out** (red) / **Money in** (green) — sets the
  stored sign.
- **Account**, **Amount** (positive, in the account's currency), **Date** +
  **Time** (combined into `occurredAt`).
- **Vendor** — autocomplete (debounced `GET /api/vendors?q=`). Picking a
  suggestion fills the name and, if no category is chosen yet, auto-fills the
  vendor's remembered category (if valid for the current direction).
- **Category** — filtered by direction (money-out hides income categories,
  money-in hides expense; `both` always shown). First option is "— none —".
- **Description**, **Notes**.

**Delete:** on the edit page (non-transfer), a red Delete with a confirm; the
balance recomputes, and if the transaction came from an email, that email is
marked **ignored** (not deleted), so it won't resurface in Review.

### 5.6 Transfers
**Create (`/transfers/new`, optional `?from=&to=`):** pick **From** and **To**
accounts, **Amount**, and — **only when the two accounts differ in currency** —
a **Received** amount in the destination currency. Add Date/Time/Description.
Source and destination must differ.

- Creates two transactions sharing a `transferGroupId` (source negative, dest
  positive), both `confirmed`, both tagged the seeded **Transfer** category if it
  exists; both balances recompute.
- **Legs are immutable:** opening a transfer's edit URL shows a read-only view —
  "delete the transfer and recreate it to change anything." The API refuses PATCH
  on a leg (`409`).
- **Delete** removes **both** legs and recomputes every affected account.
- The **Pay / Record payment** buttons on account-detail and liabilities pages
  deep-link here with `?to={liabilityId}`.

### 5.7 Categories (`/categories`)
Kinds: **Expense / Income / Both**. Create with a name, kind, and a color (10
preset swatches). The list is grouped by kind; each row shows a transaction
count, Edit (inline; name + color), and Delete.

- **Delete is blocked (`409`)** if any **budget line** references the category
  ("Reassign them first"). Otherwise deleting keeps the transactions but nulls
  their category.
- Parent/child (`parentId`) exists in the model but the manager shows a flat,
  kind-grouped list.

### 5.8 Vendors
No dedicated page. Vendors are the **autocomplete memory** behind the
transaction Vendor field. On save the vendor is upserted (case-insensitive
unique name), `usageCount`/`lastUsedAt` bumped, and its category remembered.
Exportable as CSV from Settings.

### 5.9 Loans & credit (`/liabilities`)
A table of every credit-card and loan account: **Name, Limit, Balance,
Available, Budget, Spent, Remaining**, plus a **Pay** action per row.

- **Available** = `limit + balance` (cards only).
- **Budget** = card's `monthlyBudget`; for loans the loan's `monthlyBudget`,
  falling back to the scheduled `monthlyPayment`.
- **Spent (this calendar month, shown positive):** for **cards** = purchases
  (negative, non-transfer confirmed txns); for **loans** = payments received
  (positive confirmed txns).
- **Remaining** = `budget − spent`.

### 5.10 Budget (`/budget`)
**Summary KPIs:** Planned income / mo, Planned expenses / mo per currency (with a
Cash / Credit split), and **Surplus / Deficit / mo** (planned income − JMD
planned expenses).

**Budget vs actual:** a month navigator (`?month=YYYY-MM`, can't go past the
current month) with one meter per category — `spent of budgeted`, with an
explicit "over by {amount}" label (accessible; never color-only). Computing this
also **persists** a `BudgetPeriodActual` snapshot.

**Budget lines (CRUD):** Name, Category (expense/both), Amount, **Frequency**,
**Paid by** (Cash/Credit), **Funding account**. A live "≈ {amount}/mo" preview
shows the normalized monthly. Rows can be **Paused/Resumed**, edited, or deleted.

Frequency → occurrences/year (used in normalization):

| Frequency | Label | Occurrences/yr |
|---|---|---|
| weekly | Weekly | 52 |
| biweekly | Every 2 weeks | 26 |
| monthly | Monthly | 12 |
| bimonthly | Every 2 months | 6 |
| quarterly | Quarterly | 4 |
| semiannual | Twice a year | 2 |
| annual | Annual | 1 |

**Planned income (CRUD):** Label + Monthly amount. The surplus/deficit figure
updates from the sum.

### 5.11 Review & email ingestion (`/review`)
Three sections:

- **Pending transactions** — email-parsed `pending_review` items. **Confirm**
  (flips to confirmed and *now* moves the balance), **Edit first**, or
  **Discard** (marks the email ignored).
- **Unmatched emails** — RawEmails that no rule matched (`unparsed`) or that
  failed extraction (`failed`). Actions: **Create rule from this** (opens the
  rule form prefilled with the sender and this body as the test sample),
  **Re-parse** (after adding/fixing a rule), **Ignore**, **Delete**.
- **Parser rules** — list + add. Each rule shows sender → account and its body
  pattern.

**Parser rule form** has a **live regex tester**: paste a sample body and it
shows "Pattern matches ✓" with the extracted **amount / date / merchant /
direction** named-group values, or an "Invalid regex" / "does not match"
message — all client-side, before you save.

### 5.12 Settings (`/settings`)
One section: **Export data (CSV backup)**. Each entity has a **CSV** download
link (`/api/export?entity=…`): Transactions, Accounts, Loan details, Categories,
Vendors, Budget lines, Income plan, Budget vs actual history, Parser rules, Raw
emails. Amounts export in major units. No theme/profile/password UI (the app is
hard-dark; reporting currency is the `REPORTING_CURRENCY` env var).

### 5.13 PWA / offline / install
- **Manifest** (`/manifest.webmanifest`): name "Ledgerly", standalone
  display, theme `#0f172a`, 192/512/maskable icons. iOS `appleWebApp` metadata
  included.
- **Service worker** (`public/sw.js`): registered **in production only**.
  Network-first for navigations with an `/offline` fallback; cache-first for
  `/_next/static/` and `/icons/`; **never caches `/api/`** — data always needs
  the network.
- **Install:** Android Chrome → "Install app"; iOS Safari → Share → "Add to Home
  Screen". Launches standalone.
- **Offline page** (`/offline`): "You're offline — Ledgerly needs a
  connection to load your data."

---

## 6. Business rules & formulas

- **Balance recompute** (`recomputeBalance`): `currentBalance = openingBalance +
  Σ amount WHERE status = 'confirmed'`. `pending_review` is excluded, so parsed
  emails don't move balances until confirmed.
- **Signed amount** (`signedMinorAmount`): `BigInt(majorToMinor(|amount|))`,
  negated when direction is "out".
- **Budget normalization** (`normalizedMonthly`): `round(amountMinor ×
  occurrencesPerYear ÷ 12)`. Stored on write, recomputed on amount/frequency
  edits. (E.g. 65,000/yr annual → 5,416.67/mo; weekly ×52 ÷ 12.)
- **Cash-vs-credit split**: active budget lines' normalized monthly grouped by
  `paymentMethod`, per funding-account currency.
- **Surplus / deficit**: planned income − reporting-currency (JMD) planned
  expenses. (Non-JMD budget lines show as their own currency card but don't fold
  into this figure — a known limitation.)
- **Liability "spent this month"**: cards = |Σ negative confirmed non-transfer
  txns| this month; loans = Σ positive confirmed txns this month. `remaining =
  budget − spent`.
- **Period ranges** (`resolvePeriod`): half-open `[start, end)`. This-month =
  1st this month → 1st next month (6 chart months); last-month adjacency;
  this-year = Jan 1 → Jan 1 next year (12 chart months). Junk → this-month.
- **Dashboard rollups** (`analytics.ts`): all filtered to `status = 'confirmed'`
  **and `transferGroupId = null`** (transfers excluded), grouped by account
  currency. `budgetVsActual` additionally **persists** a `BudgetPeriodActual`
  row per category.
- **Vendor memory** (`upsertVendor`): normalize lowercase, upsert by
  `nameNormalized`; on hit bump `usageCount`/`lastUsedAt` and update
  `defaultCategoryId` only if a category was supplied; blank name → no vendor.

---

## 7. API reference

All routes are session-authenticated **except** the three inbound-email webhooks
(shared secret). Amounts in request bodies are **major units**; responses are
`Number` minor units unless noted.

### Session-authenticated

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth login/logout/session |
| GET, POST | `/api/accounts` | List (`?includeArchived=1`) / create (201) |
| GET, PATCH, DELETE | `/api/accounts/[id]` | Read / update (recomputes on opening-balance change) / soft-archive |
| GET, POST | `/api/transactions` | List (cursor paging: `accountId?,categoryId?,take,cursor`) / create (201) |
| GET, PATCH, DELETE | `/api/transactions/[id]` | Read / update (transfer leg → 409) / delete (transfer → deletes both legs) |
| POST | `/api/transactions/[id]/confirm` | Confirm a `pending_review` txn (then recompute) |
| GET | `/api/transactions/review` | Review queue: pending txns + unmatched emails |
| POST | `/api/transfers` | Create a two-leg transfer (cross-currency needs `toAmount`) |
| GET, POST | `/api/categories` | List (with counts) / create (409 on dup name+kind) |
| PATCH, DELETE | `/api/categories/[id]` | Update / delete (409 if used by budget lines) |
| GET | `/api/vendors` | Autocomplete (`?q=`, top 8 by usage/recency) |
| GET, POST | `/api/budget-lines` | List / create (stores `normalizedMonthly`) |
| PATCH, DELETE | `/api/budget-lines/[id]` | Update (recomputes normalized) / delete |
| GET, POST | `/api/income-plan` | List / create |
| PATCH, DELETE | `/api/income-plan/[id]` | Update / delete |
| GET | `/api/budget/actuals` | Budget vs actual for `?period=YYYY-MM` (persists snapshot) |
| GET | `/api/loans` | Liability rows (available/budget/spent/remaining) |
| GET | `/api/dashboard` | Net worth, income/expense, category spend, totals for `?period=` |
| GET, POST | `/api/parser-rules` | List / create (body regex must contain `(?<amount>…)`) |
| PATCH, DELETE | `/api/parser-rules/[id]` | Update / delete |
| PATCH, DELETE | `/api/raw-emails/[id]` | Set `parseStatus` (ignored/unparsed) / delete (409 if it made a txn) |
| POST | `/api/raw-emails/[id]/reparse` | Re-run rules on a stored email (409 if already parsed) |
| GET | `/api/export?entity=…` | CSV download for 10 entities |

### Inbound email (shared secret, rate-limited 30 req / 60 s → 429)

| Path | Auth | Body |
|---|---|---|
| `POST /api/inbound-email` | header `x-inbound-email-secret` or `Bearer` | JSON `{from?, subject?, text?, html?, raw?, receivedAt?}` — `raw` MIME (≤5 MB) is parsed and wins |
| `POST /api/inbound-email/sendgrid?key=…` | `?key=` query | `multipart/form-data` (`from, subject, text, html`) |
| `POST /api/inbound-email/postmark?key=…` | `?key=` query | JSON PascalCase (`From, Subject, TextBody, HtmlBody, Date`) |

All three return `{ id, outcome }` (201). `outcome.status` ∈ `parsed | failed |
unparsed`.

---

## 8. Email ingestion pipeline (deep dive)

**Flow:** bank → your inbox → forwarding rule → catch address → provider →
`POST /api/inbound-email*` → **RawEmail** created → `applyParserRules` → (maybe)
a `pending_review` **Transaction** → **Review** page → you confirm.

**`applyParserRules`** iterates rules by name:
1. Match sender via case-insensitive `from.includes(senderMatch)`; if
   `subjectPattern` is set it must also match.
2. The **first rule whose sender+subject match "claims" the email.** Its
   `bodyPattern` (a regex with a **required `(?<amount>…)` group** and optional
   `direction`, `date`, `merchant`) is run against the body. If the body regex is
   invalid, doesn't match, or the amount can't be parsed → the email is marked
   **`failed`** (it does **not** fall through to other rules).
3. On success: direction = parsed `direction` group, else the rule's
   `defaultDirection`; date = parsed `date`, else `receivedAt`; merchant → vendor
   (upserted). A Transaction is created `source: email`, **`status:
   pending_review`**, linked to the email. Balance is untouched until you confirm.
4. No rule matches → email marked **`unparsed`**.

**Helpers:** `parseRawMime` (postal-mime; decodes multipart/quoted-printable/
base64, strips envelope headers), `htmlToText`, `parseAmount` (strip to digits,
→ minor), `parseEmailDate` (dd-MMM-yyyy, ISO, dd/mm/yyyy **day-first**),
`parseDirection` (keyword match: debit/purchase/withdrawal → out;
credit/deposit/refund → in).

**Provider options** (see `docs/email-ingestion.md`): **A** Cloudflare Email
Routing (Worker forwards raw MIME to the generic endpoint — *this is what's
deployed*), **B** SendGrid Inbound Parse, **C** Postmark inbound. B and C pass
the secret via `?key=` because they can't send custom headers.

---

## 9. Design system

- **Tailwind v4, CSS-first** (`src/app/globals.css`): `@import "tailwindcss"`,
  tokens in `@theme inline`, no `tailwind.config.js`. Dark-only (the `<html>`
  carries a hardcoded `dark` class).
- **Palette:** background `#0F172A`, surface `#101A34`, primary (trust blue)
  `#1E40AF`, accent (profit green) `#059669`, destructive `#DC2626`, positive
  `#34D399`, negative `#F87171`, muted text `#8BA0BF`.
- **Fonts:** Fira Sans (body), Fira Code (amounts, `tabular-nums`).
- **`@utility` token classes:** `card`, `input`, `label`, `btn` + `btn-primary`
  (green), `btn-secondary` (blue), `btn-ghost`, `btn-danger`, `amount`; plus
  `.amount-negative/-positive/-zero` for sign→color. `prefers-reduced-motion`
  respected.
- **Icons:** lucide-react only (no emoji in chrome).
- **Chart colors** (`src/lib/chart-colors.ts`): 8 fixed-order CVD-safe
  categorical slots + income/expense pair, validated against surface `#101A34`.
  Re-run the dataviz validator before changing them.

---

## 10. Local development

Docker Desktop's WSL bootstrap is broken on the dev machine, so **use the Prisma
Postgres local server, not Docker**:

```bash
npx prisma dev --detach          # starts the local DB (PGlite); ports vary per run
npx prisma dev ls                # read the current ports
# update DATABASE_URL (+ SHADOW_DATABASE_URL) in .env to match
npx prisma db push               # sync schema (migrate dev fails P1017 on PGlite)
npx prisma db seed               # create admin user + default categories + FX rate
npm run dev                      # http://localhost:3000
```

Schema changes: edit `prisma/schema.prisma` → `db push` → **restart the dev
server** (it caches the generated client). For deployable migrations, generate
SQL offline with `prisma migrate diff` into `prisma/migrations/`.

Key files: `next.config.ts` (empty/defaults), `prisma.config.ts` (schema,
migrations, seed, optional shadow DB), `tsconfig.json` (alias `@/*`),
`postcss.config.mjs` (Tailwind v4), `eslint.config.mjs` (flat, next config).

---

## 11. Testing

`npm test` (Vitest). Integration tests share one `jan_test` database, so vitest
runs files **serially** (`fileParallelism: false`).

- **Unit** (`tests/unit/`, no DB): money math, budget normalization, period
  ranges, Zod validation, email parsing (incl. `parseRawMime`), account-shared
  helpers.
- **Integration** (`tests/integration/`, real `jan_test` DB synced by
  `tests/global-setup.ts` via `prisma db push`): balance recompute, vendor
  upsert memory, the email pipeline (`applyParserRules`), budget-vs-actual +
  monthly rollups.
- **Live webhook** (`tests/integration/webhook.test.ts`): hits the dev server on
  `:3000` and **self-skips when it's down**. Covers all three inbound endpoints
  (401/400/201, incl. raw-MIME, SendGrid multipart, Postmark JSON) and that the
  rest of the API requires auth.

Current suite: **65 tests** passing.

---

## 12. Deployment & operations

**Docker (`Dockerfile`):** single-stage `node:22-alpine`; `npm ci` → `prisma
generate` → `next build`. **Boot:** `prisma migrate deploy && prisma db seed &&
next start` on port 3000 (Prisma CLI + tsx kept in the image so migrations/seed
run on boot; seed is idempotent).

**Coolify (`docs/deploy-coolify.md`):** Postgres resource → internal
`DATABASE_URL`; deploy this repo (auto-detects the Dockerfile); set env vars;
assign domain → Let's Encrypt + force HTTPS; enable scheduled Postgres backups.

**Live setup:** `ledgerly.philliplogan.com` on Coolify (Oracle Cloud), DNS on
Cloudflare, email via Cloudflare Email Routing → Worker → `/api/inbound-email`.
**Auto-deploy** is on: the Coolify Git Source uses the **GitHub App**
(`coolify-github-irpl`), so every `git push` to `main` triggers a webhook build.
(The pull-only "Public GitHub" source method does **not** auto-deploy — that was
the original misconfiguration.)

### Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `AUTH_SECRET` | NextAuth JWT signing secret, 32+ bytes (required) |
| `AUTH_TRUST_HOST` | `true` in prod (Auth.js behind Coolify's proxy) |
| `APP_BASE_URL` | Public base URL (`https://ledgerly.philliplogan.com`) |
| `REPORTING_CURRENCY` | Base reporting currency (`JMD`) |
| `INBOUND_EMAIL_SECRET` | Shared secret for the email webhook (header, or `?key=`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Single-user login (seed creates/updates it) |
| `SHADOW_DATABASE_URL` | Optional — shadow DB for `prisma dev`/migrations |
| `FX_API_URL` / `FX_API_KEY` | Only for the (unbuilt) combined-currency view |

---

## 13. What's intentionally not built

- **Combined-currency / FX view** (spec §3.1): the `FxRate` table + seed exist,
  but the toggle, daily rate fetch, and single JMD-converted net-worth figure do
  not. Totals stay per-currency.
- **Custom dashboard date range**: only This month / Last month / This year.
- **Non-JMD budget lines in surplus/deficit**: they show as their own currency
  card but don't fold into the JMD surplus figure.
- **Category parent/child UI**: the tree exists in the model; the manager shows a
  flat, kind-grouped list.
- **Other spec §12 ideas**: recurring-transaction reminders, receipt uploads,
  rule-based auto-categorization, scheduled report digests.
- The inbound-email rate limiter is in-memory (fine for the single-container
  deploy).

---

*Related docs: `docs/finance-app-plan.md` (the v2 build spec), `AGENTS.md`
(conventions & dev quirks), `docs/NEXT-STEPS.md` (status/hand-off),
`docs/deploy-coolify.md`, `docs/email-ingestion.md`.*
