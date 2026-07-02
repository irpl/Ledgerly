# Personal Finance Tracker — Build Specification (v2)

> Handoff document for implementation. Describes **what to build**, the **data model**, the **key logic decisions**, and **how to deploy on Coolify**. Decisions made on the user's behalf are flagged **[Assumption]**; open questions are flagged **[Confirm]**.
>
> **v2** reconciles the spec with the user's existing spreadsheet (`App_Info.xlsx`). Changes from v1 are summarized in §0.

---

## 0. What changed after reviewing the spreadsheet

The user's Numbers/Excel workbook revealed real usage that overrides earlier guesses:

1. **Multi-currency accounts, conversion optional.** Accounts exist in JMD and USD; each keeps its native currency and totals are shown **per currency** by default. A single JMD-converted "combined" figure is an optional toggle (see §3.1). v1's "single currency" assumption is **reversed**, but forced conversion is **not** required.
2. **Budgeting is line-item based**, not flat category limits. Each planned expense has an amount, a **billing cycle in weeks**, a payment method (cash/credit), and a funding account, with a derived normalized monthly figure (see §5.4).
3. **Frequency normalization uses a true 12-month calendar:** each budget line's amount is annualized by its frequency, then `monthly = annualAmount ÷ 12`. *(Replaces the legacy 4-week/13-month convention.)*
4. **Planned spend is split cash vs credit**, and **planned income (salary + other) drives a surplus/deficit** figure (see §5.4, §5.6).
5. **Loans + credit card are one liability table** with limit/balance/available AND a per-loan monthly budget + remaining. **Remaining = budget − spent** (plain; the legacy 3,000-buffer rule is dropped).
6. **Category taxonomy and account list** now seeded from real data (see §3.3, §5.1).
7. Historical transactions merged vendor into "Description"; kept as separate fields, vendor memory seeded from it (see §5.2).

---

## 1. Overview

A self-hosted, single-user personal finance web app, installable to a phone as a PWA and fully usable on desktop. Tracks multiple accounts across currencies, income vs. expenses, line-item budgets, loans, and credit-card availability, and ingests bank transaction alerts via forwarded email.

**Core principles**
- **Sign convention:** money **out is negative**, money **in is positive**. Stored signed, displayed red (negative) / green (positive). *(Confirmed by the sheet: e.g. `+1750` in, `−312.98` out.)*
- **Nothing exists by default** — the user creates all accounts. Default *categories* are seeded but editable/deletable.
- **Parsing is never trusted blindly** — email-ingested transactions land in a review queue before affecting balances.

---

## 2. Recommended tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)** full-stack | One repo, one container: UI + API. SvelteKit acceptable. |
| Language | TypeScript | |
| DB | **PostgreSQL** | Coolify one-click service. |
| ORM | **Prisma** (or Drizzle) | Migrations included. |
| Auth | Credentials (email + hashed password) via Auth.js/Lucia | Single user, but internet-facing → auth mandatory. |
| Charts | **Recharts** (or Chart.js) | |
| Styling | Tailwind CSS | Responsive by default. |
| PWA | `next-pwa` or hand-written service worker + manifest | Installable, offline app shell. |

---

## 3. Currency, accounts & core logic

### 3.1 Currency [Assumption]
- **Reporting currency: JMD.**
- Each account has its own `currency` (e.g. JMD, USD). **Balances always display in the account's native currency** — no conversion is applied to individual accounts.
- **Totals and dashboards group by currency.** Net worth / income / expense rollups show a separate figure per currency (e.g. a JMD total and a USD total side by side) rather than forcing everything into one number. This is the default and needs no FX at all.
- **Optional combined view (off by default):** a toggle that *additionally* shows a single JMD-converted total for convenience. Only when this is enabled do FX rates matter — then rates are auto-fetched daily into `FxRate` (fallback to last-known; manual override per pair), seeded with USD→JMD ≈ 155. If the toggle stays off, the FX table and scheduled fetch are simply unused.
- **[Assumption]** "not necessarily converted" is read as: conversion is optional, not required. If you never want a combined figure, the FX pieces can be dropped entirely.

