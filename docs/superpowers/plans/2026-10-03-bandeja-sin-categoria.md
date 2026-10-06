# Bandeja de movimientos sin categoría — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arriba de las reglas, en la página Reglas, una bandeja agrupa por comercio las compras que quedaron en «Sin categoría» (con un chip de pendientes), las ordena por monto o por frecuencia, propone un patrón por comercio y con «Crear regla» crea una regla `contains` que categoriza en el acto solo los movimientos pendientes; en el celular es una lista con hoja inferior.

**Architecture:** El server agrupa con funciones puras (`suggestPattern` → clave del grupo, `buildUncategorizedInbox` → totales y orden, `idsMatchingRule` → qué categoriza la regla) y expone dos rutas en el router existente de reglas (`GET /api/category-rules/inbox`, `POST /api/category-rules/inbox/rules`). El cliente consume los hooks que ya trae la base; la lógica de presentación vive en `client/src/uncategorizedInbox.ts` (puro), el estado de la sección en `useInboxSection` y el de cada borrador en `useInboxRuleDraft`; `UncategorizedInbox` elige con `useIsMobile()` entre `InboxTable` (compu) e `InboxList` + `InboxRuleSheet` (mobile).

**Tech Stack:** Express + Mongoose (server), React 18 + MUI 6 + React Query 5 + react-router 6 (cliente), zod en shared; Vitest + supertest + mongodb-memory-server, Testing Library en jsdom; Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-bandeja-sin-categoria-design.md`. Convenciones mobile: `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md`. Base compartida: `docs/superpowers/specs/2026-10-03-base-nuevas-features-design.md`.

## Prerrequisitos

1. Rama `feat/bandeja-sin-categoria`, creada desde `feat/base-nuevas-features`, con `bun install` hecho. Verificar desde la raíz del worktree:

   ```bash
   grep -n "export const UNCATEGORIZED_CATEGORY" shared/src/schemas.ts
   grep -n "export const inboxRuleResultDtoSchema" shared/src/dtos.ts
   grep -n "export function useUncategorizedInbox\|export function useCreateInboxRule" client/src/api/hooks.ts
   grep -n "export function categoryOptions" client/src/categoryOptions.ts
   grep -n "export function transactionsLink" client/src/filters/transactionsLink.ts
   ```

   Las cinco tienen que dar resultado.
2. **No tocar** (vienen de la base en forma final): `shared/*`, `client/src/api/hooks.ts`, `client/src/categoryOptions.ts` (+ test), `client/src/filters/transactionsLink.ts`, `App.tsx`, `layout/*`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/db/models.ts`, `server/src/stats/merchantKey.ts`, `package.json`s, `bun.lock`.
3. `examples/` tiene PDFs reales y está gitignoreado: nunca entra a un commit. Fixtures siempre sintéticos.

## Ajustes respecto del spec

- `formatMoney` usa `Intl` con dos decimales y espacio duro: `formatMoney(9000, "ARS")` es `"$ 9.000,00"`. Los tests de `groupTotalLabel` comparan contra `formatMoney(…)` en vez de escribir el literal.
- `pendingLabel(n)` (nuevo, puro) arma el `aria-label` del chip en singular y plural.
- `InboxViewProps` y `CreateInboxRule` viven en `useInboxSection.ts`: son el contrato que comparten `InboxTable` e `InboxList`.
- La sección se cablea en `RulesPage` **después** de tener la vista mobile (Task 8): con solo la tabla, los tests mobile de `RulesPage` ("sin tabla") se romperían.
- `snackbarAboveNavSx` y `patternInputProps` se mueven en la Task 6 (la vista de compu ya los usa).

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits**: uno por task, con pathspec explícito (`git add <rutas>`; nunca `-A` ni `.`), mensaje convencional en español y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca push, PR ni merge; nunca tocar `main`.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Hooks como `export function useX()`. Lógica de más de 15 líneas en hooks.
- Mapeos, filtros y condicionales antes del `return`. Nunca el índice como `key` (`key={group.pattern}`, `key={category}`).
- **El cliente importa solo tipos de `@ledgerly/shared`** (`import type`). El server sí importa valores.
- Corte mobile `< md` (900px) vía `useIsMobile()`. Objetivos táctiles de 44px con `tapTargetSx` / `MIN_TAP_SIZE` de `client/src/components/tapTarget.ts`.
- Textos exactos: «Sin categoría», «No quedan movimientos sin categoría.», «Monto», «Frecuencia», «Ordenar por», «Comercio», «Movs.», «Total», «Patrón», «Categoría», «Crear regla», «Ver movimientos», «Mostrar todos (N)», «Mostrar menos», «Mínimo 3 caracteres», «No coincide con «X»», «También cubre N comercios más de la bandeja», «Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto.», «Todavía no hay categorías. Creá una desde «Nueva regla».», «Reglas».
- Regla de la bandeja: `contains`, prioridad 100, `source: "user"`, `enabled: true`. Patrón mínimo 3 caracteres. 8 comercios visibles.
- Tests de cliente con más de un render: `afterEach(cleanup)`. Los que stubean `fetch` o emulan viewport: `vi.unstubAllGlobals()` en `afterEach`. MUI DataGrid no se usa. Al cerrarse, una hoja queda `aria-hidden` en el acto: `queryByRole("dialog")` da `null` enseguida.
- Imports con extensión `.js` (ESM).
- Comandos desde la raíz del worktree: `bun run test <ruta>`, `bun run typecheck`, `bun run build`. No levantar la app (4100, 4000 y 5173 son de otros procesos).

## Review Focus

1. **Doble toque en «Crear regla»**: con el request en curso, todos los «Crear regla» de la bandeja quedan deshabilitados y se manda un solo POST. → test "mientras se crea la regla ningún «Crear regla» se puede volver a tocar" en Task 6.
2. **La regla categoriza el último comercio**: la bandeja pasa a «vacía» y el aviso con el resultado sigue a la vista (el `Snackbar` está fuera de la tarjeta). → test "al categorizar el último comercio muestra la bandeja vacía y el resultado" en Task 6.
3. **Patrones con caracteres de regex** (`UBER *TRIP`, `NETFLIX.COM`): valen literal en `contains` y el link a Movimientos los codifica sin romperse. → test "en contains los caracteres de regex valen literal" en Task 2 e `inboxTransactionsHref("UBER *TRIP")` en Task 5.
4. **Patrón editado en minúsculas o con espacios**: es válido en el cliente, se manda recortado y el server lo guarda recortado. → tests "acepta el patrón en minúsculas y con espacios alrededor" (Task 5), "recorta patrón y categoría" (Task 4) y "crea con el patrón recortado…" (Task 7).
5. **Comercio con nombre largo a 390px**: va en una sola línea con puntos suspensivos y no empuja el total; el `Snackbar` queda arriba de la barra inferior. → tests "un comercio largo va en una sola línea" y "el aviso queda arriba de la barra inferior" en Task 7.

---

### Task 1: Patrón sugerido para un comercio

**Files:**
- Create: `server/src/rules/suggestPattern.ts`
- Test: `server/src/rules/suggestPattern.test.ts`

**Interfaces:**
- Consumes: `matchRule` de `server/src/rules/categorize.ts`, `normalizeMerchant` de `server/src/parsers/normalize.ts` (solo en el test).
- Produces: `MIN_RULE_PATTERN_LENGTH = 3`, `MAX_PATTERN_WORDS = 3`, `suggestPattern(merchant: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "../parsers/normalize.js";
import { matchRule } from "./categorize.js";
import { MAX_PATTERN_WORDS, MIN_RULE_PATTERN_LENGTH, suggestPattern } from "./suggestPattern.js";

describe("suggestPattern", () => {
  it.each([
    ["COMERCIO UNO", "COMERCIO UNO"],
    ["NETFLIX.COM 12345", "NETFLIX.COM"],
    ["MERCADOLIBRE*3CUOTAS", "MERCADOLIBRE"],
    ["UBER *TRIP HELP.UBER.COM", "UBER *TRIP HELP.UBER.COM"],
    ["UBER * 123", "UBER"],
    ["LA PANADERIA DE PEPE", "LA PANADERIA DE"],
    ["YPF 1234", "YPF"],
    ["7 ELEVEN", "7 ELEVEN"],
    ["AB 123", "AB 123"],
    ["  cafe   martinez ", "CAFE MARTINEZ"],
  ])("%s → %s", (merchant, pattern) => {
    expect(suggestPattern(merchant)).toBe(pattern);
  });

  it("pide 3 caracteres y se queda con hasta 3 palabras", () => {
    expect(MIN_RULE_PATTERN_LENGTH).toBe(3);
    expect(MAX_PATTERN_WORDS).toBe(3);
  });

  it("el patrón es prefijo del comercio y una regla contains con él lo matchea", () => {
    const merchants = [
      "MERPAGO*MERCADOLIBRE Cuota 03/06",
      "PAYU*AR*UBER",
      "SERVICIO USD 50,00",
      "STEAMGAMES.COM 4259522985",
      "NETFLIX.COM 12345",
      "DLO*GOOGLE YouTube 9.999,00",
      "7 ELEVEN",
      "KIOSCO EL SOL",
      "PANADERIA LA ESPIGA S.R.L.",
    ].map(normalizeMerchant);
    for (const merchant of merchants) {
      const pattern = suggestPattern(merchant);
      expect(pattern.length).toBeGreaterThanOrEqual(MIN_RULE_PATTERN_LENGTH);
      expect(merchant.toUpperCase().startsWith(pattern)).toBe(true);
      expect(matchRule(merchant, merchant, [{ priority: 100, matchType: "contains", pattern, category: "X", enabled: true }])).toBe("X");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/rules/suggestPattern.test.ts`
Expected: FAIL con "Failed to load url ./suggestPattern.js" (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

```ts
export const MIN_RULE_PATTERN_LENGTH = 3;
export const MAX_PATTERN_WORDS = 3;

const TRAILING_SEPARATORS = /[\s*.\-#/]+$/;

const cutBeforeFirstDigit = (clean: string): string => {
  const digitAt = clean.search(/\d/);
  if (digitAt === -1) return clean;
  const wordStart = clean.lastIndexOf(" ", digitAt) + 1;
  return wordStart === 0 ? clean.slice(0, digitAt) : clean.slice(0, wordStart);
};

export function suggestPattern(merchant: string): string {
  const clean = merchant.toUpperCase().replace(/\s+/g, " ").trim();
  const words = cutBeforeFirstDigit(clean).split(" ").slice(0, MAX_PATTERN_WORDS);
  const pattern = words.join(" ").replace(TRAILING_SEPARATORS, "");
  return pattern.length < MIN_RULE_PATTERN_LENGTH ? clean : pattern;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/rules/suggestPattern.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/rules/suggestPattern.ts server/src/rules/suggestPattern.test.ts
git commit -m "feat(server): patrón sugerido para agrupar comercios sin categoría" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `UNCATEGORIZED` e `idsMatchingRule`

**Files:**
- Modify: `server/src/rules/categorize.ts`
- Modify: `server/src/http/routes/categoryRules.ts` (solo el literal de `/apply`)
- Test: `server/src/rules/categorize.test.ts`

**Interfaces:**
- Consumes: `UNCATEGORIZED_CATEGORY` de `@ledgerly/shared`.
- Produces: `UNCATEGORIZED` (`"Sin categoría"`), `interface RuleCandidate { id: string; descriptionRaw: string; merchant: string; }`, `idsMatchingRule(candidates: RuleCandidate[], rule: RuleInput): string[]`.

- [ ] **Step 1: Write the failing test**

En `server/src/rules/categorize.test.ts`, reemplazar los imports por:

```ts
import { describe, it, expect } from "vitest";
import { categorize, idsMatchingRule, matchRule, SEED_RULES, UNCATEGORIZED } from "./categorize.js";
import type { RuleCandidate, RuleInput } from "./categorize.js";
```

y agregar al final:

```ts
describe("UNCATEGORIZED", () => {
  it("es la categoría de los movimientos sin regla", () => {
    expect(UNCATEGORIZED).toBe("Sin categoría");
    expect(categorize("ALGO RARO", "ALGO RARO", []).category).toBe(UNCATEGORIZED);
  });
});

describe("idsMatchingRule", () => {
  const candidates: RuleCandidate[] = [
    { id: "a", descriptionRaw: "PANADERIA LA ESPIGA 123", merchant: "PANADERIA LA ESPIGA" },
    { id: "b", descriptionRaw: "MERPAGO*KIOSCO EL SOL", merchant: "KIOSCO EL SOL" },
    { id: "c", descriptionRaw: "UBER *TRIP HELP.UBER.COM", merchant: "UBER *TRIP HELP.UBER.COM" },
  ];
  const contains = (pattern: string): RuleInput => ({ priority: 100, matchType: "contains", pattern, category: "Comida", enabled: true });

  it("matchea por el comercio sin importar mayúsculas", () => {
    expect(idsMatchingRule(candidates, contains("panaderia la"))).toEqual(["a"]);
  });

  it("matchea también por la descripción cruda", () => {
    expect(idsMatchingRule(candidates, contains("MERPAGO*"))).toEqual(["b"]);
  });

  it("en contains los caracteres de regex valen literal", () => {
    expect(idsMatchingRule(candidates, contains("UBER *TRIP"))).toEqual(["c"]);
    expect(idsMatchingRule(candidates, contains("UBER.*SOL"))).toEqual([]);
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(idsMatchingRule(candidates, contains("FARMACIA"))).toEqual([]);
  });

  it("un regex inválido no matchea nada", () => {
    expect(idsMatchingRule(candidates, { ...contains("("), matchType: "regex" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/rules/categorize.test.ts`
Expected: FAIL con "idsMatchingRule is not a function" / `UNCATEGORIZED` undefined.

- [ ] **Step 3: Write minimal implementation**

En `server/src/rules/categorize.ts`, arriba de todo:

```ts
import { UNCATEGORIZED_CATEGORY } from "@ledgerly/shared";

export const UNCATEGORIZED = UNCATEGORIZED_CATEGORY;
```

reemplazar en `categorize` el literal `"Sin categoría"` por `UNCATEGORIZED`:

```ts
  return { category: matchRule(descriptionRaw, merchant, rules) ?? UNCATEGORIZED, source: "rule" };
```

y agregar después de `categorize`:

```ts
export interface RuleCandidate {
  id: string;
  descriptionRaw: string;
  merchant: string;
}

export function idsMatchingRule(candidates: RuleCandidate[], rule: RuleInput): string[] {
  return candidates
    .filter((candidate) => matchRule(candidate.descriptionRaw, candidate.merchant, [rule]) !== null)
    .map((candidate) => candidate.id);
}
```

En `server/src/http/routes/categoryRules.ts`, cambiar el import a `import { matchRule, UNCATEGORIZED, type RuleInput } from "../../rules/categorize.js";` y en `/apply`:

```ts
      const category = matched ?? UNCATEGORIZED;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/rules/categorize.test.ts server/src/http/routes/categoryRules.test.ts`
Expected: PASS (el test de `/apply` sigue verde).

- [ ] **Step 5: Commit**

```bash
git add server/src/rules/categorize.ts server/src/rules/categorize.test.ts server/src/http/routes/categoryRules.ts
git commit -m "feat(server): UNCATEGORIZED e idsMatchingRule para aplicar una regla a los pendientes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Armado de la bandeja

**Files:**
- Create: `server/src/stats/uncategorizedInbox.ts`
- Test: `server/src/stats/uncategorizedInbox.test.ts`

**Interfaces:**
- Consumes: `suggestPattern` (Task 1); tipos `Currency`, `UncategorizedGroupDTO`, `UncategorizedInboxDTO` de `@ledgerly/shared`.
- Produces: `interface PendingPurchase { merchant: string; amount: number; currency: Currency; date: string; }`, `buildUncategorizedInbox(rows: PendingPurchase[], usdRate: number | null): UncategorizedInboxDTO`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import type { Currency } from "@ledgerly/shared";
import { buildUncategorizedInbox, type PendingPurchase } from "./uncategorizedInbox.js";

const purchase = (merchant: string, amount: number, date: string, currency: Currency = "ARS"): PendingPurchase =>
  ({ merchant, amount, currency, date });

describe("buildUncategorizedInbox", () => {
  it("junta en un grupo las variantes con referencias distintas", () => {
    const inbox = buildUncategorizedInbox([
      purchase("STEAMGAMES.COM 4259522985", 9.99, "2026-09-14", "USD"),
      purchase("STEAMGAMES.COM 4259518112", 9.99, "2026-08-14", "USD"),
    ], 1415);
    expect(inbox.groups).toHaveLength(1);
    expect(inbox.groups[0]).toMatchObject({ pattern: "STEAMGAMES.COM", count: 2, totalArs: 0, lastDate: "2026-09-14" });
    expect(inbox.groups[0].merchants).toEqual(["STEAMGAMES.COM 4259518112", "STEAMGAMES.COM 4259522985"]);
    expect(inbox.groups[0].totalUsd).toBeCloseTo(19.98);
    expect(inbox.groups[0].equivalentArs).toBeCloseTo(28271.7);
  });

  it("suma por moneda, convierte los USD con la cotización y toma la fecha más reciente", () => {
    const inbox = buildUncategorizedInbox([
      purchase("KIOSCO EL SOL", 1000, "2026-09-01"),
      purchase("KIOSCO EL SOL", 500, "2026-09-03"),
      purchase("KIOSCO EL SOL", 2, "2026-09-02", "USD"),
    ], 1000);
    expect(inbox.groups[0]).toMatchObject({ count: 3, totalArs: 1500, totalUsd: 2, equivalentArs: 3500, lastDate: "2026-09-03" });
  });

  it("sin cotización los USD no suman al equivalente", () => {
    const inbox = buildUncategorizedInbox([
      purchase("KIOSCO EL SOL", 1000, "2026-09-01"),
      purchase("KIOSCO EL SOL", 2, "2026-09-02", "USD"),
    ], null);
    expect(inbox.usdRate).toBeNull();
    expect(inbox.groups[0]).toMatchObject({ totalArs: 1000, totalUsd: 2, equivalentArs: 1000 });
  });

  it("ordena por equivalente en pesos, después por cantidad y después por patrón", () => {
    const inbox = buildUncategorizedInbox([
      purchase("ALFA", 100, "2026-09-01"),
      purchase("BETA", 50, "2026-09-01"),
      purchase("BETA", 50, "2026-09-02"),
      purchase("GAMMA", 100, "2026-09-01"),
      purchase("DELTA", 300, "2026-09-01"),
      purchase("EPSILON", 1, "2026-09-01", "USD"),
    ], 250);
    expect(inbox.groups.map((group) => group.pattern)).toEqual(["DELTA", "EPSILON", "BETA", "ALFA", "GAMMA"]);
  });

  it("ordena las variantes de la más frecuente a la menos", () => {
    const inbox = buildUncategorizedInbox([
      purchase("YPF 1234", 10, "2026-09-01"),
      purchase("YPF 5678", 10, "2026-09-02"),
      purchase("YPF 5678", 10, "2026-09-03"),
    ], null);
    expect(inbox.groups[0]).toMatchObject({ pattern: "YPF", merchants: ["YPF 5678", "YPF 1234"] });
  });

  it("cuenta todos los pendientes", () => {
    expect(buildUncategorizedInbox([purchase("ALFA", 1, "2026-09-01"), purchase("BETA", 1, "2026-09-01")], null).pendingCount).toBe(2);
  });

  it("sin filas devuelve una bandeja vacía con la cotización", () => {
    expect(buildUncategorizedInbox([], 1415)).toEqual({ pendingCount: 0, usdRate: 1415, groups: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/uncategorizedInbox.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Currency, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { suggestPattern } from "../rules/suggestPattern.js";

export interface PendingPurchase {
  merchant: string;
  amount: number;
  currency: Currency;
  date: string;
}

const byFrequencyThenName = (counts: Map<string, number>) => (a: string, b: string): number =>
  (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b);

const byEquivalentThenCount = (a: UncategorizedGroupDTO, b: UncategorizedGroupDTO): number =>
  b.equivalentArs - a.equivalentArs || b.count - a.count || a.pattern.localeCompare(b.pattern);

const toGroup = (pattern: string, rows: PendingPurchase[], usdRate: number | null): UncategorizedGroupDTO => {
  const counts = new Map<string, number>();
  let totalArs = 0;
  let totalUsd = 0;
  let lastDate = "";
  for (const row of rows) {
    counts.set(row.merchant, (counts.get(row.merchant) ?? 0) + 1);
    if (row.currency === "USD") totalUsd += row.amount;
    else totalArs += row.amount;
    if (row.date > lastDate) lastDate = row.date;
  }
  return {
    pattern,
    merchants: [...counts.keys()].sort(byFrequencyThenName(counts)),
    count: rows.length,
    totalArs,
    totalUsd,
    equivalentArs: totalArs + (usdRate === null ? 0 : totalUsd * usdRate),
    lastDate,
  };
};

export function buildUncategorizedInbox(rows: PendingPurchase[], usdRate: number | null): UncategorizedInboxDTO {
  const byPattern = new Map<string, PendingPurchase[]>();
  for (const row of rows) {
    const pattern = suggestPattern(row.merchant);
    const bucket = byPattern.get(pattern);
    if (bucket) bucket.push(row);
    else byPattern.set(pattern, [row]);
  }
  const groups = [...byPattern]
    .map(([pattern, groupRows]) => toGroup(pattern, groupRows, usdRate))
    .sort(byEquivalentThenCount);
  return { pendingCount: rows.length, usdRate, groups };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/uncategorizedInbox.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/uncategorizedInbox.ts server/src/stats/uncategorizedInbox.test.ts
git commit -m "feat(server): armado de la bandeja de movimientos sin categoría" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rutas de la bandeja

**Files:**
- Create: `server/src/fx/latestUsdOficial.ts`
- Modify: `server/src/http/routes/categoryRules.ts`
- Test: `server/src/http/routes/categoryRules.test.ts`

**Interfaces:**
- Consumes: `UNCATEGORIZED`, `idsMatchingRule`, `RuleInput` (Task 2); `MIN_RULE_PATTERN_LENGTH` (Task 1); `buildUncategorizedInbox`, `PendingPurchase` (Task 3); `toCategoryRuleDTO`; `uncategorizedInboxDtoSchema`, `inboxRuleResultDtoSchema` (shared).
- Produces: `latestUsdOficial(): Promise<number | null>`; `GET /api/category-rules/inbox` → `UncategorizedInboxDTO`; `POST /api/category-rules/inbox/rules` (`{ pattern, category }`) → `201 InboxRuleResultDTO` o `400 { error }`.

- [ ] **Step 1: Write the failing test**

En `server/src/http/routes/categoryRules.test.ts`, reemplazar los imports por:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { inboxRuleResultDtoSchema, uncategorizedInboxDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { CategoryRuleModel, MacroSeriesModel, StatementModel, TransactionModel } from "../../db/models.js";
```

y agregar al final:

```ts
interface TxSeed {
  merchant: string;
  descriptionRaw?: string;
  amount?: number;
  currency?: "ARS" | "USD";
  type?: "purchase" | "payment" | "tax";
  category?: string;
  categorySource?: "rule" | "manual";
  date?: string;
}

const seedTransactions = async (seeds: TxSeed[]) => {
  const statement = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "bandeja.pdf", sourceHash: "bandeja", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany(seeds.map((seed, position) => ({
    statementId: statement._id, issuer: "icbc", cardLabel: "ICBC",
    date: new Date(`${seed.date ?? "2026-09-10"}T12:00:00Z`),
    descriptionRaw: seed.descriptionRaw ?? seed.merchant, merchant: seed.merchant,
    category: seed.category ?? "Sin categoría", categorySource: seed.categorySource ?? "rule",
    amount: seed.amount ?? 100, currency: seed.currency ?? "ARS", direction: "debit", type: seed.type ?? "purchase",
    isInstallment: false, installmentCurrent: null, installmentTotal: null,
    comprobante: `b${position}`, fingerprint: `bandeja-${position}`,
  })));
};

describe("GET /api/category-rules/inbox", () => {
  it("agrupa solo las compras sin categoría y usa el último dólar oficial", async () => {
    await seedTransactions([
      { merchant: "PANADERIA LA ESPIGA", amount: 1000, date: "2026-09-01" },
      { merchant: "PANADERIA LA ESPIGA", amount: 2000, date: "2026-09-20" },
      { merchant: "STEAMGAMES.COM 4259522985", amount: 10, currency: "USD", date: "2026-09-14" },
      { merchant: "PAGO EN PESOS", type: "payment" },
      { merchant: "IMPUESTO DE SELLOS", type: "tax" },
      { merchant: "KIOSCO EL SOL", category: "Comida" },
      { merchant: "REGALO RARO", category: "Regalos", categorySource: "manual" },
    ]);
    await MacroSeriesModel.create([
      { serie: "usd_oficial", fecha: "2026-09-01", valor: 1300 },
      { serie: "usd_oficial", fecha: "2026-09-30", valor: 1400 },
      { serie: "uva", fecha: "2026-10-01", valor: 1700 },
    ]);

    const res = await request(app).get("/api/category-rules/inbox");

    expect(res.status).toBe(200);
    const inbox = uncategorizedInboxDtoSchema.parse(res.body);
    expect(inbox.pendingCount).toBe(3);
    expect(inbox.usdRate).toBe(1400);
    expect(inbox.groups).toEqual([
      { pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985"], count: 1, totalArs: 0, totalUsd: 10,
        equivalentArs: 14000, lastDate: "2026-09-14" },
      { pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 2, totalArs: 3000, totalUsd: 0,
        equivalentArs: 3000, lastDate: "2026-09-20" },
    ]);
  });

  it("sin dólar oficial cargado devuelve usdRate null", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).get("/api/category-rules/inbox");
    expect(res.status).toBe(200);
    expect(res.body.usdRate).toBeNull();
    expect(res.body.pendingCount).toBe(1);
  });
});

describe("POST /api/category-rules/inbox/rules", () => {
  it("crea la regla y categoriza solo los pendientes que coinciden", async () => {
    await seedTransactions([
      { merchant: "PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA", type: "tax", descriptionRaw: "PERCEPCION PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA", category: "Supermercado" },
      { merchant: "PANADERIA LA ESPIGA", category: "Regalos", categorySource: "manual" },
      { merchant: "KIOSCO EL SOL" },
    ]);

    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "PANADERIA LA", category: "Comida" });

    expect(res.status).toBe(201);
    const result = inboxRuleResultDtoSchema.parse(res.body);
    expect(result.categorized).toBe(3);
    expect(result.rule).toMatchObject({ priority: 100, matchType: "contains", pattern: "PANADERIA LA", category: "Comida", source: "user", enabled: true });
    expect(await CategoryRuleModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Comida", categorySource: "rule" })).toBe(3);
    expect(await TransactionModel.countDocuments({ category: "Supermercado" })).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Regalos", categorySource: "manual" })).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Sin categoría" })).toBe(1);
  });

  it("recorta patrón y categoría", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "  kiosco el  ", category: " Comida " });
    expect(res.status).toBe(201);
    expect(res.body.rule).toMatchObject({ pattern: "kiosco el", category: "Comida" });
    expect(res.body.categorized).toBe(1);
  });

  it("si la regla no coincide con ningún pendiente responde 201 con 0", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "FARMACIA", category: "Salud" });
    expect(res.status).toBe(201);
    expect(res.body.categorized).toBe(0);
    expect(await CategoryRuleModel.countDocuments()).toBe(1);
  });

  it("rechaza un patrón de menos de 3 caracteres sin crear la regla", async () => {
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: " ab ", category: "Comida" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("El patrón tiene que tener al menos 3 caracteres");
    expect(await CategoryRuleModel.countDocuments()).toBe(0);
  });

  it.each([[""], ["Sin categoría"], [undefined]])("rechaza la categoría «%s» sin crear la regla", async (category) => {
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "PANADERIA", category });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Elegí una categoría");
    expect(await CategoryRuleModel.countDocuments()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/routes/categoryRules.test.ts`
Expected: FAIL — `GET /inbox` responde 404 (no hay handler) y los POST a `/inbox/rules` también.

- [ ] **Step 3: Write minimal implementation**

`server/src/fx/latestUsdOficial.ts`:

```ts
import { MacroSeriesModel } from "../db/models.js";

export async function latestUsdOficial(): Promise<number | null> {
  const latest = await MacroSeriesModel.findOne({ serie: "usd_oficial" }).sort({ fecha: -1 }).lean();
  return latest?.valor ?? null;
}
```

En `server/src/http/routes/categoryRules.ts`, imports nuevos:

```ts
import { Router } from "express";
import type { Currency, InboxRuleResultDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { CategoryRuleModel, TransactionModel } from "../../db/models.js";
import { toCategoryRuleDTO } from "../mappers.js";
import { idsMatchingRule, matchRule, UNCATEGORIZED, type RuleInput } from "../../rules/categorize.js";
import { MIN_RULE_PATTERN_LENGTH } from "../../rules/suggestPattern.js";
import { buildUncategorizedInbox, type PendingPurchase } from "../../stats/uncategorizedInbox.js";
import { latestUsdOficial } from "../../fx/latestUsdOficial.js";
```

después de `export const categoryRulesRouter = Router();`:

```ts
const INBOX_RULE_PRIORITY = 100;

interface PendingRow {
  merchant: string;
  amount: number;
  currency: string;
  date: Date;
}

const toPendingPurchase = ({ merchant, amount, currency, date }: PendingRow): PendingPurchase => ({
  merchant,
  amount,
  currency: currency as Currency,
  date: date.toISOString().slice(0, 10),
});

const trimmedText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const categorizePending = async (ids: string[], category: string): Promise<number> => {
  if (ids.length === 0) return 0;
  const { modifiedCount } = await TransactionModel.updateMany(
    { _id: { $in: ids }, category: UNCATEGORIZED },
    { category, categorySource: "rule" },
  );
  return modifiedCount;
};
```

y al final del archivo:

```ts
categoryRulesRouter.get(
  "/inbox",
  asyncHandler(async (_req, res) => {
    const [pending, usdRate] = await Promise.all([
      TransactionModel.find({ category: UNCATEGORIZED, type: "purchase" })
        .select({ merchant: 1, amount: 1, currency: 1, date: 1 })
        .lean(),
      latestUsdOficial(),
    ]);
    res.json(buildUncategorizedInbox(pending.map(toPendingPurchase), usdRate));
  }),
);

categoryRulesRouter.post(
  "/inbox/rules",
  asyncHandler(async (req, res) => {
    const pattern = trimmedText(req.body?.pattern);
    const category = trimmedText(req.body?.category);
    if (pattern.length < MIN_RULE_PATTERN_LENGTH) {
      throw new HttpError(400, `El patrón tiene que tener al menos ${MIN_RULE_PATTERN_LENGTH} caracteres`);
    }
    if (category === "" || category === UNCATEGORIZED) throw new HttpError(400, "Elegí una categoría");

    const rule: RuleInput = { priority: INBOX_RULE_PRIORITY, matchType: "contains", pattern, category, enabled: true };
    const doc = await CategoryRuleModel.create({ ...rule, source: "user" });
    const candidates = await TransactionModel.find({ category: UNCATEGORIZED })
      .select({ descriptionRaw: 1, merchant: 1 })
      .lean();
    const ids = idsMatchingRule(
      candidates.map((tx) => ({ id: tx._id.toString(), descriptionRaw: tx.descriptionRaw, merchant: tx.merchant })),
      rule,
    );
    const result: InboxRuleResultDTO = { rule: toCategoryRuleDTO(doc), categorized: await categorizePending(ids, category) };
    res.status(201).json(result);
  }),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/routes/categoryRules.test.ts`
Expected: PASS (CRUD, `/apply` y los 9 nuevos).

- [ ] **Step 5: Commit**

```bash
git add server/src/fx/latestUsdOficial.ts server/src/http/routes/categoryRules.ts server/src/http/routes/categoryRules.test.ts
git commit -m "feat(server): rutas de la bandeja sin categoría (GET /inbox y POST /inbox/rules)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lógica pura de la bandeja en el cliente

**Files:**
- Create: `client/src/uncategorizedInbox.ts`
- Test: `client/src/uncategorizedInbox.test.ts`

**Interfaces:**
- Consumes: `UNCATEGORIZED` (`client/src/categoryOptions.ts`), `ALL_YEARS` (`client/src/filters/globalFilters.ts`), `transactionsLink` (`client/src/filters/transactionsLink.ts`), `formatMoney` (`client/src/format.ts`); tipos `InboxRuleResultDTO`, `UncategorizedGroupDTO`, `UncategorizedInboxDTO`.
- Produces: `MIN_RULE_PATTERN_LENGTH`, `INBOX_PREVIEW_SIZE`, `InboxOrder`, `InboxRuleDraft`, `PatternCheck`, `InboxFeedback`, `sortInboxGroups`, `checkPattern`, `inboxSummary`, `pendingLabel`, `groupTotalLabel`, `groupCaption`, `missingUsdRate`, `inboxTransactionsHref`, `inboxRuleFeedback` (firmas en el spec).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import type { InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  INBOX_PREVIEW_SIZE, MIN_RULE_PATTERN_LENGTH, checkPattern, groupCaption, groupTotalLabel, inboxRuleFeedback,
  inboxSummary, inboxTransactionsHref, missingUsdRate, pendingLabel, sortInboxGroups,
} from "./uncategorizedInbox.js";

const group = (overrides: Partial<UncategorizedGroupDTO>): UncategorizedGroupDTO => ({
  pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 1, totalArs: 0, totalUsd: 0, equivalentArs: 0,
  lastDate: "2026-09-01", ...overrides,
});

const panaderia = group({
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, equivalentArs: 21400,
  lastDate: "2026-09-28",
});
const panaderiaCentro = group({
  pattern: "PANADERIA CENTRO", merchants: ["PANADERIA CENTRO"], count: 1, totalArs: 21400, equivalentArs: 21400,
});
const kiosco = group({ count: 6, totalArs: 9000, equivalentArs: 9000 });
const steam = group({
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
});

const inboxOf = (usdRate: number | null, groups: UncategorizedGroupDTO[]): UncategorizedInboxDTO =>
  ({ pendingCount: groups.length, usdRate, groups });

const created = (categorized: number): InboxRuleResultDTO => ({
  rule: { id: "r1", priority: 100, matchType: "contains", pattern: "PANADERIA", category: "Comida", source: "user", enabled: true },
  categorized,
});

describe("constantes", () => {
  it("el patrón pide 3 caracteres y la bandeja muestra 8 comercios", () => {
    expect(MIN_RULE_PATTERN_LENGTH).toBe(3);
    expect(INBOX_PREVIEW_SIZE).toBe(8);
  });
});

describe("sortInboxGroups", () => {
  const groups = [kiosco, panaderiaCentro, steam, panaderia];

  it("por monto: equivalente en pesos, después cantidad", () => {
    expect(sortInboxGroups(groups, "amount").map((item) => item.pattern))
      .toEqual(["STEAMGAMES.COM", "PANADERIA LA ESPIGA", "PANADERIA CENTRO", "KIOSCO EL SOL"]);
  });

  it("por frecuencia: cantidad, después equivalente en pesos", () => {
    expect(sortInboxGroups(groups, "count").map((item) => item.pattern))
      .toEqual(["PANADERIA LA ESPIGA", "KIOSCO EL SOL", "STEAMGAMES.COM", "PANADERIA CENTRO"]);
  });

  it("con todo empatado ordena por patrón", () => {
    const beta = group({ pattern: "BETA", merchants: ["BETA"] });
    const alfa = group({ pattern: "ALFA", merchants: ["ALFA"] });
    expect(sortInboxGroups([beta, alfa], "amount").map((item) => item.pattern)).toEqual(["ALFA", "BETA"]);
    expect(sortInboxGroups([beta, alfa], "count").map((item) => item.pattern)).toEqual(["ALFA", "BETA"]);
  });

  it("no muta la lista recibida", () => {
    const original = [kiosco, steam];
    sortInboxGroups(original, "amount");
    expect(original).toEqual([kiosco, steam]);
  });
});

describe("checkPattern", () => {
  const groups = [panaderia, panaderiaCentro, kiosco, steam];

  it("pide al menos 3 caracteres", () => {
    expect(checkPattern(" PA ", panaderia, groups)).toEqual({ valid: false, hint: "Mínimo 3 caracteres" });
  });

  it("avisa si el patrón ya no coincide con el comercio", () => {
    expect(checkPattern("KIOSCO", panaderia, groups)).toEqual({ valid: false, hint: "No coincide con «PANADERIA LA ESPIGA»" });
  });

  it("avisa cuántos comercios más de la bandeja cubre", () => {
    expect(checkPattern("PANADERIA", panaderia, groups))
      .toEqual({ valid: true, hint: "También cubre 1 comercio más de la bandeja" });
    const norte = group({ pattern: "PANADERIA NORTE", merchants: ["PANADERIA NORTE"] });
    expect(checkPattern("PANADERIA", panaderia, [...groups, norte]))
      .toEqual({ valid: true, hint: "También cubre 2 comercios más de la bandeja" });
  });

  it("sin otros comercios cubiertos no hay aviso", () => {
    expect(checkPattern("PANADERIA LA ESPIGA", panaderia, groups)).toEqual({ valid: true, hint: null });
  });

  it("matchea contra cualquier variante del grupo", () => {
    expect(checkPattern("4259518112", steam, groups)).toEqual({ valid: true, hint: null });
  });

  it("acepta el patrón en minúsculas y con espacios alrededor", () => {
    expect(checkPattern("  panaderia la  ", panaderia, groups)).toEqual({ valid: true, hint: null });
  });
});

describe("inboxSummary y pendingLabel", () => {
  it("cuentan en plural y en singular", () => {
    expect(inboxSummary(23, 9)).toBe("23 movimientos en 9 comercios");
    expect(inboxSummary(1, 1)).toBe("1 movimiento en 1 comercio");
    expect(pendingLabel(8)).toBe("8 movimientos pendientes");
    expect(pendingLabel(1)).toBe("1 movimiento pendiente");
    expect(pendingLabel(0)).toBe("0 movimientos pendientes");
  });
});

describe("groupTotalLabel", () => {
  it("muestra los montos no nulos de cada moneda", () => {
    expect(groupTotalLabel(group({ totalArs: 9000 }))).toBe(formatMoney(9000, "ARS"));
    expect(groupTotalLabel(group({ totalUsd: 10 }))).toBe(formatMoney(10, "USD"));
    expect(groupTotalLabel(group({ totalArs: 9000, totalUsd: 10 }))).toBe(`${formatMoney(9000, "ARS")} · ${formatMoney(10, "USD")}`);
  });

  it("sin montos muestra cero pesos", () => {
    expect(groupTotalLabel(group({}))).toBe(formatMoney(0, "ARS"));
  });
});

describe("groupCaption", () => {
  it("cuenta los movimientos, la fecha del último y las variantes", () => {
    expect(groupCaption(panaderia)).toBe("6 movimientos · último 2026-09-28");
    expect(groupCaption(steam)).toBe("2 movimientos · último 2026-09-14 · 2 variantes");
    expect(groupCaption(group({}))).toBe("1 movimiento · último 2026-09-01");
  });
});

describe("missingUsdRate", () => {
  it("avisa solo si falta la cotización y hay montos en USD", () => {
    expect(missingUsdRate(inboxOf(null, [panaderia, steam]))).toBe(true);
    expect(missingUsdRate(inboxOf(null, [panaderia]))).toBe(false);
    expect(missingUsdRate(inboxOf(1415, [steam]))).toBe(false);
  });
});

describe("inboxTransactionsHref", () => {
  it("lleva a Movimientos de todos los años, sin categoría y con el patrón", () => {
    expect(inboxTransactionsHref("PANADERIA LA ESPIGA"))
      .toBe("/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
    expect(inboxTransactionsHref("UBER *TRIP")).toBe("/transactions?year=all&category=Sin+categor%C3%ADa&search=UBER+*TRIP");
  });
});

describe("inboxRuleFeedback", () => {
  it("cuenta lo categorizado en plural y en singular", () => {
    expect(inboxRuleFeedback(created(6)))
      .toEqual({ severity: "success", message: "Regla «PANADERIA» → Comida: 6 movimientos categorizados." });
    expect(inboxRuleFeedback(created(1)))
      .toEqual({ severity: "success", message: "Regla «PANADERIA» → Comida: 1 movimiento categorizado." });
  });

  it("avisa si la regla no categorizó nada", () => {
    expect(inboxRuleFeedback(created(0))).toEqual({
      severity: "info",
      message: "Regla «PANADERIA» → Comida creada, pero no coincidió con ningún movimiento pendiente.",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/uncategorizedInbox.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { UNCATEGORIZED } from "./categoryOptions.js";
import { ALL_YEARS } from "./filters/globalFilters.js";
import { transactionsLink } from "./filters/transactionsLink.js";
import { formatMoney } from "./format.js";

export const MIN_RULE_PATTERN_LENGTH = 3;
export const INBOX_PREVIEW_SIZE = 8;

export type InboxOrder = "amount" | "count";

export interface InboxRuleDraft {
  pattern: string;
  category: string;
}

export interface PatternCheck {
  valid: boolean;
  hint: string | null;
}

export interface InboxFeedback {
  severity: "success" | "info" | "error";
  message: string;
}

type GroupComparator = (a: UncategorizedGroupDTO, b: UncategorizedGroupDTO) => number;

const byAmount: GroupComparator = (a, b) =>
  b.equivalentArs - a.equivalentArs || b.count - a.count || a.pattern.localeCompare(b.pattern);

const byCount: GroupComparator = (a, b) =>
  b.count - a.count || b.equivalentArs - a.equivalentArs || a.pattern.localeCompare(b.pattern);

const COMPARATORS: Record<InboxOrder, GroupComparator> = { amount: byAmount, count: byCount };

const counted = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

const coversGroup = (needle: string, group: UncategorizedGroupDTO): boolean =>
  group.merchants.some((merchant) => merchant.toUpperCase().includes(needle));

export function sortInboxGroups(groups: UncategorizedGroupDTO[], order: InboxOrder): UncategorizedGroupDTO[] {
  return [...groups].sort(COMPARATORS[order]);
}

export function checkPattern(pattern: string, group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): PatternCheck {
  const needle = pattern.trim().toUpperCase();
  if (needle.length < MIN_RULE_PATTERN_LENGTH) return { valid: false, hint: `Mínimo ${MIN_RULE_PATTERN_LENGTH} caracteres` };
  if (!coversGroup(needle, group)) return { valid: false, hint: `No coincide con «${group.merchants[0]}»` };
  const others = groups.filter((other) => other.pattern !== group.pattern && coversGroup(needle, other)).length;
  if (others === 0) return { valid: true, hint: null };
  return { valid: true, hint: `También cubre ${counted(others, "comercio más", "comercios más")} de la bandeja` };
}

export function inboxSummary(pendingCount: number, groupCount: number): string {
  return `${counted(pendingCount, "movimiento", "movimientos")} en ${counted(groupCount, "comercio", "comercios")}`;
}

export function pendingLabel(pendingCount: number): string {
  return counted(pendingCount, "movimiento pendiente", "movimientos pendientes");
}

export function groupTotalLabel({ totalArs, totalUsd }: UncategorizedGroupDTO): string {
  const parts: string[] = [];
  if (totalArs !== 0) parts.push(formatMoney(totalArs, "ARS"));
  if (totalUsd !== 0) parts.push(formatMoney(totalUsd, "USD"));
  return parts.length === 0 ? formatMoney(0, "ARS") : parts.join(" · ");
}

export function groupCaption({ count, lastDate, merchants }: UncategorizedGroupDTO): string {
  const caption = `${counted(count, "movimiento", "movimientos")} · último ${lastDate}`;
  return merchants.length > 1 ? `${caption} · ${merchants.length} variantes` : caption;
}

export function missingUsdRate({ usdRate, groups }: UncategorizedInboxDTO): boolean {
  return usdRate === null && groups.some((group) => group.totalUsd > 0);
}

export function inboxTransactionsHref(pattern: string): string {
  return transactionsLink({ year: ALL_YEARS, category: UNCATEGORIZED, search: pattern });
}

export function inboxRuleFeedback({ rule, categorized }: InboxRuleResultDTO): InboxFeedback {
  const label = `Regla «${rule.pattern}» → ${rule.category}`;
  if (categorized === 0) {
    return { severity: "info", message: `${label} creada, pero no coincidió con ningún movimiento pendiente.` };
  }
  const outcome = counted(categorized, "movimiento categorizado", "movimientos categorizados");
  return { severity: "success", message: `${label}: ${outcome}.` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/uncategorizedInbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/uncategorizedInbox.ts client/src/uncategorizedInbox.test.ts
git commit -m "feat(client): lógica pura de la bandeja sin categoría" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bandeja en compu

**Files:**
- Create: `client/src/components/snackbarSx.ts`
- Modify: `client/src/components/RefreshDataButton.tsx`
- Modify: `client/src/components/RuleSheet.tsx` (`patternInputProps` pasa a `export const`)
- Create: `client/src/components/useInboxRuleDraft.ts`
- Create: `client/src/components/useInboxSection.ts`
- Create: `client/src/components/InboxTable.tsx`
- Create: `client/src/components/UncategorizedInbox.tsx`
- Test: `client/src/components/UncategorizedInbox.test.tsx`

**Interfaces:**
- Consumes: Task 5 completa; `useUncategorizedInbox`, `useCategories`, `useCreateInboxRule` (hooks de la base); `categoryOptions`; `compactCardContentSx`; `MOBILE_NAV_HEIGHT`.
- Produces:
  - `snackbarAboveNavSx: SxProps<Theme>`.
  - `patternInputProps` exportado desde `RuleSheet.tsx`.
  - `useInboxRuleDraft(group, groups): InboxRuleDraftState` (`pattern`, `changePattern`, `category`, `changeCategory`, `check`, `draft`).
  - `type CreateInboxRule = (draft: InboxRuleDraft, onCreated?: () => void) => void`, `interface InboxViewProps { groups; allGroups; categories; creating; onCreate: CreateInboxRule }`, `useInboxSection(rules): InboxSection`.
  - `InboxTable(props: InboxViewProps)`, `UncategorizedInbox({ rules }: { rules: CategoryRuleDTO[] })`.

- [ ] **Step 1: Write the failing test**

`client/src/components/UncategorizedInbox.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO, InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { UncategorizedInbox } from "./UncategorizedInbox.js";

const group = (overrides: Partial<UncategorizedGroupDTO>): UncategorizedGroupDTO => ({
  pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 6, totalArs: 9000, totalUsd: 0, equivalentArs: 9000,
  lastDate: "2026-09-20", ...overrides,
});

const kiosco = group({});
const panaderia = group({
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, equivalentArs: 21400,
  lastDate: "2026-09-28",
});
const steam = group({
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalArs: 0, totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
});
const manyGroups = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET"]
  .map((name, position) => group({
    pattern: `COMERCIO ${name}`, merchants: [`COMERCIO ${name}`], count: 1,
    totalArs: 1000 * (10 - position), equivalentArs: 1000 * (10 - position),
  }));

const inboxOf = (groups: UncategorizedGroupDTO[], usdRate: number | null = 1415): UncategorizedInboxDTO => ({
  pendingCount: groups.reduce((sum, item) => sum + item.count, 0), usdRate, groups,
});

const rules: CategoryRuleDTO[] = [
  { id: "r1", priority: 10, matchType: "contains", pattern: "IKEA", category: "Hogar", source: "user", enabled: true },
];

const created = (pattern: string, category: string, categorized: number): InboxRuleResultDTO => ({
  rule: { id: "r2", priority: 100, matchType: "contains", pattern, category, source: "user", enabled: true },
  categorized,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let currentInbox: UncategorizedInboxDTO;
let respondCreate: () => Promise<Response>;
const calls: { url: string; method?: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  currentInbox = inboxOf([panaderia, kiosco, steam]);
  respondCreate = async () => jsonResponse(created("PANADERIA LA ESPIGA", "Comida", 6), 201);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url === "/api/category-rules/inbox/rules") return respondCreate();
    if (url === "/api/category-rules/inbox") return jsonResponse(currentInbox);
    if (url === "/api/transactions/categories") return jsonResponse(["Comida", "Sin categoría", "Transporte"]);
    return jsonResponse({ error: `URL inesperada: ${url}` }, 500);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderInbox = () => renderWithProviders(<UncategorizedInbox rules={rules} />, { route: "/rules" });

const posts = () => calls.filter((call) => call.method === "POST").map(({ url, body }) => ({ url, body }));

const rowOf = (merchant: string): HTMLElement =>
  screen.getByRole("link", { name: `ver movimientos de ${merchant}` }).closest("tr") as HTMLElement;

const merchantsInOrder = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("aria-label")?.replace("ver movimientos de ", ""));

const chooseCategory = async (row: HTMLElement, category: string) => {
  await userEvent.click(within(row).getByRole("combobox", { name: "Categoría" }));
  await userEvent.click(await screen.findByRole("option", { name: category }));
};

describe("UncategorizedInbox en compu", () => {
  it("muestra cuántos movimientos quedan y en cuántos comercios", async () => {
    renderInbox();
    const section = await screen.findByRole("region", { name: "Sin categoría" });
    expect(within(section).getByLabelText("14 movimientos pendientes")).toHaveTextContent("14");
    expect(within(section).getByText("14 movimientos en 3 comercios")).toBeInTheDocument();
    expect(screen.queryByText(/sin cotización del dólar/i)).not.toBeInTheDocument();
  });

  it("ordena por monto por defecto y por frecuencia al cambiar", async () => {
    renderInbox();
    await screen.findByRole("table");
    expect(merchantsInOrder()).toEqual(["STEAMGAMES.COM 4259522985", "PANADERIA LA ESPIGA", "KIOSCO EL SOL"]);
    expect(screen.getByRole("button", { name: "Monto" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Frecuencia" }));
    expect(merchantsInOrder()).toEqual(["PANADERIA LA ESPIGA", "KIOSCO EL SOL", "STEAMGAMES.COM 4259522985"]);
  });

  it("precarga el patrón sugerido y no deja crear sin categoría", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    expect(within(row).getByRole("textbox", { name: "Patrón" })).toHaveValue("PANADERIA LA ESPIGA");
    expect(within(row).getByRole("button", { name: "Crear regla" })).toBeDisabled();
  });

  it("ofrece las categorías existentes, sin «Sin categoría» y con las de las reglas", async () => {
    renderInbox();
    await screen.findByRole("table");
    await userEvent.click(within(rowOf("PANADERIA LA ESPIGA")).getByRole("combobox", { name: "Categoría" }));
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent))
      .toEqual(["Comida", "Hogar", "Transporte"]));
  });

  it("crear manda el patrón y la categoría y muestra cuántos movimientos categorizó", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(posts()).toEqual([
      { url: "/api/category-rules/inbox/rules", body: { pattern: "PANADERIA LA ESPIGA", category: "Comida" } },
    ]));
    expect(await screen.findByText("Regla «PANADERIA LA ESPIGA» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
  });

  it("mientras se crea la regla ningún «Crear regla» se puede volver a tocar", async () => {
    let settle: (response: Response) => void = () => undefined;
    respondCreate = () => new Promise<Response>((resolve) => {
      settle = resolve;
    });
    renderInbox();
    await screen.findByRole("table");
    await chooseCategory(rowOf("KIOSCO EL SOL"), "Transporte");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Crear regla" })
      .every((button) => button.hasAttribute("disabled"))).toBe(true));
    settle(jsonResponse(created("PANADERIA LA ESPIGA", "Comida", 6), 201));
    await waitFor(() => expect(within(rowOf("KIOSCO EL SOL")).getByRole("button", { name: "Crear regla" })).toBeEnabled());
    expect(posts()).toHaveLength(1);
  });

  it("al categorizar el último comercio muestra la bandeja vacía y el resultado", async () => {
    currentInbox = inboxOf([kiosco]);
    respondCreate = async () => {
      currentInbox = inboxOf([]);
      return jsonResponse(created("KIOSCO EL SOL", "Comida", 6), 201);
    };
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("KIOSCO EL SOL");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    expect(await screen.findByText("No quedan movimientos sin categoría.")).toBeInTheDocument();
    expect(await screen.findByText("Regla «KIOSCO EL SOL» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
    expect(screen.getByLabelText("0 movimientos pendientes")).toBeInTheDocument();
  });

  it("un patrón que ya no coincide con el comercio no deja crear y lo explica", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    const pattern = within(row).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "KIOSCO");
    expect(within(row).getByText("No coincide con «PANADERIA LA ESPIGA»")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Crear regla" })).toBeDisabled();
  });

  it("las variantes del comercio se describen al pasar el mouse", async () => {
    renderInbox();
    await screen.findByRole("table");
    const name = within(rowOf("STEAMGAMES.COM 4259522985")).getByText("STEAMGAMES.COM 4259522985");
    await userEvent.hover(name);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("STEAMGAMES.COM 4259522985 · STEAMGAMES.COM 4259518112");
    expect(name).toHaveAccessibleDescription("STEAMGAMES.COM 4259522985 · STEAMGAMES.COM 4259518112");
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por «Sin categoría» y el comercio", async () => {
    renderInbox();
    const link = await screen.findByRole("link", { name: "ver movimientos de PANADERIA LA ESPIGA" });
    expect(link).toHaveAttribute("href", "/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
  });

  it("sin pendientes avisa que no queda nada y no muestra orden ni tabla", async () => {
    currentInbox = inboxOf([]);
    renderInbox();
    expect(await screen.findByText("No quedan movimientos sin categoría.")).toBeInTheDocument();
    expect(screen.getByLabelText("0 movimientos pendientes")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ordenar por" })).not.toBeInTheDocument();
  });

  it("muestra 8 comercios y deja ver todos", async () => {
    currentInbox = inboxOf(manyGroups);
    renderInbox();
    await screen.findByRole("table");
    expect(screen.getAllByRole("link")).toHaveLength(8);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar todos (10)" }));
    expect(screen.getAllByRole("link")).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("avisa cuando falta la cotización del dólar y hay montos en USD", async () => {
    currentInbox = inboxOf([steam, panaderia], null);
    renderInbox();
    expect(await screen.findByText("Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto."))
      .toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/UncategorizedInbox.test.tsx`
Expected: FAIL (no existe `./UncategorizedInbox.js`).

- [ ] **Step 3: Write minimal implementation**

`client/src/components/snackbarSx.ts`:

```ts
import type { SxProps, Theme } from "@mui/material/styles";
import { MOBILE_NAV_HEIGHT } from "./layout/MobileBottomNav.js";

export const snackbarAboveNavSx: SxProps<Theme> = {
  bottom: { xs: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`, md: 24 },
};
```

`client/src/components/RefreshDataButton.tsx`: borrar `const snackbarSx…`, el import de `SxProps`/`Theme` y el de `MOBILE_NAV_HEIGHT`; importar `import { snackbarAboveNavSx } from "./snackbarSx.js";` y usar `sx={snackbarAboveNavSx}` en el `Snackbar`.

`client/src/components/RuleSheet.tsx`: `const patternInputProps = …` → `export const patternInputProps = …` (mismo valor).

`client/src/components/useInboxRuleDraft.ts`:

```ts
import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { checkPattern, type InboxRuleDraft, type PatternCheck } from "../uncategorizedInbox.js";

export interface InboxRuleDraftState {
  pattern: string;
  changePattern: (event: ChangeEvent<HTMLInputElement>) => void;
  category: string | null;
  changeCategory: (category: string | null) => void;
  check: PatternCheck;
  draft: InboxRuleDraft | null;
}

export function useInboxRuleDraft(group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): InboxRuleDraftState {
  const [pattern, setPattern] = useState(group.pattern);
  const [category, setCategory] = useState<string | null>(null);
  const check = useMemo(() => checkPattern(pattern, group, groups), [pattern, group, groups]);
  const changePattern = useCallback((event: ChangeEvent<HTMLInputElement>) => setPattern(event.target.value), []);
  const draft = useMemo(
    () => (check.valid && category !== null ? { pattern: pattern.trim(), category } : null),
    [check.valid, category, pattern],
  );
  return { pattern, changePattern, category, changeCategory: setCategory, check, draft };
}
```

`client/src/components/useInboxSection.ts`:

```ts
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import type { CategoryRuleDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { useCategories, useCreateInboxRule, useUncategorizedInbox } from "../api/hooks.js";
import { categoryOptions } from "../categoryOptions.js";
import {
  INBOX_PREVIEW_SIZE, inboxRuleFeedback, sortInboxGroups, type InboxFeedback, type InboxOrder, type InboxRuleDraft,
} from "../uncategorizedInbox.js";

export type CreateInboxRule = (draft: InboxRuleDraft, onCreated?: () => void) => void;

export interface InboxViewProps {
  groups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onCreate: CreateInboxRule;
}

export interface InboxSection {
  inbox: UncategorizedInboxDTO | undefined;
  isLoading: boolean;
  error: Error | null;
  order: InboxOrder;
  changeOrder: (event: MouseEvent<HTMLElement>, order: InboxOrder | null) => void;
  showAll: boolean;
  toggleShowAll: () => void;
  visibleGroups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  createRule: CreateInboxRule;
  feedback: InboxFeedback | null;
  dismissFeedback: () => void;
}

const NO_GROUPS: UncategorizedGroupDTO[] = [];
const NO_CATEGORIES: string[] = [];

export function useInboxSection(rules: CategoryRuleDTO[]): InboxSection {
  const { data: inbox, isLoading, error } = useUncategorizedInbox();
  const { data: categoryNames = NO_CATEGORIES } = useCategories();
  const { mutate, isPending: creating } = useCreateInboxRule();
  const [order, setOrder] = useState<InboxOrder>("amount");
  const [showAll, setShowAll] = useState(false);
  const [feedback, setFeedback] = useState<InboxFeedback | null>(null);

  const groups = inbox?.groups ?? NO_GROUPS;
  const allGroups = useMemo(() => sortInboxGroups(groups, order), [groups, order]);
  const visibleGroups = useMemo(
    () => (showAll ? allGroups : allGroups.slice(0, INBOX_PREVIEW_SIZE)),
    [allGroups, showAll],
  );
  const categories = useMemo(() => categoryOptions(categoryNames, rules), [categoryNames, rules]);

  const changeOrder = useCallback((_event: MouseEvent<HTMLElement>, next: InboxOrder | null) => {
    if (next !== null) setOrder(next);
  }, []);
  const toggleShowAll = useCallback(() => setShowAll((current) => !current), []);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  const createRule = useCallback<CreateInboxRule>((draft, onCreated) => {
    mutate(draft, {
      onSuccess: (result) => {
        setFeedback(inboxRuleFeedback(result));
        onCreated?.();
      },
      onError: (mutationError) => setFeedback({ severity: "error", message: mutationError.message }),
    });
  }, [mutate]);

  return {
    inbox, isLoading, error, order, changeOrder, showAll, toggleShowAll, visibleGroups, allGroups, categories,
    creating, createRule, feedback, dismissFeedback,
  };
}
```

`client/src/components/InboxTable.tsx`:

```tsx
import type { SyntheticEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Autocomplete, Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
  type AutocompleteRenderInputParams,
} from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupCaption, groupTotalLabel, inboxTransactionsHref } from "../uncategorizedInbox.js";
import { patternInputProps } from "./RuleSheet.js";
import type { CreateInboxRule, InboxViewProps } from "./useInboxSection.js";
import { useInboxRuleDraft } from "./useInboxRuleDraft.js";

interface InboxGroupRowProps {
  group: UncategorizedGroupDTO;
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onCreate: CreateInboxRule;
}

const patternHtmlInput = { ...patternInputProps, "aria-label": "Patrón" };

const renderCategoryInput = (params: AutocompleteRenderInputParams) => <TextField {...params} label="Categoría" />;

const InboxGroupRow = ({ group, allGroups, categories, creating, onCreate }: InboxGroupRowProps) => {
  const { pattern, changePattern, category, changeCategory, check, draft } = useInboxRuleDraft(group, allGroups);
  const merchant = group.merchants[0];
  const selectCategory = (_event: SyntheticEvent, value: string | null) => changeCategory(value);
  const create = () => {
    if (draft) onCreate(draft);
  };
  const merchantName = <Typography variant="body2" sx={{ fontWeight: 600 }}>{merchant}</Typography>;
  const merchantLabel = group.merchants.length > 1
    ? <Tooltip describeChild title={group.merchants.join(" · ")}>{merchantName}</Tooltip>
    : merchantName;

  return (
    <TableRow>
      <TableCell>
        {merchantLabel}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{groupCaption(group)}</Typography>
      </TableCell>
      <TableCell align="right">{group.count}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{groupTotalLabel(group)}</TableCell>
      <TableCell>
        <TextField
          size="small"
          value={pattern}
          onChange={changePattern}
          error={!check.valid}
          helperText={check.hint}
          slotProps={{ htmlInput: patternHtmlInput }}
        />
      </TableCell>
      <TableCell>
        <Autocomplete
          size="small"
          options={categories}
          value={category}
          onChange={selectCategory}
          noOptionsText="No hay categorías"
          renderInput={renderCategoryInput}
          sx={{ width: 200 }}
        />
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Button variant="contained" size="small" disabled={!draft || creating} onClick={create}>Crear regla</Button>
        <IconButton
          component={RouterLink}
          to={inboxTransactionsHref(group.pattern)}
          size="small"
          aria-label={`ver movimientos de ${merchant}`}
          sx={{ ml: 1 }}
        >
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

export const InboxTable = ({ groups, allGroups, categories, creating, onCreate }: InboxViewProps) => {
  const rows = groups.map((group) => (
    <InboxGroupRow
      key={group.pattern}
      group={group}
      allGroups={allGroups}
      categories={categories}
      creating={creating}
      onCreate={onCreate}
    />
  ));

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Comercio</TableCell>
            <TableCell align="right">Movs.</TableCell>
            <TableCell>Total</TableCell>
            <TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </Table>
    </Box>
  );
};
```

`client/src/components/UncategorizedInbox.tsx`:

```tsx
import { useId } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Snackbar, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { INBOX_PREVIEW_SIZE, inboxSummary, missingUsdRate, pendingLabel, type InboxOrder } from "../uncategorizedInbox.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { InboxTable } from "./InboxTable.js";
import { snackbarAboveNavSx } from "./snackbarSx.js";
import { useInboxSection } from "./useInboxSection.js";

interface UncategorizedInboxProps {
  rules: CategoryRuleDTO[];
}

interface OrderOption {
  value: InboxOrder;
  label: string;
}

const ORDER_OPTIONS: OrderOption[] = [
  { value: "amount", label: "Monto" },
  { value: "count", label: "Frecuencia" },
];

const SNACKBAR_ANCHOR = { vertical: "bottom", horizontal: "center" } as const;

const headerSx: SxProps<Theme> = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 };

export const UncategorizedInbox = ({ rules }: UncategorizedInboxProps) => {
  const titleId = useId();
  const {
    inbox, isLoading, error, order, changeOrder, showAll, toggleShowAll, visibleGroups, allGroups, categories,
    creating, createRule, feedback, dismissFeedback,
  } = useInboxSection(rules);

  if (isLoading) return <CircularProgress size={24} sx={{ mb: 3 }} />;
  if (error) return <Alert severity="error" sx={{ mb: 3 }}>{error.message}</Alert>;
  if (!inbox) return null;

  const { pendingCount } = inbox;
  const isEmpty = allGroups.length === 0;
  const hasMore = allGroups.length > INBOX_PREVIEW_SIZE;
  const showAllLabel = showAll ? "Mostrar menos" : `Mostrar todos (${allGroups.length})`;
  const orderButtons = ORDER_OPTIONS.map((option) => (
    <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
  ));
  const summary = !isEmpty && (
    <Typography variant="body2" color="text.secondary">{inboxSummary(pendingCount, allGroups.length)}</Typography>
  );
  const orderPicker = !isEmpty && (
    <ToggleButtonGroup exclusive size="small" value={order} onChange={changeOrder} aria-label="Ordenar por" sx={{ ml: "auto" }}>
      {orderButtons}
    </ToggleButtonGroup>
  );
  const usdWarning = missingUsdRate(inbox) && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto.
    </Typography>
  );
  const content = isEmpty ? (
    <Typography color="text.secondary">No quedan movimientos sin categoría.</Typography>
  ) : (
    <>
      <InboxTable groups={visibleGroups} allGroups={allGroups} categories={categories} creating={creating} onCreate={createRule} />
      {hasMore && <Button size="small" onClick={toggleShowAll} sx={{ mt: 1 }}>{showAllLabel}</Button>}
      {usdWarning}
    </>
  );

  return (
    <>
      <Card component="section" aria-labelledby={titleId} sx={{ mb: 3 }}>
        <CardContent sx={compactCardContentSx}>
          <Box sx={headerSx}>
            <Typography id={titleId} variant="h6">Sin categoría</Typography>
            <Chip
              size="small"
              label={pendingCount}
              color={pendingCount > 0 ? "warning" : "success"}
              aria-label={pendingLabel(pendingCount)}
            />
            {summary}
            {orderPicker}
          </Box>
          {content}
        </CardContent>
      </Card>
      <Snackbar
        open={feedback !== null}
        autoHideDuration={6000}
        onClose={dismissFeedback}
        sx={snackbarAboveNavSx}
        anchorOrigin={SNACKBAR_ANCHOR}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismissFeedback}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/UncategorizedInbox.test.tsx client/src/components/RefreshDataButton.test.tsx client/src/components/RuleSheet.test.tsx`
Expected: PASS (los de `RefreshDataButton` y `RuleSheet` siguen verdes: el refactor no cambia nada visible).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/snackbarSx.ts client/src/components/RefreshDataButton.tsx client/src/components/RuleSheet.tsx \
  client/src/components/useInboxRuleDraft.ts client/src/components/useInboxSection.ts client/src/components/InboxTable.tsx \
  client/src/components/UncategorizedInbox.tsx client/src/components/UncategorizedInbox.test.tsx
git commit -m "feat(client): bandeja de movimientos sin categoría en compu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bandeja en mobile

**Files:**
- Create: `client/src/components/InboxRuleSheet.tsx`
- Create: `client/src/components/InboxList.tsx`
- Modify: `client/src/components/UncategorizedInbox.tsx`
- Test: `client/src/components/InboxRuleSheet.test.tsx`
- Test: `client/src/components/UncategorizedInbox.test.tsx` (nuevo `describe` mobile)

**Interfaces:**
- Consumes: `useInboxRuleDraft`, `InboxViewProps`, `CreateInboxRule` (Task 6); `BottomSheet`, `RecordFields`, `useSheetTarget`, `tapTargetSx`, `MIN_TAP_SIZE`, `patternInputProps`, `useIsMobile`.
- Produces: `InboxRuleSheet({ open, group, groups, categories, creating, onClose, onCreate })` con `group: UncategorizedGroupDTO | null`; `InboxList(props: InboxViewProps)`.

- [ ] **Step 1: Write the failing tests**

`client/src/components/InboxRuleSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { InboxRuleSheet } from "./InboxRuleSheet.js";

afterEach(cleanup);

const panaderia: UncategorizedGroupDTO = {
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, totalUsd: 0,
  equivalentArs: 21400, lastDate: "2026-09-28",
};
const steam: UncategorizedGroupDTO = {
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalArs: 0, totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
};

interface SetupOptions {
  group?: UncategorizedGroupDTO;
  categories?: string[];
}

const setup = ({ group = panaderia, categories = ["Comida", "Transporte"] }: SetupOptions = {}) => {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <InboxRuleSheet open group={group} groups={[panaderia, steam]} categories={categories} creating={false} onClose={onClose} onCreate={onCreate} />,
  );
  const sheet = screen.getByRole("dialog", { name: group.merchants[0] });
  return { onCreate, onClose, sheet };
};

describe("InboxRuleSheet", () => {
  it("muestra movimientos, total, último y las variantes", () => {
    const { sheet } = setup({ group: steam });
    expect(within(sheet).getByText("Movimientos")).toBeInTheDocument();
    expect(within(sheet).getByText("2026-09-14")).toBeInTheDocument();
    expect(within(sheet).getByText("STEAMGAMES.COM 4259522985 · STEAMGAMES.COM 4259518112")).toBeInTheDocument();
  });

  it("precarga el patrón sugerido sin autocapitalizar ni corregir", () => {
    const { sheet } = setup();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    expect(pattern).toHaveValue("PANADERIA LA ESPIGA");
    expect(pattern).toHaveAttribute("autocapitalize", "none");
    expect(pattern).toHaveAttribute("autocorrect", "off");
    expect(pattern).toHaveAttribute("spellcheck", "false");
  });

  it("los botones de categoría marcan la elegida", async () => {
    const { sheet } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    expect(within(sheet).getByRole("button", { name: "Comida" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Transporte" })).toHaveAttribute("aria-pressed", "false");
  });

  it("«Crear regla» se habilita solo con categoría y patrón válido", async () => {
    const { sheet } = setup();
    const create = within(sheet).getByRole("button", { name: "Crear regla" });
    expect(create).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    expect(create).toBeEnabled();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "PA");
    expect(within(sheet).getByText("Mínimo 3 caracteres")).toBeInTheDocument();
    expect(create).toBeDisabled();
  });

  it("crea con el patrón recortado y le pasa onClose para cerrar al terminar", async () => {
    const { sheet, onCreate, onClose } = setup();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "  panaderia  ");
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    expect(onCreate).toHaveBeenCalledWith({ pattern: "panaderia", category: "Comida" }, onClose);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por el comercio", () => {
    const { sheet } = setup();
    expect(within(sheet).getByRole("link", { name: "Ver movimientos" }))
      .toHaveAttribute("href", "/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
  });

  it("sin categorías avisa cómo crear una", () => {
    const { sheet } = setup({ categories: [] });
    expect(within(sheet).getByText("Todavía no hay categorías. Creá una desde «Nueva regla».")).toBeInTheDocument();
  });
});
```

En `client/src/components/UncategorizedInbox.test.tsx`, sumar a los imports:

```tsx
import { cssFor } from "../testing/cssFor.js";
import { emulateMobile } from "../testing/viewport.js";
```

y agregar al final:

```tsx
describe("UncategorizedInbox en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra los comercios como lista, sin tabla", async () => {
    renderInbox();
    expect(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("tocar un comercio abre su hoja; elegir categoría y crear manda el POST y la cierra", async () => {
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ }));
    const sheet = screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(posts()).toEqual([
      { url: "/api/category-rules/inbox/rules", body: { pattern: "PANADERIA LA ESPIGA", category: "Comida" } },
    ]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "PANADERIA LA ESPIGA" })).not.toBeInTheDocument());
    expect(await screen.findByText("Regla «PANADERIA LA ESPIGA» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
  });

  it("si el server rechaza la regla la hoja queda abierta y muestra el error", async () => {
    respondCreate = async () => jsonResponse({ error: "Elegí una categoría" }, 400);
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ }));
    const sheet = screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    expect(await screen.findByText("Elegí una categoría")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" })).toBeInTheDocument();
  });

  it("los toggles de orden, «Mostrar todos» y los botones de la hoja miden 44px", async () => {
    currentInbox = inboxOf(manyGroups);
    renderInbox();
    expect(cssFor(await screen.findByRole("button", { name: "Mostrar todos (10)" }))).toContain("min-height:44px");
    expect(cssFor(screen.getByRole("button", { name: "Monto" }))).toContain("min-height:44px");
    expect(cssFor(screen.getByRole("button", { name: "Frecuencia" }))).toContain("min-height:44px");
    await userEvent.click(screen.getByRole("button", { name: /COMERCIO ALFA/ }));
    const sheet = screen.getByRole("dialog", { name: "COMERCIO ALFA" });
    expect(cssFor(await within(sheet).findByRole("button", { name: "Comida" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("button", { name: "Crear regla" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("link", { name: "Ver movimientos" }))).toContain("min-height:44px");
  });

  it("un comercio largo va en una sola línea", async () => {
    const longName = "COMERCIO CON UN NOMBRE MUY MUY LARGO QUE NO ENTRA EN EL CELULAR";
    currentInbox = inboxOf([group({ pattern: "COMERCIO CON UN", merchants: [longName] })]);
    renderInbox();
    expect(await screen.findByText(longName)).toHaveClass("MuiTypography-noWrap");
  });

  it("el aviso queda arriba de la barra inferior", async () => {
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /KIOSCO EL SOL/ }));
    const sheet = screen.getByRole("dialog", { name: "KIOSCO EL SOL" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(document.querySelector(".MuiSnackbar-root")).toBeInTheDocument());
    const css = cssFor(document.querySelector(".MuiSnackbar-root")!);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("64px");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/InboxRuleSheet.test.tsx client/src/components/UncategorizedInbox.test.tsx`
Expected: FAIL — no existe `./InboxRuleSheet.js`, y en mobile la bandeja todavía renderiza la tabla.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/InboxRuleSheet.tsx`:

```tsx
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupTotalLabel, inboxTransactionsHref } from "../uncategorizedInbox.js";
import { BottomSheet } from "./BottomSheet.js";
import { RecordFields, type RecordField } from "./RecordCard.js";
import { patternInputProps } from "./RuleSheet.js";
import { tapTargetSx } from "./tapTarget.js";
import type { CreateInboxRule } from "./useInboxSection.js";
import { useInboxRuleDraft } from "./useInboxRuleDraft.js";

interface InboxRuleSheetProps {
  open: boolean;
  group: UncategorizedGroupDTO | null;
  groups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onClose: () => void;
  onCreate: CreateInboxRule;
}

interface InboxRuleFormProps {
  group: UncategorizedGroupDTO;
  groups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onClose: () => void;
  onCreate: CreateInboxRule;
}

const categoryGridSx: SxProps<Theme> = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 };

const groupFields = (group: UncategorizedGroupDTO): RecordField[] => {
  const fields: RecordField[] = [
    { label: "Movimientos", value: group.count },
    { label: "Total", value: groupTotalLabel(group) },
    { label: "Último", value: group.lastDate },
  ];
  if (group.merchants.length > 1) fields.push({ label: "Variantes", value: group.merchants.join(" · ") });
  return fields;
};

const InboxRuleForm = ({ group, groups, categories, creating, onClose, onCreate }: InboxRuleFormProps) => {
  const { pattern, changePattern, category, changeCategory, check, draft } = useInboxRuleDraft(group, groups);
  const create = () => {
    if (draft) onCreate(draft, onClose);
  };
  const categoryButtons = categories.map((name) => {
    const selected = name === category;
    return (
      <Button
        key={name}
        variant={selected ? "contained" : "outlined"}
        aria-pressed={selected}
        onClick={() => changeCategory(name)}
        sx={tapTargetSx}
      >
        {name}
      </Button>
    );
  });
  const categoryPicker = categories.length > 0 ? (
    <Box sx={categoryGridSx}>{categoryButtons}</Box>
  ) : (
    <Typography variant="body2" color="text.secondary">Todavía no hay categorías. Creá una desde «Nueva regla».</Typography>
  );

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <RecordFields fields={groupFields(group)} />
      <TextField
        label="Patrón"
        value={pattern}
        onChange={changePattern}
        error={!check.valid}
        helperText={check.hint}
        fullWidth
        slotProps={{ htmlInput: patternInputProps }}
      />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Categoría</Typography>
        {categoryPicker}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button fullWidth component={RouterLink} to={inboxTransactionsHref(group.pattern)} sx={tapTargetSx}>
          Ver movimientos
        </Button>
        <Button fullWidth variant="contained" disabled={!draft || creating} onClick={create} sx={tapTargetSx}>
          Crear regla
        </Button>
      </Box>
    </Box>
  );
};

export const InboxRuleSheet = ({ open, group, groups, categories, creating, onClose, onCreate }: InboxRuleSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={group?.merchants[0] ?? "Comercio"}>
    {group && (
      <InboxRuleForm
        key={group.pattern}
        group={group}
        groups={groups}
        categories={categories}
        creating={creating}
        onClose={onClose}
        onCreate={onCreate}
      />
    )}
  </BottomSheet>
);
```

`client/src/components/InboxList.tsx`:

```tsx
import { Box, List, ListItem, ListItemButton, Typography } from "@mui/material";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupCaption, groupTotalLabel } from "../uncategorizedInbox.js";
import { InboxRuleSheet } from "./InboxRuleSheet.js";
import type { InboxViewProps } from "./useInboxSection.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface InboxListItemProps {
  group: UncategorizedGroupDTO;
  onOpen: (group: UncategorizedGroupDTO) => void;
}

const InboxListItem = ({ group, onOpen }: InboxListItemProps) => {
  const open = () => onOpen(group);
  return (
    <ListItem disablePadding divider>
      <ListItemButton onClick={open} sx={{ minHeight: 56, px: 1, py: 1.25 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{group.merchants[0]}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{groupTotalLabel(group)}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {groupCaption(group)}
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  );
};

export const InboxList = ({ groups, allGroups, categories, creating, onCreate }: InboxViewProps) => {
  const { target, open, show, close } = useSheetTarget<UncategorizedGroupDTO>();
  const items = groups.map((group) => <InboxListItem key={group.pattern} group={group} onOpen={show} />);

  return (
    <>
      <List disablePadding>{items}</List>
      <InboxRuleSheet
        open={open}
        group={target}
        groups={allGroups}
        categories={categories}
        creating={creating}
        onClose={close}
        onCreate={onCreate}
      />
    </>
  );
};
```

En `client/src/components/UncategorizedInbox.tsx`:

- imports nuevos: `import { useIsMobile } from "../useIsMobile.js";`, `import { InboxList } from "./InboxList.js";`, `import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";`.
- constantes nuevas al lado de `headerSx`:

  ```tsx
  const orderDesktopSx: SxProps<Theme> = { ml: "auto" };
  const showAllSx: SxProps<Theme> = { mt: 1 };
  const showAllMobileSx: SxProps<Theme> = { mt: 1, minHeight: MIN_TAP_SIZE };
  ```

- primera línea del componente: `const isMobile = useIsMobile();` (antes de `useId` y de cualquier `return`).
- después de los early returns, reemplazar `orderButtons`, `orderPicker` y `content` por:

  ```tsx
  const InboxView = isMobile ? InboxList : InboxTable;
  const orderButtons = ORDER_OPTIONS.map((option) => (
    <ToggleButton key={option.value} value={option.value} sx={isMobile ? tapTargetSx : undefined}>{option.label}</ToggleButton>
  ));
  const orderPicker = !isEmpty && (
    <ToggleButtonGroup
      exclusive
      size="small"
      fullWidth={isMobile}
      value={order}
      onChange={changeOrder}
      aria-label="Ordenar por"
      sx={isMobile ? undefined : orderDesktopSx}
    >
      {orderButtons}
    </ToggleButtonGroup>
  );
  const showAllButton = hasMore && (
    <Button size="small" fullWidth={isMobile} onClick={toggleShowAll} sx={isMobile ? showAllMobileSx : showAllSx}>
      {showAllLabel}
    </Button>
  );
  const content = isEmpty ? (
    <Typography color="text.secondary">No quedan movimientos sin categoría.</Typography>
  ) : (
    <>
      <InboxView groups={visibleGroups} allGroups={allGroups} categories={categories} creating={creating} onCreate={createRule} />
      {showAllButton}
      {usdWarning}
    </>
  );
  ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/InboxRuleSheet.test.tsx client/src/components/UncategorizedInbox.test.tsx`
Expected: PASS (compu y mobile).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/InboxRuleSheet.tsx client/src/components/InboxRuleSheet.test.tsx client/src/components/InboxList.tsx \
  client/src/components/UncategorizedInbox.tsx client/src/components/UncategorizedInbox.test.tsx
git commit -m "feat(client): bandeja sin categoría en mobile con lista y hoja inferior" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: La bandeja arriba de las reglas

**Files:**
- Modify: `client/src/pages/RulesPage.tsx`
- Test: `client/src/pages/RulesPage.test.tsx`

**Interfaces:**
- Consumes: `UncategorizedInbox({ rules })` (Tasks 6–7).
- Produces: página Reglas con título → aviso de «Reaplicar» → bandeja → «Reglas» (`h6`) → lista de reglas.

- [ ] **Step 1: Write the failing test**

En `client/src/pages/RulesPage.test.tsx`, debajo de `const rule = …`:

```tsx
const inbox = {
  pendingCount: 2, usdRate: 1415,
  groups: [{ pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 2, totalArs: 3000, totalUsd: 0, equivalentArs: 3000, lastDate: "2026-09-20" }],
};

const readResponse = (url: string): unknown => {
  if (url.includes("/category-rules/inbox")) return inbox;
  if (url.includes("/transactions/categories")) return ["Comida", "Transporte"];
  if (url.includes("/category-rules")) return [rule];
  return {};
};
```

y en el `beforeEach` reemplazar las dos líneas de `isRead`/`return` por:

```tsx
    const isRead = !init || !init.method || init.method === "GET";
    return new Response(JSON.stringify(isRead ? readResponse(url) : {}), { status: 200, headers: { "Content-Type": "application/json" } });
```

Agregar al `describe("RulesPage")`:

```tsx
  it("muestra la bandeja «Sin categoría» antes de la lista de reglas", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    const section = await screen.findByRole("region", { name: "Sin categoría" });
    expect(await within(section).findByText("KIOSCO EL SOL")).toBeInTheDocument();
    const rulesHeading = screen.getByRole("heading", { name: "Reglas" });
    expect(section.compareDocumentPosition(rulesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

y al `describe("RulesPage en mobile")`:

```tsx
  it("la bandeja es una lista que abre una hoja, sin tabla", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: /KIOSCO EL SOL/ }));
    expect(screen.getByRole("dialog", { name: "KIOSCO EL SOL" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pages/RulesPage.test.tsx`
Expected: FAIL en los dos tests nuevos (no hay región «Sin categoría»); los demás siguen verdes con el mock nuevo.

- [ ] **Step 3: Write minimal implementation**

En `client/src/pages/RulesPage.tsx`, importar `import { UncategorizedInbox } from "../components/UncategorizedInbox.js";` y en el `return`, entre el aviso de «Reaplicar» y `{rulesView}`:

```tsx
      <UncategorizedInbox rules={rules} />

      <Typography variant="h6" sx={{ mb: 2 }}>Reglas</Typography>

```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/pages/RulesPage.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/RulesPage.tsx client/src/pages/RulesPage.test.tsx
git commit -m "feat(client): bandeja sin categoría arriba de las reglas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos verdes (la base daba 891 passed | 16 skipped).

- [ ] **Step 2: Tipos**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: `vite build` termina sin errores (el aviso de tamaño de chunk, si aparece, ya estaba en la base).

- [ ] **Step 4: Alcance**

Run: `git diff --stat feat/base-nuevas-features...HEAD`
Expected: solo los archivos listados en el spec (sección "Archivos") más el spec y este plan; nada de `shared/`, `hooks.ts`, `categoryOptions.ts`, `app.ts`, `models.ts`, `package.json` ni `examples/`.
