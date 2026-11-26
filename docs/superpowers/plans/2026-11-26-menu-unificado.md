# Menú unificado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar de 12 entradas sueltas a 5 secciones más Datos, cada una con solapas tipo pastilla arriba de la página, en un riel flotante en compu y en una barra de 5 en el celular.

**Architecture:** Las rutas no cambian. `navItems.ts` describe las secciones con sus solapas y expone funciones puras (`sectionOf`, `sectionPath`, `sectionTitle`, `hasTabs`). El `Layout` dibuja el encabezado de la sección de la ruta actual (título + pastillas) encima de la página, y las páginas dejan de dibujar su `h4`. El riel y la barra del celular leen las mismas secciones.

**Tech Stack:** React 18, TypeScript, MUI 6 (`@mui/material`, `@mui/icons-material`), react-router-dom 6, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-menu-unificado-y-filtros-design.md` (parte «Menú»). Mockup: https://claude.ai/artifact/M1LSCdYxWMQnV7619iZCUk (opción A, solapas «Pastillas», menú «Riel»).

## Global Constraints

- Rama `feat/menu-unificado` en un worktree propio (`git worktree add -b feat/menu-unificado .claude/worktrees/menu-unificado origin/main`, después `bun install --frozen-lockfile`): el árbol principal lo comparten otras sesiones. Commits con pathspec explícito, push con `git push -u origin feat/menu-unificado`, nunca a `main`, sin abrir PR.
- Commits sin trailers ni menciones de Claude. Mensajes como los del repo: `feat(client): …`, `test(client): …`, `docs: …`.
- Sin comentarios en el código. Componentes funcionales con props desestructuradas en la firma, interfaces para las props, sin `any`, `key` con id o ruta (nunca el índice), filtros y mapeos antes del `return`.
- Las secciones, sus solapas y las funciones sobre ellas viven en `client/src/components/layout/navItems.ts` con su spec; los componentes solo dibujan.
- Cada archivo de test nuevo lleva `afterEach(cleanup)` (el auto-cleanup de RTL está apagado).
- Tests: `bunx vitest run <ruta>` desde la raíz del worktree. Al cierre de cada task: `bun run test` y `bun run typecheck` en verde.
- Textos exactos: secciones «Inicio», «Gastos», «Ingresos», «Deudas», «Patrimonio», «Datos»; nombre del nav de pastillas `secciones de <Sección>`; nav del riel y de la barra `principal`.
- Las URLs no cambian. Todo link del menú conserva los filtros globales con `useNavSearch()`.

## Review Focus

- Una ruta fuera del menú (`/installments`, `/presupuestos`) no muestra encabezado ni marca ninguna entrada (tests en Tasks 2 y 3).
- Importar desde la pill de arriba: en `/import` el encabezado es «Datos» con «Importar» marcada y, en el celular, ninguna entrada de la barra queda marcada (tests en Tasks 2 y 4).
- Ventana de compu más baja que el riel: el riel scrollea por dentro y no se corta Datos (verificación en el navegador, Task 5).
- Celular de 390 px en Gastos: las 4 pastillas deslizan de costado sin que la página scrollee horizontalmente (verificación en el navegador, Task 5).
- Teclado: foco visible en las entradas del riel y en las pastillas (verificación en el navegador, Task 5).

---

### Task 1: Secciones del menú en `navItems.ts`

**Files:**
- Modify: `client/src/components/layout/navItems.ts`
- Test: `client/src/components/layout/navItems.test.ts`

**Interfaces:**
- Produces (las exportaciones viejas siguen hasta la Task 5):
  - `interface NavTab { to: string; label: string; icon: SvgIconComponent }`
  - `interface NavSection { id: string; label: string; icon: SvgIconComponent; tabs: NavTab[] }`
  - `NAV_SECTIONS: NavSection[]`: Inicio, Gastos, Ingresos, Deudas, Patrimonio.
  - `FOOTER_SECTIONS: NavSection[]`: Datos.
  - `sectionOf(pathname: string): NavSection | undefined`
  - `sectionPath(section: NavSection): string`: ruta de la primera solapa.
  - `sectionTitle(section: NavSection): string`: el nombre de la sección, o el de su única solapa.
  - `hasTabs(section: NavSection): boolean`: más de una solapa.
  - `RAIL = { width: 84, gap: 12 } as const`

Ids, íconos (`@mui/icons-material`, outlined) y solapas:

| id | label | icono | solapas (label → ruta, ícono) |
| --- | --- | --- | --- |
| `inicio` | Inicio | `SpaceDashboardOutlined` | Dashboard → `/` (`SpaceDashboardOutlined`) |
| `gastos` | Gastos | `ShoppingBagOutlined` | Movimientos → `/transactions` (`ReceiptLongOutlined`), Suscripciones → `/suscripciones` (`AutorenewOutlined`), Servicios → `/servicios` (`ElectricalServicesOutlined`), Vencimientos → `/vencimientos` (`EventNoteOutlined`) |
| `ingresos` | Ingresos | `PaymentsOutlined` | Sueldo → `/sueldo` (`PaymentsOutlined`), Flujo → `/flujo` (`SavingsOutlined`) |
| `deudas` | Deudas | `AccountBalanceOutlined` | Créditos → `/credits` (`AccountBalanceOutlined`), Auto → `/auto` (`DirectionsCarOutlined`) |
| `patrimonio` | Patrimonio | `AccountBalanceWalletOutlined` | Patrimonio → `/patrimonio` (`AccountBalanceWalletOutlined`), Contexto → `/contexto` (`InsightsOutlined`) |
| `datos` | Datos | `StorageOutlined` | Importar → `/import` (`UploadFileOutlined`), Reglas → `/rules` (`RuleOutlined`) |

- [ ] **Step 1: Escribir los tests que fallan** (nuevo `describe("secciones del menú")` en `navItems.test.ts`)

```ts
const tabLabels = (section: NavSection): string[] => section.tabs.map((tab) => tab.label);
const ALL = [...NAV_SECTIONS, ...FOOTER_SECTIONS];

