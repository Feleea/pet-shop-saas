import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type {
  AppointmentForSale,
  CancelSaleResult,
  CreateSaleFailure,
  CreateSaleResult,
  NewSale,
  SaleDetail,
  SaleRecord,
  SalesRepo,
} from "./sales-service";
import { withTenant } from "./tenant";

/** Lançada dentro da transação para DESFAZER tudo (um `return` comitaria o que já foi feito). */
export class SaleAbort extends Error {
  constructor(public failure: CreateSaleFailure) {
    super("abort");
  }
}
class CancelAbort extends Error {
  constructor(public reason: "NOT_FOUND" | "ALREADY_CANCELED" | "HAS_RETURNS" | "HAS_FISCAL_DOCUMENT") {
    super("abort");
  }
}

/** Trava por chave dentro da transação; chaves em ordem fixa evitam deadlock. */
export async function lock(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of [...keys].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export const saleSelect = {
  id: true,
  tenantId: true,
  number: true,
  status: true,
  customerId: true,
  paymentMethod: true,
  subtotalCents: true,
  discountCents: true,
  totalCents: true,
  creditAppliedCents: true,
  returnedValueCents: true,
  refundedCents: true,
  notes: true,
  createdAt: true,
  createdById: true,
  canceledAt: true,
  cancelReason: true,
  customer: { select: { name: true } },
  createdBy: { select: { name: true } },
  _count: { select: { items: true } },
} as const;

export const detailSelect = {
  ...saleSelect,
  items: {
    select: {
      id: true,
      kind: true,
      productId: true,
      serviceId: true,
      appointmentId: true,
      description: true,
      unitPriceCents: true,
      quantity: true,
      totalCents: true,
      returnedQuantity: true,
    },
    orderBy: { position: "asc" },
  },
} as const;

export function toRecord(row: Prisma.SaleGetPayload<{ select: typeof saleSelect }>): SaleRecord {
  const { customer, createdBy, _count, ...rest } = row;
  return { ...rest, customerName: customer?.name ?? null, createdByName: createdBy.name, itemCount: _count.items };
}
export function toDetail(row: Prisma.SaleGetPayload<{ select: typeof detailSelect }>): SaleDetail {
  const { items, ...rest } = row;
  return { ...toRecord(rest), items };
}

const appointmentSelect = {
  id: true,
  customerId: true,
  serviceName: true,
  priceCents: true,
  startsAt: true,
  status: true,
  customer: { select: { name: true } },
  pet: { select: { name: true } },
  // "cobrado" = há venda concluída com este atendimento que NÃO foi devolvido
  saleItems: { where: { sale: { status: "COMPLETED" as const }, returnedQuantity: 0 }, select: { id: true } },
} as const;

function toAppointment(row: Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>): AppointmentForSale {
  const { customer, pet, saleItems, ...rest } = row;
  return { ...rest, customerName: customer.name, petName: pet.name, billed: saleItems.length > 0 };
}

/**
 * Cria a venda DENTRO de uma transação já aberta (usada também pela troca). Lança SaleAbort para desfazer tudo.
 * 1) atendimentos: trava, confere que continuam concluídos, com o mesmo preço e sem outra venda ativa;
 * 2) serviços: ativo e com o mesmo preço; 3) produtos: ativo + mesmo preço + saldo suficiente, tudo na
 * condição do UPDATE (atômico); 4) numeração, venda, itens e movimentações de estoque.
 */
export async function createSaleInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sale: NewSale,
  exchangeOfReturnId?: string,
): Promise<SaleDetail> {
  const appointmentItems = sale.items.filter((i) => i.kind === "APPOINTMENT");
  const serviceItems = sale.items.filter((i) => i.kind === "SERVICE");
  // Ordem fixa por produto evita deadlock entre duas vendas simultâneas com os mesmos produtos.
  const productItems = sale.items.filter((i) => i.kind === "PRODUCT").sort((a, b) => a.productId!.localeCompare(b.productId!));

  await lock(tx, appointmentItems.map((i) => `appt:${tenantId}:${i.appointmentId}`));
  for (const it of appointmentItems) {
    const appt = await tx.appointment.findFirst({
      where: withTenant({ tenantId }, { id: it.appointmentId! }),
      select: { status: true, priceCents: true },
    });
    const billed = appt
      ? await tx.saleItem.count({
          where: withTenant({ tenantId }, {
            appointmentId: it.appointmentId!,
            returnedQuantity: 0,
            sale: { status: "COMPLETED" as const },
          }),
        })
      : 0;
    if (!appt || appt.status !== "COMPLETED" || appt.priceCents !== it.unitPriceCents || billed > 0) {
      throw new SaleAbort({ reason: "APPOINTMENT_UNAVAILABLE", description: it.description });
    }
  }

  for (const it of serviceItems) {
    const s = await tx.service.findFirst({
      where: withTenant({ tenantId }, { id: it.serviceId! }),
      select: { name: true, active: true, priceCents: true },
    });
    if (!s || !s.active) throw new SaleAbort({ reason: "SERVICE_UNAVAILABLE", serviceName: s?.name ?? it.description });
    if (s.priceCents !== it.unitPriceCents) throw new SaleAbort({ reason: "SERVICE_CHANGED", serviceName: s.name });
  }

  for (const it of productItems) {
    const r = await tx.product.updateMany({
      where: withTenant({ tenantId }, {
        id: it.productId!,
        active: true,
        priceCents: it.unitPriceCents,
        stockQuantity: { gte: it.quantity },
      }),
      data: { stockQuantity: { decrement: it.quantity } },
    });
    if (r.count === 0) {
      const p = await tx.product.findFirst({
        where: withTenant({ tenantId }, { id: it.productId! }),
        select: { name: true, active: true, priceCents: true, stockQuantity: true },
      });
      if (!p || !p.active) throw new SaleAbort({ reason: "PRODUCT_UNAVAILABLE", productName: p?.name ?? it.description });
      if (p.priceCents !== it.unitPriceCents) throw new SaleAbort({ reason: "PRODUCT_CHANGED", productName: p.name });
      throw new SaleAbort({ reason: "INSUFFICIENT_STOCK", productName: p.name, available: p.stockQuantity });
    }
  }

  const { saleSeq } = await tx.tenant.update({
    where: { id: tenantId },
    data: { saleSeq: { increment: 1 } },
    select: { saleSeq: true },
  });
  const created = await tx.sale.create({
    data: {
      tenantId,
      number: saleSeq,
      customerId: sale.customerId,
      paymentMethod: sale.paymentMethod,
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents,
      totalCents: sale.totalCents,
      creditAppliedCents: sale.creditAppliedCents,
      exchangeOfReturnId: exchangeOfReturnId ?? null,
      notes: sale.notes,
      createdById: sale.userId,
    },
    select: { id: true },
  });
  await tx.saleItem.createMany({
    data: sale.items.map((it, position) => ({
      tenantId,
      saleId: created.id,
      position,
      kind: it.kind,
      productId: it.productId,
      serviceId: it.serviceId,
      appointmentId: it.appointmentId,
      description: it.description,
      unitPriceCents: it.unitPriceCents,
      quantity: it.quantity,
      totalCents: it.totalCents,
    })),
  });
  if (productItems.length > 0) {
    await tx.stockMovement.createMany({
      data: productItems.map((it) => ({
        tenantId,
        productId: it.productId!,
        type: "SALE" as const,
        quantity: -it.quantity,
        note: `Venda #${saleSeq}`,
        saleId: created.id,
        createdById: sale.userId,
      })),
    });
  }
  const detail = await tx.sale.findFirstOrThrow({ where: withTenant({ tenantId }, { id: created.id }), select: detailSelect });
  return toDetail(detail);
}

