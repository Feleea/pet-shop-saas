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
      <fieldset style={{ display: "grid", gap: "0.5rem" }}>
        <legend>Dados fiscais (opcionais: só são exigidos para emitir nota)</legend>
        <label>
          NCM
          <input name="ncm" inputMode="numeric" defaultValue={v("ncm")} placeholder="8 dígitos" style={field} />
        </label>
        <label>
          CFOP
          <input name="cfop" inputMode="numeric" defaultValue={v("cfop")} placeholder="4 dígitos (ex.: 5102)" style={field} />
        </label>
        <label>
          CSOSN
          <input name="csosn" inputMode="numeric" defaultValue={v("csosn")} placeholder="3 dígitos (Simples/MEI)" style={field} />
        </label>
        <label>
          Unidade
          <input name="unit" defaultValue={v("unit")} placeholder="UN" style={field} />
        </label>
      </fieldset>
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
