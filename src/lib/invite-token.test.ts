import { describe, expect, it } from "vitest";
import { generateInviteToken, hashToken } from "./invite-token";

describe("token de convite", () => {
  it("gera um token seguro para URL (43 caracteres base64url)", () => {
    const { token } = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("o hash é SHA-256 em hex e corresponde ao token", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(tokenHash);
    expect(tokenHash).not.toContain(token);
  });

  it("cada token gerado é diferente", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateInviteToken().token));
    expect(set.size).toBe(200);
  });

  it("hash é determinístico e sensível a qualquer mudança", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});
