import {
  ELIGIBLE_PROFESSIONAL_ROLES,
  MSG,
  type AppointmentStatus,
} from "./agenda-constants";
import { appointmentSchema, rescheduleSchema } from "./agenda-validation";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertCan, can } from "./permissions";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";
import { SHOP_TIMEZONE, dayRangeUtc, isValidDateString, localDateString, zonedLocalToUtc } from "./timezone";
import type { UserStatus } from "./user-status";

export interface AppointmentRecord {
  id: string;
  tenantId: string;
  customerId: string;
  petId: string;
  serviceId: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  status: AppointmentStatus;
  notes: string | null;
}
export interface AppointmentView extends AppointmentRecord {
  customerName: string;
  petName: string;
  professionalName: string;
}
export type NewAppointment = Omit<AppointmentRecord, "id" | "tenantId" | "status">;

export interface ServiceInfo {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}
export interface ProfessionalInfo {
  id: string;
  name: string;
  role: Role;
  status: UserStatus;
}

export type SlotFailure = "PROFESSIONAL_BUSY" | "PET_BUSY" | "NOT_FOUND" | "NOT_SCHEDULED";
export type SlotResult<T> = { ok: true; value: T } | { ok: false; reason: SlotFailure };

/**
 * Toda operação recebe o tenantId. As operações "IfFree" precisam ser ATÔMICAS no repositório:
 * checar conflito e gravar na mesma transação, com trava, para duas requisições simultâneas não furarem a regra.
 */
export interface AgendaRepo {
  /** O pet precisa ser do cliente, e os dois do tenant. */
  findCustomerPet(tenantId: string, customerId: string, petId: string): Promise<{ customerName: string; petName: string } | null>;
  findService(tenantId: string, id: string): Promise<ServiceInfo | null>;
  findProfessional(tenantId: string, id: string): Promise<ProfessionalInfo | null>;
  listProfessionals(tenantId: string): Promise<ProfessionalInfo[]>;
  createAppointmentIfFree(tenantId: string, data: NewAppointment): Promise<SlotResult<AppointmentRecord>>;
  rescheduleIfFree(
    tenantId: string,
    id: string,
    data: { startsAt: Date; endsAt: Date; professionalId: string },
  ): Promise<SlotResult<AppointmentRecord>>;
  findAppointment(tenantId: string, id: string): Promise<AppointmentView | null>;
  listAppointments(tenantId: string, range: { from: Date; to: Date; professionalId?: string }): Promise<AppointmentView[]>;
  /** Só muda se o agendamento ainda estiver SCHEDULED (atômico). */
  setStatus(tenantId: string, id: string, to: AppointmentStatus): Promise<AppointmentRecord | null>;
}

export interface AgendaDeps {
  now?: Date;
  tz?: string;
}

function parse<T>(schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0].message);
  return r.data;
}

function unwrap<T>(r: SlotResult<T>): T {
  if (r.ok) return r.value;
  switch (r.reason) {
    case "PROFESSIONAL_BUSY":
      throw new ConflictError(MSG.professionalBusy);
    case "PET_BUSY":
      throw new ConflictError(MSG.petBusy);
    case "NOT_FOUND":
      throw new NotFoundError("Agendamento");
    case "NOT_SCHEDULED":
      throw new ValidationError(MSG.notScheduled);
  }
}

function resolveStart(date: string, time: string, tz: string, now: Date): Date {
  if (!isValidDateString(date)) throw new ValidationError("Data inválida");
  if (Number(time.slice(3, 5)) % 5 !== 0) throw new ValidationError(MSG.step5);
  const startsAt = zonedLocalToUtc(date, time, tz);
  if (!startsAt) throw new ValidationError("Horário inexistente neste dia");
  if (startsAt.getTime() < now.getTime()) throw new ValidationError(MSG.past);
  return startsAt;
}

async function requireEligibleProfessional(repo: AgendaRepo, tenantId: string, id: string) {
  const p = await repo.findProfessional(tenantId, id);
  if (!p || p.status !== "ACTIVE" || !ELIGIBLE_PROFESSIONAL_ROLES.includes(p.role)) {
    throw new ValidationError(MSG.professionalUnavailable);
  }
  return p;
}

