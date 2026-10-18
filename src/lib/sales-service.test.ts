import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import type { Role, SessionPayload } from "./session";
import { ForbiddenError } from "./tenant";
import {
  ALREADY_CANCELED_MESSAGE,
  APPOINTMENT_UNAVAILABLE_MESSAGE,
  cancelSale,
  createSale,
  getSale,
  listBillableAppointments,
  listSales,
  prepareSale,
  summarizeSales,
  type AppointmentForSale,
  type SaleDetail,
  type SalesRepo,
} from "./sales-service";

interface P {
  id: string;
  tenantId: string;
  name: string;
  priceCents: number;
  active: boolean;
  stock: number;
}

// Mundo em memória com a MESMA semântica atômica do repositório Prisma: tudo ou nada, nunca estoque negativo,
// atendimento cobrado uma vez só, numeração por pet shop.
function world() {
  const clock = { now: new Date("2026-10-13T15:00:00.000Z") };
  const hooks: { afterLookup?: () => void } = {};
  const users: Record<string, string> = { "admin-A": "Dono", "att-A": "Atendente", "admin-B": "Dona B" };
  const customers = [
    { id: "cA1", tenantId: "A", name: "Carlos" },
    { id: "cA2", tenantId: "A", name: "Dora" },
    { id: "cB1", tenantId: "B", name: "Beto" },
  ];
  const products: P[] = [
    { id: "prA1", tenantId: "A", name: "Shampoo", priceCents: 3000, active: true, stock: 10 },
    { id: "prA2", tenantId: "A", name: "Ração", priceCents: 12000, active: true, stock: 3 },
    { id: "prA3", tenantId: "A", name: "Coleira", priceCents: 2500, active: false, stock: 5 },
    { id: "prB1", tenantId: "B", name: "Shampoo", priceCents: 3500, active: true, stock: 5 },
  ];
  const appt = (id: string, tenantId: string, customerId: string, customerName: string, petName: string, serviceName: string, priceCents: number, status: AppointmentForSale["status"] = "COMPLETED") => ({
    id,
    tenantId,
    customerId,
    customerName,
    petName,
    serviceName,
    priceCents,
    status,
    startsAt: new Date("2026-10-12T13:00:00.000Z"),
    billed: false,
  });
  const appts = [
    appt("aA1", "A", "cA1", "Carlos", "Thor", "Banho", 5000),
    appt("aA2", "A", "cA1", "Carlos", "Mia", "Tosa", 8000),
    appt("aA3", "A", "cA2", "Dora", "Rex", "Banho", 5000),
    appt("aA4", "A", "cA1", "Carlos", "Thor", "Banho", 5000, "SCHEDULED"),
    appt("aB1", "B", "cB1", "Beto", "Bidu", "Banho", 6000),
  ];
  const services = [
    { id: "svA1", tenantId: "A", name: "Banho avulso", priceCents: 5000, active: true },
    { id: "svA2", tenantId: "A", name: "Tosa avulsa", priceCents: 8000, active: false },
    { id: "svB1", tenantId: "B", name: "Banho avulso", priceCents: 6000, active: true },
  ];
  const sales: SaleDetail[] = [];
  const movements: { tenantId: string; productId: string; type: "SALE" | "RETURN"; quantity: number; note: string; saleId: string }[] = [];
  const seq: Record<string, number> = { A: 0, B: 0 };
  let ids = 0;

  const isBilled = (tenantId: string, appointmentId: string) =>
    sales.some((s) => s.tenantId === tenantId && s.status === "COMPLETED" && s.items.some((i) => i.appointmentId === appointmentId && i.returnedQuantity === 0));
  const forSale = ({ tenantId: _t, ...a }: (typeof appts)[number], billed: boolean): AppointmentForSale => ({ ...a, billed });

  const repo: SalesRepo = {
    async findProductsForSale(tenantId, productIds) {
      const r = products.filter((p) => p.tenantId === tenantId && productIds.includes(p.id)).map(({ id, name, priceCents, active }) => ({ id, name, priceCents, active }));
      hooks.afterLookup?.();
      return r;
    },
    async findServicesForSale(tenantId, serviceIds) {
      const r = services
        .filter((s) => s.tenantId === tenantId && serviceIds.includes(s.id))
        .map(({ id, name, priceCents, active }) => ({ id, name, priceCents, active }));
      hooks.afterLookup?.();
      return r;
    },
    async findAppointmentsForSale(tenantId, appointmentIds) {
      const r = appts.filter((a) => a.tenantId === tenantId && appointmentIds.includes(a.id)).map((a) => forSale(a, isBilled(tenantId, a.id)));
      hooks.afterLookup?.();
      return r;
    },
    async listBillableAppointments(tenantId) {
      return appts.filter((a) => a.tenantId === tenantId && a.status === "COMPLETED" && !isBilled(tenantId, a.id)).map((a) => forSale(a, false));
    },
    async customerExists(tenantId, id) {
      return customers.some((c) => c.id === id && c.tenantId === tenantId);
    },
    async createSaleAtomic(tenantId, sale) {
      for (const it of sale.items.filter((i) => i.kind === "APPOINTMENT")) {
        const a = appts.find((x) => x.id === it.appointmentId && x.tenantId === tenantId);
        if (!a || a.status !== "COMPLETED" || a.priceCents !== it.unitPriceCents || isBilled(tenantId, a.id)) {
          return { ok: false, reason: "APPOINTMENT_UNAVAILABLE", description: it.description };
        }
      }
      for (const it of sale.items.filter((i) => i.kind === "SERVICE")) {
        const sv = services.find((x) => x.id === it.serviceId && x.tenantId === tenantId);
        if (!sv || !sv.active) return { ok: false, reason: "SERVICE_UNAVAILABLE", serviceName: sv?.name ?? it.description };
        if (sv.priceCents !== it.unitPriceCents) return { ok: false, reason: "SERVICE_CHANGED", serviceName: sv.name };
      }
      const decrements: { p: P; qty: number }[] = [];
      for (const it of sale.items.filter((i) => i.kind === "PRODUCT")) {
        const p = products.find((x) => x.id === it.productId && x.tenantId === tenantId);
        if (!p || !p.active) return { ok: false, reason: "PRODUCT_UNAVAILABLE", productName: p?.name ?? it.description };
        if (p.priceCents !== it.unitPriceCents) return { ok: false, reason: "PRODUCT_CHANGED", productName: p.name };
        if (p.stock < it.quantity) return { ok: false, reason: "INSUFFICIENT_STOCK", productName: p.name, available: p.stock };
        decrements.push({ p, qty: it.quantity });
      }
      // só depois de TODAS as checagens é que algo muda
      const number = ++seq[tenantId];
      const id = `sale${++ids}`;
      const customerName = customers.find((c) => c.id === sale.customerId)?.name ?? null;
      const record: SaleDetail = {
        id,
        tenantId,
        number,
        status: "COMPLETED",
        customerId: sale.customerId,
        customerName,
        paymentMethod: sale.paymentMethod,
        subtotalCents: sale.subtotalCents,
        discountCents: sale.discountCents,
        totalCents: sale.totalCents,
        creditAppliedCents: sale.creditAppliedCents,
        returnedValueCents: 0,
        refundedCents: 0,
        notes: sale.notes,
        createdAt: clock.now,
        createdById: sale.userId,
        createdByName: users[sale.userId] ?? "?",
        canceledAt: null,
        cancelReason: null,
        itemCount: sale.items.length,
        items: sale.items.map((i) => ({ ...i, id: `item${++ids}`, returnedQuantity: 0 })),
      };
      sales.push(record);
      for (const { p, qty } of decrements) {
        p.stock -= qty;
        movements.push({ tenantId, productId: p.id, type: "SALE", quantity: -qty, note: `Venda #${number}`, saleId: id });
      }
      return { ok: true, sale: record };
    },
    async cancelSaleAtomic(tenantId, id, { reason, now }) {
      const s = sales.find((x) => x.id === id && x.tenantId === tenantId);
      if (!s) return { ok: false, reason: "NOT_FOUND" };
      if (s.status === "CANCELED") return { ok: false, reason: "ALREADY_CANCELED" };
      s.status = "CANCELED";
      s.canceledAt = now;
      s.cancelReason = reason;
      for (const it of s.items.filter((i) => i.kind === "PRODUCT")) {
        products.find((p) => p.id === it.productId)!.stock += it.quantity;
        movements.push({ tenantId, productId: it.productId!, type: "RETURN", quantity: it.quantity, note: `Cancelamento da venda #${s.number}`, saleId: id });
      }
      return { ok: true, sale: s };
    },
    async findSale(tenantId, id) {
      return sales.find((s) => s.id === id && s.tenantId === tenantId) ?? null;
    },
    async listSales(tenantId, { from, to }) {
      return sales.filter((s) => s.tenantId === tenantId && s.createdAt >= from && s.createdAt < to).sort((a, b) => b.number - a.number);
    },
    async listReturnsInRange() {
      return [];
    },
  };
  return { repo, clock, hooks, products, services, appts, sales, movements };
}

