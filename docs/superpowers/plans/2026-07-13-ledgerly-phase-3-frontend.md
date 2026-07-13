# Ledgerly — Fase 3: Frontend (SPA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPA en Vite + React 19 + MUI que consume la API de la Fase 2: importar resúmenes en PDF, ver/editar movimientos, administrar reglas de categoría, y un dashboard con 4 visualizaciones (gasto por categoría, evolución mensual, cuotas a vencer, top comercios).

**Architecture:** Vite + React 19 + TypeScript + MUI v6 + MUI X (Charts + DataGrid). Estado de servidor con TanStack Query (un hook tipado por endpoint, tipos desde `@ledgerly/shared`). Ruteo con React Router; los filtros viven en la URL (search params). Vite proxya `/api` al backend de la Fase 2.

**Tech Stack:** React 19, MUI v6, @mui/x-charts, @mui/x-data-grid, @tanstack/react-query, react-router-dom, clsx. Tests: Vitest + jsdom + @testing-library/react.

## Global Constraints

- Hereda las constraints del monorepo (ESM, TS strict sin `any`, sin comentarios en el código, commits diferidos → `git add`).
- **Depende de la Fase 2**: consume los DTOs y endpoints. No inventar campos fuera del contrato de `@ledgerly/shared`.
- **Estándares React (CLAUDE.md, obligatorios)**:
  - Componentes funcionales; **destructuring en la firma**; fragments `<>`.
  - **Early returns** para loading/error (nunca ternarios anidados en JSX).
  - **Nunca** `index` como `key`; usar id único.
  - `useMemo`/`useCallback` donde corresponda; custom hooks si la lógica supera ~15 líneas.
  - Interfaces para props; default props en la destructuring.
  - CSS Modules → `clsx` con patrón base + objeto de condicionales (mayormente usamos `sx` de MUI; `clsx` solo donde haya CSS Modules).
- **Gráficos**: invocar la skill `dataviz` al implementar cada chart (paleta accesible, light/dark, ejes/leyendas). El código de este plan es un punto de partida correcto.
- Puerto del frontend: **5173** (coincide con el CORS del backend).

---

## File Structure

```
client/
├─ index.html
├─ vite.config.ts
├─ vitest.setup.ts
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ main.tsx                 # ReactDOM.createRoot
   ├─ App.tsx                  # Providers (Query, Theme, Router) + rutas
   ├─ theme.ts                 # createTheme light/dark + useColorMode
   ├─ format.ts                # formatMoney(amount, currency)
   ├─ testing/renderWithProviders.tsx
   ├─ api/
   │  ├─ client.ts             # apiFetch<T>
   │  └─ hooks.ts              # hooks TanStack Query (tipados con DTOs)
   ├─ components/
   │  ├─ Layout.tsx            # AppBar + nav + toggle de tema
   │  ├─ FiltersBar.tsx        # período/moneda/emisor → URL search params
   │  ├─ KpiCards.tsx
   │  ├─ ReconciliationBanner.tsx
   │  ├─ FileDropzone.tsx
   │  ├─ StatementList.tsx
   │  ├─ TransactionsTable.tsx
   │  └─ charts/
   │     ├─ palette.ts
   │     ├─ CategoryBreakdownChart.tsx
   │     ├─ MonthlyTrendChart.tsx
   │     ├─ FutureInstallmentsChart.tsx
   │     └─ TopMerchantsChart.tsx
   └─ pages/
      ├─ DashboardPage.tsx
      ├─ ImportPage.tsx
      ├─ TransactionsPage.tsx
      └─ RulesPage.tsx
```

---

### Task 1: Scaffold del cliente + providers + layout + tema

**Files:**
- Modify: root `package.json` (workspaces + `dev` script), `vitest.config.ts` (jsdom para client)
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/vitest.setup.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/theme.ts`, `client/src/format.ts`, `client/src/components/Layout.tsx`, `client/src/testing/renderWithProviders.tsx`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Produces: `createAppRouter`/`App`, `useColorMode()`, `formatMoney(amount: number, currency: "ARS" | "USD"): string`, `renderWithProviders(ui, options?)`.

- [ ] **Step 1: Agregar el workspace client y dependencias**

Editar root `package.json`:
```json
{
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "npm run dev -w client",
    "dev": "concurrently -n server,client -c blue,green \"npm run dev:server\" \"npm run dev:client\"",
    "seed": "tsx server/src/rules/seedRules.ts"
  }
}
```
Agregar `concurrently` a devDependencies del root:
```json
{ "devDependencies": { "concurrently": "^9.0.0" } }
```

Crear `client/package.json`:
```json
{
  "name": "@ledgerly/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "@ledgerly/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.27.0",
    "@tanstack/react-query": "^5.59.0",
    "@mui/material": "^6.1.0",
    "@mui/icons-material": "^6.1.0",
    "@emotion/react": "^11.13.0",
    "@emotion/styled": "^11.13.0",
    "@mui/x-charts": "^7.22.0",
    "@mui/x-data-grid": "^7.22.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```
Run: `npm install`

- [ ] **Step 2: Configurar Vite, tsconfig del cliente y Vitest jsdom**

`client/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@ledgerly/shared": ["../shared/src/index.ts"] }
  },
  "include": ["src"]
}
```

`client/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
});
```

`client/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Editar root `vitest.config.ts` para jsdom en client + setup + incluir tsx:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/src/**/*.test.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [["client/**", "jsdom"]],
    setupFiles: ["./client/vitest.setup.ts"],
  },
});
```

Actualizar root `tsconfig.json` para incluir el cliente:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@ledgerly/shared": ["shared/src/index.ts"] },
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["shared/src", "server/src", "client/src", "vitest.config.ts"]
}
```

- [ ] **Step 3: Escribir el test que falla**

`client/src/App.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./testing/renderWithProviders.js";
import { App } from "./App.js";

