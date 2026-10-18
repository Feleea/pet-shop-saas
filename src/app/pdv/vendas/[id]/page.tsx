import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { NotFoundError } from "@/lib/errors";
import { RETURNS_BLOCK_MESSAGE } from "@/lib/fiscal-builder";
import { prismaFiscalRepo } from "@/lib/fiscal-repo";
import { listFiscalDocuments } from "@/lib/fiscal-service";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { prismaReturnsRepo } from "@/lib/returns-repo";
import { listReturnsForSale } from "@/lib/returns-service";
import { PAYMENT_LABEL, SALE_STATUS_LABEL } from "@/lib/sales-constants";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { getSale } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { CancelSaleForm } from "./cancel-form";
import { FiscalSection } from "./fiscal-section";

export const dynamic = "force-dynamic";

const KIND_LABEL = { PRODUCT: "Produto", SERVICE: "Serviço", APPOINTMENT: "Atendimento" } as const;

export default async function VendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const session = await requireSession();
  if (!can(session.role, "sell")) redirect("/painel");
  const { id } = await params;
  const { nova } = await searchParams;

  const sale = await getSale(prismaSalesRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [returns, docs] = await Promise.all([
    listReturnsForSale(prismaReturnsRepo, session, id),
    listFiscalDocuments(prismaFiscalRepo, session, id),
  ]);

  const completed = sale.status === "COMPLETED";
  const hasReturns = sale.returnedValueCents > 0 || returns.length > 0;
  const hasActiveDoc = docs.some((d) => d.status === "AUTHORIZED" || d.status === "PROCESSING");
  const canReturn = can(session.role, "return") && completed && sale.items.some((i) => i.quantity > i.returnedQuantity);

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/pdv/vendas">← Vendas</Link> · <Link href="/pdv">Nova venda</Link>
      </p>
      <h1>Venda #{sale.number}</h1>
      {nova === "1" && <p role="status">Venda registrada com sucesso.</p>}

      <p>
        Situação: <strong data-testid="sale-status">{SALE_STATUS_LABEL[sale.status]}</strong>
      </p>
      <p>
        {formatDateTimeBR(sale.createdAt)} · vendedor: {sale.createdByName} · cliente: {sale.customerName ?? "sem cliente"} · pagamento:{" "}
        <span data-testid="sale-payment">{PAYMENT_LABEL[sale.paymentMethod]}</span>
      </p>
      {sale.notes && <p>Observações: {sale.notes}</p>}

      <p style={{ display: "flex", gap: "1rem" }}>
        <Link href={`/pdv/vendas/${sale.id}/comprovante`}>Comprovante</Link>
        {canReturn && <Link href={`/pdv/vendas/${sale.id}/devolucao`}>Registrar devolução ou troca</Link>}
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Item</th>
            <th align="left">Tipo</th>
            <th align="left">Qtd</th>
            <th align="left">Unitário</th>
            <th align="left">Total</th>
            <th align="left">Devolvido</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id} data-testid="sale-item">
              <td>{i.description}</td>
              <td>{KIND_LABEL[i.kind]}</td>
              <td>{i.quantity}</td>
              <td>{formatBRL(i.unitPriceCents)}</td>
              <td>{formatBRL(i.totalCents)}</td>
              <td data-testid="item-returned">{i.returnedQuantity > 0 ? i.returnedQuantity : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Subtotal: <span data-testid="sale-subtotal">{formatBRL(sale.subtotalCents)}</span>
      </p>
      <p>
        Desconto: <span data-testid="sale-discount">{formatBRL(sale.discountCents)}</span>
      </p>
      <p>
        <strong>
          Total: <span data-testid="sale-total">{formatBRL(sale.totalCents)}</span>
        </strong>
      </p>
      {sale.creditAppliedCents > 0 && (
        <p data-testid="sale-credit">
          Crédito de troca aplicado: {formatBRL(sale.creditAppliedCents)} · pago em {PAYMENT_LABEL[sale.paymentMethod]}:{" "}
          {formatBRL(sale.totalCents - sale.creditAppliedCents)}
        </p>
      )}

      {returns.length > 0 && (
        <section>
          <h2>Devoluções</h2>
          <ul data-testid="sale-returns">
            {returns.map((r) => (
              <li key={r.id} data-testid="sale-return">
                <Link href={`/pdv/devolucoes/${r.id}`}>Devolução #{r.number}</Link> — {formatBRL(r.valueCents)}
                {r.refundCents > 0 ? ` (devolvido ${formatBRL(r.refundCents)})` : " (troca)"}
              </li>
            ))}
          </ul>
          <p>
            Total devolvido: <span data-testid="sale-returned-total">{formatBRL(sale.returnedValueCents)}</span>
          </p>
        </section>
      )}

      {sale.status === "CANCELED" && (
        <p data-testid="sale-cancel-info">
          Cancelada em {sale.canceledAt ? formatDateTimeBR(sale.canceledAt) : "—"}. Motivo: {sale.cancelReason}
        </p>
      )}

      {completed && (
        <FiscalSection
          saleId={sale.id}
          docs={docs.map((d) => ({
            id: d.id,
            kind: d.kind,
            status: d.status,
            environment: d.environment,
            number: d.number,
            series: d.series,
            accessKey: d.accessKey,
            protocol: d.protocol,
            totalCents: d.totalCents,
            rejectionReason: d.rejectionReason,
            issuedAtText: d.issuedAt ? formatDateTimeBR(d.issuedAt) : null,
            cancelReason: d.cancelReason,
          }))}
          canEmit={can(session.role, "sell")}
          canCancel={can(session.role, "delete")}
          blockedMessage={hasReturns ? `${RETURNS_BLOCK_MESSAGE}.` : undefined}
        />
      )}

      {completed && can(session.role, "delete") && (
        <>
          {hasReturns ? (
            <p data-testid="cancel-blocked">Esta venda possui devoluções e não pode ser cancelada.</p>
          ) : hasActiveDoc ? (
            <p data-testid="cancel-blocked">Cancele a nota fiscal antes de cancelar a venda.</p>
          ) : (
            <CancelSaleForm id={sale.id} />
          )}
        </>
      )}
    </main>
  );
}
