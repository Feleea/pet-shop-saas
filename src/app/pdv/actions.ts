"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { prismaSalesRepo as repo } from "@/lib/sales-repo";
import { cancelSale, createSale } from "@/lib/sales-service";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";

export interface SaleFormState {
  error?: string;
}

function message(e: unknown): string {
  if (e instanceof ValidationError || e instanceof ConflictError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return e.message;
  }
  console.error(e);
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function createSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const session = await requireSession();
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Itens inválidos" };
  }
  let id: string;
  try {
    id = (
      await createSale(repo, session, {
        items,
        paymentMethod: formData.get("paymentMethod"),
        discount: formData.get("discount"),
        customerId: formData.get("customerId"),
        notes: formData.get("notes"),
      })
    ).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/pdv");
  revalidatePath("/estoque");
  redirect(`/pdv/vendas/${id}?nova=1`);
}

export async function cancelSaleAction(id: string, _prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const session = await requireSession();
  try {
    await cancelSale(repo, session, id, { reason: formData.get("reason") });
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/pdv");
  revalidatePath("/estoque");
  revalidatePath(`/pdv/vendas/${id}`);
  return {};
}
