import { createHash, randomBytes } from "node:crypto";

/** SHA-256 em hex. O token é aleatório de 256 bits, então um hash simples basta (não é senha escolhida por pessoa). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url"); // 43 caracteres, seguro para URL
  return { token, tokenHash: hashToken(token) };
}
