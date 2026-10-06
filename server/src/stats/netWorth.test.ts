import { describe, it, expect } from "vitest";
import type { ManualAssetDTO, NetWorthItemDTO, NetWorthTotals } from "@ledgerly/shared";
import type { SeriePoint } from "../fx/macroSources.js";
import { computeCreditProgress } from "./amortization.js";
import { addMonths } from "./months.js";
import {
  buildNetWorth, firstDataMonth, valuateAt,
  type NetWorthAutoCoupon, type NetWorthInputs, type NetWorthInstallment, type NetWorthMortgageCoupon,
  type NetWorthStatement,
} from "./netWorth.js";

const HOY = "2026-10-03";
const USD_HOY: SeriePoint = { fecha: "2026-10-02", valor: 1000 };

const autoCoupon = (cuotaNro: number, fechaEmision: string, valorMovil: number): NetWorthAutoCoupon => ({
  grupo: "1000", orden: "1", plan: "A", modelo: "MODELO X", cuotaNro, fechaEmision,
  fechaVencimiento: fechaEmision, valorMovil, totalAPagar: 100_000, totalUsd: null,
});

const mortgageCoupon = (
  cuotaNro: number,
  fechaDebito: string,
  overrides: Partial<NetWorthMortgageCoupon> = {},
): NetWorthMortgageCoupon => ({
  prestamoNro: "P-1", cuotaNro, fechaDebito, capital: 1000, intereses: 5000, seguroIncendio: 0,
  totalDebitado: 6000, cuotaPuraUva: 6, cotizacionUva: 1000, tna: 12, ...overrides,
});

const statement = (id: string, issuer: string, cardLabel: string, closingDate: string): NetWorthStatement => ({
  id, issuer, cardLabel, closingDate, uploadedAt: new Date(`${closingDate}T12:00:00Z`),
});

const installment = (
  statementId: string,
  amount: number,
  currency: "ARS" | "USD",
  installmentCurrent: number,
  installmentTotal: number,
): NetWorthInstallment => ({ statementId, amount, currency, isInstallment: true, installmentCurrent, installmentTotal });

const asset = (
  id: string,
  nombre: string,
  tipo: ManualAssetDTO["tipo"],
  moneda: ManualAssetDTO["moneda"],
  valuaciones: ManualAssetDTO["valuaciones"],
): ManualAssetDTO => ({ id, nombre, tipo, moneda, valuaciones });

const empty = (overrides: Partial<NetWorthInputs> = {}): NetWorthInputs => ({
  hoy: HOY, autoCoupons: [], mortgageCoupons: [], statements: [], installments: [], assets: [],
  usdSerie: [], uvaSerie: [], ...overrides,
});

const ejemplo = (): NetWorthInputs => empty({
  autoCoupons: [autoCoupon(29, "2026-08-18", 11_500_000), autoCoupon(30, "2026-09-18", 12_000_000)],
  mortgageCoupons: [mortgageCoupon(10, "2026-09-05")],
  statements: [statement("icbc-sep", "icbc", "ICBC", "2026-09-25")],
  installments: [installment("icbc-sep", 10_000, "ARS", 3, 6), installment("icbc-sep", 20, "USD", 1, 3)],
  assets: [
    asset("a-ahorros", "Ahorros", "ahorro", "USD", [{ fecha: "2026-10-01", monto: 5000 }]),
    asset("a-cuenta", "Cuenta", "cuenta", "ARS", [{ fecha: "2026-10-01", monto: 500_000 }]),
  ],
  usdSerie: [{ fecha: "2026-10-02", valor: 1000 }],
  uvaSerie: [{ fecha: "2026-10-03", valor: 2000 }],
});

const usdMensual = (desde: string, meses: number): SeriePoint[] =>
  Array.from({ length: meses }, (_unused, offset) => ({ fecha: `${addMonths(desde, offset)}-15`, valor: 1000 }));

const rounded = (totales: NetWorthTotals): Record<string, number> =>
  Object.fromEntries(Object.entries(totales).map(([key, value]) => [key, Math.round(value * 100) / 100]));

const itemById = (items: NetWorthItemDTO[], id: string): NetWorthItemDTO | undefined =>
  items.find((item) => item.id === id);

