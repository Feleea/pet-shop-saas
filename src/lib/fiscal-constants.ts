export const TAX_REGIMES = ["MEI", "SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];
export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  MEI: "MEI",
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
};

export type FiscalKind = "NFCE" | "NFSE";
export const FISCAL_KIND_LABEL: Record<FiscalKind, string> = { NFCE: "NFC-e (produtos)", NFSE: "NFS-e (serviços)" };

export type FiscalStatus = "PROCESSING" | "AUTHORIZED" | "REJECTED" | "CANCELED";
export const FISCAL_STATUS_LABEL: Record<FiscalStatus, string> = {
  PROCESSING: "Processando",
  AUTHORIZED: "Autorizada",
  REJECTED: "Rejeitada",
  CANCELED: "Cancelada",
};

export type FiscalEnvironment = "SIMULATED" | "HOMOLOGATION" | "PRODUCTION";
export const ENVIRONMENT_LABEL: Record<FiscalEnvironment, string> = {
  SIMULATED: "SIMULADO — sem validade fiscal",
  HOMOLOGATION: "Homologação — sem validade fiscal",
  PRODUCTION: "Produção",
};

/** Código da forma de pagamento no documento fiscal (confira a tabela vigente com o seu contador/provedor). */
export const FISCAL_PAYMENT_CODE = { CASH: "01", CREDIT: "03", DEBIT: "04", PIX: "17", STORE_CREDIT: "05" } as const;
export type FiscalPaymentMethod = keyof typeof FISCAL_PAYMENT_CODE;

/**
 * Prazo para cancelar uma nota depois de autorizada. O prazo real depende do estado/município e do tipo
 * de nota: AJUSTE conforme a regra do seu caso (e valide com o contador).
 */
export const FISCAL_CANCEL_WINDOW_MINUTES = 30;
export const FISCAL_CANCEL_REASON_MIN = 15;
export const FISCAL_CANCEL_REASON_MAX = 255;
