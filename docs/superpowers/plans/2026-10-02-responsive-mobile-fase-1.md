# Responsive mobile — Fase 1 (base: navegación, layout e instalable) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En pantallas de menos de 900px, Ledgerly navega con una barra inferior (Inicio, Cuotas, Movimientos, Importar, Más), respeta las zonas seguras del iPhone y se puede instalar desde Safari como app a pantalla completa, sin cambiar nada de la vista de compu.

**Architecture:** Un hook `useIsMobile()` decide la estructura: `Layout` monta `DesktopSidebar` en compu y `MobileBottomNav` en mobile. «Más» abre `MoreSheet`, construido sobre un `BottomSheet` genérico (`SwipeableDrawer` desde abajo) que reusan las fases siguientes. Los links de la barra y de «Más» arrastran los filtros globales con `globalSearch` (del filtro de año). Lo que es solo layout (espacios, tipografía, hover) se resuelve en `sx` y en el tema; lo instalable es estático (manifest, íconos, metas) más un hook que sincroniza `theme-color` con el modo.

**Tech Stack:** React 18 + MUI 6.5 + react-router 6 (cliente); Vitest + Testing Library en jsdom; Bun como runner; `qlmanage` + `sips` de macOS para generar los PNG.

**Spec:** `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md` (sección "Fase 1")

## Prerrequisitos

El working tree de Ledgerly lo comparten varias sesiones. Antes de empezar:

