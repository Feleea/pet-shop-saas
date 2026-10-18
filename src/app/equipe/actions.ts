"use server";

import { revalidatePath } from "next/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireSession } from "@/lib/session-cookie";
import { ForbiddenError } from "@/lib/tenant";
import { prismaTeamRepo as repo } from "@/lib/team-repo";
import { inviteUser, revokeInvite } from "@/lib/team-service";
import { prismaUserStatusRepo } from "@/lib/user-status-repo";
import { changeUserStatus } from "@/lib/user-status-service";

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

export interface StatusFormState {
  error?: string;
}

export async function changeUserStatusAction(_prev: StatusFormState, formData: FormData): Promise<StatusFormState> {
  const session = await requireSession();
  try {
    await changeUserStatus(prismaUserStatusRepo, session, String(formData.get("userId")), {
      status: formData.get("status"),
      vacationDays: formData.get("vacationDays"),
    });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) return { error: e.message };
    console.error(e);
    return { error: "Não foi possível alterar a situação. Tente novamente." };
  }
  revalidatePath("/equipe");
  return {};
}
