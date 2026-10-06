import { describe, expect, it } from "vitest";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { addMonths } from "./months.js";
import {
  addMonthsClamped,
  detectSubscriptions,
  latestClosingByIssuer,
  monthlyRuns,
  priceIncrease,
  removeRefunded,
  similarAmounts,
  summarizeSubscriptions,
  type Charge,
  type SubscriptionContext,
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

const ctx = (overrides: Partial<SubscriptionContext> = {}): SubscriptionContext => ({
  hoy: "2026-10-03",
  ultimoCierre: {},
  ocultas: new Set<string>(),
  cotizacion: 1000,
  ...overrides,
});

const monthly = (values: number[], firstMonth = "2026-01", overrides: Partial<SubscriptionTx> = {}): SubscriptionTx[] =>
  values.map((amount, index) => tx(`${addMonths(firstMonth, index)}-09`, amount, overrides));

const EXCLUDED: [string, Partial<SubscriptionTx>][] = [
  ["cuotas", { isInstallment: true }],
  ["impuestos", { type: "tax" }],
  ["pagos", { type: "payment", direction: "credit" }],
  ["cargos", { type: "fee" }],
  ["créditos", { direction: "credit" }],
  ["montos en cero", { amount: 0 }],
];

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

describe("detectSubscriptions", () => {
  it("detecta 3 meses seguidos con el mismo monto", () => {
    const txs = [
      tx("2026-01-09", 5490, { merchant: "081419Q STREAMFLIX.COM LYXdQ0WEI5" }),
      tx("2026-02-09", 5490, { merchant: "Streamflix com" }),
      tx("2026-03-09", 5490),
    ];
    expect(detectSubscriptions(txs, ctx())).toEqual([{
      key: "STREAMFLIX COM",
      nombre: "STREAMFLIX.COM",
      busqueda: "STREAMFLIX",
      categoria: "Suscripciones",
      cardLabel: "Visa Signature",
      moneda: "ARS",
      montoActual: 5490,
      montoMensualArs: 5490,
      primerCobro: "2026-01-09",
      ultimoCobro: "2026-03-09",
      proximoCobro: "2026-04-09",
      cobros: 3,
      estado: "activa",
      oculta: false,
      aumento: null,
      monedaAnterior: null,
      cadencia: "mensual",
    }]);
  });

  it("dos meses no alcanzan", () => {
    expect(detectSubscriptions(monthly([5490, 5490]), ctx())).toEqual([]);
  });

  it("sin movimientos no hay suscripciones", () => {
    expect(detectSubscriptions([], ctx())).toEqual([]);
  });

  it.each(EXCLUDED)("no cuenta %s como cobro", (_label, overrides) => {
    const txs = [...monthly([5490, 5490]), tx("2026-03-09", 5490, overrides)];
    expect(detectSubscriptions(txs, ctx())).toEqual([]);
  });

  it("ignora los comercios sin palabras", () => {
    expect(detectSubscriptions(monthly([100, 100, 100], "2026-01", { merchant: "123456" }), ctx())).toEqual([]);
  });

  it("una devolución anula el cobro duplicado y la racha sigue", () => {
    const txs = [
      ...monthly([100, 100]),
      tx("2026-03-09", 110),
      tx("2026-03-10", 110),
      tx("2026-03-11", 110, { direction: "credit", type: "refund" }),
      tx("2026-04-09", 110),
    ];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ cobros: 4, primerCobro: "2026-01-09", montoActual: 110 }]);
  });

  it("una compra suelta en el mismo comercio no corta la racha si el cobro repite el monto", () => {
    const txs = [...monthly([100, 100, 100]), tx("2026-02-20", 37)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ cobros: 3 }]);
  });

  it("una compra suelta parecida en el mismo mes del último cobro no esconde la suscripción", () => {
    const txs = [...monthly([100, 100, 100]), tx("2026-03-20", 95)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ ultimoCobro: "2026-03-09", cobros: 3 }]);
  });

  it("junta los cobros en pesos y en dólares del mismo comercio y mide el aumento solo en dólares", () => {
    const txs = [...monthly([9000, 9000, 9000]), ...monthly([10, 10, 11], "2026-04", { currency: "USD" })];
    expect(detectSubscriptions(txs, ctx({ cotizacion: 1465 }))).toEqual([expect.objectContaining({
      moneda: "USD",
      monedaAnterior: "ARS",
      montoActual: 11,
      montoMensualArs: 16115,
      cobros: 6,
      primerCobro: "2026-01-09",
      aumento: { variacion: expect.closeTo(0.1, 6), desde: "2026-04", montoAnterior: 10 },
    })]);
  });

  it("un dólar estable no sube aunque en pesos valga más que antes", () => {
    const txs = [...monthly([9000, 9000, 9000]), ...monthly([10, 10, 10], "2026-04", { currency: "USD" })];
    expect(detectSubscriptions(txs, ctx({ cotizacion: 1465 }))).toMatchObject([{ aumento: null }]);
  });

  it("tolera un mes con impuestos incluidos", () => {
    expect(detectSubscriptions(monthly([151, 100, 100, 100, 100]), ctx())).toHaveLength(1);
  });

  it("descarta dos visitas de monto igual precedidas de una distinta", () => {
    const txs = monthly([26300, 12600, 11600], "2026-01", { merchant: "HELADERIA POLO" });
    expect(detectSubscriptions(txs, ctx())).toEqual([]);
  });

  it("fusiona los descriptores truncados en una sola suscripción", () => {
    const txs = [
      tx("2026-01-09", 3500, { merchant: "GOOGLE *VideoP X1y2Z3" }),
      tx("2026-02-09", 3500, { merchant: "GOOGLE *VideoPremium" }),
      tx("2026-03-09", 3500, { merchant: "GOOGLE *VideoP Q9w8E7" }),
    ];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([
      { key: "GOOGLE VIDEOP", nombre: "GOOGLE *VideoP", busqueda: "GOOGLE *VideoP", cobros: 3 },
    ]);
  });

  it("marca cortada si el próximo cobro más la gracia cae antes del último cierre de esa tarjeta", () => {
    const txs = monthly([100, 100, 100], "2026-06");
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: { visa_signature: "2026-09-26" } }))).toMatchObject([
      { estado: "cortada", proximoCobro: "2026-09-09" },
    ]);
  });

  it("sigue activa si el próximo cobro cae después del cierre (cobra el 28 y cerró el 27)", () => {
    const txs = [tx("2026-06-28", 100), tx("2026-07-28", 100), tx("2026-08-28", 100)];
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: { visa_signature: "2026-09-27" } }))).toMatchObject([
      { estado: "activa" },
    ]);
  });

  it("respeta los 7 días de gracia", () => {
    const txs = monthly([100, 100, 100], "2026-06");
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: { visa_signature: "2026-09-16" } }))).toMatchObject([
      { estado: "activa" },
    ]);
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: { visa_signature: "2026-09-17" } }))).toMatchObject([
      { estado: "cortada" },
    ]);
  });

  it("sin cierre de su tarjeta nunca se marca cortada", () => {
    const txs = monthly([100, 100, 100]);
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: { icbc: "2026-09-26" } }))).toMatchObject([{ estado: "activa" }]);
  });

  it("omite el comercio si después de un mes faltante hay cobros parecidos que todavía no forman racha", () => {
    const txs = [...monthly([100, 100, 100]), ...monthly([100, 100], "2026-05")];
    expect(detectSubscriptions(txs, ctx())).toEqual([]);
  });

  it("vuelve a aparecer cuando lo posterior al mes faltante ya suma 3 meses", () => {
    const txs = [...monthly([100, 100, 100]), ...monthly([100, 100, 100], "2026-05")];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ primerCobro: "2026-05-09", cobros: 3 }]);
  });

  it("un cobro posterior distinto no vuelve ambigua la racha", () => {
    const txs = [...monthly([100, 100, 100]), tx("2026-06-15", 900)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ ultimoCobro: "2026-03-09" }]);
  });

  it("no lista las cortadas de hace más de 12 meses", () => {
    const viejas = monthly([100, 100, 100], "2025-06");
    const recientes = monthly([200, 200, 200], "2025-09", { merchant: "MUSICAPP" });
    const items = detectSubscriptions([...viejas, ...recientes], ctx({ ultimoCierre: { visa_signature: "2026-09-26" } }));
    expect(items.map(({ key, estado }) => [key, estado])).toEqual([["MUSICAPP", "cortada"]]);
  });

  it("recorta el próximo cobro al último día del mes siguiente", () => {
    const txs = [tx("2026-01-31", 100), tx("2026-02-28", 100), tx("2026-03-31", 100)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ proximoCobro: "2026-04-30" }]);
  });

  it("marca oculta por la clave canónica", () => {
    const items = detectSubscriptions(monthly([100, 100, 100]), ctx({ ocultas: new Set(["STREAMFLIX COM"]) }));
    expect(items).toMatchObject([{ oculta: true }]);
  });

  it("marca oculta por una clave cruda que se fusionó en la canónica", () => {
    const txs = [
      tx("2026-01-09", 3500, { merchant: "GOOGLE *VideoPremium" }),
      tx("2026-02-09", 3500, { merchant: "GOOGLE *VideoP X1y2Z3" }),
      tx("2026-03-09", 3500, { merchant: "GOOGLE *VideoPremium" }),
    ];
    expect(detectSubscriptions(txs, ctx({ ocultas: new Set(["GOOGLE VIDEOPREMIUM"]) }))).toMatchObject([
      { key: "GOOGLE VIDEOP", oculta: true },
    ]);
  });

  it("pasa los dólares a pesos con la cotización, redondeado al centavo", () => {
    const txs = monthly([12.99, 12.99, 12.99], "2026-01", { currency: "USD" });
    expect(detectSubscriptions(txs, ctx({ cotizacion: 1465 }))).toMatchObject([{ montoMensualArs: 19030.35 }]);
  });

  it("sin cotización deja en null los pesos de las suscripciones en dólares", () => {
    const txs = monthly([12.99, 12.99, 12.99], "2026-01", { currency: "USD" });
    expect(detectSubscriptions(txs, ctx({ cotizacion: null }))).toMatchObject([{ montoMensualArs: null }]);
  });

  it("ordena activas por pesos (las sin cotización al final, por nombre) y después cortadas por último cobro", () => {
    const txs = [
      ...monthly([5000, 5000, 5000], "2026-06", { merchant: "ZETA MUSICA" }),
      ...monthly([8000, 8000, 8000], "2026-06", { merchant: "ALFA CLOUD" }),
      ...monthly([12, 12, 12], "2026-06", { merchant: "BETA VIDEO", currency: "USD" }),
      ...monthly([10, 10, 10], "2026-06", { merchant: "AERO NEWS", currency: "USD" }),
      ...monthly([300, 300, 300], "2026-02", { merchant: "VIEJO GIMNASIO" }),
      ...monthly([400, 400, 400], "2026-03", { merchant: "OTRO CLUB" }),
    ];
    const items = detectSubscriptions(txs, ctx({ cotizacion: null, ultimoCierre: { visa_signature: "2026-08-26" } }));
    expect(items.map(({ nombre, estado }) => `${estado} ${nombre}`)).toEqual([
      "activa ALFA CLOUD",
      "activa ZETA MUSICA",
      "activa AERO NEWS",
      "activa BETA VIDEO",
      "cortada OTRO CLUB",
      "cortada VIEJO GIMNASIO",
    ]);
  });
});

