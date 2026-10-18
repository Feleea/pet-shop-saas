import { describe, expect, it } from "vitest";
import { acceptSchema, inviteSchema } from "./team-validation";

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0].message);

describe("inviteSchema", () => {
  const ok = { name: "Carla", email: " CARLA@Mail.com ", role: "ATTENDANT" };

  it("normaliza o e-mail", () => {
    expect(inviteSchema.parse(ok).email).toBe("carla@mail.com");
  });
  it.each(["ATTENDANT", "GROOMER", "VET"])("aceita o papel %s", (role) => {
    expect(inviteSchema.safeParse({ ...ok, role }).success).toBe(true);
  });
  it.each(["ADMIN", "", "DONO", undefined])("rejeita o papel %s (ADMIN não é convidável)", (role) => {
    expect(firstError(inviteSchema.safeParse({ ...ok, role }))).toBe("Papel inválido");
  });
  it("rejeita nome curto e e-mail inválido", () => {
    expect(firstError(inviteSchema.safeParse({ ...ok, name: "C" }))).toBe("Informe o nome do convidado");
    expect(firstError(inviteSchema.safeParse({ ...ok, email: "carla" }))).toBe("E-mail inválido");
  });
});

describe("acceptSchema", () => {
  it("aceita senha de 8+ caracteres confirmada", () => {
    expect(acceptSchema.safeParse({ password: "12345678", confirmPassword: "12345678" }).success).toBe(true);
  });
  it("rejeita senha curta", () => {
    expect(firstError(acceptSchema.safeParse({ password: "1234567", confirmPassword: "1234567" }))).toBe(
      "A senha deve ter ao menos 8 caracteres",
    );
  });
  it("rejeita confirmação diferente", () => {
    expect(firstError(acceptSchema.safeParse({ password: "12345678", confirmPassword: "12345679" }))).toBe("As senhas não conferem");
  });
});
