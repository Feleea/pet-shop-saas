import { describe, expect, it } from "vitest";
import { getCompany, updateCompany, type CompanyData, type CompanyRepo } from "./company-service";
import { NotFoundError, ValidationError } from "./errors";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";

const blank = (name: string): CompanyData => ({
  name,
  legalName: null,
  cnpj: null,
  stateRegistration: null,
  municipalRegistration: null,
  taxRegime: null,
  addressLine: null,
  city: null,
  state: null,
  zipCode: null,
  phone: null,
});

function memoryRepo() {
  const db: Record<string, CompanyData> = { A: blank("Pet A"), B: blank("Pet B") };
  const repo: CompanyRepo = {
    async getCompany(tenantId) {
      return db[tenantId] ?? null;
    },
    async updateCompany(tenantId, data) {
      if (!db[tenantId]) return null;
      db[tenantId] = data;
      return data;
    },
  };
  return { repo, db };
}

const as = (role: Role, tenantId = "A"): SessionPayload => ({ userId: `${role}-${tenantId}`, tenantId, role });
const full = {
  name: "Pet Shop A",
  legalName: "Pet Shop A Comércio LTDA",
  cnpj: "11.222.333/0001-81",
  stateRegistration: "123.456.789",
  municipalRegistration: "98765",
  taxRegime: "SIMPLES_NACIONAL",
  addressLine: "Rua das Flores, 100",
  city: "Salvador",
  state: "ba",
  zipCode: "40010-000",
  phone: "(71) 3222-1234",
};

describe("dados da empresa", () => {
  it("salva normalizando: só dígitos em CNPJ, CEP e telefone, UF em maiúsculas", async () => {
    const { repo } = memoryRepo();
    const c = await updateCompany(repo, as("ADMIN"), full);
    expect(c).toMatchObject({ cnpj: "11222333000181", zipCode: "40010000", phone: "7132221234", state: "BA", taxRegime: "SIMPLES_NACIONAL" });
  });

  it("limpar um campo apaga o valor (grava null)", async () => {
    const { repo } = memoryRepo();
    await updateCompany(repo, as("ADMIN"), full);
    const c = await updateCompany(repo, as("ADMIN"), { ...full, cnpj: "", phone: "  ", taxRegime: "" });
    expect(c).toMatchObject({ cnpj: null, phone: null, taxRegime: null, legalName: "Pet Shop A Comércio LTDA" });
  });

  it("aceita só o nome (todo o resto é opcional até emitir nota)", async () => {
    const { repo } = memoryRepo();
    const c = await updateCompany(repo, as("ADMIN"), { name: "Só o nome" });
    expect(c).toMatchObject({ name: "Só o nome", cnpj: null, legalName: null });
  });

  it.each([
    [{ name: "A" }, "Informe o nome do pet shop"],
    [{ cnpj: "11222333000182" }, "CNPJ inválido"],
    [{ cnpj: "123" }, "CNPJ inválido"],
    [{ state: "XX" }, "UF inválida"],
    [{ zipCode: "123" }, "CEP inválido"],
    [{ phone: "123" }, "Telefone inválido"],
    [{ taxRegime: "OUTRO" }, "Regime tributário inválido"],
    [{ stateRegistration: "12 34!" }, "Inscrição estadual inválida"],
    [{ municipalRegistration: "x".repeat(21) }, "Inscrição municipal: máximo de 20 caracteres"],
    [{ legalName: "x".repeat(121) }, "Razão social: máximo de 120 caracteres"],
  ])("rejeita %j", async (over, message) => {
    const { repo, db } = memoryRepo();
    await expect(updateCompany(repo, as("ADMIN"), { ...full, ...over })).rejects.toThrow(new ValidationError(message));
    expect(db.A.cnpj).toBeNull(); // nada foi gravado
  });

  it("só o ADMIN altera; os demais papéis só consultam", async () => {
    const { repo } = memoryRepo();
    for (const role of ["ATTENDANT", "GROOMER", "VET"] as const) {
      await expect(updateCompany(repo, as(role), full)).rejects.toBeInstanceOf(ForbiddenError);
      expect((await getCompany(repo, as(role))).name).toBe("Pet A");
    }
  });

  it("ISOLAMENTO: cada pet shop altera e lê só a própria empresa", async () => {
    const { repo, db } = memoryRepo();
    await updateCompany(repo, as("ADMIN", "B"), { ...full, name: "Pet B Novo" });
    expect(db.A.name).toBe("Pet A");
    expect((await getCompany(repo, as("ADMIN", "A"))).name).toBe("Pet A");
    expect((await getCompany(repo, as("ADMIN", "B"))).cnpj).toBe("11222333000181");
  });

  it("empresa inexistente dá NotFound", async () => {
    const { repo } = memoryRepo();
    await expect(getCompany(repo, as("ADMIN", "Z"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateCompany(repo, as("ADMIN", "Z"), full)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as CompanyRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(updateCompany(spy, as("ATTENDANT"), full)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
