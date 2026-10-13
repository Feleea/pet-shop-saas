"use client";

import { useActionState } from "react";
import { INVITABLE_ROLES } from "@/lib/team-validation";
import { ROLE_LABEL } from "@/lib/team-format";
import { inviteUserAction, type InviteFormState } from "./actions";

const field = { display: "block", width: "100%" } as const;
const initial: InviteFormState = {};

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUserAction, initial);
  const v = (k: string) => state.values?.[k] ?? "";
  return (
    <>
      <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Nome do convidado
          <input name="name" required defaultValue={v("name")} style={field} />
        </label>
        <label>
          E-mail do convidado
          <input name="email" defaultValue={v("email")} style={field} />
        </label>
        <label>
          Papel
          <select name="role" defaultValue={v("role") || "ATTENDANT"} style={field}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        {state.error && (
          <p role="alert" style={{ color: "crimson" }}>
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Gerando..." : "Gerar convite"}
        </button>
      </form>

      {state.invitePath && (
        <div role="status" style={{ marginTop: "1rem", padding: "0.75rem", border: "1px solid #999" }}>
          <p>Convite criado. Envie este link ao convidado. Ele vale por 7 dias e só é exibido agora:</p>
          <code data-testid="invite-link" style={{ wordBreak: "break-all" }}>
            {window.location.origin + state.invitePath}
          </code>{" "}
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.origin + state.invitePath!)}>
            Copiar link
          </button>
        </div>
      )}
    </>
  );
}
