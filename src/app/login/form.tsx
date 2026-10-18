"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="login-form">
      <label>
        Código do pet shop
        <input name="slug" autoComplete="organization" required />
      </label>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Senha
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="login-error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
