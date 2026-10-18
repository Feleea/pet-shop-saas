import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSession } from "@/lib/session-cookie";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tenant, user] = await Promise.all([
    db.tenant.findUnique({ where: { id: session.tenantId } }),
    db.user.findFirst({ where: { id: session.userId, tenantId: session.tenantId } }),
  ]);
  if (!tenant || !user) redirect("/login");

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1rem" }}>
      <h1 data-testid="tenant-name">{tenant.name}</h1>
      <p>
        Olá, <strong data-testid="user-name">{user.name}</strong> ({user.role}) · código do pet shop:{" "}
        <code data-testid="tenant-slug">{tenant.slug}</code>
      </p>
      <nav style={{ margin: "1rem 0", display: "flex", gap: "1rem" }}>
        <Link href="/clientes">Clientes e pets</Link>
        <Link href="/servicos">Serviços</Link>
        <Link href="/agenda">Agenda</Link>
        {can(session.role, "sell") && <Link href="/pdv">PDV</Link>}
        <Link href="/estoque">Estoque</Link>
        {can(session.role, "settings") && <Link href="/configuracoes">Configurações</Link>}
        {can(session.role, "users") && <Link href="/equipe">Equipe</Link>}
      </nav>
      <form action={logoutAction}>
        <button type="submit">Sair</button>
      </form>
    </main>
  );
}
