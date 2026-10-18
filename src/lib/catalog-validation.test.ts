import { describe, expect, it } from "vitest";
import { serviceSchema } from "./catalog-validation";

const ok = { name: "Banho", description: "", durationMinutes: "60", price: "50,00" };
const firstError = (raw: unknown) => {
  const r = serviceSchema.safeParse(raw);
  return r.success ? null : r.error.issues[0].message;
};

describe("serviceSchema", () => {
  it("converte duração (texto) em número e preço em centavos", () => {
    const r = serviceSchema.parse(ok);
    expect(r).toMatchObject({ name: "Banho", durationMinutes: 60, price: 5000, description: undefined });
  });

  it("aceita preço zero (serviço gratuito)", () => {
    expect(serviceSchema.parse({ ...ok, price: "0" }).price).toBe(0);
  });

  it.each([
    [{ name: "A" }, "Informe o nome do serviço"],
    [{ name: "x".repeat(81) }, "Máximo de 80 caracteres no nome"],
    [{ description: "x".repeat(301) }, "Máximo de 300 caracteres"],
    [{ durationMinutes: "" }, "Informe a duração em minutos"],
    [{ durationMinutes: "abc" }, "Informe a duração em minutos"],
    [{ durationMinutes: "7.5" }, "Informe a duração em minutos"],
    [{ durationMinutes: "0" }, "A duração mínima é 5 minutos"],
    [{ durationMinutes: "-30" }, "A duração mínima é 5 minutos"],
    [{ durationMinutes: "485" }, "A duração máxima é 8 horas"],
    [{ durationMinutes: "7" }, "A duração deve ser múltipla de 5 minutos"],
    [{ price: "" }, "Informe o preço"],
    [{ price: "abc" }, "Preço inválido"],
    [{ price: "-1" }, "Preço inválido"],
    [{ price: "100000" }, "O preço máximo é R$ 99.999,99"],
  ])("rejeita %j com a mensagem certa", (override, message) => {
    expect(firstError({ ...ok, ...override })).toBe(message);
  });

  it("aceita os limites: 5 min, 480 min e R$ 99.999,99", () => {
    expect(serviceSchema.safeParse({ ...ok, durationMinutes: "5" }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...ok, durationMinutes: "480" }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...ok, price: "99.999,99" }).success).toBe(true);
  });

  it("trata campos ausentes (null do FormData) como não informados", () => {
    expect(firstError({ name: "Banho", description: null, durationMinutes: null, price: null })).toBe("Informe a duração em minutos");
  });
});
