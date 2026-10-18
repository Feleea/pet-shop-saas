import { db } from "./db";
import { withTenant } from "./tenant";
import type { UserStatusRepo } from "./user-status-service";

const select = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  vacationReturnsAt: true,
  statusChangedAt: true,
} as const;

// REGRA: todo `where` passa por withTenant().
export const prismaUserStatusRepo: UserStatusRepo = {
  findUser: (tenantId, id) => db.user.findFirst({ where: withTenant({ tenantId }, { id }), select }),

  async setUserStatus(tenantId, id, { status, vacationReturnsAt, now }) {
    // Defesa em profundidade: mesmo que o serviço falhe, o banco não altera um ADMIN por aqui.
    const result = await db.user.updateMany({
      where: withTenant({ tenantId }, { id, role: { not: "ADMIN" as const } }),
      data: { status, vacationReturnsAt, statusChangedAt: now },
    });
    if (result.count === 0) return null;
    return db.user.findFirst({ where: withTenant({ tenantId }, { id }), select });
  },
};
