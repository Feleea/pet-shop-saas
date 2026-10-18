import type { AppointmentStatus } from "./agenda-constants";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { parsePriceToCents } from "./money";
import { assertCan } from "./permissions";
import {
  MAX_ITEM_QUANTITY,
  MAX_SALE_TOTAL_CENTS,
  PAYMENT_METHODS,
  type PaymentMethod,
  type SaleStatus,
} from "./sales-constants";
import { cancelSaleSchema, saleSchema } from "./sales-validation";
import type { SessionPayload } from "./session";
import { SHOP_TIMEZONE, dayRangeUtc, isValidDateString, localDateString } from "./timezone";

export interface ProductForSale {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}
export interface ServiceForSale {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}
export interface AppointmentForSale {
  id: string;
  customerId: string;
  customerName: string;
  petName: string;
  serviceName: string;
  priceCents: number;
  startsAt: Date;
  status: AppointmentStatus;
  /** Já existe uma venda CONCLUÍDA cobrando este atendimento (e não devolvida). */
  billed: boolean;
}

export type SaleItemKind = "PRODUCT" | "SERVICE" | "APPOINTMENT";

export interface NewSaleItem {
  kind: SaleItemKind;
  productId: string | null;
  serviceId: string | null;
  appointmentId: string | null;
  description: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
}
export interface NewSale {
  userId: string;
  customerId: string | null;
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** Troca: parte do total coberta pelo crédito de uma devolução (o resto é pago em `paymentMethod`). */
  creditAppliedCents: number;
  notes: string | null;
  items: NewSaleItem[];
}

export interface SaleItemRecord extends NewSaleItem {
  id: string;
  /** Quanto deste item já foi devolvido. */
  returnedQuantity: number;
}
export interface SaleRecord {
  id: string;
  tenantId: string;
  number: number;
  status: SaleStatus;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  creditAppliedCents: number;
  /** Valor das mercadorias já devolvidas (com o desconto rateado) e dinheiro já devolvido. */
  returnedValueCents: number;
  refundedCents: number;
  notes: string | null;
  createdAt: Date;
  createdById: string;
  createdByName: string;
  canceledAt: Date | null;
  cancelReason: string | null;
  itemCount: number;
}
export interface SaleDetail extends SaleRecord {
  items: SaleItemRecord[];
}

export interface ReturnSummaryRow {
  id: string;
  number: number;
  saleId: string;
  saleNumber: number;
  valueCents: number;
  appliedCents: number;
  refundCents: number;
  refundMethod: PaymentMethod | null;
  createdAt: Date;
}

export type CreateSaleFailure =
  | { reason: "INSUFFICIENT_STOCK"; productName: string; available: number }
  | { reason: "PRODUCT_UNAVAILABLE"; productName: string }
  | { reason: "PRODUCT_CHANGED"; productName: string }
  | { reason: "SERVICE_UNAVAILABLE"; serviceName: string }
  | { reason: "SERVICE_CHANGED"; serviceName: string }
  | { reason: "APPOINTMENT_UNAVAILABLE"; description: string };
export type CreateSaleResult = { ok: true; sale: SaleDetail } | ({ ok: false } & CreateSaleFailure);
export type CancelSaleResult =
  | { ok: true; sale: SaleDetail }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_CANCELED" | "HAS_RETURNS" | "HAS_FISCAL_DOCUMENT" };

/**
 * `createSaleAtomic` e `cancelSaleAtomic` precisam ser ATÔMICOS (tudo ou nada):
 * baixar o estoque (nunca abaixo de zero), conferir que o atendimento não foi cobrado por outra venda,
 * numerar a venda e gravar itens e movimentações. Se qualquer parte falhar, nada fica gravado.
 */
