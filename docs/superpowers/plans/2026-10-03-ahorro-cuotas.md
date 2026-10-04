# Cuánto te ahorran las cuotas sin interés — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a la página **Cuotas** una sección «Cuánto te ahorran las cuotas» que estima, con el IPC, cuánto valen hoy en pesos del mes de compra las cuotas en pesos que pagaste y vas a pagar, contra el precio de contado (la suma nominal de las cuotas), con KPIs (total, pagadas, a vencer), un gráfico de ahorro por comercio y una nota que explica el supuesto.

**Architecture:** El server reconstruye el cronograma de cada compra en cuotas a partir de sus apariciones en los resúmenes (`buildInstallmentPurchases` en un módulo puro, `server/src/stats/installmentPurchases.ts`) y lo sirve en `GET /api/stats/installment-purchases`. El cliente combina ese cronograma con el IPC que ya trae `useInflation()` en un módulo puro (`client/src/installmentSavings.ts`), un hook lo compone (`useInstallmentSavings`) y la sección solo pinta estructuras ya resueltas. La base (`feat/base-nuevas-features`) ya trae el DTO, el hook de API, el vencimiento estimado del resumen, la aritmética de meses y el factor de inflación con supuesto.

**Tech Stack:** TypeScript, Express + Mongoose (server), React 18 + MUI 6 + `@nivo/bar` + React Query 5 (cliente), Zod DTOs en `shared`, Vitest + supertest + `mongodb-memory-server`, Testing Library en jsdom, bun.

**Spec:** `docs/superpowers/specs/2026-10-03-ahorro-cuotas-design.md`

## Prerrequisitos

1. Rama `feat/ahorro-cuotas`, creada desde `feat/base-nuevas-features`, con `bun install` hecho. Verificar que la base trae lo que se usa:

   ```bash
   grep -n "export function statementDueDate" server/src/stats/statementDueDate.ts
   grep -n "export function addMonthsClamped" server/src/stats/months.ts
   grep -n "export const installmentPurchaseDtoSchema" shared/src/dtos.ts
   grep -n "export function useInstallmentPurchases" client/src/api/hooks.ts
   grep -n "export function inflationFactorBetween" client/src/inflationIndex.ts
   grep -n "export const todayIso" client/src/isoDate.ts
   ```

   Las seis tienen que dar resultado.
2. **No tocar**: `shared/*`, `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/stats/{months,statementDueDate,rateOnDate,futureInstallments,lastStatement}.ts`, `client/src/api/hooks.ts`, `client/src/inflationIndex.ts`, `client/src/isoDate.ts`, `client/src/format.ts`, `client/src/App.tsx`, `client/src/components/layout/*`, `DashboardPage.tsx`, `ImportPage.tsx`, `package.json`s, `bun.lock`, `.env.example`, `README.md`. En `server/src/http/routes/stats.ts` no cambiar `baseMatch` ni las rutas existentes.
3. No levantar la app (el puerto 4100 es del servicio instalado; 4000/5173, de otras sesiones).

## Global Constraints

- **Solo pesos**: el endpoint filtra `currency: "ARS"`, `type: "purchase"`, `direction: "debit"`, `isInstallment: true` e ignora el `currency` del query; la sección no se renderiza con Moneda = USD.
- **Clave de compra**: `cardLabel | date | merchant | installmentTotal | comprobante ?? ""` (unidos con `|`).
- **Fecha de pago**: `statementDueDate({ dueDate, closingDate })` (vencimiento o cierre + 12 días); proyección de cuotas no vistas con `addMonthsClamped(ancla.paymentDate, numero - ancla.numero)`.
- **Factor**: `inflationFactorBetween(rates, mes(compra), mes(pago), assumption)` con `assumption = latestInflation(inflation)`; `realValue = amount / factor`; `paid = paymentDate <= today`.
- **Año** filtra por año de **compra**; Tarjeta aplica. Las opciones del selector de año no cambian.
- **Top 8 comercios** en el gráfico; colores `seriesColor(mode, 2)` (Pagadas) y `seriesColor(mode, 3)` (A vencer).
- **Textos exactos**: título «Cuánto te ahorran las cuotas», chip «Estimación», KPIs «Ahorro real» / «En cuotas pagadas» / «En cuotas a vencer», gráfico «Ahorro real por comercio», vacío del gráfico «Sin ahorro para mostrar», error «No se pudo calcular el ahorro de las cuotas.», sin IPC «Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de la barra superior para traerla.».
- **Sin comentarios en el código** (regla global del usuario): nombres autoexplicativos.
- **Componentes React**: funcionales, destructuring en la firma, fragments cortos, early returns para carga/error/vacío, `key` con id único, lógica y textos derivados antes del `return`, tipos explícitos, `any` prohibido.
- **Tests del cliente**: el auto-cleanup de Testing Library está apagado; todo archivo con varios `render` lleva `afterEach(cleanup)`. Fixtures siempre sintéticos.
- **Correr tests**: `bunx vitest run <archivo>`; typecheck: `bun run typecheck`; suite: `bun run test`; build: `bun run build`.
- **Commits**: uno por task en `feat/ahorro-cuotas`, con el mensaje exacto del task, pathspec explícito (nunca `git add -A` ni `git add .`) y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca push, PR ni merge.

## Review Focus

- **Compra que dejó de aparecer** (se dejó de importar resúmenes, o se canceló): sus cuotas restantes se proyectan desde la más alta vista y, si la fecha ya pasó, cuentan como pagadas. Lo pinea el test de reconstrucción hacia adelante (Task 1) y el de pagada/a vencer por fecha (Task 3).
- **Cuota repetida** (dos apariciones con el mismo número, p. ej. un resumen reimportado con otro hash): gana la fecha más temprana y no se duplica el contado. Test en Task 1.
- **Datos rotos de cuotas** (`installmentCurrent` 0 o mayor que el total): se descartan en vez de inventar un cronograma. Test en Task 1.
- **IPC negativo**: el ahorro da negativo y el KPI dice «más que de contado» en lugar de «menos». Tests en Task 3 y Task 5.
- **Falla de red** en compras o en inflación: la sección dice que no pudo calcular, no muestra un vacío engañoso ni la instrucción del IPC. Test en Task 5.

---

### Task 1: Cronograma de cada compra en cuotas (server, puro)

**Files:**
- Create: `server/src/stats/installmentPurchases.ts`
- Test: `server/src/stats/installmentPurchases.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped(iso: string, months: number): string` de `server/src/stats/months.ts`; tipos `InstallmentPurchaseDTO`, `InstallmentScheduleEntry` de `@ledgerly/shared`.
- Produces: `interface InstallmentOccurrence { cardLabel; merchant; category; date; amount; installmentCurrent; installmentTotal; comprobante: string | null; paymentDate }`, `purchaseKey(occurrence: InstallmentOccurrence): string`, `buildInstallmentPurchases(occurrences: InstallmentOccurrence[]): InstallmentPurchaseDTO[]`. Los usa la ruta (Task 2).

- [ ] **Step 1: Write the failing test**

