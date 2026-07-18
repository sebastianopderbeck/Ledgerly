# Créditos — Valor de la cuota en USD (dólar oficial, híbrido API + override) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Agregar a la comparativa de cuotas del crédito el valor en USD de cada cuota al tipo de cambio (dólar **oficial**) de la fecha de pago, con la cotización traída de una API pública y editable manualmente por cuota.

**Architecture:** Extiende la feature Créditos existente (rama `feat/credits-uva-mortgage`). Al importar un cupón se consulta el dólar oficial (`venta`) de su `fechaDebito` en ArgentinaDatos y se guarda en el cupón; el import es resiliente a fallos de red (queda `null`). Un `PATCH` permite override manual. El valor `totalUsd` se deriva al mapear (`totalDebitado / tipoCambioUsd`). La UI agrega columnas (TC editable + USD) a la tabla y un gráfico de la cuota en USD por mes.

**Tech Stack:** igual que la feature: TS/ESM, Express+Mongoose+unpdf (server), React 18+MUI v6+TanStack Query+Nivo (client), Zod (shared), Vitest+supertest+mongodb-memory-server+RTL. Runtime bun. **Nuevo:** `globalThis.fetch` (Node 20+) para la API de dólar.

## Global Constraints

- **Rama:** trabajar SOLO en `feat/credits-uva-mortgage`. Nunca commitear/mover `main`. Antes de empezar cada tarea: `git checkout feat/credits-uva-mortgage`.
- ESM: imports relativos con extensión `.js`; tipos de `"@ledgerly/shared"`. Sin `any`. Componentes `export const` arrow, MUI `sx`.
- **Dólar oficial, valor `venta`.** API: `https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/{YYYY}/{MM}/{DD}` → `{ compra, venta, fecha, casa }`. Fallback: si no hay dato para la fecha, retroceder hasta 7 días al hábil anterior.
- **La ingesta NO debe fallar si la API falla** — `tipoCambioUsd` queda `null` y se completa por override/backfill.
- **Sin red real en tests:** mockear `fetch` / el módulo `fx/dollarRate` en todos los tests.
- `totalUsd = tipoCambioUsd ? totalDebitado / tipoCambioUsd : null`. USD se formatea con el `formatMoney(v, "USD")` existente (NO tocar la unión de moneda).
- Test runner: `bunx vitest run <path>`. Typecheck: `bun run typecheck`. Suite completa antes de commitear: `bun run test`.
- Commits locales por tarea. Mensaje termina con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Shared DTO — campos USD

**Files:**
- Modify: `shared/src/dtos.ts` (mortgageCouponDtoSchema)
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces: `MortgageCouponDTO` gana `tipoCambioUsd: number | null`, `tipoCambioSource: "api" | "manual" | null`, `totalUsd: number | null`.

