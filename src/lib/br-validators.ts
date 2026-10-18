export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const isValidUf = (s: string) => (UFS as readonly string[]).includes(s);

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Valida o CNPJ pelos dois dígitos verificadores (aceita com ou sem máscara). */
export function isValidCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

/** "11222333000181" → "11.222.333/0001-81". */
export function formatCnpj(digits: string): string {
  const d = onlyDigits(digits);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : digits;
}

/** "40010000" → "40010-000". */
export function formatCep(digits: string): string {
  const d = onlyDigits(digits);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : digits;
}
