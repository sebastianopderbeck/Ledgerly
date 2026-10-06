# Suscripciones y cobros recurrentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el stub de `/suscripciones` por una página que detecta sola los cobros mensuales de las tarjetas, muestra cuánto cuestan hoy (en su moneda y en pesos al oficial), si subieron, si dejaron de cobrarse, y deja ocultar los que no son suscripciones.

**Architecture:** El server calcula todo con una función pura (`server/src/stats/subscriptions.ts`): agrupa los consumos por clave de comercio (`merchantKey.ts` de la base), anula devoluciones, arma rachas por mes calendario, valida montos parecidos, mide aumentos y decide el estado contra el último cierre de cada tarjeta. `GET /api/subscriptions` junta movimientos, cierres, ocultas y la cotización oficial de hoy, y `PUT`/`DELETE /hidden/:key` guardan las ocultas en Mongo. El cliente solo separa secciones y arma textos (`client/src/subscriptions.ts`), y pinta KPIs, tabla en compu y tarjetas en mobile.

**Tech Stack:** TypeScript, Express 4 + Mongoose (server), React 18 + MUI 6 + React Query 5 + react-router 6 (client), Zod DTOs en `shared`, Vitest + supertest + `mongodb-memory-server` + Testing Library, bun.

**Spec:** `docs/superpowers/specs/2026-10-03-suscripciones-design.md`

## Global Constraints

- **Rama:** `feat/suscripciones`, creada desde `feat/base-nuevas-features`. Nunca push, nunca PR, nunca tocar `main`.
- **No tocar** (son de la base): `shared/*`, `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/stats/{merchantKey,months,lastStatement,rateOnDate}.ts` y sus tests, `client/src/App.tsx`, `client/src/App.test.tsx`, `client/src/api/hooks.ts`, `client/src/components/layout/*`, `client/src/filters/*`, `client/src/format.ts`, los `package.json`, `bun.lock`, `.env.example`, `README.md`.
- **Umbrales** (constantes exportadas arriba de `subscriptions.ts`): `MIN_COBROS = 3`, `VARIACION_PARECIDA = 0.25`, `MISMO_MONTO = 0.01`, `UMBRAL_AUMENTO = 0.05`, `VENTANA_AUMENTO_MESES = 12`, `GRACIA_DIAS = 7`, `VENTANA_CORTADAS_MESES = 12`, `DIAS_ANULACION = 15`, `TOLERANCIA_ANULACION = 0.01`.
- **Fechas:** `YYYY-MM-DD` y meses `YYYY-MM`, con `addMonthsClamped`, `addMonths`, `addDays`, `daysBetween` y `monthOf` de `server/src/stats/months.ts` (no redefinirlas).
- **Montos en pesos al centavo:** `montoMensualArs` y los tres totales se redondean a 2 decimales.
- **Link a Movimientos:** `/transactions?year=all&search=<busqueda>` (orden fijo de la base).
- **Sin comentarios en el código.** Componentes funcionales con destructuring en la firma, fragments cortos, early returns para carga/error/vacío, `key` con id único (la clave del comercio), lógica condicional antes del `return`, `useMemo`/`useCallback` donde se pasan handlers. `any` prohibido.
- **Tests del cliente:** el auto-cleanup de RTL está apagado: todo archivo con varios renders lleva `afterEach(cleanup)`.
- **Fixtures sintéticos** (comercios inventados con la forma real). Nunca commitear `examples/`.
- **Correr tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`.
- **Commits:** uno por tarea, con pathspec explícito, mensaje convencional en español terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Compra suelta parecida en el mismo mes que el último cobro** (p. ej. un pedido de 95 el mismo mes que el cobro de 100): la suscripción se tiene que seguir mostrando; solo los meses posteriores disparan la ambigüedad. Test en Task 2.
- **Ocultar y después importar un descriptor truncado** que cambia la clave canónica: la suscripción sigue oculta por su clave cruda. Test en Task 2.
- **Oculta y cortada a la vez:** aparece solo en «Ocultas»; no cuenta en «Dejaron de cobrarse» ni en el ahorro mensual. Test en Task 4.
- **Sin cotización del oficial:** el KPI dice «sin cotización para US$ X», no aparece la nota del oficial y los totales en pesos no suman los dólares. Tests en Tasks 3 y 5.
- **Dos cobros iguales y una sola devolución:** se anula uno solo, el más cercano a la devolución. Test en Task 1.

---

### Task 1: Motor — anulaciones, rachas, montos parecidos, aumento y cierres

**Files:**
- Create: `server/src/stats/subscriptions.ts`
- Test: `server/src/stats/subscriptions.test.ts`

**Interfaces:**
- Consumes: `addDays`, `addMonths`, `addMonthsClamped`, `daysBetween`, `monthOf` de `./months.js`; `issuerSchema` y los tipos `Currency`, `Direction`, `Issuer`, `SubscriptionIncrease`, `TxType` de `@ledgerly/shared`.
- Produces: las constantes de «Global Constraints»; `interface SubscriptionTx { date: string; merchant: string; amount: number; currency: Currency; direction: Direction; type: TxType; isInstallment: boolean; category: string; issuer: Issuer; cardLabel: string }`; `interface SubscriptionContext { hoy: string; ultimoCierre: Partial<Record<Issuer, string>>; ocultas: ReadonlySet<string>; cotizacion: number | null }`; `interface Charge extends SubscriptionTx { key: string }`; `latestClosingByIssuer(statements: { issuer: string; closingDate: Date | null }[]): Partial<Record<Issuer, string>>`; `removeRefunded(debits: Charge[], credits: Charge[]): Charge[]`; `monthlyRuns(charges: Charge[]): Charge[][]`; `similarAmounts(run: Charge[]): boolean`; `priceIncrease(run: Charge[]): SubscriptionIncrease | null`; re-export de `addMonthsClamped`.

- [x] **Step 1: Write the failing test**

Crear `server/src/stats/subscriptions.test.ts`:

```typescript
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: FAIL — `Failed to resolve import "./subscriptions.js"`.

- [x] **Step 3: Write minimal implementation**

Crear `server/src/stats/subscriptions.ts`:

