import Link from "next/link";
import { prismaCatalogRepo } from "@/lib/catalog-repo";
import { listServices } from "@/lib/catalog-service";
import { formatBRL, formatDuration } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { toggleServiceActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  const session = await requireSession();
  const canManage = can(session.role, "catalog");
  const services = await listServices(prismaCatalogRepo, session, { includeInactive: canManage });

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Serviços</h1>

      {canManage && (
        <p>
          <Link className="button-link" href="/servicos/novo">Novo serviço</Link>
        </p>
      )}

      {services.length === 0 ? (
        <p>Nenhum serviço cadastrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Serviço</th>
              <th align="left">Duração</th>
              <th align="left">Preço</th>
              {canManage && <th align="left">Situação</th>}
              {canManage && <th align="left">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                <td>
                  <strong>{s.name}</strong>
                  {s.description && <div style={{ fontSize: "0.85rem" }}>{s.description}</div>}
                </td>
                <td>{formatDuration(s.durationMinutes)}</td>
                <td>{formatBRL(s.priceCents)}</td>
                {canManage && <td>{s.active ? "Ativo" : "Inativo"}</td>}
                {canManage && (
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <Link className="button-link" href={`/servicos/${s.id}/editar`}>Editar</Link>
                    <form action={toggleServiceActiveAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={String(!s.active)} />
                      <button type="submit">{s.active ? "Desativar" : "Reativar"}</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
