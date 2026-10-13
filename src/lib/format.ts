import type { PetSize, Species } from "./customer-validation";

export const SPECIES_LABEL: Record<Species, string> = { DOG: "Cachorro", CAT: "Gato", BIRD: "Ave", OTHER: "Outro" };
export const SIZE_LABEL: Record<PetSize, string> = { SMALL: "Pequeno", MEDIUM: "Médio", LARGE: "Grande" };

/** "71991234567" -> "(71) 99123-4567". Aceita DDI 55; outros formatos voltam sem alteração. */
export function formatPhone(digits: string): string {
  let d = digits.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export function petAge(birth: Date, now: Date = new Date()): { years: number; months: number } {
  if (birth.getTime() > now.getTime()) return { years: 0, months: 0 };
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  let months = now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months };
}

export function formatAge(birth: Date, now: Date = new Date()): string {
  const { years, months } = petAge(birth, now);
  const y = years === 1 ? "1 ano" : `${years} anos`;
  const m = months === 1 ? "1 mês" : `${months} meses`;
  if (years > 0 && months > 0) return `${y} e ${m}`;
  if (years > 0) return y;
  if (months > 0) return m;
  return "menos de 1 mês";
}
