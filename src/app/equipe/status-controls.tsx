"use client";

import { useActionState } from "react";
import type { UserStatus } from "@/lib/user-status";
import { VACATION_MAX_DAYS } from "@/lib/user-status";
import { changeUserStatusAction, type StatusFormState } from "./actions";

const initial: StatusFormState = {};

/** Botões de situação de um usuário. Três formulários simples compartilham o mesmo estado de erro. */
export function StatusControls({ userId, status }: { userId: string; status: UserStatus }) {
  const [state, action, pending] = useActionState(changeUserStatusAction, initial);
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {status !== "ACTIVE" && (
          <form action={action}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="ACTIVE" />
            <button type="submit" disabled={pending}>
              Ativar
            </button>
          </form>
        )}
        {status !== "INACTIVE" && (
          <form action={action}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="INACTIVE" />
            <button type="submit" disabled={pending}>
              Desativar
            </button>
          </form>
        )}
        <form action={action} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value="VACATION" />
          <input
            name="vacationDays"
            aria-label="Dias de férias"
            placeholder={`dias (1-${VACATION_MAX_DAYS})`}
            inputMode="numeric"
            size={9}
          />
          <button type="submit" disabled={pending}>
            {status === "VACATION" ? "Atualizar férias" : "Colocar de férias"}
          </button>
        </form>
      </div>
      {state.error && (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