1. La base tiene que incluir **el rediseño de la sidebar** (PR #4, ya mergeado a `main`) **y el filtro de año global** (plan `docs/superpowers/plans/2026-10-02-filtro-anio-global.md`, al menos sus Tasks 4 y 8). Verificarlo:

   ```bash
   test -f client/src/components/layout/DesktopSidebar.tsx && echo "sidebar OK"
   grep -n "export const globalSearch" client/src/filters/globalFilters.ts
   grep -n "globalSearch" client/src/components/layout/SidebarNav.tsx
   ```

   Las tres tienen que dar resultado. Si falta alguna, **frenar y preguntarle al usuario** desde qué rama arrancar; no implementar `globalSearch` acá.
2. Crear una rama propia desde esa base: `git switch -c feat/responsive-mobile`. Preferible en un worktree aislado (superpowers:using-git-worktrees). No commitear sobre ramas de otras sesiones.
3. El spec y este plan pueden estar sin trackear en el árbol compartido; copiarlos al worktree.
4. `bun install` si el worktree es nuevo.

## Ajustes respecto del spec

Decisiones de detalle tomadas al planificar; no cambian lo acordado:

- `BottomSheet.title` es **obligatorio**: da el nombre accesible del diálogo.
- `BAR_ITEMS` / `MORE_ITEMS` son constantes en lugar de funciones `barItems()` / `moreItems()`.
- En lugar de un helper `navTarget(to, params)`, los tres navegadores comparten el hook
  `useNavSearch()` y arman `{ pathname, search }` igual que ya hace `SidebarNav`.
- Se agrega un **scrim** fijo de alto `env(safe-area-inset-top)` en mobile: con
  `status-bar-style: black-translucent`, sin él el contenido se vería pasar por debajo del reloj al
  hacer scroll en la app instalada.
- Los íconos salen de dos SVG fuente en `scripts/icons/` que replican el logo de `favicon.svg` sobre
  el fondo de `apple-touch-icon.png` (el `favicon.svg` tiene fondo transparente y colores que
  dependen del modo del sistema).

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc. Tampoco en el script de bash.
- **Commits solo con pedido explícito del usuario** (CLAUDE.md global). Cada task termina con un paso "Commit" con el comando exacto y pathspec explícito; ejecutarlo **solo** si el usuario pidió commits para esta ejecución. Nunca `git add -A` ni `git add .`. Nunca push ni merge.
- Componentes funcionales `const X = ({ props }) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Hooks como `export function useX()`, igual que `theme.ts` y `useStoredState.ts`.
- Mapeos y condicionales complejos antes del `return`, no dentro del JSX. `useCallback` para funciones que se pasan como props a componentes hijos.
- Nunca usar el índice del array como `key`.
- **Corte mobile: `< md` (900px)**. Toda decisión estructural pasa por `useIsMobile()`; lo que es solo layout usa breakpoints `xs`/`md` en `sx`.
- **La vista de compu no cambia**: mismos componentes, mismos espacios, mismos tamaños de letra en ≥ 900px.
- Copy de UI en español: `"Inicio"`, `"Más"`, `"Más secciones"`.
- Accesibilidad: la barra inferior es `nav` con `aria-label="principal"` (el mismo que la sidebar, que en mobile no se monta); la grilla de «Más» es `nav` con `aria-label="más secciones"`; la hoja es `role="dialog"` con `aria-label` igual a su título.
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo). Los que emulan viewport llaman `vi.unstubAllGlobals()` en `afterEach`.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Comandos: `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Gesto de volver de iOS con «Más» abierto**: la ruta cambia sin tocar un link de la hoja; la hoja tiene que cerrarse y no quedar tapando la página nueva. → test en Task 5.
2. **iPad que rota (o ventana que se agranda) con «Más» abierto**: la vista pasa a compu; no puede quedar un backdrop huérfano ni el `body` con `overflow: hidden`. → test en Task 5.
3. **Usuario de teclado o lector de pantalla**: «Más» expone `aria-expanded` y, al cerrar la hoja con Escape, el foco vuelve a «Más». → test en Task 5.
4. **iPhone con notch y barra de inicio**: la barra inferior, el final del contenido y la pill de acciones reservan `env(safe-area-inset-*)`; si no, la barra choca con la barra de inicio y el último gráfico queda tapado. → test en Task 5.
5. **Ícono declarado que no existe** (typo en el manifest o PNG sin generar): iOS/Chrome instalan con un ícono roto. → test en Task 7.

---

### Task 1: `useIsMobile` y helper de viewport para tests

**Files:**
- Create: `client/src/useIsMobile.ts`
- Create: `client/src/testing/viewport.ts`
- Test: `client/src/useIsMobile.test.ts`
- Modify: `client/src/components/layout/Layout.tsx` (usar el hook)
- Modify: `client/src/components/layout/Layout.test.tsx` (usar el helper en lugar de `emulateViewport` local)

**Interfaces:**
- Produces:
  - `useIsMobile(): boolean` — `true` por debajo de 900px; `false` cuando no hay `matchMedia` (jsdom).
  - `emulateMobile(): void` (390px) y `emulateDesktop(): void` (1280px) — stubean `window.matchMedia` evaluando `min-width`/`max-width` contra ese ancho. Si ya hay componentes montados, les notifican el cambio (dentro de `act`), así un test puede "rotar" la pantalla en medio de un render.

- [ ] **Step 1: Write the failing test**

`client/src/useIsMobile.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile.js";
import { emulateDesktop, emulateMobile } from "./testing/viewport.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("sin matchMedia asume compu", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("en un celular devuelve true", () => {
    emulateMobile();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("en una compu devuelve false", () => {
    emulateDesktop();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("se actualiza si la pantalla cruza los 900px con el componente montado", () => {
    emulateMobile();
    const { result } = renderHook(() => useIsMobile());
    emulateDesktop();
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/useIsMobile.test.ts`
Expected: FAIL — no se resuelven `./useIsMobile.js` ni `./testing/viewport.js`.

- [ ] **Step 3: Implement**

`client/src/testing/viewport.ts`:

```ts
import { vi } from "vitest";
import { act } from "@testing-library/react";

type Listener = () => void;

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

let currentWidth = DESKTOP_WIDTH;
const listeners = new Set<Listener>();

const matchesWidth = (query: string, width: number): boolean => {
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  if (!min && !max) return false;
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  return true;
};

const mediaQueryList = (query: string) => ({
  get matches() {
    return matchesWidth(query, currentWidth);
  },
  media: query,
  onchange: null,
  addEventListener: (_type: string, listener: Listener) => {
    listeners.add(listener);
  },
  removeEventListener: (_type: string, listener: Listener) => {
    listeners.delete(listener);
  },
  addListener: (listener: Listener) => {
    listeners.add(listener);
  },
  removeListener: (listener: Listener) => {
    listeners.delete(listener);
  },
  dispatchEvent: () => false,
});

const emulateWidth = (width: number): void => {
  currentWidth = width;
  vi.stubGlobal("matchMedia", mediaQueryList);
  act(() => {
    for (const listener of [...listeners]) listener();
  });
};

export const emulateMobile = (): void => emulateWidth(MOBILE_WIDTH);

export const emulateDesktop = (): void => emulateWidth(DESKTOP_WIDTH);
```

`client/src/useIsMobile.ts`:

```ts
import { useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";

const desktopQuery = (theme: Theme) => theme.breakpoints.up("md");

export function useIsMobile(): boolean {
  return !useMediaQuery(desktopQuery, { noSsr: true, defaultMatches: true });
}
```

En `client/src/components/layout/Layout.tsx`, reemplazar el cálculo de `isDesktop` por el hook (el resto del archivo queda igual en esta task):

```tsx
import { useIsMobile } from "../../useIsMobile.js";
```

```tsx
  const isDesktop = !useIsMobile();
```

y borrar `useMediaQuery` del import de `@mui/material`, el `import type { Theme }` y la constante `desktopQuery`.

En `client/src/components/layout/Layout.test.tsx`:
- Borrar la función local `emulateViewport`.
- Agregar `import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";`
- Reemplazar `emulateViewport(true)` por `emulateDesktop()` y `emulateViewport(false)` por `emulateMobile()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/useIsMobile.test.ts client/src/components/layout/Layout.test.tsx`
Expected: PASS (4 tests nuevos + todos los de `Layout`, que no cambian de comportamiento).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/useIsMobile.ts client/src/useIsMobile.test.ts client/src/testing/viewport.ts client/src/components/layout/Layout.tsx client/src/components/layout/Layout.test.tsx
git commit -m "feat(client): hook useIsMobile y helper de viewport para tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `BottomSheet`

**Files:**
- Create: `client/src/components/BottomSheet.tsx`
- Test: `client/src/components/BottomSheet.test.tsx`

**Interfaces:**
- Produces: `BottomSheet` con props

  ```ts
  interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    actions?: ReactNode;
  }
  ```

  Renderiza un `role="dialog"` con `aria-label={title}`. Lo usan `MoreSheet` (Task 4) y las hojas de las fases 3 y 4. `title` es obligatorio (el spec lo tenía opcional) porque da el nombre accesible del diálogo.

- [ ] **Step 1: Write the failing test**

`client/src/components/BottomSheet.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "@mui/material";
import { BottomSheet } from "./BottomSheet.js";

afterEach(cleanup);

const noop = () => undefined;

describe("BottomSheet", () => {
  it("abierta muestra título, contenido y acciones dentro de un diálogo", () => {
    render(
      <BottomSheet open onClose={noop} title="Filtros" actions={<Button>Listo</Button>}>
        <p>contenido</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(dialog).getByText("Filtros")).toBeInTheDocument();
    expect(within(dialog).getByText("contenido")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("cerrada no renderiza el diálogo", () => {
    render(<BottomSheet open={false} onClose={noop} title="Filtros"><p>contenido</p></BottomSheet>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
  });

  it("Escape pide cerrar", () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="Filtros"><p>contenido</p></BottomSheet>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Filtros" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/BottomSheet.test.tsx`
Expected: FAIL — no se resuelve `./BottomSheet.js`.

- [ ] **Step 3: Implement**

`client/src/components/BottomSheet.tsx`:

```tsx
import type { ReactNode } from "react";
import { Box, SwipeableDrawer, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

const ignoreOpen = () => undefined;

const paperSx: SxProps<Theme> = {
  borderRight: 0,
  borderTop: 1,
  borderColor: "divider",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  maxHeight: "90vh",
  px: 2,
  pt: 1,
  pb: "calc(16px + env(safe-area-inset-bottom))",
};

const handleSx: SxProps<Theme> = {
  width: 36,
  height: 4,
  borderRadius: 2,
  bgcolor: "text.secondary",
  opacity: 0.4,
  mx: "auto",
  mb: 1.5,
  flexShrink: 0,
};

export const BottomSheet = ({ open, onClose, title, children, actions }: BottomSheetProps) => (
  <SwipeableDrawer
    anchor="bottom"
    open={open}
    onClose={onClose}
    onOpen={ignoreOpen}
    disableSwipeToOpen
    disableDiscovery={isIos}
    disableBackdropTransition={!isIos}
    slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-label": title, sx: paperSx } }}
  >
    <Box aria-hidden sx={handleSx} />
    <Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
    <Box sx={{ overflowY: "auto" }}>{children}</Box>
    {actions && <Box sx={{ display: "flex", gap: 1, mt: 2 }}>{actions}</Box>}
  </SwipeableDrawer>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/BottomSheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/components/BottomSheet.tsx client/src/components/BottomSheet.test.tsx
git commit -m "feat(client): hoja inferior reusable para mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Secciones de la barra y de «Más» en `navItems`

**Files:**
- Modify: `client/src/components/layout/navItems.ts`
- Test: `client/src/components/layout/navItems.test.ts`

**Interfaces:**
- Produces:
  - `type NavPlacement = "bar" | "more"`
  - `NavItem` suma `placement: NavPlacement` y `shortLabel?: string` (Dashboard → `"Inicio"`).
  - `BAR_ITEMS: NavItem[]` — Dashboard, Cuotas, Movimientos, Importar (en el orden de `NAV_ITEMS`).
  - `MORE_ITEMS: NavItem[]` — Créditos, Auto, Sueldo, Contexto, Reglas.
  - `isMoreRoute(pathname: string): boolean`
- `NAV_ITEMS` y `SIDEBAR_WIDTH` no cambian para sus consumidores actuales (`SidebarNav`, `DesktopSidebar`).

- [ ] **Step 1: Write the failing test**

`client/src/components/layout/navItems.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BAR_ITEMS, MORE_ITEMS, NAV_ITEMS, isMoreRoute } from "./navItems.js";

