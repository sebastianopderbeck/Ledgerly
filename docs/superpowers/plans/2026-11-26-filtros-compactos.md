# Filtros compactos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En Movimientos, Importar y Dashboard, dejar la búsqueda siempre a la vista y a lo ancho, y esconder el resto de los filtros detrás de un botón «Filtros» con el número de filtros activos y el resumen al lado.

**Architecture:** Un componente de presentación compartido (`CollapsibleFiltersBar`) dibuja la fila compacta y el panel que se despliega en la página. La regla de cuándo compactar y los conteos y resúmenes viven en el dominio: `filters/activeFilters.ts` para los filtros de la URL e `importedFiles.ts` para los de Importar. `FiltersBar` (compu) e `ImportedFilesFilters` lo usan. En el celular, `MobileFiltersBar` mantiene su hoja, pone la búsqueda arriba y deja de contarla.

**Tech Stack:** React 18, TypeScript, MUI 6, react-router-dom 6, Vitest + Testing Library + user-event.

**Spec:** `docs/superpowers/specs/2026-11-26-menu-unificado-y-filtros-design.md` (parte «Filtros»).

## Global Constraints

- Rama `feat/filtros-compactos` en un worktree propio (`git worktree add -b feat/filtros-compactos .claude/worktrees/filtros-compactos origin/main`, después `bun install --frozen-lockfile`). Commits con pathspec explícito, push con `git push -u origin feat/filtros-compactos`, nunca a `main`, sin abrir PR.
- Commits sin trailers ni menciones de Claude. Mensajes como los del repo: `feat(client): …`, `test(client): …`.
- Sin comentarios en el código. Componentes funcionales con props desestructuradas en la firma, interfaces para las props, sin `any`, lógica antes del `return`.
- Las reglas y los textos derivados (cuándo compactar, conteos, resúmenes) van en el dominio con spec; los componentes solo dibujan.
- Cada archivo de test nuevo lleva `afterEach(cleanup)`.
- Tests: `bunx vitest run <ruta>` desde la raíz del worktree. Al cierre de cada task: `bun run test` y `bun run typecheck` en verde.
- Regla de compactar: hay búsqueda (`"transaction"` en los campos) o hay más de un campo. Con un solo campo que no es búsqueda (Año), la barra queda como hoy.
- Textos exactos: el botón usa `filtersButtonLabel(count)` («Filtros», «Filtros, 1 activo», «Filtros, 2 activos»); el panel es un `group` con nombre «Más filtros»; separador del resumen « · ».

## Review Focus

- Movimientos con solo la búsqueda escrita: el botón dice «Filtros», sin número, en compu y en el celular (tests en Tasks 3 y 4).
- Panel abierto y cambio de varios filtros seguidos: el panel sigue abierto y cada cambio va a la URL al momento (test en Task 3).
- Importar con tipo, año y «Solo a revisar» elegidos y el panel cerrado: el resumen dice qué está aplicado (test en Task 4).
- Páginas con solo Año (Sueldo, Créditos…): el selector sigue a la vista y no aparece «Filtros» en compu (test en Task 3).
- Compu angosta (alrededor de 900 px): la búsqueda baja a su propia línea antes de aplastar el botón; el resumen se corta con «…» y no empuja la página (verificación en el navegador, Task 5).

---

### Task 1: Reglas y conteos en el dominio

**Files:**
- Modify: `client/src/filters/activeFilters.ts`, `client/src/importedFiles.ts`
- Test: `client/src/filters/activeFilters.test.ts`, `client/src/importedFiles.test.ts`

**Interfaces:**
- Produces:
  - `isCompactFilters(fields: FilterField[]): boolean`
  - `hiddenFilterCount(params: URLSearchParams, fields: FilterField[]): number`: igual a `activeFilterCount`, pero sin contar `search`.
  - `importedFilesHiddenCount(filters: ImportedFilesFilters): number`: cuenta los tipos elegidos, el año y «Solo a revisar»; nunca la búsqueda.
  - `importedFilesSummary(filters: ImportedFilesFilters): string`: un tipo da su label, varios dan `${n} tipos`; después el año y «Solo a revisar», unidos con « · ». Sin nada elegido, `""`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

it("compacta con búsqueda o con más de un campo", () => {
  expect(isCompactFilters(["year"])).toBe(false);
  expect(isCompactFilters(["transaction"])).toBe(true);
  expect(isCompactFilters(["year", "currency"])).toBe(true);
  expect(isCompactFilters(DASHBOARD)).toBe(true);
});

