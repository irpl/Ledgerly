// Server-only: shared ingestion pipeline for inbound-email webhooks.
// Provider adapters (JSON webhook, SendGrid Inbound Parse) normalize their
// payloads into InboundEmail and call ingestInboundEmail().
import { prisma } from "@/lib/prisma";
import { applyParserRules, htmlToText, type ParseOutcome } from "@/lib/email-parser";

export type InboundEmail = {
  from: string;
  to?: string | null;
  /**
   * SMTP envelope recipient (RCPT TO), when the provider reports it separately.
   * Forwarding does not rewrite the To: header, so for a forwarded alert this is
   * the only place the inbound key appears — it must win over `to` for routing.
   */
  envelopeTo?: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
  receivedAt?: string | null;
};

/** "Jane Doe <a@b.c>" / "a@b.c" → "a@b.c" (lowercased), or null. */
export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const bare = angled?.[1] ?? raw.trim();
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? bare.toLowerCase() : null;
}

/**
 * Route an inbound email to a user (§ multi-user):
 *  a) a recipient local-part carries an inbound key — "key@domain" or
 *     "anything+key@domain" → User.inboundKey. Several recipients may be given
 *     (envelope first, then the To: header); the first key that resolves wins;
 *  b) sender is one of a user's registered forward addresses (manual forwards
 *     arrive From: the user's own mailbox);
 *  c) otherwise null = unrouted (admin can assign it in the review queue).
 */
export async function resolveInboundUser(
  toAddress: string | null | (string | null)[],
  fromAddress: string
): Promise<string | null> {
  const recipients = (Array.isArray(toAddress) ? toAddress : [toAddress])
    .map(normalizeAddress)
    .filter((a): a is string => !!a);

  for (const to of recipients) {
    const localPart = to.split("@")[0];
    const plusTag = localPart.includes("+") ? localPart.split("+").pop() : null;
    const keys = [plusTag, localPart].filter((k): k is string => !!k);
    if (keys.length === 0) continue;
    const byKey = await prisma.user.findFirst({
      where: { inboundKey: { in: keys } },
      select: { id: true },
    });
    if (byKey) return byKey.id;
  }

  const from = normalizeAddress(fromAddress);
  if (from) {
    const forward = await prisma.forwardAddress.findUnique({
      where: { address: from },
      select: { userId: true },
    });
    if (forward) return forward.userId;
  }

  return null;
}

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

/** Store the raw email, route it to a user, and run that user's parser rules. */
export async function ingestInboundEmail(
  data: InboundEmail
): Promise<{ id: string; outcome: ParseOutcome }> {
  const body = data.text?.trim() || (data.html ? htmlToText(data.html) : "");
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
  // Envelope first: a forwarded alert carries the inbound key there and the
  // original mailbox in To:, so preferring To: would lose the key entirely.
  const userId = await resolveInboundUser(
    [data.envelopeTo ?? null, data.to ?? null],
    data.from
  );

  const email = await prisma.rawEmail.create({
    data: {
      userId,
      fromAddress: data.from,
      toAddress: data.envelopeTo ?? data.to ?? null,
      subject: data.subject,
      body,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    },
  });

  // Unrouted emails are never parsed — rules are per-user.
  const outcome: ParseOutcome = userId
    ? await applyParserRules(email)
    : { status: "unparsed" };
  return { id: email.id, outcome };
}
