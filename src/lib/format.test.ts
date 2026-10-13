import { describe, expect, it } from "vitest";
import { formatAge, formatPhone, petAge } from "./format";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("formatPhone", () => {
  it("formata celular (11 dígitos)", () => expect(formatPhone("71991234567")).toBe("(71) 99123-4567"));
  it("formata fixo (10 dígitos)", () => expect(formatPhone("7132221234")).toBe("(71) 3222-1234"));
  it("remove o DDI 55", () => expect(formatPhone("5571991234567")).toBe("(71) 99123-4567"));
  it("devolve sem alterar formatos desconhecidos", () => expect(formatPhone("12345")).toBe("12345"));
});

describe("petAge", () => {
  it("conta anos e meses completos", () => {
    expect(petAge(d("2022-03-15"), d("2025-06-20"))).toEqual({ years: 3, months: 3 });
  });
  it("não conta o mês incompleto (dia ainda não chegou)", () => {
    expect(petAge(d("2022-03-15"), d("2025-06-14"))).toEqual({ years: 3, months: 2 });
  });
  it("vira o ano corretamente (nascido em dezembro)", () => {
    expect(petAge(d("2024-12-20"), d("2025-02-10"))).toEqual({ years: 0, months: 1 });
  });
  it("aniversário exato", () => {
    expect(petAge(d("2020-05-10"), d("2025-05-10"))).toEqual({ years: 5, months: 0 });
  });
  it("data futura vira zero em vez de negativo", () => {
    expect(petAge(d("2030-01-01"), d("2025-01-01"))).toEqual({ years: 0, months: 0 });
  });
});

describe("formatAge", () => {
  it("usa singular e plural", () => {
    expect(formatAge(d("2024-05-10"), d("2025-06-10"))).toBe("1 ano e 1 mês");
    expect(formatAge(d("2022-05-10"), d("2025-08-10"))).toBe("3 anos e 3 meses");
  });
  it("só anos", () => expect(formatAge(d("2020-05-10"), d("2025-05-10"))).toBe("5 anos"));
  it("só meses", () => expect(formatAge(d("2025-01-10"), d("2025-04-10"))).toBe("3 meses"));
  it("filhote recém-nascido", () => expect(formatAge(d("2025-05-01"), d("2025-05-20"))).toBe("menos de 1 mês"));
});
