import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { ValidationError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PAYMENT_LABEL, PAYMENT_METHODS, SALE_STATUS_LABEL } from "@/lib/sales-constants";
import { prismaSalesRepo } from "@/lib/sales-repo";
import { listSales } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { formatDateBR } from "@/lib/team-format";
import { addDays, localDateString } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "sell")) redirect("/painel");
  const { data } = await searchParams;

  let error: string | undefined;
  let day;
  try {
    day = await listSales(prismaSalesRepo, session, { date: data });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    error = e.message;
    day = await listSales(prismaSalesRepo, session);
  }
  const { date, sales, summary } = day;

  return (
    <main style={{ maxWidth: 980, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/pdv">← PDV</Link>
      </p>
      <h1>Vendas</h1>
      <h2>{formatDateBR(new Date(`${date}T00:00:00Z`))}</h2>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={`/pdv/vendas?data=${addDays(date, -1)}`}>← Dia anterior</Link>
        <Link href={`/pdv/vendas?data=${localDateString(new Date())}`}>Hoje</Link>
        <Link href={`/pdv/vendas?data=${addDays(date, 1)}`}>Próximo dia →</Link>
      </nav>

      <form method="get" style={{ display: "flex", gap: "0.75rem", alignItems: "end", margin: "1rem 0" }}>
        <label>
          Data <input type="date" name="data" defaultValue={date} />
        </label>
        <button type="submit">Filtrar</button>
      </form>

      <section style={{ border: "1px solid #999", padding: "0.75rem", margin: "1rem 0" }}>
        <p>
          Total vendido: <strong data-testid="sales-total">{formatBRL(summary.totalCents)}</strong> · {summary.completedCount}{" "}
          {summary.completedCount === 1 ? "venda concluída" : "vendas concluídas"}
          {summary.canceledCount > 0 && ` · ${summary.canceledCount} cancelada(s)`}
        </p>
        <ul style={{ margin: 0 }}>
          {PAYMENT_METHODS.map((m) => (
            <li key={m} data-testid={`method-${m}`}>
              {PAYMENT_LABEL[m]}: {formatBRL(summary.byMethod[m])}
            </li>
          ))}
        </ul>
      </section>

      {sales.length === 0 ? (
        <p>Nenhuma venda neste dia.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nº</th>
              <th align="left">Hora</th>
              <th align="left">Cliente</th>
              <th align="left">Itens</th>
              <th align="left">Pagamento</th>
              <th align="left">Total</th>
              <th align="left">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} data-testid="sale-row" style={{ opacity: s.status === "COMPLETED" ? 1 : 0.55 }}>
                <td>#{s.number}</td>
                <td>{formatDateTimeBR(s.createdAt).slice(-5)}</td>
                <td>{s.customerName ?? "—"}</td>
                <td>{s.itemCount}</td>
                <td>{PAYMENT_LABEL[s.paymentMethod]}</td>
                <td>{formatBRL(s.totalCents)}</td>
                <td>{SALE_STATUS_LABEL[s.status]}</td>
                <td>
                  <Link href={`/pdv/vendas/${s.id}`}>Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