```typescript
import {
  issuerSchema,
  type Currency,
  type Direction,
  type Issuer,
  type SubscriptionIncrease,
  type TxType,
} from "@ledgerly/shared";
import { addMonths, addMonthsClamped, daysBetween, monthOf } from "./months.js";

export { addMonthsClamped };

export const MIN_COBROS = 3;
export const VARIACION_PARECIDA = 0.25;
export const MISMO_MONTO = 0.01;
export const UMBRAL_AUMENTO = 0.05;
export const VENTANA_AUMENTO_MESES = 12;
export const GRACIA_DIAS = 7;
export const VENTANA_CORTADAS_MESES = 12;
export const DIAS_ANULACION = 15;
export const TOLERANCIA_ANULACION = 0.01;

export interface SubscriptionTx {
  date: string;
  merchant: string;
  amount: number;
  currency: Currency;
  direction: Direction;
  type: TxType;
  isInstallment: boolean;
  category: string;
  issuer: Issuer;
  cardLabel: string;
}

export interface SubscriptionContext {
  hoy: string;
  ultimoCierre: Partial<Record<Issuer, string>>;
  ocultas: ReadonlySet<string>;
  cotizacion: number | null;
}

export interface Charge extends SubscriptionTx {
  key: string;
}

const LOG_PARECIDO = Math.log(1 + VARIACION_PARECIDA);

const byDate = (a: Charge, b: Charge): number => a.date.localeCompare(b.date);

const groupBy = <T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
};

const isSimilar = (a: Charge, b: Charge): boolean =>
  a.currency === b.currency && Math.abs(Math.log(b.amount / a.amount)) <= LOG_PARECIDO;

const amountGap = (reference: Charge, candidate: Charge): number => Math.abs(candidate.amount / reference.amount - 1);

const repeatsAmount = (reference: Charge, candidate: Charge): boolean =>
  reference.currency === candidate.currency && amountGap(reference, candidate) <= MISMO_MONTO;

export function latestClosingByIssuer(
  statements: { issuer: string; closingDate: Date | null }[],
): Partial<Record<Issuer, string>> {
  const latest: Partial<Record<Issuer, string>> = {};
  for (const { issuer, closingDate } of statements) {
    const parsed = issuerSchema.safeParse(issuer);
    if (!closingDate || !parsed.success) continue;
    const closing = closingDate.toISOString().slice(0, 10);
    const current = latest[parsed.data];
    if (current === undefined || closing > current) latest[parsed.data] = closing;
  }
  return latest;
}

const refunds = (credit: Charge, debit: Charge): boolean => {
  const days = daysBetween(debit.date, credit.date);
  return debit.key === credit.key
    && debit.currency === credit.currency
    && Math.abs(debit.amount - credit.amount) <= TOLERANCIA_ANULACION
    && days >= 0
    && days <= DIAS_ANULACION;
};

const latestCharge = (charges: Charge[]): Charge | undefined =>
  charges.reduce<Charge | undefined>(
    (latest, charge) => (latest === undefined || charge.date > latest.date ? charge : latest),
    undefined,
  );

export function removeRefunded(debits: Charge[], credits: Charge[]): Charge[] {
  const annulled = new Set<Charge>();
  for (const credit of [...credits].sort(byDate)) {
    const match = latestCharge(debits.filter((debit) => !annulled.has(debit) && refunds(credit, debit)));
    if (match) annulled.add(match);
  }
  return debits.filter((debit) => !annulled.has(debit));
}

const closestRepeat = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  candidates
    .filter((candidate) => repeatsAmount(reference, candidate))
    .reduce<Charge | undefined>(
      (best, candidate) =>
        best === undefined || amountGap(reference, candidate) < amountGap(reference, best) ? candidate : best,
      undefined,
    );

const nextCharge = (last: Charge | undefined, monthCharges: Charge[]): Charge | undefined => {
  if (monthCharges.length === 1) return monthCharges[0];
  return last === undefined ? undefined : closestRepeat(last, monthCharges);
};

const followsMonth = (last: Charge, month: string): boolean => addMonths(monthOf(last.date), 1) === month;

export function monthlyRuns(charges: Charge[]): Charge[][] {
  const runs: Charge[][] = [];
  let run: Charge[] = [];
  const closeRun = (): void => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  const months = groupBy([...charges].sort(byDate), ({ date }) => monthOf(date));
  for (const [month, monthCharges] of months) {
    const last = run.at(-1);
    if (last !== undefined && !followsMonth(last, month)) closeRun();
    const next = nextCharge(run.at(-1), monthCharges);
    if (next === undefined) closeRun();
    else run.push(next);
  }
  closeRun();
  return runs;
}

const consecutivePairs = (run: Charge[]): [Charge, Charge][] =>
  run.slice(1).map((charge, index): [Charge, Charge] => [run[index], charge]);

export function similarAmounts(run: Charge[]): boolean {
  const pairs = consecutivePairs(run).filter(([previous, current]) => previous.currency === current.currency);
  if (pairs.length === 0) return false;
  const similar = pairs.filter(([previous, current]) => isSimilar(previous, current)).length;
  return similar * 2 > pairs.length;
}

const currencyTail = (run: Charge[]): Charge[] => {
  const currency = run.at(-1)?.currency;
  let start = run.length;
  while (start > 0 && run[start - 1].currency === currency) start -= 1;
  return run.slice(start);
};

export function priceIncrease(run: Charge[]): SubscriptionIncrease | null {
  const last = run.at(-1);
  if (last === undefined) return null;
  const since = addMonthsClamped(last.date, -VENTANA_AUMENTO_MESES);
  const reference = currencyTail(run).find(({ date }) => date >= since);
  if (reference === undefined || reference === last) return null;
  const variacion = last.amount / reference.amount - 1;
  if (variacion < UMBRAL_AUMENTO) return null;
  return { variacion, desde: monthOf(reference.date), montoAnterior: reference.amount };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: PASS (todos los `describe`).

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts
git commit -m "feat(server): rachas mensuales, anulaciones y aumentos para suscripciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Motor — `detectSubscriptions` y `summarizeSubscriptions`

**Files:**
- Modify: `server/src/stats/subscriptions.ts`
- Test: `server/src/stats/subscriptions.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 1; `canonicalMerchantKeys`, `merchantDisplayName`, `merchantKey`, `merchantSearchTerm` de `./merchantKey.js`; `addDays` de `./months.js`; tipos `SubscriptionDTO`, `SubscriptionsReportDTO`.
- Produces: `detectSubscriptions(txs: SubscriptionTx[], ctx: SubscriptionContext): SubscriptionDTO[]` (ya ordenadas) y `summarizeSubscriptions(items: SubscriptionDTO[]): Pick<SubscriptionsReportDTO, "totalMensualArs" | "totalMensualUsd" | "totalAnualArs">`. Las consume la ruta (Task 3).

- [x] **Step 1: Write the failing test**

En `server/src/stats/subscriptions.test.ts`, sumar a los imports `import type { SubscriptionDTO } from "@ledgerly/shared";` y, del módulo, `detectSubscriptions`, `summarizeSubscriptions` y `type SubscriptionContext`. Agregar después de los helpers existentes:

```typescript
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
```

Y al final del archivo:

```typescript
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: FAIL — `detectSubscriptions is not a function` (y `summarizeSubscriptions`).

- [x] **Step 3: Write minimal implementation**

En `server/src/stats/subscriptions.ts`, ampliar los imports:

```typescript
import {
  issuerSchema,
  type Currency,
  type Direction,
  type Issuer,
  type SubscriptionDTO,
  type SubscriptionIncrease,
  type SubscriptionsReportDTO,
  type TxType,
} from "@ledgerly/shared";
import { canonicalMerchantKeys, merchantDisplayName, merchantKey, merchantSearchTerm } from "./merchantKey.js";
import { addDays, addMonths, addMonthsClamped, daysBetween, monthOf } from "./months.js";
```

Debajo de `interface Charge`, agregar:

```typescript
type SubscriptionTotals = Pick<SubscriptionsReportDTO, "totalMensualArs" | "totalMensualUsd" | "totalAnualArs">;

interface KeyedTx {
  tx: SubscriptionTx;
  rawKey: string;
}
```

Debajo de `LOG_PARECIDO`:

```typescript
const roundCents = (value: number): number => Math.round(value * 100) / 100;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
```

Y al final del archivo:

```typescript
const isValidRun = (run: Charge[]): boolean => run.length >= MIN_COBROS && similarAmounts(run);

const isEligibleDebit = ({ type, direction, isInstallment, amount }: SubscriptionTx): boolean =>
  type === "purchase" && direction === "debit" && !isInstallment && amount > 0;

const isRefundCredit = ({ type, direction }: SubscriptionTx): boolean =>
  direction === "credit" && (type === "purchase" || type === "refund");

const keyed = (txs: SubscriptionTx[]): KeyedTx[] =>
  txs.map((tx) => ({ tx, rawKey: merchantKey(tx.merchant) })).filter(({ rawKey }) => rawKey !== "");

const hasLaterSimilar = (charges: Charge[], last: Charge): boolean =>
  charges.some((charge) => monthOf(charge.date) > monthOf(last.date) && isSimilar(last, charge));

const statusOf = (last: Charge, proximoCobro: string, { ultimoCierre }: SubscriptionContext): SubscriptionDTO["estado"] => {
  const cierre = ultimoCierre[last.issuer];
  return cierre !== undefined && addDays(proximoCobro, GRACIA_DIAS) < cierre ? "cortada" : "activa";
};

const monthlyArs = ({ amount, currency }: Charge, cotizacion: number | null): number | null => {
  if (currency === "ARS") return amount;
  return cotizacion === null ? null : roundCents(amount * cotizacion);
};

