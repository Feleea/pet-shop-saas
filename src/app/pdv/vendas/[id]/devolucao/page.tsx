import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaCatalogRepo } from "@/lib/catalog-repo";
import { listServices } from "@/lib/catalog-service";
import { NotFoundError } from "@/lib/errors";
import { prismaFiscalRepo } from "@/lib/fiscal-repo";
import { listFiscalDocuments } from "@/lib/fiscal-service";
import { prismaInventoryRepo } from "@/lib/inventory-repo";
import { listProducts } from "@/lib/inventory-service";
import { can } from "@/lib/permissions";
import { NOT_COMPLETED_MESSAGE } from "@/lib/returns-service";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { HAS_FISCAL_DOCUMENT_MESSAGE, getSale } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { ReturnForm } from "./return-form";

export const dynamic = "force-dynamic";

export default async function DevolucaoFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!can(session.role, "return")) redirect(can(session.role, "sell") ? `/pdv/vendas/${id}` : "/painel");

  const sale = await getSale(prismaSalesRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [docs, products, services] = await Promise.all([
    listFiscalDocuments(prismaFiscalRepo, session, id),
    listProducts(prismaInventoryRepo, session),
    listServices(prismaCatalogRepo, session),
  ]);
  const blocked =
    sale.status !== "COMPLETED"
      ? NOT_COMPLETED_MESSAGE
      : docs.some((d) => d.status === "AUTHORIZED" || d.status === "PROCESSING")
        ? HAS_FISCAL_DOCUMENT_MESSAGE
        : null;

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href={`/pdv/vendas/${sale.id}`}>← Venda #{sale.number}</Link>
      </p>
      <h1>Devolução ou troca — venda #{sale.number}</h1>
      {blocked ? (
        <p role="alert" style={{ color: "crimson" }}>
          {blocked}.
        </p>
      ) : (
        <ReturnForm
          saleId={sale.id}
          sale={{
            subtotalCents: sale.subtotalCents,
            totalCents: sale.totalCents,
            returnedValueCents: sale.returnedValueCents,
            paymentMethod: sale.paymentMethod,
          }}
          items={sale.items.map((i) => ({
            id: i.id,
            description: i.description,
            kind: i.kind,
            unitPriceCents: i.unitPriceCents,
            quantity: i.quantity,
            returnedQuantity: i.returnedQuantity,
          }))}
          products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
          services={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents }))}
        />
      )}
    </main>
  );
}
