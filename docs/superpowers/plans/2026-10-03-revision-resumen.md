# Revisión del resumen antes de pagarlo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en `/import` se vea, para el resumen recién importado y para el último de cada tarjeta, un checklist de lo raro (duplicados, USD inusuales, comercios nuevos, categorías en alza y «Sin categoría») que se tilda y queda guardado por resumen.

**Architecture:** Una función pura en el server (`buildStatementReview`) recibe los movimientos del resumen, los de los 6 resúmenes anteriores de la misma tarjeta y los comercios conocidos, y devuelve hallazgos y chequeos salteados; el router de la base (`/api/statements/:id/review`) carga y delega en el GET, y guarda las claves tildadas con `$addToSet`/`$pull` en el PATCH. En el cliente, un módulo puro (`statementReview.ts`) arma opciones, progreso y textos, y la sección (`StatementReviewSection`) compone un selector de tarjeta y el checklist presentacional usando los hooks que ya trae la base.

**Tech Stack:** React 18 + MUI 6 + react-router 6 + @tanstack/react-query 5 (cliente); Express 4 + Mongoose 8 (server); zod en `@ledgerly/shared`; Vitest + Testing Library + supertest + mongodb-memory-server (tests); Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-revision-resumen-design.md`

## Prerrequisitos

- Rama propia desde la base del lote: `git switch -c feat/revision-resumen feat/base-nuevas-features`, y `bun install`.
- La base ya trae (y **no se tocan**): `reviewedKeys` en `statementSchema`, `UNCATEGORIZED_CATEGORY`, los DTOs de revisión, `statementsBefore`, `merchantMatchKey`, `daysBetween` (`server/src/stats/months.ts`), los hooks `useStatementReview`, `useStatementReviews`, `useMarkFindingsReviewed`, `applyReviewedDelta`, el montaje del router y la integración en `ImportPage.tsx`.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`.
- Filtros, mapeos y condicionales complejos antes del `return`, no dentro del JSX. Early returns para carga y error.
- `key` de listas con ids estables (`finding.key`, `option.id`, `check`), nunca el índice.
- El cliente importa **solo tipos** de `@ledgerly/shared` (un valor arrastra zod al bundle).
- Copy exacto: título «Revisión antes de pagar», «Movimientos», «Categorías por encima de su promedio», «Categorizar en Reglas», «Marcar todo como revisado», «Revisado», "No encontramos nada raro en este resumen.", `aria-label="resumen a revisar"`, `aria-label="progreso de la revisión"`, checkbox `"revisado: <título>"`.
- Constantes del server: `REVIEW_WINDOW = 6`, `DUPLICATE_WINDOW_DAYS = 3`, `USD_SPIKE_RATIO = 1.2`, `CATEGORY_MIN_HISTORY = 3`, `CATEGORY_SPIKE_RATIO = 1.5`, `CATEGORY_SPIKE_MIN_SHARE = 0.05`.
- Objetivos táctiles de 44px (`MIN_TAP_SIZE` / `tapTargetSx` de `client/src/components/tapTarget.ts`); mobile con `useIsMobile()`.
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado).
- Fixtures sintéticos ("COMERCIO UNO", "SERVICIO EXTERIOR", "COMERCIO NUEVO"). `examples/` nunca se commitea.
- Comandos: `bun run test <ruta>`, `bun run typecheck`, `bun run build`.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Commits con pathspec explícito, mensaje convencional en español, terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca push ni PR.

## Review Focus

1. **Borrar en «Archivos importados» el resumen que está elegido en el selector**: la sección pasa sola a la primera opción en vez de quedar pidiendo una revisión que da 404. → test de `selectedReviewId` en Task 3.
2. **Falla el `PATCH` al tildar** (server caído): aparece "No se pudo guardar la revisión: …" y el tilde vuelve al estado del server. → test en Task 5.
3. **Falla el `GET` de la revisión de una tarjeta**: el título y el selector siguen, y el error queda en el lugar de la revisión. → test en Task 5.
4. **Comercio en USD con el monto o la palabra USD en el nombre** ("SERVICIO EXTERIOR USD 10,99" contra "SERVICIO EXTERIOR X9Y8"): es el mismo comercio, no se marca como nuevo ni como "USD sin historia". → test en Task 1.
5. **Claves tildadas de hallazgos que ya no existen** (se recategorizó el movimiento): no cuentan en el progreso y «Marcar todo» no las manda. → tests en Task 3 (`reviewProgress`) y Task 4 (botón con `"tx:vieja"`).

---

### Task 1: Cálculo de la revisión (server, puro)

**Files:**
- Create: `server/src/stats/statementReview.ts`
- Test: `server/src/stats/statementReview.test.ts`

**Interfaces:**
- Consumes: `merchantMatchKey(merchant: string): string` (`./merchantKey.js`), `daysBetween(from: string, to: string): number` (`./months.js`), `UNCATEGORIZED_CATEGORY` y los tipos `TransactionDTO`, `ReviewFinding`, `ReviewTransactionFinding`, `ReviewCategoryFinding`, `ReviewDuplicateRef`, `ReviewReason`, `ReviewCheck` de `@ledgerly/shared`.
- Produces:
  - constantes `REVIEW_WINDOW`, `DUPLICATE_WINDOW_DAYS`, `USD_SPIKE_RATIO`, `CATEGORY_MIN_HISTORY`, `CATEGORY_SPIKE_RATIO`, `CATEGORY_SPIKE_MIN_SHARE`, `REASON_ORDER`, `CHECK_ORDER`
  - `interface StatementReviewInput { current: TransactionDTO[]; history: TransactionDTO[][]; knownMerchants: string[]; previousStatements: number }`
  - `interface StatementReviewResult { findings: ReviewFinding[]; skippedChecks: ReviewCheck[] }`
  - `buildStatementReview(input: StatementReviewInput): StatementReviewResult`
  - auxiliares `purchases`, `charges`, `isOldInstallment`, `signedAmount`, `findDuplicates`, `findUnusualUsd`, `findNewMerchants`, `findUncategorized`, `findCategorySpikes`

- [ ] **Step 1: Write the failing test**