// REGRA: todo `where` passa por withTenant().
export const prismaSalesRepo: SalesRepo = {
  findProductsForSale: (tenantId, ids) =>
    db.product.findMany({
      where: withTenant({ tenantId }, { id: { in: ids } }),
      select: { id: true, name: true, priceCents: true, active: true },
    }),

  findServicesForSale: (tenantId, ids) =>
    db.service.findMany({
      where: withTenant({ tenantId }, { id: { in: ids } }),
      select: { id: true, name: true, priceCents: true, active: true },
    }),

  async findAppointmentsForSale(tenantId, ids) {
    const rows = await db.appointment.findMany({ where: withTenant({ tenantId }, { id: { in: ids } }), select: appointmentSelect });
    return rows.map(toAppointment);
  },

  async listBillableAppointments(tenantId) {
    const rows = await db.appointment.findMany({
      where: withTenant({ tenantId }, {
        status: "COMPLETED" as const,
        saleItems: { none: { sale: { status: "COMPLETED" as const }, returnedQuantity: 0 } },
      }),
      select: appointmentSelect,
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    return rows.map(toAppointment);
  },

  async customerExists(tenantId, id) {
    return (await db.customer.count({ where: withTenant({ tenantId }, { id }) })) > 0;
  },

  async createSaleAtomic(tenantId, sale): Promise<CreateSaleResult> {
    try {
      const detail = await db.$transaction((tx) => createSaleInTx(tx, tenantId, sale));
      return { ok: true, sale: detail };
    } catch (e) {
      if (e instanceof SaleAbort) return { ok: false, ...e.failure };
      throw e;
    }
  },

  async cancelSaleAtomic(tenantId, id, { userId, reason, now }): Promise<CancelSaleResult> {
    try {
      return await db.$transaction(async (tx) => {
        // Mesma trava das devoluções: cancelar e devolver a mesma venda nunca andam juntos.
        await lock(tx, [`sale:${tenantId}:${id}`]);
        const current = await tx.sale.findFirst({ where: withTenant({ tenantId }, { id }), select: { status: true, number: true } });
        if (!current) throw new CancelAbort("NOT_FOUND");
        if (current.status === "CANCELED") throw new CancelAbort("ALREADY_CANCELED");
        if ((await tx.saleReturn.count({ where: withTenant({ tenantId }, { saleId: id }) })) > 0) throw new CancelAbort("HAS_RETURNS");
        const fiscal = await tx.fiscalDocument.count({
          where: withTenant({ tenantId }, { saleId: id, status: { in: ["AUTHORIZED", "PROCESSING"] as ("AUTHORIZED" | "PROCESSING")[] } }),
        });
        if (fiscal > 0) throw new CancelAbort("HAS_FISCAL_DOCUMENT");

        // O WHERE com status COMPLETED garante que só UM cancelamento vence, mesmo com cliques simultâneos.
        const r = await tx.sale.updateMany({
          where: withTenant({ tenantId }, { id, status: "COMPLETED" as const }),
          data: { status: "CANCELED", canceledAt: now, canceledById: userId, cancelReason: reason },
        });
        if (r.count === 0) throw new CancelAbort("ALREADY_CANCELED");

        const items = await tx.saleItem.findMany({
          where: withTenant({ tenantId }, { saleId: id, kind: "PRODUCT" as const }),
          select: { productId: true, quantity: true },
        });
        for (const it of items) {
          await tx.product.updateMany({
            where: withTenant({ tenantId }, { id: it.productId! }),
            data: { stockQuantity: { increment: it.quantity } },
          });
        }
        if (items.length > 0) {
          await tx.stockMovement.createMany({
            data: items.map((it) => ({
              tenantId,
              productId: it.productId!,
              type: "RETURN" as const,
              quantity: it.quantity,
              note: `Cancelamento da venda #${current.number}`,
              saleId: id,
              createdById: userId,
            })),
          });
        }
        const detail = await tx.sale.findFirstOrThrow({ where: withTenant({ tenantId }, { id }), select: detailSelect });
        return { ok: true, sale: toDetail(detail) } as const;
      });
    } catch (e) {
      if (e instanceof CancelAbort) return { ok: false, reason: e.reason };
      throw e;
    }
  },

  async findSale(tenantId, id) {
    const row = await db.sale.findFirst({ where: withTenant({ tenantId }, { id }), select: detailSelect });
    return row ? toDetail(row) : null;
  },

  async listSales(tenantId, { from, to }) {
    const rows = await db.sale.findMany({
      where: withTenant({ tenantId }, { createdAt: { gte: from, lt: to } }),
      select: saleSelect,
      orderBy: { number: "desc" },
    });
    return rows.map(toRecord);
  },

  async listReturnsInRange(tenantId, { from, to }) {
    const rows = await db.saleReturn.findMany({
      where: withTenant({ tenantId }, { createdAt: { gte: from, lt: to } }),
      select: {
        id: true,
        number: true,
        saleId: true,
        valueCents: true,
        appliedCents: true,
        refundCents: true,
        refundMethod: true,
        createdAt: true,
        sale: { select: { number: true } },
      },
      orderBy: { number: "desc" },
    });
    return rows.map(({ sale, ...r }) => ({ ...r, saleNumber: sale.number }));
  },
};
