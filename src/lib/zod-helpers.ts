import { z } from "zod";
import { parsePriceToCents } from "./money";

export const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export function intField(options: {
  min: number;
  max: number;
  message: string;
  defaultValue?: number;
}) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return options.defaultValue;
      }
      if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return Number(value);
      if (typeof value === "number") return value;
      return undefined;
    },
    z.number({ required_error: options.message, invalid_type_error: options.message })
      .int(options.message).min(options.min, options.message).max(options.max, options.message),
  );
}

export function priceField(options: { allowZero?: boolean }) {
  return z
    .string({ required_error: "Informe o preço", invalid_type_error: "Informe o preço" })
    .trim()
    .min(1, "Informe o preço")
    .transform((value, ctx) => {
      const cents = parsePriceToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preço inválido" });
        return z.NEVER;
      }
      if (!options.allowZero && cents === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O preço deve ser maior que zero" });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(z.number().int().min(0).max(9_999_999, "O preço máximo é R$ 99.999,99"));
}
