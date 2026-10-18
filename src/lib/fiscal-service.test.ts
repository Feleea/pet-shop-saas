import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  ALREADY_ISSUED_MESSAGE,
  CANCEL_REASON_MESSAGE,
  CANCEL_WINDOW_MESSAGE,
  cancelFiscalDocument,
  emitFiscalDocuments,
  listFiscalDocuments,
  type FiscalRepo,
} from "./fiscal-service";
import { SimulatedFiscalProvider, type FiscalProvider } from "./fiscal-provider";
import { createReturn } from "./returns-service";
import { HAS_FISCAL_DOCUMENT_MESSAGE, cancelSale, createSale } from "./sales-service";
import { ForbiddenError } from "./tenant";
import { adminA, adminB, attA, createWorld, groomerA, type World } from "./testing/memory-world";

const product = (quantity = 1) => ({ kind: "PRODUCT", productId: "prA1", quantity });
const service = { kind: "SERVICE", serviceId: "svA1", quantity: 1 };
const sell = (w: World, items: unknown[], who = attA) => createSale(w.sales, who, { items, paymentMethod: "PIX" });
const simulated = (w: World) => new SimulatedFiscalProvider(() => w.clock.now);
const emit = (w: World, saleId: string, who = attA, provider: FiscalProvider = simulated(w)) => emitFiscalDocuments(w.fiscal, provider, who, saleId);
const failing = (message: string): FiscalProvider => ({
  name: "falha",
  environment: "SIMULATED",
  emit: async () => {
    throw new Error(message);
  },
  cancel: async () => ({ ok: true, protocol: "p" }),
});

