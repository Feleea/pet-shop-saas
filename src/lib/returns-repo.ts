import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CreateReturnFailure, CreateReturnResult, ReturnDetail, ReturnsRepo } from "./returns-service";
import { SaleAbort, createSaleInTx, lock } from "./sales-repo";
import { withTenant } from "./tenant";

/** Lançada dentro da transação para DESFAZER tudo. */
class ReturnAbort extends Error {
  constructor(public failure: CreateReturnFailure) {
    super("abort");
  }
}

const returnSelect = {
  id: true,
  tenantId: true,
  number: true,
  saleId: true,
  reason: true,
  valueCents: true,
  appliedCents: true,
  refundCents: true,
  refundMethod: true,
  restocked: true,
  exchangeSaleId: true,
  createdAt: true,
  sale: { select: { number: true } },
  createdBy: { select: { name: true } },
  items: {
    select: {
      id: true,
      saleItemId: true,
      quantity: true,
      valueCents: true,
      restocked: true,
      saleItem: { select: { description: true, kind: true } },
    },
    orderBy: { id: "asc" },
  },
} as const;

async function loadReturn(tx: Prisma.TransactionClient | typeof db, tenantId: string, id: string): Promise<ReturnDetail | null> {
  const row = await tx.saleReturn.findFirst({ where: withTenant({ tenantId }, { id }), select: returnSelect });
  if (!row) return null;
  const exchange = row.exchangeSaleId
    ? await tx.sale.findFirst({ where: withTenant({ tenantId }, { id: row.exchangeSaleId }), select: { number: true } })
    : null;
  const { sale, createdBy, items, ...rest } = row;
  return {
    ...rest,
    saleNumber: sale.number,
    exchangeSaleNumber: exchange?.number ?? null,
    createdByName: createdBy.name,
    items: items.map(({ saleItem, ...it }) => ({ ...it, description: saleItem.description, kind: saleItem.kind })),
  };
}

// REGRA: todo `where` passa por withTenant().
export const prismaReturnsRepo: ReturnsRepo = {
  findReturn: (tenantId, id) => loadReturn(db, tenantId, id),

  async listReturnsForSale(tenantId, saleId) {
    const rows = await db.saleReturn.findMany({
      where: withTenant({ tenantId }, { saleId }),
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
      orderBy: { number: "asc" },
    });
    return rows.map(({ sale, ...r }) => ({ ...r, saleNumber: sale.number }));
  },

  async createReturnAtomic(tenantId, ret): Promise<CreateReturnResult> {
    try {
      return await db.$transaction(async (tx) => {
        // Trava por venda: devolução x devolução x cancelamento da MESMA venda nunca se intercalam.
        await lock(tx, [`sale:${tenantId}:${ret.saleId}`]);

        const sale = await tx.sale.findFirst({
          where: withTenant({ tenantId }, { id: ret.saleId }),
          select: {
            id: true,
            number: true,
            status: true,
            totalCents: true,
            creditAppliedCents: true,
            refundedCents: true,
            items: { select: { id: true, kind: true, productId: true, quantity: true, returnedQuantity: true, description: true } },
          },
        });
        if (!sale) throw new ReturnAbort({ reason: "SALE_NOT_FOUND" });
        if (sale.status !== "COMPLETED") throw new ReturnAbort({ reason: "SALE_NOT_COMPLETED" });
        const fiscal = await tx.fiscalDocument.count({
          where: withTenant({ tenantId }, { saleId: sale.id, status: { in: ["AUTHORIZED", "PROCESSING"] as ("AUTHORIZED" | "PROCESSING")[] } }),
        });
        if (fiscal > 0) throw new ReturnAbort({ reason: "HAS_FISCAL_DOCUMENT" });

        // O que pode ser devolvido é conferido DE NOVO, já com a trava (a leitura da tela pode estar velha).
        for (const line of ret.lines) {
          const item = sale.items.find((i) => i.id === line.saleItemId);
          const available = item ? item.quantity - item.returnedQuantity : 0;
          if (!item || line.quantity > available) {
            throw new ReturnAbort({ reason: "OVER_RETURN", description: item?.description ?? "item", available });
          }
        }
        if (sale.refundedCents + ret.refundCents > sale.totalCents - sale.creditAppliedCents) {
          throw new ReturnAbort({ reason: "EXCEEDS_PAID" });
        }

        const { returnSeq } = await tx.tenant.update({
          where: { id: tenantId },
          data: { returnSeq: { increment: 1 } },
          select: { returnSeq: true },
        });
        const created = await tx.saleReturn.create({
          data: {
            tenantId,
            number: returnSeq,
            saleId: sale.id,
            reason: ret.reason,
            valueCents: ret.valueCents,
            appliedCents: ret.appliedCents,
            refundCents: ret.refundCents,
            refundMethod: ret.refundMethod,
            restocked: ret.restock,
            createdById: ret.userId,
          },
          select: { id: true },
        });

        const productLines = ret.lines.filter((l) => sale.items.find((i) => i.id === l.saleItemId)?.kind === "PRODUCT");
        await tx.saleReturnItem.createMany({
          data: ret.lines.map((l) => ({
            tenantId,
            returnId: created.id,
            saleItemId: l.saleItemId,
            quantity: l.quantity,
            valueCents: l.valueCents,
            restocked: ret.restock && productLines.includes(l),
          })),
        });
        for (const l of ret.lines) {
          await tx.saleItem.updateMany({
            where: withTenant({ tenantId }, { id: l.saleItemId }),
            data: { returnedQuantity: { increment: l.quantity } },
          });
        }
        await tx.sale.updateMany({
          where: withTenant({ tenantId }, { id: sale.id }),
          data: { returnedValueCents: { increment: ret.valueCents }, refundedCents: { increment: ret.refundCents } },
        });

        // Estoque: só itens de produto, e só se a pessoa marcou "devolver ao estoque" (produto avariado não volta).
        if (ret.restock && productLines.length > 0) {
          for (const l of productLines) {
            const item = sale.items.find((i) => i.id === l.saleItemId)!;
            await tx.product.updateMany({
              where: withTenant({ tenantId }, { id: item.productId! }),
              data: { stockQuantity: { increment: l.quantity } },
            });
          }
          await tx.stockMovement.createMany({
            data: productLines.map((l) => ({
              tenantId,
              productId: sale.items.find((i) => i.id === l.saleItemId)!.productId!,
              type: "RETURN" as const,
              quantity: l.quantity,
              note: `Devolução #${returnSeq} (venda #${sale.number})`,
              saleId: sale.id,
              createdById: ret.userId,
            })),
          });
        }

        // Troca: a nova venda nasce na MESMA transação; se ela falhar (ex.: sem estoque), a devolução também é desfeita.
        let exchangeSale = null;
        if (ret.exchange) {
          exchangeSale = await createSaleInTx(tx, tenantId, ret.exchange, created.id);
          await tx.saleReturn.updateMany({
            where: withTenant({ tenantId }, { id: created.id }),
            data: { exchangeSaleId: exchangeSale.id },
          });
        }

        const detail = await loadReturn(tx, tenantId, created.id);
        return { ok: true, ret: detail!, exchangeSale } as const;
      });
    } catch (e) {
      if (e instanceof ReturnAbort) return { ok: false, ...e.failure };
      if (e instanceof SaleAbort) return { ok: false, ...e.failure };
      throw e;
    }
  },
};
