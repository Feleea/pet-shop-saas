import { SignJWT, jwtVerify } from "jose";

export type Role = "ADMIN" | "ATTENDANT" | "GROOMER" | "VET";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: Role;
}

export const SESSION_COOKIE = "petshop_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Retorna a sessão ou null se o token for inválido, adulterado ou expirado. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { userId, tenantId, role } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof tenantId !== "string" || typeof role !== "string") {
      return null;
    }
    return { userId, tenantId, role: role as Role };
  } catch {
    return null;
  }
}
