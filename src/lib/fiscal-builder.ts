import { FISCAL_PAYMENT_CODE, type FiscalKind, type FiscalPaymentMethod, type TaxRegime, TAX_REGIME_LABEL } from "./fiscal-constants";
import type { CompanyData } from "./company-service";
import { allocateProportionally } from "./returns-math";
import type { SaleDetail } from "./sales-service";

export interface ItemFiscalInfo {
  ncm?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  unit?: string | null;
  serviceCode?: string | null;
  issRateBp?: number | null;
}

export interface FiscalDocumentRecord {
  id: string;
  tenantId: string;
  saleId: string;
  kind: FiscalKind;
  status: "PROCESSING" | "AUTHORIZED" | "REJECTED" | "CANCELED";
  environment: "SIMULATED" | "HOMOLOGATION" | "PRODUCTION";
  number: number | null;
  series: number | null;
  accessKey: string | null;
  protocol: string | null;
  totalCents: number;
  rejectionReason: string | null;
  issuedAt: Date | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
}

export interface EmissionContext {
  sale: SaleDetail;
  company: CompanyData;
  /** Dados fiscais por id do ITEM da venda (do produto, do serviço ou do serviço do atendimento). */
  itemFiscal: Record<string, ItemFiscalInfo>;
  docs: FiscalDocumentRecord[];
}

export interface FiscalIssuer {
  tradeName: string;
  legalName: string;
  cnpj: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  taxRegime: TaxRegime;
  addressLine: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
}
export interface FiscalLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  /** Preço de tabela × quantidade. */
  grossCents: number;
  /** Valor depois do desconto da venda rateado: a soma dos itens é o total da nota. */
  netCents: number;
  ncm: string | null;
  cfop: string | null;
  csosn: string | null;
  serviceCode: string | null;
  issRateBp: number | null;
}
export interface FiscalDraft {
  kind: FiscalKind;
  saleNumber: number;
  issuer: FiscalIssuer;
  items: FiscalLineItem[];
  totalCents: number;
  payments: { method: FiscalPaymentMethod; code: string; amountCents: number }[];
  customerName: string | null;
}

export interface BuildResult {
  drafts: FiscalDraft[];
  problems: string[];
  /** Tipos que já têm nota autorizada ou em processamento (não são emitidos de novo). */
  alreadyIssued: FiscalKind[];
}

export const RETURNS_BLOCK_MESSAGE =
  "Esta venda possui devoluções: a nota fiscal de vendas com devolução precisa de tratamento específico (confirme com o seu contador)";
const NOT_COMPLETED_MESSAGE = "Só vendas concluídas podem ter nota fiscal";

const COMPANY_FIELDS: [keyof CompanyData, string][] = [
  ["legalName", "Razão social"],
  ["cnpj", "CNPJ"],
  ["taxRegime", "Regime tributário"],
  ["addressLine", "Endereço"],
  ["city", "Cidade"],
  ["state", "UF"],
  ["zipCode", "CEP"],
];

const kindOfItem = (k: SaleDetail["items"][number]["kind"]): FiscalKind => (k === "PRODUCT" ? "NFCE" : "NFSE");

/**
 * Monta, SEM emitir nada, os documentos fiscais de uma venda e lista tudo que impede a emissão.
 * Produtos viram NFC-e; serviços e atendimentos viram NFS-e (documentos separados). O desconto da venda
 * é rateado entre os itens; a soma dos itens de cada nota é exatamente o valor da nota.
 */
