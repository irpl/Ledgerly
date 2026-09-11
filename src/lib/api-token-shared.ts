// Client-safe API-token types. The minting/verification logic lives in
// api-tokens.ts, which is server-only (it imports Prisma and node:crypto).

export const API_TOKEN_SCOPES = ["read", "full"] as const;
export type ApiTokenScopeValue = (typeof API_TOKEN_SCOPES)[number];

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScopeValue, string> = {
  read: "Read-only",
  full: "Full access",
};

/** A token as the settings page sees it — never includes the secret. */
export type ApiTokenSummary = {
  id: string;
  name: string;
  /** Readable head of the token, e.g. "ldg_a1B2c3". */
  prefix: string;
  scope: ApiTokenScopeValue;
  expiresAt: string | null;
  /** Computed server-side: rendering must not depend on the client's clock. */
  expired: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

/** Lifetimes offered when minting a token. */
export const API_TOKEN_LIFETIMES = [
  { label: "No expiry", days: null },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
] as const;
