import type { Role, SessionPayload } from "./session";
import type { UserStatus } from "./user-status";

export type UserLookup = (tenantId: string, userId: string) => Promise<{ status: UserStatus; role: Role } | null>;

/**
 * O JWT sozinho não sabe que o usuário foi desativado. Esta checagem consulta a situação ATUAL no banco:
 * - usuário inexistente, INACTIVE ou VACATION → sem sessão;
 * - o papel (role) passa a vir do banco, não do token, então mudanças de papel valem na hora.
 */
export async function activeSessionOrNull(payload: SessionPayload | null, lookup: UserLookup): Promise<SessionPayload | null> {
  if (!payload) return null;
  const user = await lookup(payload.tenantId, payload.userId);
  if (!user || user.status !== "ACTIVE") return null;
  return { ...payload, role: user.role };
}
