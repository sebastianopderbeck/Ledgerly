# Flujo de caja — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la página **Flujo** (`/flujo`) que muestra, mes a mes, cuánto entra por sueldo, cuánto sale sí o sí (tarjetas, hipoteca y auto), el margen y la tasa de ahorro, con KPIs del último mes completo y una proyección de 6 meses.

**Architecture:** El server arma todos los meses en un módulo puro (`server/src/stats/cashFlow.ts`): imputa cada flujo al mes en que se mueve la plata, pasa el USD a pesos con la serie `usd_oficial` ya guardada, marca los meses incompletos y estima la proyección. `GET /api/cash-flow` solo lee los modelos y llama a ese módulo. El cliente tiene su propio módulo puro (`client/src/cashFlow.ts`) que elige KPIs, filtra la historia por año y prepara filas; los componentes solo pintan.

**Tech Stack:** Express + Mongoose (server); React 18 + MUI 6 + React Query 5 + react-router 6 + nivo (cliente); Vitest + Testing Library + supertest + mongodb-memory-server (tests); Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-flujo-de-caja-design.md`

## Prerrequisitos

- Rama `feat/flujo-de-caja` creada desde `feat/base-nuevas-features`, en un worktree propio, con `bun install` corrido.
- La base ya trae, y este plan **no toca**: la ruta `/flujo` y el ítem de menú (con sus tests), el router `cashFlowRouter` montado en `/api/cash-flow`, los DTOs `CashFlowDTO` / `CashFlowMonthDTO` / `CashFlowEstado` (con tests), el hook `useCashFlow()`, y los módulos `server/src/stats/months.ts`, `rateOnDate.ts` y `statementDueDate.ts` con sus tests.

## Global Constraints

- **Sin comentarios en el código**: nada de `//`, bloques ni JSDoc.
- **Commits con pathspec explícito**, mensajes convencionales en español (`feat(server): …`, `feat(client): …`, `docs: …`) terminando con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A` ni `git add .`. Nunca push, PR ni merge.
- **Archivos que no se tocan**: `shared/src/*`, `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/stats/{months,rateOnDate,statementDueDate,merchantKey,lastStatement,futureInstallments,amortization,autoProgress}.ts`, `client/src/App.tsx`, `client/src/App.test.tsx`, `client/src/api/*`, `client/src/components/layout/*`, `client/src/format.ts`, `client/src/isoDate.ts`, `client/src/inflationIndex.ts`, `client/src/filters/*`, `client/src/components/charts/palette.ts`, `package.json`s y `bun.lock`.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`.
- Filtros, mapeos y condicionales complejos antes del `return`, no dentro del JSX. Keys de listas por `mes` (único), nunca por índice.
- El cliente importa solo **tipos** de `@ledgerly/shared` (un valor arrastraría zod al bundle).
- Imports con extensión `.js` (ESM), como el resto del repo.
- Vencimiento estimado: `statementDueDate` de la base (`closingDate` + 12 días). No se crea `cardDueDate`.
- Textos exactos (copiados del spec): `"Recibo de sueldo"`, `"Recibo del SAC"`, `"Cuota de la hipoteca"`, `"Cupón del auto"`, `"Cotización del dólar"`, `` `Resumen ${cardLabel}` ``, `"Sueldo (último neto)"`, `"SAC (½ del último neto)"`, `"Hipoteca (última cuota)"`, `"Auto (último cupón)"`, `` `${cardLabel} (solo cuotas)` ``.
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo).
- Para fijar la fecha en tests: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`, y `vi.useRealTimers()` en `afterEach`.
- Fixtures siempre sintéticos (CUIL `20-00000000-0`, «Visa Signature» / «ICBC», montos redondos). Nunca usar nada de `examples/`.
- No levantar la app (4100 es del servicio instalado; 4000/5173 son de otras sesiones).
- Comandos: `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Año sin meses cerrados** (`/flujo?year=2019`): los KPIs y la proyección siguen, el gráfico de historia muestra «Sin datos» y el detalle muestra solo los meses proyectados. → test en Task 8.
2. **Recibo del mes en curso ya importado**: lo real reemplaza al estimado y pasa a ser el «último neto» de los meses siguientes; lo mismo con un cupón de hipoteca del mes en curso. → test en Task 3.
3. **Saldo en USD con vencimiento futuro y sin cotización cargada**: el mes en curso lista «Cotización del dólar» pero el margen se sigue calculando (en la proyección no se anula). → test en Task 3.
4. **Último resumen sin cuotas** (todo en un pago): los meses siguientes llevan 0 de esa tarjeta, pero se anota «(solo cuotas)» para que se vea que es un piso. → test en Task 3.
5. **Dos resúmenes de la misma tarjeta que vencen en el mismo mes** (cierres corridos): se suman, no se pisan. → test en Task 2.

---

### Task 1: Funciones auxiliares del flujo (server)

**Files:**
- Create: `server/src/stats/cashFlow.ts`
- Test: `server/src/stats/cashFlow.test.ts`

**Interfaces:**
- Consumes: `monthOf`, `monthsBetween` de `./months.js`; `statementDueDate` de `./statementDueDate.js`; `PayslipTipo` de `@ledgerly/shared`.
- Produces:
  - constantes `HORIZONTE_MESES = 6`, `FALTA_RECIBO`, `FALTA_SAC`, `FALTA_HIPOTECA`, `FALTA_AUTO`, `FALTA_COTIZACION`, `faltaResumen(cardLabel)`, `ESTIMADO_SUELDO`, `ESTIMADO_SAC`, `ESTIMADO_HIPOTECA`, `ESTIMADO_AUTO`, `estimadoTarjeta(cardLabel)`;
  - tipos `CashFlowPayslip`, `CashFlowStatement`, `PendingInstallment`, `CashFlowCard`, `CashFlowCoupon`, `CashFlowPlan`, `InstallmentTxInput`, `CashFlowInput`;
  - `statementAmountArs(statement: Pick<CashFlowStatement, "saldoArs" | "saldoUsd">, rate: number | null): number`
  - `toCashFlowCard(statement: CashFlowStatement, txs: InstallmentTxInput[]): CashFlowCard | null`
  - `installmentFloor(card: CashFlowCard, month: string): number`
  - `projectPlanPayment(plan: CashFlowPlan, month: string): number`
  - `incomeByMonth(payslips: CashFlowPayslip[]): Map<string, CashFlowPayslip[]>`

- [ ] **Step 1: Write the failing test**

`server/src/stats/cashFlow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { PayslipTipo } from "@ledgerly/shared";
import {
  incomeByMonth, installmentFloor, projectPlanPayment, statementAmountArs, toCashFlowCard,
  type CashFlowCard, type CashFlowPayslip, type CashFlowPlan, type CashFlowStatement,
} from "./cashFlow.js";

const statement = (overrides: Partial<CashFlowStatement> = {}): CashFlowStatement => ({
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  closingDate: "2026-09-03",
  dueDate: "2026-09-14",
  saldoArs: 100_000,
  saldoUsd: 0,
  uploadedAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

const payslip = (fechaPago: string, neto: number, tipo: PayslipTipo = "mensual"): CashFlowPayslip => ({ fechaPago, tipo, neto });

describe("statementAmountArs", () => {
  it("suma los pesos y los dólares al oficial", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, 1_400)).toBe(478_000);
  });

  it("sin cotización suma solo los pesos", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, null)).toBe(450_000);
  });

  it("un saldo a favor cuenta 0", () => {
    expect(statementAmountArs({ saldoArs: -5_000, saldoUsd: 0 }, null)).toBe(0);
  });
});

describe("toCashFlowCard", () => {
  it("ancla las cuotas al mes de vencimiento y descarta las que no tienen restantes", () => {
    const card = toCashFlowCard(statement({ closingDate: "2026-10-02", dueDate: "2026-10-13" }), [
      { amount: 30_000, installmentCurrent: 1, installmentTotal: 4 },
      { amount: 20_000, installmentCurrent: 3, installmentTotal: 3 },
      { amount: 5_000, installmentCurrent: null, installmentTotal: null },
    ]);
    expect(card).toEqual({
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      baseMonth: "2026-10",
      installments: [{ amount: 30_000, remaining: 3 }],
    });
  });

  it("sin vencimiento usa el cierre + 12 días: un cierre el 25/9 vence en octubre", () => {
    expect(toCashFlowCard(statement({ closingDate: "2026-09-25", dueDate: null }), [])?.baseMonth).toBe("2026-10");
  });

  it("sin fechas devuelve null", () => {
    expect(toCashFlowCard(statement({ closingDate: null, dueDate: null }), [])).toBeNull();
  });
});

describe("installmentFloor", () => {
  const card: CashFlowCard = {
    issuer: "visa_signature",
    cardLabel: "Visa Signature",
    baseMonth: "2026-10",
    installments: [{ amount: 30_000, remaining: 3 }, { amount: 20_000, remaining: 1 }],
  };

  it("en el mes del último resumen y antes da 0", () => {
    expect(installmentFloor(card, "2026-10")).toBe(0);
    expect(installmentFloor(card, "2026-09")).toBe(0);
  });

  it("suma las cuotas a las que todavía les quedan k meses", () => {
    expect(installmentFloor(card, "2026-11")).toBe(50_000);
    expect(installmentFloor(card, "2026-12")).toBe(30_000);
    expect(installmentFloor(card, "2027-01")).toBe(30_000);
    expect(installmentFloor(card, "2027-02")).toBe(0);
  });
});

describe("projectPlanPayment", () => {
  const plan: CashFlowPlan = {
    coupons: [
      { fecha: "2026-08-17", cuotaNro: 11, monto: 290_000 },
      { fecha: "2026-09-17", cuotaNro: 12, monto: 300_000 },
    ],
    cuotasTotales: 14,
  };

  it("repite la última cuota en los meses siguientes", () => {
    expect(projectPlanPayment(plan, "2026-10")).toBe(300_000);
    expect(projectPlanPayment(plan, "2026-11")).toBe(300_000);
  });

  it("no proyecta el mes de la última cuota ni los anteriores", () => {
    expect(projectPlanPayment(plan, "2026-09")).toBe(0);
    expect(projectPlanPayment(plan, "2026-08")).toBe(0);
  });

  it("deja de proyectar después de la última cuota del plan", () => {
    expect(projectPlanPayment(plan, "2026-12")).toBe(0);
  });

  it("sin cuotas totales proyecta siempre, y sin cupones da 0", () => {
    expect(projectPlanPayment({ ...plan, cuotasTotales: null }, "2030-01")).toBe(300_000);
    expect(projectPlanPayment({ coupons: [], cuotasTotales: null }, "2026-10")).toBe(0);
  });
});

describe("incomeByMonth", () => {
  it("agrupa los recibos por el mes de pago", () => {
    const mensual = payslip("2026-06-30", 1_000_000);
    const sac = payslip("2026-06-30", 500_000, "sac");
    const julio = payslip("2026-07-31", 1_050_000);
    const byMonth = incomeByMonth([mensual, sac, julio]);
    expect(byMonth.get("2026-06")).toEqual([mensual, sac]);
    expect(byMonth.get("2026-07")).toEqual([julio]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: FAIL — `Failed to load url ./cashFlow.js` (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

`server/src/stats/cashFlow.ts`:

```ts
import type { PayslipTipo } from "@ledgerly/shared";
import { monthOf, monthsBetween } from "./months.js";
import type { RatePoint } from "./rateOnDate.js";
import { statementDueDate } from "./statementDueDate.js";

export const HORIZONTE_MESES = 6;

export const FALTA_RECIBO = "Recibo de sueldo";
export const FALTA_SAC = "Recibo del SAC";
export const FALTA_HIPOTECA = "Cuota de la hipoteca";
export const FALTA_AUTO = "Cupón del auto";
export const FALTA_COTIZACION = "Cotización del dólar";
export const faltaResumen = (cardLabel: string): string => `Resumen ${cardLabel}`;
export const ESTIMADO_SUELDO = "Sueldo (último neto)";
export const ESTIMADO_SAC = "SAC (½ del último neto)";
export const ESTIMADO_HIPOTECA = "Hipoteca (última cuota)";
export const ESTIMADO_AUTO = "Auto (último cupón)";
export const estimadoTarjeta = (cardLabel: string): string => `${cardLabel} (solo cuotas)`;

export interface CashFlowPayslip {
  fechaPago: string;
  tipo: PayslipTipo;
  neto: number;
}

export interface CashFlowStatement {
  issuer: string;
  cardLabel: string;
  closingDate: string | null;
  dueDate: string | null;
  saldoArs: number;
  saldoUsd: number;
  uploadedAt: string;
}

export interface PendingInstallment {
  amount: number;
  remaining: number;
}

export interface CashFlowCard {
  issuer: string;
  cardLabel: string;
  baseMonth: string;
  installments: PendingInstallment[];
}

export interface CashFlowCoupon {
  fecha: string;
  cuotaNro: number;
  monto: number;
}

export interface CashFlowPlan {
  coupons: CashFlowCoupon[];
  cuotasTotales: number | null;
}

export interface InstallmentTxInput {
  amount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

export interface CashFlowInput {
  today: string;
  payslips: CashFlowPayslip[];
  statements: CashFlowStatement[];
  cards: CashFlowCard[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  usdRates: RatePoint[];
  horizon?: number;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export function statementAmountArs(
  { saldoArs, saldoUsd }: Pick<CashFlowStatement, "saldoArs" | "saldoUsd">,
  rate: number | null,
): number {
  return Math.max(0, saldoArs + saldoUsd * (rate ?? 0));
}

const remainingOf = ({ installmentCurrent, installmentTotal }: InstallmentTxInput): number =>
  installmentCurrent === null || installmentTotal === null ? 0 : installmentTotal - installmentCurrent;

export function toCashFlowCard(statement: CashFlowStatement, txs: InstallmentTxInput[]): CashFlowCard | null {
  const dueDate = statementDueDate(statement);
  if (!dueDate) return null;
  const installments = txs
    .map((tx) => ({ amount: tx.amount, remaining: remainingOf(tx) }))
    .filter((installment) => installment.remaining > 0);
  return { issuer: statement.issuer, cardLabel: statement.cardLabel, baseMonth: monthOf(dueDate), installments };
}

export function installmentFloor(card: CashFlowCard, month: string): number {
  const offset = monthsBetween(card.baseMonth, month);
  if (offset < 1) return 0;
  return sum(card.installments.filter((installment) => installment.remaining >= offset).map((installment) => installment.amount));
}

const lastCoupon = (coupons: CashFlowCoupon[]): CashFlowCoupon | null =>
  coupons.reduce<CashFlowCoupon | null>((last, coupon) => (!last || coupon.cuotaNro > last.cuotaNro ? coupon : last), null);

export function projectPlanPayment(plan: CashFlowPlan, month: string): number {
  const last = lastCoupon(plan.coupons);
  if (!last) return 0;
  const offset = monthsBetween(monthOf(last.fecha), month);
  if (offset < 1) return 0;
  if (plan.cuotasTotales !== null && last.cuotaNro + offset > plan.cuotasTotales) return 0;
  return last.monto;
}

export function incomeByMonth(payslips: CashFlowPayslip[]): Map<string, CashFlowPayslip[]> {
  const byMonth = new Map<string, CashFlowPayslip[]>();
  for (const payslip of payslips) {
    const month = monthOf(payslip.fechaPago);
    byMonth.set(month, [...(byMonth.get(month) ?? []), payslip]);
  }
  return byMonth;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git commit -m "feat(server): auxiliares del flujo de caja (saldo, cuotas pendientes y cuotas de planes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `buildCashFlow` — rango y meses cerrados

**Files:**
- Modify: `server/src/stats/cashFlow.ts`
- Test: `server/src/stats/cashFlow.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 1; `addMonths`, `monthRange` de `./months.js`; `rateOnDate` de `./rateOnDate.js`; `CashFlowDTO`, `CashFlowMonthDTO` de `@ledgerly/shared`.
- Produces: `buildCashFlow(input: CashFlowInput): CashFlowDTO`. En esta task los meses `>= mesActual` salen de `projectedMonth`, que se completa en Task 3; acá alcanza con que la historia sea correcta.

- [ ] **Step 1: Write the failing test**

Agregar a `server/src/stats/cashFlow.test.ts`. Primero, ampliar los imports:

```ts
import type { CashFlowDTO, CashFlowMonthDTO, PayslipTipo } from "@ledgerly/shared";
import {
  buildCashFlow, incomeByMonth, installmentFloor, projectPlanPayment, statementAmountArs, toCashFlowCard,
  ESTIMADO_AUTO, ESTIMADO_HIPOTECA, ESTIMADO_SAC, ESTIMADO_SUELDO, FALTA_AUTO, FALTA_COTIZACION, FALTA_HIPOTECA,
  FALTA_RECIBO, FALTA_SAC, estimadoTarjeta, faltaResumen,
  type CashFlowCard, type CashFlowInput, type CashFlowPayslip, type CashFlowPlan, type CashFlowStatement,
} from "./cashFlow.js";
```

Después, los helpers (debajo de `payslip`) y los tests:

```ts
const TODAY = "2026-10-03";
const NO_PLAN: CashFlowPlan = { coupons: [], cuotasTotales: null };

const input = (overrides: Partial<CashFlowInput> = {}): CashFlowInput => ({
  today: TODAY,
  payslips: [],
  statements: [],
  cards: [],
  mortgage: NO_PLAN,
  auto: NO_PLAN,
  usdRates: [],
  ...overrides,
});

const mesDe = (flow: CashFlowDTO, mes: string): CashFlowMonthDTO | undefined => flow.meses.find((item) => item.mes === mes);

const icbc = (overrides: Partial<CashFlowStatement> = {}): CashFlowStatement =>
  statement({ issuer: "icbc", cardLabel: "ICBC", ...overrides });

const ejemplo = (): CashFlowInput => input({
  payslips: [payslip("2026-08-31", 1_050_000), payslip("2026-09-30", 1_100_000)],
  statements: [
    statement({ closingDate: "2026-08-04", dueDate: "2026-08-14", saldoArs: 420_000 }),
    statement({ closingDate: "2026-09-03", dueDate: "2026-09-14", saldoArs: 450_000, saldoUsd: 20 }),
    statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000 }),
    icbc({ closingDate: "2026-08-27", dueDate: "2026-09-15", saldoArs: 100_000 }),
  ],
  cards: [
    {
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      baseMonth: "2026-10",
      installments: [{ amount: 30_000, remaining: 3 }, { amount: 20_000, remaining: 1 }],
    },
    { issuer: "icbc", cardLabel: "ICBC", baseMonth: "2026-09", installments: [{ amount: 10_000, remaining: 2 }] },
  ],
  mortgage: { coupons: [{ fecha: "2026-09-17", cuotaNro: 12, monto: 300_000 }], cuotasTotales: 240 },
  auto: { coupons: [{ fecha: "2026-09-10", cuotaNro: 20, monto: 150_000 }], cuotasTotales: 120 },
  usdRates: [
    { fecha: "2026-09-12", valor: 1_380 },
    { fecha: "2026-09-14", valor: 1_400 },
    { fecha: "2026-10-02", valor: 1_450 },
  ],
});

const visaMensual = (meses: string[]): CashFlowStatement[] =>
  meses.map((mes) => statement({ closingDate: `${mes}-03`, dueDate: `${mes}-14`, saldoArs: 100_000 }));

const recibosMensuales = (meses: string[]): CashFlowPayslip[] =>
  meses.map((mes) => payslip(`${mes}-28`, 1_000_000));

describe("buildCashFlow: rango", () => {
  it("sin recibos, sin resúmenes o sin resúmenes con fecha no hay flujo", () => {
    const vacio = { mesActual: "2026-10", meses: [] };
    expect(buildCashFlow(input({ statements: [statement()] }))).toEqual(vacio);
    expect(buildCashFlow(input({ payslips: [payslip("2026-09-30", 1)] }))).toEqual(vacio);
    expect(buildCashFlow(input({
      payslips: [payslip("2026-09-30", 1)],
      statements: [statement({ closingDate: null, dueDate: null })],
    }))).toEqual(vacio);
  });

  it("la historia arranca en el mayor de los dos primeros meses y termina en el mes anterior al actual", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
    }));
    expect(flow.meses.map((mes) => mes.mes)).toEqual([
      "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
    expect(flow.meses.filter((mes) => mes.mes < "2026-10").every((mes) => mes.estado === "completo" || mes.estado === "incompleto")).toBe(true);
  });
});

describe("buildCashFlow: meses cerrados", () => {
  it("arma el mes completo del ejemplo", () => {
    expect(mesDe(buildCashFlow(ejemplo()), "2026-09")).toEqual({
      mes: "2026-09",
      estado: "completo",
      ingreso: 1_100_000,
      conSac: false,
      tarjetas: 578_000,
      hipoteca: 300_000,
      auto: 150_000,
      egresos: 1_028_000,
      margen: 72_000,
      tasaAhorro: 72_000 / 1_100_000,
      faltantes: [],
      estimados: [],
    });
  });

  it("no espera una tarjeta, la hipoteca ni el auto antes de su primer mes", () => {
    expect(mesDe(buildCashFlow(ejemplo()), "2026-08")).toMatchObject({
      estado: "completo", tarjetas: 420_000, hipoteca: 0, auto: 0, margen: 630_000, faltantes: [],
    });
  });

  it("suma el recibo mensual y el SAC del mismo mes", () => {
    const flow = buildCashFlow(input({
      today: "2026-07-03",
      payslips: [payslip("2026-06-30", 1_000_000), payslip("2026-06-30", 500_000, "sac")],
      statements: visaMensual(["2026-06"]),
    }));
    expect(mesDe(flow, "2026-06")).toMatchObject({ estado: "completo", ingreso: 1_500_000, conSac: true, margen: 1_400_000 });
  });

  it("un mes sin recibo queda incompleto, sin margen ni tasa, pero con los montos conocidos", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
    }));
    expect(mesDe(flow, "2026-08")).toMatchObject({
      estado: "incompleto", ingreso: null, tarjetas: 100_000, egresos: 100_000, margen: null, tasaAhorro: null,
      faltantes: [FALTA_RECIBO],
    });
  });

  it("junio sin SAC lista el recibo del SAC", () => {
    const flow = buildCashFlow(input({
      today: "2026-07-03",
      payslips: [payslip("2026-06-30", 1_000_000)],
      statements: visaMensual(["2026-06"]),
    }));
    expect(mesDe(flow, "2026-06")).toMatchObject({ estado: "incompleto", ingreso: 1_000_000, margen: null, faltantes: [FALTA_SAC] });
  });

  it("imputa la tarjeta por el mes de vencimiento, sin vencimiento por cierre + 12 días, y sin fechas la ignora", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ closingDate: "2026-08-30", dueDate: "2026-09-09", saldoArs: 100_000 }),
        icbc({ closingDate: "2026-09-25", dueDate: null, saldoArs: 70_000 }),
        icbc({ closingDate: null, dueDate: null, saldoArs: 999_999 }),
      ],
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", tarjetas: 100_000 });
    expect(mesDe(flow, "2026-10")?.tarjetas).toBe(70_000);
  });

  it("dos resúmenes de la misma tarjeta que vencen en el mismo mes se suman", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ closingDate: "2026-08-20", dueDate: "2026-09-01", saldoArs: 100_000 }),
        statement({ closingDate: "2026-09-18", dueDate: "2026-09-30", saldoArs: 120_000 }),
      ],
    }));
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(220_000);
  });

  it("dos documentos del mismo resumen cuentan una vez: el subido último", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ saldoArs: 450_000, uploadedAt: "2026-09-05T10:00:00.000Z" }),
        statement({ saldoArs: 460_000, uploadedAt: "2026-09-20T10:00:00.000Z" }),
      ],
    }));
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(460_000);
  });

  it("pasa el saldo en dólares al oficial del vencimiento", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(450_000 + 20 * 1_400 + 100_000);
  });

  it("sin cotización suma solo los pesos y lista la cotización del dólar", () => {
    const flow = buildCashFlow({ ...ejemplo(), usdRates: [] });
    expect(mesDe(flow, "2026-09")).toMatchObject({
      estado: "incompleto", tarjetas: 550_000, margen: null, faltantes: [FALTA_COTIZACION],
    });
  });

  it("un saldo a favor cuenta 0 sin dejar el mes incompleto", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [statement({ saldoArs: -5_000 })],
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", tarjetas: 0, margen: 1_000_000 });
  });

  it("imputa hipoteca y auto por su fecha y suma dos cupones del mismo mes", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: visaMensual(["2026-09"]),
      mortgage: {
        coupons: [{ fecha: "2026-09-01", cuotaNro: 5, monto: 100_000 }, { fecha: "2026-09-28", cuotaNro: 6, monto: 110_000 }],
        cuotasTotales: 240,
      },
      auto: { coupons: [{ fecha: "2026-09-10", cuotaNro: 20, monto: 150_000 }], cuotasTotales: 120 },
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ hipoteca: 210_000, auto: 150_000, egresos: 460_000 });
  });

  it("una tarjeta que ya empezó y no tiene resumen en el mes lo lista como faltante", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: [...visaMensual(["2026-07", "2026-08", "2026-09"]), icbc({ closingDate: "2026-07-28", dueDate: "2026-08-10" })],
    }));
    expect(mesDe(flow, "2026-07")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-08")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-09")?.faltantes).toEqual([faltaResumen("ICBC")]);
  });

  it("la hipoteca y el auto que ya empezaron y no tienen cupón en el mes se listan como faltantes", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
      mortgage: { coupons: [{ fecha: "2026-08-17", cuotaNro: 1, monto: 300_000 }], cuotasTotales: 240 },
      auto: {
        coupons: [{ fecha: "2026-07-10", cuotaNro: 19, monto: 150_000 }, { fecha: "2026-09-10", cuotaNro: 21, monto: 150_000 }],
        cuotasTotales: 120,
      },
    }));
    expect(mesDe(flow, "2026-07")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-08")?.faltantes).toEqual([FALTA_AUTO]);
    expect(mesDe(flow, "2026-09")?.faltantes).toEqual([FALTA_HIPOTECA]);
  });

  it("un plan terminado deja de esperarse", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
      mortgage: { coupons: [{ fecha: "2026-07-17", cuotaNro: 24, monto: 300_000 }], cuotasTotales: 24 },
    }));
    expect(mesDe(flow, "2026-08")).toMatchObject({ estado: "completo", hipoteca: 0, faltantes: [] });
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", hipoteca: 0, faltantes: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: FAIL — `buildCashFlow is not a function` (o `does not provide an export named 'buildCashFlow'`).

- [ ] **Step 3: Write minimal implementation**

En `server/src/stats/cashFlow.ts`, cambiar los imports del encabezado:

```ts
import type { CashFlowDTO, CashFlowMonthDTO, PayslipTipo } from "@ledgerly/shared";
import { addMonths, monthOf, monthRange, monthsBetween } from "./months.js";
import { rateOnDate, type RatePoint } from "./rateOnDate.js";
import { statementDueDate } from "./statementDueDate.js";
```

Y agregar al final del archivo:

```ts
interface DatedStatement {
  statement: CashFlowStatement;
  vence: string;
  mes: string;
}

interface CardTrack {
  cardLabel: string;
  firstMonth: string;
  statements: DatedStatement[];
  card: CashFlowCard | null;
}

interface StatementTotal {
  monto: number;
  sinCotizacion: boolean;
}

interface TrackMonth {
  track: CardTrack;
  totals: StatementTotal[];
}

interface ClosedPlanMonth {
  monto: number;
  falta: boolean;
}

interface FlowContext {
  today: string;
  mesActual: string;
  usdRates: RatePoint[];
  recibosPorMes: Map<string, CashFlowPayslip[]>;
  tracks: CardTrack[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  ultimoNeto: number;
}

const NO_PLAN_MONTH: ClosedPlanMonth = { monto: 0, falta: false };

const onlyIf = (condition: boolean, text: string): string[] => (condition ? [text] : []);

const isSacMonth = (month: string): boolean => month.endsWith("-06") || month.endsWith("-12");

const earliest = (values: string[]): string => values.reduce((first, value) => (value < first ? value : first));

const later = (a: string, b: string): string => (a > b ? a : b);

const savingsRate = (margen: number | null, ingreso: number | null): number | null =>
  margen !== null && ingreso !== null && ingreso > 0 ? margen / ingreso : null;

const isMensual = (payslip: CashFlowPayslip): boolean => payslip.tipo === "mensual";

const isSac = (payslip: CashFlowPayslip): boolean => payslip.tipo === "sac";

const netos = (payslips: CashFlowPayslip[]): number => sum(payslips.map((payslip) => payslip.neto));

function dedupeStatements(statements: CashFlowStatement[]): CashFlowStatement[] {
  const byKey = new Map<string, CashFlowStatement>();
  statements.forEach((statement, index) => {
    const key = statement.closingDate ? `${statement.issuer}|${statement.closingDate}` : `sin-cierre|${index}`;
    const current = byKey.get(key);
    if (!current || statement.uploadedAt > current.uploadedAt) byKey.set(key, statement);
  });
  return [...byKey.values()];
}

function datedStatements(statements: CashFlowStatement[]): DatedStatement[] {
  return statements
    .flatMap((statement) => {
      const vence = statementDueDate(statement);
      return vence ? [{ statement, vence, mes: monthOf(vence) }] : [];
    })
    .sort((a, b) => a.vence.localeCompare(b.vence));
}

function cardTracks(statements: DatedStatement[], cards: CashFlowCard[]): CardTrack[] {
  const byIssuer = new Map<string, DatedStatement[]>();
  for (const dated of statements) {
    const issuer = dated.statement.issuer;
    byIssuer.set(issuer, [...(byIssuer.get(issuer) ?? []), dated]);
  }
  return [...byIssuer.entries()].map(([issuer, list]) => ({
    cardLabel: list[list.length - 1].statement.cardLabel,
    firstMonth: list[0].mes,
    statements: list,
    card: cards.find((card) => card.issuer === issuer) ?? null,
  }));
}

function statementTotal({ statement, vence }: DatedStatement, ctx: FlowContext): StatementTotal {
  if (statement.saldoUsd <= 0) return { monto: statementAmountArs(statement, null), sinCotizacion: false };
  const rate = rateOnDate(vence < ctx.today ? vence : ctx.today, ctx.usdRates);
  return { monto: statementAmountArs(statement, rate), sinCotizacion: rate === null };
}

const trackMonths = (ctx: FlowContext, mes: string): TrackMonth[] =>
  ctx.tracks
    .filter((track) => track.firstMonth <= mes)
    .map((track) => ({
      track,
      totals: track.statements.filter((dated) => dated.mes === mes).map((dated) => statementTotal(dated, ctx)),
    }));

const couponsIn = (plan: CashFlowPlan, mes: string): CashFlowCoupon[] =>
  plan.coupons.filter((coupon) => monthOf(coupon.fecha) === mes);

const planFinished = (plan: CashFlowPlan, last: CashFlowCoupon, mes: string): boolean =>
  plan.cuotasTotales !== null && last.cuotaNro >= plan.cuotasTotales && mes > monthOf(last.fecha);

function closedPlanMonth(plan: CashFlowPlan, mes: string): ClosedPlanMonth {
  const last = lastCoupon(plan.coupons);
  if (!last) return NO_PLAN_MONTH;
  if (mes < earliest(plan.coupons.map((coupon) => monthOf(coupon.fecha)))) return NO_PLAN_MONTH;
  const delMes = couponsIn(plan, mes);
  if (delMes.length > 0) return { monto: sum(delMes.map((coupon) => coupon.monto)), falta: false };
  return { monto: 0, falta: !planFinished(plan, last, mes) };
}

function closedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  const recibos = ctx.recibosPorMes.get(mes) ?? [];
  const conSac = recibos.some(isSac);
  const ingreso = recibos.length > 0 ? netos(recibos) : null;
  const tracks = trackMonths(ctx, mes);
  const totals = tracks.flatMap((trackMonth) => trackMonth.totals);
  const hipoteca = closedPlanMonth(ctx.mortgage, mes);
  const auto = closedPlanMonth(ctx.auto, mes);
  const faltantes = [
    ...onlyIf(!recibos.some(isMensual), FALTA_RECIBO),
    ...onlyIf(isSacMonth(mes) && !conSac, FALTA_SAC),
    ...tracks.filter((trackMonth) => trackMonth.totals.length === 0).map((trackMonth) => faltaResumen(trackMonth.track.cardLabel)),
    ...onlyIf(hipoteca.falta, FALTA_HIPOTECA),
    ...onlyIf(auto.falta, FALTA_AUTO),
    ...onlyIf(totals.some((total) => total.sinCotizacion), FALTA_COTIZACION),
  ];
  const tarjetas = sum(totals.map((total) => total.monto));
  const egresos = tarjetas + hipoteca.monto + auto.monto;
  const completo = faltantes.length === 0;
  const margen = completo && ingreso !== null ? ingreso - egresos : null;
  return {
    mes,
    estado: completo ? "completo" : "incompleto",
    ingreso,
    conSac,
    tarjetas,
    hipoteca: hipoteca.monto,
    auto: auto.monto,
    egresos,
    margen,
    tasaAhorro: savingsRate(margen, ingreso),
    faltantes,
    estimados: [],
  };
}

function projectedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  return { ...closedMonth(ctx, mes), estado: mes === ctx.mesActual ? "en_curso" : "proyectado" };
}

const latestMonthlyNet = (payslips: CashFlowPayslip[]): number =>
  payslips
    .filter(isMensual)
    .reduce<CashFlowPayslip | null>((latest, payslip) => (!latest || payslip.fechaPago > latest.fechaPago ? payslip : latest), null)
    ?.neto ?? 0;

export function buildCashFlow(input: CashFlowInput): CashFlowDTO {
  const mesActual = monthOf(input.today);
  const statements = datedStatements(dedupeStatements(input.statements));
  if (input.payslips.length === 0 || statements.length === 0) return { mesActual, meses: [] };

  const recibosPorMes = incomeByMonth(input.payslips);
  const ctx: FlowContext = {
    today: input.today,
    mesActual,
    usdRates: input.usdRates,
    recibosPorMes,
    tracks: cardTracks(statements, input.cards),
    mortgage: input.mortgage,
    auto: input.auto,
    ultimoNeto: latestMonthlyNet(input.payslips),
  };
  const desde = later(earliest([...recibosPorMes.keys()]), statements[0].mes);
  const historia = monthRange(desde, addMonths(mesActual, -1));
  const proyeccion = monthRange(mesActual, addMonths(mesActual, (input.horizon ?? HORIZONTE_MESES) - 1));
  return {
    mesActual,
    meses: [...historia.map((mes) => closedMonth(ctx, mes)), ...proyeccion.map((mes) => projectedMonth(ctx, mes))],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: PASS (todos los tests de Task 1 y Task 2).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git commit -m "feat(server): meses cerrados del flujo de caja con faltantes y saldo en USD al oficial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `buildCashFlow` — proyección

**Files:**
- Modify: `server/src/stats/cashFlow.ts` (reemplazar `projectedMonth`)
- Test: `server/src/stats/cashFlow.test.ts`

**Interfaces:**
- Consumes: `FlowContext`, `trackMonths`, `couponsIn`, `installmentFloor`, `projectPlanPayment` (Tasks 1 y 2).
- Produces: `projectedMonth(ctx, mes)` real; `buildCashFlow` completo. El contrato de `buildCashFlow` no cambia.

- [ ] **Step 1: Write the failing test**

Agregar a `server/src/stats/cashFlow.test.ts`:

```ts
describe("buildCashFlow: proyección", () => {
  const resumen = ({ mes, estado, ingreso, tarjetas, hipoteca, auto, margen }: CashFlowMonthDTO) =>
    ({ mes, estado, ingreso, tarjetas, hipoteca, auto, margen });

  it("reproduce la proyección del ejemplo", () => {
    const flow = buildCashFlow(ejemplo());
    expect(flow.meses.filter((mes) => mes.mes >= "2026-10").map(resumen)).toEqual([
      { mes: "2026-10", estado: "en_curso", ingreso: 1_100_000, tarjetas: 510_000, hipoteca: 300_000, auto: 150_000, margen: 140_000 },
      { mes: "2026-11", estado: "proyectado", ingreso: 1_100_000, tarjetas: 60_000, hipoteca: 300_000, auto: 150_000, margen: 590_000 },
      { mes: "2026-12", estado: "proyectado", ingreso: 1_650_000, tarjetas: 30_000, hipoteca: 300_000, auto: 150_000, margen: 1_170_000 },
      { mes: "2027-01", estado: "proyectado", ingreso: 1_100_000, tarjetas: 30_000, hipoteca: 300_000, auto: 150_000, margen: 620_000 },
      { mes: "2027-02", estado: "proyectado", ingreso: 1_100_000, tarjetas: 0, hipoteca: 300_000, auto: 150_000, margen: 650_000 },
      { mes: "2027-03", estado: "proyectado", ingreso: 1_100_000, tarjetas: 0, hipoteca: 300_000, auto: 150_000, margen: 650_000 },
    ]);
  });

  it("anota qué parte de cada mes es estimada", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2026-10")).toMatchObject({
      faltantes: [],
      estimados: [ESTIMADO_SUELDO, estimadoTarjeta("ICBC"), ESTIMADO_HIPOTECA, ESTIMADO_AUTO],
      tasaAhorro: 140_000 / 1_100_000,
    });
    expect(mesDe(flow, "2026-12")).toMatchObject({
      conSac: true,
      estimados: [ESTIMADO_SUELDO, ESTIMADO_SAC, estimadoTarjeta("Visa Signature"), estimadoTarjeta("ICBC"), ESTIMADO_HIPOTECA, ESTIMADO_AUTO],
    });
    expect(mesDe(flow, "2026-11")?.conSac).toBe(false);
  });

  it("una tarjeta sin cuotas pendientes se estima en 0 pero queda anotada", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2027-02")?.estimados).toContain(estimadoTarjeta("Visa Signature"));
  });

  it("usa lo real que ya está importado y lo toma como último neto", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      payslips: [...base.payslips, payslip("2026-10-31", 1_200_000)],
      mortgage: { ...base.mortgage, coupons: [...base.mortgage.coupons, { fecha: "2026-10-16", cuotaNro: 13, monto: 310_000 }] },
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ ingreso: 1_200_000, hipoteca: 310_000 });
    expect(mesDe(flow, "2026-10")?.estimados).toEqual([estimadoTarjeta("ICBC"), ESTIMADO_AUTO]);
    expect(mesDe(flow, "2026-11")).toMatchObject({ ingreso: 1_200_000, hipoteca: 310_000 });
  });

  it("un plan terminado no se proyecta", () => {
    const flow = buildCashFlow({
      ...ejemplo(),
      mortgage: { coupons: [{ fecha: "2026-09-17", cuotaNro: 24, monto: 300_000 }], cuotasTotales: 24 },
    });
    expect(mesDe(flow, "2026-10")?.hipoteca).toBe(0);
    expect(mesDe(flow, "2026-10")?.estimados).not.toContain(ESTIMADO_HIPOTECA);
  });

  it("sin cotización para un saldo en USD lista la cotización pero calcula el margen", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements.slice(0, 2), statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000, saldoUsd: 10 }), base.statements[3]],
      usdRates: [],
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ tarjetas: 510_000, margen: 140_000, faltantes: [FALTA_COTIZACION] });
  });

  it("con el vencimiento en el futuro usa la cotización de hoy", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements.slice(0, 2), statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000, saldoUsd: 10 }), base.statements[3]],
      usdRates: [...base.usdRates, { fecha: "2026-10-13", valor: 1_500 }],
    });
    expect(mesDe(flow, "2026-10")?.tarjetas).toBe(500_000 + 10 * 1_450 + 10_000);
  });

  it("una tarjeta que todavía no empezó no se proyecta", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements, statement({ issuer: "nueva", cardLabel: "Nueva", closingDate: "2026-10-30", dueDate: "2026-11-10", saldoArs: 80_000 })],
    });
    expect(mesDe(flow, "2026-10")?.estimados).not.toContain(estimadoTarjeta("Nueva"));
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(60_000 + 80_000);
    expect(mesDe(flow, "2026-12")?.estimados).toContain(estimadoTarjeta("Nueva"));
  });

  it("respeta el horizonte pedido", () => {
    const flow = buildCashFlow({ ...ejemplo(), horizon: 3 });
    expect(flow.meses.filter((mes) => mes.mes >= "2026-10").map((mes) => mes.mes)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: FAIL — en «reproduce la proyección del ejemplo» los meses proyectados todavía salen de `closedMonth` (por ejemplo `ingreso: null` en `2026-10`).

- [ ] **Step 3: Write minimal implementation**

En `server/src/stats/cashFlow.ts`, agregar debajo de `closedMonth`:

```ts
interface ProjectedPlanMonth {
  monto: number;
  estimado: boolean;
}

function projectedPlanMonth(plan: CashFlowPlan, mes: string): ProjectedPlanMonth {
  const delMes = couponsIn(plan, mes);
  if (delMes.length > 0) return { monto: sum(delMes.map((coupon) => coupon.monto)), estimado: false };
  const monto = projectPlanPayment(plan, mes);
  return { monto, estimado: monto > 0 };
}
```

Y reemplazar `projectedMonth` por:

```ts
function projectedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  const recibos = ctx.recibosPorMes.get(mes) ?? [];
  const mensuales = recibos.filter(isMensual);
  const sacs = recibos.filter(isSac);
  const sueldoEstimado = mensuales.length === 0;
  const sacEstimado = isSacMonth(mes) && sacs.length === 0;
  const sueldo = sueldoEstimado ? ctx.ultimoNeto : netos(mensuales);
  const sac = sacEstimado ? ctx.ultimoNeto / 2 : netos(sacs);
  const tracks = trackMonths(ctx, mes);
  const reales = tracks.flatMap((trackMonth) => trackMonth.totals);
  const estimadas = tracks.filter((trackMonth) => trackMonth.totals.length === 0);
  const pisos = estimadas.map(({ track }) => (track.card ? installmentFloor(track.card, mes) : 0));
  const tarjetas = sum(reales.map((total) => total.monto)) + sum(pisos);
  const hipoteca = projectedPlanMonth(ctx.mortgage, mes);
  const auto = projectedPlanMonth(ctx.auto, mes);
  const ingreso = sueldo + sac;
  const egresos = tarjetas + hipoteca.monto + auto.monto;
  const margen = ingreso - egresos;
  return {
    mes,
    estado: mes === ctx.mesActual ? "en_curso" : "proyectado",
    ingreso,
    conSac: isSacMonth(mes) || sacs.length > 0,
    tarjetas,
    hipoteca: hipoteca.monto,
    auto: auto.monto,
    egresos,
    margen,
    tasaAhorro: savingsRate(margen, ingreso),
    faltantes: onlyIf(reales.some((total) => total.sinCotizacion), FALTA_COTIZACION),
    estimados: [
      ...onlyIf(sueldoEstimado, ESTIMADO_SUELDO),
      ...onlyIf(sacEstimado, ESTIMADO_SAC),
      ...estimadas.map(({ track }) => estimadoTarjeta(track.cardLabel)),
      ...onlyIf(hipoteca.estimado, ESTIMADO_HIPOTECA),
      ...onlyIf(auto.estimado, ESTIMADO_AUTO),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/cashFlow.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git commit -m "feat(server): proyección de 6 meses del flujo de caja con lo real y lo estimado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /api/cash-flow`

**Files:**
- Modify: `server/src/http/routes/cashFlow.ts` (reemplaza el stub; mantiene `export const cashFlowRouter`)
- Test: `server/src/http/routes/cashFlow.test.ts`

**Interfaces:**
- Consumes: `buildCashFlow`, `toCashFlowCard` y los tipos de `server/src/stats/cashFlow.ts`; `latestStatementIdsPerIssuer` (`lastStatement.ts`); `computeCreditProgress` y `CouponInput` (`amortization.ts`); `AUTO_CUOTAS_TOTALES` (`autoProgress.ts`); los modelos de `db/models.ts`.
- Produces: `GET /api/cash-flow` → `CashFlowDTO` (lo consume `useCashFlow()` de la base).

- [ ] **Step 1: Write the failing test**

`server/src/http/routes/cashFlow.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { cashFlowDtoSchema, type CashFlowDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import {
  AutoCouponModel, MacroSeriesModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";

withDb();
const app = createApp();

const money = (ars: number, usd = 0) => ({ ars, usd });

const visa = (closing: string, due: string, saldo: number, usd = 0) => ({
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  last4: "0000",
  closingDate: new Date(closing),
  dueDate: new Date(due),
  totals: { totalConsumos: money(saldo, usd), saldoActual: money(saldo, usd), pagoMinimo: money(0), saldoAnterior: money(0) },
  sourceFileName: `visa-${closing}.pdf`,
  sourceHash: `visa-${closing}`,
  pageCount: 1,
  parserVersion: "1",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
});

const recibo = (periodo: string, fechaPago: string, neto: number) => ({
  periodo,
  tipo: "mensual",
  fechaPago: new Date(fechaPago),
  cuil: "20-00000000-0",
  remunerativo: neto,
  noRemunerativo: 0,
  descuentos: 0,
  brutoTotal: neto,
  neto,
  sourceFileName: `recibo-${periodo}.pdf`,
  sourceHash: `recibo-${periodo}`,
});

const seed = async () => {
  await PayslipModel.create([recibo("2026-08", "2026-08-31", 1_000_000), recibo("2026-09", "2026-09-30", 1_100_000)]);
  const statements = await StatementModel.create([
    visa("2026-07-31", "2026-08-11", 400_000),
    visa("2026-08-28", "2026-09-09", 450_000, 20),
    visa("2026-10-02", "2026-10-13", 500_000),
  ]);
  await TransactionModel.create({
    statementId: statements[2]._id, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date("2026-08-20"),
    descriptionRaw: "COMERCIO EN CUOTAS", merchant: "COMERCIO", category: "Hogar", categorySource: "rule",
    amount: 30_000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
    installmentCurrent: 2, installmentTotal: 4, comprobante: "1", fingerprint: "cuota-1",
  });
  await MacroSeriesModel.create({ serie: "usd_oficial", fecha: "2026-09-08", valor: 1_400 });
  await MortgageCouponModel.create({
    prestamoNro: "0000000001", cuotaNro: 12, fechaDebito: new Date("2026-09-17"), capital: 100_000, intereses: 200_000,
    seguroIncendio: 0, totalDebitado: 300_000, cuotaPuraUva: 300, cotizacionUva: 1_000, tea: 12.68, tna: 12, cft: 0,
    sourceFileName: "cupon-12.pdf", sourceHash: "cupon-12",
  });
  await AutoCouponModel.create({
    grupo: "1000", orden: "1", cuotaNro: 20, plan: "X", fechaEmision: new Date("2026-08-20"),
    fechaVencimiento: new Date("2026-09-10"), comprobante: "1", modelo: "AUTO DE PRUEBA", valorMovil: 20_000_000,
    conceptos: [], totalAPagar: 150_000, sourceFileName: "auto-20.pdf", sourceHash: "auto-20",
  });
};

const mesDe = (flow: CashFlowDTO, mes: string) => flow.meses.find((item) => item.mes === mes);

describe("GET /api/cash-flow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con la base vacía no hay flujo", async () => {
    const res = await request(app).get("/api/cash-flow");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mesActual: "2026-10", meses: [] });
  });

  it("arma la historia y la proyección desde los documentos importados", async () => {
    await seed();
    const res = await request(app).get("/api/cash-flow");
    expect(res.status).toBe(200);
    const flow = cashFlowDtoSchema.parse(res.body);
    expect(flow.mesActual).toBe("2026-10");
    expect(flow.meses.map((mes) => mes.mes)).toEqual([
      "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
    expect(mesDe(flow, "2026-09")).toMatchObject({
      estado: "completo", ingreso: 1_100_000, tarjetas: 478_000, hipoteca: 300_000, auto: 150_000, margen: 172_000,
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ estado: "en_curso", tarjetas: 500_000, hipoteca: 300_000, auto: 150_000 });
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(30_000);
    expect(mesDe(flow, "2026-12")?.tarjetas).toBe(30_000);
    expect(mesDe(flow, "2027-01")?.tarjetas).toBe(0);
    expect(mesDe(flow, "2026-11")?.estimados).toContain("Visa Signature (solo cuotas)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/routes/cashFlow.test.ts`
Expected: FAIL — `expected 404 to be 200` (el router stub no tiene handlers).

- [ ] **Step 3: Write minimal implementation**

`server/src/http/routes/cashFlow.ts`:

```ts
import { Router } from "express";
import type { Types } from "mongoose";
import { asyncHandler } from "../errors.js";
import {
  AutoCouponModel, MacroSeriesModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { latestStatementIdsPerIssuer, type StatementRecency } from "../../stats/lastStatement.js";
import { computeCreditProgress, type CouponInput } from "../../stats/amortization.js";
import { AUTO_CUOTAS_TOTALES } from "../../stats/autoProgress.js";
import {
  buildCashFlow, toCashFlowCard,
  type CashFlowCard, type CashFlowCoupon, type CashFlowPayslip, type CashFlowStatement, type InstallmentTxInput,
} from "../../stats/cashFlow.js";

interface MoneyPairRow {
  ars: number;
  usd: number;
}

interface StatementRow {
  _id: Types.ObjectId;
  issuer: string;
  cardLabel: string;
  closingDate?: Date | null;
  dueDate?: Date | null;
  totals?: { saldoActual?: MoneyPairRow | null } | null;
}

interface PayslipRow {
  fechaPago: Date;
  tipo: CashFlowPayslip["tipo"];
  neto: number;
}

interface InstallmentRow {
  statementId: Types.ObjectId;
  amount: number;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const isoDayOrNull = (date: Date | null | undefined): string | null => (date ? isoDay(date) : null);

const uploadedAtOf = (statement: StatementRow): Date => (statement as unknown as { uploadedAt: Date }).uploadedAt;

const toRecency = (statement: StatementRow): StatementRecency<Types.ObjectId> => ({
  id: statement._id,
  issuer: statement.issuer,
  closingDate: statement.closingDate ?? null,
  uploadedAt: uploadedAtOf(statement),
});

const toFlowStatement = (statement: StatementRow): CashFlowStatement => ({
  issuer: statement.issuer,
  cardLabel: statement.cardLabel,
  closingDate: isoDayOrNull(statement.closingDate),
  dueDate: isoDayOrNull(statement.dueDate),
  saldoArs: statement.totals?.saldoActual?.ars ?? 0,
  saldoUsd: statement.totals?.saldoActual?.usd ?? 0,
  uploadedAt: uploadedAtOf(statement).toISOString(),
});

const toFlowPayslip = ({ fechaPago, tipo, neto }: PayslipRow): CashFlowPayslip => ({ fechaPago: isoDay(fechaPago), tipo, neto });

const toFlowCoupon = (fecha: Date, cuotaNro: number, monto: number): CashFlowCoupon => ({ fecha: isoDay(fecha), cuotaNro, monto });

const toCouponInput = (coupon: CouponInput): CouponInput => ({
  prestamoNro: coupon.prestamoNro,
  cuotaNro: coupon.cuotaNro,
  capital: coupon.capital,
  intereses: coupon.intereses,
  seguroIncendio: coupon.seguroIncendio,
  totalDebitado: coupon.totalDebitado,
  cuotaPuraUva: coupon.cuotaPuraUva,
  cotizacionUva: coupon.cotizacionUva,
  tna: coupon.tna,
});

const toInstallmentTx = (tx: InstallmentRow): InstallmentTxInput => ({
  amount: tx.amount,
  installmentCurrent: tx.installmentCurrent ?? null,
  installmentTotal: tx.installmentTotal ?? null,
});

const latestCards = (statements: StatementRow[], latestIds: Types.ObjectId[], txs: InstallmentRow[]): CashFlowCard[] => {
  const latest = new Set(latestIds.map(String));
  return statements
    .filter((statement) => latest.has(String(statement._id)))
    .flatMap((statement) => {
      const own = txs.filter((tx) => String(tx.statementId) === String(statement._id)).map(toInstallmentTx);
      const card = toCashFlowCard(toFlowStatement(statement), own);
      return card ? [card] : [];
    });
};

export const cashFlowRouter = Router();

cashFlowRouter.get("/", asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [payslips, statements, mortgageCoupons, autoCoupons, usdPoints] = await Promise.all([
    PayslipModel.find().lean(),
    StatementModel.find().lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MacroSeriesModel.find({ serie: "usd_oficial" }).sort({ fecha: 1 }).lean(),
  ]);
  const latestIds = latestStatementIdsPerIssuer(statements.map(toRecency));
  const installmentTxs = await TransactionModel.find({
    statementId: { $in: latestIds }, type: "purchase", isInstallment: true, currency: "ARS",
  }).lean();
  const credit = computeCreditProgress(mortgageCoupons.map(toCouponInput));
  res.json(buildCashFlow({
    today,
    payslips: payslips.map(toFlowPayslip),
    statements: statements.map(toFlowStatement),
    cards: latestCards(statements, latestIds, installmentTxs),
    mortgage: {
      coupons: mortgageCoupons.map((coupon) => toFlowCoupon(coupon.fechaDebito, coupon.cuotaNro, coupon.totalDebitado)),
      cuotasTotales: credit?.cuotasTotales ?? null,
    },
    auto: {
      coupons: autoCoupons.map((coupon) => toFlowCoupon(coupon.fechaVencimiento, coupon.cuotaNro, coupon.totalAPagar)),
      cuotasTotales: AUTO_CUOTAS_TOTALES,
    },
    usdRates: usdPoints.map((point) => ({ fecha: point.fecha, valor: point.valor })),
  }));
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/routes/cashFlow.test.ts` y `bun run typecheck`
Expected: PASS (2 tests) y typecheck sin errores. Si el tipo de `.lean()` no encaja con las interfaces `*Row`, ajustar solo las interfaces (por ejemplo, campos opcionales) sin usar `any`.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/cashFlow.ts server/src/http/routes/cashFlow.test.ts
git commit -m "feat(server): GET /api/cash-flow arma el flujo desde recibos, resúmenes, cupones y el oficial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lógica pura del cliente

**Files:**
- Create: `client/src/cashFlow.ts`
- Test: `client/src/cashFlow.test.ts`

**Interfaces:**
- Consumes: `CashFlowEstado`, `CashFlowMonthDTO` (tipos de `@ledgerly/shared`); `BarDatum` (tipo de `@nivo/bar`); `matchesYears`, `yearsOf`, `YearSelection` (`filters/globalFilters.ts`); `formatPercent` (`format.ts`); `monthLabel` (`payslipConcepts.ts`).
- Produces:
  - `AHORRO_VENTANA_MESES = 12`, `ESTADO_LABEL: Record<CashFlowEstado, string>`
  - `interface SavingsAverage { tasa: number | null; meses: number }`, `type MonthNoteLabel = "Falta" | "Estimado"`, `interface MonthNote { label: MonthNoteLabel; text: string }`
  - `isClosedMonth`, `closedMonths`, `projectionMonths`, `closedMonthsInYears(meses, selection)`, `cashFlowYears`, `lastClosedMonth`, `lastCompleteMonth`, `averageSavingsRate(meses, ventana?)`, `savingsAverageLabel(average)`, `formatSavingsRate(tasa)`, `isNegative(value)`, `cashFlowChartRows(meses): BarDatum[]`, `detailRows(historia, proyeccion)`, `monthNotes(mes)`, `notesText(mes)`, `shortMonth(mes)`, `incompleteCaption(meses)`

- [ ] **Step 1: Write the failing test**

`client/src/cashFlow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import {
  averageSavingsRate, cashFlowChartRows, cashFlowYears, closedMonths, closedMonthsInYears, detailRows, formatSavingsRate,
  incompleteCaption, isNegative, lastClosedMonth, lastCompleteMonth, monthNotes, notesText, projectionMonths,
  savingsAverageLabel, shortMonth,
} from "./cashFlow.js";

const month = (mes: string, overrides: Partial<CashFlowMonthDTO> = {}): CashFlowMonthDTO => ({
  mes,
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
  ...overrides,
});

const incompleto = (mes: string, faltantes: string[]): CashFlowMonthDTO =>
  month(mes, { estado: "incompleto", margen: null, tasaAhorro: null, faltantes });

const proyectado = (mes: string): CashFlowMonthDTO =>
  month(mes, { estado: "proyectado", estimados: ["Sueldo (último neto)"] });

const meses = [
  month("2026-07"),
  month("2026-08"),
  incompleto("2026-09", ["Resumen ICBC"]),
  month("2026-10", { estado: "en_curso" }),
  proyectado("2026-11"),
];

describe("meses cerrados y proyectados", () => {
  it("separa los meses cerrados de la proyección, en orden ascendente", () => {
    const desordenados = [meses[4], meses[2], meses[0], meses[3], meses[1]];
    expect(closedMonths(desordenados).map((item) => item.mes)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(projectionMonths(desordenados).map((item) => item.mes)).toEqual(["2026-10", "2026-11"]);
  });

  it("el último mes completo salta los incompletos y los proyectados", () => {
    expect(lastCompleteMonth(meses)?.mes).toBe("2026-08");
    expect(lastCompleteMonth([incompleto("2026-09", ["Recibo de sueldo"]), proyectado("2026-10")])).toBeNull();
  });

  it("el último mes cerrado es el más reciente aunque esté incompleto", () => {
    expect(lastClosedMonth(meses)?.mes).toBe("2026-09");
    expect(lastClosedMonth([proyectado("2026-10")])).toBeNull();
  });

  it("filtra los meses cerrados por año y ofrece solo los años de la historia", () => {
    const conAnios = [month("2025-12"), ...meses, proyectado("2027-01")];
    expect(closedMonthsInYears(conAnios, { kind: "years", years: ["2025"] }).map((item) => item.mes)).toEqual(["2025-12"]);
    expect(closedMonthsInYears(conAnios, { kind: "all" }).map((item) => item.mes)).toEqual(["2025-12", "2026-07", "2026-08", "2026-09"]);
    expect(cashFlowYears(conAnios)).toEqual(["2025", "2026"]);
  });
});

describe("averageSavingsRate", () => {
  it("pondera por ingreso e ignora los incompletos y los proyectados", () => {
    const conSac = month("2026-06", { ingreso: 2_000_000, margen: 500_000, tasaAhorro: 0.25, conSac: true });
    expect(averageSavingsRate([conSac, ...meses])).toEqual({ tasa: 700_000 / 4_000_000, meses: 3 });
  });

  it("mira solo los últimos 12 meses cerrados", () => {
    const viejos = [month("2025-08", { margen: 900_000 }), month("2025-09", { margen: 900_000 })];
    const recientes = Array.from({ length: 12 }, (_unused, index) => month(`2026-${String(index + 1).padStart(2, "0")}`));
    expect(averageSavingsRate([...viejos, ...recientes])).toEqual({ tasa: 0.1, meses: 12 });
  });

  it("descarta los meses sin ingreso y sin meses válidos no hay promedio", () => {
    expect(averageSavingsRate([month("2026-08", { ingreso: 0, margen: -100, tasaAhorro: null })])).toEqual({ tasa: null, meses: 0 });
    expect(averageSavingsRate([incompleto("2026-09", ["Recibo de sueldo"])])).toEqual({ tasa: null, meses: 0 });
  });
});

describe("textos", () => {
  it("describe el promedio de ahorro", () => {
    expect(savingsAverageLabel({ tasa: 0.065, meses: 3 })).toBe("promedio 3 meses: 6,5%");
    expect(savingsAverageLabel({ tasa: 0.1, meses: 1 })).toBe("promedio 1 mes: 10,0%");
    expect(savingsAverageLabel({ tasa: null, meses: 0 })).toBe("sin promedio todavía");
  });

  it("formatea la tasa como porcentaje o raya", () => {
    expect(formatSavingsRate(0.065)).toBe("6,5%");
    expect(formatSavingsRate(null)).toBe("—");
  });

  it("solo un número menor que 0 es negativo", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isNegative(null)).toBe(false);
  });

  it("abrevia el mes con el año", () => {
    expect(shortMonth("2026-07")).toBe("Jul 2026");
  });

  it("pone primero lo que falta y después lo estimado", () => {
    const mes = month("2026-10", { faltantes: ["Resumen ICBC", "Cupón del auto"], estimados: ["Sueldo (último neto)"] });
    expect(monthNotes(mes)).toEqual([
      { label: "Falta", text: "Resumen ICBC, Cupón del auto" },
      { label: "Estimado", text: "Sueldo (último neto)" },
    ]);
    expect(notesText(mes)).toBe("Falta: Resumen ICBC, Cupón del auto · Estimado: Sueldo (último neto)");
    expect(monthNotes(month("2026-08"))).toEqual([]);
    expect(notesText(month("2026-08"))).toBe("");
  });

  it("explica los meses incompletos del gráfico", () => {
    const historia = [incompleto("2026-07", ["Recibo de sueldo"]), incompleto("2026-08", ["Resumen ICBC"]), month("2026-09")];
    expect(incompleteCaption(historia)).toBe(
      "Los meses incompletos se ven atenuados y sin margen: Jul 2026 (falta Recibo de sueldo), Ago 2026 (falta Resumen ICBC).",
    );
    expect(incompleteCaption([month("2026-09")])).toBeNull();
  });
});

describe("filas", () => {
  it("el gráfico omite las barras sin valor", () => {
    const rows = cashFlowChartRows([month("2026-08"), month("2026-09", { estado: "incompleto", ingreso: null, margen: null })]);
    expect(rows[0]).toEqual({ month: "2026-08", estado: "completo", Ingreso: 1_000_000, Egresos: 900_000, Margen: 100_000 });
    expect(rows[1]).toEqual({ month: "2026-09", estado: "incompleto", Egresos: 900_000 });
  });

  it("el detalle va del mes más nuevo al más viejo", () => {
    const historia = closedMonths(meses);
    const proyeccion = projectionMonths(meses);
    expect(detailRows(historia, proyeccion).map((item) => item.mes)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/cashFlow.test.ts`
Expected: FAIL — `Failed to load url ./cashFlow.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/cashFlow.ts`:

```ts
import type { BarDatum } from "@nivo/bar";
import type { CashFlowEstado, CashFlowMonthDTO } from "@ledgerly/shared";
import { formatPercent } from "./format.js";
import { matchesYears, yearsOf, type YearSelection } from "./filters/globalFilters.js";
import { monthLabel } from "./payslipConcepts.js";

export const AHORRO_VENTANA_MESES = 12;

export const ESTADO_LABEL: Record<CashFlowEstado, string> = {
  completo: "Completo",
  incompleto: "Incompleto",
  en_curso: "En curso",
  proyectado: "Proyectado",
};

export interface SavingsAverage {
  tasa: number | null;
  meses: number;
}

export type MonthNoteLabel = "Falta" | "Estimado";

export interface MonthNote {
  label: MonthNoteLabel;
  text: string;
}

const CLOSED_STATES: CashFlowEstado[] = ["completo", "incompleto"];

const byMesAsc = (a: CashFlowMonthDTO, b: CashFlowMonthDTO): number => a.mes.localeCompare(b.mes);

const byMesDesc = (a: CashFlowMonthDTO, b: CashFlowMonthDTO): number => b.mes.localeCompare(a.mes);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const isComplete = (mes: CashFlowMonthDTO): boolean => mes.estado === "completo";

const countsForAverage = (mes: CashFlowMonthDTO): boolean =>
  isComplete(mes) && mes.margen !== null && (mes.ingreso ?? 0) > 0;

export const isClosedMonth = (mes: CashFlowMonthDTO): boolean => CLOSED_STATES.includes(mes.estado);

export const closedMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[] => meses.filter(isClosedMonth).sort(byMesAsc);

export const projectionMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[] =>
  meses.filter((mes) => !isClosedMonth(mes)).sort(byMesAsc);

export const closedMonthsInYears = (meses: CashFlowMonthDTO[], selection: YearSelection): CashFlowMonthDTO[] =>
  closedMonths(meses).filter((mes) => matchesYears(mes.mes, selection));

export const cashFlowYears = (meses: CashFlowMonthDTO[]): string[] => yearsOf(closedMonths(meses).map((mes) => mes.mes));

export const lastClosedMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null => closedMonths(meses).at(-1) ?? null;

export const lastCompleteMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null =>
  closedMonths(meses).filter(isComplete).at(-1) ?? null;

export const averageSavingsRate = (meses: CashFlowMonthDTO[], ventana = AHORRO_VENTANA_MESES): SavingsAverage => {
  const validos = closedMonths(meses).slice(-ventana).filter(countsForAverage);
  if (validos.length === 0) return { tasa: null, meses: 0 };
  const margen = sum(validos.map((mes) => mes.margen ?? 0));
  const ingreso = sum(validos.map((mes) => mes.ingreso ?? 0));
  return { tasa: margen / ingreso, meses: validos.length };
};

export const savingsAverageLabel = ({ tasa, meses }: SavingsAverage): string => {
  if (tasa === null) return "sin promedio todavía";
  const unidad = meses === 1 ? "mes" : "meses";
  return `promedio ${meses} ${unidad}: ${formatPercent(tasa * 100)}`;
};

export const formatSavingsRate = (tasa: number | null): string => (tasa === null ? "—" : formatPercent(tasa * 100));

export const isNegative = (value: number | null): boolean => value !== null && value < 0;

const chartRow = ({ mes, estado, ingreso, egresos, margen }: CashFlowMonthDTO): BarDatum => {
  const row: BarDatum = { month: mes, estado, Egresos: egresos };
  if (ingreso !== null) row.Ingreso = ingreso;
  if (margen !== null) row.Margen = margen;
  return row;
};

export const cashFlowChartRows = (meses: CashFlowMonthDTO[]): BarDatum[] => meses.map(chartRow);

export const detailRows = (historia: CashFlowMonthDTO[], proyeccion: CashFlowMonthDTO[]): CashFlowMonthDTO[] =>
  [...proyeccion, ...historia].sort(byMesDesc);

const note = (label: MonthNoteLabel, items: string[]): MonthNote[] =>
  items.length > 0 ? [{ label, text: items.join(", ") }] : [];

export const monthNotes = ({ faltantes, estimados }: CashFlowMonthDTO): MonthNote[] => [
  ...note("Falta", faltantes),
  ...note("Estimado", estimados),
];

export const notesText = (mes: CashFlowMonthDTO): string =>
  monthNotes(mes).map(({ label, text }) => `${label}: ${text}`).join(" · ");

export const shortMonth = (mes: string): string => `${monthLabel(mes)} ${mes.slice(0, 4)}`;

export const incompleteCaption = (meses: CashFlowMonthDTO[]): string | null => {
  const incompletos = meses.filter((mes) => mes.estado === "incompleto");
  if (incompletos.length === 0) return null;
  const detalle = incompletos.map((mes) => `${shortMonth(mes.mes)} (falta ${mes.faltantes.join(", ")})`).join(", ");
  return `Los meses incompletos se ven atenuados y sin margen: ${detalle}.`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/cashFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/cashFlow.ts client/src/cashFlow.test.ts
git commit -m "feat(client): lógica pura del flujo de caja (KPIs, promedio de ahorro, filas y notas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gráfico `CashFlowChart`

**Files:**
- Create: `client/src/components/charts/CashFlowChart.tsx`
- Test: `client/src/components/charts/cashFlowChart.test.tsx`

**Interfaces:**
- Consumes: `cashFlowChartRows` (Task 5); `seriesColor` (`palette.ts`); `nivoTheme`; `ChartLegend`, `ChartLegendItem`; `useChartLayout`; `compactBarTooltip`; `formatMoney`, `formatMoneyCompact`; `monthLabel`.
- Produces:
  - `CashFlowChart({ meses, monthOnly }: { meses: CashFlowMonthDTO[]; monthOnly?: boolean })`
  - `interface CashFlowColors { ingreso: string; egresos: string; positivo: string; negativo: string }`
  - `interface CashFlowBar { id: string | number; value: number | null; data: BarDatum }`
  - `cashFlowBarColor(colors: CashFlowColors): (bar: CashFlowBar) => string`

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/cashFlowChart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { CashFlowChart, cashFlowBarColor } from "./CashFlowChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const mes = (index: number): CashFlowMonthDTO => ({
  mes: periodo(index),
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
});

const meses = (count: number): CashFlowMonthDTO[] => Array.from({ length: count }, (_unused, index) => mes(index));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("CashFlowChart", () => {
  it("sin meses muestra Sin datos", () => {
    renderWithProviders(<CashFlowChart meses={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });

  it("en mobile usa el tooltip compacto", () => {
    emulateMobile();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    expect(chart().customTooltip).toBe("yes");
  });

  it("en compu deja que nivo elija las etiquetas", () => {
    emulateDesktop();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, customTooltip: "no", margin: { top: 16, right: 24, bottom: 64, left: 64 } });
  });

  it("usa su propia leyenda y no la de nivo", () => {
    emulateDesktop();
    renderWithProviders(<CashFlowChart meses={meses(3)} />);
    expect(chart().legends).toBe(0);
    const items = within(screen.getByRole("list", { name: "referencias" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Ingreso", "Egresos", "Margen"]);
  });
});

describe("cashFlowBarColor", () => {
  const color = cashFlowBarColor({ ingreso: "#0891b2", egresos: "#d97706", positivo: "#16a34a", negativo: "#dc2626" });

  it("pinta cada serie con su color y el margen según el signo", () => {
    expect(color({ id: "Ingreso", value: 1, data: { estado: "completo" } })).toBe("#0891b2");
    expect(color({ id: "Egresos", value: 1, data: { estado: "completo" } })).toBe("#d97706");
    expect(color({ id: "Margen", value: 10, data: { estado: "completo" } })).toBe("#16a34a");
    expect(color({ id: "Margen", value: -10, data: { estado: "proyectado" } })).toBe("#dc2626");
  });

  it("atenúa las barras de los meses incompletos", () => {
    expect(color({ id: "Egresos", value: 1, data: { estado: "incompleto" } })).toBe("rgba(217, 119, 6, 0.35)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/cashFlowChart.test.tsx`
Expected: FAIL — `Failed to load url ./CashFlowChart.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/charts/CashFlowChart.tsx`:

```tsx
import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { monthLabel } from "../../payslipConcepts.js";
import { cashFlowChartRows } from "../../cashFlow.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";
import { compactBarTooltip } from "./ChartTooltip.js";

const KEYS = ["Ingreso", "Egresos", "Margen"];
const DIMMED_ALPHA = 0.35;

export interface CashFlowColors {
  ingreso: string;
  egresos: string;
  positivo: string;
  negativo: string;
}

export interface CashFlowBar {
  id: string | number;
  value: number | null;
  data: BarDatum;
}

interface CashFlowChartProps {
  meses: CashFlowMonthDTO[];
  monthOnly?: boolean;
}

const MobileBarTooltip = compactBarTooltip({ showKey: true });

export const cashFlowBarColor = ({ ingreso, egresos, positivo, negativo }: CashFlowColors) => {
  const seriesColors: Record<string, string> = { Ingreso: ingreso, Egresos: egresos };
  return ({ id, value, data }: CashFlowBar): string => {
    const marginColor = (value ?? 0) < 0 ? negativo : positivo;
    const base = seriesColors[String(id)] ?? marginColor;
    return data.estado === "incompleto" ? alpha(base, DIMMED_ALPHA) : base;
  };
};

export const CashFlowChart = ({ meses, monthOnly = false }: CashFlowChartProps) => {
  const theme = useTheme();
  const { isMobile, seriesMargin, bottomTicks } = useChartLayout();

  if (meses.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = cashFlowChartRows(meses);
  const colors: CashFlowColors = {
    ingreso: seriesColor(theme.palette.mode, 0),
    egresos: seriesColor(theme.palette.mode, 3),
    positivo: theme.palette.success.main,
    negativo: theme.palette.error.main,
  };
  const legendItems: ChartLegendItem[] = [
    { id: "Ingreso", label: "Ingreso", color: colors.ingreso },
    { id: "Egresos", label: "Egresos", color: colors.egresos },
    { id: "Margen", label: "Margen", color: colors.positivo },
  ];
  const axisBottom = {
    tickSize: 0,
    tickPadding: 10,
    tickRotation: monthOnly ? 0 : -45,
    format: monthOnly ? (value: string | number) => monthLabel(String(value)) : undefined,
    tickValues: bottomTicks(rows.map((row) => String(row.month))),
  };

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveBar
          data={rows}
          theme={nivoTheme(theme)}
          keys={KEYS}
          indexBy="month"
          groupMode="grouped"
          colors={cashFlowBarColor(colors)}
          valueScale={{ type: "linear", min: "auto", max: "auto" }}
          margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 64 })}
          padding={0.3}
          innerPadding={2}
          borderRadius={4}
          enableLabel={false}
          enableGridX={false}
          valueFormat={(value) => formatMoney(value, "ARS")}
          axisBottom={axisBottom}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
          markers={[{
            axis: "y",
            value: 0,
            lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1 },
          }]}
          {...(isMobile ? { tooltip: MobileBarTooltip } : {})}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/charts/cashFlowChart.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/CashFlowChart.tsx client/src/components/charts/cashFlowChart.test.tsx
git commit -m "feat(client): gráfico de ingreso, egresos y margen por mes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Detalle mes a mes (chip, tabla y tarjetas)

**Files:**
- Create: `client/src/components/CashFlowStatusChip.tsx`
- Create: `client/src/components/CashFlowTable.tsx`
- Create: `client/src/components/CashFlowCards.tsx`
- Test: `client/src/components/CashFlowDetail.test.tsx`

**Interfaces:**
- Consumes: `ESTADO_LABEL`, `formatSavingsRate`, `isNegative`, `monthNotes`, `notesText` (Task 5); `formatMoneyOrDash`, `formatMonthLabel` (`format.ts`); `RecordCard`, `recordListSx`, `RecordField` (`RecordCard.tsx`); `MotionTableBody`, `MotionTableRow`, `fadeUpItem`, `staggerContainer`.
- Produces: `CashFlowStatusChip({ estado })`, `CashFlowTable({ meses })`, `CashFlowCards({ meses })`.

- [ ] **Step 1: Write the failing test**

`client/src/components/CashFlowDetail.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { cssFor } from "../testing/cssFor.js";
import { formatMoney } from "../format.js";
import { CashFlowTable } from "./CashFlowTable.js";
import { CashFlowCards } from "./CashFlowCards.js";

afterEach(() => {
  cleanup();
});

const money = (value: number): string => formatMoney(value, "ARS").replace(/\s/g, " ");

const completo: CashFlowMonthDTO = {
  mes: "2026-08",
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
};

const incompleto: CashFlowMonthDTO = {
  ...completo, mes: "2026-09", estado: "incompleto", margen: null, tasaAhorro: null, faltantes: ["Resumen ICBC"],
};

const negativo: CashFlowMonthDTO = {
  ...completo, mes: "2026-10", estado: "en_curso", egresos: 1_200_000, margen: -200_000, tasaAhorro: -0.2,
  estimados: ["Sueldo (último neto)"],
};

const conSac: CashFlowMonthDTO = {
  ...completo, mes: "2026-12", estado: "proyectado", ingreso: 1_500_000, conSac: true, margen: 600_000, tasaAhorro: 0.4,
  estimados: ["Sueldo (último neto)", "SAC (½ del último neto)"],
};

const meses = [conSac, negativo, incompleto, completo];

describe("CashFlowTable", () => {
  it("muestra una fila por mes con su estado, montos y notas", () => {
    renderWithProviders(<CashFlowTable meses={meses} />);
    const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    const septiembre = within(table).getByRole("row", { name: /Septiembre de 2026/ });
    expect(within(septiembre).getByText("Incompleto")).toBeInTheDocument();
    expect(within(septiembre).getAllByText("—")).toHaveLength(2);
    expect(within(septiembre).getByText("Falta: Resumen ICBC")).toBeInTheDocument();
    const agosto = within(table).getByRole("row", { name: /Agosto de 2026/ });
    expect(within(agosto).getByText("Completo")).toBeInTheDocument();
    expect(within(agosto).getByText("10,0%")).toBeInTheDocument();
  });

  it("pinta el margen negativo en rojo y marca el SAC", () => {
    renderWithProviders(<CashFlowTable meses={meses} />);
    const octubre = screen.getByRole("row", { name: /Octubre de 2026/ });
    expect(cssFor(within(octubre).getByText(money(-200_000)))).toMatch(/color:#(f87171|dc2626)/);
    const diciembre = screen.getByRole("row", { name: /Diciembre de 2026/ });
    expect(within(diciembre).getByText("SAC")).toBeInTheDocument();
    expect(within(diciembre).getByText("Proyectado")).toBeInTheDocument();
  });

  it("sin meses no muestra la tabla", () => {
    renderWithProviders(<CashFlowTable meses={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CashFlowCards", () => {
  it("muestra una tarjeta por mes con el margen y el ahorro", () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    const septiembre = screen.getByRole("article", { name: "Septiembre de 2026" });
    expect(within(septiembre).getByText("Incompleto")).toBeInTheDocument();
    expect(within(septiembre).getByText("Margen")).toBeInTheDocument();
    expect(within(septiembre).getByText("Ahorro")).toBeInTheDocument();
    expect(within(septiembre).getAllByText("—")).toHaveLength(2);
  });

  it("en el detalle muestra los montos y las notas", async () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    const septiembre = screen.getByRole("article", { name: "Septiembre de 2026" });
    await userEvent.click(within(septiembre).getByRole("button", { name: "Ver detalle" }));
    expect(within(septiembre).getByText("Tarjetas")).toBeInTheDocument();
    expect(within(septiembre).getByText("Falta")).toBeInTheDocument();
    expect(within(septiembre).getByText("Resumen ICBC")).toBeInTheDocument();

    const diciembre = screen.getByRole("article", { name: "Diciembre de 2026" });
    await userEvent.click(within(diciembre).getByRole("button", { name: "Ver detalle" }));
    expect(within(diciembre).getByText(`${money(1_500_000)} · con SAC`)).toBeInTheDocument();
    expect(within(diciembre).getByText("Estimado")).toBeInTheDocument();
    expect(within(diciembre).getByText("Sueldo (último neto), SAC (½ del último neto)")).toBeInTheDocument();
  });

  it("pinta el margen negativo en rojo", () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    const octubre = screen.getByRole("article", { name: "Octubre de 2026" });
    expect(cssFor(within(octubre).getByText(money(-200_000)))).toMatch(/color:#(f87171|dc2626)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/CashFlowDetail.test.tsx`
Expected: FAIL — `Failed to load url ./CashFlowTable.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/CashFlowStatusChip.tsx`:

```tsx
import { Chip, type ChipProps } from "@mui/material";
import type { CashFlowEstado } from "@ledgerly/shared";
import { ESTADO_LABEL } from "../cashFlow.js";

interface CashFlowStatusChipProps {
  estado: CashFlowEstado;
}

const ESTADO_COLOR: Record<CashFlowEstado, ChipProps["color"]> = {
  completo: "success",
  incompleto: "warning",
  en_curso: "info",
  proyectado: "default",
};

export const CashFlowStatusChip = ({ estado }: CashFlowStatusChipProps) => (
  <Chip label={ESTADO_LABEL[estado]} size="small" variant="outlined" color={ESTADO_COLOR[estado]} />
);
```

`client/src/components/CashFlowTable.tsx`:

```tsx
import { Chip, Table, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoneyOrDash, formatMonthLabel } from "../format.js";
import { formatSavingsRate, isNegative, notesText } from "../cashFlow.js";
import { CashFlowStatusChip } from "./CashFlowStatusChip.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface CashFlowTableProps {
  meses: CashFlowMonthDTO[];
}

interface CashFlowTableRowProps {
  mes: CashFlowMonthDTO;
}

const AMOUNT_HEADERS = ["Ingreso", "Tarjetas", "Hipoteca", "Auto", "Egresos", "Margen", "Ahorro"];
const NO_WRAP = { whiteSpace: "nowrap" } as const;

const money = (value: number | null): string => formatMoneyOrDash(value, "ARS");

const CashFlowTableRow = ({ mes }: CashFlowTableRowProps) => {
  const margenColor = isNegative(mes.margen) ? "error.main" : undefined;
  const sacChip = mes.conSac ? <Chip label="SAC" size="small" color="secondary" variant="outlined" sx={{ ml: 1 }} /> : null;

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell sx={NO_WRAP}>{formatMonthLabel(mes.mes)}</TableCell>
      <TableCell><CashFlowStatusChip estado={mes.estado} /></TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.ingreso)}{sacChip}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.tarjetas)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.hipoteca)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.auto)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.egresos)}</TableCell>
      <TableCell align="right" sx={{ ...NO_WRAP, color: margenColor }}>{money(mes.margen)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{formatSavingsRate(mes.tasaAhorro)}</TableCell>
      <TableCell sx={{ minWidth: 220 }}>{notesText(mes)}</TableCell>
    </MotionTableRow>
  );
};

export const CashFlowTable = ({ meses }: CashFlowTableProps) => {
  if (meses.length === 0) return null;

  const amountHeaders = AMOUNT_HEADERS.map((header) => <TableCell key={header} align="right">{header}</TableCell>);
  const rows = meses.map((mes) => <CashFlowTableRow key={mes.mes} mes={mes} />);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Detalle del flujo de caja">
        <TableHead>
          <TableRow>
            <TableCell>Mes</TableCell>
            <TableCell>Estado</TableCell>
            {amountHeaders}
            <TableCell>Notas</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
```

`client/src/components/CashFlowCards.tsx`:

```tsx
import { Box, Typography } from "@mui/material";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoneyOrDash, formatMonthLabel } from "../format.js";
import { formatSavingsRate, isNegative, monthNotes } from "../cashFlow.js";
import { CashFlowStatusChip } from "./CashFlowStatusChip.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";

interface CashFlowCardsProps {
  meses: CashFlowMonthDTO[];
}

interface MarginValueProps {
  margen: number | null;
}

const money = (value: number | null): string => formatMoneyOrDash(value, "ARS");

const MarginValue = ({ margen }: MarginValueProps) => {
  const color = isNegative(margen) ? "error.main" : "inherit";
  return <Typography component="span" variant="inherit" sx={{ color }}>{money(margen)}</Typography>;
};

const ingresoText = ({ ingreso, conSac }: CashFlowMonthDTO): string =>
  conSac ? `${money(ingreso)} · con SAC` : money(ingreso);

const highlightsOf = (mes: CashFlowMonthDTO): RecordField[] => [
  { label: "Margen", value: <MarginValue margen={mes.margen} /> },
  { label: "Ahorro", value: formatSavingsRate(mes.tasaAhorro) },
];

const detailsOf = (mes: CashFlowMonthDTO): RecordField[] => [
  { label: "Ingreso", value: ingresoText(mes) },
  { label: "Tarjetas", value: money(mes.tarjetas) },
  { label: "Hipoteca", value: money(mes.hipoteca) },
  { label: "Auto", value: money(mes.auto) },
  { label: "Egresos", value: money(mes.egresos) },
  ...monthNotes(mes).map(({ label, text }) => ({ label, value: text })),
];

export const CashFlowCards = ({ meses }: CashFlowCardsProps) => {
  if (meses.length === 0) return null;

  const cards = meses.map((mes) => (
    <RecordCard
      key={mes.mes}
      title={formatMonthLabel(mes.mes)}
      badge={<CashFlowStatusChip estado={mes.estado} />}
      highlights={highlightsOf(mes)}
      details={detailsOf(mes)}
    />
  ));

  return <Box sx={recordListSx}>{cards}</Box>;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/CashFlowDetail.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CashFlowStatusChip.tsx client/src/components/CashFlowTable.tsx client/src/components/CashFlowCards.tsx client/src/components/CashFlowDetail.test.tsx
git commit -m "feat(client): detalle mes a mes del flujo de caja en tabla y tarjetas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: KPIs y página `CashFlowPage`

**Files:**
- Create: `client/src/components/CashFlowKpiCards.tsx`
- Modify: `client/src/pages/CashFlowPage.tsx` (reemplaza el stub; mantiene `export const CashFlowPage`)
- Test: `client/src/pages/CashFlowPage.test.tsx`

**Interfaces:**
- Consumes: `useCashFlow()` (base); `useGlobalFilters()`; `useIsMobile()`; `FiltersBar`; `ChartCard`; `MotionBox`, `staggerContainer`; `Kpi`, `KpiColor`, `KpiGrid`; `CashFlowChart` (Task 6); `CashFlowTable`, `CashFlowCards` (Task 7); `averageSavingsRate`, `cashFlowYears`, `closedMonthsInYears`, `detailRows`, `incompleteCaption`, `lastClosedMonth`, `lastCompleteMonth`, `projectionMonths`, `savingsAverageLabel` (Task 5).
- Produces: `CashFlowKpiCards({ meses })` y la página final.

- [ ] **Step 1: Write the failing test**

`client/src/pages/CashFlowPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashFlowDTO, CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { CashFlowPage } from "./CashFlowPage.js";

const base: CashFlowMonthDTO = {
  mes: "2026-08",
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
};

const dto: CashFlowDTO = {
  mesActual: "2026-10",
  meses: [
    { ...base, mes: "2025-12", conSac: true, ingreso: 1_500_000, margen: 600_000, tasaAhorro: 0.4 },
    base,
    { ...base, mes: "2026-09", estado: "incompleto", margen: null, tasaAhorro: null, faltantes: ["Resumen ICBC"] },
    { ...base, mes: "2026-10", estado: "en_curso", estimados: ["Sueldo (último neto)"] },
    { ...base, mes: "2026-11", estado: "proyectado", estimados: ["Sueldo (último neto)", "Visa Signature (solo cuotas)"] },
  ],
};

const stubFetch = (body: unknown, status = 200) => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00"));
  stubFetch(dto);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CashFlowPage", () => {
  it("muestra el último mes completo y avisa del mes cerrado que sigue incompleto", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("Último mes completo: Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Septiembre de 2026 todavía está incompleto: falta Resumen ICBC.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Flujo de caja" })).toBeInTheDocument();
  });

  it("muestra los KPIs, los dos gráficos y la proyección en el detalle", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("Egresos conocidos")).toBeInTheDocument();
    expect(screen.getByText("neto de recibos")).toBeInTheDocument();
    expect(screen.getByText("Margen libre")).toBeInTheDocument();
    expect(screen.getByText("Tasa de ahorro")).toBeInTheDocument();
    expect(screen.getByText("promedio 2 meses: 28,0%")).toBeInTheDocument();
    expect(screen.getByText("Ingreso, egresos y margen por mes")).toBeInTheDocument();
    expect(screen.getByText("Próximos 2 meses (estimado)")).toBeInTheDocument();
    expect(screen.getByText(/Los meses incompletos se ven atenuados y sin margen: Sep 2026/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getByText("Proyectado")).toBeInTheDocument();
    expect(within(table).getByText("En curso")).toBeInTheDocument();
  });

  it("sin meses invita a importar", async () => {
    stubFetch({ mesActual: "2026-10", meses: [] });
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText(/importá tus recibos de sueldo y al menos un resumen de tarjeta/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("si el server falla lo avisa", async () => {
    stubFetch({ error: "boom" }, 500);
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("No se pudo calcular el flujo de caja. Probá de nuevo en un rato.")).toBeInTheDocument();
  });

  it("ofrece el filtro de Año con los años de los meses cerrados", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
  });

  it("el año filtra solo la historia: la proyección y los KPIs siguen", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=2025" });
    const table = await screen.findByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getByText("Diciembre de 2025")).toBeInTheDocument();
    expect(within(table).getByText("Octubre de 2026")).toBeInTheDocument();
    expect(within(table).getByText("Noviembre de 2026")).toBeInTheDocument();
    expect(within(table).queryByText("Agosto de 2026")).not.toBeInTheDocument();
    expect(within(table).queryByText("Septiembre de 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Último mes completo: Agosto de 2026")).toBeInTheDocument();
  });

  it("con un año sin meses cerrados el gráfico de historia queda vacío y el detalle muestra la proyección", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=2019" });
    const table = await screen.findByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByText(/Los meses incompletos/)).not.toBeInTheDocument();
    expect(screen.getByText("Egresos conocidos")).toBeInTheDocument();
  });

  it("en mobile muestra el detalle como tarjetas, sin tabla", async () => {
    emulateMobile();
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
    expect(screen.getByRole("article", { name: "Noviembre de 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pages/CashFlowPage.test.tsx`
Expected: FAIL — el stub solo muestra el título (`Unable to find an element with the text: Último mes completo: Agosto de 2026`).

- [ ] **Step 3: Write minimal implementation**

`client/src/components/CashFlowKpiCards.tsx`:

```tsx
import { Box, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SavingsIcon from "@mui/icons-material/Savings";
import PercentIcon from "@mui/icons-material/Percent";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel, formatPercent } from "../format.js";
import { averageSavingsRate, lastClosedMonth, lastCompleteMonth, savingsAverageLabel } from "../cashFlow.js";
import { KpiGrid } from "./KpiGrid.js";
import { Kpi, type KpiColor } from "./Kpi.js";

interface CashFlowKpiCardsProps {
  meses: CashFlowMonthDTO[];
}

const money = (value: number): string => formatMoney(value, "ARS");

const faltantesDe = (mes: CashFlowMonthDTO): string => mes.faltantes.join(", ");

export const CashFlowKpiCards = ({ meses }: CashFlowKpiCardsProps) => {
  const completo = lastCompleteMonth(meses);
  const cerrado = lastClosedMonth(meses);

  if (!completo) {
    const pendiente = cerrado ? ` En ${formatMonthLabel(cerrado.mes)} falta: ${faltantesDe(cerrado)}.` : "";
    return (
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {`Todavía no hay un mes cerrado completo.${pendiente}`}
      </Typography>
    );
  }

  const posterior = cerrado && cerrado.mes !== completo.mes ? cerrado : null;
  const aviso = posterior ? `${formatMonthLabel(posterior.mes)} todavía está incompleto: falta ${faltantesDe(posterior)}.` : null;
  const margen = completo.margen ?? 0;
  const margenColor: KpiColor = margen >= 0 ? "success" : "error";
  const ingresoSub = completo.conSac ? "neto, con SAC" : "neto de recibos";
  const promedio = savingsAverageLabel(averageSavingsRate(meses));

  return (
    <>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {`Último mes completo: ${formatMonthLabel(completo.mes)}`}
      </Typography>
      {aviso && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {aviso}
        </Typography>
      )}
      <Box sx={{ mt: 1.5 }}>
        <KpiGrid>
          <Kpi label="Ingreso" value={completo.ingreso ?? 0} format={money} sub={ingresoSub} icon={<PaymentsIcon />} color="primary" />
          <Kpi label="Egresos conocidos" value={completo.egresos} format={money} sub="tarjetas, hipoteca y auto" icon={<ReceiptLongIcon />} color="warning" />
          <Kpi label="Margen libre" value={margen} format={money} sub="lo que quedó del mes" icon={<SavingsIcon />} color={margenColor} />
          <Kpi label="Tasa de ahorro" value={(completo.tasaAhorro ?? 0) * 100} format={formatPercent} sub={promedio} icon={<PercentIcon />} color="secondary" />
        </KpiGrid>
      </Box>
    </>
  );
};
```

`client/src/pages/CashFlowPage.tsx`:

```tsx
import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useCashFlow } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { CashFlowKpiCards } from "../components/CashFlowKpiCards.js";
import { CashFlowTable } from "../components/CashFlowTable.js";
import { CashFlowCards } from "../components/CashFlowCards.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { CashFlowChart } from "../components/charts/CashFlowChart.js";
import { cashFlowYears, closedMonthsInYears, detailRows, incompleteCaption, projectionMonths } from "../cashFlow.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useIsMobile } from "../useIsMobile.js";

interface ChartCaptionProps {
  text: string;
}

const CASH_FLOW_FIELDS: FilterField[] = ["year"];
const ERROR_TEXT = "No se pudo calcular el flujo de caja. Probá de nuevo en un rato.";
const EMPTY_TEXT = "Para ver el flujo de caja importá tus recibos de sueldo y al menos un resumen de tarjeta desde la página Importar.";
const PROJECTION_CAPTION =
  "Sueldo con el último neto (y la mitad en junio y diciembre por el SAC), hipoteca y auto con la última cuota, y tarjetas con los resúmenes ya emitidos y, después, solo las cuotas que ya compraste. El margen es lo que te queda para consumos nuevos y gastos fuera de la tarjeta.";

const Header = () => (
  <>
    <Typography variant="h4" sx={{ mb: 0.5 }}>Flujo de caja</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca y auto.
    </Typography>
  </>
);

const ChartCaption = ({ text }: ChartCaptionProps) => (
  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
    {text}
  </Typography>
);

export const CashFlowPage = () => {
  const { data, isLoading, isError } = useCashFlow();
  const { yearSelection } = useGlobalFilters();
  const isMobile = useIsMobile();
  const meses = useMemo(() => data?.meses ?? [], [data]);
  const historia = useMemo(() => closedMonthsInYears(meses, yearSelection), [meses, yearSelection]);
  const proyeccion = useMemo(() => projectionMonths(meses), [meses]);
  const detalle = useMemo(() => detailRows(historia, proyeccion), [historia, proyeccion]);
  const yearOptions = useMemo(() => cashFlowYears(meses), [meses]);
  const monthOnly = yearSelection.kind === "years" && yearSelection.years.length === 1;

  if (isLoading) {
    return (
      <>
        <Header />
        <CircularProgress />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{ERROR_TEXT}</Typography>
      </>
    );
  }

  if (meses.length === 0) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{EMPTY_TEXT}</Typography>
      </>
    );
  }

  const historiaCaption = incompleteCaption(historia);
  const detail = isMobile ? <CashFlowCards meses={detalle} /> : <CashFlowTable meses={detalle} />;

  return (
    <>
      <Header />
      <FiltersBar fields={CASH_FLOW_FIELDS} yearOptions={yearOptions} />
      <CashFlowKpiCards meses={meses} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Ingreso, egresos y margen por mes">
          <CashFlowChart meses={historia} monthOnly={monthOnly} />
          {historiaCaption && <ChartCaption text={historiaCaption} />}
        </ChartCard>
        <ChartCard title={`Próximos ${proyeccion.length} meses (estimado)`}>
          <CashFlowChart meses={proyeccion} />
          <ChartCaption text={PROJECTION_CAPTION} />
        </ChartCard>
      </MotionBox>
      <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
      {detail}
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/pages/CashFlowPage.test.tsx client/src/App.test.tsx`
Expected: PASS (8 tests de la página; `App.test.tsx` sigue encontrando el `h4` «Flujo de caja» mientras carga).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CashFlowKpiCards.tsx client/src/pages/CashFlowPage.tsx client/src/pages/CashFlowPage.test.tsx
git commit -m "feat(client): página Flujo con KPIs del último mes completo, gráficos y proyección

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final

**Files:** ninguno (solo verificación). Si algo falla, se arregla en la task dueña del archivo y se commitea con su pathspec.

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: `Test Files … passed`, `Tests … passed`, sin fallos.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: `vite build` termina sin errores.

- [ ] **Step 4: Revisar el diff contra la base**

Run: `git diff --stat feat/base-nuevas-features...HEAD`
Expected: solo los archivos de este plan (spec, plan, `server/src/stats/cashFlow*`, `server/src/http/routes/cashFlow*`, `client/src/cashFlow*`, `client/src/components/CashFlow*`, `client/src/components/charts/CashFlowChart.tsx`, `client/src/components/charts/cashFlowChart.test.tsx`, `client/src/pages/CashFlowPage*`). Ningún archivo de la lista «no se tocan».
