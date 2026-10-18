"use client";

import { useActionState } from "react";
import { rescheduleAppointmentAction, type AgendaFormState } from "../../actions";

const field = { display: "block", width: "100%" } as const;
const initial: AgendaFormState = {};

export function RescheduleForm({
  id,
  professionals,
  defaults,
}: {
  id: string;
  professionals: { id: string; label: string }[];
  defaults: { professionalId: string; date: string; time: string };
}) {
  const [state, action, pending] = useActionState(rescheduleAppointmentAction.bind(null, id), initial);
  const v = (k: keyof typeof defaults) => state.values?.[k] ?? defaults[k];
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Profissional
        <select name="professionalId" defaultValue={v("professionalId")} style={field}>
          <option value="">Selecione</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Data
        <input type="date" name="date" defaultValue={v("date")} style={field} />
      </label>
      <label>
        Horário
        <input type="time" name="time" defaultValue={v("time")} style={field} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Reagendar"}
      </button>
    </form>
  );
}
