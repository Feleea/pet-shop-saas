import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  EXCEEDS_PAID_MESSAGE,
  NOT_COMPLETED_MESSAGE,
  createReturn,
  getReturn,
  listReturnsForSale,
  type ReturnsRepo,
} from "./returns-service";
import {
  HAS_FISCAL_DOCUMENT_MESSAGE,
  HAS_RETURNS_MESSAGE,
  cancelSale,
  createSale,
  listBillableAppointments,
  listSales,
  type SaleDetail,
  type SalesRepo,
} from "./sales-service";
import { ForbiddenError } from "./tenant";
import { adminA, adminB, attA, createWorld, groomerA, vetA, type World } from "./testing/memory-world";

const P1 = (quantity: number) => ({ kind: "PRODUCT", productId: "prA1", quantity }); // Shampoo, R$ 30,00
const P2 = (quantity: number) => ({ kind: "PRODUCT", productId: "prA2", quantity }); // Ração, R$ 120,00
const SV = (quantity = 1) => ({ kind: "SERVICE", serviceId: "svA1", quantity }); // Banho avulso, R$ 50,00
const APPT = { kind: "APPOINTMENT", appointmentId: "aA1" }; // Banho do Thor, R$ 50,00

const sell = (w: World, items: unknown[], over: Record<string, unknown> = {}, who = attA) =>
  createSale(w.sales, who, { items, paymentMethod: "PIX", ...over });

/** Devolve itens da venda: pares [posição do item, quantidade]. */
const give = (w: World, sale: SaleDetail, pairs: [number, number][], over: Record<string, unknown> = {}, who = attA) =>
  createReturn(w.repos, who, sale.id, {
    reason: "Defeito de fábrica",
    restock: true,
    items: pairs.map(([i, quantity]) => ({ saleItemId: sale.items[i].id, quantity })),
    ...over,
  });

const stock = (w: World, id: string) => w.state.products.find((p) => p.id === id)!.stock;
const stored = (w: World, sale: SaleDetail) => w.state.sales.find((s) => s.id === sale.id)!;

