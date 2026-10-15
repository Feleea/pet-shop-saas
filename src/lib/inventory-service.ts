import { adjustmentSchema, entrySchema, productSchema, productUpdateSchema } from "./inventory-validation";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertCan, can } from "./permissions";
import type { SessionPayload } from "./session";

export type MovementType = "INITIAL" | "IN" | "SALE" | "RETURN" | "ADJUSTMENT";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  INITIAL: "Estoque inicial",
  IN: "Entrada",
  SALE: "Venda",
  RETURN: "Devolução (venda cancelada)",
  ADJUSTMENT: "Ajuste",
};

export interface ProductData {
  name: string;
  priceCents: number;
  minStock: number;
}
export interface ProductRecord extends ProductData {
  id: string;
  tenantId: string;
  stockQuantity: number;
  active: boolean;
}
export interface MovementRecord {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdAt: Date;
  createdByName: string;
}
export type MovementResult =
  | { ok: true; product: ProductRecord; movement: MovementRecord }
  | { ok: false; reason: "NOT_FOUND" | "INSUFFICIENT" };

/** Toda operação recebe o tenantId. `applyMovement` precisa ser ATÔMICO: nunca deixa o saldo negativo, mesmo com requisições simultâneas. */
export interface InventoryRepo {
  createProduct(tenantId: string, data: ProductData, initial: { quantity: number; userId: string }): Promise<ProductRecord>;
  listProducts(tenantId: string, opts: { includeInactive: boolean; search?: string }): Promise<ProductRecord[]>;
  findProduct(tenantId: string, id: string): Promise<ProductRecord | null>;
  updateProduct(tenantId: string, id: string, data: ProductData): Promise<ProductRecord | null>;
  setProductActive(tenantId: string, id: string, active: boolean): Promise<ProductRecord | null>;
  nameExists(tenantId: string, name: string, excludeId?: string): Promise<boolean>;
  applyMovement(
    tenantId: string,
    productId: string,
    m: { type: "IN" | "ADJUSTMENT"; delta: number; note: string | null; userId: string },
  ): Promise<MovementResult>;
  listMovements(tenantId: string, productId: string, limit: number): Promise<MovementRecord[]>;
}

export const DUPLICATE_PRODUCT_MESSAGE = "Já existe um produto com este nome";
export const NEGATIVE_STOCK_MESSAGE = "O ajuste deixaria o estoque negativo";

export type StockLevel = "OUT" | "LOW" | "OK";

/** Sem estoque (saldo ≤ 0), estoque baixo (saldo ≤ mínimo) ou normal. */
export function stockLevel(p: Pick<ProductRecord, "stockQuantity" | "minStock">): StockLevel {
  if (p.stockQuantity <= 0) return "OUT";
  return p.stockQuantity <= p.minStock ? "LOW" : "OK";
}

/** Produto inativo não entra nos alertas: ninguém vai repor o que saiu de linha. */
export const isLowStock = (p: ProductRecord) => p.active && stockLevel(p) !== "OK";

function parse<T>(
  schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
  raw: unknown,
): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0].message);
  return r.data;
}

export async function createProduct(repo: InventoryRepo, session: SessionPayload, raw: unknown) {
  assertCan(session, "catalog");
  const d = parse(productSchema, raw);
  if (await repo.nameExists(session.tenantId, d.name)) throw new ConflictError(DUPLICATE_PRODUCT_MESSAGE);
  return repo.createProduct(
    session.tenantId,
    { name: d.name, priceCents: d.price, minStock: d.minStock },
    { quantity: d.initialStock, userId: session.userId },
  );
}

export async function updateProduct(repo: InventoryRepo, session: SessionPayload, id: string, raw: unknown) {
  assertCan(session, "catalog");
  const d = parse(productUpdateSchema, raw);
  if (await repo.nameExists(session.tenantId, d.name, id)) throw new ConflictError(DUPLICATE_PRODUCT_MESSAGE);
  const updated = await repo.updateProduct(session.tenantId, id, { name: d.name, priceCents: d.price, minStock: d.minStock });
  if (!updated) throw new NotFoundError("Produto");
  return updated;
}

export async function setProductActive(repo: InventoryRepo, session: SessionPayload, id: string, active: boolean) {
  assertCan(session, "catalog");
  const updated = await repo.setProductActive(session.tenantId, id, active);
  if (!updated) throw new NotFoundError("Produto");
  return updated;
}

/** Quem não gerencia o catálogo só enxerga produtos ativos, mesmo que peça os inativos. */
export async function listProducts(
  repo: InventoryRepo,
  session: SessionPayload,
  opts: { includeInactive?: boolean; search?: string; lowOnly?: boolean } = {},
) {
  assertCan(session, "read");
  const includeInactive = Boolean(opts.includeInactive) && can(session.role, "catalog");
  const products = await repo.listProducts(session.tenantId, { includeInactive, search: opts.search?.trim() || undefined });
  return opts.lowOnly ? products.filter(isLowStock) : products;
}

export async function getProduct(repo: InventoryRepo, session: SessionPayload, id: string) {
  assertCan(session, "read");
  const p = await repo.findProduct(session.tenantId, id);
  if (!p) throw new NotFoundError("Produto");
  return p;
}

export async function registerEntry(repo: InventoryRepo, session: SessionPayload, productId: string, raw: unknown) {
  assertCan(session, "stock");
  const d = parse(entrySchema, raw);
  const r = await repo.applyMovement(session.tenantId, productId, {
    type: "IN",
    delta: d.quantity,
    note: d.note ?? null,
    userId: session.userId,
  });
  if (!r.ok) throw new NotFoundError("Produto");
  return r;
}

/** Ajuste (perda, quebra, contagem): só ADMIN, motivo obrigatório, nunca deixa o saldo negativo. */
export async function registerAdjustment(repo: InventoryRepo, session: SessionPayload, productId: string, raw: unknown) {
  assertCan(session, "catalog");
  const d = parse(adjustmentSchema, raw);
  const r = await repo.applyMovement(session.tenantId, productId, {
    type: "ADJUSTMENT",
    delta: d.delta,
    note: d.reason,
    userId: session.userId,
  });
  if (r.ok) return r;
  if (r.reason === "INSUFFICIENT") throw new ConflictError(NEGATIVE_STOCK_MESSAGE);
  throw new NotFoundError("Produto");
}

export async function listMovements(repo: InventoryRepo, session: SessionPayload, productId: string, limit = 50) {
  assertCan(session, "read");
  if (!(await repo.findProduct(session.tenantId, productId))) throw new NotFoundError("Produto");
  return repo.listMovements(session.tenantId, productId, limit);
}
