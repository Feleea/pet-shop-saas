import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { NotFoundError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PAYMENT_LABEL, SALE_STATUS_LABEL } from "@/lib/sales-constants";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { getSale } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { CancelSaleForm } from "./cancel-form";

export const dynamic = "force-dynamic";

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

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Item</th>
            <th align="left">Qtd</th>
            <th align="left">Unitário</th>
            <th align="left">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id} data-testid="sale-item">
              <td>{i.description}</td>
              <td>{i.quantity}</td>
              <td>{formatBRL(i.unitPriceCents)}</td>
              <td>{formatBRL(i.totalCents)}</td>
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

      {sale.status === "CANCELED" && (
        <p data-testid="sale-cancel-info">
          Cancelada em {sale.canceledAt ? formatDateTimeBR(sale.canceledAt) : "—"}. Motivo: {sale.cancelReason}
        </p>
      )}
      {sale.status === "COMPLETED" && can(session.role, "delete") && <CancelSaleForm id={sale.id} />}
    </main>
  );
}