`server/src/stats/statementReview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ReviewCategoryFinding, ReviewReason, ReviewTransactionFinding, TransactionDTO } from "@ledgerly/shared";
import {
  buildStatementReview,
  charges,
  isOldInstallment,
  purchases,
  signedAmount,
  type StatementReviewInput,
  type StatementReviewResult,
} from "./statementReview.js";

const tx = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id,
  statementId: "s-actual",
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  date: "2026-09-10",
  descriptionRaw: "COMERCIO UNO",
  merchant: "COMERCIO UNO",
  category: "Comida",
  categorySource: "rule",
  amount: 2500,
  currency: "ARS",
  direction: "debit",
  type: "purchase",
  isInstallment: false,
  installmentCurrent: null,
  installmentTotal: null,
  comprobante: null,
  ...overrides,
});

const old = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO =>
  tx(id, { statementId: "s-anterior", ...overrides });

const review = (input: Partial<StatementReviewInput>): StatementReviewResult =>
  buildStatementReview({ current: [], history: [], knownMerchants: [], previousStatements: 0, ...input });

const txFindings = (result: StatementReviewResult): ReviewTransactionFinding[] =>
  result.findings.filter((finding): finding is ReviewTransactionFinding => finding.kind === "transaction");

const categoryFindings = (result: StatementReviewResult): ReviewCategoryFinding[] =>
  result.findings.filter((finding): finding is ReviewCategoryFinding => finding.kind === "category");

const findingOf = (result: StatementReviewResult, id: string): ReviewTransactionFinding | undefined =>
  txFindings(result).find((finding) => finding.transaction.id === id);

const reasonsOf = (result: StatementReviewResult, id: string): ReviewReason[] => findingOf(result, id)?.reasons ?? [];

const statementWith = (prefix: string, totals: Record<string, number>): TransactionDTO[] =>
  Object.entries(totals).map(([category, amount], position) =>
    tx(`${prefix}${position}`, { category, amount, merchant: `COMERCIO ${prefix}${position}` }));

const threeStatementsWith = (totals: Record<string, number>): TransactionDTO[][] =>
  ["a", "b", "c"].map((prefix) => statementWith(prefix, totals));

describe("auxiliares", () => {
  it("purchases deja las compras y charges, además, solo los cargos", () => {
    const list = [tx("a"), tx("b", { direction: "credit" }), tx("c", { type: "tax" })];
    expect(purchases(list).map((item) => item.id)).toEqual(["a", "b"]);
    expect(charges(list).map((item) => item.id)).toEqual(["a"]);
  });

  it("una cuota vieja es de la 2 en adelante", () => {
    expect(isOldInstallment(tx("a", { isInstallment: true, installmentCurrent: 2, installmentTotal: 6 }))).toBe(true);
    expect(isOldInstallment(tx("b", { isInstallment: true, installmentCurrent: 1, installmentTotal: 6 }))).toBe(false);
    expect(isOldInstallment(tx("c"))).toBe(false);
  });

  it("las devoluciones restan", () => {
    expect(signedAmount(tx("a", { amount: 100 }))).toBe(100);
    expect(signedAmount(tx("b", { amount: 100, direction: "credit" }))).toBe(-100);
  });
});

describe("posibles duplicados", () => {
  it("dentro del resumen marca el posterior, que apunta al anterior", () => {
    const result = review({ current: [tx("t2", { date: "2026-09-11" }), tx("t1", { date: "2026-09-10" })] });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(findingOf(result, "t2")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "t1", date: "2026-09-10", sameStatement: true },
      usualUsd: null,
    });
  });

  it("contra el resumen anterior, a 2 días", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-01" })],
      history: [[old("h1", { date: "2026-08-30" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t1")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "h1", date: "2026-08-30", sameStatement: false },
    });
  });

  it("apunta al cargo de fecha más cercana", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-09" }), tx("t2", { date: "2026-09-10" })],
      history: [[old("h1", { date: "2026-09-07" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t1")?.duplicateOf?.transactionId).toBe("h1");
    expect(findingOf(result, "t2")?.duplicateOf?.transactionId).toBe("t1");
  });

  it("a igual distancia prefiere el del mismo resumen", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-09" }), tx("t2", { date: "2026-09-10" })],
      history: [[old("h1", { date: "2026-09-11" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t2")?.duplicateOf).toEqual({ transactionId: "t1", date: "2026-09-09", sameStatement: true });
  });

  it("no son duplicados: a 4 días, otro monto u otra moneda", () => {
    const result = review({
      current: [
        tx("t1", { date: "2026-09-01" }),
        tx("t2", { date: "2026-09-05" }),
        tx("t3", { date: "2026-09-05", amount: 2600 }),
        tx("t4", { date: "2026-09-05", currency: "USD" }),
      ],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("no son duplicados: dos cuotas distintas de la misma compra", () => {
    const purchase = { isInstallment: true, installmentTotal: 6, date: "2026-05-10" };
    const result = review({
      current: [tx("t1", { ...purchase, installmentCurrent: 3 })],
      history: [[old("h1", { ...purchase, installmentCurrent: 2 })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("la misma cuota cobrada dos veces sí es duplicado", () => {
    const installment = { isInstallment: true, installmentCurrent: 3, installmentTotal: 6, date: "2026-05-10" };
    const result = review({
      current: [tx("t1", { ...installment, comprobante: "001" }), tx("t2", { ...installment, comprobante: "002" })],
    });
    expect(reasonsOf(result, "t2")).toEqual(["duplicado"]);
  });

  it("no son duplicados: una devolución ni un impuesto", () => {
    const result = review({
      current: [
        tx("t1"),
        tx("t2", { direction: "credit" }),
        tx("t3", { type: "tax", category: "Impuestos" }),
      ],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("tres cargos iguales dan dos hallazgos", () => {
    const result = review({ current: [tx("t1"), tx("t2"), tx("t3")] });
    expect(txFindings(result).map((finding) => [finding.transaction.id, finding.duplicateOf?.transactionId]))
      .toEqual([["t2", "t1"], ["t3", "t1"]]);
  });
});

describe("USD fuera de lo habitual", () => {
  const usd = (id: string, amount: number, overrides: Partial<TransactionDTO> = {}): TransactionDTO =>
    tx(id, { merchant: "SERVICIO EXTERIOR", category: "Suscripciones", currency: "USD", amount, ...overrides });
  const known = { knownMerchants: ["SERVICIO EXTERIOR"], previousStatements: 2 };

  it("un comercio sin cargos en USD en la ventana se marca, sin monto habitual", () => {
    const result = review({ ...known, current: [usd("t1", 14.99)], history: [[old("h1")]] });
    expect(findingOf(result, "t1")).toMatchObject({ key: "tx:t1", reasons: ["usd"], usualUsd: null, duplicateOf: null });
  });

  it("una suba del 36 % se marca, con el monto anterior", () => {
    const result = review({ ...known, current: [usd("t1", 14.99)], history: [[usd("h1", 10.99, { date: "2026-08-03" })]] });
    expect(findingOf(result, "t1")).toMatchObject({ reasons: ["usd"], usualUsd: 10.99 });
  });

  it("una suba del 10 % no se marca", () => {
    const result = review({ ...known, current: [usd("t1", 12.09)], history: [[usd("h1", 10.99, { date: "2026-08-03" })]] });
    expect(txFindings(result)).toEqual([]);
  });

  it("compara contra el máximo de la ventana, no contra el promedio", () => {
    const result = review({
      ...known,
      current: [usd("t1", 13.5)],
      history: [[usd("h1", 9.99, { date: "2026-08-03" })], [usd("h2", 12, { date: "2026-07-03" })]],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("una cuota vieja en USD no se marca", () => {
    const result = review({
      ...known,
      current: [usd("t1", 50, { merchant: "TIENDA EXTERIOR", isInstallment: true, installmentCurrent: 2, installmentTotal: 3 })],
      history: [[old("h1")]],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("sin resúmenes anteriores el chequeo se saltea", () => {
    const result = review({ current: [usd("t1", 14.99)] });
    expect(result.skippedChecks).toContain("usd");
    expect(txFindings(result)).toEqual([]);
  });

  it("el monto o la palabra USD en el nombre no lo vuelven otro comercio", () => {
    const result = review({
      knownMerchants: ["SERVICIO EXTERIOR USD 10,99"],
      previousStatements: 1,
      current: [usd("t1", 11.5, { merchant: "SERVICIO EXTERIOR X9Y8" })],
      history: [[usd("h1", 10.99, { merchant: "SERVICIO EXTERIOR USD 10,99", date: "2026-08-03" })]],
    });
    expect(txFindings(result)).toEqual([]);
  });
});

describe("comercios nuevos", () => {
  const someHistory = { history: [[old("h1", { date: "2026-08-10" })]], previousStatements: 3 };

  it("un comercio que la tarjeta nunca usó se marca, uno conocido no", () => {
    const result = review({
      ...someHistory,
      knownMerchants: ["COMERCIO UNO"],
      current: [tx("t1"), tx("t2", { merchant: "COMERCIO NUEVO" })],
    });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(findingOf(result, "t2")).toMatchObject({ key: "tx:t2", reasons: ["nuevo"] });
  });

  it("el mismo comercio con otro código no es nuevo", () => {
    const result = review({ ...someHistory, knownMerchants: ["SPOTIFY P1"], current: [tx("t1", { merchant: "SPOTIFY X9" })] });
    expect(txFindings(result)).toEqual([]);
  });

  it("una cuota vieja no es nueva, la primera cuota sí", () => {
    const result = review({
      ...someHistory,
      knownMerchants: ["COMERCIO UNO"],
      current: [
        tx("t1", { merchant: "COMERCIO NUEVO", isInstallment: true, installmentCurrent: 3, installmentTotal: 6, date: "2026-07-10" }),
        tx("t2", { merchant: "OTRO NUEVO", isInstallment: true, installmentCurrent: 1, installmentTotal: 6 }),
      ],
    });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(reasonsOf(result, "t2")).toEqual(["nuevo"]);
  });

  it("una devolución no es un comercio nuevo", () => {
    const result = review({ ...someHistory, current: [tx("t1", { merchant: "COMERCIO NUEVO", direction: "credit" })] });
    expect(txFindings(result)).toEqual([]);
  });

  it("marca cada cargo de un comercio nuevo", () => {
    const result = review({
      ...someHistory,
      current: [
        tx("t1", { merchant: "COMERCIO NUEVO", date: "2026-09-01" }),
        tx("t2", { merchant: "COMERCIO NUEVO", date: "2026-09-20", amount: 999 }),
      ],
    });
    expect(txFindings(result).map((finding) => finding.transaction.id)).toEqual(["t1", "t2"]);
  });

  it("sin resúmenes anteriores el chequeo se saltea", () => {
    const result = review({ current: [tx("t1", { merchant: "COMERCIO NUEVO" })] });
    expect(result.skippedChecks).toContain("nuevo");
    expect(txFindings(result)).toEqual([]);
  });
});

describe("categorías en alza", () => {
  it("marca la categoría que duplica su promedio y pesa más del 5 % del resumen", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 400000, Comida: 50000, Varios: 550000 }),
      history: threeStatementsWith({ Supermercado: 200000, Comida: 25000, Varios: 550000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 400000, average: 200000, ratio: 2 },
    ]);
  });

  it("una suba de 1,3 veces no se marca", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 260000, Varios: 740000 }),
      history: threeStatementsWith({ Supermercado: 200000, Varios: 740000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("una categoría que no estaba en la ventana se marca sin ratio", () => {
    const result = review({
      current: statementWith("t", { Viajes: 100000, Varios: 900000 }),
      history: threeStatementsWith({ Varios: 900000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Viajes", category: "Viajes", total: 100000, average: 0, ratio: null },
    ]);
  });

  it("«Sin categoría» no es una categoría en alza", () => {
    const result = review({
      current: statementWith("t", { "Sin categoría": 300000, Varios: 700000 }),
      history: threeStatementsWith({ Varios: 700000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("el promedio cuenta como cero los resúmenes sin esa categoría", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 200000, Varios: 500000 }),
      history: [
        statementWith("a", { Supermercado: 300000, Varios: 500000 }),
        statementWith("b", { Varios: 500000 }),
        statementWith("c", { Varios: 500000 }),
      ],
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 200000, average: 100000, ratio: 2 },
    ]);
  });

  it("con menos de 3 resúmenes anteriores el chequeo se saltea", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 400000 }),
      history: [statementWith("a", { Supermercado: 1 }), statementWith("b", { Supermercado: 1 })],
      previousStatements: 2,
    });
    expect(result.skippedChecks).toContain("categoria");
    expect(categoryFindings(result)).toEqual([]);
  });

  it("las devoluciones restan", () => {
    const result = review({
      current: [
        ...statementWith("t", { Supermercado: 400000, Varios: 600000 }),
        tx("r1", { category: "Supermercado", amount: 150000, direction: "credit" }),
      ],
      history: threeStatementsWith({ Supermercado: 200000, Varios: 600000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("los cargos en USD no entran", () => {
    const result = review({
      current: [...statementWith("t", { Varios: 1000000 }), tx("u1", { category: "Viajes", currency: "USD", amount: 900 })],
      history: threeStatementsWith({ Varios: 1000000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("si el resumen suma cero o menos no marca categorías", () => {
    const result = review({
      current: [tx("t1", { category: "Supermercado", amount: 1000 }), tx("r1", { category: "Varios", amount: 5000, direction: "credit" })],
      history: threeStatementsWith({ Varios: 1000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });
});

describe("sin categoría", () => {
  it("marca las compras sin categoría, no los pagos ni los impuestos", () => {
    const result = review({
      current: [
        tx("t1", { category: "Sin categoría" }),
        tx("t2", { category: "Sin categoría", type: "payment", direction: "credit", merchant: "SU PAGO" }),
        tx("t3", { category: "Sin categoría", type: "tax", merchant: "IVA" }),
      ],
    });
    expect(txFindings(result).map((finding) => [finding.transaction.id, finding.reasons])).toEqual([["t1", ["sin-categoria"]]]);
  });
});

describe("armado del resultado", () => {
  it("un movimiento con varios motivos es un solo hallazgo, con los motivos en orden", () => {
    const result = review({
      current: [tx("t1", { merchant: "COMERCIO NUEVO", currency: "USD", amount: 30, category: "Sin categoría" })],
      history: [[old("h1")]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(txFindings(result)).toHaveLength(1);
    expect(findingOf(result, "t1")).toMatchObject({
      key: "tx:t1",
      reasons: ["usd", "nuevo", "sin-categoria"],
      usualUsd: null,
      duplicateOf: null,
    });
  });

  it("ordena por motivo, fecha e id, y deja las categorías al final de mayor a menor diferencia", () => {
    const result = review({
      current: [
        tx("t5", { merchant: "COMERCIO SIN", category: "Sin categoría", date: "2026-09-01", amount: 10 }),
        tx("t4", { merchant: "COMERCIO NUEVO", date: "2026-09-15", amount: 20 }),
        tx("t3", { merchant: "COMERCIO NUEVO B", date: "2026-09-02", amount: 30 }),
        tx("t1", { date: "2026-09-05", amount: 40 }),
        tx("t2", { date: "2026-09-05", amount: 40 }),
        tx("big1", { category: "Viajes", amount: 300000, date: "2026-09-21" }),
        tx("big2", { category: "Supermercado", amount: 500000, date: "2026-09-20" }),
      ],
      history: ["06", "07", "08"].map((month) => [old(`h${month}`, { date: `2026-${month}-10`, amount: 100, category: "Varios" })]),
      knownMerchants: ["COMERCIO UNO", "COMERCIO SIN"],
      previousStatements: 3,
    });
    expect(result.findings.map((finding) => finding.key))
      .toEqual(["tx:t2", "tx:t3", "tx:t4", "tx:t5", "cat:Supermercado", "cat:Viajes"]);
    expect(result.skippedChecks).toEqual([]);
  });

  it("una entrada vacía no falla", () => {
    expect(review({})).toEqual({ findings: [], skippedChecks: ["usd", "nuevo", "categoria"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/statementReview.test.ts`
