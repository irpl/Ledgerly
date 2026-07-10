# Deploying on Coolify

Follows §10 of the spec (`finance-app-plan.md`).

## 1. Postgres

Add a **PostgreSQL** resource (one-click). Note the internal connection string —
it becomes `DATABASE_URL`.

## 2. App

Deploy this Git repo as an application. The repo ships a `Dockerfile` (Coolify
will pick it up automatically; Nixpacks also works if you prefer). On boot the
container runs `prisma migrate deploy` and the idempotent seed (creates/updates
the login user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the default categories),
then starts Next.js on port 3000.

## 3. Environment variables

| Var | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `AUTH_SECRET` | 32+ random bytes (`openssl rand -base64 32`) |
| `APP_BASE_URL` | `https://your-domain` |
| `INBOUND_EMAIL_SECRET` | strong random string for the email webhook |
| `INBOUND_EMAIL_DOMAIN` | inbound mail domain (e.g. `bank.your-domain`) — shown on Settings as each user's per-user inbound address |
| `REPORTING_CURRENCY` | `JMD` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin login (seed marks this user `role=admin`) |
| `AUTH_TRUST_HOST` | `true` (Auth.js behind Coolify's proxy) |

## 4. Domain + SSL

Assign your domain in Coolify → automatic Let's Encrypt. Force HTTPS.

## 5. Email ingestion

See `docs/email-ingestion.md` — Cloudflare Email Routing (Option A, Worker →
`${APP_BASE_URL}/api/inbound-email`), SendGrid Inbound Parse (Option B →
`…/api/inbound-email/sendgrid?key=…`), or Postmark inbound (Option C →
`…/api/inbound-email/postmark?key=…`; works with any DNS host, or with no DNS
at all via Postmark's hosted address), then forward bank alerts to the catch
address.

## 6. Backups

Enable Coolify's scheduled Postgres backups on the database resource. CSV
exports (Settings page in the app) are a secondary, human-readable backup.

## 7. PWA install

After deploying with HTTPS, open the site on your phone: Android Chrome offers
"Install app"; on iOS Safari use Share → **Add to Home Screen**. Test the iOS
path explicitly per the spec — the manifest, icons, and service worker are
already wired up.
