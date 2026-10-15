import { z } from "zod";
import { parsePriceToCents } from "./money";

export const emptyToUndefined = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v);

/** Inteiro vindo de formulário: aceita "12", " -3 ", "+2"; recusa "1e2", "7,5", "abc". Vazio usa `defaultValue` (se houver). */
export function intField(opts: { min: number; max: number; message: string; defaultValue?: number }) {
  const { min, max, message, defaultValue } = opts;
  const toNumber = (v: unknown) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return defaultValue;
    if (typeof v === "string") return /^[+-]?\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : Number.NaN;
    return v;
  };
  return z.preprocess(
    toNumber,
    z.number({ required_error: message, invalid_type_error: message }).int(message).min(min, message).max(max, message),
  );
}

/** Preço em reais digitado ("50", "1.250,50") → centavos. */
export function priceField(opts: { allowZero: boolean }) {
  return z
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
    .pipe(
      z
        .number()
        .int()
        .min(opts.allowZero ? 0 : 1, "O preço deve ser maior que zero")
        .max(9_999_999, "O preço máximo é R$ 99.999,99"),
    );
}
