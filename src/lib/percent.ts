/**
 * "5" → 500, "2,5" → 250, "2.50" → 250, "5%" → 500 (centésimos de ponto percentual).
 * Aceita no máximo 2 casas decimais; qualquer outra coisa vira null.
 */
export function parsePercentToBp(input: string): number | null {
  const s = input.replace(/%/g, "").replace(/\s/g, "");
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replace(",", ".")) * 100);
}

/** 500 → "5,00%". */
export function formatPercentBp(bp: number): string {
  return `${(bp / 100).toFixed(2).replace(".", ",")}%`;
}

/** 500 → "5,00" (para preencher o campo de edição). */
export function bpToInput(bp: number): string {
  return (bp / 100).toFixed(2).replace(".", ",");
}
