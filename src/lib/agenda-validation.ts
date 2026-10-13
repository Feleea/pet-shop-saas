import { z } from "zod";

const id = (message: string) => z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(100, message);

const date = z
  .string({ required_error: "Informe a data", invalid_type_error: "Informe a data" })
  .trim()
  .min(1, "Informe a data")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const time = z
  .string({ required_error: "Informe o horário", invalid_type_error: "Informe o horário" })
  .trim()
  .min(1, "Informe o horário")
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido");

export const appointmentSchema = z.object({
  customerId: id("Escolha o cliente"),
  petId: id("Escolha o pet"),
  serviceId: id("Escolha o serviço"),
  professionalId: id("Escolha o profissional"),
  date,
  time,
  notes: z.preprocess(
    (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    z.string().trim().max(300, "Máximo de 300 caracteres nas observações").optional(),
  ),
});

export const rescheduleSchema = z.object({
  professionalId: id("Escolha o profissional"),
  date,
  time,
});
