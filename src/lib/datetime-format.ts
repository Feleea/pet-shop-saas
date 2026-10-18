import { SHOP_TIMEZONE } from "./timezone";

export function formatDateTimeBR(value: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SHOP_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}
