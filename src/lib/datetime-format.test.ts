import { describe, expect, it } from "vitest";
import { formatDateTimeBR } from "./datetime-format";

describe("formatDateTimeBR", () => {
  it("usa o horário de Brasília", () => {
    expect(formatDateTimeBR(new Date("2026-10-13T13:05:00.000Z"))).toBe("13/10/2026 10:05");
  });
  it("vira o dia corretamente (02:30Z ainda é a noite anterior em Brasília)", () => {
    expect(formatDateTimeBR(new Date("2026-10-14T02:30:00.000Z"))).toBe("13/10/2026 23:30");
  });
  it("aceita outro fuso", () => {
    expect(formatDateTimeBR(new Date("2026-10-13T13:05:00.000Z"), "UTC")).toBe("13/10/2026 13:05");
  });
});
