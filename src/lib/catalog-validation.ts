import { z } from "zod";
import { parsePriceToCents } from "./money";

const emptyToUndefined = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v);

const duration = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v === "" ? undefined : v),
  z
    .number({ required_error: "Informe a duração em minutos", invalid_type_error: "Informe a duração em minutos" })
    .int("Informe a duração em minutos")
    .min(5, "A duração mínima é 5 minutos")
    .max(480, "A duração máxima é 8 horas")
    .refine((n) => n % 5 === 0, "A duração deve ser múltipla de 5 minutos"),
);

const price = z
  .string({ required_error: "Informe o preço", invalid_type_error: "Informe o preço" })
  .trim()
  .min(1, "Informe o preço")
  .transform((s, ctx) => {
    const cents = parsePriceToCents(s);
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preço inválido" });
      return z.NEVER;
    }
    return cents;
  })
  .pipe(z.number().int().min(0).max(9_999_999, "O preço máximo é R$ 99.999,99"));

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço").max(80, "Máximo de 80 caracteres no nome"),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(300, "Máximo de 300 caracteres").optional()),
  durationMinutes: duration,
  price,
});

export type ServiceInput = z.output<typeof serviceSchema>;
