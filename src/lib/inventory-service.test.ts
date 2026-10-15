import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  DUPLICATE_PRODUCT_MESSAGE,
  NEGATIVE_STOCK_MESSAGE,
  createProduct,
  getProduct,
  isLowStock,
  listMovements,
  listProducts,
  registerAdjustment,
  registerEntry,
  setProductActive,
  stockLevel,
  updateProduct,
  type InventoryRepo,
  type MovementRecord,
  type ProductRecord,
} from "./inventory-service";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";

// Repositório em memória: respeita o tenantId e nunca deixa o saldo negativo, como o Prisma repo.
function memoryRepo() {
  let seq = 0;
  const products: ProductRecord[] = [];
  const movements: (MovementRecord & { tenantId: string })[] = [];
  const names: Record<string, string> = { "admin-A": "Dono", "att-A": "Atendente", "admin-B": "Dona B" };
  const log = (tenantId: string, productId: string, type: MovementRecord["type"], quantity: number, note: string | null, userId: string) => {
    const m = { id: `m${++seq}`, tenantId, productId, type, quantity, note, createdAt: new Date(2026, 0, 1, 0, 0, seq), createdByName: names[userId] ?? "?" };
    movements.push(m);
    return m;
  };
  const repo: InventoryRepo = {
    async createProduct(tenantId, data, initial) {
      const p: ProductRecord = { id: `p${++seq}`, tenantId, ...data, stockQuantity: initial.quantity, active: true };
      products.push(p);
      if (initial.quantity > 0) log(tenantId, p.id, "INITIAL", initial.quantity, "Estoque inicial", initial.userId);
      return p;
    },
    async listProducts(tenantId, { includeInactive, search }) {
      return products
        .filter((p) => p.tenantId === tenantId && (includeInactive || p.active) && (!search || p.name.toLowerCase().includes(search.toLowerCase())))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    },
    async findProduct(tenantId, id) {
      return products.find((p) => p.id === id && p.tenantId === tenantId) ?? null;
    },
    async updateProduct(tenantId, id, data) {
      const p = products.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) return null;
      Object.assign(p, data);
      return p;
    },
    async setProductActive(tenantId, id, active) {
      const p = products.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) return null;
      p.active = active;
      return p;
    },
    async nameExists(tenantId, name, excludeId) {
      return products.some((p) => p.tenantId === tenantId && p.id !== excludeId && p.name.toLowerCase() === name.toLowerCase());
    },
    async applyMovement(tenantId, productId, { type, delta, note, userId }) {
      const p = products.find((x) => x.id === productId && x.tenantId === tenantId);
      if (!p) return { ok: false, reason: "NOT_FOUND" };
      if (p.stockQuantity + delta < 0) return { ok: false, reason: "INSUFFICIENT" };
      p.stockQuantity += delta;
      return { ok: true, product: p, movement: log(tenantId, productId, type, delta, note, userId) };
    },
    async listMovements(tenantId, productId, limit) {
      return movements
        .filter((m) => m.tenantId === tenantId && m.productId === productId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
  };
  return { repo, products, movements };
}

const as = (role: Role, tenantId: string, userId: string): SessionPayload => ({ userId, tenantId, role });
const adminA = as("ADMIN", "A", "admin-A");
const attA = as("ATTENDANT", "A", "att-A");
const adminB = as("ADMIN", "B", "admin-B");
const groomerA = as("GROOMER", "A", "groomer-A");

const shampoo = { name: "Shampoo", price: "30,00", minStock: "5", initialStock: "10" };

