"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ConfirmSubmit } from "../confirm-submit";
import { changeAppointmentStatusAction, type StatusState } from "./actions";

const initial: StatusState = {};

export function AppointmentControls({ id, canComplete, canManage }: { id: string; canComplete: boolean; canManage: boolean }) {
  const [state, action, pending] = useActionState(changeAppointmentStatusAction, initial);
  const hidden = (to: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
    </>
  );
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {canComplete && (
          <form action={action}>
            {hidden("COMPLETED")}
            <button type="submit" disabled={pending}>
              Concluir
            </button>
          </form>
        )}
        {canManage && (
          <>
            <Link href={`/agenda/${id}/reagendar`}>Reagendar</Link>
            <form action={action}>
              {hidden("NO_SHOW")}
              <button type="submit" disabled={pending}>
                Faltou
              </button>
            </form>
            <form action={action}>
              {hidden("CANCELED")}
              <ConfirmSubmit message="Cancelar este agendamento?">Cancelar agendamento</ConfirmSubmit>
            </form>
          </>
        )}
      </div>
      {state.error && (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
