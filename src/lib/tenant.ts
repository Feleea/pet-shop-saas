import type { SessionPayload } from "./session";

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado a recurso de outro pet shop") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Garante que um recurso carregado pertence ao tenant da sessão. */
export function assertSameTenant(session: Pick<SessionPayload, "tenantId">, resource: { tenantId: string }): void {
  if (resource.tenantId !== session.tenantId) throw new ForbiddenError();
}

/**
 * Monta o `where` de qualquer consulta de negócio forçando o tenantId da sessão.
 * O tenantId vem por último de propósito: um valor vindo da entrada do usuário nunca o sobrescreve.
 */
export function withTenant<T extends object>(session: Pick<SessionPayload, "tenantId">, where?: T): T & { tenantId: string } {
  return { ...(where ?? ({} as T)), tenantId: session.tenantId };
}
