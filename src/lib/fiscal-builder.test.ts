import { describe, expect, it } from "vitest";
import { buildFiscalDrafts, RETURNS_BLOCK_MESSAGE } from "./fiscal-builder";
import { createSale, prepareSale } from "./sales-service";
import { adminA, adminB, attA, createWorld, type World } from "./testing/memory-world";

const product = (quantity = 1, productId = "prA1") => ({ kind: "PRODUCT", productId, quantity });
const service = (quantity = 1) => ({ kind: "SERVICE", serviceId: "svA1", quantity });
const appointment = { kind: "APPOINTMENT", appointmentId: "aA1" };

async function build(w: World, saleOver: Record<string, unknown>, tenant: "A" | "B" = "A") {
  const who = tenant === "A" ? attA : adminB;
  const sale = await createSale(w.sales, who, { paymentMethod: "PIX", ...saleOver });
  const ctx = (await w.fiscal.loadEmissionContext(tenant, sale.id))!;
  return { sale, ctx, result: buildFiscalDrafts(ctx) };
}

describe("o que vira cada nota", () => {
  it("só produtos: uma NFC-e com os dados fiscais do produto, o emitente e o pagamento", async () => {
    const w = createWorld();
    const { result } = await build(w, { items: [product(2)] });
    expect(result.problems).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    const d = result.drafts[0];
    expect(d).toMatchObject({ kind: "NFCE", saleNumber: 1, totalCents: 6000, customerName: null });
    expect(d.issuer).toMatchObject({ legalName: "Pet Shop A Comércio LTDA", cnpj: "11222333000181", taxRegime: "SIMPLES_NACIONAL", state: "BA" });
    expect(d.items).toEqual([
      { description: "Shampoo", quantity: 2, unit: "UN", unitPriceCents: 3000, grossCents: 6000, netCents: 6000, ncm: "33051000", cfop: "5102", csosn: "102", serviceCode: null, issRateBp: null },
    ]);
    expect(d.payments).toEqual([{ method: "PIX", code: "17", amountCents: 6000 }]);
  });

  it("só serviço avulso: uma NFS-e com código do serviço e alíquota", async () => {
    const w = createWorld();
    const { result } = await build(w, { items: [service()] });
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({ kind: "NFSE", totalCents: 5000 });
    expect(result.drafts[0].items[0]).toMatchObject({ description: "Banho avulso", serviceCode: "05.08", issRateBp: 500, ncm: null });
  });

  it("venda mista: NFC-e para o produto e NFS-e para serviço + atendimento, e as somas fecham com a venda", async () => {
    const w = createWorld();
    const { sale, result } = await build(w, { items: [product(), service(), appointment] });
    const byKind = Object.fromEntries(result.drafts.map((d) => [d.kind, d]));
    expect(byKind.NFCE.totalCents).toBe(3000);
    expect(byKind.NFSE.totalCents).toBe(10000);
    expect(byKind.NFSE.items.map((i) => i.description)).toEqual(["Banho avulso", "Banho — Thor"]);
    expect(result.drafts.reduce((s, d) => s + d.totalCents, 0)).toBe(sale.totalCents);
  });

  it("o desconto é rateado entre os itens e a soma de cada nota é exata", async () => {
    const w = createWorld();
    const { sale, result } = await build(w, { items: [product(), service()], discount: "5,00" }); // 8000 − 500 = 7500
    const [nfce, nfse] = [result.drafts.find((d) => d.kind === "NFCE")!, result.drafts.find((d) => d.kind === "NFSE")!];
    expect([nfce.totalCents, nfse.totalCents]).toEqual([2813, 4687]);
    expect(nfce.totalCents + nfse.totalCents).toBe(sale.totalCents);
    expect(nfce.items[0]).toMatchObject({ grossCents: 3000, netCents: 2813 });
  });

  it("troca com crédito: a nota registra o pagamento na forma escolhida mais o crédito da loja", async () => {
    const w = createWorld();
    const prepared = await prepareSale(w.sales, attA, { items: [product(1, "prA2")], paymentMethod: "CASH" });
    const created = await w.sales.createSaleAtomic("A", { ...prepared, creditAppliedCents: 3000 });
    if (!created.ok) throw new Error("falhou");
    const ctx = (await w.fiscal.loadEmissionContext("A", created.sale.id))!;
    const d = buildFiscalDrafts(ctx).drafts[0];
    expect(d.totalCents).toBe(12000);
    expect(d.payments).toEqual([
      { method: "CASH", code: "01", amountCents: 9000 },
      { method: "STORE_CREDIT", code: "05", amountCents: 3000 },
    ]);
  });

  it("o nome do cliente vai na nota quando a venda tem cliente", async () => {
    const w = createWorld();
    const { result } = await build(w, { items: [product()], customerId: "cA2" });
    expect(result.drafts[0].customerName).toBe("Dora");
  });
});

