"use server";

import { redirect } from "next/navigation";
import { ConflictError, InvalidInviteError, ValidationError } from "@/lib/errors";
import { setSessionCookie } from "@/lib/session-cookie";
import { prismaTeamRepo as repo } from "@/lib/team-repo";
import { acceptInvite } from "@/lib/team-service";

export interface AcceptFormState {
  error?: string;
}

export async function acceptInviteAction(token: string, _prev: AcceptFormState, formData: FormData): Promise<AcceptFormState> {
  try {
    const session = await acceptInvite(repo, token, {
      password: formData.get("password") ?? "",
      confirmPassword: formData.get("confirmPassword") ?? "",
    });
    await setSessionCookie(session);
  } catch (e) {
    if (e instanceof ValidationError || e instanceof InvalidInviteError || e instanceof ConflictError) return { error: e.message };
    console.error(e);
    return { error: "Não foi possível aceitar o convite. Tente novamente." };
  }
  redirect("/painel");
}
