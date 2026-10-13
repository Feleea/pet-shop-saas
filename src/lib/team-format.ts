import type { Role } from "./session";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  ATTENDANT: "Atendente",
  GROOMER: "Tosador",
  VET: "Veterinário",
};

/** Data em dd/mm/aaaa, em UTC (independe do fuso e do ICU do servidor). */
export function formatDateBR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
