import { z } from "zod";
import { PAYMENT_METHODS } from "./sales-constants";
import { emptyToUndefined, intField } from "./zod-helpers";

const BAD = "Itens inválidos";
const line = z.object({
  saleItemId: z.string({ required_error: BAD, invalid_type_error: BAD }).trim().min(1, BAD).max(100, BAD),
  quantity: intField({ min: 1, max: 9999, message: "Quantidade inválida (de 1 a 9999)" }),
});

const paymentMethod = z.preprocess(
  emptyToUndefined,
  z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Forma de pagamento inválida" }) }).optional(),
);

export const returnSchema = z.object({
  items: z
    .array(line, { required_error: "Escolha ao menos um item para devolver", invalid_type_error: BAD })
    .min(1, "Escolha ao menos um item para devolver")
    .max(50, "Máximo de 50 itens por devolução"),
  reason: z
    .string({ required_error: "Informe o motivo da devolução", invalid_type_error: "Informe o motivo da devolução" })
    .trim()
    .min(3, "Informe o motivo da devolução")
    .max(200, "Máximo de 200 caracteres no motivo"),
  // "Devolver ao estoque": só vale para itens de produto
  restock: z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean()),
  // como o dinheiro volta ao cliente (padrão: a forma de pagamento da venda original)
  refundMethod: paymentMethod,
  // troca: itens novos (validados pela mesma regra do PDV) e forma de pagamento da diferença
  exchange: z.preprocess(
    emptyToUndefined,
    z.object({ items: z.array(z.unknown()), paymentMethod }).optional(),
  ),
});
