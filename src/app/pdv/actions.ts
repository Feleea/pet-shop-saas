"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { prismaFiscalRepo } from "@/lib/fiscal-repo";
import { cancelFiscalDocument, emitFiscalDocuments } from "@/lib/fiscal-service";
import { getFiscalProvider } from "@/lib/fiscal-provider";
import { prismaReturnsRepo } from "@/lib/returns-repo";
import { createReturn } from "@/lib/returns-service";
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

function parseJsonList(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? "[]"));
  } catch {
    return undefined;
  }
}

export async function createSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const session = await requireSession();
  const items = parseJsonList(formData.get("items"));
  if (items === undefined) return { error: "Itens inválidos" };
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

/** Devolução (parcial ou total), com troca opcional. */
export async function createReturnAction(saleId: string, _prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const session = await requireSession();
  const items = parseJsonList(formData.get("items"));
  const exchangeItems = parseJsonList(formData.get("exchangeItems"));
  if (items === undefined || exchangeItems === undefined) return { error: "Itens inválidos" };
  let id: string;
  try {
    const { ret } = await createReturn({ sales: repo, returns: prismaReturnsRepo }, session, saleId, {
      items,
      reason: formData.get("reason"),
      restock: formData.get("restock"),
      refundMethod: formData.get("refundMethod"),
      exchange: Array.isArray(exchangeItems) && exchangeItems.length > 0 ? { items: exchangeItems, paymentMethod: formData.get("exchangePayment") } : undefined,
    });
    id = ret.id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/pdv");
  revalidatePath("/estoque");
  revalidatePath(`/pdv/vendas/${saleId}`);
  redirect(`/pdv/devolucoes/${id}?nova=1`);
}

export interface FiscalActionState {
  error?: string;
  ok?: boolean;
}

export async function emitFiscalAction(saleId: string, _prev: FiscalActionState, _formData: FormData): Promise<FiscalActionState> {
  const session = await requireSession();
  let provider;
  try {
    provider = getFiscalProvider();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Provedor fiscal não configurado" };
  }
  try {
    const docs = await emitFiscalDocuments(prismaFiscalRepo, provider, session, saleId);
    revalidatePath(`/pdv/vendas/${saleId}`);
    const rejected = docs.find((d) => d.status === "REJECTED");
    return rejected ? { error: `A nota foi rejeitada: ${rejected.rejectionReason ?? "motivo não informado"}` } : { ok: true };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function cancelFiscalAction(documentId: string, saleId: string, _prev: FiscalActionState, formData: FormData): Promise<FiscalActionState> {
  const session = await requireSession();
  let provider;
  try {
    provider = getFiscalProvider();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Provedor fiscal não configurado" };
  }
  try {
    await cancelFiscalDocument(prismaFiscalRepo, provider, session, documentId, { reason: formData.get("reason") });
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/pdv/vendas/${saleId}`);
  return { ok: true };
}