describe("buildNetWorth con el ejemplo del spec", () => {
  it("suma activos, pasivos y neto en pesos y en dólares", () => {
    const dto = buildNetWorth(ejemplo(), USD_HOY);
    expect(rounded(dto.totales)).toEqual({
      activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000,
      activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432,
    });
  });

  it("informa el dólar y la UVA con que valuó y devuelve los activos manuales", () => {
    const dto = buildNetWorth(ejemplo(), USD_HOY);
    expect(dto).toMatchObject({
      fecha: HOY, usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: 2000, uvaFecha: "2026-10-03",
    });
    expect(dto.activosManuales.map((manual) => manual.id)).toEqual(["a-ahorros", "a-cuenta"]);
  });

  it("ordena activos antes que pasivos y cada lado por monto descendente", () => {
    const { items } = buildNetWorth(ejemplo(), USD_HOY);
    expect(items.map((item) => item.id)).toEqual([
      "auto", "a-ahorros", "a-cuenta", "plan-auto", "hipoteca", "tarjeta:icbc:USD", "tarjeta:icbc:ARS",
    ]);
  });
});

describe("auto", () => {
  it("el activo es el valor móvil del último cupón emitido al corte", () => {
    const { items } = valuateAt(ejemplo(), "2026-09-01", 1000, null);
    expect(itemById(items, "auto")).toEqual({
      id: "auto", lado: "activo", fuente: "auto", label: "Auto", detalle: "MODELO X · valor móvil de la cuota 29",
      fecha: "2026-08-18", moneda: "ARS", montoOriginal: 11_500_000, ars: 11_500_000, usd: 11_500, assetId: null,
    });
  });

  it("el plan usa la última cuota aunque falten cupones intermedios", () => {
    const inputs = empty({ autoCoupons: [autoCoupon(2, "2024-10-18", 8_000_000), autoCoupon(30, "2026-09-18", 12_000_000)] });
    expect(itemById(valuateAt(inputs, HOY, 1000, null).items, "plan-auto")).toMatchObject({
      lado: "pasivo", fuente: "plan_auto", label: "Plan de ahorro del auto", detalle: "90 de 120 cuotas por pagar",
      fecha: "2026-09-18", ars: 9_000_000,
    });
  });

  it("con la cuota 120 queda el auto y no hay pasivo del plan", () => {
    const inputs = empty({ autoCoupons: [autoCoupon(120, "2026-09-18", 12_000_000)] });
    expect(valuateAt(inputs, HOY, 1000, null).items.map((item) => item.id)).toEqual(["auto"]);
  });

  it("un cupón emitido después del corte no cuenta", () => {
    expect(itemById(valuateAt(ejemplo(), "2026-08-01", 1000, null).items, "auto")).toBeUndefined();
  });
});

describe("hipoteca", () => {
  const dosCupones = [
    mortgageCoupon(10, "2026-08-05", { capital: 1000, intereses: 5000, cotizacionUva: 1000 }),
    mortgageCoupon(11, "2026-09-05", { capital: 1111, intereses: 5500, cotizacionUva: 1100 }),
  ];

  it("valúa el capital pendiente de Créditos a la UVA de la serie", () => {
    const progress = computeCreditProgress(dosCupones)!;
    const snapshot = valuateAt(empty({ mortgageCoupons: dosCupones }), HOY, 1000, { fecha: "2026-10-03", valor: 2000 });
    const hipoteca = itemById(snapshot.items, "hipoteca")!;
    expect(hipoteca).toMatchObject({
      lado: "pasivo", fuente: "hipoteca", label: "Hipoteca UVA", detalle: "499 UVA pendientes", fecha: "2026-10-03",
    });
    expect(hipoteca.ars).toBeCloseTo(progress.capitalPendienteUva * 2000, 6);
    expect(snapshot.uva).toEqual({ fecha: "2026-10-03", valor: 2000 });
  });

  it("sin serie UVA usa la cotización del último cupón", () => {
    const dto = buildNetWorth(empty({ mortgageCoupons: [mortgageCoupon(10, "2026-09-05")] }), USD_HOY);
    expect(itemById(dto.items, "hipoteca")).toMatchObject({ ars: 499_000, fecha: "2026-09-05" });
    expect(dto).toMatchObject({ uva: 1000, uvaFecha: "2026-09-05" });
  });

  it("con la serie UVA más vieja que el último cupón usa la del cupón", () => {
    const inputs = empty({ mortgageCoupons: [mortgageCoupon(10, "2026-09-05")] });
    expect(valuateAt(inputs, HOY, 1000, { fecha: "2026-08-31", valor: 900 }).uva).toEqual({ fecha: "2026-09-05", valor: 1000 });
  });

  it("sin hipoteca no informa UVA", () => {
    const inputs = empty({
      assets: [asset("c", "Cuenta", "cuenta", "ARS", [{ fecha: "2026-10-01", monto: 1 }])],
      uvaSerie: [{ fecha: "2026-10-03", valor: 2000 }],
    });
    expect(buildNetWorth(inputs, USD_HOY)).toMatchObject({ uva: null, uvaFecha: null });
  });

  it("si la tasa no da positiva no hay ítem", () => {
    const inputs = empty({ mortgageCoupons: [mortgageCoupon(10, "2026-09-05", { tna: 0 })] });
    expect(valuateAt(inputs, HOY, 1000, null).items).toEqual([]);
  });
});

