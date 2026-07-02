// Server-only: shared ingestion pipeline for inbound-email webhooks.
// Provider adapters (JSON webhook, SendGrid Inbound Parse) normalize their
// payloads into InboundEmail and call ingestInboundEmail().
import { prisma } from "@/lib/prisma";
import { applyParserRules, htmlToText, type ParseOutcome } from "@/lib/email-parser";

export type InboundEmail = {
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  receivedAt?: string | null;
};

// Simple fixed-window rate limit shared across all inbound-email endpoints
// (single-instance deploy).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let windowStart = 0;
let windowCount = 0;

export function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  return windowCount > MAX_PER_WINDOW;
}

export function secretMatches(provided: string | null | undefined): boolean {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return false;
  return provided === secret;
}

/** Store the raw email and run parser rules against it. */
export async function ingestInboundEmail(
  data: InboundEmail
): Promise<{ id: string; outcome: ParseOutcome }> {
  const body = data.text?.trim() || (data.html ? htmlToText(data.html) : "");
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();

  const email = await prisma.rawEmail.create({
    data: {
      fromAddress: data.from,
      subject: data.subject,
      body,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    },
  });

  const outcome = await applyParserRules(email);
  return { id: email.id, outcome };
}
