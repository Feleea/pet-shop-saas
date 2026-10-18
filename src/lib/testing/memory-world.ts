import type { AppointmentStatus } from "../agenda-constants";
import type { CompanyData } from "../company-service";
import type { EmissionContext, FiscalDocumentRecord, ItemFiscalInfo } from "../fiscal-builder";
import type { FiscalRepo, ReserveResult } from "../fiscal-service";
import type { CreateReturnResult, NewReturn, ReturnDetail, ReturnsRepo } from "../returns-service";
import type {
  AppointmentForSale,
  CancelSaleResult,
  CreateSaleResult,
  NewSale,
  ReturnSummaryRow,
  SaleDetail,
  SalesRepo,
} from "../sales-service";
import type { Role, SessionPayload } from "../session";

/**
 * Mundo em memória para os testes (dois pet shops, A e B). Reproduz a MESMA semântica atômica dos repositórios
 * Prisma: tudo ou nada (inclusive desfazer a devolução se a troca falhar), estoque nunca negativo, atendimento
 * cobrado uma vez, numeração por pet shop, nota fiscal ativa bloqueando devolução e cancelamento.
 */
export function createWorld() {
  const clock = { now: new Date("2026-10-13T15:00:00.000Z") };
  const hooks: { afterLookup?: () => void } = {};
  const users: Record<string, string> = { "admin-A": "Dono", "att-A": "Atendente", "admin-B": "Dona B" };

  const company = (over: Partial<CompanyData> = {}): CompanyData => ({
    name: "Pet Shop",
    legalName: null,
    cnpj: null,
    stateRegistration: null,
    municipalRegistration: null,
    taxRegime: null,
    addressLine: null,
    city: null,
    state: null,
    zipCode: null,
    phone: null,
    ...over,
  });

  const appt = (
    id: string,
    tenantId: string,
    customerId: string,
    customerName: string,
    petName: string,
    serviceName: string,
    priceCents: number,
    status: AppointmentStatus = "COMPLETED",
  ) => ({ id, tenantId, customerId, customerName, petName, serviceName, priceCents, status, startsAt: new Date("2026-10-12T13:00:00.000Z"), billed: false });

  const state = {
    customers: [
      { id: "cA1", tenantId: "A", name: "Carlos" },
      { id: "cA2", tenantId: "A", name: "Dora" },
      { id: "cB1", tenantId: "B", name: "Beto" },
    ],
    products: [
      { id: "prA1", tenantId: "A", name: "Shampoo", priceCents: 3000, active: true, stock: 10 },
      { id: "prA2", tenantId: "A", name: "Ração", priceCents: 12000, active: true, stock: 3 },
      { id: "prB1", tenantId: "B", name: "Shampoo", priceCents: 3500, active: true, stock: 5 },
    ],
    services: [
      { id: "svA1", tenantId: "A", name: "Banho avulso", priceCents: 5000, active: true },
      { id: "svB1", tenantId: "B", name: "Banho avulso", priceCents: 6000, active: true },
    ],
    appts: [
      appt("aA1", "A", "cA1", "Carlos", "Thor", "Banho", 5000),
      appt("aA2", "A", "cA1", "Carlos", "Mia", "Tosa", 8000),
      appt("aB1", "B", "cB1", "Beto", "Bidu", "Banho", 6000),
    ],
    sales: [] as SaleDetail[],
    returns: [] as ReturnDetail[],
    movements: [] as { tenantId: string; productId: string; type: "SALE" | "RETURN"; quantity: number; note: string; saleId: string }[],
    docs: [] as (FiscalDocumentRecord & { request: unknown })[],
    seq: { sale: { A: 0, B: 0 } as Record<string, number>, ret: { A: 0, B: 0 } as Record<string, number>, id: 0 },
    companies: {
      A: company({
        name: "Pet Shop A",
        legalName: "Pet Shop A Comércio LTDA",
        cnpj: "11222333000181",
        stateRegistration: "123456789",
        municipalRegistration: "98765",
        taxRegime: "SIMPLES_NACIONAL",
        addressLine: "Rua das Flores, 100",
        city: "Salvador",
        state: "BA",
        zipCode: "40010000",
        phone: "7132221234",
      }),
      B: company({ name: "Pet Shop B" }),
    } as Record<string, CompanyData>,
    fiscal: {
      product: {
        prA1: { ncm: "33051000", cfop: "5102", csosn: "102", unit: "UN" },
        prA2: { ncm: "23091000", cfop: "5102", csosn: "102", unit: "UN" },
      } as Record<string, ItemFiscalInfo>,
      service: { svA1: { serviceCode: "05.08", issRateBp: 500 } } as Record<string, ItemFiscalInfo>,
      appointment: { aA1: { serviceCode: "05.08", issRateBp: 500 }, aA2: { serviceCode: "05.08", issRateBp: 500 } } as Record<string, ItemFiscalInfo>,
    },
  };

  const nextId = (p: string) => `${p}${++state.seq.id}`;
  const hasActiveDoc = (tenantId: string, saleId: string) =>
    state.docs.some((d) => d.tenantId === tenantId && d.saleId === saleId && (d.status === "AUTHORIZED" || d.status === "PROCESSING"));
  const isBilled = (tenantId: string, appointmentId: string) =>
    state.sales.some(
      (s) => s.tenantId === tenantId && s.status === "COMPLETED" && s.items.some((i) => i.appointmentId === appointmentId && i.returnedQuantity === 0),
    );

  /** Tudo ou nada: se `fn` falhar, o estado volta exatamente como estava. */
  function atomic<T extends { ok: boolean }>(fn: () => T): T {
    const snap = structuredClone({
      products: state.products,
      sales: state.sales,
      returns: state.returns,
      movements: state.movements,
      docs: state.docs,
      seq: state.seq,
    });
    const r = fn();
    if (!r.ok) Object.assign(state, snap);
    return r;
  }

  function placeSale(tenantId: string, sale: NewSale): CreateSaleResult {
    for (const it of sale.items.filter((i) => i.kind === "APPOINTMENT")) {
      const a = state.appts.find((x) => x.id === it.appointmentId && x.tenantId === tenantId);
      if (!a || a.status !== "COMPLETED" || a.priceCents !== it.unitPriceCents || isBilled(tenantId, a.id)) {
        return { ok: false, reason: "APPOINTMENT_UNAVAILABLE", description: it.description };
      }
    }
    for (const it of sale.items.filter((i) => i.kind === "SERVICE")) {
      const sv = state.services.find((x) => x.id === it.serviceId && x.tenantId === tenantId);
      if (!sv || !sv.active) return { ok: false, reason: "SERVICE_UNAVAILABLE", serviceName: sv?.name ?? it.description };
      if (sv.priceCents !== it.unitPriceCents) return { ok: false, reason: "SERVICE_CHANGED", serviceName: sv.name };
    }
    const decrements: { id: string; qty: number }[] = [];
    for (const it of sale.items.filter((i) => i.kind === "PRODUCT")) {
      const p = state.products.find((x) => x.id === it.productId && x.tenantId === tenantId);
      if (!p || !p.active) return { ok: false, reason: "PRODUCT_UNAVAILABLE", productName: p?.name ?? it.description };
      if (p.priceCents !== it.unitPriceCents) return { ok: false, reason: "PRODUCT_CHANGED", productName: p.name };
      if (p.stock < it.quantity) return { ok: false, reason: "INSUFFICIENT_STOCK", productName: p.name, available: p.stock };
      decrements.push({ id: p.id, qty: it.quantity });
    }
    const number = ++state.seq.sale[tenantId];
    const id = nextId("sale");
    const record: SaleDetail = {
      id,
      tenantId,
      number,
      status: "COMPLETED",
      customerId: sale.customerId,
      customerName: state.customers.find((c) => c.id === sale.customerId)?.name ?? null,
      paymentMethod: sale.paymentMethod,
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents,
      totalCents: sale.totalCents,
      creditAppliedCents: sale.creditAppliedCents,
      returnedValueCents: 0,
      refundedCents: 0,
      notes: sale.notes,
      createdAt: clock.now,
      createdById: sale.userId,
      createdByName: users[sale.userId] ?? "?",
      canceledAt: null,
      cancelReason: null,
      itemCount: sale.items.length,
      items: sale.items.map((i) => ({ ...i, id: nextId("item"), returnedQuantity: 0 })),
    };
    state.sales.push(record);
    for (const d of decrements) {
      state.products.find((p) => p.id === d.id)!.stock -= d.qty;
      state.movements.push({ tenantId, productId: d.id, type: "SALE", quantity: -d.qty, note: `Venda #${number}`, saleId: id });
    }
    return { ok: true, sale: record };
  }

  const toForSale = ({ tenantId: _t, ...a }: (typeof state.appts)[number], billed: boolean): AppointmentForSale => ({ ...a, billed });

  const sales: SalesRepo = {
    async findProductsForSale(tenantId, ids) {
      const r = state.products.filter((p) => p.tenantId === tenantId && ids.includes(p.id)).map(({ id, name, priceCents, active }) => ({ id, name, priceCents, active }));
      hooks.afterLookup?.();
      return r;
    },
    async findServicesForSale(tenantId, ids) {
      const r = state.services.filter((s) => s.tenantId === tenantId && ids.includes(s.id)).map(({ id, name, priceCents, active }) => ({ id, name, priceCents, active }));
      hooks.afterLookup?.();
      return r;
    },
    async findAppointmentsForSale(tenantId, ids) {
      const r = state.appts.filter((a) => a.tenantId === tenantId && ids.includes(a.id)).map((a) => toForSale(a, isBilled(tenantId, a.id)));
      hooks.afterLookup?.();
      return r;
    },
    async listBillableAppointments(tenantId) {
      return state.appts.filter((a) => a.tenantId === tenantId && a.status === "COMPLETED" && !isBilled(tenantId, a.id)).map((a) => toForSale(a, false));
    },
    async customerExists(tenantId, id) {
      return state.customers.some((c) => c.id === id && c.tenantId === tenantId);
    },
    async createSaleAtomic(tenantId, sale) {
      return atomic(() => placeSale(tenantId, sale));
    },
    async cancelSaleAtomic(tenantId, id, { reason, now }): Promise<CancelSaleResult> {
      return atomic((): CancelSaleResult => {
        const s = state.sales.find((x) => x.id === id && x.tenantId === tenantId);
        if (!s) return { ok: false, reason: "NOT_FOUND" };
        if (s.status === "CANCELED") return { ok: false, reason: "ALREADY_CANCELED" };
        if (state.returns.some((r) => r.saleId === id)) return { ok: false, reason: "HAS_RETURNS" };
        if (hasActiveDoc(tenantId, id)) return { ok: false, reason: "HAS_FISCAL_DOCUMENT" };
        s.status = "CANCELED";
        s.canceledAt = now;
        s.cancelReason = reason;
        for (const it of s.items.filter((i) => i.kind === "PRODUCT")) {
          state.products.find((p) => p.id === it.productId)!.stock += it.quantity;
          state.movements.push({ tenantId, productId: it.productId!, type: "RETURN", quantity: it.quantity, note: `Cancelamento da venda #${s.number}`, saleId: id });
        }
        return { ok: true, sale: s };
      });
    },
    async findSale(tenantId, id) {
      return state.sales.find((s) => s.id === id && s.tenantId === tenantId) ?? null;
    },
    async listSales(tenantId, { from, to }) {
      return state.sales.filter((s) => s.tenantId === tenantId && s.createdAt >= from && s.createdAt < to).sort((a, b) => b.number - a.number);
    },
    async listReturnsInRange(tenantId, { from, to }) {
      return state.returns.filter((r) => r.tenantId === tenantId && r.createdAt >= from && r.createdAt < to).map(toSummary);
    },
  };

  const toSummary = (r: ReturnDetail): ReturnSummaryRow => ({
    id: r.id,
    number: r.number,
    saleId: r.saleId,
    saleNumber: r.saleNumber,
    valueCents: r.valueCents,
    appliedCents: r.appliedCents,
    refundCents: r.refundCents,
    refundMethod: r.refundMethod,
    createdAt: r.createdAt,
  });

  const returns: ReturnsRepo = {
    async findReturn(tenantId, id) {
      return state.returns.find((r) => r.id === id && r.tenantId === tenantId) ?? null;
    },
    async listReturnsForSale(tenantId, saleId) {
      return state.returns.filter((r) => r.tenantId === tenantId && r.saleId === saleId).map(toSummary);
    },
    async createReturnAtomic(tenantId, ret: NewReturn): Promise<CreateReturnResult> {
      return atomic((): CreateReturnResult => {
        const sale = state.sales.find((s) => s.id === ret.saleId && s.tenantId === tenantId);
        if (!sale) return { ok: false, reason: "SALE_NOT_FOUND" };
        if (sale.status !== "COMPLETED") return { ok: false, reason: "SALE_NOT_COMPLETED" };
        if (hasActiveDoc(tenantId, sale.id)) return { ok: false, reason: "HAS_FISCAL_DOCUMENT" };
        for (const l of ret.lines) {
          const item = sale.items.find((i) => i.id === l.saleItemId);
          const available = item ? item.quantity - item.returnedQuantity : 0;
          if (!item || l.quantity > available) return { ok: false, reason: "OVER_RETURN", description: item?.description ?? "item", available };
        }
        if (sale.refundedCents + ret.refundCents > sale.totalCents - sale.creditAppliedCents) return { ok: false, reason: "EXCEEDS_PAID" };

        const number = ++state.seq.ret[tenantId];
        const id = nextId("ret");
        const items = ret.lines.map((l) => {
          const item = sale.items.find((i) => i.id === l.saleItemId)!;
          item.returnedQuantity += l.quantity;
          const restocked = ret.restock && item.kind === "PRODUCT";
          if (restocked) {
            state.products.find((p) => p.id === item.productId)!.stock += l.quantity;
            state.movements.push({ tenantId, productId: item.productId!, type: "RETURN", quantity: l.quantity, note: `Devolução #${number} (venda #${sale.number})`, saleId: sale.id });
          }
          return { id: nextId("ritem"), saleItemId: l.saleItemId, description: item.description, kind: item.kind, quantity: l.quantity, valueCents: l.valueCents, restocked };
        });
        sale.returnedValueCents += ret.valueCents;
        sale.refundedCents += ret.refundCents;

        const detail: ReturnDetail = {
          id,
          tenantId,
          number,
          saleId: sale.id,
          saleNumber: sale.number,
          reason: ret.reason,
          valueCents: ret.valueCents,
          appliedCents: ret.appliedCents,
          refundCents: ret.refundCents,
          refundMethod: ret.refundMethod,
          restocked: ret.restock,
          exchangeSaleId: null,
          exchangeSaleNumber: null,
          createdAt: clock.now,
          createdByName: users[ret.userId] ?? "?",
          items,
        };
        state.returns.push(detail);

        let exchangeSale: SaleDetail | null = null;
        if (ret.exchange) {
          const r = placeSale(tenantId, ret.exchange);
          if (!r.ok) return r; // a troca falhou: `atomic` desfaz a devolução inteira
          exchangeSale = r.sale;
          detail.exchangeSaleId = r.sale.id;
          detail.exchangeSaleNumber = r.sale.number;
        }
        return { ok: true, ret: detail, exchangeSale };
      });
    },
  };

  const fiscal: FiscalRepo = {
    async loadEmissionContext(tenantId, saleId): Promise<EmissionContext | null> {
      const sale = state.sales.find((s) => s.id === saleId && s.tenantId === tenantId);
      if (!sale) return null;
      const itemFiscal: Record<string, ItemFiscalInfo> = {};
      for (const it of sale.items) {
        itemFiscal[it.id] =
          (it.kind === "PRODUCT" ? state.fiscal.product[it.productId!] : it.kind === "SERVICE" ? state.fiscal.service[it.serviceId!] : state.fiscal.appointment[it.appointmentId!]) ?? {};
      }
      const docs = state.docs.filter((d) => d.tenantId === tenantId && d.saleId === saleId).map(({ request: _r, ...d }) => d);
      // cópia (como a leitura do banco): mudanças posteriores no estado não alteram o contexto já lido
      return { sale: structuredClone(sale), company: structuredClone(state.companies[tenantId]), itemFiscal, docs };
    },
    async reserveDocument(tenantId, { saleId, kind, environment, totalCents, request }): Promise<ReserveResult> {
      const sale = state.sales.find((s) => s.id === saleId && s.tenantId === tenantId);
      if (!sale) return { ok: false, reason: "SALE_NOT_FOUND" };
      if (sale.status !== "COMPLETED" || sale.returnedValueCents > 0) return { ok: false, reason: "SALE_BLOCKED" };
      if (state.docs.some((d) => d.tenantId === tenantId && d.saleId === saleId && d.kind === kind && (d.status === "PROCESSING" || d.status === "AUTHORIZED"))) {
        return { ok: false, reason: "ALREADY_ACTIVE" };
      }
      const sequence = state.docs.filter((d) => d.tenantId === tenantId && d.kind === kind).length + 1;
      const id = nextId("doc");
      state.docs.push({
        id, tenantId, saleId, kind, status: "PROCESSING", environment, number: sequence, series: null, accessKey: null, protocol: null,
        totalCents, rejectionReason: null, issuedAt: null, canceledAt: null, cancelReason: null, createdAt: clock.now, request,
      });
      return { ok: true, id, sequence };
    },
    async completeDocument(tenantId, id, result) {
      const d = state.docs.find((x) => x.id === id && x.tenantId === tenantId && x.status === "PROCESSING");
      if (!d) return null;
      if (result.status === "AUTHORIZED") {
        Object.assign(d, { status: "AUTHORIZED", number: result.number, series: result.series, accessKey: result.accessKey, protocol: result.protocol, issuedAt: result.issuedAt });
      } else {
        Object.assign(d, { status: "REJECTED", rejectionReason: result.reason });
      }
      const { request: _r, ...rec } = d;
      return rec;
    },
    async listDocuments(tenantId, saleId) {
      return state.docs.filter((d) => d.tenantId === tenantId && d.saleId === saleId).map(({ request: _r, ...d }) => d);
    },
    async findDocument(tenantId, id) {
      const d = state.docs.find((x) => x.id === id && x.tenantId === tenantId);
      if (!d) return null;
      const { request: _r, ...rec } = d;
      return rec;
    },
    async markCanceled(tenantId, id, { reason, now }) {
      const d = state.docs.find((x) => x.id === id && x.tenantId === tenantId && x.status === "AUTHORIZED");
      if (!d) return null;
      Object.assign(d, { status: "CANCELED", canceledAt: now, cancelReason: reason });
      const { request: _r, ...rec } = d;
      return rec;
    },
  };

  /** Atalho dos testes: cria uma nota fiscal já gravada para a venda. */
  const addDoc = (saleId: string, kind: "NFCE" | "NFSE" = "NFCE", status: FiscalDocumentRecord["status"] = "AUTHORIZED", tenantId = "A") => {
    const id = nextId("doc");
    state.docs.push({
      id, tenantId, saleId, kind, status, environment: "SIMULATED", number: 1, series: 1,
      accessKey: status === "AUTHORIZED" ? `SIMULADO-${kind}-x-000000001` : null, protocol: null, totalCents: 1,
      rejectionReason: null, issuedAt: status === "AUTHORIZED" ? clock.now : null, canceledAt: null, cancelReason: null,
      createdAt: clock.now, request: {},
    });
    return id;
  };

  return { clock, hooks, state, sales, returns, fiscal, repos: { sales, returns }, addDoc };
}

export type World = ReturnType<typeof createWorld>;

export const as = (role: Role, tenantId: string, userId: string): SessionPayload => ({ userId, tenantId, role });
export const adminA = as("ADMIN", "A", "admin-A");
export const attA = as("ATTENDANT", "A", "att-A");
export const groomerA = as("GROOMER", "A", "groomer-A");
export const vetA = as("VET", "A", "vet-A");
export const adminB = as("ADMIN", "B", "admin-B");
