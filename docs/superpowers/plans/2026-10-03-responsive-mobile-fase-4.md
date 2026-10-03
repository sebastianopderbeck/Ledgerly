# Responsive mobile — Fase 4 (Filtros) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En pantallas de menos de 900px, la barra de filtros de cada sección se reduce a una fila con un botón «Filtros» (con un contador de cuántos filtros se apartan del default) y un resumen de lo elegido; el botón abre una hoja desde abajo con los campos apilados a todo el ancho, que se aplican al momento sobre la URL. En Movimientos, «Buscar comercio» queda a la vista fuera de la hoja. La vista de compu no cambia.

**Architecture:** Los campos que hoy renderiza `FiltersBar` se extraen a `FilterFields({ fields, yearOptions, withSearch? })`, un fragmento sin contenedor: en compu `FiltersBar` lo envuelve en la misma `Box` de hoy y en mobile `FiltersSheet` lo apila dentro del `BottomSheet` de la Fase 1. `FiltersBar` elige con `useIsMobile()` entre la fila de compu y `MobileFiltersBar` (botón + `Badge` + resumen + buscador + hoja). El contador y el resumen salen de funciones puras sobre la URL (`activeFilterCount`, `filtersSummary`, `filtersButtonLabel` en `client/src/filters/activeFilters.ts`), que leen el año con la misma regla que `useGlobalFilters` gracias a dos helpers nuevos de `globalFilters.ts`. Los campos siguen escribiendo en la URL con sus hooks de siempre, así que no hay estado de filtros nuevo: solo el `open` de la hoja.

