import { describe, expect, it } from "vitest";
import { z } from "zod";
import { intField, priceField } from "./zod-helpers";

const run = (schema: z.ZodTypeAny, v: unknown) => schema.safeParse(v);
const msg = (r: ReturnType<typeof run>) => (r.success ? null : r.error.issues[0].message);

describe("intField", () => {
  const f = intField({ min: 1, max: 100, message: "inválido" });

  it.each([
    ["5", 5],
    [" 12 ", 12],
    ["007", 7],
    ["+5", 5],
    [100, 100],
  ])("aceita %j", (v, n) => expect(run(f, v)).toMatchObject({ success: true, data: n }));

  it.each(["", " ", null, undefined, "0", "101", "-1", "7,5", "7.5", "1e2", "abc", "12abc", "9999999999"])("rejeita %j", (v) =>
    expect(msg(run(f, v))).toBe("inválido"),
  );

  it("vazio usa o valor padrão, quando existe", () => {
    const g = intField({ min: 0, max: 10, message: "x", defaultValue: 0 });
    expect(run(g, "")).toMatchObject({ success: true, data: 0 });
    expect(run(g, null)).toMatchObject({ success: true, data: 0 });
    expect(msg(run(g, "11"))).toBe("x");
  });

  it("aceita negativos quando o mínimo permite", () => {
    const g = intField({ min: -5, max: 5, message: "x" });
    expect(run(g, "-5")).toMatchObject({ success: true, data: -5 });
    expect(msg(run(g, "-6"))).toBe("x");
  });
});

describe("priceField", () => {
  it("converte reais em centavos", () => {
    expect(run(priceField({ allowZero: false }), "1.250,50")).toMatchObject({ success: true, data: 125050 });
  });
  it("zero depende da opção", () => {
    expect(run(priceField({ allowZero: true }), "0")).toMatchObject({ success: true, data: 0 });
    expect(msg(run(priceField({ allowZero: false }), "0"))).toBe("O preço deve ser maior que zero");
  });
  it.each([
    ["", "Informe o preço"],
    ["abc", "Preço inválido"],
    ["100000", "O preço máximo é R$ 99.999,99"],
  ])("rejeita %j", (v, m) => expect(msg(run(priceField({ allowZero: false }), v))).toBe(m));
});
