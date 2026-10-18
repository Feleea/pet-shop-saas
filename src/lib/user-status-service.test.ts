import { describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "./errors";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";
import { VACATION_DAYS_MESSAGE, type UserStatus } from "./user-status";
import { ADMIN_MESSAGE, SELF_MESSAGE, changeUserStatus, type ManagedUser, type UserStatusRepo } from "./user-status-service";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// Repositório em memória: respeita o tenantId e nunca altera ADMIN, como o Prisma repo.
function memoryRepo(initial: Partial<ManagedUser>[] = []) {
  const users: ManagedUser[] = initial.map((u, i) => ({
    id: `u${i + 1}`,
    tenantId: "A",
    name: `Usuário ${i + 1}`,
    email: `u${i + 1}@mail.com`,
    role: "ATTENDANT",
    status: "ACTIVE",
    vacationReturnsAt: null,
    statusChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...u,
  }));
  const repo: UserStatusRepo = {
    async findUser(tenantId, id) {
      return users.find((u) => u.id === id && u.tenantId === tenantId) ?? null;
    },
    async setUserStatus(tenantId, id, { status, vacationReturnsAt, now }) {
      const u = users.find((x) => x.id === id && x.tenantId === tenantId && x.role !== "ADMIN");
      if (!u) return null;
      Object.assign(u, { status, vacationReturnsAt, statusChangedAt: now });
      return u;
    },
  };
  return { repo, users };
}

const as = (role: Role, tenantId = "A", userId = "admin-1"): SessionPayload => ({ userId, tenantId, role });
const admin = as("ADMIN");
// u1 = atendente, u2 = tosador, u3 = outro administrador, u4 = atendente de outro pet shop
const setup = () =>
  memoryRepo([{}, { role: "GROOMER" }, { role: "ADMIN" }, { tenantId: "B" }]);

describe("desativar e ativar", () => {
  it("desativa: situação INACTIVE, sem data de retorno", async () => {
    const { repo } = setup();
    const u = await changeUserStatus(repo, admin, "u1", { status: "INACTIVE" }, NOW);
    expect(u).toMatchObject({ status: "INACTIVE", vacationReturnsAt: null });
    expect(u.statusChangedAt).toEqual(NOW);
  });

  it("reativa um usuário desativado", async () => {
    const { repo } = setup();
    await changeUserStatus(repo, admin, "u1", { status: "INACTIVE" }, NOW);
    expect((await changeUserStatus(repo, admin, "u1", { status: "ACTIVE" }, NOW)).status).toBe("ACTIVE");
  });

  it("desativar quem já está desativado é idempotente", async () => {
    const { repo } = setup();
    await changeUserStatus(repo, admin, "u1", { status: "INACTIVE" }, NOW);
    await expect(changeUserStatus(repo, admin, "u1", { status: "INACTIVE" }, NOW)).resolves.toMatchObject({ status: "INACTIVE" });
  });

  it("ignora os dias de férias quando a situação não é férias (mesmo lixo no campo)", async () => {
    const { repo } = setup();
    const u = await changeUserStatus(repo, admin, "u1", { status: "INACTIVE", vacationDays: "abc" }, NOW);
    expect(u).toMatchObject({ status: "INACTIVE", vacationReturnsAt: null });
  });

  it.each(["", "DELETED", "active", null, undefined])("rejeita situação inválida (%j)", async (status) => {
    const { repo } = setup();
    await expect(changeUserStatus(repo, admin, "u1", { status }, NOW)).rejects.toThrow(new ValidationError("Situação inválida"));
  });
});

describe("férias", () => {
  it("grava a data prevista de retorno: agora + n dias", async () => {
    const { repo } = setup();
    const u = await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "10" }, NOW);
    expect(u.status).toBe("VACATION");
    expect(u.vacationReturnsAt).toEqual(new Date(NOW.getTime() + 10 * DAY));
  });

  it("aceita os limites: 1 e 365 dias", async () => {
    const { repo } = setup();
    expect((await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "1" }, NOW)).vacationReturnsAt).toEqual(
      new Date(NOW.getTime() + DAY),
    );
    expect((await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: 365 }, NOW)).vacationReturnsAt).toEqual(
      new Date(NOW.getTime() + 365 * DAY),
    );
  });

  it.each(["", "0", "366", "-1", "7.5", "abc", null, undefined])("exige dias válidos (%j) e não altera o usuário", async (vacationDays) => {
    const { repo, users } = setup();
    await expect(changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays }, NOW)).rejects.toThrow(
      new ValidationError(VACATION_DAYS_MESSAGE),
    );
    expect(users[0].status).toBe("ACTIVE");
  });

  it("atualizar as férias (estender) troca a data de retorno", async () => {
    const { repo } = setup();
    await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "10" }, NOW);
    const later = new Date(NOW.getTime() + 3 * DAY);
    const u = await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "20" }, later);
    expect(u.vacationReturnsAt).toEqual(new Date(later.getTime() + 20 * DAY));
  });

  it("reativar limpa a data de retorno", async () => {
    const { repo } = setup();
    await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "10" }, NOW);
    expect(await changeUserStatus(repo, admin, "u1", { status: "ACTIVE" }, NOW)).toMatchObject({ status: "ACTIVE", vacationReturnsAt: null });
  });

  it("desativar quem está de férias também limpa a data de retorno", async () => {
    const { repo } = setup();
    await changeUserStatus(repo, admin, "u1", { status: "VACATION", vacationDays: "10" }, NOW);
    expect(await changeUserStatus(repo, admin, "u1", { status: "INACTIVE" }, NOW)).toMatchObject({ status: "INACTIVE", vacationReturnsAt: null });
  });

  it.each<[UserStatus, string]>([
    ["INACTIVE", "u1"],
    ["VACATION", "u2"],
  ])("a situação %s vale para qualquer papel não administrativo (%s)", async (status, id) => {
    const { repo } = setup();
    const u = await changeUserStatus(repo, admin, id, { status, vacationDays: "5" }, NOW);
    expect(u.status).toBe(status);
  });
});

