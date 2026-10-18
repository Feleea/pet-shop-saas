import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertCan } from "./permissions";
import { allocateProportionally, previewReturnValue } from "./returns-math";
import { returnSchema } from "./returns-validation";
import type { PaymentMethod } from "./sales-constants";
import {
  HAS_FISCAL_DOCUMENT_MESSAGE,
  prepareSale,
  saleFailureError,
  type CreateSaleFailure,
  type NewSale,
  type ReturnSummaryRow,
  type SaleDetail,
  type SaleItemKind,
  type SalesRepo,
} from "./sales-service";
import type { SessionPayload } from "./session";

export interface ReturnItemRecord {
  id: string;
  saleItemId: string;
  description: string;
  kind: SaleItemKind;
  quantity: number;
  valueCents: number;
  restocked: boolean;
}
export interface ReturnDetail {
  id: string;
  tenantId: string;
  number: number;
  saleId: string;
  saleNumber: number;
  reason: string;
  /** Valor das mercadorias devolvidas, já com o desconto da venda rateado. */
  valueCents: number;
  /** Troca: parte usada como crédito na nova venda. */
  appliedCents: number;
  /** Dinheiro que volta ao cliente. */
  refundCents: number;
  refundMethod: PaymentMethod | null;
  restocked: boolean;
  exchangeSaleId: string | null;
  exchangeSaleNumber: number | null;
  createdAt: Date;
  createdByName: string;
  items: ReturnItemRecord[];
}

export interface ReturnLine {
  saleItemId: string;
  quantity: number;
  valueCents: number;
}
export interface NewReturn {
  saleId: string;
  userId: string;
  reason: string;
  valueCents: number;
  appliedCents: number;
  refundCents: number;
  refundMethod: PaymentMethod | null;
  restock: boolean;
  lines: ReturnLine[];
  exchange: NewSale | null;
}

export type CreateReturnFailure =
  | { reason: "SALE_NOT_FOUND" | "SALE_NOT_COMPLETED" | "HAS_FISCAL_DOCUMENT" | "EXCEEDS_PAID" }
  | { reason: "OVER_RETURN"; description: string; available: number }
  | CreateSaleFailure;
export type CreateReturnResult =
  | { ok: true; ret: ReturnDetail; exchangeSale: SaleDetail | null }
  | ({ ok: false } & CreateReturnFailure);

/**
 * `createReturnAtomic` precisa ser ATÔMICO (tudo ou nada) e SERIALIZADO por venda (trava): relê a venda,
 * confere o que ainda pode ser devolvido, grava a devolução, devolve ao estoque e, se houver troca,
 * cria a nova venda (baixando o estoque dela) na mesma transação.
 */
export interface ReturnsRepo {
  findReturn(tenantId: string, id: string): Promise<ReturnDetail | null>;
  listReturnsForSale(tenantId: string, saleId: string): Promise<ReturnSummaryRow[]>;
  createReturnAtomic(tenantId: string, ret: NewReturn): Promise<CreateReturnResult>;
}

export const EXCEEDS_PAID_MESSAGE = "O valor a devolver excede o que foi pago nesta venda";
export const NOT_COMPLETED_MESSAGE = "Só vendas concluídas aceitam devolução";

function returnFailureError(f: CreateReturnFailure): Error {
  switch (f.reason) {
    case "SALE_NOT_FOUND":
      return new NotFoundError("Venda");
    case "SALE_NOT_COMPLETED":
      return new ValidationError(NOT_COMPLETED_MESSAGE);
    case "HAS_FISCAL_DOCUMENT":
      return new ConflictError(HAS_FISCAL_DOCUMENT_MESSAGE);
    case "EXCEEDS_PAID":
      return new ConflictError(EXCEEDS_PAID_MESSAGE);
    case "OVER_RETURN":
      return new ConflictError(`Quantidade acima do disponível para devolução de ${f.description} (disponível: ${f.available})`);
    default:
      return saleFailureError(f);
  }
}