it("el conteo de filtros ocultos no cuenta la búsqueda", () => {
  const params = new URLSearchParams("search=uber&category=Compras");
  expect(activeFilterCount(params, TRANSACTIONS)).toBe(2);
  expect(hiddenFilterCount(params, TRANSACTIONS)).toBe(1);
  expect(hiddenFilterCount(new URLSearchParams("search=uber"), TRANSACTIONS)).toBe(0);
});

it("sin búsqueda el conteo de ocultos es el mismo", () => {
  expect(hiddenFilterCount(new URLSearchParams("year=2025&currency=USD"), DASHBOARD)).toBe(2);
});
```

En `importedFiles.test.ts`:

```ts
it("sin nada elegido no cuenta ni resume", () => {
  expect(importedFilesHiddenCount(EMPTY_IMPORTED_FILES_FILTERS)).toBe(0);
  expect(importedFilesSummary(EMPTY_IMPORTED_FILES_FILTERS)).toBe("");
});

it("cuenta y resume tipo, año y solo a revisar, nunca la búsqueda", () => {
  const filters = { kinds: ["payslip"], year: "2025", search: "recibo", onlyNeedsReview: true } satisfies ImportedFilesFilters;
  expect(importedFilesHiddenCount(filters)).toBe(3);
  expect(importedFilesSummary(filters)).toBe("Sueldo · 2025 · Solo a revisar");
});

