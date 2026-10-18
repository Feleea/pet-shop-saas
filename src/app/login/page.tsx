import Link from "next/link";
import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">P</span>
          Pet Shop SaaS
        </div>
        <h1 id="login-title">Entrar</h1>
        <p className="login-intro">Acesse sua conta para gerenciar seu pet shop.</p>
        <LoginForm />
        <p className="login-footer">
          Ainda não tem conta? <Link href="/cadastro">Cadastrar meu pet shop</Link>
        </p>
      </section>
    </main>
  );
}
