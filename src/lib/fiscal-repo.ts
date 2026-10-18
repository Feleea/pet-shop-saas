import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { EmissionContext, FiscalDocumentRecord, ItemFiscalInfo } from "./fiscal-builder";
import type { FiscalRepo, ReserveResult } from "./fiscal-service";
import { detailSelect, lock, toDetail } from "./sales-repo";
import { withTenant } from "./tenant";

const docSelect = {
  id: true,
  tenantId: true,
  saleId: true,
  kind: true,
  status: true,
  environment: true,
  number: true,
  series: true,
  accessKey: true,
  protocol: true,
  totalCents: true,
  rejectionReason: true,
  issuedAt: true,
  canceledAt: true,
  cancelReason: true,
  createdAt: true,
} as const;

const ACTIVE = ["PROCESSING", "AUTHORIZED"] as ("PROCESSING" | "AUTHORIZED")[];

async function listDocs(tenantId: string, saleId: string): Promise<FiscalDocumentRecord[]> {
  return db.fiscalDocument.findMany({ where: withTenant({ tenantId }, { saleId }), select: docSelect, orderBy: { createdAt: "asc" } });
}

// REGRA: todo `where` passa por withTenant().
export const prismaFiscalRepo: FiscalRepo = {
  async loadEmissionContext(tenantId, saleId): Promise<EmissionContext | null> {
    const row = await db.sale.findFirst({ where: withTenant({ tenantId }, { id: saleId }), select: detailSelect });
    if (!row) return null;
    const sale = toDetail(row);
    const company = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        cnpj: true,
        stateRegistration: true,
        municipalRegistration: true,
        taxRegime: true,
        addressLine: true,
        city: true,
        state: true,
        zipCode: true,
        phone: true,
      },
    });
    if (!company) return null;

    const ids = (kind: "PRODUCT" | "SERVICE" | "APPOINTMENT", key: "productId" | "serviceId" | "appointmentId") =>
      sale.items.filter((i) => i.kind === kind).map((i) => i[key]!);
    const [products, services, appointments] = await Promise.all([
      db.product.findMany({
        where: withTenant({ tenantId }, { id: { in: ids("PRODUCT", "productId") } }),
        select: { id: true, ncm: true, cfop: true, csosn: true, unit: true },
      }),
      db.service.findMany({
        where: withTenant({ tenantId }, { id: { in: ids("SERVICE", "serviceId") } }),
        select: { id: true, serviceCode: true, issRateBp: true },
      }),
      db.appointment.findMany({
        where: withTenant({ tenantId }, { id: { in: ids("APPOINTMENT", "appointmentId") } }),
        select: { id: true, service: { select: { serviceCode: true, issRateBp: true } } },
      }),
    ]);

    const itemFiscal: Record<string, ItemFiscalInfo> = {};
    for (const it of sale.items) {
      if (it.kind === "PRODUCT") itemFiscal[it.id] = products.find((p) => p.id === it.productId) ?? {};
      else if (it.kind === "SERVICE") itemFiscal[it.id] = services.find((s) => s.id === it.serviceId) ?? {};
      else itemFiscal[it.id] = appointments.find((a) => a.id === it.appointmentId)?.service ?? {};
    }
    return { sale, company, itemFiscal, docs: await listDocs(tenantId, saleId) };
  },

  async reserveDocument(tenantId, { saleId, kind, environment, totalCents, request, userId }): Promise<ReserveResult> {
    return db.$transaction(async (tx) => {
      // Mesma trava da devolução/cancelamento da venda + trava da numeração do tipo de nota.
      await lock(tx, [`sale:${tenantId}:${saleId}`, `fiscalseq:${tenantId}:${kind}`]);
      const sale = await tx.sale.findFirst({
        where: withTenant({ tenantId }, { id: saleId }),
        select: { status: true, returnedValueCents: true },
      });
      if (!sale) return { ok: false, reason: "SALE_NOT_FOUND" } as const;
      if (sale.status !== "COMPLETED" || sale.returnedValueCents > 0) return { ok: false, reason: "SALE_BLOCKED" } as const;
      const active = await tx.fiscalDocument.count({ where: withTenant({ tenantId }, { saleId, kind, status: { in: ACTIVE } }) });
      if (active > 0) return { ok: false, reason: "ALREADY_ACTIVE" } as const;

      const sequence = (await tx.fiscalDocument.count({ where: withTenant({ tenantId }, { kind }) })) + 1;
      const doc = await tx.fiscalDocument.create({
        data: {
          tenantId,
          saleId,
          kind,
          status: "PROCESSING",
          environment,
          number: sequence,
          totalCents,
          request: request as unknown as Prisma.InputJsonValue,
          createdById: userId,
        },
        select: { id: true },
      });
      return { ok: true, id: doc.id, sequence } as const;
    });
  },

  async completeDocument(tenantId, id, result) {
    const data =
      result.status === "AUTHORIZED"
        ? {
            status: "AUTHORIZED" as const,
            number: result.number,
            series: result.series,
            accessKey: result.accessKey,
            protocol: result.protocol,
            providerRef: result.providerRef,
            issuedAt: result.issuedAt,
          }
        : { status: "REJECTED" as const, rejectionReason: result.reason };
    const r = await db.fiscalDocument.updateMany({ where: withTenant({ tenantId }, { id, status: "PROCESSING" as const }), data });
    if (r.count === 0) return null;
    return db.fiscalDocument.findFirst({ where: withTenant({ tenantId }, { id }), select: docSelect });
  },

  listDocuments: (tenantId, saleId) => listDocs(tenantId, saleId),

  findDocument: (tenantId, id) => db.fiscalDocument.findFirst({ where: withTenant({ tenantId }, { id }), select: docSelect }),

  async markCanceled(tenantId, id, { reason, now }) {
    const r = await db.fiscalDocument.updateMany({
      where: withTenant({ tenantId }, { id, status: "AUTHORIZED" as const }),
      data: { status: "CANCELED", canceledAt: now, cancelReason: reason },
    });
    if (r.count === 0) return null;
    return db.fiscalDocument.findFirst({ where: withTenant({ tenantId }, { id }), select: docSelect });
  },
};
