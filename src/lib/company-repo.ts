import { db } from "./db";
import type { CompanyRepo } from "./company-service";

const select = {
  name: true,
  legalName: true,
  cnpj: true,
  stateRegistration: true,
  municipalRegistration: true,
  taxRegime: true,
  addressLine: true,
  city: true,
  state: true,
  zipCode: true,
  phone: true,
} as const;

// A empresa É o tenant da sessão: o id vem sempre da sessão, nunca da entrada do usuário.
export const prismaCompanyRepo: CompanyRepo = {
  getCompany: (tenantId) => db.tenant.findUnique({ where: { id: tenantId }, select }),
  updateCompany: (tenantId, data) => db.tenant.update({ where: { id: tenantId }, data, select }),
};
