import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ConflictError } from "./errors";
import { USER_EXISTS_MESSAGE, type TeamRepo } from "./team-service";
import { withTenant } from "./tenant";

const inviteSelect = { id: true, tenantId: true, name: true, email: true, role: true, expiresAt: true, createdAt: true } as const;

// REGRA: consultas por tenant passam por withTenant(). A única exceção é findInviteByTokenHash (o token é a credencial).
export const prismaTeamRepo: TeamRepo = {
  listUsers: (tenantId) =>
    db.user.findMany({
      where: withTenant({ tenantId }),
      select: { id: true, name: true, email: true, role: true, status: true, vacationReturnsAt: true, createdAt: true },
      orderBy: { name: "asc" },
    }),

  async userEmailExists(tenantId, email) {
    return (await db.user.count({ where: withTenant({ tenantId }, { email: { equals: email, mode: "insensitive" as const } }) })) > 0;
  },

  listPendingInvites: (tenantId, now) =>
    db.invite.findMany({
      where: withTenant({ tenantId }, { acceptedAt: null, expiresAt: { gt: now } }),
      select: inviteSelect,
      orderBy: { createdAt: "desc" },
    }),

  async pendingInviteExists(tenantId, email, now) {
    const count = await db.invite.count({
      where: withTenant({ tenantId }, { email: { equals: email, mode: "insensitive" as const }, acceptedAt: null, expiresAt: { gt: now } }),
    });
    return count > 0;
  },

  createInvite: (tenantId, data) => db.invite.create({ data: { tenantId, ...data }, select: inviteSelect }),

  async revokeInvite(tenantId, id) {
    const result = await db.invite.deleteMany({ where: withTenant({ tenantId }, { id, acceptedAt: null }) });
    return result.count > 0;
  },

  async findInviteByTokenHash(tokenHash) {
    const invite = await db.invite.findUnique({
      where: { tokenHash },
      select: { ...inviteSelect, acceptedAt: true, tenant: { select: { name: true } } },
    });
    if (!invite) return null;
    const { tenant, ...rest } = invite;
    return { ...rest, tenantName: tenant.name };
  },

  async acceptInvite({ inviteId, tenantId, passwordHash, now }) {
    try {
      return await db.$transaction(async (tx) => {
        // updateMany com a condição no WHERE garante que só UMA requisição consegue aceitar o convite.
        const claimed = await tx.invite.updateMany({
          where: withTenant({ tenantId }, { id: inviteId, acceptedAt: null, expiresAt: { gt: now } }),
          data: { acceptedAt: now },
        });
        if (claimed.count === 0) return null;

        const invite = await tx.invite.findFirstOrThrow({ where: withTenant({ tenantId }, { id: inviteId }) });
        const user = await tx.user.create({
          data: { tenantId, name: invite.name, email: invite.email, passwordHash, role: invite.role },
        });
        return { userId: user.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictError(USER_EXISTS_MESSAGE);
      throw e;
    }
  },
};
