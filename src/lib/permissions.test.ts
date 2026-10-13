import { describe, expect, it } from "vitest";
import { assertCan, can } from "./permissions";
import { ForbiddenError } from "./tenant";

describe("permissões por papel", () => {
  it("ADMIN pode tudo, inclusive catálogo e equipe", () => {
    for (const a of ["read", "write", "delete", "catalog", "users"] as const) expect(can("ADMIN", a)).toBe(true);
  });
  it("ATTENDANT lê e escreve, mas não exclui, não gerencia catálogo nem equipe", () => {
    expect(can("ATTENDANT", "read")).toBe(true);
    expect(can("ATTENDANT", "write")).toBe(true);
    for (const a of ["delete", "catalog", "users"] as const) expect(can("ATTENDANT", a)).toBe(false);
  });
  it.each(["GROOMER", "VET"] as const)("%s é somente leitura", (role) => {
    expect(can(role, "read")).toBe(true);
    for (const a of ["write", "delete", "catalog", "users"] as const) expect(can(role, a)).toBe(false);
  });
  it("assertCan lança ForbiddenError quando não permitido", () => {
    expect(() => assertCan({ role: "GROOMER" }, "write")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ATTENDANT" }, "users")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ADMIN" }, "users")).not.toThrow();
  });
});
