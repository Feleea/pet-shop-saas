import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Pet Shop SaaS</h1>
      <p>Gestão de clientes, pets, agenda e vendas para o seu pet shop.</p>
      <p>
        <Link href="/cadastro">Cadastrar meu pet shop</Link> · <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}
