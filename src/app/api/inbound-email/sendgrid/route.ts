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
  subject: z.string().trim().max(1000).default(""),
  text: z.string().max(200_000).nullish(),
  html: z.string().max(500_000).nullish(),
});

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
