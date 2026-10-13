import { hashPassword, verifyPassword } from "./password";
import type { SessionPayload } from "./session";
import { slugify } from "./slug";
import { loginSchema, registerSchema } from "./validation";

export interface UserRecord {
  id: string;
  tenantId: string;
  name: string;
  role: SessionPayload["role"];
  passwordHash: string;
}

export interface AuthRepo {
  slugExists(slug: string): Promise<boolean>;
  createTenantWithAdmin(data: {
    tenantName: string;
    slug: string;
    adminName: string;
    email: string;
    passwordHash: string;
  }): Promise<{ tenantId: string; userId: string }>;
  findUserByTenantSlugAndEmail(slug: string, email: string): Promise<UserRecord | null>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "VALIDATION" | "INVALID_CREDENTIALS",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Hash real usado para gastar o mesmo tempo quando o usuário não existe (evita enumeração por tempo de resposta).
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("senha-descartavel-para-igualar-tempo");
  return dummyHash;
}

async function uniqueSlug(repo: AuthRepo, name: string): Promise<string> {
  const base = slugify(name);
  if (!(await repo.slugExists(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await repo.slugExists(candidate))) return candidate;
  }
  throw new AuthError("Não foi possível gerar um código único para o pet shop", "VALIDATION");
}

export async function registerTenant(repo: AuthRepo, raw: unknown): Promise<SessionPayload & { slug: string }> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message, "VALIDATION");
  const { shopName, adminName, email, password } = parsed.data;

  const slug = await uniqueSlug(repo, shopName);
  const passwordHash = await hashPassword(password);
  const { tenantId, userId } = await repo.createTenantWithAdmin({
    tenantName: shopName,
    slug,
    adminName,
    email,
    passwordHash,
  });
  return { userId, tenantId, role: "ADMIN", slug };
}

export async function authenticate(repo: AuthRepo, raw: unknown): Promise<SessionPayload> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message, "VALIDATION");
  const { slug, email, password } = parsed.data;

  const user = await repo.findUserByTenantSlugAndEmail(slug, email);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new AuthError("Credenciais inválidas", "INVALID_CREDENTIALS");

  return { userId: user.id, tenantId: user.tenantId, role: user.role };
}
