# Editar reglas + reaplicar a todas (incluso manuales) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Poder editar reglas de categoría (prioridad/tipo/patrón/categoría) desde la UI, y que "Reaplicar a todo" recategorice TODAS las transacciones — pisando las manuales cuando una regla matchea, preservándolas cuando ninguna matchea.

**Architecture:** Server: extraer `matchRule` (primera regla que matchea → categoría o `null`, resiliente a regex inválido) y aplicar la nueva política en `/apply`. Client: edición inline por fila (`CategoryRuleRow`) reusando `PATCH /category-rules/:id` (ya existe).

**Tech Stack:** TS/ESM, Express + Mongoose, React 18 + MUI v6, Vitest + supertest + mongodb-memory-server + RTL.

## Global Constraints
- ESM `.js` imports; tipos desde `@ledgerly/shared`; sin `any`.
- Componentes `export const` arrow; MUI `sx`; sin comentarios en código.
- Test: `bunx vitest run <path>`; `bun run typecheck`; `bun run test`.
- Commits locales por tarea; co-author trailer.

---

### Task 1: Server — `matchRule` + política de `/apply`

**Files:**
- Modify: `server/src/rules/categorize.ts`
- Test: `server/src/rules/categorize.test.ts`
- Modify: `server/src/http/routes/categoryRules.ts`
- Test: `server/src/http/routes/categoryRules.test.ts`

**Interfaces:**
- Produces: `matchRule(descriptionRaw, merchant, rules): string | null`. `categorize` sin cambios de salida.

- [ ] **Step 1: Failing tests** — en `categorize.test.ts` agregar:

```ts
import { matchRule } from "./categorize.js";

describe("matchRule", () => {
  it("devuelve la categoría de la primera regla que matchea (por prioridad)", () => {
    expect(matchRule("NETFLIX.COM 1", "NETFLIX.COM", rules)).toBe("Suscripciones");
  });
  it("devuelve null si ninguna matchea", () => {
    expect(matchRule("PANADERIA LA REAL", "PANADERIA", rules)).toBeNull();
  });
  it("un regex inválido no rompe (esa regla no matchea)", () => {
    const bad: RuleInput[] = [{ priority: 1, matchType: "regex", pattern: "(", category: "X", enabled: true }];
    expect(matchRule("HOLA", "HOLA", bad)).toBeNull();
  });
});
```

En `categoryRules.test.ts`, **reemplazar** el test "recategoriza respetando overrides manuales" por la nueva política:

```ts
describe("POST /api/category-rules/apply", () => {
  const seedTx = async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    const base = { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(), amount: 100,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
      installmentCurrent: null, installmentTotal: null } as const;
    await TransactionModel.insertMany([
      { ...base, descriptionRaw: "UBER TRIP", merchant: "UBER TRIP", category: "Sin categoría", categorySource: "rule", comprobante: "1", fingerprint: "f1" },
      { ...base, descriptionRaw: "UBER EATS", merchant: "UBER EATS", category: "Comida", categorySource: "manual", comprobante: "2", fingerprint: "f2" },
      { ...base, descriptionRaw: "REGALO RARO", merchant: "REGALO RARO", category: "Regalos", categorySource: "manual", comprobante: "3", fingerprint: "f3" },
      { ...base, descriptionRaw: "COMERCIO XYZ", merchant: "COMERCIO XYZ", category: "Compras", categorySource: "rule", comprobante: "4", fingerprint: "f4" },
    ]);
  };

  it("pisa las manuales cuando una regla matchea y preserva las manuales sin match", async () => {
    await seedTx();
    await request(app).post("/api/category-rules")
      .send({ priority: 1, matchType: "contains", pattern: "UBER", category: "Transporte" });

    const res = await request(app).post("/api/category-rules/apply");
    expect((await TransactionModel.findOne({ comprobante: "1" }))?.category).toBe("Transporte");
    expect((await TransactionModel.findOne({ comprobante: "2" }))?.category).toBe("Transporte");
    const uberEats = await TransactionModel.findOne({ comprobante: "2" });
    expect(uberEats?.categorySource).toBe("rule");
    expect((await TransactionModel.findOne({ comprobante: "3" }))?.category).toBe("Regalos");
    expect((await TransactionModel.findOne({ comprobante: "4" }))?.category).toBe("Sin categoría");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run server/src/rules/categorize.test.ts server/src/http/routes/categoryRules.test.ts`
