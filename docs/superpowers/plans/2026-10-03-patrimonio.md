# Patrimonio neto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la página **Patrimonio** (`/patrimonio`): la foto de hoy (activos, pasivos y neto en pesos y en dólares al oficial), la evolución mes a mes y el ABM de activos cargados a mano.

**Architecture:** Una función pura `buildNetWorth` en `server/src/stats/netWorth.ts` arma la foto y la evolución a partir de cupones del auto y de la hipoteca, el último resumen de cada tarjeta, los activos manuales y las series macro. `GET /api/net-worth` solo junta los datos de Mongo y la llama; cuatro endpoints más hacen el ABM de `ManualAsset`. El cliente hace una sola query y pinta: lógica pura en `client/src/netWorth.ts`, editor en una `ResponsiveSheet` y gráfico nivo con toggle USD/pesos.

**Tech Stack:** TypeScript, Express + Mongoose (server), React 18 + MUI 6 + `@nivo/line` + React Query 5 (client), Zod DTOs en `shared`, Vitest + supertest + `mongodb-memory-server`, bun.

**Spec:** `docs/superpowers/specs/2026-10-03-patrimonio-design.md`

## Global Constraints

- **Base:** rama `feat/base-nuevas-features`. Ya trae DTOs (`shared/src/dtos.ts`), `ManualAssetModel`, `toManualAssetDTO`, el router stub montado en `/api/net-worth`, los hooks (`useNetWorth` devuelve `NetWorthDTO | null`), `moneyInput.ts`, `ResponsiveSheet.tsx`, la ruta `/patrimonio` y el ítem de menú. **No se tocan**: `shared/*`, `models.ts`, `app.ts`, `mappers.ts`, `server/src/stats/{months,rateOnDate,amortization,autoProgress,futureInstallments,lastStatement,monthlyUsd}.ts`, `App.tsx`, `App.test.tsx`, `api/hooks.ts`, `layout/*`, `moneyInput.ts`, `ResponsiveSheet.tsx`, `package.json`, `bun.lock`.
- **Helpers de la base:** `monthRange(desde, hasta): string[]` y `monthOf(fecha)` de `server/src/stats/months.ts`; `pointOnDate(fecha, points)` de `server/src/stats/rateOnDate.ts` (fecha primero).
- **Cliente importa solo tipos** de `@ledgerly/shared` (un valor arrastra zod al bundle). Las etiquetas de tipo de activo del cliente viven en `client/src/netWorth.ts`.
- **Ventana:** evolución desde `NET_WORTH_START = "2025-01"` (`MACRO_START`).
- **Plan del auto:** `AUTO_CUOTAS_TOTALES = 120`; pasivo = `valorMovil × (120 − ultimaCuota) / 120`.
- **Colores del gráfico:** Activos slot 2, Pasivos slot 5, Patrimonio neto slot 1 (`seriesColor` de `palette.ts`), validados con `dataviz/scripts/validate_palette.js`.
- **Textos fijos:** 503 «No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.»; 400 «Datos del activo inválidos» y «La fecha de valuación no puede ser futura»; 404 «Activo no encontrado» / «Valuación no encontrada»; 409 «No se puede borrar la única valuación: borrá el activo».
- **Sin comentarios en el código**, componentes funcionales con props destructuradas en la firma, `interface` para cada `Props`, sin `any`, keys por id, filtros y mapeos antes del `return`, early returns para carga y error.
- **Tests del cliente:** `afterEach(cleanup)` (el auto-cleanup está apagado). Fixtures sintéticos, nunca de `examples/`.
- **Correr tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`; build: `bun run build`.
- **Commits:** uno por tarea, con pathspec explícito, mensaje convencional en español y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca push.

## Review Focus

- **Serie UVA desactualizada:** si el último punto de la serie `uva` es anterior al último cupón de la hipoteca, la deuda se valúa a la UVA del cupón, no a una más vieja (test en Task 1).
- **Mes en curso sin dólar en la serie:** el último punto de la evolución existe igual (usa el dólar de hoy) y coincide con la foto (test en Task 1).
- **Ids mal formados:** `PATCH` o borrar una valuación con un id que no es ObjectId responde 404, no 500 (test en Task 2).
- **Monto precargado con puntos de miles:** abrir un activo y guardar sin tocar nada no manda nada; `"5.000"` vuelve a ser 5000 (test en Task 3).
- **Fecha vacía o futura en el date picker:** «Guardar» queda deshabilitado (test en Task 3).

---

### Task 1: Cálculo puro del patrimonio

**Files:**
- Create: `server/src/stats/netWorth.ts`
- Test: `server/src/stats/netWorth.test.ts`

**Interfaces:**
- Consumes: `computeAutoProgress` / `AutoCouponInput` (autoProgress.ts), `computeCreditProgress` / `CouponInput` (amortization.ts), `latestStatementIdsPerIssuer` (lastStatement.ts), `remainingInstallmentDebt` (futureInstallments.ts), `representativeRateDate` (monthlyUsd.ts), `monthOf` / `monthRange` (months.ts), `pointOnDate` (rateOnDate.ts), `MACRO_START` / `SeriePoint` (macroSources.ts), `MANUAL_ASSET_TYPE_LABELS` y tipos de `@ledgerly/shared`.
- Produces: `NetWorthAutoCoupon`, `NetWorthMortgageCoupon`, `NetWorthStatement`, `NetWorthInstallment`, `NetWorthInputs`, `NetWorthSnapshot`, `NET_WORTH_START`, `firstDataMonth(inputs): string | null`, `valuateAt(inputs, corte, usd, uvaSpot): NetWorthSnapshot`, `buildNetWorth(inputs, usdHoy: SeriePoint): NetWorthDTO`. Las usa la ruta (Task 2).

- [ ] **Step 1: Write the failing test**

Crear `server/src/stats/netWorth.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/netWorth.test.ts`
Expected: FAIL — `Failed to resolve import "./netWorth.js"`.

- [ ] **Step 3: Write minimal implementation**

Crear `server/src/stats/netWorth.ts`:

```typescript
import {
  MANUAL_ASSET_TYPE_LABELS,
  type AssetValuationDTO, type Currency, type ManualAssetDTO, type NetWorthDTO, type NetWorthItemDTO,
  type NetWorthMonthDTO, type NetWorthTotals,
} from "@ledgerly/shared";
import { MACRO_START, type SeriePoint } from "../fx/macroSources.js";
import { computeCreditProgress, type CouponInput } from "./amortization.js";
import { computeAutoProgress, type AutoCouponInput } from "./autoProgress.js";
import { remainingInstallmentDebt } from "./futureInstallments.js";
import { latestStatementIdsPerIssuer } from "./lastStatement.js";
import { representativeRateDate } from "./monthlyUsd.js";
import { monthOf, monthRange } from "./months.js";
import { pointOnDate } from "./rateOnDate.js";

export interface NetWorthAutoCoupon extends AutoCouponInput {
  fechaEmision: string;
}

export interface NetWorthMortgageCoupon extends CouponInput {
  fechaDebito: string;
}

export interface NetWorthStatement {
  id: string;
  issuer: string;
  cardLabel: string;
  closingDate: string;
  uploadedAt: Date;
}