describe("App", () => {
  it("renderiza la navegación principal", () => {
    renderWithProviders(<App />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /importar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /movimientos/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reglas/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Correr el test para verificar que falla**

Run: `npm test -- App`
Expected: FAIL — `App`/`renderWithProviders` inexistentes.

- [ ] **Step 5: Implementar theme, format, layout, App, main y el helper de tests**

`client/src/format.ts`:
```ts
export function formatMoney(amount: number, currency: "ARS" | "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}
```

`client/src/theme.ts`:
```ts
import { createContext, useContext, useMemo, useState } from "react";
import { createTheme, type Theme } from "@mui/material/styles";

type Mode = "light" | "dark";
interface ColorModeContextValue { mode: Mode; toggle: () => void; theme: Theme; }

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export function useColorModeState(): ColorModeContextValue {
  const [mode, setMode] = useState<Mode>("light");
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));
  return { mode, toggle, theme };
}

export const ColorModeProvider = ColorModeContext.Provider;

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode fuera de provider");
  return ctx;
}
```

`client/src/components/Layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AppBar, Box, Button, Container, IconButton, Toolbar, Typography } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useColorMode } from "../theme.js";

interface LayoutProps { children: ReactNode; }

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/import", label: "Importar" },
  { to: "/transactions", label: "Movimientos" },
  { to: "/rules", label: "Reglas" },
];

export const Layout = ({ children }: LayoutProps) => {
  const { mode, toggle } = useColorMode();
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ mr: 4 }}>Ledgerly</Typography>
          <Box sx={{ display: "flex", gap: 1, flexGrow: 1 }}>
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === "/"}
                sx={{ color: "inherit", "&.active": { fontWeight: 700, textDecoration: "underline" } }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <IconButton color="inherit" onClick={toggle} aria-label="cambiar tema">
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>{children}</Container>
    </>
  );
};
```

`client/src/App.tsx`:
```tsx
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "./theme.js";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";
import { RulesPage } from "./pages/RulesPage.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export const App = () => {
  const colorMode = useColorModeState();
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/rules" element={<RulesPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ColorModeProvider>
  );
};
```

`client/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

`client/index.html`:
```html
<!doctype html>
<html lang="es">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Ledgerly</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`client/src/testing/renderWithProviders.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "../theme.js";

const Providers = ({ children, route }: { children: ReactNode; route: string }) => {
  const colorMode = useColorModeState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ColorModeProvider>
  );
};

export function renderWithProviders(ui: ReactElement, options: { route?: string } = {}): RenderResult {
  return render(<Providers route={options.route ?? "/"}>{ui}</Providers>);
}
```

> **Nota:** `App.test.tsx` monta `App` que usa `BrowserRouter`; para el test de nav, envolver solo `Layout`/rutas o testear con `renderWithProviders` un árbol equivalente. Alternativa simple: exportar el árbol de rutas sin `BrowserRouter` y testear eso. Ajustar el import del test para renderizar el contenido con `MemoryRouter` (el helper). Si `App` trae su propio `BrowserRouter`, cambiar el test para renderizar `<Layout><div/></Layout>` con `renderWithProviders` y verificar los links.

- [ ] **Step 6: Ajustar el test al árbol real y correrlo**

Reescribir `client/src/App.test.tsx` para testear el `Layout` (que contiene la nav) con providers:
```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./testing/renderWithProviders.js";
import { Layout } from "./components/Layout.js";

describe("Layout", () => {
  it("renderiza la navegación principal", () => {
    renderWithProviders(<Layout><div>contenido</div></Layout>);
    for (const name of [/dashboard/i, /importar/i, /movimientos/i, /reglas/i]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });
});
```
Run: `npm test -- App`
Expected: PASS (1 test).

- [ ] **Step 7: Crear stubs de páginas para que compile**

Crear 4 archivos placeholder mínimos (se completan en las tareas siguientes):
`client/src/pages/DashboardPage.tsx`, `ImportPage.tsx`, `TransactionsPage.tsx`, `RulesPage.tsx`, cada uno:
```tsx
import { Typography } from "@mui/material";
export const DashboardPage = () => <Typography variant="h4">Dashboard</Typography>;
```
(cambiar el nombre exportado y el texto por página: `ImportPage`/"Importar", `TransactionsPage`/"Movimientos", `RulesPage`/"Reglas").

Run: `npm run typecheck && npm test -- App`
Expected: typecheck OK, test PASS.

- [ ] **Step 8: Stage**

```bash
git add package.json vitest.config.ts tsconfig.json client package-lock.json
# commit sugerido: "feat(client): scaffold Vite+React19+MUI, layout, tema y ruteo"
```

---

### Task 2: Cliente HTTP + hooks de datos (TanStack Query)

**Files:**
- Create: `client/src/api/client.ts`, `client/src/api/hooks.ts`
- Test: `client/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - Query hooks: `useStatements()`, `useStatementDetail(id)`, `useTransactions(params)`, `useByCategory(params)`, `useMonthly(params)`, `useTopMerchants(params)`, `useFutureInstallments(params)`, `useSummary(params)`, `useCategoryRules()`
  - Mutation hooks: `useUploadStatement()`, `useDeleteStatement()`, `usePatchTransaction()`, `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()`, `useApplyRules()`
  - `interface StatFilters { currency: "ARS" | "USD"; from?: string; to?: string }`

- [ ] **Step 1: Escribir el test que falla (apiFetch)**

`client/src/api/client.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch } from "./client.js";

afterEach(() => vi.restoreAllMocks());

describe("apiFetch", () => {
  it("hace GET a /api y devuelve JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    const data = await apiFetch<{ ok: boolean }>("/health");
    expect(data.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("lanza con el mensaje del backend en error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Formato no reconocido" }), { status: 422 }),
    ));
    await expect(apiFetch("/statements")).rejects.toThrow("Formato no reconocido");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- api/client`
Expected: FAIL — `apiFetch` inexistente.

- [ ] **Step 3: Implementar el cliente HTTP**

`client/src/api/client.ts`:
```ts
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- api/client`
Expected: PASS (2 tests).

- [ ] **Step 5: Implementar los hooks (sin test unitario; se ejercitan vía páginas)**

`client/src/api/hooks.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CategoryRuleDTO, CategoryStat, FutureInstallmentStat, ImportResultDTO,
  MerchantStat, MonthlyStat, StatementDTO, SummaryStat, TransactionDTO,
} from "@ledgerly/shared";
import { apiFetch } from "./client.js";

export interface StatFilters { currency: "ARS" | "USD"; from?: string; to?: string; }

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useStatements() {
  return useQuery({ queryKey: ["statements"], queryFn: () => apiFetch<StatementDTO[]>("/statements") });
}

export function useStatementDetail(id: string | null) {
  return useQuery({
    queryKey: ["statement", id],
    queryFn: () => apiFetch<{ statement: StatementDTO; transactions: TransactionDTO[] }>(`/statements/${id}`),
    enabled: Boolean(id),
  });
}

export function useUploadStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, replace }: { file: File; replace?: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<ImportResultDTO>(`/statements${replace ? "?replace=true" : ""}`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/statements/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export interface TxFilters extends Partial<StatFilters> {
  category?: string; issuer?: string; search?: string; page?: number; pageSize?: number;
}

export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () =>
      apiFetch<{ items: TransactionDTO[]; total: number; page: number; pageSize: number }>(`/transactions${qs(filters)}`),
  });
}

export function usePatchTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { category?: string; type?: string } }) =>
      apiFetch<TransactionDTO>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useByCategory(f: StatFilters) {
  return useQuery({ queryKey: ["by-category", f], queryFn: () => apiFetch<CategoryStat[]>(`/stats/by-category${qs(f)}`) });
}
export function useMonthly(f: StatFilters) {
  return useQuery({ queryKey: ["monthly", f], queryFn: () => apiFetch<MonthlyStat[]>(`/stats/monthly${qs(f)}`) });
}
export function useTopMerchants(f: StatFilters & { limit?: number }) {
  return useQuery({ queryKey: ["top-merchants", f], queryFn: () => apiFetch<MerchantStat[]>(`/stats/top-merchants${qs(f)}`) });
}
export function useFutureInstallments(f: StatFilters) {
  return useQuery({ queryKey: ["future", f], queryFn: () => apiFetch<FutureInstallmentStat[]>(`/stats/future-installments${qs(f)}`) });
}
export function useSummary(f: StatFilters) {
  return useQuery({ queryKey: ["summary", f], queryFn: () => apiFetch<SummaryStat>(`/stats/summary${qs(f)}`) });
}

