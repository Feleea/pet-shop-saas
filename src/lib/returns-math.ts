/**
 * Divide `total` (em centavos) em partes proporcionais aos `weights`, sem perder nem criar centavos
 * (método do maior resto). A soma do resultado é SEMPRE igual a `total`.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return floors;
}

export interface ReturnValueInput {
  subtotalCents: number;
  totalCents: number;
  /** Soma dos valores já devolvidos em devoluções anteriores desta venda. */
  alreadyReturnedValueCents: number;
  /** Valor bruto (preço de tabela × quantidade) dos itens desta devolução. */
  grossReturnedCents: number;
  /** Depois desta devolução, todos os itens da venda terão sido devolvidos? */
  fullyReturned: boolean;
}

/**
 * Valor a devolver pelos itens: o bruto menos o desconto da venda, rateado.
 * Nunca ultrapassa o que sobrou da venda; a última devolução (a que fecha tudo) acerta os centavos restantes.
 */
export function computeReturnValue(p: ReturnValueInput): number {
  const remaining = Math.max(p.totalCents - p.alreadyReturnedValueCents, 0);
  if (p.fullyReturned) return remaining;
  if (p.subtotalCents <= 0) return 0;
  return Math.min(Math.round((p.grossReturnedCents * p.totalCents) / p.subtotalCents), remaining);
}

export interface ReturnableSale {
  subtotalCents: number;
  totalCents: number;
  returnedValueCents: number;
  items: { id: string; unitPriceCents: number; quantity: number; returnedQuantity: number }[];
}

/**
 * Valor de uma devolução, dadas as quantidades escolhidas por item (id do item → quantidade).
 * É a MESMA conta usada pelo servidor e pela tela, para o cliente ver exatamente o que será devolvido.
 */
export function previewReturnValue(sale: ReturnableSale, quantities: Record<string, number>): number {
  let gross = 0;
  let fullyReturned = true;
  for (const it of sale.items) {
    const q = quantities[it.id] ?? 0;
    gross += it.unitPriceCents * q;
    if (it.returnedQuantity + q !== it.quantity) fullyReturned = false;
  }
  if (gross === 0 && !fullyReturned) return 0;
  return computeReturnValue({
    subtotalCents: sale.subtotalCents,
    totalCents: sale.totalCents,
    alreadyReturnedValueCents: sale.returnedValueCents,
    grossReturnedCents: gross,
    fullyReturned,
  });
}