describe("summarizeSubscriptions", () => {
  const item = (overrides: Partial<SubscriptionDTO>): SubscriptionDTO => ({
    key: "K",
    nombre: "K",
    busqueda: "K",
    categoria: "Suscripciones",
    cardLabel: "ICBC",
    moneda: "ARS",
    montoActual: 0,
    montoMensualArs: 0,
    primerCobro: "2026-01-09",
    ultimoCobro: "2026-03-09",
    proximoCobro: "2026-04-09",
    cobros: 3,
    estado: "activa",
    oculta: false,
    aumento: null,
    monedaAnterior: null,
    cadencia: "mensual",
    ...overrides,
  });

  it("suma solo las activas visibles, con los dólares sin cotización solo en el total en USD", () => {
    expect(summarizeSubscriptions([
      item({ montoActual: 5000, montoMensualArs: 5000 }),
      item({ moneda: "USD", montoActual: 10, montoMensualArs: 14650 }),
      item({ moneda: "USD", montoActual: 5, montoMensualArs: null }),
      item({ montoActual: 3000, montoMensualArs: 3000, estado: "cortada" }),
      item({ montoActual: 7000, montoMensualArs: 7000, oculta: true }),
    ])).toEqual({ totalMensualArs: 19650, totalMensualUsd: 15, totalAnualArs: 235800 });
  });

  it("sin suscripciones da totales en cero", () => {
    expect(summarizeSubscriptions([])).toEqual({ totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0 });
  });
});