Expected: FAIL — `Failed to load url ./statementReview.js` (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

`server/src/stats/statementReview.ts`:

```ts
import {
  UNCATEGORIZED_CATEGORY,
  type ReviewCategoryFinding,
  type ReviewCheck,
  type ReviewDuplicateRef,
  type ReviewFinding,
  type ReviewReason,
  type ReviewTransactionFinding,
  type TransactionDTO,
} from "@ledgerly/shared";
import { merchantMatchKey } from "./merchantKey.js";
import { daysBetween } from "./months.js";

export const REVIEW_WINDOW = 6;
export const DUPLICATE_WINDOW_DAYS = 3;
export const USD_SPIKE_RATIO = 1.2;
export const CATEGORY_MIN_HISTORY = 3;
export const CATEGORY_SPIKE_RATIO = 1.5;
export const CATEGORY_SPIKE_MIN_SHARE = 0.05;
export const REASON_ORDER: ReviewReason[] = ["duplicado", "usd", "nuevo", "sin-categoria"];
export const CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];

const AMOUNT_TOLERANCE = 0.005;

export interface StatementReviewInput {
  current: TransactionDTO[];
  history: TransactionDTO[][];
  knownMerchants: string[];
  previousStatements: number;
}

export interface StatementReviewResult {
  findings: ReviewFinding[];
  skippedChecks: ReviewCheck[];
}

interface DuplicateCandidate {
  tx: TransactionDTO;
  key: string;
  sameStatement: boolean;
}

export const purchases = (txs: TransactionDTO[]): TransactionDTO[] => txs.filter((tx) => tx.type === "purchase");

export const charges = (txs: TransactionDTO[]): TransactionDTO[] =>
  purchases(txs).filter((tx) => tx.direction === "debit");

export const isOldInstallment = (tx: TransactionDTO): boolean => tx.isInstallment && (tx.installmentCurrent ?? 1) > 1;

export const signedAmount = (tx: TransactionDTO): number => (tx.direction === "credit" ? -tx.amount : tx.amount);

const distance = (a: TransactionDTO, b: TransactionDTO): number => Math.abs(daysBetween(a.date, b.date));

const byDateThenId = (a: TransactionDTO, b: TransactionDTO): number =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

const toCandidate = (sameStatement: boolean) => (tx: TransactionDTO): DuplicateCandidate => ({
  tx,
  key: merchantMatchKey(tx.merchant),
  sameStatement,
});

const isSameCharge = (candidate: DuplicateCandidate, charge: DuplicateCandidate): boolean =>
  candidate.key === charge.key
  && candidate.tx.currency === charge.tx.currency
  && Math.abs(candidate.tx.amount - charge.tx.amount) < AMOUNT_TOLERANCE
  && distance(candidate.tx, charge.tx) <= DUPLICATE_WINDOW_DAYS
  && (candidate.tx.installmentCurrent ?? null) === (charge.tx.installmentCurrent ?? null);

const closestTo = (charge: TransactionDTO) => (a: DuplicateCandidate, b: DuplicateCandidate): number =>
  distance(a.tx, charge) - distance(b.tx, charge)
  || Number(b.sameStatement) - Number(a.sameStatement)
  || a.tx.id.localeCompare(b.tx.id);

export function findDuplicates(current: TransactionDTO[], history: TransactionDTO[][]): Map<string, ReviewDuplicateRef> {
  const ordered = charges(current).sort(byDateThenId).map(toCandidate(true));
  const previous = charges(history.flat()).map(toCandidate(false));
  const duplicates = new Map<string, ReviewDuplicateRef>();
  ordered.forEach((charge, position) => {
    const matches = [...ordered.slice(0, position), ...previous].filter((candidate) => isSameCharge(candidate, charge));
    const [closest] = matches.sort(closestTo(charge.tx));
    if (closest) {
      duplicates.set(charge.tx.id, {
        transactionId: closest.tx.id,
        date: closest.tx.date,
        sameStatement: closest.sameStatement,
      });
    }
  });
  return duplicates;
}

const usdCeilings = (history: TransactionDTO[][]): Map<string, number> => {
  const ceilings = new Map<string, number>();
  for (const tx of charges(history.flat())) {
    if (tx.currency !== "USD") continue;
    const key = merchantMatchKey(tx.merchant);
    ceilings.set(key, Math.max(ceilings.get(key) ?? 0, tx.amount));
  }
  return ceilings;
};

export function findUnusualUsd(current: TransactionDTO[], history: TransactionDTO[][]): Map<string, number | null> {
  const ceilings = usdCeilings(history);
  const unusual = new Map<string, number | null>();
  for (const tx of charges(current)) {
    if (tx.currency !== "USD" || isOldInstallment(tx)) continue;
    const ceiling = ceilings.get(merchantMatchKey(tx.merchant));
    if (ceiling === undefined) unusual.set(tx.id, null);
    else if (tx.amount > ceiling * USD_SPIKE_RATIO) unusual.set(tx.id, ceiling);
  }
  return unusual;
}

export function findNewMerchants(current: TransactionDTO[], knownMerchants: string[]): Set<string> {
  const known = new Set(knownMerchants.map(merchantMatchKey));
  const fresh = charges(current).filter((tx) => !isOldInstallment(tx) && !known.has(merchantMatchKey(tx.merchant)));
  return new Set(fresh.map((tx) => tx.id));
}

export function findUncategorized(current: TransactionDTO[]): Set<string> {
  const uncategorized = purchases(current).filter((tx) => tx.category === UNCATEGORIZED_CATEGORY);
  return new Set(uncategorized.map((tx) => tx.id));
}

const arsPurchases = (txs: TransactionDTO[]): TransactionDTO[] => purchases(txs).filter((tx) => tx.currency === "ARS");

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const categoryTotals = (txs: TransactionDTO[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const tx of arsPurchases(txs)) {
    if (tx.category === UNCATEGORIZED_CATEGORY) continue;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + signedAmount(tx));
  }
  return totals;
};

const isSpike = (total: number, average: number, threshold: number): boolean =>
  average <= 0
    ? total >= threshold
    : total >= average * CATEGORY_SPIKE_RATIO && total - average >= threshold;

const bySpikeSize = (a: ReviewCategoryFinding, b: ReviewCategoryFinding): number =>
  b.total - b.average - (a.total - a.average) || a.category.localeCompare(b.category);

export function findCategorySpikes(current: TransactionDTO[], history: TransactionDTO[][]): ReviewCategoryFinding[] {
  const statementTotal = sum(arsPurchases(current).map(signedAmount));
  if (history.length === 0 || statementTotal <= 0) return [];
  const threshold = CATEGORY_SPIKE_MIN_SHARE * statementTotal;
  const historyTotals = history.map(categoryTotals);
  const spikes: ReviewCategoryFinding[] = [];
  for (const [category, total] of categoryTotals(current)) {
    if (total <= 0) continue;
    const average = sum(historyTotals.map((totals) => totals.get(category) ?? 0)) / history.length;
    if (!isSpike(total, average, threshold)) continue;
    spikes.push({
      kind: "category",
      key: `cat:${category}`,
      category,
      total,
      average,
      ratio: average > 0 ? total / average : null,
    });
  }
  return spikes.sort(bySpikeSize);
}

const reasonRank = (reason: ReviewReason): number => REASON_ORDER.indexOf(reason);

const byReasonDateId = (a: ReviewTransactionFinding, b: ReviewTransactionFinding): number =>
  reasonRank(a.reasons[0]) - reasonRank(b.reasons[0]) || byDateThenId(a.transaction, b.transaction);

const skippedChecksFor = ({ history, previousStatements }: StatementReviewInput): ReviewCheck[] => {
  const skipped = new Set<ReviewCheck>();
  if (history.length === 0) skipped.add("usd");
  if (previousStatements === 0) skipped.add("nuevo");
  if (history.length < CATEGORY_MIN_HISTORY) skipped.add("categoria");
  return CHECK_ORDER.filter((check) => skipped.has(check));
};

export function buildStatementReview(input: StatementReviewInput): StatementReviewResult {
  const { current, history, knownMerchants } = input;
  const skippedChecks = skippedChecksFor(input);
  const skipped = new Set(skippedChecks);
  const duplicates = findDuplicates(current, history);
  const unusualUsd = skipped.has("usd") ? new Map<string, number | null>() : findUnusualUsd(current, history);
  const newMerchants = skipped.has("nuevo") ? new Set<string>() : findNewMerchants(current, knownMerchants);
  const uncategorized = findUncategorized(current);
  const hasReason: Record<ReviewReason, (id: string) => boolean> = {
    duplicado: (id) => duplicates.has(id),
    usd: (id) => unusualUsd.has(id),
    nuevo: (id) => newMerchants.has(id),
    "sin-categoria": (id) => uncategorized.has(id),
  };
  const transactionFindings = purchases(current)
    .map((transaction): ReviewTransactionFinding => ({
      kind: "transaction",
      key: `tx:${transaction.id}`,
      transaction,
      reasons: REASON_ORDER.filter((reason) => hasReason[reason](transaction.id)),
      duplicateOf: duplicates.get(transaction.id) ?? null,
      usualUsd: unusualUsd.get(transaction.id) ?? null,
    }))
    .filter((finding) => finding.reasons.length > 0)
    .sort(byReasonDateId);
  const categoryFindings = skipped.has("categoria") ? [] : findCategorySpikes(current, history);
  return { findings: [...transactionFindings, ...categoryFindings], skippedChecks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/statementReview.test.ts`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/statementReview.ts server/src/stats/statementReview.test.ts
git commit -m "feat(server): cálculo de la revisión del resumen antes de pagarlo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API de la revisión (`GET` y `PATCH /api/statements/:id/review`)

**Files:**
- Modify: `server/src/http/routes/statementReview.ts` (reemplaza el stub de la base; el export y `mergeParams` no cambian)
- Test: `server/src/http/routes/statementReview.test.ts`

**Interfaces:**
- Consumes: `buildStatementReview`, `REVIEW_WINDOW` (Task 1); `statementsBefore`, `StatementRecency` (`server/src/stats/lastStatement.ts`); `toStatementDTO`, `toTransactionDTO` (`server/src/http/mappers.ts`); `statementReviewPatchSchema`, `StatementReviewDTO`, `StatementReviewKeysDTO`, `TransactionDTO` (`@ledgerly/shared`).
- Produces: `GET /api/statements/:id/review` → `StatementReviewDTO`; `PATCH /api/statements/:id/review` con `{ keys, reviewed }` → `{ reviewedKeys }`; errores `404 { error: "Resumen no encontrado" }` y `400 { error: "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }" }`.

- [ ] **Step 1: Write the failing test**

`server/src/http/routes/statementReview.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { ReviewFinding, StatementReviewDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

const money = { ars: 0, usd: 0 };
const MISSING_ID = "64b7f9c2a1b2c3d4e5f60718";
const NOT_FOUND = { error: "Resumen no encontrado" };

interface StatementSeed {
  issuer: "visa_signature" | "icbc";
  cardLabel: string;
  closingDate: string;
  hash: string;
}

interface TransactionSeed {
  merchant: string;
  date: string;
  amount?: number;
}

const createStatement = ({ issuer, cardLabel, closingDate, hash }: StatementSeed) =>
  StatementModel.create({
    issuer, cardLabel, last4: null, closingDate: new Date(closingDate), dueDate: null,
    totals: { totalConsumos: money, saldoActual: money, pagoMinimo: money, saldoAnterior: money },
    sourceFileName: `${hash}.pdf`, sourceHash: hash, pageCount: 1, parserVersion: "1",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });

type SeededStatement = Awaited<ReturnType<typeof createStatement>>;

const createTransaction = (statement: SeededStatement, { merchant, date, amount = 1000 }: TransactionSeed) =>
  TransactionModel.create({
    statementId: statement._id, issuer: statement.issuer, cardLabel: statement.cardLabel, date: new Date(date),
    descriptionRaw: merchant, merchant, category: "Comida", categorySource: "rule", amount, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: false, fingerprint: `${statement.issuer}|${merchant}|${date}|${amount}`,
  });

const VISA = { issuer: "visa_signature", cardLabel: "Visa Signature ****1234" } as const;

const seed = async () => {
  const visaJul = await createStatement({ ...VISA, closingDate: "2026-07-25", hash: "visa-jul" });
  const visaAug = await createStatement({ ...VISA, closingDate: "2026-08-25", hash: "visa-ago" });
  const visaSep = await createStatement({ ...VISA, closingDate: "2026-09-25", hash: "visa-sep" });
  const icbcSep = await createStatement({ issuer: "icbc", cardLabel: "ICBC", closingDate: "2026-09-20", hash: "icbc-sep" });
  await createTransaction(visaJul, { merchant: "COMERCIO UNO", date: "2026-07-10" });
  const augustCharge = await createTransaction(visaAug, { merchant: "COMERCIO UNO", date: "2026-08-24" });
  await createTransaction(visaSep, { merchant: "COMERCIO UNO", date: "2026-08-26" });
  await createTransaction(visaSep, { merchant: "TIENDA ICBC", date: "2026-09-12", amount: 5000 });
  await createTransaction(icbcSep, { merchant: "TIENDA ICBC", date: "2026-09-11", amount: 5000 });
  return { visaJul, visaAug, visaSep, icbcSep, augustCharge };
};

let ids: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  ids = await seed();
});

const getReview = async (id: string): Promise<StatementReviewDTO> => {
  const res = await request(app).get(`/api/statements/${id}/review`);
  expect(res.status).toBe(200);
  return res.body as StatementReviewDTO;
};

const findingFor = (review: StatementReviewDTO, merchant: string): ReviewFinding | undefined =>
  review.findings.find((finding) => finding.kind === "transaction" && finding.transaction.merchant === merchant);

const patchReview = (id: string, body: object) => request(app).patch(`/api/statements/${id}/review`).send(body);

describe("GET /api/statements/:id/review", () => {
  it("compara contra los resúmenes anteriores de la misma tarjeta", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(review).toMatchObject({
      statement: { id: ids.visaSep._id.toString(), cardLabel: "Visa Signature ****1234", transactionCount: 2 },
      previousStatements: 2,
      historyStatements: 2,
      skippedChecks: ["categoria"],
      reviewedKeys: [],
    });
  });

  it("un comercio usado solo en ICBC es nuevo en Visa, y un cargo de ICBC no lo vuelve duplicado", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(findingFor(review, "TIENDA ICBC")).toMatchObject({ reasons: ["nuevo"], duplicateOf: null });
  });

  it("un duplicado contra el resumen anterior apunta a ese movimiento", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(findingFor(review, "COMERCIO UNO")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: ids.augustCharge._id.toString(), date: "2026-08-24", sameStatement: false },
    });
  });

  it("revisar un resumen viejo no usa los posteriores como historia", async () => {
    const review = await getReview(ids.visaAug._id.toString());
    expect(review).toMatchObject({ previousStatements: 1, historyStatements: 1, findings: [] });
  });

  it("el primer resumen de la tarjeta saltea los chequeos que necesitan historia", async () => {
    const review = await getReview(ids.visaJul._id.toString());
    expect(review).toMatchObject({ previousStatements: 0, historyStatements: 0, skippedChecks: ["usd", "nuevo", "categoria"] });
  });

  it("404 si el resumen no existe o el id no es válido", async () => {
    const missing = await request(app).get(`/api/statements/${MISSING_ID}/review`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    const invalid = await request(app).get("/api/statements/no-es-un-id/review");
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual(NOT_FOUND);
  });
});

describe("PATCH /api/statements/:id/review", () => {
  it("tildar agrega las claves sin repetir, y el GET las devuelve", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a", "tx:b"], reviewed: true });
    const res = await patchReview(id, { keys: ["tx:a"], reviewed: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviewedKeys: ["tx:a", "tx:b"] });
    expect((await getReview(id)).reviewedKeys).toEqual(["tx:a", "tx:b"]);
  });

  it("destildar saca las claves, aunque alguna no estuviera", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a", "cat:Comida"], reviewed: true });
    const res = await patchReview(id, { keys: ["tx:a", "tx:zz"], reviewed: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviewedKeys: ["cat:Comida"] });
  });

  it("400 con un cuerpo inválido", async () => {
    const id = ids.visaSep._id.toString();
    const empty = await patchReview(id, { keys: [], reviewed: true });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }" });
    expect((await patchReview(id, { keys: ["tx:a"] })).status).toBe(400);
  });

  it("404 si el resumen no existe o el id no es válido", async () => {
    const missing = await patchReview(MISSING_ID, { keys: ["tx:a"], reviewed: true });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    expect((await patchReview("no-es-un-id", { keys: ["tx:a"], reviewed: true })).status).toBe(404);
  });
});

describe("borrar el resumen", () => {
  it("se lleva su revisión", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a"], reviewed: true });
    expect((await request(app).delete(`/api/imports/statement/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/statements/${id}/review`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/routes/statementReview.test.ts`
Expected: FAIL — los GET y PATCH responden `404 { error: "No encontrado" }` (el stub no tiene handlers).

- [ ] **Step 3: Write minimal implementation**

`server/src/http/routes/statementReview.ts`:

```ts
import { Router } from "express";
import { isValidObjectId, type Types } from "mongoose";
import {
  statementReviewPatchSchema,
  type StatementReviewDTO,
  type StatementReviewKeysDTO,
  type TransactionDTO,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
import { toStatementDTO, toTransactionDTO } from "../mappers.js";
import { statementsBefore, type StatementRecency } from "../../stats/lastStatement.js";
import { REVIEW_WINDOW, buildStatementReview } from "../../stats/statementReview.js";

export const statementReviewRouter = Router({ mergeParams: true });

const NOT_FOUND = "Resumen no encontrado";
const INVALID_BODY = "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }";

interface StatementRecencySource {
  _id: Types.ObjectId;
  issuer: string;
  closingDate?: Date | null;
}

const recencyOf = (doc: StatementRecencySource): StatementRecency<Types.ObjectId> => ({
  id: doc._id,
  issuer: doc.issuer,
  closingDate: doc.closingDate ?? null,
  uploadedAt: (doc as unknown as { uploadedAt: Date }).uploadedAt,
});

const findStatement = async (id: string) => {
  const statement = isValidObjectId(id) ? await StatementModel.findById(id) : null;
  if (!statement) throw new HttpError(404, NOT_FOUND);
  return statement;
};

const groupByStatement = (transactions: TransactionDTO[], statementIds: string[]): TransactionDTO[][] => {
  const groups = new Map<string, TransactionDTO[]>(statementIds.map((id) => [id, []]));
  for (const transaction of transactions) groups.get(transaction.statementId)?.push(transaction);
  return statementIds.map((id) => groups.get(id) ?? []);
};

statementReviewRouter.get("/", asyncHandler(async (req, res) => {
  const statement = await findStatement(req.params.id);
  const others = await StatementModel.find({ issuer: statement.issuer, _id: { $ne: statement._id } }).lean();
  const previous = statementsBefore(recencyOf(statement), others.map(recencyOf));
  const previousIds = previous.map(({ id }) => id);
  const windowIds = previousIds.slice(0, REVIEW_WINDOW);
  const [currentDocs, windowDocs, knownMerchants] = await Promise.all([
    TransactionModel.find({ statementId: statement._id }).sort({ date: 1 }),
    TransactionModel.find({ statementId: { $in: windowIds } }),
    TransactionModel.distinct("merchant", { statementId: { $in: previousIds }, type: "purchase" }),
  ]);
  const current = currentDocs.map(toTransactionDTO);
  const history = groupByStatement(windowDocs.map(toTransactionDTO), windowIds.map(String));
  const { findings, skippedChecks } = buildStatementReview({
    current,
    history,
    knownMerchants: knownMerchants.map(String),
    previousStatements: previous.length,
  });
  const body: StatementReviewDTO = {
    statement: toStatementDTO(statement, current.length),
    previousStatements: previous.length,
    historyStatements: history.length,
    skippedChecks,
    findings,
    reviewedKeys: [...statement.reviewedKeys],
  };
  res.json(body);
}));

statementReviewRouter.patch("/", asyncHandler(async (req, res) => {
  const parsed = statementReviewPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_BODY);
  const { keys, reviewed } = parsed.data;
  const update = reviewed
    ? { $addToSet: { reviewedKeys: { $each: keys } } }
    : { $pull: { reviewedKeys: { $in: keys } } };
  const { id } = req.params;
  const statement = isValidObjectId(id) ? await StatementModel.findByIdAndUpdate(id, update, { new: true }) : null;
  if (!statement) throw new HttpError(404, NOT_FOUND);
  const body: StatementReviewKeysDTO = { reviewedKeys: [...statement.reviewedKeys] };
  res.json(body);
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/routes/statementReview.test.ts server/src/http/app.test.ts`
Expected: PASS. Después `bun run typecheck`: sin errores.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/statementReview.ts server/src/http/routes/statementReview.test.ts
git commit -m "feat(server): GET y PATCH de la revisión del resumen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Módulo puro del cliente (`client/src/statementReview.ts`)

**Files:**
- Modify: `client/src/statementReview.ts` (se agrega todo lo nuevo; `applyReviewedDelta` queda igual)
- Test: `client/src/statementReview.test.ts` (se agregan describes; los de `applyReviewedDelta` quedan igual)

**Interfaces:**
- Consumes: `latestStatementPerIssuer(statements: StatementDTO[]): StatementDTO[]` (`client/src/cardCycle.ts`), `formatMoney`, `formatSignedPercent` (`client/src/format.ts`), tipos de `@ledgerly/shared`.
- Produces:
  - `REVIEW_CHECK_ORDER`, `REVIEW_CHECK_LABELS`, `REVIEW_REASON_LABELS`, `REVIEW_CHECK_COLORS`, `CATEGORY_HISTORY_NEEDED`, `type ReviewChipColor = "error" | "warning" | "info" | "default"`
  - `interface ReviewOption { statement: StatementDTO; isLatest: boolean }` y `reviewOptions(statements: StatementDTO[] | undefined, focus: StatementDTO | null): ReviewOption[]`
  - `selectedReviewId(options: { id: string }[], selected: string | null): string | null`
  - `interface ReviewProgress { reviewed: number; total: number; pending: number; done: boolean; pendingKeys: string[] }` y `reviewProgress(findings, reviewedKeys)`
  - `interface ReviewCheckSummary { check: ReviewCheck; label: string; count: number; skipped: boolean }` y `reviewCheckSummary(review)`
  - `interface SplitFindings { transactions: ReviewTransactionFinding[]; categories: ReviewCategoryFinding[] }` y `splitFindings(findings)`
  - `transactionFindingNotes(finding, historyStatements): string[]`, `categoryFindingNote(finding, historyStatements): string`, `categoryFindingBadge(finding): string`, `historyCaption(review): string`, `statementCaption(statement): string`

- [ ] **Step 1: Write the failing test**

`client/src/statementReview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  ReviewCategoryFinding, ReviewTransactionFinding, StatementDTO, StatementReviewDTO, TransactionDTO,
} from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  applyReviewedDelta,
  categoryFindingBadge,
  categoryFindingNote,
  historyCaption,
  reviewCheckSummary,
  reviewOptions,
  reviewProgress,
  selectedReviewId,
  splitFindings,
  statementCaption,
  transactionFindingNotes,
} from "./statementReview.js";

const statement = (id: string, overrides: Partial<StatementDTO> = {}): StatementDTO => ({
  id,
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 1234567.89, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-09-26T12:00:00.000Z",
  ...overrides,
});

const transaction = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s1", issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
  descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", category: "Comida", categorySource: "rule",
  amount: 2500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: null, ...overrides,
});

const txFinding = (id: string, overrides: Partial<ReviewTransactionFinding> = {}): ReviewTransactionFinding => ({
  kind: "transaction",
  key: `tx:${id}`,
  transaction: transaction(id),
  reasons: ["sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
  ...overrides,
});

const catFinding = (category: string, overrides: Partial<ReviewCategoryFinding> = {}): ReviewCategoryFinding => ({
  kind: "category", key: `cat:${category}`, category, total: 450000, average: 250000, ratio: 1.8, ...overrides,
});

const reviewWith = (overrides: Partial<StatementReviewDTO> = {}): StatementReviewDTO => ({
  statement: statement("s1"),
  previousStatements: 9,
  historyStatements: 6,
  skippedChecks: [],
  findings: [],
  reviewedKeys: [],
  ...overrides,
});

describe("applyReviewedDelta", () => {
  it("tildar agrega las claves al final, sin repetir y manteniendo el orden", () => {
    expect(applyReviewedDelta(["tx:a"], ["tx:b", "tx:a", "tx:b"], true)).toEqual(["tx:a", "tx:b"]);
  });

  it("destildar saca las claves", () => {
    expect(applyReviewedDelta(["tx:a", "cat:Comida", "tx:b"], ["cat:Comida"], false)).toEqual(["tx:a", "tx:b"]);
  });

  it("es idempotente", () => {
    const once = applyReviewedDelta(["tx:a"], ["tx:b"], true);
    expect(applyReviewedDelta(once, ["tx:b"], true)).toEqual(once);
    expect(applyReviewedDelta(["tx:a"], ["tx:z"], false)).toEqual(["tx:a"]);
  });

  it("no deja duplicados que ya vinieran en la lista", () => {
    expect(applyReviewedDelta(["tx:a", "tx:a"], [], true)).toEqual(["tx:a"]);
  });
});

describe("reviewOptions", () => {
  const visaOld = statement("v1", { closingDate: "2026-08-25" });
  const visaNew = statement("v2", { closingDate: "2026-09-25" });
  const icbc = statement("i1", { issuer: "icbc", cardLabel: "ICBC", closingDate: "2026-09-20" });

  it("ofrece el último resumen de cada tarjeta", () => {
    expect(reviewOptions([visaOld, icbc, visaNew], null)).toEqual([
      { statement: visaNew, isLatest: true },
      { statement: icbc, isLatest: true },
    ]);
  });

  it("un foco que no es el último va primero", () => {
    const options = reviewOptions([visaOld, icbc, visaNew], visaOld);
    expect(options.map((option) => [option.statement.id, option.isLatest])).toEqual([["v1", false], ["v2", true], ["i1", true]]);
  });

  it("un foco que ya es el último no se repite", () => {
    expect(reviewOptions([visaOld, icbc, visaNew], visaNew).map((option) => option.statement.id)).toEqual(["v2", "i1"]);
  });

  it("sin una lista válida queda solo el foco, o nada", () => {
    expect(reviewOptions(undefined, null)).toEqual([]);
    expect(reviewOptions({} as unknown as StatementDTO[], null)).toEqual([]);
    expect(reviewOptions(undefined, visaOld)).toEqual([{ statement: visaOld, isLatest: false }]);
  });
});

describe("selectedReviewId", () => {
  const options = [{ id: "v2" }, { id: "i1" }];

  it("respeta la elección si sigue entre las opciones", () => {
    expect(selectedReviewId(options, "i1")).toBe("i1");
  });

  it("sin elección, o si el resumen elegido ya no está, toma la primera opción", () => {
    expect(selectedReviewId(options, null)).toBe("v2");
    expect(selectedReviewId(options, "borrado")).toBe("v2");
    expect(selectedReviewId([], "borrado")).toBeNull();
  });
});

describe("reviewProgress", () => {
  it("cuenta solo las claves de los hallazgos actuales", () => {
    const findings = [txFinding("a"), txFinding("b"), catFinding("Comida")];
    expect(reviewProgress(findings, ["tx:a", "tx:vieja"])).toEqual({
      reviewed: 1, total: 3, pending: 2, done: false, pendingKeys: ["tx:b", "cat:Comida"],
    });
  });

  it("con todo tildado está hecho", () => {
    expect(reviewProgress([txFinding("a")], ["tx:a"])).toMatchObject({ reviewed: 1, pending: 0, done: true });
  });

  it("sin hallazgos está hecho", () => {
    expect(reviewProgress([], ["tx:vieja"])).toEqual({ reviewed: 0, total: 0, pending: 0, done: true, pendingKeys: [] });
  });
});

describe("splitFindings", () => {
  it("separa movimientos y categorías sin cambiar el orden", () => {
    const findings = [txFinding("a"), catFinding("Comida"), txFinding("b")];
    const { transactions, categories } = splitFindings(findings);
    expect(transactions.map((finding) => finding.key)).toEqual(["tx:a", "tx:b"]);
    expect(categories.map((finding) => finding.key)).toEqual(["cat:Comida"]);
  });
});

describe("reviewCheckSummary", () => {
  it("cuenta motivos por chequeo y marca los salteados", () => {
    const review = reviewWith({
      skippedChecks: ["categoria"],
      findings: [
        txFinding("a", { reasons: ["duplicado"] }),
        txFinding("b", { reasons: ["usd", "nuevo", "sin-categoria"] }),
        txFinding("c", { reasons: ["nuevo"] }),
      ],
    });
    expect(reviewCheckSummary(review)).toEqual([
      { check: "duplicado", label: "Duplicados", count: 1, skipped: false },
      { check: "usd", label: "USD inusuales", count: 1, skipped: false },
      { check: "nuevo", label: "Comercios nuevos", count: 2, skipped: false },
      { check: "categoria", label: "Categorías en alza", count: 0, skipped: true },
      { check: "sin-categoria", label: "Sin categoría", count: 1, skipped: false },
    ]);
  });

  it("las categorías en alza cuentan hallazgos de categoría", () => {
    const summary = reviewCheckSummary(reviewWith({ findings: [catFinding("A"), catFinding("B")] }));
    expect(summary.find((item) => item.check === "categoria")).toMatchObject({ count: 2, skipped: false });
  });
});

describe("transactionFindingNotes", () => {
  it("un duplicado en el mismo resumen", () => {
    const finding = txFinding("a", {
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "z", date: "2026-09-11", sameStatement: true },
    });
    expect(transactionFindingNotes(finding, 6)).toEqual(["Mismo comercio y monto que el cargo del 2026-09-11."]);
  });

  it("un duplicado contra un resumen anterior", () => {
    const finding = txFinding("a", {
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "z", date: "2026-08-29", sameStatement: false },
    });
    expect(transactionFindingNotes(finding, 6)).toEqual([
      "Mismo comercio y monto que un cargo del 2026-08-29, en un resumen anterior.",
    ]);
  });

  it("un cargo en USD de un comercio sin cargos en USD", () => {
    const finding = txFinding("a", { reasons: ["usd"], usualUsd: null });
    expect(transactionFindingNotes(finding, 6)).toEqual(["Sin cargos en USD de este comercio en los últimos 6 resúmenes."]);
    expect(transactionFindingNotes(finding, 1)).toEqual(["Sin cargos en USD de este comercio en el resumen anterior."]);
  });

  it("un cargo en USD que subió", () => {
    const finding = txFinding("a", {
      reasons: ["usd"],
      usualUsd: 10.99,
      transaction: transaction("a", { amount: 14.99, currency: "USD" }),
    });
    expect(transactionFindingNotes(finding, 6)).toEqual([`Hasta ahora, como mucho ${formatMoney(10.99, "USD")} (+36,4%).`]);
  });

  it("los otros motivos no agregan notas", () => {
    expect(transactionFindingNotes(txFinding("a", { reasons: ["nuevo", "sin-categoria"] }), 6)).toEqual([]);
  });
});

describe("textos de las categorías en alza", () => {
  it("la nota muestra el promedio, o que no había gasto", () => {
    expect(categoryFindingNote(catFinding("Supermercado"), 6))
      .toBe(`Promedio de los últimos 6 resúmenes: ${formatMoney(250000, "ARS")}`);
    expect(categoryFindingNote(catFinding("Viajes", { average: 0, ratio: null }), 6)).toBe("Sin gasto en los últimos 6 resúmenes");
  });

  it("el badge muestra la suba, o «Nueva»", () => {
    expect(categoryFindingBadge(catFinding("Supermercado"))).toBe("+80,0%");
    expect(categoryFindingBadge(catFinding("Viajes", { average: 0, ratio: null }))).toBe("Nueva");
  });
});

describe("historyCaption", () => {
  it("el primer resumen de la tarjeta", () => {
    expect(historyCaption(reviewWith({ previousStatements: 0, historyStatements: 0, skippedChecks: ["usd", "nuevo", "categoria"] })))
      .toBe("Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría.");
  });

  it("con poca historia, en singular y en plural", () => {
    expect(historyCaption(reviewWith({ previousStatements: 1, historyStatements: 1, skippedChecks: ["categoria"] })))
      .toBe("Comparado con 1 resumen anterior. Para comparar categorías hacen falta 3.");
    expect(historyCaption(reviewWith({ previousStatements: 2, historyStatements: 2, skippedChecks: ["categoria"] })))
      .toBe("Comparado con 2 resúmenes anteriores. Para comparar categorías hacen falta 3.");
  });

  it("con la ventana completa", () => {
    expect(historyCaption(reviewWith())).toBe("Comparado con los 6 resúmenes anteriores de esta tarjeta.");
  });
});

describe("statementCaption", () => {
  it("cierre, vencimiento y saldo en pesos", () => {
    expect(statementCaption(statement("s1")))
      .toBe(`Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${formatMoney(1234567.89, "ARS")}`);
  });

  it("suma el saldo en dólares solo si hay", () => {
    const withUsd = statement("s1", {
      totals: { ...statement("s1").totals, saldoActual: { ars: 1000, usd: 45 } },
    });
    expect(statementCaption(withUsd)).toBe(
      `Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${formatMoney(1000, "ARS")} + ${formatMoney(45, "USD")}`,
    );
  });

  it("las fechas que faltan van como guion", () => {
    expect(statementCaption(statement("s1", { closingDate: null, dueDate: null })))
      .toBe(`Cierre — · Vence — · Saldo ${formatMoney(1234567.89, "ARS")}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/statementReview.test.ts`
Expected: FAIL — `reviewOptions is not a function` (y el resto de las funciones nuevas).

- [ ] **Step 3: Write minimal implementation**

`client/src/statementReview.ts`:

```ts
import type {
  ReviewCategoryFinding,
  ReviewCheck,
  ReviewDuplicateRef,
  ReviewFinding,
  ReviewReason,
  ReviewTransactionFinding,
  StatementDTO,
  StatementReviewDTO,
} from "@ledgerly/shared";
import { latestStatementPerIssuer } from "./cardCycle.js";
import { formatMoney, formatSignedPercent } from "./format.js";

export type ReviewChipColor = "error" | "warning" | "info" | "default";

export const REVIEW_CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];

