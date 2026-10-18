import { z } from "zod";
import { buildFiscalDrafts, type EmissionContext, type FiscalDocumentRecord, type FiscalDraft } from "./fiscal-builder";
import {
  FISCAL_CANCEL_REASON_MAX,
  FISCAL_CANCEL_REASON_MIN,
  FISCAL_CANCEL_WINDOW_MINUTES,
  type FiscalEnvironment,
  type FiscalKind,
} from "./fiscal-constants";
import type { EmitResult, FiscalProvider } from "./fiscal-provider";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertCan } from "./permissions";
import type { SessionPayload } from "./session";

export type ReserveResult =
  | { ok: true; id: string; sequence: number }
  | { ok: false; reason: "ALREADY_ACTIVE" | "SALE_NOT_FOUND" | "SALE_BLOCKED" };

/**
 * `reserveDocument` precisa ser ATÔMICO e serializado por venda (trava): confere que a venda continua concluída e sem
 * devoluções e que não há outra nota do mesmo tipo em andamento, e já grava o documento como PROCESSING.
 * Assim, duas pessoas clicando "Emitir" ao mesmo tempo não geram duas notas.
 */
export interface FiscalRepo {
  loadEmissionContext(tenantId: string, saleId: string): Promise<EmissionContext | null>;
  reserveDocument(
    tenantId: string,
    data: { saleId: string; kind: FiscalKind; environment: FiscalEnvironment; totalCents: number; request: FiscalDraft; userId: string },
  ): Promise<ReserveResult>;
  completeDocument(tenantId: string, id: string, result: EmitResult): Promise<FiscalDocumentRecord | null>;
  listDocuments(tenantId: string, saleId: string): Promise<FiscalDocumentRecord[]>;
  findDocument(tenantId: string, id: string): Promise<FiscalDocumentRecord | null>;
  markCanceled(tenantId: string, id: string, c: { reason: string; now: Date; protocol: string }): Promise<FiscalDocumentRecord | null>;
}

export const ALREADY_ISSUED_MESSAGE = "Esta venda já possui nota fiscal emitida";
export const CANCEL_REASON_MESSAGE = `A justificativa deve ter de ${FISCAL_CANCEL_REASON_MIN} a ${FISCAL_CANCEL_REASON_MAX} caracteres`;
export const CANCEL_WINDOW_MESSAGE = `O prazo para cancelar a nota (${FISCAL_CANCEL_WINDOW_MINUTES} minutos) expirou. Para corrigir, procure o seu contador`;

const cancelSchema = z.object({
  reason: z
    .string({ required_error: CANCEL_REASON_MESSAGE, invalid_type_error: CANCEL_REASON_MESSAGE })
    .trim()
    .min(FISCAL_CANCEL_REASON_MIN, CANCEL_REASON_MESSAGE)
    .max(FISCAL_CANCEL_REASON_MAX, CANCEL_REASON_MESSAGE),
});

const reserveError = (reason: "ALREADY_ACTIVE" | "SALE_NOT_FOUND" | "SALE_BLOCKED") =>
  reason === "SALE_NOT_FOUND"
    ? new NotFoundError("Venda")
    : reason === "SALE_BLOCKED"
      ? new ConflictError("A venda mudou (devolução ou cancelamento) e não pode mais receber nota fiscal")
      : new ConflictError(ALREADY_ISSUED_MESSAGE);

/**
 * Emite as notas pendentes da venda: uma NFC-e para os produtos e uma NFS-e para os serviços.
 * Cada nota é gravada como PROCESSING ANTES de falar com o provedor; se o provedor falhar, vira REJEITADA (com o motivo)
 * e pode ser emitida de novo.
 */
export async function emitFiscalDocuments(repo: FiscalRepo, provider: FiscalProvider, session: SessionPayload, saleId: string) {
  assertCan(session, "sell");
  const tenantId = session.tenantId;
  const ctx = await repo.loadEmissionContext(tenantId, saleId);
  if (!ctx) throw new NotFoundError("Venda");

  const built = buildFiscalDrafts(ctx);
  if (built.problems.length > 0) throw new ValidationError(built.problems.join("; "));
  if (built.drafts.length === 0) throw new ConflictError(ALREADY_ISSUED_MESSAGE);

  const results: FiscalDocumentRecord[] = [];
  for (const draft of built.drafts) {
    const reserved = await repo.reserveDocument(tenantId, {
      saleId,
      kind: draft.kind,
      environment: provider.environment,
      totalCents: draft.totalCents,
      request: draft,
      userId: session.userId,
    });
    if (!reserved.ok) throw reserveError(reserved.reason);

    let result: EmitResult;
    try {
      result = await provider.emit({ ...draft, sequence: reserved.sequence, environment: provider.environment });
    } catch (e) {
      result = { status: "REJECTED", reason: `Falha de comunicação com o provedor fiscal: ${e instanceof Error ? e.message : "erro desconhecido"}` };
    }
    const doc = await repo.completeDocument(tenantId, reserved.id, result);
    if (doc) results.push(doc);
  }
  return results;
}

/** Cancela uma nota AUTORIZADA, com justificativa e dentro do prazo. Só ADMIN. */
export async function cancelFiscalDocument(
  repo: FiscalRepo,
  provider: FiscalProvider,
  session: SessionPayload,
  documentId: string,
  raw: unknown,
  deps: { now?: Date } = {},
) {
  assertCan(session, "delete");
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const doc = await repo.findDocument(session.tenantId, documentId);
  if (!doc) throw new NotFoundError("Nota fiscal");
  if (doc.status !== "AUTHORIZED" || !doc.accessKey || !doc.issuedAt) {
    throw new ValidationError("Só notas autorizadas podem ser canceladas");
  }
  const now = deps.now ?? new Date();
  if (now.getTime() - doc.issuedAt.getTime() > FISCAL_CANCEL_WINDOW_MINUTES * 60_000) throw new ValidationError(CANCEL_WINDOW_MESSAGE);

  let res;
  try {
    res = await provider.cancel({ accessKey: doc.accessKey, reason: parsed.data.reason });
  } catch (e) {
    res = { ok: false as const, reason: e instanceof Error ? e.message : "erro desconhecido" };
  }
  if (!res.ok) throw new ConflictError(`O provedor recusou o cancelamento: ${res.reason}`);

  const canceled = await repo.markCanceled(session.tenantId, documentId, { reason: parsed.data.reason, now, protocol: res.protocol });
  if (!canceled) throw new ConflictError("A nota mudou de situação e não pôde ser cancelada");
  return canceled;
}

export async function listFiscalDocuments(repo: FiscalRepo, session: SessionPayload, saleId: string) {
  assertCan(session, "sell");
  return repo.listDocuments(session.tenantId, saleId);
}
