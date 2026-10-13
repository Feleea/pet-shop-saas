import { db } from "./db";
import type { AuthRepo } from "./auth-service";

export const prismaAuthRepo: AuthRepo = {
  async slugExists(slug) {
    return (await db.tenant.count({ where: { slug } })) > 0;
  },

  async createTenantWithAdmin({ tenantName, slug, adminName, email, passwordHash }) {
    const tenant = await db.tenant.create({
      data: {
        name: tenantName,
        slug,
        users: { create: { name: adminName, email, passwordHash, role: "ADMIN" } },
      },
      include: { users: true },
    });
    return { tenantId: tenant.id, userId: tenant.users[0].id };
  },

  async findUserByTenantSlugAndEmail(slug, email) {
    const user = await db.user.findFirst({
      where: { email, tenant: { slug } },
      select: { id: true, tenantId: true, name: true, role: true, passwordHash: true },
    });
    return user;
  },
};
