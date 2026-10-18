import { NotFoundError, ValidationError } from "./errors";
import { assertCan } from "./permissions";
import type { Role, SessionPayload } from "./session";
import { USER_STATUSES, VACATION_DAYS_MESSAGE, parseVacationDays, type UserStatus } from "./user-status";

export interface ManagedUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  vacationReturnsAt: Date | null;
  statusChangedAt: Date;
}

export interface UserStatusRepo {
  findUser(tenantId: string, id: string): Promise<ManagedUser | null>;
  setUserStatus(
    tenantId: string,
    id: string,
    data: { status: UserStatus; vacationReturnsAt: Date | null; now: Date },
  ): Promise<ManagedUser | null>;
}

export const SELF_MESSAGE = "Você não pode alterar a sua própria situação";
export const ADMIN_MESSAGE = "O administrador não pode ser desativado";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ativa, desativa ou coloca de férias um usuário do mesmo pet shop (só ADMIN).
 * Em VACATION grava a data prevista de retorno (agora + n dias). A reativação automática nessa data
 * será desenvolvida depois; até lá, o ADMIN reativa manualmente.
 */
export async function changeUserStatus(
  repo: UserStatusRepo,
  session: SessionPayload,
  targetId: string,
  raw: { status: unknown; vacationDays?: unknown },
  now: Date = new Date(),
): Promise<ManagedUser> {
  assertCan(session, "users");

  const status = USER_STATUSES.find((s) => s === raw.status);
  if (!status) throw new ValidationError("Situação inválida");

  // Os dias de férias só importam (e só são validados) quando a situação pedida é VACATION.
  let vacationReturnsAt: Date | null = null;
  if (status === "VACATION") {
    const days = parseVacationDays(raw.vacationDays);
    if (days === null) throw new ValidationError(VACATION_DAYS_MESSAGE);
    vacationReturnsAt = new Date(now.getTime() + days * DAY_MS);
  }

  if (targetId === session.userId) throw new ValidationError(SELF_MESSAGE);

  const target = await repo.findUser(session.tenantId, targetId);
  if (!target) throw new NotFoundError("Usuário");
  if (target.role === "ADMIN") throw new ValidationError(ADMIN_MESSAGE);

  const updated = await repo.setUserStatus(session.tenantId, targetId, { status, vacationReturnsAt, now });
  if (!updated) throw new NotFoundError("Usuário");
  return updated;
}
