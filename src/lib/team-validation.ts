import { z } from "zod";

/** ADMIN não é convidável: quem cria o pet shop é o único administrador por enquanto. */
export const INVITABLE_ROLES = ["ATTENDANT", "GROOMER", "VET"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const inviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do convidado"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(INVITABLE_ROLES, { errorMap: () => ({ message: "Papel inválido" }) }),
});

export const acceptSchema = z
  .object({
    password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "As senhas não conferem", path: ["confirmPassword"] });
