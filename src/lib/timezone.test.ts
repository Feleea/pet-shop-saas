import { describe, expect, it } from "vitest";
import { addDays, dayRangeUtc, isValidDateString, localDateString, localTimeString, zonedLocalToUtc } from "./timezone";

const SP = "America/Sao_Paulo";
const NY = "America/New_York";
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("zonedLocalToUtc", () => {
  it("Brasília (UTC-3, sem horário de verão)", () => {
    expect(iso(zonedLocalToUtc("2026-10-13", "10:00", SP))).toBe("2026-10-13T13:00:00.000Z");
    expect(iso(zonedLocalToUtc("2026-01-15", "23:30", SP))).toBe("2026-01-16T02:30:00.000Z"); // vira o dia em UTC
  });

  it("respeita o horário de verão (Nova York: verão UTC-4, inverno UTC-5)", () => {
    expect(iso(zonedLocalToUtc("2026-07-01", "09:00", NY))).toBe("2026-07-01T13:00:00.000Z");
    expect(iso(zonedLocalToUtc("2026-01-15", "09:00", NY))).toBe("2026-01-15T14:00:00.000Z");
  });

  it("fusos com meia hora de diferença (Índia, UTC+5:30)", () => {
    expect(iso(zonedLocalToUtc("2026-10-13", "10:00", "Asia/Kolkata"))).toBe("2026-10-13T04:30:00.000Z");
  });

  it("UTC é a identidade", () => {
    expect(iso(zonedLocalToUtc("2026-10-13", "10:00", "UTC"))).toBe("2026-10-13T10:00:00.000Z");
  });

  it("horário que não existe (salto do horário de verão) retorna null", () => {
    expect(zonedLocalToUtc("2026-03-08", "02:30", NY)).toBeNull();
  });

  it("horário repetido (volta do horário de verão) escolhe um instante e volta ao mesmo relógio", () => {
    const d = zonedLocalToUtc("2026-11-01", "01:30", NY)!;
    expect(localDateString(d, NY)).toBe("2026-11-01");
    expect(localTimeString(d, NY)).toBe("01:30");
  });

  it.each([
    ["2026-02-30", "10:00"],
    ["2026-13-01", "10:00"],
    ["2026-10-13", "25:00"],
    ["2026-10-13", "10:60"],
    ["2026-10-13", "9:00"],
    ["13/10/2026", "10:00"],
    ["", ""],
  ])("recusa %s %s", (date, time) => {
    expect(zonedLocalToUtc(date, time, SP)).toBeNull();
  });

  it("faz o round-trip com os formatadores locais", () => {
    for (const [date, time] of [
      ["2026-10-13", "00:00"],
      ["2026-10-13", "09:05"],
      ["2026-12-31", "23:55"],
      ["2028-02-29", "12:00"],
    ]) {
      const d = zonedLocalToUtc(date, time, SP)!;
      expect([localDateString(d, SP), localTimeString(d, SP)]).toEqual([date, time]);
    }
  });
});

describe("localDateString / localTimeString", () => {
  it("convertem UTC para o relógio local, inclusive na virada do dia", () => {
    const d = new Date("2026-10-13T02:00:00.000Z");
    expect(localDateString(d, SP)).toBe("2026-10-12");
    expect(localTimeString(d, SP)).toBe("23:00");
  });
  it("meia-noite local aparece como 00:00 (não 24:00)", () => {
    const d = new Date("2026-10-13T03:00:00.000Z");
    expect(localDateString(d, SP)).toBe("2026-10-13");
    expect(localTimeString(d, SP)).toBe("00:00");
  });
});

describe("addDays", () => {
  it.each([
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-02-28", 1, "2028-02-29"], // ano bissexto
    ["2026-10-13", 0, "2026-10-13"],
    ["2026-10-13", 30, "2026-11-12"],
  ])("%s %i → %s", (date, n, expected) => expect(addDays(date, n)).toBe(expected));
});

describe("dayRangeUtc", () => {
  it("dia comum em Brasília: 24h começando às 03:00Z", () => {
    const { from, to } = dayRangeUtc("2026-10-13", SP);
    expect([from.toISOString(), to.toISOString()]).toEqual(["2026-10-13T03:00:00.000Z", "2026-10-14T03:00:00.000Z"]);
  });
  it("dia em que o horário de verão começa tem 23h (Nova York)", () => {
    const { from, to } = dayRangeUtc("2026-03-08", NY);
    expect([from.toISOString(), to.toISOString()]).toEqual(["2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"]);
  });
});

describe("isValidDateString", () => {
  it.each(["2026-10-13", "2028-02-29"])("aceita %s", (s) => expect(isValidDateString(s)).toBe(true));
  it.each(["2026-02-29", "2026-02-30", "2026-00-10", "2026-10-32", "26-10-13", "2026/10/13", "", "abc"])("recusa %j", (s) =>
    expect(isValidDateString(s)).toBe(false),
  );
});
