# KPI "Deuda en cuotas" = lo que resta pagar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Deuda en cuotas" KPI show the remaining amount to pay, computed from each card's latest statement instead of double-counting across all statements.

**Architecture:** Add a pure `remainingInstallmentDebt` helper that sums `(installmentTotal − installmentCurrent) × amount`. Change `GET /stats/summary` to feed it only the installment transactions of the latest statement per issuer (via the existing `latestStatementIdsPerIssuer`). No client change — the KPI already reads `futureInstallmentTotal`.

**Tech Stack:** TypeScript, Express + Mongoose (server), Vitest + Supertest (tests).

## Global Constraints

- TypeScript everywhere; `any` is forbidden (narrowing casts like `as unknown as { uploadedAt: Date }` are acceptable, matching `mappers.ts`).
- No code comments (no `//`, block, or JSDoc) — self-explanatory names only.
- "Resta pagar" = `installmentTotal − installmentCurrent` (the current statement's cuota is NOT counted).
- Computed over the latest statement per issuer; respects `currency` and `cardLabel`; independent of `from`/`to`.
- Run a single test file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Commit per task using the exact `git add` paths listed; do not push.

---

## File Structure

- Modify `server/src/stats/futureInstallments.ts` — add `remainingInstallmentDebt`.
- Modify `server/src/stats/futureInstallments.test.ts` — unit tests for the helper.
- Modify `server/src/http/routes/stats.ts` — `/summary` uses latest-statement snapshot.
- Modify `server/src/http/routes/stats.test.ts` — integration test (latest-only, no double count).

---

## Task 1: Pure helper `remainingInstallmentDebt`

**Files:**
- Modify: `server/src/stats/futureInstallments.ts`
- Test: `server/src/stats/futureInstallments.test.ts`

**Interfaces:**
- Consumes: existing `InstallmentTx` interface and `Currency`.
- Produces: `remainingInstallmentDebt(txns: Pick<InstallmentTx, "amount" | "currency" | "isInstallment" | "installmentCurrent" | "installmentTotal">[], currency: Currency): number`. Sums `(installmentTotal − installmentCurrent) × amount` for installment txns matching `currency`; skips non-installments, other currency, and null cuota data.

- [ ] **Step 1: Write the failing tests**

In `server/src/stats/futureInstallments.test.ts`, update the import line:

```ts
import { computeFutureInstallments, computeFutureInstallmentsDetail } from "./futureInstallments.js";
```

to:

```ts
import { computeFutureInstallments, computeFutureInstallmentsDetail, remainingInstallmentDebt } from "./futureInstallments.js";
```

Then add this describe block at the end of the file:

```ts
describe("remainingInstallmentDebt", () => {
  it("suma (total - actual) * monto de cada cuota", () => {
    const total = remainingInstallmentDebt(
      [{ amount: 1500, currency: "ARS", isInstallment: true, installmentCurrent: 2, installmentTotal: 4 }],
      "ARS",
    );
    expect(total).toBe(3000);
  });

  it("ignora no-cuotas, cuotas terminadas y otra moneda", () => {
    const total = remainingInstallmentDebt(
      [
        { amount: 500, currency: "ARS", isInstallment: false, installmentCurrent: null, installmentTotal: null },
        { amount: 500, currency: "ARS", isInstallment: true, installmentCurrent: 6, installmentTotal: 6 },
        { amount: 9, currency: "USD", isInstallment: true, installmentCurrent: 1, installmentTotal: 3 },
      ],
      "ARS",
    );
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/stats/futureInstallments.test.ts`
Expected: FAIL — `remainingInstallmentDebt` is not exported.

- [ ] **Step 3: Add the helper**

In `server/src/stats/futureInstallments.ts`, add at the end of the file:

```ts
type InstallmentDebtTx = Pick<InstallmentTx, "amount" | "currency" | "isInstallment" | "installmentCurrent" | "installmentTotal">;

export function remainingInstallmentDebt(txns: InstallmentDebtTx[], currency: Currency): number {
  let total = 0;
  for (const tx of txns) {
    if (tx.currency !== currency) continue;
    if (!tx.isInstallment || tx.installmentCurrent === null || tx.installmentTotal === null) continue;
    total += (tx.installmentTotal - tx.installmentCurrent) * tx.amount;
  }
  return total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/stats/futureInstallments.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/futureInstallments.ts server/src/stats/futureInstallments.test.ts
git commit -m "feat(server): add remainingInstallmentDebt helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `/stats/summary` computes debt from the latest statement per issuer

**Files:**
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `remainingInstallmentDebt` (Task 1); `latestStatementIdsPerIssuer` (already imported in `stats.ts`); `StatementModel`, `TransactionModel`.
- Produces: `GET /stats/summary` whose `futureInstallmentTotal` = remaining installment debt from the latest statement per issuer (filtered by `cardLabel`), summed by `remainingInstallmentDebt`.

- [ ] **Step 1: Write the failing test**

In `server/src/http/routes/stats.test.ts`, add this test inside `describe("stats", ...)` (right after the existing `it("summary", ...)` test):

```ts
  it("summary: futureInstallmentTotal usa solo el último resumen (no duplica cuotas)", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hold", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1b", fingerprint: "f1b",
    });
    const res = await request(app).get("/api/stats/summary?currency=ARS");
    expect(res.body.futureInstallmentTotal).toBe(3000);
  });
