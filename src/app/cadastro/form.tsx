"use client";

import { useActionState } from "react";
import { registerAction, type FormState } from "../actions";

const initial: FormState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Nome do pet shop
        <input name="shopName" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Seu nome
        <input name="adminName" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        E-mail
        <input name="email" type="email" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Senha
        <input name="password" type="password" required minLength={8} style={{ display: "block", width: "100%" }} />
      </label>
      {state.error && <p role="alert" style={{ color: "crimson" }}>{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Criando..." : "Criar conta"}</button>
    </form>
  );
}
