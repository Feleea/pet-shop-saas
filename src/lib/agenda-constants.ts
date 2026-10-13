import type { Role } from "./session";

export const APPOINTMENT_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELED", "NO_SHOW"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Só estes ocupam o horário. Cancelado e falta liberam o horário. */
export const BLOCKING_STATUSES = ["SCHEDULED", "COMPLETED"] as const;

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Faltou",
};

/** Quem pode ser escolhido como profissional (atendente não executa serviços). Também precisa estar ATIVO. */
export const ELIGIBLE_PROFESSIONAL_ROLES: readonly Role[] = ["ADMIN", "GROOMER", "VET"];

export const MSG = {
  professionalBusy: "O profissional já tem um agendamento neste horário",
  petBusy: "O pet já tem um agendamento neste horário",
  notScheduled: "Só agendamentos com situação Agendado podem ser alterados",
  past: "O horário não pode estar no passado",
  step5: "O horário deve ser em múltiplos de 5 minutos",
  noShowEarly: "Só é possível marcar falta depois do horário do agendamento",
  serviceUnavailable: "Serviço indisponível",
  professionalUnavailable: "Profissional indisponível",
} as const;
