import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession, type SessionPayload } from "./session";
import { activeSessionOrNull } from "./session-guard";
import { withTenant } from "./tenant";

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Sessão válida E usuário ainda ativo. Faz uma consulta por requisição para que desativar um usuário
 * derrube o acesso dele na hora (o middleware só confere a assinatura do token, pois roda sem banco).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const payload = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return activeSessionOrNull(payload, (tenantId, userId) =>
    db.user.findFirst({ where: withTenant({ tenantId }, { id: userId }), select: { status: true, role: true } }),
  );
}

/** Para páginas e actions que exigem login: sem sessão válida, vai para /login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