it("con varios tipos los cuenta", () => {
  expect(importedFilesSummary({ ...EMPTY_IMPORTED_FILES_FILTERS, kinds: ["statement", "coupon"] })).toBe("2 tipos");
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/filters/activeFilters.test.ts client/src/importedFiles.test.ts`
Expected: FAIL, las funciones no se exportan.

- [ ] **Step 3: Implementar las cuatro funciones** en los archivos de la sección Files. `hiddenFilterCount` se arma sobre `activeFilterCount` y descuenta 1 cuando hay `search` y los campos incluyen `"transaction"`.

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run client/src/filters/activeFilters.test.ts client/src/importedFiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/filters/activeFilters.ts client/src/filters/activeFilters.test.ts client/src/importedFiles.ts client/src/importedFiles.test.ts
git commit -m "feat(client): cuándo compactar los filtros y cuántos quedan ocultos"
```

---

### Task 2: Fila compacta de filtros

**Files:**
- Create: `client/src/components/filters/CollapsibleFiltersBar.tsx`
- Test: `client/src/components/filters/CollapsibleFiltersBar.test.tsx`

**Interfaces:**
- Consumes: `filtersButtonLabel(count: number): string` (`filters/activeFilters.ts`).
- Produces: `CollapsibleFiltersBar = ({ search, count, summary, children }: CollapsibleFiltersBarProps)` con `interface CollapsibleFiltersBarProps { search?: ReactNode; count: number; summary: string; children: ReactNode }`.

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
const renderBar = (search?: ReactNode, count = 2) => renderWithProviders(
  <CollapsibleFiltersBar search={search} count={count} summary="2025 · USD">
    <input aria-label="Moneda" />
  </CollapsibleFiltersBar>,
);
const filtersButton = () => screen.getByRole("button", { name: /^Filtros/ });

it("muestra la búsqueda, el botón con el contador y el resumen, con los filtros escondidos", () => {
  renderBar(<input aria-label="Buscar comercio" />);
  expect(screen.getByRole("textbox", { name: "Buscar comercio" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Filtros, 2 activos" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("2025 · USD")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Moneda" })).not.toBeInTheDocument();
});

it("la búsqueda va antes del botón", () => {
  renderBar(<input aria-label="Buscar comercio" />);
  const search = screen.getByRole("textbox", { name: "Buscar comercio" });
  expect(search.compareDocumentPosition(filtersButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("tocar Filtros despliega el resto y volver a tocarlo lo esconde", async () => {
  renderBar();
  await userEvent.click(filtersButton());
  expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
  expect(within(screen.getByRole("group", { name: "Más filtros" })).getByRole("textbox", { name: "Moneda" })).toBeInTheDocument();
  await userEvent.click(filtersButton());
  await waitFor(() => expect(screen.queryByRole("group", { name: "Más filtros" })).not.toBeInTheDocument());
});

it("sin filtros activos el botón se llama solo Filtros", () => {
  renderBar(undefined, 0);
  expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/filters/CollapsibleFiltersBar.test.tsx`
Expected: FAIL, no existe el módulo.

- [ ] **Step 3: Implementar `CollapsibleFiltersBar`**: un `Box` con `mb: 3`. Adentro va una fila flex (`gap: 2`, `alignItems: "center"`, `flexWrap: "wrap"`). La fila lleva la búsqueda, si vino, en un `Box` con `flex: "1 1 320px"` y `minWidth: 0`. Sigue el `Badge` con el botón «Filtros» igual al de `MobileFiltersBar` (`variant="outlined"`, ícono `Tune`, badge `aria-hidden`), con `aria-expanded`, `aria-controls` (id de `useId`) y `aria-label={filtersButtonLabel(count)}`. Cierra la fila el resumen en `Typography variant="body2"` `color="text.secondary"` `noWrap`, con `minWidth: 0` y `flex: "0 1 auto"`. Debajo, `Collapse in={open} unmountOnExit` con un `Box` (ese id, `role="group"`, `aria-label="Más filtros"`, flex con `gap: 2`, `flexWrap: "wrap"`, `pt: 2`) que lleva `children`. El estado `open` arranca en `false`.

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run client/src/components/filters/CollapsibleFiltersBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filters/CollapsibleFiltersBar.tsx client/src/components/filters/CollapsibleFiltersBar.test.tsx
git commit -m "feat(client): fila de filtros compacta con panel desplegable"
```

---

### Task 3: `FiltersBar` compacta en compu, búsqueda primero en el celular

**Files:**
- Modify: `client/src/components/FiltersBar.tsx`, `client/src/components/filters/MobileFiltersBar.tsx`
- Test: `client/src/components/FiltersBar.test.tsx`

**Interfaces:**
- Consumes: `isCompactFilters`, `hiddenFilterCount`, `filtersSummary` (Task 1); `CollapsibleFiltersBar` (Task 2); `SearchFilter`, `FilterFields` (sin cambios).
- Produces: `FiltersBar` mantiene sus props (`fields`, `yearOptions`), así que las páginas no cambian.

- [ ] **Step 1: Ajustar y sumar tests en `FiltersBar.test.tsx`**. Agregar el helper `const openFilters = () => userEvent.click(screen.getByRole("button", { name: /^Filtros/ }));`. Lo llaman primero los tests de compu que hoy usan campos compactos: «ofrece un filtro de tarjeta…», «permite filtrar por varias categorías», «ofrece un filtro de cuotas…», «el Mes lista solo meses…» y «sacar el año del Mes…». Se reemplazan «en compu muestra los campos en línea, en el orden de siempre» y «en compu sigue mostrando los campos en línea, sin botón Filtros»:

```tsx
it("en compu deja la búsqueda a la vista y el resto detrás de Filtros, en el orden de siempre", async () => {
  emulateDesktop();
  const { container } = renderBar(["year", "currency", "card", "month", "transaction"], "/transactions");
  expect(screen.getByRole("textbox", { name: "Buscar comercio" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /año/i })).not.toBeInTheDocument();
  await openFilters();
  expect(labelsIn(container)).toEqual(["Buscar comercio", "Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas"]);
});

it("en compu, con solo Año, el selector sigue a la vista y no hay botón Filtros", () => {
  emulateDesktop();
  renderBar(["year"]);
  expect(screen.getByRole("combobox", { name: /año/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Filtros/ })).not.toBeInTheDocument();
});

it("en compu, con varios campos y sin búsqueda, muestra el botón y el resumen", () => {
  emulateDesktop();
  renderBar(["year", "currency"], "/?year=2025&currency=USD");
  expect(screen.getByRole("button", { name: "Filtros, 2 activos" })).toBeInTheDocument();
  expect(screen.getByText("2025 · USD")).toBeInTheDocument();
});

it("en compu el número de Filtros no cuenta la búsqueda", () => {
  emulateDesktop();
  renderBar(["transaction"], "/transactions?search=uber&category=Compras");
  expect(screen.getByRole("button", { name: "Filtros, 1 activo" })).toBeInTheDocument();
});

it("en compu el panel queda abierto mientras se cambian varios filtros", async () => {
  emulateDesktop();
  renderBar(["year", "currency", "transaction"], "/transactions?year=2026");
  await openFilters();
  const year = await openSelect(/año/i);
  await userEvent.click(within(year).getByRole("option", { name: "2025" }));
  await userEvent.keyboard("{Escape}");
  const installments = await openSelect(/cuotas/i);
  await userEvent.click(within(installments).getByRole("option", { name: "Solo cuotas" }));
  expect(screen.getByRole("group", { name: "Más filtros" })).toBeInTheDocument();
  expect(currentParams().get("installment")).toBe("true");
});
```

`labelsIn` es el helper que ya usa `FilterFields.test.tsx`: los labels en orden de documento. Si `FiltersBar.test.tsx` todavía no lo tiene, se copia. En el `describe` de mobile:

```tsx
it("en el celular la búsqueda va arriba del botón Filtros", () => {
  renderBar(TRANSACTIONS, "/transactions");
  const search = screen.getByRole("textbox", { name: "Buscar comercio" });
  expect(search.compareDocumentPosition(screen.getByRole("button", { name: /^Filtros/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("en el celular el número de Filtros no cuenta la búsqueda", () => {
  renderBar(TRANSACTIONS, "/transactions?search=uber");
  expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/FiltersBar.test.tsx`
Expected: FAIL, en compu los campos siguen en línea y en el celular la búsqueda va abajo.

- [ ] **Step 3: Implementar**. En `FiltersBar`, para compu: si `!isCompactFilters(fields)`, queda la fila de hoy. Si no, va `CollapsibleFiltersBar` con:
  - `search={fields.includes("transaction") ? <SearchFilter fullWidth /> : undefined}`
  - `count={hiddenFilterCount(params, fields)}`
  - `summary={filtersSummary(params, fields)}`
  - como `children`, `<FilterFields fields={fields} yearOptions={yearOptions} withSearch={false} />`

  `params` sale de `useSearchParams()`. En `MobileFiltersBar`, la búsqueda pasa arriba de la fila del botón (`mb: 2` en vez de `mt: 2`) y el contador usa `hiddenFilterCount`.

- [ ] **Step 4: Correr todo y ver que pasa** (incluye `pages/TransactionsPage.filters.test.tsx` y `DashboardPage.test.tsx`, que usan la barra)

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FiltersBar.tsx client/src/components/filters/MobileFiltersBar.tsx client/src/components/FiltersBar.test.tsx
git commit -m "feat(client): en compu la búsqueda queda a la vista y el resto detrás de Filtros"
```

---

### Task 4: Filtros de Importar compactos

**Files:**
- Modify: `client/src/components/ImportedFilesFilters.tsx`
- Test: `client/src/components/ImportedFilesSection.test.tsx`

**Interfaces:**
- Consumes: `importedFilesHiddenCount`, `importedFilesSummary` (Task 1); `CollapsibleFiltersBar` (Task 2).
- Produces: `ImportedFilesFilters` mantiene sus props (`filters`, `yearOptions`, `onChange`).

- [ ] **Step 1: Ajustar y sumar tests en `ImportedFilesSection.test.tsx`**. Agregar `const openFilters = () => userEvent.click(screen.getByRole("button", { name: /^Filtros/ }));` y llamarlo antes de elegir en «filtra por tipo», «filtra por año del documento» y «muestra solo los que hay que revisar». Sumar:

```tsx
it("la búsqueda queda a la vista y el botón cuenta y resume lo elegido, sin la búsqueda", async () => {
  renderWithProviders(<ImportedFilesSection />);
  await screen.findByText("visa-julio.pdf");
  expect(screen.queryByRole("combobox", { name: /tipo/i })).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: /buscar/i }), "recibo");
  await openFilters();
  await pickOption(/tipo/i, "Sueldo");
  expect(screen.getByRole("button", { name: "Filtros, 1 activo" })).toBeInTheDocument();
  expect(screen.getByText("Sueldo")).toBeInTheDocument();
});
```

Si «Sueldo» aparece más de una vez (en la tabla), buscar el resumen dentro del padre del botón «Filtros».

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/ImportedFilesSection.test.tsx`
Expected: FAIL, no hay botón «Filtros».

- [ ] **Step 3: Implementar**: `ImportedFilesFilters` pasa a ser `CollapsibleFiltersBar` con:
  - `search`: el `TextField` «Buscar archivo o detalle», `fullWidth`.
  - `count={importedFilesHiddenCount(filters)}`
  - `summary={importedFilesSummary(filters)}`
  - como `children`, los selects Tipo y Año y el switch «Solo a revisar», tal como están hoy.

- [ ] **Step 4: Correr todo y ver que pasa**

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ImportedFilesFilters.tsx client/src/components/ImportedFilesSection.test.tsx
git commit -m "feat(client): filtros de Importar con la búsqueda a la vista"
```

---

### Task 5: Verificación en el navegador y push

- [ ] **Step 1: Verificar en el navegador** (skill `run`; el puerto 4100 es del servicio instalado, usar otro). En compu (1280 × 800 y 900 × 800) y celular (390 × 844), en claro y oscuro:
  - En Movimientos, la búsqueda ocupa el ancho y «Filtros» abre el panel; con categoría y búsqueda puestas, el botón dice «Filtros, 1 activo» y el resumen nombra la categoría.
  - En Dashboard se ven el botón y el resumen, sin búsqueda.
  - En Sueldo y Créditos el selector de Año sigue a la vista.
  - En Importar, la búsqueda queda a la vista y Tipo, Año y «Solo a revisar» quedan en el panel.
  - A 900 px la búsqueda pasa a su propia línea y el resumen largo se corta con «…».
  - En el celular, la búsqueda va arriba del botón «Filtros».

  Sacar capturas antes y después para el PR.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/filtros-compactos
```
