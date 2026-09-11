// Server-only: personal API tokens, the bearer credential for /api/mcp.
//
// The plaintext token exists exactly once — in the response that creates it.
// Everything after that works off a SHA-256 hash, so a leaked database backup
// contains no usable credentials.
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ApiTokenScope } from "@/generated/prisma/client";
import type { ApiTokenSummary } from "@/lib/api-token-shared";

export type { ApiTokenSummary };

/** Marks a Ledgerly token in logs and secret scanners. */
export const TOKEN_PREFIX = "ldg_";

/** Characters of the token kept in plaintext for the settings list. */
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 256 bits of randomness, URL-safe so it survives header and CLI quoting. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function toApiTokenSummary(token: {
  id: string;
  name: string;
  prefix: string;
  scope: ApiTokenScope;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}): ApiTokenSummary {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scope: token.scope,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    expired: token.expiresAt !== null && token.expiresAt.getTime() <= Date.now(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

/** Mint a token. The returned `token` is the only time the secret is readable. */
export async function createApiToken(
  userId: string,
  input: { name: string; scope: ApiTokenScope; expiresAt?: Date | null }
): Promise<{ token: string; summary: ApiTokenSummary }> {
  const token = generateToken();
  const created = await prisma.apiToken.create({
    data: {
      userId,
      name: input.name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
      scope: input.scope,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { token, summary: toApiTokenSummary(created) };
}

export type AuthenticatedToken = {
  tokenId: string;
  userId: string;
  scope: ApiTokenScope;
};

/**
 * Resolve a bearer token to its owner, or null when it is unknown, revoked
 * (deleted), or past its expiry. Lookup is by hash, so the untrusted input is
 * never compared against a stored secret.
 */
export async function authenticateToken(raw: string): Promise<AuthenticatedToken | null> {
  const token = raw.trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, scope: true, expiresAt: true },
  });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

  return { tokenId: record.id, userId: record.userId, scope: record.scope };
}

/**
 * Stamp "last used" so an unused token is obvious in settings. Never blocks
 * the caller: a failed stamp must not fail an otherwise-valid request.
 */
export function touchToken(tokenId: string): void {
  void prisma.apiToken
    .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

/** Extract the credential from an `Authorization: Bearer …` header. */
export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