Crear `server/src/stats/installmentPurchases.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildInstallmentPurchases, purchaseKey, type InstallmentOccurrence } from "./installmentPurchases.js";

const occurrence = (overrides: Partial<InstallmentOccurrence> = {}): InstallmentOccurrence => ({
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  date: "2026-05-04",
  amount: 1500,
  installmentCurrent: 1,
  installmentTotal: 3,
  comprobante: "1",
  paymentDate: "2026-06-14",
  ...overrides,
});

const schedule = (occurrences: InstallmentOccurrence[]) =>
  buildInstallmentPurchases(occurrences).map((purchase) => purchase.installments);

describe("purchaseKey", () => {
  it("une tarjeta, fecha, comercio, total de cuotas y comprobante", () => {
    expect(purchaseKey(occurrence())).toBe("ICBC|2026-05-04|MERCADOLIBRE|3|1");
  });

  it("sin comprobante usa un texto vacío", () => {
    expect(purchaseKey(occurrence({ comprobante: null }))).toBe("ICBC|2026-05-04|MERCADOLIBRE|3|");
  });
});

describe("buildInstallmentPurchases", () => {
  it("agrupa la misma compra vista en dos resúmenes y proyecta la cuota que falta un mes después", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
    ]);
    expect(purchases).toEqual([
      {
        id: "ICBC|2026-05-04|MERCADOLIBRE|3|1",
        cardLabel: "ICBC",
        merchant: "MERCADOLIBRE",
        category: "Compras",
        purchaseDate: "2026-05-04",
        installmentTotal: 3,
        installments: [
          { number: 1, amount: 1500, paymentDate: "2026-06-14" },
          { number: 2, amount: 1500, paymentDate: "2026-07-14" },
          { number: 3, amount: 1500, paymentDate: "2026-08-14" },
        ],
      },
    ]);
  });

  it("reconstruye hacia atrás las cuotas anteriores al primer resumen importado", () => {
    expect(schedule([occurrence({ installmentCurrent: 3, installmentTotal: 4, paymentDate: "2026-08-14" })])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
      { number: 4, amount: 1500, paymentDate: "2026-09-14" },
    ]]);
  });

  it("dos cuotas facturadas en el mismo resumen conservan la fecha real de cada una", () => {
    expect(schedule([
      occurrence({ installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
      occurrence({ installmentCurrent: 3, paymentDate: "2026-07-14" }),
    ])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-07-14" },
    ]]);
  });

  it("si una cuota aparece dos veces se queda con la fecha más temprana", () => {
    expect(schedule([
      occurrence({ installmentCurrent: 2, paymentDate: "2026-08-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
    ])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
    ]]);
  });

  it("la cuota 1 con centavos distintos no parte la compra y conserva su monto real", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 1, amount: 1500.02, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, amount: 1500, paymentDate: "2026-07-14" }),
    ]);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].installments.map((entry) => entry.amount)).toEqual([1500.02, 1500, 1500]);
  });

  it("distinto comprobante o distinto comercio son compras distintas", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ comprobante: "1" }),
      occurrence({ comprobante: "2" }),
      occurrence({ comprobante: "1", merchant: "FRAVEGA" }),
    ]);
    expect(purchases.map((purchase) => purchase.id)).toEqual([
      "ICBC|2026-05-04|FRAVEGA|3|1",
      "ICBC|2026-05-04|MERCADOLIBRE|3|1",
      "ICBC|2026-05-04|MERCADOLIBRE|3|2",
    ]);
  });

  it("la categoría sale de la aparición más reciente", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 2, category: "Hogar", paymentDate: "2026-07-14" }),
      occurrence({ installmentCurrent: 1, category: "Sin categoría", paymentDate: "2026-06-14" }),
    ]);
    expect(purchases[0].category).toBe("Hogar");
  });

  it("descarta las cuotas con número fuera del plan", () => {
    expect(buildInstallmentPurchases([
      occurrence({ installmentCurrent: 4, installmentTotal: 3 }),
      occurrence({ installmentCurrent: 0, installmentTotal: 3 }),
    ])).toEqual([]);
  });

  it("al proyectar a un mes más corto recorta el día al último del mes", () => {
    expect(schedule([occurrence({ installmentCurrent: 2, paymentDate: "2026-01-31" })])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2025-12-31" },
      { number: 2, amount: 1500, paymentDate: "2026-01-31" },
      { number: 3, amount: 1500, paymentDate: "2026-02-28" },
    ]]);
  });

  it("ordena las compras por fecha de compra y comercio, y las cuotas por número", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ merchant: "ZARA", installmentCurrent: 2, paymentDate: "2026-07-14" }),
      occurrence({ merchant: "ZARA", installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ merchant: "ADIDAS" }),
      occurrence({ merchant: "COTO", date: "2026-04-01" }),
    ]);
    expect(purchases.map((purchase) => purchase.merchant)).toEqual(["COTO", "ADIDAS", "ZARA"]);
    expect(purchases[2].installments.map((entry) => entry.number)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/installmentPurchases.test.ts`
Expected: FAIL — no se puede resolver `./installmentPurchases.js`.

- [ ] **Step 3: Write minimal implementation**

Crear `server/src/stats/installmentPurchases.ts`:

