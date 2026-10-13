import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export default async function NovoClientePage() {
  const session = await requireSession();
  if (!can(session.role, "write")) redirect("/clientes");

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/clientes">← Clientes</Link>
      </p>
      <h1>Novo cliente</h1>
      <CustomerForm action={createCustomerAction} submitLabel="Criar cliente" />
    </main>
  );
}