/**
 * Devolução parcial ou total, com troca opcional.
 * Valor devolvido = preço dos itens menos o desconto da venda rateado (e a última devolução acerta os centavos).
 * Troca: o valor devolvido vira crédito na nova venda; sobra → dinheiro de volta; falta → o cliente paga a diferença.
 */
export async function createReturn(
  repos: { sales: SalesRepo; returns: ReturnsRepo },
  session: SessionPayload,
  saleId: string,
  raw: unknown,
): Promise<{ ret: ReturnDetail; exchangeSale: SaleDetail | null }> {
  assertCan(session, "return");
  const parsed = returnSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const input = parsed.data;
  const tenantId = session.tenantId;

  const sale = await repos.sales.findSale(tenantId, saleId);
  if (!sale) throw new NotFoundError("Venda");
  if (sale.status !== "COMPLETED") throw new ValidationError(NOT_COMPLETED_MESSAGE);

  // mesma linha repetida vira uma só
  const quantities: Record<string, number> = {};
  for (const l of input.items) quantities[l.saleItemId] = (quantities[l.saleItemId] ?? 0) + l.quantity;

  const lines: { saleItemId: string; quantity: number; weight: number }[] = [];
  for (const [saleItemId, quantity] of Object.entries(quantities)) {
    const item = sale.items.find((i) => i.id === saleItemId);
    if (!item) throw new ValidationError("Item inválido");
    const available = item.quantity - item.returnedQuantity;
    if (quantity > available) {
      throw new ValidationError(`Quantidade acima do disponível para devolução de ${item.description} (disponível: ${available})`);
    }
    lines.push({ saleItemId, quantity, weight: item.unitPriceCents * quantity });
  }

  const valueCents = previewReturnValue(sale, quantities);
  const lineValues = allocateProportionally(valueCents, lines.map((l) => l.weight));

  // Troca: itens novos (produtos e serviços, sem desconto), pagos primeiro com o crédito da devolução.
  let exchange: NewSale | null = null;
  let appliedCents = 0;
  if (input.exchange && input.exchange.items.length > 0) {
    const prepared = await prepareSale(
      repos.sales,
      session,
      {
        items: input.exchange.items,
        paymentMethod: input.exchange.paymentMethod ?? sale.paymentMethod,
        customerId: sale.customerId ?? undefined,
        notes: `Troca (devolução da venda #${sale.number})`,
      },
      { allowAppointments: false, allowDiscount: false },
    );
    appliedCents = Math.min(valueCents, prepared.totalCents);
    exchange = { ...prepared, creditAppliedCents: appliedCents };
  }

  const refundCents = valueCents - appliedCents;
  if (sale.refundedCents + refundCents > sale.totalCents - sale.creditAppliedCents) throw new ConflictError(EXCEEDS_PAID_MESSAGE);

  const result = await repos.returns.createReturnAtomic(tenantId, {
    saleId,
    userId: session.userId,
    reason: input.reason,
    valueCents,
    appliedCents,
    refundCents,
    refundMethod: refundCents > 0 ? (input.refundMethod ?? sale.paymentMethod) : null,
    restock: input.restock,
    lines: lines.map((l, i) => ({ saleItemId: l.saleItemId, quantity: l.quantity, valueCents: lineValues[i] })),
    exchange,
  });
  if (result.ok) return { ret: result.ret, exchangeSale: result.exchangeSale };
  throw returnFailureError(result);
}

export async function getReturn(repo: ReturnsRepo, session: SessionPayload, id: string) {
  assertCan(session, "sell");
  const r = await repo.findReturn(session.tenantId, id);
  if (!r) throw new NotFoundError("Devolução");
  return r;
}

export async function listReturnsForSale(repo: ReturnsRepo, session: SessionPayload, saleId: string) {
  assertCan(session, "sell");
  return repo.listReturnsForSale(session.tenantId, saleId);
}