export interface SalesRepo {
  findProductsForSale(tenantId: string, ids: string[]): Promise<ProductForSale[]>;
  findServicesForSale(tenantId: string, ids: string[]): Promise<ServiceForSale[]>;
  findAppointmentsForSale(tenantId: string, ids: string[]): Promise<AppointmentForSale[]>;
  listBillableAppointments(tenantId: string): Promise<AppointmentForSale[]>;
  customerExists(tenantId: string, id: string): Promise<boolean>;
  createSaleAtomic(tenantId: string, sale: NewSale): Promise<CreateSaleResult>;
  cancelSaleAtomic(tenantId: string, id: string, c: { userId: string; reason: string; now: Date }): Promise<CancelSaleResult>;
  findSale(tenantId: string, id: string): Promise<SaleDetail | null>;
  listSales(tenantId: string, range: { from: Date; to: Date }): Promise<SaleRecord[]>;
  listReturnsInRange(tenantId: string, range: { from: Date; to: Date }): Promise<ReturnSummaryRow[]>;
}

export const APPOINTMENT_UNAVAILABLE_MESSAGE = "Este atendimento já foi cobrado ou não está concluído";
export const ALREADY_CANCELED_MESSAGE = "Esta venda já foi cancelada";
export const HAS_RETURNS_MESSAGE = "Esta venda possui devoluções e não pode ser cancelada";
export const HAS_FISCAL_DOCUMENT_MESSAGE = "Esta venda possui nota fiscal emitida: cancele a nota antes de continuar";

function firstMessage(issue: { message: string }): string {
  // Mensagens padrão do zod (em inglês) viram um texto nosso.
  return /^(Invalid|Required|Expected|String must|Number must|Array must)/.test(issue.message) ? "Dados da venda inválidos" : issue.message;
}

/** Traduz uma falha de venda (estoque, preço, indisponibilidade) no erro que a tela mostra. */
export function saleFailureError(f: CreateSaleFailure): Error {
  switch (f.reason) {
    case "INSUFFICIENT_STOCK":
      return new ConflictError(`Estoque insuficiente para ${f.productName} (disponível: ${f.available})`);
    case "PRODUCT_UNAVAILABLE":
      return new ValidationError(`Produto indisponível: ${f.productName}`);
    case "PRODUCT_CHANGED":
      return new ConflictError(`O preço de ${f.productName} foi alterado. Atualize a página e refaça a venda`);
    case "SERVICE_UNAVAILABLE":
      return new ValidationError(`Serviço indisponível: ${f.serviceName}`);
    case "SERVICE_CHANGED":
      return new ConflictError(`O preço de ${f.serviceName} foi alterado. Atualize a página e refaça a venda`);
    case "APPOINTMENT_UNAVAILABLE":
      return new ConflictError(APPOINTMENT_UNAVAILABLE_MESSAGE);
  }
}

export interface PrepareOptions {
  /** Troca não cobra atendimentos agendados. */
  allowAppointments?: boolean;
  /** Troca não tem desconto. */
  allowDiscount?: boolean;
}

/**
 * Valida a entrada e monta a venda (preços do cadastro, total, desconto, cliente) SEM gravar nada.
 * Usada pela venda normal e pela troca.
 */
