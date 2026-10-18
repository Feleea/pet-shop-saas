import { companySchema } from "./company-validation";
import type { TaxRegime } from "./fiscal-constants";
import { NotFoundError, ValidationError } from "./errors";
import { assertCan } from "./permissions";
import type { SessionPayload } from "./session";

export interface CompanyData {
  name: string;
  legalName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  taxRegime: TaxRegime | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
}

export interface CompanyRepo {
  getCompany(tenantId: string): Promise<CompanyData | null>;
  updateCompany(tenantId: string, data: CompanyData): Promise<CompanyData | null>;
}

export async function getCompany(repo: CompanyRepo, session: SessionPayload): Promise<CompanyData> {
  assertCan(session, "read");
  const c = await repo.getCompany(session.tenantId);
  if (!c) throw new NotFoundError("Empresa");
  return c;
}

/** Só ADMIN. Limpar um campo apaga o valor (grava null). */
export async function updateCompany(repo: CompanyRepo, session: SessionPayload, raw: unknown): Promise<CompanyData> {
  assertCan(session, "settings");
  const r = companySchema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0].message);
  const d = r.data;
  const updated = await repo.updateCompany(session.tenantId, {
    name: d.name,
    legalName: d.legalName ?? null,
    cnpj: d.cnpj ?? null,
    stateRegistration: d.stateRegistration ?? null,
    municipalRegistration: d.municipalRegistration ?? null,
    taxRegime: d.taxRegime ?? null,
    addressLine: d.addressLine ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    zipCode: d.zipCode ?? null,
    phone: d.phone ?? null,
  });
  if (!updated) throw new NotFoundError("Empresa");
  return updated;
}
