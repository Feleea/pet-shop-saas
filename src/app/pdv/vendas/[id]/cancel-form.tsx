"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "../../../confirm-submit";
import { cancelSaleAction, type SaleFormState } from "../../actions";

const initial: SaleFormState = {};

export function CancelSaleForm({ id }: { id: string }) {
  const [state, action] = useActionState(cancelSaleAction.bind(null, id), initial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.5rem", marginTop: "1.5rem" }}>
      <label>
        Motivo do cancelamento
        <input name="reason" style={{ display: "block", width: "100%" }} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      <ConfirmSubmit message="Cancelar esta venda? O estoque será devolvido.">Cancelar venda</ConfirmSubmit>
    </form>
  );
}
