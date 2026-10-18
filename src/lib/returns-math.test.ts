import { describe, expect, it } from "vitest";
import { allocateProportionally, computeReturnValue, previewReturnValue } from "./returns-math";

describe("allocateProportionally", () => {
  it.each([
    [100, [1, 1, 1], [34, 33, 33]],
    [10, [1, 2], [3, 7]],
    [7500, [3000, 5000], [2813, 4687]],
    [0, [5, 5], [0, 0]],
    [999, [1], [999]],
    [5, [0, 0], [0, 0]],
    [5, [], []],
  ])("%i entre %j → %j", (total, weights, expected) => {
    expect(allocateProportionally(total, weights)).toEqual(expected);
  });

  it("nunca perde nem cria centavos (200 casos pseudoaleatórios)", () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 200; i++) {
      const weights = Array.from({ length: 1 + rnd(6) }, () => 1 + rnd(20000));
      const total = rnd(500000);
      const parts = allocateProportionally(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      const sum = weights.reduce((a, b) => a + b, 0);
      parts.forEach((p, k) => {
        expect(p).toBeGreaterThanOrEqual(Math.floor((total * weights[k]) / sum));
        expect(p).toBeLessThanOrEqual(Math.ceil((total * weights[k]) / sum));
      });
    }
  });
});

describe("computeReturnValue", () => {
  const base = { subtotalCents: 6000, totalCents: 6000, alreadyReturnedValueCents: 0, grossReturnedCents: 3000, fullyReturned: false };

  it("sem desconto devolve o preço dos itens", () => expect(computeReturnValue(base)).toBe(3000));
  it("com desconto, rateia: 3000 de 6000 numa venda de 5400 vale 2700", () => {
    expect(computeReturnValue({ ...base, totalCents: 5400 })).toBe(2700);
  });
  it("a devolução que fecha a venda acerta os centavos restantes", () => {
    expect(computeReturnValue({ ...base, totalCents: 5400, alreadyReturnedValueCents: 2700, fullyReturned: true })).toBe(2700);
  });
  it("nunca passa do que sobrou da venda", () => {
    expect(computeReturnValue({ ...base, grossReturnedCents: 9999, alreadyReturnedValueCents: 5000 })).toBe(1000);
    expect(computeReturnValue({ ...base, alreadyReturnedValueCents: 6000 })).toBe(0);
  });
  it("venda de valor zero devolve zero", () => {
    expect(computeReturnValue({ ...base, subtotalCents: 0, totalCents: 0, grossReturnedCents: 0 })).toBe(0);
  });

  it("três devoluções de itens iguais somam exatamente o total (999 com desconto de 1 = 998)", () => {
    const sale = { subtotalCents: 999, totalCents: 998 };
    const v1 = computeReturnValue({ ...sale, alreadyReturnedValueCents: 0, grossReturnedCents: 333, fullyReturned: false });
    const v2 = computeReturnValue({ ...sale, alreadyReturnedValueCents: v1, grossReturnedCents: 333, fullyReturned: false });
    const v3 = computeReturnValue({ ...sale, alreadyReturnedValueCents: v1 + v2, grossReturnedCents: 333, fullyReturned: true });
    expect([v1, v2, v3]).toEqual([333, 333, 332]);
    expect(v1 + v2 + v3).toBe(998);
  });
});

describe("previewReturnValue (a mesma conta da tela e do servidor)", () => {
  const sale = {
    subtotalCents: 18000,
    totalCents: 17900,
    returnedValueCents: 0,
    items: [
      { id: "a", unitPriceCents: 3000, quantity: 2, returnedQuantity: 0 },
      { id: "b", unitPriceCents: 12000, quantity: 1, returnedQuantity: 0 },
    ],
  };

  it("nada selecionado vale zero", () => expect(previewReturnValue(sale, {})).toBe(0));
  it("devolução parcial, com o desconto rateado", () => expect(previewReturnValue(sale, { a: 1, b: 1 })).toBe(14917));
  it("devolver tudo devolve exatamente o total da venda", () => expect(previewReturnValue(sale, { a: 2, b: 1 })).toBe(17900));
  it("considera o que já foi devolvido antes", () => {
    const after = { ...sale, returnedValueCents: 2983, items: [{ ...sale.items[0], returnedQuantity: 1 }, sale.items[1]] };
    expect(previewReturnValue(after, { a: 1, b: 1 })).toBe(17900 - 2983);
  });
});