- [ ] **Step 1: Update the failing test** — en `shared/src/dtos.test.ts`, agregar los 3 campos a los DOS objetos `coupon` que se parsean (el del test de `mortgageCouponDtoSchema` y el del test de `importResultUnionSchema`). En el primer test, al objeto `dto` agregar: `tipoCambioUsd: 1350.5, tipoCambioSource: "api", totalUsd: 1044.58`. En el test de `importResultUnionSchema`, al objeto `coupon` interno agregar: `tipoCambioUsd: null, tipoCambioSource: null, totalUsd: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — el `.parse()` de `mortgageCouponDtoSchema` no reconoce los campos nuevos aún (o el `toEqual` falla porque parse los strippea).

- [ ] **Step 3: Implement** — en `shared/src/dtos.ts`, dentro de `mortgageCouponDtoSchema`, después de `  cft: z.number(),` (antes del `});`), agregar:

```ts
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  totalUsd: z.number().nullable(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts` → Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add shared/src/dtos.ts shared/src/dtos.test.ts
git commit -m "feat(shared): add USD fields to mortgage coupon DTO"
```

---

### Task 2: Modelo — campos `tipoCambioUsd` / `tipoCambioSource`

**Files:**
- Modify: `server/src/db/models.ts` (mortgageCouponSchema)
- Test: `server/src/db/models.test.ts` (MortgageCoupon describe)

**Interfaces:**
- Produces: `MortgageCouponDoc` gana `tipoCambioUsd?: number | null` y `tipoCambioSource?: string | null` (default `null`).

- [ ] **Step 1: Write the failing test** — en `server/src/db/models.test.ts`, dentro del `describe("MortgageCoupon", ...)`, agregar:

```ts
  it("tipoCambioUsd/Source default null y aceptan valores", async () => {
    const withoutFx = await MortgageCouponModel.create(base);
    expect(withoutFx.tipoCambioUsd ?? null).toBeNull();
    expect(withoutFx.tipoCambioSource ?? null).toBeNull();
    const withFx = await MortgageCouponModel.create({ ...base, cuotaNro: 2, tipoCambioUsd: 1350.5, tipoCambioSource: "api" });
    expect(withFx.tipoCambioUsd).toBe(1350.5);
    expect(withFx.tipoCambioSource).toBe("api");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/db/models.test.ts`
Expected: FAIL — `withFx.tipoCambioUsd` is `undefined` (campo no existe en el schema).

- [ ] **Step 3: Implement** — en `server/src/db/models.ts`, dentro de `mortgageCouponSchema`, después de `    cft: { type: Number, required: true },` (línea 70), agregar:

```ts
    tipoCambioUsd: { type: Number, default: null },
    tipoCambioSource: { type: String, enum: ["api", "manual", null], default: null },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/db/models.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/db/models.ts server/src/db/models.test.ts
git commit -m "feat(db): add USD exchange-rate fields to MortgageCoupon"
```

---

### Task 3: Módulo FX — `fetchOficialRate`

**Files:**
- Create: `server/src/fx/dollarRate.ts`
- Test: `server/src/fx/dollarRate.test.ts`

**Interfaces:**
- Produces: `fetchOficialRate(dateIso: string, maxLookbackDays?: number): Promise<number | null>` — dólar oficial `venta` de la fecha (o del hábil anterior más cercano); `null` ante fallo/red.

- [ ] **Step 1: Write the failing test** — `server/src/fx/dollarRate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOficialRate } from "./dollarRate.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("fetchOficialRate", () => {
  it("devuelve la venta del día", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ compra: 1000, venta: 1350.5, fecha: "2025-08-18", casa: "oficial" })));
    expect(await fetchOficialRate("2025-08-18")).toBe(1350.5);
  });

  it("retrocede al día anterior si la fecha no tiene dato (404)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("null", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ compra: 1000, venta: 1300, fecha: "2025-08-16", casa: "oficial" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchOficialRate("2025-08-17")).toBe(1300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("devuelve null si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchOficialRate("2025-08-18")).toBeNull();
  });

  it("devuelve null si no hay dato en el rango de lookback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 404 })));
    expect(await fetchOficialRate("2025-08-18", 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/fx/dollarRate.test.ts`
Expected: FAIL — cannot find module `./dollarRate.js`.

- [ ] **Step 3: Implement** — `server/src/fx/dollarRate.ts`:

```ts
const BASE = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";

interface Cotizacion {
  compra: number;
  venta: number;
  fecha: string;
  casa: string;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export async function fetchOficialRate(dateIso: string, maxLookbackDays = 7): Promise<number | null> {
  for (let back = 0; back <= maxLookbackDays; back += 1) {
    const [y, m, d] = shiftDate(dateIso, -back).split("-");
    try {
      const res = await fetch(`${BASE}/${y}/${m}/${d}`);
      if (!res.ok) continue;
      const body = (await res.json()) as Cotizacion | null;
      if (body && typeof body.venta === "number") return body.venta;
    } catch {
      return null;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/fx/dollarRate.test.ts` → Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/fx/dollarRate.ts server/src/fx/dollarRate.test.ts
git commit -m "feat(fx): fetch official USD rate by date with weekend fallback"
```

---

### Task 4: `importCoupon` consulta y guarda el TC

**Files:**
- Modify: `server/src/import/importCoupon.ts`
- Test: `server/src/import/importCoupon.test.ts`

**Interfaces:**
- Consumes: `fetchOficialRate` (Task 3).
- Produces: al importar, el cupón guarda `tipoCambioUsd` (o `null`) + `tipoCambioSource: "api" | null`.

- [ ] **Step 1: Update the test** — en `server/src/import/importCoupon.test.ts`:
  1. Agregar el mock del módulo FX (junto al mock existente de `parseCoupon`):

```ts
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
const mockedFx = vi.mocked(fetchOficialRate);
```

  2. En el `beforeEach`, después de configurar `parseCoupon`, agregar: `mockedFx.mockResolvedValue(1350.5);`
  3. Agregar dos tests nuevos al `describe("importCoupon", ...)`:

```ts
  it("guarda el tipo de cambio oficial al importar", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(doc?.tipoCambioUsd).toBe(1350.5);
    expect(doc?.tipoCambioSource).toBe("api");
  });

  it("importa igual si la API de dólar falla (tipoCambioUsd null)", async () => {
    mockedFx.mockResolvedValueOnce(null);
    const r = await importCoupon({ data: new Uint8Array([9]), fileName: "b.pdf" });
    expect(r.status).toBe("imported");
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(doc?.tipoCambioUsd ?? null).toBeNull();
    expect(doc?.tipoCambioSource ?? null).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/importCoupon.test.ts`
Expected: FAIL — `doc.tipoCambioUsd` is `undefined` (importCoupon aún no guarda el TC).

- [ ] **Step 3: Implement** — en `server/src/import/importCoupon.ts`:
  1. Agregar el import: `import { fetchOficialRate } from "../fx/dollarRate.js";`
  2. Después de la línea del dedupe/replace (línea 18, antes del `const created = ...`), agregar:

```ts
  const tipoCambioUsd = await fetchOficialRate(coupon.fechaDebito).catch(() => null);
```

  3. Dentro del objeto de `MortgageCouponModel.create({...})`, después de `sourceHash,`, agregar:

```ts
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/importCoupon.test.ts` → Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/import/importCoupon.ts server/src/import/importCoupon.test.ts
git commit -m "feat(import): fetch and store official USD rate on coupon import"
```

---

### Task 5: Mapper `totalUsd` + endpoint PATCH de override

**Files:**
- Modify: `server/src/http/mappers.ts` (toMortgageCouponDTO)
- Modify: `server/src/http/routes/credits.ts`
- Test: `server/src/http/routes/credits.test.ts`

**Interfaces:**
- Consumes: `MortgageCouponModel`, `toMortgageCouponDTO`.
- Produces: `toMortgageCouponDTO` incluye `tipoCambioUsd`, `tipoCambioSource`, `totalUsd`. `PATCH /api/credits/coupons/:id` con `{ tipoCambioUsd }` → override manual, devuelve el DTO.

- [ ] **Step 1: Write the failing test** — en `server/src/http/routes/credits.test.ts`:
  1. En el test existente de `GET /coupons`, agregar: `expect(res.body[0].totalUsd).toBeNull();` (los cupones seedeados no tienen TC).
  2. Agregar un `describe` nuevo:

```ts
describe("PATCH /api/credits/coupons/:id", () => {
  it("setea el TC manual y recalcula totalUsd", async () => {
    const list = await request(app).get("/api/credits/coupons");
    const first = list.body[0];
    const res = await request(app).patch(`/api/credits/coupons/${first.id}`).send({ tipoCambioUsd: 1350 });
    expect(res.status).toBe(200);
    expect(res.body.tipoCambioUsd).toBe(1350);
    expect(res.body.tipoCambioSource).toBe("manual");
    expect(res.body.totalUsd).toBeCloseTo(first.totalDebitado / 1350, 2);
  });

  it("rechaza tipoCambioUsd no positivo", async () => {
    const list = await request(app).get("/api/credits/coupons");
    const res = await request(app).patch(`/api/credits/coupons/${list.body[0].id}`).send({ tipoCambioUsd: 0 });
    expect(res.status).toBe(400);
  });

  it("404 si el cupón no existe", async () => {
    const res = await request(app).patch("/api/credits/coupons/64b7f9c2a1b2c3d4e5f60718").send({ tipoCambioUsd: 1350 });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/credits.test.ts`
Expected: FAIL — `totalUsd` undefined en el GET y la ruta PATCH no existe (404 de Express en el primer PATCH sería un 404 pero con body distinto; el assert de `tipoCambioSource==="manual"` falla).

- [ ] **Step 3: Implement**

En `server/src/http/mappers.ts`, dentro de `toMortgageCouponDTO`, después de `    cft: doc.cft,` (última línea antes del `};`), agregar:

```ts
    tipoCambioUsd: doc.tipoCambioUsd ?? null,
    tipoCambioSource: (doc.tipoCambioSource ?? null) as MortgageCouponDTO["tipoCambioSource"],
    totalUsd: doc.tipoCambioUsd ? doc.totalDebitado / doc.tipoCambioUsd : null,
```

En `server/src/http/routes/credits.ts`:
  1. Cambiar el import de errores: `import { HttpError, asyncHandler } from "../errors.js";`
  2. Agregar la ruta PATCH (después del handler de `/summary`, antes del cierre del archivo):

```ts
creditsRouter.patch("/coupons/:id", asyncHandler(async (req, res) => {
  const { tipoCambioUsd } = req.body as { tipoCambioUsd?: unknown };
  if (typeof tipoCambioUsd !== "number" || !(tipoCambioUsd > 0)) {
    throw new HttpError(400, "tipoCambioUsd debe ser un número positivo");
  }
  const doc = await MortgageCouponModel.findByIdAndUpdate(
    req.params.id,
    { tipoCambioUsd, tipoCambioSource: "manual" },
    { new: true },
  );
  if (!doc) throw new HttpError(404, "Cupón no encontrado");
  res.json(toMortgageCouponDTO(doc));
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/credits.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/http/mappers.ts server/src/http/routes/credits.ts server/src/http/routes/credits.test.ts
git commit -m "feat(api): expose totalUsd and add manual USD-rate override endpoint"
```

---

### Task 6: Backfill de TC para cupones existentes

**Files:**
- Create: `server/src/import/backfillRates.ts`
- Modify: `package.json` (script `seed:fx`)
- Test: `server/src/import/backfillRates.test.ts`

**Interfaces:**
- Consumes: `MortgageCouponModel`, `fetchOficialRate`.
- Produces: `backfillCouponRates(): Promise<{ updated: number; skipped: number }>` — completa `tipoCambioUsd` de los cupones que lo tengan en `null`.

- [ ] **Step 1: Write the failing test** — `server/src/import/backfillRates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { backfillCouponRates } from "./backfillRates.js";
import { MortgageCouponModel } from "../db/models.js";

withDb();
const mockedFx = vi.mocked(fetchOficialRate);

const base = {
  prestamoNro: "0405727408", fechaDebito: new Date("2025-08-18"), capital: 1, intereses: 1,
  seguroIncendio: 1, totalDebitado: 1000, cuotaPuraUva: 1, cotizacionUva: 1, tea: 9.27, tna: 8.9, cft: 0,
  sourceFileName: "x.pdf",
};

beforeEach(async () => {
  await MortgageCouponModel.insertMany([
    { ...base, cuotaNro: 1, sourceHash: "h1" },
    { ...base, cuotaNro: 2, sourceHash: "h2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
  ]);
});

describe("backfillCouponRates", () => {
  it("completa solo los cupones sin TC", async () => {
    mockedFx.mockResolvedValue(1350);
    const r = await backfillCouponRates();
    expect(r.updated).toBe(1);
    const c1 = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(c1?.tipoCambioUsd).toBe(1350);
    expect(c1?.tipoCambioSource).toBe("api");
    const c2 = await MortgageCouponModel.findOne({ cuotaNro: 2 });
    expect(c2?.tipoCambioUsd).toBe(999);
  });

  it("cuenta como skipped si la API no devuelve dato", async () => {
    mockedFx.mockResolvedValue(null);
    const r = await backfillCouponRates();
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/backfillRates.test.ts`
Expected: FAIL — cannot find module `./backfillRates.js`.

- [ ] **Step 3: Implement** — `server/src/import/backfillRates.ts`:

```ts
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { MortgageCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function backfillCouponRates(): Promise<{ updated: number; skipped: number }> {
  const docs = await MortgageCouponModel.find({ tipoCambioUsd: null });
  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const rate = await fetchOficialRate(doc.fechaDebito.toISOString().slice(0, 10)).catch(() => null);
    if (rate == null) {
      skipped += 1;
      continue;
    }
    doc.tipoCambioUsd = rate;
    doc.tipoCambioSource = "api";
    await doc.save();
    updated += 1;
  }
  return { updated, skipped };
}

if (process.argv[1]?.endsWith("backfillRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillCouponRates();
  console.log(`TC backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
```

En `package.json`, en `scripts`, después de `"seed:coupons": ...`, agregar:

```json
    "seed:fx": "tsx server/src/import/backfillRates.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/backfillRates.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/import/backfillRates.ts server/src/import/backfillRates.test.ts package.json
git commit -m "feat(import): backfill USD rates for existing coupons (seed:fx)"
```

---

### Task 7: Cliente — hook de override + columnas TC/USD editables en la tabla

**Files:**
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/components/MortgageCouponsTable.tsx`
- Test: `client/src/components/MortgageCouponsTable.test.tsx` (create)

**Interfaces:**
- Consumes: `useCreditCoupons` (existente), `MortgageCouponDTO` con los nuevos campos.
- Produces: `usePatchCouponRate()`; la tabla muestra "TC oficial" (editable) y "Pagado (USD)".

- [ ] **Step 1: Write the failing test** — `client/src/components/MortgageCouponsTable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MortgageCouponsTable } from "./MortgageCouponsTable.js";

const coupon = {
  id: "c1", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 184689.39,
  intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
  cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0,
  tipoCambioUsd: 1350, tipoCambioSource: "api", totalUsd: 813.1,
};
const patchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") { patchSpy(url, init.body); return new Response(JSON.stringify({ ...coupon, tipoCambioUsd: 1400, tipoCambioSource: "manual", totalUsd: 784.06 }), { status: 200 }); }
    return new Response(JSON.stringify([coupon]), { status: 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); patchSpy.mockReset(); });

describe("MortgageCouponsTable", () => {
  it("muestra columna Pagado (USD)", async () => {
    renderWithProviders(<MortgageCouponsTable />);
    await waitFor(() => expect(screen.getByText(/pagado \(usd\)/i)).toBeInTheDocument());
    expect(screen.getByRole("columnheader", { name: /tc oficial/i })).toBeInTheDocument();
  });

  it("editar el TC dispara un PATCH", async () => {
    renderWithProviders(<MortgageCouponsTable />);
    await waitFor(() => expect(screen.getByText(/pagado \(usd\)/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /editar tc cuota 1/i }));
    const input = screen.getByRole("spinbutton", { name: /tc cuota 1/i });
    await userEvent.clear(input);
    await userEvent.type(input, "1400{Enter}");
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy.mock.calls[0][0]).toContain("/credits/coupons/c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/MortgageCouponsTable.test.tsx`
Expected: FAIL — no existe la columna "Pagado (USD)" ni el botón de editar.

- [ ] **Step 3: Implement**

En `client/src/api/hooks.ts`, después de `useCreditSummary`, agregar:

```ts
export function usePatchCouponRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoCambioUsd }: { id: string; tipoCambioUsd: number }) =>
      apiFetch<MortgageCouponDTO>(`/credits/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ tipoCambioUsd }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

Reemplazar `client/src/components/MortgageCouponsTable.tsx` completo:

```tsx
import { useState } from "react";
import { Box, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { MortgageCouponDTO } from "@ledgerly/shared";
import { useCreditCoupons, usePatchCouponRate } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

const RateCell = ({ coupon }: { coupon: MortgageCouponDTO }) => {
  const patch = usePatchCouponRate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(coupon.tipoCambioUsd ?? ""));

  const save = () => {
    const parsed = Number(value);
    setEditing(false);
    if (parsed > 0 && parsed !== coupon.tipoCambioUsd) patch.mutate({ id: coupon.id, tipoCambioUsd: parsed });
  };

  if (editing) {
    return (
      <TextField
        size="small"
        type="number"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        inputProps={{ "aria-label": `TC cuota ${coupon.cuotaNro}`, style: { textAlign: "right", width: 90 } }}
      />
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
      {coupon.tipoCambioUsd != null ? formatMoney(coupon.tipoCambioUsd, "ARS") : "—"}
      <IconButton size="small" aria-label={`editar TC cuota ${coupon.cuotaNro}`} onClick={() => { setValue(String(coupon.tipoCambioUsd ?? "")); setEditing(true); }}>
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Box>
  );
};

export const MortgageCouponsTable = () => {
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return null;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cuota</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Capital</TableCell>
            <TableCell align="right">Interés</TableCell>
            <TableCell align="right">Seguro</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Cuota (UVA)</TableCell>
            <TableCell align="right">Cotización</TableCell>
            <TableCell align="right">TC oficial</TableCell>
            <TableCell align="right">Pagado (USD)</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((c) => (
            <MotionTableRow key={c.id} variants={fadeUpItem}>
              <TableCell>{c.cuotaNro}</TableCell>
              <TableCell>{c.fechaDebito}</TableCell>
              <TableCell align="right">{formatMoney(c.capital, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.intereses, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.seguroIncendio, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.totalDebitado, "ARS")}</TableCell>
              <TableCell align="right">{formatUva(c.cuotaPuraUva)}</TableCell>
              <TableCell align="right">{formatMoney(c.cotizacionUva, "ARS")}</TableCell>
              <TableCell align="right"><RateCell coupon={c} /></TableCell>
              <TableCell align="right">
                {c.totalUsd != null ? formatMoney(c.totalUsd, "USD") : <Typography component="span" color="text.disabled">—</Typography>}
              </TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/MortgageCouponsTable.test.tsx` → Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add client/src/api/hooks.ts client/src/components/MortgageCouponsTable.tsx client/src/components/MortgageCouponsTable.test.tsx
git commit -m "feat(client): editable USD rate and Pagado (USD) column in coupons table"
```

---

### Task 8: Cliente — gráfico "Valor de la cuota en USD" + wiring en CreditsPage

**Files:**
- Create: `client/src/components/charts/CouponUsdChart.tsx`
- Modify: `client/src/pages/CreditsPage.tsx`
- Modify: `client/src/pages/CreditsPage.test.tsx`

**Interfaces:**
- Consumes: `useCreditCoupons`, `nivoTheme`, `seriesColor`, `formatMoney`/`formatMoneyCompact`.
- Produces: `CouponUsdChart` (línea de `totalUsd` por mes) renderizado en la página.

- [ ] **Step 1: Update the failing test** — en `client/src/pages/CreditsPage.test.tsx`:
  1. Al objeto que devuelve la ruta `/credits/coupons` (el array de cupones del stub), agregar a cada cupón: `tipoCambioUsd: 1350, tipoCambioSource: "api", totalUsd: 813.1`.
  2. Agregar una aserción al test existente:

```ts
    expect(screen.getByText(/valor de la cuota en usd/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/CreditsPage.test.tsx`
Expected: FAIL — el título "Valor de la cuota en USD" no está en la página.

- [ ] **Step 3: Implement**

`client/src/components/charts/CouponUsdChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const CouponUsdChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  const points = (data ?? [])
    .filter((c) => c.totalUsd != null)
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ x: c.fechaDebito.slice(0, 7), y: c.totalUsd as number }));

  if (points.length === 0) return <Typography color="text.secondary">Sin datos de dólar</Typography>;

  const color = seriesColor(theme.palette.mode, 8);
  const series = [{ id: "Cuota en USD", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("usdArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "usdArea" }]}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "USD") }}
        yFormat={(value) => formatMoney(Number(value), "USD")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

En `client/src/pages/CreditsPage.tsx`:
  1. Agregar el import: `import { CouponUsdChart } from "../components/charts/CouponUsdChart.js";`
  2. Dentro del `MotionBox` de gráficos, después del `ChartCard` de "Amortizado vs pendiente", agregar:

```tsx
            <ChartCard title="Valor de la cuota en USD"><CouponUsdChart /></ChartCard>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/CreditsPage.test.tsx client/src/components/MortgageCouponsTable.test.tsx` → Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
bun run typecheck && bun run test
git add client/src/components/charts/CouponUsdChart.tsx client/src/pages/CreditsPage.tsx client/src/pages/CreditsPage.test.tsx
git commit -m "feat(client): USD-value-per-installment chart on Créditos page"
```

---

## Self-Review

**Spec coverage:** fuente API oficial `venta` + fallback (Task 3); guardado al importar resiliente (Task 4); override manual (Task 5 PATCH); backfill de los 11 (Task 6); tabla TC editable + USD (Task 7); gráfico USD (Task 8); DTO/modelo (Tasks 1-2). `totalUsd` derivado en el mapper (Task 5). Todo cubierto.

**Placeholder scan:** sin TBD/TODO; cada step con código y comando concretos.

**Type consistency:** `tipoCambioUsd: number | null`, `tipoCambioSource: "api" | "manual" | null`, `totalUsd: number | null` idénticos en schema (T1), modelo (T2), mapper (T5), y consumo cliente (T7/T8). `fetchOficialRate(dateIso) => Promise<number | null>` (T3) consumido en T4 y T6. `usePatchCouponRate({id, tipoCambioUsd})` (T7) pega a `PATCH /credits/coupons/:id` (T5).

**Fuera de alcance (recordatorio):** otros dólares, capital/interés en USD por separado, KPI de total pagado en USD, caché persistente de cotizaciones.