export async function createAppointment(repo: AgendaRepo, session: SessionPayload, raw: unknown, deps: AgendaDeps = {}) {
  assertCan(session, "write");
  const input = parse(appointmentSchema, raw);
  const tz = deps.tz ?? SHOP_TIMEZONE;
  const startsAt = resolveStart(input.date, input.time, tz, deps.now ?? new Date());

  // Cliente, pet, serviço e profissional precisam ser DESTE pet shop; qualquer falha responde sem revelar o motivo exato.
  if (!(await repo.findCustomerPet(session.tenantId, input.customerId, input.petId))) throw new NotFoundError("Cliente ou pet");
  const service = await repo.findService(session.tenantId, input.serviceId);
  if (!service || !service.active) throw new ValidationError(MSG.serviceUnavailable);
  await requireEligibleProfessional(repo, session.tenantId, input.professionalId);

  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  return unwrap(
    await repo.createAppointmentIfFree(session.tenantId, {
      customerId: input.customerId,
      petId: input.petId,
      serviceId: service.id,
      professionalId: input.professionalId,
      startsAt,
      endsAt,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      notes: input.notes ?? null,
    }),
  );
}

export async function rescheduleAppointment(
  repo: AgendaRepo,
  session: SessionPayload,
  id: string,
  raw: unknown,
  deps: AgendaDeps = {},
) {
  assertCan(session, "write");
  const input = parse(rescheduleSchema, raw);
  const appt = await repo.findAppointment(session.tenantId, id);
  if (!appt) throw new NotFoundError("Agendamento");
  if (appt.status !== "SCHEDULED") throw new ValidationError(MSG.notScheduled);

  const startsAt = resolveStart(input.date, input.time, deps.tz ?? SHOP_TIMEZONE, deps.now ?? new Date());
  await requireEligibleProfessional(repo, session.tenantId, input.professionalId);

  // A duração é a do momento em que foi agendado (snapshot), mesmo que o catálogo tenha mudado.
  const endsAt = new Date(startsAt.getTime() + appt.durationMinutes * 60_000);
  return unwrap(await repo.rescheduleIfFree(session.tenantId, id, { startsAt, endsAt, professionalId: input.professionalId }));
}

const CHANGEABLE = ["COMPLETED", "CANCELED", "NO_SHOW"] as const;

/**
 * Concluir: quem escreve (ADMIN, ATTENDANT) OU o próprio profissional do agendamento.
 * Cancelar e marcar falta: só quem escreve. Falta só vale depois do horário marcado.
 */
export async function changeAppointmentStatus(
  repo: AgendaRepo,
  session: SessionPayload,
  id: string,
  to: unknown,
  deps: AgendaDeps = {},
) {
  const target = CHANGEABLE.find((s) => s === to);
  if (!target) throw new ValidationError("Situação inválida");
  assertCan(session, target === "COMPLETED" ? "read" : "write");

  const appt = await repo.findAppointment(session.tenantId, id);
  if (!appt) throw new NotFoundError("Agendamento");
  if (target === "COMPLETED" && !can(session.role, "write") && appt.professionalId !== session.userId) {
    throw new ForbiddenError("Você não tem permissão para esta ação");
  }
  if (appt.status !== "SCHEDULED") throw new ValidationError(MSG.notScheduled);
  if (target === "NO_SHOW" && appt.startsAt.getTime() > (deps.now ?? new Date()).getTime()) {
    throw new ValidationError(MSG.noShowEarly);
  }

  const updated = await repo.setStatus(session.tenantId, id, target);
  if (!updated) throw new ValidationError(MSG.notScheduled); // alguém mudou no meio do caminho
  return updated;
}

export async function listAgenda(
  repo: AgendaRepo,
  session: SessionPayload,
  opts: { date?: string; professionalId?: string } = {},
  deps: AgendaDeps = {},
) {
  assertCan(session, "read");
  const tz = deps.tz ?? SHOP_TIMEZONE;
  const date = opts.date?.trim() ? opts.date.trim() : localDateString(deps.now ?? new Date(), tz);
  if (!isValidDateString(date)) throw new ValidationError("Data inválida");
  const { from, to } = dayRangeUtc(date, tz);
  const items = await repo.listAppointments(session.tenantId, { from, to, professionalId: opts.professionalId || undefined });
  return { date, items };
}

export async function getAppointment(repo: AgendaRepo, session: SessionPayload, id: string) {
  assertCan(session, "read");
  const appt = await repo.findAppointment(session.tenantId, id);
  if (!appt) throw new NotFoundError("Agendamento");
  return appt;
}

export async function listProfessionals(repo: AgendaRepo, session: SessionPayload) {
  assertCan(session, "read");
  return repo.listProfessionals(session.tenantId);
}