Expected: FAIL (`matchRule` no existe; apply preserva manual en vez de pisar).

- [ ] **Step 3: Implement `matchRule` + `categorize`** — en `server/src/rules/categorize.ts` reemplazar la función `categorize` por:

```ts
export function matchRule(descriptionRaw: string, merchant: string, rules: RuleInput[]): string | null {
  const haystack = `${descriptionRaw} ${merchant}`.toUpperCase();
  const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    let matched = false;
    if (rule.matchType === "contains") {
      matched = haystack.includes(rule.pattern.toUpperCase());
    } else {
      try { matched = new RegExp(rule.pattern, "i").test(haystack); } catch { matched = false; }
    }
    if (matched) return rule.category;
  }
  return null;
}

export function categorize(
  descriptionRaw: string,
  merchant: string,
  rules: RuleInput[],
): { category: string; source: "rule" } {
  return { category: matchRule(descriptionRaw, merchant, rules) ?? "Sin categoría", source: "rule" };
}
```

- [ ] **Step 4: Implement `/apply` policy** — en `server/src/http/routes/categoryRules.ts`:

Cambiar el import: `import { categorize, matchRule, type RuleInput } from "../../rules/categorize.js";`

Reemplazar el handler de `/apply` por:

```ts
categoryRulesRouter.post(
  "/apply",
  asyncHandler(async (_req, res) => {
    const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];
    const txs = await TransactionModel.find({});
    let updated = 0;
    for (const tx of txs) {
      const matched = matchRule(tx.descriptionRaw, tx.merchant, rules);
      if (matched === null && tx.categorySource === "manual") continue;
      const category = matched ?? "Sin categoría";
      if (category !== tx.category || tx.categorySource !== "rule") {
        tx.category = category;
        tx.categorySource = "rule";
        await tx.save();
        updated += 1;
      }
    }
    res.json({ updated });
  }),
);
```

(`categorize` sigue importado/usado en otros lados; dejar el import.)

- [ ] **Step 5: Run — expect PASS**

Run: `bunx vitest run server/src/rules/categorize.test.ts server/src/http/routes/categoryRules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/rules/categorize.ts server/src/rules/categorize.test.ts server/src/http/routes/categoryRules.ts server/src/http/routes/categoryRules.test.ts
git commit -m "$(cat <<'EOF'
feat(rules): reapply rules to all transactions, overriding manual on match

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Client — edición inline de reglas

**Files:**
- Create: `client/src/components/CategoryRuleRow.tsx`
- Modify: `client/src/pages/RulesPage.tsx`
- Test: `client/src/pages/RulesPage.test.tsx`

**Interfaces:**
- Consumes: `CategoryRuleDTO`, `useUpdateRule`/`useDeleteRule` (ya existen).
- Produces: `CategoryRuleRow` (props `{ rule, onSave, onDelete, onToggle }`).

- [ ] **Step 1: Failing test** — reemplazar `client/src/pages/RulesPage.test.tsx` por:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true };
const calls: { url: string; method?: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body as string });
    const body = url.includes("/category-rules") && (!init || init.method === "GET" || !init.method) ? [rule] : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("RulesPage edición", () => {
  it("edita una regla y dispara PATCH con los valores nuevos", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("editar"));
    const categoria = screen.getByLabelText("Categoría");
    fireEvent.change(categoria, { target: { value: "Viajes" } });
    fireEvent.click(screen.getByLabelText("guardar"));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/category-rules/r1"));
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch!.body!)).toMatchObject({ category: "Viajes", pattern: "UBER", matchType: "contains", priority: 10 });
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run client/src/pages/RulesPage.test.tsx`
Expected: FAIL (no hay botón "editar").

- [ ] **Step 3: Create `CategoryRuleRow`** — `client/src/components/CategoryRuleRow.tsx`:

```tsx
import { useState } from "react";
import { IconButton, MenuItem, Switch, TableCell, TextField } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { MotionTableRow } from "./motion/motion.js";
import { fadeItem } from "./motion/variants.js";

interface CategoryRuleRowProps {
  rule: CategoryRuleDTO;
  onSave: (id: string, body: { priority: number; matchType: string; pattern: string; category: string }) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export const CategoryRuleRow = ({ rule, onSave, onDelete, onToggle }: CategoryRuleRowProps) => {
  const [editing, setEditing] = useState(false);
  const [priority, setPriority] = useState(rule.priority);
  const [matchType, setMatchType] = useState(rule.matchType);
  const [pattern, setPattern] = useState(rule.pattern);
  const [category, setCategory] = useState(rule.category);

  const cancel = () => {
    setPriority(rule.priority);
    setMatchType(rule.matchType);
    setPattern(rule.pattern);
    setCategory(rule.category);
    setEditing(false);
  };

  const save = () => {
    onSave(rule.id, { priority: Number(priority), matchType, pattern, category });
    setEditing(false);
  };

  if (!editing) {
    return (
      <MotionTableRow variants={fadeItem}>
        <TableCell>{rule.priority}</TableCell>
        <TableCell>{rule.matchType}</TableCell>
        <TableCell>{rule.pattern}</TableCell>
        <TableCell>{rule.category}</TableCell>
        <TableCell><Switch checked={rule.enabled} onChange={(e) => onToggle(rule.id, e.target.checked)} /></TableCell>
        <TableCell>
          <IconButton aria-label="editar" onClick={() => setEditing(true)}><EditIcon /></IconButton>
          <IconButton aria-label="borrar" onClick={() => onDelete(rule.id)}><DeleteIcon /></IconButton>
        </TableCell>
      </MotionTableRow>
    );
  }

  return (
    <MotionTableRow variants={fadeItem}>
      <TableCell>
        <TextField type="number" size="small" sx={{ width: 80 }} label="Prioridad"
          value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <TextField select size="small" sx={{ minWidth: 110 }} label="Tipo"
          value={matchType} onChange={(e) => setMatchType(e.target.value as CategoryRuleDTO["matchType"])}>
          <MenuItem value="contains">contains</MenuItem>
          <MenuItem value="regex">regex</MenuItem>
        </TextField>
      </TableCell>
      <TableCell>
        <TextField size="small" label="Patrón" value={pattern} onChange={(e) => setPattern(e.target.value)} />
      </TableCell>
      <TableCell>
        <TextField size="small" label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} />
      </TableCell>
      <TableCell><Switch checked={rule.enabled} onChange={(e) => onToggle(rule.id, e.target.checked)} /></TableCell>
      <TableCell>
        <IconButton aria-label="guardar" onClick={save}><CheckIcon /></IconButton>
        <IconButton aria-label="cancelar" onClick={cancel}><CloseIcon /></IconButton>
      </TableCell>
    </MotionTableRow>
  );
};
```

- [ ] **Step 4: Use it in `RulesPage`** — en `client/src/pages/RulesPage.tsx`, reemplazar el `import` de motion row y el `.map(...)` del cuerpo:

Quitar `MotionTableRow` del import de motion (queda `MotionTableBody`) y agregar:

```tsx
import { CategoryRuleRow } from "../components/CategoryRuleRow.js";
```

Reemplazar el cuerpo del `MotionTableBody`:

```tsx
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {(data ?? []).map((r) => (
            <CategoryRuleRow
              key={r.id}
              rule={r}
              onSave={(id, body) => update.mutate({ id, body })}
              onDelete={(id) => del.mutate(id)}
              onToggle={(id, enabled) => update.mutate({ id, body: { enabled } })}
            />
          ))}
        </MotionTableBody>
```

Y cambiar el copy del aviso de aplicar:

```tsx
      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados (las reglas pisan también las categorías manuales cuando matchean)</Alert>}
```

Quedan sin usar los imports `DeleteIcon`, `Switch`, `fadeItem` de `RulesPage` → eliminarlos del import de RulesPage para no romper el lint/tsc de imports no usados si aplicara (si `noUnusedLocals` está activo). Verificar con typecheck.

- [ ] **Step 5: Run — expect PASS**

Run: `bunx vitest run client/src/pages/RulesPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full typecheck + suite**

Run: `bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/CategoryRuleRow.tsx client/src/pages/RulesPage.tsx client/src/pages/RulesPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(client): inline editing of category rules

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Self-Review
- Editar reglas → Task 2 (`CategoryRuleRow` + RulesPage). ✓
- Reaplicar a todas, pisando manuales cuando matchea, preservando manual sin match → Task 1 (`matchRule` + `/apply`). ✓
- Regex inválido resiliente → Task 1 (`matchRule` try/catch). ✓
- Tipos consistentes (`matchRule` firma única; `onSave` body). ✓