export const REVIEW_CHECK_LABELS: Record<ReviewCheck, string> = {
  duplicado: "Duplicados",
  usd: "USD inusuales",
  nuevo: "Comercios nuevos",
  categoria: "Categorías en alza",
  "sin-categoria": "Sin categoría",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  duplicado: "¿Duplicado?",
  usd: "USD inusual",
  nuevo: "Comercio nuevo",
  "sin-categoria": "Sin categoría",
};

export const REVIEW_CHECK_COLORS: Record<ReviewCheck, ReviewChipColor> = {
  duplicado: "error",
  usd: "warning",
  nuevo: "info",
  categoria: "warning",
  "sin-categoria": "default",
};

export const CATEGORY_HISTORY_NEEDED = 3;

export interface ReviewOption {
  statement: StatementDTO;
  isLatest: boolean;
}

export interface ReviewProgress {
  reviewed: number;
  total: number;
  pending: number;
  done: boolean;
  pendingKeys: string[];
}

export interface ReviewCheckSummary {
  check: ReviewCheck;
  label: string;
  count: number;
  skipped: boolean;
}

export interface SplitFindings {
  transactions: ReviewTransactionFinding[];
  categories: ReviewCategoryFinding[];
}

export function applyReviewedDelta(current: string[], keys: string[], reviewed: boolean): string[] {
  const unique = [...new Set(current)];
  if (!reviewed) {
    const removed = new Set(keys);
    return unique.filter((key) => !removed.has(key));
  }
  const present = new Set(unique);
  const added = [...new Set(keys)].filter((key) => !present.has(key));
  return [...unique, ...added];
}

