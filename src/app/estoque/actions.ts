"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { prismaInventoryRepo as repo } from "@/lib/inventory-repo";
import { createProduct, registerAdjustment, registerEntry, setProductActive, updateProduct } from "@/lib/inventory-service";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";

export interface InventoryFormState {
  error?: string;
  saved?: string;
  /** Valores enviados, devolvidos para o formulário não perder o que a pessoa digitou. */
  values?: Record<string, string>;
}

const PRODUCT_FIELDS = ["name", "price", "minStock", "initialStock", "ncm", "cfop", "csosn", "unit"] as const;
const ENTRY_FIELDS = ["quantity", "note"] as const;
const ADJUST_FIELDS = ["delta", "reason"] as const;

const pick = (formData: FormData, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, formData.get(k)]));
const valuesOf = (formData: FormData, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));

function failure(e: unknown, values: Record<string, string>): InventoryFormState {
  if (e instanceof ValidationError || e instanceof ConflictError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return { error: e.message, values };
  }
  console.error(e);
  return { error: "Não foi possível concluir a operação. Tente novamente.", values };
}

export async function createProductAction(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requireSession();
  let id: string;
  try {
    id = (await createProduct(repo, session, pick(formData, PRODUCT_FIELDS))).id;
  } catch (e) {
    return failure(e, valuesOf(formData, PRODUCT_FIELDS));
  }
  revalidatePath("/estoque");
  redirect(`/estoque/${id}`);
}

export async function updateProductAction(id: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requireSession();
  try {
    await updateProduct(repo, session, id, pick(formData, PRODUCT_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, PRODUCT_FIELDS));
  }
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${id}`);
  return { saved: "Dados salvos." };
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id"));
  try {
    await setProductActive(repo, session, id, formData.get("active") === "true");
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${id}`);
}

export async function registerEntryAction(productId: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const session = await requireSession();
  try {
    await registerEntry(repo, session, productId, pick(formData, ENTRY_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, ENTRY_FIELDS));
  }
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${productId}`);
  return { saved: "Entrada registrada." };
}

export async function registerAdjustmentAction(
  productId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await requireSession();
  try {
    await registerAdjustment(repo, session, productId, pick(formData, ADJUST_FIELDS));
  } catch (e) {
    return failure(e, valuesOf(formData, ADJUST_FIELDS));
  }
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${productId}`);
  return { saved: "Ajuste registrado." };
}
