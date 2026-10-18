export const USER_STATUSES = ["ACTIVE", "INACTIVE", "VACATION"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  VACATION: "Férias",
};

export const VACATION_MIN_DAYS = 1;
export const VACATION_MAX_DAYS = 365;
export const VACATION_DAYS_MESSAGE = `Informe quantos dias de férias (de ${VACATION_MIN_DAYS} a ${VACATION_MAX_DAYS})`;

/** Aceita só inteiros positivos dentro do limite ("10", " 10 "). Qualquer outra coisa vira null. */
export function parseVacationDays(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= VACATION_MIN_DAYS && n <= VACATION_MAX_DAYS ? n : null;
}