export function reviewOptions(statements: StatementDTO[] | undefined, focus: StatementDTO | null): ReviewOption[] {
  const list = Array.isArray(statements) ? statements : [];
  const latest = latestStatementPerIssuer(list).map((statement) => ({ statement, isLatest: true }));
  if (!focus || latest.some((option) => option.statement.id === focus.id)) return latest;
  return [{ statement: focus, isLatest: false }, ...latest];
}

export function selectedReviewId(options: { id: string }[], selected: string | null): string | null {
  if (selected !== null && options.some((option) => option.id === selected)) return selected;
  return options[0]?.id ?? null;
}

export function reviewProgress(findings: ReviewFinding[], reviewedKeys: string[]): ReviewProgress {
  const marked = new Set(reviewedKeys);
  const pendingKeys = findings.filter((finding) => !marked.has(finding.key)).map((finding) => finding.key);
  const total = findings.length;
  return {
    reviewed: total - pendingKeys.length,
    total,
    pending: pendingKeys.length,
    done: pendingKeys.length === 0,
    pendingKeys,
  };
}

export function splitFindings(findings: ReviewFinding[]): SplitFindings {
  const transactions: ReviewTransactionFinding[] = [];
  const categories: ReviewCategoryFinding[] = [];
  for (const finding of findings) {
    if (finding.kind === "transaction") transactions.push(finding);
    else categories.push(finding);
  }
  return { transactions, categories };
}

export function reviewCheckSummary(review: StatementReviewDTO): ReviewCheckSummary[] {
  const { transactions, categories } = splitFindings(review.findings);
  const skipped = new Set(review.skippedChecks);
  const countFor = (check: ReviewCheck): number =>
    check === "categoria"
      ? categories.length
      : transactions.filter((finding) => finding.reasons.some((reason) => reason === check)).length;
  return REVIEW_CHECK_ORDER.map((check) => ({
    check,
    label: REVIEW_CHECK_LABELS[check],
    count: countFor(check),
    skipped: skipped.has(check),
  }));
}

const windowPhrase = (historyStatements: number): string =>
  historyStatements === 1 ? "el resumen anterior" : `los últimos ${historyStatements} resúmenes`;

const previousPhrase = (count: number): string => (count === 1 ? "1 resumen anterior" : `${count} resúmenes anteriores`);

const duplicateNote = ({ date, sameStatement }: ReviewDuplicateRef): string =>
  sameStatement
    ? `Mismo comercio y monto que el cargo del ${date}.`
    : `Mismo comercio y monto que un cargo del ${date}, en un resumen anterior.`;

const usdNote = (amount: number, usualUsd: number | null, historyStatements: number): string => {
  if (usualUsd === null) return `Sin cargos en USD de este comercio en ${windowPhrase(historyStatements)}.`;
  const rise = formatSignedPercent((amount / usualUsd - 1) * 100);
  return `Hasta ahora, como mucho ${formatMoney(usualUsd, "USD")} (${rise}).`;
};

export function transactionFindingNotes(finding: ReviewTransactionFinding, historyStatements: number): string[] {
  const notes: string[] = [];
  if (finding.duplicateOf) notes.push(duplicateNote(finding.duplicateOf));
  if (finding.reasons.includes("usd")) notes.push(usdNote(finding.transaction.amount, finding.usualUsd, historyStatements));
  return notes;
}

export function categoryFindingNote(finding: ReviewCategoryFinding, historyStatements: number): string {
  if (finding.ratio === null) return `Sin gasto en ${windowPhrase(historyStatements)}`;
  return `Promedio de ${windowPhrase(historyStatements)}: ${formatMoney(finding.average, "ARS")}`;
}

export function categoryFindingBadge(finding: ReviewCategoryFinding): string {
  return finding.ratio === null ? "Nueva" : formatSignedPercent((finding.ratio - 1) * 100);
}

