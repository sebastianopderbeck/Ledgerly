# Filtro por categoría (multi-select) en Movimientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select category filter to the Movimientos section that narrows the transactions list to the chosen categories (none chosen = all).

**Architecture:** The `category` URL param already flows page → hook → server. This adds (1) a distinct-categories endpoint and multi-value `$in` filtering on the server, (2) array support in the client query-string builder plus a `useCategories` hook, and (3) a multi-select control in `FiltersBar`. Multiple categories travel as repeated query params (`?category=A&category=B`).

**Tech Stack:** TypeScript, Express + Mongoose (server), React + MUI + TanStack Query (client), Vitest + Supertest + Testing Library (tests).

## Global Constraints

- TypeScript everywhere; `any` is forbidden (narrowing casts like `as unknown as string[]` are acceptable).
- No code comments (no `//`, block, or JSDoc) — self-explanatory names only.
- React components: functional, props destructured in the signature, `<>` fragments over wrapper divs.
- Reuse existing shared types; do not redefine.
- Multiple categories are encoded as repeated query params: `?category=A&category=B`.
- A single `?category=X` must keep working (existing server test depends on it).
- Category option list ignores currency/card filters (complete, stable list).
- Run a single test file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Commit per task using the exact `git add` paths listed (do not sweep unrelated working-tree changes); do not push.

---

## File Structure

- Modify `server/src/http/routes/transactions.ts` — `$in` filter + `GET /categories`.
- Modify `server/src/http/routes/transactions.test.ts` — endpoint + multi-value tests.
- Modify `client/src/api/hooks.ts` — `qs()` array support, `TxFilters.category: string[]`, `useCategories`.
- Modify `client/src/pages/TransactionsPage.tsx` — read `params.getAll("category")`.
- Modify `client/src/pages/TransactionsPage.test.tsx` — assert selected categories reach the API.
- Modify `client/src/components/FiltersBar.tsx` — multi-select "Categorías" + `setMulti`.
- Modify `client/src/components/FiltersBar.test.tsx` — lists options, multi-select works.

---

## Task 1: Server — distinct categories endpoint + multi-value `$in` filter

**Files:**
- Modify: `server/src/http/routes/transactions.ts`
- Test: `server/src/http/routes/transactions.test.ts`

**Interfaces:**
- Consumes: `TransactionModel` (existing).
- Produces: `GET /api/transactions/categories` → `string[]` (distinct categories, `localeCompare`-sorted). `GET /api/transactions?category=A&category=B` filters with `category: { $in: [...] }`; a single `?category=A` still filters to `A`.

- [ ] **Step 1: Write the failing tests**

In `server/src/http/routes/transactions.test.ts`, add two tests inside `describe("GET /api/transactions", ...)` (after the `filtra por category` test):

```ts
  it("filtra por varias categorías (repetido)", async () => {
    const base = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: base!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-05"),
      descriptionRaw: "UBER", merchant: "UBER", category: "Transporte", categorySource: "rule", amount: 200, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "3", fingerprint: "f3",
    });
    const res = await request(app).get("/api/transactions?category=Compras&category=Sin categoría");
    expect(res.body.total).toBe(2);
    const categories = res.body.items.map((t: { category: string }) => t.category).sort();
    expect(categories).toEqual(["Compras", "Sin categoría"]);
  });

  it("categories devuelve las categorías distintas ordenadas", async () => {
    const res = await request(app).get("/api/transactions/categories");
    expect(res.body).toEqual(["Compras", "Sin categoría"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/http/routes/transactions.test.ts`
Expected: FAIL — the multi-value test returns only the `Compras` row (total 1), and `/categories` returns `{}` / not-an-array.

- [ ] **Step 3: Update `buildFilter` for `$in`**

In `server/src/http/routes/transactions.ts`, replace this line in `buildFilter`:

```ts
  if (typeof q.category === "string") filter.category = q.category;
```

with:

```ts
  const categories = Array.isArray(q.category)
    ? q.category.filter((c): c is string => typeof c === "string")
    : typeof q.category === "string" ? [q.category] : [];
  if (categories.length) filter.category = { $in: categories };
```

- [ ] **Step 4: Add the `/categories` route**

In `server/src/http/routes/transactions.ts`, add this route between the `GET "/"` handler and the `PATCH "/:id"` handler:

```ts
transactionsRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = (await TransactionModel.distinct("category")) as string[];
    res.json([...categories].sort((a, b) => a.localeCompare(b)));
  }),
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/src/http/routes/transactions.test.ts`
Expected: PASS (all tests, including the existing single-value `filtra por category`).

- [ ] **Step 6: Commit**

```bash
git add server/src/http/routes/transactions.ts server/src/http/routes/transactions.test.ts
git commit -m "feat(server): distinct categories endpoint and multi-category filter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Client plumbing — `qs()` arrays, `useCategories`, page reads all categories

**Files:**
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/transactions/categories` (Task 1); `apiFetch`, `useQuery` (existing).
- Produces: `useCategories()` → `UseQueryResult<string[]>` (queryKey `["categories"]`). `TxFilters.category` is now `string[]`. `qs()` expands array values into repeated params.

- [ ] **Step 1: Write the failing test**

In `client/src/pages/TransactionsPage.test.tsx`, replace the whole `beforeEach` block with a mock that branches the categories endpoint:

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Salud"]
      : url.includes("/transactions") ? { items: [tx], total: 1, page: 1, pageSize: 50 }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
