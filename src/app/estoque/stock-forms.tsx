"use client";

import { useActionState } from "react";
import type { InventoryFormState } from "./actions";

type Action = (prev: InventoryFormState, formData: FormData) => Promise<InventoryFormState>;
const field = { display: "block", width: "100%" } as const;

function Feedback({ state }: { state: InventoryFormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      {state.saved && <p role="status">{state.saved}</p>}
    </>
  );
}

export function EntryForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? "";
  return (
    <form action={formAction} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Quantidade
        <input name="quantity" inputMode="numeric" defaultValue={v("quantity")} style={field} />
      </label>
      <label>
        Observação da entrada
        <input name="note" defaultValue={v("note")} style={field} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending}>
        Registrar entrada
      </button>
    </form>
  );
}

export function AdjustmentForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? "";
  return (
    <form action={formAction} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Ajuste (use negativo para baixa)
        <input name="delta" inputMode="numeric" defaultValue={v("delta")} style={field} />
      </label>
      <label>
        Motivo do ajuste
        <input name="reason" defaultValue={v("reason")} style={field} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending}>
        Registrar ajuste
      </button>
    </form>
  );
}