export function historyCaption(review: StatementReviewDTO): string {
  if (review.previousStatements === 0) {
    return "Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría.";
  }
  const compared = previousPhrase(review.historyStatements);
  if (review.skippedChecks.includes("categoria")) {
    return `Comparado con ${compared}. Para comparar categorías hacen falta ${CATEGORY_HISTORY_NEEDED}.`;
  }
  return `Comparado con los ${compared} de esta tarjeta.`;
}

export function statementCaption(statement: StatementDTO): string {
  const { ars, usd } = statement.totals.saldoActual;
  const usdPart = usd > 0 ? ` + ${formatMoney(usd, "USD")}` : "";
  return `Cierre ${statement.closingDate ?? "—"} · Vence ${statement.dueDate ?? "—"} · Saldo ${formatMoney(ars, "ARS")}${usdPart}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/statementReview.test.ts client/src/api/hooks.test.tsx`
Expected: PASS (los hooks de la base siguen usando `applyReviewedDelta`).

- [ ] **Step 5: Commit**

```bash
git add client/src/statementReview.ts client/src/statementReview.test.ts
git commit -m "feat(client): opciones, progreso y textos de la revisión del resumen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Checklist presentacional

**Files:**
- Create: `client/src/components/ReviewFindingRow.tsx`
- Create: `client/src/components/ReviewTransactionItem.tsx`
- Create: `client/src/components/ReviewCategoryItem.tsx`
- Create: `client/src/components/StatementReviewChecklist.tsx`
- Test: `client/src/components/StatementReviewChecklist.test.tsx`

**Interfaces:**
- Consumes: todo lo de Task 3; `ReconciliationBanner` (`./ReconciliationBanner.js`), `MotionBox` (`./motion/motion.js`), `fadeUpItem` (`./motion/variants.js`), `compactCardContentSx`, `MIN_TAP_SIZE` y `tapTargetSx` (`./tapTarget.js`), `useIsMobile` (`../useIsMobile.js`).
- Produces:
  - `ReviewFindingRow({ findingKey, title, amount, reviewed, onToggle, children })` y `findingDetailsSx`
  - `ReviewTransactionItem({ finding, reviewed, historyStatements, onToggle })`
  - `ReviewCategoryItem({ finding, reviewed, historyStatements, onToggle })`
  - `StatementReviewChecklist({ review, onMark })` con `onMark: (keys: string[], reviewed: boolean) => void`

- [ ] **Step 1: Write the failing test**

`client/src/components/StatementReviewChecklist.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewFinding, StatementDTO, StatementReviewDTO, TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { StatementReviewChecklist } from "./StatementReviewChecklist.js";

afterEach(cleanup);

const STATEMENT: StatementDTO = {
  id: "s1",
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 1234567.89, usd: 45 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "visa.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 40,
  uploadedAt: "2026-09-26T12:00:00.000Z",
};

const transaction = (id: string, merchant: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s1", issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
  descriptionRaw: merchant, merchant, category: "Comida", categorySource: "rule", amount: 2500, currency: "ARS",
  direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
  comprobante: null, ...overrides,
});

const DUPLICATE: ReviewFinding = {
  kind: "transaction",
  key: "tx:t31",
  transaction: transaction("t31", "COMERCIO UNO"),
  reasons: ["duplicado"],
  duplicateOf: { transactionId: "t30", date: "2026-09-11", sameStatement: true },
  usualUsd: null,
};

const UNUSUAL_USD: ReviewFinding = {
  kind: "transaction",
  key: "tx:t35",
  transaction: transaction("t35", "SERVICIO EXTERIOR", { date: "2026-09-03", amount: 14.99, currency: "USD", category: "Suscripciones" }),
  reasons: ["usd"],
  duplicateOf: null,
  usualUsd: 10.99,
};

