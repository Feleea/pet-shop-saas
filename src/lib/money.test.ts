import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, formatDuration, parsePriceToCents } from "./money";

describe("parsePriceToCents", () => {
  it.each([
    ["50", 5000],
    ["50,5", 5050],
    ["50,50", 5050],
    ["50.50", 5050],
    ["0,5", 50],
    ["0", 0],
    ["R$ 50,00", 5000],
    ["R$50", 5000],
    ["1.250,50", 125050],
    ["1.250", 125000], // ponto + 3 dígitos = milhar
    ["1.5", 150], // ponto + 1 dígito = decimal
    ["12.345.678,9", 1234567890],
    ["  35,90  ", 3590],
  ])("aceita %s → %i centavos", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "5,", ",5", "1,2,3", "1.2.3", "50,555", "10.00.00", "1..250", "R$", "5 0a", "1234567890"])(
    "rejeita %j",
    (input) => {
      expect(parsePriceToCents(input)).toBeNull();
    },
  );
});

describe("formatBRL", () => {
  it.each([
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [5000, "R$ 50,00"],
    [125050, "R$ 1.250,50"],
    [9999999, "R$ 99.999,99"],
    [123456789, "R$ 1.234.567,89"],
  ])("%i → %s", (cents, text) => expect(formatBRL(cents)).toBe(text));

  it("faz o round-trip com o parser", () => {
    for (const cents of [0, 1, 99, 100, 5050, 125050, 9999999]) {
      expect(parsePriceToCents(formatBRL(cents))).toBe(cents);
    }
  });
});

describe("centsToInput", () => {
  it("devolve o valor sem o símbolo, para preencher o formulário", () => {
    expect(centsToInput(5000)).toBe("50,00");
    expect(centsToInput(125050)).toBe("1.250,50");
  });
});

describe("formatDuration", () => {
  it.each([
    [5, "5 min"],
    [45, "45 min"],
    [60, "1h"],
    [75, "1h15"],
    [90, "1h30"],
    [125, "2h05"],
    [480, "8h"],
  ])("%i → %s", (min, text) => expect(formatDuration(min)).toBe(text));
});
