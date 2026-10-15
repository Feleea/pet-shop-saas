import { SHOP_TIMEZONE, localDateString, localTimeString } from "./timezone";

/** "13/10/2026 09:30" no horário do pet shop. */
export function formatDateTimeBR(d: Date, tz: string = SHOP_TIMEZONE): string {
  const [y, m, day] = localDateString(d, tz).split("-");
  return `${day}/${m}/${y} ${localTimeString(d, tz)}`;
}