const NEW_UNCATEGORIZED: ReviewFinding = {
  kind: "transaction",
  key: "tx:t40",
  transaction: transaction("t40", "COMERCIO NUEVO", { date: "2026-09-15", amount: 8000, category: "Sin categoría" }),
  reasons: ["nuevo", "sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
};

const CATEGORY_SPIKE: ReviewFinding = {
  kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 450000, average: 250000, ratio: 1.8,
};

const FINDINGS = [DUPLICATE, UNUSUAL_USD, NEW_UNCATEGORIZED, CATEGORY_SPIKE];

const reviewWith = (overrides: Partial<StatementReviewDTO> = {}): StatementReviewDTO => ({
  statement: STATEMENT,
  previousStatements: 9,
  historyStatements: 6,
  skippedChecks: [],
  findings: FINDINGS,
  reviewedKeys: ["tx:t35"],
  ...overrides,
});

const setup = (review: StatementReviewDTO = reviewWith()) => {
  const onMark = vi.fn();
  renderWithProviders(<StatementReviewChecklist review={review} onMark={onMark} />);
  return { onMark };
};

const rowOf = (title: string): HTMLElement =>
  screen.getByRole("checkbox", { name: `revisado: ${title}` }).closest("li") as HTMLElement;

describe("StatementReviewChecklist", () => {
  it("muestra el resumen, el progreso y contra qué se comparó", () => {
    setup();
    expect(screen.getByText("Visa Signature ****1234")).toBeInTheDocument();
    expect(screen.getByText(
      `Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${formatMoney(1234567.89, "ARS")} + ${formatMoney(45, "USD")}`,
    )).toBeInTheDocument();
    expect(screen.getByText("1 de 4 revisados")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "progreso de la revisión" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Comparado con los 6 resúmenes anteriores de esta tarjeta.")).toBeInTheDocument();
  });

  it("resume cada chequeo en un chip", () => {
    setup();
    for (const label of ["Duplicados: 1", "USD inusuales: 1", "Comercios nuevos: 1", "Categorías en alza: 1", "Sin categoría: 1"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("muestra cada hallazgo con sus motivos y su porqué", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Movimientos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Categorías por encima de su promedio" })).toBeInTheDocument();
    const duplicate = rowOf("COMERCIO UNO");
    expect(within(duplicate).getByText("¿Duplicado?")).toBeInTheDocument();
    expect(within(duplicate).getByText("Comida")).toBeInTheDocument();
    expect(within(duplicate).getByText("2026-09-12")).toBeInTheDocument();
    expect(within(duplicate).getByText(formatMoney(2500, "ARS"))).toBeInTheDocument();
    expect(within(duplicate).getByText("Mismo comercio y monto que el cargo del 2026-09-11.")).toBeInTheDocument();
    const usd = rowOf("SERVICIO EXTERIOR");
    expect(within(usd).getByText("USD inusual")).toBeInTheDocument();
    expect(within(usd).getByText(formatMoney(14.99, "USD"))).toBeInTheDocument();
    expect(within(usd).getByText(`Hasta ahora, como mucho ${formatMoney(10.99, "USD")} (+36,4%).`)).toBeInTheDocument();
    const fresh = rowOf("COMERCIO NUEVO");
    expect(within(fresh).getByText("Comercio nuevo")).toBeInTheDocument();
    expect(within(fresh).getAllByText("Sin categoría")).toHaveLength(1);
    const category = rowOf("Supermercado");
    expect(within(category).getByText(formatMoney(450000, "ARS"))).toBeInTheDocument();
    expect(within(category).getByText(`Promedio de los últimos 6 resúmenes: ${formatMoney(250000, "ARS")}`)).toBeInTheDocument();
    expect(within(category).getByText("+80,0%")).toBeInTheDocument();
  });

  it("los tildados quedan marcados y no cambian de lugar", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "revisado: SERVICIO EXTERIOR" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "revisado: COMERCIO UNO", "revisado: SERVICIO EXTERIOR", "revisado: COMERCIO NUEVO", "revisado: Supermercado",
    ]);
  });

  it("tocar una fila la tilda, y tocar una tildada la destilda", async () => {
    const { onMark } = setup();
    await userEvent.click(screen.getByText("COMERCIO UNO"));
    expect(onMark).toHaveBeenLastCalledWith(["tx:t31"], true);
    await userEvent.click(screen.getByRole("checkbox", { name: "revisado: SERVICIO EXTERIOR" }));
    expect(onMark).toHaveBeenLastCalledWith(["tx:t35"], false);
    await userEvent.click(screen.getByText("Supermercado"));
    expect(onMark).toHaveBeenLastCalledWith(["cat:Supermercado"], true);
    expect(onMark).toHaveBeenCalledTimes(3);
  });

  it("«Marcar todo como revisado» manda solo las pendientes", async () => {
    const { onMark } = setup(reviewWith({ reviewedKeys: ["tx:t35", "tx:vieja"] }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar todo como revisado" }));
    expect(onMark).toHaveBeenCalledWith(["tx:t31", "tx:t40", "cat:Supermercado"], true);
  });

  it("con todo revisado muestra «Revisado» y no ofrece marcar todo", () => {
    setup(reviewWith({ reviewedKeys: ["tx:t31", "tx:t35", "tx:t40", "cat:Supermercado"] }));
    expect(screen.getByText("Revisado")).toBeInTheDocument();
    expect(screen.getByText("4 de 4 revisados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar todo como revisado" })).not.toBeInTheDocument();
  });

  it("sin hallazgos lo dice, sin progreso ni acciones", () => {
    setup(reviewWith({ findings: [], reviewedKeys: [] }));
    expect(screen.getByText("No encontramos nada raro en este resumen.")).toBeInTheDocument();
    expect(screen.getByText("Duplicados: 0")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Revisado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar todo como revisado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Movimientos" })).not.toBeInTheDocument();
  });

  it("los chequeos que necesitan historia se muestran sin historial en el primer resumen", () => {
    setup(reviewWith({
      previousStatements: 0,
      historyStatements: 0,
      skippedChecks: ["usd", "nuevo", "categoria"],
      findings: [DUPLICATE],
      reviewedKeys: [],
    }));
    expect(screen.getByText("Comercios nuevos: sin historial")).toBeInTheDocument();
    expect(screen.getByText("USD inusuales: sin historial")).toBeInTheDocument();
    expect(screen.getByText("Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría."))
      .toBeInTheDocument();
  });

  it("avisa si el resumen no reconcilia", () => {
    setup(reviewWith({
      statement: {
        ...STATEMENT,
        needsReview: true,
        reconciliation: { ok: false, entries: [{ currency: "ARS", expected: 100, parsed: 90, diff: 10, ok: false }] },
      },
    }));
    expect(screen.getByText("La reconciliación no cuadra")).toBeInTheDocument();
  });

  it("ofrece ir a Reglas solo si hay movimientos sin categoría", () => {
    setup();
    expect(screen.getByRole("link", { name: "Categorizar en Reglas" })).toHaveAttribute("href", "/rules");
    cleanup();
    setup(reviewWith({ findings: [DUPLICATE, UNUSUAL_USD] }));
    expect(screen.queryByRole("link", { name: "Categorizar en Reglas" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/StatementReviewChecklist.test.tsx`
Expected: FAIL — `Failed to load url ./StatementReviewChecklist.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/ReviewFindingRow.tsx`:

```tsx
import type { ReactNode } from "react";
import { Box, Checkbox, ListItem, ListItemButton, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { MIN_TAP_SIZE } from "./tapTarget.js";

export interface ReviewFindingRowProps {
  findingKey: string;
  title: string;
  amount: string;
  reviewed: boolean;
  onToggle: (key: string, reviewed: boolean) => void;
  children: ReactNode;
}

const REVIEWED_OPACITY = 0.6;

const rowSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, alignItems: "flex-start", gap: 1.5, px: 1, py: 1.25 };

export const findingDetailsSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 0.75,
  mt: 0.5,
};

export const ReviewFindingRow = ({ findingKey, title, amount, reviewed, onToggle, children }: ReviewFindingRowProps) => {
  const handleClick = () => onToggle(findingKey, !reviewed);

  return (
    <ListItem disablePadding divider sx={{ opacity: reviewed ? REVIEWED_OPACITY : 1 }}>
      <ListItemButton onClick={handleClick} sx={rowSx}>
        <Checkbox
          edge="start"
          checked={reviewed}
          tabIndex={-1}
          disableRipple
          inputProps={{ "aria-label": `revisado: ${title}` }}
          sx={{ p: 0.5 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{title}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{amount}</Typography>
          </Box>
          {children}
        </Box>
      </ListItemButton>
    </ListItem>
  );
};
```

`client/src/components/ReviewTransactionItem.tsx`:

```tsx
import { Box, Chip, Typography } from "@mui/material";
import type { ReviewTransactionFinding } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { REVIEW_CHECK_COLORS, REVIEW_REASON_LABELS, transactionFindingNotes } from "../statementReview.js";
import { ReviewFindingRow, findingDetailsSx } from "./ReviewFindingRow.js";

export interface ReviewTransactionItemProps {
  finding: ReviewTransactionFinding;
  reviewed: boolean;
  historyStatements: number;
  onToggle: (key: string, reviewed: boolean) => void;
}

export const ReviewTransactionItem = ({ finding, reviewed, historyStatements, onToggle }: ReviewTransactionItemProps) => {
  const { transaction, reasons } = finding;
  const showCategory = !reasons.includes("sin-categoria");
  const reasonChips = reasons.map((reason) => (
    <Chip key={reason} size="small" color={REVIEW_CHECK_COLORS[reason]} label={REVIEW_REASON_LABELS[reason]} />
  ));
  const notes = transactionFindingNotes(finding, historyStatements).map((note) => (
    <Typography key={note} variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
      {note}
    </Typography>
  ));

  return (
    <ReviewFindingRow
      findingKey={finding.key}
      title={transaction.merchant}
      amount={formatMoney(transaction.amount, transaction.currency)}
      reviewed={reviewed}
      onToggle={onToggle}
    >
      <Box sx={findingDetailsSx}>
        <Typography variant="caption" color="text.secondary">{transaction.date}</Typography>
        {showCategory && <Chip size="small" variant="outlined" label={transaction.category} />}
        {reasonChips}
      </Box>
      {notes}
    </ReviewFindingRow>
  );
};
```

`client/src/components/ReviewCategoryItem.tsx`:

```tsx
import { Box, Chip, Typography } from "@mui/material";
import type { ReviewCategoryFinding } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { categoryFindingBadge, categoryFindingNote } from "../statementReview.js";
import { ReviewFindingRow, findingDetailsSx } from "./ReviewFindingRow.js";

export interface ReviewCategoryItemProps {
  finding: ReviewCategoryFinding;
  reviewed: boolean;
  historyStatements: number;
  onToggle: (key: string, reviewed: boolean) => void;
}

export const ReviewCategoryItem = ({ finding, reviewed, historyStatements, onToggle }: ReviewCategoryItemProps) => (
  <ReviewFindingRow
    findingKey={finding.key}
    title={finding.category}
    amount={formatMoney(finding.total, "ARS")}
    reviewed={reviewed}
    onToggle={onToggle}
  >
    <Box sx={findingDetailsSx}>
      <Typography variant="caption" color="text.secondary">{categoryFindingNote(finding, historyStatements)}</Typography>
      <Chip size="small" color="warning" label={categoryFindingBadge(finding)} />
    </Box>
  </ReviewFindingRow>
);
```

`client/src/components/StatementReviewChecklist.tsx`:

```tsx
import { useCallback, useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Chip, LinearProgress, List, Typography, type ChipProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import type { StatementReviewDTO } from "@ledgerly/shared";
import {
  REVIEW_CHECK_COLORS,
  historyCaption,
  reviewCheckSummary,
  reviewProgress,
  splitFindings,
  statementCaption,
  type ReviewCheckSummary,
} from "../statementReview.js";
import { useIsMobile } from "../useIsMobile.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { ReconciliationBanner } from "./ReconciliationBanner.js";
import { ReviewCategoryItem } from "./ReviewCategoryItem.js";
import { ReviewTransactionItem } from "./ReviewTransactionItem.js";
import { tapTargetSx } from "./tapTarget.js";

export interface StatementReviewChecklistProps {
  review: StatementReviewDTO;
  onMark: (keys: string[], reviewed: boolean) => void;
}

const headerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  justifyContent: "space-between",
  alignItems: { md: "flex-start" },
  gap: 1.5,
  mb: 1.5,
};

const progressSx: SxProps<Theme> = { width: { xs: "100%", md: 240 }, flexShrink: 0 };

const progressLabelSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  justifyContent: { md: "flex-end" },
  gap: 1,
};

const sectionTitleSx: SxProps<Theme> = { mt: 2, mb: 0.5 };

const actionsSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  justifyContent: "flex-end",
  gap: 1,
  mt: 2,
};

const checkChipProps = ({ check, label, count, skipped }: ReviewCheckSummary): ChipProps => {
  if (skipped) return { variant: "outlined", label: `${label}: sin historial` };
  if (count === 0) return { variant: "outlined", color: "success", icon: <CheckIcon />, label: `${label}: 0` };
  return { color: REVIEW_CHECK_COLORS[check], label: `${label}: ${count}` };
};

export const StatementReviewChecklist = ({ review, onMark }: StatementReviewChecklistProps) => {
  const isMobile = useIsMobile();
  const { statement, findings, reviewedKeys, historyStatements } = review;
  const { transactions, categories } = useMemo(() => splitFindings(findings), [findings]);
  const progress = useMemo(() => reviewProgress(findings, reviewedKeys), [findings, reviewedKeys]);
  const summary = useMemo(() => reviewCheckSummary(review), [review]);
  const reviewedSet = useMemo(() => new Set(reviewedKeys), [reviewedKeys]);
  const toggle = useCallback((key: string, reviewed: boolean) => onMark([key], reviewed), [onMark]);
  const markAll = useCallback(() => onMark(progress.pendingKeys, true), [onMark, progress.pendingKeys]);

  const hasFindings = progress.total > 0;
  const showDone = hasFindings && progress.done;
  const canMarkAll = progress.pending > 0;
  const hasUncategorized = transactions.some((finding) => finding.reasons.includes("sin-categoria"));
  const showActions = hasUncategorized || canMarkAll;
  const percent = hasFindings ? (progress.reviewed / progress.total) * 100 : 100;
  const progressLabel = `${progress.reviewed} de ${progress.total} revisados`;
  const checkChips = summary.map((item) => <Chip key={item.check} size="small" {...checkChipProps(item)} />);
  const transactionItems = transactions.map((finding) => (
    <ReviewTransactionItem
      key={finding.key}
      finding={finding}
      reviewed={reviewedSet.has(finding.key)}
      historyStatements={historyStatements}
      onToggle={toggle}
    />
  ));
  const categoryItems = categories.map((finding) => (
    <ReviewCategoryItem
      key={finding.key}
      finding={finding}
      reviewed={reviewedSet.has(finding.key)}
      historyStatements={historyStatements}
      onToggle={toggle}
    />
  ));

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
      <Card>
        <CardContent sx={compactCardContentSx}>
          <Box sx={headerSx}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{statement.cardLabel}</Typography>
              <Typography variant="caption" color="text.secondary">{statementCaption(statement)}</Typography>
            </Box>
            {hasFindings && (
              <Box sx={progressSx}>
                <Box sx={progressLabelSx}>
                  <Typography variant="body2">{progressLabel}</Typography>
                  {showDone && <Chip size="small" color="success" label="Revisado" />}
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={percent}
                  aria-label="progreso de la revisión"
                  sx={{ mt: 0.5 }}
                />
              </Box>
            )}
          </Box>
          <ReconciliationBanner reconciliation={statement.reconciliation} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {historyCaption(review)}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{checkChips}</Box>
          {!hasFindings && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
              <CheckCircleOutlineIcon color="success" />
              <Typography>No encontramos nada raro en este resumen.</Typography>
            </Box>
          )}
          {transactionItems.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3" sx={sectionTitleSx}>Movimientos</Typography>
              <List disablePadding>{transactionItems}</List>
            </>
          )}
          {categoryItems.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3" sx={sectionTitleSx}>
                Categorías por encima de su promedio
              </Typography>
              <List disablePadding>{categoryItems}</List>
            </>
          )}
          {showActions && (
            <Box sx={actionsSx}>
              {hasUncategorized && (
                <Button component={RouterLink} to="/rules" fullWidth={isMobile} sx={tapTargetSx}>
                  Categorizar en Reglas
                </Button>
              )}
              {canMarkAll && (
                <Button variant="outlined" onClick={markAll} fullWidth={isMobile} sx={tapTargetSx}>
                  Marcar todo como revisado
                </Button>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </MotionBox>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/StatementReviewChecklist.test.tsx`
Expected: PASS. Después `bun run typecheck`: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ReviewFindingRow.tsx client/src/components/ReviewTransactionItem.tsx client/src/components/ReviewCategoryItem.tsx client/src/components/StatementReviewChecklist.tsx client/src/components/StatementReviewChecklist.test.tsx
git commit -m "feat(client): checklist de la revisión del resumen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Selector de tarjeta y sección «Revisión antes de pagar»

**Files:**
- Create: `client/src/components/useStatementReviewPicker.ts`
- Create: `client/src/components/StatementReviewPicker.tsx`
- Modify: `client/src/components/StatementReviewSection.tsx` (reemplaza el stub; `StatementReviewSectionProps` no cambia)
- Test: `client/src/components/StatementReviewSection.test.tsx`

**Interfaces:**
- Consumes: `useStatements`, `useStatementReviews`, `useStatementReview`, `useMarkFindingsReviewed` (`client/src/api/hooks.ts`, base); `reviewOptions`, `reviewProgress`, `selectedReviewId`, `ReviewOption` (Task 3); `StatementReviewChecklist` (Task 4); `MIN_TAP_SIZE`, `useIsMobile`.
- Produces:
  - `interface ReviewPickerOption { id: string; label: string; caption: string; pending: number | null }`
  - `interface StatementReviewPickerState { isLoading: boolean; error: Error | null; options: ReviewPickerOption[]; selectedId: string | null; select: (id: string) => void }`
  - `useStatementReviewPicker(focusStatement: StatementDTO | null): StatementReviewPickerState`
  - `StatementReviewPicker({ options, selectedId, onSelect })`
  - `StatementReviewSection({ focusStatement = null }: StatementReviewSectionProps)`

- [ ] **Step 1: Write the failing test**

`client/src/components/StatementReviewSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewFinding, StatementDTO, StatementReviewDTO, StatementReviewPatch } from "@ledgerly/shared";
import { cssFor } from "../testing/cssFor.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { StatementReviewSection } from "./StatementReviewSection.js";

const statement = (id: string, overrides: Partial<StatementDTO>): StatementDTO => ({
  id,
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 100000, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 3,
  uploadedAt: "2026-09-26T12:00:00.000Z",
  ...overrides,
});

const VISA_OLD = statement("v1", { closingDate: "2026-08-25", dueDate: "2026-09-05" });
const VISA = statement("v2", {});
const ICBC = statement("i1", { issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: "2026-09-20", dueDate: "2026-10-09" });

const uncategorized = (id: string, merchant: string, statementId: string): ReviewFinding => ({
  kind: "transaction",
  key: `tx:${id}`,
  reasons: ["sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
  transaction: {
    id, statementId, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
    descriptionRaw: merchant, merchant, category: "Sin categoría", categorySource: "rule", amount: 2500,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
    installmentTotal: null, comprobante: null,
  },
});

const reviewOf = (target: StatementDTO, findings: ReviewFinding[]): StatementReviewDTO => ({
  statement: target,
  previousStatements: 6,
  historyStatements: 6,
  skippedChecks: [],
  findings,
  reviewedKeys: [],
});

const REVIEWS: Record<string, StatementReviewDTO> = {
  v1: reviewOf(VISA_OLD, [uncategorized("o1", "COMERCIO VIEJO", "v1")]),
  v2: reviewOf(VISA, [
    uncategorized("t1", "COMERCIO UNO", "v2"),
    uncategorized("t2", "COMERCIO DOS", "v2"),
    uncategorized("t3", "COMERCIO TRES", "v2"),
  ]),
  i1: reviewOf(ICBC, []),
};

const REVIEW_URL = /\/statements\/([^/?]+)\/review$/;

interface FetchOptions {
  statements?: StatementDTO[];
  failingReviews?: string[];
  patchFails?: boolean;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch({ statements = [VISA_OLD, VISA, ICBC], failingReviews = [], patchFails = false }: FetchOptions = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const review = REVIEW_URL.exec(url);
    if (review && init?.method === "PATCH") {
      if (patchFails) return json({ error: "Falló el server" }, 500);
      const { keys } = JSON.parse(String(init.body)) as StatementReviewPatch;
      return json({ reviewedKeys: keys });
    }
    if (review) return failingReviews.includes(review[1]) ? json({ error: "Se cayó la base" }, 500) : json(REVIEWS[review[1]]);
    if (url.endsWith("/statements")) return json(statements);
    return json({});
  }));
}

const picker = () => screen.findByRole("group", { name: "resumen a revisar" });

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StatementReviewSection", () => {
  it("ofrece el último resumen de cada tarjeta, con sus pendientes, y abre el primero", async () => {
    renderWithProviders(<StatementReviewSection />);
    const group = await picker();
    const visa = within(group).getByRole("button", { name: /Visa Signature/ });
    expect(visa).toHaveAttribute("aria-pressed", "true");
    expect(within(visa).getByText("vence 2026-10-06")).toBeInTheDocument();
    expect(await within(visa).findByText("3")).toBeInTheDocument();
    const icbc = within(group).getByRole("button", { name: /ICBC/ });
    expect(within(icbc).getByText("vence 2026-10-09")).toBeInTheDocument();
    expect(await within(icbc).findByTitle("revisado")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revisión antes de pagar" })).toBeInTheDocument();
    expect(await screen.findByText("COMERCIO UNO")).toBeInTheDocument();
  });

  it("cambiar de tarjeta muestra la otra revisión", async () => {
    renderWithProviders(<StatementReviewSection />);
    await screen.findByText("COMERCIO UNO");
    await userEvent.click(screen.getByRole("button", { name: /ICBC/ }));
    expect(await screen.findByText("No encontramos nada raro en este resumen.")).toBeInTheDocument();
    expect(screen.queryByText("COMERCIO UNO")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ICBC/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("con un resumen viejo recién subido, lo ofrece primero y lo deja elegido", async () => {
    renderWithProviders(<StatementReviewSection focusStatement={VISA_OLD} />);
    const buttons = within(await picker()).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(within(buttons[0]).getByText("recién importado · cierre 2026-08-25")).toBeInTheDocument();
    expect(await screen.findByText("COMERCIO VIEJO")).toBeInTheDocument();
  });

  it("tildar manda el PATCH, deja el hallazgo tildado y baja los pendientes", async () => {
    renderWithProviders(<StatementReviewSection />);
    await userEvent.click(await screen.findByText("COMERCIO UNO"));
    await waitFor(() => {
      const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(String(patch?.[0])).toBe("/api/statements/v2/review");
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ keys: ["tx:t1"], reviewed: true });
    });
    expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).toBeChecked();
    expect(within(screen.getByRole("button", { name: /Visa Signature/ })).getByText("2")).toBeInTheDocument();
  });

  it("si no se puede guardar, avisa y el tilde vuelve al estado del server", async () => {
    mockFetch({ patchFails: true });
    renderWithProviders(<StatementReviewSection />);
    await userEvent.click(await screen.findByText("COMERCIO UNO"));
    expect(await screen.findByText("No se pudo guardar la revisión: Falló el server")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).not.toBeChecked());
  });

  it("si falla la revisión de una tarjeta, el título y el selector siguen", async () => {
    mockFetch({ failingReviews: ["v2"] });
    renderWithProviders(<StatementReviewSection />);
    expect(await screen.findByText("No se pudo cargar la revisión: Se cayó la base")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revisión antes de pagar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "resumen a revisar" })).toBeInTheDocument();
  });

  it("con una sola tarjeta no muestra el selector", async () => {
    mockFetch({ statements: [VISA] });
    renderWithProviders(<StatementReviewSection />);
    expect(await screen.findByText("COMERCIO UNO")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "resumen a revisar" })).not.toBeInTheDocument();
  });

  it("sin resúmenes importados no muestra nada", async () => {
    mockFetch({ statements: [] });
    renderWithProviders(<StatementReviewSection />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Revisión antes de pagar" })).not.toBeInTheDocument();
  });
});

describe("StatementReviewSection en mobile", () => {
  beforeEach(() => {
    emulateMobile();
  });

  it("apila el selector y cada fila es un objetivo táctil de 44px", async () => {
    renderWithProviders(<StatementReviewSection />);
    const group = await picker();
    expect(group.className).toContain("MuiToggleButtonGroup-vertical");
    expect(cssFor(within(group).getByRole("button", { name: /ICBC/ }))).toContain("min-height:44px");
    const checkbox = await screen.findByRole("checkbox", { name: "revisado: COMERCIO UNO" });
    expect(cssFor(checkbox.closest('[role="button"]') as Element)).toContain("min-height:44px");
    const markAll = screen.getByRole("button", { name: "Marcar todo como revisado" });
    expect(markAll.className).toContain("MuiButton-fullWidth");
    expect(cssFor(markAll)).toContain("min-height:44px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/StatementReviewSection.test.tsx`
Expected: FAIL — el stub devuelve `null`: no aparece el grupo `resumen a revisar` ni el título.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/useStatementReviewPicker.ts`:

```ts
import { useState } from "react";
import type { StatementDTO } from "@ledgerly/shared";
import { useStatementReviews, useStatements } from "../api/hooks.js";
import { reviewOptions, reviewProgress, selectedReviewId, type ReviewOption } from "../statementReview.js";

export interface ReviewPickerOption {
  id: string;
  label: string;
  caption: string;
  pending: number | null;
}

export interface StatementReviewPickerState {
  isLoading: boolean;
  error: Error | null;
  options: ReviewPickerOption[];
  selectedId: string | null;
  select: (id: string) => void;
}

const optionCaption = ({ statement, isLatest }: ReviewOption): string =>
  isLatest ? `vence ${statement.dueDate ?? "—"}` : `recién importado · cierre ${statement.closingDate ?? "—"}`;

export function useStatementReviewPicker(focusStatement: StatementDTO | null): StatementReviewPickerState {
  const statements = useStatements();
  const [selected, setSelected] = useState<string | null>(focusStatement?.id ?? null);
  const choices = reviewOptions(statements.data, focusStatement);
  const reviews = useStatementReviews(choices.map(({ statement }) => statement.id));
  const options = choices.map((choice, position): ReviewPickerOption => {
    const review = reviews[position]?.data;
    return {
      id: choice.statement.id,
      label: choice.statement.cardLabel,
      caption: optionCaption(choice),
      pending: review ? reviewProgress(review.findings, review.reviewedKeys).pending : null,
    };
  });

  return {
    isLoading: statements.isLoading,
    error: statements.error,
    options,
    selectedId: selectedReviewId(options, selected),
    select: setSelected,
  };
}
```

`client/src/components/StatementReviewPicker.tsx`:

```tsx
import type { MouseEvent } from "react";
import { Box, Chip, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useIsMobile } from "../useIsMobile.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";
import type { ReviewPickerOption } from "./useStatementReviewPicker.js";

export interface StatementReviewPickerProps {
  options: ReviewPickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface PendingBadgeProps {
  pending: number | null;
}

const optionSx: SxProps<Theme> = {
  minHeight: MIN_TAP_SIZE,
  gap: 1.5,
  justifyContent: "space-between",
  textAlign: "left",
  textTransform: "none",
  px: 2,
};

const PendingBadge = ({ pending }: PendingBadgeProps) => {
  if (pending === null) return null;
  if (pending === 0) return <CheckCircleOutlineIcon color="success" fontSize="small" titleAccess="revisado" />;
  return <Chip size="small" color="warning" label={pending} />;
};

export const StatementReviewPicker = ({ options, selectedId, onSelect }: StatementReviewPickerProps) => {
  const isMobile = useIsMobile();
  if (options.length < 2) return null;

  const orientation = isMobile ? "vertical" : "horizontal";
  const handleChange = (_event: MouseEvent<HTMLElement>, value: string | null) => {
    if (value !== null) onSelect(value);
  };
  const buttons = options.map((option) => (
    <ToggleButton key={option.id} value={option.id} sx={optionSx}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{option.label}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {option.caption}
        </Typography>
      </Box>
      <PendingBadge pending={option.pending} />
    </ToggleButton>
  ));

  return (
    <ToggleButtonGroup
      exclusive
      value={selectedId}
      onChange={handleChange}
      orientation={orientation}
      fullWidth={isMobile}
      aria-label="resumen a revisar"
      sx={{ mb: 2 }}
    >
      {buttons}
    </ToggleButtonGroup>
  );
};
```

`client/src/components/StatementReviewSection.tsx`:

```tsx
import { useCallback } from "react";
import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import type { StatementDTO } from "@ledgerly/shared";
import { useMarkFindingsReviewed, useStatementReview } from "../api/hooks.js";
import { StatementReviewChecklist } from "./StatementReviewChecklist.js";
import { StatementReviewPicker } from "./StatementReviewPicker.js";
import { useStatementReviewPicker } from "./useStatementReviewPicker.js";

export interface StatementReviewSectionProps {
  focusStatement?: StatementDTO | null;
}

interface SelectedReviewProps {
  statementId: string | null;
  onMark: (keys: string[], reviewed: boolean) => void;
}

const Spinner = () => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
    <CircularProgress size={24} />
  </Box>
);

const SelectedReview = ({ statementId, onMark }: SelectedReviewProps) => {
  const { data, isLoading, error } = useStatementReview(statementId);
  if (isLoading) return <Spinner />;
  if (error) return <Alert severity="error">{`No se pudo cargar la revisión: ${error.message}`}</Alert>;
  if (!data) return null;
  return <StatementReviewChecklist review={data} onMark={onMark} />;
};

export const StatementReviewSection = ({ focusStatement = null }: StatementReviewSectionProps) => {
  const { isLoading, error, options, selectedId, select } = useStatementReviewPicker(focusStatement);
  const { mutate, error: markError } = useMarkFindingsReviewed();
  const handleMark = useCallback((keys: string[], reviewed: boolean) => {
    if (selectedId) mutate({ statementId: selectedId, keys, reviewed });
  }, [mutate, selectedId]);

  if (isLoading) return <Spinner />;
  if (error) return <Alert severity="error" sx={{ mt: 4 }}>{`No se pudieron cargar los resúmenes: ${error.message}`}</Alert>;
  if (options.length === 0) return null;

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Revisión antes de pagar</Typography>
      <StatementReviewPicker options={options} selectedId={selectedId} onSelect={select} />
      {markError && (
        <Alert severity="error" sx={{ mb: 2 }}>{`No se pudo guardar la revisión: ${markError.message}`}</Alert>
      )}
      <SelectedReview statementId={selectedId} onMark={handleMark} />
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/StatementReviewSection.test.tsx client/src/pages/ImportPage.test.tsx`
Expected: PASS (los tests existentes de `ImportPage` siguen en verde: con `/statements` en `[]` la sección no muestra nada).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/useStatementReviewPicker.ts client/src/components/StatementReviewPicker.tsx client/src/components/StatementReviewSection.tsx client/src/components/StatementReviewSection.test.tsx
git commit -m "feat(client): sección «Revisión antes de pagar» con selector de tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Integración en Importar y verificación final

**Files:**
- Modify: `client/src/pages/ImportPage.test.tsx` (se agrega un test al `describe("ImportPage")`; los mocks compartidos no cambian)

**Interfaces:**
- Consumes: `statementResult`, `reviewOf`, `mockFetch` ya definidos en el archivo por la base; `StatementReviewSection` (Task 5), ya renderizada por `ImportPage.tsx`.
- Produces: nada nuevo.

- [ ] **Step 1: Write the test**

En `client/src/pages/ImportPage.test.tsx`, dentro de `describe("ImportPage", ...)`, después de `"sube un archivo y muestra el resultado"`:

```tsx
  it("después de importar un resumen se ve «Revisión antes de pagar» con sus hallazgos", async () => {
    mockFetch((url, init) => (url.includes("/import") && init?.method === "POST" ? statementResult("imported", 3) : []));
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "r.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("heading", { name: "Revisión antes de pagar" })).toBeInTheDocument();
    expect(await screen.findByText("COMERCIO UNO")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).not.toBeChecked();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings.indexOf("Revisión antes de pagar")).toBeGreaterThan(headings.indexOf("Gmail"));
    expect(headings.indexOf("Revisión antes de pagar")).toBeLessThan(headings.indexOf("Archivos importados"));
  });
```

- [ ] **Step 2: Run test**

Run: `bun run test client/src/pages/ImportPage.test.tsx`
Expected: PASS (la integración ya está en `ImportPage.tsx` desde la base; si fallara, el problema está en Task 5).

- [ ] **Step 3: Verificación final**

Run: `bun run test` → todos verdes (los mismos skipped que en la base).
Run: `bun run typecheck` → sin errores.
Run: `bun run build` → build de Vite sin errores.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ImportPage.test.tsx
git commit -m "test(client): la revisión del resumen aparece después de importarlo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
