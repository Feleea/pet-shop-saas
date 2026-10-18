import { describe, expect, it } from "vitest";
import type { SessionPayload } from "./session";
import { activeSessionOrNull, type UserLookup } from "./session-guard";

const payload: SessionPayload = { userId: "u1", tenantId: "t1", role: "ATTENDANT" };

describe("activeSessionOrNull", () => {
  it("mantém a sessão de usuário ativo", async () => {
    const lookup: UserLookup = async () => ({ status: "ACTIVE", role: "ATTENDANT" });
    expect(await activeSessionOrNull(payload, lookup)).toEqual(payload);
  });

  it.each(["INACTIVE", "VACATION"] as const)("derruba a sessão de usuário %s, mesmo com token válido", async (status) => {
    const lookup: UserLookup = async () => ({ status, role: "ATTENDANT" });
    expect(await activeSessionOrNull(payload, lookup)).toBeNull();
  });

  it("derruba a sessão se o usuário não existe mais", async () => {
    expect(await activeSessionOrNull(payload, async () => null)).toBeNull();
  });

  it("sem token válido, nem consulta o banco", async () => {
    let calls = 0;
    expect(await activeSessionOrNull(null, async () => (calls++, null))).toBeNull();
    expect(calls).toBe(0);
  });

  it("o papel vem do banco, não do token (mudança de papel vale na hora)", async () => {
    const lookup: UserLookup = async () => ({ status: "ACTIVE", role: "GROOMER" });
    expect(await activeSessionOrNull(payload, lookup)).toEqual({ ...payload, role: "GROOMER" });
  });

  it("consulta usando o tenant e o usuário da sessão", async () => {
    const seen: string[][] = [];
    await activeSessionOrNull(payload, async (t, u) => (seen.push([t, u]), { status: "ACTIVE", role: "ATTENDANT" }));
    expect(seen).toEqual([["t1", "u1"]]);
  });
});