### 3.2 Sign & balance logic (implement exactly)
- **Asset accounts** (checking, savings, cash, e-wallet, investment, pension): spending negative, income positive. `endingBalance = openingBalance + Σ(in) − Σ(out)`. *(Matches sheet: `E = B + C − D`.)*
- **Credit card:** `currentBalance` negative when owed. **Available credit = creditLimit + currentBalance** (limit 500,000, available 259,388 → owed 240,611). *(Sheet models this as `balance = limit − available`; same relationship.)*
- **Loan:** `currentBalance` negative = remaining principal; payments move it toward 0. Payoff progress = 1 − (remaining ÷ originalPrincipal).
- **Transfers** (paying a card/loan from an account) = two linked transactions sharing `transferGroupId`, negative on source + positive on destination. **Excluded from income/expense dashboards** to avoid double-counting.
- **Net worth** = Σ(account balances converted to base currency); liabilities already negative → assets − debts.

### 3.3 Account types & seed list
Types: `checking`, `savings`, `cash`, `credit_card`, `loan`, `investment`, `pension`, `ewallet`, `other`.

Real accounts in use (create as examples, not defaults): Cash, NCB, CIBC, VM joint, VM, GiftMe, JMMB JMD, JMMB USD (USD), Pension ATL (`pension`), Credit Union Shares (`investment`), Lynk (`ewallet`), Home Saver (`savings`). Liabilities: Credit Card, Car Loan, Bank Loan, Mortgage VM, Mortgage NHT.

---

## 4. Data model

Money stored as integer **minor units**; per-account `currency`. Amounts signed.

### Account
`id, name, type(enum §3.3), currency, openingBalance:int, currentBalance:int (cached), creditLimit:int?, color?, icon?, archived:bool, createdAt`

### LoanDetails (1:1 with `type = loan`)
`accountId, loanKind(mortgage|auto|bank|personal|other), originalPrincipal:int, interestRate:decimal, termMonths:int, startDate, monthlyPayment:int, monthlyBudget:int?, lender?, nextPaymentDate?`

### FxRate (only used if the optional combined view is enabled — see §3.1)
`id, fromCurrency, toCurrency, rate:decimal, asOf:date, source(auto|manual)`

### Category
`id, name, kind(expense|income|both), parentId?, color?, icon?, isDefault:bool`
Two levels supported via `parentId`: **group** (Housing) → **line** naming handled by BudgetLine, so categories stay at the group level.

**Seed groups (editable):** Housing, Food, Transportation, Loans, Insurance, Health and Beauty, Personal Spending, Savings and Investments, Miscellaneous, Entertainment, Credit Card. Income kind: Salary, Other Income, Transfer.

### Vendor (autocomplete)
`id, name(unique, ci), defaultCategoryId?, usageCount:int, lastUsedAt`
On save: upsert vendor, bump `usageCount`/`lastUsedAt`, remember category. Autocomplete by prefix/substring ordered by `usageCount desc, lastUsedAt desc`. **Seed from historical "Description" values** (e.g. Google, Akilah, Maxim).

### Transaction
`id, accountId, amount:int (signed), occurredAt:datetime, categoryId?, vendorId?, description?, notes?, source(manual|email), status(confirmed|pending_review), rawEmailId?, transferGroupId?, createdAt`
*(Legacy sheet columns Date/Category/Description/Account/Amount map to occurredAt/categoryId/vendor+description/accountId/amount. Time defaults to 00:00 if unknown.)*

