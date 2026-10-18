import { describe, expect, it } from "vitest";
import {
  DUPLICATE_NAME_MESSAGE,
  createService,
  getService,
  listServices,
  setServiceActive,
  updateService,
  type CatalogRepo,
  type ServiceRecord,
} from "./catalog-service";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import type { SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";

// Repositório em memória: todas as operações respeitam o tenantId, como o Prisma repo.
function memoryRepo(): CatalogRepo {
  let seq = 0;
  const rows: ServiceRecord[] = [];
  const find = (tenantId: string, id: string) => rows.find((r) => r.id === id && r.tenantId === tenantId);
  return {
    async createService(tenantId, data) {
      const r = { id: `s${++seq}`, tenantId, active: true, ...data };
      rows.push(r);
      return r;
    },
    async listServices(tenantId, { includeInactive }) {
      return rows
        .filter((r) => r.tenantId === tenantId && (includeInactive || r.active))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    },
    async findService(tenantId, id) {
      return find(tenantId, id) ?? null;
    },
    async updateService(tenantId, id, data) {
      const r = find(tenantId, id);
      if (!r) return null;
      Object.assign(r, data);
      return r;
    },
    async setServiceActive(tenantId, id, active) {
      const r = find(tenantId, id);
      if (!r) return null;
      r.active = active;
      return r;
    },
    async nameExists(tenantId, name, excludeId) {
      return rows.some((r) => r.tenantId === tenantId && r.id !== excludeId && r.name.toLowerCase() === name.toLowerCase());
    },
  };
}

const as = (role: SessionPayload["role"], tenantId: string): SessionPayload => ({ userId: `${role}-${tenantId}`, tenantId, role });
const admin = (t: string) => as("ADMIN", t);

const banho = { name: "Banho", description: "Banho completo", durationMinutes: "60", price: "50,00" };
const tosa = { name: "Tosa", durationMinutes: "90", price: "80" };

describe("criar serviço", () => {
  it("cria no tenant da sessão com preço em centavos e ativo", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    expect(s).toMatchObject({ tenantId: "A", name: "Banho", durationMinutes: 60, priceCents: 5000, active: true });
  });

  it("descrição opcional vira null", async () => {
    const s = await createService(memoryRepo(), admin("A"), tosa);
    expect(s.description).toBeNull();
  });

  it("ignora um tenantId vindo da entrada", async () => {
    const s = await createService(memoryRepo(), admin("A"), { ...banho, tenantId: "B" });
    expect(s.tenantId).toBe("A");
  });

  it("devolve ValidationError e não cria nada quando inválido", async () => {
    const repo = memoryRepo();
    await expect(createService(repo, admin("A"), { ...banho, durationMinutes: "7" })).rejects.toBeInstanceOf(ValidationError);
    expect(await listServices(repo, admin("A"), { includeInactive: true })).toHaveLength(0);
  });

  it("recusa nome repetido no mesmo pet shop, sem diferenciar maiúsculas", async () => {
    const repo = memoryRepo();
    await createService(repo, admin("A"), banho);
    const err = await createService(repo, admin("A"), { ...banho, name: "BANHO" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(DUPLICATE_NAME_MESSAGE);
  });

  it("permite o mesmo nome em pet shops diferentes", async () => {
    const repo = memoryRepo();
    await createService(repo, admin("A"), banho);
    await expect(createService(repo, admin("B"), banho)).resolves.toMatchObject({ tenantId: "B" });
  });
});

describe("editar serviço", () => {
  it("atualiza os dados", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    const u = await updateService(repo, admin("A"), s.id, { ...banho, durationMinutes: "75", price: "65,50" });
    expect(u).toMatchObject({ durationMinutes: 75, priceCents: 6550 });
  });

  it("salvar com o próprio nome não conta como duplicado", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    await expect(updateService(repo, admin("A"), s.id, { ...banho, price: "55" })).resolves.toBeTruthy();
  });

  it("recusa renomear para o nome de outro serviço", async () => {
    const repo = memoryRepo();
    await createService(repo, admin("A"), banho);
    const t = await createService(repo, admin("A"), tosa);
    await expect(updateService(repo, admin("A"), t.id, { ...tosa, name: "banho" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("limpar a descrição grava null", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    const u = await updateService(repo, admin("A"), s.id, { ...banho, description: "" });
    expect(u.description).toBeNull();
  });
});

describe("ativar e desativar", () => {
  it("serviço desativado some da lista de quem não gerencia, mas continua para o ADMIN", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    await createService(repo, admin("A"), tosa);
    await setServiceActive(repo, admin("A"), s.id, false);

    expect((await listServices(repo, as("ATTENDANT", "A"))).map((x) => x.name)).toEqual(["Tosa"]);
    expect(await listServices(repo, admin("A"), { includeInactive: true })).toHaveLength(2);
    expect(await listServices(repo, admin("A"))).toHaveLength(1);
  });

  it("quem não gerencia o catálogo não consegue ver inativos nem pedindo", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    await setServiceActive(repo, admin("A"), s.id, false);
    expect(await listServices(repo, as("ATTENDANT", "A"), { includeInactive: true })).toEqual([]);
  });

  it("reativar devolve o serviço à lista", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    await setServiceActive(repo, admin("A"), s.id, false);
    await setServiceActive(repo, admin("A"), s.id, true);
    expect(await listServices(repo, as("GROOMER", "A"))).toHaveLength(1);
  });

  it("o nome de um serviço desativado continua reservado", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    await setServiceActive(repo, admin("A"), s.id, false);
    await expect(createService(repo, admin("A"), banho)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  async function setup() {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    return { repo, s };
  }

  it("outro tenant não lê, edita nem desativa (404, sem revelar que existe)", async () => {
    const { repo, s } = await setup();
    await expect(getService(repo, admin("B"), s.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateService(repo, admin("B"), s.id, { ...banho, price: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setServiceActive(repo, admin("B"), s.id, false)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getService(repo, admin("A"), s.id)).toMatchObject({ priceCents: 5000, active: true });
  });

  it("a listagem de outro tenant não mostra serviços alheios", async () => {
    const { repo } = await setup();
    expect(await listServices(repo, admin("B"), { includeInactive: true })).toEqual([]);
  });

  it("nome existente em outro tenant não gera conflito nem vaza a existência", async () => {
    const { repo } = await setup();
    await expect(createService(repo, admin("B"), banho)).resolves.toBeTruthy();
  });
});

describe("permissões", () => {
  it.each(["ATTENDANT", "GROOMER", "VET"] as const)("%s lê o catálogo, mas não altera", async (role) => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), banho);
    const me = as(role, "A");
    expect(await listServices(repo, me)).toHaveLength(1);
    expect(await getService(repo, me, s.id)).toBeTruthy();
    await expect(createService(repo, me, tosa)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateService(repo, me, s.id, banho)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setServiceActive(repo, me, s.id, false)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as CatalogRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(createService(spy, as("ATTENDANT", "A"), banho)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});

describe("dados fiscais do serviço (opcionais)", () => {
  it("guarda o código do serviço e a alíquota do ISS em centésimos de ponto percentual", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), { ...banho, serviceCode: "05.08", issRate: "2,5" });
    expect(s).toMatchObject({ serviceCode: "05.08", issRateBp: 250 });
    expect((await createService(repo, admin("A"), { ...banho, name: "Tosa", serviceCode: "05.08", issRate: "5%" })).issRateBp).toBe(500);
  });

  it("sem dados fiscais: ficam nulos", async () => {
    const repo = memoryRepo();
    expect(await createService(repo, admin("A"), banho)).toMatchObject({ serviceCode: null, issRateBp: null });
  });

  it("alíquota zero é válida (isento) e diferente de não informada", async () => {
    const repo = memoryRepo();
    expect((await createService(repo, admin("A"), { ...banho, issRate: "0" })).issRateBp).toBe(0);
  });

  it.each([
    [{ serviceCode: "5.8" }, "Código do serviço inválido (ex.: 05.08)"],
    [{ serviceCode: "0508" }, "Código do serviço inválido (ex.: 05.08)"],
    [{ issRate: "abc" }, "Alíquota do ISS inválida"],
    [{ issRate: "2,555" }, "Alíquota do ISS inválida"],
    [{ issRate: "6" }, "A alíquota do ISS deve ficar entre 0% e 5%"],
  ])("rejeita %j", async (over, message) => {
    const repo = memoryRepo();
    await expect(createService(repo, admin("A"), { ...banho, ...over })).rejects.toThrow(new ValidationError(message));
  });

  it("editar limpa os dados fiscais quando o campo fica vazio", async () => {
    const repo = memoryRepo();
    const s = await createService(repo, admin("A"), { ...banho, serviceCode: "05.08", issRate: "5" });
    const u = await updateService(repo, admin("A"), s.id, { ...banho, serviceCode: "", issRate: "" });
    expect(u).toMatchObject({ serviceCode: null, issRateBp: null });
  });
});