export function useCategoryRules() {
  return useQuery({ queryKey: ["rules"], queryFn: () => apiFetch<CategoryRuleDTO[]>("/category-rules") });
}
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { priority: number; matchType: string; pattern: string; category: string }) =>
      apiFetch<CategoryRuleDTO>("/category-rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CategoryRuleDTO> }) =>
      apiFetch<CategoryRuleDTO>(`/category-rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/category-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useApplyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ updated: number }>("/category-rules/apply", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Stage**

```bash
git add client/src/api
# commit sugerido: "feat(client): cliente HTTP + hooks TanStack Query tipados"
```

---

### Task 3: Página Importar (dropzone + reconciliación + lista)

**Files:**
- Create: `client/src/components/FileDropzone.tsx`, `client/src/components/ReconciliationBanner.tsx`, `client/src/components/StatementList.tsx`
- Rewrite: `client/src/pages/ImportPage.tsx`
- Test: `client/src/components/ReconciliationBanner.test.tsx`, `client/src/pages/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `useUploadStatement`, `useStatements`, `useDeleteStatement`, DTOs.
- Produces: `FileDropzone({ onFile })`, `ReconciliationBanner({ reconciliation })`, `StatementList({ statements, onDelete })`, `ImportPage`.

- [ ] **Step 1: Escribir el test de ReconciliationBanner (componente puro)**

`client/src/components/ReconciliationBanner.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReconciliationBanner } from "./ReconciliationBanner.js";

describe("ReconciliationBanner", () => {
  it("no muestra nada si reconcilia ok", () => {
    const { container } = render(<ReconciliationBanner reconciliation={{ ok: true, entries: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("muestra advertencia con el detalle si no cuadra", () => {
    render(<ReconciliationBanner reconciliation={{ ok: false, entries: [
      { currency: "ARS", expected: 100, parsed: 90, diff: -10, ok: false },
    ] }} />);
    expect(screen.getByText(/no cuadra/i)).toBeInTheDocument();
    expect(screen.getByText(/ARS/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- ReconciliationBanner`
Expected: FAIL.

- [ ] **Step 3: Implementar los componentes**

`client/src/components/ReconciliationBanner.tsx`:
```tsx
import { Alert, AlertTitle } from "@mui/material";
import type { ReconciliationResult } from "@ledgerly/shared";
import { formatMoney } from "../format.js";

interface ReconciliationBannerProps { reconciliation: ReconciliationResult; }

export const ReconciliationBanner = ({ reconciliation }: ReconciliationBannerProps) => {
  if (reconciliation.ok) return null;
  const failed = reconciliation.entries.filter((e) => !e.ok);
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>La reconciliación no cuadra</AlertTitle>
      {failed.map((e) => (
        <div key={e.currency}>
          {e.currency}: esperado {formatMoney(e.expected, e.currency)}, parseado {formatMoney(e.parsed, e.currency)} (dif {formatMoney(e.diff, e.currency)})
        </div>
      ))}
    </Alert>
  );
};
```

`client/src/components/FileDropzone.tsx`:
```tsx
import { useRef, useState, type DragEvent } from "react";
import { Box, Button, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";

interface FileDropzoneProps { onFile: (file: File) => void; disabled?: boolean; }

export const FileDropzone = ({ onFile, disabled = false }: FileDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      sx={{
        border: "2px dashed", borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 2, p: 5, textAlign: "center", mb: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <UploadFileIcon fontSize="large" color="action" />
      <Typography sx={{ my: 1 }}>Arrastrá el PDF del resumen o</Typography>
      <Button variant="contained" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Elegir archivo
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </Box>
  );
};
```

`client/src/components/StatementList.tsx`:
```tsx
import { IconButton, List, ListItem, ListItemText, Chip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { StatementDTO } from "@ledgerly/shared";

interface StatementListProps { statements: StatementDTO[]; onDelete: (id: string) => void; }

export const StatementList = ({ statements, onDelete }: StatementListProps) => {
  if (statements.length === 0) return null;
  return (
    <List>
      {statements.map((s) => (
        <ListItem
          key={s.id}
          secondaryAction={
            <IconButton edge="end" aria-label="borrar" onClick={() => onDelete(s.id)}><DeleteIcon /></IconButton>
          }
        >
          <ListItemText
            primary={`${s.cardLabel} · cierre ${s.closingDate ?? "?"}`}
            secondary={`${s.transactionCount} movimientos`}
          />
          {s.needsReview && <Chip label="revisar" color="warning" size="small" sx={{ mr: 6 }} />}
        </ListItem>
      ))}
    </List>
  );
};
```

`client/src/pages/ImportPage.tsx`:
```tsx
import { useState } from "react";
import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import type { ImportResultDTO } from "@ledgerly/shared";
import { useDeleteStatement, useStatements, useUploadStatement } from "../api/hooks.js";
import { FileDropzone } from "../components/FileDropzone.js";
import { ReconciliationBanner } from "../components/ReconciliationBanner.js";
import { StatementList } from "../components/StatementList.js";

export const ImportPage = () => {
  const upload = useUploadStatement();
  const del = useDeleteStatement();
  const statements = useStatements();
  const [last, setLast] = useState<ImportResultDTO | null>(null);

  const handleFile = (file: File) => {
    upload.mutate({ file }, { onSuccess: setLast });
  };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Importar resumen</Typography>
      <FileDropzone onFile={handleFile} disabled={upload.isPending} />

      {upload.isPending && <Box sx={{ display: "flex", gap: 1, mb: 2 }}><CircularProgress size={20} /> Procesando…</Box>}
      {upload.isError && <Alert severity="error" sx={{ mb: 2 }}>{upload.error.message}</Alert>}
      {last && (
        <>
          <Alert severity={last.status === "duplicate" ? "info" : "success"} sx={{ mb: 2 }}>
            {last.status === "duplicate" ? "Ya estaba importado" : `Importado: ${last.transactionCount} movimientos`}
          </Alert>
          <ReconciliationBanner reconciliation={last.statement.reconciliation} />
        </>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Resúmenes importados</Typography>
      {statements.data && <StatementList statements={statements.data} onDelete={(id) => del.mutate(id)} />}
    </>
  );
};
```

- [ ] **Step 4: Escribir el test de ImportPage (fetch mockeado)**

`client/src/pages/ImportPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportPage } from "./ImportPage.js";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
    new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { "Content-Type": "application/json" } })));
}

beforeEach(() => {
  mockFetch((url) => (url.includes("/statements") ? [] : {}));
});
afterEach(() => vi.restoreAllMocks());

describe("ImportPage", () => {
  it("muestra el dropzone y el título", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByText(/importar resumen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /elegir archivo/i })).toBeInTheDocument();
  });

  it("sube un archivo y muestra el resultado", async () => {
    mockFetch((url, init) => {
      if (url.includes("/statements") && init?.method === "POST") {
        return { status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "r.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Correr los tests**

Run: `npm test -- ImportPage ReconciliationBanner`
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
git add client/src/components/FileDropzone.tsx client/src/components/ReconciliationBanner.tsx client/src/components/StatementList.tsx client/src/pages/ImportPage.tsx client/src/components/ReconciliationBanner.test.tsx client/src/pages/ImportPage.test.tsx
# commit sugerido: "feat(client): página Importar (dropzone + reconciliación + lista)"
```

---

### Task 4: Página Movimientos (DataGrid + filtros + edición inline)

**Files:**
- Create: `client/src/components/FiltersBar.tsx`, `client/src/components/TransactionsTable.tsx`
- Rewrite: `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `useTransactions`, `usePatchTransaction`, `useSearchParams` (react-router).
- Produces: `FiltersBar({ showCategory })` (lee/escribe search params `currency`, `from`, `to`, `category`, `search`), `TransactionsTable({ rows, onCategoryChange })`, `TransactionsPage`.

- [ ] **Step 1: Escribir el test que falla (fetch mockeado)**

`client/src/pages/TransactionsPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionsPage } from "./TransactionsPage.js";

const tx = {
  id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: "1",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions")
      ? { items: [tx], total: 1, page: 1, pageSize: 50 } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("TransactionsPage", () => {
  it("renderiza los movimientos en la tabla", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(screen.getByText("Compras")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- TransactionsPage`
Expected: FAIL.

- [ ] **Step 3: Implementar FiltersBar, tabla y página**

`client/src/components/FiltersBar.tsx`:
```tsx
import { useSearchParams } from "react-router-dom";
import { Box, MenuItem, TextField } from "@mui/material";

interface FiltersBarProps { showCategory?: boolean; }

export const FiltersBar = ({ showCategory = false }: FiltersBarProps) => {
  const [params, setParams] = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      <TextField
        select label="Moneda" size="small" sx={{ minWidth: 120 }}
        value={params.get("currency") ?? "ARS"} onChange={(e) => set("currency", e.target.value)}
      >
        <MenuItem value="ARS">ARS</MenuItem>
        <MenuItem value="USD">USD</MenuItem>
      </TextField>
      <TextField
        label="Desde" type="date" size="small" InputLabelProps={{ shrink: true }}
        value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)}
      />
      <TextField
        label="Hasta" type="date" size="small" InputLabelProps={{ shrink: true }}
        value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)}
      />
      {showCategory && (
        <TextField
          label="Buscar comercio" size="small"
          value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
        />
      )}
    </Box>
  );
};
```

`client/src/components/TransactionsTable.tsx`:
```tsx
import { useMemo } from "react";
import { DataGrid, type GridColDef, type GridRowModel } from "@mui/x-data-grid";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";

interface TransactionsTableProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
}

