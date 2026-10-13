import { z } from "zod";
import { customerSchema, petSchema, type PetSize, type Species } from "./customer-validation";
import { NotFoundError, ValidationError } from "./errors";
import { assertCan } from "./permissions";
import type { SessionPayload } from "./session";

export interface CustomerData {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}
export interface PetData {
  name: string;
  species: Species;
  breed: string | null;
  size: PetSize | null;
  birthDate: Date | null;
  notes: string | null;
}
export interface CustomerRecord extends CustomerData {
  id: string;
  tenantId: string;
}
export interface PetRecord extends PetData {
  id: string;
  tenantId: string;
  customerId: string;
}
export interface CustomerListItem extends CustomerRecord {
  petCount: number;
}
export interface CustomerWithPets extends CustomerRecord {
  pets: PetRecord[];
}

/** Toda operação recebe o tenantId explicitamente: o repositório nunca "adivinha" o tenant. */
export interface CustomerRepo {
  createCustomer(tenantId: string, data: CustomerData): Promise<CustomerRecord>;
  listCustomers(tenantId: string, search?: string): Promise<CustomerListItem[]>;
  findCustomer(tenantId: string, id: string): Promise<CustomerWithPets | null>;
  updateCustomer(tenantId: string, id: string, data: CustomerData): Promise<CustomerRecord | null>;
  deleteCustomer(tenantId: string, id: string): Promise<boolean>;
  createPet(tenantId: string, customerId: string, data: PetData): Promise<PetRecord>;
  updatePet(tenantId: string, id: string, data: PetData): Promise<PetRecord | null>;
  deletePet(tenantId: string, id: string): Promise<boolean>;
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0].message);
  return r.data;
}

// undefined (campo vazio) vira null: assim, limpar um campo na edição realmente apaga o valor.
function toCustomerData(d: z.output<typeof customerSchema>): CustomerData {
  return { name: d.name, phone: d.phone ?? null, email: d.email ?? null, notes: d.notes ?? null };
}
function toPetData(d: z.output<typeof petSchema>): PetData {
  return {
    name: d.name,
    species: d.species,
    breed: d.breed ?? null,
    size: d.size ?? null,
    birthDate: d.birthDate ?? null,
    notes: d.notes ?? null,
  };
}

export async function createCustomer(repo: CustomerRepo, session: SessionPayload, raw: unknown) {
  assertCan(session, "write");
  return repo.createCustomer(session.tenantId, toCustomerData(parse(customerSchema, raw)));
}

export async function listCustomers(repo: CustomerRepo, session: SessionPayload, search?: string) {
  assertCan(session, "read");
  return repo.listCustomers(session.tenantId, search?.trim() || undefined);
}

export async function getCustomer(repo: CustomerRepo, session: SessionPayload, id: string) {
  assertCan(session, "read");
  const customer = await repo.findCustomer(session.tenantId, id);
  if (!customer) throw new NotFoundError("Cliente");
  return customer;
}

export async function updateCustomer(repo: CustomerRepo, session: SessionPayload, id: string, raw: unknown) {
  assertCan(session, "write");
  const data = toCustomerData(parse(customerSchema, raw));
  const updated = await repo.updateCustomer(session.tenantId, id, data);
  if (!updated) throw new NotFoundError("Cliente");
  return updated;
}

export async function deleteCustomer(repo: CustomerRepo, session: SessionPayload, id: string) {
  assertCan(session, "delete");
  if (!(await repo.deleteCustomer(session.tenantId, id))) throw new NotFoundError("Cliente");
}

export async function addPet(repo: CustomerRepo, session: SessionPayload, customerId: string, raw: unknown) {
  assertCan(session, "write");
  const data = toPetData(parse(petSchema, raw));
  // O cliente precisa existir NESTE tenant; senão responde 404 como se não existisse.
  if (!(await repo.findCustomer(session.tenantId, customerId))) throw new NotFoundError("Cliente");
  return repo.createPet(session.tenantId, customerId, data);
}

export async function updatePet(repo: CustomerRepo, session: SessionPayload, petId: string, raw: unknown) {
  assertCan(session, "write");
  const data = toPetData(parse(petSchema, raw));
  const updated = await repo.updatePet(session.tenantId, petId, data);
  if (!updated) throw new NotFoundError("Pet");
  return updated;
}

export async function deletePet(repo: CustomerRepo, session: SessionPayload, petId: string) {
  assertCan(session, "delete");
  if (!(await repo.deletePet(session.tenantId, petId))) throw new NotFoundError("Pet");
}