describe("travas de segurança", () => {
  it("não permite alterar a própria situação", async () => {
    const { repo } = memoryRepo([{ id: "admin-1", role: "ADMIN" }]);
    await expect(changeUserStatus(repo, admin, "admin-1", { status: "INACTIVE" }, NOW)).rejects.toThrow(new ValidationError(SELF_MESSAGE));
  });

  it("não permite desativar um administrador", async () => {
    const { repo, users } = setup();
    await expect(changeUserStatus(repo, admin, "u3", { status: "INACTIVE" }, NOW)).rejects.toThrow(new ValidationError(ADMIN_MESSAGE));
    await expect(changeUserStatus(repo, admin, "u3", { status: "VACATION", vacationDays: "5" }, NOW)).rejects.toThrow(ADMIN_MESSAGE);
    expect(users[2].status).toBe("ACTIVE");
  });

  it("usuário inexistente dá NotFound", async () => {
    const { repo } = setup();
    await expect(changeUserStatus(repo, admin, "nao-existe", { status: "INACTIVE" }, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  it("o ADMIN de um pet shop não altera usuário de outro (404, sem revelar que existe)", async () => {
    const { repo, users } = setup();
    await expect(changeUserStatus(repo, as("ADMIN", "A"), "u4", { status: "INACTIVE" }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(users[3].status).toBe("ACTIVE");
  });

  it("o mesmo vale para o ADMIN do outro lado", async () => {
    const { repo, users } = setup();
    await expect(changeUserStatus(repo, as("ADMIN", "B", "admin-b"), "u1", { status: "INACTIVE" }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(users[0].status).toBe("ACTIVE");
  });
});

describe("permissões", () => {
  it.each(["ATTENDANT", "GROOMER", "VET"] as const)("%s não altera a situação de ninguém", async (role) => {
    const { repo, users } = setup();
    await expect(changeUserStatus(repo, as(role, "A", "x"), "u1", { status: "INACTIVE" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(users[0].status).toBe("ACTIVE");
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as UserStatusRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(changeUserStatus(spy, as("ATTENDANT"), "u1", { status: "INACTIVE" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
