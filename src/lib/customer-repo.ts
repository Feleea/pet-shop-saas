import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ConflictError } from "./errors";
import type { CustomerRepo } from "./customer-service";
import { withTenant } from "./tenant";

export const HAS_APPOINTMENTS_MESSAGE = "Este cadastro possui agendamentos e não pode ser excluído";

// Agendamentos (mesmo cancelados) ficam no histórico e travam a exclusão (FK com Restrict).
async function mapHasAppointments<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new ConflictError(HAS_APPOINTMENTS_MESSAGE);
    throw e;
  }
}

// REGRA: todo `where` passa por withTenant(). Nunca consulte Customer/Pet sem o tenantId.
export const prismaCustomerRepo: CustomerRepo = {
  createCustomer: (tenantId, data) => db.customer.create({ data: { tenantId, ...data } }),

  async listCustomers(tenantId, search) {
    const rows = await db.customer.findMany({
      where: withTenant({ tenantId }, search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      orderBy: { name: "asc" },
      include: { _count: { select: { pets: true } } },
    });
    return rows.map(({ _count, ...customer }) => ({ ...customer, petCount: _count.pets }));
  },

  findCustomer: (tenantId, id) =>
    db.customer.findFirst({
      where: withTenant({ tenantId }, { id }),
      include: { pets: { where: { tenantId }, orderBy: { name: "asc" } } },
    }),

  async updateCustomer(tenantId, id, data) {
    const result = await db.customer.updateMany({ where: withTenant({ tenantId }, { id }), data });
    if (result.count === 0) return null;
    return db.customer.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async deleteCustomer(tenantId, id) {
    const result = await mapHasAppointments(() => db.customer.deleteMany({ where: withTenant({ tenantId }, { id }) }));
    return result.count > 0;
  },

  createPet: (tenantId, customerId, data) => db.pet.create({ data: { tenantId, customerId, ...data } }),

  async updatePet(tenantId, id, data) {
    const result = await db.pet.updateMany({ where: withTenant({ tenantId }, { id }), data });
    if (result.count === 0) return null;
    return db.pet.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async deletePet(tenantId, id) {
    const result = await mapHasAppointments(() => db.pet.deleteMany({ where: withTenant({ tenantId }, { id }) }));
    return result.count > 0;
  },
};
