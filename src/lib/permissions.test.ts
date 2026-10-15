import { describe, expect, it } from "vitest";
import { assertCan, can, type Action } from "./permissions";
import { ForbiddenError } from "./tenant";

const ALL: Action[] = ["read", "write", "delete", "catalog", "users", "sell", "stock"];
const allowed = (role: Parameters<typeof can>[0]) => ALL.filter((a) => can(role, a));

describe("permissões por papel", () => {
  it("ADMIN pode tudo", () => expect(allowed("ADMIN")).toEqual(ALL));

  it("ATTENDANT lê, escreve, vende e dá entrada no estoque, mas não exclui nem gerencia catálogo/equipe", () => {
    expect(allowed("ATTENDANT")).toEqual(["read", "write", "sell", "stock"]);
  });

  it.each(["GROOMER", "VET"] as const)("%s só consulta (e não vê as vendas)", (role) => {
    expect(allowed(role)).toEqual(["read"]);
  });

  it("assertCan lança ForbiddenError quando não permitido", () => {
    expect(() => assertCan({ role: "GROOMER" }, "sell")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ATTENDANT" }, "catalog")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ATTENDANT" }, "stock")).not.toThrow();
    expect(() => assertCan({ role: "ADMIN" }, "users")).not.toThrow();
  });
});
