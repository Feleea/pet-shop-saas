"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prismaCatalogRepo as repo } from "@/lib/catalog-repo";
import { createService, setServiceActive, updateService } from "@/lib/catalog-service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";

export interface ServiceFormState {
  error?: string;
  /** Valores enviados, devolvidos para o formulário não perder o que a pessoa digitou. */
  values?: Record<string, string>;
}

const FIELDS = ["name", "description", "durationMinutes", "price", "serviceCode", "issRate"] as const;

const pick = (formData: FormData) => Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)]));
const valuesOf = (formData: FormData) => Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));

function failure(e: unknown, values: Record<string, string>): ServiceFormState {
  if (e instanceof ValidationError || e instanceof ConflictError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return { error: e.message, values };
  }
  console.error(e);
  return { error: "Não foi possível concluir a operação. Tente novamente.", values };
}

export async function createServiceAction(_prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const session = await requireSession();
  try {
    await createService(repo, session, pick(formData));
  } catch (e) {
    return failure(e, valuesOf(formData));
  }
  revalidatePath("/servicos");
  redirect("/servicos");
}

export async function updateServiceAction(id: string, _prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const session = await requireSession();
  try {
    await updateService(repo, session, id, pick(formData));
  } catch (e) {
    return failure(e, valuesOf(formData));
  }
  revalidatePath("/servicos");
  redirect("/servicos");
}

export async function toggleServiceActiveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await setServiceActive(repo, session, String(formData.get("id")), formData.get("active") === "true");
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/servicos");
}