describe("devolução parcial", () => {
  it("devolve parte de um item: valor, dinheiro de volta, estoque e histórico", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]); // R$ 120,00; estoque 10 → 6
    const { ret, exchangeSale } = await give(w, sale, [[0, 1]]);

    expect(exchangeSale).toBeNull();
    expect(ret).toMatchObject({
      number: 1,
      saleNumber: 1,
      valueCents: 3000,
      appliedCents: 0,
      refundCents: 3000,
      refundMethod: "PIX", // por padrão, a forma de pagamento da venda
      restocked: true,
      exchangeSaleId: null,
      createdByName: "Atendente",
      reason: "Defeito de fábrica",
    });
    expect(ret.items).toMatchObject([{ description: "Shampoo", kind: "PRODUCT", quantity: 1, valueCents: 3000, restocked: true }]);
    expect(stock(w, "prA1")).toBe(7);
    expect(stored(w, sale)).toMatchObject({ status: "COMPLETED", returnedValueCents: 3000, refundedCents: 3000 });
    expect(stored(w, sale).items[0].returnedQuantity).toBe(1);
    expect(w.state.movements.at(-1)).toMatchObject({ type: "RETURN", quantity: 1, note: "Devolução #1 (venda #1)" });
  });

  it("produto avariado: devolve o dinheiro mas NÃO volta ao estoque", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    const { ret } = await give(w, sale, [[0, 2]], { restock: false });
    expect(ret.items[0].restocked).toBe(false);
    expect(ret.restocked).toBe(false);
    expect(stock(w, "prA1")).toBe(6);
    expect(w.state.movements.filter((m) => m.type === "RETURN")).toHaveLength(0);
  });

  it("devolve em etapas até zerar e a soma devolvida fecha exatamente com o total da venda", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    const values = [];
    for (const q of [1, 2, 1]) values.push((await give(w, sale, [[0, q]])).ret.valueCents);
    expect(values).toEqual([3000, 6000, 3000]);
    expect(stored(w, sale).returnedValueCents).toBe(12000);
    expect(stock(w, "prA1")).toBe(10);
  });

  it("não deixa devolver mais do que foi vendido (e a mensagem diz quanto ainda dá)", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    await give(w, sale, [[0, 3]]);
    await expect(give(w, sale, [[0, 2]])).rejects.toThrow(
      new ValidationError("Quantidade acima do disponível para devolução de Shampoo (disponível: 1)"),
    );
    expect(stored(w, sale).items[0].returnedQuantity).toBe(3);
  });

  it("linhas repetidas do mesmo item são somadas antes de conferir", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    await expect(give(w, sale, [[0, 3], [0, 3]])).rejects.toThrow("(disponível: 4)");
    const { ret } = await give(w, sale, [[0, 2], [0, 2]]);
    expect(ret.items).toHaveLength(1);
    expect(ret.items[0].quantity).toBe(4);
  });

  it("o desconto da venda é rateado: 2 unidades com R$ 6,00 de desconto devolvem R$ 27,00 + R$ 27,00", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)], { discount: "6" }); // 6000 − 600 = 5400
    expect((await give(w, sale, [[0, 1]])).ret.valueCents).toBe(2700);
    expect((await give(w, sale, [[0, 1]])).ret.valueCents).toBe(2700);
    expect(stored(w, sale)).toMatchObject({ returnedValueCents: 5400, refundedCents: 5400 });
  });

  it("centavos que não dividem certo são acertados na última devolução (R$ 3,33 × 3 com R$ 0,01 de desconto)", async () => {
    const w = createWorld();
    w.state.products.find((p) => p.id === "prA1")!.priceCents = 333;
    const sale = await sell(w, [P1(3)], { discount: "0,01" }); // 999 − 1 = 998
    const values = [];
    for (let i = 0; i < 3; i++) values.push((await give(w, sale, [[0, 1]])).ret.valueCents);
    expect(values).toEqual([333, 333, 332]);
    expect(values.reduce((a, b) => a + b, 0)).toBe(998);
  });

  it("o valor de uma devolução com vários itens é dividido entre eles sem perder centavos", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2), P2(1)], { discount: "1" }); // 6000 + 12000 − 100 = 17900
    const { ret } = await give(w, sale, [[0, 1], [1, 1]]);
    expect(ret.valueCents).toBe(14917);
    expect(ret.items.map((i) => i.valueCents)).toEqual([2983, 11934]);
    expect(ret.items.reduce((s, i) => s + i.valueCents, 0)).toBe(ret.valueCents);
  });

  it("o dinheiro pode voltar por outra forma de pagamento", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)]);
    expect((await give(w, sale, [[0, 1]], { refundMethod: "CASH" })).ret.refundMethod).toBe("CASH");
  });

  it("devolver um serviço devolve o valor, sem mexer no estoque", async () => {
    const w = createWorld();
    const sale = await sell(w, [SV()]);
    const { ret } = await give(w, sale, [[0, 1]]);
    expect(ret).toMatchObject({ valueCents: 5000, refundCents: 5000 });
    expect(ret.items[0]).toMatchObject({ kind: "SERVICE", restocked: false });
    expect(w.state.movements).toHaveLength(0);
  });

  it("devolver o atendimento cobrado libera o atendimento para ser cobrado de novo", async () => {
    const w = createWorld();
    const sale = await sell(w, [APPT]);
    expect((await listBillableAppointments(w.sales, attA)).map((a) => a.id)).not.toContain("aA1");
    await give(w, sale, [[0, 1]]);
    expect((await listBillableAppointments(w.sales, attA)).map((a) => a.id)).toContain("aA1");
    await expect(sell(w, [APPT])).resolves.toBeTruthy();
  });
});

