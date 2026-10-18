import Link from "next/link";
import { prismaInventoryRepo } from "@/lib/inventory-repo";
import { isLowStock, listProducts, stockLevel } from "@/lib/inventory-service";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

const LEVEL_TEXT = { OUT: "Sem estoque", LOW: "Estoque baixo", OK: "Normal" } as const;

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ q?: string; baixo?: string }> }) {
  const session = await requireSession();
  const { q, baixo } = await searchParams;
  const canManage = can(session.role, "catalog");
  const lowOnly = baixo === "1";

  const [products, everyone] = await Promise.all([
    listProducts(prismaInventoryRepo, session, { includeInactive: canManage, search: q, lowOnly }),
    listProducts(prismaInventoryRepo, session),
  ]);
  const lowCount = everyone.filter(isLowStock).length;

  return (
    <main style={{ maxWidth: 980, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Estoque</h1>

      {lowCount > 0 && (
        <p data-testid="low-stock-alert" style={{ color: "#b45309" }}>
          {lowCount} {lowCount === 1 ? "produto com estoque baixo ou zerado" : "produtos com estoque baixo ou zerado"}
        </p>
      )}

      <form method="get" style={{ display: "flex", gap: "0.75rem", alignItems: "end", margin: "1rem 0" }}>
        <label>
          Buscar produto <input name="q" defaultValue={q ?? ""} />
        </label>
        <label>
          <input type="checkbox" name="baixo" value="1" defaultChecked={lowOnly} /> Somente estoque baixo
        </label>
        <button type="submit">Filtrar</button>
      </form>

      {canManage && (
        <p>
          <Link href="/estoque/novo">Novo produto</Link>
        </p>
      )}

      {products.length === 0 ? (
        <p>Nenhum produto encontrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Produto</th>
              <th align="left">Preço</th>
              <th align="left">Estoque</th>
              <th align="left">Mínimo</th>
              <th align="left">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} data-testid="product-row" style={{ opacity: p.active ? 1 : 0.55 }}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>{formatBRL(p.priceCents)}</td>
                <td data-testid="product-stock">{p.stockQuantity}</td>
                <td>{p.minStock}</td>
                <td data-testid="stock-level">{p.active ? LEVEL_TEXT[stockLevel(p)] : "Inativo"}</td>
                <td>
                  <Link href={`/estoque/${p.id}`}>Detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
