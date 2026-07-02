import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyParserRules, htmlToText } from "@/lib/email-parser";

const inboundEmailInput = z.object({
  from: z.string().trim().min(1).max(500),
  subject: z.string().trim().max(1000).default(""),
  text: z.string().max(200_000).nullish(),
  html: z.string().max(500_000).nullish(),
  receivedAt: z.string().nullish(),
});

// Simple fixed-window rate limit (single-instance deploy).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let windowStart = 0;
let windowCount = 0;

function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  return windowCount > MAX_PER_WINDOW;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return false;
  const header =
    req.headers.get("x-inbound-email-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return header === secret;
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
  return NextResponse.json({ id: email.id, outcome }, { status: 201 });
}
