import type { Prisma } from "@prisma/client";
import { BLOCKING_STATUSES, ELIGIBLE_PROFESSIONAL_ROLES } from "./agenda-constants";
import type { AgendaRepo, AppointmentRecord, AppointmentView, SlotResult } from "./agenda-service";
import { db } from "./db";
import { withTenant } from "./tenant";

const viewSelect = {
  id: true,
  tenantId: true,
  customerId: true,
  petId: true,
  serviceId: true,
  professionalId: true,
  startsAt: true,
  endsAt: true,
  serviceName: true,
  durationMinutes: true,
  priceCents: true,
  status: true,
  notes: true,
  customer: { select: { name: true } },
  pet: { select: { name: true } },
  professional: { select: { name: true } },
} as const;

function toView(row: Prisma.AppointmentGetPayload<{ select: typeof viewSelect }>): AppointmentView {
  const { customer, pet, professional, ...rest } = row;
  return { ...rest, customerName: customer.name, petName: pet.name, professionalName: professional.name };
}

/**
 * Trava por chave dentro da transação (liberada no commit/rollback). Quem chega depois espera,
 * então a checagem de conflito + gravação de duas requisições simultâneas nunca se intercala.
 * As chaves são ordenadas para evitar deadlock.
 */
async function lock(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of [...keys].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

const overlapping = (startsAt: Date, endsAt: Date) => ({
  startsAt: { lt: endsAt },
  endsAt: { gt: startsAt }, // encostar na ponta (um termina quando o outro começa) NÃO é conflito
  status: { in: [...BLOCKING_STATUSES] },
});

type Busy = "PROFESSIONAL_BUSY" | "PET_BUSY" | null;

async function findBusy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slot: { professionalId: string; petId: string; startsAt: Date; endsAt: Date },
  excludeId?: string,
): Promise<Busy> {
  const range = { ...overlapping(slot.startsAt, slot.endsAt), ...(excludeId ? { NOT: { id: excludeId } } : {}) };
  if ((await tx.appointment.count({ where: withTenant({ tenantId }, { professionalId: slot.professionalId, ...range }) })) > 0) {
    return "PROFESSIONAL_BUSY";
  }
  if ((await tx.appointment.count({ where: withTenant({ tenantId }, { petId: slot.petId, ...range }) })) > 0) return "PET_BUSY";
  return null;
}

// REGRA: todo `where` passa por withTenant().
export const prismaAgendaRepo: AgendaRepo = {
  async findCustomerPet(tenantId, customerId, petId) {
    const pet = await db.pet.findFirst({
      where: withTenant({ tenantId }, { id: petId, customerId }),
      select: { name: true, customer: { select: { name: true } } },
    });
    return pet ? { customerName: pet.customer.name, petName: pet.name } : null;
  },

  findService: (tenantId, id) =>
    db.service.findFirst({
      where: withTenant({ tenantId }, { id }),
      select: { id: true, name: true, durationMinutes: true, priceCents: true, active: true },
    }),

  findProfessional: (tenantId, id) =>
    db.user.findFirst({ where: withTenant({ tenantId }, { id }), select: { id: true, name: true, role: true, status: true } }),

  listProfessionals: (tenantId) =>
    db.user.findMany({
      where: withTenant({ tenantId }, { status: "ACTIVE" as const, role: { in: [...ELIGIBLE_PROFESSIONAL_ROLES] } }),
      select: { id: true, name: true, role: true, status: true },
      orderBy: { name: "asc" },
    }),

  createAppointmentIfFree(tenantId, data): Promise<SlotResult<AppointmentRecord>> {
    return db.$transaction(async (tx) => {
      await lock(tx, [`prof:${tenantId}:${data.professionalId}`, `pet:${tenantId}:${data.petId}`]);
      const busy = await findBusy(tx, tenantId, data);
      if (busy) return { ok: false, reason: busy } as const;
      const created = await tx.appointment.create({ data: { tenantId, ...data } });
      return { ok: true, value: created } as const;
    });
  },

  rescheduleIfFree(tenantId, id, { startsAt, endsAt, professionalId }): Promise<SlotResult<AppointmentRecord>> {
    return db.$transaction(async (tx) => {
      const first = await tx.appointment.findFirst({ where: withTenant({ tenantId }, { id }) });
      if (!first) return { ok: false, reason: "NOT_FOUND" } as const;

      await lock(tx, [`prof:${tenantId}:${professionalId}`, `pet:${tenantId}:${first.petId}`]);
      const current = await tx.appointment.findFirst({ where: withTenant({ tenantId }, { id }) }); // relê já com a trava
      if (!current) return { ok: false, reason: "NOT_FOUND" } as const;
      if (current.status !== "SCHEDULED") return { ok: false, reason: "NOT_SCHEDULED" } as const;

      const busy = await findBusy(tx, tenantId, { professionalId, petId: current.petId, startsAt, endsAt }, id);
      if (busy) return { ok: false, reason: busy } as const;

      const updated = await tx.appointment.update({ where: { id }, data: { startsAt, endsAt, professionalId } });
      return { ok: true, value: updated } as const;
    });
  },

  async findAppointment(tenantId, id) {
    const row = await db.appointment.findFirst({ where: withTenant({ tenantId }, { id }), select: viewSelect });
    return row ? toView(row) : null;
  },

  async listAppointments(tenantId, { from, to, professionalId }) {
    const rows = await db.appointment.findMany({
      where: withTenant({ tenantId }, { startsAt: { gte: from, lt: to }, ...(professionalId ? { professionalId } : {}) }),
      select: viewSelect,
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toView);
  },

  async setStatus(tenantId, id, to) {
    const result = await db.appointment.updateMany({
      where: withTenant({ tenantId }, { id, status: "SCHEDULED" as const }),
      data: { status: to },
    });
    if (result.count === 0) return null;
    return db.appointment.findFirst({ where: withTenant({ tenantId }, { id }) });
  },
};