const previousCurrency = (run: Charge[], last: Charge): Currency | null =>
  run.find(({ currency }) => currency !== last.currency)?.currency ?? null;

const isHidden = (key: string, rawKeys: ReadonlySet<string>, ocultas: ReadonlySet<string>): boolean =>
  ocultas.has(key) || [...rawKeys].some((rawKey) => ocultas.has(rawKey));

const subscriptionOf = (charges: Charge[], rawKeys: ReadonlySet<string>, ctx: SubscriptionContext): SubscriptionDTO | null => {
  const run = monthlyRuns(charges).filter(isValidRun).at(-1);
  if (run === undefined) return null;
  const first = run[0];
  const last = run[run.length - 1];
  if (hasLaterSimilar(charges, last)) return null;
  const proximoCobro = addMonthsClamped(last.date, 1);
  const estado = statusOf(last, proximoCobro, ctx);
  if (estado === "cortada" && last.date < addMonthsClamped(ctx.hoy, -VENTANA_CORTADAS_MESES)) return null;
  return {
    key: last.key,
    nombre: merchantDisplayName(last.merchant),
    busqueda: merchantSearchTerm(run.map(({ merchant }) => merchant).reverse()),
    categoria: last.category,
    cardLabel: last.cardLabel,
    moneda: last.currency,
    montoActual: last.amount,
    montoMensualArs: monthlyArs(last, ctx.cotizacion),
    primerCobro: first.date,
    ultimoCobro: last.date,
    proximoCobro,
    cobros: run.length,
    estado,
    oculta: isHidden(last.key, rawKeys, ctx.ocultas),
    aumento: priceIncrease(run),
    monedaAnterior: previousCurrency(run, last),
  };
};

const compareMonthlyArs = (a: number | null, b: number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
};

const compareSubscriptions = (a: SubscriptionDTO, b: SubscriptionDTO): number => {
  if (a.estado !== b.estado) return a.estado === "activa" ? -1 : 1;
  if (a.estado === "cortada") return b.ultimoCobro.localeCompare(a.ultimoCobro);
  return compareMonthlyArs(a.montoMensualArs, b.montoMensualArs) || a.nombre.localeCompare(b.nombre);
};

export function detectSubscriptions(txs: SubscriptionTx[], ctx: SubscriptionContext): SubscriptionDTO[] {
  const debitRows = keyed(txs.filter(isEligibleDebit));
  const creditRows = keyed(txs.filter(isRefundCredit));
  const canonical = canonicalMerchantKeys([...debitRows, ...creditRows].map(({ rawKey }) => rawKey));
  const canonicalOf = (rawKey: string): string => canonical.get(rawKey) ?? rawKey;
  const toCharge = ({ tx, rawKey }: KeyedTx): Charge => ({ ...tx, key: canonicalOf(rawKey) });
  const rowsByGroup = groupBy(debitRows, ({ rawKey }) => canonicalOf(rawKey));
  const debits = removeRefunded(debitRows.map(toCharge), creditRows.map(toCharge));
  return [...groupBy(debits, ({ key }) => key)]
    .flatMap(([key, charges]) => {
      const rawKeys = new Set((rowsByGroup.get(key) ?? []).map(({ rawKey }) => rawKey));
      const subscription = subscriptionOf(charges, rawKeys, ctx);
      return subscription ? [subscription] : [];
    })
    .sort(compareSubscriptions);
}