export interface NetWorthInstallment {
  statementId: string;
  amount: number;
  currency: Currency;
  isInstallment: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

export interface NetWorthInputs {
  hoy: string;
  autoCoupons: NetWorthAutoCoupon[];
  mortgageCoupons: NetWorthMortgageCoupon[];
  statements: NetWorthStatement[];
  installments: NetWorthInstallment[];
  assets: ManualAssetDTO[];
  usdSerie: SeriePoint[];
  uvaSerie: SeriePoint[];
}

export interface NetWorthSnapshot {
  items: NetWorthItemDTO[];
  totales: NetWorthTotals;
  uva: SeriePoint | null;
}

interface ItemBase {
  id: string;
  lado: NetWorthItemDTO["lado"];
  fuente: NetWorthItemDTO["fuente"];
  label: string;
  detalle: string;
  fecha: string;
  assetId: string | null;
}

interface MortgageValuation {
  item: NetWorthItemDTO;
  uva: SeriePoint;
}

export const NET_WORTH_START = monthOf(MACRO_START);

const UVA_UNITS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const SIDE_ORDER: Record<NetWorthItemDTO["lado"], number> = { activo: 0, pasivo: 1 };

const arsItem = (base: ItemBase, ars: number, usd: number): NetWorthItemDTO => ({
  ...base, moneda: "ARS", montoOriginal: ars, ars, usd: ars / usd,
});

const usdItem = (base: ItemBase, monto: number, usd: number): NetWorthItemDTO => ({
  ...base, moneda: "USD", montoOriginal: monto, ars: monto * usd, usd: monto,
});

const highestCuota = <Coupon extends { cuotaNro: number }>(coupons: Coupon[]): Coupon =>
  coupons.reduce((latest, coupon) => (coupon.cuotaNro > latest.cuotaNro ? coupon : latest));

const autoItems = (coupons: NetWorthAutoCoupon[], corte: string, usd: number): NetWorthItemDTO[] => {
  const emitidos = coupons.filter((coupon) => coupon.fechaEmision <= corte);
  const summary = computeAutoProgress(emitidos);
  if (!summary) return [];
  const fecha = highestCuota(emitidos).fechaEmision;
  const auto = arsItem({
    id: "auto", lado: "activo", fuente: "auto", label: "Auto",
    detalle: `${summary.modelo} · valor móvil de la cuota ${summary.ultimaCuota}`, fecha, assetId: null,
  }, summary.valorActualAuto, usd);
  const restantes = Math.max(0, summary.cuotasTotales - summary.ultimaCuota);
  if (restantes === 0) return [auto];
  const plan = arsItem({
    id: "plan-auto", lado: "pasivo", fuente: "plan_auto", label: "Plan de ahorro del auto",
    detalle: `${restantes} de ${summary.cuotasTotales} cuotas por pagar`, fecha, assetId: null,
  }, (summary.valorActualAuto * restantes) / summary.cuotasTotales, usd);
  return [auto, plan];
};

const mortgageValuation = (
  coupons: NetWorthMortgageCoupon[],
  corte: string,
  usd: number,
  uvaSpot: SeriePoint | null,
): MortgageValuation | null => {
  const debitados = coupons.filter((coupon) => coupon.fechaDebito <= corte);
  const progress = computeCreditProgress(debitados);
  if (!progress) return null;
  const delCupon: SeriePoint = { fecha: highestCuota(debitados).fechaDebito, valor: progress.cotizacionUvaActual };
  const uva = uvaSpot && uvaSpot.fecha >= delCupon.fecha ? uvaSpot : delCupon;
  const item = arsItem({
    id: "hipoteca", lado: "pasivo", fuente: "hipoteca", label: "Hipoteca UVA",
    detalle: `${UVA_UNITS.format(progress.capitalPendienteUva)} UVA pendientes`, fecha: uva.fecha, assetId: null,
  }, progress.capitalPendienteUva * uva.valor, usd);
  return { item, uva };
};

const installmentsByStatement = (installments: NetWorthInstallment[]): Map<string, NetWorthInstallment[]> => {
  const groups = new Map<string, NetWorthInstallment[]>();
  for (const installment of installments) {
    const group = groups.get(installment.statementId) ?? [];
    group.push(installment);
    groups.set(installment.statementId, group);
  }
  return groups;
};

const cardItems = (
  statements: NetWorthStatement[],
  installments: NetWorthInstallment[],
  corte: string,
  usd: number,
): NetWorthItemDTO[] => {
  const cerrados = statements.filter((statement) => statement.closingDate <= corte);
  const latestIds = new Set(latestStatementIdsPerIssuer(cerrados.map((statement) => ({
    id: statement.id,
    issuer: statement.issuer,
    closingDate: new Date(statement.closingDate),
    uploadedAt: statement.uploadedAt,
  }))));
  const cuotasPorResumen = installmentsByStatement(installments);
  return cerrados
    .filter((statement) => latestIds.has(statement.id))
    .flatMap((statement) => {
      const cuotas = cuotasPorResumen.get(statement.id) ?? [];
      const detalle = `Último resumen: cierre ${statement.closingDate}`;
      const base = { lado: "pasivo", fuente: "tarjeta", detalle, fecha: statement.closingDate, assetId: null } as const;
      const deudaArs = remainingInstallmentDebt(cuotas, "ARS");
      const deudaUsd = remainingInstallmentDebt(cuotas, "USD");
      const enPesos = deudaArs > 0
        ? [arsItem({ ...base, id: `tarjeta:${statement.issuer}:ARS`, label: `Cuotas ${statement.cardLabel}` }, deudaArs, usd)]
        : [];
      const enDolares = deudaUsd > 0
        ? [usdItem({ ...base, id: `tarjeta:${statement.issuer}:USD`, label: `Cuotas ${statement.cardLabel} en dólares` }, deudaUsd, usd)]
        : [];
      return [...enPesos, ...enDolares];
    });
};

const valuationAt = (asset: ManualAssetDTO, corte: string): AssetValuationDTO | null =>
  asset.valuaciones.reduce<AssetValuationDTO | null>(
    (latest, valuacion) => (valuacion.fecha <= corte && (!latest || valuacion.fecha > latest.fecha) ? valuacion : latest),
    null,
  );

const manualItems = (assets: ManualAssetDTO[], corte: string, usd: number): NetWorthItemDTO[] =>
  assets.flatMap((asset) => {
    const valuacion = valuationAt(asset, corte);
    if (!valuacion) return [];
    const base: ItemBase = {
      id: asset.id, lado: "activo", fuente: "manual", label: asset.nombre,
      detalle: MANUAL_ASSET_TYPE_LABELS[asset.tipo], fecha: valuacion.fecha, assetId: asset.id,
    };
    return [asset.moneda === "USD" ? usdItem(base, valuacion.monto, usd) : arsItem(base, valuacion.monto, usd)];
  });

const byPresentation = (a: NetWorthItemDTO, b: NetWorthItemDTO): number =>
  SIDE_ORDER[a.lado] - SIDE_ORDER[b.lado] || b.ars - a.ars || a.label.localeCompare(b.label, "es");

const sideTotal = (items: NetWorthItemDTO[], lado: NetWorthItemDTO["lado"], pick: (item: NetWorthItemDTO) => number): number =>
  items.reduce((total, item) => (item.lado === lado ? total + pick(item) : total), 0);

const totalsOf = (items: NetWorthItemDTO[]): NetWorthTotals => {
  const activosArs = sideTotal(items, "activo", (item) => item.ars);
  const pasivosArs = sideTotal(items, "pasivo", (item) => item.ars);
  const activosUsd = sideTotal(items, "activo", (item) => item.usd);
  const pasivosUsd = sideTotal(items, "pasivo", (item) => item.usd);
  return {
    activosArs, pasivosArs, netoArs: activosArs - pasivosArs,
    activosUsd, pasivosUsd, netoUsd: activosUsd - pasivosUsd,
  };
};

export function valuateAt(inputs: NetWorthInputs, corte: string, usd: number, uvaSpot: SeriePoint | null): NetWorthSnapshot {
  const hipoteca = mortgageValuation(inputs.mortgageCoupons, corte, usd, uvaSpot);
  const items = [
    ...autoItems(inputs.autoCoupons, corte, usd),
    ...(hipoteca ? [hipoteca.item] : []),
    ...cardItems(inputs.statements, inputs.installments, corte, usd),
    ...manualItems(inputs.assets, corte, usd),
  ].sort(byPresentation);
  return { items, totales: totalsOf(items), uva: hipoteca?.uva ?? null };
}

export function firstDataMonth(inputs: NetWorthInputs): string | null {
  const fechas = [
    ...inputs.autoCoupons.map((coupon) => coupon.fechaEmision),
    ...inputs.mortgageCoupons.map((coupon) => coupon.fechaDebito),
    ...inputs.statements.map((statement) => statement.closingDate),
    ...inputs.assets.flatMap((asset) => asset.valuaciones.map((valuacion) => valuacion.fecha)),
  ];
  if (fechas.length === 0) return null;
  return monthOf(fechas.reduce((oldest, fecha) => (fecha < oldest ? fecha : oldest)));
}

const monthPoint = (inputs: NetWorthInputs, periodo: string, usdHoy: SeriePoint): NetWorthMonthDTO[] => {
  const corte = representativeRateDate(periodo, inputs.hoy);
  const usd = periodo === monthOf(inputs.hoy) ? usdHoy.valor : pointOnDate(corte, inputs.usdSerie)?.valor;
  if (usd === undefined) return [];
  return [{ periodo, ...valuateAt(inputs, corte, usd, pointOnDate(corte, inputs.uvaSerie)).totales }];
};

const evolutionOf = (inputs: NetWorthInputs, usdHoy: SeriePoint): NetWorthMonthDTO[] => {
  const primero = firstDataMonth(inputs);
  if (primero === null) return [];
  const desde = primero > NET_WORTH_START ? primero : NET_WORTH_START;
  return monthRange(desde, monthOf(inputs.hoy)).flatMap((periodo) => monthPoint(inputs, periodo, usdHoy));
};

export function buildNetWorth(inputs: NetWorthInputs, usdHoy: SeriePoint): NetWorthDTO {
  const foto = valuateAt(inputs, inputs.hoy, usdHoy.valor, pointOnDate(inputs.hoy, inputs.uvaSerie));
  return {
    fecha: inputs.hoy,
    usdOficial: usdHoy.valor,
    usdOficialFecha: usdHoy.fecha,
    uva: foto.uva?.valor ?? null,
    uvaFecha: foto.uva?.fecha ?? null,
    totales: foto.totales,
    items: foto.items,
    evolucion: evolutionOf(inputs, usdHoy),
    activosManuales: inputs.assets,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/stats/netWorth.test.ts`
Expected: PASS (todos los casos).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/stats/netWorth.ts server/src/stats/netWorth.test.ts
git commit -m "feat(server): cálculo puro del patrimonio neto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API de patrimonio y activos manuales

**Files:**
- Modify (reemplaza el stub): `server/src/http/routes/netWorth.ts`
- Test: `server/src/http/routes/netWorth.test.ts`

**Interfaces:**
- Consumes: `buildNetWorth`, `firstDataMonth`, `NetWorthInputs` (Task 1); `ManualAssetModel` y demás modelos; `toManualAssetDTO`; `manualAssetCreateSchema` / `manualAssetUpdateSchema`; `fetchOficialRate`; `pointOnDate`.
- Produces: `GET /api/net-worth` (200 `NetWorthDTO` | 204 | 503), `POST /api/net-worth/assets` (201), `PATCH /api/net-worth/assets/:id` (200), `DELETE /api/net-worth/assets/:id` (204), `DELETE /api/net-worth/assets/:id/valuations/:fecha` (200). Los consumen los hooks de la base (Task 6).

- [ ] **Step 1: Write the failing test**

Crear `server/src/http/routes/netWorth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { netWorthDtoSchema, type ManualAssetDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { AutoCouponModel, MacroSeriesModel, ManualAssetModel, StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

withDb();
const app = createApp();

const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";
const INVALID = "Datos del activo inválidos";
const MISSING_ID = "66f000000000000000000000";
const AHORROS = { nombre: "Ahorros", tipo: "ahorro", moneda: "USD", valuacion: { fecha: "2026-10-01", monto: 5000 } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.mocked(fetchOficialRate).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const createAsset = (body: object) => request(app).post("/api/net-worth/assets").send(body);
const patchAsset = (id: string, body: object) => request(app).patch(`/api/net-worth/assets/${id}`).send(body);
const createdAhorros = async (): Promise<ManualAssetDTO> => (await createAsset(AHORROS)).body as ManualAssetDTO;

const createAutoCoupon = (cuotaNro: number, fechaEmision: string, valorMovil: number) =>
  AutoCouponModel.create({
    grupo: "1000", orden: "1", cuotaNro, plan: "A", fechaEmision: new Date(fechaEmision),
    fechaVencimiento: new Date(fechaEmision), comprobante: `C-${cuotaNro}`, modelo: "MODELO X", valorMovil,
    conceptos: [], totalAPagar: 100_000, sourceFileName: `auto-${cuotaNro}.pdf`, sourceHash: `auto-${cuotaNro}`,
  });

const createStatementWithInstallment = async () => {
  const statement = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-09-25"), dueDate: null,
    totals: {
      totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "resumen.pdf", sourceHash: "resumen", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.create({
    statementId: statement._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-08-10"),
    descriptionRaw: "TIENDA", merchant: "TIENDA", category: "Hogar", categorySource: "rule", amount: 10_000,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 3,
    installmentTotal: 6, comprobante: "1", fingerprint: "f1",
  });
};

describe("GET /api/net-worth", () => {
  it("sin nada responde 204 sin pedir el dólar", async () => {
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(204);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });

  it("arma la foto y la evolución con lo importado y lo cargado a mano", async () => {
    await createAutoCoupon(30, "2026-09-18", 12_000_000);
    await createStatementWithInstallment();
    await createAsset(AHORROS);
    await MacroSeriesModel.insertMany([
      { serie: "usd_oficial", fecha: "2026-09-15", valor: 950 },
      { serie: "usd_oficial", fecha: "2026-10-02", valor: 1000 },
      { serie: "uva", fecha: "2026-10-03", valor: 2000 },
    ]);
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(200);
    const dto = netWorthDtoSchema.parse(res.body);
    expect(dto).toMatchObject({ fecha: "2026-10-03", usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: null, uvaFecha: null });
    expect(dto.items.map((item) => item.fuente)).toEqual(["auto", "manual", "plan_auto", "tarjeta"]);
    expect(dto.totales.netoArs).toBe(12_000_000 + 5_000_000 - 9_000_000 - 30_000);
    expect(dto.evolucion.map((mes) => mes.periodo)).toEqual(["2026-09", "2026-10"]);
    expect(dto.evolucion[1]).toMatchObject(dto.totales);
    expect(dto.activosManuales).toEqual([
      expect.objectContaining({ nombre: "Ahorros", valuaciones: [{ fecha: "2026-10-01", monto: 5000 }] }),
    ]);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });

  it("sin dólar en la serie lo pide para hoy", async () => {
    await createAsset(AHORROS);
    vi.mocked(fetchOficialRate).mockResolvedValue(1200);
    const res = await request(app).get("/api/net-worth");
    expect(fetchOficialRate).toHaveBeenCalledWith("2026-10-03");
    expect(res.body).toMatchObject({ usdOficial: 1200, usdOficialFecha: "2026-10-03" });
  });

  it("sin dólar en ningún lado responde 503 con el mensaje", async () => {
    await createAsset(AHORROS);
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(NO_USD);
  });
});

describe("POST /api/net-worth/assets", () => {
  it("crea el activo con su primera valuación y el nombre recortado", async () => {
    const res = await createAsset({ ...AHORROS, nombre: "  Ahorros  " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String), nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
      valuaciones: [{ fecha: "2026-10-01", monto: 5000 }],
    });
    expect(await ManualAssetModel.countDocuments()).toBe(1);
  });

  it.each([
    ["nombre en blanco", { ...AHORROS, nombre: "   " }, INVALID],
    ["tipo inválido", { ...AHORROS, tipo: "cripto" }, INVALID],
    ["monto negativo", { ...AHORROS, valuacion: { fecha: "2026-10-01", monto: -1 } }, INVALID],
    ["fecha inválida", { ...AHORROS, valuacion: { fecha: "2026-02-30", monto: 1 } }, INVALID],
    ["fecha futura", { ...AHORROS, valuacion: { fecha: "2026-10-04", monto: 1 } }, "La fecha de valuación no puede ser futura"],
  ])("rechaza %s con 400", async (_caso, body, mensaje) => {
    const res = await createAsset(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(mensaje);
    expect(await ManualAssetModel.countDocuments()).toBe(0);
  });
});

describe("PATCH /api/net-worth/assets/:id", () => {
  it("cambia nombre y tipo", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { nombre: "Dólares", tipo: "inversion" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, nombre: "Dólares", tipo: "inversion", moneda: "USD" });
  });

  it("agrega una valuación con fecha nueva en orden", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-09-01", monto: 4000 } });
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-09-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }]);
  });

  it("con la fecha de una existente la reemplaza", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-10-01", monto: 5500 } });
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-10-01", monto: 5500 }]);
  });

  it("con body vacío no cambia nada", async () => {
    const created = await createdAhorros();
    const res = await patchAsset(created.id, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it("no deja cambiar la moneda", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { moneda: "ARS" });
    expect(res.status).toBe(400);
    expect((await ManualAssetModel.findById(id))?.moneda).toBe("USD");
  });

  it("rechaza una fecha futura", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-10-04", monto: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("La fecha de valuación no puede ser futura");
  });

  it("con un id inexistente o mal formado responde 404", async () => {
    expect((await patchAsset(MISSING_ID, { nombre: "X" })).status).toBe(404);
    const malformed = await patchAsset("no-es-un-id", { nombre: "X" });
    expect(malformed.status).toBe(404);
    expect(malformed.body.error).toBe("Activo no encontrado");
  });
});