describe("troca", () => {
  const swap = (items: unknown[], extra: Record<string, unknown> = {}) => ({ exchange: { items, ...extra } });

  it("troca por algo mais caro: o valor devolvido vira crédito e o cliente paga só a diferença", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]); // estoque Shampoo 8
    const { ret, exchangeSale } = await give(w, sale, [[0, 1]], swap([P2(1)], { paymentMethod: "CASH" }));

    expect(ret).toMatchObject({ valueCents: 3000, appliedCents: 3000, refundCents: 0, refundMethod: null, exchangeSaleNumber: 2 });
    expect(exchangeSale).toMatchObject({
      number: 2,
      subtotalCents: 12000,
      totalCents: 12000,
      creditAppliedCents: 3000,
      paymentMethod: "CASH",
      notes: "Troca (devolução da venda #1)",
    });
    expect(ret.exchangeSaleId).toBe(exchangeSale!.id);
    expect(stock(w, "prA1")).toBe(9); // o devolvido voltou
    expect(stock(w, "prA2")).toBe(2); // o novo saiu
  });

  it("troca por algo mais barato: a diferença volta em dinheiro (forma padrão ou escolhida)", async () => {
    const w = createWorld();
    const sale = await sell(w, [P2(1)]);
    const a = await give(w, sale, [[0, 1]], swap([P1(1)]));
    expect(a.ret).toMatchObject({ valueCents: 12000, appliedCents: 3000, refundCents: 9000, refundMethod: "PIX" });
    expect(a.exchangeSale!.paymentMethod).toBe("PIX"); // sem forma informada, usa a da venda original

    const w2 = createWorld();
    const sale2 = await sell(w2, [P2(1)]);
    const b = await give(w2, sale2, [[0, 1]], { ...swap([P1(1)]), refundMethod: "CASH" });
    expect(b.ret).toMatchObject({ refundCents: 9000, refundMethod: "CASH" });
  });

  it("troca de mesmo valor: ninguém paga nem recebe nada", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)]);
    const { ret, exchangeSale } = await give(w, sale, [[0, 1]], swap([P1(1)]));
    expect(ret).toMatchObject({ appliedCents: 3000, refundCents: 0, refundMethod: null });
    expect(exchangeSale).toMatchObject({ totalCents: 3000, creditAppliedCents: 3000 });
  });

  it("pode trocar por um serviço, e o cliente da venda acompanha a troca", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)], { customerId: "cA1" });
    const { exchangeSale } = await give(w, sale, [[0, 1]], swap([SV()]));
    expect(exchangeSale).toMatchObject({ customerId: "cA1", customerName: "Carlos", totalCents: 5000, creditAppliedCents: 3000 });
    expect(exchangeSale!.items[0].kind).toBe("SERVICE");
  });

  it("lista de troca vazia vale como devolução simples", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)]);
    const { ret, exchangeSale } = await give(w, sale, [[0, 1]], swap([]));
    expect(exchangeSale).toBeNull();
    expect(ret).toMatchObject({ refundCents: 3000, appliedCents: 0 });
  });

  it("É TUDO OU NADA: se a troca falha (sem estoque), a devolução também é desfeita", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    const err = await give(w, sale, [[0, 1]], swap([P2(99)])).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("Estoque insuficiente para Ração (disponível: 3)");

    expect(stored(w, sale)).toMatchObject({ returnedValueCents: 0, refundedCents: 0 });
    expect(stored(w, sale).items[0].returnedQuantity).toBe(0);
    expect(w.state.returns).toHaveLength(0);
    expect(w.state.sales).toHaveLength(1);
    expect(stock(w, "prA1")).toBe(8); // o devolvido NÃO voltou
    expect(stock(w, "prA2")).toBe(3);
    // e os números não foram gastos
    const ok = await give(w, sale, [[0, 1]]);
    expect(ok.ret.number).toBe(1);
  });

  it("troca não aceita atendimento agendado nem item inexistente", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)]);
    await expect(give(w, sale, [[0, 1]], swap([APPT]))).rejects.toThrow("Atendimentos agendados não entram em uma troca");
    await expect(give(w, sale, [[0, 1]], swap([{ kind: "PRODUCT", productId: "nao-existe", quantity: 1 }]))).rejects.toThrow("Produto indisponível");
    expect(w.state.returns).toHaveLength(0);
  });

  it("a venda nascida de uma troca só devolve em dinheiro o que foi pago (o crédito não vira dinheiro)", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    const { exchangeSale } = await give(w, sale, [[0, 1]], swap([P2(1)], { paymentMethod: "CASH" })); // total 12000, crédito 3000, pago 9000
    await expect(give(w, exchangeSale!, [[0, 1]])).rejects.toThrow(new ConflictError(EXCEEDS_PAID_MESSAGE));
    expect(stored(w, exchangeSale!).items[0].returnedQuantity).toBe(0);
  });
});

