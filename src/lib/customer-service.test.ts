import { describe, expect, it } from "vitest";
import {
  addPet,
  createCustomer,
  deleteCustomer,
  deletePet,
  getCustomer,
  listCustomers,
  updateCustomer,
  updatePet,
  type CustomerRepo,
  type CustomerRecord,
  type PetRecord,
} from "./customer-service";
import { NotFoundError, ValidationError } from "./errors";
import type { SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";

// Repositório em memória que respeita o tenantId em TODAS as operações, como o Prisma repo faz.
function memoryRepo(): CustomerRepo {
  let seq = 0;
  const customers: CustomerRecord[] = [];
  const pets: PetRecord[] = [];
  return {
    async createCustomer(tenantId, data) {
      const c = { id: `c${++seq}`, tenantId, ...data };
      customers.push(c);
      return c;
    },
    async listCustomers(tenantId, search) {
      return customers
        .filter((c) => c.tenantId === tenantId && (!search || c.name.toLowerCase().includes(search.toLowerCase())))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ ...c, petCount: pets.filter((p) => p.customerId === c.id).length }));
    },
    async findCustomer(tenantId, id) {
      const c = customers.find((x) => x.id === id && x.tenantId === tenantId);
      return c ? { ...c, pets: pets.filter((p) => p.customerId === id && p.tenantId === tenantId) } : null;
    },
    async updateCustomer(tenantId, id, data) {
      const c = customers.find((x) => x.id === id && x.tenantId === tenantId);
      if (!c) return null;
      Object.assign(c, data);
      return c;
    },
    async deleteCustomer(tenantId, id) {
      const i = customers.findIndex((x) => x.id === id && x.tenantId === tenantId);
      if (i < 0) return false;
      customers.splice(i, 1);
      for (let j = pets.length - 1; j >= 0; j--) if (pets[j].customerId === id) pets.splice(j, 1);
      return true;
    },
    async createPet(tenantId, customerId, data) {
      const p = { id: `p${++seq}`, tenantId, customerId, ...data };
      pets.push(p);
      return p;
    },
    async updatePet(tenantId, id, data) {
      const p = pets.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) return null;
      Object.assign(p, data);
      return p;
    },
    async deletePet(tenantId, id) {
      const i = pets.findIndex((x) => x.id === id && x.tenantId === tenantId);
      if (i < 0) return false;
      pets.splice(i, 1);
      return true;
    },
  };
}

const admin = (tenantId: string): SessionPayload => ({ userId: `u-${tenantId}`, tenantId, role: "ADMIN" });
const attendant = (tenantId: string): SessionPayload => ({ userId: `a-${tenantId}`, tenantId, role: "ATTENDANT" });
const groomer = (tenantId: string): SessionPayload => ({ userId: `g-${tenantId}`, tenantId, role: "GROOMER" });

const carlos = { name: "Carlos Silva", phone: "(71) 99123-4567", email: "carlos@mail.com" };
const thor = { name: "Thor", species: "DOG", breed: "Labrador", size: "LARGE", birthDate: "2022-03-15" };