describe("DELETE /api/net-worth/assets/:id", () => {
  it("borra el activo y deja de aparecer", async () => {
    const { id } = await createdAhorros();
    expect((await request(app).delete(`/api/net-worth/assets/${id}`)).status).toBe(204);
    expect(await ManualAssetModel.countDocuments()).toBe(0);
    expect((await request(app).get("/api/net-worth")).status).toBe(204);
  });

  it("con un id que no existe responde 204 igual", async () => {
    expect((await request(app).delete(`/api/net-worth/assets/${MISSING_ID}`)).status).toBe(204);
    expect((await request(app).delete("/api/net-worth/assets/no-es-un-id")).status).toBe(204);
  });
});

describe("DELETE /api/net-worth/assets/:id/valuations/:fecha", () => {
  const withTwoValuations = async (): Promise<string> => {
    const { id } = await createdAhorros();
    await patchAsset(id, { valuacion: { fecha: "2026-09-01", monto: 4000 } });
    return id;
  };

  it("borra esa valuación", async () => {
    const id = await withTwoValuations();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-09-01`);
    expect(res.status).toBe(200);
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-10-01", monto: 5000 }]);
  });

  it("no deja borrar la única", async () => {
    const { id } = await createdAhorros();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-10-01`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("No se puede borrar la única valuación: borrá el activo");
  });

  it("con una fecha que no existe responde 404", async () => {
    const id = await withTwoValuations();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-08-01`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Valuación no encontrada");
  });

  it("con un activo inexistente o mal formado responde 404", async () => {
    expect((await request(app).delete(`/api/net-worth/assets/${MISSING_ID}/valuations/2026-10-01`)).status).toBe(404);
    expect((await request(app).delete("/api/net-worth/assets/x/valuations/2026-10-01")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/netWorth.test.ts`
Expected: FAIL — el stub no tiene handlers: `GET` responde 404 («No encontrado»).

- [ ] **Step 3: Write minimal implementation**

Reemplazar `server/src/http/routes/netWorth.ts` por:

```typescript
import { Router } from "express";
import { isValidObjectId } from "mongoose";
import {
  manualAssetCreateSchema, manualAssetUpdateSchema, type AssetValuationDTO, type Currency,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  AutoCouponModel, MacroSeriesModel, ManualAssetModel, MortgageCouponModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { toManualAssetDTO } from "../mappers.js";
import { buildNetWorth, firstDataMonth, type NetWorthInputs } from "../../stats/netWorth.js";
import { pointOnDate } from "../../stats/rateOnDate.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import type { SeriePoint } from "../../fx/macroSources.js";

export const netWorthRouter = Router();

const INVALID_ASSET = "Datos del activo inválidos";
const FUTURE_VALUATION = "La fecha de valuación no puede ser futura";
const ASSET_NOT_FOUND = "Activo no encontrado";
const VALUATION_NOT_FOUND = "Valuación no encontrada";
const ONLY_VALUATION = "No se puede borrar la única valuación: borrá el activo";
const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

const loadInputs = async (hoy: string): Promise<NetWorthInputs> => {
  const [autoCoupons, mortgageCoupons, statements, installments, assets, macro] = await Promise.all([
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    StatementModel.find({ closingDate: { $ne: null } }).lean(),
    TransactionModel.find({ type: "purchase", isInstallment: true }).lean(),
    ManualAssetModel.find().sort({ nombre: 1 }),
    MacroSeriesModel.find({ serie: { $in: ["usd_oficial", "uva"] } }).sort({ fecha: 1 }).lean(),
  ]);
  const serie = (name: string): SeriePoint[] =>
    macro.filter((point) => point.serie === name).map((point) => ({ fecha: point.fecha, valor: point.valor }));
  return {
    hoy,
    autoCoupons: autoCoupons.map((coupon) => ({
      grupo: coupon.grupo, orden: coupon.orden, plan: coupon.plan, modelo: coupon.modelo, cuotaNro: coupon.cuotaNro,
      fechaEmision: isoOf(coupon.fechaEmision), fechaVencimiento: isoOf(coupon.fechaVencimiento),
      valorMovil: coupon.valorMovil, totalAPagar: coupon.totalAPagar,
      totalUsd: coupon.tipoCambioUsd ? coupon.totalAPagar / coupon.tipoCambioUsd : null,
    })),
    mortgageCoupons: mortgageCoupons.map((coupon) => ({
      prestamoNro: coupon.prestamoNro, cuotaNro: coupon.cuotaNro, fechaDebito: isoOf(coupon.fechaDebito),
      capital: coupon.capital, intereses: coupon.intereses, seguroIncendio: coupon.seguroIncendio,
      totalDebitado: coupon.totalDebitado, cuotaPuraUva: coupon.cuotaPuraUva, cotizacionUva: coupon.cotizacionUva,
      tna: coupon.tna,
    })),
    statements: statements.flatMap((statement) => (statement.closingDate
      ? [{
        id: statement._id.toString(),
        issuer: statement.issuer,
        cardLabel: statement.cardLabel,
        closingDate: isoOf(statement.closingDate),
        uploadedAt: (statement as unknown as { uploadedAt: Date }).uploadedAt,
      }]
      : [])),
    installments: installments.map((tx) => ({
      statementId: tx.statementId.toString(), amount: tx.amount, currency: tx.currency as Currency,
      isInstallment: tx.isInstallment, installmentCurrent: tx.installmentCurrent ?? null,
      installmentTotal: tx.installmentTotal ?? null,
    })),
    assets: assets.map(toManualAssetDTO),
    usdSerie: serie("usd_oficial"),
    uvaSerie: serie("uva"),
  };
};

const usdOficialHoy = async (usdSerie: SeriePoint[], hoy: string): Promise<SeriePoint> => {
  const ultimo = pointOnDate(hoy, usdSerie);
  if (ultimo) return ultimo;
  const valor = await fetchOficialRate(hoy);
  if (valor === null) throw new HttpError(503, NO_USD);
  return { fecha: hoy, valor };
};

const assertNotFuture = (valuacion: AssetValuationDTO | undefined): void => {
  if (valuacion && valuacion.fecha > todayIso()) throw new HttpError(400, FUTURE_VALUATION);
};

const findAsset = async (id: string) => {
  const doc = isValidObjectId(id) ? await ManualAssetModel.findById(id) : null;
  if (!doc) throw new HttpError(404, ASSET_NOT_FOUND);
  return doc;
};

const upsertValuation = (valuaciones: AssetValuationDTO[], valuacion: AssetValuationDTO): AssetValuationDTO[] =>
  [...valuaciones.filter((current) => current.fecha !== valuacion.fecha), valuacion]
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

netWorthRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = todayIso();
  const inputs = await loadInputs(hoy);
  if (firstDataMonth(inputs) === null) {
    res.status(204).end();
    return;
  }
  res.json(buildNetWorth(inputs, await usdOficialHoy(inputs.usdSerie, hoy)));
}));

netWorthRouter.post("/assets", asyncHandler(async (req, res) => {
  const parsed = manualAssetCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_ASSET);
  const { nombre, tipo, moneda, valuacion } = parsed.data;
  assertNotFuture(valuacion);
  const doc = await ManualAssetModel.create({ nombre, tipo, moneda, valuaciones: [valuacion] });
  res.status(201).json(toManualAssetDTO(doc));
}));

netWorthRouter.patch("/assets/:id", asyncHandler(async (req, res) => {
  const parsed = manualAssetUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, INVALID_ASSET);
  const { nombre, tipo, valuacion } = parsed.data;
  assertNotFuture(valuacion);
  const doc = await findAsset(req.params.id);
  if (nombre !== undefined) doc.nombre = nombre;
  if (tipo !== undefined) doc.tipo = tipo;
  if (valuacion) doc.set("valuaciones", upsertValuation(toManualAssetDTO(doc).valuaciones, valuacion));
  await doc.save();
  res.json(toManualAssetDTO(doc));
}));

netWorthRouter.delete("/assets/:id", asyncHandler(async (req, res) => {
  if (isValidObjectId(req.params.id)) await ManualAssetModel.deleteOne({ _id: req.params.id });
  res.status(204).end();
}));

netWorthRouter.delete("/assets/:id/valuations/:fecha", asyncHandler(async (req, res) => {
  const doc = await findAsset(req.params.id);
  const { fecha } = req.params;
  const { valuaciones } = toManualAssetDTO(doc);
  if (!valuaciones.some((valuacion) => valuacion.fecha === fecha)) throw new HttpError(404, VALUATION_NOT_FOUND);
  if (valuaciones.length === 1) throw new HttpError(409, ONLY_VALUATION);
  doc.set("valuaciones", valuaciones.filter((valuacion) => valuacion.fecha !== fecha));
  await doc.save();
  res.json(toManualAssetDTO(doc));
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/netWorth.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/http/routes/netWorth.ts server/src/http/routes/netWorth.test.ts
git commit -m "feat(server): API de patrimonio y activos manuales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lógica pura del cliente

**Files:**
- Create: `client/src/netWorth.ts`
- Test: `client/src/netWorth.test.ts`

**Interfaces:**
- Consumes: `parseMoneyInput`, `formatMoneyInput` (`client/src/moneyInput.ts`, de la base); tipos de `@ledgerly/shared`.
- Produces: `ASSET_TYPES`, `ASSET_TYPE_LABELS`, `ASSET_NAME_MAX_LENGTH`, `AssetDraft`, `AssetRequest`, `NetWorthSerieId`, `NetWorthChartSerie`, `isAssetType`, `isCurrency`, `itemsBySide`, `latestValuation`, `valuationsNewestFirst`, `assetDraftFrom`, `assetRequest`, `netWorthChartSeries`, `missingPropertyHint`. Los usan el editor (Task 4), el gráfico (Task 5) y la página (Task 6).

- [ ] **Step 1: Write the failing test**

Crear `client/src/netWorth.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/netWorth.test.ts`
Expected: FAIL — `Failed to resolve import "./netWorth.js"`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/netWorth.ts`:

```typescript
import type {
  AssetValuationDTO, Currency, ManualAssetCreateDTO, ManualAssetDTO, ManualAssetType, ManualAssetUpdateDTO,
  NetWorthDTO, NetWorthItemDTO, NetWorthMonthDTO, NetWorthTotals,
} from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "./moneyInput.js";

export interface AssetDraft {
  nombre: string;
  tipo: ManualAssetType;
  moneda: Currency;
  monto: string;
  fecha: string;
}

export type AssetRequest =
  | { kind: "create"; body: ManualAssetCreateDTO }
  | { kind: "update"; id: string; body: ManualAssetUpdateDTO };

export type NetWorthSerieId = "Activos" | "Pasivos" | "Patrimonio neto";

export interface NetWorthChartPoint {
  x: string;
  y: number;
}

export interface NetWorthChartSerie {
  id: NetWorthSerieId;
  data: NetWorthChartPoint[];
}

export interface ItemsBySide {
  activos: NetWorthItemDTO[];
  pasivos: NetWorthItemDTO[];
}

interface ChartSerieKeys {
  id: NetWorthSerieId;
  keys: Record<Currency, keyof NetWorthTotals>;
}

export const ASSET_TYPE_LABELS: Record<ManualAssetType, string> = {
  cuenta: "Cuenta",
  ahorro: "Ahorros",
  plazo_fijo: "Plazo fijo",
  inversion: "Inversiones",
  inmueble: "Inmueble",
  otro: "Otro",
};

export const ASSET_TYPES: ManualAssetType[] = ["cuenta", "ahorro", "plazo_fijo", "inversion", "inmueble", "otro"];

export const ASSET_NAME_MAX_LENGTH = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CHART_SERIES: ChartSerieKeys[] = [
  { id: "Activos", keys: { ARS: "activosArs", USD: "activosUsd" } },
  { id: "Pasivos", keys: { ARS: "pasivosArs", USD: "pasivosUsd" } },
  { id: "Patrimonio neto", keys: { ARS: "netoArs", USD: "netoUsd" } },
];

export function isAssetType(value: string): value is ManualAssetType {
  return Object.hasOwn(ASSET_TYPE_LABELS, value);
}

export function isCurrency(value: unknown): value is Currency {
  return value === "ARS" || value === "USD";
}

export function itemsBySide(items: NetWorthItemDTO[]): ItemsBySide {
  return {
    activos: items.filter((item) => item.lado === "activo"),
    pasivos: items.filter((item) => item.lado === "pasivo"),
  };
}

export function latestValuation(asset: ManualAssetDTO): AssetValuationDTO | null {
  return asset.valuaciones.reduce<AssetValuationDTO | null>(
    (latest, valuacion) => (!latest || valuacion.fecha > latest.fecha ? valuacion : latest),
    null,
  );
}

export function valuationsNewestFirst(asset: ManualAssetDTO): AssetValuationDTO[] {
  return [...asset.valuaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function assetDraftFrom(asset: ManualAssetDTO | null, today: string): AssetDraft {
  if (!asset) return { nombre: "", tipo: "cuenta", moneda: "ARS", monto: "", fecha: today };
  const ultima = latestValuation(asset);
  return {
    nombre: asset.nombre,
    tipo: asset.tipo,
    moneda: asset.moneda,
    monto: ultima ? formatMoneyInput(ultima.monto) : "",
    fecha: today,
  };
}

const isValidName = (nombre: string): boolean => nombre !== "" && nombre.length <= ASSET_NAME_MAX_LENGTH;

const isValidDate = (fecha: string, today: string): boolean => ISO_DATE.test(fecha) && fecha <= today;

const updateBody = (
  draft: AssetDraft,
  asset: ManualAssetDTO,
  nombre: string,
  valuacion: AssetValuationDTO,
  today: string,
): ManualAssetUpdateDTO => {
  const ultima = latestValuation(asset);
  const valuacionCambio = ultima?.monto !== valuacion.monto || valuacion.fecha !== today;
  return {
    ...(nombre !== asset.nombre ? { nombre } : {}),
    ...(draft.tipo !== asset.tipo ? { tipo: draft.tipo } : {}),
    ...(valuacionCambio ? { valuacion } : {}),
  };
};

export function assetRequest(draft: AssetDraft, asset: ManualAssetDTO | null, today: string): AssetRequest | null {
  const nombre = draft.nombre.trim();
  const monto = parseMoneyInput(draft.monto);
  if (!isValidName(nombre) || monto === null || !isValidDate(draft.fecha, today)) return null;
  const valuacion = { fecha: draft.fecha, monto };
  if (!asset) return { kind: "create", body: { nombre, tipo: draft.tipo, moneda: draft.moneda, valuacion } };
  const body = updateBody(draft, asset, nombre, valuacion, today);
  return Object.keys(body).length > 0 ? { kind: "update", id: asset.id, body } : null;
}

export function netWorthChartSeries(months: NetWorthMonthDTO[], currency: Currency): NetWorthChartSerie[] {
  return CHART_SERIES.map(({ id, keys }) => ({
    id,
    data: months.map((month) => ({ x: month.periodo, y: month[keys[currency]] })),
  }));
}

export function missingPropertyHint(data: NetWorthDTO): boolean {
  const hasMortgage = data.items.some((item) => item.fuente === "hipoteca");
  const hasProperty = data.activosManuales.some((asset) => asset.tipo === "inmueble");
  return hasMortgage && !hasProperty;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/netWorth.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/netWorth.ts client/src/netWorth.test.ts
git commit -m "feat(client): lógica pura de patrimonio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Editor de activos manuales

**Files:**
- Create: `client/src/components/useManualAssetForm.ts`
- Create: `client/src/components/ManualAssetEditor.tsx`
- Test: `client/src/components/ManualAssetEditor.test.tsx`

**Interfaces:**
- Consumes: `ResponsiveSheet` (base), `tapTargetSx` / `iconTapTargetSx`, `formatMoney`, y de Task 3 `ASSET_TYPES`, `ASSET_TYPE_LABELS`, `ASSET_NAME_MAX_LENGTH`, `assetDraftFrom`, `assetRequest`, `isAssetType`, `isCurrency`, `valuationsNewestFirst`, `AssetDraft`, `AssetRequest`.
- Produces: `useManualAssetForm(asset, today): ManualAssetFormState` y `ManualAssetEditor` con props `{ open, asset, today, error, saving, onClose, onSave(request: AssetRequest), onDelete(), onDeleteValuation(fecha: string) }`. Los usa la página (Task 6).

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/ManualAssetEditor.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManualAssetDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { ManualAssetEditor } from "./ManualAssetEditor.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TODAY = "2026-10-03";

const ahorros: ManualAssetDTO = {
  id: "a-ahorros", nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
  valuaciones: [{ fecha: "2026-08-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }],
};

interface SetupOptions {
  asset?: ManualAssetDTO | null;
  error?: string | null;
}

const setup = ({ asset = null, error = null }: SetupOptions = {}) => {
  const handlers = { onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onDeleteValuation: vi.fn() };
  renderWithProviders(
    <ManualAssetEditor open asset={asset} today={TODAY} error={error} saving={false} {...handlers} />,
  );
  const sheet = screen.getByRole("dialog", { name: asset ? "Editar activo" : "Nuevo activo" });
  return { ...handlers, sheet };
};

describe("ManualAssetEditor para un activo nuevo", () => {
  it("Guardar se habilita con nombre y valor válidos y manda el alta", async () => {
    const { sheet, onSave } = setup();
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Caja de ahorro");
    expect(save).toBeDisabled();
    const value = within(sheet).getByRole("textbox", { name: "Valor en pesos" });
    await userEvent.type(value, "abc");
    expect(save).toBeDisabled();
    await userEvent.clear(value);
    await userEvent.type(value, "1.500,50");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({
      kind: "create",
      body: { nombre: "Caja de ahorro", tipo: "cuenta", moneda: "ARS", valuacion: { fecha: TODAY, monto: 1500.5 } },
    });
  });

  it("elegir Dólares cambia la moneda y la etiqueta del valor", async () => {
    const { sheet } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Dólares" }));
    expect(within(sheet).getByRole("button", { name: "Dólares" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("textbox", { name: "Valor en dólares" })).toBeInTheDocument();
  });

  it("la fecha arranca en hoy y no deja elegir días futuros", () => {
    const { sheet } = setup();
    const fecha = within(sheet).getByLabelText("Fecha de valuación");
    expect(fecha).toHaveValue(TODAY);
    expect(fecha).toHaveAttribute("max", TODAY);
  });

  it("vaciar la fecha deshabilita Guardar", async () => {
    const { sheet } = setup();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Caja");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Valor en pesos" }), "100");
    await userEvent.clear(within(sheet).getByLabelText("Fecha de valuación"));
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("no ofrece Borrar ni historial", () => {
    const { sheet } = setup();
    expect(within(sheet).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("list", { name: "valuaciones" })).not.toBeInTheDocument();
  });
});

describe("ManualAssetEditor para editar", () => {
  it("trae el valor de la última valuación y no deja cambiar la moneda", () => {
    const { sheet } = setup({ asset: ahorros });
    expect(within(sheet).getByRole("textbox", { name: "Nombre" })).toHaveValue("Ahorros");
    expect(within(sheet).getByRole("textbox", { name: "Valor en dólares" })).toHaveValue("5.000");
    expect(within(sheet).getByRole("button", { name: "Pesos" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Dólares" })).toBeDisabled();
    expect(within(sheet).getByText("La moneda no se puede cambiar")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("lista las valuaciones de la más nueva a la más vieja y borra una", async () => {
    const { sheet, onDeleteValuation } = setup({ asset: ahorros });
    const history = within(sheet).getByRole("list", { name: "valuaciones" });
    const rows = within(history).getAllByRole("listitem").map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("2026-10-01");
    expect(rows[1]).toContain("2026-08-01");
    await userEvent.click(within(sheet).getByRole("button", { name: "borrar valuación del 2026-08-01" }));
    expect(onDeleteValuation).toHaveBeenCalledWith("2026-08-01");
  });

  it("con una sola valuación no muestra el historial", () => {
    const { sheet } = setup({ asset: { ...ahorros, valuaciones: [{ fecha: "2026-10-01", monto: 5000 }] } });
    expect(within(sheet).queryByRole("list", { name: "valuaciones" })).not.toBeInTheDocument();
  });

  it("Borrar pide borrar el activo", async () => {
    const { sheet, onDelete, onSave } = setup({ asset: ahorros });
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("muestra el error del server", () => {
    const { sheet } = setup({ asset: ahorros, error: "Activo no encontrado" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Activo no encontrado");
  });
});

describe("ManualAssetEditor en mobile", () => {
  it("es una hoja desde abajo con teclado decimal para el valor", () => {
    emulateMobile();
    const { sheet } = setup();
    expect(sheet.closest(".MuiDrawer-root")).not.toBeNull();
    expect(within(sheet).getByRole("textbox", { name: "Valor en pesos" })).toHaveAttribute("inputmode", "decimal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/ManualAssetEditor.test.tsx`
Expected: FAIL — `Failed to resolve import "./ManualAssetEditor.js"`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/components/useManualAssetForm.ts`:

```typescript
import { useMemo, useState } from "react";
import type { Currency, ManualAssetDTO, ManualAssetType } from "@ledgerly/shared";
import { assetDraftFrom, assetRequest, type AssetDraft, type AssetRequest } from "../netWorth.js";

export interface ManualAssetFormState {
  draft: AssetDraft;
  setNombre: (nombre: string) => void;
  setTipo: (tipo: ManualAssetType) => void;
  setMoneda: (moneda: Currency) => void;
  setMonto: (monto: string) => void;
  setFecha: (fecha: string) => void;
  request: AssetRequest | null;
}

export const useManualAssetForm = (asset: ManualAssetDTO | null, today: string): ManualAssetFormState => {
  const [draft, setDraft] = useState<AssetDraft>(() => assetDraftFrom(asset, today));
  const request = useMemo(() => assetRequest(draft, asset, today), [draft, asset, today]);

  const setField = <Field extends keyof AssetDraft>(field: Field) => (value: AssetDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return {
    draft,
    setNombre: setField("nombre"),
    setTipo: setField("tipo"),
    setMoneda: setField("moneda"),
    setMonto: setField("monto"),
    setFecha: setField("fecha"),
    request,
  };
};
```

Crear `client/src/components/ManualAssetEditor.tsx`:

```tsx
import type { ChangeEvent, MouseEvent } from "react";
import {
  Alert, Box, Button, IconButton, List, ListItem, ListItemText, MenuItem, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Currency, ManualAssetDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import {
  ASSET_NAME_MAX_LENGTH, ASSET_TYPE_LABELS, ASSET_TYPES, isAssetType, isCurrency, valuationsNewestFirst,
  type AssetRequest,
} from "../netWorth.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { iconTapTargetSx, tapTargetSx } from "./tapTarget.js";
import { useManualAssetForm } from "./useManualAssetForm.js";

interface ManualAssetEditorProps {
  open: boolean;
  asset: ManualAssetDTO | null;
  today: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (request: AssetRequest) => void;
  onDelete: () => void;
  onDeleteValuation: (fecha: string) => void;
}

type ManualAssetFormProps = Omit<ManualAssetEditorProps, "open" | "onClose">;

interface ValuationHistoryProps {
  asset: ManualAssetDTO;
  onDeleteValuation: (fecha: string) => void;
}

const VALUE_LABELS: Record<Currency, string> = { ARS: "Valor en pesos", USD: "Valor en dólares" };

const DATE_HELPER = "Si cambiás el valor se guarda una valuación con esta fecha; con la fecha de una existente, la corrige.";

const typeOptions = ASSET_TYPES.map((tipo) => <MenuItem key={tipo} value={tipo}>{ASSET_TYPE_LABELS[tipo]}</MenuItem>);

const ValuationHistory = ({ asset, onDeleteValuation }: ValuationHistoryProps) => {
  const rows = valuationsNewestFirst(asset).map(({ fecha, monto }) => (
    <ListItem
      key={fecha}
      disableGutters
      secondaryAction={(
        <IconButton
          edge="end"
          aria-label={`borrar valuación del ${fecha}`}
          onClick={() => onDeleteValuation(fecha)}
          sx={iconTapTargetSx}
        >
          <DeleteOutlineIcon />
        </IconButton>
      )}
    >
      <ListItemText primary={`${fecha} · ${formatMoney(monto, asset.moneda)}`} />
    </ListItem>
  ));

  return (
    <Box>
      <Typography variant="subtitle2">Valuaciones</Typography>
      <List dense disablePadding aria-label="valuaciones">{rows}</List>
    </Box>
  );
};

const ManualAssetForm = ({ asset, today, error, saving, onSave, onDelete, onDeleteValuation }: ManualAssetFormProps) => {
  const { draft, setNombre, setTipo, setMoneda, setMonto, setFecha, request } = useManualAssetForm(asset, today);
  const editing = asset !== null;

  const changeNombre = (event: ChangeEvent<HTMLInputElement>) => setNombre(event.target.value);
  const changeTipo = (event: ChangeEvent<HTMLInputElement>) => {
    if (isAssetType(event.target.value)) setTipo(event.target.value);
  };
  const changeMoneda = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isCurrency(value)) setMoneda(value);
  };
  const changeMonto = (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value);
  const changeFecha = (event: ChangeEvent<HTMLInputElement>) => setFecha(event.target.value);
  const save = () => {
    if (request) onSave(request);
  };

  const currencyHint = editing && (
    <Typography variant="caption" color="text.secondary">La moneda no se puede cambiar</Typography>
  );
  const errorAlert = error && <Alert severity="error">{error}</Alert>;
  const deleteButton = editing && (
    <Button fullWidth color="error" onClick={onDelete} sx={tapTargetSx}>Borrar</Button>
  );
  const history = asset && asset.valuaciones.length > 1 && (
    <ValuationHistory asset={asset} onDeleteValuation={onDeleteValuation} />
  );

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <TextField
        label="Nombre"
        value={draft.nombre}
        onChange={changeNombre}
        fullWidth
        slotProps={{ htmlInput: { maxLength: ASSET_NAME_MAX_LENGTH } }}
      />
      <TextField select label="Tipo" value={draft.tipo} onChange={changeTipo} fullWidth>
        {typeOptions}
      </TextField>
      <Box>
        <ToggleButtonGroup
          exclusive
          fullWidth
          aria-label="moneda"
          value={draft.moneda}
          onChange={changeMoneda}
          disabled={editing}
        >
          <ToggleButton value="ARS" sx={tapTargetSx}>Pesos</ToggleButton>
          <ToggleButton value="USD" sx={tapTargetSx}>Dólares</ToggleButton>
        </ToggleButtonGroup>
        {currencyHint}
      </Box>
      <TextField
        label={VALUE_LABELS[draft.moneda]}
        value={draft.monto}
        onChange={changeMonto}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
      <TextField
        type="date"
        label="Fecha de valuación"
        value={draft.fecha}
        onChange={changeFecha}
        fullWidth
        helperText={DATE_HELPER}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
      />
      {errorAlert}
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!request || saving} onClick={save} sx={tapTargetSx}>
          Guardar
        </Button>
      </Box>
      {history}
    </Box>
  );
};

export const ManualAssetEditor = ({
  open, asset, today, error, saving, onClose, onSave, onDelete, onDeleteValuation,
}: ManualAssetEditorProps) => {
  const title = asset ? "Editar activo" : "Nuevo activo";

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={title}>
      <ManualAssetForm
        key={asset?.id ?? "nuevo"}
        asset={asset}
        today={today}
        error={error}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
        onDeleteValuation={onDeleteValuation}
      />
    </ResponsiveSheet>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/ManualAssetEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/useManualAssetForm.ts client/src/components/ManualAssetEditor.tsx client/src/components/ManualAssetEditor.test.tsx
git commit -m "feat(client): editor de activos manuales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Gráfico de evolución del patrimonio

**Files:**
- Create: `client/src/components/charts/NetWorthChart.tsx`
- Create: `client/src/components/NetWorthEvolutionCard.tsx`
- Test: `client/src/components/NetWorthEvolutionCard.test.tsx`

**Interfaces:**
- Consumes: `netWorthChartSeries`, `isCurrency`, `NetWorthSerieId` (Task 3); `ChartCard`, `ChartLegend`, `LineSliceTooltip`, `useChartLayout`, `seriesColor`, `nivoTheme`, `formatMoney`, `formatMoneyCompact`, `useIsMobile`, `tapTargetSx`.
- Produces: `NetWorthChart({ months, currency })` y `NetWorthEvolutionCard({ months })`. La página (Task 6) usa la tarjeta y su test reemplaza `NetWorthChart` por una lista de meses.

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/NetWorthEvolutionCard.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NetWorthMonthDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { probeOf } from "../testing/nivoProbe.js";
import { seriesColor } from "./charts/palette.js";
import { NetWorthEvolutionCard } from "./NetWorthEvolutionCard.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const month = (index: number): NetWorthMonthDTO => ({
  periodo: periodo(index),
  activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000 + index,
  activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432 + index,
});

const months = (count: number): NetWorthMonthDTO[] => Array.from({ length: count }, (_unused, index) => month(index));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const shown = (text: string): string => text.replace(/\s/g, " ");

describe("NetWorthEvolutionCard", () => {
  it("arranca en dólares y cambia a pesos", async () => {
    renderWithProviders(<NetWorthEvolutionCard months={months(3)} />);
    expect(screen.getByText("Evolución del patrimonio")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "moneda del gráfico" })).toBeInTheDocument();
    const usd = screen.getByRole("button", { name: "USD" });
    const pesos = screen.getByRole("button", { name: "Pesos" });
    expect(usd).toHaveAttribute("aria-pressed", "true");
    const legend = screen.getByRole("list", { name: "referencias" });
    expect(within(legend).getByText(shown(formatMoney(7_434, "USD")))).toBeInTheDocument();
    await userEvent.click(pesos);
    expect(pesos).toHaveAttribute("aria-pressed", "true");
    expect(within(legend).getByText(shown(formatMoney(7_432_002, "ARS")))).toBeInTheDocument();
  });

  it("pinta activos, pasivos y neto con su color de la paleta y tooltip por mes", () => {
    renderWithProviders(<NetWorthEvolutionCard months={months(3)} />);
    expect(chart().colors).toEqual([2, 5, 1].map((slot) => seriesColor("dark", slot)));
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
    const legend = screen.getByRole("list", { name: "referencias" });
    expect(within(legend).getByText("Activos")).toBeInTheDocument();
    expect(within(legend).getByText("Pasivos")).toBeInTheDocument();
    expect(within(legend).getByText("Patrimonio neto")).toBeInTheDocument();
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<NetWorthEvolutionCard months={months(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 56, left: 56 });
  });

  it("sin meses muestra Sin datos", () => {
    renderWithProviders(<NetWorthEvolutionCard months={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/NetWorthEvolutionCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./NetWorthEvolutionCard.js"`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/components/charts/NetWorthChart.tsx`:

```tsx
import { useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";
import { Box, Typography, useTheme } from "@mui/material";
import type { Currency, NetWorthMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { netWorthChartSeries, type NetWorthSerieId } from "../../netWorth.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { LineSliceTooltip } from "./ChartTooltip.js";
import { nivoTheme } from "./nivoTheme.js";
import { seriesColor } from "./palette.js";
import { useChartLayout } from "./useChartLayout.js";

interface NetWorthChartProps {
  months: NetWorthMonthDTO[];
  currency: Currency;
}

const SERIES_SLOTS: Record<NetWorthSerieId, number> = { Activos: 2, Pasivos: 5, "Patrimonio neto": 1 };

export const NetWorthChart = ({ months, currency }: NetWorthChartProps) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();
  const series = useMemo(() => netWorthChartSeries(months, currency), [months, currency]);

  if (months.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const colors = series.map((serie) => seriesColor(theme.palette.mode, SERIES_SLOTS[serie.id]));
  const legendItems: ChartLegendItem[] = series.map((serie, position) => ({
    id: serie.id,
    label: serie.id,
    color: colors[position],
    value: formatMoney(serie.data[serie.data.length - 1].y, currency),
  }));
  const periodos = months.map((month) => month.periodo);
  const hasNegative = series.some((serie) => serie.data.some((point) => point.y < 0));
  const zeroLine = hasNegative
    ? [{
      axis: "y" as const,
      value: 0,
      lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
    }]
    : [];

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveLine
          data={series}
          theme={nivoTheme(theme)}
          colors={colors}
          margin={seriesMargin({ top: 16, right: 24, bottom: 56, left: 72 })}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          curve="monotoneX"
          lineWidth={2}
          pointSize={8}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          markers={zeroLine}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(periodos) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), currency) }}
          yFormat={(value) => formatMoney(Number(value), currency)}
          enableSlices="x"
          sliceTooltip={LineSliceTooltip}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
```

Crear `client/src/components/NetWorthEvolutionCard.tsx`:

```tsx
import { useState, type MouseEvent } from "react";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { Currency, NetWorthMonthDTO } from "@ledgerly/shared";
import { isCurrency } from "../netWorth.js";
import { useIsMobile } from "../useIsMobile.js";
import { ChartCard } from "./charts/ChartCard.js";
import { NetWorthChart } from "./charts/NetWorthChart.js";
import { tapTargetSx } from "./tapTarget.js";

interface NetWorthEvolutionCardProps {
  months: NetWorthMonthDTO[];
}

const HISTORY_HINT =
  "Los activos cargados a mano cuentan desde su primera valuación: si querés historia, cargalos con fecha pasada.";

export const NetWorthEvolutionCard = ({ months }: NetWorthEvolutionCardProps) => {
  const [currency, setCurrency] = useState<Currency>("USD");
  const isMobile = useIsMobile();
  const toggleSx = isMobile ? tapTargetSx : undefined;

  const changeCurrency = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isCurrency(value)) setCurrency(value);
  };

  return (
    <ChartCard title="Evolución del patrimonio">
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          aria-label="moneda del gráfico"
          value={currency}
          onChange={changeCurrency}
        >
          <ToggleButton value="USD" sx={toggleSx}>USD</ToggleButton>
          <ToggleButton value="ARS" sx={toggleSx}>Pesos</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <NetWorthChart months={months} currency={currency} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {HISTORY_HINT}
      </Typography>
    </ChartCard>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/NetWorthEvolutionCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/charts/NetWorthChart.tsx client/src/components/NetWorthEvolutionCard.tsx client/src/components/NetWorthEvolutionCard.test.tsx
git commit -m "feat(client): gráfico de evolución del patrimonio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Página Patrimonio

**Files:**
- Create: `client/src/components/NetWorthKpiCards.tsx`
- Create: `client/src/components/NetWorthItemsCard.tsx`
- Create: `client/src/components/useManualAssetEditor.ts`
- Modify (reemplaza el stub): `client/src/pages/NetWorthPage.tsx`
- Test: `client/src/pages/NetWorthPage.test.tsx`

**Interfaces:**
- Consumes: hooks de la base (`useNetWorth`, `useCreateManualAsset`, `useUpdateManualAsset`, `useDeleteManualAsset`, `useDeleteAssetValuation`); `ManualAssetEditor` (Task 4); `NetWorthEvolutionCard` (Task 5); `itemsBySide`, `missingPropertyHint`, `AssetRequest` (Task 3); `Kpi`, `KpiGrid`, `FiltersBar`, `ConfirmDialog`, `matchesYears`, `yearsOf`, `useGlobalFilters`, `todayIso`.
- Produces: `NetWorthPage` (export que ya usa `App.tsx`), `useManualAssetEditor(assets): ManualAssetEditorState`, `NetWorthKpiCards({ data })`, `NetWorthItemsCard({ title, items, totalArs, totalUsd, emptyText, onEdit })`.

- [ ] **Step 1: Write the failing test**

Crear `client/src/pages/NetWorthPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManualAssetDTO, NetWorthDTO, NetWorthItemDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { NetWorthPage } from "./NetWorthPage.js";

interface ChartProbeProps {
  months: { periodo: string }[];
}

vi.mock("../components/charts/NetWorthChart.js", async () => {
  const { createElement } = await import("react");
  return {
    NetWorthChart: ({ months }: ChartProbeProps) =>
      createElement(
        "ul",
        { "aria-label": "meses del gráfico" },
        months.map((mes) => createElement("li", { key: mes.periodo }, mes.periodo)),
      ),
  };
});

interface StubReply {
  status: number;
  body?: unknown;
}

type ItemFields = Partial<NetWorthItemDTO> & Pick<NetWorthItemDTO, "id" | "lado" | "fuente" | "label" | "ars">;

const TODAY = "2026-10-03";
const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";

const ahorros: ManualAssetDTO = {
  id: "a-ahorros", nombre: "Ahorros", tipo: "ahorro", moneda: "USD", valuaciones: [{ fecha: "2026-10-01", monto: 5000 }],
};
const cuenta: ManualAssetDTO = {
  id: "a-cuenta", nombre: "Cuenta", tipo: "cuenta", moneda: "ARS", valuaciones: [{ fecha: "2026-10-01", monto: 500_000 }],
};

const item = (fields: ItemFields): NetWorthItemDTO => ({
  detalle: "", fecha: "2026-10-01", moneda: "ARS", montoOriginal: fields.ars, usd: fields.ars / 1000, assetId: null,
  ...fields,
});

const TOTALES = {
  activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000,
  activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432,
};

const NET_WORTH: NetWorthDTO = {
  fecha: TODAY, usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: 2000, uvaFecha: "2026-10-03",
  totales: TOTALES,
  items: [
    item({ id: "auto", lado: "activo", fuente: "auto", label: "Auto", detalle: "MODELO X · valor móvil de la cuota 30", fecha: "2026-09-18", ars: 12_000_000 }),
    item({ id: "a-ahorros", lado: "activo", fuente: "manual", label: "Ahorros", detalle: "Ahorros", moneda: "USD", montoOriginal: 5000, ars: 5_000_000, usd: 5000, assetId: "a-ahorros" }),
    item({ id: "a-cuenta", lado: "activo", fuente: "manual", label: "Cuenta", detalle: "Cuenta", ars: 500_000, assetId: "a-cuenta" }),
    item({ id: "plan-auto", lado: "pasivo", fuente: "plan_auto", label: "Plan de ahorro del auto", detalle: "90 de 120 cuotas por pagar", fecha: "2026-09-18", ars: 9_000_000 }),
    item({ id: "hipoteca", lado: "pasivo", fuente: "hipoteca", label: "Hipoteca UVA", detalle: "499 UVA pendientes", fecha: "2026-10-03", ars: 998_000 }),
    item({ id: "tarjeta:icbc:ARS", lado: "pasivo", fuente: "tarjeta", label: "Cuotas ICBC", detalle: "Último resumen: cierre 2026-09-25", fecha: "2026-09-25", ars: 30_000 }),
  ],
  evolucion: [{ periodo: "2025-12", ...TOTALES }, { periodo: "2026-10", ...TOTALES }],
  activosManuales: [ahorros, cuenta],
};

const MUTATION_REPLIES: Record<string, StubReply> = {
  POST: { status: 201, body: ahorros },
  PATCH: { status: 200, body: ahorros },
  DELETE: { status: 204 },
};

let netWorthReply: StubReply;

const respond = ({ status, body }: StubReply): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  netWorthReply = { status: 200, body: NET_WORTH };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return respond(url === "/api/net-worth" ? netWorthReply : { status: 404, body: { error: "No encontrado" } });
    return respond(MUTATION_REPLIES[method] ?? { status: 405, body: { error: "Método no permitido" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const requests = (method: string) => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === method)
  .map(([url, init]) => ({ url: String(url), body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined }));

const renderPage = (route = "/patrimonio?year=all") => renderWithProviders(<NetWorthPage />, { route });

describe("NetWorthPage", () => {
  it("muestra los KPIs y los ítems de cada lado", async () => {
    renderPage();
    const activos = await screen.findByRole("region", { name: "Activos" });
    const pasivos = screen.getByRole("region", { name: "Pasivos" });
    expect(screen.getByText("Patrimonio neto")).toBeInTheDocument();
    expect(screen.getByText(/Valuado con dólar oficial/)).toHaveTextContent("al 2026-10-02");
    expect(within(activos).getByText("Auto")).toBeInTheDocument();
    expect(within(activos).getByRole("button", { name: "editar Ahorros" })).toBeInTheDocument();
    expect(within(activos).queryByRole("button", { name: "editar Auto" })).not.toBeInTheDocument();
    expect(within(pasivos).getByText("Hipoteca UVA")).toBeInTheDocument();
    expect(within(pasivos).getByText("Cuotas ICBC")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "meses del gráfico" })).toHaveTextContent("2025-12");
  });

  it("con 204 muestra el estado vacío y deja agregar un activo", async () => {
    netWorthReply = { status: 204 };
    renderPage();
    expect(await screen.findByText(/Todavía no hay nada para valuar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo activo" })).toBeInTheDocument();
  });

  it("con 503 muestra el mensaje del server debajo del título", async () => {
    netWorthReply = { status: 503, body: { error: NO_USD } };
    renderPage();
    expect(await screen.findByText(NO_USD)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Patrimonio" })).toBeInTheDocument();
  });

  it("Agregar activo manda el alta con el valor tipeado en formato argentino", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo activo" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Dólares del colchón");
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Tipo" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ahorros" }));
    const form = screen.getByRole("dialog", { name: "Nuevo activo" });
    await userEvent.click(within(form).getByRole("button", { name: "Dólares" }));
    await userEvent.type(within(form).getByRole("textbox", { name: "Valor en dólares" }), "10.000");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("POST")).toEqual([{
      url: "/api/net-worth/assets",
      body: { nombre: "Dólares del colchón", tipo: "ahorro", moneda: "USD", valuacion: { fecha: TODAY, monto: 10000 } },
    }]));
  });

  it("editar un activo y cambiar el valor manda solo la valuación nueva", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar Ahorros" }));
    const sheet = screen.getByRole("dialog", { name: "Editar activo" });
    const value = within(sheet).getByRole("textbox", { name: "Valor en dólares" });
    expect(value).toHaveValue("5.000");
    await userEvent.clear(value);
    await userEvent.type(value, "6.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{
      url: "/api/net-worth/assets/a-ahorros",
      body: { valuacion: { fecha: TODAY, monto: 6000 } },
    }]));
  });

  it("Borrar pide confirmación y borra el activo", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar Ahorros" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar activo" })).getByRole("button", { name: "Borrar" }));
    const confirm = await screen.findByRole("dialog", { name: "Borrar activo" });
    expect(confirm).toHaveTextContent("¿Borrar «Ahorros» y todas sus valuaciones?");
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(requests("DELETE")).toEqual([{ url: "/api/net-worth/assets/a-ahorros", body: undefined }]));
  });

  it("avisa si hay hipoteca y ningún inmueble", async () => {
    renderPage();
    expect(await screen.findByText(/Tenés una hipoteca pero ningún inmueble/)).toBeInTheDocument();
  });

  it("por defecto el gráfico muestra solo el año actual y los KPIs no cambian", async () => {
    renderPage("/patrimonio");
    const chartMonths = await screen.findByRole("list", { name: "meses del gráfico" });
    expect(within(chartMonths).getByText("2026-10")).toBeInTheDocument();
    expect(within(chartMonths).queryByText("2025-12")).not.toBeInTheDocument();
    expect(screen.getByText("Patrimonio neto")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Activos" })).getByText("Auto")).toBeInTheDocument();
  });
});

