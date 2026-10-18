import { z } from "zod";
import { isValidCnpj, isValidUf, onlyDigits } from "./br-validators";
import { TAX_REGIMES } from "./fiscal-constants";
import { emptyToUndefined } from "./zod-helpers";

const text = (max: number, label: string) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `${label}: máximo de ${max} caracteres`).optional());

const registration = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(20, `${label}: máximo de 20 caracteres`)
      .regex(/^[0-9A-Za-z./-]+$/, `${label} inválida`)
      .optional(),
  );

export const companySchema = z.object({
  name: z.string({ required_error: "Informe o nome do pet shop", invalid_type_error: "Informe o nome do pet shop" })
    .trim()
    .min(2, "Informe o nome do pet shop")
    .max(80, "Máximo de 80 caracteres no nome"),
  legalName: text(120, "Razão social"),
  cnpj: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(onlyDigits)
      .refine(isValidCnpj, "CNPJ inválido")
      .optional(),
  ),
  stateRegistration: registration("Inscrição estadual"),
  municipalRegistration: registration("Inscrição municipal"),
  taxRegime: z.preprocess(emptyToUndefined, z.enum(TAX_REGIMES, { errorMap: () => ({ message: "Regime tributário inválido" }) }).optional()),
  addressLine: text(120, "Endereço"),
  city: text(60, "Cidade"),
  state: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().refine(isValidUf, "UF inválida").optional()),
  zipCode: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(onlyDigits)
      .refine((d) => d.length === 8, "CEP inválido")
      .optional(),
  ),
  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(onlyDigits)
      .refine((d) => d.length >= 10 && d.length <= 13, "Telefone inválido")
      .optional(),
  ),
});