describe("secciones en mobile", () => {
  it("la barra lleva Dashboard, Cuotas, Movimientos e Importar, en ese orden", () => {
    expect(BAR_ITEMS.map((item) => item.to)).toEqual(["/", "/installments", "/transactions", "/import"]);
  });

  it("Dashboard se muestra como Inicio en la barra", () => {
    expect(BAR_ITEMS[0].shortLabel).toBe("Inicio");
  });

  it("«Más» lleva Créditos, Auto, Sueldo, Contexto y Reglas", () => {
    expect(MORE_ITEMS.map((item) => item.label)).toEqual(["Créditos", "Auto", "Sueldo", "Contexto", "Reglas"]);
  });

  it("entre la barra y «Más» están todas las secciones, sin repetir", () => {
    const placed = [...BAR_ITEMS, ...MORE_ITEMS].map((item) => item.to).sort();
    expect(placed).toEqual(NAV_ITEMS.map((item) => item.to).sort());
    expect(new Set(placed).size).toBe(NAV_ITEMS.length);
  });

  it("isMoreRoute reconoce solo las rutas de «Más»", () => {
    expect(isMoreRoute("/credits")).toBe(true);
    expect(isMoreRoute("/rules")).toBe(true);
    expect(isMoreRoute("/")).toBe(false);
    expect(isMoreRoute("/transactions")).toBe(false);
    expect(isMoreRoute("/creditsx")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/layout/navItems.test.ts`
Expected: FAIL — `BAR_ITEMS`, `MORE_ITEMS` e `isMoreRoute` no existen.

- [ ] **Step 3: Implement**

En `client/src/components/layout/navItems.ts` (los imports de íconos quedan igual), reemplazar la interfaz y la lista, y agregar los derivados:

```ts
export type NavPlacement = "bar" | "more";

export interface NavItem {
  to: string;
  label: string;
  icon: SvgIconComponent;
  placement: NavPlacement;
  shortLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", shortLabel: "Inicio", icon: SpaceDashboardOutlinedIcon, placement: "bar" },
  { to: "/installments", label: "Cuotas", icon: CalendarMonthOutlinedIcon, placement: "bar" },
  { to: "/credits", label: "Créditos", icon: AccountBalanceOutlinedIcon, placement: "more" },
  { to: "/auto", label: "Auto", icon: DirectionsCarOutlinedIcon, placement: "more" },
  { to: "/sueldo", label: "Sueldo", icon: PaymentsOutlinedIcon, placement: "more" },
  { to: "/contexto", label: "Contexto", icon: InsightsOutlinedIcon, placement: "more" },
  { to: "/transactions", label: "Movimientos", icon: ReceiptLongOutlinedIcon, placement: "bar" },
  { to: "/rules", label: "Reglas", icon: RuleOutlinedIcon, placement: "more" },
  { to: "/import", label: "Importar", icon: UploadFileOutlinedIcon, placement: "bar" },
];

export const BAR_ITEMS = NAV_ITEMS.filter((item) => item.placement === "bar");

export const MORE_ITEMS = NAV_ITEMS.filter((item) => item.placement === "more");

export const isMoreRoute = (pathname: string): boolean => MORE_ITEMS.some((item) => item.to === pathname);
```

`SIDEBAR_WIDTH` queda como está, al final del archivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/layout/navItems.test.ts client/src/components/layout/Layout.test.tsx`
Expected: PASS (5 tests nuevos; `Layout` sin cambios).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/components/layout/navItems.ts client/src/components/layout/navItems.test.ts
git commit -m "feat(client): secciones de la barra inferior y de «Más»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useNavSearch` y `MoreSheet`

**Files:**
- Create: `client/src/components/layout/useNavSearch.ts`
- Create: `client/src/components/layout/MoreSheet.tsx`
- Test: `client/src/components/layout/MoreSheet.test.tsx`
- Modify: `client/src/components/layout/SidebarNav.tsx` (usar `useNavSearch`)

**Interfaces:**
- Consumes: `BottomSheet` (Task 2); `MORE_ITEMS` (Task 3); `globalSearch(params: URLSearchParams): string` de `client/src/filters/globalFilters.ts` (filtro de año).
- Produces:
  - `useNavSearch(): string` — el search con solo los filtros globales (`""` o `"?..."`).
  - `MoreSheet` con props `{ open: boolean; onClose: () => void }`. Hoja titulada "Más secciones" con un `nav` `aria-label="más secciones"` y un link por cada `MORE_ITEMS`; tocar un link llama `onClose`.

- [ ] **Step 1: Write the failing test**

`client/src/components/layout/MoreSheet.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { MoreSheet } from "./MoreSheet.js";

afterEach(cleanup);

const noop = () => undefined;

const sheetNav = () => screen.getByRole("navigation", { name: "más secciones" });

describe("MoreSheet", () => {
  it("es un diálogo titulado Más secciones", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />);
    expect(screen.getByRole("dialog", { name: "Más secciones" })).toBeInTheDocument();
  });

  it("lista Créditos, Auto, Sueldo, Contexto y Reglas", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />);
    const names = within(sheetNav()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Créditos", "Auto", "Sueldo", "Contexto", "Reglas"]);
  });

  it("los links conservan los filtros globales y descartan los de Movimientos", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />, {
      route: "/transactions?year=2025&currency=USD&category=Compras&search=uber",
    });
    expect(within(sheetNav()).getByRole("link", { name: "Créditos" })).toHaveAttribute("href", "/credits?year=2025&currency=USD");
  });

  it("tocar una sección pide cerrar la hoja", () => {
    const onClose = vi.fn();
    renderWithProviders(<MoreSheet open onClose={onClose} />);
    fireEvent.click(within(sheetNav()).getByRole("link", { name: "Sueldo" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/layout/MoreSheet.test.tsx`
Expected: FAIL — no se resuelve `./MoreSheet.js`.

- [ ] **Step 3: Implement**

`client/src/components/layout/useNavSearch.ts`:

```ts
import { useSearchParams } from "react-router-dom";
import { globalSearch } from "../../filters/globalFilters.js";

export function useNavSearch(): string {
  const [params] = useSearchParams();
  return globalSearch(params);
}
```

`client/src/components/layout/MoreSheet.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { BottomSheet } from "../BottomSheet.js";
import { MORE_ITEMS } from "./navItems.js";
import { useNavSearch } from "./useNavSearch.js";

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const gridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 1,
};

const itemSx: SxProps<Theme> = {
  display: "grid",
  justifyItems: "center",
  gap: 0.75,
  py: 1.5,
  borderRadius: "14px",
  color: "text.primary",
  bgcolor: "action.hover",
  "&.active": {
    color: "primary.main",
    bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.12),
  },
};

export const MoreSheet = ({ open, onClose }: MoreSheetProps) => {
  const search = useNavSearch();

  const links = MORE_ITEMS.map(({ to, label, icon: Icon }) => (
    <ButtonBase key={to} component={NavLink} to={{ pathname: to, search }} onClick={onClose} sx={itemSx}>
      <Icon />
      <Typography variant="caption" sx={{ fontWeight: 500 }}>{label}</Typography>
    </ButtonBase>
  ));

  return (
    <BottomSheet open={open} onClose={onClose} title="Más secciones">
      <Box component="nav" aria-label="más secciones" sx={gridSx}>
        {links}
      </Box>
    </BottomSheet>
  );
};
```

En `client/src/components/layout/SidebarNav.tsx` (después del Task 8 del filtro de año):
- Reemplazar `const [params] = useSearchParams();` y `const search = globalSearch(params);` por `const search = useNavSearch();`.
- Imports: sacar `useSearchParams` del import de `react-router-dom` (queda `NavLink`), sacar el import de `globalSearch` y agregar `import { useNavSearch } from "./useNavSearch.js";`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/layout/MoreSheet.test.tsx client/src/components/layout/Layout.test.tsx`
Expected: PASS (4 tests nuevos; en `Layout`, también el del filtro de año "los links conservan los filtros globales y descartan los de Movimientos").

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/components/layout/useNavSearch.ts client/src/components/layout/MoreSheet.tsx client/src/components/layout/MoreSheet.test.tsx client/src/components/layout/SidebarNav.tsx
git commit -m "feat(client): hoja «Más» con el resto de las secciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Barra inferior y layout mobile

**Files:**
- Create: `client/src/components/layout/MobileBottomNav.tsx`
- Modify: `client/src/components/layout/Layout.tsx` (reescritura)
- Modify: `client/src/components/layout/TopActionsPill.tsx` (sin botón de menú; zona segura arriba)
- Delete: `client/src/components/layout/MobileSidebar.tsx`
- Test: `client/src/components/layout/Layout.test.tsx`

**Interfaces:**
- Consumes: `useIsMobile` (Task 1); `emulateMobile`/`emulateDesktop` (Task 1); `BAR_ITEMS`, `isMoreRoute` (Task 3); `MoreSheet`, `useNavSearch` (Task 4).
- Produces:
  - `MobileBottomNav` (sin props) — `nav` `aria-label="principal"`, un link por cada `BAR_ITEMS` con `shortLabel ?? label`, y un botón "Más" con `aria-haspopup="dialog"`, `aria-expanded` y `aria-current="page"` cuando la ruta es de «Más».
  - `MOBILE_NAV_HEIGHT = 64` (px de alto de la barra sin la zona segura).
  - `TopActionsPill` pasa a no recibir props.

- [ ] **Step 1: Write the failing tests**

En `client/src/components/layout/Layout.test.tsx`:

1. Cambiar los imports de arriba a:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Link } from "react-router-dom";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { Layout } from "./Layout.js";
```

2. Borrar los tests `"en desktop no ofrece la hamburguesa"` y `"en pantallas chicas abre la navegación desde la hamburguesa y la cierra al navegar"`.

3. Dentro de `describe("Layout", ...)`, agregar:

```tsx
  it("en compu no muestra la barra inferior", () => {
    emulateDesktop();
    renderLayout();
    expect(screen.queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "colapsar menú" })).toBeInTheDocument();
  });
```

4. Después de `describe("Layout", ...)`, agregar el helper y el bloque mobile:

```tsx
const cssFor = (element: Element): string => {
  const classes = Array.from(element.classList).filter((name) => name.startsWith("css-"));
  const rules = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n")
    .split("}");
  return rules.filter((rule) => classes.some((name) => rule.includes(`.${name}`))).join("}");
};

const moreSheet = () => screen.queryByRole("dialog", { name: "Más secciones" });

describe("Layout en mobile", () => {
  beforeEach(() => emulateMobile());

  const moreButton = () => within(mainNavigation()).getByRole("button", { name: "Más" });

  it("la barra inferior muestra Inicio, Cuotas, Movimientos, Importar y Más", () => {
    renderLayout();
    const links = within(mainNavigation()).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Inicio", "Cuotas", "Movimientos", "Importar"]);
    expect(moreButton()).toBeInTheDocument();
  });

  it("no monta la sidebar de compu", () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: "colapsar menú" })).not.toBeInTheDocument();
    expect(within(quickActions()).queryByLabelText("abrir menú")).not.toBeInTheDocument();
  });

  it("marca la sección actual de la barra y deja «Más» sin marcar", () => {
    renderLayout("/transactions");
    expect(within(mainNavigation()).getByRole("link", { name: "Movimientos" })).toHaveAttribute("aria-current", "page");
    expect(moreButton()).not.toHaveAttribute("aria-current");
  });

  it("en una sección de «Más», marca «Más» como actual", () => {
    renderLayout("/credits");
    expect(moreButton()).toHaveAttribute("aria-current", "page");
    expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("los links de la barra conservan los filtros globales y descartan los de Movimientos", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras");
    expect(within(mainNavigation()).getByRole("link", { name: "Cuotas" })).toHaveAttribute("href", "/installments?year=2025&currency=USD");
  });

  it("«Más» abre el resto de las secciones y la hoja se cierra al elegir una", async () => {
    renderLayout();
    fireEvent.click(moreButton());
    const sheet = screen.getByRole("dialog", { name: "Más secciones" });
    fireEvent.click(within(sheet).getByRole("link", { name: "Sueldo" }));
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
    expect(moreButton()).toHaveAttribute("aria-current", "page");
  });

  it("si la ruta cambia con «Más» abierto (gesto de volver), la hoja se cierra", async () => {
    renderWithProviders(<Layout><Link to="/auto">ir a auto</Link></Layout>);
    fireEvent.click(moreButton());
    expect(moreSheet()).toBeInTheDocument();
    fireEvent.click(screen.getByText("ir a auto"));
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
  });

  it("con teclado, «Más» indica si está abierto y el foco vuelve a él al cerrar con Escape", async () => {
    renderLayout();
    const more = moreButton();
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.focus();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Más secciones" }), { key: "Escape" });
    await waitFor(() => expect(more).toHaveFocus());
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("si la pantalla pasa a tamaño compu con «Más» abierto, no queda nada tapando la app", async () => {
    renderLayout();
    fireEvent.click(moreButton());
    emulateDesktop();
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
    expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("button", { name: "colapsar menú" })).toBeInTheDocument();
  });

  it("la barra, el contenido y la pill reservan la zona segura del iPhone", () => {
    renderLayout();
    expect(cssFor(mainNavigation())).toContain("env(safe-area-inset-bottom)");
    expect(cssFor(screen.getByRole("main").firstElementChild!)).toContain("env(safe-area-inset-bottom)");
    expect(cssFor(quickActions())).toContain("env(safe-area-inset-top)");
  });
});
```

El `afterEach` existente (`cleanup()`, `localStorage.clear()`, `vi.unstubAllGlobals()`) queda igual y cubre también el bloque mobile.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/layout/Layout.test.tsx`
Expected: FAIL en el bloque "Layout en mobile" — no existe el botón "Más" (hoy está la hamburguesa). "en compu no muestra la barra inferior" ya pasa.

- [ ] **Step 3: Implement**

`client/src/components/layout/MobileBottomNav.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { BAR_ITEMS, isMoreRoute } from "./navItems.js";
import { MoreSheet } from "./MoreSheet.js";
import { useNavSearch } from "./useNavSearch.js";

export const MOBILE_NAV_HEIGHT = 64;

const barSx: SxProps<Theme> = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: (theme) => theme.zIndex.appBar,
  display: "grid",
  gridTemplateColumns: `repeat(${BAR_ITEMS.length + 1}, minmax(0, 1fr))`,
  pb: "env(safe-area-inset-bottom)",
  borderTop: 1,
  borderColor: "divider",
  bgcolor: (theme) => alpha(theme.palette.background.default, 0.82),
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
};

const itemSx: SxProps<Theme> = {
  height: MOBILE_NAV_HEIGHT,
  minWidth: 0,
  px: 0.5,
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  gap: 0.25,
  color: "text.secondary",
  "& .MuiTypography-root": { fontSize: 11, fontWeight: 500, maxWidth: "100%" },
  "&[aria-current='page']": {
    color: "primary.main",
    "& .MuiTypography-root": { fontWeight: 600 },
  },
};

export const MobileBottomNav = () => {
  const { pathname } = useLocation();
  const search = useNavSearch();
  const [moreOpen, setMoreOpen] = useState(false);
  const openMore = useCallback(() => setMoreOpen(true), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = isMoreRoute(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const links = BAR_ITEMS.map(({ to, label, shortLabel, icon: Icon }) => (
    <ButtonBase key={to} component={NavLink} to={{ pathname: to, search }} end={to === "/"} sx={itemSx}>
      <Icon />
      <Typography noWrap>{shortLabel ?? label}</Typography>
    </ButtonBase>
  ));

  return (
    <>
      <Box component="nav" aria-label="principal" sx={barSx}>
        {links}
        <ButtonBase
          onClick={openMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? "page" : undefined}
          sx={itemSx}
        >
          <MoreHorizIcon />
          <Typography noWrap>Más</Typography>
        </ButtonBase>
      </Box>
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </>
  );
};
```

`client/src/components/layout/Layout.tsx` (reemplazar el archivo entero):

```tsx
import type { ReactNode } from "react";
import { Box, Container } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useIsMobile } from "../../useIsMobile.js";
import { DesktopSidebar } from "./DesktopSidebar.js";
import { MOBILE_NAV_HEIGHT, MobileBottomNav } from "./MobileBottomNav.js";
import { TopActionsPill } from "./TopActionsPill.js";
import { useSidebarCollapsed } from "./useSidebarCollapsed.js";

interface LayoutProps { children: ReactNode; }

const containerSx: SxProps<Theme> = {
  pt: { xs: "calc(72px + env(safe-area-inset-top))", md: 10 },
  pb: { xs: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 24px)`, md: 4 },
};

const statusBarScrimSx: SxProps<Theme> = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "env(safe-area-inset-top)",
  bgcolor: "background.default",
  zIndex: (theme) => theme.zIndex.appBar,
};

export const Layout = ({ children }: LayoutProps) => {
  const isMobile = useIsMobile();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <DesktopSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />}
      {isMobile && <Box aria-hidden sx={statusBarScrimSx} />}
      <TopActionsPill />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Container maxWidth="lg" sx={containerSx}>{children}</Container>
      </Box>
      {isMobile && <MobileBottomNav />}
    </Box>
  );
};
```

En compu (`md`) los espacios quedan como estaban (`pt: 10`, `pb: 4`).

`client/src/components/layout/TopActionsPill.tsx`:
- Borrar `interface TopActionsPillProps`, el import de `MenuIcon` y el bloque `{showMenuButton && (...)}`.
- La firma pasa a `export const TopActionsPill = () => {`.
- En el `sx` del `Box`, cambiar `top: "16px"` por `top: "calc(16px + env(safe-area-inset-top))"`.

Borrar `client/src/components/layout/MobileSidebar.tsx`:

```bash
git rm client/src/components/layout/MobileSidebar.tsx
```

(Si no se va a commitear, `rm client/src/components/layout/MobileSidebar.tsx`.) Confirmar que nadie más lo importa: `grep -rn "MobileSidebar" client/src` no debe devolver nada.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/layout/`
Expected: PASS (todo `Layout.test.tsx`, `MoreSheet.test.tsx`, `navItems.test.ts`, `LedgerlyMark.test.tsx`).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/components/layout/MobileBottomNav.tsx client/src/components/layout/Layout.tsx client/src/components/layout/Layout.test.tsx client/src/components/layout/TopActionsPill.tsx client/src/components/layout/MobileSidebar.tsx
git commit -m "feat(client): barra inferior en mobile en lugar del menú hamburguesa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tipografía mobile y hover solo con mouse

**Files:**
- Modify: `client/src/theme.ts`
- Test: `client/src/theme.test.tsx`

**Interfaces:**
- Produces: `theme.typography.h4` y `h5` con un override para `@media (max-width:899.95px)`; `MuiCard.styleOverrides.root` con el `&:hover` dentro de `@media (hover: hover)`. Nada nuevo exportado.

- [ ] **Step 1: Write the failing test**

Al final de `client/src/theme.test.tsx`:

```tsx
describe("tema en pantallas chicas", () => {
  it("achica h4 y h5 por debajo de 900px sin cambiar el tamaño de compu", () => {
    const { result } = renderHook(() => useColorModeState());
    const { typography } = result.current.theme;
    expect(typography.h4).toMatchObject({ fontSize: "2.125rem", "@media (max-width:899.95px)": { fontSize: "1.625rem" } });
    expect(typography.h5).toMatchObject({ fontSize: "1.5rem", "@media (max-width:899.95px)": { fontSize: "1.25rem" } });
  });

  it("el efecto al pasar el mouse por una tarjeta solo aplica en dispositivos con hover", () => {
    const { result } = renderHook(() => useColorModeState());
    const root = result.current.theme.components?.MuiCard?.styleOverrides?.root;
    expect(root).toHaveProperty(["@media (hover: hover)", "&:hover", "transform"], "translateY(-3px)");
    expect(root).not.toHaveProperty(["&:hover"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/theme.test.tsx`
Expected: FAIL — `h4` no tiene la media query y `MuiCard` tiene `&:hover` en el primer nivel.

- [ ] **Step 3: Implement**

En `client/src/theme.ts`, debajo de los imports:

```ts
const mobileMedia = createTheme().breakpoints.down("md");
```

En `typography` de `buildTheme`:

```ts
      h4: { fontWeight: 700, letterSpacing: "-0.02em", [mobileMedia]: { fontSize: "1.625rem" } },
      h5: { fontWeight: 700, letterSpacing: "-0.01em", [mobileMedia]: { fontSize: "1.25rem" } },
```

En `MuiCard.styleOverrides.root`, reemplazar el bloque `"&:hover": {...}` por:

```ts
            "@media (hover: hover)": {
              "&:hover": {
                transform: "translateY(-3px)",
                boxShadow: t.cardHoverShadow,
                borderColor: alpha(t.primary, 0.45),
              },
            },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/theme.test.tsx`
Expected: PASS (5 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/theme.ts client/src/theme.test.tsx
git commit -m "feat(client): títulos más chicos en mobile y hover de tarjetas solo con mouse" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Manifest, íconos y metas de iOS

**Files:**
- Create: `scripts/icons/icon.svg`
- Create: `scripts/icons/icon-maskable.svg`
- Create: `scripts/generate-icons.sh`
- Create (generados): `client/public/icon-192.png`, `client/public/icon-512.png`, `client/public/icon-maskable-512.png`
- Create: `client/public/manifest.webmanifest`
- Modify: `client/index.html`
- Test: `client/src/pwa.test.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest` servido por Vite (dev) y por Express (`express.static` sobre `client/dist`, que ya mapea `.webmanifest` a `application/manifest+json`).

- [ ] **Step 1: Write the failing test**

`client/src/pwa.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ManifestIcon { src: string; sizes: string; type: string; purpose: string; }

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const clientDir = fileURLToPath(new URL("..", import.meta.url));

const readClientFile = (path: string): string => readFileSync(`${clientDir}${path}`, "utf8");

const manifestPath = "public/manifest.webmanifest";

describe("Ledgerly instalable", () => {
  it("hay un manifest en public", () => {
    expect(existsSync(`${clientDir}${manifestPath}`)).toBe(true);
  });

  it("el manifest abre la app a pantalla completa desde el inicio", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    expect(manifest).toMatchObject({
      name: "Ledgerly",
      short_name: "Ledgerly",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#0b0f19",
      theme_color: "#0b0f19",
    });
  });

  it("declara íconos de 192 y 512 y uno maskable", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
  });

  it("cada ícono declarado existe en public", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    const missing = manifest.icons.filter((icon) => !existsSync(`${clientDir}public${icon.src}`)).map((icon) => icon.src);
    expect(missing).toEqual([]);
  });

  it("index.html enlaza el manifest y habilita pantalla completa y zonas seguras en iOS", () => {
    const html = readClientFile("index.html");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pwa.test.ts`
Expected: FAIL — no existe `public/manifest.webmanifest` y `index.html` no tiene las metas.

- [ ] **Step 3: Implement**

`scripts/icons/icon.svg` (fondo como el de `apple-touch-icon.png`, logo al ~60%):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">
      <stop offset="0" stop-color="#131a2a"/>
      <stop offset="1" stop-color="#0b0f19"/>
    </linearGradient>
    <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="14" y1="50" x2="50" y2="14">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(58 70) scale(6)">
    <path d="M12 9 V53 H54" fill="none" stroke="url(#mark)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="22" y="33" width="8" height="13" rx="4" fill="url(#mark)" opacity=".7"/>
    <rect x="34" y="23" width="8" height="23" rx="4" fill="url(#mark)" opacity=".85"/>
    <rect x="46" y="12" width="8" height="34" rx="4" fill="url(#mark)"/>
  </g>
</svg>
```

`scripts/icons/icon-maskable.svg`: igual a `icon.svg` salvo el `transform` del grupo, que achica el logo para que entre en el círculo seguro del 80%:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">
      <stop offset="0" stop-color="#131a2a"/>
      <stop offset="1" stop-color="#0b0f19"/>
    </linearGradient>
    <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="14" y1="50" x2="50" y2="14">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(91 101) scale(5)">
    <path d="M12 9 V53 H54" fill="none" stroke="url(#mark)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="22" y="33" width="8" height="13" rx="4" fill="url(#mark)" opacity=".7"/>
    <rect x="34" y="23" width="8" height="23" rx="4" fill="url(#mark)" opacity=".85"/>
    <rect x="46" y="12" width="8" height="34" rx="4" fill="url(#mark)"/>
  </g>
</svg>
```

`scripts/generate-icons.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/scripts/icons"
out="$root/client/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

qlmanage -t -s 512 -o "$tmp" "$src/icon.svg" "$src/icon-maskable.svg" >/dev/null
cp "$tmp/icon.svg.png" "$out/icon-512.png"
cp "$tmp/icon-maskable.svg.png" "$out/icon-maskable-512.png"
sips -z 192 192 "$tmp/icon.svg.png" --out "$out/icon-192.png" >/dev/null
```

Generar y verificar los tamaños:

```bash
chmod +x scripts/generate-icons.sh
bash scripts/generate-icons.sh
sips -g pixelWidth -g pixelHeight client/public/icon-192.png client/public/icon-512.png client/public/icon-maskable-512.png
```

Expected: 192×192, 512×512 y 512×512. Abrir los tres PNG y confirmar que se ve el logo centrado sobre el fondo oscuro (en el maskable, más chico).

`client/public/manifest.webmanifest`:

```json
{
  "name": "Ledgerly",
  "short_name": "Ledgerly",
  "lang": "es",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b0f19",
  "theme_color": "#0b0f19",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`client/index.html`: reemplazar el meta `viewport` y agregar las metas y el link, dejando el resto como está:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0f19" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Ledgerly" />
    <link rel="manifest" href="/manifest.webmanifest" />
```

(Los `<link rel="icon">` y `apple-touch-icon` del PR #3 quedan igual.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/pwa.test.ts`
Expected: PASS (5 tests).

Run: `bun run typecheck`
Expected: sin errores (los imports `node:fs`/`node:url` resuelven con `@types/node` del `tsconfig.json` raíz).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add scripts/icons/icon.svg scripts/icons/icon-maskable.svg scripts/generate-icons.sh client/public/icon-192.png client/public/icon-512.png client/public/icon-maskable-512.png client/public/manifest.webmanifest client/index.html client/src/pwa.test.ts
git commit -m "feat(client): Ledgerly instalable desde Safari con manifest e íconos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `theme-color` acompaña al modo claro/oscuro

**Files:**
- Create: `client/src/useThemeColorMeta.ts`
- Test: `client/src/useThemeColorMeta.test.ts`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `<meta name="theme-color">` de `index.html` (Task 7); `colorMode.theme.palette.background.default` (`#0b0f19` oscuro, `#f4f7fb` claro).
- Produces: `useThemeColorMeta(color: string): void`.

- [ ] **Step 1: Write the failing test**

`client/src/useThemeColorMeta.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useThemeColorMeta } from "./useThemeColorMeta.js";

const addThemeColorMeta = (): HTMLMetaElement => {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#0b0f19";
  document.head.append(meta);
  return meta;
};

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});

describe("useThemeColorMeta", () => {
  it("pone el color pedido en el meta theme-color", () => {
    const meta = addThemeColorMeta();
    renderHook(() => useThemeColorMeta("#f4f7fb"));
    expect(meta.content).toBe("#f4f7fb");
  });

  it("lo actualiza cuando cambia el modo", () => {
    const meta = addThemeColorMeta();
    const { rerender } = renderHook(({ color }) => useThemeColorMeta(color), { initialProps: { color: "#0b0f19" } });
    rerender({ color: "#f4f7fb" });
    expect(meta.content).toBe("#f4f7fb");
  });

  it("sin meta theme-color no falla", () => {
    expect(() => renderHook(() => useThemeColorMeta("#f4f7fb"))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/useThemeColorMeta.test.ts`
Expected: FAIL — no se resuelve `./useThemeColorMeta.js`.

- [ ] **Step 3: Implement**

`client/src/useThemeColorMeta.ts`:

```ts
import { useEffect } from "react";

export function useThemeColorMeta(color: string): void {
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [color]);
}
```

En `client/src/App.tsx`, importar `import { useThemeColorMeta } from "./useThemeColorMeta.js";` y llamarlo en `App` justo después de `useColorModeState()`:

```tsx
export const App = () => {
  const colorMode = useColorModeState();
  useThemeColorMeta(colorMode.theme.palette.background.default);
  return (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/useThemeColorMeta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/useThemeColorMeta.ts client/src/useThemeColorMeta.test.ts client/src/App.tsx
git commit -m "feat(client): la barra del navegador acompaña el modo claro u oscuro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se corrige en el task que corresponde).

- [ ] **Step 1: Suite, tipos y build**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: todo en verde; `client/dist/` contiene `manifest.webmanifest`, `icon-192.png`, `icon-512.png` e `icon-maskable-512.png`.

- [ ] **Step 2: Manifest servido**

Con `bun run dev` corriendo:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/manifest.webmanifest
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/icon-512.png
```

Expected: `200 application/manifest+json` y `200 image/png`.

- [ ] **Step 3: Revisión visual en el navegador**

Con `bun run dev`, abrir `http://localhost:5173` en Chrome con el modo dispositivo en 375×667 (iPhone SE) y 393×852 (iPhone 14 Pro). Si se usa Claude in Chrome: `resize_window` a esos tamaños y captura de cada punto. Checklist:

- La barra inferior muestra Inicio · Cuotas · Movimientos · Importar · Más, y "Movimientos" entra sin cortarse en 375px.
- La sección actual se ve en color primario; en Créditos, Auto, Sueldo, Contexto y Reglas se marca «Más».
- «Más» abre la hoja con 5 secciones; se cierra tocando una, tocando el fondo y deslizando hacia abajo.
- Con `?year=2025&currency=USD` en la URL, navegar con la barra y con «Más» conserva esos params.
- El final de cada página (último gráfico o tabla) queda visible por encima de la barra.
- La pill (Actualizar, Tema) no se superpone con el título de ninguna página.
- Los títulos de página se ven más chicos que en compu.
- Cambiar el tema actualiza `document.querySelector('meta[name="theme-color"]').content` (`#f4f7fb` claro, `#0b0f19` oscuro).
- Chrome DevTools → Application → Manifest: sin errores, muestra los íconos.
- En 1280px: sidebar como antes, sin barra inferior, mismos espacios y tamaños de título que en `main`.

- [ ] **Step 4: Prueba en el iPhone (la hace el usuario después de mergear y `bun run deploy`)**

- Safari → Compartir → "Agregar a inicio": el ícono es el del logo sobre fondo oscuro y el nombre "Ledgerly".
- Abrir desde el ícono: pantalla completa, sin la barra de Safari.
- La barra de estado se ve sobre fondo del tema (el scrim) también al hacer scroll; la pill queda debajo del notch.
- La barra inferior queda por encima de la barra de inicio del iPhone.
- Deslizar desde el borde izquierdo (volver) con «Más» abierto cierra la hoja.

Reportar al usuario el resultado de los Steps 1–3 con capturas, y dejarle el checklist del Step 4.
