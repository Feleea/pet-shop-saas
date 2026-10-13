"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, registerTenant } from "@/lib/auth-service";
import { prismaAuthRepo } from "@/lib/auth-repo";
import { clearSessionCookie, setSessionCookie } from "@/lib/session-cookie";

export interface FormState {
  error?: string;
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { slug: _slug, ...session } = await registerTenant(prismaAuthRepo, {
      shopName: formData.get("shopName"),
      adminName: formData.get("adminName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    await setSessionCookie(session);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    // E-mail duplicado dentro do mesmo tenant etc. caem aqui; não vazamos detalhes internos.
    console.error(e);
    return { error: "Não foi possível concluir o cadastro. Tente novamente." };
  }
  redirect("/painel");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await authenticate(prismaAuthRepo, {
      slug: formData.get("slug"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    await setSessionCookie(session);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Não foi possível entrar. Tente novamente." };
  }
  redirect("/painel");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
