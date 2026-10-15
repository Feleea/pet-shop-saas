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
export interface AppointmentForSale {
  id: string;
  customerId: string;
  customerName: string;
  petName: string;
  serviceName: string;
  priceCents: number;
  startsAt: Date;
  status: AppointmentStatus;
  /** Já existe uma venda CONCLUÍDA cobrando este atendimento. */
  billed: boolean;
}

export interface NewSaleItem {
  kind: "PRODUCT" | "APPOINTMENT";
  productId: string | null;
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
  notes: string | null;
  items: NewSaleItem[];
}

export interface SaleItemRecord extends NewSaleItem {
  id: string;
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

export type CreateSaleFailure =
  | { reason: "INSUFFICIENT_STOCK"; productName: string; available: number }
  | { reason: "PRODUCT_UNAVAILABLE"; productName: string }
  | { reason: "PRODUCT_CHANGED"; productName: string }
  | { reason: "APPOINTMENT_UNAVAILABLE"; description: string };
export type CreateSaleResult = { ok: true; sale: SaleDetail } | ({ ok: false } & CreateSaleFailure);
export type CancelSaleResult = { ok: true; sale: SaleDetail } | { ok: false; reason: "NOT_FOUND" | "ALREADY_CANCELED" };

/**
 * `createSaleAtomic` e `cancelSaleAtomic` precisam ser ATÔMICOS (tudo ou nada):
 * baixar o estoque (nunca abaixo de zero), conferir que o atendimento não foi cobrado por outra venda,
 * numerar a venda e gravar itens e movimentações. Se qualquer parte falhar, nada fica gravado.
 */
export interface SalesRepo {
  findProductsForSale(tenantId: string, ids: string[]): Promise<ProductForSale[]>;
  findAppointmentsForSale(tenantId: string, ids: string[]): Promise<AppointmentForSale[]>;
  listBillableAppointments(tenantId: string): Promise<AppointmentForSale[]>;
  customerExists(tenantId: string, id: string): Promise<boolean>;
  createSaleAtomic(tenantId: string, sale: NewSale): Promise<CreateSaleResult>;
  cancelSaleAtomic(tenantId: string, id: string, c: { userId: string; reason: string; now: Date }): Promise<CancelSaleResult>;
  findSale(tenantId: string, id: string): Promise<SaleDetail | null>;
  listSales(tenantId: string, range: { from: Date; to: Date }): Promise<SaleRecord[]>;
}

export const APPOINTMENT_UNAVAILABLE_MESSAGE = "Este atendimento já foi cobrado ou não está concluído";
export const ALREADY_CANCELED_MESSAGE = "Esta venda já foi cancelada";

function firstMessage(issue: { message: string }): string {
  // Mensagens padrão do zod (em inglês) viram um texto nosso.
  return /^(Invalid|Required|Expected|String must|Number must|Array must)/.test(issue.message) ? "Dados da venda inválidos" : issue.message;
}

export async function createSale(repo: SalesRepo, session: SessionPayload, raw: unknown): Promise<SaleDetail> {
  assertCan(session, "sell");
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(firstMessage(parsed.error.issues[0]));
  const input = parsed.data;
  const tenantId = session.tenantId;

  // Mesma linha de produto repetida vira uma só (soma as quantidades); atendimento repetido é erro.
  const quantities = new Map<string, number>();
  const appointmentIds: string[] = [];
  for (const it of input.items) {
    if (it.kind === "PRODUCT") quantities.set(it.productId, (quantities.get(it.productId) ?? 0) + it.quantity);
    else if (appointmentIds.includes(it.appointmentId)) throw new ValidationError("Atendimento repetido na venda");
    else appointmentIds.push(it.appointmentId);
  }
  for (const q of quantities.values()) if (q > MAX_ITEM_QUANTITY) throw new ValidationError(`Quantidade inválida (de 1 a ${MAX_ITEM_QUANTITY})`);

  const [products, appointments] = await Promise.all([
    repo.findProductsForSale(tenantId, [...quantities.keys()]),
    repo.findAppointmentsForSale(tenantId, appointmentIds),
  ]);

  const items: NewSaleItem[] = [];
  for (const [productId, quantity] of quantities) {
    const p = products.find((x) => x.id === productId);
    if (!p) throw new ValidationError("Produto indisponível");
    if (!p.active) throw new ValidationError(`Produto indisponível: ${p.name}`);
    items.push({
      kind: "PRODUCT",
      productId,
      appointmentId: null,
      description: p.name,
      unitPriceCents: p.priceCents,
      quantity,
      totalCents: p.priceCents * quantity,
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
    const d = parsePriceToCents(input.discount);
    if (d === null) throw new ValidationError("Desconto inválido");
    discountCents = d;
  }
  if (discountCents > subtotalCents) throw new ValidationError("O desconto não pode ser maior que o total da venda");

  const result = await repo.createSaleAtomic(tenantId, {
    userId: session.userId,
    customerId,
    paymentMethod: input.paymentMethod,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    notes: input.notes ?? null,
    items,
  });
  if (result.ok) return result.sale;
  switch (result.reason) {
    case "INSUFFICIENT_STOCK":
      throw new ConflictError(`Estoque insuficiente para ${result.productName} (disponível: ${result.available})`);
    case "PRODUCT_UNAVAILABLE":
      throw new ValidationError(`Produto indisponível: ${result.productName}`);
    case "PRODUCT_CHANGED":
      throw new ConflictError(`O preço de ${result.productName} foi alterado. Atualize a página e refaça a venda`);
    case "APPOINTMENT_UNAVAILABLE":
      throw new ConflictError(APPOINTMENT_UNAVAILABLE_MESSAGE);
  }
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
  if (r.reason === "ALREADY_CANCELED") throw new ConflictError(ALREADY_CANCELED_MESSAGE);
  throw new NotFoundError("Venda");
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
  /** Soma só das vendas concluídas. */
  totalCents: number;
  byMethod: Record<PaymentMethod, number>;
}

export function summarizeSales(sales: Pick<SaleRecord, "status" | "paymentMethod" | "totalCents">[]): SalesSummary {
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  let totalCents = 0;
  let completedCount = 0;
  let canceledCount = 0;
  for (const s of sales) {
    if (s.status === "CANCELED") {
      canceledCount++;
      continue;
    }
    completedCount++;
    totalCents += s.totalCents;
    byMethod[s.paymentMethod] += s.totalCents;
  }
  return { completedCount, canceledCount, totalCents, byMethod };
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
  const sales = await repo.listSales(session.tenantId, dayRangeUtc(date, tz));
  return { date, sales, summary: summarizeSales(sales) };
}