describe("NetWorthPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("Agregar activo abre la hoja desde abajo", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo activo" }).closest(".MuiDrawer-root")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/NetWorthPage.test.tsx`
Expected: FAIL — el stub solo muestra el título: no hay región «Activos» ni botón «Agregar activo».

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/components/useManualAssetEditor.ts`:

```typescript
import { useCallback, useMemo, useState } from "react";
import type { ManualAssetDTO } from "@ledgerly/shared";
import {
  useCreateManualAsset, useDeleteAssetValuation, useDeleteManualAsset, useUpdateManualAsset,
} from "../api/hooks.js";
import type { AssetRequest } from "../netWorth.js";

export interface ManualAssetEditorState {
  open: boolean;
  asset: ManualAssetDTO | null;
  error: string | null;
  saving: boolean;
  pendingDelete: ManualAssetDTO | null;
  openNew: () => void;
  openEdit: (assetId: string) => void;
  close: () => void;
  save: (request: AssetRequest) => void;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  deleteValuation: (fecha: string) => void;
}

const findAsset = (assets: ManualAssetDTO[], id: string | null): ManualAssetDTO | null =>
  (id === null ? null : assets.find((asset) => asset.id === id) ?? null);

export const useManualAssetEditor = (assets: ManualAssetDTO[]): ManualAssetEditorState => {
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { mutate: createAsset, reset: resetCreate, isPending: creating, error: createError } = useCreateManualAsset();
  const { mutate: updateAsset, reset: resetUpdate, isPending: updating, error: updateError } = useUpdateManualAsset();
  const { mutate: deleteAsset } = useDeleteManualAsset();
  const { mutate: removeValuation, reset: resetValuation, error: valuationError } = useDeleteAssetValuation();

  const asset = useMemo(() => findAsset(assets, assetId), [assets, assetId]);
  const pendingDelete = useMemo(() => findAsset(assets, pendingDeleteId), [assets, pendingDeleteId]);
  const error = (createError ?? updateError ?? valuationError)?.message ?? null;

  const openWith = useCallback((id: string | null) => {
    resetCreate();
    resetUpdate();
    resetValuation();
    setAssetId(id);
    setOpen(true);
  }, [resetCreate, resetUpdate, resetValuation]);

  const openNew = useCallback(() => openWith(null), [openWith]);
  const openEdit = useCallback((id: string) => openWith(id), [openWith]);
  const close = useCallback(() => setOpen(false), []);

  const save = useCallback((request: AssetRequest) => {
    if (request.kind === "create") {
      createAsset(request.body, { onSuccess: close });
      return;
    }
    updateAsset({ id: request.id, body: request.body }, { onSuccess: close });
  }, [createAsset, updateAsset, close]);

  const askDelete = useCallback(() => {
    setOpen(false);
    setPendingDeleteId(assetId);
  }, [assetId]);

  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId !== null) deleteAsset(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteAsset]);

  const deleteValuation = useCallback((fecha: string) => {
    if (assetId !== null) removeValuation({ id: assetId, fecha });
  }, [assetId, removeValuation]);

  return {
    open, asset, error, saving: creating || updating, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete, deleteValuation,
  };
};
```