### BudgetLine (recurring planned expense — the core of budgeting)
`id, name, categoryId, amount:int, frequency(enum), paymentMethod(cash|credit), fundingAccountId, normalizedMonthly:int (derived), active:bool`
- **Frequency enum:** `weekly, biweekly, monthly, bimonthly, quarterly, semiannual, annual`. Each maps to occurrences/year (52, 26, 12, 6, 4, 2, 1).
- **Derived monthly (true calendar):** `normalizedMonthly = round(amount × occurrencesPerYear ÷ 12)`. E.g. annual 65,000 → 65,000 ÷ 12 ≈ 5,417/mo; monthly 150,000 → 150,000/mo.
- **Legacy migration:** the sheet's `cycleWeeks` maps to frequency (4→monthly, 8→bimonthly, 26→semiannual*, 52→annual; treat 6 as monthly or set explicitly). *Note: the old sheet divided by a 4-week month; recomputing on the 12-month calendar will shift some monthly figures slightly — this is expected.*

### BudgetPeriodActual (month-by-month budget vs actual, per category group)
`id, periodLabel(e.g. "2025-06"), categoryId, budgeted:int, spent:int`
`spent` = Σ confirmed expense transactions in period for that category; `budgeted` = Σ `normalizedMonthly` of that category's BudgetLines. *(Mirrors "Budget - Table 3-1".)*

### IncomePlan
`id, label(Salary|Other Income|…), monthlyAmount:int` → planned income side of surplus/deficit.

### RawEmail
`id, fromAddress, subject, body:text, receivedAt, matchedRuleId?, parseStatus(unparsed|parsed|failed|ignored), createdTransactionId?`

### ParserRule
`id, name, senderMatch, subjectPattern?, bodyPattern (regex w/ named groups amount|date|merchant|direction?), accountId, defaultDirection(out|in)`

---

## 5. Feature specs

### 5.1 Accounts
CRUD with type picker; credit-card type reveals `creditLimit`; loan type reveals LoanDetails (incl. `monthlyBudget`). Per-account `currency`. Detail view: balance (native + base-converted), recent transactions, income-vs-expense chart, and — for cards — available credit + utilization %, for loans — payoff progress + next payment.

### 5.2 Manual transactions
Fields: account, amount, direction toggle (sets sign), date **and** time, category, vendor (autocomplete → auto-fills remembered category), description, notes. Superset of the legacy sheet's five columns.

### 5.3 Categories
CRUD, colors/icons, optional subgroups. Seed groups per §4.

### 5.4 Budgets (line-item model)
- **BudgetLines table UI:** name, category, amount, cycle (weeks), payment method, funding account, derived monthly. Editing recomputes monthly.
- **Cash vs Credit split:** sum `normalizedMonthly` grouped by `paymentMethod` → "Monthly Cash" / "Monthly Credit". *(Sheet: Table 3.)*
- **Rollup:** Total Monthly Expenses = Σ all `normalizedMonthly` (calendar-month basis, §4).

### 5.5 Email ingestion — the hard part
Flow: **Bank → inbox → forwarding rule → dedicated address → server → RawEmail → parser → review queue → transaction.**

Ingestion options (self-hosting inbound SMTP is painful — port 25, PTR, spam):
- **Option A (recommended):** Cloudflare Email Routing → Email Worker → authenticated `POST /api/inbound-email`. Free, no SMTP server; needs domain DNS on Cloudflare.
- **Option B:** Inbound-parse service (Mailgun/Postmark/SendGrid) POSTs to the webhook. Minimal setup; third party sees mail.
- **Option C:** Fully self-hosted SMTP container (Haraka/Mailcow/`smtp-server`). Only if zero third parties required; needs port 25 + MX + PTR.

**[Assumption]** Build for A; keep endpoint provider-agnostic: `POST /api/inbound-email` accepts `{from, subject, text, html, receivedAt}`.

Behavior: verify shared secret → store RawEmail → first matching ParserRule extracts fields → create Transaction (`source=email`, `status=pending_review`) → vendor upsert. Failures surface in the **review queue**, where the user fixes fields or creates a ParserRule from the raw email, then confirms (→ affects balance) or discards.

