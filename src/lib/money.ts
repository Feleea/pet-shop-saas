/**
 * Converte texto digitado em reais para centavos.
 * Aceita "50", "50,5", "50.50", "R$ 1.250,50", "1.250". Retorna null se for inválido ou ambíguo.
 * Regra do ponto sozinho: 3 dígitos depois dele = milhar ("1.250" = R$ 1.250,00); 1–2 dígitos = decimal ("1.5" = R$ 1,50).
 */
export function parsePriceToCents(input: string): number | null {
  const s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const thousands = /^\d{1,3}(\.\d{3})+$/;
  let intPart: string;
  let decPart = "";

  const comma = s.lastIndexOf(",");
  if (comma >= 0) {
    intPart = s.slice(0, comma);
    decPart = s.slice(comma + 1);
    if (intPart.includes(",") || !/^\d{1,2}$/.test(decPart)) return null;
    if (intPart.includes(".")) {
      if (!thousands.test(intPart)) return null;
      intPart = intPart.replace(/\./g, "");
    }
  } else if (s.includes(".")) {
    if (thousands.test(s)) {
      intPart = s.replace(/\./g, "");
    } else {
      const dot = s.lastIndexOf(".");
      intPart = s.slice(0, dot);
      decPart = s.slice(dot + 1);
      if (intPart.includes(".") || !/^\d{1,2}$/.test(decPart)) return null;
    }
  } else {
    intPart = s;
  }

  if (intPart.length === 0 || intPart.length > 9) return null;
  return Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || "0");
}

/** 125050 -> "R$ 1.250,50" (formatação manual: não depende de ICU nem de espaços especiais). */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

/** 5000 -> "50,00" (valor para preencher o campo de edição). */
export function centsToInput(cents: number): string {
  return formatBRL(cents).replace("R$ ", "");
}

/** 45 -> "45 min"; 60 -> "1h"; 90 -> "1h30". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