Crear `client/src/components/NetWorthKpiCards.tsx`:

```tsx
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import SavingsIcon from "@mui/icons-material/Savings";
import { Typography } from "@mui/material";
import type { NetWorthDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { Kpi, type KpiColor } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface NetWorthKpiCardsProps {
  data: NetWorthDTO;
}

const captionSx = { display: "block", mt: -1.5, mb: 3 } as const;

const formatArs = (value: number): string => formatMoney(value, "ARS");

const approxUsd = (value: number): string => `≈ ${formatMoney(value, "USD")}`;

export const NetWorthKpiCards = ({ data }: NetWorthKpiCardsProps) => {
  const { totales, usdOficial, usdOficialFecha, uva, uvaFecha } = data;
  const netColor: KpiColor = totales.netoArs < 0 ? "error" : "primary";
  const uvaText = uva !== null && uvaFecha !== null ? ` · UVA ${formatArs(uva)} al ${uvaFecha}` : "";

  return (
    <>
      <KpiGrid cardCount={3}>
        <Kpi label="Patrimonio neto" value={totales.netoArs} format={formatArs} sub={approxUsd(totales.netoUsd)} icon={<AccountBalanceWalletIcon />} color={netColor} />
        <Kpi label="Activos" value={totales.activosArs} format={formatArs} sub={approxUsd(totales.activosUsd)} icon={<SavingsIcon />} color="success" />
        <Kpi label="Pasivos" value={totales.pasivosArs} format={formatArs} sub={approxUsd(totales.pasivosUsd)} icon={<CreditCardIcon />} color="warning" />
      </KpiGrid>
      <Typography variant="caption" color="text.secondary" sx={captionSx}>
        Valuado con dólar oficial {formatArs(usdOficial)} al {usdOficialFecha}{uvaText}
      </Typography>
    </>
  );
};
```