describe("tarjeta", () => {
  it("cuenta solo las cuotas del último resumen de cada emisor", () => {
    const inputs = empty({
      statements: [statement("icbc-ago", "icbc", "ICBC", "2026-08-25"), statement("icbc-sep", "icbc", "ICBC", "2026-09-25")],
      installments: [installment("icbc-ago", 1000, "ARS", 1, 4), installment("icbc-sep", 1000, "ARS", 2, 4)],
    });
    expect(itemById(valuateAt(inputs, HOY, 1000, null).items, "tarjeta:icbc:ARS")).toEqual({
      id: "tarjeta:icbc:ARS", lado: "pasivo", fuente: "tarjeta", label: "Cuotas ICBC",
      detalle: "Último resumen: cierre 2026-09-25", fecha: "2026-09-25", moneda: "ARS",
      montoOriginal: 2000, ars: 2000, usd: 2, assetId: null,
    });
  });

  it("separa pesos y dólares y pasa los dólares al oficial", () => {
    const { items } = valuateAt(ejemplo(), HOY, 1000, null);
    expect(itemById(items, "tarjeta:icbc:USD")).toMatchObject({
      label: "Cuotas ICBC en dólares", moneda: "USD", montoOriginal: 40, ars: 40_000, usd: 40,
    });
    expect(itemById(items, "tarjeta:icbc:ARS")).toMatchObject({ moneda: "ARS", montoOriginal: 30_000, ars: 30_000, usd: 30 });
  });

  it("un emisor sin cuotas pendientes no genera ítem y uno con cuotas solo en dólares genera solo ese", () => {
    const inputs = empty({
      statements: [
        statement("icbc-sep", "icbc", "ICBC", "2026-09-25"),
        statement("visa-sep", "visa_signature", "Visa Signature", "2026-09-20"),
      ],
      installments: [installment("icbc-sep", 1000, "ARS", 6, 6), installment("visa-sep", 50, "USD", 1, 2)],
    });
    expect(valuateAt(inputs, HOY, 1000, null).items.map((item) => item.id)).toEqual(["tarjeta:visa_signature:USD"]);
  });

  it("un resumen que cierra después del corte no cuenta", () => {
    const inputs = empty({
      statements: [statement("icbc-sep", "icbc", "ICBC", "2026-09-25"), statement("icbc-oct", "icbc", "ICBC", "2026-10-25")],
      installments: [installment("icbc-sep", 1000, "ARS", 1, 4), installment("icbc-oct", 1000, "ARS", 2, 4)],
    });
    expect(itemById(valuateAt(inputs, HOY, 1000, null).items, "tarjeta:icbc:ARS")?.ars).toBe(3000);
  });
});

