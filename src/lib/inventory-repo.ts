import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ConflictError } from "./errors";
import { DUPLICATE_PRODUCT_MESSAGE, type InventoryRepo, type MovementResult } from "./inventory-service";
import { withTenant } from "./tenant";

class Abort extends Error {
  constructor(public result: MovementResult) {
    super("abort");
  }
}

async function mapNameConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictError(DUPLICATE_PRODUCT_MESSAGE);
    throw e;
  }
}

const movementSelect = {
  id: true,
  productId: true,
  type: true,
  quantity: true,
  note: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const;

// REGRA: todo `where` passa por withTenant().
export const prismaInventoryRepo: InventoryRepo = {
  createProduct: (tenantId, data, initial) =>
    mapNameConflict(() =>
      db.$transaction(async (tx) => {
        const product = await tx.product.create({ data: { tenantId, ...data, stockQuantity: initial.quantity } });
        if (initial.quantity > 0) {
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: product.id,
              type: "INITIAL",
              quantity: initial.quantity,
              note: "Estoque inicial",
              createdById: initial.userId,
            },
          });
        }
        return product;
      }),
    ),

  listProducts: (tenantId, { includeInactive, search }) =>
    db.product.findMany({
      where: withTenant({ tenantId }, {
        ...(includeInactive ? {} : { active: true }),
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      }),
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),

  findProduct: (tenantId, id) => db.product.findFirst({ where: withTenant({ tenantId }, { id }) }),

  async updateProduct(tenantId, id, data) {
    const r = await mapNameConflict(() => db.product.updateMany({ where: withTenant({ tenantId }, { id }), data }));
    if (r.count === 0) return null;
    return db.product.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async setProductActive(tenantId, id, active) {
    const r = await db.product.updateMany({ where: withTenant({ tenantId }, { id }), data: { active } });
    if (r.count === 0) return null;
    return db.product.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async nameExists(tenantId, name, excludeId) {
    const count = await db.product.count({
      where: withTenant({ tenantId }, {
        name: { equals: name, mode: "insensitive" as const },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      }),
    });
    return count > 0;
  },

  async applyMovement(tenantId, productId, { type, delta, note, userId }) {
    try {
      return await db.$transaction(async (tx) => {
        // A condição "saldo suficiente" vai no próprio UPDATE: é atômica, então duas baixas simultâneas nunca deixam o saldo negativo.
        const updated = await tx.product.updateMany({
          where: withTenant({ tenantId }, { id: productId, ...(delta < 0 ? { stockQuantity: { gte: -delta } } : {}) }),
          data: { stockQuantity: { increment: delta } },
        });
        if (updated.count === 0) {
          const exists = await tx.product.count({ where: withTenant({ tenantId }, { id: productId }) });
          throw new Abort({ ok: false, reason: exists ? "INSUFFICIENT" : "NOT_FOUND" });
        }
        const movement = await tx.stockMovement.create({
          data: { tenantId, productId, type, quantity: delta, note, createdById: userId },
          select: movementSelect,
        });
        const product = await tx.product.findFirstOrThrow({ where: withTenant({ tenantId }, { id: productId }) });
        const { createdBy, ...rest } = movement;
        return { ok: true, product, movement: { ...rest, createdByName: createdBy.name } } as const;
      });
    } catch (e) {
      if (e instanceof Abort) return e.result;
      throw e;
    }
  },

  async listMovements(tenantId, productId, limit) {
    const rows = await db.stockMovement.findMany({
      where: withTenant({ tenantId }, { productId }),
      select: movementSelect,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(({ createdBy, ...rest }) => ({ ...rest, createdByName: createdBy.name }));
  },
};
