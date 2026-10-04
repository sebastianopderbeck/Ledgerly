import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "../parsers/normalize.js";
import { matchRule } from "./categorize.js";
import { MAX_PATTERN_WORDS, MIN_RULE_PATTERN_LENGTH, suggestPattern } from "./suggestPattern.js";

describe("suggestPattern", () => {
  it.each([
    ["COMERCIO UNO", "COMERCIO UNO"],
    ["NETFLIX.COM 12345", "NETFLIX.COM"],
    ["MERCADOLIBRE*3CUOTAS", "MERCADOLIBRE"],
    ["UBER *TRIP HELP.UBER.COM", "UBER *TRIP HELP.UBER.COM"],
    ["UBER * 123", "UBER"],
    ["LA PANADERIA DE PEPE", "LA PANADERIA DE"],
    ["YPF 1234", "YPF"],
    ["7 ELEVEN", "7 ELEVEN"],
    ["AB 123", "AB 123"],
    ["  cafe   martinez ", "CAFE MARTINEZ"],
  ])("%s → %s", (merchant, pattern) => {
    expect(suggestPattern(merchant)).toBe(pattern);
  });

  it("pide 3 caracteres y se queda con hasta 3 palabras", () => {
    expect(MIN_RULE_PATTERN_LENGTH).toBe(3);
    expect(MAX_PATTERN_WORDS).toBe(3);
  });

  it("el patrón es prefijo del comercio y una regla contains con él lo matchea", () => {
    const merchants = [
      "MERPAGO*MERCADOLIBRE Cuota 03/06",
      "PAYU*AR*UBER",
      "SERVICIO USD 50,00",
      "STEAMGAMES.COM 4259522985",
      "NETFLIX.COM 12345",
      "DLO*GOOGLE YouTube 9.999,00",
      "7 ELEVEN",
      "KIOSCO EL SOL",
      "PANADERIA LA ESPIGA S.R.L.",
    ].map(normalizeMerchant);
    for (const merchant of merchants) {
      const pattern = suggestPattern(merchant);
      expect(pattern.length).toBeGreaterThanOrEqual(MIN_RULE_PATTERN_LENGTH);
      expect(merchant.toUpperCase().startsWith(pattern)).toBe(true);
      expect(matchRule(merchant, merchant, [{ priority: 100, matchType: "contains", pattern, category: "X", enabled: true }])).toBe("X");
    }
  });
});
