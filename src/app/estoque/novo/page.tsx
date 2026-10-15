import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default async function NovoProdutoPage() {
  const session = await requireSession();
  if (!can(session.role, "catalog")) redirect("/estoque");

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/estoque">← Estoque</Link>
      </p>
      <h1>Novo produto</h1>
      <ProductForm action={createProductAction} submitLabel="Criar produto" withInitialStock />
    </main>
  );
}
