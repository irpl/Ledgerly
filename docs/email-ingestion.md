# Email ingestion setup (Option A — Cloudflare Email Routing)

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

## 2. Cloudflare Email Worker

Enable Email Routing on your domain, create a catch address (e.g.
`bank@yourdomain.com`), and bind this Worker to it:

```js
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    // Minimal MIME handling: forward the raw text; the app strips HTML.
    await fetch(`${env.APP_BASE_URL}/api/inbound-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-inbound-email-secret": env.INBOUND_EMAIL_SECRET,
      },
      body: JSON.stringify({
        from: message.from,
        subject: message.headers.get("subject") ?? "",
        text: raw,
        receivedAt: new Date().toISOString(),
      }),
    });
  },
};
```

Set `APP_BASE_URL` and `INBOUND_EMAIL_SECRET` as Worker secrets, then point your
mailbox's forwarding rule for bank alerts at the catch address.

> For cleaner text extraction, parse MIME in the Worker with `postal-mime`
> (`npm i postal-mime`) and send `text`/`html` parts separately.

## 3. Parser rules

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
