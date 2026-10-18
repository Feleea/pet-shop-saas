import type { FiscalDraft } from "./fiscal-builder";
import type { FiscalEnvironment } from "./fiscal-constants";

export type FiscalRequest = FiscalDraft & { sequence: number; environment: FiscalEnvironment };

export type EmitResult =
  | { status: "AUTHORIZED"; number: number; series: number; accessKey: string; protocol: string; issuedAt: Date; providerRef: string }
  | { status: "REJECTED"; reason: string };
export type CancelResult = { ok: true; protocol: string } | { ok: false; reason: string };

/**
 * Ponto de integração com o emissor de notas (SEFAZ/prefeitura, direto ou via provedor como Focus NFe, eNotas etc.).
 * Hoje só existe o provedor SIMULADO. Para emitir de verdade, implemente esta interface para o provedor
 * contratado e escolha-o em `getFiscalProvider` (veja docs/FISCAL.md).
 */
export interface FiscalProvider {
  readonly name: string;
  readonly environment: FiscalEnvironment;
  emit(request: FiscalRequest): Promise<EmitResult>;
  cancel(args: { accessKey: string; reason: string }): Promise<CancelResult>;
}

/**
 * Provedor de TESTE. Não fala com SEFAZ nem prefeitura: gera número, chave e protocolo FICTÍCIOS (prefixo SIMULADO).
 * Os documentos dele NÃO têm validade fiscal. Serve para homologar o fluxo (dados, telas, status, cancelamento).
 */
export class SimulatedFiscalProvider implements FiscalProvider {
  readonly name = "Simulado (sem validade fiscal)";
  readonly environment = "SIMULATED" as const;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async emit(request: FiscalRequest): Promise<EmitResult> {
    if (request.totalCents <= 0) return { status: "REJECTED", reason: "Valor total da nota é zero" };
    if (request.items.length === 0) return { status: "REJECTED", reason: "Nota sem itens" };
    const key = `SIMULADO-${request.kind}-${request.issuer.cnpj}-${String(request.sequence).padStart(9, "0")}`;
    return {
      status: "AUTHORIZED",
      number: request.sequence,
      series: 1,
      accessKey: key,
      protocol: `SIM-${String(request.sequence).padStart(9, "0")}`,
      issuedAt: this.clock(),
      providerRef: key,
    };
  }

  async cancel({ accessKey }: { accessKey: string; reason: string }): Promise<CancelResult> {
    if (!accessKey.startsWith("SIMULADO-")) return { ok: false, reason: "Chave não pertence ao provedor simulado" };
    return { ok: true, protocol: `SIM-CANC-${accessKey.slice(-9)}` };
  }
}

/** Escolhe o provedor pela variável FISCAL_PROVIDER (padrão: simulated). Valor desconhecido é erro de configuração. */
export function getFiscalProvider(name: string | undefined = process.env.FISCAL_PROVIDER): FiscalProvider {
  const chosen = (name ?? "simulated").trim().toLowerCase();
  if (chosen === "simulated" || chosen === "") return new SimulatedFiscalProvider();
  throw new Error(`Provedor fiscal "${name}" não está configurado. Veja docs/FISCAL.md.`);
}
