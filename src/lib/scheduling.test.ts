import { describe, expect, it } from "vitest";
import { conflictsWithAny, hasConflict } from "./scheduling";

const t = (h: number, m = 0) => new Date(2026, 0, 1, h, m);

describe("hasConflict", () => {
  it("detecta sobreposição parcial", () => {
    expect(hasConflict({ start: t(9), end: t(10) }, { start: t(9, 30), end: t(10, 30) })).toBe(true);
  });

  it("detecta um intervalo contido em outro", () => {
    expect(hasConflict({ start: t(9), end: t(12) }, { start: t(10), end: t(11) })).toBe(true);
  });

  it("não considera conflito quando um termina exatamente quando o outro começa", () => {
    expect(hasConflict({ start: t(9), end: t(10) }, { start: t(10), end: t(11) })).toBe(false);
  });

  it("não considera conflito para intervalos separados", () => {
    expect(hasConflict({ start: t(9), end: t(10) }, { start: t(14), end: t(15) })).toBe(false);
  });
});

describe("conflictsWithAny", () => {
  it("retorna false para lista vazia", () => {
    expect(conflictsWithAny({ start: t(9), end: t(10) }, [])).toBe(false);
  });

  it("retorna true se qualquer agendamento conflitar", () => {
    const existing = [
      { start: t(8), end: t(9) },
      { start: t(9, 30), end: t(10, 30) },
    ];
    expect(conflictsWithAny({ start: t(10), end: t(11) }, existing)).toBe(true);
  });
});