describe("emitir notas", () => {
  it("venda de produtos: uma NFC-e autorizada (ambiente SIMULADO) com número, chave e protocolo", async () => {
    const w = createWorld();
    const sale = await sell(w, [product(2)]);
    const docs = await emit(w, sale.id);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      kind: "NFCE",
      status: "AUTHORIZED",
      environment: "SIMULATED",
      number: 1,
      series: 1,
      accessKey: "SIMULADO-NFCE-11222333000181-000000001",
      protocol: "SIM-000000001",
      totalCents: 6000,
      issuedAt: w.clock.now,
    });
    expect(await listFiscalDocuments(w.fiscal, attA, sale.id)).toHaveLength(1);
  });

  it("venda mista: duas notas (NFC-e e NFS-e), cada uma com a sua numeração", async () => {
    const w = createWorld();
    const sale = await sell(w, [product(), service]);
    const docs = await emit(w, sale.id);
    expect(docs.map((d) => [d.kind, d.number, d.totalCents])).toEqual([["NFCE", 1, 3000], ["NFSE", 1, 5000]]);
    const second = await sell(w, [product()]);
    expect((await emit(w, second.id))[0].number).toBe(2); // continua a sequência da NFC-e
  });

  it("não emite duas vezes a mesma nota", async () => {
    const w = createWorld();
    const sale = await sell(w, [product()]);
    await emit(w, sale.id);
    const err = await emit(w, sale.id).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe(ALREADY_ISSUED_MESSAGE);
    expect(w.state.docs).toHaveLength(1);
  });

  it("numa venda mista, só emite o tipo que falta", async () => {
    const w = createWorld();
    const sale = await sell(w, [product(), service]);
    w.addDoc(sale.id, "NFCE", "AUTHORIZED");
    const docs = await emit(w, sale.id);
    expect(docs.map((d) => d.kind)).toEqual(["NFSE"]);
  });

  it("faltando dado fiscal: recusa com a lista do que falta e NÃO grava nenhum documento", async () => {
    const w = createWorld();
    w.state.fiscal.product.prA1 = { ncm: "33051000" };
    const sale = await sell(w, [product()]);
    const err = await emit(w, sale.id).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe('Produto "Shampoo": informe o CFOP (4 dígitos); Produto "Shampoo": informe o CSOSN (3 dígitos)');
    expect(w.state.docs).toHaveLength(0);
  });

  it("provedor que falha vira nota REJEITADA com o motivo, e dá para tentar de novo", async () => {
    const w = createWorld();
    const sale = await sell(w, [product()]);
    const [rejected] = await emit(w, sale.id, attA, failing("timeout"));
    expect(rejected).toMatchObject({ status: "REJECTED", rejectionReason: "Falha de comunicação com o provedor fiscal: timeout" });

    const [retry] = await emit(w, sale.id);
    expect(retry.status).toBe("AUTHORIZED");
    expect(w.state.docs).toHaveLength(2);
  });

  it("provedor que rejeita a nota: guarda o motivo", async () => {
    const w = createWorld();
    const sale = await sell(w, [product()]);
    const refusing: FiscalProvider = { ...simulated(w), name: "x", environment: "SIMULATED", emit: async () => ({ status: "REJECTED", reason: "NCM inexistente" }), cancel: async () => ({ ok: true, protocol: "p" }) };
    const [doc] = await emit(w, sale.id, attA, refusing);
    expect(doc).toMatchObject({ status: "REJECTED", rejectionReason: "NCM inexistente", accessKey: null });
  });

  it("CORRIDA: se outra pessoa emitiu no meio do caminho, a trava do repositório barra a duplicada", async () => {
    const w = createWorld();
    const sale = await sell(w, [product()]);
    const racing: FiscalRepo = {
      ...w.fiscal,
      async loadEmissionContext(t, id) {
        const ctx = await w.fiscal.loadEmissionContext(t, id);
        w.addDoc(id, "NFCE", "PROCESSING"); // a outra emissão apareceu DEPOIS da leitura
        return ctx;
      },
    };
    await expect(emitFiscalDocuments(racing, simulated(w), attA, sale.id)).rejects.toThrow(ALREADY_ISSUED_MESSAGE);
    expect(w.state.docs).toHaveLength(1);
  });

  it("CORRIDA: se a venda ganhou uma devolução no meio do caminho, não emite", async () => {
    const w = createWorld();
    const sale = await sell(w, [product(2)]);
    const racing: FiscalRepo = {
      ...w.fiscal,
      async loadEmissionContext(t, id) {
        const ctx = await w.fiscal.loadEmissionContext(t, id);
        w.state.sales.find((s) => s.id === id)!.returnedValueCents = 3000;
        return ctx;
      },
    };
    await expect(emitFiscalDocuments(racing, simulated(w), attA, sale.id)).rejects.toThrow("A venda mudou");
    expect(w.state.docs).toHaveLength(0);
  });

  it("venda de outro pet shop se comporta como inexistente (404)", async () => {
    const w = createWorld();
    const sale = await sell(w, [product()]);
    await expect(emit(w, sale.id, adminB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listFiscalDocuments(w.fiscal, adminB, sale.id)).toEqual([]);
  });

  it("ATTENDANT e ADMIN emitem; GROOMER não", async () => {
    const w = createWorld();
    const a = await sell(w, [product()]);
    const b = await sell(w, [product()]);
    await expect(emit(w, a.id, attA)).resolves.toBeTruthy();
    await expect(emit(w, b.id, adminA)).resolves.toBeTruthy();
    await expect(emit(w, b.id, groomerA)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a permissão é checada antes de qualquer acesso ao banco", async () => {
    const calls: string[] = [];
    const spy = new Proxy({} as FiscalRepo, { get: (_t, k) => () => void calls.push(String(k)) });
    await expect(emitFiscalDocuments(spy, new SimulatedFiscalProvider(), groomerA, "x")).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});

describe("cancelar nota", () => {
  const REASON = "Emitida em duplicidade";
  async function issued(w: World) {
    const sale = await sell(w, [product()]);
    const [doc] = await emit(w, sale.id);
    return { sale, doc };
  }
  const cancel = (w: World, id: string, raw: unknown = { reason: REASON }, who = adminA, now = w.clock.now, provider: FiscalProvider = simulated(w)) =>
    cancelFiscalDocument(w.fiscal, provider, who, id, raw, { now });

  it("ADMIN cancela uma nota autorizada, com justificativa", async () => {
    const w = createWorld();
    const { doc } = await issued(w);
    const c = await cancel(w, doc.id);
    expect(c).toMatchObject({ status: "CANCELED", cancelReason: REASON, canceledAt: w.clock.now });
  });

  it("depois de cancelada, a venda volta a poder ser cancelada, devolvida ou ter nota emitida de novo", async () => {
    const w = createWorld();
    const { sale, doc } = await issued(w);
    await expect(cancelSale(w.sales, adminA, sale.id, { reason: "Erro" })).rejects.toThrow(HAS_FISCAL_DOCUMENT_MESSAGE);
    await expect(
      createReturn(w.repos, attA, sale.id, { reason: "Defeito", restock: true, items: [{ saleItemId: sale.items[0].id, quantity: 1 }] }),
    ).rejects.toThrow(HAS_FISCAL_DOCUMENT_MESSAGE);

    await cancel(w, doc.id);
    expect((await emit(w, sale.id))[0].status).toBe("AUTHORIZED"); // nova nota
    const other = await issued(w);
    await cancel(w, other.doc.id);
    await expect(cancelSale(w.sales, adminA, other.sale.id, { reason: "Erro" })).resolves.toBeTruthy();
  });

  it.each(["", "curta demais", "x".repeat(256), null, undefined])("exige justificativa de 15 a 255 caracteres (%j)", async (reason) => {
    const w = createWorld();
    const { doc } = await issued(w);
    await expect(cancel(w, doc.id, { reason })).rejects.toThrow(new ValidationError(CANCEL_REASON_MESSAGE));
    expect((await w.fiscal.findDocument("A", doc.id))!.status).toBe("AUTHORIZED");
  });

  it("aceita justificativas nos limites (15 e 255 caracteres)", async () => {
    const w = createWorld();
    const a = await issued(w);
    const b = await issued(w);
    await expect(cancel(w, a.doc.id, { reason: "x".repeat(15) })).resolves.toBeTruthy();
    await expect(cancel(w, b.doc.id, { reason: "x".repeat(255) })).resolves.toBeTruthy();
  });

  it("respeita o prazo: exatamente 30 minutos ainda pode; 1 ms depois, não", async () => {
    const w = createWorld();
    const a = await issued(w);
    const b = await issued(w);
    const limit = w.clock.now.getTime() + 30 * 60_000;
    await expect(cancel(w, a.doc.id, { reason: REASON }, adminA, new Date(limit))).resolves.toBeTruthy();
    await expect(cancel(w, b.doc.id, { reason: REASON }, adminA, new Date(limit + 1))).rejects.toThrow(new ValidationError(CANCEL_WINDOW_MESSAGE));
  });

  it("só notas autorizadas: rejeitada, já cancelada ou inexistente", async () => {
    const w = createWorld();
    const { doc } = await issued(w);
    const rejected = w.addDoc(doc.saleId, "NFSE", "REJECTED");
    await expect(cancel(w, rejected)).rejects.toThrow("Só notas autorizadas podem ser canceladas");
    await cancel(w, doc.id);
    await expect(cancel(w, doc.id)).rejects.toThrow("Só notas autorizadas podem ser canceladas");
    await expect(cancel(w, "nao-existe")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("se o provedor recusa o cancelamento, a nota continua autorizada", async () => {
    const w = createWorld();
    const { doc } = await issued(w);
    const refusing: FiscalProvider = { ...simulated(w), name: "x", environment: "SIMULATED", emit: async () => ({ status: "REJECTED", reason: "x" }), cancel: async () => ({ ok: false, reason: "fora do prazo da SEFAZ" }) };
    await expect(cancel(w, doc.id, undefined, adminA, w.clock.now, refusing)).rejects.toThrow(
      new ConflictError("O provedor recusou o cancelamento: fora do prazo da SEFAZ"),
    );
    expect((await w.fiscal.findDocument("A", doc.id))!.status).toBe("AUTHORIZED");
  });

  it("só o ADMIN cancela", async () => {
    const w = createWorld();
    const { doc } = await issued(w);
    await expect(cancel(w, doc.id, { reason: REASON }, attA)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await w.fiscal.findDocument("A", doc.id))!.status).toBe("AUTHORIZED");
  });

  it("ISOLAMENTO: outro pet shop não cancela a nota (404)", async () => {
    const w = createWorld();
    const { doc } = await issued(w);
    await expect(cancel(w, doc.id, { reason: REASON }, adminB)).rejects.toBeInstanceOf(NotFoundError);
    expect((await w.fiscal.findDocument("A", doc.id))!.status).toBe("AUTHORIZED");
  });
});
