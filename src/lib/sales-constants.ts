export const PAYMENT_METHODS = ["CASH", "PIX", "DEBIT", "CREDIT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
};
export type SaleStatus = "COMPLETED" | "CANCELED";
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  COMPLETED: "Concluída",
  CANCELED: "Cancelada",
};
export const MAX_ITEM_QUANTITY = 9_999;
export const MAX_SALE_ITEMS = 50;
export const MAX_SALE_TOTAL_CENTS = 99_999_999;
