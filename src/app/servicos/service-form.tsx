"use client";

import { useActionState } from "react";
import type { ServiceFormState } from "./actions";

type Action = (prev: ServiceFormState, formData: FormData) => Promise<ServiceFormState>;

const field = { display: "block", width: "100%" } as const;

export function ServiceForm({
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
        Nome do serviço
        <input name="name" required defaultValue={v("name")} style={field} />
      </label>
      <label>
        Descrição
        <textarea name="description" rows={2} defaultValue={v("description")} style={field} />
      </label>
      <label>
        Duração (minutos)
        <input name="durationMinutes" inputMode="numeric" required defaultValue={v("durationMinutes")} style={field} />
      </label>
      <label>
        Preço (R$)
        <input name="price" inputMode="decimal" required defaultValue={v("price")} style={field} />
      </label>
      <fieldset style={{ display: "grid", gap: "0.5rem" }}>
        <legend>Dados fiscais (opcionais: só são exigidos para emitir nota)</legend>
        <label>
          Código do serviço (LC 116)
          <input name="serviceCode" defaultValue={v("serviceCode")} placeholder="ex.: 05.08" style={field} />
        </label>
        <label>
          Alíquota do ISS (%)
          <input name="issRate" inputMode="decimal" defaultValue={v("issRate")} placeholder="ex.: 5" style={field} />
        </label>
      </fieldset>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
