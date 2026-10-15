"use client";

import { useActionState } from "react";
import type { InventoryFormState } from "./actions";

type Action = (prev: InventoryFormState, formData: FormData) => Promise<InventoryFormState>;
const field = { display: "block", width: "100%" } as const;

export function ProductForm({
  action,
  submitLabel,
  defaults = {},
  withInitialStock = false,
}: {
  action: Action;
  submitLabel: string;
  defaults?: Record<string, string>;
  withInitialStock?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? defaults[k] ?? "";
  return (
    <form action={formAction} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Nome do produto
        <input name="name" required defaultValue={v("name")} style={field} />
      </label>
      <label>
        Preço (R$)
        <input name="price" inputMode="decimal" required defaultValue={v("price")} style={field} />
      </label>
      <label>
        Estoque mínimo
        <input name="minStock" inputMode="numeric" defaultValue={v("minStock")} placeholder="0" style={field} />
      </label>
      {withInitialStock && (
        <label>
          Estoque inicial
          <input name="initialStock" inputMode="numeric" defaultValue={v("initialStock")} placeholder="0" style={field} />
        </label>
      )}
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      {state.saved && <p role="status">{state.saved}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
