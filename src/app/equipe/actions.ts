"use server";

import { revalidatePath } from "next/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";
import { prismaTeamRepo as repo } from "@/lib/team-repo";
import { inviteUser, revokeInvite } from "@/lib/team-service";

export interface InviteFormState {
  error?: string;
  /** Caminho do convite (/convite/<token>). Só existe nesta resposta: o banco guarda apenas o hash. */
  invitePath?: string;
  values?: Record<string, string>;
}

const FIELDS = ["name", "email", "role"] as const;

export async function inviteUserAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const session = await requireSession();
  try {
    const { token } = await inviteUser(repo, session, Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)])));
    revalidatePath("/equipe");
    return { invitePath: `/convite/${token}` };
  } catch (e) {
    const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
    if (e instanceof ValidationError || e instanceof ConflictError || e instanceof ForbiddenError) return { error: e.message, values };
    console.error(e);
    return { error: "Não foi possível criar o convite. Tente novamente.", values };
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await revokeInvite(repo, session, String(formData.get("id")));
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/equipe");
}
