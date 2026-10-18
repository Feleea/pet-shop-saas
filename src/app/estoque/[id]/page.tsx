import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTimeBR } from "@/lib/datetime-format";
import { NotFoundError } from "@/lib/errors";
import { prismaInventoryRepo } from "@/lib/inventory-repo";
import { MOVEMENT_LABEL, getProduct, listMovements, stockLevel } from "@/lib/inventory-service";
import { centsToInput, formatBRL } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import {
  registerAdjustmentAction,
  registerEntryAction,
  toggleProductActiveAction,
  updateProductAction,
} from "../actions";
import { ProductForm } from "../product-form";
import { AdjustmentForm, EntryForm } from "../stock-forms";

export const dynamic = "force-dynamic";

const LEVEL_TEXT = { OUT: "Sem estoque", LOW: "Estoque baixo", OK: "Normal" } as const;

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const orNotFound = (e: unknown): never => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  };
  const product = await getProduct(prismaInventoryRepo, session, id).catch(orNotFound);
  const movements = await listMovements(prismaInventoryRepo, session, id).catch(orNotFound);
  const canManage = can(session.role, "catalog");
  const canStock = can(session.role, "stock");

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/estoque">← Estoque</Link>
      </p>
      <h1>{product.name}</h1>
      <p>
        {formatBRL(product.priceCents)} · estoque atual: <strong data-testid="product-stock">{product.stockQuantity}</strong> · mínimo:{" "}
        {product.minStock} ·{" "}
        <span data-testid="stock-level">{product.active ? LEVEL_TEXT[stockLevel(product)] : "Inativo"}</span>
      </p>

      {canStock && (
        <>
          <h2>Entrada de estoque</h2>
          <EntryForm action={registerEntryAction.bind(null, product.id)} />
        </>
      )}

      {canManage && (
        <>
          <h2>Ajuste de estoque</h2>
          <AdjustmentForm action={registerAdjustmentAction.bind(null, product.id)} />

          <h2>Dados do produto</h2>
          <ProductForm
            action={updateProductAction.bind(null, product.id)}
            submitLabel="Salvar produto"
            defaults={{
              name: product.name,
              price: centsToInput(product.priceCents),
              minStock: String(product.minStock),
              ncm: product.ncm ?? "",
              cfop: product.cfop ?? "",
              csosn: product.csosn ?? "",
              unit: product.unit ?? "UN",
            }}
          />
          <form action={toggleProductActiveAction} style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="active" value={String(!product.active)} />
            <button type="submit">{product.active ? "Desativar produto" : "Reativar produto"}</button>
          </form>
        </>
      )}

      <h2>Histórico de movimentações</h2>
      {movements.length === 0 ? (
        <p>Nenhuma movimentação.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Data</th>
              <th align="left">Tipo</th>
              <th align="left">Quantidade</th>
              <th align="left">Observação</th>
              <th align="left">Usuário</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} data-testid="movement-row">
                <td>{formatDateTimeBR(m.createdAt)}</td>
                <td>{MOVEMENT_LABEL[m.type]}</td>
                <td>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                <td>{m.note ?? "—"}</td>
                <td>{m.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
