import Link from "next/link";
import { prismaCustomerRepo } from "@/lib/customer-repo";
import { listCustomers } from "@/lib/customer-service";
import { can } from "@/lib/permissions";
import { formatPhone } from "@/lib/format";
import { requireSession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const { q } = await searchParams;
  const customers = await listCustomers(prismaCustomerRepo, session, q);

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Clientes</h1>

      <form method="get" style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
        <label>
          Buscar cliente <input name="q" defaultValue={q ?? ""} />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {can(session.role, "write") && (
        <p>
          <Link href="/clientes/novo">Novo cliente</Link>
        </p>
      )}

      {customers.length === 0 ? (
        <p>Nenhum cliente encontrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nome</th>
              <th align="left">Telefone</th>
              <th align="left">Pets</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/clientes/${c.id}`}>{c.name}</Link>
                </td>
                <td>{c.phone ? formatPhone(c.phone) : "—"}</td>
                <td data-testid="pet-count">{c.petCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
