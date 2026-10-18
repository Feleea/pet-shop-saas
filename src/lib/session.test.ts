import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySession } from "./session";

const payload = { userId: "u1", tenantId: "t1", role: "ADMIN" as const };

beforeAll(() => {
  process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
});

describe("sessão (JWT)", () => {
  it("faz o round-trip do payload", async () => {
    const token = await signSession(payload);
    expect(await verifySession(token)).toEqual(payload);
  });

  it("retorna null sem token", async () => {
    expect(await verifySession(undefined)).toBeNull();
  });

  it("rejeita token adulterado", async () => {
    const token = await signSession(payload);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejeita token assinado com outro segredo", async () => {
    const other = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("outro-segredo-totalmente-diferente-123456"));
    expect(await verifySession(other)).toBeNull();
  });

  it("rejeita token expirado", async () => {
    const expired = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifySession(expired)).toBeNull();
  });

  it("rejeita token sem tenantId", async () => {
    const bad = await new SignJWT({ userId: "u1", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifySession(bad)).toBeNull();
  });

  it("falha claramente se AUTH_SECRET for curto", async () => {
    const old = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "curto";
    await expect(signSession(payload)).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = old;
  });
});
