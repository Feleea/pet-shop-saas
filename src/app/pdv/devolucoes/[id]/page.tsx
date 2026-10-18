import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaCompanyRepo } from "@/lib/company-repo";
import { getCompany } from "@/lib/company-service";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { NotFoundError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { prismaReturnsRepo } from "@/lib/returns-repo";
import { getReturn } from "@/lib/returns-service";
import { PAYMENT_LABEL } from "@/lib/sales-constants";
import { requireSession } from "@/lib/session-cookie";
import { PrintButton } from "../../print-button";
import { CompanyHeader, ReceiptStyles } from "../../receipt";

export const dynamic = "force-dynamic";

export default async function DevolucaoPage({
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

  const ret = await getReturn(prismaReturnsRepo, session, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const company = await getCompany(prismaCompanyRepo, session);
  const isExchange = ret.exchangeSaleId !== null;

  return (
    <main>
      <ReceiptStyles />
      <div className="no-print" style={{ textAlign: "center" }}>
        <p style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center" }}>
          <Link href={`/pdv/vendas/${ret.saleId}`}>← Venda #{ret.saleNumber}</Link>
          <PrintButton />
        </p>
        {nova === "1" && <p role="status">{isExchange ? "Troca registrada com sucesso." : "Devolução registrada com sucesso."}</p>}
      </div>

      <article className="receipt" data-testid="receipt">
        <CompanyHeader company={company} />
        <hr />
        <h1>
          {isExchange ? "COMPROVANTE DE TROCA" : "COMPROVANTE DE DEVOLUÇÃO"} Nº {ret.number}
        </h1>
        <p className="center">{formatDateTimeBR(ret.createdAt)}</p>
        <p>Venda de origem: nº {ret.saleNumber}</p>
        <p>Atendente: {ret.createdByName}</p>
        <p>Motivo: {ret.reason}</p>
        <hr />

        <table>
          <tbody>
            {ret.items.map((i) => (
              <tr key={i.id} data-testid="receipt-item">
                <td>
                  {i.quantity} x {i.description}
                  {i.kind === "PRODUCT" && !i.restocked && (
                    <>
                      <br />
                      <small>não voltou ao estoque</small>
                    </>
                  )}
                </td>
                <td className="right">{formatBRL(i.valueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />

        <table>
          <tbody>
            <tr>
              <td>
                <strong>VALOR DEVOLVIDO</strong>
              </td>
              <td className="right">
                <strong data-testid="return-value">{formatBRL(ret.valueCents)}</strong>
              </td>
            </tr>
            {ret.appliedCents > 0 && (
              <tr>
                <td>Crédito usado na troca</td>
                <td className="right" data-testid="return-applied">
                  {formatBRL(ret.appliedCents)}
                </td>
              </tr>
            )}
            {ret.refundCents > 0 && ret.refundMethod && (
              <tr>
                <td>Devolvido em {PAYMENT_LABEL[ret.refundMethod]}</td>
                <td className="right" data-testid="return-refund">
                  {formatBRL(ret.refundCents)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {isExchange && (
          <p data-testid="return-exchange">
            Troca: nova venda nº {ret.exchangeSaleNumber}{" "}
            <Link className="no-print" href={`/pdv/vendas/${ret.exchangeSaleId}`}>
              ver venda
            </Link>
          </p>
        )}
        <hr />
        <p className="center">DOCUMENTO SEM VALOR FISCAL</p>
      </article>
    </main>
  );
}
