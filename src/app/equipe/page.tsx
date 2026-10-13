import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session-cookie";
import { ROLE_LABEL, formatDateBR } from "@/lib/team-format";
import { prismaTeamRepo } from "@/lib/team-repo";
import { listTeam } from "@/lib/team-service";
import { ConfirmSubmit } from "../confirm-submit";
import { revokeInviteAction } from "./actions";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const session = await requireSession();
  if (!can(session.role, "users")) redirect("/painel");
  const { users, invites } = await listTeam(prismaTeamRepo, session);

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/painel">← Painel</Link>
      </p>
      <h1>Equipe</h1>

      <h2>Usuários</h2>
      <table data-testid="team-users" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Nome</th>
            <th align="left">E-mail</th>
            <th align="left">Papel</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{ROLE_LABEL[u.role]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Convites pendentes</h2>
      <div data-testid="pending-invites">
        {invites.length === 0 ? (
          <p>Nenhum convite pendente.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Nome</th>
                <th align="left">E-mail</th>
                <th align="left">Papel</th>
                <th align="left">Expira em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.email}</td>
                  <td>{ROLE_LABEL[i.role]}</td>
                  <td>{formatDateBR(i.expiresAt)}</td>
                  <td>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <ConfirmSubmit message={`Revogar o convite de ${i.name}?`}>Revogar convite</ConfirmSubmit>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Convidar usuário</h2>
      <InviteForm />
    </main>
  );
}
