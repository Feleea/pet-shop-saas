import { Prisma } from "@prisma/client";
import { DUPLICATE_NAME_MESSAGE, type CatalogRepo } from "./catalog-service";
import { db } from "./db";
import { ConflictError } from "./errors";
import { withTenant } from "./tenant";

// Rede de segurança: se duas requisições passarem juntas pela pré-checagem, o índice único do banco barra a segunda.
async function mapConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ConflictError(DUPLICATE_NAME_MESSAGE);
    }
    throw e;
  }
}

// REGRA: todo `where` passa por withTenant().
export const prismaCatalogRepo: CatalogRepo = {
  createService: (tenantId, data) => mapConflict(() => db.service.create({ data: { tenantId, ...data } })),

  listServices: (tenantId, { includeInactive }) =>
    db.service.findMany({
      where: withTenant({ tenantId }, includeInactive ? {} : { active: true }),
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),

  findService: (tenantId, id) => db.service.findFirst({ where: withTenant({ tenantId }, { id }) }),

  async updateService(tenantId, id, data) {
    const result = await mapConflict(() => db.service.updateMany({ where: withTenant({ tenantId }, { id }), data }));
    if (result.count === 0) return null;
    return db.service.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async setServiceActive(tenantId, id, active) {
    const result = await db.service.updateMany({ where: withTenant({ tenantId }, { id }), data: { active } });
    if (result.count === 0) return null;
    return db.service.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async nameExists(tenantId, name, excludeId) {
    const count = await db.service.count({
      where: withTenant(
        { tenantId },
        { name: { equals: name, mode: "insensitive" as const }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      ),
    });
    return count > 0;
  },
};
