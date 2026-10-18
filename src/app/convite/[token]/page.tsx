import Link from "next/link";
import { InvalidInviteError } from "@/lib/errors";
import { ROLE_LABEL } from "@/lib/team-format";
import { prismaTeamRepo } from "@/lib/team-repo";
import { getInviteForToken } from "@/lib/team-service";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteForToken(prismaTeamRepo, token).catch((e) => {
    if (e instanceof InvalidInviteError) return null;
    throw e;
  });

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      {invite ? (
        <>
          <h1>Você foi convidado</h1>
          <p>
            <strong>{invite.tenantName}</strong> convidou <strong>{invite.name}</strong> ({invite.email}) para a equipe como{" "}
            <strong>{ROLE_LABEL[invite.role]}</strong>. Escolha uma senha para criar o seu acesso.
          </p>
          <AcceptForm token={token} />
        </>
      ) : (
        <>
          <h1>Convite inválido ou expirado</h1>
          <p>Peça um novo convite a quem administra o pet shop.</p>
          <p>
            <Link href="/login">Ir para o login</Link>
          </p>
        </>
      )}
    </main>
  );
}
