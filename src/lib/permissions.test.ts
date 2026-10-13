import { describe, expect, it } from "vitest";
import { assertCan, can } from "./permissions";
import { ForbiddenError } from "./tenant";

describe("permissões por papel", () => {
  it("ADMIN pode tudo, inclusive gerenciar o catálogo", () => {
    for (const a of ["read", "write", "delete", "catalog"] as const) expect(can("ADMIN", a)).toBe(true);
  });
  it("ATTENDANT lê e escreve, mas não exclui nem gerencia o catálogo", () => {
    expect(can("ATTENDANT", "read")).toBe(true);
    expect(can("ATTENDANT", "write")).toBe(true);
    expect(can("ATTENDANT", "delete")).toBe(false);
    expect(can("ATTENDANT", "catalog")).toBe(false);
  });
  it.each(["GROOMER", "VET"] as const)("%s é somente leitura", (role) => {
    expect(can(role, "read")).toBe(true);
    for (const a of ["write", "delete", "catalog"] as const) expect(can(role, a)).toBe(false);
  });
  it("assertCan lança ForbiddenError quando não permitido", () => {
    expect(() => assertCan({ role: "GROOMER" }, "write")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ATTENDANT" }, "catalog")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ADMIN" }, "catalog")).not.toThrow();
  });
});