### 5.6 Dashboards & visualization
- **Overall:** net worth **shown per currency** (separate JMD and USD totals; optional combined JMD figure per §3.1), balances, income vs expense over time, category donut, budget progress, credit utilization, loan payoff, **planned income vs planned expenses → surplus/deficit** *(sheet: Table 3 `deficit/surplus = income − expenses`)*, **cash vs credit monthly split**.
- **Per-account:** income vs expense over time, category breakdown, running balance (native currency).
- **Budget vs actual by category** for a selected month (BudgetPeriodActual). *(Table 3-1.)*
- Period selector (this month / last / year / custom) applied across charts. Rollups group by currency; only the optional combined view applies FX.

### 5.7 Loans & credit card (shared liability view)
Table columns: name, credit limit, current balance, available credit, monthly budget, spent, remaining. Available credit = limit + balance (cards). Loans show payoff progress, rate, next payment. **Remaining = budget − spent** for both cards and loans (the legacy 3,000 buffer is dropped). **Loan payments are treated wholly as principal:** a payment is a transfer from the funding account into the loan account, reducing remaining principal by the full amount (no interest/principal split in v1).

---

## 6. PWA requirements
`manifest.json` (name, 192/512 + maskable icons, `display: standalone`, theme/bg colors); service worker caching the app shell for offline open (data needs network). Meet Add-to-Home-Screen criteria on iOS Safari + Android Chrome; test the iOS install path explicitly.

## 7. Responsive/UX
Mobile-first; bottom nav on mobile, sidebar on desktop. Fast floating "add transaction" button. Amounts negative-red / positive-green everywhere. Show native currency on the account, base currency on rollups.

## 8. API surface
`/api/accounts`, `/api/transactions`, `/api/transactions/review`, `/api/categories`, `/api/vendors?q=`, `/api/budget-lines`, `/api/budget/actuals?period=`, `/api/income-plan`, `/api/loans`, `/api/fx-rates`, `/api/parser-rules`, `/api/inbound-email` (shared-secret), `/api/dashboard?period=`. All except the webhook require an authenticated session.

## 9. Security
Hash passwords (argon2/bcrypt); session cookies `httpOnly`/`secure`/`sameSite`. Webhook protected by strong shared secret; rate-limit auth + webhook. Force HTTPS (Coolify Let's Encrypt). Provide CSV export of all data for backup.

---

## 10. Coolify deployment
1. **Postgres:** add a PostgreSQL resource (one-click); note the connection string.
2. **App:** deploy the Git repo (Nixpacks auto-detects Next.js, or provide a `Dockerfile`).
3. **Env vars:** `DATABASE_URL`, `AUTH_SECRET` (32+ bytes), `APP_BASE_URL`, `INBOUND_EMAIL_SECRET`, `REPORTING_CURRENCY=JMD`. *Only if the optional combined view (§3.1) is enabled:* `FX_API_URL` (+ `FX_API_KEY` if needed) and a daily scheduled task to refresh FX (whitelist the provider's domain in Coolify egress).
4. **Domain + SSL:** assign domain in Coolify → automatic Let's Encrypt; force HTTPS.
5. **Migrations + seed** (categories, example FX rate) on deploy via release hook.
6. **Volume:** not needed if all data is in Postgres; add one only for future receipt uploads.
7. **Email (Option A):** enable Cloudflare Email Routing, create catch address + Email Worker POSTing to `${APP_BASE_URL}/api/inbound-email` with the secret header; point the bank-alert forwarding rule at the catch address.
8. **Backups:** enable Coolify scheduled Postgres backups.

## 11. Build order
1. Auth + accounts CRUD + native-currency balances + per-currency totals + signed balances. *(Optional FX/combined view can come later or be skipped.)*
2. Categories (seed) + manual transactions + vendor autocomplete.
3. Transfers + credit-card availability + loans (liability table).
4. Budget lines + cash/credit split + income plan + surplus/deficit.
5. Budget-vs-actual by category + dashboards/charts.
6. Email ingestion (webhook → RawEmail → ParserRule → review queue).
7. PWA polish + CSV export + backups.

## 12. Optional future enhancements
Recurring-transaction reminders from BudgetLines; receipt uploads; rule-based auto-categorization; scheduled email/report digests; multi-user shared accounts.
