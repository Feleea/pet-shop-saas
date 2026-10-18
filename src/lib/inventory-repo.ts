import { Prisma } from "@prisma/client";
import type { InventoryRepo, MovementRecord, ProductData, ProductRecord } from "./inventory-service";
import { db } from "./db";
import { ConflictError } from "./errors";
import { withTenant } from "./tenant";

function mapProduct(row: {
  id: string; tenantId: string; name: string; priceCents: number; minStock: number;
  ncm: string | null; cfop: string | null; csosn: string | null; unit: string;
  stockQuantity: number; active: boolean;
}): ProductRecord {
  return {
    id: row.id, tenantId: row.tenantId, name: row.name, priceCents: row.priceCents,
    minStock: row.minStock, ncm: row.ncm, cfop: row.cfop, csosn: row.csosn,
    unit: row.unit, stockQuantity: row.stockQuantity, active: row.active,
  };
}

async function mapConflict<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Já existe um produto com este nome");
    }
    throw error;
  }
}

export const prismaInventoryRepo: InventoryRepo = {
  async createProduct(tenantId, data: ProductData, initial) {
    return mapConflict(() => db.$transaction(async (tx) => {
      const p = await tx.product.create({ data: { tenantId, ...data, stockQuantity: initial.quantity } });
      if (initial.quantity > 0) {
        await tx.stockMovement.create({ data: {
          tenantId, productId: p.id, type: "INITIAL", quantity: initial.quantity,
          note: "Estoque inicial", createdById: initial.userId,
        } });
      }
      return mapProduct(p);
    }));
  },

  async listProducts(tenantId, { includeInactive, search }) {
    const rows = await db.product.findMany({
      where: withTenant({ tenantId }, {
        ...(includeInactive ? {} : { active: true }),
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      }),
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return rows.map(mapProduct);
  },

  async findProduct(tenantId, id) {
    const p = await db.product.findFirst({ where: withTenant({ tenantId }, { id }) });
    return p ? mapProduct(p) : null;
  },

  async updateProduct(tenantId, id, data) {
    const result = await mapConflict(() => db.product.updateMany({ where: withTenant({ tenantId }, { id }), data }));
    return result.count ? this.findProduct(tenantId, id) : null;
  },

  async setProductActive(tenantId, id, active) {
    const result = await db.product.updateMany({ where: withTenant({ tenantId }, { id }), data: { active } });
    return result.count ? this.findProduct(tenantId, id) : null;
  },

  async nameExists(tenantId, name, excludeId) {
    return (await db.product.count({ where: withTenant({ tenantId }, {
      name: { equals: name, mode: "insensitive" as const }, ...(excludeId ? { NOT: { id: excludeId } } : {}),
    }) })) > 0;
  },

  async applyMovement(tenantId, productId, movement) {
    return db.$transaction(async (tx) => {
      const condition = movement.delta < 0 ? { stockQuantity: { gte: -movement.delta } } : {};
      const changed = await tx.product.updateMany({
        where: withTenant({ tenantId }, { id: productId, ...condition }),
        data: { stockQuantity: { increment: movement.delta } },
      });
      if (!changed.count) {
        const exists = await tx.product.count({ where: withTenant({ tenantId }, { id: productId }) });
        return { ok: false, reason: exists ? "INSUFFICIENT" : "NOT_FOUND" } as const;
      }
      const p = await tx.product.findFirstOrThrow({ where: withTenant({ tenantId }, { id: productId }) });
      const row = await tx.stockMovement.create({ data: {
        tenantId, productId, type: movement.type, quantity: movement.delta,
        note: movement.note, createdById: movement.userId,
      }, include: { createdBy: { select: { name: true } } } });
      const result: MovementRecord = {
        id: row.id, productId: row.productId, type: row.type, quantity: row.quantity,
        note: row.note, createdAt: row.createdAt, createdByName: row.createdBy.name,
      };
      return { ok: true, product: mapProduct(p), movement: result } as const;
    });
  },

  async listMovements(tenantId, productId, limit) {
    const rows = await db.stockMovement.findMany({
      where: withTenant({ tenantId }, { productId }),
      orderBy: { createdAt: "desc" }, take: limit,
      include: { createdBy: { select: { name: true } } },
    });
    return rows.map((row): MovementRecord => ({
      id: row.id, productId: row.productId, type: row.type, quantity: row.quantity,
      note: row.note, createdAt: row.createdAt, createdByName: row.createdBy.name,
    }));
  },
};
