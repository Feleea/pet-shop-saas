"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Código do pet shop
        <input name="slug" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        E-mail
        <input name="email" type="email" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Senha
        <input name="password" type="password" required style={{ display: "block", width: "100%" }} />
      </label>
      {state.error && <p role="alert" style={{ color: "crimson" }}>{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
