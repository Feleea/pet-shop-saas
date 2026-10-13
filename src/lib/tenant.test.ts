import { describe, expect, it } from "vitest";
import { ForbiddenError, assertSameTenant, withTenant } from "./tenant";

describe("assertSameTenant", () => {
  it("permite recurso do mesmo tenant", () => {
    expect(() => assertSameTenant({ tenantId: "a" }, { tenantId: "a" })).not.toThrow();
  });
  it("bloqueia recurso de outro tenant", () => {
    expect(() => assertSameTenant({ tenantId: "a" }, { tenantId: "b" })).toThrow(ForbiddenError);
  });
});

describe("withTenant", () => {
  it("acrescenta o tenantId da sessão ao filtro", () => {
    expect(withTenant({ tenantId: "a" }, { name: "Thor" })).toEqual({ name: "Thor", tenantId: "a" });
  });
  it("funciona sem filtro prévio", () => {
    expect(withTenant({ tenantId: "a" })).toEqual({ tenantId: "a" });
  });
  it("não deixa a entrada do usuário sobrescrever o tenantId", () => {
    expect(withTenant({ tenantId: "a" }, { tenantId: "b" }).tenantId).toBe("a");
  });
});
