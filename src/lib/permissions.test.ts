import { describe, expect, it } from "vitest";
import { assertCan, can } from "./permissions";
import { ForbiddenError } from "./tenant";

describe("permissões por papel", () => {
  it("ADMIN pode tudo", () => {
    expect(["read", "write", "delete"].every((a) => can("ADMIN", a as "read"))).toBe(true);
  });
  it("ATTENDANT lê e escreve, mas não exclui", () => {
    expect(can("ATTENDANT", "read")).toBe(true);
    expect(can("ATTENDANT", "write")).toBe(true);
    expect(can("ATTENDANT", "delete")).toBe(false);
  });
  it.each(["GROOMER", "VET"] as const)("%s é somente leitura", (role) => {
    expect(can(role, "read")).toBe(true);
    expect(can(role, "write")).toBe(false);
    expect(can(role, "delete")).toBe(false);
  });
  it("assertCan lança ForbiddenError quando não permitido", () => {
    expect(() => assertCan({ role: "GROOMER" }, "write")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ADMIN" }, "delete")).not.toThrow();
  });
});
