import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { createServiceAction } from "../actions";
import { ServiceForm } from "../service-form";

export default async function NovoServicoPage() {
  const session = await requireSession();
  if (!can(session.role, "catalog")) redirect("/servicos");

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/servicos">← Serviços</Link>
      </p>
      <h1>Novo serviço</h1>
      <ServiceForm action={createServiceAction} submitLabel="Criar serviço" />
    </main>
  );
}
