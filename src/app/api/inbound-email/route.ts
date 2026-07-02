import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestInboundEmail, rateLimited, secretMatches } from "@/lib/inbound-email";
import { parseRawMime } from "@/lib/email-parser";

const inboundEmailInput = z.object({
  from: z.string().trim().max(500).optional(),
  subject: z.string().trim().max(1000).optional(),
  text: z.string().max(200_000).nullish(),
  html: z.string().max(500_000).nullish(),
  // Raw RFC-822/MIME message (e.g. from the Cloudflare Email Worker). When
  // present it takes precedence: we parse clean fields out of it.
  raw: z.string().max(5_000_000).nullish(),
  receivedAt: z.string().nullish(),
});

function authorized(req: NextRequest): boolean {
  const header =
    req.headers.get("x-inbound-email-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return secretMatches(header);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (rateLimited()) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = inboundEmailInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Prefer fields recovered from the raw MIME; fall back to any provided
  // directly (a plain JSON caller sends from/subject/text/html and no raw).
  const mime = data.raw ? await parseRawMime(data.raw) : null;
  const from = (mime?.from || data.from || "").trim();
  if (!from) {
    return NextResponse.json(
      { error: "Invalid input", issues: [{ path: ["from"], message: "Required" }] },
      { status: 400 }
    );
  }

  const { id, outcome } = await ingestInboundEmail({
    from,
    subject: mime?.subject || data.subject || "",
    text: mime?.text ?? data.text,
    html: mime?.html ?? data.html,
    receivedAt: data.receivedAt,
  });
  return NextResponse.json({ id, outcome }, { status: 201 });
}