it("el riel lleva Inicio, Gastos, Ingresos, Deudas y Patrimonio, y Datos al pie", () => {
  expect(NAV_SECTIONS.map(({ label }) => label)).toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio"]);
  expect(FOOTER_SECTIONS.map(({ label }) => label)).toEqual(["Datos"]);
});

it("cada sección tiene sus solapas en orden", () => {
  expect(Object.fromEntries(ALL.map((section) => [section.label, tabLabels(section)]))).toEqual({
    Inicio: ["Dashboard"],
    Gastos: ["Movimientos", "Suscripciones", "Servicios", "Vencimientos"],
    Ingresos: ["Sueldo", "Flujo"],
    Deudas: ["Créditos", "Auto"],
    Patrimonio: ["Patrimonio", "Contexto"],
    Datos: ["Importar", "Reglas"],
  });
});

it("cada ruta está en una sola sección y las ids no se repiten", () => {
  const routes = ALL.flatMap(({ tabs }) => tabs.map(({ to }) => to));
  expect(new Set(routes).size).toBe(13);
  expect(routes).toHaveLength(13);
  expect(new Set(ALL.map(({ id }) => id)).size).toBe(ALL.length);
});

it("sectionOf encuentra la sección de cualquier solapa y nada fuera del menú", () => {
  expect(sectionOf("/")?.id).toBe("inicio");
  expect(sectionOf("/suscripciones")?.id).toBe("gastos");
  expect(sectionOf("/auto")?.id).toBe("deudas");
  expect(sectionOf("/rules")?.id).toBe("datos");
  expect(sectionOf("/installments")).toBeUndefined();
  expect(sectionOf("/creditsx")).toBeUndefined();
});

