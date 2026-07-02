# Email ingestion setup

Two supported intake paths:

- **Option A — Cloudflare Email Routing** (§2): requires the domain's DNS to be
  on Cloudflare. Uses the generic JSON endpoint.
- **Option B — SendGrid Inbound Parse** (§3): works with any DNS host (e.g.
  Netlify) — you only add one MX record for a subdomain. Uses the dedicated
  `/api/inbound-email/sendgrid` adapter. Caveat: SendGrid's fraud screening
  is aggressive about auto-closing new free accounts.
- **Option C — Postmark inbound** (§4): also DNS-host-agnostic; friendlier
  signup than SendGrid, and you can even skip DNS entirely by forwarding to
  Postmark's hosted inbound address. Uses `/api/inbound-email/postmark`.

Bank alerts flow: **bank → your inbox → forwarding rule → catch address →
Cloudflare Email Worker → `POST /api/inbound-email` → review queue**.

The endpoint is provider-agnostic: any service that can POST
`{ from, subject, text?, html?, receivedAt? }` with the shared secret works
(Mailgun/Postmark/SendGrid inbound parse, or a self-hosted SMTP bridge).

## 1. Endpoint contract

```
POST {APP_BASE_URL}/api/inbound-email
Header: x-inbound-email-secret: {INBOUND_EMAIL_SECRET}
Body: { "from": "...", "subject": "...", "text": "...", "html": "...", "receivedAt": "ISO-8601" }
```

Responses: `201` with `{ id, outcome }`, `401` bad secret, `429` rate-limited.
Parsed transactions are created as `pending_review` — balances change only after
you confirm them on the **Review** page.

## 2. Option A: Cloudflare Email Worker

Enable Email Routing on your domain, create a catch address (e.g.
`bank@yourdomain.com`), and bind this Worker to it:

```js
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const res = await fetch(`${env.APP_BASE_URL}/api/inbound-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-inbound-email-secret": env.INBOUND_EMAIL_SECRET,
      },
      body: JSON.stringify({
        // Send the full raw MIME; the app parses it (postal-mime) into clean
        // text/html/from/subject. from/subject here are only fallbacks.
        from: message.from,
        subject: message.headers.get("subject") ?? "",
        raw,
        receivedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`inbound-email POST failed: ${res.status}`);
  },
};
```

Set `APP_BASE_URL` and `INBOUND_EMAIL_SECRET` as Worker secrets, then point your
mailbox's forwarding rule for bank alerts at the catch address.

> The endpoint decodes the raw MIME server-side (multipart, quoted-printable,
> base64) via `postal-mime`, so the Worker just forwards `raw` — no MIME
> handling needed in the Worker itself.

## 3. Option B: SendGrid Inbound Parse (DNS stays put)

SendGrid receives mail for a subdomain and POSTs each message to the app as
`multipart/form-data`. Because SendGrid cannot send custom headers, the shared
secret travels as a `key` query parameter to a dedicated adapter route:

```
POST {APP_BASE_URL}/api/inbound-email/sendgrid?key={INBOUND_EMAIL_SECRET}
```

Setup:

1. **DNS** (at your DNS host, e.g. Netlify): add an MX record for a dedicated
   subdomain — host `bank` (→ `bank.yourdomain.com`), value `mx.sendgrid.net`,
   priority `10`. Nothing else on the domain changes.
2. **SendGrid**: create a free account, then
   - **Settings → Sender Authentication**: authenticate the domain if
     prompted (inbound-only setups can skip full DKIM).
   - **Settings → Inbound Parse → Add Host & URL**: host
     `bank.yourdomain.com`, URL
     `https://your-domain/api/inbound-email/sendgrid?key=<INBOUND_EMAIL_SECRET>`.
   - Leave **“POST the raw, full MIME message”** unchecked — the adapter
     expects SendGrid's parsed `text`/`html` fields, not raw MIME.
3. **Forwarding rule** in your inbox: forward bank alerts to any address at
   the subdomain (e.g. `alerts@bank.yourdomain.com` — Inbound Parse accepts
   all local parts on the host).

Responses match the generic endpoint (`201` / `401` / `429`); parsed
transactions land in the review queue the same way. Note the webhook URL
contains the secret — treat SendGrid's Inbound Parse settings page as
sensitive.

## 4. Option C: Postmark inbound

Postmark POSTs each inbound message as JSON (`From`, `Subject`, `TextBody`,
`HtmlBody`, `Date`, …) to a webhook. The shared secret travels as a `key`
query parameter, same as Option B:

```
POST {APP_BASE_URL}/api/inbound-email/postmark?key={INBOUND_EMAIL_SECRET}
```

Setup:

1. **Postmark**: create an account (free developer tier: 100 emails/month —
   plenty for bank alerts), create a **Server**, open its **Inbound** message
   stream, and set the webhook URL to
   `https://your-domain/api/inbound-email/postmark?key=<INBOUND_EMAIL_SECRET>`.
2. **Pick an address** — two ways:
   - **Zero DNS**: the stream's settings show a hosted inbound address like
     `abc123…@inbound.postmarkapp.com`. Forward bank alerts straight to it.
     No DNS changes at all.
   - **Own subdomain** (nicer address): add an MX record at your DNS host —
     host `bank` (→ `bank.yourdomain.com`), value `inbound.postmarkapp.com`,
     priority `10` — and set that domain as the stream's inbound domain. Then
     any address at the subdomain works (e.g. `alerts@bank.yourdomain.com`).
3. **Forwarding rule** in your inbox: forward bank alerts to the address from
   step 2.

Responses match the other endpoints (`201` / `401` / `429`). As with Option B,
the webhook URL contains the secret — treat Postmark's server settings page as
sensitive.

## 5. Parser rules

A rule matches by **sender contains** (+ optional subject regex) and extracts
fields from the body with a regex using named groups:

- `(?<amount>…)` — required, e.g. `[\d,]+\.\d{2}`
- `(?<merchant>…)`, `(?<date>…)`, `(?<direction>…)` — optional

Example for an alert like
`"Your account was debited JMD 4,512.35 at HI-LO PORTMORE on 02-Jul-2026"`:

```
(?<direction>debited|credited).*?(?<amount>[\d,]+\.\d{2}).*?at (?<merchant>.+?) on (?<date>\d{2}-\w{3}-\d{4})
```

Create rules on the Review page — unmatched emails have a "Create rule from
this" button that pre-fills the sender and lets you test the regex against the
actual email body before saving.
