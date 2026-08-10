import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/server/mcp/tokens";

describe("generateToken/hashToken — Addendum C.3", () => {
  it("generates a token in the aspi_pat_ + base64url format", () => {
    const { token } = generateToken();
    expect(token.startsWith("aspi_pat_")).toBe(true);
    // 32 random bytes, base64url-encoded, no padding — 43 chars.
    expect(token.length).toBe("aspi_pat_".length + 43);
  });

  it("two generated tokens are never equal", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("tokenPrefix is exactly the token's first 12 characters", () => {
    const { token, tokenPrefix } = generateToken();
    expect(tokenPrefix).toBe(token.slice(0, 12));
    expect(tokenPrefix.length).toBe(12);
  });

  it("hashToken is deterministic sha256 hex (64 chars), and the raw token is never part of it", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });
});
