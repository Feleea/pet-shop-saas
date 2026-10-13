import { hashPassword } from "./password";
import { ConflictError, InvalidInviteError, NotFoundError, ValidationError } from "./errors";
import { generateInviteToken, hashToken } from "./invite-token";
import { assertCan } from "./permissions";
import type { Role, SessionPayload } from "./session";
import { acceptSchema, inviteSchema, type InvitableRole } from "./team-validation";

export const INVITE_TTL_DAYS = 7;
export const USER_EXISTS_MESSAGE = "Já existe um usuário com este e-mail";
export const INVITE_PENDING_MESSAGE = "Já existe um convite pendente para este e-mail";

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}
export interface InviteRecord {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}
export interface InviteLookup extends InviteRecord {
  tenantName: string;
  acceptedAt: Date | null;
}
export interface NewInvite {
  name: string;
  email: string;
  role: InvitableRole;
  tokenHash: string;
  expiresAt: Date;
}

/** Operações por tenant recebem o tenantId; só a busca pelo token do convite é pública (o token É a credencial). */
export interface TeamRepo {
  listUsers(tenantId: string): Promise<TeamUser[]>;
  userEmailExists(tenantId: string, email: string): Promise<boolean>;
  listPendingInvites(tenantId: string, now: Date): Promise<InviteRecord[]>;
  pendingInviteExists(tenantId: string, email: string, now: Date): Promise<boolean>;
  createInvite(tenantId: string, data: NewInvite): Promise<InviteRecord>;
  revokeInvite(tenantId: string, id: string): Promise<boolean>;
  findInviteByTokenHash(tokenHash: string): Promise<InviteLookup | null>;
  /** Atômico: marca o convite como aceito e cria o usuário. Retorna null se já foi usado/expirou. */
  acceptInvite(args: { inviteId: string; tenantId: string; passwordHash: string; now: Date }): Promise<{ userId: string } | null>;
}

export async function inviteUser(
  repo: TeamRepo,
  session: SessionPayload,
  raw: unknown,
  deps: { now?: Date; generateToken?: () => { token: string; tokenHash: string } } = {},
): Promise<{ invite: InviteRecord; token: string }> {
  assertCan(session, "users");
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const { name, email, role } = parsed.data;

  const now = deps.now ?? new Date();
  if (await repo.userEmailExists(session.tenantId, email)) throw new ConflictError(USER_EXISTS_MESSAGE);
  if (await repo.pendingInviteExists(session.tenantId, email, now)) throw new ConflictError(INVITE_PENDING_MESSAGE);

  const { token, tokenHash } = (deps.generateToken ?? generateInviteToken)();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = await repo.createInvite(session.tenantId, { name, email, role, tokenHash, expiresAt });
  return { invite, token };
}

export async function listTeam(repo: TeamRepo, session: SessionPayload, now: Date = new Date()) {
  assertCan(session, "users");
  const [users, invites] = await Promise.all([repo.listUsers(session.tenantId), repo.listPendingInvites(session.tenantId, now)]);
  return { users, invites };
}

export async function revokeInvite(repo: TeamRepo, session: SessionPayload, id: string) {
  assertCan(session, "users");
  if (!(await repo.revokeInvite(session.tenantId, id))) throw new NotFoundError("Convite");
}

async function lookupValidInvite(repo: TeamRepo, token: string, now: Date): Promise<InviteLookup> {
  if (!token || token.length > 200) throw new InvalidInviteError();
  const invite = await repo.findInviteByTokenHash(hashToken(token));
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= now.getTime()) throw new InvalidInviteError();
  return invite;
}

/** Dados exibidos na página do convite. Não inclui tenantId nem nada além do necessário. */
export async function getInviteForToken(repo: TeamRepo, token: string, now: Date = new Date()) {
  const i = await lookupValidInvite(repo, token, now);
  return { tenantName: i.tenantName, name: i.name, email: i.email, role: i.role };
}

export async function acceptInvite(repo: TeamRepo, token: string, raw: unknown, now: Date = new Date()): Promise<SessionPayload> {
  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const invite = await lookupValidInvite(repo, token, now);
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await repo.acceptInvite({ inviteId: invite.id, tenantId: invite.tenantId, passwordHash, now });
  if (!created) throw new InvalidInviteError();
  return { userId: created.userId, tenantId: invite.tenantId, role: invite.role };
}
