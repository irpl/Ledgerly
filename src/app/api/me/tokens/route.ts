// Personal API tokens for the MCP server. Session-authenticated (the signed-in
// user manages their own tokens) — an API token can never reach these routes,
// so a token cannot mint another token.
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { apiTokenInput } from "@/lib/validation";
import { createApiToken, toApiTokenSummary } from "@/lib/api-tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = await prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tokens: tokens.map(toApiTokenSummary) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = apiTokenInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { name, scope, expiresInDays } = parsed.data;

  const { token, summary } = await createApiToken(userId, {
    name,
    scope,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * DAY_MS) : null,
  });

  // The only response that carries the secret; it is unrecoverable afterwards.
  return NextResponse.json({ token, apiToken: summary }, { status: 201 });
}
