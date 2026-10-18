import { describe, expect, it } from "vitest";
import type { FiscalDraft } from "./fiscal-builder";
import { SimulatedFiscalProvider, getFiscalProvider, type FiscalRequest } from "./fiscal-provider";

const draft: FiscalDraft = {
  kind: "NFCE",
  saleNumber: 1,
  issuer: {
    tradeName: "Pet",
    legalName: "Pet LTDA",
    cnpj: "11222333000181",
    stateRegistration: "1",
    municipalRegistration: null,
    taxRegime: "SIMPLES_NACIONAL",
    addressLine: "Rua A",
    city: "Salvador",
    state: "BA",
    zipCode: "40010000",
    phone: null,
  },
  items: [{ description: "Shampoo", quantity: 1, unit: "UN", unitPriceCents: 3000, grossCents: 3000, netCents: 3000, ncm: "33051000", cfop: "5102", csosn: "102", serviceCode: null, issRateBp: null }],
  totalCents: 3000,
  payments: [{ method: "PIX", code: "17", amountCents: 3000 }],
  customerName: null,
};
const req = (over: Partial<FiscalRequest> = {}): FiscalRequest => ({ ...draft, sequence: 7, environment: "SIMULATED", ...over });
const NOW = new Date("2026-10-13T15:00:00.000Z");

describe("provedor simulado", () => {
  it("autoriza com número, chave e protocolo FICTÍCIOS, claramente marcados como simulados", async () => {
    const r = await new SimulatedFiscalProvider(() => NOW).emit(req());
    expect(r).toEqual({
      status: "AUTHORIZED",
      number: 7,
      series: 1,
      accessKey: "SIMULADO-NFCE-11222333000181-000000007",
      protocol: "SIM-000000007",
      issuedAt: NOW,
      providerRef: "SIMULADO-NFCE-11222333000181-000000007",
    });
  });

  it("o ambiente é SIMULATED (sem validade fiscal)", () => {
    expect(new SimulatedFiscalProvider().environment).toBe("SIMULATED");
  });

  it("rejeita nota de valor zero ou sem itens", async () => {
    const p = new SimulatedFiscalProvider();
    expect(await p.emit(req({ totalCents: 0 }))).toEqual({ status: "REJECTED", reason: "Valor total da nota é zero" });
    expect(await p.emit(req({ items: [] }))).toEqual({ status: "REJECTED", reason: "Nota sem itens" });
  });

  it("cancela chaves simuladas e recusa as de outro provedor", async () => {
    const p = new SimulatedFiscalProvider();
    expect(await p.cancel({ accessKey: "SIMULADO-NFCE-1-000000007", reason: "Erro de digitação" })).toEqual({ ok: true, protocol: "SIM-CANC-000000007" });
    expect(await p.cancel({ accessKey: "35260111222333000181650010000000071000000010", reason: "x" })).toMatchObject({ ok: false });
  });
});

describe("getFiscalProvider", () => {
  it("o padrão é o simulado", () => {
    expect(getFiscalProvider(undefined)).toBeInstanceOf(SimulatedFiscalProvider);
    expect(getFiscalProvider("simulated")).toBeInstanceOf(SimulatedFiscalProvider);
    expect(getFiscalProvider("  SIMULATED ")).toBeInstanceOf(SimulatedFiscalProvider);
    expect(getFiscalProvider("")).toBeInstanceOf(SimulatedFiscalProvider);
  });
  it("provedor desconhecido é erro de configuração (não cai no simulado em silêncio)", () => {
    expect(() => getFiscalProvider("focusnfe")).toThrow(/não está configurado/);
  });
});
