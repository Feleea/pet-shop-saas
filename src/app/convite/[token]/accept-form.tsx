"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptFormState } from "./actions";

const field = { display: "block", width: "100%" } as const;
const initial: AcceptFormState = {};

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction.bind(null, token), initial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Senha
        <input name="password" type="password" required style={field} />
      </label>
      <label>
        Confirmar senha
        <input name="confirmPassword" type="password" required style={field} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Aceitar convite"}
      </button>
    </form>
  );
}
