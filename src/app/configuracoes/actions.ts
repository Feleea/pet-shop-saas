"use server";

import { revalidatePath } from "next/cache";
import { prismaCompanyRepo as repo } from "@/lib/company-repo";
import { updateCompany } from "@/lib/company-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";

export interface CompanyFormState {
  error?: string;
  saved?: boolean;
  /** Valores enviados, devolvidos para o formulário não perder o que a pessoa digitou. */
  values?: Record<string, string>;
}

const FIELDS = [
  "name",
  "legalName",
  "cnpj",
  "stateRegistration",
  "municipalRegistration",
  "taxRegime",
  "addressLine",
  "city",
  "state",
  "zipCode",
  "phone",
] as const;

export async function saveCompanyAction(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  const session = await requireSession();
  try {
    await updateCompany(repo, session, Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)])));
  } catch (e) {
    const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) return { error: e.message, values };
    console.error(e);
    return { error: "Não foi possível salvar. Tente novamente.", values };
  }
  revalidatePath("/configuracoes");
  revalidatePath("/painel");
  return { saved: true };
}