```

Context: the `beforeEach` seed's latest ICBC statement (closing `2026-07-02`) has the MERCADOLIBRE purchase at cuota 2/4 (`remaining 2 × 1500 = 3000`). The older statement above holds the same purchase at cuota 1/4 (`remaining 3 × 1500 = 4500`). The old projection sums both (7500); the fix must return only the latest snapshot (3000).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: FAIL — the current summary returns `7500` (it projects both statements' cuota rows), not `3000`.

- [ ] **Step 3: Add the helper import**

In `server/src/http/routes/stats.ts`, change:

```ts
import { computeFutureInstallments, computeFutureInstallmentsDetail } from "../../stats/futureInstallments.js";
```

to:

```ts
import { computeFutureInstallments, computeFutureInstallmentsDetail, remainingInstallmentDebt } from "../../stats/futureInstallments.js";
```

- [ ] **Step 4: Rewrite the `/summary` handler**

In `server/src/http/routes/stats.ts`, replace the entire `statsRouter.get("/summary", ...)` handler with:

```ts
statsRouter.get("/summary", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const currency: Currency = q.currency === "USD" ? "USD" : "ARS";
  const [agg] = await TransactionModel.aggregate([
    { $match: baseMatch(q) },
    { $group: { _id: null, totalPurchases: { $sum: "$amount" }, transactionCount: { $sum: 1 } } },
  ]);
  const statementFilter = typeof q.cardLabel === "string" ? { cardLabel: q.cardLabel } : {};
  const statements = await StatementModel.find(statementFilter).lean();
  const lastStatementIds = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  const installmentTxs = await TransactionModel.find({
    type: "purchase", isInstallment: true, statementId: { $in: lastStatementIds },
  }).lean();
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: statements.length,
    futureInstallmentTotal: remainingInstallmentDebt(
      installmentTxs.map((t) => ({
        amount: t.amount, currency: t.currency as Currency,
        isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
      })),
      currency,
    ),
  });
}));
```

Note: `statementCount` now uses `statements.length` (already fetched with the same `cardLabel` filter) instead of a separate `countDocuments`. `computeFutureInstallments` and `installmentMatch` remain used by the `/future-installments*` handlers.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS — including the existing `summary` (3000) and `future-installments y summary respetan cardLabel` (3000) tests.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; entire suite green.

- [ ] **Step 7: Commit**

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "fix(server): installment-debt KPI counts only the latest statement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Helper `remainingInstallmentDebt` (sum `(total − actual) × amount`, guards) → Task 1. ✓
- `/summary` uses latest statement per issuer, respects `cardLabel`, `$in` ids → Task 2. ✓
- Remaining = `total − actual` (current cuota excluded) → helper formula (Task 1). ✓
- No client change → not touched. ✓
- Tests: helper unit + integration latest-only + existing summary stays green → Tasks 1–2. ✓
- Out of scope (`/future-installments*` inflation, field/label rename) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete.

**Type consistency:** `remainingInstallmentDebt` signature (Task 1) matches the call in `/summary` (Task 2), which maps Mongo docs to `{ amount, currency, isInstallment, installmentCurrent, installmentTotal }` — exactly the `Pick<InstallmentTx, …>` fields. `latestStatementIdsPerIssuer` receives `{ id, issuer, closingDate, uploadedAt }` (same shape as the `/last-statement/by-category` route). `Currency` is already imported in both files.
