# "Cuotas a vencer" desde el último resumen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Cuotas a vencer" month projections so they count each active installment once (from the latest statement per card) instead of inflating across every statement.

**Architecture:** Extract a shared `latestStatementInstallmentTxs(query)` helper (statements filtered by `cardLabel` → latest per issuer → their installment txs) and feed it to `/stats/future-installments`, `/stats/future-installments/detail`, and `/stats/summary`. The `computeFutureInstallments*` projection functions are unchanged.

**Tech Stack:** TypeScript, Express + Mongoose (server), Vitest + Supertest (tests).

## Global Constraints

- TypeScript everywhere; `any` is forbidden (narrowing casts like `as unknown as { uploadedAt: Date }` are acceptable, matching `mappers.ts`).
- No code comments (no `//`, block, or JSDoc) — self-explanatory names only.
- Projection basis = latest statement per issuer (via `latestStatementIdsPerIssuer`); respects `currency` and `cardLabel`.
- Only deduplication is fixed; `computeFutureInstallments`/`computeFutureInstallmentsDetail` and the month-placement semantics stay as-is.
- Run a single test file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Commit per task using the exact `git add` paths listed; do not push.

---

## File Structure

- Modify `server/src/http/routes/stats.ts` — add helper; point the three handlers at it; remove `installmentMatch`.
- Modify `server/src/http/routes/stats.test.ts` — dedup tests for both future endpoints.

---

## Task 1: Extract `latestStatementInstallmentTxs`; refactor `summary`

**Files:**
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts` (verification only; no new test)

**Interfaces:**
- Consumes: `StatementModel`, `TransactionModel`, `latestStatementIdsPerIssuer` (all imported).
- Produces: `latestStatementInstallmentTxs(q: Record<string, unknown>)` → `Promise<lean transaction docs>` — the installment purchases (`type: "purchase"`, `isInstallment: true`) of the latest statement per issuer, filtered by `cardLabel`.

- [ ] **Step 1: Add the helper**

In `server/src/http/routes/stats.ts`, add this function immediately before `export const statsRouter = Router();`:

```ts
async function latestStatementInstallmentTxs(q: Record<string, unknown>) {
  const statementFilter = typeof q.cardLabel === "string" ? { cardLabel: q.cardLabel } : {};
  const statements = await StatementModel.find(statementFilter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  return TransactionModel.find({ type: "purchase", isInstallment: true, statementId: { $in: ids } }).lean();
}
```

- [ ] **Step 2: Refactor `/summary` to use the helper**

In `server/src/http/routes/stats.ts`, replace this block inside the `/summary` handler:

```ts
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
```

with:

```ts
  const cardLabel = q.cardLabel;
  const installmentTxs = await latestStatementInstallmentTxs(q);
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: await StatementModel.countDocuments(typeof cardLabel === "string" ? { cardLabel } : {}),
    futureInstallmentTotal: remainingInstallmentDebt(
```

- [ ] **Step 3: Run tests to verify the refactor is behavior-preserving**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS (all existing tests, including `summary`, `summary: … no duplica cuotas`, and `future-installments y summary respetan cardLabel`).

- [ ] **Step 4: Commit**

```bash
git add server/src/http/routes/stats.ts
git commit -m "refactor(server): extract latestStatementInstallmentTxs helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `/future-installments` projects from the latest statement

**Files:**
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `latestStatementInstallmentTxs` (Task 1); `computeFutureInstallments` (existing).
- Produces: `GET /stats/future-installments` projecting only the latest statement per issuer.

- [ ] **Step 1: Write the failing test**

In `server/src/http/routes/stats.test.ts`, add this test inside `describe("stats", ...)` (right after the existing `it("future-installments proyecta cuotas", ...)` test):

```ts
  it("future-installments no duplica cuotas con varios resúmenes", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hf1", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1b", fingerprint: "f1b",
    });
    const res = await request(app).get("/api/stats/future-installments?currency=ARS");
    const total = res.body.reduce((acc: number, m: { total: number }) => acc + m.total, 0);
    expect(total).toBe(3000);
  });
```

Context: the seed's latest ICBC statement (closing `2026-07-02`) holds the purchase at cuota 2/4 (`remaining 2 × 1500 = 3000`). The older statement holds it at cuota 1/4. The current endpoint projects both rows (7500); the fix must project only the latest snapshot (3000).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: FAIL — the endpoint returns a total of `7500` (both statements' cuota rows projected).

- [ ] **Step 3: Point the handler at the helper**

In `server/src/http/routes/stats.ts`, inside the `/future-installments` handler, replace:

```ts
  const txs = await TransactionModel.find(installmentMatch(req.query as Record<string, unknown>)).lean();
```

with:

```ts
  const txs = await latestStatementInstallmentTxs(req.query as Record<string, unknown>);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS (including the existing `future-installments proyecta cuotas` test — single seed statement ⇒ same `[{2026-06:1500},{2026-07:1500}]`).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "fix(server): future-installments projects only the latest statement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `/future-installments/detail` projects from the latest statement; drop `installmentMatch`

**Files:**
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `latestStatementInstallmentTxs` (Task 1); `computeFutureInstallmentsDetail` (existing).
- Produces: `GET /stats/future-installments/detail` projecting only the latest statement per issuer. `installmentMatch` no longer exists.

- [ ] **Step 1: Write the failing test**

In `server/src/http/routes/stats.test.ts`, add this test inside `describe("stats", ...)` (right after the test added in Task 2):

```ts
  it("future-installments/detail no duplica cuotas con varios resúmenes", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hf2", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1c", fingerprint: "f1c",
    });
    const res = await request(app).get("/api/stats/future-installments/detail?currency=ARS");
    const count = res.body.reduce((acc: number, m: { count: number }) => acc + m.count, 0);
    expect(count).toBe(2);
  });
