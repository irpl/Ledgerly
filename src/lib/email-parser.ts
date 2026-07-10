// Server-only: parse bank-alert emails into pending-review transactions (§5.5).
import PostalMime from "postal-mime";
import { prisma } from "@/lib/prisma";
import type { Prisma, RawEmail } from "@/generated/prisma/client";
import { upsertVendor } from "@/lib/transactions";
import { majorToMinor } from "@/lib/money";

export type ParsedMime = {
  from: string;
  to: string | null;
  subject: string;
  text: string | null;
  html: string | null;
};

/**
 * Parse a raw RFC-822 / MIME message into clean fields. Used when a webhook
 * forwards the raw email (e.g. the Cloudflare Email Worker) instead of an
 * already-extracted body — decodes quoted-printable/base64 parts and drops
 * the envelope headers that would otherwise pollute rule matching.
 */
export async function parseRawMime(raw: string): Promise<ParsedMime> {
  const email = await PostalMime.parse(raw);
  return {
    from: email.from?.address ?? email.from?.name ?? "",
    // deliveredTo covers Bcc-style delivery where To: doesn't name us.
    to: email.to?.[0]?.address ?? email.deliveredTo ?? null,
    subject: email.subject ?? "",
    text: email.text ?? null,
    html: email.html ?? null,
  };
}

/** Crude HTML → text for alert emails that arrive without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** "JMD 4,512.35" / "$4,512.35" → minor units, or null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  if (Number.isNaN(value) || value <= 0) return null;
  return majorToMinor(value);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Best-effort date parsing for common bank formats; null if unparseable. */
export function parseEmailDate(raw: string): Date | null {
  const trimmed = raw.trim();
  // dd-MMM-yyyy or dd MMM yyyy (e.g. "02-Jul-2026")
  let m = /^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{4})/.exec(trimmed);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  // yyyy-mm-dd
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    if (!Number.isNaN(d.getTime())) return d;
  }
  // dd/mm/yyyy (day-first — JM convention)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseDirection(raw: string | undefined): "outflow" | "inflow" | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (["debit", "debited", "dr", "out", "purchase", "withdrawal", "spent"].some((k) => v.includes(k))) {
    return "outflow";
  }
  if (["credit", "credited", "cr", "in", "deposit", "received", "refund"].some((k) => v.includes(k))) {
    return "inflow";
  }
  return null;
}

export type ParseOutcome =
  | { status: "parsed"; transactionId: string; ruleId: string }
  | { status: "failed"; ruleId: string; reason: string }
  | { status: "unparsed" };

/**
 * Run the first matching ParserRule against a raw email. On success, creates a
 * pending-review transaction (does NOT touch balances until confirmed).
 */
export async function applyParserRules(email: RawEmail): Promise<ParseOutcome> {
  // Rules are per-user; an unrouted email (no owner) is never parsed.
  if (!email.userId) return { status: "unparsed" };
  const rules = await prisma.parserRule.findMany({
    where: { userId: email.userId },
    orderBy: { name: "asc" },
  });
  const from = email.fromAddress.toLowerCase();

  for (const rule of rules) {
    if (!from.includes(rule.senderMatch.toLowerCase())) continue;
    if (rule.subjectPattern) {
      let subjectRe: RegExp;
      try {
        subjectRe = new RegExp(rule.subjectPattern, "i");
      } catch {
        continue;
      }
      if (!subjectRe.test(email.subject)) continue;
    }

    // This rule claims the email; extraction failure is a "failed" parse.
    let bodyRe: RegExp;
    try {
      bodyRe = new RegExp(rule.bodyPattern, "i");
    } catch {
      return await markOutcome(email.id, {
        status: "failed",
        ruleId: rule.id,
        reason: "Body pattern is not a valid regex",
      });
    }
    const match = bodyRe.exec(email.body);
    if (!match?.groups?.amount) {
      return await markOutcome(email.id, {
        status: "failed",
        ruleId: rule.id,
        reason: "Body pattern did not match or has no `amount` group",
      });
    }

    const amountMinor = parseAmount(match.groups.amount);
    if (amountMinor === null) {
      return await markOutcome(email.id, {
        status: "failed",
        ruleId: rule.id,
        reason: `Could not parse amount "${match.groups.amount}"`,
      });
    }

    const direction =
      parseDirection(match.groups.direction) ?? (rule.defaultDirection as "outflow" | "inflow");
    const signed = direction === "outflow" ? -BigInt(amountMinor) : BigInt(amountMinor);
    const occurredAt =
      (match.groups.date ? parseEmailDate(match.groups.date) : null) ?? email.receivedAt;
    const merchant = match.groups.merchant?.trim() || null;

    const transaction = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const vendorId = await upsertVendor(tx, email.userId!, merchant, null);
      const created = await tx.transaction.create({
        data: {
          accountId: rule.accountId,
          amount: signed,
          occurredAt,
          vendorId,
          description: merchant ?? email.subject,
          source: "email",
          status: "pending_review",
          rawEmailId: email.id,
        },
      });
      await tx.rawEmail.update({
        where: { id: email.id },
        data: {
          parseStatus: "parsed",
          matchedRuleId: rule.id,
          createdTransactionId: created.id,
        },
      });
      return created;
    });

    return { status: "parsed", transactionId: transaction.id, ruleId: rule.id };
  }

  await prisma.rawEmail.update({
    where: { id: email.id },
    data: { parseStatus: "unparsed", matchedRuleId: null },
  });
  return { status: "unparsed" };
}

async function markOutcome(
  emailId: string,
  outcome: Extract<ParseOutcome, { status: "failed" }>
): Promise<ParseOutcome> {
  await prisma.rawEmail.update({
    where: { id: emailId },
    data: { parseStatus: "failed", matchedRuleId: outcome.ruleId },
  });
  return outcome;
}
