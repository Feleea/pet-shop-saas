import { db } from "./db";
import type { CustomerRepo } from "./customer-service";
import { withTenant } from "./tenant";

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
    const result = await db.customer.deleteMany({ where: withTenant({ tenantId }, { id }) });
    return result.count > 0;
  },

  createPet: (tenantId, customerId, data) => db.pet.create({ data: { tenantId, customerId, ...data } }),

  async updatePet(tenantId, id, data) {
    const result = await db.pet.updateMany({ where: withTenant({ tenantId }, { id }), data });
    if (result.count === 0) return null;
    return db.pet.findFirst({ where: withTenant({ tenantId }, { id }) });
  },

  async deletePet(tenantId, id) {
    const result = await db.pet.deleteMany({ where: withTenant({ tenantId }, { id }) });
    return result.count > 0;
  },
};