Crear `client/src/components/NetWorthItemsCard.tsx`:

```tsx
import { Box, Card, CardContent, Divider, List, ListItem, ListItemButton, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { SxProps, Theme } from "@mui/material/styles";
import type { NetWorthItemDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

interface NetWorthItemsCardProps {
  title: string;
  items: NetWorthItemDTO[];
  totalArs: number;
  totalUsd: number;
  emptyText: string;
  onEdit: (assetId: string) => void;
}

interface ItemRowProps {
  item: NetWorthItemDTO;
  onEdit: (assetId: string) => void;
}

interface ItemContentProps {
  item: NetWorthItemDTO;
}

const rowSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2, rowGap: 0.5, width: "100%",
};
const amountSx: SxProps<Theme> = { ml: "auto", textAlign: "right", minWidth: 0 };
const fixedRowSx: SxProps<Theme> = { minHeight: 56, px: 1 };
const editableRowSx: SxProps<Theme> = { minHeight: 56, px: 1, borderRadius: 2 };
const totalRowSx: SxProps<Theme> = { ...rowSx, px: 1 };
const captionBlockSx: SxProps<Theme> = { display: "block" };

const otherCurrency = ({ moneda, ars, usd }: NetWorthItemDTO): string =>
  (moneda === "ARS" ? `≈ ${formatMoney(usd, "USD")}` : `≈ ${formatMoney(ars, "ARS")}`);

const ItemContent = ({ item }: ItemContentProps) => (
  <Box sx={rowSx}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>{item.label}</Typography>
      <Typography variant="caption" color="text.secondary" sx={captionBlockSx}>
        {item.detalle} · al {item.fecha}
      </Typography>
    </Box>
    <Box sx={amountSx}>
      <Typography noWrap sx={{ fontWeight: 600 }}>{formatMoney(item.montoOriginal, item.moneda)}</Typography>
      <Typography noWrap variant="caption" color="text.secondary" sx={captionBlockSx}>{otherCurrency(item)}</Typography>
    </Box>
  </Box>
);

const ItemRow = ({ item, onEdit }: ItemRowProps) => {
  const { assetId } = item;

  if (item.fuente !== "manual" || assetId === null) {
    return <ListItem disablePadding sx={fixedRowSx}><ItemContent item={item} /></ListItem>;
  }

  return (
    <ListItem disablePadding>
      <ListItemButton aria-label={`editar ${item.label}`} onClick={() => onEdit(assetId)} sx={editableRowSx}>
        <ItemContent item={item} />
        <ChevronRightIcon fontSize="small" color="action" sx={{ ml: 1 }} />
      </ListItemButton>
    </ListItem>
  );
};

export const NetWorthItemsCard = ({ title, items, totalArs, totalUsd, emptyText, onEdit }: NetWorthItemsCardProps) => {
  const rows = items.map((item) => <ItemRow key={item.id} item={item} onEdit={onEdit} />);
  const body = items.length > 0
    ? <List disablePadding>{rows}</List>
    : <Typography color="text.secondary" sx={{ px: 1, py: 1 }}>{emptyText}</Typography>;

  return (
    <MotionBox variants={fadeUpItem}>
      <Card component="section" aria-label={title} sx={{ height: "100%" }}>
        <CardContent sx={compactCardContentSx}>
          <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
          {body}
          <Divider sx={{ my: 1 }} />
          <Box sx={totalRowSx}>
            <Typography sx={{ fontWeight: 700 }}>Total</Typography>
            <Box sx={amountSx}>
              <Typography noWrap sx={{ fontWeight: 700 }}>{formatMoney(totalArs, "ARS")}</Typography>
              <Typography noWrap variant="caption" color="text.secondary" sx={captionBlockSx}>
                ≈ {formatMoney(totalUsd, "USD")}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
```

