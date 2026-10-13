"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prismaCustomerRepo as repo } from "@/lib/customer-repo";
import { addPet, createCustomer, deleteCustomer, deletePet, updateCustomer, updatePet } from "@/lib/customer-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/tenant";
import { requireSession } from "@/lib/session-cookie";

export interface ClientFormState {
  error?: string;
  saved?: boolean;
  /** Valores enviados, devolvidos para o formulário não perder o que a pessoa digitou. */
  values?: Record<string, string>;
}

const CUSTOMER_FIELDS = ["name", "phone", "email", "notes"] as const;
const PET_FIELDS = ["name", "species", "breed", "size", "birthDate", "notes"] as const;

function pick(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k)]));
}

function valuesOf(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

function failure(e: unknown, values: Record<string, string>): ClientFormState {
  if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return { error: e.message, values };
  }
  console.error(e);
  return { error: "Não foi possível concluir a operação. Tente novamente.", values };
}

export async function createCustomerAction(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const session = await requireSession();
  let id: string;
  try {
    id = (await createCustomer(repo, session, pick(formData, CUSTOMER_FIELDS))).id;
  } catch (e) {
    return failure(e, valuesOf(formData, CUSTOMER_FIELDS));
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

export async function updateCustomerAction(id: string, _prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const session = await requireSession();
  try {
    await updateCustomer(repo, session, id, pick(formData, CUSTOMER_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, CUSTOMER_FIELDS));
  }
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return { saved: true };
}

export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await deleteCustomer(repo, session, String(formData.get("id")));
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function addPetAction(customerId: string, _prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const session = await requireSession();
  try {
    await addPet(repo, session, customerId, pick(formData, PET_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, PET_FIELDS));
  }
  revalidatePath(`/clientes/${customerId}`);
  revalidatePath("/clientes");
  return { saved: true };
}

export async function updatePetAction(
  customerId: string,
  petId: string,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireSession();
  try {
    await updatePet(repo, session, petId, pick(formData, PET_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, PET_FIELDS));
  }
  revalidatePath(`/clientes/${customerId}`);
  redirect(`/clientes/${customerId}`);
}

export async function deletePetAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const customerId = String(formData.get("customerId"));
  try {
    await deletePet(repo, session, String(formData.get("id")));
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath(`/clientes/${customerId}`);
  revalidatePath("/clientes");
}
