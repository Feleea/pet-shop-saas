import { describe, expect, it } from "vitest";
import { bpToInput, formatPercentBp, parsePercentToBp } from "./percent";

describe("parsePercentToBp", () => {
  it.each([
    ["5", 500],
    ["2,5", 250],
    ["2.50", 250],
    ["5%", 500],
    [" 3 % ", 300],
    ["0", 0],
    ["0,01", 1],
    ["100", 10000],
  ])("aceita %j → %i", (s, bp) => expect(parsePercentToBp(s)).toBe(bp));

  it.each(["", "abc", "-1", "2,555", "1.250", "5,", ",5", "1000", "2,5,1"])("recusa %j", (s) => expect(parsePercentToBp(s)).toBeNull());
});

describe("formatação", () => {
  it("exibe com vírgula e duas casas", () => {
    expect(formatPercentBp(500)).toBe("5,00%");
    expect(formatPercentBp(250)).toBe("2,50%");
    expect(bpToInput(250)).toBe("2,50");
  });
});
