import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, DISABLED_MESSAGE, authenticate, registerTenant, type AuthRepo, type UserRecord } from "./auth-service";

// Repositório em memória: reproduz a regra "e-mail único por tenant" do banco.
function memoryRepo(): AuthRepo & { users: (UserRecord & { email: string; slug: string })[] } {
  const tenants: { id: string; slug: string }[] = [];
  const users: (UserRecord & { email: string; slug: string })[] = [];
  return {
    users,
    async slugExists(slug) {
      return tenants.some((t) => t.slug === slug);
    },
    async createTenantWithAdmin({ slug, adminName, email, passwordHash }) {
      const tenantId = `t${tenants.length + 1}`;
      const userId = `u${users.length + 1}`;
      tenants.push({ id: tenantId, slug });
      users.push({ id: userId, tenantId, name: adminName, role: "ADMIN", status: "ACTIVE", passwordHash, email, slug });
      return { tenantId, userId };
    },
    async findUserByTenantSlugAndEmail(slug, email) {
      return users.find((u) => u.slug === slug && u.email === email) ?? null;
    },
  };
}

const input = { shopName: "Au Au Pet", adminName: "Ana", email: "ana@mail.com", password: "senha-forte-1" };

beforeAll(() => {
  process.env.BCRYPT_COST = "4"; // acelera os testes
});

describe("registerTenant", () => {
  it("cria o tenant com um admin e gera o slug a partir do nome", async () => {
    const repo = memoryRepo();
    const r = await registerTenant(repo, input);
    expect(r.role).toBe("ADMIN");
    expect(r.slug).toBe("au-au-pet");
  });

  it("não guarda a senha em texto puro", async () => {
    const repo = memoryRepo();
    await registerTenant(repo, input);
    expect(repo.users[0].passwordHash).not.toContain("senha-forte-1");
    expect(repo.users[0].passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("gera slug diferente quando o nome já existe", async () => {
    const repo = memoryRepo();
    await registerTenant(repo, input);
    const second = await registerTenant(repo, { ...input, email: "outra@mail.com" });
    expect(second.slug).not.toBe("au-au-pet");
    expect(second.slug.startsWith("au-au-pet-")).toBe(true);
  });

  it("rejeita dados inválidos com AuthError de validação", async () => {
    const repo = memoryRepo();
    await expect(registerTenant(repo, { ...input, password: "123" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("authenticate", () => {
  it("autentica com slug, e-mail e senha corretos", async () => {
    const repo = memoryRepo();
    const reg = await registerTenant(repo, input);
    const session = await authenticate(repo, { slug: reg.slug, email: "ANA@mail.com", password: input.password });
    expect(session).toEqual({ userId: reg.userId, tenantId: reg.tenantId, role: "ADMIN" });
  });

  it("recusa senha errada", async () => {
    const repo = memoryRepo();
    const reg = await registerTenant(repo, input);
    await expect(authenticate(repo, { slug: reg.slug, email: input.email, password: "errada-123" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("usa a mesma mensagem para usuário inexistente e senha errada", async () => {
    const repo = memoryRepo();
    const reg = await registerTenant(repo, input);
    const wrongPass = await authenticate(repo, { slug: reg.slug, email: input.email, password: "errada-123" }).catch((e: AuthError) => e);
    const noUser = await authenticate(repo, { slug: reg.slug, email: "nao@existe.com", password: "qualquer" }).catch((e: AuthError) => e);
    expect((wrongPass as AuthError).message).toBe((noUser as AuthError).message);
  });

  it("ISOLAMENTO: mesmo e-mail em dois pet shops não permite entrar no outro", async () => {
    const repo = memoryRepo();
    const a = await registerTenant(repo, { ...input, shopName: "Pet A", password: "senha-da-loja-A" });
    const b = await registerTenant(repo, { ...input, shopName: "Pet B", password: "senha-da-loja-B" });

    const sa = await authenticate(repo, { slug: a.slug, email: input.email, password: "senha-da-loja-A" });
    const sb = await authenticate(repo, { slug: b.slug, email: input.email, password: "senha-da-loja-B" });
    expect(sa.tenantId).toBe(a.tenantId);
    expect(sb.tenantId).toBe(b.tenantId);
    expect(sa.tenantId).not.toBe(sb.tenantId);

    // senha da loja A não abre a loja B
    await expect(authenticate(repo, { slug: b.slug, email: input.email, password: "senha-da-loja-A" })).rejects.toBeInstanceOf(AuthError);
  });
});

describe("authenticate: situação do usuário", () => {
  async function setup(status: "INACTIVE" | "VACATION") {
    const repo = memoryRepo();
    const reg = await registerTenant(repo, input);
    repo.users[0].status = status;
    return { repo, slug: reg.slug };
  }

  it("usuário desativado com a senha certa recebe a mensagem de acesso desativado", async () => {
    const { repo, slug } = await setup("INACTIVE");
    const err = await authenticate(repo, { slug, email: input.email, password: input.password }).catch((e: AuthError) => e);
    expect(err).toMatchObject({ code: "ACCOUNT_DISABLED", message: DISABLED_MESSAGE.INACTIVE });
  });

  it("usuário de férias com a senha certa recebe a mensagem de férias", async () => {
    const { repo, slug } = await setup("VACATION");
    const err = await authenticate(repo, { slug, email: input.email, password: input.password }).catch((e: AuthError) => e);
    expect(err).toMatchObject({ code: "ACCOUNT_DISABLED", message: DISABLED_MESSAGE.VACATION });
  });

  it("senha errada NÃO revela que a conta está desativada", async () => {
    const { repo, slug } = await setup("INACTIVE");
    const err = await authenticate(repo, { slug, email: input.email, password: "errada-123" }).catch((e: AuthError) => e);
    expect(err).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Credenciais inválidas" });
  });

  it("depois de reativado, o usuário entra normalmente", async () => {
    const { repo, slug } = await setup("INACTIVE");
    repo.users[0].status = "ACTIVE";
    await expect(authenticate(repo, { slug, email: input.email, password: input.password })).resolves.toMatchObject({ role: "ADMIN" });
  });
});
