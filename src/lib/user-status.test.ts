import { describe, expect, it } from "vitest";
import { parseVacationDays } from "./user-status";

describe("parseVacationDays", () => {
  it.each([
    ["1", 1],
    ["10", 10],
    [" 30 ", 30],
    ["365", 365],
    [15, 15],
  ])("aceita %j → %i", (raw, days) => expect(parseVacationDays(raw)).toBe(days));

  it.each(["", " ", "0", "366", "-5", "7.5", "7,5", "abc", "1e2", "00000", "10000", null, undefined, {}, NaN, 0, 366])(
    "rejeita %j",
    (raw) => expect(parseVacationDays(raw)).toBeNull(),
  );
});