const as = (role: Role, tenantId: string, userId: string): SessionPayload => ({ userId, tenantId, role });
const adminA = as("ADMIN", "A", "admin-A");
const attA = as("ATTENDANT", "A", "att-A");
const groomerA = as("GROOMER", "A", "groomer-A");
const vetA = as("VET", "A", "vet-A");
const adminB = as("ADMIN", "B", "admin-B");

const base = { items: [{ kind: "PRODUCT", productId: "prA1", quantity: 2 }], paymentMethod: "PIX" };
const sell = (repo: SalesRepo, over: Record<string, unknown> = {}, who = attA) => createSale(repo, who, { ...base, ...over });
const stockOf = (w: ReturnType<typeof world>, id: string) => w.products.find((p) => p.id === id)!.stock;

describe("vender produtos", () => {
  it("cria a venda: preço vem do cadastro, total calculado, estoque baixado e movimentação registrada", async () => {
    const w = world();
    const sale = await sell(w.repo, { items: [{ kind: "PRODUCT", productId: "prA1", quantity: 2, unitPriceCents: 1 }] }); // preço do cliente é ignorado
    expect(sale).toMatchObject({
      tenantId: "A",
      number: 1,
      status: "COMPLETED",
      paymentMethod: "PIX",
      subtotalCents: 6000,
      discountCents: 0,
      totalCents: 6000,
      customerId: null,
      createdByName: "Atendente",
    });
    expect(sale.items).toMatchObject([{ kind: "PRODUCT", description: "Shampoo", unitPriceCents: 3000, quantity: 2, totalCents: 6000 }]);
    expect(stockOf(w, "prA1")).toBe(8);
    expect(w.movements).toEqual([{ tenantId: "A", productId: "prA1", type: "SALE", quantity: -2, note: "Venda #1", saleId: sale.id }]);
  });

  it("soma linhas repetidas do mesmo produto", async () => {
    const w = world();
    const sale = await sell(w.repo, {
      items: [
        { kind: "PRODUCT", productId: "prA1", quantity: 2 },
        { kind: "PRODUCT", productId: "prA1", quantity: 3 },
      ],
    });
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]).toMatchObject({ quantity: 5, totalCents: 15000 });
    expect(stockOf(w, "prA1")).toBe(5);
  });

  it("vender exatamente todo o estoque é permitido", async () => {
    const w = world();
    await sell(w.repo, { items: [{ kind: "PRODUCT", productId: "prA2", quantity: 3 }] });
    expect(stockOf(w, "prA2")).toBe(0);
  });

  it("a numeração segue 1, 2, 3 dentro do pet shop", async () => {
    const w = world();
    const numbers = [(await sell(w.repo)).number, (await sell(w.repo)).number, (await sell(w.repo)).number];
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("guarda observações e cliente opcional", async () => {
    const w = world();
    const sale = await sell(w.repo, { customerId: "cA2", notes: " Retira amanhã " });
    expect(sale).toMatchObject({ customerId: "cA2", customerName: "Dora", notes: "Retira amanhã" });
  });
});

