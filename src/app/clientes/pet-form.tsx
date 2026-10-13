"use client";

import { useActionState } from "react";
import { PET_SIZES, SPECIES } from "@/lib/customer-validation";
import { SIZE_LABEL, SPECIES_LABEL } from "@/lib/format";
import type { ClientFormState } from "./actions";

type Action = (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;

const field = { display: "block", width: "100%" } as const;

export function PetForm({
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
        Nome do pet
        <input name="name" required defaultValue={v("name")} style={field} />
      </label>
      <label>
        Espécie
        <select name="species" required defaultValue={v("species")} style={field}>
          <option value="">Selecione</option>
          {SPECIES.map((s) => (
            <option key={s} value={s}>
              {SPECIES_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Raça
        <input name="breed" defaultValue={v("breed")} style={field} />
      </label>
      <label>
        Porte
        <select name="size" defaultValue={v("size")} style={field}>
          <option value="">Não informado</option>
          {PET_SIZES.map((s) => (
            <option key={s} value={s}>
              {SIZE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Data de nascimento
        <input name="birthDate" type="date" defaultValue={v("birthDate")} style={field} />
      </label>
      <label>
        Observações do pet
        <textarea name="notes" rows={2} defaultValue={v("notes")} style={field} />
      </label>
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