describe("activos manuales", () => {
  it("pasa los dólares a pesos y los pesos a dólares", () => {
    const { items } = valuateAt(ejemplo(), HOY, 1000, null);
    expect(itemById(items, "a-ahorros")).toEqual({
      id: "a-ahorros", lado: "activo", fuente: "manual", label: "Ahorros", detalle: "Ahorros", fecha: "2026-10-01",
      moneda: "USD", montoOriginal: 5000, ars: 5_000_000, usd: 5000, assetId: "a-ahorros",
    });
    expect(itemById(items, "a-cuenta")).toMatchObject({
      detalle: "Cuenta", moneda: "ARS", montoOriginal: 500_000, ars: 500_000, usd: 500, assetId: "a-cuenta",
    });
  });

  it("toma la última valuación hasta el corte", () => {
    const inputs = empty({
      assets: [asset("pf", "Plazo fijo", "plazo_fijo", "ARS", [
        { fecha: "2026-07-01", monto: 100 }, { fecha: "2026-08-01", monto: 200 }, { fecha: "2026-09-01", monto: 300 },
      ])],
    });
    expect(itemById(valuateAt(inputs, "2026-08-15", 1000, null).items, "pf")).toMatchObject({
      montoOriginal: 200, fecha: "2026-08-01", detalle: "Plazo fijo",
    });
  });

  it("un activo sin valuación hasta el corte no aparece", () => {
    const inputs = empty({ assets: [asset("pf", "Plazo fijo", "plazo_fijo", "ARS", [{ fecha: "2026-09-01", monto: 300 }])] });
    expect(valuateAt(inputs, "2026-08-31", 1000, null).items).toEqual([]);
  });

  it("un activo en cero se lista igual", () => {
    const inputs = empty({ assets: [asset("c", "Cuenta vacía", "cuenta", "ARS", [{ fecha: "2026-09-01", monto: 0 }])] });
    expect(valuateAt(inputs, HOY, 1000, null).items.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("evolución", () => {
  const cuenta = (fecha: string, monto: number) => asset("c", "Cuenta", "cuenta", "ARS", [{ fecha, monto }]);

  it("va mes a mes desde el primer dato hasta el mes actual", () => {
    const inputs = empty({ assets: [cuenta("2026-06-10", 1000)], usdSerie: usdMensual("2025-01", 22) });
    expect(buildNetWorth(inputs, USD_HOY).evolucion.map((mes) => mes.periodo)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("con datos de 2024 arranca en enero de 2025", () => {
    const inputs = empty({ autoCoupons: [autoCoupon(2, "2024-10-18", 8_000_000)], usdSerie: usdMensual("2025-01", 22) });
    const periodos = buildNetWorth(inputs, USD_HOY).evolucion.map((mes) => mes.periodo);
    expect(periodos[0]).toBe("2025-01");
    expect(periodos).toHaveLength(22);
  });

  it("omite los meses sin cotización del dólar", () => {
    const inputs = empty({ assets: [cuenta("2026-06-10", 1000)], usdSerie: [{ fecha: "2026-08-10", valor: 1000 }] });
    expect(buildNetWorth(inputs, USD_HOY).evolucion.map((mes) => mes.periodo)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("el mes en curso coincide con la foto aunque la serie no tenga dólar de este mes", () => {
    const dto = buildNetWorth({ ...ejemplo(), usdSerie: usdMensual("2026-07", 3) }, { fecha: HOY, valor: 1000 });
    const { periodo, ...ultimo } = dto.evolucion[dto.evolucion.length - 1];
    expect(periodo).toBe("2026-10");
    expect(ultimo).toEqual(dto.totales);
  });

  it("arrastra una valuación hacia adelante y no suma antes de la primera", () => {
    const inputs = empty({
      assets: [
        asset("b", "Billetera", "cuenta", "ARS", [{ fecha: "2026-07-05", monto: 100 }]),
        asset("c", "Cuenta", "cuenta", "ARS", [{ fecha: "2026-08-15", monto: 5000 }]),
      ],
      usdSerie: usdMensual("2025-01", 22),
    });
    const porMes = Object.fromEntries(buildNetWorth(inputs, USD_HOY).evolucion.map((mes) => [mes.periodo, mes.activosArs]));
    expect(porMes).toMatchObject({ "2026-07": 100, "2026-08": 5100, "2026-09": 5100 });
  });

  it("sin datos la evolución queda vacía", () => {
    expect(buildNetWorth(empty(), USD_HOY).evolucion).toEqual([]);
  });
});

describe("firstDataMonth", () => {
  it("sin datos da null", () => {
    expect(firstDataMonth(empty())).toBeNull();
  });

  it("toma el mes más viejo de cualquier fuente", () => {
    const inputs = empty({
      autoCoupons: [autoCoupon(1, "2026-06-18", 1)],
      mortgageCoupons: [mortgageCoupon(1, "2026-04-05")],
      statements: [statement("s", "icbc", "ICBC", "2026-03-25")],
      assets: [asset("c", "Cuenta", "cuenta", "ARS", [{ fecha: "2026-05-01", monto: 1 }, { fecha: "2026-02-10", monto: 1 }])],
    });
    expect(firstDataMonth(inputs)).toBe("2026-02");
  });
});
