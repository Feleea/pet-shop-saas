import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaCompanyRepo } from "@/lib/company-repo";
import { getCompany } from "@/lib/company-service";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { NotFoundError } from "@/lib/errors";
import { ENVIRONMENT_LABEL, FISCAL_KIND_LABEL } from "@/lib/fiscal-constants";
import { prismaFiscalRepo } from "@/lib/fiscal-repo";
import { listFiscalDocuments } from "@/lib/fiscal-service";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { prismaReturnsRepo } from "@/lib/returns-repo";
import { listReturnsForSale } from "@/lib/returns-service";
import { PAYMENT_LABEL } from "@/lib/sales-constants";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { getSale } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { PrintButton } from "../../../print-button";
import { CompanyHeader, ReceiptStyles } from "../../../receipt";

export const dynamic = "force-dynamic";

export default async function ComprovanteVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "sell")) redirect("/painel");
  const { id } = await params;

  const sale = await getSale(prismaSalesRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [company, returns, docs] = await Promise.all([
    getCompany(prismaCompanyRepo, session),
    listReturnsForSale(prismaReturnsRepo, session, id),
    listFiscalDocuments(prismaFiscalRepo, session, id),
  ]);
  const authorized = docs.filter((d) => d.status === "AUTHORIZED");
  const paid = sale.totalCents - sale.creditAppliedCents;

  return (
    <main>
      <ReceiptStyles />
      <p className="no-print" style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center" }}>
        <Link href={`/pdv/vendas/${sale.id}`}>← Venda #{sale.number}</Link>
        <PrintButton />
      </p>

      <article className="receipt" data-testid="receipt">
        <CompanyHeader company={company} />
        <hr />
        <h1>COMPROVANTE DE VENDA Nº {sale.number}</h1>
        <p className="center">{formatDateTimeBR(sale.createdAt)}</p>
        {sale.status === "CANCELED" && (
          <p className="warn" data-testid="receipt-canceled">
            VENDA CANCELADA
          </p>
        )}
        <p>Vendedor: {sale.createdByName}</p>
        <p>Cliente: {sale.customerName ?? "não informado"}</p>
        <hr />

        <table>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id} data-testid="receipt-item">
                <td>
                  {i.quantity} x {i.description}
                  <br />
                  <small>
                    {i.quantity} × {formatBRL(i.unitPriceCents)}
                  </small>
                </td>
                <td className="right">{formatBRL(i.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />

        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="right">{formatBRL(sale.subtotalCents)}</td>
            </tr>
            {sale.discountCents > 0 && (
              <tr>
                <td>Desconto</td>
                <td className="right">-{formatBRL(sale.discountCents)}</td>
              </tr>
            )}
            <tr>
              <td>
                <strong>TOTAL</strong>
              </td>
              <td className="right">
                <strong data-testid="receipt-total">{formatBRL(sale.totalCents)}</strong>
              </td>
            </tr>
            {sale.creditAppliedCents > 0 && (
              <tr>
                <td>Crédito de troca</td>
                <td className="right">-{formatBRL(sale.creditAppliedCents)}</td>
              </tr>
            )}
            <tr>
              <td>Pago em {PAYMENT_LABEL[sale.paymentMethod]}</td>
              <td className="right" data-testid="receipt-paid">
                {formatBRL(paid)}
              </td>
            </tr>
          </tbody>
        </table>

        {returns.length > 0 && (
          <>
            <hr />
            <p>
              <strong>Devoluções</strong>
            </p>
            {returns.map((r) => (
              <p key={r.id} data-testid="receipt-return">
                Devolução #{r.number}: {formatBRL(r.valueCents)}
                {r.refundCents > 0 ? ` (devolvido ${formatBRL(r.refundCents)})` : " (troca)"}
              </p>
            ))}
          </>
        )}

        <hr />
        {authorized.length > 0 ? (
          <div data-testid="receipt-fiscal">
            {authorized.map((d) => (
              <div key={d.id}>
                <p>
                  {FISCAL_KIND_LABEL[d.kind]} nº {d.number} · série {d.series}
                </p>
                <p style={{ wordBreak: "break-all" }}>Chave: {d.accessKey}</p>
                {d.environment !== "PRODUCTION" && <p className="warn">{ENVIRONMENT_LABEL[d.environment]}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="center" data-testid="receipt-no-fiscal">
            DOCUMENTO SEM VALOR FISCAL
          </p>
        )}
        <p className="center">Obrigado pela preferência!</p>
      </article>
    </main>
  );
}