describe("clientes", () => {
  it("cria cliente no tenant da sessão (e não em outro)", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    expect(c.tenantId).toBe("A");
    expect(c.phone).toBe("71991234567");
  });

  it("não permite que a entrada do usuário defina o tenantId", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), { ...carlos, tenantId: "B" });
    expect(c.tenantId).toBe("A");
  });

  it("devolve ValidationError com a mensagem do primeiro problema", async () => {
    const repo = memoryRepo();
    await expect(createCustomer(repo, admin("A"), { ...carlos, phone: "123" })).rejects.toThrow(new ValidationError("Telefone inválido"));
  });

  it("lista só os clientes do tenant, com contagem de pets", async () => {
    const repo = memoryRepo();
    const a = await createCustomer(repo, admin("A"), carlos);
    await createCustomer(repo, admin("B"), { name: "Cliente da Loja B" });
    await addPet(repo, admin("A"), a.id, thor);

    const list = await listCustomers(repo, admin("A"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Carlos Silva", petCount: 1 });
  });

  it("busca por nome ignorando maiúsculas e espaços nas pontas", async () => {
    const repo = memoryRepo();
    await createCustomer(repo, admin("A"), { name: "Ana Souza" });
    await createCustomer(repo, admin("A"), { name: "Bruno Lima" });
    expect((await listCustomers(repo, admin("A"), "  ANA ")).map((c) => c.name)).toEqual(["Ana Souza"]);
    expect(await listCustomers(repo, admin("A"), "   ")).toHaveLength(2);
  });

  it("limpar um campo na edição apaga o valor (não mantém o antigo)", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    const updated = await updateCustomer(repo, admin("A"), c.id, { name: "Carlos S.", phone: "", email: "" });
    expect(updated).toMatchObject({ name: "Carlos S.", phone: null, email: null });
  });

  it("excluir cliente remove também os pets", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    await addPet(repo, admin("A"), c.id, thor);
    await deleteCustomer(repo, admin("A"), c.id);
    await expect(getCustomer(repo, admin("A"), c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("pets", () => {
  it("adiciona pet com campos opcionais como null", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    const p = await addPet(repo, admin("A"), c.id, { name: "Mia", species: "CAT" });
    expect(p).toMatchObject({ name: "Mia", species: "CAT", breed: null, size: null, birthDate: null, tenantId: "A", customerId: c.id });
  });

  it("atualiza e exclui pet", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    const p = await addPet(repo, admin("A"), c.id, thor);
    expect((await updatePet(repo, admin("A"), p.id, { ...thor, name: "Thor Jr" })).name).toBe("Thor Jr");
    await deletePet(repo, admin("A"), p.id);
    expect((await getCustomer(repo, admin("A"), c.id)).pets).toHaveLength(0);
  });

  it("rejeita pet inválido sem criar nada", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    await expect(addPet(repo, admin("A"), c.id, { ...thor, birthDate: "2999-01-01" })).rejects.toBeInstanceOf(ValidationError);
    expect((await getCustomer(repo, admin("A"), c.id)).pets).toHaveLength(0);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  async function setup() {
    const repo = memoryRepo();
    const secret = await createCustomer(repo, admin("A"), { name: "Cliente Secreto" });
    const pet = await addPet(repo, admin("A"), secret.id, thor);
    return { repo, secret, pet };
  }

  it("outro tenant não consegue ler o cliente (404, sem revelar que existe)", async () => {
    const { repo, secret } = await setup();
    await expect(getCustomer(repo, admin("B"), secret.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("outro tenant não consegue editar nem excluir o cliente", async () => {
    const { repo, secret } = await setup();
    await expect(updateCustomer(repo, admin("B"), secret.id, { name: "Invadido" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCustomer(repo, admin("B"), secret.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCustomer(repo, admin("A"), secret.id)).name).toBe("Cliente Secreto");
  });

  it("outro tenant não consegue adicionar pet a cliente alheio", async () => {
    const { repo, secret } = await setup();
    await expect(addPet(repo, admin("B"), secret.id, { name: "Intruso", species: "CAT" })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCustomer(repo, admin("A"), secret.id)).pets).toHaveLength(1);
  });

  it("outro tenant não consegue editar nem excluir pet alheio", async () => {
    const { repo, secret, pet } = await setup();
    await expect(updatePet(repo, admin("B"), pet.id, { name: "Hackeado", species: "CAT" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePet(repo, admin("B"), pet.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCustomer(repo, admin("A"), secret.id)).pets[0].name).toBe("Thor");
  });

  it("a listagem de outro tenant não mostra clientes alheios nem na busca", async () => {
    const { repo } = await setup();
    expect(await listCustomers(repo, admin("B"))).toEqual([]);
    expect(await listCustomers(repo, admin("B"), "Secreto")).toEqual([]);
  });
});

describe("permissões nos serviços", () => {
  it("GROOMER pode ler, mas não criar nem editar", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, admin("A"), carlos);
    expect(await listCustomers(repo, groomer("A"))).toHaveLength(1);
    await expect(createCustomer(repo, groomer("A"), carlos)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCustomer(repo, groomer("A"), c.id, carlos)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addPet(repo, groomer("A"), c.id, thor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ATTENDANT cria e edita, mas não exclui", async () => {
    const repo = memoryRepo();
    const c = await createCustomer(repo, attendant("A"), carlos);
    const p = await addPet(repo, attendant("A"), c.id, thor);
    await expect(deleteCustomer(repo, attendant("A"), c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deletePet(repo, attendant("A"), p.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getCustomer(repo, attendant("A"), c.id)).toBeTruthy();
  });

  it("a checagem de permissão acontece antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as CustomerRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(createCustomer(spy, groomer("A"), carlos)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