```

Context: the latest snapshot yields 2 future cuotas (3/4 and 4/4). The current endpoint also projects the older cuota 1/4 row (3 more) for 5 total; the fix must yield 2.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: FAIL — total item count is `5`, not `2`.

- [ ] **Step 3: Point the handler at the helper**

In `server/src/http/routes/stats.ts`, inside the `/future-installments/detail` handler, replace:

```ts
  const txs = await TransactionModel.find(installmentMatch(req.query as Record<string, unknown>)).lean();
```

with:

```ts
  const txs = await latestStatementInstallmentTxs(req.query as Record<string, unknown>);
```

- [ ] **Step 4: Remove the now-unused `installmentMatch`**

In `server/src/http/routes/stats.ts`, delete this function definition:

```ts
function installmentMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const match: FilterQuery<TransactionDoc> = { type: "purchase", isInstallment: true };
  if (typeof q.cardLabel === "string") match.cardLabel = q.cardLabel;
  return match;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean (no unused `installmentMatch`); entire suite green.

- [ ] **Step 7: Commit**

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "fix(server): future-installments detail uses latest statement; drop installmentMatch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Shared helper `latestStatementInstallmentTxs` → Task 1. ✓
- `/future-installments` uses it → Task 2. ✓
- `/future-installments/detail` uses it → Task 3. ✓
- `summary` refactored to reuse it → Task 1. ✓
- `installmentMatch` removed → Task 3. ✓
- Dedup tests on total/count (semantics-agnostic) → Tasks 2–3; existing tests stay green → verified each task. ✓
- Out of scope (projection month placement, `computeFutureInstallments*`) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete.

**Type consistency:** `latestStatementInstallmentTxs(q: Record<string, unknown>)` is called with `q` in `/summary` (Task 1) and `req.query as Record<string, unknown>` in both future handlers (Tasks 2–3). Its returned lean docs are mapped with `t.amount`/`t.currency`/`t.isInstallment`/`t.installmentCurrent`/`t.installmentTotal` (+ `t.merchant`/`t.category` in detail), all present on `TransactionDoc`. `latestStatementIdsPerIssuer` receives `{ id, issuer, closingDate, uploadedAt }`, matching its use elsewhere in the file. Removing `installmentMatch` leaves `FilterQuery`/`TransactionDoc` still used by `baseMatch`.
