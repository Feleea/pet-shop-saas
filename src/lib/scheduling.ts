export interface TimeSlot {
  start: Date;
  end: Date;
}

/** Dois intervalos conflitam se se sobrepõem; encostar nas pontas NÃO é conflito. */
export function hasConflict(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Verifica se um novo horário conflita com algum já agendado do mesmo profissional. */
export function conflictsWithAny(slot: TimeSlot, existing: TimeSlot[]): boolean {
  return existing.some((e) => hasConflict(slot, e));
}
