import { beforeAll, describe, expect, it } from "vitest";
import { ConflictError, InvalidInviteError, NotFoundError, ValidationError } from "./errors";
import { generateInviteToken } from "./invite-token";
import type { Role, SessionPayload } from "./session";
import {
  INVITE_PENDING_MESSAGE,
  INVITE_TTL_DAYS,
  USER_EXISTS_MESSAGE,
  acceptInvite,
  getInviteForToken,
  inviteUser,
  listTeam,
  revokeInvite,
  type InviteRecord,
  type TeamRepo,
  type TeamUser,
} from "./team-service";
import { ForbiddenError } from "./tenant";

interface StoredInvite extends InviteRecord {
  tokenHash: string;
  acceptedAt: Date | null;
}

// Repositório em memória: as operações por tenant respeitam o tenantId, como o Prisma repo.
function memoryRepo() {
  let seq = 0;
  const tenants = new Map<string, string>([
    ["A", "Loja A"],
    ["B", "Loja B"],
  ]);
  const users: (TeamUser & { tenantId: string; passwordHash: string })[] = [];
  const invites: StoredInvite[] = [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const pending = (i: StoredInvite, now: Date) => !i.acceptedAt && i.expiresAt.getTime() > now.getTime();
  const strip = ({ tokenHash: _t, acceptedAt: _a, ...rest }: StoredInvite): InviteRecord => rest;

  const repo: TeamRepo = {
    async listUsers(tenantId) {
      return users.filter((u) => u.tenantId === tenantId).map(({ tenantId: _t, passwordHash: _p, ...u }) => u);
    },
    async userEmailExists(tenantId, email) {
      return users.some((u) => u.tenantId === tenantId && same(u.email, email));
    },
    async listPendingInvites(tenantId, now) {
      return invites.filter((i) => i.tenantId === tenantId && pending(i, now)).map(strip);
    },
    async pendingInviteExists(tenantId, email, now) {
      return invites.some((i) => i.tenantId === tenantId && same(i.email, email) && pending(i, now));
    },
    async createInvite(tenantId, data) {
      const i: StoredInvite = { id: `i${++seq}`, tenantId, createdAt: new Date(), acceptedAt: null, ...data };
      invites.push(i);
      return strip(i);
    },
    async revokeInvite(tenantId, id) {
      const idx = invites.findIndex((i) => i.id === id && i.tenantId === tenantId && !i.acceptedAt);
      if (idx < 0) return false;
      invites.splice(idx, 1);
      return true;
    },
    async findInviteByTokenHash(tokenHash) {
      const i = invites.find((x) => x.tokenHash === tokenHash);
      return i ? { ...strip(i), acceptedAt: i.acceptedAt, tenantName: tenants.get(i.tenantId)! } : null;
    },
    async acceptInvite({ inviteId, tenantId, passwordHash, now }) {
      const i = invites.find((x) => x.id === inviteId && x.tenantId === tenantId);
      if (!i || !pending(i, now)) return null;
      if (users.some((u) => u.tenantId === tenantId && same(u.email, i.email))) throw new ConflictError(USER_EXISTS_MESSAGE);
      i.acceptedAt = now;
      const u = { id: `u${++seq}`, tenantId, name: i.name, email: i.email, role: i.role, status: "ACTIVE" as const, vacationReturnsAt: null, createdAt: now, passwordHash };
      users.push(u);
      return { userId: u.id };
    },
  };
  const addUser = (tenantId: string, email: string, role: Role = "ADMIN") =>
    users.push({ id: `u${++seq}`, tenantId, name: "Admin", email, role, status: "ACTIVE", vacationReturnsAt: null, createdAt: new Date(), passwordHash: "x" });
  return { repo, users, invites, addUser };
}

const as = (role: Role, tenantId: string): SessionPayload => ({ userId: `${role}-${tenantId}`, tenantId, role });
const admin = (t: string) => as("ADMIN", t);
const carla = { name: "Carla", email: "carla@mail.com", role: "ATTENDANT" };
const NOW = new Date("2026-10-13T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  process.env.BCRYPT_COST = "4";
});

