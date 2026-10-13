import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./validation";

const valid = { shopName: "Au Au", adminName: "Ana", email: "ANA@Mail.com ", password: "12345678" };

describe("registerSchema", () => {
  it("normaliza o e-mail (trim + minúsculas)", () => {
    expect(registerSchema.parse(valid).email).toBe("ana@mail.com");
  });
  it("rejeita senha com menos de 8 caracteres", () => {
    expect(registerSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
  });
  it("aceita senha com exatamente 8 caracteres", () => {
    expect(registerSchema.safeParse({ ...valid, password: "12345678" }).success).toBe(true);
  });
  it("rejeita e-mail inválido", () => {
    expect(registerSchema.safeParse({ ...valid, email: "ana" }).success).toBe(false);
  });
  it("rejeita nome do pet shop vazio", () => {
    expect(registerSchema.safeParse({ ...valid, shopName: " " }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normaliza slug e e-mail", () => {
    const r = loginSchema.parse({ slug: " Au-Au ", email: "A@B.com", password: "x" });
    expect(r.slug).toBe("au-au");
    expect(r.email).toBe("a@b.com");
  });
});
