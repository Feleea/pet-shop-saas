"use client";

import { useActionState } from "react";
import type { ClientFormState } from "./actions";

type Action = (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;

const field = { display: "block", width: "100%" } as const;

export function CustomerForm({
  action,
  submitLabel,
  defaults = {},
}: {
  action: Action;
  submitLabel: string;
  defaults?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? defaults[k] ?? "";
  return (
    <form action={formAction} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Nome do cliente
        <input name="name" required defaultValue={v("name")} style={field} />
      </label>
      <label>
        Telefone
        <input name="phone" type="tel" defaultValue={v("phone")} style={field} />
      </label>
      <label>
        E-mail
        <input name="email" defaultValue={v("email")} style={field} />
      </label>
      <label>
        Observações do cliente
        <textarea name="notes" rows={3} defaultValue={v("notes")} style={field} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      {state.saved && <p role="status">Dados salvos.</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
