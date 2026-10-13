import Link from "next/link";
import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Entrar</h1>
      <LoginForm />
      <p>
        Ainda não tem conta? <Link href="/cadastro">Cadastrar meu pet shop</Link>
      </p>
    </main>
  );
}
