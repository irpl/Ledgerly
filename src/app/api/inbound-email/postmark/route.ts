import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestInboundEmail, rateLimited, secretMatches } from "@/lib/inbound-email";

// Adapter for Postmark inbound webhooks (docs/email-ingestion.md, Option C).
// Postmark POSTs JSON with PascalCase fields; the shared secret is passed as a
// `key` query parameter (same convention as the SendGrid adapter):
//   https://{app}/api/inbound-email/postmark?key={INBOUND_EMAIL_SECRET}

const postmarkInput = z.object({
  From: z.string().trim().min(1).max(500),
  Subject: z.string().trim().max(1000).default(""),
  TextBody: z.string().max(200_000).nullish(),
  HtmlBody: z.string().max(500_000).nullish(),
  Date: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  if (!secretMatches(req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (rateLimited()) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = postmarkInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const { id, outcome } = await ingestInboundEmail({
    from: data.From,
    subject: data.Subject,
    text: data.TextBody,
    html: data.HtmlBody,
    receivedAt: data.Date,
  });
  return NextResponse.json({ id, outcome }, { status: 201 });
}