```

Then add this test inside `describe("TransactionsPage", ...)`:

```ts
  it("envía las categorías seleccionadas al API", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions?category=Compras&category=Salud" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    const listUrl = vi.mocked(fetch).mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/transactions") && !u.includes("/categories"));
    expect(listUrl).toContain("category=Compras");
    expect(listUrl).toContain("category=Salud");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/pages/TransactionsPage.test.tsx`
Expected: FAIL — with the current single-value `params.get("category")`, the list URL contains only `category=Compras`, so `toContain("category=Salud")` fails.

- [ ] **Step 3: Teach `qs()` to expand arrays**

In `client/src/api/hooks.ts`, replace the `qs` function body loop. Change:

```ts
function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
```

to:

```ts
function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") sp.append(k, String(item));
      }
    } else if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 4: Change `TxFilters.category` to `string[]` and add `useCategories`**

In `client/src/api/hooks.ts`, change the `TxFilters` interface:

```ts
export interface TxFilters extends Partial<StatFilters> {
  category?: string; issuer?: string; search?: string; page?: number; pageSize?: number;
}
```

to:

```ts
export interface TxFilters extends Partial<StatFilters> {
  category?: string[]; issuer?: string; search?: string; page?: number; pageSize?: number;
}
```

Then add the hook immediately after the `useTransactions` function:

```ts
export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => apiFetch<string[]>("/transactions/categories") });
}
```

- [ ] **Step 5: Read all category params in the page**

In `client/src/pages/TransactionsPage.tsx`, change:

```ts
    category: params.get("category") ?? undefined,
```

to:

```ts
    category: params.getAll("category"),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run client/src/pages/TransactionsPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/hooks.ts client/src/pages/TransactionsPage.tsx client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): categories hook and multi-value category query plumbing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: FiltersBar — multi-select "Categorías" control

**Files:**
- Modify: `client/src/components/FiltersBar.tsx`
- Test: `client/src/components/FiltersBar.test.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 2); `useSearchParams` (existing).
- Produces: a multi-select "Categorías" rendered when `showCategory` is true, bound to the repeated `category` URL params.

- [ ] **Step 1: Write the failing test**

In `client/src/components/FiltersBar.test.tsx`, replace the whole `beforeEach` block with:

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte", "Sin categoría"]
      : url.includes("/statements") ? statements
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
```

Then add this test inside `describe("FiltersBar", ...)`:

```ts
  it("permite filtrar por varias categorías", async () => {
    renderWithProviders(<FiltersBar showCategory />, { route: "/transactions" });
    const select = await screen.findByRole("combobox", { name: /categorías/i });
    await userEvent.click(select);
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(within(listbox).getByRole("option", { name: "Compras" }));
    await userEvent.click(within(listbox).getByRole("option", { name: "Transporte" }));
    expect(within(listbox).getByRole("option", { name: "Compras" })).toHaveAttribute("aria-selected", "true");
    expect(within(listbox).getByRole("option", { name: "Transporte" })).toHaveAttribute("aria-selected", "true");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/FiltersBar.test.tsx`
Expected: FAIL — no combobox named "Categorías" exists yet.

- [ ] **Step 3: Add `useCategories`, `setMulti`, and the multi-select**

In `client/src/components/FiltersBar.tsx`:

Change the import line:

```ts
import { useMonthly, useStatements } from "../api/hooks.js";
```

to:

```ts
import { useCategories, useMonthly, useStatements } from "../api/hooks.js";
```

Add the categories query near the other queries (after the `useStatements()` line):

```ts
  const { data: categoryData } = useCategories();
  const categories = Array.isArray(categoryData) ? categoryData : [];
```

Add the `setMulti` helper right after the existing `set` helper:

```ts
  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    setParams(next, { replace: true });
  };
```

Replace the `showCategory` block:

```tsx
      {showCategory && (
        <TextField
          label="Buscar comercio" size="small"
          value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
        />
      )}
```

with:

```tsx
      {showCategory && (
        <>
          <TextField
            select label="Categorías" size="small" sx={{ minWidth: 220 }}
            value={params.getAll("category")}
            onChange={(e) => setMulti("category", e.target.value as unknown as string[])}
            SelectProps={{ multiple: true, renderValue: (selected) => (selected as string[]).join(", ") }}
          >
            {categories.map((category) => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Buscar comercio" size="small"
            value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
          />
        </>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/FiltersBar.test.tsx`
Expected: PASS (both the existing tarjeta test and the new categorías test).

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; entire suite green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FiltersBar.tsx client/src/components/FiltersBar.test.tsx
git commit -m "feat(client): multi-select category filter in Movimientos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Multi-select, 0 = todas → `FiltersBar` multiple select bound to repeated params (Task 3); empty `getAll` ⇒ no `$in` (Tasks 1–2). ✓
- Fuente = distintas de TODOS los movimientos → `/categories` uses `distinct` with no filter (Task 1). ✓
- Filtrado `IN` → `$in` in `buildFilter` (Task 1). ✓
- URL repeated params → `qs()` `append` + `getAll` (Task 2). ✓
- Backend endpoint + `$in` + single-value still works → Task 1 (tests cover single + multi + endpoint). ✓
- `qs` arrays, `TxFilters.category: string[]`, `useCategories`, page `getAll` → Task 2. ✓
- FiltersBar multi-select + `setMulti`, search box kept → Task 3. ✓
- Tests (server distinct + $in; client lists + multi-select) → Tasks 1 and 3; plumbing → Task 2. ✓
- Out of scope (options by currency/card, prop rename, table/KPI) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete.

**Type consistency:** `TxFilters.category: string[]` (Task 2) matches `params.getAll("category")` in the page (Task 2) and `params.getAll("category")` bound to the select value (Task 3). `useCategories()` returns `string[]`, consumed with an `Array.isArray` guard in `FiltersBar` (Task 3). Endpoint path `/transactions/categories` identical across server route (Task 1), hook (Task 2), and both test mocks (Tasks 2–3). `setMulti(key, values: string[])` matches the `as unknown as string[]` onChange value.