describe("criar produto", () => {
  it("cria no tenant, com preço em centavos e estoque inicial registrado no histórico", async () => {
    const { repo, movements } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    expect(p).toMatchObject({ tenantId: "A", name: "Shampoo", priceCents: 3000, minStock: 5, stockQuantity: 10, active: true });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "INITIAL", quantity: 10, createdByName: "Dono" });
  });

  it("sem estoque inicial não gera movimentação; mínimo e inicial vazios valem 0", async () => {
    const { repo, movements } = memoryRepo();
    const p = await createProduct(repo, adminA, { name: "Coleira", price: "25", minStock: "", initialStock: "" });
    expect(p).toMatchObject({ stockQuantity: 0, minStock: 0 });
    expect(movements).toHaveLength(0);
  });

  it("ignora um tenantId vindo da entrada", async () => {
    const { repo } = memoryRepo();
    expect((await createProduct(repo, adminA, { ...shampoo, tenantId: "B" })).tenantId).toBe("A");
  });

  it.each([
    [{ name: "A" }, "Informe o nome do produto"],
    [{ name: "x".repeat(81) }, "Máximo de 80 caracteres no nome"],
    [{ price: "" }, "Informe o preço"],
    [{ price: "abc" }, "Preço inválido"],
    [{ price: "0" }, "O preço deve ser maior que zero"],
    [{ price: "100000" }, "O preço máximo é R$ 99.999,99"],
    [{ minStock: "-1" }, "Informe o estoque mínimo (número inteiro, de 0 a 99999)"],
    [{ minStock: "abc" }, "Informe o estoque mínimo (número inteiro, de 0 a 99999)"],
    [{ minStock: "100000" }, "Informe o estoque mínimo (número inteiro, de 0 a 99999)"],
    [{ initialStock: "-3" }, "Informe o estoque inicial (número inteiro, de 0 a 999999)"],
    [{ initialStock: "1e2" }, "Informe o estoque inicial (número inteiro, de 0 a 999999)"],
    [{ initialStock: "7,5" }, "Informe o estoque inicial (número inteiro, de 0 a 999999)"],
  ])("rejeita %j", async (over, message) => {
    const { repo, products } = memoryRepo();
    await expect(createProduct(repo, adminA, { ...shampoo, ...over })).rejects.toThrow(new ValidationError(message));
    expect(products).toHaveLength(0);
  });

  it("recusa nome repetido no mesmo pet shop (sem diferenciar maiúsculas) e aceita em outro", async () => {
    const { repo } = memoryRepo();
    await createProduct(repo, adminA, shampoo);
    const err = await createProduct(repo, adminA, { ...shampoo, name: "SHAMPOO" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(DUPLICATE_PRODUCT_MESSAGE);
    await expect(createProduct(repo, adminB, shampoo)).resolves.toMatchObject({ tenantId: "B" });
  });
});

describe("editar, ativar e desativar", () => {
  it("atualiza nome, preço e mínimo (sem mexer no estoque)", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    const u = await updateProduct(repo, adminA, p.id, { name: "Shampoo Pro", price: "35,5", minStock: "3" });
    expect(u).toMatchObject({ name: "Shampoo Pro", priceCents: 3550, minStock: 3, stockQuantity: 10 });
  });

  it("salvar com o próprio nome não conta como repetido; renomear para outro produto, sim", async () => {
    const { repo } = memoryRepo();
    const a = await createProduct(repo, adminA, shampoo);
    const b = await createProduct(repo, adminA, { ...shampoo, name: "Ração" });
    await expect(updateProduct(repo, adminA, a.id, { name: "Shampoo", price: "31", minStock: "5" })).resolves.toBeTruthy();
    await expect(updateProduct(repo, adminA, b.id, { name: "shampoo", price: "31", minStock: "5" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("desativar e reativar", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    expect((await setProductActive(repo, adminA, p.id, false)).active).toBe(false);
    expect((await setProductActive(repo, adminA, p.id, true)).active).toBe(true);
  });
});

describe("entrada de estoque", () => {
  it("soma ao saldo e registra a movimentação com quem fez", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    const r = await registerEntry(repo, attA, p.id, { quantity: "5", note: " Fornecedor X " });
    expect(r.product.stockQuantity).toBe(15);
    expect(r.movement).toMatchObject({ type: "IN", quantity: 5, note: "Fornecedor X", createdByName: "Atendente" });
  });

  it.each(["", "0", "-5", "abc", "7,5", "1000000"])("rejeita a quantidade %j", async (quantity) => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await expect(registerEntry(repo, adminA, p.id, { quantity })).rejects.toBeInstanceOf(ValidationError);
    expect((await getProduct(repo, adminA, p.id)).stockQuantity).toBe(10);
  });

  it("aceita repor um produto desativado", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await setProductActive(repo, adminA, p.id, false);
    await expect(registerEntry(repo, adminA, p.id, { quantity: "1" })).resolves.toBeTruthy();
  });
});

describe("ajuste de estoque", () => {
  it("baixa e acerta o saldo, com o motivo no histórico", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    const r = await registerAdjustment(repo, adminA, p.id, { delta: "-4", reason: "Frasco quebrado" });
    expect(r.product.stockQuantity).toBe(6);
    expect(r.movement).toMatchObject({ type: "ADJUSTMENT", quantity: -4, note: "Frasco quebrado" });
    expect((await registerAdjustment(repo, adminA, p.id, { delta: "+2", reason: "Contagem" })).product.stockQuantity).toBe(8);
  });

  it("zerar o estoque é permitido; passar de zero não, e nada muda", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await expect(registerAdjustment(repo, adminA, p.id, { delta: "-10", reason: "Inventário" })).resolves.toBeTruthy();
    const err = await registerAdjustment(repo, adminA, p.id, { delta: "-1", reason: "Perda" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(NEGATIVE_STOCK_MESSAGE);
    expect((await getProduct(repo, adminA, p.id)).stockQuantity).toBe(0);
  });

  it.each([
    [{ delta: "0", reason: "Teste" }, "O ajuste não pode ser zero"],
    [{ delta: "", reason: "Teste" }, "Informe o ajuste (número inteiro, de -999999 a 999999)"],
    [{ delta: "abc", reason: "Teste" }, "Informe o ajuste (número inteiro, de -999999 a 999999)"],
    [{ delta: "5", reason: "" }, "Informe o motivo do ajuste"],
    [{ delta: "5", reason: "ab" }, "Informe o motivo do ajuste"],
    [{ delta: "5", reason: "x".repeat(201) }, "Máximo de 200 caracteres no motivo"],
  ])("rejeita %j", async (raw, message) => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await expect(registerAdjustment(repo, adminA, p.id, raw)).rejects.toThrow(new ValidationError(message));
  });
});