describe("regras que protegem o caixa e a nota fiscal", () => {
  it("venda com nota fiscal autorizada ou em processamento não aceita devolução", async () => {
    for (const status of ["AUTHORIZED", "PROCESSING"] as const) {
      const w = createWorld();
      const sale = await sell(w, [P1(2)]);
      w.addDoc(sale.id, "NFCE", status);
      await expect(give(w, sale, [[0, 1]])).rejects.toThrow(new ConflictError(HAS_FISCAL_DOCUMENT_MESSAGE));
      expect(stock(w, "prA1")).toBe(8);
    }
  });

  it("nota rejeitada ou cancelada não bloqueia", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    w.addDoc(sale.id, "NFCE", "REJECTED");
    w.addDoc(sale.id, "NFCE", "CANCELED");
    await expect(give(w, sale, [[0, 1]])).resolves.toBeTruthy();
  });

  it("venda cancelada não aceita devolução", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    await cancelSale(w.sales, adminA, sale.id, { reason: "Erro" });
    await expect(give(w, sale, [[0, 1]])).rejects.toThrow(new ValidationError(NOT_COMPLETED_MESSAGE));
  });

  it("venda com devolução não pode mais ser cancelada (o estoque não volta em dobro)", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    await give(w, sale, [[0, 1]]);
    const err = await cancelSale(w.sales, adminA, sale.id, { reason: "Erro" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(HAS_RETURNS_MESSAGE);
    expect(stock(w, "prA1")).toBe(7);
  });

  it("venda com nota fiscal ativa não pode ser cancelada", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(1)]);
    w.addDoc(sale.id);
    await expect(cancelSale(w.sales, adminA, sale.id, { reason: "Erro" })).rejects.toThrow(HAS_FISCAL_DOCUMENT_MESSAGE);
  });
});

describe("validação", () => {
  const raw = (w: World, sale: SaleDetail, over: Record<string, unknown>) =>
    createReturn(w.repos, attA, sale.id, { reason: "Defeito", restock: true, items: [{ saleItemId: sale.items[0].id, quantity: 1 }], ...over });

  it.each([
    [{ items: [] }, "Escolha ao menos um item para devolver"],
    [{ items: undefined }, "Escolha ao menos um item para devolver"],
    [{ items: "x" }, "Itens inválidos"],
    [{ reason: "" }, "Informe o motivo da devolução"],
    [{ reason: "ab" }, "Informe o motivo da devolução"],
    [{ reason: "x".repeat(201) }, "Máximo de 200 caracteres no motivo"],
    [{ refundMethod: "CHEQUE" }, "Forma de pagamento inválida"],
  ])("rejeita %j", async (over, message) => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    await expect(raw(w, sale, over)).rejects.toThrow(new ValidationError(message));
    expect(w.state.returns).toHaveLength(0);
  });

  it.each([0, -1, "abc", 10000])("quantidade inválida (%j)", async (quantity) => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    await expect(raw(w, sale, { items: [{ saleItemId: sale.items[0].id, quantity }] })).rejects.toThrow("Quantidade inválida (de 1 a 9999)");
  });

  it("item inexistente ou de outra venda é recusado", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    const other = await sell(w, [P2(1)]);
    await expect(raw(w, sale, { items: [{ saleItemId: "nao-existe", quantity: 1 }] })).rejects.toThrow("Item inválido");
    await expect(raw(w, sale, { items: [{ saleItemId: other.items[0].id, quantity: 1 }] })).rejects.toThrow("Item inválido");
  });
});

