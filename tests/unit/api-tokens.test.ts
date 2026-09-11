import { describe, it, expect } from "vitest";
import {
  TOKEN_PREFIX,
  bearerFromHeader,
  generateToken,
  hashToken,
} from "@/lib/api-tokens";

describe("API token minting", () => {
  it("mints prefixed, URL-safe tokens", () => {
    const token = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    // base64url only: nothing that needs escaping in a header or a shell.
    expect(token.slice(TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(40);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    expect(tokens.size).toBe(200);
  });

  it("hashes deterministically, and differently per token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
    // The hash must not leak the secret it was built from.
    expect(hashToken(token)).not.toContain(token.slice(TOKEN_PREFIX.length, 16));
  });
});

describe("bearerFromHeader", () => {
  it("reads the credential out of an Authorization header", () => {
    expect(bearerFromHeader("Bearer ldg_abc123")).toBe("ldg_abc123");
    // Clients vary on case and padding.
    expect(bearerFromHeader("bearer   ldg_abc123  ")).toBe("ldg_abc123");
  });

  it("returns null when there is nothing usable", () => {
    expect(bearerFromHeader(null)).toBeNull();
    expect(bearerFromHeader("")).toBeNull();
    expect(bearerFromHeader("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerFromHeader("Bearer")).toBeNull();
  });
});
