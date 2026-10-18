import { z } from "zod";
import { emptyToUndefined, intField, priceField } from "./zod-helpers";

const name = z.string({ required_error: "Informe o nome do produto", invalid_type_error: "Informe o nome do produto" })
  .trim()
  .min(2, "Informe o nome do produto")
  .max(80, "Máximo de 80 caracteres no nome");

const fixedDigits = (len: number, message: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((s) => s.replace(/\D/g, ""))
      .refine((d) => d.length === len, message)
      .optional(),
  );

export const productSchema = z.object({
  name,
  price: priceField({ allowZero: false }),
  minStock: intField({ min: 0, max: 99_999, message: "Informe o estoque mínimo (número inteiro, de 0 a 99999)", defaultValue: 0 }),
  initialStock: intField({ min: 0, max: 999_999, message: "Informe o estoque inicial (número inteiro, de 0 a 999999)", defaultValue: 0 }),
  // Fiscal (opcionais): só são exigidos na hora de emitir a nota
  ncm: fixedDigits(8, "NCM inválido (8 dígitos)"),
  cfop: fixedDigits(4, "CFOP inválido (4 dígitos)"),
  csosn: fixedDigits(3, "CSOSN inválido (3 dígitos)"),
  unit: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().regex(/^[A-Z]{1,6}$/, "Unidade inválida (ex.: UN, KG, PC)").optional()),
});

export const productUpdateSchema = productSchema.omit({ initialStock: true });

export const entrySchema = z.object({
  quantity: intField({ min: 1, max: 999_999, message: "Informe a quantidade (número inteiro, de 1 a 999999)" }),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(200, "Máximo de 200 caracteres na observação").optional()),
});

export const adjustmentSchema = z.object({
  delta: intField({ min: -999_999, max: 999_999, message: "Informe o ajuste (número inteiro, de -999999 a 999999)" }).refine(
    (n) => n !== 0,
    "O ajuste não pode ser zero",
  ),
  reason: z
    .string({ required_error: "Informe o motivo do ajuste", invalid_type_error: "Informe o motivo do ajuste" })
    .trim()
    .min(3, "Informe o motivo do ajuste")
    .max(200, "Máximo de 200 caracteres no motivo"),
});
