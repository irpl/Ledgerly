import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestInboundEmail, rateLimited, secretMatches } from "@/lib/inbound-email";

// Adapter for SendGrid Inbound Parse (docs/email-ingestion.md, Option B).
// SendGrid POSTs multipart/form-data and cannot set custom headers, so the
// shared secret is passed as a `key` query parameter instead:
//   https://{app}/api/inbound-email/sendgrid?key={INBOUND_EMAIL_SECRET}
// Configure the Parse webhook WITHOUT "POST the raw, full MIME message" so
// SendGrid sends parsed `text`/`html` fields.

const sendgridInput = z.object({
  from: z.string().trim().min(1).max(500),
  to: z.string().trim().max(500).nullish(),
  subject: z.string().trim().max(1000).default(""),
  text: z.string().max(200_000).nullish(),
  html: z.string().max(500_000).nullish(),
});

/** SendGrid's `envelope` field is JSON: {"to":["a@b.c"],"from":"..."}. */
function envelopeRecipient(form: FormData): string | undefined {
  const raw = form.get("envelope");
  if (typeof raw !== "string") return undefined;
  try {
    const envelope = JSON.parse(raw) as { to?: string[] };
    return envelope.to?.[0];
  } catch {
    return undefined;
  }
}

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (rateLimited()) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const parsed = sendgridInput.safeParse({
    from: formString(form, "from"),
    // The envelope recipient is the actual delivery address; the To: header
    // may name the original (pre-forward) recipient instead.
    to: envelopeRecipient(form) ?? formString(form, "to"),
    subject: formString(form, "subject"),
    text: formString(form, "text"),
    html: formString(form, "html"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id, outcome } = await ingestInboundEmail(parsed.data);
  return NextResponse.json({ id, outcome }, { status: 201 });
}
