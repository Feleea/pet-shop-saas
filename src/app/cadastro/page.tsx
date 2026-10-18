import Link from "next/link";
import { RegisterForm } from "./form";

export default function CadastroPage() {
  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Cadastrar pet shop</h1>
      <RegisterForm />
      <p>
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}
