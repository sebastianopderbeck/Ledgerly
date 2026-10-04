import { describe, expect, it } from "vitest";
import { addMonths } from "./months.js";
import {
  addMonthsClamped,
  latestClosingByIssuer,
  monthlyRuns,
  priceIncrease,
  removeRefunded,
  similarAmounts,
  type Charge,
  type SubscriptionTx,
} from "./subscriptions.js";

const STREAMFLIX = "STREAMFLIX.COM 58141049416586488";

const tx = (date: string, amount: number, overrides: Partial<SubscriptionTx> = {}): SubscriptionTx => ({
  date,
  merchant: STREAMFLIX,
  amount,
  currency: "ARS",
  direction: "debit",
  type: "purchase",
  isInstallment: false,
  category: "Suscripciones",
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  ...overrides,
});

const charge = (date: string, amount: number, overrides: Partial<Charge> = {}): Charge => ({
  ...tx(date, amount),
  key: "STREAMFLIX COM",
  ...overrides,
});

const monthlyCharges = (values: number[], firstMonth = "2026-01", overrides: Partial<Charge> = {}): Charge[] =>
  values.map((amount, index) => charge(`${addMonths(firstMonth, index)}-09`, amount, overrides));

const amounts = (run: Charge[]): number[] => run.map(({ amount }) => amount);
const dates = (run: Charge[]): string[] => run.map(({ date }) => date);

describe("latestClosingByIssuer", () => {
  it("toma el cierre más reciente de cada emisor e ignora los nulos y los emisores desconocidos", () => {
    expect(latestClosingByIssuer([
      { issuer: "visa_signature", closingDate: new Date("2026-08-26") },
      { issuer: "visa_signature", closingDate: new Date("2026-09-26") },
      { issuer: "icbc", closingDate: null },
      { issuer: "icbc", closingDate: new Date("2026-09-02") },
      { issuer: "amex", closingDate: new Date("2026-09-30") },
    ])).toEqual({ visa_signature: "2026-09-26", icbc: "2026-09-02" });
  });

  it("sin cierres no devuelve ningún emisor", () => {
    expect(latestClosingByIssuer([{ issuer: "icbc", closingDate: null }])).toEqual({});
  });
});

describe("addMonthsClamped", () => {
  it("recorta el día al último del mes destino, hacia adelante y hacia atrás", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-08-09", -12)).toBe("2025-08-09");
  });
});

describe("removeRefunded", () => {
  const debit = charge("2026-03-09", 110);

  it("anula el débito devuelto por el mismo monto dentro de los 15 días", () => {
    expect(removeRefunded([debit], [charge("2026-03-24", 110, { direction: "credit" })])).toEqual([]);
  });

  it("no anula pasado el plazo ni con un crédito anterior al débito", () => {
    const credits = [charge("2026-03-25", 110, { direction: "credit" }), charge("2026-03-08", 110, { direction: "credit" })];
    expect(removeRefunded([debit], credits)).toEqual([debit]);
  });

  it("una devolución parcial, de otra moneda o de otro comercio no anula", () => {
    const credits = [
      charge("2026-03-10", 50, { direction: "credit" }),
      charge("2026-03-10", 110, { direction: "credit", currency: "USD" }),
      charge("2026-03-10", 110, { direction: "credit", key: "OTRO COMERCIO" }),
    ];
    expect(removeRefunded([debit], credits)).toEqual([debit]);
  });

  it("con dos cobros iguales y una devolución anula solo el más cercano", () => {
    const later = charge("2026-03-10", 110);
    expect(removeRefunded([debit, later], [charge("2026-03-11", 110, { direction: "credit" })])).toEqual([debit]);
  });
});