export const TransactionsTable = ({ rows, onCategoryChange }: TransactionsTableProps) => {
  const columns = useMemo<GridColDef<TransactionDTO>[]>(() => [
    { field: "date", headerName: "Fecha", width: 110 },
    { field: "merchant", headerName: "Comercio", flex: 1, minWidth: 180 },
    { field: "category", headerName: "Categoría", width: 160, editable: true },
    {
      field: "amount", headerName: "Monto", width: 140, type: "number",
      valueGetter: (_v, row) => row.amount,
      valueFormatter: (_v, row) => formatMoney(row.amount, row.currency),
    },
    { field: "type", headerName: "Tipo", width: 110 },
  ], []);

  const processRowUpdate = (next: GridRowModel<TransactionDTO>, prev: GridRowModel<TransactionDTO>) => {
    if (next.category !== prev.category) onCategoryChange(next.id, next.category);
    return next;
  };

  return (
    <div style={{ width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        autoHeight
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={() => undefined}
        initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  );
};
```

`client/src/pages/TransactionsPage.tsx`:
```tsx
import { Alert, CircularProgress, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
import { FiltersBar } from "../components/FiltersBar.js";
import { TransactionsTable } from "../components/TransactionsTable.js";

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const patch = usePatchTransaction();
  const filters: TxFilters = {
    currency: (params.get("currency") as "ARS" | "USD") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    category: params.get("category") ?? undefined,
    search: params.get("search") ?? undefined,
    pageSize: 100,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar showCategory />
      <TransactionsTable
        rows={data?.items ?? []}
        onCategoryChange={(id, category) => patch.mutate({ id, body: { category } })}
      />
    </>
  );
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- TransactionsPage`
Expected: PASS (1 test). Si el DataGrid no renderiza el texto en jsdom por virtualización, agregar en el test `expect(await screen.findByText("MERCADOLIBRE"))`; el DataGrid renderiza filas visibles en jsdom con `autoHeight`.

- [ ] **Step 5: Stage**

```bash
git add client/src/components/FiltersBar.tsx client/src/components/TransactionsTable.tsx client/src/pages/TransactionsPage.tsx client/src/pages/TransactionsPage.test.tsx
# commit sugerido: "feat(client): página Movimientos (DataGrid + filtros + edición inline)"
```

---

### Task 5: Dashboard (KPIs + 4 gráficos + filtros)

**Files:**
- Create: `client/src/components/KpiCards.tsx`, `client/src/components/charts/palette.ts`, `CategoryBreakdownChart.tsx`, `MonthlyTrendChart.tsx`, `FutureInstallmentsChart.tsx`, `TopMerchantsChart.tsx`
- Rewrite: `client/src/pages/DashboardPage.tsx`
- Test: `client/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useSummary`, `useByCategory`, `useMonthly`, `useFutureInstallments`, `useTopMerchants`, `FiltersBar`.
- Produces: `KpiCards({ currency })`, los 4 charts `({ currency, from, to })`, `DashboardPage`.

> Al implementar los charts, **invocar la skill `dataviz`** para la paleta/accesibilidad/ejes. `palette.ts` es un placeholder validado.

- [ ] **Step 1: Escribir el test que falla (fetch mockeado con datos vacíos y con datos)**

`client/src/pages/DashboardPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { DashboardPage } from "./DashboardPage.js";

function route(url: string) {
  if (url.includes("/stats/summary")) return { currency: "ARS", totalPurchases: 2000, transactionCount: 2, statementCount: 1, futureInstallmentTotal: 3000 };
  if (url.includes("/stats/by-category")) return [{ category: "Compras", total: 1500, count: 1 }];
  if (url.includes("/stats/monthly")) return [{ month: "2026-05", total: 2000, count: 2 }];
  if (url.includes("/stats/future-installments")) return [{ month: "2026-06", total: 1500 }];
  if (url.includes("/stats/top-merchants")) return [{ merchant: "MERCADOLIBRE", total: 1500, count: 1 }];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("DashboardPage", () => {
  it("muestra KPIs con el total gastado", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText(/total gastado/i)).toBeInTheDocument());
    expect(screen.getByText(/gasto por categoría/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- DashboardPage`
Expected: FAIL.

- [ ] **Step 3: Implementar paleta, charts, KPIs y página**

`client/src/components/charts/palette.ts`:
```ts
export const CHART_PALETTE = ["#3366CC", "#DC3912", "#FF9900", "#109618", "#990099", "#0099C6", "#DD4477", "#66AA00"];
```

`client/src/components/charts/CategoryBreakdownChart.tsx`:
```tsx
import { PieChart } from "@mui/x-charts/PieChart";
import { Typography } from "@mui/material";
import { useByCategory, type StatFilters } from "../../api/hooks.js";
import { CHART_PALETTE } from "./palette.js";

export const CategoryBreakdownChart = (filters: StatFilters) => {
  const { data } = useByCategory(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;
  const series = data.map((d, i) => ({ id: d.category, value: d.total, label: d.category, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  return <PieChart series={[{ data: series, innerRadius: 40 }]} height={260} />;
};
```

`client/src/components/charts/MonthlyTrendChart.tsx`:
```tsx
import { BarChart } from "@mui/x-charts/BarChart";
import { Typography } from "@mui/material";
import { useMonthly, type StatFilters } from "../../api/hooks.js";

export const MonthlyTrendChart = (filters: StatFilters) => {
  const { data } = useMonthly(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;
  return (
    <BarChart
      height={260}
      xAxis={[{ scaleType: "band", data: data.map((d) => d.month) }]}
      series={[{ data: data.map((d) => d.total), label: "Gastado" }]}
    />
  );
};
```

`client/src/components/charts/FutureInstallmentsChart.tsx`:
```tsx
import { BarChart } from "@mui/x-charts/BarChart";
import { Typography } from "@mui/material";
import { useFutureInstallments, type StatFilters } from "../../api/hooks.js";

export const FutureInstallmentsChart = (filters: StatFilters) => {
  const { data } = useFutureInstallments(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin cuotas pendientes</Typography>;
  return (
    <BarChart
      height={260}
      xAxis={[{ scaleType: "band", data: data.map((d) => d.month) }]}
      series={[{ data: data.map((d) => d.total), label: "Cuotas a vencer", color: "#DC3912" }]}
    />
  );
};
```

`client/src/components/charts/TopMerchantsChart.tsx`:
```tsx
import { BarChart } from "@mui/x-charts/BarChart";
import { Typography } from "@mui/material";
import { useTopMerchants, type StatFilters } from "../../api/hooks.js";

export const TopMerchantsChart = (filters: StatFilters) => {
  const { data } = useTopMerchants({ ...filters, limit: 8 });
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;
  return (
    <BarChart
      height={260}
      layout="horizontal"
      yAxis={[{ scaleType: "band", data: data.map((d) => d.merchant) }]}
      series={[{ data: data.map((d) => d.total), label: "Gasto" }]}
    />
  );
};
```

`client/src/components/KpiCards.tsx`:
```tsx
import { Box, Card, CardContent, Typography } from "@mui/material";
import { useSummary, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <Card><CardContent>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h5">{value}</Typography>
  </CardContent></Card>
);

export const KpiCards = (filters: StatFilters) => {
  const { data } = useSummary(filters);
  if (!data) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
      <Kpi label="Total gastado" value={formatMoney(data.totalPurchases, filters.currency)} />
      <Kpi label="Movimientos" value={String(data.transactionCount)} />
      <Kpi label="Resúmenes" value={String(data.statementCount)} />
      <Kpi label="Deuda en cuotas" value={formatMoney(data.futureInstallmentTotal, filters.currency)} />
    </Box>
  );
};
```

`client/src/pages/DashboardPage.tsx`:
```tsx
import { type ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { type StatFilters } from "../api/hooks.js";
import { FiltersBar } from "../components/FiltersBar.js";
import { KpiCards } from "../components/KpiCards.js";
import { CategoryBreakdownChart } from "../components/charts/CategoryBreakdownChart.js";
import { MonthlyTrendChart } from "../components/charts/MonthlyTrendChart.js";
import { FutureInstallmentsChart } from "../components/charts/FutureInstallmentsChart.js";
import { TopMerchantsChart } from "../components/charts/TopMerchantsChart.js";

const ChartCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card><CardContent>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    {children}
  </CardContent></Card>
);

export const DashboardPage = () => {
  const [params] = useSearchParams();
  const filters: StatFilters = {
    currency: (params.get("currency") as "ARS" | "USD") ?? "ARS",
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>
      <FiltersBar />
      <KpiCards {...filters} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <ChartCard title="Gasto por categoría"><CategoryBreakdownChart {...filters} /></ChartCard>
        <ChartCard title="Evolución mensual"><MonthlyTrendChart {...filters} /></ChartCard>
        <ChartCard title="Cuotas a vencer"><FutureInstallmentsChart {...filters} /></ChartCard>
        <ChartCard title="Top comercios"><TopMerchantsChart {...filters} /></ChartCard>
      </Box>
    </>
  );
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- DashboardPage`
Expected: PASS (1 test).

- [ ] **Step 5: Stage**

```bash
git add client/src/components/KpiCards.tsx client/src/components/charts client/src/pages/DashboardPage.tsx client/src/pages/DashboardPage.test.tsx
# commit sugerido: "feat(client): dashboard con KPIs y 4 gráficos (MUI X Charts)"
```

---

### Task 6: Página Reglas (CRUD + reaplicar)

**Files:**
- Rewrite: `client/src/pages/RulesPage.tsx`
- Create: `client/src/components/CategoryRuleForm.tsx`
- Test: `client/src/pages/RulesPage.test.tsx`

**Interfaces:**
- Consumes: `useCategoryRules`, `useCreateRule`, `useUpdateRule`, `useDeleteRule`, `useApplyRules`.
- Produces: `CategoryRuleForm({ onCreate })`, `RulesPage`.

- [ ] **Step 1: Escribir el test que falla**

`client/src/pages/RulesPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "1", priority: 10, matchType: "regex", pattern: "NETFLIX", category: "Suscripciones", source: "system", enabled: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/category-rules") ? [rule] : {}), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("RulesPage", () => {
  it("lista las reglas existentes", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("NETFLIX")).toBeInTheDocument());
    expect(screen.getByText("Suscripciones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reaplicar/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- RulesPage`
Expected: FAIL.

- [ ] **Step 3: Implementar formulario y página**

`client/src/components/CategoryRuleForm.tsx`:
```tsx
import { useState } from "react";
import { Box, Button, MenuItem, TextField } from "@mui/material";

interface RuleFormValues { priority: number; matchType: string; pattern: string; category: string; }
interface CategoryRuleFormProps { onCreate: (values: RuleFormValues) => void; }

export const CategoryRuleForm = ({ onCreate }: CategoryRuleFormProps) => {
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const [matchType, setMatchType] = useState("contains");

  const submit = () => {
    if (!pattern || !category) return;
    onCreate({ priority: 100, matchType, pattern, category });
    setPattern("");
    setCategory("");
  };

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 3, flexWrap: "wrap" }}>
      <TextField label="Patrón" size="small" value={pattern} onChange={(e) => setPattern(e.target.value)} />
      <TextField select label="Tipo" size="small" sx={{ minWidth: 120 }} value={matchType} onChange={(e) => setMatchType(e.target.value)}>
        <MenuItem value="contains">contiene</MenuItem>
        <MenuItem value="regex">regex</MenuItem>
      </TextField>
      <TextField label="Categoría" size="small" value={category} onChange={(e) => setCategory(e.target.value)} />
      <Button variant="contained" onClick={submit}>Agregar</Button>
    </Box>
  );
};
```

`client/src/pages/RulesPage.tsx`:
```tsx
import { Alert, Button, CircularProgress, IconButton, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useApplyRules, useCategoryRules, useCreateRule, useDeleteRule, useUpdateRule } from "../api/hooks.js";
import { CategoryRuleForm } from "../components/CategoryRuleForm.js";

export const RulesPage = () => {
  const { data, isLoading, isError, error } = useCategoryRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const apply = useApplyRules();

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Reglas de categoría</Typography>
        <Button variant="outlined" onClick={() => apply.mutate()} disabled={apply.isPending}>
          Reaplicar a todo
        </Button>
      </Stack>

      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados</Alert>}

      <CategoryRuleForm onCreate={(values) => create.mutate(values)} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Prioridad</TableCell><TableCell>Tipo</TableCell><TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell><TableCell>Activa</TableCell><TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {(data ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.priority}</TableCell>
              <TableCell>{r.matchType}</TableCell>
              <TableCell>{r.pattern}</TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell>
                <Switch checked={r.enabled} onChange={(e) => update.mutate({ id: r.id, body: { enabled: e.target.checked } })} />
              </TableCell>
              <TableCell>
                <IconButton aria-label="borrar" onClick={() => del.mutate(r.id)}><DeleteIcon /></IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- RulesPage`
Expected: PASS (1 test).

- [ ] **Step 5: Stage**

```bash
git add client/src/pages/RulesPage.tsx client/src/components/CategoryRuleForm.tsx client/src/pages/RulesPage.test.tsx
# commit sugerido: "feat(client): página Reglas (CRUD + reaplicar)"
```

---

### Task 7: Integración end-to-end + README

**Files:**
- Create: `README.md`
- Verify: todo el stack levantado

**Interfaces:**
- Consumes: todo lo anterior (Fases 1–3).
- Produces: instrucciones reproducibles + verificación manual.

- [ ] **Step 1: Correr toda la suite y el typecheck del monorepo**

Run:
```bash
npm test
npm run typecheck
```
Expected: todos los tests (shared + server + client) verdes; typecheck sin errores.

- [ ] **Step 2: Verificación end-to-end manual (skill `run`/`verify`)**

```bash
docker compose up -d          # Mongo
npm run seed                  # reglas base
npm run dev                   # server:4000 + client:5173
```
Verificar en `http://localhost:5173`:
1. **Importar** → arrastrar `examples/UltimaLiquidacion.pdf` → aparece "Importado: N movimientos", sin banner de reconciliación (o con detalle si no cuadra).
2. Importar `examples/Resumen14jul2026.pdf` (ICBC) → idem.
3. **Movimientos** → se ven las transacciones; editar la categoría de una fila inline → persiste al recargar.
4. **Dashboard** → los 4 gráficos con datos; cambiar Moneda ARS↔USD en FiltersBar actualiza todo.
5. **Reglas** → agregar una regla, "Reaplicar a todo" → se recategoriza; toggling enabled funciona.

> Al pulir los gráficos, invocar la skill `dataviz` (paleta accesible, comportamiento light/dark, formato de ejes en `$`).

- [ ] **Step 3: Escribir el README**

`README.md`:
```markdown
# Ledgerly

Gastos corrientes a partir del PDF del resumen de tarjeta (Visa Signature / ICBC).
Vite + React 19 + MUI · Express + MongoDB.

## Requisitos
- Node ≥ 20, Docker (para Mongo local).

## Puesta en marcha
\`\`\`bash
npm install
cp .env.example .env
docker compose up -d       # MongoDB en localhost:27017
npm run seed               # reglas de categoría base
npm run dev                # API :4000 + SPA :5173
\`\`\`

## Scripts
- `npm run dev` — backend + frontend
- `npm test` — toda la suite (Vitest)
- `npm run typecheck` — TypeScript de todo el monorepo
- `npm run seed` — siembra reglas de categoría

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
```

- [ ] **Step 4: Stage**

```bash
git add README.md
# commit sugerido: "docs: README con puesta en marcha del monorepo"
```

---

## Definition of Done (Fase 3)

- `npm test` verde en shared + server + client.
- `npm run dev` levanta API + SPA; el flujo completo (importar → ver movimientos → editar categoría → dashboard → reglas) funciona contra los PDFs reales.
- Se respetan los estándares React del CLAUDE.md (componentes funcionales, destructuring en la firma, early returns, sin `any`, sin index como key, sin comentarios).
- Los 4 gráficos renderizan con datos y responden al cambio de moneda; charts pulidos con la skill `dataviz`.

**Producto final:** Ledgerly funcionando de punta a punta — cargar el PDF del resumen y ver gráficos y estadísticas de los gastos.
