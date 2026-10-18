import { z } from "zod";

export const registerSchema = z.object({
  shopName: z.string().trim().min(2, "Informe o nome do pet shop"),
  adminName: z.string().trim().min(2, "Informe o seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export const loginSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, "Informe o código do pet shop"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