Reemplazar `client/src/pages/NetWorthPage.tsx` por:

```tsx
import { useMemo } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { ManualAssetDTO, NetWorthDTO } from "@ledgerly/shared";
import { useNetWorth } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { ManualAssetEditor } from "../components/ManualAssetEditor.js";
import { NetWorthEvolutionCard } from "../components/NetWorthEvolutionCard.js";
import { NetWorthItemsCard } from "../components/NetWorthItemsCard.js";
import { NetWorthKpiCards } from "../components/NetWorthKpiCards.js";
import { useManualAssetEditor } from "../components/useManualAssetEditor.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { tapTargetSx } from "../components/tapTarget.js";
import { matchesYears, yearsOf } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { todayIso } from "../isoDate.js";
import { itemsBySide, missingPropertyHint } from "../netWorth.js";

interface NetWorthHeaderProps {
  onAdd: () => void;
}

interface NetWorthContentProps {
  data: NetWorthDTO | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onEdit: (assetId: string) => void;
}

interface NetWorthViewProps {
  data: NetWorthDTO;
  onEdit: (assetId: string) => void;
}

const NET_WORTH_FIELDS: FilterField[] = ["year"];
const NO_ASSETS: ManualAssetDTO[] = [];

const EMPTY_MESSAGE =
  "Todavía no hay nada para valuar. Importá cupones del auto o de la hipoteca, resúmenes de tarjeta, o agregá un activo a mano.";
const PROPERTY_HINT =
  "Tenés una hipoteca pero ningún inmueble entre tus activos. Agregá la casa como activo de tipo Inmueble para que el patrimonio no quede subestimado.";
const EMPTY_ASSETS = "Sin activos: agregá tus ahorros, plazos fijos o inversiones.";
const EMPTY_LIABILITIES = "Sin deudas registradas.";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: 2,
  mb: 3,
};
const gridSx: SxProps<Theme> = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 };
const fullRowSx: SxProps<Theme> = { gridColumn: "1 / -1" };

const deleteMessage = (asset: ManualAssetDTO | null): string =>
  (asset ? `¿Borrar «${asset.nombre}» y todas sus valuaciones? Esta acción no se puede deshacer.` : "");

const NetWorthHeader = ({ onAdd }: NetWorthHeaderProps) => (
  <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
    <Typography variant="h4">Patrimonio</Typography>
    <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} sx={tapTargetSx}>Agregar activo</Button>
  </Stack>
);

const NetWorthView = ({ data, onEdit }: NetWorthViewProps) => {
  const { yearSelection } = useGlobalFilters();
  const yearOptions = useMemo(() => yearsOf(data.evolucion.map((mes) => mes.periodo)), [data]);
  const { activos, pasivos } = useMemo(() => itemsBySide(data.items), [data]);
  const months = useMemo(
    () => data.evolucion.filter((mes) => matchesYears(mes.periodo, yearSelection)),
    [data, yearSelection],
  );
  const filters = data.evolucion.length > 0 && <FiltersBar fields={NET_WORTH_FIELDS} yearOptions={yearOptions} />;
  const propertyHint = missingPropertyHint(data) && <Alert severity="info" sx={{ mb: 3 }}>{PROPERTY_HINT}</Alert>;

  return (
    <>
      {filters}
      <NetWorthKpiCards data={data} />
      {propertyHint}
      <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={gridSx}>
        <NetWorthItemsCard
          title="Activos"
          items={activos}
          totalArs={data.totales.activosArs}
          totalUsd={data.totales.activosUsd}
          emptyText={EMPTY_ASSETS}
          onEdit={onEdit}
        />
        <NetWorthItemsCard
          title="Pasivos"
          items={pasivos}
          totalArs={data.totales.pasivosArs}
          totalUsd={data.totales.pasivosUsd}
          emptyText={EMPTY_LIABILITIES}
          onEdit={onEdit}
        />
        <Box sx={fullRowSx}>
          <NetWorthEvolutionCard months={months} />
        </Box>
      </MotionBox>
    </>
  );
};

const NetWorthContent = ({ data, isLoading, error, onEdit }: NetWorthContentProps) => {
  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data) return <Typography color="text.secondary">{EMPTY_MESSAGE}</Typography>;
  return <NetWorthView data={data} onEdit={onEdit} />;
};

export const NetWorthPage = () => {
  const { data, isLoading, error } = useNetWorth();
  const assets = data?.activosManuales ?? NO_ASSETS;
  const {
    open, asset, error: editorError, saving, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete, deleteValuation,
  } = useManualAssetEditor(assets);

  return (
    <>
      <NetWorthHeader onAdd={openNew} />
      <NetWorthContent data={data} isLoading={isLoading} error={error} onEdit={openEdit} />
      <ManualAssetEditor
        open={open}
        asset={asset}
        today={todayIso()}
        error={editorError}
        saving={saving}
        onClose={close}
        onSave={save}
        onDelete={askDelete}
        onDeleteValuation={deleteValuation}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar activo"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/NetWorthPage.test.tsx client/src/App.test.tsx`
Expected: PASS (el test de rutas de la base sigue viendo el `h4` «Patrimonio» mientras carga).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/useManualAssetEditor.ts client/src/components/NetWorthKpiCards.tsx client/src/components/NetWorthItemsCard.tsx client/src/pages/NetWorthPage.tsx client/src/pages/NetWorthPage.test.tsx
git commit -m "feat(client): página Patrimonio con foto, evolución y activos manuales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos los archivos en verde (los `skipped` de la base siguen igual).

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build de Vite sin errores.

- [ ] **Step 4: Revisar que no se tocó nada fuera de alcance**

Run: `git diff --stat feat/base-nuevas-features...HEAD`
Expected: solo los archivos de este plan (spec, plan, `server/src/stats/netWorth*`, `server/src/http/routes/netWorth*`, `client/src/netWorth*`, los componentes nuevos y `NetWorthPage*`).