describe("monthlyRuns", () => {
  it("arma una racha con meses seguidos", () => {
    expect(monthlyRuns(monthlyCharges([100, 100, 100])).map(amounts)).toEqual([[100, 100, 100]]);
  });

  it("cruza el cambio de año", () => {
    expect(monthlyRuns(monthlyCharges([100, 100, 100], "2025-11")).map(dates)).toEqual([
      ["2025-11-09", "2025-12-09", "2026-01-09"],
    ]);
  });

  it("ordena por fecha antes de armar las rachas", () => {
    expect(monthlyRuns(monthlyCharges([100, 100, 100]).reverse()).map(dates)).toEqual([
      ["2026-01-09", "2026-02-09", "2026-03-09"],
    ]);
  });

  it("un mes vacío corta la racha", () => {
    const charges = [...monthlyCharges([100, 100]), ...monthlyCharges([100, 100], "2026-04")];
    expect(monthlyRuns(charges).map(dates)).toEqual([
      ["2026-01-09", "2026-02-09"],
      ["2026-04-09", "2026-05-09"],
    ]);
  });

  it("en un mes con varios cobros sigue con el que repite el monto (±1 %) y descarta la compra suelta", () => {
    const charges = [
      charge("2026-01-09", 100),
      charge("2026-02-03", 40),
      charge("2026-02-09", 100.5),
      charge("2026-02-20", 99.8),
      charge("2026-03-09", 100),
    ];
    expect(monthlyRuns(charges).map(amounts)).toEqual([[100, 99.8, 100]]);
  });

  it("si en un mes con varios cobros ninguno repite el monto, corta la racha y ese mes no empieza otra", () => {
    const charges = [charge("2026-01-09", 100), charge("2026-02-09", 120), charge("2026-02-15", 40), charge("2026-03-09", 120)];
    expect(monthlyRuns(charges).map(amounts)).toEqual([[100], [120]]);
  });

  it("un mes con varios cobros no empieza una racha", () => {
    const charges = [charge("2026-01-05", 100), charge("2026-01-20", 50), charge("2026-02-09", 100), charge("2026-03-09", 100)];
    expect(monthlyRuns(charges).map(amounts)).toEqual([[100, 100]]);
  });

  it("sin cobros no hay rachas", () => {
    expect(monthlyRuns([])).toEqual([]);
  });
});

describe("similarAmounts", () => {
  it("tolera un mes con +51 % en la punta de cinco cobros", () => {
    expect(similarAmounts(monthlyCharges([151, 100, 100, 100, 100]))).toBe(true);
  });

  it("tolera un mes con +51 % en el medio de seis cobros", () => {
    expect(similarAmounts(monthlyCharges([100, 100, 151, 100, 100, 100]))).toBe(true);
  });

  it("un mes raro en el medio de cinco rompe dos de cuatro pares y no alcanza", () => {
    expect(similarAmounts(monthlyCharges([100, 100, 151, 100, 100]))).toBe(false);
  });

  it("rechaza dos visitas de monto igual precedidas de una distinta", () => {
    expect(similarAmounts(monthlyCharges([26300, 12600, 11600]))).toBe(false);
  });

  it("no cuenta los pares con cambio de moneda", () => {
    const run = [...monthlyCharges([9000, 9000]), ...monthlyCharges([10, 10], "2026-03", { currency: "USD" })];
    expect(similarAmounts(run)).toBe(true);
    expect(similarAmounts([charge("2026-01-09", 9000), charge("2026-02-09", 10, { currency: "USD" })])).toBe(false);
  });
});

describe("priceIncrease", () => {
  it("mide el aumento contra el primer cobro de la ventana", () => {
    expect(priceIncrease(monthlyCharges([4990, 4990, 5490]))).toEqual({
      variacion: expect.closeTo(0.1002, 4),
      desde: "2026-01",
      montoAnterior: 4990,
    });
  });

  it("un aumento menor al 5 % o una baja no se informan", () => {
    expect(priceIncrease(monthlyCharges([1000, 1000, 1030]))).toBeNull();
    expect(priceIncrease(monthlyCharges([1000, 1000, 900]))).toBeNull();
  });

  it("la referencia se limita a los últimos 12 meses", () => {
    const stable = monthlyCharges([4000, 4000, ...Array.from({ length: 13 }, () => 4400)], "2025-01");
    expect(priceIncrease(stable)).toBeNull();
    const raised = monthlyCharges([4000, 4000, ...Array.from({ length: 12 }, () => 4400), 4840], "2025-01");
    expect(priceIncrease(raised)).toEqual({ variacion: expect.closeTo(0.1, 6), desde: "2025-03", montoAnterior: 4400 });
  });

  it("mide solo en la moneda del último cobro", () => {
    const run = [...monthlyCharges([9000, 9000, 9000]), ...monthlyCharges([10, 10, 11], "2026-04", { currency: "USD" })];
    expect(priceIncrease(run)).toEqual({ variacion: expect.closeTo(0.1, 6), desde: "2026-04", montoAnterior: 10 });
  });

  it("con un solo cobro en la moneda nueva no hay aumento", () => {
    const run = [...monthlyCharges([100, 100]), charge("2026-03-09", 10, { currency: "USD" })];
    expect(priceIncrease(run)).toBeNull();
  });
});