describe("convidar", () => {
  it("cria o convite no tenant da sessão, expira em 7 dias e devolve o token", async () => {
    const { repo } = memoryRepo();
    const { invite, token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    expect(invite).toMatchObject({ tenantId: "A", name: "Carla", email: "carla@mail.com", role: "ATTENDANT" });
    expect(invite.expiresAt.getTime()).toBe(NOW.getTime() + INVITE_TTL_DAYS * DAY);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("guarda apenas o hash: o token em texto puro não fica no banco", async () => {
    const { repo, invites } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    expect(JSON.stringify(invites)).not.toContain(token);
    expect(invites[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recusa e-mail que já é usuário do pet shop (sem diferenciar maiúsculas)", async () => {
    const { repo, addUser } = memoryRepo();
    addUser("A", "Carla@Mail.com");
    const err = await inviteUser(repo, admin("A"), carla, { now: NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(USER_EXISTS_MESSAGE);
  });

  it("recusa segundo convite pendente para o mesmo e-mail", async () => {
    const { repo } = memoryRepo();
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    const err = await inviteUser(repo, admin("A"), { ...carla, email: "CARLA@mail.com" }, { now: NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(INVITE_PENDING_MESSAGE);
  });

  it("convite expirado não bloqueia um novo convite", async () => {
    const { repo } = memoryRepo();
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    const later = new Date(NOW.getTime() + 8 * DAY);
    await expect(inviteUser(repo, admin("A"), carla, { now: later })).resolves.toBeTruthy();
  });

  it("depois de revogar, dá para convidar de novo", async () => {
    const { repo } = memoryRepo();
    const { invite } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await revokeInvite(repo, admin("A"), invite.id);
    await expect(inviteUser(repo, admin("A"), carla, { now: NOW })).resolves.toBeTruthy();
  });

  it("não permite convidar um ADMIN", async () => {
    const { repo, invites } = memoryRepo();
    await expect(inviteUser(repo, admin("A"), { ...carla, role: "ADMIN" })).rejects.toThrow(new ValidationError("Papel inválido"));
    expect(invites).toHaveLength(0);
  });

  it("rejeita dados inválidos sem criar nada", async () => {
    const { repo, invites } = memoryRepo();
    await expect(inviteUser(repo, admin("A"), { ...carla, email: "x" })).rejects.toBeInstanceOf(ValidationError);
    expect(invites).toHaveLength(0);
  });

  it("aceita um gerador de token injetado (testabilidade)", async () => {
    const { repo } = memoryRepo();
    const fixed = () => ({ token: "t".repeat(43), tokenHash: "h".repeat(64) });
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW, generateToken: fixed });
    expect(token).toBe("t".repeat(43));
  });
});

describe("listar e revogar", () => {
  it("lista usuários e só os convites pendentes do tenant", async () => {
    const { repo, addUser } = memoryRepo();
    addUser("A", "dono@a.com");
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    await inviteUser(repo, admin("A"), { ...carla, email: "velho@mail.com" }, { now: new Date(NOW.getTime() - 10 * DAY) });
    const team = await listTeam(repo, admin("A"), NOW);
    expect(team.users).toHaveLength(1);
    expect(team.invites.map((i) => i.email)).toEqual(["carla@mail.com"]); // o expirado não aparece
  });

  it("revogar um convite inexistente dá NotFound", async () => {
    const { repo } = memoryRepo();
    await expect(revokeInvite(repo, admin("A"), "nao-existe")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("não é possível revogar um convite já aceito", async () => {
    const { repo } = memoryRepo();
    const { invite, token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await acceptInvite(repo, token, { password: "senha-forte-1", confirmPassword: "senha-forte-1" }, NOW);
    await expect(revokeInvite(repo, admin("A"), invite.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("aceitar", () => {
  const pwd = { password: "senha-forte-1", confirmPassword: "senha-forte-1" };

  it("cria o usuário com o papel convidado e devolve a sessão", async () => {
    const { repo, users } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), { ...carla, role: "VET" }, { now: NOW });
    const session = await acceptInvite(repo, token, pwd, NOW);
    expect(session).toMatchObject({ tenantId: "A", role: "VET" });
    expect(users[0]).toMatchObject({ email: "carla@mail.com", name: "Carla", role: "VET", status: "ACTIVE" });
  });

  it("a senha é guardada com hash, nunca em texto puro", async () => {
    const { repo, users } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await acceptInvite(repo, token, pwd, NOW);
    expect(users[0].passwordHash).toMatch(/^\$2[aby]\$/);
    expect(users[0].passwordHash).not.toContain("senha-forte-1");
  });

  it("o link só funciona uma vez", async () => {
    const { repo, users } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await acceptInvite(repo, token, pwd, NOW);
    await expect(acceptInvite(repo, token, pwd, NOW)).rejects.toBeInstanceOf(InvalidInviteError);
    expect(users).toHaveLength(1);
  });

  it("convite expirado é recusado, mesmo com o token certo", async () => {
    const { repo, users } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    const later = new Date(NOW.getTime() + INVITE_TTL_DAYS * DAY); // exatamente no instante de expiração
    await expect(acceptInvite(repo, token, pwd, later)).rejects.toBeInstanceOf(InvalidInviteError);
    expect(users).toHaveLength(0);
  });

  it("convite revogado deixa de funcionar", async () => {
    const { repo } = memoryRepo();
    const { invite, token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await revokeInvite(repo, admin("A"), invite.id);
    await expect(acceptInvite(repo, token, pwd, NOW)).rejects.toBeInstanceOf(InvalidInviteError);
  });

  it.each(["", "token-inexistente", "x".repeat(300)])("token inválido (%#) dá a mesma mensagem genérica", async (bad) => {
    const { repo } = memoryRepo();
    const err = await acceptInvite(repo, bad, pwd, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInviteError);
    expect(err.message).toBe("Convite inválido ou expirado");
  });

  it("valida a senha antes de consumir o convite", async () => {
    const { repo, users } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await expect(acceptInvite(repo, token, { password: "123", confirmPassword: "123" }, NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      acceptInvite(repo, token, { password: "senha-forte-1", confirmPassword: "outra-senha-1" }, NOW),
    ).rejects.toThrow("As senhas não conferem");
    expect(users).toHaveLength(0);
    await expect(acceptInvite(repo, token, pwd, NOW)).resolves.toBeTruthy(); // o convite continua válido
  });

  it("página do convite: mostra só o necessário e nunca o tenantId", async () => {
    const { repo } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    const info = await getInviteForToken(repo, token, NOW);
    expect(info).toEqual({ tenantName: "Loja A", name: "Carla", email: "carla@mail.com", role: "ATTENDANT" });
  });

  it("página do convite recusa convite já usado", async () => {
    const { repo } = memoryRepo();
    const { token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await acceptInvite(repo, token, pwd, NOW);
    await expect(getInviteForToken(repo, token, NOW)).rejects.toBeInstanceOf(InvalidInviteError);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  it("convites e usuários de um tenant não aparecem para o outro", async () => {
    const { repo, addUser } = memoryRepo();
    addUser("A", "dono@a.com");
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    const teamB = await listTeam(repo, admin("B"), NOW);
    expect(teamB.users).toEqual([]);
    expect(teamB.invites).toEqual([]);
  });

  it("o mesmo e-mail pode ser convidado em dois pet shops, sem conflito", async () => {
    const { repo } = memoryRepo();
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    await expect(inviteUser(repo, admin("B"), { ...carla, role: "VET" }, { now: NOW })).resolves.toBeTruthy();
  });

  it("e-mail que é usuário em outro pet shop não bloqueia o convite (nem vaza essa informação)", async () => {
    const { repo, addUser } = memoryRepo();
    addUser("A", "carla@mail.com");
    await expect(inviteUser(repo, admin("B"), carla, { now: NOW })).resolves.toBeTruthy();
  });

  it("outro tenant não consegue revogar o convite", async () => {
    const { repo } = memoryRepo();
    const { invite, token } = await inviteUser(repo, admin("A"), carla, { now: NOW });
    await expect(revokeInvite(repo, admin("B"), invite.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getInviteForToken(repo, token, NOW)).resolves.toBeTruthy(); // continua válido
  });

  it("aceitar o convite do tenant A entra no tenant A, mesmo existindo convite igual no B", async () => {
    const { repo, users } = memoryRepo();
    const a = await inviteUser(repo, admin("A"), carla, { now: NOW });
    const b = await inviteUser(repo, admin("B"), { ...carla, role: "GROOMER" }, { now: NOW });
    const pwd = { password: "senha-forte-1", confirmPassword: "senha-forte-1" };
    const sa = await acceptInvite(repo, a.token, pwd, NOW);
    const sb = await acceptInvite(repo, b.token, pwd, NOW);
    expect(sa).toMatchObject({ tenantId: "A", role: "ATTENDANT" });
    expect(sb).toMatchObject({ tenantId: "B", role: "GROOMER" });
    expect(users).toHaveLength(2);
    expect(sa.userId).not.toBe(sb.userId);
  });

  it("o token de um convite não serve para outro (hashes independentes)", async () => {
    const { repo } = memoryRepo();
    await inviteUser(repo, admin("A"), carla, { now: NOW });
    await expect(getInviteForToken(repo, generateInviteToken().token, NOW)).rejects.toBeInstanceOf(InvalidInviteError);
  });
});

describe("permissões", () => {
  it.each(["ATTENDANT", "GROOMER", "VET"] as const)("%s não convida, não lista a equipe e não revoga", async (role) => {
    const { repo } = memoryRepo();
    const me = as(role, "A");
    await expect(inviteUser(repo, me, carla)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listTeam(repo, me)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(revokeInvite(repo, me, "i1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as TeamRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(inviteUser(spy, as("ATTENDANT", "A"), carla)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