```typescript
import type { InstallmentPurchaseDTO, InstallmentScheduleEntry } from "@ledgerly/shared";
import { addMonthsClamped } from "./months.js";

export interface InstallmentOccurrence {
  cardLabel: string;
  merchant: string;
  category: string;
  date: string;
  amount: number;
  installmentCurrent: number;
  installmentTotal: number;
  comprobante: string | null;
  paymentDate: string;
}

interface SeenInstallment {
  amount: number;
  paymentDate: string;
}

export function purchaseKey({ cardLabel, date, merchant, installmentTotal, comprobante }: InstallmentOccurrence): string {
  return [cardLabel, date, merchant, installmentTotal, comprobante ?? ""].join("|");
}

const isWithinPlan = ({ installmentCurrent, installmentTotal }: InstallmentOccurrence): boolean =>
  Number.isInteger(installmentCurrent) && installmentCurrent >= 1 && installmentCurrent <= installmentTotal;

const groupByPurchase = (occurrences: InstallmentOccurrence[]): Map<string, InstallmentOccurrence[]> => {
  const groups = new Map<string, InstallmentOccurrence[]>();
  for (const occurrence of occurrences.filter(isWithinPlan)) {
    const key = purchaseKey(occurrence);
    groups.set(key, [...(groups.get(key) ?? []), occurrence]);
  }
  return groups;
};

const seenInstallments = (group: InstallmentOccurrence[]): Map<number, SeenInstallment> => {
  const seen = new Map<number, SeenInstallment>();
  for (const { installmentCurrent, amount, paymentDate } of group) {
    const previous = seen.get(installmentCurrent);
    if (!previous || paymentDate < previous.paymentDate) seen.set(installmentCurrent, { amount, paymentDate });
  }
  return seen;
};

const buildSchedule = (seen: Map<number, SeenInstallment>, installmentTotal: number): InstallmentScheduleEntry[] => {
  const [anchorNumber, anchor] = [...seen.entries()].reduce((best, entry) => (entry[0] > best[0] ? entry : best));
  return Array.from({ length: installmentTotal }, (_, index) => {
    const number = index + 1;
    const real = seen.get(number);
    if (real) return { number, amount: real.amount, paymentDate: real.paymentDate };
    return { number, amount: anchor.amount, paymentDate: addMonthsClamped(anchor.paymentDate, number - anchorNumber) };
  });
};

const latestCategory = (group: InstallmentOccurrence[]): string =>
  group.reduce((latest, occurrence) => (occurrence.paymentDate > latest.paymentDate ? occurrence : latest)).category;

const toPurchase = (id: string, group: InstallmentOccurrence[]): InstallmentPurchaseDTO => {
  const [{ cardLabel, merchant, date, installmentTotal }] = group;
  return {
    id,
    cardLabel,
    merchant,
    category: latestCategory(group),
    purchaseDate: date,
    installmentTotal,
    installments: buildSchedule(seenInstallments(group), installmentTotal),
  };
};

const byPurchaseDateThenMerchant = (a: InstallmentPurchaseDTO, b: InstallmentPurchaseDTO): number =>
  a.purchaseDate.localeCompare(b.purchaseDate) || a.merchant.localeCompare(b.merchant) || a.id.localeCompare(b.id);

export function buildInstallmentPurchases(occurrences: InstallmentOccurrence[]): InstallmentPurchaseDTO[] {
  return [...groupByPurchase(occurrences)]
    .map(([id, group]) => toPurchase(id, group))
    .sort(byPurchaseDateThenMerchant);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/stats/installmentPurchases.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/stats/installmentPurchases.ts server/src/stats/installmentPurchases.test.ts
git commit -m "feat(server): cronograma de cada compra en cuotas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `GET /api/stats/installment-purchases`

**Files:**
- Modify: `server/src/http/routes/stats.ts` (imports arriba; ruta nueva al final del archivo)
- Test: `server/src/http/routes/stats.test.ts` (bloque `describe("installment-purchases")` nuevo al final)

**Interfaces:**
- Consumes: `buildInstallmentPurchases`, `InstallmentOccurrence` (Task 1); `statementDueDate({ dueDate, closingDate }: { dueDate: string | null; closingDate: string | null }): string | null` de `server/src/stats/statementDueDate.ts`; `parseYears`, `monthInYears` de `server/src/http/yearFilter.ts` (ya importados en `stats.ts`).
- Produces: `GET /api/stats/installment-purchases?cardLabel=&year=` → `InstallmentPurchaseDTO[]`, que consume `useInstallmentPurchases` (ya en la base).

- [ ] **Step 1: Write the failing test**

Al final de `server/src/http/routes/stats.test.ts` (fuera del `describe("stats")`), agregar:

```typescript
describe("installment-purchases", () => {
  const createStatement = (overrides: Record<string, unknown>) => StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "x.pdf", sourceHash: `h-${Math.random()}`, pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
    ...overrides,
  });

  const installmentRow = (statementId: unknown, overrides: Record<string, unknown>) => ({
    statementId, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-07-20"), descriptionRaw: "R",
    merchant: "FRAVEGA", category: "Hogar", categorySource: "rule", amount: 700, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 1, installmentTotal: 2,
    comprobante: "30", fingerprint: `f-${Math.random()}`,
    ...overrides,
  });

  const mercadolibre = {
    id: "ICBC|2026-05-04|MERCADOLIBRE|4|1",
    cardLabel: "ICBC",
    merchant: "MERCADOLIBRE",
    category: "Compras",
    purchaseDate: "2026-05-04",
    installmentTotal: 4,
    installments: [
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
      { number: 4, amount: 1500, paymentDate: "2026-09-14" },
    ],
  };

  it("arma el cronograma con el vencimiento estimado a 12 días del cierre y deja afuera lo que no es cuota", async () => {
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([mercadolibre]);
  });

  it("usa el vencimiento del resumen cuando lo trae", async () => {
    const statement = await createStatement({ closingDate: new Date("2026-07-28"), dueDate: new Date("2026-08-10") });
    await TransactionModel.create(installmentRow(statement._id, {}));
    const res = await request(app).get("/api/stats/installment-purchases");
    const fravega = res.body.find((purchase: { merchant: string }) => purchase.merchant === "FRAVEGA");
    expect(fravega.installments).toEqual([
      { number: 1, amount: 700, paymentDate: "2026-08-10" },
      { number: 2, amount: 700, paymentDate: "2026-09-10" },
    ]);
  });

  it("deja afuera las cuotas en dólares y los créditos", async () => {
    const statement = await StatementModel.findOne({});
    await TransactionModel.insertMany([
      installmentRow(statement!._id, { merchant: "AMAZON", currency: "USD" }),
      installmentRow(statement!._id, { merchant: "DEVOLUCION", direction: "credit" }),
    ]);
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.body).toEqual([mercadolibre]);
  });

  it("descarta las cuotas de resúmenes sin cierre ni vencimiento", async () => {
    const statement = await createStatement({});
    await TransactionModel.create(installmentRow(statement._id, {}));
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.body).toEqual([mercadolibre]);
  });

  it("filtra por año de compra", async () => {
    const other = await request(app).get("/api/stats/installment-purchases?year=2025");
    expect(other.body).toEqual([]);
    const same = await request(app).get("/api/stats/installment-purchases?year=2025&year=2026");
    expect(same.body).toEqual([mercadolibre]);
  });

  it("respeta la tarjeta", async () => {
    const otherCard = await request(app).get("/api/stats/installment-purchases?cardLabel=VISA1");
    expect(otherCard.body).toEqual([]);
    const icbc = await request(app).get("/api/stats/installment-purchases?cardLabel=ICBC");
    expect(icbc.body).toEqual([mercadolibre]);
  });

  it("ignora la moneda del pedido: siempre son cuotas en pesos", async () => {
    const res = await request(app).get("/api/stats/installment-purchases?currency=USD");
    expect(res.body).toEqual([mercadolibre]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/stats.test.ts -t "installment-purchases"`
Expected: FAIL — la ruta responde 404 (`res.status` 404, `res.body` `{}`).

- [ ] **Step 3: Write minimal implementation**

En `server/src/http/routes/stats.ts`, sumar a los imports:

```typescript
import { buildInstallmentPurchases, type InstallmentOccurrence } from "../../stats/installmentPurchases.js";
import { statementDueDate } from "../../stats/statementDueDate.js";
```

Después de `latestStatementInstallmentTxs` (antes de `export const statsRouter`), agregar:

```typescript
const isoDay = (date: Date | null | undefined): string | null => (date ? date.toISOString().slice(0, 10) : null);

async function installmentOccurrences(cardLabel: unknown): Promise<InstallmentOccurrence[]> {
  const statements = await StatementModel.find(typeof cardLabel === "string" ? { cardLabel } : {}).lean();
  const paymentDates = new Map(statements.map((s) => [
    String(s._id),
    statementDueDate({ dueDate: isoDay(s.dueDate), closingDate: isoDay(s.closingDate) }),
  ]));
  const txs = await TransactionModel.find({
    type: "purchase", direction: "debit", currency: "ARS", isInstallment: true,
    statementId: { $in: statements.map((s) => s._id) },
  }).lean();
  return txs.flatMap((t) => {
    const paymentDate = paymentDates.get(String(t.statementId)) ?? null;
    const installmentCurrent = t.installmentCurrent ?? null;
    const installmentTotal = t.installmentTotal ?? null;
    if (paymentDate === null || installmentCurrent === null || installmentTotal === null) return [];
    return [{
      cardLabel: t.cardLabel,
      merchant: t.merchant,
      category: t.category,
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      installmentCurrent,
      installmentTotal,
      comprobante: t.comprobante ?? null,
      paymentDate,
    }];
  });
}
```

Y al final del archivo:

```typescript
statsRouter.get("/installment-purchases", asyncHandler(async (req, res) => {
  const years = parseYears(req.query.year);
  const purchases = buildInstallmentPurchases(await installmentOccurrences(req.query.cardLabel));
  res.json(purchases.filter((purchase) => monthInYears(purchase.purchaseDate.slice(0, 7), years)));
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS (los tests de `stats` existentes y los 7 nuevos).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "feat(server): endpoint de compras en cuotas con su cronograma" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Motor de ahorro real (cliente, puro)

**Files:**
- Create: `client/src/installmentSavings.ts`
- Test: `client/src/installmentSavings.test.ts`

**Interfaces:**
- Consumes: `inflationRates(inflation): Map<string, number>`, `latestInflation(inflation): InflationAssumption | null`, `inflationFactorBetween(rates, desde, hasta, assumption): { factor; estimated }` y el tipo `InflationAssumption` de `client/src/inflationIndex.ts`; `monthOf(fecha): string` de `client/src/isoDate.ts`; tipos `InflationRateDTO`, `InstallmentPurchaseDTO`, `InstallmentScheduleEntry` de `@ledgerly/shared`.
- Produces: tipos `InstallmentSaving`, `PurchaseSaving`, `InstallmentSavingsSummary`, `MerchantSaving` (ver el spec) y `computeInstallmentSavings(purchases, inflation, today): InstallmentSavingsSummary | null`, `savingsByMerchant(purchases: PurchaseSaving[], limit: number): MerchantSaving[]`. Los usan el gráfico (Task 4), el hook y la sección (Task 5).

- [ ] **Step 1: Write the failing test**

Crear `client/src/installmentSavings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { InflationRateDTO, InstallmentPurchaseDTO } from "@ledgerly/shared";
import { computeInstallmentSavings, savingsByMerchant, type PurchaseSaving } from "./installmentSavings.js";

const purchase = (overrides: Partial<InstallmentPurchaseDTO> = {}): InstallmentPurchaseDTO => ({
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1",
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
  ...overrides,
});

const inflation: InflationRateDTO[] = [
  { periodo: "2026-03", variacionMensual: 2 },
  { periodo: "2026-02", variacionMensual: 2 },
];

describe("computeInstallmentSavings", () => {
  it("calcula el ejemplo del spec: cuotas pagadas con IPC y la que falta con el supuesto", () => {
    const summary = computeInstallmentSavings([purchase()], inflation, "2026-03-20")!;
    const [first] = summary.purchases;
    expect(first.installments.map((entry) => entry.realValue)).toEqual([
      expect.closeTo(980.39, 2),
      expect.closeTo(961.17, 2),
      expect.closeTo(942.32, 2),
    ]);
    expect(first.installments.map((entry) => entry.paid)).toEqual([true, true, false]);
    expect(first.installments.map((entry) => entry.estimated)).toEqual([false, false, true]);
    expect(first.cashPrice).toBe(3000);
    expect(first.saving).toBeCloseTo(116.12, 2);
    expect(summary.cashPrice).toBe(3000);
    expect(summary.realValue).toBeCloseTo(2883.88, 2);
    expect(summary.saving).toBeCloseTo(116.12, 2);
    expect(summary.savingPercent).toBeCloseTo(3.87, 2);
    expect(summary.paidSaving).toBeCloseTo(58.44, 2);
    expect(summary.futureSaving).toBeCloseTo(57.68, 2);
    expect(summary).toMatchObject({
      paidCount: 2,
      futureCount: 1,
      estimatedPaidCount: 0,
      assumption: { periodo: "2026-03", variacionMensual: 2 },
    });
  });

  it("una cuota que vence hoy cuenta como pagada y la del día siguiente, no", () => {
    const onDueDate = computeInstallmentSavings([purchase()], inflation, "2026-03-10")!;
    expect(onDueDate.purchases[0].installments.map((entry) => entry.paid)).toEqual([true, true, false]);
    const dayBefore = computeInstallmentSavings([purchase()], inflation, "2026-03-09")!;
    expect(dayBefore.purchases[0].installments.map((entry) => entry.paid)).toEqual([true, false, false]);
  });

  it("cuenta las cuotas pagadas en un mes sin IPC publicado", () => {
    const onlyFebruary: InflationRateDTO[] = [{ periodo: "2026-02", variacionMensual: 2 }];
    const summary = computeInstallmentSavings([purchase()], onlyFebruary, "2026-03-20")!;
    expect(summary.estimatedPaidCount).toBe(1);
    expect(summary.purchases[0].installments.map((entry) => entry.estimated)).toEqual([false, true, true]);
  });

  it("una cuota pagada en el mismo mes de la compra no ahorra nada", () => {
    const sameMonth = purchase({
      purchaseDate: "2026-02-01",
      installmentTotal: 1,
      installments: [{ number: 1, amount: 1000, paymentDate: "2026-02-25" }],
    });
    const summary = computeInstallmentSavings([sameMonth], inflation, "2026-03-20")!;
    expect(summary.saving).toBe(0);
    expect(summary.purchases[0].installments[0].estimated).toBe(false);
  });

  it("con IPC negativo el ahorro da negativo", () => {
    const deflation: InflationRateDTO[] = [{ periodo: "2026-02", variacionMensual: -1 }];
    const single = purchase({ installmentTotal: 1, installments: [{ number: 1, amount: 1000, paymentDate: "2026-02-10" }] });
    const summary = computeInstallmentSavings([single], deflation, "2026-03-20")!;
    expect(summary.saving).toBeCloseTo(-10.1, 2);
    expect(summary.savingPercent).toBeLessThan(0);
  });

  it("sin inflación no puede estimar", () => {
    expect(computeInstallmentSavings([purchase()], [], "2026-03-20")).toBeNull();
  });

  it("sin compras devuelve un resumen en cero", () => {
    expect(computeInstallmentSavings([], inflation, "2026-03-20")).toEqual({
      purchases: [],
      cashPrice: 0,
      realValue: 0,
      saving: 0,
      savingPercent: 0,
      paidSaving: 0,
      futureSaving: 0,
      paidCount: 0,
      futureCount: 0,
      estimatedPaidCount: 0,
      assumption: { periodo: "2026-03", variacionMensual: 2 },
    });
  });
});

const purchaseSaving = (id: string, merchant: string, paidSaving: number, futureSaving: number): PurchaseSaving => ({
  id,
  merchant,
  cardLabel: "ICBC",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  cashPrice: 1000,
  realValue: 1000 - paidSaving - futureSaving,
  saving: paidSaving + futureSaving,
  savingPercent: (paidSaving + futureSaving) / 10,
  paidSaving,
  futureSaving,
  installments: [],
});

describe("savingsByMerchant", () => {
  it("agrupa por comercio, cuenta compras, ordena por ahorro y corta en el límite", () => {
    const merchants = savingsByMerchant([
      purchaseSaving("a1", "MERCADOLIBRE", 10, 5),
      purchaseSaving("b1", "FRAVEGA", 30, 0),
      purchaseSaving("a2", "MERCADOLIBRE", 1, 2),
      purchaseSaving("c1", "COTO", 1, 1),
    ], 2);
    expect(merchants).toEqual([
      { merchant: "FRAVEGA", paidSaving: 30, futureSaving: 0, saving: 30, purchaseCount: 1 },
      { merchant: "MERCADOLIBRE", paidSaving: 11, futureSaving: 7, saving: 18, purchaseCount: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/installmentSavings.test.ts`
Expected: FAIL — no se puede resolver `./installmentSavings.js`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/installmentSavings.ts`:

```typescript
import type { InflationRateDTO, InstallmentPurchaseDTO, InstallmentScheduleEntry } from "@ledgerly/shared";
import { inflationFactorBetween, inflationRates, latestInflation, type InflationAssumption } from "./inflationIndex.js";
import { monthOf } from "./isoDate.js";

export interface InstallmentSaving {
  number: number;
  amount: number;
  paymentDate: string;
  paid: boolean;
  realValue: number;
  saving: number;
  estimated: boolean;
}

export interface PurchaseSaving {
  id: string;
  merchant: string;
  cardLabel: string;
  category: string;
  purchaseDate: string;
  installmentTotal: number;
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  installments: InstallmentSaving[];
}

export interface InstallmentSavingsSummary {
  purchases: PurchaseSaving[];
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  paidCount: number;
  futureCount: number;
  estimatedPaidCount: number;
  assumption: InflationAssumption;
}

export interface MerchantSaving {
  merchant: string;
  paidSaving: number;
  futureSaving: number;
  saving: number;
  purchaseCount: number;
}

interface SavingContext {
  rates: Map<string, number>;
  assumption: InflationAssumption;
  today: string;
}

const sumBy = <T>(items: T[], value: (item: T) => number): number => items.reduce((acc, item) => acc + value(item), 0);

const percentOf = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);

const installmentSaving = (
  { number, amount, paymentDate }: InstallmentScheduleEntry,
  purchaseMonth: string,
  { rates, assumption, today }: SavingContext,
): InstallmentSaving => {
  const { factor, estimated } = inflationFactorBetween(rates, purchaseMonth, monthOf(paymentDate), assumption);
  const realValue = amount / factor;
  return { number, amount, paymentDate, paid: paymentDate <= today, realValue, saving: amount - realValue, estimated };
};

const purchaseSaving = (purchase: InstallmentPurchaseDTO, context: SavingContext): PurchaseSaving => {
  const { id, merchant, cardLabel, category, purchaseDate, installmentTotal } = purchase;
  const installments = purchase.installments.map((entry) => installmentSaving(entry, monthOf(purchaseDate), context));
  const cashPrice = sumBy(installments, (entry) => entry.amount);
  const realValue = sumBy(installments, (entry) => entry.realValue);
  const saving = cashPrice - realValue;
  return {
    id,
    merchant,
    cardLabel,
    category,
    purchaseDate,
    installmentTotal,
    cashPrice,
    realValue,
    saving,
    savingPercent: percentOf(saving, cashPrice),
    paidSaving: sumBy(installments.filter((entry) => entry.paid), (entry) => entry.saving),
    futureSaving: sumBy(installments.filter((entry) => !entry.paid), (entry) => entry.saving),
    installments,
  };
};

export function computeInstallmentSavings(
  purchases: InstallmentPurchaseDTO[],
  inflation: InflationRateDTO[],
  today: string,
): InstallmentSavingsSummary | null {
  const assumption = latestInflation(inflation);
  if (assumption === null) return null;
  const context: SavingContext = { rates: inflationRates(inflation), assumption, today };
  const purchaseSavings = purchases.map((purchase) => purchaseSaving(purchase, context));
  const installments = purchaseSavings.flatMap((saving) => saving.installments);
  const paid = installments.filter((entry) => entry.paid);
  const cashPrice = sumBy(purchaseSavings, (saving) => saving.cashPrice);
  const realValue = sumBy(purchaseSavings, (saving) => saving.realValue);
  const saving = cashPrice - realValue;
  return {
    purchases: purchaseSavings,
    cashPrice,
    realValue,
    saving,
    savingPercent: percentOf(saving, cashPrice),
    paidSaving: sumBy(purchaseSavings, (purchase) => purchase.paidSaving),
    futureSaving: sumBy(purchaseSavings, (purchase) => purchase.futureSaving),
    paidCount: paid.length,
    futureCount: installments.length - paid.length,
    estimatedPaidCount: paid.filter((entry) => entry.estimated).length,
    assumption,
  };
}

export function savingsByMerchant(purchases: PurchaseSaving[], limit: number): MerchantSaving[] {
  const byMerchant = new Map<string, MerchantSaving>();
  for (const { merchant, paidSaving, futureSaving, saving } of purchases) {
    const current = byMerchant.get(merchant) ?? { merchant, paidSaving: 0, futureSaving: 0, saving: 0, purchaseCount: 0 };
    byMerchant.set(merchant, {
      merchant,
      paidSaving: current.paidSaving + paidSaving,
      futureSaving: current.futureSaving + futureSaving,
      saving: current.saving + saving,
      purchaseCount: current.purchaseCount + 1,
    });
  }
  return [...byMerchant.values()].sort((a, b) => b.saving - a.saving).slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/installmentSavings.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/installmentSavings.ts client/src/installmentSavings.test.ts
git commit -m "feat(client): motor del ahorro real de las cuotas sin interés" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gráfico «Ahorro real por comercio»

**Files:**
- Create: `client/src/components/charts/InstallmentSavingsByMerchantChart.tsx`
- Test: `client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx`

**Interfaces:**
- Consumes: `MerchantSaving` (Task 3); `seriesColor(mode, slot)` de `./palette.js`; `nivoTheme(theme)`; `truncateLabel`, `useChartLayout` de `./useChartLayout.js`; `compactBarTooltip({ showKey })` de `./ChartTooltip.js`; `ChartLegendItem` de `./ChartLegend.js`; `formatMoney`, `formatMoneyCompact` de `../../format.js`.
- Produces: `InstallmentSavingsByMerchantChart({ merchants }: { merchants: MerchantSaving[] })` y `savingsLegendItems(mode: PaletteMode): ChartLegendItem[]` (Pagadas = ranura 2, A vencer = ranura 3), que usa la sección (Task 5) para la leyenda.

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { MerchantSaving } from "../../installmentSavings.js";
import { seriesColor } from "./palette.js";
import { InstallmentSavingsByMerchantChart, savingsLegendItems } from "./InstallmentSavingsByMerchantChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

const merchants: MerchantSaving[] = [
  { merchant: "MERCADOLIBRE SUPERMERCADO", paidSaving: 120, futureSaving: 40, saving: 160, purchaseCount: 2 },
  { merchant: "FRAVEGA", paidSaving: 50, futureSaving: 0, saving: 50, purchaseCount: 1 },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("InstallmentSavingsByMerchantChart", () => {
  it("en mobile saca el eje de montos, angosta la columna de nombres y usa el tooltip compacto", () => {
    emulateMobile();
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart()).toMatchObject({ axisBottom: "none", customTooltip: "yes", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu muestra el eje de montos con la columna de nombres ancha", () => {
    emulateDesktop();
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart()).toMatchObject({ axisBottom: "shown", customTooltip: "no", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });

  it("pinta pagadas y a vencer con las ranuras 2 y 3 de la paleta, igual que la leyenda", () => {
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart().colors).toEqual([seriesColor("dark", 2), seriesColor("dark", 3)]);
    expect(savingsLegendItems("dark")).toEqual([
      { id: "paid", label: "Pagadas", color: seriesColor("dark", 2) },
      { id: "future", label: "A vencer", color: seriesColor("dark", 3) },
    ]);
  });

  it("sin comercios dice que no hay ahorro para mostrar", () => {
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={[]} />);
    expect(screen.getByText("Sin ahorro para mostrar")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });
});
```

(El tema de los tests arranca en modo oscuro: `useColorModeState` usa `"dark"` por defecto.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx`
Expected: FAIL — no se puede resolver `./InstallmentSavingsByMerchantChart.js`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/components/charts/InstallmentSavingsByMerchantChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme, type PaletteMode } from "@mui/material";
import type { MerchantSaving } from "../../installmentSavings.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { truncateLabel, useChartLayout } from "./useChartLayout.js";
import { compactBarTooltip } from "./ChartTooltip.js";
import type { ChartLegendItem } from "./ChartLegend.js";

interface InstallmentSavingsByMerchantChartProps {
  merchants: MerchantSaving[];
}

const PAID_LABEL = "Pagadas";
const FUTURE_LABEL = "A vencer";
const DESKTOP_MARGIN = { top: 8, right: 24, bottom: 32, left: 136 };
const MOBILE_MARGIN = { top: 8, right: 24, bottom: 8, left: 96 };
const DESKTOP_LABEL_MAX = 16;
const MOBILE_LABEL_MAX = 11;
const MobileBarTooltip = compactBarTooltip({ showKey: true });

const money = (value: number): string => formatMoney(value, "ARS");

export const savingsLegendItems = (mode: PaletteMode): ChartLegendItem[] => [
  { id: "paid", label: PAID_LABEL, color: seriesColor(mode, 2) },
  { id: "future", label: FUTURE_LABEL, color: seriesColor(mode, 3) },
];

export const InstallmentSavingsByMerchantChart = ({ merchants }: InstallmentSavingsByMerchantChartProps) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();

  if (merchants.length === 0) return <Typography color="text.secondary">Sin ahorro para mostrar</Typography>;

  const series = savingsLegendItems(theme.palette.mode);
  const rows = [...merchants]
    .sort((a, b) => a.saving - b.saving)
    .map(({ merchant, paidSaving, futureSaving }) => ({ merchant, [PAID_LABEL]: paidSaving, [FUTURE_LABEL]: futureSaving }));
  const labelMax = isMobile ? MOBILE_LABEL_MAX : DESKTOP_LABEL_MAX;

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={series.map(({ label }) => label)}
        indexBy="merchant"
        layout="horizontal"
        colors={series.map(({ color }) => color)}
        margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
        padding={0.3}
        innerPadding={2}
        borderRadius={4}
        enableLabel={false}
        enableGridY={false}
        valueFormat={money}
        axisBottom={isMobile ? null : { tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => truncateLabel(String(value), labelMax) }}
        {...(isMobile ? { tooltip: MobileBarTooltip } : {})}
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/charts/InstallmentSavingsByMerchantChart.tsx client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx
git commit -m "feat(client): gráfico de ahorro real por comercio" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hook `useInstallmentSavings` y sección «Cuánto te ahorran las cuotas»

**Files:**
- Create: `client/src/useInstallmentSavings.ts`
- Create: `client/src/components/InstallmentSavingsSection.tsx`
- Test: `client/src/components/InstallmentSavingsSection.test.tsx`

**Interfaces:**
- Consumes: `useInstallmentPurchases(f: Pick<StatFilters, "cardLabel" | "year">)` y `useInflation()` de `client/src/api/hooks.ts`; `computeInstallmentSavings`, `savingsByMerchant`, `InstallmentSavingsSummary`, `MerchantSaving` (Task 3); `InstallmentSavingsByMerchantChart`, `savingsLegendItems` (Task 4); `todayIso()` de `client/src/isoDate.ts`; `yearsLabel` de `client/src/filters/globalFilters.ts`; `formatMoney`, `formatMonthLabel`, `formatPercent` de `client/src/format.ts`; `Kpi`, `KpiGrid`, `ChartCard`, `ChartLegend`, `MotionBox`, `staggerContainer`.
- Produces: `useInstallmentSavings({ cardLabel, years }): InstallmentSavingsState` y `InstallmentSavingsSection({ cardLabel?: string; years?: string[] })`, que monta la página (Task 6).

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/InstallmentSavingsSection.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { InflationRateDTO, InstallmentPurchaseDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { InstallmentSavingsSection } from "./InstallmentSavingsSection.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../testing/nivoProbe.js")).NivoProbe }));

const purchase: InstallmentPurchaseDTO = {
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1",
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
};

const inflation: InflationRateDTO[] = [
  { periodo: "2026-02", variacionMensual: 2 },
  { periodo: "2026-03", variacionMensual: 2 },
];

interface ApiFixture {
  purchases?: InstallmentPurchaseDTO[];
  rates?: InflationRateDTO[];
  failPurchases?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubApi = ({ purchases = [purchase], rates = inflation, failPurchases = false }: ApiFixture = {}) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/stats/installment-purchases")) return failPurchases ? json({ error: "boom" }, 500) : json(purchases);
    if (url.includes("/inflation")) return json(rates);
    return json({});
  }));
};

