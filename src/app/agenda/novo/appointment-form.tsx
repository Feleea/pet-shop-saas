"use client";

import { useActionState } from "react";
import { createAppointmentAction, type AgendaFormState } from "../actions";

interface Option {
  id: string;
  label: string;
}

const field = { display: "block", width: "100%" } as const;
const initial: AgendaFormState = {};

export function AppointmentForm({
  customerId,
  pets,
  services,
  professionals,
  defaultDate,
}: {
  customerId: string;
  pets: Option[];
  services: Option[];
  professionals: Option[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(createAppointmentAction, initial);
  const v = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  const select = (name: string, label: string, options: Option[]) => (
    <label>
      {label}
      <select name={name} defaultValue={v(name)} style={field}>
        <option value="">Selecione</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <input type="hidden" name="customerId" value={customerId} />
      {select("petId", "Pet", pets)}
      {select("serviceId", "Serviço", services)}
      {select("professionalId", "Profissional", professionals)}
      <label>
        Data
        <input type="date" name="date" defaultValue={v("date", defaultDate)} style={field} />
      </label>
      <label>
        Horário
        <input type="time" name="time" defaultValue={v("time")} style={field} />
      </label>
      <label>
        Observações
        <textarea name="notes" rows={2} defaultValue={v("notes")} style={field} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Agendando..." : "Agendar"}
      </button>
    </form>
  );
}