describe("numeração, consulta e resumo", () => {
  it("cada pet shop numera as próprias devoluções", async () => {
    const w = createWorld();
    const a = await sell(w, [P1(3)]);
    const b = await createSale(w.sales, adminB, { items: [{ kind: "PRODUCT", productId: "prB1", quantity: 2 }], paymentMethod: "CASH" });
    expect((await give(w, a, [[0, 1]])).ret.number).toBe(1);
    expect((await give(w, a, [[0, 1]])).ret.number).toBe(2);
    const rb = await createReturn(w.repos, adminB, b.id, { reason: "Defeito", restock: true, items: [{ saleItemId: b.items[0].id, quantity: 1 }] });
    expect(rb.ret.number).toBe(1);
  });

  it("consulta uma devolução e lista as de uma venda", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    const { ret } = await give(w, sale, [[0, 1]]);
    await give(w, sale, [[0, 2]]);
    expect(await getReturn(w.returns, attA, ret.id)).toMatchObject({ number: 1, items: [{ description: "Shampoo" }] });
    expect((await listReturnsForSale(w.returns, attA, sale.id)).map((r) => [r.number, r.refundCents])).toEqual([[1, 3000], [2, 6000]]);
  });

  it("o resumo do dia soma o que entrou e desconta o que voltou, por forma de pagamento", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]); // Pix R$ 60,00
    await give(w, sale, [[0, 1]], { refundMethod: "CASH" }); // devolveu R$ 30,00 em dinheiro
    const { summary, returns } = await listSales(w.sales, attA, {}, { now: w.clock.now });
    expect(returns).toHaveLength(1);
    expect(summary).toMatchObject({ completedCount: 1, returnCount: 1, soldCents: 6000, refundedCents: 3000, totalCents: 3000 });
    expect(summary.byMethod).toMatchObject({ PIX: 6000, CASH: -3000 });
  });

  it("na troca, só a diferença paga entra como dinheiro recebido", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]); // Pix 6000
    await give(w, sale, [[0, 1]], { exchange: { items: [P2(1)], paymentMethod: "CASH" } });
    const { summary } = await listSales(w.sales, attA, {}, { now: w.clock.now });
    expect(summary.byMethod).toMatchObject({ PIX: 6000, CASH: 9000 }); // 12000 − 3000 de crédito
    expect(summary.totalCents).toBe(15000);
    expect(summary.soldCents).toBe(6000 + 12000);
  });
});

describe("ISOLAMENTO entre tenants", () => {
  it("outro pet shop não devolve, não consulta nem lista as devoluções alheias (404)", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(2)]);
    const { ret } = await give(w, sale, [[0, 1]]);
    await expect(
      createReturn(w.repos, adminB, sale.id, { reason: "Invasão", restock: true, items: [{ saleItemId: sale.items[0].id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(getReturn(w.returns, adminB, ret.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listReturnsForSale(w.returns, adminB, sale.id)).toEqual([]);
    expect(stored(w, sale).items[0].returnedQuantity).toBe(1);
  });
});

describe("permissões", () => {
  it("ATTENDANT e ADMIN devolvem; GROOMER e VET não", async () => {
    const w = createWorld();
    const sale = await sell(w, [P1(4)]);
    await expect(give(w, sale, [[0, 1]], {}, attA)).resolves.toBeTruthy();
    await expect(give(w, sale, [[0, 1]], {}, adminA)).resolves.toBeTruthy();
    for (const who of [groomerA, vetA]) {
      await expect(give(w, sale, [[0, 1]], {}, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getReturn(w.returns, who, "x")).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = <T extends object>() => new Proxy({} as T, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(
      createReturn({ sales: spy<SalesRepo>(), returns: spy<ReturnsRepo>() }, groomerA, "x", { reason: "abc", restock: true, items: [] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
