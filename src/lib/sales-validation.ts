import { z } from "zod";
import { MAX_ITEM_QUANTITY, MAX_SALE_ITEMS, PAYMENT_METHODS } from "./sales-constants";
import { emptyToUndefined, intField } from "./zod-helpers";

const BAD_ITEMS = "Itens inválidos";
const id = z.string({ required_error: BAD_ITEMS, invalid_type_error: BAD_ITEMS }).trim().min(1, BAD_ITEMS).max(100, BAD_ITEMS);

const itemSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("PRODUCT"),
      productId: id,
      quantity: intField({ min: 1, max: MAX_ITEM_QUANTITY, message: `Quantidade inválida (de 1 a ${MAX_ITEM_QUANTITY})` }),
    }),
    z.object({
      kind: z.literal("SERVICE"),
      serviceId: id,
      quantity: intField({ min: 1, max: MAX_ITEM_QUANTITY, message: `Quantidade inválida (de 1 a ${MAX_ITEM_QUANTITY})` }),
    }),
    z.object({ kind: z.literal("APPOINTMENT"), appointmentId: id }),
  ],
  { errorMap: () => ({ message: BAD_ITEMS }) },
);

export const saleSchema = z.object({
  items: z
    .array(itemSchema, { required_error: "Adicione ao menos um item", invalid_type_error: BAD_ITEMS })
    .min(1, "Adicione ao menos um item")
    .max(MAX_SALE_ITEMS, `Máximo de ${MAX_SALE_ITEMS} itens por venda`),
  paymentMethod: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Escolha a forma de pagamento" }) }),
  discount: z.preprocess(emptyToUndefined, z.string().trim().max(20, "Desconto inválido").optional()),
  customerId: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(200, "Máximo de 200 caracteres nas observações").optional()),
});

export const cancelSaleSchema = z.object({
  reason: z
    .string({ required_error: "Informe o motivo do cancelamento", invalid_type_error: "Informe o motivo do cancelamento" })
    .trim()
    .min(3, "Informe o motivo do cancelamento")
    .max(200, "Máximo de 200 caracteres no motivo"),
});
