import { z } from "zod";

export const SPECIES = ["DOG", "CAT", "BIRD", "OTHER"] as const;
export const PET_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export type Species = (typeof SPECIES)[number];
export type PetSize = (typeof PET_SIZES)[number];

// Campos de formulário vazios (ou ausentes) viram "não informado".
const emptyToUndefined = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `Máximo de ${max} caracteres`).optional());

const phone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((d) => d.length >= 10 && d.length <= 13, "Telefone inválido")
    .optional(),
);

const email = z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email("E-mail inválido").optional());

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente"),
  phone,
  email,
  notes: optionalText(500),
});

const birthDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida")
    // O JS "rola" datas impossíveis (30/02 vira 02/03); o round-trip abaixo rejeita esses casos.
    .refine((s) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, "Data de nascimento inválida")
    .transform((s) => new Date(`${s}T00:00:00.000Z`))
    .refine((d) => d.getTime() <= Date.now(), "A data de nascimento não pode ser no futuro")
    .optional(),
);

export const petSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do pet"),
  species: z.enum(SPECIES, { errorMap: () => ({ message: "Escolha a espécie" }) }),
  breed: optionalText(60),
  size: z.preprocess(emptyToUndefined, z.enum(PET_SIZES, { errorMap: () => ({ message: "Porte inválido" }) }).optional()),
  birthDate,
  notes: optionalText(500),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type PetInput = z.infer<typeof petSchema>;
