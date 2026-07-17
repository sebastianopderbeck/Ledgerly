import { describe, it, expect } from "vitest";
import {
  parseArAmount,
  extractAmounts,
  parseVisaDate,
  parseSlashDate,
  parseSpanishDate,
  parseInstallment,
  classifyType,
  normalizeMerchant,
  shortDate,
} from "./normalize.js";

describe("parseArAmount", () => {
  it("parsea miles y decimales", () => {
    expect(parseArAmount("1.990.883,84")).toEqual({ amount: 1990883.84, direction: "debit" });
  });
  it("trata el guión final como crédito", () => {
    expect(parseArAmount("1.000,00-")).toEqual({ amount: 1000, direction: "credit" });
  });
  it("tolera el formato irregular de ICBC", () => {
    expect(parseArAmount("2705.742,75")).toEqual({ amount: 2705742.75, direction: "debit" });
  });
});

describe("extractAmounts", () => {
  it("extrae todos los importes en orden (el consumidor toma el último)", () => {
    expect(extractAmounts("DEV.IMP. RG 5617  30%(   16879,37)      5.063,81-")).toEqual(["16879,37", "5.063,81-"]);
  });
  it("extrae dos columnas", () => {
    expect(extractAmounts("SALDO ANTERIOR   1.000,00   10,00")).toEqual(["1.000,00", "10,00"]);
  });
});

describe("parseVisaDate", () => {
  it("DD.MM.YY → ISO", () => {
    expect(parseVisaDate("05.06.26")).toBe("2026-06-05");
  });
});

describe("parseSpanishDate", () => {
  it("día + mes en español + YY → ISO", () => {
    expect(parseSpanishDate("04", "Mayo", "26")).toBe("2026-05-04");
    expect(parseSpanishDate("02", "Jul", "26")).toBe("2026-07-02");
  });
});

describe("parseInstallment", () => {
  it("formato Visa 'Cuota NN/MM'", () => {
    expect(parseInstallment("MERPAGO*X Cuota  03/06")).toEqual({ isInstallment: true, current: 3, total: 6 });
  });
  it("formato ICBC 'C.NN/MM'", () => {
    expect(parseInstallment("VISUAR C.11/12")).toEqual({ isInstallment: true, current: 11, total: 12 });
  });
  it("sin cuotas", () => {
    expect(parseInstallment("BICHO CAFE")).toEqual({ isInstallment: false, current: null, total: null });
  });
});

describe("classifyType", () => {
  it("pago", () => expect(classifyType("SU PAGO EN PESOS")).toBe("payment"));
  it("impuesto IVA", () => expect(classifyType("IVA RG 4240 21%( 1000,00)")).toBe("tax"));
  it("impuesto IIBB", () => expect(classifyType("IIBB PERCEP-CABA 2,00%")).toBe("tax"));
  it("bonificación", () => expect(classifyType("BONIF. CONSUMO OV")).toBe("refund"));
  it("compra por defecto", () => expect(classifyType("MERPAGO*MERCADOLIBRE")).toBe("purchase"));
});

describe("normalizeMerchant", () => {
  it("quita prefijos de pasarela y tokens de cuota/USD", () => {
    expect(normalizeMerchant("MERPAGO*MERCADOLIBRE Cuota  03/06")).toBe("MERCADOLIBRE");
    expect(normalizeMerchant("PAYU*AR*UBER")).toBe("UBER");
    expect(normalizeMerchant("SERVICIO USD   50,00")).toBe("SERVICIO");
  });
});

describe("shortDate", () => {
  it("extrae una fecha corta tras una etiqueta", () => {
    expect(shortDate("CIERRE ACTUAL: 02 Jul 26", "CIERRE ACTUAL:")).toBe("2026-07-02");
    expect(shortDate("sin fecha", "CIERRE")).toBeNull();
  });
});

describe("parseSlashDate", () => {
  it("DD/MM/YYYY → ISO", () => {
    expect(parseSlashDate("17/06/2026")).toBe("2026-06-17");
    expect(parseSlashDate("18/08/2025")).toBe("2025-08-18");
  });
});