describe("listar e alertas de estoque baixo", () => {
  it.each([
    [0, 5, "OUT"],
    [-1, 5, "OUT"],
    [1, 5, "LOW"],
    [5, 5, "LOW"],
    [6, 5, "OK"],
    [0, 0, "OUT"],
    [1, 0, "OK"],
  ])("saldo %i com mínimo %i → %s", (stockQuantity, minStock, level) => {
    expect(stockLevel({ stockQuantity, minStock })).toBe(level);
  });

  it("produto inativo não entra nos alertas", () => {
    const base = { id: "x", tenantId: "A", name: "n", priceCents: 1, minStock: 5, stockQuantity: 0 };
    expect(isLowStock({ ...base, active: true })).toBe(true);
    expect(isLowStock({ ...base, active: false })).toBe(false);
  });

  it("filtra por busca (sem diferenciar maiúsculas) e só estoque baixo", async () => {
    const { repo } = memoryRepo();
    await createProduct(repo, adminA, shampoo); // 10 com mínimo 5: normal
    await createProduct(repo, adminA, { name: "Ração Premium", price: "120", minStock: "5", initialStock: "5" }); // baixo
    await createProduct(repo, adminA, { name: "Brinquedo", price: "15", minStock: "2", initialStock: "0" }); // sem estoque
    expect((await listProducts(repo, adminA, { search: "  RAÇÃO " })).map((p) => p.name)).toEqual(["Ração Premium"]);
    expect((await listProducts(repo, adminA, { lowOnly: true })).map((p) => p.name).sort()).toEqual(["Brinquedo", "Ração Premium"]);
  });

  it("quem não gerencia o catálogo não vê produtos inativos, nem pedindo", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await setProductActive(repo, adminA, p.id, false);
    expect(await listProducts(repo, adminA, { includeInactive: true })).toHaveLength(1);
    expect(await listProducts(repo, adminA)).toHaveLength(0);
    expect(await listProducts(repo, attA, { includeInactive: true })).toHaveLength(0);
  });

  it("histórico: mais recente primeiro, respeitando o limite", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await registerEntry(repo, adminA, p.id, { quantity: "1" });
    await registerEntry(repo, adminA, p.id, { quantity: "2" });
    const all = await listMovements(repo, adminA, p.id);
    expect(all.map((m) => m.quantity)).toEqual([2, 1, 10]);
    expect(await listMovements(repo, adminA, p.id, 2)).toHaveLength(2);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  async function setup() {
    const { repo, products } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    return { repo, p, products };
  }

  it("outro pet shop não vê, não edita, não desativa e não movimenta o produto (404)", async () => {
    const { repo, p } = await setup();
    await expect(getProduct(repo, adminB, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProduct(repo, adminB, p.id, { name: "Xx", price: "1", minStock: "0" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setProductActive(repo, adminB, p.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(registerEntry(repo, adminB, p.id, { quantity: "5" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(registerAdjustment(repo, adminB, p.id, { delta: "-5", reason: "Invasão" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listMovements(repo, adminB, p.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getProduct(repo, adminA, p.id)).toMatchObject({ name: "Shampoo", stockQuantity: 10, active: true });
  });

  it("a listagem de outro pet shop vem vazia", async () => {
    const { repo } = await setup();
    expect(await listProducts(repo, adminB, { includeInactive: true })).toEqual([]);
  });
});

describe("permissões", () => {
  it("ATTENDANT dá entrada, mas não cria, edita, ajusta nem desativa", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    await expect(registerEntry(repo, attA, p.id, { quantity: "1" })).resolves.toBeTruthy();
    await expect(createProduct(repo, attA, shampoo)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateProduct(repo, attA, p.id, { name: "Xx", price: "1", minStock: "0" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registerAdjustment(repo, attA, p.id, { delta: "-1", reason: "Perda" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setProductActive(repo, attA, p.id, false)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("GROOMER só consulta", async () => {
    const { repo } = memoryRepo();
    const p = await createProduct(repo, adminA, shampoo);
    expect(await listProducts(repo, groomerA)).toHaveLength(1);
    expect(await getProduct(repo, groomerA, p.id)).toBeTruthy();
    await expect(registerEntry(repo, groomerA, p.id, { quantity: "1" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as InventoryRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(createProduct(spy, attA, shampoo)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registerEntry(spy, groomerA, "p", { quantity: "1" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registerAdjustment(spy, attA, "p", { delta: "1", reason: "abc" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
