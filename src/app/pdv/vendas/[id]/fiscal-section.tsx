"use client";

import { useActionState } from "react";
import {
  ENVIRONMENT_LABEL,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  type FiscalEnvironment,
  type FiscalKind,
  type FiscalStatus,
} from "@/lib/fiscal-constants";
import { formatBRL } from "@/lib/money";
import { ConfirmSubmit } from "../../../confirm-submit";
import { cancelFiscalAction, emitFiscalAction, type FiscalActionState } from "../../actions";

export interface FiscalDocView {
  id: string;
  kind: FiscalKind;
  status: FiscalStatus;
  environment: FiscalEnvironment;
  number: number | null;
  series: number | null;
  accessKey: string | null;
  protocol: string | null;
  totalCents: number;
  rejectionReason: string | null;
  issuedAtText: string | null;
  cancelReason: string | null;
}

const initial: FiscalActionState = {};

function CancelDocForm({ documentId, saleId }: { documentId: string; saleId: string }) {
  const [state, action] = useActionState(cancelFiscalAction.bind(null, documentId, saleId), initial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.4rem", marginTop: "0.5rem" }}>
      <label>
        Justificativa do cancelamento da nota
        <input name="reason" style={{ display: "block", width: "100%" }} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {state.error}
        </p>
      )}
      <ConfirmSubmit message="Cancelar esta nota fiscal?">Cancelar nota</ConfirmSubmit>
    </form>
  );
}

export function FiscalSection({
  saleId,
  docs,
  canEmit,
  canCancel,
  blockedMessage,
}: {
  saleId: string;
  docs: FiscalDocView[];
  canEmit: boolean;
  canCancel: boolean;
  blockedMessage?: string;
}) {
  const [state, action, pending] = useActionState(emitFiscalAction.bind(null, saleId), initial);
  return (
    <section data-testid="fiscal-section">
      <h2>Nota fiscal</h2>
      {docs.length === 0 ? (
        <p>Nenhuma nota emitida.</p>
      ) : (
        <ul style={{ paddingLeft: "1rem" }}>
          {docs.map((d) => (
            <li key={d.id} data-testid="fiscal-doc" style={{ marginBottom: "0.75rem" }}>
              <strong>{FISCAL_KIND_LABEL[d.kind]}</strong> — <span data-testid="fiscal-status">{FISCAL_STATUS_LABEL[d.status]}</span> ·{" "}
              {formatBRL(d.totalCents)}
              <br />
              <span data-testid="fiscal-env" style={{ color: d.environment === "PRODUCTION" ? "inherit" : "crimson", fontWeight: "bold" }}>
                {ENVIRONMENT_LABEL[d.environment]}
              </span>
              {d.number !== null && d.status !== "REJECTED" && (
                <>
                  <br />
                  Nº {d.number} · série {d.series ?? "—"}
                  {d.issuedAtText ? ` · emitida em ${d.issuedAtText}` : ""}
                </>
              )}
              {d.accessKey && (
                <>
                  <br />
                  Chave: <code data-testid="fiscal-key">{d.accessKey}</code>
                </>
              )}
              {d.protocol && (
                <>
                  <br />
                  Protocolo: {d.protocol}
                </>
              )}
              {d.rejectionReason && (
                <p data-testid="fiscal-rejection" style={{ color: "crimson", margin: "0.25rem 0 0" }}>
                  Motivo da rejeição: {d.rejectionReason}
                </p>
              )}
              {d.cancelReason && <p style={{ margin: "0.25rem 0 0" }}>Cancelada. Justificativa: {d.cancelReason}</p>}
              {d.status === "AUTHORIZED" && canCancel && <CancelDocForm documentId={d.id} saleId={saleId} />}
            </li>
          ))}
        </ul>
      )}

      {blockedMessage && <p data-testid="fiscal-blocked">{blockedMessage}</p>}
      {canEmit && !blockedMessage && (
        <form action={action} style={{ display: "grid", gap: "0.5rem" }}>
          {state.error && (
            <p role="alert" style={{ color: "crimson" }}>
              {state.error}
            </p>
          )}
          {state.ok && <p role="status">Nota emitida.</p>}
          <button type="submit" disabled={pending}>
            {pending ? "Emitindo..." : "Emitir nota fiscal"}
          </button>
        </form>
      )}
    </section>
  );
}