export async function prepareSale(repo: SalesRepo, session: SessionPayload, raw: unknown, opts: PrepareOptions = {}): Promise<NewSale> {
  const allowAppointments = opts.allowAppointments ?? true;
  const allowDiscount = opts.allowDiscount ?? true;
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(firstMessage(parsed.error.issues[0]));
  const input = parsed.data;
  const tenantId = session.tenantId;

  // Mesma linha repetida vira uma só (soma as quantidades); atendimento repetido é erro.
  const productQty = new Map<string, number>();
  const serviceQty = new Map<string, number>();
  const appointmentIds: string[] = [];
  for (const it of input.items) {
    if (it.kind === "PRODUCT") productQty.set(it.productId, (productQty.get(it.productId) ?? 0) + it.quantity);
    else if (it.kind === "SERVICE") serviceQty.set(it.serviceId, (serviceQty.get(it.serviceId) ?? 0) + it.quantity);
    else if (appointmentIds.includes(it.appointmentId)) throw new ValidationError("Atendimento repetido na venda");
    else appointmentIds.push(it.appointmentId);
  }
  if (!allowAppointments && appointmentIds.length > 0) throw new ValidationError("Atendimentos agendados não entram em uma troca");
  for (const q of [...productQty.values(), ...serviceQty.values()]) {
    if (q > MAX_ITEM_QUANTITY) throw new ValidationError(`Quantidade inválida (de 1 a ${MAX_ITEM_QUANTITY})`);
  }

  const [products, services, appointments] = await Promise.all([
    repo.findProductsForSale(tenantId, [...productQty.keys()]),
    repo.findServicesForSale(tenantId, [...serviceQty.keys()]),
    repo.findAppointmentsForSale(tenantId, appointmentIds),
  ]);

  const items: NewSaleItem[] = [];
  for (const [productId, quantity] of productQty) {
    const p = products.find((x) => x.id === productId);
    if (!p) throw new ValidationError("Produto indisponível");
    if (!p.active) throw new ValidationError(`Produto indisponível: ${p.name}`);
    items.push({
      kind: "PRODUCT",
      productId,
      serviceId: null,
      appointmentId: null,
      description: p.name,
      unitPriceCents: p.priceCents,
      quantity,
      totalCents: p.priceCents * quantity,
    });
  }
  for (const [serviceId, quantity] of serviceQty) {
    const s = services.find((x) => x.id === serviceId);
    if (!s) throw new ValidationError("Serviço indisponível");
    if (!s.active) throw new ValidationError(`Serviço indisponível: ${s.name}`);
    items.push({
      kind: "SERVICE",
      productId: null,
      serviceId,
      appointmentId: null,
      description: s.name,
      unitPriceCents: s.priceCents,
      quantity,
      totalCents: s.priceCents * quantity,
    });
  }
  const billedCustomers = new Set<string>();
  for (const appointmentId of appointmentIds) {
    const a = appointments.find((x) => x.id === appointmentId);
    if (!a || a.status !== "COMPLETED" || a.billed) throw new ConflictError(APPOINTMENT_UNAVAILABLE_MESSAGE);
    billedCustomers.add(a.customerId);
    items.push({
      kind: "APPOINTMENT",
      productId: null,
      serviceId: null,
      appointmentId,
      description: `${a.serviceName} — ${a.petName}`,
      unitPriceCents: a.priceCents,
      quantity: 1,
      totalCents: a.priceCents,
    });
  }

  // Cliente: vem dos atendimentos (todos do mesmo cliente) ou é opcional.
  if (billedCustomers.size > 1) throw new ValidationError("Os atendimentos da venda devem ser do mesmo cliente");
  let customerId = input.customerId ?? null;
  if (billedCustomers.size === 1) {
    const only = [...billedCustomers][0];
    if (customerId && customerId !== only) throw new ValidationError("O cliente da venda deve ser o mesmo dos atendimentos");
    customerId = only;
  } else if (customerId && !(await repo.customerExists(tenantId, customerId))) {
    throw new NotFoundError("Cliente");
  }

  const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  if (subtotalCents > MAX_SALE_TOTAL_CENTS) throw new ValidationError("O total da venda excede o limite de R$ 999.999,99");
  let discountCents = 0;
  if (input.discount !== undefined) {
    if (!allowDiscount) throw new ValidationError("Desconto não é permitido nesta operação");
    const d = parsePriceToCents(input.discount);
    if (d === null) throw new ValidationError("Desconto inválido");
    discountCents = d;
  }
  if (discountCents > subtotalCents) throw new ValidationError("O desconto não pode ser maior que o total da venda");

  return {
    userId: session.userId,
    customerId,
    paymentMethod: input.paymentMethod,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    creditAppliedCents: 0,
    notes: input.notes ?? null,
    items,
  };
}

export async function createSale(repo: SalesRepo, session: SessionPayload, raw: unknown): Promise<SaleDetail> {
  assertCan(session, "sell");
  const sale = await prepareSale(repo, session, raw);
  const result = await repo.createSaleAtomic(session.tenantId, sale);
  if (result.ok) return result.sale;
  throw saleFailureError(result);
}

