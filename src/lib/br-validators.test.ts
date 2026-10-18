import { describe, expect, it } from "vitest";
import { UFS, formatCep, formatCnpj, isValidCnpj, isValidUf, onlyDigits } from "./br-validators";

describe("isValidCnpj", () => {
  it.each(["11222333000181", "11.222.333/0001-81", "11444777000161", "11.444.777/0001-61"])("aceita %s", (c) =>
    expect(isValidCnpj(c)).toBe(true),
  );
  it.each([
    "11222333000182", // dígito verificador errado
    "11222333000191",
    "00000000000000",
    "11111111111111",
    "1122233300018", // 13 dígitos
    "112223330001811", // 15 dígitos
    "abc",
    "",
  ])("recusa %j", (c) => expect(isValidCnpj(c)).toBe(false));
});

describe("formatação", () => {
  it("CNPJ", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("123")).toBe("123");
  });
  it("CEP", () => {
    expect(formatCep("40010000")).toBe("40010-000");
    expect(formatCep("123")).toBe("123");
  });
  it("só dígitos", () => expect(onlyDigits("(71) 99123-4567")).toBe("71991234567"));
});

describe("UFs", () => {
  it("são 27 e todas válidas", () => {
    expect(UFS).toHaveLength(27);
    expect(UFS.every(isValidUf)).toBe(true);
  });
  it.each(["XX", "ba", "", "BAA"])("recusa %j", (uf) => expect(isValidUf(uf)).toBe(false));
});