describe("o que impede a emissão", () => {
  it("empresa sem dados fiscais: lista tudo que falta, de uma vez", async () => {
    const w = createWorld();
    const { result } = await build(w, { items: [{ kind: "PRODUCT", productId: "prB1", quantity: 1 }] }, "B");
    expect(result.drafts).toEqual([]);
    expect(result.problems[0]).toBe(
      "Dados da empresa incompletos: Razão social, CNPJ, Regime tributário, Endereço, Cidade, UF, CEP, Inscrição estadual (preencha em Configurações)",
    );
  });

  it("NFC-e exige inscrição estadual; NFS-e exige inscrição municipal", async () => {
    const w = createWorld();
    w.state.companies.A.stateRegistration = null;
    w.state.companies.A.municipalRegistration = null;
    expect((await build(w, { items: [product()] })).result.problems).toEqual([
      "Dados da empresa incompletos: Inscrição estadual (preencha em Configurações)",
    ]);
    expect((await build(w, { items: [service()] })).result.problems).toEqual([
      "Dados da empresa incompletos: Inscrição municipal (preencha em Configurações)",
    ]);
  });

  it("produto sem NCM, CFOP ou CSOSN", async () => {
    const w = createWorld();
    w.state.fiscal.product.prA1 = {};
    const { result } = await build(w, { items: [product()] });
    expect(result.problems).toEqual([
      'Produto "Shampoo": informe o NCM (8 dígitos)',
      'Produto "Shampoo": informe o CFOP (4 dígitos)',
      'Produto "Shampoo": informe o CSOSN (3 dígitos)',
    ]);
    expect(result.drafts).toEqual([]);
  });

  it("serviço (e serviço do atendimento) sem código ou alíquota", async () => {
    const w = createWorld();
    w.state.fiscal.service.svA1 = { serviceCode: "5.8" };
    w.state.fiscal.appointment.aA1 = { serviceCode: "05.08", issRateBp: null };
    const { result } = await build(w, { items: [service(), appointment] });
    expect(result.problems).toEqual([
      'Serviço "Banho avulso": informe o código do serviço (LC 116, ex.: 05.08)',
      'Serviço "Banho avulso": informe a alíquota do ISS',
      'Serviço "Banho — Thor": informe a alíquota do ISS',
    ]);
  });

  it("alíquota de ISS zero é um valor válido (isento), não um dado faltando", async () => {
    const w = createWorld();
    w.state.fiscal.service.svA1 = { serviceCode: "05.08", issRateBp: 0 };
    expect((await build(w, { items: [service()] })).result.problems).toEqual([]);
  });

  it("os mesmos problemas não se repetem", async () => {
    const w = createWorld();
    w.state.fiscal.product.prA1 = {};
    const { result } = await build(w, { items: [product(3)] });
    expect(new Set(result.problems).size).toBe(result.problems.length);
  });

  it("CSOSN só é exigido no Simples/MEI; Lucro Presumido/Real ainda não é suportado", async () => {
    const w = createWorld();
    w.state.companies.A.taxRegime = "LUCRO_PRESUMIDO";
    const { result } = await build(w, { items: [product()] });
    expect(result.problems).toEqual([
      "O regime tributário Lucro Presumido ainda não é suportado na emissão automática (use MEI ou Simples Nacional, ou emita pelo sistema do seu contador)",
    ]);
    w.state.companies.A.taxRegime = "MEI";
    expect((await build(w, { items: [product()] })).result.problems).toEqual([]);
  });

  it("venda com devolução não recebe nota automática", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product(2)] });
    w.state.sales.find((s) => s.id === sale.id)!.returnedValueCents = 3000;
    const ctx = (await w.fiscal.loadEmissionContext("A", sale.id))!;
    expect(buildFiscalDrafts(ctx).problems).toContain(RETURNS_BLOCK_MESSAGE);
  });

  it("venda cancelada não recebe nota", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product()] });
    w.state.sales.find((s) => s.id === sale.id)!.status = "CANCELED";
    const ctx = (await w.fiscal.loadEmissionContext("A", sale.id))!;
    expect(buildFiscalDrafts(ctx).problems).toEqual(["Só vendas concluídas podem ter nota fiscal"]);
  });

  it("venda totalmente descontada (valor zero) não tem o que emitir", async () => {
    const w = createWorld();
    const { result } = await build(w, { items: [product()], discount: "30" });
    expect(result.drafts).toEqual([]);
    expect(result.problems).toEqual(["O valor da NFC-e seria zero (venda totalmente descontada): não há o que emitir"]);
  });
});

describe("notas já emitidas", () => {
  it("o tipo que já tem nota autorizada (ou processando) não é emitido de novo; o outro continua pendente", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product(), service()] });
    w.addDoc(sale.id, "NFCE", "AUTHORIZED");
    const result = buildFiscalDrafts((await w.fiscal.loadEmissionContext("A", sale.id))!);
    expect(result.alreadyIssued).toEqual(["NFCE"]);
    expect(result.drafts.map((d) => d.kind)).toEqual(["NFSE"]);
  });

  it("tudo emitido: nada a fazer e nenhum problema", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product()] });
    w.addDoc(sale.id, "NFCE", "PROCESSING");
    expect(buildFiscalDrafts((await w.fiscal.loadEmissionContext("A", sale.id))!)).toMatchObject({ drafts: [], problems: [], alreadyIssued: ["NFCE"] });
  });

  it("nota rejeitada ou cancelada não conta: dá para emitir de novo", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product()] });
    w.addDoc(sale.id, "NFCE", "REJECTED");
    w.addDoc(sale.id, "NFCE", "CANCELED");
    const result = buildFiscalDrafts((await w.fiscal.loadEmissionContext("A", sale.id))!);
    expect(result.alreadyIssued).toEqual([]);
    expect(result.drafts).toHaveLength(1);
  });
});

describe("isolamento", () => {
  it("a empresa e as notas de um pet shop não aparecem no contexto do outro", async () => {
    const w = createWorld();
    const { sale } = await build(w, { items: [product()] });
    expect(await w.fiscal.loadEmissionContext("B", sale.id)).toBeNull();
    expect(adminA.tenantId).not.toBe(adminB.tenantId);
  });
});