const purchasesUrl = () =>
  vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes("/stats/installment-purchases"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 20, 12));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallmentSavingsSection", () => {
  it("con compras e IPC muestra los tres KPIs, el chip de estimación y la nota con el último IPC", async () => {
    stubApi();
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cuánto te ahorran las cuotas" })).toBeInTheDocument();
    expect(screen.getByText("Estimación")).toBeInTheDocument();
    expect(screen.getByText("Compras en cuotas en pesos hechas en 2026")).toBeInTheDocument();
    expect(screen.getByText("3,9% menos que de contado")).toBeInTheDocument();
    expect(screen.getByText("En cuotas pagadas")).toBeInTheDocument();
    expect(screen.getByText("2 cuotas · con IPC publicado")).toBeInTheDocument();
    expect(screen.getByText("En cuotas a vencer")).toBeInTheDocument();
    expect(screen.getByText("1 cuota · supone 2,0% mensual")).toBeInTheDocument();
    expect(screen.getByText("Ahorro real por comercio")).toBeInTheDocument();
    expect(screen.getByText("Pagadas")).toBeInTheDocument();
    expect(screen.getByText("A vencer")).toBeInTheDocument();
    expect(screen.getByText(/después de marzo de 2026\) usa el último dato: 2,0% mensual\./)).toBeInTheDocument();
  });

  it("cuenta las cuotas pagadas con IPC estimado", async () => {
    stubApi({ rates: [{ periodo: "2026-02", variacionMensual: 2 }] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("2 cuotas · 1 con IPC estimado")).toBeInTheDocument();
  });

  it("con ahorro negativo dice cuánto más que de contado", async () => {
    stubApi({ rates: [{ periodo: "2026-02", variacionMensual: -1 }, { periodo: "2026-03", variacionMensual: -1 }] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("2,0% más que de contado")).toBeInTheDocument();
  });

  it("sin IPC explica cómo traerlo", async () => {
    stubApi({ rates: [] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText(
      "Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de la barra superior para traerla.",
    )).toBeInTheDocument();
    expect(screen.getByText("Estimación")).toBeInTheDocument();
  });

  it("sin compras en los años elegidos lo dice con esos años", async () => {
    stubApi({ purchases: [] });
    renderWithProviders(<InstallmentSavingsSection years={["2025"]} />);
    expect(await screen.findByText("No hay compras en cuotas en pesos hechas en 2025")).toBeInTheDocument();
    expect(screen.getByText("Compras en cuotas en pesos hechas en 2025")).toBeInTheDocument();
  });

  it("con todos los años habla de todas las compras", async () => {
    stubApi({ purchases: [] });
    renderWithProviders(<InstallmentSavingsSection />);
    expect(await screen.findByText("No hay compras en cuotas en pesos")).toBeInTheDocument();
    expect(screen.getByText("Todas tus compras en cuotas en pesos")).toBeInTheDocument();
  });

  it("si falla el pedido de compras lo dice", async () => {
    stubApi({ failPurchases: true });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("No se pudo calcular el ahorro de las cuotas.")).toBeInTheDocument();
  });

  it("pide las compras con la tarjeta y los años, sin moneda", async () => {
    stubApi();
    renderWithProviders(<InstallmentSavingsSection cardLabel="ICBC" years={["2025", "2026"]} />);
    await waitFor(() => expect(purchasesUrl()).toBeDefined());
    expect(purchasesUrl()).toContain("cardLabel=ICBC");
    expect(purchasesUrl()).toContain("year=2025&year=2026");
    expect(purchasesUrl()).not.toContain("currency");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/InstallmentSavingsSection.test.tsx`
Expected: FAIL — no se puede resolver `./InstallmentSavingsSection.js`.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/useInstallmentSavings.ts`:

```typescript
import { useMemo } from "react";
import { useInflation, useInstallmentPurchases } from "./api/hooks.js";
import {
  computeInstallmentSavings, savingsByMerchant, type InstallmentSavingsSummary, type MerchantSaving,
} from "./installmentSavings.js";
import { todayIso } from "./isoDate.js";

const TOP_MERCHANTS = 8;

interface UseInstallmentSavingsParams {
  cardLabel?: string;
  years?: string[];
}

export interface InstallmentSavingsState {
  summary: InstallmentSavingsSummary | null;
  merchants: MerchantSaving[];
  isLoading: boolean;
  isError: boolean;
}

const listOf = <T>(data: T[] | undefined): T[] => (Array.isArray(data) ? data : []);

export const useInstallmentSavings = ({ cardLabel, years }: UseInstallmentSavingsParams): InstallmentSavingsState => {
  const purchasesQuery = useInstallmentPurchases({ cardLabel, year: years });
  const inflationQuery = useInflation();
  const purchases = purchasesQuery.data;
  const inflation = inflationQuery.data;

  const summary = useMemo(
    () => computeInstallmentSavings(listOf(purchases), listOf(inflation), todayIso()),
    [purchases, inflation],
  );
  const merchants = useMemo(() => (summary ? savingsByMerchant(summary.purchases, TOP_MERCHANTS) : []), [summary]);

  return {
    summary,
    merchants,
    isLoading: purchasesQuery.isLoading || inflationQuery.isLoading,
    isError: purchasesQuery.isError || inflationQuery.isError,
  };
};
```

Crear `client/src/components/InstallmentSavingsSection.tsx`:

```tsx
import { Box, Chip, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import type { InflationAssumption } from "../inflationIndex.js";
import type { InstallmentSavingsSummary, MerchantSaving } from "../installmentSavings.js";
import { useInstallmentSavings, type InstallmentSavingsState } from "../useInstallmentSavings.js";
import { yearsLabel } from "../filters/globalFilters.js";
import { formatMoney, formatMonthLabel, formatPercent } from "../format.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";
import { ChartCard } from "./charts/ChartCard.js";
import { ChartLegend } from "./charts/ChartLegend.js";
import { InstallmentSavingsByMerchantChart, savingsLegendItems } from "./charts/InstallmentSavingsByMerchantChart.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";

interface InstallmentSavingsSectionProps {
  cardLabel?: string;
  years?: string[];
}

interface SavingsBodyProps extends InstallmentSavingsState {
  emptyText: string;
}

interface SavingsContentProps {
  summary: InstallmentSavingsSummary;
  merchants: MerchantSaving[];
}

const TITLE_ID = "ahorro-cuotas-titulo";
const ERROR_TEXT = "No se pudo calcular el ahorro de las cuotas.";
const NO_INFLATION_TEXT =
  "Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de la barra superior para traerla.";

const money = (value: number): string => formatMoney(value, "ARS");

const plural = (count: number, singular: string): string => `${count} ${singular}${count === 1 ? "" : "s"}`;

const savingSub = (savingPercent: number): string =>
  savingPercent < 0
    ? `${formatPercent(-savingPercent)} más que de contado`
    : `${formatPercent(savingPercent)} menos que de contado`;

const paidSub = ({ paidCount, estimatedPaidCount }: InstallmentSavingsSummary): string => {
  if (paidCount === 0) return "Sin cuotas pagadas";
  const inflationSource = estimatedPaidCount > 0 ? `${estimatedPaidCount} con IPC estimado` : "con IPC publicado";
  return `${plural(paidCount, "cuota")} · ${inflationSource}`;
};

const futureSub = ({ futureCount, assumption }: InstallmentSavingsSummary): string =>
  futureCount === 0
    ? "Sin cuotas a vencer"
    : `${plural(futureCount, "cuota")} · supone ${formatPercent(assumption.variacionMensual)} mensual`;

const footnote = ({ periodo, variacionMensual }: InflationAssumption): string =>
  "Estimación: cada cuota se lleva a pesos del mes de la compra con el IPC y se compara con pagar todo de contado. " +
  "Supone que las cuotas son sin interés (precio de contado = suma de las cuotas) y que pagás cada resumen al vencimiento. " +
  `Para los meses sin IPC publicado (después de ${formatMonthLabel(periodo).toLowerCase()}) usa el último dato: ` +
  `${formatPercent(variacionMensual)} mensual.`;

const SavingsContent = ({ summary, merchants }: SavingsContentProps) => {
  const theme = useTheme();
  const legendItems = savingsLegendItems(theme.palette.mode);

  return (
    <>
      <KpiGrid cardCount={3}>
        <Kpi label="Ahorro real" value={summary.saving} format={money} sub={savingSub(summary.savingPercent)} icon={<SavingsOutlinedIcon />} color="primary" />
        <Kpi label="En cuotas pagadas" value={summary.paidSaving} format={money} sub={paidSub(summary)} icon={<TaskAltOutlinedIcon />} color="success" />
        <Kpi
          label="En cuotas a vencer"
          value={summary.futureSaving}
          format={money}
          sub={futureSub(summary)}
          icon={<EventOutlinedIcon />}
          color="warning"
          subMultiline
        />
      </KpiGrid>
      <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 2 }}>
        <ChartCard title="Ahorro real por comercio">
          <InstallmentSavingsByMerchantChart merchants={merchants} />
          <ChartLegend items={legendItems} />
        </ChartCard>
      </MotionBox>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {footnote(summary.assumption)}
      </Typography>
    </>
  );
};

const SavingsBody = ({ summary, merchants, isLoading, isError, emptyText }: SavingsBodyProps) => {
  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Typography color="text.secondary">{ERROR_TEXT}</Typography>;
  if (summary === null) return <Typography color="text.secondary">{NO_INFLATION_TEXT}</Typography>;
  if (summary.purchases.length === 0) return <Typography color="text.secondary">{emptyText}</Typography>;
  return <SavingsContent summary={summary} merchants={merchants} />;
};

export const InstallmentSavingsSection = ({ cardLabel, years }: InstallmentSavingsSectionProps) => {
  const savings = useInstallmentSavings({ cardLabel, years });
  const subtitle = years ? `Compras en cuotas en pesos hechas en ${yearsLabel(years)}` : "Todas tus compras en cuotas en pesos";
  const emptyText = years ? `No hay compras en cuotas en pesos hechas en ${yearsLabel(years)}` : "No hay compras en cuotas en pesos";

  return (
    <Box component="section" aria-labelledby={TITLE_ID} sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 0.5 }}>
        <Typography variant="h5" component="h2" id={TITLE_ID}>Cuánto te ahorran las cuotas</Typography>
        <Chip size="small" variant="outlined" label="Estimación" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>
      <SavingsBody {...savings} emptyText={emptyText} />
    </Box>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/InstallmentSavingsSection.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/useInstallmentSavings.ts client/src/components/InstallmentSavingsSection.tsx client/src/components/InstallmentSavingsSection.test.tsx
git commit -m "feat(client): sección de cuánto te ahorran las cuotas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: La sección en la página Cuotas

**Files:**
- Modify: `client/src/pages/InstallmentsPage.tsx`
- Test: `client/src/pages/InstallmentsPage.test.tsx`

**Interfaces:**
- Consumes: `InstallmentSavingsSection({ cardLabel, years })` (Task 5); `currency`, `cardLabel`, `years` de `useGlobalFilters()` (ya en la página).
- Produces: la página final.

- [ ] **Step 1: Write the failing test**

En `client/src/pages/InstallmentsPage.test.tsx`:

1. Después de `const detail = [...]`, agregar los fixtures:

```typescript
const purchases = [{
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1", cardLabel: "ICBC", merchant: "MERCADOLIBRE", category: "Compras",
  purchaseDate: "2026-01-15", installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
}];
const inflation = [{ periodo: "2026-02", variacionMensual: 2 }, { periodo: "2026-03", variacionMensual: 2 }];
```

2. En el `beforeEach`, sumar dos ramas al principio de la cadena del mock:

```typescript
    const body = url.includes("/stats/installment-purchases") ? purchases
      : url.includes("/inflation") ? inflation
      : url.includes("/stats/future-installments/detail") ? detail
```

(el resto de la cadena queda igual).

3. Agregar el helper y los casos dentro del `describe("InstallmentsPage")`:

```typescript
const savingsRegion = () => screen.queryByRole("region", { name: "Cuánto te ahorran las cuotas" });

  it("muestra el ahorro de las cuotas en pesos entre los gráficos y el detalle por mes", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026" });
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    const region = savingsRegion()!;
    const charts = screen.getByText("Cuotas pendientes por categoría");
    const firstMonth = screen.getByText("Junio de 2026");
    expect(charts.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(firstMonth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con dólares no muestra el ahorro de las cuotas", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?currency=USD" });
    expect(await screen.findByText("Cuotas pendientes")).toBeInTheDocument();
    expect(savingsRegion()).not.toBeInTheDocument();
  });

  it("muestra el ahorro aunque no haya cuotas pendientes en los años elegidos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/stats/installment-purchases") ? purchases
        : url.includes("/inflation") ? inflation
        : url.includes("/stats/future-installments") ? []
        : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026" });
    expect(await screen.findByText("No hay cuotas que venzan en 2026")).toBeInTheDocument();
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    expect(savingsRegion()).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/InstallmentsPage.test.tsx`
Expected: FAIL — los 3 casos nuevos no encuentran «Ahorro real» / la región (la página todavía no monta la sección); los 6 existentes siguen en verde.

- [ ] **Step 3: Write minimal implementation**

En `client/src/pages/InstallmentsPage.tsx`:

1. Import:

```typescript
import { InstallmentSavingsSection } from "../components/InstallmentSavingsSection.js";
```

2. Antes del `return`, junto a `emptyLabel`:

```typescript
  const hasMonths = !isLoading && months.length > 0;
```

3. Partir el bloque `{!isLoading && months.length > 0 && (<> … </>)}` en dos, con la sección en el medio:

```tsx
      {hasMonths && (
        <>
          <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 3, maxWidth: { sm: 320 } }}>
            <Kpi label="Cuotas pendientes" value={totalFuturo} format={money} icon={<CreditCardIcon />} color="warning" />
          </MotionBox>
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Total por mes"><FutureInstallmentsChart {...filters} /></ChartCard>
            <ChartCard title="Deuda restante"><RemainingDebtChart {...filters} /></ChartCard>
            <ChartCard title="Por categoría"><InstallmentsByCategoryChart {...filters} /></ChartCard>
            <ChartCard title="Por comercio"><InstallmentsByMerchantChart {...filters} /></ChartCard>
            <ChartCard title="Cuotas pendientes por categoría"><PendingInstallmentsByCategoryChart {...filters} /></ChartCard>
          </MotionBox>
        </>
      )}

      {currency === "ARS" && <InstallmentSavingsSection cardLabel={cardLabel} years={years} />}

      {hasMonths && (
        <>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {plural(totalCuotas, "cuota")} por {formatMoney(totalFuturo, filters.currency)} en {mesesLabel}
          </Typography>
          <MotionBox variants={staggerContainer} initial="hidden" animate="visible">
            {/* el map de meses queda exactamente igual */}
          </MotionBox>
        </>
      )}
```

(El `{/* … */}` de arriba es solo para el plan: en el código va el `months.map(...)` existente sin cambios y sin comentario.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/InstallmentsPage.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/pages/InstallmentsPage.tsx client/src/pages/InstallmentsPage.test.tsx
git commit -m "feat(client): el ahorro de las cuotas en la página Cuotas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final

**Files:** ninguno (si algo falla, se corrige en el archivo del task que lo introdujo y se commitea con `fix(...)`).

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos los archivos en verde. Si falla algo ajeno a esta feature, comprobar que también falla en `feat/base-nuevas-features` y anotarlo.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build de shared, server y client sin errores (los avisos de tamaño de chunk de Vite ya existían).

- [ ] **Step 4: Repaso de alcance**

Run: `git diff --stat feat/base-nuevas-features...HEAD`
Expected: solo los archivos de este plan (spec, plan, `installmentPurchases.*`, `stats.ts`, `stats.test.ts`, `installmentSavings.*`, `useInstallmentSavings.ts`, `InstallmentSavingsSection.*`, `InstallmentSavingsByMerchantChart.*`, `InstallmentsPage.*`).