export function summarizeSubscriptions(items: SubscriptionDTO[]): SubscriptionTotals {
  const counted = items.filter(({ estado, oculta }) => estado === "activa" && !oculta);
  const totalMensualArs = roundCents(sum(counted.map(({ montoMensualArs }) => montoMensualArs ?? 0)));
  const totalMensualUsd = roundCents(
    sum(counted.filter(({ moneda }) => moneda === "USD").map(({ montoActual }) => montoActual)),
  );
  return { totalMensualArs, totalMensualUsd, totalAnualArs: roundCents(totalMensualArs * 12) };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts
git commit -m "feat(server): detección de suscripciones y totales mensuales" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API — `GET /api/subscriptions` y ocultas

**Files:**
- Modify: `server/src/http/routes/subscriptions.ts` (reemplaza el stub; el router ya está montado en `app.ts`)
- Test: `server/src/http/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes: `detectSubscriptions`, `latestClosingByIssuer`, `summarizeSubscriptions`, `SubscriptionTx` (Tasks 1-2); `TransactionModel`, `StatementModel`, `HiddenSubscriptionModel` (base); `fetchOficialRate(dateIso): Promise<number | null>`; `HttpError`, `asyncHandler`.
- Produces: `GET /api/subscriptions` → `200 SubscriptionsReportDTO`; `PUT /api/subscriptions/hidden/:key` → `204` (o `400 { error: "Clave inválida" }`); `DELETE /api/subscriptions/hidden/:key` → `204`. Los consume `useSubscriptions`/`useSetSubscriptionHidden` (base).

- [x] **Step 1: Write the failing test**

Crear `server/src/http/routes/subscriptions.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { subscriptionsReportDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { HiddenSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

withDb();
const app = createApp();
const COTIZACION = 1465;

interface TxSeed {
  date: string;
  merchant: string;
  amount: number;
  currency?: "ARS" | "USD";
  type?: string;
  isInstallment?: boolean;
  category?: string;
}

const zero = { ars: 0, usd: 0 };

async function seedVisa(rows: TxSeed[]): Promise<void> {
  const statement = await StatementModel.create({
    issuer: "visa_signature", cardLabel: "Visa Signature", last4: "1234", closingDate: new Date("2026-08-26"),
    dueDate: null, totals: { totalConsumos: zero, saldoActual: zero, pagoMinimo: zero, saldoAnterior: zero },
    sourceFileName: "visa.pdf", sourceHash: "visa-2026-08", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany(rows.map(
    ({ date, merchant, amount, currency = "ARS", type = "purchase", isInstallment = false, category = "Suscripciones" }, index) => ({
      statementId: statement._id, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date(date),
      descriptionRaw: merchant, merchant, category, categorySource: "rule", amount, currency, direction: "debit",
      type, isInstallment, installmentCurrent: isInstallment ? 1 : null, installmentTotal: isInstallment ? 12 : null,
      comprobante: null, fingerprint: `fp-${index}`,
    }),
  ));
}

const STREAMFLIX_IDS = ["58141049416586488", "ydnBWjd7S", "LYXdQ0WEI5", "77Hq2Kp1"];
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08"];

const streamflixAndNoise = (): TxSeed[] => MONTHS.flatMap((month, index) => [
  { date: `${month}-09`, merchant: `STREAMFLIX.COM ${STREAMFLIX_IDS[index]}`, amount: 12.99, currency: "USD" as const },
  { date: `${month}-04`, merchant: "MERCADOLIBRE", amount: 15000, isInstallment: true, category: "Compras" },
  { date: `${month}-09`, merchant: "IVA RG 4240 SERV DIGITALES", amount: 2.73, currency: "USD" as const, type: "tax" },
  { date: `${month}-03`, merchant: "CAFE MARTINEZ 12", amount: 4500, category: "Comida" },
  { date: `${month}-12`, merchant: "CAFE MARTINEZ 12", amount: 5200, category: "Comida" },
  { date: `${month}-20`, merchant: "CAFE MARTINEZ 12", amount: 6100, category: "Comida" },
]);

beforeEach(() => {
  vi.mocked(fetchOficialRate).mockResolvedValue(COTIZACION);
});

describe("GET /api/subscriptions", () => {
  it("sin datos responde 200 con la lista vacía y totales en cero", async () => {
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cotizacionOficial: COTIZACION, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [],
    });
  });

  it("detecta el cobro mensual entre cuotas, impuestos y compras sueltas", async () => {
    await seedVisa(streamflixAndNoise());
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(200);
    const report = subscriptionsReportDtoSchema.parse(res.body);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({
      key: "STREAMFLIX COM", nombre: "STREAMFLIX.COM", moneda: "USD", montoActual: 12.99,
      montoMensualArs: 19030.35, cobros: 4, estado: "activa", oculta: false, cardLabel: "Visa Signature",
      primerCobro: "2026-05-09", ultimoCobro: "2026-08-09",
    });
    expect(report).toMatchObject({ totalMensualArs: 19030.35, totalMensualUsd: 12.99, totalAnualArs: 228364.2 });
  });

  it("sin cotización deja los pesos de los dólares en null", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    await seedVisa(streamflixAndNoise());
    const res = await request(app).get("/api/subscriptions");
    expect(res.body).toMatchObject({ cotizacionOficial: null, totalMensualArs: 0, totalMensualUsd: 12.99 });
    expect(res.body.items[0].montoMensualArs).toBeNull();
  });
});

describe("ocultar suscripciones", () => {
  it("PUT la oculta, es idempotente y saca sus montos de los totales", async () => {
    await seedVisa(streamflixAndNoise());
    expect((await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect(await HiddenSubscriptionModel.countDocuments()).toBe(1);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items[0].oculta).toBe(true);
    expect(res.body).toMatchObject({ totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0 });
  });

  it("DELETE la vuelve a mostrar y también es idempotente", async () => {
    await seedVisa(streamflixAndNoise());
    await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM");
    expect((await request(app).delete("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).delete("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items[0].oculta).toBe(false);
    expect(res.body.totalMensualUsd).toBe(12.99);
  });

  it.each([
    ["en blanco", "%20%20"],
    ["de más de 60 caracteres", "A".repeat(61)],
  ])("PUT con una clave %s responde 400", async (_label, key) => {
    const res = await request(app).put(`/api/subscriptions/hidden/${key}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Clave inválida" });
  });

  it("guarda la clave recortada", async () => {
    await request(app).put("/api/subscriptions/hidden/%20STREAMFLIX%20COM%20");
    expect((await HiddenSubscriptionModel.findOne().lean())?.key).toBe("STREAMFLIX COM");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/subscriptions.test.ts`
Expected: FAIL — el stub no tiene handlers: `GET` responde 404 (`expected 404 to be 200`).

- [x] **Step 3: Write minimal implementation**

Reemplazar `server/src/http/routes/subscriptions.ts`:

```typescript
import { Router, type Request } from "express";
import type { Currency, Direction, Issuer, SubscriptionsReportDTO, TxType } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { HiddenSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import {
  detectSubscriptions,
  latestClosingByIssuer,
  summarizeSubscriptions,
  type SubscriptionTx,
} from "../../stats/subscriptions.js";

const MAX_CLAVE = 60;

export const subscriptionsRouter = Router();

const hiddenKeyOf = (req: Request): string => {
  const key = String(req.params.key ?? "").trim();
  if (key === "" || key.length > MAX_CLAVE) throw new HttpError(400, "Clave inválida");
  return key;
};

subscriptionsRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const [transactions, statements, hidden, cotizacion] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    fetchOficialRate(hoy),
  ]);
  const txs: SubscriptionTx[] = transactions.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    merchant: t.merchant,
    amount: t.amount,
    currency: t.currency as Currency,
    direction: t.direction as Direction,
    type: t.type as TxType,
    isInstallment: t.isInstallment,
    category: t.category,
    issuer: t.issuer as Issuer,
    cardLabel: t.cardLabel,
  }));
  const items = detectSubscriptions(txs, {
    hoy,
    ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
    ocultas: new Set(hidden.map((h) => h.key)),
    cotizacion,
  });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));

subscriptionsRouter.put("/hidden/:key", asyncHandler(async (req, res) => {
  const key = hiddenKeyOf(req);
  await HiddenSubscriptionModel.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

subscriptionsRouter.delete("/hidden/:key", asyncHandler(async (req, res) => {
  const key = hiddenKeyOf(req);
  await HiddenSubscriptionModel.deleteOne({ key });
  res.status(204).end();
}));
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/subscriptions.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts
git commit -m "feat(server): API de suscripciones con ocultas en Mongo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente — lógica pura `subscriptions.ts`

**Files:**
- Create: `client/src/subscriptions.ts`
- Test: `client/src/subscriptions.test.ts`

**Interfaces:**
- Consumes: `formatMoney`, `formatMonthLabel`, `formatPercent`, `formatSignedPercent` de `./format.js`; `ALL_YEARS` de `./filters/globalFilters.js`; `transactionsLink` de `./filters/transactionsLink.js`; tipos `Currency`, `SubscriptionDTO`, `SubscriptionIncrease` (solo tipos: el cliente no importa valores de `@ledgerly/shared`).
- Produces: `type SubscriptionVariant = "activas" | "cortadas"`; `interface SubscriptionListProps { items: SubscriptionDTO[]; variant: SubscriptionVariant; onHide: (key: string) => void }`; `interface SubscriptionSections { activas; cortadas; ocultas: SubscriptionDTO[]; subieron: number; ahorroMensualArs: number; conUsd: boolean }`; `AMOUNT_LABEL: Record<SubscriptionVariant, string>`; `subscriptionSections`, `subscriptionMeta`, `increaseLabel`, `increaseShortLabel`, `increaseDetail`, `increaseSinceDetail`, `previousCurrencyLabel`, `activeCountLabel`, `monthlyKpiSub`, `subscriptionTransactionsLink`. Los consumen los componentes y la página (Tasks 5-6).

- [x] **Step 1: Write the failing test**

Crear `client/src/subscriptions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { SubscriptionDTO, SubscriptionIncrease } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  AMOUNT_LABEL,
  activeCountLabel,
  increaseDetail,
  increaseLabel,
  increaseShortLabel,
  increaseSinceDetail,
  monthlyKpiSub,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionSections,
  subscriptionTransactionsLink,
} from "./subscriptions.js";

const aumento: SubscriptionIncrease = { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 };

const item = (overrides: Partial<SubscriptionDTO>): SubscriptionDTO => ({
  key: "MUSICAPP",
  nombre: "MUSICAPP",
  busqueda: "MUSICAPP",
  categoria: "Suscripciones",
  cardLabel: "ICBC",
  moneda: "ARS",
  montoActual: 5490,
  montoMensualArs: 5490,
  primerCobro: "2026-03-12",
  ultimoCobro: "2026-08-12",
  proximoCobro: "2026-09-12",
  cobros: 6,
  estado: "activa",
  oculta: false,
  aumento: null,
  monedaAnterior: null,
  ...overrides,
});

const keys = (items: SubscriptionDTO[]): string[] => items.map(({ key }) => key);

describe("subscriptionSections", () => {
  it("separa activas, cortadas y ocultas respetando el orden del server", () => {
    const sections = subscriptionSections([
      item({ key: "A", montoMensualArs: 9000, aumento }),
      item({ key: "B", moneda: "USD", montoActual: 10, montoMensualArs: 14650 }),
      item({ key: "C", estado: "cortada", montoMensualArs: 3000 }),
      item({ key: "D", estado: "cortada", moneda: "USD", montoMensualArs: null }),
      item({ key: "E", oculta: true, aumento }),
      item({ key: "F", oculta: true, estado: "cortada", montoMensualArs: 7000 }),
    ]);
    expect(keys(sections.activas)).toEqual(["A", "B"]);
    expect(keys(sections.cortadas)).toEqual(["C", "D"]);
    expect(keys(sections.ocultas)).toEqual(["E", "F"]);
    expect(sections).toMatchObject({ subieron: 1, ahorroMensualArs: 3000, conUsd: true });
  });

  it("sin dólares activos no pide aclarar la cotización", () => {
    expect(subscriptionSections([item({ estado: "cortada", moneda: "USD" })]).conUsd).toBe(false);
  });

  it("sin suscripciones da secciones vacías", () => {
    expect(subscriptionSections([])).toEqual({
      activas: [], cortadas: [], ocultas: [], subieron: 0, ahorroMensualArs: 0, conUsd: false,
    });
  });
});

describe("textos de suscripciones", () => {
  it("increaseLabel describe el aumento con el mes en minúscula", () => {
    expect(increaseLabel(aumento)).toBe("Subió 10,0% desde marzo de 2026");
  });

  it("increaseShortLabel es la variación con signo", () => {
    expect(increaseShortLabel(aumento)).toBe("+10,0%");
  });

  it("increaseDetail e increaseSinceDetail muestran los montos en su moneda", () => {
    const detail = `${formatMoney(4990, "ARS")} → ${formatMoney(5490, "ARS")}`;
    expect(increaseDetail(aumento, 5490, "ARS")).toBe(detail);
    expect(increaseSinceDetail(aumento, 5490, "ARS")).toBe(`${detail} desde marzo de 2026`);
  });

  it("previousCurrencyLabel nombra la moneda anterior", () => {
    expect(previousCurrencyLabel("ARS")).toBe("Antes se cobraba en pesos");
    expect(previousCurrencyLabel("USD")).toBe("Antes se cobraba en dólares");
  });

  it("subscriptionMeta junta tarjeta y categoría", () => {
    expect(subscriptionMeta(item({}))).toBe("ICBC · Suscripciones");
  });

  it("AMOUNT_LABEL depende de la sección", () => {
    expect(AMOUNT_LABEL).toEqual({ activas: "Por mes", cortadas: "Último monto" });
  });

  it("activeCountLabel concuerda en número", () => {
    expect(activeCountLabel(1)).toBe("1 activa");
    expect(activeCountLabel(3)).toBe("3 activas");
  });

  it("monthlyKpiSub aclara los dólares según haya o no cotización", () => {
    const usd = formatMoney(12.99, "USD");
    expect(monthlyKpiSub(3, 0, 1465)).toBe("3 activas");
    expect(monthlyKpiSub(3, 12.99, 1465)).toBe(`3 activas · incluye ${usd} al oficial`);
    expect(monthlyKpiSub(1, 12.99, null)).toBe(`1 activa · sin cotización para ${usd}`);
  });
});

describe("subscriptionTransactionsLink", () => {
  it("lleva a Movimientos de todos los años buscando el comercio", () => {
    expect(subscriptionTransactionsLink("STREAMFLIX")).toBe("/transactions?year=all&search=STREAMFLIX");
  });

  it("escapa espacios y asteriscos sin perder la búsqueda", () => {
    const link = subscriptionTransactionsLink("GOOGLE *VideoP");
    expect(link).not.toContain(" ");
    expect(new URLSearchParams(link.split("?")[1]).get("search")).toBe("GOOGLE *VideoP");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/subscriptions.test.ts`
Expected: FAIL — `Failed to resolve import "./subscriptions.js"`.

- [x] **Step 3: Write minimal implementation**

Crear `client/src/subscriptions.ts`:

```typescript
import type { Currency, SubscriptionDTO, SubscriptionIncrease } from "@ledgerly/shared";
import { ALL_YEARS } from "./filters/globalFilters.js";
import { transactionsLink } from "./filters/transactionsLink.js";
import { formatMoney, formatMonthLabel, formatPercent, formatSignedPercent } from "./format.js";

export type SubscriptionVariant = "activas" | "cortadas";

export interface SubscriptionListProps {
  items: SubscriptionDTO[];
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

export interface SubscriptionSections {
  activas: SubscriptionDTO[];
  cortadas: SubscriptionDTO[];
  ocultas: SubscriptionDTO[];
  subieron: number;
  ahorroMensualArs: number;
  conUsd: boolean;
}

export const AMOUNT_LABEL: Record<SubscriptionVariant, string> = { activas: "Por mes", cortadas: "Último monto" };

const CURRENCY_NAMES: Record<Currency, string> = { ARS: "pesos", USD: "dólares" };

const monthName = (month: string): string => formatMonthLabel(month).toLowerCase();

export function subscriptionSections(items: SubscriptionDTO[]): SubscriptionSections {
  const visibles = items.filter(({ oculta }) => !oculta);
  const activas = visibles.filter(({ estado }) => estado === "activa");
  const cortadas = visibles.filter(({ estado }) => estado === "cortada");
  return {
    activas,
    cortadas,
    ocultas: items.filter(({ oculta }) => oculta),
    subieron: activas.filter(({ aumento }) => aumento !== null).length,
    ahorroMensualArs: cortadas.reduce((total, { montoMensualArs }) => total + (montoMensualArs ?? 0), 0),
    conUsd: activas.some(({ moneda }) => moneda === "USD"),
  };
}

export function subscriptionMeta({ cardLabel, categoria }: Pick<SubscriptionDTO, "cardLabel" | "categoria">): string {
  return `${cardLabel} · ${categoria}`;
}

export function increaseLabel({ variacion, desde }: SubscriptionIncrease): string {
  return `Subió ${formatPercent(variacion * 100)} desde ${monthName(desde)}`;
}

export function increaseShortLabel({ variacion }: SubscriptionIncrease): string {
  return formatSignedPercent(variacion * 100);
}

export function increaseDetail({ montoAnterior }: SubscriptionIncrease, montoActual: number, moneda: Currency): string {
  return `${formatMoney(montoAnterior, moneda)} → ${formatMoney(montoActual, moneda)}`;
}

export function increaseSinceDetail(aumento: SubscriptionIncrease, montoActual: number, moneda: Currency): string {
  return `${increaseDetail(aumento, montoActual, moneda)} desde ${monthName(aumento.desde)}`;
}

export function previousCurrencyLabel(moneda: Currency): string {
  return `Antes se cobraba en ${CURRENCY_NAMES[moneda]}`;
}

export function activeCountLabel(count: number): string {
  return `${count} ${count === 1 ? "activa" : "activas"}`;
}

export function monthlyKpiSub(activas: number, totalMensualUsd: number, cotizacion: number | null): string {
  const base = activeCountLabel(activas);
  if (totalMensualUsd <= 0) return base;
  const usd = formatMoney(totalMensualUsd, "USD");
  return cotizacion === null ? `${base} · sin cotización para ${usd}` : `${base} · incluye ${usd} al oficial`;
}

export function subscriptionTransactionsLink(busqueda: string): string {
  return transactionsLink({ year: ALL_YEARS, search: busqueda });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/subscriptions.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/subscriptions.ts client/src/subscriptions.test.ts
git commit -m "feat(client): secciones y textos de la página de suscripciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: UI en compu — KPIs, tabla, ocultas y página

**Files:**
- Create: `client/src/components/SubscriptionKpiCards.tsx`
- Create: `client/src/components/SubscriptionsTable.tsx`
- Create: `client/src/components/HiddenSubscriptions.tsx`
- Modify: `client/src/pages/SubscriptionsPage.tsx` (reemplaza el stub; la ruta ya está en `App.tsx`)
- Test: `client/src/pages/SubscriptionsPage.test.tsx`

**Interfaces:**
- Consumes: `useSubscriptions()` y `useSetSubscriptionHidden()` (base); todo `client/src/subscriptions.ts` (Task 4); `Kpi`, `KpiGrid`, `MotionBox`, `MotionTableBody`, `MotionTableRow`, `fadeUpItem`, `staggerContainer`, `tapTargetSx`; `formatMoney`, `formatMoneyOrDash`.
- Produces: `SubscriptionKpiCards({ report, sections })`, `SubscriptionsTable(props: SubscriptionListProps)`, `HiddenSubscriptions({ items, onShow })` y la página `SubscriptionsPage`. La tabla lleva `aria-label` «Suscripciones activas» / «Suscripciones que dejaron de cobrarse».

- [x] **Step 1: Write the failing test**

Crear `client/src/pages/SubscriptionsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Currency, SubscriptionDTO, SubscriptionsReportDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { SubscriptionsPage } from "./SubscriptionsPage.js";

const streamflix: SubscriptionDTO = {
  key: "STREAMFLIX COM", nombre: "STREAMFLIX.COM", busqueda: "STREAMFLIX", categoria: "Suscripciones",
  cardLabel: "Visa Signature", moneda: "USD", montoActual: 12.99, montoMensualArs: 19030.35,
  primerCobro: "2026-01-09", ultimoCobro: "2026-08-09", proximoCobro: "2026-09-09", cobros: 8,
  estado: "activa", oculta: false, aumento: null, monedaAnterior: "ARS",
};

const musicapp: SubscriptionDTO = {
  ...streamflix, key: "MUSICAPP", nombre: "MUSICAPP", busqueda: "MUSICAPP", cardLabel: "ICBC", moneda: "ARS",
  montoActual: 5490, montoMensualArs: 5490, primerCobro: "2026-03-12", ultimoCobro: "2026-08-12",
  proximoCobro: "2026-09-12", cobros: 6, aumento: { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 },
  monedaAnterior: null,
};

const gimnasio: SubscriptionDTO = {
  ...musicapp, key: "GIMNASIO NORTE", nombre: "GIMNASIO NORTE", busqueda: "GIMNASIO NORTE", categoria: "Deportes",
  montoActual: 30000, montoMensualArs: 30000, primerCobro: "2026-01-03", ultimoCobro: "2026-05-03",
  proximoCobro: "2026-06-03", cobros: 5, estado: "cortada", aumento: null,
};

const plan: SubscriptionDTO = {
  ...musicapp, key: "PLAN AUTOAHORRO", nombre: "PLAN AUTOAHORRO-X", busqueda: "PLAN AUTOAHORRO-X",
  categoria: "Auto", montoActual: 250000, montoMensualArs: 250000, aumento: null, oculta: true,
};

const report: SubscriptionsReportDTO = {
  cotizacionOficial: 1465, totalMensualArs: 24520.35, totalMensualUsd: 12.99, totalAnualArs: 294244.2,
  items: [streamflix, musicapp, gimnasio, plan],
};

const money = (amount: number, currency: Currency): string => formatMoney(amount, currency).replace(/\s/g, " ");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const serve = (body: SubscriptionsReportDTO): void => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    (url.includes("/subscriptions/hidden/") ? new Response(null, { status: 204 }) : json(body))));
};

const mutations = (): string[] => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PUT" || init?.method === "DELETE")
  .map(([url, init]) => `${init?.method} ${String(url)}`);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubscriptionsPage", () => {
  it("muestra el título mientras carga", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderWithProviders(<SubscriptionsPage />, { route: "/suscripciones" });
    expect(screen.getByRole("heading", { level: 4, name: "Suscripciones" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("muestra los KPIs, las activas con su aumento y las que dejaron de cobrarse", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />, { route: "/suscripciones" });
    const activas = await screen.findByRole("table", { name: "Suscripciones activas" });
    expect(screen.getAllByText("Por mes")).toHaveLength(2);
    expect(screen.getByText("Por año")).toBeInTheDocument();
    expect(screen.getByText("Subieron")).toBeInTheDocument();
    expect(screen.getByText(`2 activas · incluye ${money(12.99, "USD")} al oficial`)).toBeInTheDocument();
    expect(screen.getByText(`${money(30000, "ARS")} menos por mes`)).toBeInTheDocument();
    expect(within(activas).getByText("STREAMFLIX.COM")).toBeInTheDocument();
    expect(within(activas).getByText("Antes se cobraba en pesos")).toBeInTheDocument();
    expect(within(activas).getByText("Subió 10,0% desde marzo de 2026")).toBeInTheDocument();
    expect(within(activas).getByText("próximo ~2026-09-12")).toBeInTheDocument();
    expect(within(activas).queryByText("PLAN AUTOAHORRO-X")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dejaron de cobrarse" })).toBeInTheDocument();
    const cortadas = screen.getByRole("table", { name: "Suscripciones que dejaron de cobrarse" });
    expect(within(cortadas).getByText("GIMNASIO NORTE")).toBeInTheDocument();
    expect(within(cortadas).getByText("Último monto")).toBeInTheDocument();
    expect(
      screen.getByText(`Dólares al oficial de hoy (${money(1465, "ARS")}), sin impuestos ni percepciones.`),
    ).toBeInTheDocument();
  });

  it("ocultar manda el PUT con la clave codificada", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Ocultar STREAMFLIX.COM" }));
    await waitFor(() => expect(mutations()).toEqual(["PUT /api/subscriptions/hidden/STREAMFLIX%20COM"]));
  });

  it("«Mostrar» dentro de «Ocultas (1)» manda el DELETE", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ocultas \(1\)/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar PLAN AUTOAHORRO-X" }));
    await waitFor(() => expect(mutations()).toEqual(["DELETE /api/subscriptions/hidden/PLAN%20AUTOAHORRO"]));
  });

  it("el link de movimientos busca el comercio en todos los años", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const link = await screen.findByRole("link", { name: "Ver movimientos de STREAMFLIX.COM" });
    expect(link).toHaveAttribute("href", "/transactions?year=all&search=STREAMFLIX");
  });

  it("sin cotización avisa que los dólares no suman en pesos", async () => {
    serve({
      ...report, cotizacionOficial: null, totalMensualArs: 5490, totalAnualArs: 65880,
      items: [musicapp, { ...streamflix, montoMensualArs: null }],
    });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(`2 activas · sin cotización para ${money(12.99, "USD")}`)).toBeInTheDocument();
    expect(screen.queryByText(/Dólares al oficial de hoy/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dejaron de cobrarse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ocultas/ })).not.toBeInTheDocument();
  });

  it("si todas están ocultas avisa que no hay activas", async () => {
    serve({ ...report, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [plan] });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText("No hay cobros recurrentes activos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ocultas \(1\)/ })).toBeInTheDocument();
  });

  it("sin cobros recurrentes muestra el estado vacío", async () => {
    serve({ cotizacionOficial: 1465, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [] });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(/No encontramos cobros recurrentes/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Suscripciones" })).toBeInTheDocument();
  });

  it("si el server falla muestra el error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "boom" }, 500)));
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText("No pudimos calcular las suscripciones.")).toBeInTheDocument();
  });
});
```

> `formatMoney` usa espacio no separable y Testing Library normaliza solo el texto del DOM, no el del matcher: por eso el test compara contra `money()`, que reemplaza `\s` por un espacio común (mismo patrón que `legendCharts.test.tsx`).

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/SubscriptionsPage.test.tsx`
Expected: FAIL — el stub no pide datos: `Unable to find role="table"` y no hay `progressbar`.

- [x] **Step 3: Write minimal implementation**

Crear `client/src/components/SubscriptionKpiCards.tsx`:

```tsx
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import type { SubscriptionsReportDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthlyKpiSub, type SubscriptionSections } from "../subscriptions.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface SubscriptionKpiCardsProps {
  report: SubscriptionsReportDTO;
  sections: SubscriptionSections;
}

const WINDOW_LABEL = "en los últimos 12 meses";

const money = (value: number): string => formatMoney(value, "ARS");

const count = (value: number): string => String(Math.round(value));

export const SubscriptionKpiCards = ({
  report: { cotizacionOficial, totalMensualArs, totalMensualUsd, totalAnualArs },
  sections: { activas, cortadas, subieron, ahorroMensualArs },
}: SubscriptionKpiCardsProps) => {
  const monthlySub = monthlyKpiSub(activas.length, totalMensualUsd, cotizacionOficial);
  const stoppedSub = ahorroMensualArs > 0 ? `${money(ahorroMensualArs)} menos por mes` : WINDOW_LABEL;

  return (
    <KpiGrid cardCount={4}>
      <Kpi label="Por mes" value={totalMensualArs} format={money} sub={monthlySub} subMultiline icon={<AutorenewOutlinedIcon />} color="primary" />
      <Kpi label="Por año" value={totalAnualArs} format={money} sub="al precio de hoy" icon={<EventRepeatOutlinedIcon />} color="secondary" />
      <Kpi label="Subieron" value={subieron} format={count} sub={WINDOW_LABEL} icon={<TrendingUpOutlinedIcon />} color="warning" />
      <Kpi label="Dejaron de cobrarse" value={cortadas.length} format={count} sub={stoppedSub} icon={<CancelOutlinedIcon />} color="success" />
    </KpiGrid>
  );
};
```

Crear `client/src/components/SubscriptionsTable.tsx`:

```tsx
import { Chip, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  increaseDetail,
  increaseLabel,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface SubscriptionRowProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

const TABLE_LABEL: Record<SubscriptionVariant, string> = {
  activas: "Suscripciones activas",
  cortadas: "Suscripciones que dejaron de cobrarse",
};

const captionSx = { display: "block" };

const dash = <Typography component="span" color="text.disabled">—</Typography>;

const SubscriptionRow = ({
  item: {
    key, nombre, busqueda, categoria, cardLabel, moneda, montoActual, montoMensualArs,
    primerCobro, ultimoCobro, proximoCobro, aumento, monedaAnterior,
  },
  variant,
  onHide,
}: SubscriptionRowProps) => {
  const isActive = variant === "activas";
  const previousCurrency = monedaAnterior && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{previousCurrencyLabel(monedaAnterior)}</Typography>
  );
  const nextCharge = isActive && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{`próximo ~${proximoCobro}`}</Typography>
  );
  const variation = aumento
    ? <Chip size="small" color="warning" label={increaseLabel(aumento)} title={increaseDetail(aumento, montoActual, moneda)} />
    : dash;
  const variationCell = isActive && <TableCell>{variation}</TableCell>;

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
        <Typography variant="caption" color="text.secondary" sx={captionSx}>{subscriptionMeta({ cardLabel, categoria })}</Typography>
        {previousCurrency}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMoney(montoActual, moneda)}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMoneyOrDash(montoMensualArs, "ARS")}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{primerCobro}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        {ultimoCobro}
        {nextCharge}
      </TableCell>
      {variationCell}
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <Tooltip title="Ocultar: no es una suscripción" describeChild>
          <IconButton aria-label={`Ocultar ${nombre}`} onClick={() => onHide(key)}>
            <VisibilityOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton component={RouterLink} to={subscriptionTransactionsLink(busqueda)} aria-label={`Ver movimientos de ${nombre}`}>
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const SubscriptionsTable = ({ items, variant, onHide }: SubscriptionListProps) => {
  const variationHeader = variant === "activas" && <TableCell>Variación</TableCell>;
  const rows = items.map((item) => <SubscriptionRow key={item.key} item={item} variant={variant} onHide={onHide} />);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={TABLE_LABEL[variant]}>
        <TableHead>
          <TableRow>
            <TableCell>Comercio</TableCell>
            <TableCell align="right">{AMOUNT_LABEL[variant]}</TableCell>
            <TableCell align="right">En pesos</TableCell>
            <TableCell>Desde</TableCell>
            <TableCell>Último cobro</TableCell>
            {variationHeader}
            <TableCell align="right" aria-label="Acciones" />
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

Crear `client/src/components/HiddenSubscriptions.tsx`:

```tsx
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { tapTargetSx } from "./tapTarget.js";

interface HiddenSubscriptionsProps {
  items: SubscriptionDTO[];
  onShow: (key: string) => void;
}

const rowSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 2,
  py: 1,
  "&:not(:first-of-type)": { borderTop: 1, borderColor: "divider" },
};

export const HiddenSubscriptions = ({ items, onShow }: HiddenSubscriptionsProps) => {
  const rows = items.map(({ key, nombre, montoActual, moneda }) => (
    <Box key={key} sx={rowSx}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{nombre}</Typography>
        <Typography variant="caption" color="text.secondary">{formatMoney(montoActual, moneda)}</Typography>
      </Box>
      <Button size="small" aria-label={`Mostrar ${nombre}`} onClick={() => onShow(key)} sx={tapTargetSx}>Mostrar</Button>
    </Box>
  ));

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mt: 4 }}>
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{`Ocultas (${items.length})`}</Typography>
            <Typography variant="body2" color="text.secondary">No se suman a los totales.</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>{rows}</AccordionDetails>
      </Accordion>
    </MotionBox>
  );
};
```

Reemplazar `client/src/pages/SubscriptionsPage.tsx`:

```tsx
import { useCallback, useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useSetSubscriptionHidden, useSubscriptions } from "../api/hooks.js";
import { HiddenSubscriptions } from "../components/HiddenSubscriptions.js";
import { SubscriptionKpiCards } from "../components/SubscriptionKpiCards.js";
import { SubscriptionsTable } from "../components/SubscriptionsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { fadeUpItem } from "../components/motion/variants.js";
import { formatMoney } from "../format.js";
import { subscriptionSections } from "../subscriptions.js";

const INTRO = "Cobros que se repiten todos los meses en tus tarjetas: al menos 3 meses seguidos, con montos parecidos. No incluye cuotas ni impuestos.";
const EMPTY = "No encontramos cobros recurrentes. Hacen falta al menos 3 meses seguidos con un cobro del mismo comercio; importá más resúmenes desde Importar.";

const Header = () => (
  <>
    <Typography variant="h4" sx={{ mb: 1 }}>Suscripciones</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>{INTRO}</Typography>
  </>
);

export const SubscriptionsPage = () => {
  const { data, isLoading, isError } = useSubscriptions();
  const { mutate: setHidden } = useSetSubscriptionHidden();
  const sections = useMemo(() => subscriptionSections(data?.items ?? []), [data]);
  const hide = useCallback((key: string) => setHidden({ key, hidden: true }), [setHidden]);
  const show = useCallback((key: string) => setHidden({ key, hidden: false }), [setHidden]);

  if (isLoading) {
    return (
      <>
        <Header />
        <CircularProgress />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Header />
        <Typography color="error">No pudimos calcular las suscripciones.</Typography>
      </>
    );
  }

  if (data.items.length === 0) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{EMPTY}</Typography>
      </>
    );
  }

  const { activas, cortadas, ocultas, conUsd } = sections;
  const activeList = activas.length > 0
    ? <SubscriptionsTable items={activas} variant="activas" onHide={hide} />
    : <Typography color="text.secondary">No hay cobros recurrentes activos.</Typography>;
  const rateNote = conUsd && data.cotizacionOficial !== null && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      {`Dólares al oficial de hoy (${formatMoney(data.cotizacionOficial, "ARS")}), sin impuestos ni percepciones.`}
    </Typography>
  );
  const stoppedSection = cortadas.length > 0 && (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mt: 4 }}>
      <Typography variant="h6">Dejaron de cobrarse</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Sin cobro en el último resumen de la tarjeta.</Typography>
      <SubscriptionsTable items={cortadas} variant="cortadas" onHide={hide} />
    </MotionBox>
  );
  const hiddenSection = ocultas.length > 0 && <HiddenSubscriptions items={ocultas} onShow={show} />;

  return (
    <>
      <Header />
      <SubscriptionKpiCards report={data} sections={sections} />
      <Typography variant="h6" sx={{ mb: 1 }}>Activas</Typography>
      {activeList}
      {rateNote}
      {stoppedSection}
      {hiddenSection}
    </>
  );
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/SubscriptionsPage.test.tsx client/src/App.test.tsx`
Expected: PASS (la página y la ruta, que exige el `h4` mientras carga).

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/SubscriptionKpiCards.tsx client/src/components/SubscriptionsTable.tsx client/src/components/HiddenSubscriptions.tsx client/src/pages/SubscriptionsPage.tsx client/src/pages/SubscriptionsPage.test.tsx
git commit -m "feat(client): página de suscripciones con KPIs, tabla y ocultas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: UI en mobile — tarjetas

**Files:**
- Create: `client/src/components/SubscriptionCards.tsx`
- Modify: `client/src/pages/SubscriptionsPage.tsx` (elige tabla o tarjetas con `useIsMobile`)
- Test: `client/src/pages/SubscriptionsPage.test.tsx`

**Interfaces:**
- Consumes: `RecordCard`, `recordListSx`, `RecordField`; `MIN_TAP_SIZE`, `iconTapTargetSx`; `useIsMobile`; `client/src/subscriptions.ts`.
- Produces: `SubscriptionCards(props: SubscriptionListProps)`: un `article` por suscripción, con `aria-label` igual a `nombre`.

- [x] **Step 1: Write the failing test**

En `client/src/pages/SubscriptionsPage.test.tsx`, sumar `beforeEach` al import de `vitest`, `import { emulateMobile } from "../testing/viewport.js";`, y al final del archivo:

```tsx
describe("SubscriptionsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra tarjetas en lugar de tablas", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "MUSICAPP" });
    expect(within(card).getByText("+10,0%")).toBeInTheDocument();
    expect(within(card).getByText("ICBC · Suscripciones")).toBeInTheDocument();
    expect(within(card).getByText("Por mes")).toBeInTheDocument();
    const stopped = screen.getByRole("article", { name: "GIMNASIO NORTE" });
    expect(within(stopped).getByText("Último monto")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ocultar desde la tarjeta manda el PUT", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "STREAMFLIX.COM" });
    await userEvent.click(within(card).getByRole("button", { name: "Ocultar STREAMFLIX.COM" }));
    await waitFor(() => expect(mutations()).toEqual(["PUT /api/subscriptions/hidden/STREAMFLIX%20COM"]));
  });

  it("el detalle trae el próximo cobro, el aumento y el link a movimientos", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "MUSICAPP" });
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("2026-09-12")).toBeInTheDocument();
    expect(
      within(card).getByText(`${money(4990, "ARS")} → ${money(5490, "ARS")} desde marzo de 2026`),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Ver movimientos de MUSICAPP" }))
      .toHaveAttribute("href", "/transactions?year=all&search=MUSICAPP");
  });

  it("la moneda anterior aparece en el detalle", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "STREAMFLIX.COM" });
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("Antes se cobraba en pesos")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/SubscriptionsPage.test.tsx`
Expected: FAIL — en mobile la página sigue mostrando tablas: `Unable to find role="article"`.

- [x] **Step 3: Write minimal implementation**

Crear `client/src/components/SubscriptionCards.tsx`:

```tsx
import { Box, Chip, IconButton, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  increaseShortLabel,
  increaseSinceDetail,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, iconTapTargetSx } from "./tapTarget.js";

interface SubscriptionCardProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

const movementsLinkSx: SxProps<Theme> = { display: "inline-flex", alignItems: "center", minHeight: MIN_TAP_SIZE };

const highlightsOf = ({ montoActual, moneda, montoMensualArs }: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => [
  { label: AMOUNT_LABEL[variant], value: formatMoney(montoActual, moneda) },
  { label: "En pesos", value: formatMoneyOrDash(montoMensualArs, "ARS") },
];

const detailsOf = (item: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => {
  const { nombre, busqueda, primerCobro, ultimoCobro, proximoCobro, cobros, aumento, montoActual, moneda, monedaAnterior } = item;
  const nextCharge: RecordField[] = variant === "activas" ? [{ label: "Próximo cobro", value: proximoCobro }] : [];
  const increase: RecordField[] = aumento
    ? [{ label: "Aumento", value: increaseSinceDetail(aumento, montoActual, moneda) }]
    : [];
  const currency: RecordField[] = monedaAnterior ? [{ label: "Moneda", value: previousCurrencyLabel(monedaAnterior) }] : [];
  const movements = (
    <Link
      component={RouterLink}
      to={subscriptionTransactionsLink(busqueda)}
      aria-label={`Ver movimientos de ${nombre}`}
      sx={movementsLinkSx}
    >
      Ver movimientos
    </Link>
  );
  return [
    { label: "Desde", value: primerCobro },
    { label: "Último cobro", value: ultimoCobro },
    ...nextCharge,
    { label: "Cobros", value: String(cobros) },
    ...increase,
    ...currency,
    { label: "Movimientos", value: movements },
  ];
};

const SubscriptionCard = ({ item, variant, onHide }: SubscriptionCardProps) => {
  const badge = item.aumento ? <Chip size="small" color="warning" label={increaseShortLabel(item.aumento)} /> : undefined;
  const action = (
    <IconButton aria-label={`Ocultar ${item.nombre}`} onClick={() => onHide(item.key)} sx={iconTapTargetSx}>
      <VisibilityOffOutlinedIcon />
    </IconButton>
  );

  return (
    <RecordCard
      title={item.nombre}
      meta={subscriptionMeta(item)}
      badge={badge}
      action={action}
      highlights={highlightsOf(item, variant)}
      details={detailsOf(item, variant)}
    />
  );
};

export const SubscriptionCards = ({ items, variant, onHide }: SubscriptionListProps) => {
  const cards = items.map((item) => <SubscriptionCard key={item.key} item={item} variant={variant} onHide={onHide} />);
  return <Box sx={recordListSx}>{cards}</Box>;
};
```

En `client/src/pages/SubscriptionsPage.tsx`:

- sumar `import { SubscriptionCards } from "../components/SubscriptionCards.js";` y `import { useIsMobile } from "../useIsMobile.js";`;
- dentro del componente, después de `useSetSubscriptionHidden()`: `const isMobile = useIsMobile();`;
- antes de `const activeList`: `const SubscriptionList = isMobile ? SubscriptionCards : SubscriptionsTable;`;
- reemplazar los dos `<SubscriptionsTable ... />` por `<SubscriptionList ... />` (mismas props).

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/SubscriptionsPage.test.tsx client/src/App.test.tsx`
Expected: PASS (compu y mobile).

- [x] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/SubscriptionCards.tsx client/src/pages/SubscriptionsPage.tsx client/src/pages/SubscriptionsPage.test.tsx
git commit -m "feat(client): suscripciones en mobile con tarjetas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo en el repo (el script de lectura va al scratchpad y no se commitea).

- [x] **Step 1: Suite, typecheck y build**

Run: `bun run test` → todo en verde (anotar cualquier falla ajena a la feature que ya fallara en la base).
Run: `bun run typecheck` → sin errores.
Run: `bun run build` → build de Vite sin errores.

- [x] **Step 2: Motor contra la base local, solo lectura**

Si hay `MONGODB_URI` en el `.env` del repo principal y Mongo responde, correr desde el worktree un script en el scratchpad que conecte con Mongoose, lea `TransactionModel`, `StatementModel` y `HiddenSubscriptionModel` con las mismas queries que la ruta, llame a `detectSubscriptions` con `cotizacion: null` (sin red) e imprima solo la cantidad de suscripciones, sus monedas, estado y si tienen `monedaAnterior`/`aumento`. No escribe nada. Esperado: 5 cobros recurrentes (tres en USD, dos de ellos con `monedaAnterior: "ARS"`; uno en pesos con aumento ≈ 7 %; el débito del plan de ahorro). Si la base no está disponible, queda como pendiente para el usuario.

Resultado (2026-10-03, 16 resúmenes y 628 movimientos de consumo o devolución, sin ocultas): 5 cobros recurrentes, todos activos. Tres en USD (dos con `monedaAnterior: "ARS"`), uno en pesos con +6,7 % y el débito del plan de ahorro (+20,8 %, el valor móvil del plan). Una de las que pasaron a USD informa +48,9 % (de 4,66 a 6,94 USD entre junio y julio): con la regla del spec un aumento se informa con un solo cobro al precio nuevo; si julio fue el mes con impuestos incluidos, el aumento desaparece solo cuando entre el cobro de agosto.

- [ ] **Step 3: Revisión visual**

No se levanta la app (el 4100 es del servicio instalado y el 4000/5173 de otras sesiones). La revisión en el navegador, en compu y a 375 px, queda como pendiente para el usuario.
