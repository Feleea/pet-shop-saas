import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// /convite/* é público de propósito: quem recebe o convite ainda não tem conta.
export async function middleware(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/painel/:path*", "/clientes/:path*", "/servicos/:path*", "/equipe/:path*"] };