**Tech Stack:** React 18 + MUI 6.5 + react-router 6 + React Query 5 (cliente); Vitest + Testing Library en jsdom; Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md` (sección "Fase 4 — Filtros", más "Arquitectura", "Decisiones tomadas", "Tests" y "Fuera de alcance"). Modelo de filtros: `docs/superpowers/specs/2026-10-02-filtro-anio-global-design.md` (contrato de URL).

## Prerrequisitos

1. La base es `main`, que trae la Fase 1 (`useIsMobile`, `testing/viewport.ts`, `BottomSheet`, barra inferior) y el filtro de año global (`FiltersBar({ fields, yearOptions })`, `globalSearch`). Verificarlo desde la raíz del worktree:

   ```bash
   test -f client/src/useIsMobile.ts && echo "useIsMobile OK"
   grep -n "export const emulateMobile" client/src/testing/viewport.ts
   grep -n "keepMounted: false" client/src/components/BottomSheet.tsx
   grep -n "export const globalSearch" client/src/filters/globalFilters.ts
   grep -n "interface FiltersBarProps { fields: FilterField\[\]; yearOptions: string\[\]; }" client/src/components/FiltersBar.tsx
   grep -n "placeholderData: keepPreviousData" client/src/api/hooks.ts
   ```

   Las seis tienen que dar resultado. Si falta alguna, **frenar y preguntarle al usuario** desde qué base arrancar.
2. Trabajar en la rama `feat/responsive-mobile-fase-4`, en el worktree `.claude/worktrees/responsive-mobile-fase-4` (ya creado desde `main`). Las Fases 2 (KPIs y gráficos) y 3 (tablas) viven en otras ramas y **no** están en esta base: no usar `useChartLayout`, `RecordCard`, `TransactionsList`, `cssFor` de `testing/` ni nada de esas fases.
3. **Páginas**: este plan **no toca ninguna línea** de `client/src/pages/*.tsx` ni de sus tests existentes. Las siete páginas con filtros (Dashboard, Cuotas, Movimientos, Créditos, Auto, Sueldo, Contexto) siguen con `import { FiltersBar, type FilterField } from "../components/FiltersBar.js"` y `<FiltersBar fields={…} yearOptions={…} />` tal cual. La Fase 3 reescribe partes de `TransactionsPage.tsx` y agrega un `describe` mobile a `TransactionsPage.test.tsx`; por eso el test de integración de esta fase va en un archivo nuevo (`client/src/pages/TransactionsPage.filters.test.tsx`) y las dos ramas se pueden mergear en cualquier orden.
4. `bun install` si el worktree no tiene `node_modules`.

## Ajustes respecto del spec

Decisiones de detalle tomadas al planificar; no cambian lo acordado:

- **Defaults confirmados contra el código** (`useGlobalFilters`, `TransactionFilters`): Año = solo el año actual; Moneda = ARS (`currency` ausente o `ARS`); Tarjeta = `cardLabel` ausente; Mes = `from` ausente; Categorías = sin `category`; Cuotas = `installment` ausente (solo `true`/`false` cuentan); Búsqueda = `search` vacío.
- **El año que se compara es el efectivo**, el mismo que muestra el campo Año: sin `year` en la URL, `useGlobalFilters` toma el año del Mes elegido (`from`). Para que el contador no se desfase del campo, esa regla sale a `yearKeyOf(params)` + `parseYearKey(key)` en `globalFilters.ts`, y `useGlobalFilters` pasa a usarlos (mismo comportamiento, cubierto por sus tests actuales). Así `?from=2025-11-01&to=2025-11-30` cuenta Año y Mes (2) en el Dashboard.
- **Qué cuenta el `Badge`**: uno por campo de la sección que se aparta del default; `transaction` aporta hasta tres (categorías —cualquier cantidad cuenta 1—, cuotas y búsqueda, como pide el spec). Solo cuentan los campos de la sección: en Créditos (solo Año) no cuentan la Moneda ni la Tarjeta que viajan en la URL desde otra sección. Con 0 el `Badge` no se ve.
- **Resumen**: primero el período —el Mes elegido («Febrero de 2026») reemplaza al año; si no hay Mes, `yearsLabel` («2025 y 2026») o «Todos los años»—, después la moneda (siempre, ARS o USD), la tarjeta si hay una, las categorías (una se nombra, varias se cuentan: «3 categorías») y el filtro de cuotas («Solo cuotas» / «Sin cuotas»), unidos por « · ». Va en una línea con puntos suspensivos (`noWrap`) para no empujar el botón.
- **La búsqueda suma al contador pero no se repite en el resumen**: el buscador está a la vista justo debajo, y un texto largo se comería el resumen.
- **Movimientos sin `currency`** lista las dos monedas mientras el campo Moneda muestra ARS (comportamiento previo). El resumen refleja lo que muestra el campo; no se corrige en esta fase.
- **Nombre accesible del botón**: `filtersButtonLabel(count)` → «Filtros», «Filtros, 1 activo», «Filtros, 3 activos». El `Badge` de MUI conserva el número anterior mientras se oculta, así que los tests y VoiceOver usan el `aria-label`; el número del `Badge` va `aria-hidden`. El botón lleva `aria-haspopup="dialog"`, `aria-expanded`, ícono `Tune` y `minHeight: 44` (objetivo táctil).
- **`FilterField`** pasa a vivir en `client/src/filters/activeFilters.ts` (lo necesitan las funciones puras); `FiltersBar.tsx` lo re-exporta para que las páginas no cambien.
- **«Buscar comercio» sale a `SearchFilter`** (`components/filters/SearchFilter.tsx`, prop `fullWidth?`). `TransactionFilters` y `FilterFields` suman `withSearch?: boolean` (default `true`); la hoja pasa `false` y `MobileFiltersBar` renderiza `SearchFilter fullWidth` debajo de la fila. En compu el DOM es el mismo de hoy (Categorías, Cuotas, Buscar comercio como hermanos dentro de la misma `Box`).
- **`FilterFields` es un fragmento**: el contenedor lo pone quien lo usa. En la hoja, columna con `gap: 2`, cada campo a `width: 100%` y `pt: 1.5`, para que la etiqueta flotante del primer campo no quede cortada por el scroll interno del `BottomSheet`.
- **La hoja** se titula «Filtros» y su única acción es «Listo» (`contained`, ancho completo). Deslizar hacia abajo, tocar el fondo o Escape también cierran: los cambios ya están aplicados, así que no hay «Cancelar» ni «Limpiar».
- **Secciones con solo Año** (Créditos, Auto, Sueldo, Contexto) también usan botón + hoja, como dice el spec ("En mobile, `FiltersBar` muestra una fila…"); la hoja trae solo el Año.
- Componentes nuevos en `client/src/components/filters/`: `FilterFields`, `FiltersSheet`, `MobileFiltersBar`, `SearchFilter`.
- **Importar queda fuera**: `ImportedFilesFilters` no es `FiltersBar` (estado local, no URL) y el spec no lo incluye; se deja como está (en mobile se acomoda en varias líneas) y solo se revisa en la verificación visual.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits**: un commit por task en `feat/responsive-mobile-fase-4`, con el mensaje exacto del task (dos `-m`) y pathspec explícito. Nunca `git add -A` ni `git add .`. Nunca push ni merge.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma (con defaults ahí: `withSearch = true`, `fullWidth = false`), `interface` para props, prohibido `any`. Hooks como `export function useX()`.
- Mapeos, filtros y condicionales complejos antes del `return`, no dentro del JSX. `useCallback` para funciones que se pasan a componentes hijos (`openSheet`, `closeSheet`). Nunca usar el índice del array como `key`.
- **Corte mobile: `< md` (900px)**. La decisión estructural (campos en línea ↔ botón + hoja) pasa por `useIsMobile()` en `FiltersBar`; lo que es solo layout (apilado, anchos, espacios) va en `sx`.
- **La vista de compu no cambia**: en ≥ 900px `FiltersBar` renderiza la misma `Box` (`display: flex`, `gap: 2`, `flexWrap: wrap`, `mb: 3`) con los mismos campos, en el mismo orden y con los mismos props; la extracción a `FilterFields` renderiza exactamente lo que `FiltersBar` renderiza hoy. Los tests de compu de `FiltersBar.test.tsx` y de las páginas pasan sin cambios.
- **Los hooks van antes de cualquier `return` temprano**: en `FiltersBar`, `useIsMobile()` va antes del `if (isMobile) return …`.
- Copy de UI en español: «Filtros», «Listo», «Buscar comercio», «Todos los años», «Solo cuotas», «Sin cuotas», «N categorías», «Filtros, N activo(s)».
- Accesibilidad: la hoja es `dialog` con nombre «Filtros» (lo da `BottomSheet`); el botón expone `aria-haspopup="dialog"` y `aria-expanded`.
- Tests de cliente con más de un render llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo). Los que emulan viewport o stubean globals llaman `vi.unstubAllGlobals()` en `afterEach`. Al cerrarse, una hoja queda `aria-hidden` en el acto aunque siga montada hasta terminar la animación: `queryByRole("dialog")` da `null` enseguida.
- Fecha fija en los tests que dependen del año actual: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("2026-10-02T12:00:00"))`, como ya hace `FiltersBar.test.tsx`.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Comandos (desde la raíz del worktree): `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Contador que no coincide con lo que se ve en la sección**: el año actual escrito en la URL no cuenta; un Mes sin `year` cuenta también el Año (el campo muestra ese año); en Créditos no cuentan la Moneda ni la Tarjeta que vienen de otra sección. → tests de `activeFilterCount` en Task 2 y "el contador y el resumen solo miran los campos de la sección" en Task 5.
2. **Resumen con muchas categorías o valores largos a 375px**: varias categorías se cuentan («3 categorías») en vez de listarse, y el resumen va en una sola línea con puntos suspensivos para no empujar el botón fuera de la pantalla. → tests de `filtersSummary` en Task 2 y "con muchas categorías el resumen las cuenta y queda en una sola línea" en Task 5.
3. **La hoja contra la barra inferior y el teclado**: la hoja es modal y queda por encima de la navegación inferior (que no se puede tocar mientras está abierta), con «Listo» dentro de la hoja; y la hoja no tiene campos de texto, así que el teclado nunca la tapa. → test "en Movimientos lleva Categorías y Cuotas pero ningún campo de texto…" en Task 4 y "con la hoja abierta, la navegación inferior queda tapada…" en Task 5.
4. **Cambios aplicados en vivo con la hoja abierta**: cada elección se escribe en la URL al momento, la hoja no se cierra sola —tampoco cuando Movimientos vuelve a pedir la lista con los filtros nuevos— y al tocar «Listo» el contador y el resumen ya están al día. → test "elegir una opción escribe en la URL al momento y no cierra la hoja" en Task 4; "los cambios se escriben en la URL con la hoja abierta…" y "elegir Solo cuotas en la hoja vuelve a pedir la lista y la hoja sigue abierta" en Task 5.
5. **El buscador de Movimientos fuera de la hoja**: se ve debajo del botón, no se duplica dentro de la hoja, al escribir no pierde el foco (ni cuando la lista se vuelve a pedir) y suma al contador sin repetirse en el resumen. → test "sin el buscador deja Categorías y Cuotas" en Task 3; "en Movimientos el buscador queda a la vista debajo del botón y fuera de la hoja", "escribir en el buscador mantiene el foco…" y "el buscador queda fuera de la hoja y al escribir filtra la lista sin perder el foco" en Task 5.

---

### Task 1: Año efectivo de la URL como helper puro

**Files:**
- Modify: `client/src/filters/globalFilters.ts`
- Modify: `client/src/filters/useGlobalFilters.ts`
- Test: `client/src/filters/globalFilters.test.ts`

**Interfaces:**
- Produces:
  - `yearKeyOf(params: URLSearchParams): string` — los `year` unidos por coma; si no hay, el año (4 caracteres) de `from`; si tampoco, `""`. Es exactamente el `yearKey` que hoy calcula `useGlobalFilters`.
  - `parseYearKey(yearKey: string): YearSelection` — `parseYears(yearKey ? yearKey.split(",") : [])`.
- `useGlobalFilters()` no cambia su firma ni su comportamiento (sigue memorizando `yearSelection` por `yearKey`).

- [ ] **Step 1: Write the failing test**

En `client/src/filters/globalFilters.test.ts`, reemplazar el import de arriba por:

```ts
import {
  ALL_YEARS, filterInYears, globalSearch, matchesYears, parseYearKey, parseYears, resolveYearChange,
  writeYears, yearKeyOf, yearOptionsWith, yearsForApi, yearsLabel, yearsOf, type YearSelection,
} from "./globalFilters.js";
```

y agregar al final del archivo:

```ts
describe("yearKeyOf", () => {
  it("une los años de la URL", () => {
    expect(yearKeyOf(new URLSearchParams("year=2025&year=2026"))).toBe("2025,2026");
  });

  it("sin year toma el año del Mes elegido", () => {
    expect(yearKeyOf(new URLSearchParams("from=2025-11-01&to=2025-11-30"))).toBe("2025");
  });

  it("con year explícito no lo pisa el Mes", () => {
    expect(yearKeyOf(new URLSearchParams("year=2026&from=2025-11-01&to=2025-11-30"))).toBe("2026");
  });

  it("sin year ni Mes queda vacío", () => {
    expect(yearKeyOf(new URLSearchParams("currency=USD"))).toBe("");
  });
});

describe("parseYearKey", () => {
  it("vacío es el año actual", () => {
    expect(parseYearKey("")).toEqual(only("2026"));
  });

  it("separa por coma y respeta all", () => {
    expect(parseYearKey("2026,2025")).toEqual(only("2025", "2026"));
    expect(parseYearKey("all")).toEqual(ALL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/filters/globalFilters.test.ts`
Expected: FAIL — `yearKeyOf` y `parseYearKey` no existen ("is not a function").

- [ ] **Step 3: Implement**

En `client/src/filters/globalFilters.ts`, debajo de `parseYears`:

```ts
export const yearKeyOf = (params: URLSearchParams): string =>
  params.getAll("year").join(",") || (params.get("from")?.slice(0, 4) ?? "");

export const parseYearKey = (yearKey: string): YearSelection => parseYears(yearKey ? yearKey.split(",") : []);
```

En `client/src/filters/useGlobalFilters.ts`:

1. Reemplazar el import de `./globalFilters.js` por:

```ts
import { matchesYears, parseYearKey, writeYears, yearKeyOf, yearsForApi, type YearSelection } from "./globalFilters.js";
```

2. Reemplazar las tres líneas que calculan `monthYear`, `yearKey` y `yearSelection` por:

```ts
  const yearKey = yearKeyOf(params);
  const yearSelection = useMemo(() => parseYearKey(yearKey), [yearKey]);
```

El resto del hook queda igual.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/filters/`
Expected: PASS (6 tests nuevos en `globalFilters.test.ts`; `useGlobalFilters.test.tsx` sin cambios, incluido "sin year pero con un Mes en la URL toma el año de ese Mes").

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/filters/globalFilters.ts client/src/filters/globalFilters.test.ts client/src/filters/useGlobalFilters.ts
git commit -m "refactor(client): el año efectivo de la URL sale a un helper puro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `activeFilterCount`, `filtersSummary` y `filtersButtonLabel`

**Files:**
- Create: `client/src/filters/activeFilters.ts`
- Test: `client/src/filters/activeFilters.test.ts`
- Modify: `client/src/components/FiltersBar.tsx` (el tipo `FilterField` pasa a re-exportarse)

**Interfaces:**
- Consumes: `yearKeyOf`, `parseYearKey` (Task 1); `currentYear`, `yearsLabel`, `YearSelection` de `globalFilters.ts`; `formatMonthLabel` de `client/src/format.ts`.
- Produces:
  - `type FilterField = "year" | "currency" | "card" | "month" | "transaction"` (se mueve desde `FiltersBar.tsx`, que lo re-exporta).
  - `activeFilterCount(params: URLSearchParams, fields: FilterField[]): number`
  - `filtersSummary(params: URLSearchParams, fields: FilterField[]): string`
  - `filtersButtonLabel(count: number): string`

- [ ] **Step 1: Write the failing test**

`client/src/filters/activeFilters.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { activeFilterCount, filtersButtonLabel, filtersSummary, type FilterField } from "./activeFilters.js";

const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const INSTALLMENTS: FilterField[] = ["year", "currency", "card"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];
const YEAR_ONLY: FilterField[] = ["year"];

const params = (search: string) => new URLSearchParams(search);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("activeFilterCount", () => {
  it("sin params no hay filtros activos", () => {
    expect(activeFilterCount(params(""), TRANSACTIONS)).toBe(0);
  });

  it("el año actual y ARS escritos en la URL siguen siendo el default", () => {
    expect(activeFilterCount(params("year=2026&currency=ARS"), DASHBOARD)).toBe(0);
  });

  it("otro año, Todos o varios años cuentan como un filtro", () => {
    expect(activeFilterCount(params("year=2025"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("year=all"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("year=2025&year=2026"), YEAR_ONLY)).toBe(1);
  });

  it("USD, una tarjeta y un Mes cuentan uno cada uno", () => {
    expect(activeFilterCount(params("year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28"), DASHBOARD)).toBe(3);
  });

  it("un Mes de otro año sin year cuenta también el Año, como lo muestra el campo", () => {
    expect(activeFilterCount(params("from=2025-11-01&to=2025-11-30"), DASHBOARD)).toBe(2);
  });

  it("categorías, cuotas y búsqueda cuentan uno cada uno, sin importar cuántas categorías", () => {
    expect(activeFilterCount(params("category=Compras&category=Salud&category=Viajes&installment=false&search=uber"), TRANSACTIONS)).toBe(3);
  });

  it("ignora los filtros que la sección no muestra", () => {
    expect(activeFilterCount(params("year=2025&currency=USD&cardLabel=ICBC&from=2025-03-01&category=Compras"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("currency=USD&from=2026-02-01&to=2026-02-28&search=uber"), INSTALLMENTS)).toBe(1);
  });
});

describe("filtersSummary", () => {
  it("muestra año y moneda aunque sean los de siempre", () => {
    expect(filtersSummary(params(""), DASHBOARD)).toBe("2026 · ARS");
  });

  it("suma la tarjeta elegida", () => {
    expect(filtersSummary(params("currency=USD&cardLabel=Visa"), DASHBOARD)).toBe("2026 · USD · Visa");
  });

  it("nombra varios años o Todos", () => {
    expect(filtersSummary(params("year=2025&year=2026"), YEAR_ONLY)).toBe("2025 y 2026");
    expect(filtersSummary(params("year=all"), YEAR_ONLY)).toBe("Todos los años");
  });

  it("con un Mes elegido muestra el mes en lugar del año", () => {
    expect(filtersSummary(params("year=2026&from=2026-02-01&to=2026-02-28"), DASHBOARD)).toBe("Febrero de 2026 · ARS");
  });

  it("donde no hay campo Mes, un from en la URL no cambia el período", () => {
    expect(filtersSummary(params("year=2025&from=2025-11-01&to=2025-11-30"), INSTALLMENTS)).toBe("2025 · ARS");
  });

  it("una categoría se nombra y varias se cuentan", () => {
    expect(filtersSummary(params("category=Compras"), TRANSACTIONS)).toBe("2026 · ARS · Compras");
    expect(filtersSummary(params("category=Compras&category=Salud&category=Viajes"), TRANSACTIONS)).toBe("2026 · ARS · 3 categorías");
  });

  it("nombra el filtro de cuotas", () => {
    expect(filtersSummary(params("installment=true"), TRANSACTIONS)).toBe("2026 · ARS · Solo cuotas");
    expect(filtersSummary(params("installment=false"), TRANSACTIONS)).toBe("2026 · ARS · Sin cuotas");
  });

  it("no repite la búsqueda, que queda a la vista fuera de la hoja", () => {
    expect(filtersSummary(params("search=uber"), TRANSACTIONS)).toBe("2026 · ARS");
  });

  it("solo resume los campos de la sección", () => {
    expect(filtersSummary(params("year=2025&currency=USD&cardLabel=ICBC"), YEAR_ONLY)).toBe("2025");
  });
});

describe("filtersButtonLabel", () => {
  it("dice cuántos filtros hay activos", () => {
    expect(filtersButtonLabel(0)).toBe("Filtros");
    expect(filtersButtonLabel(1)).toBe("Filtros, 1 activo");
    expect(filtersButtonLabel(3)).toBe("Filtros, 3 activos");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/filters/activeFilters.test.ts`
Expected: FAIL — no se resuelve `./activeFilters.js`.

- [ ] **Step 3: Implement**

`client/src/filters/activeFilters.ts`:

```ts
import { formatMonthLabel } from "../format.js";
import { currentYear, parseYearKey, yearKeyOf, yearsLabel, type YearSelection } from "./globalFilters.js";

export type FilterField = "year" | "currency" | "card" | "month" | "transaction";

type DetailField = Exclude<FilterField, "year" | "month">;

type ParamsReader<T> = (params: URLSearchParams) => T;

const SEPARATOR = " · ";

const yearSelectionOf = (params: URLSearchParams): YearSelection => parseYearKey(yearKeyOf(params));

const isCurrentYearOnly = (selection: YearSelection): boolean =>
  selection.kind === "years" && selection.years.length === 1 && selection.years[0] === currentYear();

const currencyOf = (params: URLSearchParams): string => (params.get("currency") === "USD" ? "USD" : "ARS");

const categoriesOf = (params: URLSearchParams): string[] => params.getAll("category").filter(Boolean);

const installmentLabel = (value: string | null): string | undefined => {
  if (value === "true") return "Solo cuotas";
  if (value === "false") return "Sin cuotas";
  return undefined;
};

const categoriesLabel = (categories: string[]): string | undefined => {
  if (categories.length === 0) return undefined;
  return categories.length === 1 ? categories[0] : `${categories.length} categorías`;
};

const countActive = (...active: boolean[]): number => active.filter(Boolean).length;

const ACTIVE_BY_FIELD: Record<FilterField, ParamsReader<number>> = {
  year: (params) => countActive(!isCurrentYearOnly(yearSelectionOf(params))),
  currency: (params) => countActive(currencyOf(params) === "USD"),
  card: (params) => countActive(Boolean(params.get("cardLabel"))),
  month: (params) => countActive(Boolean(params.get("from"))),
  transaction: (params) => countActive(
    categoriesOf(params).length > 0,
    installmentLabel(params.get("installment")) !== undefined,
    Boolean(params.get("search")),
  ),
};

const DETAILS_BY_FIELD: Record<DetailField, ParamsReader<Array<string | undefined>>> = {
  currency: (params) => [currencyOf(params)],
  card: (params) => [params.get("cardLabel") || undefined],
  transaction: (params) => [categoriesLabel(categoriesOf(params)), installmentLabel(params.get("installment"))],
};

const isDetailField = (field: FilterField): field is DetailField => field !== "year" && field !== "month";

const periodLabel = (params: URLSearchParams, fields: FilterField[]): string | undefined => {
  const from = params.get("from");
  if (fields.includes("month") && from) return formatMonthLabel(from.slice(0, 7));
  if (!fields.includes("year")) return undefined;
  const selection = yearSelectionOf(params);
  return selection.kind === "all" ? "Todos los años" : yearsLabel(selection.years);
};

export const activeFilterCount = (params: URLSearchParams, fields: FilterField[]): number =>
  fields.reduce((total, field) => total + ACTIVE_BY_FIELD[field](params), 0);

export const filtersSummary = (params: URLSearchParams, fields: FilterField[]): string => {
  const details = fields.filter(isDetailField).flatMap((field) => DETAILS_BY_FIELD[field](params));
  return [periodLabel(params, fields), ...details]
    .filter((part): part is string => Boolean(part))
    .join(SEPARATOR);
};

export const filtersButtonLabel = (count: number): string => {
  if (count === 0) return "Filtros";
  return `Filtros, ${count} ${count === 1 ? "activo" : "activos"}`;
};
```

En `client/src/components/FiltersBar.tsx`:
- Agregar `import type { FilterField } from "../filters/activeFilters.js";` debajo del último import.
- Reemplazar `export type FilterField = "year" | "currency" | "card" | "month" | "transaction";` por:

```tsx
export type { FilterField } from "../filters/activeFilters.js";
```

El resto del archivo queda igual en esta task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/filters/activeFilters.test.ts client/src/components/FiltersBar.test.tsx`
Expected: PASS (17 tests nuevos; `FiltersBar` sin cambios).

Run: `bun run typecheck`
Expected: sin errores (las siete páginas siguen importando `type FilterField` desde `FiltersBar.js`).

- [ ] **Step 5: Commit**

```bash
git add client/src/filters/activeFilters.ts client/src/filters/activeFilters.test.ts client/src/components/FiltersBar.tsx
git commit -m "feat(client): contador y resumen de los filtros activos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `FilterFields` y `SearchFilter` (compu sin cambios)

**Files:**
- Create: `client/src/components/filters/SearchFilter.tsx`
- Create: `client/src/components/filters/FilterFields.tsx`
- Modify: `client/src/components/filters/TransactionFilters.tsx` (prop `withSearch`; el buscador pasa a `SearchFilter`)
- Modify: `client/src/components/FiltersBar.tsx` (usa `FilterFields`)
- Test: `client/src/components/filters/FilterFields.test.tsx`
- Test: `client/src/components/FiltersBar.test.tsx` (caso de compu que fija el orden de hoy)

**Interfaces:**
- Consumes: `FilterField` (Task 2).
- Produces:
  - `SearchFilter` con props `{ fullWidth?: boolean }` (default `false`) — `TextField` «Buscar comercio» que escribe `search` en la URL con `replace: true`.
  - `TransactionFilters` con props `{ withSearch?: boolean }` (default `true`).
  - `FilterFields` con props `{ fields: FilterField[]; yearOptions: string[]; withSearch?: boolean }` (default `true`) — fragmento con Año, Moneda, Tarjeta, Mes y los de Movimientos, en ese orden y sin contenedor.
- `FiltersBar` mantiene `{ fields, yearOptions }` y renderiza exactamente lo de hoy.

- [ ] **Step 1: Write the failing tests**

`client/src/components/filters/FilterFields.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import type { FilterField } from "../../filters/activeFilters.js";
import { FilterFields } from "./FilterFields.js";

const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const labelsIn = (container: HTMLElement) => Array.from(container.querySelectorAll("label"), (label) => label.textContent);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FilterFields", () => {
  it("renderiza los campos pedidos en el orden de la barra, con el buscador al final", () => {
    const { container } = renderWithProviders(<FilterFields fields={TRANSACTIONS} yearOptions={["2026"]} />, { route: "/transactions" });
    expect(labelsIn(container)).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas", "Buscar comercio"]);
  });

  it("sin el buscador deja Categorías y Cuotas", () => {
    const { container } = renderWithProviders(
      <FilterFields fields={TRANSACTIONS} yearOptions={["2026"]} withSearch={false} />,
      { route: "/transactions" },
    );
    expect(labelsIn(container)).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas"]);
    expect(screen.queryByRole("textbox", { name: "Buscar comercio" })).not.toBeInTheDocument();
  });

  it("solo renderiza los campos de la sección", () => {
    const { container } = renderWithProviders(<FilterFields fields={["year"]} yearOptions={["2026"]} />);
    expect(labelsIn(container)).toEqual(["Año"]);
  });
});
```

En `client/src/components/FiltersBar.test.tsx`, dentro de `describe("FiltersBar", ...)`, agregar al final:

```tsx
  it("en compu muestra los campos en línea, en el orden de siempre", () => {
    const { container } = renderBar(["year", "currency", "card", "month", "transaction"], "/transactions");
    const labels = Array.from(container.querySelectorAll("label"), (label) => label.textContent);
    expect(labels).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas", "Buscar comercio"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/filters/FilterFields.test.tsx client/src/components/FiltersBar.test.tsx`
Expected: FAIL en `FilterFields.test.tsx` — no se resuelve `./FilterFields.js`. El caso nuevo de `FiltersBar` **pasa** ya: fija lo que se ve hoy en compu y tiene que seguir pasando después del refactor.

- [ ] **Step 3: Implement**

`client/src/components/filters/SearchFilter.tsx`:

```tsx
import { useSearchParams } from "react-router-dom";
import { TextField } from "@mui/material";

interface SearchFilterProps { fullWidth?: boolean; }

export const SearchFilter = ({ fullWidth = false }: SearchFilterProps) => {
  const [params, setParams] = useSearchParams();

  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value); else next.delete("search");
    setParams(next, { replace: true });
  };

  return (
    <TextField
      label="Buscar comercio" size="small" fullWidth={fullWidth}
      value={params.get("search") ?? ""} onChange={(event) => setSearch(event.target.value)}
    />
  );
};
```

`client/src/components/filters/TransactionFilters.tsx` (reemplazar el archivo entero):

```tsx
import { useSearchParams } from "react-router-dom";
import { MenuItem, TextField } from "@mui/material";
import { useCategories } from "../../api/hooks.js";
import { SearchFilter } from "./SearchFilter.js";
import { selectedValues } from "./selectedValues.js";

interface TransactionFiltersProps { withSearch?: boolean; }

export const TransactionFilters = ({ withSearch = true }: TransactionFiltersProps) => {
  const [params, setParams] = useSearchParams();
  const { data } = useCategories();
  const categories = Array.isArray(data) ? data : [];

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <TextField
        select label="Categorías" size="small" sx={{ minWidth: 220 }}
        value={params.getAll("category")}
        onChange={(event) => setMulti("category", selectedValues(event.target.value))}
        SelectProps={{ multiple: true, renderValue: (selected) => selectedValues(selected).join(", ") }}
      >
        {categories.map((category) => (
          <MenuItem key={category} value={category}>{category}</MenuItem>
        ))}
      </TextField>
      <TextField
        select label="Cuotas" size="small" sx={{ minWidth: 150 }}
        value={params.get("installment") ?? ""} onChange={(event) => set("installment", event.target.value)}
      >
        <MenuItem value="">Todas</MenuItem>
        <MenuItem value="true">Solo cuotas</MenuItem>
        <MenuItem value="false">Sin cuotas</MenuItem>
      </TextField>
      {withSearch && <SearchFilter />}
    </>
  );
};
```

`client/src/components/filters/FilterFields.tsx`:

```tsx
import type { FilterField } from "../../filters/activeFilters.js";
import { YearFilter } from "./YearFilter.js";
import { CurrencyFilter } from "./CurrencyFilter.js";
import { CardFilter } from "./CardFilter.js";
import { MonthFilter } from "./MonthFilter.js";
import { TransactionFilters } from "./TransactionFilters.js";

interface FilterFieldsProps {
  fields: FilterField[];
  yearOptions: string[];
  withSearch?: boolean;
}

export const FilterFields = ({ fields, yearOptions, withSearch = true }: FilterFieldsProps) => {
  const shows = (field: FilterField) => fields.includes(field);

  return (
    <>
      {shows("year") && <YearFilter options={yearOptions} />}
      {shows("currency") && <CurrencyFilter />}
      {shows("card") && <CardFilter />}
      {shows("month") && <MonthFilter />}
      {shows("transaction") && <TransactionFilters withSearch={withSearch} />}
    </>
  );
};
```

`client/src/components/FiltersBar.tsx` (reemplazar el archivo entero):

```tsx
import { Box } from "@mui/material";
import type { FilterField } from "../filters/activeFilters.js";
import { FilterFields } from "./filters/FilterFields.js";

export type { FilterField } from "../filters/activeFilters.js";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => (
  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
    <FilterFields fields={fields} yearOptions={yearOptions} />
  </Box>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/filters/ client/src/components/FiltersBar.test.tsx client/src/pages/`
Expected: PASS (3 tests nuevos en `FilterFields`, el caso nuevo de `FiltersBar` y todos los de páginas sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filters/SearchFilter.tsx client/src/components/filters/FilterFields.tsx client/src/components/filters/FilterFields.test.tsx client/src/components/filters/TransactionFilters.tsx client/src/components/FiltersBar.tsx client/src/components/FiltersBar.test.tsx
git commit -m "refactor(client): los campos de la barra de filtros salen a FilterFields" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `FiltersSheet`

**Files:**
- Create: `client/src/components/filters/FiltersSheet.tsx`
- Test: `client/src/components/filters/FiltersSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`{ open, onClose, title, children, actions? }`, Fase 1); `FilterFields` (Task 3); `FilterField` (Task 2).
- Produces: `FiltersSheet` con props

  ```ts
  interface FiltersSheetProps {
    open: boolean;
    onClose: () => void;
    fields: FilterField[];
    yearOptions: string[];
  }
  ```

  Hoja «Filtros» con `FilterFields` (sin buscador) apilados a todo el ancho y una acción «Listo» que llama `onClose`.

- [ ] **Step 1: Write the failing test**

`client/src/components/filters/FiltersSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import type { FilterField } from "../../filters/activeFilters.js";
import { FiltersSheet } from "./FiltersSheet.js";

const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const noop = () => undefined;

const LocationProbe = () => {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
};

const renderSheet = (fields: FilterField[], onClose: () => void = noop, route = "/") =>
  renderWithProviders(
    <>
      <FiltersSheet open onClose={onClose} fields={fields} yearOptions={["2025", "2026"]} />
      <LocationProbe />
    </>,
    { route },
  );

const sheet = () => screen.getByRole("dialog", { name: "Filtros" });

const currentParams = () => new URLSearchParams(screen.getByTestId("search").textContent ?? "");

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte"]
      : url.includes("/statements") ? [{ id: "1", cardLabel: "ICBC" }]
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FiltersSheet", () => {
  it("es una hoja titulada Filtros con los campos de la sección", () => {
    renderSheet(DASHBOARD);
    for (const name of [/año/i, /moneda/i, /tarjeta/i, /^mes/i]) {
      expect(within(sheet()).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(within(sheet()).queryByRole("combobox", { name: /categorías/i })).not.toBeInTheDocument();
  });

  it("en Movimientos lleva Categorías y Cuotas pero ningún campo de texto, así el teclado no tapa «Listo»", () => {
    renderSheet(TRANSACTIONS, noop, "/transactions");
    expect(within(sheet()).getByRole("combobox", { name: /categorías/i })).toBeInTheDocument();
    expect(within(sheet()).getByRole("combobox", { name: /cuotas/i })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("elegir una opción escribe en la URL al momento y no cierra la hoja", async () => {
    const onClose = vi.fn();
    renderSheet(DASHBOARD, onClose);
    await userEvent.click(within(sheet()).getByRole("combobox", { name: /moneda/i }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "USD" }));
    expect(currentParams().get("currency")).toBe("USD");
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
  });

  it("«Listo» pide cerrar la hoja", async () => {
    const onClose = vi.fn();
    renderSheet(DASHBOARD, onClose);
    await userEvent.click(within(sheet()).getByRole("button", { name: "Listo" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/filters/FiltersSheet.test.tsx`
Expected: FAIL — no se resuelve `./FiltersSheet.js`.

- [ ] **Step 3: Implement**

`client/src/components/filters/FiltersSheet.tsx`:

```tsx
import { Box, Button } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { FilterField } from "../../filters/activeFilters.js";
import { BottomSheet } from "../BottomSheet.js";
import { FilterFields } from "./FilterFields.js";

interface FiltersSheetProps {
  open: boolean;
  onClose: () => void;
  fields: FilterField[];
  yearOptions: string[];
}

const stackSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  pt: 1.5,
  "& > *": { width: "100%" },
};

export const FiltersSheet = ({ open, onClose, fields, yearOptions }: FiltersSheetProps) => {
  const actions = <Button variant="contained" fullWidth onClick={onClose}>Listo</Button>;

  return (
    <BottomSheet open={open} onClose={onClose} title="Filtros" actions={actions}>
      <Box sx={stackSx}>
        <FilterFields fields={fields} yearOptions={yearOptions} withSearch={false} />
      </Box>
    </BottomSheet>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/filters/`
Expected: PASS (4 tests nuevos en `FiltersSheet`; `FilterFields` y `selectedValues` sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filters/FiltersSheet.tsx client/src/components/filters/FiltersSheet.test.tsx
git commit -m "feat(client): hoja de filtros para mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `FiltersBar` en mobile

**Files:**
- Create: `client/src/components/filters/MobileFiltersBar.tsx`
- Modify: `client/src/components/FiltersBar.tsx` (elige vista con `useIsMobile()`)
- Test: `client/src/components/FiltersBar.test.tsx` (bloque mobile y caso de compu con `matchMedia`)
- Test (nuevo): `client/src/pages/TransactionsPage.filters.test.tsx`

**Interfaces:**
- Consumes: `useIsMobile()` (Fase 1); `emulateMobile()`/`emulateDesktop()` (Fase 1); `activeFilterCount`, `filtersSummary`, `filtersButtonLabel`, `FilterField` (Task 2); `FilterFields`, `SearchFilter` (Task 3); `FiltersSheet` (Task 4).
- Produces:
  - `MobileFiltersBar` con props `{ fields: FilterField[]; yearOptions: string[] }` — fila con el botón «Filtros» (`aria-label={filtersButtonLabel(count)}`, `aria-haspopup="dialog"`, `aria-expanded`) dentro de un `Badge` con el contador, y el resumen en una línea; debajo, `SearchFilter fullWidth` si `fields` incluye `"transaction"`; y la `FiltersSheet`.
  - `FiltersBar` mantiene `{ fields, yearOptions }`: en mobile renderiza `MobileFiltersBar`; en compu, lo mismo que en Task 3.

- [ ] **Step 1: Write the failing tests**

En `client/src/components/FiltersBar.test.tsx`:

1. Reemplazar los imports de arriba por:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { FiltersBar, type FilterField } from "./FiltersBar.js";
```

2. En el `afterEach` existente, agregar `vi.unstubAllGlobals();` después de `vi.restoreAllMocks();`.

3. Dentro de `describe("FiltersBar", ...)`, agregar al final:

```tsx
  it("en compu sigue mostrando los campos en línea, sin botón Filtros", () => {
    emulateDesktop();
    renderBar(["year", "currency"]);
    expect(screen.getByRole("combobox", { name: /año/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^filtros/i })).not.toBeInTheDocument();
  });
```

4. Al final del archivo, agregar:

```tsx
const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const filtersButton = (name: string) => screen.getByRole("button", { name });

const filtersSheet = () => screen.queryByRole("dialog", { name: "Filtros" });

const chooseInSheet = async (field: RegExp, option: string) => {
  const sheet = await screen.findByRole("dialog", { name: "Filtros" });
  await userEvent.click(within(sheet).getByRole("combobox", { name: field }));
  await userEvent.click(await within(await screen.findByRole("listbox")).findByRole("option", { name: option }));
};

describe("FiltersBar en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el botón Filtros con el contador y el resumen, no los campos", () => {
    renderBar(DASHBOARD, "/?year=2025&currency=USD&cardLabel=ICBC");
    expect(filtersButton("Filtros, 3 activos")).toBeInTheDocument();
    expect(screen.getByText("2025 · USD · ICBC")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /año/i })).not.toBeInTheDocument();
  });

  it("con todo en su default el botón no lleva contador", () => {
    renderBar(DASHBOARD, "/?year=2026&currency=ARS");
    expect(filtersButton("Filtros")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS")).toBeInTheDocument();
  });

  it("el contador y el resumen solo miran los campos de la sección", () => {
    renderBar(["year"], "/credits?year=2025&currency=USD&cardLabel=ICBC");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
  });

  it("con muchas categorías el resumen las cuenta y queda en una sola línea", () => {
    renderBar(TRANSACTIONS, "/transactions?category=Compras&category=Salud&category=Transporte");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS · 3 categorías")).toHaveClass("MuiTypography-noWrap");
  });

  it("tocar Filtros abre la hoja con los campos de la sección", async () => {
    renderBar(DASHBOARD);
    const button = filtersButton("Filtros");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    for (const name of [/año/i, /moneda/i, /tarjeta/i, /^mes/i]) {
      expect(within(sheet).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("los cambios se escriben en la URL con la hoja abierta y «Listo» la cierra con el contador al día", async () => {
    renderBar(DASHBOARD);
    await userEvent.click(filtersButton("Filtros"));
    await chooseInSheet(/moneda/i, "USD");
    expect(currentParams().get("currency")).toBe("USD");
    await chooseInSheet(/tarjeta/i, "ICBC");
    expect(currentParams().get("cardLabel")).toBe("ICBC");
    const sheet = await screen.findByRole("dialog", { name: "Filtros" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(filtersSheet()).not.toBeInTheDocument());
    expect(filtersButton("Filtros, 2 activos")).toBeInTheDocument();
    expect(screen.getByText("2026 · USD · ICBC")).toBeInTheDocument();
  });

  it("con la hoja abierta, la navegación inferior queda tapada y «Listo» está en la hoja", async () => {
    renderWithProviders(
      <>
        <FiltersBar fields={["year"]} yearOptions={["2025", "2026"]} />
        <nav aria-label="principal" />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "principal" })).toBeInTheDocument();
    await userEvent.click(filtersButton("Filtros"));
    expect(screen.queryByRole("navigation", { name: "principal" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Filtros" })).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("en Movimientos el buscador queda a la vista debajo del botón y fuera de la hoja", async () => {
    renderBar(TRANSACTIONS, "/transactions");
    const button = filtersButton("Filtros");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    expect(button.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(sheet).getByRole("combobox", { name: /categorías/i })).toBeInTheDocument();
    expect(within(sheet).queryByRole("textbox", { name: "Buscar comercio" })).not.toBeInTheDocument();
  });

  it("escribir en el buscador mantiene el foco, filtra al momento y suma al contador sin repetirse en el resumen", async () => {
    renderBar(TRANSACTIONS, "/transactions");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    await userEvent.type(search, "uber");
    expect(search).toHaveValue("uber");
    expect(search).toHaveFocus();
    expect(currentParams().get("search")).toBe("uber");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS")).toBeInTheDocument();
  });

  it("si la pantalla pasa a tamaño compu con la hoja abierta, quedan los campos en línea y nada tapando", async () => {
    renderBar(DASHBOARD);
    await userEvent.click(filtersButton("Filtros"));
    emulateDesktop();
    await waitFor(() => expect(filtersSheet()).not.toBeInTheDocument());
    expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("combobox", { name: /año/i })).toBeInTheDocument();
  });
});
```

`client/src/pages/TransactionsPage.filters.test.tsx` (archivo nuevo, para no chocar con el `describe` mobile que la Fase 3 suma a `TransactionsPage.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { TransactionsPage } from "./TransactionsPage.js";

const tx = {
  id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: "1",
};
const installmentTx = {
  ...tx, id: "2", descriptionRaw: "CUOTAS SA", merchant: "CUOTAS SA",
  isInstallment: true, installmentCurrent: 1, installmentTotal: 3,
};
const searchedTx = { ...tx, id: "3", descriptionRaw: "UBER TRIP", merchant: "UBER TRIP" };

const listPage = (item: typeof tx) => ({ items: [item], total: 1, page: 1, pageSize: 50 });

const listFor = (url: string) => {
  if (url.includes("installment=true")) return listPage(installmentTx);
  if (url.includes("search=uber")) return listPage(searchedTx);
  return listPage(tx);
};

const requestedList = (fragment: string) => vi.mocked(fetch).mock.calls
  .map((call) => String(call[0]))
  .some((url) => url.includes("/transactions") && !url.includes("/categories") && url.includes(fragment));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/monthly") ? [{ month: "2026-05", total: 1, count: 1 }]
      : url.includes("/transactions/categories") ? ["Compras", "Salud"]
      : url.includes("/statements") ? [{ id: "s", cardLabel: "ICBC" }]
      : url.includes("/transactions") ? listFor(url)
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  emulateMobile();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Movimientos en mobile: filtros", () => {
  it("elegir Solo cuotas en la hoja vuelve a pedir la lista y la hoja sigue abierta", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await screen.findByText("MERCADOLIBRE");
    await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    await userEvent.click(within(sheet).getByRole("combobox", { name: /cuotas/i }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Solo cuotas" }));
    await waitFor(() => expect(requestedList("installment=true")).toBe(true));
    await screen.findByText("CUOTAS SA");
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Filtros" })).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filtros" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Filtros, 1 activo" })).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS · Solo cuotas")).toBeInTheDocument();
  });

  it("el buscador queda fuera de la hoja y al escribir filtra la lista sin perder el foco", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await screen.findByText("MERCADOLIBRE");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    await userEvent.type(search, "uber");
    await waitFor(() => expect(requestedList("search=uber")).toBe(true));
    await screen.findByText("UBER TRIP");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("uber");
  });
});
```

Estos dos tests fijan que la página no desmonta la barra (y con ella la hoja o el foco del buscador) cuando la lista se vuelve a pedir: hoy no pasa porque `useTransactions` usa `placeholderData: keepPreviousData` y `isLoading` no vuelve a `true`. Se espera hasta ver la fila nueva («CUOTAS SA», «UBER TRIP») para que la aserción corra **después** de que llegó la respuesta.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/FiltersBar.test.tsx client/src/pages/TransactionsPage.filters.test.tsx`
Expected: FAIL en "FiltersBar en mobile" y en los dos tests de `TransactionsPage.filters.test.tsx` — en mobile todavía se ven los campos en línea y no hay botón «Filtros». "en compu sigue mostrando los campos en línea, sin botón Filtros" y los tests de compu existentes ya pasan.

- [ ] **Step 3: Implement**

`client/src/components/filters/MobileFiltersBar.tsx`:

```tsx
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Box, Button, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import TuneIcon from "@mui/icons-material/Tune";
import { activeFilterCount, filtersButtonLabel, filtersSummary, type FilterField } from "../../filters/activeFilters.js";
import { FiltersSheet } from "./FiltersSheet.js";
import { SearchFilter } from "./SearchFilter.js";

interface MobileFiltersBarProps {
  fields: FilterField[];
  yearOptions: string[];
}

const rowSx: SxProps<Theme> = { display: "flex", alignItems: "center", gap: 2, minWidth: 0 };

const summarySx: SxProps<Theme> = { flex: 1, minWidth: 0 };

export const MobileFiltersBar = ({ fields, yearOptions }: MobileFiltersBarProps) => {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  const count = activeFilterCount(params, fields);
  const summary = filtersSummary(params, fields);
  const showsSearch = fields.includes("transaction");

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={rowSx}>
        <Badge badgeContent={count} color="primary" slotProps={{ badge: { "aria-hidden": true } }} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined" startIcon={<TuneIcon />} onClick={openSheet} sx={{ minHeight: 44 }}
            aria-haspopup="dialog" aria-expanded={open} aria-label={filtersButtonLabel(count)}
          >
            Filtros
          </Button>
        </Badge>
        <Typography variant="body2" color="text.secondary" noWrap sx={summarySx}>{summary}</Typography>
      </Box>
      {showsSearch && <Box sx={{ mt: 2 }}><SearchFilter fullWidth /></Box>}
      <FiltersSheet open={open} onClose={closeSheet} fields={fields} yearOptions={yearOptions} />
    </Box>
  );
};
```

`client/src/components/FiltersBar.tsx` (reemplazar el archivo entero):

```tsx
import { Box } from "@mui/material";
import type { FilterField } from "../filters/activeFilters.js";
import { useIsMobile } from "../useIsMobile.js";
import { FilterFields } from "./filters/FilterFields.js";
import { MobileFiltersBar } from "./filters/MobileFiltersBar.js";

export type { FilterField } from "../filters/activeFilters.js";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => {
  const isMobile = useIsMobile();

  if (isMobile) return <MobileFiltersBar fields={fields} yearOptions={yearOptions} />;

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      <FilterFields fields={fields} yearOptions={yearOptions} />
    </Box>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/FiltersBar.test.tsx client/src/pages/TransactionsPage.filters.test.tsx client/src/components/filters/`
Expected: PASS (11 tests nuevos en `FiltersBar.test.tsx`, 2 en `TransactionsPage.filters.test.tsx`; el resto sin cambios).

Run: `bun run test client/src/pages/ client/src/components/layout/`
Expected: PASS (las páginas, sin `matchMedia`, siguen en vista de compu).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filters/MobileFiltersBar.tsx client/src/components/FiltersBar.tsx client/src/components/FiltersBar.test.tsx client/src/pages/TransactionsPage.filters.test.tsx
git commit -m "feat(client): filtros en mobile con botón, contador, resumen y hoja" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se corrige en el task que corresponde).

- [ ] **Step 1: Suite, tipos y build**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: todo en verde.

- [ ] **Step 2: Servidor propio sin pisar otros**

Los puertos 4000, 4100, 4300 y 5173 son de otros procesos (otras sesiones y el servicio instalado). Con `client/dist` ya construido, levantar el server de este worktree en un puerto libre (4500; confirmarlo antes con `lsof -nP -iTCP:4500 -sTCP:LISTEN`, que no tiene que devolver nada), con el `.env` del checkout principal copiado a la raíz del worktree (está ignorado por git):

```bash
cp ../../../.env .env
PORT=4500 node --env-file=.env --import tsx server/src/index.ts
```

Correrlo en segundo plano y guardar su PID. El server sirve el cliente construido y la API en `http://localhost:4500`. Al terminar, matar **solo ese PID** y borrar el `.env` copiado (`rm .env`).

- [ ] **Step 3: Revisión visual**

En Chrome, a 375×667 (iPhone SE) y 393×852 (iPhone 14 Pro). Si la ventana no se puede achicar (pantalla completa), emular con iframes del mismo origen de esos tamaños. Recorrer las siete secciones con filtros: Dashboard, Cuotas, Movimientos, Créditos, Auto, Sueldo y Contexto. Checklist en mobile:

- Debajo del título hay una sola fila: «Filtros» (con ícono) y el resumen; sin filtros fuera del default, no se ve el número del `Badge`.
- Con `?year=2025&currency=USD&cardLabel=<una tarjeta>` en la URL: Dashboard muestra 3 y «2025 · USD · <tarjeta>»; Cuotas 3; Créditos, Auto, Sueldo y Contexto 1 y «2025».
- Con tres categorías en Movimientos el resumen dice «… · 3 categorías»; con una tarjeta de nombre largo el resumen termina en «…» y el botón no se corre. Ninguna página tiene scroll horizontal (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`).
- Tocar «Filtros» abre la hoja por encima de la barra inferior (la barra queda tapada por el fondo), con los campos uno debajo del otro a todo el ancho, la etiqueta del primero sin cortar y «Listo» visible por encima de la zona de la barra de inicio. Los menús de cada campo se abren por encima de la hoja.
- Cambiar un campo con la hoja abierta actualiza `location.search` y lo que se ve detrás al momento; la hoja sigue abierta; «Listo», deslizar hacia abajo y tocar el fondo la cierran, y el contador y el resumen ya muestran lo elegido.
- Movimientos: «Buscar comercio» está debajo del botón, a todo el ancho y fuera de la hoja; al escribir, la lista se filtra sin perder el foco ni hacer zoom (la letra del campo es de 16px); la hoja tiene Año, Moneda, Tarjeta, Mes, Categorías y Cuotas, y ningún campo de texto.
- Créditos, Auto, Sueldo y Contexto: la hoja trae solo Año.
- Agrandar la ventana a ≥ 900px con la hoja abierta: quedan los campos en línea, sin fondo oscuro ni scroll bloqueado.
- Importar: sus filtros (`ImportedFilesFilters`, fuera de alcance) se acomodan en varias líneas sin scroll horizontal.
- En 1280px: las siete barras de filtros se ven igual que en `main` (mismos campos, mismo orden, mismos anchos).

- [ ] **Step 4: Prueba en el iPhone (la hace el usuario después de mergear y `bun run deploy`)**

- La hoja de filtros no queda debajo de la barra inferior ni de la barra de inicio, y «Listo» se toca con el pulgar.
- Abrir un campo de la hoja muestra la lista de opciones sin teclado; elegir varias categorías y cerrar el menú deja la hoja abierta.
- En Movimientos, escribir en «Buscar comercio» con el teclado abierto: el campo queda a la vista y la lista se filtra mientras se escribe.
- Deslizar la hoja hacia abajo la cierra y el resumen muestra lo elegido.

Reportar al usuario el resultado de los Steps 1–3 con capturas y dejarle el checklist del Step 4.
