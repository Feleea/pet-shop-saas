import { describe, expect, it } from "vitest";
import { customerSchema, petSchema } from "./customer-validation";

describe("customerSchema", () => {
  it("aceita apenas o nome; campos vazios viram undefined", () => {
    const r = customerSchema.parse({ name: "Carlos", phone: "", email: "  ", notes: null });
    expect(r).toEqual({ name: "Carlos", phone: undefined, email: undefined, notes: undefined });
  });
  it("rejeita nome com menos de 2 caracteres", () => {
    expect(customerSchema.safeParse({ name: "A" }).success).toBe(false);
  });
  it("guarda só os dígitos do telefone", () => {
    expect(customerSchema.parse({ name: "Carlos", phone: "(71) 99123-4567" }).phone).toBe("71991234567");
  });
  it.each(["123", "999999999", "1234567890123456"])("rejeita telefone fora do tamanho (%s)", (phone) => {
    const r = customerSchema.safeParse({ name: "Carlos", phone });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Telefone inválido");
  });
  it("aceita telefone fixo (10 dígitos)", () => {
    expect(customerSchema.safeParse({ name: "Carlos", phone: "7132221234" }).success).toBe(true);
  });
  it("normaliza e valida o e-mail", () => {
    expect(customerSchema.parse({ name: "Carlos", email: " CARLOS@Mail.com " }).email).toBe("carlos@mail.com");
    expect(customerSchema.safeParse({ name: "Carlos", email: "carlos" }).success).toBe(false);
  });
  it("limita as observações a 500 caracteres", () => {
    expect(customerSchema.safeParse({ name: "Carlos", notes: "x".repeat(501) }).success).toBe(false);
    expect(customerSchema.safeParse({ name: "Carlos", notes: "x".repeat(500) }).success).toBe(true);
  });
});

describe("petSchema", () => {
  const base = { name: "Thor", species: "DOG" };

  it("aceita o mínimo: nome e espécie", () => {
    expect(petSchema.safeParse(base).success).toBe(true);
  });
  it("exige espécie válida", () => {
    const r = petSchema.safeParse({ name: "Thor", species: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Escolha a espécie");
    expect(petSchema.safeParse({ name: "Thor", species: "DRAGON" }).success).toBe(false);
  });
  it("exige nome", () => {
    expect(petSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
  it("converte a data de nascimento para Date em UTC", () => {
    const r = petSchema.parse({ ...base, birthDate: "2022-03-15" });
    expect(r.birthDate?.toISOString()).toBe("2022-03-15T00:00:00.000Z");
  });
  it("rejeita data no futuro", () => {
    const r = petSchema.safeParse({ ...base, birthDate: "2999-01-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("A data de nascimento não pode ser no futuro");
  });
  it.each(["2022-02-30", "15/03/2022", "ontem"])("rejeita data inválida (%s)", (birthDate) => {
    expect(petSchema.safeParse({ ...base, birthDate }).success).toBe(false);
  });
  it("aceita porte vazio e rejeita porte desconhecido", () => {
    expect(petSchema.safeParse({ ...base, size: "" }).success).toBe(true);
    expect(petSchema.safeParse({ ...base, size: "GIGANTE" }).success).toBe(false);
  });
});
