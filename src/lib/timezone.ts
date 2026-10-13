/** Todos os pet shops usam o horário de Brasília por enquanto (fuso por pet shop fica para depois). */
export const SHOP_TIMEZONE = "America/Sao_Paulo";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    cache.set(tz, f);
  }
  return f;
}

function parts(d: Date, tz: string) {
  const o: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { year: o.year, month: o.month, day: o.day, hour: o.hour % 24, minute: o.minute, second: o.second };
}

/** Diferença (em ms) entre o relógio local do fuso e o UTC no instante `d`. */
function offsetMs(d: Date, tz: string): number {
  const p = parts(d, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * "2026-10-13" + "10:00" no fuso `tz` → instante UTC.
 * Retorna null se a data/hora for inválida ou não existir no fuso (salto do horário de verão).
 */
export function zonedLocalToUtc(date: string, time: string, tz: string = SHOP_TIMEZONE): Date | null {
  if (!isValidDateString(date) || !TIME_RE.test(time)) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  const back = parts(new Date(t), tz);
  if (back.year !== y || back.month !== mo || back.day !== d || back.hour !== h || back.minute !== mi) return null;
  return new Date(t);
}

const two = (n: number) => String(n).padStart(2, "0");

/** Data local no formato "AAAA-MM-DD" (a que vai no campo de data). */
export function localDateString(d: Date, tz: string = SHOP_TIMEZONE): string {
  const p = parts(d, tz);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** Hora local "HH:mm". */
export function localTimeString(d: Date, tz: string = SHOP_TIMEZONE): string {
  const p = parts(d, tz);
  return `${two(p.hour)}:${two(p.minute)}`;
}

/** Soma dias a uma data "AAAA-MM-DD" (calendário puro, sem fuso). */
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

function startOfLocalDay(date: string, tz: string): Date {
  // Em fusos com horário de verão a meia-noite pode não existir; nesse caso usa 01:00.
  return zonedLocalToUtc(date, "00:00", tz) ?? zonedLocalToUtc(date, "01:00", tz)!;
}

/** Intervalo [from, to) em UTC que cobre o dia local inteiro. */
export function dayRangeUtc(date: string, tz: string = SHOP_TIMEZONE): { from: Date; to: Date } {
  return { from: startOfLocalDay(date, tz), to: startOfLocalDay(addDays(date, 1), tz) };
}