export function buildFiscalDrafts(ctx: EmissionContext): BuildResult {
  const { sale, company, itemFiscal, docs } = ctx;
  const problems: string[] = [];
  const add = (p: string) => problems.includes(p) || problems.push(p);

  if (sale.status !== "COMPLETED") return { drafts: [], problems: [NOT_COMPLETED_MESSAGE], alreadyIssued: [] };
  if (sale.returnedValueCents > 0) add(RETURNS_BLOCK_MESSAGE);

  const present = new Set(sale.items.map((i) => kindOfItem(i.kind)));
  const alreadyIssued = ([...present] as FiscalKind[]).filter((k) =>
    docs.some((d) => d.kind === k && (d.status === "AUTHORIZED" || d.status === "PROCESSING")),
  );
  const pending = ([...present] as FiscalKind[]).filter((k) => !alreadyIssued.includes(k));
  if (pending.length === 0) return { drafts: [], problems, alreadyIssued };

  // ---- dados da empresa ----
  const missing = COMPANY_FIELDS.filter(([f]) => !company[f]).map(([, label]) => label);
  if (pending.includes("NFCE") && !company.stateRegistration) missing.push("Inscrição estadual");
  if (pending.includes("NFSE") && !company.municipalRegistration) missing.push("Inscrição municipal");
  if (missing.length > 0) add(`Dados da empresa incompletos: ${missing.join(", ")} (preencha em Configurações)`);

  const regime = company.taxRegime;
  const simples = regime === "MEI" || regime === "SIMPLES_NACIONAL";
  if (regime && !simples) {
    add(
      `O regime tributário ${TAX_REGIME_LABEL[regime]} ainda não é suportado na emissão automática (use MEI ou Simples Nacional, ou emita pelo sistema do seu contador)`,
    );
  }

  // ---- desconto rateado entre TODOS os itens, em proporção ao valor bruto ----
  const gross = sale.items.map((i) => i.unitPriceCents * i.quantity);
  const nets = allocateProportionally(sale.totalCents, gross);

  const issuerReady = missing.length === 0 && company.cnpj && regime;
  const drafts: FiscalDraft[] = [];

  for (const kind of pending) {
    const items: FiscalLineItem[] = [];
    sale.items.forEach((it, idx) => {
      if (kindOfItem(it.kind) !== kind) return;
      const f = itemFiscal[it.id] ?? {};
      if (kind === "NFCE") {
        if (!f.ncm || !/^\d{8}$/.test(f.ncm)) add(`Produto "${it.description}": informe o NCM (8 dígitos)`);
        if (!f.cfop || !/^\d{4}$/.test(f.cfop)) add(`Produto "${it.description}": informe o CFOP (4 dígitos)`);
        if (simples && (!f.csosn || !/^\d{3}$/.test(f.csosn))) add(`Produto "${it.description}": informe o CSOSN (3 dígitos)`);
      } else {
        if (!f.serviceCode || !/^\d{2}\.\d{2}$/.test(f.serviceCode)) add(`Serviço "${it.description}": informe o código do serviço (LC 116, ex.: 05.08)`);
        if (f.issRateBp === null || f.issRateBp === undefined) add(`Serviço "${it.description}": informe a alíquota do ISS`);
      }
      items.push({
        description: it.description,
        quantity: it.quantity,
        unit: f.unit ?? "UN",
        unitPriceCents: it.unitPriceCents,
        grossCents: gross[idx],
        netCents: nets[idx],
        ncm: f.ncm ?? null,
        cfop: f.cfop ?? null,
        csosn: f.csosn ?? null,
        serviceCode: f.serviceCode ?? null,
        issRateBp: f.issRateBp ?? null,
      });
    });

    const totalCents = items.reduce((s, i) => s + i.netCents, 0);
    if (totalCents <= 0) {
      add(`O valor da ${kind === "NFCE" ? "NFC-e" : "NFS-e"} seria zero (venda totalmente descontada): não há o que emitir`);
      continue;
    }

    // Pagamentos: o que foi pago na forma escolhida + o crédito de troca; rateados entre as notas.
    const paid = sale.totalCents - sale.creditAppliedCents;
    const candidates: { method: FiscalPaymentMethod; amount: number }[] = [
      { method: sale.paymentMethod, amount: paid },
      { method: "STORE_CREDIT", amount: sale.creditAppliedCents },
    ];
    const sources = candidates.filter((p) => p.amount > 0);
    const split = allocateProportionally(totalCents, sources.map((s) => s.amount));
    const payments = sources
      .map((s, i) => ({ method: s.method, code: FISCAL_PAYMENT_CODE[s.method], amountCents: split[i] }))
      .filter((p) => p.amountCents > 0);

    if (issuerReady) {
      drafts.push({
        kind,
        saleNumber: sale.number,
        issuer: {
          tradeName: company.name,
          legalName: company.legalName!,
          cnpj: company.cnpj!,
          stateRegistration: company.stateRegistration,
          municipalRegistration: company.municipalRegistration,
          taxRegime: regime!,
          addressLine: company.addressLine!,
          city: company.city!,
          state: company.state!,
          zipCode: company.zipCode!,
          phone: company.phone,
        },
        items,
        totalCents,
        payments,
        customerName: sale.customerName,
      });
    }
  }

  return { drafts: problems.length > 0 ? [] : drafts, problems, alreadyIssued };
}
