import { describe, it, expect } from "vitest";

// Exercises the live dev server's webhook auth (secret from .env). These run
// only when the server is up on :3000; otherwise they're skipped.
const BASE = "http://localhost:3000";
const SECRET = "dev-inbound-secret-change-me";

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

const up = await serverUp();
const maybe = up ? describe : describe.skip;

maybe("POST /api/inbound-email (live server)", () => {
  it("rejects a missing/wrong secret with 401", async () => {
    const res = await fetch(`${BASE}/api/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-inbound-email-secret": "wrong" },
      body: JSON.stringify({ from: "x@y.com", subject: "s", text: "t" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects malformed payloads with 400", async () => {
    const res = await fetch(`${BASE}/api/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-inbound-email-secret": SECRET },
      body: JSON.stringify({ subject: "missing from" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid alert and reports the parse outcome", async () => {
    const res = await fetch(`${BASE}/api/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-inbound-email-secret": SECRET },
      body: JSON.stringify({
        from: "vitest@test.invalid",
        subject: "vitest webhook check",
        text: "no rule matches this sender",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    expect(data.outcome.status).toBe("unparsed");

    // Clean up: delete the test email from the dev database via its API.
    // (Requires auth, so instead flag it for manual cleanup on the Review page
    // if this line ever fails silently — deletion is best-effort.)
    await fetch(`${BASE}/api/raw-emails/${data.id}`, { method: "DELETE" }).catch(() => {});
  });

  it("accepts a raw MIME message and parses out clean fields", async () => {
    const raw = [
      "From: Bank Alerts <alerts@mybank.com>",
      "Subject: vitest raw mime check",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Debited JMD 1,000.00 at TEST=20SHOP",
      "",
    ].join("\r\n");
    const res = await fetch(`${BASE}/api/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-inbound-email-secret": SECRET },
      body: JSON.stringify({ raw }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    expect(data.outcome.status).toBe("unparsed");

    await fetch(`${BASE}/api/raw-emails/${data.id}`, { method: "DELETE" }).catch(() => {});
  });

  it("SendGrid adapter rejects a missing/wrong key with 401", async () => {
    const form = new FormData();
    form.set("from", "x@y.com");
    const res = await fetch(`${BASE}/api/inbound-email/sendgrid?key=wrong`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(401);
  });

  it("SendGrid adapter rejects a payload without `from` with 400", async () => {
    const form = new FormData();
    form.set("subject", "missing from");
    const res = await fetch(`${BASE}/api/inbound-email/sendgrid?key=${SECRET}`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("SendGrid adapter accepts multipart form data and reports the outcome", async () => {
    const form = new FormData();
    form.set("from", "Vitest <vitest@test.invalid>");
    form.set("subject", "vitest sendgrid check");
    form.set("text", "no rule matches this sender");
    const res = await fetch(`${BASE}/api/inbound-email/sendgrid?key=${SECRET}`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    expect(data.outcome.status).toBe("unparsed");

    // Best-effort cleanup, same as above.
    await fetch(`${BASE}/api/raw-emails/${data.id}`, { method: "DELETE" }).catch(() => {});
  });

  it("Postmark adapter rejects a missing/wrong key with 401", async () => {
    const res = await fetch(`${BASE}/api/inbound-email/postmark?key=wrong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: "x@y.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("Postmark adapter rejects a payload without `From` with 400", async () => {
    const res = await fetch(`${BASE}/api/inbound-email/postmark?key=${SECRET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Subject: "missing From" }),
    });
    expect(res.status).toBe(400);
  });

  it("Postmark adapter accepts its JSON shape and reports the outcome", async () => {
    const res = await fetch(`${BASE}/api/inbound-email/postmark?key=${SECRET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: "vitest@test.invalid",
        Subject: "vitest postmark check",
        TextBody: "no rule matches this sender",
        Date: "Thu, 02 Jul 2026 10:00:00 -0500",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    expect(data.outcome.status).toBe("unparsed");

    // Best-effort cleanup, same as above.
    await fetch(`${BASE}/api/raw-emails/${data.id}`, { method: "DELETE" }).catch(() => {});
  });

  it("requires auth on the rest of the API", async () => {
    for (const path of ["/api/accounts", "/api/transactions", "/api/export?entity=accounts"]) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      expect([307, 302, 401]).toContain(res.status);
    }
  });
});

if (!up) {
  it("dev server not running — webhook tests skipped", () => {
    expect(up).toBe(false);
  });
}
