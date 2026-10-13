"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prismaAgendaRepo as repo } from "@/lib/agenda-repo";
import { changeAppointmentStatus, createAppointment, rescheduleAppointment } from "@/lib/agenda-service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";

export interface AgendaFormState {
  error?: string;
  /** Valores enviados, devolvidos para o formulário não perder o que a pessoa digitou. */
  values?: Record<string, string>;
}

const CREATE_FIELDS = ["customerId", "petId", "serviceId", "professionalId", "date", "time", "notes"] as const;
const RESCHEDULE_FIELDS = ["professionalId", "date", "time"] as const;

const pick = (formData: FormData, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, formData.get(k)]));
const valuesOf = (formData: FormData, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));

function message(e: unknown): string {
  if (e instanceof ValidationError || e instanceof ConflictError || e instanceof ForbiddenError || e instanceof NotFoundError) {
    return e.message;
  }
  console.error(e);
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function createAppointmentAction(_prev: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const session = await requireSession();
  try {
    await createAppointment(repo, session, pick(formData, CREATE_FIELDS));
  } catch (e) {
    return { error: message(e), values: valuesOf(formData, CREATE_FIELDS) };
  }
  revalidatePath("/agenda");
  redirect(`/agenda?data=${encodeURIComponent(String(formData.get("date")))}`);
}

export async function rescheduleAppointmentAction(id: string, _prev: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const session = await requireSession();
  try {
    await rescheduleAppointment(repo, session, id, pick(formData, RESCHEDULE_FIELDS));
  } catch (e) {
    return { error: message(e), values: valuesOf(formData, RESCHEDULE_FIELDS) };
  }
  revalidatePath("/agenda");
  redirect(`/agenda?data=${encodeURIComponent(String(formData.get("date")))}`);
}

export interface StatusState {
  error?: string;
}

export async function changeAppointmentStatusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const session = await requireSession();
  try {
    await changeAppointmentStatus(repo, session, String(formData.get("id")), formData.get("to"));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/agenda");
  return {};
}
