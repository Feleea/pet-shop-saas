import { serviceSchema } from "./catalog-validation";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertCan, can } from "./permissions";
import type { SessionPayload } from "./session";

export interface ServiceData {
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  /** Fiscal (opcionais). `null` = não informado. */
  serviceCode?: string | null;
  issRateBp?: number | null;
}
export interface ServiceRecord extends ServiceData {
  id: string;
  tenantId: string;
  active: boolean;
}

/** Toda operação recebe o tenantId explicitamente. */
export interface CatalogRepo {
  createService(tenantId: string, data: ServiceData): Promise<ServiceRecord>;
  listServices(tenantId: string, opts: { includeInactive: boolean }): Promise<ServiceRecord[]>;
  findService(tenantId: string, id: string): Promise<ServiceRecord | null>;
  updateService(tenantId: string, id: string, data: ServiceData): Promise<ServiceRecord | null>;
  setServiceActive(tenantId: string, id: string, active: boolean): Promise<ServiceRecord | null>;
  /** Comparação sem diferenciar maiúsculas/minúsculas, apenas dentro do tenant. */
  nameExists(tenantId: string, name: string, excludeId?: string): Promise<boolean>;
}

export const DUPLICATE_NAME_MESSAGE = "Já existe um serviço com este nome";

function parse(raw: unknown): ServiceData {
  const r = serviceSchema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0].message);
  const d = r.data;
  return {
    name: d.name,
    description: d.description ?? null,
    durationMinutes: d.durationMinutes,
    priceCents: d.price,
    serviceCode: d.serviceCode ?? null,
    issRateBp: d.issRate ?? null,
  };
}

export async function createService(repo: CatalogRepo, session: SessionPayload, raw: unknown) {
  assertCan(session, "catalog");
  const data = parse(raw);
  if (await repo.nameExists(session.tenantId, data.name)) throw new ConflictError(DUPLICATE_NAME_MESSAGE);
  return repo.createService(session.tenantId, data);
}

/** Quem não gerencia o catálogo só enxerga serviços ativos, mesmo que peça os inativos. */
export async function listServices(repo: CatalogRepo, session: SessionPayload, opts: { includeInactive?: boolean } = {}) {
  assertCan(session, "read");
  const includeInactive = Boolean(opts.includeInactive) && can(session.role, "catalog");
  return repo.listServices(session.tenantId, { includeInactive });
}

export async function getService(repo: CatalogRepo, session: SessionPayload, id: string) {
  assertCan(session, "read");
  const service = await repo.findService(session.tenantId, id);
  if (!service) throw new NotFoundError("Serviço");
  return service;
}

export async function updateService(repo: CatalogRepo, session: SessionPayload, id: string, raw: unknown) {
  assertCan(session, "catalog");
  const data = parse(raw);
  if (await repo.nameExists(session.tenantId, data.name, id)) throw new ConflictError(DUPLICATE_NAME_MESSAGE);
  const updated = await repo.updateService(session.tenantId, id, data);
  if (!updated) throw new NotFoundError("Serviço");
  return updated;
}

export async function setServiceActive(repo: CatalogRepo, session: SessionPayload, id: string, active: boolean) {
  assertCan(session, "catalog");
  const updated = await repo.setServiceActive(session.tenantId, id, active);
  if (!updated) throw new NotFoundError("Serviço");
  return updated;
}
