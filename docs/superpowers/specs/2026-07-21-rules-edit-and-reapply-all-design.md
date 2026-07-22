# Editar reglas de categoría + reaplicar a todas (incluso manuales) — Design Spec

**Fecha:** 2026-07-21
**Estado:** Aprobado para escribir plan de implementación.

## Goal

Dos cosas sobre la categorización:
1. **Editar reglas existentes** desde la página Reglas (prioridad, tipo, patrón, categoría), no sólo crear/borrar/activar.
2. **"Reaplicar a todo" debe revisar TODAS las transacciones**, incluso las que ya tienen categoría — y, por pedido del usuario, **pisar también las manuales** cuando una regla matchea. Si ninguna regla matchea, se preserva la etiqueta manual (para no perder categorías que ninguna regla reproduce).

## Architecture

- **Editar reglas:** sólo frontend. El backend ya tiene `PATCH /api/category-rules/:id` (pass-through a `findByIdAndUpdate`) y el hook `useUpdateRule({ id, body })`. Se agrega edición inline por fila.
- **Reaplicar:** cambio en la lógica de categorización del server. Se extrae `matchRule` (primera regla que matchea → categoría, o `null`), resiliente a regex inválido. `POST /api/category-rules/apply` deja de excluir las manuales y aplica la política "una regla que matchea siempre gana; sin match se preserva la manual".

**Piezas reutilizadas:** `useUpdateRule`/`useDeleteRule`/`useApplyRules`, `categorize`, motion table, MUI Table.

**Tech stack:** TS/ESM, Express + Mongoose (server), React 18 + MUI v6 (client), Vitest + supertest + mongodb-memory-server + RTL.

## Data findings

- `POST /api/category-rules/apply` hoy hace `TransactionModel.find({ categorySource: { $ne: "manual" } })` → recategoriza todas las de regla (tengan o no categoría) pero **excluye** las manuales.
- `categorize(desc, merchant, rules)` devuelve `{ category, source: "rule" }`, con `"Sin categoría"` cuando ninguna regla matchea (pierde la distinción match/no-match). El import lo usa para categorizar cada fila.
- `categorySource` es `"rule"` para todo lo importado; pasa a `"manual"` sólo al editar la categoría de una transacción en Movimientos (`PATCH /transactions/:id`).
- `matchType: "regex"` corre `new RegExp(pattern, "i")` → un patrón inválido tira excepción y hoy rompería `apply`/import.
- `CategoryRuleForm` es sólo alta (prioridad fija 100, sin campo prioridad) → no sirve tal cual para editar.

## Interfaces (contratos)

```ts
// server/src/rules/categorize.ts
export function matchRule(descriptionRaw: string, merchant: string, rules: RuleInput[]): string | null;
// primera regla habilitada (por prioridad asc) que matchea → su category; null si ninguna. Regex inválido → esa regla no matchea.

export function categorize(descriptionRaw: string, merchant: string, rules: RuleInput[]): { category: string; source: "rule" };
// = { category: matchRule(...) ?? "Sin categoría", source: "rule" }  (comportamiento sin cambios)
```

## Componentes (unidades)

### 1. Server — `matchRule` + `categorize` (rules/categorize.ts)
- `matchRule`: filtra `enabled`, ordena por `priority` asc, devuelve la `category` de la primera que matchea (`contains`: `haystack.includes(pattern.toUpperCase())`; `regex`: `new RegExp(pattern, "i").test(haystack)` envuelto en try/catch → `false` si inválido). `null` si ninguna.
- `categorize`: reimplementado sobre `matchRule` (misma salida que hoy).
- Tests: `matchRule` (match por prioridad, no-match→null, regex inválido→null); los tests actuales de `categorize` siguen verdes.

### 2. Server — `POST /api/category-rules/apply`
Recorre **todas** las transacciones. Por cada una:
- `matched = matchRule(desc, merchant, rules)`.
- Si `matched !== null` → objetivo `{ category: matched, categorySource: "rule" }` (pisa manual).
- Si `matched === null` y `categorySource === "manual"` → **no toca** (preserva manual).
- Si `matched === null` y no es manual → `{ category: "Sin categoría", categorySource: "rule" }`.
- Guarda y cuenta sólo si `category` o `categorySource` cambian.
- Responde `{ updated }`.
- Tests (supertest + withDb): manual con regla que matchea → pisada a "rule"; manual sin regla → preservada; no-manual sin regla → "Sin categoría"; regla que matchea → actualizada.

### 3. Client — `CategoryRuleRow` (nuevo) + `RulesPage`
- `CategoryRuleRow` (props: `rule: CategoryRuleDTO`, `onSave(id, body)`, `onDelete(id)`, `onToggle(id, enabled)`): estado local `editing` + draft. Modo vista = como hoy. Modo edición (ícono lápiz) = `TextField` Prioridad (number), `Select` Tipo (contains/regex), `TextField` Patrón, `TextField` Categoría, + Guardar (check) / Cancelar (close). Guardar → `onSave(id, { priority, matchType, pattern, category })` y sale de edición.
- `RulesPage`: usa `CategoryRuleRow` en el map; mantiene el form de alta, "Reaplicar a todo" y el aviso. Ajustar copy del aviso a que ahora incluye las manuales (p. ej. "N movimientos recategorizados (incluye manuales pisadas por reglas)").
- Test RTL: entrar en edición, cambiar categoría, Guardar → dispara PATCH con el body correcto.

## Test strategy
Vitest. Unit de `matchRule`; ruta `apply` con `withDb` + supertest (4 casos de la política); RTL de `RulesPage`/`CategoryRuleRow` (editar → PATCH). Cierre: `bun run typecheck` + `bun run test`.

## Fuera de alcance
- Validación/validación previa de regex en el PATCH (se maneja resiliencia en `matchRule`; no se bloquea guardar un patrón inválido).
- Reordenar reglas por drag&drop (se edita el número de prioridad a mano).
- Cambiar cómo el import categoriza (sigue igual vía `categorize`).

## Decisiones abiertas (menores)
- Edición inline por fila (elegido) vs modal.
- Si "pisar manual" debería además existir como opción separada (hoy: siempre pisa cuando matchea).