describe("estoque insuficiente e produtos indisponíveis", () => {
  it("recusa quando falta estoque, com a quantidade disponível na mensagem", async () => {
    const w = world();
    const err = await sell(w.repo, { items: [{ kind: "PRODUCT", productId: "prA2", quantity: 4 }] }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("Estoque insuficiente para Ração (disponível: 3)");
  });

  it("é tudo ou nada: se um item falha, nenhum estoque é baixado e o número da venda não é gasto", async () => {
    const w = world();
    await expect(
      sell(w.repo, {
        items: [
          { kind: "PRODUCT", productId: "prA1", quantity: 2 },
          { kind: "PRODUCT", productId: "prA2", quantity: 99 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(stockOf(w, "prA1")).toBe(10);
    expect(w.sales).toHaveLength(0);
    expect(w.movements).toHaveLength(0);
    expect((await sell(w.repo)).number).toBe(1);
  });

  it("produto desativado ou inexistente fica indisponível", async () => {
    const w = world();
    await expect(sell(w.repo, { items: [{ kind: "PRODUCT", productId: "prA3", quantity: 1 }] })).rejects.toThrow(
      new ValidationError("Produto indisponível: Coleira"),
    );
    await expect(sell(w.repo, { items: [{ kind: "PRODUCT", productId: "nao-existe", quantity: 1 }] })).rejects.toThrow("Produto indisponível");
  });

  it("detecta preço alterado entre a tela e a confirmação (corrida) e não vende pelo preço velho", async () => {
    const w = world();
    w.hooks.afterLookup = () => {
      w.products[0].priceCents = 9999;
    };
    const err = await sell(w.repo).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("O preço de Shampoo foi alterado. Atualize a página e refaça a venda");
    expect(stockOf(w, "prA1")).toBe(10);
  });

  it("detecta produto desativado entre a tela e a confirmação", async () => {
    const w = world();
    w.hooks.afterLookup = () => {
      w.products[0].active = false;
    };
    await expect(sell(w.repo)).rejects.toThrow("Produto indisponível: Shampoo");
  });
});

describe("desconto e total", () => {
  it.each([
    ["5,00", 500, 5500],
    ["R$ 5", 500, 5500],
    ["0,5", 50, 5950],
    ["", 0, 6000],
    ["60", 6000, 0], // desconto igual ao total: permitido (cortesia)
  ])("desconto %j", async (discount, off, total) => {
    const w = world();
    const sale = await sell(w.repo, { discount });
    expect(sale).toMatchObject({ subtotalCents: 6000, discountCents: off, totalCents: total });
  });

  it.each([
    ["60,01", "O desconto não pode ser maior que o total da venda"],
    ["abc", "Desconto inválido"],
    ["-5", "Desconto inválido"],
  ])("recusa o desconto %j", async (discount, message) => {
    const w = world();
    await expect(sell(w.repo, { discount })).rejects.toThrow(new ValidationError(message));
    expect(w.sales).toHaveLength(0);
  });

  it("recusa total acima do limite", async () => {
    const w = world();
    w.products[0].priceCents = 9_999_999;
    w.products[0].stock = 10_000;
    await expect(sell(w.repo, { items: [{ kind: "PRODUCT", productId: "prA1", quantity: 9999 }] })).rejects.toThrow(
      "O total da venda excede o limite de R$ 999.999,99",
    );
  });
});

describe("validação dos dados da venda", () => {
  it.each([
    [{ items: [] }, "Adicione ao menos um item"],
    [{ items: undefined }, "Adicione ao menos um item"],
    [{ items: "x" }, "Itens inválidos"],
    [{ items: [{ kind: "GIFT" }] }, "Itens inválidos"],
    [{ items: [{ kind: "PRODUCT", quantity: 1 }] }, "Itens inválidos"],
    [{ items: [{ kind: "PRODUCT", productId: "prA1", quantity: 0 }] }, "Quantidade inválida (de 1 a 9999)"],
    [{ items: [{ kind: "PRODUCT", productId: "prA1", quantity: "abc" }] }, "Quantidade inválida (de 1 a 9999)"],
    [{ items: [{ kind: "PRODUCT", productId: "prA1", quantity: 10000 }] }, "Quantidade inválida (de 1 a 9999)"],
    [{ paymentMethod: "" }, "Escolha a forma de pagamento"],
    [{ paymentMethod: "CHEQUE" }, "Escolha a forma de pagamento"],
    [{ notes: "x".repeat(201) }, "Máximo de 200 caracteres nas observações"],
  ])("rejeita %j", async (over, message) => {
    const w = world();
    await expect(sell(w.repo, over)).rejects.toThrow(new ValidationError(message));
    expect(w.sales).toHaveLength(0);
  });

  it("recusa mais de 50 itens", async () => {
    const w = world();
    const items = Array.from({ length: 51 }, () => ({ kind: "PRODUCT", productId: "prA1", quantity: 1 }));
    await expect(sell(w.repo, { items })).rejects.toThrow("Máximo de 50 itens por venda");
  });

  it("recusa quantidade somada acima de 9999 (linhas repetidas)", async () => {
    const w = world();
    const items = [
      { kind: "PRODUCT", productId: "prA1", quantity: 9000 },
      { kind: "PRODUCT", productId: "prA1", quantity: 9000 },
    ];
    await expect(sell(w.repo, { items })).rejects.toThrow("Quantidade inválida (de 1 a 9999)");
  });

  it("aceita todas as formas de pagamento", async () => {
    const w = world();
    for (const paymentMethod of ["CASH", "PIX", "DEBIT", "CREDIT"]) {
      await expect(sell(w.repo, { paymentMethod, items: [{ kind: "PRODUCT", productId: "prA1", quantity: 1 }] })).resolves.toMatchObject({ paymentMethod });
    }
  });
});

describe("cobrar atendimentos", () => {
  const appointmentOnly = (ids: string[]) => ({ items: ids.map((appointmentId) => ({ kind: "APPOINTMENT", appointmentId })) });

  it("o preço vem do atendimento, a quantidade é 1 e o cliente é o do atendimento", async () => {
    const w = world();
    const sale = await sell(w.repo, appointmentOnly(["aA1"]));
    expect(sale).toMatchObject({ customerId: "cA1", customerName: "Carlos", subtotalCents: 5000, totalCents: 5000 });
    expect(sale.items).toMatchObject([{ kind: "APPOINTMENT", appointmentId: "aA1", description: "Banho — Thor", quantity: 1, unitPriceCents: 5000 }]);
    expect(w.movements).toHaveLength(0); // serviço não mexe no estoque
  });

  it("mistura produtos e atendimentos do mesmo cliente", async () => {
    const w = world();
    const sale = await sell(w.repo, {
      items: [
        { kind: "PRODUCT", productId: "prA1", quantity: 1 },
        { kind: "APPOINTMENT", appointmentId: "aA1" },
        { kind: "APPOINTMENT", appointmentId: "aA2" },
      ],
    });
    expect(sale.totalCents).toBe(3000 + 5000 + 8000);
    expect(sale.customerId).toBe("cA1");
  });

  it("um atendimento só pode ser cobrado uma vez", async () => {
    const w = world();
    await sell(w.repo, appointmentOnly(["aA1"]));
    const err = await sell(w.repo, appointmentOnly(["aA1"])).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(APPOINTMENT_UNAVAILABLE_MESSAGE);
    expect((await listBillableAppointments(w.repo, attA)).map((a) => a.id)).toEqual(["aA2", "aA3"]);
  });

  it("o mesmo atendimento duas vezes na mesma venda é erro", async () => {
    const w = world();
    await expect(sell(w.repo, appointmentOnly(["aA1", "aA1"]))).rejects.toThrow(new ValidationError("Atendimento repetido na venda"));
  });

  it("atendimento não concluído, inexistente ou de outro pet shop dá a mesma mensagem", async () => {
    const w = world();
    for (const id of ["aA4", "nao-existe", "aB1"]) {
      await expect(sell(w.repo, appointmentOnly([id]))).rejects.toThrow(APPOINTMENT_UNAVAILABLE_MESSAGE);
    }
  });

  it("detecta atendimento cobrado por outra venda entre a tela e a confirmação (corrida)", async () => {
    const w = world();
    // o gancho dispara depois de cada consulta (produtos, serviços, atendimentos): a 3ª é a dos atendimentos,
    // então a venda concorrente aparece SÓ depois da leitura e quem pega é a checagem atômica do repositório
    let calls = 0;
    w.hooks.afterLookup = () => {
      if (++calls !== 3) return;
      const item = { kind: "APPOINTMENT", appointmentId: "aA1", returnedQuantity: 0 } as SaleDetail["items"][number];
      w.sales.push({ ...({} as SaleDetail), id: "outra", tenantId: "A", status: "COMPLETED", items: [item] });
    };
    await expect(sell(w.repo, appointmentOnly(["aA1"]))).rejects.toThrow(APPOINTMENT_UNAVAILABLE_MESSAGE);
  });

  it("atendimentos de clientes diferentes não cabem na mesma venda", async () => {
    const w = world();
    await expect(sell(w.repo, appointmentOnly(["aA1", "aA3"]))).rejects.toThrow("Os atendimentos da venda devem ser do mesmo cliente");
  });

  it("o cliente informado precisa ser o do atendimento", async () => {
    const w = world();
    await expect(sell(w.repo, { ...appointmentOnly(["aA1"]), customerId: "cA2" })).rejects.toThrow(
      "O cliente da venda deve ser o mesmo dos atendimentos",
    );
    await expect(sell(w.repo, { ...appointmentOnly(["aA1"]), customerId: "cA1" })).resolves.toBeTruthy();
  });

  it("cliente de outro pet shop não existe para esta venda", async () => {
    const w = world();
    await expect(sell(w.repo, { customerId: "cB1" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cancelar venda", () => {
  it("devolve o estoque, registra o motivo e libera os atendimentos", async () => {
    const w = world();
    const sale = await sell(w.repo, {
      items: [
        { kind: "PRODUCT", productId: "prA1", quantity: 4 },
        { kind: "APPOINTMENT", appointmentId: "aA1" },
      ],
    });
    expect(stockOf(w, "prA1")).toBe(6);

    const now = new Date("2026-10-13T16:00:00.000Z");
    const canceled = await cancelSale(w.repo, adminA, sale.id, { reason: "  Cliente desistiu " }, { now });
    expect(canceled).toMatchObject({ status: "CANCELED", cancelReason: "Cliente desistiu", canceledAt: now });
    expect(stockOf(w, "prA1")).toBe(10);
    expect(w.movements.at(-1)).toMatchObject({ type: "RETURN", quantity: 4, note: "Cancelamento da venda #1" });
    expect((await listBillableAppointments(w.repo, attA)).map((a) => a.id)).toContain("aA1");
    await expect(sell(w.repo, { items: [{ kind: "APPOINTMENT", appointmentId: "aA1" }] })).resolves.toBeTruthy();
  });

  it("só uma vez: cancelar de novo é recusado e o estoque não é devolvido em dobro", async () => {
    const w = world();
    const sale = await sell(w.repo);
    await cancelSale(w.repo, adminA, sale.id, { reason: "Erro de digitação" });
    const err = await cancelSale(w.repo, adminA, sale.id, { reason: "De novo" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(ALREADY_CANCELED_MESSAGE);
    expect(stockOf(w, "prA1")).toBe(10);
  });

  it.each(["", "  ", "ab", "x".repeat(201)])("exige um motivo válido (%j)", async (reason) => {
    const w = world();
    const sale = await sell(w.repo);
    await expect(cancelSale(w.repo, adminA, sale.id, { reason })).rejects.toBeInstanceOf(ValidationError);
    expect((await getSale(w.repo, adminA, sale.id)).status).toBe("COMPLETED");
  });

  it("só o ADMIN cancela", async () => {
    const w = world();
    const sale = await sell(w.repo);
    await expect(cancelSale(w.repo, attA, sale.id, { reason: "Teste" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(stockOf(w, "prA1")).toBe(8);
  });

  it("venda inexistente dá NotFound", async () => {
    const w = world();
    await expect(cancelSale(w.repo, adminA, "nao-existe", { reason: "Teste" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("resumo e listagem do dia", () => {
  it("summarizeSales soma só as concluídas, por forma de pagamento", () => {
    const s = summarizeSales([
      { status: "COMPLETED", paymentMethod: "PIX", totalCents: 1000 },
      { status: "COMPLETED", paymentMethod: "PIX", totalCents: 500 },
      { status: "COMPLETED", paymentMethod: "CASH", totalCents: 250 },
      { status: "CANCELED", paymentMethod: "CREDIT", totalCents: 9999 },
    ]);
    expect(s).toEqual({
      completedCount: 3,
      canceledCount: 1,
      returnCount: 0,
      soldCents: 1750,
      refundedCents: 0,
      totalCents: 1750,
      byMethod: { CASH: 250, PIX: 1500, DEBIT: 0, CREDIT: 0 },
    });
  });

  it("sem vendas, tudo zerado", () => {
    expect(summarizeSales([])).toEqual({
      completedCount: 0,
      canceledCount: 0,
      returnCount: 0,
      soldCents: 0,
      refundedCents: 0,
      totalCents: 0,
      byMethod: { CASH: 0, PIX: 0, DEBIT: 0, CREDIT: 0 },
    });
  });

  it("lista pelo dia LOCAL do pet shop (23:30 de 13/10 e 00:00 de 14/10 são dias diferentes)", async () => {
    const w = world();
    w.clock.now = new Date("2026-10-14T02:30:00.000Z"); // 23:30 de 13/10 em Brasília
    const late = await sell(w.repo);
    w.clock.now = new Date("2026-10-14T03:00:00.000Z"); // 00:00 de 14/10
    const early = await sell(w.repo);
    const d13 = await listSales(w.repo, adminA, { date: "2026-10-13" });
    const d14 = await listSales(w.repo, adminA, { date: "2026-10-14" });
    expect(d13.sales.map((s) => s.id)).toEqual([late.id]);
    expect(d14.sales.map((s) => s.id)).toEqual([early.id]);
  });

  it("sem data, usa hoje; cancelada aparece na lista, mas não no total", async () => {
    const w = world();
    const a = await sell(w.repo);
    await sell(w.repo, { paymentMethod: "CASH" });
    await cancelSale(w.repo, adminA, a.id, { reason: "Erro" });
    const day = await listSales(w.repo, attA, {}, { now: w.clock.now });
    expect(day.date).toBe("2026-10-13");
    expect(day.sales).toHaveLength(2);
    expect(day.summary).toMatchObject({ completedCount: 1, canceledCount: 1, totalCents: 6000, byMethod: { CASH: 6000, PIX: 0 } });
  });

  it("recusa data inválida", async () => {
    const w = world();
    await expect(listSales(w.repo, adminA, { date: "2026-02-30" })).rejects.toThrow("Data inválida");
  });
});

describe("ISOLAMENTO entre tenants", () => {
  it("outro pet shop não vende o produto nem cobra o atendimento de fora", async () => {
    const w = world();
    await expect(createSale(w.repo, adminB, { items: [{ kind: "PRODUCT", productId: "prA1", quantity: 1 }], paymentMethod: "PIX" })).rejects.toThrow(
      "Produto indisponível",
    );
    await expect(createSale(w.repo, adminB, { items: [{ kind: "APPOINTMENT", appointmentId: "aA1" }], paymentMethod: "PIX" })).rejects.toThrow(
      APPOINTMENT_UNAVAILABLE_MESSAGE,
    );
    expect(stockOf(w, "prA1")).toBe(10);
  });

  it("cada pet shop numera as próprias vendas (ambos começam em 1)", async () => {
    const w = world();
    const a = await sell(w.repo);
    const b = await createSale(w.repo, adminB, { items: [{ kind: "PRODUCT", productId: "prB1", quantity: 1 }], paymentMethod: "CASH" });
    expect([a.number, b.number]).toEqual([1, 1]);
    expect(stockOf(w, "prB1")).toBe(4);
  });

  it("não vê, não lista e não cancela vendas de outro pet shop (404)", async () => {
    const w = world();
    const sale = await sell(w.repo);
    await expect(getSale(w.repo, adminB, sale.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelSale(w.repo, adminB, sale.id, { reason: "Invasão" })).rejects.toBeInstanceOf(NotFoundError);
    expect((await listSales(w.repo, adminB, { date: "2026-10-13" }, { now: w.clock.now })).sales).toEqual([]);
    expect((await getSale(w.repo, adminA, sale.id)).status).toBe("COMPLETED");
    expect(await listBillableAppointments(w.repo, adminB)).toMatchObject([{ id: "aB1" }]);
  });
});

describe("permissões", () => {
  it.each([
    ["GROOMER", groomerA],
    ["VET", vetA],
  ])("%s não usa o PDV nem vê as vendas", async (_name, who) => {
    const w = world();
    const sale = await sell(w.repo);
    await expect(sell(w.repo, {}, who)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getSale(w.repo, who, sale.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listSales(w.repo, who)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listBillableAppointments(w.repo, who)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ATTENDANT e ADMIN vendem", async () => {
    const w = world();
    await expect(sell(w.repo, {}, attA)).resolves.toBeTruthy();
    await expect(sell(w.repo, {}, adminA)).resolves.toBeTruthy();
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as SalesRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(createSale(spy, groomerA, base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelSale(spy, attA, "x", { reason: "abc" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});

describe("serviço avulso (sem agendamento)", () => {
  const svc = (serviceId: string, quantity: unknown = 1) => ({ kind: "SERVICE", serviceId, quantity });

  it("vende um serviço do catálogo: preço do cadastro, sem mexer no estoque", async () => {
    const w = world();
    const sale = await sell(w.repo, { items: [{ ...svc("svA1"), unitPriceCents: 1 }] }); // preço do cliente é ignorado
    expect(sale).toMatchObject({ number: 1, subtotalCents: 5000, totalCents: 5000, customerId: null });
    expect(sale.items).toMatchObject([
      { kind: "SERVICE", serviceId: "svA1", productId: null, appointmentId: null, description: "Banho avulso", unitPriceCents: 5000, quantity: 1, totalCents: 5000 },
    ]);
    expect(w.movements).toHaveLength(0);
  });

  it("soma linhas repetidas do mesmo serviço e aceita quantidade", async () => {
    const w = world();
    const sale = await sell(w.repo, { items: [svc("svA1", 2), svc("svA1", 1)] });
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]).toMatchObject({ quantity: 3, totalCents: 15000 });
  });

  it("mistura serviço avulso, produto e atendimento no mesmo pedido", async () => {
    const w = world();
    const sale = await sell(w.repo, {
      items: [{ kind: "PRODUCT", productId: "prA1", quantity: 1 }, svc("svA1"), { kind: "APPOINTMENT", appointmentId: "aA1" }],
    });
    expect(sale.subtotalCents).toBe(3000 + 5000 + 5000);
    expect(sale.items.map((i) => i.kind).sort()).toEqual(["APPOINTMENT", "PRODUCT", "SERVICE"]);
  });

  it("serviço desativado ou inexistente fica indisponível", async () => {
    const w = world();
    await expect(sell(w.repo, { items: [svc("svA2")] })).rejects.toThrow(new ValidationError("Serviço indisponível: Tosa avulsa"));
    await expect(sell(w.repo, { items: [svc("nao-existe")] })).rejects.toThrow("Serviço indisponível");
  });

  it("serviço de outro pet shop se comporta como inexistente", async () => {
    const w = world();
    await expect(sell(w.repo, { items: [svc("svB1")] })).rejects.toThrow("Serviço indisponível");
  });

  // O gancho dispara depois de cada consulta (produtos, serviços, atendimentos); a 2ª é a de serviços.
  const afterServicesLookup = (w: ReturnType<typeof world>, change: () => void) => {
    let calls = 0;
    w.hooks.afterLookup = () => {
      if (++calls === 2) change();
    };
  };

  it("detecta preço do serviço alterado entre a tela e a confirmação (corrida)", async () => {
    const w = world();
    afterServicesLookup(w, () => {
      w.services[0].priceCents = 9999;
    });
    const err = await sell(w.repo, { items: [svc("svA1")] }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("O preço de Banho avulso foi alterado. Atualize a página e refaça a venda");
    expect(w.sales).toHaveLength(0);
  });

  it("detecta serviço desativado entre a tela e a confirmação (corrida)", async () => {
    const w = world();
    afterServicesLookup(w, () => {
      w.services[0].active = false;
    });
    await expect(sell(w.repo, { items: [svc("svA1")] })).rejects.toThrow("Serviço indisponível: Banho avulso");
  });

  it.each([0, "abc", 10000])("quantidade inválida do serviço (%j)", async (quantity) => {
    const w = world();
    await expect(sell(w.repo, { items: [svc("svA1", quantity)] })).rejects.toThrow("Quantidade inválida (de 1 a 9999)");
  });
});

describe("prepareSale (usada também pela troca)", () => {
  it("troca não aceita atendimento agendado nem desconto", async () => {
    const w = world();
    await expect(
      prepareSale(w.repo, attA, { ...base, items: [{ kind: "APPOINTMENT", appointmentId: "aA1" }] }, { allowAppointments: false }),
    ).rejects.toThrow("Atendimentos agendados não entram em uma troca");
    await expect(prepareSale(w.repo, attA, { ...base, discount: "5" }, { allowDiscount: false })).rejects.toThrow(
      "Desconto não é permitido nesta operação",
    );
  });

  it("não grava nada: só monta a venda", async () => {
    const w = world();
    const prepared = await prepareSale(w.repo, attA, base);
    expect(prepared).toMatchObject({ subtotalCents: 6000, totalCents: 6000, creditAppliedCents: 0, userId: "att-A" });
    expect(w.sales).toHaveLength(0);
    expect(stockOf(w, "prA1")).toBe(10);
  });
});

describe("resumo com devoluções e trocas", () => {
  it("a devolução sai da forma escolhida e a parte paga com crédito não entra como dinheiro recebido", () => {
    const s = summarizeSales(
      [
        { status: "COMPLETED", paymentMethod: "PIX", totalCents: 10000 },
        { status: "COMPLETED", paymentMethod: "CASH", totalCents: 5000, creditAppliedCents: 3000 }, // troca: recebeu só 2.000
      ],
      [
        { refundCents: 1500, refundMethod: "CASH" },
        { refundCents: 0, refundMethod: null }, // troca sem devolver dinheiro
      ],
    );
    expect(s).toEqual({
      completedCount: 2,
      canceledCount: 0,
      returnCount: 2,
      soldCents: 15000,
      refundedCents: 1500,
      totalCents: 12000 - 1500,
      byMethod: { CASH: 2000 - 1500, PIX: 10000, DEBIT: 0, CREDIT: 0 },
    });
  });

  it("o líquido de uma forma pode ficar negativo (devolveu em dinheiro uma venda paga no Pix)", () => {
    const s = summarizeSales([], [{ refundCents: 700, refundMethod: "CASH" }]);
    expect(s.byMethod.CASH).toBe(-700);
    expect(s.totalCents).toBe(-700);
  });
});