it("sectionPath lleva a la primera solapa", () => {
  expect(ALL.map(sectionPath)).toEqual(["/", "/transactions", "/sueldo", "/credits", "/patrimonio", "/import"]);
});

it("el título es el nombre de la sección, salvo con una sola solapa", () => {
  expect(ALL.map(sectionTitle)).toEqual(["Dashboard", "Gastos", "Ingresos", "Deudas", "Patrimonio", "Datos"]);
  expect(ALL.map(hasTabs)).toEqual([false, true, true, true, true, true]);
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/layout/navItems.test.ts`
Expected: FAIL, `NAV_SECTIONS` no se exporta.

- [ ] **Step 3: Implementar las secciones y las funciones en `navItems.ts`** con la tabla de arriba. `sectionOf` compara la ruta exacta contra el `to` de cada solapa.

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run client/src/components/layout/navItems.test.ts`
Expected: PASS, los nuevos y los viejos.

- [ ] **Step 5: Commit** (el primer commit de la rama lleva también los docs)

```bash
git add docs/superpowers/specs/2026-11-26-menu-unificado-y-filtros-design.md docs/superpowers/plans/2026-11-26-menu-unificado.md docs/superpowers/plans/2026-11-26-filtros-compactos.md
git commit -m "docs: diseño y planes del menú unificado y los filtros compactos"
git add client/src/components/layout/navItems.ts client/src/components/layout/navItems.test.ts
git commit -m "feat(client): secciones del menú con sus solapas"
```

---

### Task 2: Encabezado de sección con pastillas, y las páginas sin su título

**Files:**
- Create: `client/src/components/layout/SectionTabs.tsx`, `client/src/components/layout/SectionHeader.tsx`
- Test: `client/src/components/layout/SectionHeader.test.tsx`
- Modify: `client/src/components/layout/Layout.tsx`, `client/src/components/layout/Layout.test.tsx`
- Modify (sacar el `h4`): `client/src/pages/DashboardPage.tsx:28`, `TransactionsPage.tsx:71`, `SubscriptionsPage.tsx:20`, `FixedServicesPage.tsx:53-61`, `VencimientosPage.tsx:34` (y sus 4 usos de `Title`), `PayslipsPage.tsx:55,64,74`, `CashFlowPage.tsx:26`, `CreditsPage.tsx:34`, `AutoPage.tsx:33`, `NetWorthPage.tsx:60-65`, `MacroPage.tsx:20` (y sus 3 usos de `Title`), `RulesPage.tsx:90-95`, `ImportPage.tsx:44`
- Modify (tests): `client/src/pages/CashFlowPage.test.tsx:59`, `FixedServicesPage.test.tsx:106-111`, `NetWorthPage.test.tsx:125-130`, `VencimientosPage.test.tsx:71,108-113`, `SubscriptionsPage.test.tsx:66-69,194`

**Interfaces:**
- Consumes: `NavSection`, `sectionOf`, `sectionTitle`, `hasTabs` (Task 1); `useNavSearch()` (`components/layout/useNavSearch.ts`).
- Produces: `SectionHeader = ({ section }: SectionHeaderProps)` con `interface SectionHeaderProps { section: NavSection }`, y `SectionTabs = ({ section }: SectionTabsProps)` con la misma forma.

- [ ] **Step 1: Escribir los tests que fallan** (`SectionHeader.test.tsx`, con `renderWithProviders` y la sección sacada con `sectionOf`)

```tsx
const pills = (name: string) => screen.getByRole("navigation", { name: `secciones de ${name}` });

it("en Gastos muestra el título y las cuatro solapas en orden", () => {
  renderWithProviders(<SectionHeader section={sectionOf("/suscripciones")!} />, { route: "/suscripciones" });
  expect(screen.getByRole("heading", { level: 4, name: "Gastos" })).toBeInTheDocument();
  expect(within(pills("Gastos")).getAllByRole("link").map((link) => link.textContent))
    .toEqual(["Movimientos", "Suscripciones", "Servicios", "Vencimientos"]);
});

it("marca la solapa de la ruta actual", () => {
  renderWithProviders(<SectionHeader section={sectionOf("/suscripciones")!} />, { route: "/suscripciones" });
  expect(within(pills("Gastos")).getByRole("link", { name: "Suscripciones" })).toHaveAttribute("aria-current", "page");
  expect(within(pills("Gastos")).getByRole("link", { name: "Movimientos" })).not.toHaveAttribute("aria-current");
});

it("las solapas conservan los filtros globales y descartan los de Movimientos", () => {
  renderWithProviders(<SectionHeader section={sectionOf("/transactions")!} />, {
    route: "/transactions?year=2025&currency=USD&category=Compras&search=uber",
  });
  expect(within(pills("Gastos")).getByRole("link", { name: "Servicios" })).toHaveAttribute("href", "/servicios?year=2025&currency=USD");
});

it("Inicio se titula Dashboard y no tiene solapas", () => {
  renderWithProviders(<SectionHeader section={sectionOf("/")!} />);
  expect(screen.getByRole("heading", { level: 4, name: "Dashboard" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
```

En `Layout.test.tsx`, dentro del `describe("Layout")`:

```tsx
it("arriba de la página muestra la sección de la ruta con sus solapas", () => {
  renderLayout("/flujo");
  expect(screen.getByRole("heading", { level: 4, name: "Ingresos" })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "secciones de Ingresos" })).getByRole("link", { name: "Flujo" }))
    .toHaveAttribute("aria-current", "page");
});

it("importar desde la pill abre Datos con Importar marcada", () => {
  renderLayout("/import");
  expect(screen.getByRole("heading", { level: 4, name: "Datos" })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "secciones de Datos" })).getByRole("link", { name: "Importar" }))
    .toHaveAttribute("aria-current", "page");
});

it("fuera del menú no muestra encabezado de sección", () => {
  renderLayout("/installments");
  expect(screen.queryByRole("heading", { level: 4 })).not.toBeInTheDocument();
});
```

Y el test existente «marca como activa solo la sección de la ruta actual» busca los links con `within(mainNavigation())`, porque ahora «Créditos» también es una pastilla.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/layout`
Expected: FAIL, no existe `SectionHeader.js` y el Layout no muestra el encabezado.

- [ ] **Step 3: Implementar `SectionTabs` y `SectionHeader`**

`SectionTabs`: `Box component="nav"` con `aria-label` `secciones de ${section.label}`. Adentro, un contenedor tipo pastilla (`display: inline-flex`, `maxWidth: "100%"`, `overflowX: "auto"`, sin scrollbar visible, `p: 0.5`, `gap: 0.5`, `borderRadius: 999`, `bgcolor: background.paper`, borde `divider`). Cada solapa es un `ButtonBase component={NavLink}` a `{ pathname: tab.to, search }`, con el ícono `fontSize="small"`, el label, `px: 1.75`, `py: 0.875`, `borderRadius: 999`, `gap: 1`, `flexShrink: 0`, 14 px y peso 500 en `text.secondary`. En `&.active`: `primary.main`, fondo `alpha(primary.main, 0.12)` y peso 600, igual que `sidebarItemSx`. NavLink pone `aria-current="page"` solo.

`SectionHeader`: `Typography variant="h4"` con `sectionTitle(section)` (`mb: 2` si `hasTabs`, `mb: 3` si no) y, si `hasTabs`, `<SectionTabs>` con `mb: 3`.

- [ ] **Step 4: Dibujar el encabezado en el `Layout`**: `const section = sectionOf(useLocation().pathname)` y, dentro del `Container`, `{section && <SectionHeader section={section} />}` antes de `children`.

- [ ] **Step 5: Sacar el título de las páginas del menú** (lista de Files). Se conservan la intro y los botones. Donde el título compartía fila con un botón (Servicios, Patrimonio, Reglas, Vencimientos), la fila queda con lo que tenía. En Servicios la intro pasa a esa fila, a la izquierda del botón, con el `mb: 3` que tenía la intro. Si en la fila queda solo el botón o el selector, se alinea al final (`justifyContent: "flex-end"`). Cuotas y Presupuestos conservan su título.

- [ ] **Step 6: Ajustar los tests de las páginas**: borrar las aserciones de `heading level 4` de la lista de Files. Los tests que se llamaban «…muestra el título…» pasan a afirmar lo que queda: la intro, el spinner o el error.

- [ ] **Step 7: Correr todo y ver que pasa**

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/layout/SectionTabs.tsx client/src/components/layout/SectionHeader.tsx client/src/components/layout/SectionHeader.test.tsx client/src/components/layout/Layout.tsx client/src/components/layout/Layout.test.tsx client/src/pages
git commit -m "feat(client): encabezado de sección con solapas en pastilla"
```

---

### Task 3: Riel flotante en compu

**Files:**
- Create: `client/src/components/layout/RailLink.tsx`
- Modify: `client/src/components/layout/DesktopSidebar.tsx` (se reescribe), `client/src/components/layout/Layout.tsx`, `client/src/components/layout/Brand.tsx` (sacar la prop `compact`, que queda sin uso), `client/src/components/layout/Layout.test.tsx`
- Delete: `client/src/components/layout/SidebarNav.tsx`, `client/src/components/layout/sidebarItemSx.ts`, `client/src/components/layout/useSidebarCollapsed.ts`

**Interfaces:**
- Consumes: `NAV_SECTIONS`, `FOOTER_SECTIONS`, `sectionOf`, `sectionPath`, `RAIL` (Task 1); `LedgerlyMark`; `useNavSearch()`.
- Produces: `DesktopSidebar = ()`, sin props. `RailLink = ({ section, active }: RailLinkProps)` con `interface RailLinkProps { section: NavSection; active: boolean }`.

- [ ] **Step 1: Reescribir los tests de compu en `Layout.test.tsx`**. Salen «separa los grupos…», «con la sidebar colapsada…», «colapsar la sidebar…», «expandir la sidebar…» y «recuerda la sidebar colapsada…». Se reemplazan «muestra cada sección como link…» y «todos los links conservan los filtros…»:

```tsx
it("el riel muestra cada sección con su nombre y Datos al pie, separado por una línea", () => {
  renderLayout();
  expect(within(mainNavigation()).getAllByRole("link").map((link) => link.textContent))
    .toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio", "Datos"]);
  expect(within(mainNavigation()).getAllByRole("separator")).toHaveLength(1);
});

it("cada entrada lleva a su primera solapa con los filtros globales", () => {
  renderLayout("/transactions?year=2025&currency=USD&category=Compras&search=uber");
  const hrefs = within(mainNavigation()).getAllByRole("link").map((link) => link.getAttribute("href"));
  expect(hrefs).toEqual(["/", "/transactions", "/sueldo", "/credits", "/patrimonio", "/import"].map((path) => `${path}?year=2025&currency=USD`));
});

it("marca la sección de la ruta aunque no sea su primera solapa", () => {
  renderLayout("/auto");
  expect(within(mainNavigation()).getByRole("link", { name: "Deudas" })).toHaveAttribute("aria-current", "page");
  expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
});

it("fuera del menú ninguna entrada del riel queda marcada", () => {
  renderLayout("/installments");
  expect(within(mainNavigation()).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
});
```

«en compu no muestra la barra inferior» pasa a afirmar que hay link «Datos» en `mainNavigation()` y no hay botón «Más». En el `describe` de mobile, «no monta la sidebar de compu» pasa a afirmar que no hay link «Datos» en `mainNavigation()`.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/layout/Layout.test.tsx`
Expected: FAIL, el menú sigue con las 12 entradas.

- [ ] **Step 3: Implementar `RailLink`**: `ButtonBase component={Link}` a `{ pathname: sectionPath(section), search }` con `aria-current={active ? "page" : undefined}`. Es una grilla centrada con `gap: 0.5`, `py: 0.5` y ancho completo. Arriba va un indicador de 52 × 30 px con `borderRadius: 999` y el ícono adentro; abajo, el label en 11 px, peso 500, `noWrap`. Hover: el indicador toma `action.hover`. En `&[aria-current='page']`: color `primary.main`, label peso 600 e indicador con fondo `alpha(primary.main, 0.12)`.

- [ ] **Step 4: Reescribir `DesktopSidebar` como riel**: `Drawer variant="permanent"` con el raíz de ancho `RAIL.width + RAIL.gap` y `flexShrink: 0`. El papel lleva `top` y `left` en `RAIL.gap`, `width: RAIL.width`, `height: "auto"`, `maxHeight: calc(100vh - 2 × RAIL.gap)`, `overflowY: "auto"`, `borderRadius: "28px"`, borde completo `divider` (pisa el `borderRight` del tema), fondo `alpha(background.paper, 0.55)` con `backdropFilter: "blur(14px) saturate(140%)"` y la sombra de `TopActionsPill`. Adentro: `LedgerlyMark` centrado en una franja de 60 px, `nav aria-label="principal"` con `RailLink` por cada sección de `NAV_SECTIONS`, un `Divider` y las de `FOOTER_SECTIONS`. `active` sale de `sectionOf(pathname)?.id === section.id`.

- [ ] **Step 5: Limpiar el colapsar**: el `Layout` deja de usar `useSidebarCollapsed` y renderiza `<DesktopSidebar />`. Se borran `SidebarNav.tsx`, `sidebarItemSx.ts` y `useSidebarCollapsed.ts`, y `Brand` pierde la prop `compact`.

- [ ] **Step 6: Correr todo y ver que pasa**

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/layout/RailLink.tsx client/src/components/layout/DesktopSidebar.tsx client/src/components/layout/Layout.tsx client/src/components/layout/Layout.test.tsx client/src/components/layout/Brand.tsx client/src/components/layout/SidebarNav.tsx client/src/components/layout/sidebarItemSx.ts client/src/components/layout/useSidebarCollapsed.ts
git commit -m "feat(client): menú lateral como riel flotante"
```

---

### Task 4: Barra del celular con las 5 secciones

**Files:**
- Modify: `client/src/components/layout/MobileBottomNav.tsx`, `client/src/components/layout/Layout.test.tsx`
- Delete: `client/src/components/layout/MoreSheet.tsx`, `client/src/components/layout/MoreSheet.test.tsx`

**Interfaces:**
- Consumes: `NAV_SECTIONS`, `sectionOf`, `sectionPath` (Task 1); `useNavSearch()`.
- Produces: `MobileBottomNav = ()`, sin props, y sigue exportando `MOBILE_NAV_HEIGHT`.

- [ ] **Step 1: Reescribir los tests de mobile en `Layout.test.tsx`**. Salen los cinco tests de «Más»: «la barra inferior muestra Inicio, Movimientos y Más», «en una sección de «Más»…», ««Más» abre el resto…», «si la ruta cambia con «Más» abierto…», «con teclado, «Más»…» y «si la pantalla pasa a tamaño compu con «Más» abierto…». También se van `moreSheet` y `moreButton`. Se reemplazan «marca la sección actual de la barra…» y el de filtros:

```tsx
it("la barra muestra Inicio, Gastos, Ingresos, Deudas y Patrimonio, sin «Más»", () => {
  renderLayout();
  expect(within(mainNavigation()).getAllByRole("link").map((link) => link.textContent))
    .toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio"]);
  expect(within(mainNavigation()).queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
});

it("marca la sección de la ruta actual", () => {
  renderLayout("/suscripciones");
  expect(within(mainNavigation()).getByRole("link", { name: "Gastos" })).toHaveAttribute("aria-current", "page");
  expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
});

it("en Datos ninguna entrada de la barra queda marcada", () => {
  renderLayout("/rules");
  expect(within(mainNavigation()).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
});

it("los links de la barra conservan los filtros globales y descartan los de Movimientos", () => {
  renderLayout("/transactions?year=2025&currency=USD&category=Compras");
  expect(within(mainNavigation()).getByRole("link", { name: "Gastos" })).toHaveAttribute("href", "/transactions?year=2025&currency=USD");
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run client/src/components/layout/Layout.test.tsx`
Expected: FAIL, la barra sigue con Inicio, Movimientos y Más.

- [ ] **Step 3: Reescribir `MobileBottomNav`**: una celda por sección de `NAV_SECTIONS` (`gridTemplateColumns: repeat(NAV_SECTIONS.length, minmax(0, 1fr))`). Cada celda es un `ButtonBase component={Link}` a `{ pathname: sectionPath(section), search }`, con `aria-current` según `sectionOf(pathname)`, el ícono y `section.label`. Conserva `itemSx` y `barSx`. Sale todo lo de «Más» (estado, efecto y `MoreSheet`).

- [ ] **Step 4: Borrar `MoreSheet.tsx` y `MoreSheet.test.tsx`.**

- [ ] **Step 5: Correr todo y ver que pasa**

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/layout/MobileBottomNav.tsx client/src/components/layout/Layout.test.tsx client/src/components/layout/MoreSheet.tsx client/src/components/layout/MoreSheet.test.tsx
git commit -m "feat(client): barra del celular con las secciones del menú"
```

---

### Task 5: Limpieza de `navItems.ts`, verificación en el navegador y push

**Files:**
- Modify: `client/src/components/layout/navItems.ts`, `client/src/components/layout/navItems.test.ts`

- [ ] **Step 1: Sacar de `navItems.ts` lo que ya no usa nadie**: `NavPlacement`, `NavItem`, `NavGroup`, `NAV_GROUPS`, `NAV_ITEMS`, `BAR_ITEMS`, `MORE_GROUPS`, `MORE_ITEMS`, `isMoreRoute`, `SIDEBAR_WIDTH` y los íconos sin uso. Del spec salen los `describe` «grupos del menú» y «secciones en mobile».

Run: `grep -rn "NAV_GROUPS\|NAV_ITEMS\|BAR_ITEMS\|MORE_\|isMoreRoute\|SIDEBAR_WIDTH" client/src`
Expected: sin resultados.

- [ ] **Step 2: Correr todo**

Run: `bun run test && bun run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/navItems.ts client/src/components/layout/navItems.test.ts
git commit -m "refactor(client): saca los grupos viejos del menú"
```

- [ ] **Step 4: Verificar en el navegador** (skill `run`; el puerto 4100 es del servicio instalado, usar otro). En compu (1280 × 800) y celular (390 × 844), en claro y oscuro:
  - El riel flota separado del borde, con las 6 entradas y Datos al pie.
  - En Gastos se ven el título y las 4 pastillas; cambiar de solapa no hace parpadear el encabezado.
  - Con la ventana de compu a 1280 × 500, el riel scrollea por dentro.
  - En el celular, en Gastos, las pastillas deslizan de costado y la página no se mueve horizontalmente.
  - Con Tab, el foco se ve en las entradas del riel y en las pastillas.
  - El botón de importar lleva a Datos con Importar marcada.

  Sacar capturas antes y después (`main` contra la rama) en compu y celular para el PR.

- [ ] **Step 5: Push**

```bash
git push -u origin feat/menu-unificado
```
