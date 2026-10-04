import { describe, it, expect } from "vitest";
import type { ManualAssetDTO, NetWorthDTO, NetWorthItemDTO, NetWorthMonthDTO } from "@ledgerly/shared";
import {
  ASSET_TYPE_LABELS, ASSET_TYPES, assetDraftFrom, assetRequest, itemsBySide, latestValuation, missingPropertyHint,
  netWorthChartSeries, valuationsNewestFirst, type AssetDraft,
} from "./netWorth.js";

const TODAY = "2026-10-03";

const item = (id: string, lado: NetWorthItemDTO["lado"], fuente: NetWorthItemDTO["fuente"]): NetWorthItemDTO => ({
  id, lado, fuente, label: id, detalle: "", fecha: "2026-10-01", moneda: "ARS",
  montoOriginal: 1000, ars: 1000, usd: 1, assetId: null,
});

const ahorros: ManualAssetDTO = {
  id: "a-ahorros", nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
  valuaciones: [{ fecha: "2026-08-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }],
};

const casa: ManualAssetDTO = {
  id: "a-casa", nombre: "Casa", tipo: "inmueble", moneda: "USD", valuaciones: [{ fecha: "2026-10-01", monto: 90_000 }],
};

const draft = (overrides: Partial<AssetDraft> = {}): AssetDraft => ({
  nombre: "Plazo fijo", tipo: "plazo_fijo", moneda: "ARS", monto: "1.500.000", fecha: TODAY, ...overrides,
});

const TOTALS = {
  activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000,
  activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432,
};

const netWorth = (items: NetWorthItemDTO[], activosManuales: ManualAssetDTO[]): NetWorthDTO => ({
  fecha: TODAY, usdOficial: 1000, usdOficialFecha: TODAY, uva: null, uvaFecha: null,
  totales: TOTALS, items, evolucion: [], activosManuales,
});

describe("tipos de activo", () => {
  it("tiene una etiqueta por cada tipo, en el orden del selector", () => {
    expect(ASSET_TYPES).toEqual(["cuenta", "ahorro", "plazo_fijo", "inversion", "inmueble", "otro"]);
    expect(ASSET_TYPES.map((tipo) => ASSET_TYPE_LABELS[tipo])).toEqual([
      "Cuenta", "Ahorros", "Plazo fijo", "Inversiones", "Inmueble", "Otro",
    ]);
  });
});

describe("itemsBySide", () => {
  it("separa activos y pasivos sin cambiar el orden", () => {
    const items = [item("auto", "activo", "auto"), item("plan", "pasivo", "plan_auto"), item("c", "activo", "manual")];
    const { activos, pasivos } = itemsBySide(items);
    expect(activos.map((current) => current.id)).toEqual(["auto", "c"]);
    expect(pasivos.map((current) => current.id)).toEqual(["plan"]);
  });
});

describe("valuaciones", () => {
  it("latestValuation da la de fecha más nueva", () => {
    expect(latestValuation(ahorros)).toEqual({ fecha: "2026-10-01", monto: 5000 });
    expect(latestValuation({ ...ahorros, valuaciones: [] })).toBeNull();
  });

  it("valuationsNewestFirst ordena de la más nueva a la más vieja", () => {
    expect(valuationsNewestFirst(ahorros).map((valuacion) => valuacion.fecha)).toEqual(["2026-10-01", "2026-08-01"]);
  });
});

describe("assetDraftFrom", () => {
  it("un activo nuevo arranca vacío, en pesos y con fecha de hoy", () => {
    expect(assetDraftFrom(null, TODAY)).toEqual({ nombre: "", tipo: "cuenta", moneda: "ARS", monto: "", fecha: TODAY });
  });

  it("al editar trae el activo, la última valuación con puntos de miles y la fecha de hoy", () => {
    expect(assetDraftFrom(ahorros, TODAY)).toEqual({
      nombre: "Ahorros", tipo: "ahorro", moneda: "USD", monto: "5.000", fecha: TODAY,
    });
  });
});

describe("assetRequest", () => {
  it("crea con el body completo y el nombre recortado", () => {
    expect(assetRequest(draft({ nombre: "  Plazo fijo  " }), null, TODAY)).toEqual({
      kind: "create",
      body: { nombre: "Plazo fijo", tipo: "plazo_fijo", moneda: "ARS", valuacion: { fecha: TODAY, monto: 1_500_000 } },
    });
  });

  it("sin cambios al editar no manda nada", () => {
    expect(assetRequest(assetDraftFrom(ahorros, TODAY), ahorros, TODAY)).toBeNull();
  });

  it("cambiar solo el valor manda la valuación con hoy", () => {
    expect(assetRequest({ ...assetDraftFrom(ahorros, TODAY), monto: "6.000" }, ahorros, TODAY)).toEqual({
      kind: "update", id: "a-ahorros", body: { valuacion: { fecha: TODAY, monto: 6000 } },
    });
  });

  it("cambiar solo nombre y tipo no manda valuación", () => {
    const changed = { ...assetDraftFrom(ahorros, TODAY), nombre: "Dólares", tipo: "inversion" as const };
    expect(assetRequest(changed, ahorros, TODAY)).toEqual({
      kind: "update", id: "a-ahorros", body: { nombre: "Dólares", tipo: "inversion" },
    });
  });

  it("cambiar solo la fecha manda la valuación con esa fecha", () => {
    expect(assetRequest({ ...assetDraftFrom(ahorros, TODAY), fecha: "2026-09-15" }, ahorros, TODAY)).toEqual({
      kind: "update", id: "a-ahorros", body: { valuacion: { fecha: "2026-09-15", monto: 5000 } },
    });
  });

  it.each([
    ["nombre vacío", draft({ nombre: "   " })],
    ["nombre de más de 60", draft({ nombre: "x".repeat(61) })],
    ["valor inválido", draft({ monto: "abc" })],
    ["valor vacío", draft({ monto: "" })],
    ["fecha futura", draft({ fecha: "2026-10-04" })],
    ["sin fecha", draft({ fecha: "" })],
  ])("con %s no hay pedido", (_caso, invalid) => {
    expect(assetRequest(invalid, null, TODAY)).toBeNull();
  });
});

describe("netWorthChartSeries", () => {
  const months: NetWorthMonthDTO[] = [{ periodo: "2026-10", ...TOTALS }];

  it("en dólares usa los totales en USD", () => {
    expect(netWorthChartSeries(months, "USD")).toEqual([
      { id: "Activos", data: [{ x: "2026-10", y: 17_500 }] },
      { id: "Pasivos", data: [{ x: "2026-10", y: 10_068 }] },
      { id: "Patrimonio neto", data: [{ x: "2026-10", y: 7_432 }] },
    ]);
  });

  it("en pesos usa los totales en ARS", () => {
    expect(netWorthChartSeries(months, "ARS").map((serie) => serie.data[0].y)).toEqual([17_500_000, 10_068_000, 7_432_000]);
  });
});

describe("missingPropertyHint", () => {
  const hipoteca = item("hipoteca", "pasivo", "hipoteca");

  it("avisa con hipoteca y sin inmueble", () => {
    expect(missingPropertyHint(netWorth([hipoteca], [ahorros]))).toBe(true);
  });

  it("no avisa si hay un inmueble", () => {
    expect(missingPropertyHint(netWorth([hipoteca], [ahorros, casa]))).toBe(false);
  });

  it("no avisa sin hipoteca", () => {
    expect(missingPropertyHint(netWorth([item("auto", "activo", "auto")], []))).toBe(false);
  });
});
