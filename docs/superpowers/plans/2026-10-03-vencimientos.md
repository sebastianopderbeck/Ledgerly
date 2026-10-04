# Calendario de vencimientos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/vencimientos` con la línea de tiempo de lo que hay que pagar (tarjetas, crédito UVA, plan del auto) y cobrar (sueldo) desde hoy hasta el último día del mes subsiguiente, con cada fecha marcada como confirmada (sale de un documento) o estimada (proyectada del patrón de los últimos documentos), agrupada por semana o por mes.

**Architecture:** Todo en el cliente, sin endpoint nuevo. Un motor puro, `client/src/vencimientos.ts`, combina los documentos que ya traen los hooks existentes: arma ocurrencias `{ mes ancla, fecha }` por fuente, calcula la mediana del desplazamiento contra el 1° del mes, proyecta los meses siguientes con corrimiento de fin de semana y agrupa por semana o mes. `useVencimientos` junta las siete queries y le pasa los datos al motor; `VencimientosPage` maneja los estados y el toggle Semana/Mes (`useStoredState`), y `VencimientosList` es presentacional.

**Tech Stack:** React 18 + MUI 6 + React Query 5 (cliente); Vitest + Testing Library en jsdom; Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-vencimientos-design.md`. Base compartida: `docs/superpowers/specs/2026-10-03-base-nuevas-features-design.md`.

## Prerrequisitos

1. La rama `feat/vencimientos` sale de `feat/base-nuevas-features`, que ya trae la ruta, el menú, los tests de navegación, `client/src/isoDate.ts` y el stub de `VencimientosPage`. Verificarlo desde la raíz del worktree:

   ```bash
   grep -n '"/vencimientos"' client/src/App.tsx client/src/components/layout/navItems.ts
   grep -n "export const startOfWeek\|export const formatDayOfMonthLong\|export const formatMonthYear" client/src/isoDate.ts
   grep -n "export const VencimientosPage" client/src/pages/VencimientosPage.tsx
   ```

   Las tres tienen que dar resultado. Si falta alguna, **frenar**: la base no es la correcta.
2. `bun install` si el worktree no tiene `node_modules`.

## Ajustes respecto del spec original

- `isoDate.ts`, la ruta, el menú y sus tests ya están en la base: este plan **no los toca**.
- `GrupoVencimientos` lleva `pagosAproximados` y `cobrosAproximados` en lugar de un solo `aproximado`, para que un sueldo estimado no ponga «≈» en los pagos confirmados de la misma semana.
- Los textos que la lista necesita (`etiquetaDia`, `diaDelMes`, `montoUsdTexto`, `notaSinEstimar`) salen de `vencimientos.ts`, así la lista no calcula nada y todo se testea sin render.
- Dos documentos de una fuente con la misma fecha dan un solo ítem (mismo `id`); en las tarjetas gana el importado más recientemente (`uploadedAt`).
- Los fixtures sintéticos viven en `client/src/testing/vencimientosFixtures.ts` y los usan los tres archivos de test.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Archivos fuera de alcance:** no modificar `client/src/App.tsx`, `App.test.tsx`, `client/src/components/layout/*`, `isoDate.ts`, `isoDate.test.ts`, `format.ts`, `api/hooks.ts`, `cardCycle.ts`, `useStoredState.ts`, `shared/*`, `server/*`, `package.json`, `bun.lock`.
- **Commits**: uno por task en `feat/vencimientos`, mensaje convencional en español terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, con pathspec explícito. Nunca `git add -A`, push ni merge. Nada de `examples/`.
- Componentes funcionales `const X = ({ props }: XProps) => {...}` con destructuring en la firma, `interface` para props, prohibido `any`. Lógica y condicionales antes del `return`. `key` siempre un id único (nunca el índice).
- Mobile `< md`: solo layout con breakpoints de `sx` (sin `useIsMobile`); objetivos táctiles de 44px (`MIN_TAP_SIZE`).
- Copy exacto: «Vencimientos», «De hoy al 31 de diciembre.», «Agrupar por», «Semana», «Mes», «Esta semana», «La semana que viene», «Semana del 12 de octubre», «Este mes», «Noviembre 2026», «Confirmado», «Estimado», «A confirmar», «No hay pagos ni cobros entre hoy y el 31 de diciembre.», «Todavía no importaste resúmenes, cupones ni recibos. Subilos desde la página Importar.», «No se pudieron cargar los vencimientos. Probá de nuevo en un rato.», «Sin estimar porque no hay documentos de los últimos 3 meses: …».
- Tests de cliente con varios renders llevan `afterEach(cleanup)`; los que stubean globals llaman `vi.unstubAllGlobals()`. Fecha fija: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("2026-10-03T12:00:00"))`.
- Montos en los tests: comparar contra `formatMoney(...)`, nunca con el string escrito a mano (Intl usa espacio duro). En los tests con render, pasar el esperado por `visible = (texto) => texto.replace(/\s/g, " ")`, porque Testing Library normaliza el texto del DOM pero no el del matcher (mismo truco que `legendCharts.test.tsx`).
- Imports con extensión `.js` (ESM). Comandos desde la raíz del worktree: `bun run test <ruta>`, `bun run typecheck`, `bun run build`.

## Review Focus

1. **Cobro que cruza de año**: un sueldo que se cobra el 1° de enero y cae sábado se corre al 31 de diciembre y tiene que aparecer dentro del rango aunque su mes ancla quede afuera. → test «con corrimiento hacia atrás el ancla de enero puede caer en diciembre» en Task 1.
2. **Documento importado dos veces**: dos resúmenes del mismo emisor con el mismo vencimiento darían dos filas con la misma `key`. → test «un vencimiento importado dos veces aparece una sola vez, con el último importado» en Task 2.
3. **Semana mixta**: un resumen confirmado y un sueldo estimado en la misma semana no pueden marcar «≈» en los pagos. → test «la aproximación de pagos y cobros va por separado» en Task 3.
4. **Sin crédito, sin plan o sin serie macro**: los resúmenes responden 204 (React Query los deja en error) y la página no puede mostrar error ni dejar de proyectar. → test «los resúmenes con 204 y sin serie macro no son error» en Task 5.
5. **Hay documentos pero nada en el rango** (crédito terminado, todo viejo): tiene que decir «No hay pagos ni cobros…», no invitar a importar. → test «con documentos pero nada en el rango muestra el mensaje vacío» en Task 5.

---

### Task 1: Motor — rango, patrón y proyección

**Files:**
- Create: `client/src/vencimientos.ts`
- Test: `client/src/vencimientos.test.ts`

**Interfaces:**
- Consumes: `addDays`, `addMonths`, `daysBetween`, `lastDayOfMonth`, `monthOf`, `weekdayOf` de `client/src/isoDate.ts`.
- Produces:
  - constantes `MESES_ADELANTE = 2`, `MUESTRA_PATRON = 6`, `MESES_SIN_DOCUMENTO_MAX = 3`;
  - tipos `VencimientoTipo`, `VencimientoSentido`, `VencimientoEstado`, `Corrimiento`, `Agrupacion`, `Vencimiento`, `RangoFechas`, `Ocurrencia`, `FechaProyectada` (exactos del spec);
  - `rangoDesde(hoy: string): RangoFechas`;
  - `desplazamientoTipico(ocurrencias: Ocurrencia[]): number | null`;
  - `ajustarFinDeSemana(fecha: string, corrimiento: Corrimiento): string`;
  - `proyectarFechas(ocurrencias: Ocurrencia[], rango: RangoFechas, corrimiento: Corrimiento): FechaProyectada[]`;
  - `estaDesactualizada(ultimoMes: string, desde: string): boolean`;
  - interno `ordenarOcurrencias(ocurrencias): Ocurrencia[]` (dedup por mes con la fecha mayor, orden por mes), que reusa Task 2.

- [ ] **Step 1: Write the failing test**

Crear `client/src/vencimientos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ajustarFinDeSemana, desplazamientoTipico, estaDesactualizada, proyectarFechas, rangoDesde, type RangoFechas,
} from "./vencimientos.js";

const RANGO: RangoFechas = { desde: "2026-10-03", hasta: "2026-12-31" };

describe("rangoDesde", () => {
  it("va de hoy al último día del mes subsiguiente", () => {
    expect(rangoDesde("2026-10-03")).toEqual(RANGO);
  });

  it("cruza el año", () => {
    expect(rangoDesde("2026-12-15")).toEqual({ desde: "2026-12-15", hasta: "2027-02-28" });
  });
});

describe("desplazamientoTipico", () => {
  it("es la mediana de los días contra el 1° del mes ancla", () => {
    expect(desplazamientoTipico([
      { mes: "2026-08", fecha: "2026-08-13" },
      { mes: "2026-09", fecha: "2026-09-14" },
      { mes: "2026-10", fecha: "2026-10-13" },
    ])).toBe(12);
  });

  it("con cantidad par promedia las dos del medio y redondea", () => {
    expect(desplazamientoTipico([
      { mes: "2026-07", fecha: "2026-07-05" },
      { mes: "2026-08", fecha: "2026-08-06" },
      { mes: "2026-09", fecha: "2026-09-09" },
      { mes: "2026-10", fecha: "2026-10-11" },
    ])).toBe(7);
  });

  it("usa solo las últimas 6, aunque lleguen desordenadas", () => {
    expect(desplazamientoTipico([
      { mes: "2026-07", fecha: "2026-07-10" },
      { mes: "2026-01", fecha: "2026-01-02" },
      { mes: "2026-06", fecha: "2026-06-10" },
      { mes: "2026-02", fecha: "2026-02-02" },
      { mes: "2026-05", fecha: "2026-05-10" },
      { mes: "2026-03", fecha: "2026-03-02" },
      { mes: "2026-04", fecha: "2026-04-02" },
    ])).toBe(5);
  });

  it("deduplica por mes quedándose con la fecha mayor", () => {
    expect(desplazamientoTipico([
      { mes: "2026-09", fecha: "2026-09-03" },
      { mes: "2026-09", fecha: "2026-09-20" },
    ])).toBe(19);
  });

  it("admite desplazamientos negativos", () => {
    expect(desplazamientoTipico([{ mes: "2026-08", fecha: "2026-07-31" }])).toBe(-1);
  });

  it("sin ocurrencias es null", () => {
    expect(desplazamientoTipico([])).toBeNull();
  });
});

describe("ajustarFinDeSemana", () => {
  it("hacia adelante lleva sábado y domingo al lunes", () => {
    expect(ajustarFinDeSemana("2026-11-14", "adelante")).toBe("2026-11-16");
    expect(ajustarFinDeSemana("2026-12-13", "adelante")).toBe("2026-12-14");
  });

  it("hacia atrás lleva sábado y domingo al viernes", () => {
    expect(ajustarFinDeSemana("2026-10-31", "atras")).toBe("2026-10-30");
    expect(ajustarFinDeSemana("2026-11-01", "atras")).toBe("2026-10-30");
  });

  it("un día hábil queda igual", () => {
    expect(ajustarFinDeSemana("2026-10-14", "adelante")).toBe("2026-10-14");
    expect(ajustarFinDeSemana("2026-10-14", "atras")).toBe("2026-10-14");
  });
});

describe("proyectarFechas", () => {
  it("proyecta un mes por paso y corta al pasar el final del rango", () => {
    const ocurrencias = [
      { mes: "2026-08", fecha: "2026-08-13" },
      { mes: "2026-09", fecha: "2026-09-14" },
      { mes: "2026-10", fecha: "2026-10-13" },
    ];
    expect(proyectarFechas(ocurrencias, RANGO, "adelante")).toEqual([
      { mes: "2026-11", fecha: "2026-11-13", paso: 1 },
      { mes: "2026-12", fecha: "2026-12-14", paso: 2 },
    ]);
  });

  it("descarta los meses que ya pasaron y numera los pasos desde el último documento", () => {
    expect(proyectarFechas([{ mes: "2026-08", fecha: "2026-08-14" }], RANGO, "adelante")).toEqual([
      { mes: "2026-10", fecha: "2026-10-14", paso: 2 },
      { mes: "2026-11", fecha: "2026-11-16", paso: 3 },
      { mes: "2026-12", fecha: "2026-12-14", paso: 4 },
    ]);
  });

  it("un 31 en un mes más corto usa el último día y después corre el fin de semana", () => {
    const rango = { desde: "2027-02-01", hasta: "2027-03-31" };
    expect(proyectarFechas([{ mes: "2027-01", fecha: "2027-01-31" }], rango, "adelante")).toEqual([
      { mes: "2027-02", fecha: "2027-03-01", paso: 1 },
      { mes: "2027-03", fecha: "2027-03-31", paso: 2 },
    ]);
  });

  it("con corrimiento hacia atrás el ancla de enero puede caer en diciembre", () => {
    const rango = { desde: "2027-10-04", hasta: "2027-12-31" };
    expect(proyectarFechas([{ mes: "2027-10", fecha: "2027-10-01" }], rango, "atras")).toEqual([
      { mes: "2027-11", fecha: "2027-11-01", paso: 1 },
      { mes: "2027-12", fecha: "2027-12-01", paso: 2 },
      { mes: "2028-01", fecha: "2027-12-31", paso: 3 },
    ]);
  });

  it("sin ocurrencias no proyecta nada", () => {
    expect(proyectarFechas([], RANGO, "adelante")).toEqual([]);
  });
});

describe("estaDesactualizada", () => {
  it("un último documento de hace 3 meses todavía se proyecta", () => {
    expect(estaDesactualizada("2026-07", "2026-10-03")).toBe(false);
  });

  it("uno de hace 4 meses ya no", () => {
    expect(estaDesactualizada("2026-06", "2026-10-03")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: FAIL — no existe `./vencimientos.js` («Failed to resolve import»).

- [ ] **Step 3: Implement**

Crear `client/src/vencimientos.ts`:

```ts
import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf, weekdayOf } from "./isoDate.js";

export const MESES_ADELANTE = 2;
export const MUESTRA_PATRON = 6;
export const MESES_SIN_DOCUMENTO_MAX = 3;

export type VencimientoTipo = "tarjeta" | "credito" | "auto" | "sueldo";
export type VencimientoSentido = "pago" | "cobro";
export type VencimientoEstado = "confirmado" | "estimado";
export type Corrimiento = "adelante" | "atras";
export type Agrupacion = "semana" | "mes";

export interface Vencimiento {
  id: string;
  tipo: VencimientoTipo;
  sentido: VencimientoSentido;
  estado: VencimientoEstado;
  fecha: string;
  titulo: string;
  detalle: string;
  monto: number | null;
  montoUsd: number | null;
}

export interface RangoFechas { desde: string; hasta: string; }
export interface Ocurrencia { mes: string; fecha: string; }
export interface FechaProyectada { mes: string; fecha: string; paso: number; }

const CORRIMIENTO_DIAS: Record<Corrimiento, Record<number, number>> = {
  adelante: { 6: 2, 0: 1 },
  atras: { 6: -1, 0: -2 },
};

const primeroDe = (mes: string): string => `${mes}-01`;

export function rangoDesde(hoy: string): RangoFechas {
  return { desde: hoy, hasta: lastDayOfMonth(addMonths(monthOf(hoy), MESES_ADELANTE)) };
}

const ordenarOcurrencias = (ocurrencias: Ocurrencia[]): Ocurrencia[] => {
  const porMes = new Map<string, Ocurrencia>();
  for (const ocurrencia of ocurrencias) {
    const anterior = porMes.get(ocurrencia.mes);
    if (!anterior || ocurrencia.fecha > anterior.fecha) porMes.set(ocurrencia.mes, ocurrencia);
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
};

const mediana = (valores: number[]): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio];
  return Math.round((ordenados[medio - 1] + ordenados[medio]) / 2);
};

export function desplazamientoTipico(ocurrencias: Ocurrencia[]): number | null {
  const muestra = ordenarOcurrencias(ocurrencias).slice(-MUESTRA_PATRON);
  if (muestra.length === 0) return null;
  return mediana(muestra.map(({ mes, fecha }) => daysBetween(primeroDe(mes), fecha)));
}

export function ajustarFinDeSemana(fecha: string, corrimiento: Corrimiento): string {
  return addDays(fecha, CORRIMIENTO_DIAS[corrimiento][weekdayOf(fecha)] ?? 0);
}

const fechaBase = (mes: string, desplazamiento: number): string => {
  const base = addDays(primeroDe(mes), desplazamiento);
  return desplazamiento >= 0 && monthOf(base) !== mes ? lastDayOfMonth(mes) : base;
};

export function proyectarFechas(ocurrencias: Ocurrencia[], rango: RangoFechas, corrimiento: Corrimiento): FechaProyectada[] {
  const desplazamiento = desplazamientoTipico(ocurrencias);
  const ultima = ordenarOcurrencias(ocurrencias).at(-1);
  if (desplazamiento === null || !ultima) return [];
  const mesTope = addMonths(monthOf(rango.hasta), 1);
  const proyectadas: FechaProyectada[] = [];
  for (let paso = 1; addMonths(ultima.mes, paso) <= mesTope; paso += 1) {
    const mes = addMonths(ultima.mes, paso);
    const fecha = ajustarFinDeSemana(fechaBase(mes, desplazamiento), corrimiento);
    if (fecha > rango.hasta) break;
    if (fecha >= rango.desde) proyectadas.push({ mes, fecha, paso });
  }
  return proyectadas;
}

export function estaDesactualizada(ultimoMes: string, desde: string): boolean {
  return ultimoMes < addMonths(monthOf(desde), -MESES_SIN_DOCUMENTO_MAX);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: PASS (todos los tests de `rangoDesde`, `desplazamientoTipico`, `ajustarFinDeSemana`, `proyectarFechas` y `estaDesactualizada`).

- [ ] **Step 5: Commit**

```bash
git add client/src/vencimientos.ts client/src/vencimientos.test.ts
git commit -m "feat(client): patrón y proyección de fechas de vencimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Motor — las cuatro fuentes

**Files:**
- Create: `client/src/testing/vencimientosFixtures.ts`
- Modify: `client/src/vencimientos.ts`
- Test: `client/src/vencimientos.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 1 (incluido el interno `ordenarOcurrencias`); `formatMoney`, `formatUva` de `client/src/format.ts`; `formatDayMonth`, `formatMonthYear` de `isoDate.ts`; tipos `AutoCouponDTO`, `Issuer`, `MortgageCouponDTO`, `PayslipDTO`, `StatementDTO` de `@ledgerly/shared` (solo tipos).
- Produces:
  - `interface FuenteVencimientos { etiqueta: string; items: Vencimiento[]; desactualizada: boolean; }`;
  - `estimarCuotaCredito(ultimo: MortgageCouponDTO, uvaHoy: number | null): number`;
  - `vencimientosDeTarjetas(statements: StatementDTO[], rango: RangoFechas): FuenteVencimientos[]`;
  - `vencimientosDeCredito(coupons: MortgageCouponDTO[], cuotasTotales: number | null, uvaHoy: number | null, rango: RangoFechas): FuenteVencimientos[]`;
  - `vencimientosDeAuto(coupons: AutoCouponDTO[], cuotasTotales: number | null, rango: RangoFechas): FuenteVencimientos[]`;
  - `vencimientosDeSueldo(payslips: PayslipDTO[], rango: RangoFechas): FuenteVencimientos[]`;
  - fixtures en `client/src/testing/vencimientosFixtures.ts`: `statement(fixture: StatementFixture)`, `creditCoupon(cuotaNro, fechaDebito, overrides?)`, `autoCoupon(cuotaNro, fechaVencimiento, totalAPagar?)`, `payslip(periodo, fechaPago, fixture?)`, `creditSummary(cuotasTotales)`, `autoSummary(cuotasTotales)`, `macroSeries(uva)`.

- [ ] **Step 1: Write the fixtures and the failing test**

Crear `client/src/testing/vencimientosFixtures.ts`:

```ts
import type {
  AutoCouponDTO, AutoSummaryDTO, CreditSummaryDTO, Issuer, MacroSeriesDTO, MortgageCouponDTO, PayslipDTO, StatementDTO,
} from "@ledgerly/shared";

interface StatementFixture {
  id: string;
  issuer: Issuer;
  dueDate: string | null;
  closingDate?: string | null;
  saldoArs?: number;
  saldoUsd?: number;
  minimoArs?: number;
  uploadedAt?: string;
}

interface PayslipFixture {
  neto?: number;
  tipo?: PayslipDTO["tipo"];
}

const CARD_LABELS: Record<Issuer, string> = { visa_signature: "Visa Signature", icbc: "ICBC" };

export const statement = ({
  id, issuer, dueDate, closingDate = null, saldoArs = 0, saldoUsd = 0, minimoArs = 0, uploadedAt = "2026-10-01T10:00:00.000Z",
}: StatementFixture): StatementDTO => ({
  id,
  issuer,
  cardLabel: CARD_LABELS[issuer],
  last4: "0000",
  closingDate,
  dueDate,
  totals: {
    totalConsumos: { ars: saldoArs, usd: saldoUsd },
    saldoActual: { ars: saldoArs, usd: saldoUsd },
    pagoMinimo: { ars: minimoArs, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt,
});

export const creditCoupon = (cuotaNro: number, fechaDebito: string, overrides: Partial<MortgageCouponDTO> = {}): MortgageCouponDTO => ({
  id: `credito-${cuotaNro}`,
  prestamoNro: "0000000001",
  cuotaNro,
  fechaDebito,
  capital: 100_000,
  intereses: 50_000,
  seguroIncendio: 4_000,
  totalDebitado: 160_000,
  cuotaPuraUva: 100,
  cotizacionUva: 1_500,
  capitalUva: 66.67,
  interesUva: 33.33,
  tea: 5,
  tna: 4.9,
  cft: 6,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  totalUsd: null,
  ...overrides,
});

export const autoCoupon = (cuotaNro: number, fechaVencimiento: string, totalAPagar = 250_000): AutoCouponDTO => ({
  id: `auto-${cuotaNro}`,
  grupo: "1234",
  orden: "056",
  cuotaNro,
  plan: "Plan sintético 70/30",
  fechaEmision: fechaVencimiento,
  fechaVencimiento,
  comprobante: `C-${cuotaNro}`,
  modelo: "Auto sintético",
  valorMovil: 20_000_000,
  conceptos: [],
  totalAPagar,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  totalUsd: null,
});

export const payslip = (periodo: string, fechaPago: string, { neto = 2_100_000, tipo = "mensual" }: PayslipFixture = {}): PayslipDTO => ({
  id: `recibo-${periodo}-${tipo}`,
  periodo,
  tipo,
  fechaPago,
  cuil: "20-00000000-0",
  conceptos: [],
  remunerativo: neto,
  noRemunerativo: 0,
  descuentos: 0,
  brutoTotal: neto,
  neto,
  costoTotalEmpleador: null,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  netoUsd: null,
});

export const creditSummary = (cuotasTotales: number): CreditSummaryDTO => ({
  prestamoNro: "0000000001",
  cuotasPagadas: 24,
  cuotasTotales,
  totalPagado: 1,
  capitalPagado: 1,
  interesPagado: 1,
  seguroPagado: 1,
  capitalOriginalUva: 1,
  capitalAmortizadoUva: 1,
  capitalPendienteUva: 1,
  capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.1,
  cotizacionUvaActual: 1_500,
  cuotaPuraUva: 100,
  tna: 4.9,
  tasaRealMensual: 0.004,
});

export const autoSummary = (cuotasTotales: number): AutoSummaryDTO => ({
  grupo: "1234",
  orden: "056",
  plan: "Plan sintético 70/30",
  modelo: "Auto sintético",
  cuotasPagadas: 25,
  cuotasTotales,
  porcentajeAvance: 0.2,
  totalPagado: 1,
  valorActualAuto: 20_000_000,
  totalPagadoUsd: 1,
  ultimaCuota: 25,
  fechaUltimoVencimiento: "2026-10-09",
});

export const macroSeries = (uva: number | null): MacroSeriesDTO => ({
  desde: "2025-01",
  meses: [],
  hoy: { fecha: "2026-10-02", usdOficial: 1_400, uva, tasa30: 30 },
});
```

En `client/src/vencimientos.test.ts`, reemplazar los imports de arriba por:

```ts
import { describe, it, expect } from "vitest";
import { formatMoney, formatUva } from "./format.js";
import { autoCoupon, creditCoupon, payslip, statement } from "./testing/vencimientosFixtures.js";
import {
  ajustarFinDeSemana, desplazamientoTipico, estaDesactualizada, estimarCuotaCredito, proyectarFechas, rangoDesde,
  vencimientosDeAuto, vencimientosDeCredito, vencimientosDeSueldo, vencimientosDeTarjetas, type RangoFechas,
} from "./vencimientos.js";
```

y agregar al final:

```ts
const resumido = (items: { fecha: string; titulo: string; estado: string; monto: number | null }[]) =>
  items.map(({ fecha, titulo, estado, monto }) => ({ fecha, titulo, estado, monto }));

describe("vencimientosDeTarjetas", () => {
  const visaOctubre = statement({
    id: "visa-10", issuer: "visa_signature", closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 812_000, saldoUsd: 35, minimoArs: 42_000,
  });

  it("un resumen con vencimiento futuro es confirmado, con saldo ARS + USD y el mínimo en el detalle", () => {
    const [fuente] = vencimientosDeTarjetas([visaOctubre], RANGO);
    expect(fuente.etiqueta).toBe("Visa Signature");
    expect(fuente.items[0]).toEqual({
      id: "tarjeta-visa_signature-2026-10-13",
      tipo: "tarjeta",
      sentido: "pago",
      estado: "confirmado",
      fecha: "2026-10-13",
      titulo: "Visa Signature",
      detalle: `Resumen con cierre 02/10 · mín. ${formatMoney(42_000, "ARS")}`,
      monto: 812_000,
      montoUsd: 35,
    });
  });

  it("los meses siguientes se estiman sin monto", () => {
    const [fuente] = vencimientosDeTarjetas([visaOctubre], RANGO);
    expect(fuente.items.slice(1)).toEqual([
      {
        id: "tarjeta-visa_signature-2026-11-13", tipo: "tarjeta", sentido: "pago", estado: "estimado", fecha: "2026-11-13",
        titulo: "Visa Signature", detalle: "Según el último resumen", monto: null, montoUsd: null,
      },
      {
        id: "tarjeta-visa_signature-2026-12-14", tipo: "tarjeta", sentido: "pago", estado: "estimado", fecha: "2026-12-14",
        titulo: "Visa Signature", detalle: "Según el último resumen", monto: null, montoUsd: null,
      },
    ]);
  });

  it("sin cierre dice Resumen importado y sin saldo en dólares no lleva montoUsd", () => {
    const [fuente] = vencimientosDeTarjetas([statement({ id: "icbc-10", issuer: "icbc", dueDate: "2026-10-14", saldoArs: 0 })], RANGO);
    expect(fuente.items[0]).toMatchObject({
      detalle: `Resumen importado · mín. ${formatMoney(0, "ARS")}`, monto: 0, montoUsd: null,
    });
  });

  it("ignora los resúmenes sin vencimiento", () => {
    const statements = [
      statement({ id: "icbc-09", issuer: "icbc", dueDate: "2026-09-14" }),
      statement({ id: "icbc-10", issuer: "icbc", closingDate: "2026-10-01", dueDate: null }),
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-14", titulo: "ICBC", estado: "estimado", monto: null },
      { fecha: "2026-11-16", titulo: "ICBC", estado: "estimado", monto: null },
      { fecha: "2026-12-14", titulo: "ICBC", estado: "estimado", monto: null },
    ]);
  });

  it("el detalle estimado cuenta los resúmenes del patrón", () => {
    const statements = [
      statement({ id: "visa-08", issuer: "visa_signature", dueDate: "2026-08-13" }),
      statement({ id: "visa-09", issuer: "visa_signature", dueDate: "2026-09-14" }),
      visaOctubre,
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    expect(fuente.items[1].detalle).toBe("Según los últimos 3 resúmenes");
  });

  it("cada emisor es una fuente independiente", () => {
    const fuentes = vencimientosDeTarjetas([visaOctubre, statement({ id: "icbc-09", issuer: "icbc", dueDate: "2026-09-14" })], RANGO);
    expect(fuentes.map(({ etiqueta }) => etiqueta)).toEqual(["ICBC", "Visa Signature"]);
    expect(fuentes[0].items.map(({ fecha }) => fecha)).toEqual(["2026-10-14", "2026-11-16", "2026-12-14"]);
    expect(fuentes[1].items.map(({ fecha }) => fecha)).toEqual(["2026-10-13", "2026-11-13", "2026-12-14"]);
  });

  it("un emisor sin resúmenes de los últimos 3 meses queda desactualizado y sin estimados", () => {
    const [fuente] = vencimientosDeTarjetas([statement({ id: "icbc-05", issuer: "icbc", dueDate: "2026-05-14" })], RANGO);
    expect(fuente).toEqual({ etiqueta: "ICBC", items: [], desactualizada: true });
  });

  it("un vencimiento importado dos veces aparece una sola vez, con el último importado", () => {
    const statements = [
      statement({ id: "visa-b", issuer: "visa_signature", dueDate: "2026-10-13", saldoArs: 2, uploadedAt: "2026-10-03T09:00:00.000Z" }),
      statement({ id: "visa-a", issuer: "visa_signature", dueDate: "2026-10-13", saldoArs: 1, uploadedAt: "2026-10-02T09:00:00.000Z" }),
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    const confirmados = fuente.items.filter(({ estado }) => estado === "confirmado");
    expect(confirmados).toHaveLength(1);
    expect(confirmados[0].monto).toBe(2);
    expect(new Set(fuente.items.map(({ id }) => id)).size).toBe(fuente.items.length);
  });

  it("sin resúmenes no hay fuentes", () => {
    expect(vencimientosDeTarjetas([], RANGO)).toEqual([]);
  });
});

describe("estimarCuotaCredito", () => {
  const ultimo = creditCoupon(24, "2026-09-04");

  it("usa la cuota pura a la UVA de hoy más el resto no-UVA del último cupón", () => {
    expect(estimarCuotaCredito(ultimo, 2_000)).toBe(210_000);
  });

  it("sin UVA de hoy usa la cotización del cupón", () => {
    expect(estimarCuotaCredito(ultimo, null)).toBe(160_000);
  });

  it("nunca estima por debajo de la cotización del cupón", () => {
    expect(estimarCuotaCredito(ultimo, 1_400)).toBe(160_000);
  });
});

describe("vencimientosDeCredito", () => {
  const cupones = [creditCoupon(22, "2026-07-06"), creditCoupon(23, "2026-08-05"), creditCoupon(24, "2026-09-04")];

  it("estima las cuotas siguientes con número correlativo y la UVA de hoy", () => {
    const [fuente] = vencimientosDeCredito(cupones, 240, 2_000, RANGO);
    expect(fuente.etiqueta).toBe("Crédito UVA");
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-05", titulo: "Crédito UVA · cuota 25", estado: "estimado", monto: 210_000 },
      { fecha: "2026-11-05", titulo: "Crédito UVA · cuota 26", estado: "estimado", monto: 210_000 },
      { fecha: "2026-12-07", titulo: "Crédito UVA · cuota 27", estado: "estimado", monto: 210_000 },
    ]);
    expect(fuente.items[0]).toMatchObject({
      id: "credito-2026-10-05", sentido: "pago", detalle: `${formatUva(100)} a la UVA de hoy`, montoUsd: null,
    });
  });

  it("sin UVA más nueva la estimación repite la última cuota", () => {
    const [fuente] = vencimientosDeCredito(cupones, 240, null, RANGO);
    expect(fuente.items[0]).toMatchObject({ detalle: "Igual a la cuota 24", monto: 160_000 });
  });

  it("un cupón con débito dentro del rango es confirmado", () => {
    const [fuente] = vencimientosDeCredito([...cupones, creditCoupon(25, "2026-10-05")], 240, 2_000, RANGO);
    expect(fuente.items[0]).toMatchObject({
      estado: "confirmado", titulo: "Crédito UVA · cuota 25", detalle: `Cupón importado · ${formatUva(100)}`, monto: 160_000,
    });
    expect(fuente.items[1]).toMatchObject({ estado: "estimado", titulo: "Crédito UVA · cuota 26" });
  });

  it("no proyecta más allá de la última cuota", () => {
    const [fuente] = vencimientosDeCredito(cupones, 26, 2_000, RANGO);
    expect(fuente.items.map(({ titulo }) => titulo)).toEqual(["Crédito UVA · cuota 25", "Crédito UVA · cuota 26"]);
  });

  it("un crédito terminado no proyecta ni avisa, aunque sus cupones sean viejos", () => {
    const viejos = [creditCoupon(22, "2026-03-04"), creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")];
    expect(vencimientosDeCredito(viejos, 24, 2_000, RANGO)).toEqual([{ etiqueta: "Crédito UVA", items: [], desactualizada: false }]);
  });

  it("sin cupones de los últimos 3 meses queda desactualizado", () => {
    const viejos = [creditCoupon(22, "2026-03-04"), creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")];
    expect(vencimientosDeCredito(viejos, 240, 2_000, RANGO)).toEqual([{ etiqueta: "Crédito UVA", items: [], desactualizada: true }]);
  });

  it("sin cupones no hay fuente", () => {
    expect(vencimientosDeCredito([], null, null, RANGO)).toEqual([]);
  });
});

describe("vencimientosDeAuto", () => {
  const cupones = [autoCoupon(23, "2026-08-10"), autoCoupon(24, "2026-09-09"), autoCoupon(25, "2026-10-09", 260_000)];

  it("un cupón con vencimiento futuro es confirmado y los siguientes repiten su total", () => {
    const [fuente] = vencimientosDeAuto(cupones, 120, RANGO);
    expect(fuente.etiqueta).toBe("Plan del auto");
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-09", titulo: "Plan del auto · cuota 25", estado: "confirmado", monto: 260_000 },
      { fecha: "2026-11-09", titulo: "Plan del auto · cuota 26", estado: "estimado", monto: 260_000 },
      { fecha: "2026-12-09", titulo: "Plan del auto · cuota 27", estado: "estimado", monto: 260_000 },
    ]);
    expect(fuente.items[0].detalle).toBe("Cupón importado");
    expect(fuente.items[1]).toMatchObject({ id: "auto-2026-11-09", detalle: "Igual a la cuota 25" });
  });

  it("no proyecta más allá de la última cuota del plan", () => {
    const [fuente] = vencimientosDeAuto(cupones, 26, RANGO);
    expect(fuente.items.map(({ titulo }) => titulo)).toEqual(["Plan del auto · cuota 25", "Plan del auto · cuota 26"]);
  });

  it("sin cupones no hay fuente", () => {
    expect(vencimientosDeAuto([], 120, RANGO)).toEqual([]);
  });
});

describe("vencimientosDeSueldo", () => {
  const recibos = [payslip("2026-06", "2026-07-01"), payslip("2026-07", "2026-07-31"), payslip("2026-08", "2026-09-01")];

  it("ancla en el mes siguiente al período y corre el cobro al viernes anterior", () => {
    const [fuente] = vencimientosDeSueldo(recibos, RANGO);
    expect(fuente.etiqueta).toBe("Sueldo");
    expect(fuente.items).toEqual([
      {
        id: "sueldo-2026-10-30", tipo: "sueldo", sentido: "cobro", estado: "estimado", fecha: "2026-10-30",
        titulo: "Sueldo de octubre 2026", detalle: "Igual al neto de agosto 2026", monto: 2_100_000, montoUsd: null,
      },
      {
        id: "sueldo-2026-12-01", tipo: "sueldo", sentido: "cobro", estado: "estimado", fecha: "2026-12-01",
        titulo: "Sueldo de noviembre 2026", detalle: "Igual al neto de agosto 2026", monto: 2_100_000, montoUsd: null,
      },
    ]);
  });

  it("ignora el SAC", () => {
    const conSac = [...recibos, payslip("2026-09", "2026-10-20", { tipo: "sac", neto: 1_000_000 })];
    const [fuente] = vencimientosDeSueldo(conSac, RANGO);
    expect(fuente.items.map(({ fecha }) => fecha)).toEqual(["2026-10-30", "2026-12-01"]);
  });

  it("un recibo con fecha de pago futura es confirmado", () => {
    const [fuente] = vencimientosDeSueldo([payslip("2026-09", "2026-10-05", { neto: 2_200_000 })], RANGO);
    expect(fuente.items[0]).toMatchObject({
      estado: "confirmado", fecha: "2026-10-05", titulo: "Sueldo de septiembre 2026", detalle: "Recibo importado", monto: 2_200_000,
    });
  });

  it("sin recibos mensuales no hay fuente", () => {
    expect(vencimientosDeSueldo([payslip("2026-06", "2026-06-30", { tipo: "sac" })], RANGO)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: FAIL — `vencimientosDeTarjetas`, `estimarCuotaCredito`, etc. «is not a function».

- [ ] **Step 3: Implement**

En `client/src/vencimientos.ts`, reemplazar la línea de imports por:

```ts
import type { AutoCouponDTO, Issuer, MortgageCouponDTO, PayslipDTO, StatementDTO } from "@ledgerly/shared";
import { formatMoney, formatUva } from "./format.js";
import {
  addDays, addMonths, daysBetween, formatDayMonth, formatMonthYear, lastDayOfMonth, monthOf, weekdayOf,
} from "./isoDate.js";
```

Debajo de `export interface FechaProyectada …`, agregar:

```ts
export interface FuenteVencimientos { etiqueta: string; items: Vencimiento[]; desactualizada: boolean; }

type DatosVencimiento = Pick<Vencimiento, "fecha" | "titulo" | "detalle" | "monto" | "montoUsd">;

interface DefinicionFuente {
  tipo: VencimientoTipo;
  sentido: VencimientoSentido;
  clave: string | null;
  etiqueta: string;
  corrimiento: Corrimiento;
  ocurrencias: Ocurrencia[];
  documentos: DatosVencimiento[];
  pasosRestantes: number;
  estimar: (proyectada: FechaProyectada) => Omit<DatosVencimiento, "fecha">;
}

type StatementConVencimiento = StatementDTO & { dueDate: string };
```

Y al final del archivo:

```ts
const ETIQUETA_CREDITO = "Crédito UVA";
const ETIQUETA_AUTO = "Plan del auto";
const ETIQUETA_SUELDO = "Sueldo";
const SIN_LIMITE = Number.POSITIVE_INFINITY;

const enRango = (fecha: string, { desde, hasta }: RangoFechas): boolean => fecha >= desde && fecha <= hasta;

const unicosPorId = (items: Vencimiento[]): Vencimiento[] => [...new Map(items.map((item) => [item.id, item])).values()];

const pasosHastaElFinal = (cuotasTotales: number | null, ultimaCuota: number): number =>
  cuotasTotales === null ? SIN_LIMITE : cuotasTotales - ultimaCuota;

const armarFuente = (
  { tipo, sentido, clave, etiqueta, corrimiento, ocurrencias, documentos, pasosRestantes, estimar }: DefinicionFuente,
  rango: RangoFechas,
): FuenteVencimientos => {
  const crear = (estado: VencimientoEstado, datos: DatosVencimiento): Vencimiento => ({
    id: clave ? `${tipo}-${clave}-${datos.fecha}` : `${tipo}-${datos.fecha}`,
    tipo,
    sentido,
    estado,
    ...datos,
  });
  const ultimoMes = ordenarOcurrencias(ocurrencias).at(-1)?.mes;
  const terminada = pasosRestantes <= 0;
  const desactualizada = !terminada && ultimoMes !== undefined && estaDesactualizada(ultimoMes, rango.desde);
  const confirmados = documentos.filter(({ fecha }) => enRango(fecha, rango)).map((datos) => crear("confirmado", datos));
  const proyectadas = terminada || desactualizada ? [] : proyectarFechas(ocurrencias, rango, corrimiento);
  const estimados = proyectadas
    .filter(({ paso }) => paso <= pasosRestantes)
    .map((proyectada) => crear("estimado", { fecha: proyectada.fecha, ...estimar(proyectada) }));
  return { etiqueta, items: unicosPorId([...confirmados, ...estimados]), desactualizada };
};

const tieneVencimiento = (statement: StatementDTO): statement is StatementConVencimiento => statement.dueDate !== null;

const porVencimientoEImportacion = (a: StatementConVencimiento, b: StatementConVencimiento): number =>
  a.dueDate.localeCompare(b.dueDate) || a.uploadedAt.localeCompare(b.uploadedAt);

const detalleResumen = ({ closingDate, totals }: StatementDTO): string => {
  const origen = closingDate ? `Resumen con cierre ${formatDayMonth(closingDate)}` : "Resumen importado";
  return `${origen} · mín. ${formatMoney(totals.pagoMinimo.ars, "ARS")}`;
};

const detallePatron = (cantidad: number): string =>
  cantidad === 1 ? "Según el último resumen" : `Según los últimos ${cantidad} resúmenes`;

const fuenteDeTarjeta = (issuer: Issuer, statements: StatementConVencimiento[], rango: RangoFechas): FuenteVencimientos => {
  const ordenados = [...statements].sort(porVencimientoEImportacion);
  const ultimo = ordenados[ordenados.length - 1];
  const ocurrencias = ordenados.map(({ dueDate }) => ({ mes: monthOf(dueDate), fecha: dueDate }));
  const detalle = detallePatron(Math.min(MUESTRA_PATRON, ordenarOcurrencias(ocurrencias).length));
  return armarFuente({
    tipo: "tarjeta",
    sentido: "pago",
    clave: issuer,
    etiqueta: ultimo.cardLabel,
    corrimiento: "adelante",
    ocurrencias,
    documentos: ordenados.map((statement) => ({
      fecha: statement.dueDate,
      titulo: statement.cardLabel,
      detalle: detalleResumen(statement),
      monto: statement.totals.saldoActual.ars,
      montoUsd: statement.totals.saldoActual.usd > 0 ? statement.totals.saldoActual.usd : null,
    })),
    pasosRestantes: SIN_LIMITE,
    estimar: () => ({ titulo: ultimo.cardLabel, detalle, monto: null, montoUsd: null }),
  }, rango);
};

export function vencimientosDeTarjetas(statements: StatementDTO[], rango: RangoFechas): FuenteVencimientos[] {
  const conVencimiento = statements.filter(tieneVencimiento);
  const emisores = [...new Set(conVencimiento.map(({ issuer }) => issuer))].sort();
  return emisores.map((issuer) =>
    fuenteDeTarjeta(issuer, conVencimiento.filter((statement) => statement.issuer === issuer), rango));
}

const ultimaCuota = <T extends { cuotaNro: number }>(coupons: T[]): T =>
  coupons.reduce((ultimo, coupon) => (coupon.cuotaNro > ultimo.cuotaNro ? coupon : ultimo));

export function estimarCuotaCredito(ultimo: MortgageCouponDTO, uvaHoy: number | null): number {
  const uva = Math.max(uvaHoy ?? 0, ultimo.cotizacionUva);
  const resto = ultimo.totalDebitado - ultimo.capital - ultimo.intereses;
  return ultimo.cuotaPuraUva * uva + resto;
}

export function vencimientosDeCredito(
  coupons: MortgageCouponDTO[],
  cuotasTotales: number | null,
  uvaHoy: number | null,
  rango: RangoFechas,
): FuenteVencimientos[] {
  if (coupons.length === 0) return [];
  const ultimo = ultimaCuota(coupons);
  const conUvaDeHoy = uvaHoy !== null && uvaHoy > ultimo.cotizacionUva;
  const detalle = conUvaDeHoy ? `${formatUva(ultimo.cuotaPuraUva)} a la UVA de hoy` : `Igual a la cuota ${ultimo.cuotaNro}`;
  const monto = estimarCuotaCredito(ultimo, uvaHoy);
  return [armarFuente({
    tipo: "credito",
    sentido: "pago",
    clave: null,
    etiqueta: ETIQUETA_CREDITO,
    corrimiento: "adelante",
    ocurrencias: coupons.map(({ fechaDebito }) => ({ mes: monthOf(fechaDebito), fecha: fechaDebito })),
    documentos: coupons.map((coupon) => ({
      fecha: coupon.fechaDebito,
      titulo: `${ETIQUETA_CREDITO} · cuota ${coupon.cuotaNro}`,
      detalle: `Cupón importado · ${formatUva(coupon.cuotaPuraUva)}`,
      monto: coupon.totalDebitado,
      montoUsd: null,
    })),
    pasosRestantes: pasosHastaElFinal(cuotasTotales, ultimo.cuotaNro),
    estimar: ({ paso }) => ({ titulo: `${ETIQUETA_CREDITO} · cuota ${ultimo.cuotaNro + paso}`, detalle, monto, montoUsd: null }),
  }, rango)];
}

export function vencimientosDeAuto(coupons: AutoCouponDTO[], cuotasTotales: number | null, rango: RangoFechas): FuenteVencimientos[] {
  if (coupons.length === 0) return [];
  const ultimo = ultimaCuota(coupons);
  return [armarFuente({
    tipo: "auto",
    sentido: "pago",
    clave: null,
    etiqueta: ETIQUETA_AUTO,
    corrimiento: "adelante",
    ocurrencias: coupons.map(({ fechaVencimiento }) => ({ mes: monthOf(fechaVencimiento), fecha: fechaVencimiento })),
    documentos: coupons.map((coupon) => ({
      fecha: coupon.fechaVencimiento,
      titulo: `${ETIQUETA_AUTO} · cuota ${coupon.cuotaNro}`,
      detalle: "Cupón importado",
      monto: coupon.totalAPagar,
      montoUsd: null,
    })),
    pasosRestantes: pasosHastaElFinal(cuotasTotales, ultimo.cuotaNro),
    estimar: ({ paso }) => ({
      titulo: `${ETIQUETA_AUTO} · cuota ${ultimo.cuotaNro + paso}`,
      detalle: `Igual a la cuota ${ultimo.cuotaNro}`,
      monto: ultimo.totalAPagar,
      montoUsd: null,
    }),
  }, rango)];
}

export function vencimientosDeSueldo(payslips: PayslipDTO[], rango: RangoFechas): FuenteVencimientos[] {
  const mensuales = payslips.filter(({ tipo }) => tipo === "mensual");
  if (mensuales.length === 0) return [];
  const ultimo = mensuales.reduce((actual, recibo) => (recibo.periodo > actual.periodo ? recibo : actual));
  return [armarFuente({
    tipo: "sueldo",
    sentido: "cobro",
    clave: null,
    etiqueta: ETIQUETA_SUELDO,
    corrimiento: "atras",
    ocurrencias: mensuales.map(({ periodo, fechaPago }) => ({ mes: addMonths(periodo, 1), fecha: fechaPago })),
    documentos: mensuales.map(({ periodo, fechaPago, neto }) => ({
      fecha: fechaPago,
      titulo: `${ETIQUETA_SUELDO} de ${formatMonthYear(periodo)}`,
      detalle: "Recibo importado",
      monto: neto,
      montoUsd: null,
    })),
    pasosRestantes: SIN_LIMITE,
    estimar: ({ mes }) => ({
      titulo: `${ETIQUETA_SUELDO} de ${formatMonthYear(addMonths(mes, -1))}`,
      detalle: `Igual al neto de ${formatMonthYear(ultimo.periodo)}`,
      monto: ultimo.neto,
      montoUsd: null,
    }),
  }, rango)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: PASS (los de Task 1 y los nuevos de las cuatro fuentes).

- [ ] **Step 5: Commit**

```bash
git add client/src/vencimientos.ts client/src/vencimientos.test.ts client/src/testing/vencimientosFixtures.ts
git commit -m "feat(client): vencimientos de tarjetas, crédito, auto y sueldo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Motor — lista completa, agrupación y textos

**Files:**
- Modify: `client/src/vencimientos.ts`
- Modify: `client/src/testing/vencimientosFixtures.ts`
- Test: `client/src/vencimientos.test.ts`

**Interfaces:**
- Consumes: Tasks 1 y 2; `addDays`, `formatDayOfMonthLong`, `formatWeekdayShort`, `startOfWeek` de `isoDate.ts`; tipos `AutoSummaryDTO`, `CreditSummaryDTO` de `@ledgerly/shared`.
- Produces:
  - `interface VencimientosInput`, `interface VencimientosView`, `interface GrupoVencimientos` (con `pagosAproximados` y `cobrosAproximados`);
  - `isAgrupacion(value: unknown): value is Agrupacion`;
  - `listVencimientos(input: VencimientosInput, rango: RangoFechas): VencimientosView`;
  - `hayDocumentos(input: VencimientosInput): boolean`;
  - `agruparVencimientos(items: Vencimiento[], agrupacion: Agrupacion, hoy: string): GrupoVencimientos[]`;
  - `resumenDeGrupo(grupo: GrupoVencimientos): string`;
  - `montoTexto(item: Vencimiento): string`;
  - `montoUsdTexto(item: Vencimiento): string | null`;
  - `etiquetaDia(fecha: string, hoy: string): string`;
  - `diaDelMes(fecha: string): number`;
  - `notaSinEstimar(sinEstimar: string[]): string | null`;
  - fixtures `vencimiento(overrides)`, `ejemploVencimientos(): VencimientosInput`, `entradaVacia(): VencimientosInput`.

- [ ] **Step 1: Write the fixtures and the failing test**

En `client/src/testing/vencimientosFixtures.ts`, agregar debajo del import de tipos:

```ts
import type { Vencimiento, VencimientosInput } from "../vencimientos.js";
```

y al final del archivo:

```ts
type VencimientoFixture = Partial<Vencimiento> & Pick<Vencimiento, "fecha" | "titulo">;

export const vencimiento = (overrides: VencimientoFixture): Vencimiento => ({
  id: `${overrides.titulo}-${overrides.fecha}`,
  tipo: "tarjeta",
  sentido: "pago",
  estado: "confirmado",
  detalle: "Detalle sintético",
  monto: 100_000,
  montoUsd: null,
  ...overrides,
});

export const entradaVacia = (): VencimientosInput => ({
  statements: [],
  creditCoupons: [],
  creditSummary: undefined,
  autoCoupons: [],
  autoSummary: undefined,
  payslips: [],
  uvaHoy: null,
});

export const ejemploVencimientos = (): VencimientosInput => ({
  statements: [
    statement({ id: "visa-08", issuer: "visa_signature", closingDate: "2026-07-31", dueDate: "2026-08-13", saldoArs: 700_000, minimoArs: 35_000 }),
    statement({ id: "visa-09", issuer: "visa_signature", closingDate: "2026-09-01", dueDate: "2026-09-14", saldoArs: 750_000, minimoArs: 37_000 }),
    statement({
      id: "visa-10", issuer: "visa_signature", closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 812_000, saldoUsd: 35, minimoArs: 42_000,
    }),
    statement({ id: "icbc-09", issuer: "icbc", closingDate: "2026-09-02", dueDate: "2026-09-14", saldoArs: 400_000, minimoArs: 20_000 }),
  ],
  creditCoupons: [creditCoupon(22, "2026-07-06"), creditCoupon(23, "2026-08-05"), creditCoupon(24, "2026-09-04")],
  creditSummary: creditSummary(240),
  autoCoupons: [autoCoupon(23, "2026-08-10"), autoCoupon(24, "2026-09-09"), autoCoupon(25, "2026-10-09", 260_000)],
  autoSummary: autoSummary(120),
  payslips: [payslip("2026-06", "2026-07-01"), payslip("2026-07", "2026-07-31"), payslip("2026-08", "2026-09-01")],
  uvaHoy: 2_000,
});
```

En `client/src/vencimientos.test.ts`, reemplazar los imports por:

```ts
import { describe, it, expect } from "vitest";
import { formatMoney, formatUva } from "./format.js";
import {
  autoCoupon, autoSummary, creditCoupon, ejemploVencimientos, entradaVacia, payslip, statement, vencimiento,
} from "./testing/vencimientosFixtures.js";
import {
  agruparVencimientos, ajustarFinDeSemana, desplazamientoTipico, diaDelMes, estaDesactualizada, estimarCuotaCredito,
  etiquetaDia, hayDocumentos, isAgrupacion, listVencimientos, montoTexto, montoUsdTexto, notaSinEstimar, proyectarFechas,
  rangoDesde, resumenDeGrupo, vencimientosDeAuto, vencimientosDeCredito, vencimientosDeSueldo, vencimientosDeTarjetas,
  type RangoFechas,
} from "./vencimientos.js";
```

y agregar al final:

```ts
const HOY = "2026-10-03";

describe("listVencimientos", () => {
  it("arma el ejemplo del spec ordenado por fecha", () => {
    const { rango, items, sinEstimar } = listVencimientos(ejemploVencimientos(), RANGO);
    expect(rango).toEqual(RANGO);
    expect(sinEstimar).toEqual([]);
    expect(items.map(({ fecha, titulo, estado }) => [fecha, titulo, estado])).toEqual([
      ["2026-10-05", "Crédito UVA · cuota 25", "estimado"],
      ["2026-10-09", "Plan del auto · cuota 25", "confirmado"],
      ["2026-10-13", "Visa Signature", "confirmado"],
      ["2026-10-14", "ICBC", "estimado"],
      ["2026-10-30", "Sueldo de octubre 2026", "estimado"],
      ["2026-11-05", "Crédito UVA · cuota 26", "estimado"],
      ["2026-11-09", "Plan del auto · cuota 26", "estimado"],
      ["2026-11-13", "Visa Signature", "estimado"],
      ["2026-11-16", "ICBC", "estimado"],
      ["2026-12-01", "Sueldo de noviembre 2026", "estimado"],
      ["2026-12-07", "Crédito UVA · cuota 27", "estimado"],
      ["2026-12-09", "Plan del auto · cuota 27", "estimado"],
      ["2026-12-14", "ICBC", "estimado"],
      ["2026-12-14", "Visa Signature", "estimado"],
    ]);
  });

  it("el mismo día pone el cobro antes que el pago", () => {
    const input = {
      ...entradaVacia(),
      statements: [statement({ id: "visa-10", issuer: "visa_signature", dueDate: "2026-10-13" })],
      payslips: [payslip("2026-09", "2026-10-13")],
    };
    const [primero, segundo] = listVencimientos(input, RANGO).items;
    expect([primero.titulo, segundo.titulo]).toEqual(["Sueldo de septiembre 2026", "Visa Signature"]);
  });

  it("sinEstimar junta las fuentes viejas en orden tarjetas, crédito, auto, sueldo", () => {
    const input = {
      ...entradaVacia(),
      statements: [statement({ id: "icbc-05", issuer: "icbc", dueDate: "2026-05-14" })],
      creditCoupons: [creditCoupon(24, "2026-05-05")],
      payslips: [payslip("2026-03", "2026-04-01")],
    };
    expect(listVencimientos(input, RANGO).sinEstimar).toEqual(["ICBC", "Crédito UVA", "Sueldo"]);
  });

  it("usa cuotasTotales de los resúmenes opcionales", () => {
    const input = { ...ejemploVencimientos(), creditSummary: undefined, autoSummary: undefined, creditCoupons: [], payslips: [], statements: [] };
    expect(listVencimientos(input, RANGO).items.map(({ titulo }) => titulo)).toEqual([
      "Plan del auto · cuota 25", "Plan del auto · cuota 26", "Plan del auto · cuota 27",
    ]);
    const conFinal = { ...input, autoSummary: autoSummary(25) };
    expect(listVencimientos(conFinal, RANGO).items.map(({ titulo }) => titulo)).toEqual(["Plan del auto · cuota 25"]);
  });
});

describe("hayDocumentos", () => {
  it("es false sin statements, cupones ni recibos", () => {
    expect(hayDocumentos(entradaVacia())).toBe(false);
  });

  it("alcanza con un solo documento", () => {
    expect(hayDocumentos({ ...entradaVacia(), autoCoupons: [autoCoupon(1, "2026-01-09")] })).toBe(true);
  });
});

describe("agruparVencimientos", () => {
  it("titula las semanas relativas a hoy", () => {
    const items = [
      vencimiento({ fecha: "2026-10-03", titulo: "ICBC" }),
      vencimiento({ fecha: "2026-10-05", titulo: "Crédito UVA · cuota 25" }),
      vencimiento({ fecha: "2026-10-13", titulo: "Visa Signature" }),
    ];
    expect(agruparVencimientos(items, "semana", HOY).map(({ clave, titulo }) => [clave, titulo])).toEqual([
      ["2026-09-28", "Esta semana"],
      ["2026-10-05", "La semana que viene"],
      ["2026-10-12", "Semana del 12 de octubre"],
    ]);
  });

  it("titula los meses relativos a hoy", () => {
    const items = [vencimiento({ fecha: "2026-10-05", titulo: "A" }), vencimiento({ fecha: "2026-11-13", titulo: "B" })];
    expect(agruparVencimientos(items, "mes", HOY).map(({ clave, titulo }) => [clave, titulo])).toEqual([
      ["2026-10", "Este mes"],
      ["2026-11", "Noviembre 2026"],
    ]);
  });

  it("omite los grupos sin ítems y respeta el orden de llegada", () => {
    const items = [
      vencimiento({ fecha: "2026-10-05", titulo: "Primero" }),
      vencimiento({ fecha: "2026-10-20", titulo: "Tercero" }),
      vencimiento({ fecha: "2026-10-06", titulo: "Segundo" }),
    ];
    const grupos = agruparVencimientos(items, "semana", HOY);
    expect(grupos.map(({ clave }) => clave)).toEqual(["2026-10-05", "2026-10-19"]);
    expect(grupos[0].items.map(({ titulo }) => titulo)).toEqual(["Primero", "Segundo"]);
  });

  it("suma pagos, dólares y cobros, y cuenta los que faltan confirmar", () => {
    const items = [
      vencimiento({ fecha: "2026-10-13", titulo: "Visa Signature", monto: 812_000, montoUsd: 35 }),
      vencimiento({ fecha: "2026-10-14", titulo: "ICBC", estado: "estimado", monto: null }),
      vencimiento({ fecha: "2026-10-15", titulo: "Crédito UVA · cuota 25", tipo: "credito", estado: "estimado", monto: 160_000 }),
      vencimiento({ fecha: "2026-10-16", titulo: "Sueldo de septiembre 2026", tipo: "sueldo", sentido: "cobro", monto: 2_100_000 }),
    ];
    const [grupo] = agruparVencimientos(items, "semana", HOY);
    expect(grupo).toMatchObject({
      totalPagos: 972_000, totalPagosUsd: 35, totalCobros: 2_100_000, pagosAproximados: true, cobrosAproximados: false, aConfirmar: 1,
    });
  });

  it("la aproximación de pagos y cobros va por separado", () => {
    const items = [
      vencimiento({ fecha: "2026-10-27", titulo: "Visa Signature", monto: 812_000 }),
      vencimiento({ fecha: "2026-10-30", titulo: "Sueldo de octubre 2026", tipo: "sueldo", sentido: "cobro", estado: "estimado", monto: 2_100_000 }),
    ];
    const [grupo] = agruparVencimientos(items, "semana", HOY);
    expect(grupo).toMatchObject({ pagosAproximados: false, cobrosAproximados: true });
    expect(resumenDeGrupo(grupo)).toBe(`Pagos ${formatMoney(812_000, "ARS")} · Cobros ≈ ${formatMoney(2_100_000, "ARS")}`);
  });
});

describe("resumenDeGrupo", () => {
  it("junta pagos, dólares, cobros y pendientes", () => {
    const items = [
      vencimiento({ fecha: "2026-10-13", titulo: "Visa Signature", monto: 812_000, montoUsd: 35 }),
      vencimiento({ fecha: "2026-10-14", titulo: "ICBC", estado: "estimado", monto: null }),
      vencimiento({ fecha: "2026-10-15", titulo: "Crédito UVA · cuota 25", estado: "estimado", monto: 160_000 }),
      vencimiento({ fecha: "2026-10-16", titulo: "Sueldo", sentido: "cobro", monto: 2_100_000 }),
    ];
    const [grupo] = agruparVencimientos(items, "semana", HOY);
    expect(resumenDeGrupo(grupo)).toBe(
      `Pagos ≈ ${formatMoney(972_000, "ARS")} · + ${formatMoney(35, "USD")} · Cobros ${formatMoney(2_100_000, "ARS")} · 1 a confirmar`,
    );
  });

  it("con solo tarjetas estimadas dice cuántas faltan confirmar", () => {
    const items = [
      vencimiento({ fecha: "2026-11-13", titulo: "Visa Signature", estado: "estimado", monto: null }),
      vencimiento({ fecha: "2026-11-16", titulo: "ICBC", estado: "estimado", monto: null }),
    ];
    const [grupo] = agruparVencimientos(items, "mes", HOY);
    expect(resumenDeGrupo(grupo)).toBe("2 a confirmar");
  });
});

describe("textos de cada fila", () => {
  it("montoTexto marca los estimados con ≈ y los cobros con +", () => {
    expect(montoTexto(vencimiento({ fecha: "2026-10-14", titulo: "ICBC", monto: null }))).toBe("A confirmar");
    expect(montoTexto(vencimiento({ fecha: "2026-10-13", titulo: "Visa", monto: 812_000 }))).toBe(formatMoney(812_000, "ARS"));
    expect(montoTexto(vencimiento({ fecha: "2026-10-05", titulo: "Crédito", estado: "estimado", monto: 812_000 })))
      .toBe(`≈ ${formatMoney(812_000, "ARS")}`);
    expect(montoTexto(vencimiento({ fecha: "2026-10-05", titulo: "Sueldo", sentido: "cobro", monto: 2_100_000 })))
      .toBe(`+${formatMoney(2_100_000, "ARS")}`);
    expect(montoTexto(vencimiento({ fecha: "2026-10-30", titulo: "Sueldo", sentido: "cobro", estado: "estimado", monto: 2_100_000 })))
      .toBe(`≈ +${formatMoney(2_100_000, "ARS")}`);
  });

  it("montoUsdTexto suma el saldo en dólares si hay", () => {
    expect(montoUsdTexto(vencimiento({ fecha: "2026-10-13", titulo: "Visa", montoUsd: 35 }))).toBe(`+ ${formatMoney(35, "USD")}`);
    expect(montoUsdTexto(vencimiento({ fecha: "2026-10-13", titulo: "Visa" }))).toBeNull();
  });

  it("etiquetaDia dice hoy, mañana o el día corto", () => {
    expect(etiquetaDia("2026-10-03", HOY)).toBe("hoy");
    expect(etiquetaDia("2026-10-04", HOY)).toBe("mañana");
    expect(etiquetaDia("2026-10-05", HOY)).toBe("lun");
  });

  it("diaDelMes es el número de día", () => {
    expect(diaDelMes("2026-10-05")).toBe(5);
    expect(diaDelMes("2026-12-31")).toBe(31);
  });

  it("notaSinEstimar nombra las fuentes viejas", () => {
    expect(notaSinEstimar([])).toBeNull();
    expect(notaSinEstimar(["ICBC", "Crédito UVA"])).toBe("Sin estimar porque no hay documentos de los últimos 3 meses: ICBC, Crédito UVA.");
  });

  it("isAgrupacion acepta solo semana y mes", () => {
    expect(isAgrupacion("semana")).toBe(true);
    expect(isAgrupacion("mes")).toBe(true);
    expect(isAgrupacion("dia")).toBe(false);
    expect(isAgrupacion(null)).toBe(false);
  });
});

describe("ejemplo del spec agrupado por semana", () => {
  it("arranca en La semana que viene porque esta semana no tiene ítems", () => {
    const { items } = listVencimientos(ejemploVencimientos(), RANGO);
    expect(agruparVencimientos(items, "semana", HOY).map(({ titulo }) => titulo)).toEqual([
      "La semana que viene",
      "Semana del 12 de octubre",
      "Semana del 26 de octubre",
      "Semana del 2 de noviembre",
      "Semana del 9 de noviembre",
      "Semana del 16 de noviembre",
      "Semana del 30 de noviembre",
      "Semana del 7 de diciembre",
      "Semana del 14 de diciembre",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: FAIL — `listVencimientos`, `agruparVencimientos`, etc. «is not a function».

- [ ] **Step 3: Implement**

En `client/src/vencimientos.ts`, reemplazar los imports por:

```ts
import type {
  AutoCouponDTO, AutoSummaryDTO, CreditSummaryDTO, Issuer, MortgageCouponDTO, PayslipDTO, StatementDTO,
} from "@ledgerly/shared";
import { formatMoney, formatUva } from "./format.js";
import {
  addDays, addMonths, daysBetween, formatDayMonth, formatDayOfMonthLong, formatMonthYear, formatWeekdayShort,
  lastDayOfMonth, monthOf, startOfWeek, weekdayOf,
} from "./isoDate.js";
```

Debajo de `export interface FuenteVencimientos …`, agregar:

```ts
export interface VencimientosInput {
  statements: StatementDTO[];
  creditCoupons: MortgageCouponDTO[];
  creditSummary: CreditSummaryDTO | undefined;
  autoCoupons: AutoCouponDTO[];
  autoSummary: AutoSummaryDTO | undefined;
  payslips: PayslipDTO[];
  uvaHoy: number | null;
}

export interface VencimientosView { rango: RangoFechas; items: Vencimiento[]; sinEstimar: string[]; }

export interface GrupoVencimientos {
  clave: string;
  titulo: string;
  items: Vencimiento[];
  totalPagos: number;
  totalPagosUsd: number;
  totalCobros: number;
  pagosAproximados: boolean;
  cobrosAproximados: boolean;
  aConfirmar: number;
}

interface Agrupador {
  clave: (fecha: string) => string;
  titulo: (clave: string, hoy: string) => string;
}
```

Y al final del archivo:

```ts
const ORDEN_SENTIDO: Record<VencimientoSentido, number> = { cobro: 0, pago: 1 };

const compararVencimientos = (a: Vencimiento, b: Vencimiento): number =>
  a.fecha.localeCompare(b.fecha) || ORDEN_SENTIDO[a.sentido] - ORDEN_SENTIDO[b.sentido] || a.titulo.localeCompare(b.titulo);

export function listVencimientos(input: VencimientosInput, rango: RangoFechas): VencimientosView {
  const fuentes = [
    ...vencimientosDeTarjetas(input.statements, rango),
    ...vencimientosDeCredito(input.creditCoupons, input.creditSummary?.cuotasTotales ?? null, input.uvaHoy, rango),
    ...vencimientosDeAuto(input.autoCoupons, input.autoSummary?.cuotasTotales ?? null, rango),
    ...vencimientosDeSueldo(input.payslips, rango),
  ];
  return {
    rango,
    items: fuentes.flatMap(({ items }) => items).sort(compararVencimientos),
    sinEstimar: fuentes.filter(({ desactualizada }) => desactualizada).map(({ etiqueta }) => etiqueta),
  };
}

export function hayDocumentos({ statements, creditCoupons, autoCoupons, payslips }: VencimientosInput): boolean {
  return statements.length + creditCoupons.length + autoCoupons.length + payslips.length > 0;
}

export const isAgrupacion = (value: unknown): value is Agrupacion => value === "semana" || value === "mes";

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

const tituloSemana = (clave: string, hoy: string): string => {
  const estaSemana = startOfWeek(hoy);
  if (clave === estaSemana) return "Esta semana";
  if (clave === addDays(estaSemana, 7)) return "La semana que viene";
  return `Semana del ${formatDayOfMonthLong(clave)}`;
};

const tituloMes = (clave: string, hoy: string): string =>
  clave === monthOf(hoy) ? "Este mes" : capitalizar(formatMonthYear(clave));

const AGRUPADORES: Record<Agrupacion, Agrupador> = {
  semana: { clave: startOfWeek, titulo: tituloSemana },
  mes: { clave: monthOf, titulo: tituloMes },
};

const sumar = (items: Vencimiento[], valor: (item: Vencimiento) => number | null): number =>
  items.reduce((total, item) => total + (valor(item) ?? 0), 0);

const hayEstimadoConMonto = (items: Vencimiento[]): boolean =>
  items.some(({ estado, monto }) => estado === "estimado" && monto !== null);

const armarGrupo = (clave: string, titulo: string, items: Vencimiento[]): GrupoVencimientos => {
  const pagos = items.filter(({ sentido }) => sentido === "pago");
  const cobros = items.filter(({ sentido }) => sentido === "cobro");
  return {
    clave,
    titulo,
    items,
    totalPagos: sumar(pagos, ({ monto }) => monto),
    totalPagosUsd: sumar(pagos, ({ montoUsd }) => montoUsd),
    totalCobros: sumar(cobros, ({ monto }) => monto),
    pagosAproximados: hayEstimadoConMonto(pagos),
    cobrosAproximados: hayEstimadoConMonto(cobros),
    aConfirmar: items.filter(({ monto }) => monto === null).length,
  };
};

export function agruparVencimientos(items: Vencimiento[], agrupacion: Agrupacion, hoy: string): GrupoVencimientos[] {
  const { clave: claveDe, titulo } = AGRUPADORES[agrupacion];
  const porClave = new Map<string, Vencimiento[]>();
  for (const item of items) {
    const clave = claveDe(item.fecha);
    porClave.set(clave, [...(porClave.get(clave) ?? []), item]);
  }
  return [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, delGrupo]) => armarGrupo(clave, titulo(clave, hoy), delGrupo));
}

const prefijoAproximado = (aproximado: boolean): string => (aproximado ? "≈ " : "");

const tieneMonto = (items: Vencimiento[], sentido: VencimientoSentido): boolean =>
  items.some((item) => item.sentido === sentido && item.monto !== null);

export function resumenDeGrupo({
  items, totalPagos, totalPagosUsd, totalCobros, pagosAproximados, cobrosAproximados, aConfirmar,
}: GrupoVencimientos): string {
  const partes = [
    tieneMonto(items, "pago") ? `Pagos ${prefijoAproximado(pagosAproximados)}${formatMoney(totalPagos, "ARS")}` : null,
    totalPagosUsd > 0 ? `+ ${formatMoney(totalPagosUsd, "USD")}` : null,
    tieneMonto(items, "cobro") ? `Cobros ${prefijoAproximado(cobrosAproximados)}${formatMoney(totalCobros, "ARS")}` : null,
    aConfirmar > 0 ? `${aConfirmar} a confirmar` : null,
  ];
  return partes.filter((parte): parte is string => parte !== null).join(" · ");
}

export function montoTexto({ monto, sentido, estado }: Vencimiento): string {
  if (monto === null) return "A confirmar";
  const signo = sentido === "cobro" ? "+" : "";
  return `${prefijoAproximado(estado === "estimado")}${signo}${formatMoney(monto, "ARS")}`;
}

export function montoUsdTexto({ montoUsd }: Vencimiento): string | null {
  return montoUsd === null ? null : `+ ${formatMoney(montoUsd, "USD")}`;
}

export function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  if (fecha === addDays(hoy, 1)) return "mañana";
  return formatWeekdayShort(fecha);
}

export const diaDelMes = (fecha: string): number => Number(fecha.slice(8, 10));

export function notaSinEstimar(sinEstimar: string[]): string | null {
  if (sinEstimar.length === 0) return null;
  return `Sin estimar porque no hay documentos de los últimos ${MESES_SIN_DOCUMENTO_MAX} meses: ${sinEstimar.join(", ")}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/vencimientos.test.ts`
Expected: PASS (todo el archivo, incluido el ejemplo completo del spec).

- [ ] **Step 5: Commit**

```bash
git add client/src/vencimientos.ts client/src/vencimientos.test.ts client/src/testing/vencimientosFixtures.ts
git commit -m "feat(client): lista, agrupación y textos de vencimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `VencimientosList`

**Files:**
- Create: `client/src/components/VencimientosList.tsx`
- Test: `client/src/components/VencimientosList.test.tsx`

**Interfaces:**
- Consumes: `GrupoVencimientos`, `Vencimiento`, `resumenDeGrupo`, `montoTexto`, `montoUsdTexto`, `etiquetaDia`, `diaDelMes`, `agruparVencimientos` (en el test) de Task 3; `formatDayOfMonthLong` de `isoDate.ts`; `MotionBox`, `staggerContainer`, `fadeUpItem`, `MIN_TAP_SIZE`; fixture `vencimiento`.
- Produces: `export const VencimientosList = ({ grupos, hoy }: VencimientosListProps)` con `interface VencimientosListProps { grupos: GrupoVencimientos[]; hoy: string; }`.

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/VencimientosList.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { vencimiento } from "../testing/vencimientosFixtures.js";
import { agruparVencimientos, resumenDeGrupo, type Vencimiento } from "../vencimientos.js";
import { VencimientosList } from "./VencimientosList.js";

const HOY = "2026-10-03";

const visible = (texto: string): string => texto.replace(/\s/g, " ");

const items: Vencimiento[] = [
  vencimiento({ fecha: "2026-10-03", titulo: "ICBC", estado: "estimado", monto: null, detalle: "Según el último resumen" }),
  vencimiento({ fecha: "2026-10-04", titulo: "Sueldo de septiembre 2026", tipo: "sueldo", sentido: "cobro", monto: 2_100_000 }),
  vencimiento({
    fecha: "2026-10-05", titulo: "Crédito UVA · cuota 25", tipo: "credito", estado: "estimado", monto: 210_000, detalle: "100,00 UVA a la UVA de hoy",
  }),
  vencimiento({ fecha: "2026-10-06", titulo: "Visa Signature", monto: 812_000, montoUsd: 35, detalle: "Resumen con cierre 02/10" }),
];

const renderList = () => {
  const grupos = agruparVencimientos(items, "semana", HOY);
  renderWithProviders(<VencimientosList grupos={grupos} hoy={HOY} />);
  return grupos;
};

afterEach(() => {
  cleanup();
});

describe("VencimientosList", () => {
  it("muestra un encabezado h2 por grupo con su resumen", () => {
    const grupos = renderList();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titulos).toEqual(["Esta semana", "La semana que viene"]);
    const semanaQueViene = screen.getByRole("region", { name: "La semana que viene" });
    expect(within(semanaQueViene).getByText(visible(resumenDeGrupo(grupos[1])))).toBeInTheDocument();
  });

  it("cada fila se nombra con título, fecha y estado", () => {
    renderList();
    expect(screen.getByRole("listitem", { name: "ICBC, 3 de octubre, estimado" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Visa Signature, 6 de octubre, confirmado" })).toBeInTheDocument();
  });

  it("un estimado lleva chip Estimado y ≈ en el monto", () => {
    renderList();
    const fila = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(fila).getByText("Estimado")).toBeInTheDocument();
    expect(within(fila).getByText(visible(`≈ ${formatMoney(210_000, "ARS")}`))).toBeInTheDocument();
    expect(within(fila).getByText("100,00 UVA a la UVA de hoy")).toBeInTheDocument();
  });

  it("un confirmado lleva chip Confirmado y el saldo en dólares", () => {
    renderList();
    const fila = screen.getByRole("listitem", { name: "Visa Signature, 6 de octubre, confirmado" });
    expect(within(fila).getByText("Confirmado")).toBeInTheDocument();
    expect(within(fila).getByText(visible(formatMoney(812_000, "ARS")))).toBeInTheDocument();
    expect(within(fila).getByText(visible(`+ ${formatMoney(35, "USD")}`))).toBeInTheDocument();
  });

  it("una tarjeta estimada dice A confirmar y un cobro lleva +", () => {
    renderList();
    expect(within(screen.getByRole("listitem", { name: "ICBC, 3 de octubre, estimado" })).getByText("A confirmar")).toBeInTheDocument();
    const sueldo = screen.getByRole("listitem", { name: "Sueldo de septiembre 2026, 4 de octubre, confirmado" });
    expect(within(sueldo).getByText(visible(`+${formatMoney(2_100_000, "ARS")}`))).toBeInTheDocument();
  });

  it("la ficha de fecha dice hoy, mañana o el día corto", () => {
    renderList();
    expect(within(screen.getByRole("listitem", { name: /^ICBC/ })).getByText("hoy")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: /^Sueldo/ })).getByText("mañana")).toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: /^Crédito/ });
    expect(within(credito).getByText("5")).toBeInTheDocument();
    expect(within(credito).getByText("lun")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/VencimientosList.test.tsx`
Expected: FAIL — no existe `./VencimientosList.js`.

- [ ] **Step 3: Implement**

Crear `client/src/components/VencimientosList.tsx`:

```tsx
import { useId } from "react";
import { Box, Card, Chip, List, ListItem, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { formatDayOfMonthLong } from "../isoDate.js";
import {
  diaDelMes, etiquetaDia, montoTexto, montoUsdTexto, resumenDeGrupo, type GrupoVencimientos, type Vencimiento,
} from "../vencimientos.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";

interface VencimientosListProps { grupos: GrupoVencimientos[]; hoy: string; }
interface GrupoCardProps { grupo: GrupoVencimientos; hoy: string; }
interface VencimientoRowProps { item: Vencimiento; hoy: string; }
interface FichaFechaProps { fecha: string; hoy: string; confirmado: boolean; }
interface EstadoChipProps { confirmado: boolean; }

const listSx: SxProps<Theme> = { display: "grid", gap: 2, maxWidth: 840 };

const headerSx: SxProps<Theme> = { px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: "divider" };

const rowSx: SxProps<Theme> = {
  gap: 1.5, px: 2, py: 1.25, alignItems: "flex-start", "&:last-of-type": { borderBottom: 0 },
};

const fichaSx = (confirmado: boolean): SxProps<Theme> => ({
  minWidth: MIN_TAP_SIZE,
  minHeight: MIN_TAP_SIZE,
  px: 0.5,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 1.5,
  border: "1px dashed",
  borderColor: confirmado ? "transparent" : "divider",
  bgcolor: (theme: Theme) => (confirmado ? alpha(theme.palette.primary.main, 0.12) : "transparent"),
  color: confirmado ? "primary.main" : "text.secondary",
});

const montoColor = ({ sentido, monto }: Vencimiento): string => {
  if (sentido === "cobro") return "success.main";
  return monto === null ? "text.secondary" : "text.primary";
};

const FichaFecha = ({ fecha, hoy, confirmado }: FichaFechaProps) => (
  <Box sx={fichaSx(confirmado)}>
    <Typography component="span" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{diaDelMes(fecha)}</Typography>
    <Typography component="span" variant="caption" sx={{ lineHeight: 1.1 }}>{etiquetaDia(fecha, hoy)}</Typography>
  </Box>
);

const EstadoChip = ({ confirmado }: EstadoChipProps) => {
  if (confirmado) return <Chip size="small" variant="outlined" color="success" label="Confirmado" />;
  return <Chip size="small" variant="outlined" label="Estimado" sx={{ borderStyle: "dashed" }} />;
};

const VencimientoRow = ({ item, hoy }: VencimientoRowProps) => {
  const confirmado = item.estado === "confirmado";
  const aConfirmar = item.monto === null;
  const usd = montoUsdTexto(item);
  const label = `${item.titulo}, ${formatDayOfMonthLong(item.fecha)}, ${item.estado}`;
  const montoVariant = aConfirmar ? "caption" : "body1";
  const montoSx: SxProps<Theme> = { fontWeight: aConfirmar ? 400 : 600, whiteSpace: "nowrap" };

  return (
    <ListItem divider aria-label={label} sx={rowSx}>
      <FichaFecha fecha={item.fecha} hoy={hoy} confirmado={confirmado} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{item.titulo}</Typography>
          <Typography variant={montoVariant} color={montoColor(item)} sx={montoSx}>{montoTexto(item)}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.75, rowGap: 0.5, mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{item.detalle}</Typography>
          <EstadoChip confirmado={confirmado} />
          {usd && <Typography variant="caption" color="text.secondary">{usd}</Typography>}
        </Box>
      </Box>
    </ListItem>
  );
};

const GrupoCard = ({ grupo, hoy }: GrupoCardProps) => {
  const tituloId = useId();
  const resumen = resumenDeGrupo(grupo);
  const filas = grupo.items.map((item) => <VencimientoRow key={item.id} item={item} hoy={hoy} />);

  return (
    <MotionBox variants={fadeUpItem}>
      <Card component="section" aria-labelledby={tituloId}>
        <Box sx={headerSx}>
          <Typography id={tituloId} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>{grupo.titulo}</Typography>
          <Typography component="p" variant="caption" color="text.secondary">{resumen}</Typography>
        </Box>
        <List disablePadding>{filas}</List>
      </Card>
    </MotionBox>
  );
};

export const VencimientosList = ({ grupos, hoy }: VencimientosListProps) => {
  const tarjetas = grupos.map((grupo) => <GrupoCard key={grupo.clave} grupo={grupo} hoy={hoy} />);
  return (
    <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={listSx}>
      {tarjetas}
    </MotionBox>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/VencimientosList.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/VencimientosList.tsx client/src/components/VencimientosList.test.tsx
git commit -m "feat(client): lista de vencimientos agrupada con fichas de fecha" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `useVencimientos` y `VencimientosPage`

**Files:**
- Create: `client/src/useVencimientos.ts`
- Modify: `client/src/pages/VencimientosPage.tsx` (reemplaza el stub)
- Test: `client/src/pages/VencimientosPage.test.tsx`

**Interfaces:**
- Consumes: `useStatements`, `useCreditCoupons`, `useCreditSummary`, `useAutoCoupons`, `useAutoSummary`, `usePayslips`, `useMacroSeries` de `api/hooks.ts`; `todayIso`, `formatDayOfMonthLong` de `isoDate.ts`; `listVencimientos`, `rangoDesde`, `hayDocumentos`, `agruparVencimientos`, `isAgrupacion`, `notaSinEstimar`, tipos `Agrupacion`, `VencimientosInput`, `VencimientosView` (Task 3); `VencimientosList` (Task 4); `useStoredState`; `MIN_TAP_SIZE`; fixtures `ejemploVencimientos`, `macroSeries`, `statement`, `creditCoupon`, `creditSummary`.
- Produces:
  - `interface UseVencimientosResult { isLoading: boolean; isError: boolean; hasDocuments: boolean; hoy: string; view: VencimientosView; }`;
  - `useVencimientos(): UseVencimientosResult`;
  - `export const VencimientosPage = () => …` (mismo nombre de export que el stub; `App.tsx` no cambia).

- [ ] **Step 1: Write the failing test**

Crear `client/src/pages/VencimientosPage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import {
  creditCoupon, creditSummary, ejemploVencimientos, macroSeries, statement,
} from "../testing/vencimientosFixtures.js";
import { emulateMobile } from "../testing/viewport.js";
import { VencimientosPage } from "./VencimientosPage.js";

interface Respuesta { status: number; body?: unknown; }

const visible = (texto: string): string => texto.replace(/\s/g, " ");

const ok = (body: unknown): Respuesta => ({ status: 200, body });
const SIN_CONTENIDO: Respuesta = { status: 204 };

const respuestasDelEjemplo = (): Record<string, Respuesta> => {
  const ejemplo = ejemploVencimientos();
  return {
    "/statements": ok(ejemplo.statements),
    "/credits/coupons": ok(ejemplo.creditCoupons),
    "/credits/summary": ok(ejemplo.creditSummary),
    "/auto/coupons": ok(ejemplo.autoCoupons),
    "/auto/summary": ok(ejemplo.autoSummary),
    "/payslips": ok(ejemplo.payslips),
    "/macro/series": ok(macroSeries(2_000)),
  };
};

const sinDocumentos = (): Record<string, Respuesta> => ({
  "/statements": ok([]),
  "/credits/coupons": ok([]),
  "/credits/summary": SIN_CONTENIDO,
  "/auto/coupons": ok([]),
  "/auto/summary": SIN_CONTENIDO,
  "/payslips": ok([]),
  "/macro/series": ok(macroSeries(2_000)),
});

const stubApi = (respuestas: Record<string, Respuesta>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).replace(/^\/api/, "").split("?")[0];
    const { status, body } = respuestas[path] ?? { status: 404, body: { error: "sin stub" } };
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }));
};

const renderPage = () => renderWithProviders(<VencimientosPage />, { route: "/vencimientos" });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00"));
  stubApi(respuestasDelEjemplo());
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VencimientosPage", () => {
  it("con datos agrupa por semana y marca confirmados y estimados", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "La semana que viene" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Vencimientos" })).toBeInTheDocument();
    expect(screen.getByText("De hoy al 31 de diciembre.")).toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(credito).getByText("Estimado")).toBeInTheDocument();
    expect(within(credito).getByText(visible(`≈ ${formatMoney(210_000, "ARS")}`))).toBeInTheDocument();
    const auto = screen.getByRole("listitem", { name: "Plan del auto · cuota 25, 9 de octubre, confirmado" });
    expect(within(auto).getByText("Confirmado")).toBeInTheDocument();
    expect(within(auto).getByText(visible(formatMoney(260_000, "ARS")))).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Esta semana" })).not.toBeInTheDocument();
  });

  it("tocar Mes agrupa por mes y la elección queda guardada", async () => {
    const { unmount } = renderPage();
    await screen.findByRole("heading", { level: 2, name: "La semana que viene" });
    await userEvent.click(screen.getByRole("button", { name: "Mes" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Este mes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Noviembre 2026" })).toBeInTheDocument();
    unmount();
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "Este mes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("los resúmenes con 204 y sin serie macro no son error", async () => {
    stubApi({
      ...respuestasDelEjemplo(),
      "/credits/summary": SIN_CONTENIDO,
      "/auto/summary": SIN_CONTENIDO,
      "/macro/series": { status: 500, body: { error: "sin serie" } },
    });
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "La semana que viene" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(credito).getByText("Igual a la cuota 24")).toBeInTheDocument();
  });

  it("mientras carga muestra el título y el spinner", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderPage();
    expect(screen.getByRole("heading", { level: 4, name: "Vencimientos" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("sin documentos invita a importar", async () => {
    stubApi(sinDocumentos());
    renderPage();
    expect(await screen.findByText(/Subilos desde la página Importar/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Agrupar por" })).not.toBeInTheDocument();
  });

  it("si falla la lista de resúmenes muestra el error", async () => {
    stubApi({ ...respuestasDelEjemplo(), "/statements": { status: 500, body: { error: "boom" } } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los vencimientos. Probá de nuevo en un rato.");
  });

  it("una fuente vieja va a la nota Sin estimar", async () => {
    stubApi({
      ...respuestasDelEjemplo(),
      "/statements": ok([statement({ id: "icbc-05", issuer: "icbc", dueDate: "2026-05-14" })]),
    });
    renderPage();
    expect(await screen.findByText("Sin estimar porque no hay documentos de los últimos 3 meses: ICBC.")).toBeInTheDocument();
  });

  it("con documentos pero nada en el rango muestra el mensaje vacío", async () => {
    stubApi({
      ...sinDocumentos(),
      "/credits/coupons": ok([creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")]),
      "/credits/summary": ok(creditSummary(24)),
    });
    renderPage();
    expect(await screen.findByText("No hay pagos ni cobros entre hoy y el 31 de diciembre.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Agrupar por" })).toBeInTheDocument();
    expect(screen.queryByText(/Sin estimar/)).not.toBeInTheDocument();
  });
});

describe("VencimientosPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra la lista, sin tablas, y los dos botones de agrupación", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "La semana que viene" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    const agrupar = screen.getByRole("group", { name: "Agrupar por" });
    expect(within(agrupar).getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(within(agrupar).getByRole("button", { name: "Mes" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pages/VencimientosPage.test.tsx`
Expected: FAIL — el stub solo muestra el `h4`: no aparece «La semana que viene», ni el spinner, ni los mensajes.

- [ ] **Step 3: Implement**

Crear `client/src/useVencimientos.ts`:

```ts
import { useMemo } from "react";
import {
  useAutoCoupons, useAutoSummary, useCreditCoupons, useCreditSummary, useMacroSeries, usePayslips, useStatements,
} from "./api/hooks.js";
import { todayIso } from "./isoDate.js";
import { hayDocumentos, listVencimientos, rangoDesde, type VencimientosInput, type VencimientosView } from "./vencimientos.js";

export interface UseVencimientosResult {
  isLoading: boolean;
  isError: boolean;
  hasDocuments: boolean;
  hoy: string;
  view: VencimientosView;
}

export function useVencimientos(): UseVencimientosResult {
  const statements = useStatements();
  const creditCoupons = useCreditCoupons();
  const creditSummary = useCreditSummary();
  const autoCoupons = useAutoCoupons();
  const autoSummary = useAutoSummary();
  const payslips = usePayslips();
  const macro = useMacroSeries();
  const hoy = useMemo(todayIso, []);

  const input = useMemo<VencimientosInput>(() => ({
    statements: statements.data ?? [],
    creditCoupons: creditCoupons.data ?? [],
    creditSummary: creditSummary.data,
    autoCoupons: autoCoupons.data ?? [],
    autoSummary: autoSummary.data,
    payslips: payslips.data ?? [],
    uvaHoy: macro.data?.hoy.uva ?? null,
  }), [statements.data, creditCoupons.data, creditSummary.data, autoCoupons.data, autoSummary.data, payslips.data, macro.data]);

  const view = useMemo(() => listVencimientos(input, rangoDesde(hoy)), [input, hoy]);
  const queries = [statements, creditCoupons, creditSummary, autoCoupons, autoSummary, payslips, macro];
  const documentLists = [statements, creditCoupons, autoCoupons, payslips];

  return {
    isLoading: queries.some(({ isLoading }) => isLoading),
    isError: documentLists.some(({ isError }) => isError),
    hasDocuments: hayDocumentos(input),
    hoy,
    view,
  };
}
```

Reemplazar `client/src/pages/VencimientosPage.tsx` por:

```tsx
import { useCallback, useMemo, type MouseEvent } from "react";
import { Alert, Box, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { VencimientosList } from "../components/VencimientosList.js";
import { MIN_TAP_SIZE } from "../components/tapTarget.js";
import { formatDayOfMonthLong } from "../isoDate.js";
import { useStoredState } from "../useStoredState.js";
import { useVencimientos } from "../useVencimientos.js";
import { agruparVencimientos, isAgrupacion, notaSinEstimar, type Agrupacion } from "../vencimientos.js";

const AGRUPACION_KEY = "ledgerly.vencimientosAgrupacion";

const LEYENDA =
  "Confirmado: la fecha sale de un documento importado. Estimado: se proyecta del patrón de los últimos documentos; los montos estimados llevan ≈.";

const headerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  alignItems: { xs: "stretch", md: "center" },
  justifyContent: "space-between",
  gap: 1.5,
  maxWidth: 840,
  mb: 1,
};

const toggleGroupSx: SxProps<Theme> = { width: { xs: "100%", md: "auto" } };

const toggleButtonSx: SxProps<Theme> = { flex: { xs: 1, md: "none" }, minHeight: { xs: MIN_TAP_SIZE, md: 0 }, px: 2 };

const leyendaSx: SxProps<Theme> = { display: "block", maxWidth: 840, mb: 2 };

const notaSx: SxProps<Theme> = { display: "block", maxWidth: 840, mt: 2 };

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Vencimientos</Typography>;

export const VencimientosPage = () => {
  const { isLoading, isError, hasDocuments, hoy, view } = useVencimientos();
  const [agrupacion, setAgrupacion] = useStoredState<Agrupacion>(AGRUPACION_KEY, "semana", isAgrupacion);
  const grupos = useMemo(() => agruparVencimientos(view.items, agrupacion, hoy), [view.items, agrupacion, hoy]);

  const cambiarAgrupacion = useCallback((_event: MouseEvent<HTMLElement>, valor: Agrupacion | null) => {
    if (valor !== null) setAgrupacion(valor);
  }, [setAgrupacion]);

  if (isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Title />
        <Alert severity="error">No se pudieron cargar los vencimientos. Probá de nuevo en un rato.</Alert>
      </>
    );
  }

  if (!hasDocuments) {
    return (
      <>
        <Title />
        <Typography color="text.secondary">
          Todavía no importaste resúmenes, cupones ni recibos. Subilos desde la página Importar.
        </Typography>
      </>
    );
  }

  const hasta = formatDayOfMonthLong(view.rango.hasta);
  const nota = notaSinEstimar(view.sinEstimar);
  const contenido = grupos.length === 0
    ? <Typography color="text.secondary">{`No hay pagos ni cobros entre hoy y el ${hasta}.`}</Typography>
    : <VencimientosList key={agrupacion} grupos={grupos} hoy={hoy} />;

  return (
    <>
      <Title />
      <Box sx={headerSx}>
        <Typography variant="body2" color="text.secondary">{`De hoy al ${hasta}.`}</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={agrupacion}
          onChange={cambiarAgrupacion}
          aria-label="Agrupar por"
          sx={toggleGroupSx}
        >
          <ToggleButton value="semana" sx={toggleButtonSx}>Semana</ToggleButton>
          <ToggleButton value="mes" sx={toggleButtonSx}>Mes</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={leyendaSx}>{LEYENDA}</Typography>
      {contenido}
      {nota && <Typography variant="caption" color="text.secondary" sx={notaSx}>{nota}</Typography>}
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/pages/VencimientosPage.test.tsx client/src/App.test.tsx`
Expected: PASS (9 tests de la página y las rutas de `App.test.tsx`, que siguen viendo el `h4` mientras carga).

- [ ] **Step 5: Commit**

```bash
git add client/src/useVencimientos.ts client/src/pages/VencimientosPage.tsx client/src/pages/VencimientosPage.test.tsx
git commit -m "feat(client): página de vencimientos con agrupación por semana o mes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos los tests en verde. Si falla algo ajeno a la feature, comprobar que ya fallaba en `feat/base-nuevas-features` antes de seguir.

- [ ] **Step 2: Tipos**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: `vite build` termina sin errores.

- [ ] **Step 4: Revisar el alcance**

Run: `git diff --stat feat/base-nuevas-features...HEAD`
Expected: solo el spec, este plan, `client/src/vencimientos.ts` (+ test), `client/src/testing/vencimientosFixtures.ts`, `client/src/useVencimientos.ts`, `client/src/components/VencimientosList.tsx` (+ test) y `client/src/pages/VencimientosPage.tsx` (+ test). Nada de `examples/`.