/** Cancelar devolve o estoque e libera os atendimentos para serem cobrados de novo. Só ADMIN, com motivo. */
export async function cancelSale(repo: SalesRepo, session: SessionPayload, id: string, raw: unknown, deps: { now?: Date } = {}) {
  assertCan(session, "delete");
  const parsed = cancelSaleSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const r = await repo.cancelSaleAtomic(session.tenantId, id, {
    userId: session.userId,
    reason: parsed.data.reason,
    now: deps.now ?? new Date(),
  });
  if (r.ok) return r.sale;
  switch (r.reason) {
    case "ALREADY_CANCELED":
      throw new ConflictError(ALREADY_CANCELED_MESSAGE);
    case "HAS_RETURNS":
      throw new ConflictError(HAS_RETURNS_MESSAGE);
    case "HAS_FISCAL_DOCUMENT":
      throw new ConflictError(HAS_FISCAL_DOCUMENT_MESSAGE);
    default:
      throw new NotFoundError("Venda");
  }
}

export async function getSale(repo: SalesRepo, session: SessionPayload, id: string) {
  assertCan(session, "sell");
  const sale = await repo.findSale(session.tenantId, id);
  if (!sale) throw new NotFoundError("Venda");
  return sale;
}

export async function listBillableAppointments(repo: SalesRepo, session: SessionPayload) {
  assertCan(session, "sell");
  return repo.listBillableAppointments(session.tenantId);
}

export interface SalesSummary {
  completedCount: number;
  canceledCount: number;
  returnCount: number;
  /** Total das vendas concluídas (o que foi vendido). */
  soldCents: number;
  /** Dinheiro devolvido a clientes. */
  refundedCents: number;
  /** Líquido do dia: recebido − devolvido. */
  totalCents: number;
  /** Líquido por forma de pagamento (pode ficar negativo se a devolução saiu por outra forma). */
  byMethod: Record<PaymentMethod, number>;
}

type SummarySale = Pick<SaleRecord, "status" | "paymentMethod" | "totalCents"> & { creditAppliedCents?: number };
type SummaryReturn = Pick<ReturnSummaryRow, "refundCents" | "refundMethod">;

/**
 * Resumo do caixa: soma só vendas concluídas. Em trocas, a parte paga com crédito de devolução não entra
 * como dinheiro recebido. Devoluções saem da forma de pagamento escolhida.
 */
export function summarizeSales(sales: SummarySale[], returns: SummaryReturn[] = []): SalesSummary {
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  let soldCents = 0;
  let receivedCents = 0;
  let completedCount = 0;
  let canceledCount = 0;
  for (const s of sales) {
    if (s.status === "CANCELED") {
      canceledCount++;
      continue;
    }
    completedCount++;
    soldCents += s.totalCents;
    const paid = s.totalCents - (s.creditAppliedCents ?? 0);
    receivedCents += paid;
    byMethod[s.paymentMethod] += paid;
  }
  let refundedCents = 0;
  for (const r of returns) {
    refundedCents += r.refundCents;
    if (r.refundMethod) byMethod[r.refundMethod] -= r.refundCents;
  }
  return {
    completedCount,
    canceledCount,
    returnCount: returns.length,
    soldCents,
    refundedCents,
    totalCents: receivedCents - refundedCents,
    byMethod,
  };
}

export async function listSales(
  repo: SalesRepo,
  session: SessionPayload,
  opts: { date?: string } = {},
  deps: { now?: Date; tz?: string } = {},
) {
  assertCan(session, "sell");
  const tz = deps.tz ?? SHOP_TIMEZONE;
  const date = opts.date?.trim() ? opts.date.trim() : localDateString(deps.now ?? new Date(), tz);
  if (!isValidDateString(date)) throw new ValidationError("Data inválida");
  const range = dayRangeUtc(date, tz);
  const [sales, returns] = await Promise.all([repo.listSales(session.tenantId, range), repo.listReturnsInRange(session.tenantId, range)]);
  return { date, sales, returns, summary: summarizeSales(sales, returns) };
}
