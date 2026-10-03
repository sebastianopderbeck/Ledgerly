# Responsive mobile — Fase 3 (Tablas) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En pantallas de menos de 900px, cada tabla de Ledgerly se vuelve una lista táctil: Movimientos como filas con hoja de edición, selección múltiple y «Ver más»; cupones de Crédito y Auto y recibos de Sueldo como tarjetas con "Ver detalle" y una hoja para corregir el TC con teclado decimal; Reglas como tarjetas con hojas para crear y editar; e Importar con un botón «Elegir PDF» y los archivos importados como tarjetas. La vista de compu no cambia.

**Architecture:** Cada página (y la sección de archivos importados) elige con `useIsMobile()` entre el componente de compu, que no se toca, y uno mobile con las mismas props o los mismos hooks de datos. Las piezas mobile comparten tres bloques: `RecordCard` (tarjeta con título, meta, dos destacados y detalle plegable en `Collapse`), `useSheetTarget()` (qué registro edita la hoja y si está abierta) y las hojas sobre el `BottomSheet` de la Fase 1 (`RateSheet`, `TransactionSheet`, `RuleSheet`), cada una con un formulario interno con `key` por registro. Los borrados pasan siempre por el `ConfirmDialog` existente. Lo que es solo layout (padding del dropzone, encabezado de Reglas) va con breakpoints de `sx`.

**Tech Stack:** React 18 + MUI 6.5 + MUI X DataGrid + React Query 5 (cliente); Vitest + Testing Library en jsdom; Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md` (sección "Fase 3 — Tablas", más "Arquitectura", "Decisiones tomadas", "Tests" y "Fuera de alcance")

## Prerrequisitos

1. La base es `main`, que ya trae la Fase 1 (`useIsMobile`, `testing/viewport.ts`, `BottomSheet`, barra inferior) y los archivos importados (PR #8). Verificarlo desde la raíz del worktree:

   ```bash
   test -f client/src/useIsMobile.ts && echo "useIsMobile OK"
   grep -n "export const emulateMobile" client/src/testing/viewport.ts
   grep -n "keepMounted: false" client/src/components/BottomSheet.tsx
   grep -n "export const MOBILE_NAV_HEIGHT = 64" client/src/components/layout/MobileBottomNav.tsx
   test -f client/src/components/ImportedFilesTable.tsx && echo "archivos importados OK"
   ```

   Las cinco tienen que dar resultado. Si falta alguna, **frenar y preguntarle al usuario** desde qué base arrancar.
2. Trabajar en la rama `feat/responsive-mobile-fase-3`, en el worktree `.claude/worktrees/responsive-mobile-fase-3` (ya creado desde `main`). La Fase 2 (KPIs y gráficos) vive en otra rama y **no** está en esta base: no usar `useChartLayout`, `ChartLegend` ni el `Kpi` unificado. Este plan no toca ningún archivo de la Fase 2, así que las dos ramas se pueden mergear en cualquier orden.
3. `bun install` (el worktree es nuevo y no tiene `node_modules`).

## Ajustes respecto del spec

Decisiones de detalle tomadas al planificar; no cambian lo acordado:

- **`StatementList` ya no existe** (el spec dice que "no cambia"): el PR #8 lo reemplazó por `ImportedFilesSection` (filtros + `ImportedFilesTable`, una DataGrid). Como en mobile sería una grilla, `ImportedFilesSection` elige con `useIsMobile()` entre la tabla y **`ImportedFileCards`** (una `RecordCard` por archivo: nombre, chip de tipo y "revisar", detalle como meta, Fecha e Importado como destacados, y un botón de borrar que pasa por el mismo `ConfirmDialog` y mensaje que la tabla). `ImportedFilesFilters` queda igual: los filtros en hoja son de la Fase 4.
- El mensaje de borrado de archivos pasa a una función pura `importedFileDeleteMessage` en `importedFiles.ts`, que usan las tarjetas. `ImportedFilesTable` conserva su copia local porque los componentes de compu no se tocan; unificarlas queda como refactor sugerido.
- **`RecordCard`** suma dos ranuras opcionales: `badge` (junto al título: chip SAC, tipo de archivo, "revisar") y `action` (esquina derecha: borrar archivo). Cada tarjeta es un `article` con `aria-label` igual al título. También exporta `RecordFields` (grilla `dl` de 2 columnas, que reusa `TransactionSheet`) y `recordListSx`.
- El detalle de `RecordCard` usa `Collapse` con `unmountOnExit`: los campos (y el ✎ del TC) se montan recién al abrir. El botón pasa de «Ver detalle» a «Ocultar detalle» y expone `aria-expanded`.
- **Guardar deshabilitado** mientras no haya nada válido para guardar, en las tres hojas: TC ≤ 0, igual al actual, vacío o no numérico; categoría vacía o sin cambios; patrón o categoría vacíos o prioridad no numérica. Es la misma regla que la celda de compu, pero visible en lugar de cerrar sin avisar.
- **`RateSheet` acepta coma decimal**: el teclado `inputMode="decimal"` del iPhone en castellano solo tiene coma, así que `parseRate("1415,5")` da `1415.5`. El campo es de texto (no `type="number"`), se llama "TC oficial", y suma «Cancelar». La hoja se titula `TC cuota N` o `TC recibo AAAA-MM`; el ✎ conserva los `aria-label` de compu (`editar TC cuota N`, `editar TC recibo AAAA-MM`).
- **Estado de las hojas**: `useSheetTarget<T>()` guarda el registro y si la hoja está abierta, y conserva el registro mientras la hoja se cierra (el título no parpadea). El formulario de cada hoja es un componente interno con `key` por registro: si se reabre para otro registro antes de que termine la animación de cierre, arranca con los valores de ese registro.
- **`TransactionSheet`**: el título es el comercio; el `Autocomplete` `freeSolo` se controla por `inputValue` (lo tipeado cuenta sin apretar Enter); pide `useCategories()` adentro, así `TransactionsList` recibe exactamente las props de `TransactionsTable`. «Borrar» cierra la hoja y abre el `ConfirmDialog` (sin dos modales apilados), con el mismo título y mensajes que la tabla.
- **`TransactionsList`**: encabezado "N movimientos" + «Seleccionar»; en modo selección, tocar la fila marca su checkbox y no abre la hoja. La barra fija es un `toolbar` "selección" de 64px en `bottom: calc(64px + env(safe-area-inset-bottom))` (arriba de la barra inferior) y, mientras está, la lista reserva 64px abajo para que la última fila y «Ver más» no queden tapadas. Al confirmar el borrado sale del modo selección. Filas en el orden de la API (como la grilla) y texto propio si no hay movimientos.
- `installmentLabel` (N/M, "cuota" o nada) sale a `client/src/transactionInstallment.ts` para la fila y la hoja; la columna de `TransactionsTable` conserva su copia.
- `TransactionsPage` pasa a memorizar los dos handlers con `useCallback` sobre los `mutate` (estables) y los entrega a la vista que corresponda; en compu la tabla recibe callbacks equivalentes a los de hoy.
- **Contenido de las tarjetas**: "—" cuando falta Pagado USD / Neto USD (nueva `formatMoneyOrDash` en `format.ts`); los campos por concepto usan el mismo `uniqueConceptLabels` que la tabla de compu (en Sueldo hoy es solo "RETENCION 4º CATEGORÍA"), así una tarjeta muestra lo mismo que su fila; el orden es el de la tabla (cupones por cuota ascendente, recibos por período descendente). La tarjeta de recibo no lleva meta (el spec no da ninguna).
- **Reglas mobile** viven en `RulesMobile` («Nueva regla» a ancho completo, `RuleCards`, `RuleSheet` y confirmación). El tipo se muestra "contiene"/"regex" como en el formulario de compu. `RuleSheet` usa el mismo orden en los dos modos: Prioridad (solo al editar), Tipo, Patrón, Categoría. El patrón va en monoespaciada y sin autocorrección ni mayúsculas automáticas del teclado del celular.
- **Borrar una regla en mobile pide confirmación** ("Borrar regla"), aunque en compu se borra directo: en la hoja, Borrar queda al lado de Guardar y un toque errado no se puede deshacer.
- La tarjeta de regla es un `CardActionArea` (`aria-label="editar <patrón>"`) con el `Switch` afuera (`aria-label="activa <patrón>"`), así activar o desactivar no abre la hoja. «Reaplicar a todo» queda a ancho completo debajo del título con `direction={{ xs: "column", md: "row" }}` y `alignItems: { xs: "stretch", md: "center" }`; en compu el encabezado queda igual.
- **`FileDropzone`** recibe la rama mobile adentro (el spec lo nombra): sin el texto de arrastrar, botón «Elegir PDF» a ancho completo y `p: { xs: 3, md: 5 }`. En compu el texto, el botón «Elegir archivo» y el padding no cambian, y sus tests actuales lo cubren.
- El helper de tests `cssFor` sale a `client/src/testing/cssFor.ts` (misma implementación que la copia local de `Layout.test.tsx`, que no se toca).
- Los tests mobile de cada página van en su archivo de test existente, en un `describe("… en mobile")` que reusa los fixtures de `fetch`; esos archivos suman `vi.unstubAllGlobals()` (y `cleanup()` en `RulesPage.test.tsx`, que no lo tenía) en su `afterEach`.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits**: un commit por task en `feat/responsive-mobile-fase-3`, con el mensaje exacto del task (dos `-m`) y pathspec explícito. Nunca `git add -A` ni `git add .`. Nunca push ni merge.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Hooks como `export function useX()`.
- Mapeos, filtros y condicionales complejos antes del `return`, no dentro del JSX. `useCallback` para funciones que se pasan a componentes hijos. Nunca usar el índice del array como `key` (se usa el `id` del registro o el `label` del campo, que es único dentro de una tarjeta).
- **Corte mobile: `< md` (900px)**. Toda decisión estructural (tabla ↔ tarjetas, texto del dropzone) pasa por `useIsMobile()`; lo que es solo layout usa breakpoints `xs`/`md` en `sx`.
- **La vista de compu no cambia**: `TransactionsTable`, `MortgageCouponsTable`, `AutoCouponsTable`, `PayslipsTable`, `CategoryRuleForm`, `CategoryRuleRow`, `ImportedFilesTable` e `ImportedFilesFilters` no se tocan; en ≥ 900px cada página renderiza lo mismo que hoy, y los tests de compu existentes pasan sin cambios (solo se les agrega limpieza en `afterEach`).
- **Los hooks van antes de cualquier `return` temprano**: `useIsMobile()` en `TransactionsPage`, `PayslipsPage`, `RulesPage` e `ImportedFilesSection` va con los demás hooks, antes de los `return` de carga/error; en las tarjetas, `usePatch…Rate()` y `useSheetTarget()` van antes del `return null`.
- Copy de UI en español: «Ver detalle», «Ocultar detalle», «Guardar», «Cancelar», «Borrar», «Borrar (n)», «Seleccionar», «Ver más», «Nueva regla», «Reaplicar a todo», «Elegir PDF», "TC oficial", "Pagado USD", "Neto USD".
- Accesibilidad: cada tarjeta es `article` con `aria-label`; las hojas son `dialog` con nombre igual al título; la barra de selección es `toolbar` "selección"; la lista de Movimientos es una `section` "movimientos" (rol `region`).
- Tests de cliente con más de un render llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo). Los que emulan viewport llaman `vi.unstubAllGlobals()` en `afterEach`. Ojo: al cerrarse, una hoja queda `aria-hidden` en el acto aunque siga montada hasta terminar la animación, así que `queryByRole("dialog")` da `null` enseguida; no usarlo para suponer que el formulario se desmontó.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Comandos (desde la raíz del worktree): `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Teclado decimal del iPhone en castellano**: solo tiene coma; si «1415,5» se lee como `NaN`, Guardar no hace nada y el TC no se puede corregir desde el celular. → test "guarda el TC escrito con coma, como lo escribe el teclado del iPhone en castellano" en Task 3 (y el PATCH con coma en Tasks 4 y 6).
2. **La barra «Borrar (n)» tapa la navegación o el final de la lista**: tiene que quedar arriba de la barra inferior y su zona segura, y la lista tiene que dejarle lugar para que la última fila y «Ver más» se puedan tocar. → test "la barra de selección queda arriba de la navegación y la lista le deja lugar" en Task 8.
3. **Seleccionar varias filas abre una hoja por toque**: en modo selección, tocar la fila tiene que marcarla, no abrir `TransactionSheet`. → test "en modo selección, tocar la fila la marca y no abre la hoja" en Task 8.
4. **Borrar por error con el pulgar**: en la hoja, Borrar está al lado de Guardar; un toque errado no puede borrar sin confirmar, y Cancelar no borra nada. → test "Borrar desde la hoja y después Cancelar no borra nada" en Task 8 (y "borrar desde la hoja pide confirmación…" para reglas en Task 11).
5. **iPad que rota (o ventana que se agranda) con una hoja abierta**: la vista pasa a la tabla de compu; no puede quedar un backdrop huérfano ni el `body` con `overflow: hidden`. → test "si la pantalla pasa a tamaño compu con la hoja abierta, no queda nada tapando la tabla" en Task 9.

---

### Task 1: `RecordCard`

**Files:**
- Create: `client/src/components/RecordCard.tsx`
- Test: `client/src/components/RecordCard.test.tsx`

**Interfaces:**
- Produces:
  - `interface RecordField { label: string; value: ReactNode }`
  - `RecordCard` con props `{ title: string; meta?: string; badge?: ReactNode; action?: ReactNode; highlights: RecordField[]; details: RecordField[] }` — `article` con `aria-label={title}`; sin `details` no muestra «Ver detalle».
  - `RecordFields` con props `{ fields: RecordField[]; emphasis?: boolean }` — `dl` en grilla de 2 columnas.
  - `recordListSx: SxProps<Theme>` — grilla de una columna con `gap: 1.5` para apilar tarjetas.

- [ ] **Step 1: Write the failing test**

`client/src/components/RecordCard.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip, IconButton } from "@mui/material";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RecordCard, type RecordField } from "./RecordCard.js";

afterEach(cleanup);

const highlights: RecordField[] = [
  { label: "Total", value: "$ 1.097.687,93" },
  { label: "Pagado USD", value: "US$ 813,10" },
];

const details: RecordField[] = [
  { label: "Capital", value: "$ 184.689,39" },
  { label: "Interés", value: "$ 903.304,93" },
];

const card = () => screen.getByRole("article", { name: "Cuota 6" });

describe("RecordCard", () => {
  it("muestra título, meta y los dos datos destacados", () => {
    renderWithProviders(<RecordCard title="Cuota 6" meta="2026-01-19" highlights={highlights} details={details} />);
    expect(within(card()).getByText("2026-01-19")).toBeInTheDocument();
    expect(within(card()).getByText("Total")).toBeInTheDocument();
    expect(within(card()).getByText("$ 1.097.687,93")).toBeInTheDocument();
    expect(within(card()).getByText("Pagado USD")).toBeInTheDocument();
  });

  it("el detalle está plegado y «Ver detalle» lo despliega", async () => {
    renderWithProviders(<RecordCard title="Cuota 6" highlights={highlights} details={details} />);
    expect(within(card()).queryByText("Capital")).not.toBeInTheDocument();
    const toggle = within(card()).getByRole("button", { name: "Ver detalle" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(within(card()).getByText("Capital")).toBeInTheDocument();
    expect(within(card()).getByText("$ 903.304,93")).toBeInTheDocument();
    expect(within(card()).getByRole("button", { name: "Ocultar detalle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("sin campos de detalle no ofrece «Ver detalle»", () => {
    renderWithProviders(<RecordCard title="Cuota 6" highlights={highlights} details={[]} />);
    expect(within(card()).queryByRole("button", { name: "Ver detalle" })).not.toBeInTheDocument();
  });

  it("muestra la insignia junto al título y la acción de la tarjeta", async () => {
    const onAction = vi.fn();
    renderWithProviders(
      <RecordCard
        title="Cuota 6"
        badge={<Chip label="SAC" size="small" />}
        action={<IconButton aria-label="borrar cuota 6" onClick={onAction}>x</IconButton>}
        highlights={highlights}
        details={details}
      />,
    );
    expect(within(card()).getByText("SAC")).toBeInTheDocument();
    await userEvent.click(within(card()).getByRole("button", { name: "borrar cuota 6" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/RecordCard.test.tsx`
Expected: FAIL — no se resuelve `./RecordCard.js`.

- [ ] **Step 3: Implement**

`client/src/components/RecordCard.tsx`:

```tsx
import { useCallback, useState, type ReactNode } from "react";
import { Box, Button, Card, CardContent, Collapse, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export interface RecordField {
  label: string;
  value: ReactNode;
}

interface RecordFieldsProps {
  fields: RecordField[];
  emphasis?: boolean;
}

interface RecordCardProps {
  title: string;
  meta?: string;
  badge?: ReactNode;
  action?: ReactNode;
  highlights: RecordField[];
  details: RecordField[];
}

export const recordListSx: SxProps<Theme> = { display: "grid", gap: 1.5 };

const fieldsGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 2,
  rowGap: 1.5,
  m: 0,
};

const chevronSx = (expanded: boolean): SxProps<Theme> => ({
  transform: expanded ? "rotate(180deg)" : "none",
  transition: "transform 200ms ease",
});

export const RecordFields = ({ fields, emphasis = false }: RecordFieldsProps) => {
  const valueVariant = emphasis ? "subtitle1" : "body2";
  const valueWeight = emphasis ? 600 : 400;
  const items = fields.map(({ label, value }) => (
    <Box key={label} sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="dd" variant={valueVariant} sx={{ m: 0, fontWeight: valueWeight, overflowWrap: "anywhere" }}>
        {value}
      </Typography>
    </Box>
  ));
  return <Box component="dl" sx={fieldsGridSx}>{items}</Box>;
};

export const RecordCard = ({ title, meta, badge, action, highlights, details }: RecordCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const toggleLabel = expanded ? "Ocultar detalle" : "Ver detalle";
  const hasDetails = details.length > 0;

  return (
    <Card component="article" aria-label={title}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{title}</Typography>
              {badge}
            </Box>
            {meta && <Typography variant="body2" color="text.secondary">{meta}</Typography>}
          </Box>
          {action}
        </Box>
        <RecordFields fields={highlights} emphasis />
        {hasDetails && (
          <>
            <Button
              size="small"
              onClick={toggle}
              aria-expanded={expanded}
              endIcon={<ExpandMoreIcon sx={chevronSx(expanded)} />}
              sx={{ mt: 1, ml: -1 }}
            >
              {toggleLabel}
            </Button>
            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ pt: 1 }}>
                <RecordFields fields={details} />
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/RecordCard.test.tsx`
Expected: PASS (4 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/RecordCard.tsx client/src/components/RecordCard.test.tsx
git commit -m "feat(client): tarjeta de registro con detalle plegable para mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `useSheetTarget` y `formatMoneyOrDash`

**Files:**
- Create: `client/src/components/useSheetTarget.ts`
- Test: `client/src/components/useSheetTarget.test.ts`
- Modify: `client/src/format.ts`
- Test: `client/src/format.test.ts`

**Interfaces:**
- Produces:
  - `interface SheetTarget<T> { target: T | null; open: boolean; show: (target: T) => void; close: () => void }`
  - `useSheetTarget<T>(): SheetTarget<T>` — `show` abre con ese registro; `close` cierra y conserva `target` (para el título mientras la hoja se va). `show` y `close` son estables.
  - `formatMoneyOrDash(amount: number | null, currency: "ARS" | "USD"): string` — `formatMoney` o `"—"`.

- [ ] **Step 1: Write the failing tests**

`client/src/components/useSheetTarget.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSheetTarget } from "./useSheetTarget.js";

afterEach(cleanup);

describe("useSheetTarget", () => {
  it("arranca cerrada y sin registro", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("show abre la hoja con el registro elegido", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    act(() => result.current.show("cuota 6"));
    expect(result.current.open).toBe(true);
    expect(result.current.target).toBe("cuota 6");
  });

  it("close cierra la hoja pero conserva el registro mientras se va", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    act(() => result.current.show("cuota 6"));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBe("cuota 6");
  });
});
```

En `client/src/format.test.ts`, cambiar el import a:

```ts
import { formatLocalDate, formatMoney, formatMoneyOrDash, formatUva } from "./format.js";
```

y agregar al final:

```ts
describe("formatMoneyOrDash", () => {
  it("formatea el monto como formatMoney", () => {
    expect(formatMoneyOrDash(813.1, "USD")).toBe(formatMoney(813.1, "USD"));
  });

  it("sin monto muestra un guion", () => {
    expect(formatMoneyOrDash(null, "ARS")).toBe("—");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/useSheetTarget.test.ts client/src/format.test.ts`
Expected: FAIL — no se resuelve `./useSheetTarget.js` y `formatMoneyOrDash` no existe.

- [ ] **Step 3: Implement**

`client/src/components/useSheetTarget.ts`:

```ts
import { useCallback, useState } from "react";

export interface SheetTarget<T> {
  target: T | null;
  open: boolean;
  show: (target: T) => void;
  close: () => void;
}

export function useSheetTarget<T>(): SheetTarget<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: T) => {
    setTarget(next);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { target, open, show, close };
}
```

Al final de `client/src/format.ts`:

```ts
export function formatMoneyOrDash(amount: number | null, currency: "ARS" | "USD"): string {
  return amount === null ? "—" : formatMoney(amount, currency);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/useSheetTarget.test.ts client/src/format.test.ts`
Expected: PASS (3 tests del hook; 4 en `format.test.ts`).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/useSheetTarget.ts client/src/components/useSheetTarget.test.ts client/src/format.ts client/src/format.test.ts
git commit -m "feat(client): estado compartido de las hojas de edición y monto o guion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `RateSheet` y `RateValue`

**Files:**
- Create: `client/src/components/RateSheet.tsx`
- Test: `client/src/components/RateSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (`{ open, onClose, title, children, actions? }`, Fase 1); `formatMoneyOrDash` (Task 2).
- Produces:
  - `parseRate(value: string): number` — admite coma o punto decimal.
  - `canSaveRate(rate: number, current: number | null): boolean` — `rate > 0 && rate !== current`.
  - `RateSheet` con props `{ open: boolean; title: string; current: number | null; onSave: (rate: number) => void; onClose: () => void }` — hoja con un campo "TC oficial" (`inputMode="decimal"`, precargado), «Cancelar» y «Guardar» (deshabilitado si `!canSaveRate`). Guardar llama `onSave(rate)` y `onClose()`.
  - `RateValue` con props `{ rate: number | null; editLabel: string; onEdit: () => void }` — el TC formateado (o "—") y un ✎ con `aria-label={editLabel}`.

- [ ] **Step 1: Write the failing test**

`client/src/components/RateSheet.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateSheet, RateValue, canSaveRate, parseRate } from "./RateSheet.js";

afterEach(cleanup);

const noop = () => undefined;

const rateInput = (title = "TC cuota 6") =>
  within(screen.getByRole("dialog", { name: title })).getByRole("textbox", { name: "TC oficial" });

const saveButton = () =>
  within(screen.getByRole("dialog", { name: "TC cuota 6" })).getByRole("button", { name: "Guardar" });

describe("parseRate y canSaveRate", () => {
  it("acepta coma o punto como separador decimal", () => {
    expect(parseRate("1415,5")).toBe(1415.5);
    expect(parseRate(" 1415.5 ")).toBe(1415.5);
  });

  it("solo deja guardar un TC mayor a cero y distinto del actual", () => {
    expect(canSaveRate(1400, 1350)).toBe(true);
    expect(canSaveRate(1400, null)).toBe(true);
    expect(canSaveRate(1350, 1350)).toBe(false);
    expect(canSaveRate(0, 1350)).toBe(false);
    expect(canSaveRate(-5, 1350)).toBe(false);
    expect(canSaveRate(parseRate(""), 1350)).toBe(false);
    expect(canSaveRate(parseRate("abc"), 1350)).toBe(false);
  });
});

describe("RateSheet", () => {
  it("abre con el TC actual y pide el teclado decimal", () => {
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={noop} onClose={noop} />);
    expect(rateInput()).toHaveValue("1350");
    expect(rateInput()).toHaveAttribute("inputmode", "decimal");
  });

  it("sin TC cargado arranca vacía", () => {
    render(<RateSheet open title="TC cuota 6" current={null} onSave={noop} onClose={noop} />);
    expect(rateInput()).toHaveValue("");
  });

  it("guarda el TC escrito con coma, como lo escribe el teclado del iPhone en castellano", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={onSave} onClose={onClose} />);
    await userEvent.clear(rateInput());
    await userEvent.type(rateInput(), "1415,5");
    await userEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(1415.5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no deja guardar el mismo TC ni uno menor o igual a cero", async () => {
    const onSave = vi.fn();
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={onSave} onClose={noop} />);
    expect(saveButton()).toBeDisabled();
    await userEvent.clear(rateInput());
    await userEvent.type(rateInput(), "0");
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("si se reabre enseguida para otro registro, muestra el TC de ese registro y no lo que se había tipeado", () => {
    const { rerender } = render(<RateSheet open title="TC cuota 1" current={1350} onSave={noop} onClose={noop} />);
    fireEvent.change(rateInput("TC cuota 1"), { target: { value: "999" } });
    rerender(<RateSheet open={false} title="TC cuota 1" current={1350} onSave={noop} onClose={noop} />);
    rerender(<RateSheet open title="TC cuota 6" current={1400} onSave={noop} onClose={noop} />);
    expect(rateInput("TC cuota 6")).toHaveValue("1400");
  });
});

describe("RateValue", () => {
  it("muestra el TC y el lápiz pide editarlo", async () => {
    const onEdit = vi.fn();
    render(<RateValue rate={null} editLabel="editar TC cuota 6" onEdit={onEdit} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "editar TC cuota 6" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
```

(El test de reapertura usa `fireEvent.change` a propósito: con `userEvent` el input queda enfocado y su desmontaje dispara un aviso de `act` de `FormControl`. Ese test falla si se saca el `key` del formulario interno.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/RateSheet.test.tsx`
Expected: FAIL — no se resuelve `./RateSheet.js`.

- [ ] **Step 3: Implement**

`client/src/components/RateSheet.tsx`:

```tsx
import { useState, type ChangeEvent } from "react";
import { Box, Button, IconButton, TextField } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { formatMoneyOrDash } from "../format.js";
import { BottomSheet } from "./BottomSheet.js";

interface RateSheetProps {
  open: boolean;
  title: string;
  current: number | null;
  onSave: (rate: number) => void;
  onClose: () => void;
}

interface RateFormProps {
  current: number | null;
  onSave: (rate: number) => void;
  onClose: () => void;
}

interface RateValueProps {
  rate: number | null;
  editLabel: string;
  onEdit: () => void;
}

export const parseRate = (value: string): number => Number(value.trim().replace(",", "."));

export const canSaveRate = (rate: number, current: number | null): boolean => rate > 0 && rate !== current;

const RateForm = ({ current, onSave, onClose }: RateFormProps) => {
  const [value, setValue] = useState(current === null ? "" : String(current));
  const rate = parseRate(value);
  const saveable = canSaveRate(rate, current);

  const change = (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value);

  const save = () => {
    if (!saveable) return;
    onSave(rate);
    onClose();
  };

  return (
    <>
      <TextField
        label="TC oficial"
        fullWidth
        value={value}
        onChange={change}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        sx={{ mt: 1 }}
      />
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button fullWidth onClick={onClose}>Cancelar</Button>
        <Button fullWidth variant="contained" disabled={!saveable} onClick={save}>Guardar</Button>
      </Box>
    </>
  );
};

export const RateSheet = ({ open, title, current, onSave, onClose }: RateSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={title}>
    <RateForm key={title} current={current} onSave={onSave} onClose={onClose} />
  </BottomSheet>
);

export const RateValue = ({ rate, editLabel, onEdit }: RateValueProps) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
    {formatMoneyOrDash(rate, "ARS")}
    <IconButton size="small" aria-label={editLabel} onClick={onEdit} sx={{ p: 1 }}>
      <EditIcon fontSize="small" />
    </IconButton>
  </Box>
);
```

El `key={title}` funciona porque el título nombra al registro (`TC cuota 6`, `TC recibo 2026-03`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/RateSheet.test.tsx`
Expected: PASS (8 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/RateSheet.tsx client/src/components/RateSheet.test.tsx
git commit -m "feat(client): hoja para corregir el TC con teclado decimal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Créditos — `MortgageCouponCards`

**Files:**
- Create: `client/src/components/MortgageCouponCards.tsx`
- Modify: `client/src/pages/CreditsPage.tsx`
- Test: `client/src/pages/CreditsPage.test.tsx`

**Interfaces:**
- Consumes: `RecordCard`, `recordListSx`, `RecordField` (Task 1); `useSheetTarget`, `formatMoneyOrDash` (Task 2); `RateSheet`, `RateValue` (Task 3); `useCreditCouponsInYears()` (`{ data: MortgageCouponDTO[] | undefined }`); `usePatchCouponRate()` (`mutate({ id, tipoCambioUsd })` → `PATCH /api/credits/coupons/:id`); `useIsMobile()`; `emulateMobile()`.
- Produces: `MortgageCouponCards` (sin props) — una tarjeta por cupón del año elegido: "Cuota N" / `fechaDebito`; destacados Total (`totalDebitado`) y Pagado USD; detalle Capital, Interés, Seguro, Cuota UVA, Cotización UVA y TC oficial ✎. `null` si no hay cupones (igual que la tabla).

- [ ] **Step 1: Write the failing tests**

En `client/src/pages/CreditsPage.test.tsx`:

1. Cambiar el import de Testing Library y agregar el de viewport debajo del de `renderWithProviders`:

```tsx
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
```

```tsx
import { emulateMobile } from "../testing/viewport.js";
```

2. El `afterEach` queda:

```tsx
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

3. Agregar al final del archivo:

```tsx
const patches = () => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PATCH")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

const openRateSheet = async (cuota: number) => {
  const card = await screen.findByRole("article", { name: `Cuota ${cuota}` });
  await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
  await userEvent.click(within(card).getByRole("button", { name: `editar TC cuota ${cuota}` }));
  return screen.getByRole("dialog", { name: `TC cuota ${cuota}` });
};

describe("CreditsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, sin tabla", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    expect(await screen.findByRole("article", { name: "Cuota 1" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cuota 6" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del cupón", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const sheet = await openRateSheet(6);
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1350");
    await userEvent.clear(input);
    await userEvent.type(input, "1415,5");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/credits/coupons/2", body: { tipoCambioUsd: 1415.5 } }]));
  });

  it("un TC igual al actual o de 0 no manda nada", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const sheet = await openRateSheet(6);
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    fireEvent.click(save);
    expect(patches()).toEqual([]);
  });
});
```

(En el fixture, el cupón `id: "2"` es la cuota 6, con `tipoCambioUsd: 1350`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/CreditsPage.test.tsx`
Expected: FAIL en los 3 tests de "CreditsPage en mobile" — no hay `article` "Cuota 1" (se ve la tabla). Los 4 de compu pasan.

- [ ] **Step 3: Implement**

`client/src/components/MortgageCouponCards.tsx`:

```tsx
import { useCallback } from "react";
import { Box } from "@mui/material";
import type { MortgageCouponDTO } from "@ledgerly/shared";
import { usePatchCouponRate } from "../api/hooks.js";
import { useCreditCouponsInYears } from "../filters/useInYears.js";
import { formatMoney, formatMoneyOrDash, formatUva } from "../format.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

const byCuotaNro = (a: MortgageCouponDTO, b: MortgageCouponDTO): number => a.cuotaNro - b.cuotaNro;

const highlightsOf = (coupon: MortgageCouponDTO): RecordField[] => [
  { label: "Total", value: formatMoney(coupon.totalDebitado, "ARS") },
  { label: "Pagado USD", value: formatMoneyOrDash(coupon.totalUsd, "USD") },
];

const detailsOf = (coupon: MortgageCouponDTO, onEditRate: () => void): RecordField[] => [
  { label: "Capital", value: formatMoney(coupon.capital, "ARS") },
  { label: "Interés", value: formatMoney(coupon.intereses, "ARS") },
  { label: "Seguro", value: formatMoney(coupon.seguroIncendio, "ARS") },
  { label: "Cuota UVA", value: formatUva(coupon.cuotaPuraUva) },
  { label: "Cotización UVA", value: formatMoney(coupon.cotizacionUva, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={coupon.tipoCambioUsd} editLabel={`editar TC cuota ${coupon.cuotaNro}`} onEdit={onEditRate} />,
  },
];

export const MortgageCouponCards = () => {
  const { data } = useCreditCouponsInYears();
  const { mutate: patchRate } = usePatchCouponRate();
  const { target, open, show, close } = useSheetTarget<MortgageCouponDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (!data || data.length === 0) return null;

  const cards = [...data].sort(byCuotaNro).map((coupon) => (
    <RecordCard
      key={coupon.id}
      title={`Cuota ${coupon.cuotaNro}`}
      meta={coupon.fechaDebito}
      highlights={highlightsOf(coupon)}
      details={detailsOf(coupon, () => show(coupon))}
    />
  ));
  const sheetTitle = target ? `TC cuota ${target.cuotaNro}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet open={open} title={sheetTitle} current={target?.tipoCambioUsd ?? null} onSave={saveRate} onClose={close} />
    </>
  );
};
```

En `client/src/pages/CreditsPage.tsx`:
- Imports: agregar `import { MortgageCouponCards } from "../components/MortgageCouponCards.js";` (arriba del de `MortgageCouponsTable`) y `import { useIsMobile } from "../useIsMobile.js";` (al final de los imports).
- Después de `const yearOptions = useMemo(...)`:

```tsx
  const isMobile = useIsMobile();
  const couponDetail = isMobile ? <MortgageCouponCards /> : <MortgageCouponsTable />;
```

- Reemplazar `<MortgageCouponsTable />` (debajo de "Detalle mes a mes") por `{couponDetail}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/CreditsPage.test.tsx client/src/components/MortgageCouponsTable.test.tsx`
Expected: PASS (7 en `CreditsPage`, 2 en `MortgageCouponsTable` sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MortgageCouponCards.tsx client/src/pages/CreditsPage.tsx client/src/pages/CreditsPage.test.tsx
git commit -m "feat(client): cupones del crédito como tarjetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Auto — `AutoCouponCards`

**Files:**
- Create: `client/src/components/AutoCouponCards.tsx`
- Modify: `client/src/pages/AutoPage.tsx`
- Test: `client/src/pages/AutoPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3; `useAutoCouponsInYears()`; `usePatchAutoRate()` (→ `PATCH /api/auto/coupons/:id`); `byCuotaNro`, `uniqueConceptLabels` de `client/src/autoConcepts.ts`.
- Produces: `AutoCouponCards` (sin props) — "Cuota N" / "vence `fechaVencimiento`"; destacados Total (`totalAPagar`) y Pagado USD; detalle un campo por concepto (los mismos que las columnas de la tabla, "—" si el cupón no lo tiene), Valor auto y TC oficial ✎.

- [ ] **Step 1: Write the failing tests**

En `client/src/pages/AutoPage.test.tsx`:

1. Imports (Testing Library, `userEvent` y viewport):

```tsx
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

```tsx
import { emulateMobile } from "../testing/viewport.js";
```

2. El `afterEach` queda:

```tsx
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

3. Agregar al final:

```tsx
const patches = () => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PATCH")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

const openRateSheet = async (cuota: number) => {
  const card = await screen.findByRole("article", { name: `Cuota ${cuota}` });
  await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
  await userEvent.click(within(card).getByRole("button", { name: `editar TC cuota ${cuota}` }));
  return screen.getByRole("dialog", { name: `TC cuota ${cuota}` });
};

describe("AutoPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, con los conceptos en el detalle y sin tabla", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const card = await screen.findByRole("article", { name: "Cuota 17" });
    expect(within(card).getByText("vence 2026-02-10")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("ANTICIPO ALICUOTA (AL)")).toBeInTheDocument();
    expect(within(card).getByText("Valor auto")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cuota 2" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del cupón del auto", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const sheet = await openRateSheet(17);
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1000");
    await userEvent.clear(input);
    await userEvent.type(input, "1100");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/auto/coupons/2", body: { tipoCambioUsd: 1100 } }]));
  });

  it("un TC igual al actual o negativo no manda nada", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const sheet = await openRateSheet(17);
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    await userEvent.clear(input);
    await userEvent.type(input, "-5");
    fireEvent.click(save);
    expect(patches()).toEqual([]);
  });
});
```

(En el fixture, el cupón `id: "2"` es la cuota 17, con `tipoCambioUsd: 1000`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/AutoPage.test.tsx`
Expected: FAIL en los 3 tests de "AutoPage en mobile" (no hay tarjetas). Los 3 de compu pasan.

- [ ] **Step 3: Implement**

`client/src/components/AutoCouponCards.tsx`:

```tsx
import { useCallback } from "react";
import { Box } from "@mui/material";
import type { AutoCouponDTO } from "@ledgerly/shared";
import { usePatchAutoRate } from "../api/hooks.js";
import { byCuotaNro, uniqueConceptLabels } from "../autoConcepts.js";
import { useAutoCouponsInYears } from "../filters/useInYears.js";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

const amountOf = (coupon: AutoCouponDTO, label: string): number | null =>
  coupon.conceptos.find((concept) => concept.label === label)?.amount ?? null;

const highlightsOf = (coupon: AutoCouponDTO): RecordField[] => [
  { label: "Total", value: formatMoney(coupon.totalAPagar, "ARS") },
  { label: "Pagado USD", value: formatMoneyOrDash(coupon.totalUsd, "USD") },
];

const detailsOf = (coupon: AutoCouponDTO, conceptLabels: string[], onEditRate: () => void): RecordField[] => [
  ...conceptLabels.map((label) => ({ label, value: formatMoneyOrDash(amountOf(coupon, label), "ARS") })),
  { label: "Valor auto", value: formatMoney(coupon.valorMovil, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={coupon.tipoCambioUsd} editLabel={`editar TC cuota ${coupon.cuotaNro}`} onEdit={onEditRate} />,
  },
];

export const AutoCouponCards = () => {
  const { data } = useAutoCouponsInYears();
  const { mutate: patchRate } = usePatchAutoRate();
  const { target, open, show, close } = useSheetTarget<AutoCouponDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (!data || data.length === 0) return null;

  const coupons = [...data].sort(byCuotaNro);
  const conceptLabels = uniqueConceptLabels(coupons);
  const cards = coupons.map((coupon) => (
    <RecordCard
      key={coupon.id}
      title={`Cuota ${coupon.cuotaNro}`}
      meta={`vence ${coupon.fechaVencimiento}`}
      highlights={highlightsOf(coupon)}
      details={detailsOf(coupon, conceptLabels, () => show(coupon))}
    />
  ));
  const sheetTitle = target ? `TC cuota ${target.cuotaNro}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet open={open} title={sheetTitle} current={target?.tipoCambioUsd ?? null} onSave={saveRate} onClose={close} />
    </>
  );
};
```

En `client/src/pages/AutoPage.tsx`:
- Imports: `import { AutoCouponCards } from "../components/AutoCouponCards.js";` (arriba del de `AutoCouponsTable`) y `import { useIsMobile } from "../useIsMobile.js";` (al final).
- Después de `const yearOptions = useMemo(...)`:

```tsx
  const isMobile = useIsMobile();
  const couponDetail = isMobile ? <AutoCouponCards /> : <AutoCouponsTable />;
```

- Reemplazar `<AutoCouponsTable />` por `{couponDetail}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/AutoPage.test.tsx client/src/components/AutoCouponsTable.test.tsx`
Expected: PASS (6 en `AutoPage`, 2 en `AutoCouponsTable` sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AutoCouponCards.tsx client/src/pages/AutoPage.tsx client/src/pages/AutoPage.test.tsx
git commit -m "feat(client): cupones del auto como tarjetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sueldo — `PayslipCards`

**Files:**
- Create: `client/src/components/PayslipCards.tsx`
- Modify: `client/src/pages/PayslipsPage.tsx`
- Test: `client/src/pages/PayslipsPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3; `usePatchPayslipRate()` (→ `PATCH /api/payslips/:id`); `byPeriodo`, `uniqueConceptLabels` de `client/src/payslipConcepts.ts`.
- Produces: `PayslipCards` con props `{ payslips: PayslipDTO[] }` (las mismas que `PayslipsTable`) — título `periodo` + chip "SAC" si `tipo === "sac"`; destacados Neto y Neto USD; detalle Bruto, un campo por concepto, Descuentos y TC oficial ✎ (`editar TC recibo AAAA-MM`).

- [ ] **Step 1: Write the failing tests**

En `client/src/pages/PayslipsPage.test.tsx`:

1. Imports (Testing Library, `userEvent` y viewport):

```tsx
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

```tsx
import { emulateMobile } from "../testing/viewport.js";
```

2. El `afterEach` queda:

```tsx
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

3. Agregar al final:

```tsx
const patches = () => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PATCH")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

const openRateSheet = async (periodo: string) => {
  const card = await screen.findByRole("article", { name: periodo });
  await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
  await userEvent.click(within(card).getByRole("button", { name: `editar TC recibo ${periodo}` }));
  return screen.getByRole("dialog", { name: `TC recibo ${periodo}` });
};

describe("PayslipsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, sin tabla", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const card = await screen.findByRole("article", { name: "2026-03" });
    expect(within(card).getByText("Neto USD")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("Bruto")).toBeInTheDocument();
    expect(within(card).getByText("Descuentos")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "2025-11" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("marca el aguinaldo con el chip SAC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/payslips/summary") ? summary
        : url.includes("/payslips") ? [{ ...payslip("p3", "2026-06"), tipo: "sac" }]
        : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const card = await screen.findByRole("article", { name: "2026-06" });
    expect(within(card).getByText("SAC")).toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del recibo", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const sheet = await openRateSheet("2026-03");
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1000");
    await userEvent.clear(input);
    await userEvent.type(input, "1205,75");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/payslips/p2", body: { tipoCambioUsd: 1205.75 } }]));
  });

  it("un TC igual al actual o vacío no manda nada", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const sheet = await openRateSheet("2026-03");
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.clear(within(sheet).getByRole("textbox", { name: "TC oficial" }));
    fireEvent.click(save);
    expect(patches()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/PayslipsPage.test.tsx`
Expected: FAIL en los 4 tests de "PayslipsPage en mobile". Los 3 de compu pasan.

- [ ] **Step 3: Implement**

`client/src/components/PayslipCards.tsx`:

```tsx
import { useCallback } from "react";
import { Box, Chip } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { usePatchPayslipRate } from "../api/hooks.js";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import { byPeriodo, uniqueConceptLabels } from "../payslipConcepts.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface PayslipCardsProps {
  payslips: PayslipDTO[];
}

const sacBadge = <Chip label="SAC" size="small" color="secondary" variant="outlined" />;

const montoOf = (payslip: PayslipDTO, label: string): number | null =>
  payslip.conceptos.find((concepto) => concepto.label === label)?.monto ?? null;

const highlightsOf = (payslip: PayslipDTO): RecordField[] => [
  { label: "Neto", value: formatMoney(payslip.neto, "ARS") },
  { label: "Neto USD", value: formatMoneyOrDash(payslip.netoUsd, "USD") },
];

const detailsOf = (payslip: PayslipDTO, conceptLabels: string[], onEditRate: () => void): RecordField[] => [
  { label: "Bruto", value: formatMoney(payslip.brutoTotal, "ARS") },
  ...conceptLabels.map((label) => ({ label, value: formatMoneyOrDash(montoOf(payslip, label), "ARS") })),
  { label: "Descuentos", value: formatMoney(payslip.descuentos, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={payslip.tipoCambioUsd} editLabel={`editar TC recibo ${payslip.periodo}`} onEdit={onEditRate} />,
  },
];

export const PayslipCards = ({ payslips }: PayslipCardsProps) => {
  const { mutate: patchRate } = usePatchPayslipRate();
  const { target, open, show, close } = useSheetTarget<PayslipDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (payslips.length === 0) return null;

  const sorted = [...payslips].sort(byPeriodo);
  const conceptLabels = uniqueConceptLabels(sorted);
  const cards = sorted.map((payslip) => (
    <RecordCard
      key={payslip.id}
      title={payslip.periodo}
      badge={payslip.tipo === "sac" ? sacBadge : undefined}
      highlights={highlightsOf(payslip)}
      details={detailsOf(payslip, conceptLabels, () => show(payslip))}
    />
  ));
  const sheetTitle = target ? `TC recibo ${target.periodo}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet open={open} title={sheetTitle} current={target?.tipoCambioUsd ?? null} onSave={saveRate} onClose={close} />
    </>
  );
};
```

En `client/src/pages/PayslipsPage.tsx`:
- Imports: `import { PayslipCards } from "../components/PayslipCards.js";` (arriba del de `PayslipsTable`) y `import { useIsMobile } from "../useIsMobile.js";` (al final).
- Justo después de `const { yearSelection } = useGlobalFilters();` (antes de los `return` tempranos): `const isMobile = useIsMobile();`
- Después del `if (payslips.length === 0) {...}` y antes del `return` final:

```tsx
  const payslipDetail = isMobile ? <PayslipCards payslips={inYears} /> : <PayslipsTable payslips={inYears} />;
```

- Reemplazar `<PayslipsTable payslips={inYears} />` por `{payslipDetail}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/PayslipsPage.test.tsx`
Expected: PASS (7 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PayslipCards.tsx client/src/pages/PayslipsPage.tsx client/src/pages/PayslipsPage.test.tsx
git commit -m "feat(client): recibos de sueldo como tarjetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `installmentLabel` y `TransactionSheet`

**Files:**
- Create: `client/src/transactionInstallment.ts`
- Test: `client/src/transactionInstallment.test.ts`
- Create: `client/src/components/TransactionSheet.tsx`
- Test: `client/src/components/TransactionSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Fase 1); `RecordFields`, `RecordField` (Task 1); `useCategories()` (`GET /api/transactions/categories` → `string[]`).
- Produces:
  - `installmentLabel(transaction: Pick<TransactionDTO, "isInstallment" | "installmentCurrent" | "installmentTotal">): string | null` — `"3/12"`, `"cuota"` o `null`.
  - `TransactionSheet` con props `{ transaction: TransactionDTO | null; open: boolean; onClose: () => void; onSave: (id: string, category: string) => void; onDelete: (transaction: TransactionDTO) => void }` — `dialog` titulado con el comercio: Fecha, Tipo, Monto y Cuota; combobox "Categoría" (`Autocomplete` `freeSolo`); «Borrar» llama `onDelete(transaction)`; «Guardar» (solo si la categoría cambió y no está vacía) llama `onSave(id, categoría)` y `onClose()`.

- [ ] **Step 1: Write the failing tests**

`client/src/transactionInstallment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { installmentLabel } from "./transactionInstallment.js";

describe("installmentLabel", () => {
  it("un movimiento que no es cuota no lleva etiqueta", () => {
    expect(installmentLabel({ isInstallment: false, installmentCurrent: null, installmentTotal: null })).toBeNull();
  });

  it("una cuota con número y total se muestra como N/M", () => {
    expect(installmentLabel({ isInstallment: true, installmentCurrent: 3, installmentTotal: 12 })).toBe("3/12");
  });

  it("una cuota sin número se muestra como «cuota»", () => {
    expect(installmentLabel({ isInstallment: true, installmentCurrent: null, installmentTotal: null })).toBe("cuota");
  });
});
```

`client/src/components/TransactionSheet.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionSheet } from "./TransactionSheet.js";

const notebook: TransactionDTO = {
  id: "3", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-06-10",
  descriptionRaw: "NOTEBOOK", merchant: "NOTEBOOK", category: "Tecnología", categorySource: "rule",
  amount: 45000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
  installmentCurrent: 3, installmentTotal: 12, comprobante: "3",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(["Compras", "Salud", "Tecnología"]), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = () => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(<TransactionSheet transaction={notebook} open onClose={onClose} onSave={onSave} onDelete={onDelete} />);
  const sheet = screen.getByRole("dialog", { name: "NOTEBOOK" });
  return { onSave, onDelete, onClose, sheet, category: within(sheet).getByRole("combobox", { name: "Categoría" }) };
};

describe("TransactionSheet", () => {
  it("muestra fecha, tipo, monto, cuota y la categoría actual", () => {
    const { sheet, category } = setup();
    expect(within(sheet).getByText("2026-06-10")).toBeInTheDocument();
    expect(within(sheet).getByText("purchase")).toBeInTheDocument();
    expect(within(sheet).getByText("3/12")).toBeInTheDocument();
    expect(category).toHaveValue("Tecnología");
  });

  it("sin cambiar la categoría no deja guardar", () => {
    const { sheet } = setup();
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("guarda una categoría nueva escrita a mano", async () => {
    const { sheet, category, onSave, onClose } = setup();
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith("3", "Viajes");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deja elegir una categoría existente de la lista", async () => {
    const { sheet, category, onSave } = setup();
    await userEvent.clear(category);
    await userEvent.type(category, "Sal");
    await userEvent.click(await screen.findByRole("option", { name: "Salud" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith("3", "Salud");
  });

  it("Borrar pide borrar el movimiento y no guarda nada", async () => {
    const { sheet, onSave, onDelete } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(notebook);
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/transactionInstallment.test.ts client/src/components/TransactionSheet.test.tsx`
Expected: FAIL — no se resuelven `./transactionInstallment.js` ni `./TransactionSheet.js`.

- [ ] **Step 3: Implement**

`client/src/transactionInstallment.ts`:

```ts
import type { TransactionDTO } from "@ledgerly/shared";

type InstallmentFields = Pick<TransactionDTO, "isInstallment" | "installmentCurrent" | "installmentTotal">;

export const installmentLabel = ({ isInstallment, installmentCurrent, installmentTotal }: InstallmentFields): string | null => {
  if (!isInstallment) return null;
  return installmentCurrent && installmentTotal ? `${installmentCurrent}/${installmentTotal}` : "cuota";
};
```

`client/src/components/TransactionSheet.tsx`:

```tsx
import { useState, type SyntheticEvent } from "react";
import { Autocomplete, Box, Button, TextField, type AutocompleteRenderInputParams } from "@mui/material";
import type { TransactionDTO } from "@ledgerly/shared";
import { useCategories } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { installmentLabel } from "../transactionInstallment.js";
import { BottomSheet } from "./BottomSheet.js";
import { RecordFields, type RecordField } from "./RecordCard.js";

interface TransactionSheetProps {
  transaction: TransactionDTO | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
}

interface TransactionFormProps {
  transaction: TransactionDTO;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
}

const NO_CATEGORIES: string[] = [];

const renderCategoryInput = (params: AutocompleteRenderInputParams) => <TextField {...params} label="Categoría" />;

const TransactionForm = ({ transaction, onClose, onSave, onDelete }: TransactionFormProps) => {
  const { data: categories = NO_CATEGORIES } = useCategories();
  const [category, setCategory] = useState(transaction.category);
  const nextCategory = category.trim();
  const changed = nextCategory !== "" && nextCategory !== transaction.category;

  const fields: RecordField[] = [
    { label: "Fecha", value: transaction.date },
    { label: "Tipo", value: transaction.type },
    { label: "Monto", value: formatMoney(transaction.amount, transaction.currency) },
    { label: "Cuota", value: installmentLabel(transaction) ?? "—" },
  ];

  const changeCategory = (_event: SyntheticEvent, value: string) => setCategory(value);

  const save = () => {
    if (!changed) return;
    onSave(transaction.id, nextCategory);
    onClose();
  };

  const remove = () => onDelete(transaction);

  return (
    <>
      <RecordFields fields={fields} />
      <Autocomplete
        freeSolo
        options={categories}
        inputValue={category}
        onInputChange={changeCategory}
        renderInput={renderCategoryInput}
        sx={{ mt: 2.5 }}
      />
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button fullWidth color="error" onClick={remove}>Borrar</Button>
        <Button fullWidth variant="contained" disabled={!changed} onClick={save}>Guardar</Button>
      </Box>
    </>
  );
};

export const TransactionSheet = ({ transaction, open, onClose, onSave, onDelete }: TransactionSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={transaction?.merchant ?? "Movimiento"}>
    {transaction && (
      <TransactionForm key={transaction.id} transaction={transaction} onClose={onClose} onSave={onSave} onDelete={onDelete} />
    )}
  </BottomSheet>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/transactionInstallment.test.ts client/src/components/TransactionSheet.test.tsx`
Expected: PASS (3 + 5 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/transactionInstallment.ts client/src/transactionInstallment.test.ts client/src/components/TransactionSheet.tsx client/src/components/TransactionSheet.test.tsx
git commit -m "feat(client): hoja para editar o borrar un movimiento desde el celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `TransactionsList`

**Files:**
- Create: `client/src/testing/cssFor.ts`
- Create: `client/src/components/TransactionsList.tsx`
- Test: `client/src/components/TransactionsList.test.tsx`

**Interfaces:**
- Consumes: `TransactionSheet` e `installmentLabel` (Task 7); `useSheetTarget` (Task 2); `ConfirmDialog` (`{ open, title, message, confirmLabel, onConfirm, onClose }`); `MOBILE_NAV_HEIGHT` (64) de `client/src/components/layout/MobileBottomNav.tsx`.
- Produces:
  - `cssFor(element: Element): string` — reglas CSS de emotion que aplican a las clases `css-*` del elemento.
  - `TRANSACTIONS_PAGE_SIZE = 50`
  - `TransactionsList` con props `{ rows: TransactionDTO[]; onCategoryChange: (id: string, category: string) => void; onDelete: (ids: string[]) => void }` (las mismas que `TransactionsTable`) — `section` "movimientos" con un `listitem` por fila visible.

- [ ] **Step 1: Write the failing test**

`client/src/components/TransactionsList.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { cssFor } from "../testing/cssFor.js";
import { TransactionsList } from "./TransactionsList.js";

const tx = (id: string, merchant: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: merchant, merchant, category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: null, ...overrides,
});

const rows: TransactionDTO[] = [
  tx("1", "MERCADOLIBRE"),
  tx("2", "SU PAGO", { category: "Sin categoría", amount: 5000, direction: "credit", type: "payment", date: "2026-06-08" }),
  tx("3", "NOTEBOOK", {
    category: "Tecnología", amount: 45000, date: "2026-06-10", isInstallment: true, installmentCurrent: 3, installmentTotal: 12,
  }),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(["Compras", "Tecnología"]), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = (items: TransactionDTO[] = rows) => {
  const onCategoryChange = vi.fn();
  const onDelete = vi.fn();
  renderWithProviders(<TransactionsList rows={items} onCategoryChange={onCategoryChange} onDelete={onDelete} />);
  return { onCategoryChange, onDelete };
};

const row = (merchant: string) => screen.getByRole("button", { name: new RegExp(merchant) });

const confirmDialog = () => screen.getByRole("dialog", { name: "Borrar movimientos" });

describe("TransactionsList", () => {
  it("muestra cada movimiento como fila, con su cuota, y no una grilla", () => {
    setup();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(within(row("NOTEBOOK")).getByText("3/12")).toBeInTheDocument();
    expect(within(row("NOTEBOOK")).getByText("Tecnología")).toBeInTheDocument();
    expect(within(row("NOTEBOOK")).getByText("2026-06-10")).toBeInTheDocument();
    expect(screen.getByText("3 movimientos")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("muestra 50 filas y «Ver más» suma de a 50", async () => {
    const many = Array.from({ length: 120 }, (_unused, index) => tx(`t${index}`, `COMERCIO ${index}`));
    setup(many);
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(120);
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
  });

  it("tocar una fila abre su hoja y cambiar la categoría llama onCategoryChange", async () => {
    const { onCategoryChange } = setup();
    await userEvent.click(row("NOTEBOOK"));
    const sheet = screen.getByRole("dialog", { name: "NOTEBOOK" });
    const category = within(sheet).getByRole("combobox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onCategoryChange).toHaveBeenCalledWith("3", "Viajes");
  });

  it("Borrar desde la hoja pasa por la confirmación", async () => {
    const { onDelete } = setup();
    await userEvent.click(row("NOTEBOOK"));
    await userEvent.click(within(screen.getByRole("dialog", { name: "NOTEBOOK" })).getByRole("button", { name: "Borrar" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(within(confirmDialog()).getByText(/¿borrar este movimiento\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["3"]);
  });

  it("Borrar desde la hoja y después Cancelar no borra nada", async () => {
    const { onDelete } = setup();
    await userEvent.click(row("NOTEBOOK"));
    await userEvent.click(within(screen.getByRole("dialog", { name: "NOTEBOOK" })).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("«Seleccionar» + «Borrar (2)» + confirmar llama onDelete con los dos ids y sale del modo selección", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar NOTEBOOK" }));
    const bar = screen.getByRole("toolbar", { name: "selección" });
    await userEvent.click(within(bar).getByRole("button", { name: "Borrar (2)" }));
    expect(within(confirmDialog()).getByText(/¿borrar 2 movimientos\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1", "3"]);
    expect(screen.queryByRole("toolbar", { name: "selección" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("en modo selección, tocar la fila la marca y no abre la hoja", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(row("SU PAGO"));
    expect(screen.getByRole("checkbox", { name: "seleccionar SU PAGO" })).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar (1)" })).toBeEnabled();
  });

  it("«Cancelar» sale del modo selección sin borrar", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(within(screen.getByRole("toolbar", { name: "selección" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("toolbar", { name: "selección" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("la barra de selección queda arriba de la navegación y la lista le deja lugar", async () => {
    setup();
    expect(cssFor(screen.getByRole("region", { name: "movimientos" }))).not.toContain("padding-bottom:64px");
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    expect(cssFor(screen.getByRole("toolbar", { name: "selección" }))).toContain("bottom:calc(64px + env(safe-area-inset-bottom))");
    expect(cssFor(screen.getByRole("region", { name: "movimientos" }))).toContain("padding-bottom:64px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/TransactionsList.test.tsx`
Expected: FAIL — no se resuelven `../testing/cssFor.js` ni `./TransactionsList.js`.

- [ ] **Step 3: Implement**

`client/src/testing/cssFor.ts`:

```ts
export const cssFor = (element: Element): string => {
  const classes = Array.from(element.classList).filter((name) => name.startsWith("css-"));
  const rules = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n")
    .split("}");
  return rules.filter((rule) => classes.some((name) => rule.includes(`.${name}`))).join("}");
};
```

`client/src/components/TransactionsList.tsx`:

```tsx
import { useCallback, useState } from "react";
import { Box, Button, Checkbox, Chip, List, ListItem, ListItemButton, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { installmentLabel } from "../transactionInstallment.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { MOBILE_NAV_HEIGHT } from "./layout/MobileBottomNav.js";
import { TransactionSheet } from "./TransactionSheet.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface TransactionsListProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
}

interface TransactionRowProps {
  row: TransactionDTO;
  selecting: boolean;
  selected: boolean;
  onOpen: (row: TransactionDTO) => void;
  onToggle: (id: string) => void;
}

export const TRANSACTIONS_PAGE_SIZE = 50;
const SELECTION_BAR_HEIGHT = 64;

const selectionBarSx: SxProps<Theme> = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
  height: SELECTION_BAR_HEIGHT,
  zIndex: (theme) => theme.zIndex.appBar,
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 2,
  bgcolor: "background.paper",
  borderTop: 1,
  borderColor: "divider",
};

const deleteMessage = (count: number): string =>
  count === 1
    ? "¿Borrar este movimiento? Esta acción no se puede deshacer."
    : `¿Borrar ${count} movimientos? Esta acción no se puede deshacer.`;

const TransactionRow = ({ row, selecting, selected, onOpen, onToggle }: TransactionRowProps) => {
  const installment = installmentLabel(row);
  const handleClick = () => (selecting ? onToggle(row.id) : onOpen(row));

  return (
    <ListItem disablePadding divider>
      <ListItemButton onClick={handleClick} sx={{ gap: 1.5, px: 1, py: 1.25 }}>
        {selecting && (
          <Checkbox
            edge="start"
            checked={selected}
            tabIndex={-1}
            disableRipple
            inputProps={{ "aria-label": `seleccionar ${row.merchant}` }}
            sx={{ p: 0.5 }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{row.merchant}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatMoney(row.amount, row.currency)}</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{row.date}</Typography>
            <Chip size="small" label={row.category} />
            {installment && <Chip size="small" variant="outlined" label={installment} />}
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  );
};

export const TransactionsList = ({ rows, onCategoryChange, onDelete }: TransactionsListProps) => {
  const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const { target, open, show, close } = useSheetTarget<TransactionDTO>();

  const showMore = useCallback(() => setVisibleCount((count) => count + TRANSACTIONS_PAGE_SIZE), []);
  const startSelecting = useCallback(() => setSelecting(true), []);
  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected([]);
  }, []);
  const toggle = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const askDeleteOne = useCallback((transaction: TransactionDTO) => {
    close();
    setPendingIds([transaction.id]);
  }, [close]);
  const cancelDelete = useCallback(() => setPendingIds(null), []);

  const askDeleteSelected = () => setPendingIds(selected);
  const confirmDelete = () => {
    if (pendingIds) onDelete(pendingIds);
    setPendingIds(null);
    stopSelecting();
  };

  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = rows.length > visibleRows.length;
  const isEmpty = rows.length === 0;
  const canStartSelecting = !selecting && !isEmpty;
  const countLabel = rows.length === 1 ? "1 movimiento" : `${rows.length} movimientos`;
  const deleteLabel = `Borrar (${selected.length})`;
  const sectionSx: SxProps<Theme> = { pb: selecting ? `${SELECTION_BAR_HEIGHT}px` : 0 };
  const items = visibleRows.map((row) => (
    <TransactionRow
      key={row.id}
      row={row}
      selecting={selecting}
      selected={selected.includes(row.id)}
      onOpen={show}
      onToggle={toggle}
    />
  ));

  return (
    <Box component="section" aria-label="movimientos" sx={sectionSx}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 40, mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{countLabel}</Typography>
        {canStartSelecting && <Button size="small" onClick={startSelecting}>Seleccionar</Button>}
      </Box>
      {isEmpty && <Typography color="text.secondary">No hay movimientos con estos filtros.</Typography>}
      <List disablePadding>{items}</List>
      {hasMore && <Button fullWidth onClick={showMore} sx={{ mt: 1 }}>Ver más</Button>}
      {selecting && (
        <Box role="toolbar" aria-label="selección" sx={selectionBarSx}>
          <Button fullWidth onClick={stopSelecting}>Cancelar</Button>
          <Button fullWidth variant="contained" color="error" disabled={selected.length === 0} onClick={askDeleteSelected}>
            {deleteLabel}
          </Button>
        </Box>
      )}
      <TransactionSheet transaction={target} open={open} onClose={close} onSave={onCategoryChange} onDelete={askDeleteOne} />
      <ConfirmDialog
        open={pendingIds !== null}
        title="Borrar movimientos"
        message={deleteMessage(pendingIds?.length ?? 0)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </Box>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/TransactionsList.test.tsx`
Expected: PASS (9 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/testing/cssFor.ts client/src/components/TransactionsList.tsx client/src/components/TransactionsList.test.tsx
git commit -m "feat(client): lista de movimientos para mobile con selección y Ver más" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Movimientos elige lista o tabla

**Files:**
- Modify: `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `TransactionsList` (Task 8); `TransactionsTable` (sin cambios); `useIsMobile()`; `emulateMobile()`/`emulateDesktop()`; `usePatchTransaction()` (`PATCH /api/transactions/:id`) y `useDeleteTransactions()` (`POST /api/transactions/delete`).

- [ ] **Step 1: Write the failing tests**

En `client/src/pages/TransactionsPage.test.tsx` (el archivo usa `userEvent` con `await import(...)` dentro de cada test; se sigue igual):

1. Agregar `import { emulateDesktop, emulateMobile } from "../testing/viewport.js";` debajo del de `renderWithProviders`.
2. Reemplazar `afterEach(() => { cleanup(); vi.restoreAllMocks(); });` por:

```tsx
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

3. Agregar al final:

```tsx
describe("TransactionsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  const openSheet = async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(await screen.findByRole("button", { name: /MERCADOLIBRE/ }));
    return screen.getByRole("dialog", { name: "MERCADOLIBRE" });
  };

  it("muestra los movimientos como lista y no como grilla", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    expect(await screen.findByRole("region", { name: "movimientos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MERCADOLIBRE/ })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("cambiar la categoría desde la hoja manda el PATCH del movimiento", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    const sheet = await openSheet();
    const category = within(sheet).getByRole("combobox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
      expect(String(call?.[0])).toContain("/transactions/1");
      expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ category: "Viajes" });
    });
  });

  it("si la pantalla pasa a tamaño compu con la hoja abierta, no queda nada tapando la tabla", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await openSheet();
    emulateDesktop();
    await waitFor(() => expect(screen.getByRole("grid")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/TransactionsPage.test.tsx`
Expected: FAIL en los 3 tests de "TransactionsPage en mobile" (se ve la grilla: no hay `region` "movimientos" ni fila-botón que abra la hoja). Los 5 de compu pasan.

- [ ] **Step 3: Implement**

`client/src/pages/TransactionsPage.tsx` (reemplazar el archivo entero):

```tsx
import { useCallback } from "react";
import { Alert, CircularProgress, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useDeleteTransactions, usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { TransactionsList } from "../components/TransactionsList.js";
import { TransactionsTable } from "../components/TransactionsTable.js";
import { useIsMobile } from "../useIsMobile.js";

const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const isMobile = useIsMobile();
  const { mutate: patchTransaction } = usePatchTransaction();
  const { mutate: deleteTransactions } = useDeleteTransactions();
  const filters: TxFilters = {
    currency: params.get("currency") === null ? undefined : currency,
    from,
    to,
    year: years,
    category: params.getAll("category"),
    search: params.get("search") ?? undefined,
    cardLabel,
    installment: params.get("installment") ?? undefined,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);
  const yearOptions = useTransactionYearOptions(currency, cardLabel);

  const changeCategory = useCallback(
    (id: string, category: string) => patchTransaction({ id, body: { category } }),
    [patchTransaction],
  );
  const deleteRows = useCallback((ids: string[]) => deleteTransactions(ids), [deleteTransactions]);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const Rows = isMobile ? TransactionsList : TransactionsTable;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />
      <Rows rows={data?.items ?? []} onCategoryChange={changeCategory} onDelete={deleteRows} />
    </>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/TransactionsPage.test.tsx client/src/components/TransactionsTable.test.tsx`
Expected: PASS (8 en `TransactionsPage`, 5 en `TransactionsTable` sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TransactionsPage.tsx client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): Movimientos muestra la lista táctil en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `RuleSheet` y `RuleCards`

**Files:**
- Create: `client/src/components/RuleSheet.tsx`
- Test: `client/src/components/RuleSheet.test.tsx`
- Create: `client/src/components/RuleCards.tsx`
- Test: `client/src/components/RuleCards.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Fase 1); `recordListSx` (Task 1); `CategoryRuleDTO` (`id, priority, matchType: "contains" | "regex", pattern, category, source, enabled`).
- Produces:
  - `type MatchType = CategoryRuleDTO["matchType"]`
  - `interface RuleDraft { priority: number; matchType: MatchType; pattern: string; category: string }`
  - `NEW_RULE_PRIORITY = 100`; `MATCH_TYPE_LABELS: Record<MatchType, string>` (`contains` → "contiene", `regex` → "regex").
  - `RuleSheet` con props `{ open: boolean; rule: CategoryRuleDTO | null; onClose: () => void; onSave: (draft: RuleDraft) => void; onDelete: (rule: CategoryRuleDTO) => void }` — "Editar regla" (Prioridad, Tipo, Patrón, Categoría, Borrar, Guardar) o "Nueva regla" con `rule = null` (Tipo, Patrón, Categoría, Guardar; prioridad 100).
  - `RuleCards` con props `{ rules: CategoryRuleDTO[]; onEdit: (rule: CategoryRuleDTO) => void; onToggle: (id: string, enabled: boolean) => void }`.

- [ ] **Step 1: Write the failing tests**

`client/src/components/RuleSheet.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RuleSheet } from "./RuleSheet.js";

afterEach(cleanup);

const uber: CategoryRuleDTO = {
  id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true,
};

const setup = (rule: CategoryRuleDTO | null) => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(<RuleSheet open rule={rule} onClose={onClose} onSave={onSave} onDelete={onDelete} />);
  const sheet = screen.getByRole("dialog", { name: rule ? "Editar regla" : "Nueva regla" });
  return { onSave, onDelete, onClose, sheet };
};

describe("RuleSheet para editar", () => {
  it("muestra prioridad, tipo, patrón y categoría de la regla", () => {
    const { sheet } = setup(uber);
    expect(within(sheet).getByRole("textbox", { name: "Prioridad" })).toHaveValue("10");
    expect(within(sheet).getByRole("combobox", { name: "Tipo" })).toHaveTextContent("contiene");
    expect(within(sheet).getByRole("textbox", { name: "Patrón" })).toHaveValue("UBER");
    expect(within(sheet).getByRole("textbox", { name: "Categoría" })).toHaveValue("Transporte");
  });

  it("Guardar manda la regla con los cambios y cierra", async () => {
    const { sheet, onSave, onClose } = setup(uber);
    const category = within(sheet).getByRole("textbox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 10, matchType: "contains", pattern: "UBER", category: "Viajes" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deja cambiar el tipo a regex", async () => {
    const { sheet, onSave } = setup(uber);
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Tipo" }));
    await userEvent.click(await screen.findByRole("option", { name: "regex" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar regla" })).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 10, matchType: "regex", pattern: "UBER", category: "Transporte" });
  });

  it("sin prioridad no deja guardar", async () => {
    const { sheet } = setup(uber);
    await userEvent.clear(within(sheet).getByRole("textbox", { name: "Prioridad" }));
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("Borrar pide borrar la regla sin guardar", async () => {
    const { sheet, onSave, onDelete } = setup(uber);
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(uber);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("RuleSheet para una regla nueva", () => {
  it("arranca vacía, sin prioridad ni Borrar", () => {
    const { sheet } = setup(null);
    expect(within(sheet).queryByRole("textbox", { name: "Prioridad" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("textbox", { name: "Patrón" })).toHaveValue("");
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("el patrón no se corrige ni se capitaliza con el teclado del celular", () => {
    const { sheet } = setup(null);
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    expect(pattern).toHaveAttribute("autocapitalize", "none");
    expect(pattern).toHaveAttribute("autocorrect", "off");
    expect(pattern).toHaveAttribute("spellcheck", "false");
  });

  it("con patrón y categoría guarda con prioridad 100", async () => {
    const { sheet, onSave } = setup(null);
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Patrón" }), "RAPPI");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Categoría" }), "Delivery");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 100, matchType: "contains", pattern: "RAPPI", category: "Delivery" });
  });
});
```

`client/src/components/RuleCards.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RuleCards } from "./RuleCards.js";

afterEach(cleanup);

const rules: CategoryRuleDTO[] = [
  { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true },
  { id: "r2", priority: 50, matchType: "regex", pattern: "^NETFLIX", category: "Suscripciones", source: "system", enabled: false },
];

const setup = () => {
  const onEdit = vi.fn();
  const onToggle = vi.fn();
  renderWithProviders(<RuleCards rules={rules} onEdit={onEdit} onToggle={onToggle} />);
  return { onEdit, onToggle };
};

describe("RuleCards", () => {
  it("muestra patrón, categoría, tipo y prioridad de cada regla", () => {
    setup();
    const uber = screen.getByRole("article", { name: "UBER" });
    expect(within(uber).getByText("Transporte")).toBeInTheDocument();
    expect(within(uber).getByText("contiene · prioridad 10")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "^NETFLIX" })).getByText("regex · prioridad 50")).toBeInTheDocument();
  });

  it("el switch refleja si la regla está activa y avisa al cambiarlo", async () => {
    const { onToggle } = setup();
    expect(screen.getByRole("checkbox", { name: "activa UBER" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "activa ^NETFLIX" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "activa UBER" }));
    expect(onToggle).toHaveBeenCalledWith("r1", false);
  });

  it("tocar la tarjeta pide editar esa regla", async () => {
    const { onEdit, onToggle } = setup();
    await userEvent.click(screen.getByRole("button", { name: "editar UBER" }));
    expect(onEdit).toHaveBeenCalledWith(rules[0]);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/RuleSheet.test.tsx client/src/components/RuleCards.test.tsx`
Expected: FAIL — no se resuelven `./RuleSheet.js` ni `./RuleCards.js`.

- [ ] **Step 3: Implement**

`client/src/components/RuleSheet.tsx`:

```tsx
import { useState, type ChangeEvent } from "react";
import { Box, Button, MenuItem, TextField } from "@mui/material";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { BottomSheet } from "./BottomSheet.js";

export type MatchType = CategoryRuleDTO["matchType"];

export interface RuleDraft {
  priority: number;
  matchType: MatchType;
  pattern: string;
  category: string;
}

interface RuleSheetProps {
  open: boolean;
  rule: CategoryRuleDTO | null;
  onClose: () => void;
  onSave: (draft: RuleDraft) => void;
  onDelete: (rule: CategoryRuleDTO) => void;
}

interface RuleFormProps {
  rule: CategoryRuleDTO | null;
  onClose: () => void;
  onSave: (draft: RuleDraft) => void;
  onDelete: (rule: CategoryRuleDTO) => void;
}

export const NEW_RULE_PRIORITY = 100;

export const MATCH_TYPE_LABELS: Record<MatchType, string> = { contains: "contiene", regex: "regex" };

const MATCH_TYPES: MatchType[] = ["contains", "regex"];

const isMatchType = (value: string): value is MatchType => Object.hasOwn(MATCH_TYPE_LABELS, value);

const matchTypeOptions = MATCH_TYPES.map((type) => (
  <MenuItem key={type} value={type}>{MATCH_TYPE_LABELS[type]}</MenuItem>
));

const patternInputProps = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, style: { fontFamily: "monospace" } };

const RuleForm = ({ rule, onClose, onSave, onDelete }: RuleFormProps) => {
  const [priority, setPriority] = useState(String(rule?.priority ?? NEW_RULE_PRIORITY));
  const [matchType, setMatchType] = useState<MatchType>(rule?.matchType ?? "contains");
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [category, setCategory] = useState(rule?.category ?? "");
  const parsedPriority = Number(priority);
  const valid = pattern !== "" && category !== "" && priority.trim() !== "" && Number.isFinite(parsedPriority);

  const changePriority = (event: ChangeEvent<HTMLInputElement>) => setPriority(event.target.value);
  const changeMatchType = (event: ChangeEvent<HTMLInputElement>) => {
    if (isMatchType(event.target.value)) setMatchType(event.target.value);
  };
  const changePattern = (event: ChangeEvent<HTMLInputElement>) => setPattern(event.target.value);
  const changeCategory = (event: ChangeEvent<HTMLInputElement>) => setCategory(event.target.value);

  const save = () => {
    if (!valid) return;
    onSave({ priority: parsedPriority, matchType, pattern, category });
    onClose();
  };

  const priorityField = rule && (
    <TextField
      label="Prioridad"
      value={priority}
      onChange={changePriority}
      fullWidth
      slotProps={{ htmlInput: { inputMode: "numeric" } }}
    />
  );
  const deleteButton = rule && <Button fullWidth color="error" onClick={() => onDelete(rule)}>Borrar</Button>;

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      {priorityField}
      <TextField select label="Tipo" value={matchType} onChange={changeMatchType} fullWidth>
        {matchTypeOptions}
      </TextField>
      <TextField label="Patrón" value={pattern} onChange={changePattern} fullWidth slotProps={{ htmlInput: patternInputProps }} />
      <TextField label="Categoría" value={category} onChange={changeCategory} fullWidth />
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!valid} onClick={save}>Guardar</Button>
      </Box>
    </Box>
  );
};

export const RuleSheet = ({ open, rule, onClose, onSave, onDelete }: RuleSheetProps) => {
  const title = rule ? "Editar regla" : "Nueva regla";
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <RuleForm key={rule?.id ?? "nueva"} rule={rule} onClose={onClose} onSave={onSave} onDelete={onDelete} />
    </BottomSheet>
  );
};
```

`client/src/components/RuleCards.tsx`:

```tsx
import type { ChangeEvent } from "react";
import { Box, Card, CardActionArea, Chip, Switch, Typography } from "@mui/material";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { recordListSx } from "./RecordCard.js";
import { MATCH_TYPE_LABELS } from "./RuleSheet.js";

interface RuleCardsProps {
  rules: CategoryRuleDTO[];
  onEdit: (rule: CategoryRuleDTO) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

interface RuleCardProps {
  rule: CategoryRuleDTO;
  onEdit: (rule: CategoryRuleDTO) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const RuleCard = ({ rule, onEdit, onToggle }: RuleCardProps) => {
  const edit = () => onEdit(rule);
  const toggle = (event: ChangeEvent<HTMLInputElement>) => onToggle(rule.id, event.target.checked);
  const summary = `${MATCH_TYPE_LABELS[rule.matchType]} · prioridad ${rule.priority}`;

  return (
    <Card component="article" aria-label={rule.pattern}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <CardActionArea onClick={edit} aria-label={`editar ${rule.pattern}`} sx={{ flex: 1, minWidth: 0, p: 2 }}>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 600, overflowWrap: "anywhere" }}>{rule.pattern}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
            <Chip size="small" label={rule.category} />
            <Typography variant="caption" color="text.secondary">{summary}</Typography>
          </Box>
        </CardActionArea>
        <Switch
          checked={rule.enabled}
          onChange={toggle}
          inputProps={{ "aria-label": `activa ${rule.pattern}` }}
          sx={{ mr: 1 }}
        />
      </Box>
    </Card>
  );
};

export const RuleCards = ({ rules, onEdit, onToggle }: RuleCardsProps) => {
  const cards = rules.map((rule) => <RuleCard key={rule.id} rule={rule} onEdit={onEdit} onToggle={onToggle} />);
  return <Box sx={recordListSx}>{cards}</Box>;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/RuleSheet.test.tsx client/src/components/RuleCards.test.tsx`
Expected: PASS (8 + 3 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/RuleSheet.tsx client/src/components/RuleSheet.test.tsx client/src/components/RuleCards.tsx client/src/components/RuleCards.test.tsx
git commit -m "feat(client): tarjetas y hoja de edición de reglas para mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Reglas en mobile

**Files:**
- Create: `client/src/components/RulesMobile.tsx`
- Modify: `client/src/pages/RulesPage.tsx`
- Test: `client/src/pages/RulesPage.test.tsx`

**Interfaces:**
- Consumes: `RuleCards`, `RuleSheet`, `RuleDraft` (Task 10); `useSheetTarget` (Task 2); `ConfirmDialog`; `useCreateRule()` (`POST /api/category-rules`), `useUpdateRule()` (`PATCH /api/category-rules/:id`), `useDeleteRule()` (`DELETE /api/category-rules/:id`), `useApplyRules()`; `useIsMobile()`.
- Produces: `RulesMobile` con props `{ rules: CategoryRuleDTO[]; onCreate: (draft: RuleDraft) => void; onUpdate: (id: string, body: Partial<CategoryRuleDTO>) => void; onDelete: (id: string) => void }`.

- [ ] **Step 1: Write the failing tests**

`client/src/pages/RulesPage.test.tsx` (reemplazar el archivo entero; los dos tests de compu quedan iguales, el `afterEach` suma `cleanup()` y `vi.unstubAllGlobals()`):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true };
const calls: { url: string; method?: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body as string });
    const isRead = url.includes("/category-rules") && (!init || !init.method || init.method === "GET");
    return new Response(JSON.stringify(isRead ? [rule] : {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RulesPage", () => {
  it("lista las reglas existentes", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reaplicar/i })).toBeInTheDocument();
  });

  it("edita una regla y dispara PATCH con los valores nuevos", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("editar"));
    fireEvent.change(screen.getByDisplayValue("Transporte"), { target: { value: "Viajes" } });
    fireEvent.click(screen.getByLabelText("guardar"));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/category-rules/r1"));
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch!.body!)).toMatchObject({ category: "Viajes", pattern: "UBER", matchType: "contains", priority: 10 });
    });
  });
});

const sent = (method: string) => calls
  .filter((call) => call.method === method)
  .map((call) => ({ url: call.url, body: call.body ? (JSON.parse(call.body) as unknown) : undefined }));

describe("RulesPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra las reglas como tarjetas, sin tabla ni formulario en línea", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    const card = await screen.findByRole("article", { name: "UBER" });
    expect(within(card).getByText("contiene · prioridad 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reaplicar a todo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva regla" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar" })).not.toBeInTheDocument();
  });

  it("crea una regla desde «Nueva regla» con prioridad 100", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "Nueva regla" }));
    const sheet = screen.getByRole("dialog", { name: "Nueva regla" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Patrón" }), "RAPPI");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Categoría" }), "Delivery");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/category-rules", body: { priority: 100, matchType: "contains", pattern: "RAPPI", category: "Delivery" } },
    ]));
  });

  it("edita una regla desde su hoja", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "editar UBER" }));
    const sheet = screen.getByRole("dialog", { name: "Editar regla" });
    const category = within(sheet).getByRole("textbox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([
      { url: "/api/category-rules/r1", body: { priority: 10, matchType: "contains", pattern: "UBER", category: "Viajes" } },
    ]));
  });

  it("desactiva una regla con su switch", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("checkbox", { name: "activa UBER" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([{ url: "/api/category-rules/r1", body: { enabled: false } }]));
  });

  it("borrar desde la hoja pide confirmación y recién ahí manda el DELETE", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "editar UBER" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar regla" })).getByRole("button", { name: "Borrar" }));
    expect(sent("DELETE")).toEqual([]);
    const confirm = screen.getByRole("dialog", { name: "Borrar regla" });
    expect(within(confirm).getByText(/¿borrar la regla «UBER»\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(sent("DELETE")).toEqual([{ url: "/api/category-rules/r1", body: undefined }]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/RulesPage.test.tsx`
Expected: FAIL en los 5 tests de "RulesPage en mobile" (se ven la tabla y el formulario de compu). Los 2 de compu pasan.

- [ ] **Step 3: Implement**

`client/src/components/RulesMobile.tsx`:

```tsx
import { useCallback, useState } from "react";
import { Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { RuleCards } from "./RuleCards.js";
import { RuleSheet, type RuleDraft } from "./RuleSheet.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface RulesMobileProps {
  rules: CategoryRuleDTO[];
  onCreate: (draft: RuleDraft) => void;
  onUpdate: (id: string, body: Partial<CategoryRuleDTO>) => void;
  onDelete: (id: string) => void;
}

const deleteMessage = (rule: CategoryRuleDTO | null): string =>
  rule ? `¿Borrar la regla «${rule.pattern}»? Esta acción no se puede deshacer.` : "";

export const RulesMobile = ({ rules, onCreate, onUpdate, onDelete }: RulesMobileProps) => {
  const { target, open, show, close } = useSheetTarget<CategoryRuleDTO | null>();
  const [pendingDelete, setPendingDelete] = useState<CategoryRuleDTO | null>(null);

  const openNew = useCallback(() => show(null), [show]);
  const toggle = useCallback((id: string, enabled: boolean) => onUpdate(id, { enabled }), [onUpdate]);
  const save = useCallback((draft: RuleDraft) => {
    if (target) onUpdate(target.id, draft);
    else onCreate(draft);
  }, [target, onUpdate, onCreate]);
  const askDelete = useCallback((rule: CategoryRuleDTO) => {
    close();
    setPendingDelete(rule);
  }, [close]);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = () => {
    if (pendingDelete) onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <Button variant="contained" fullWidth startIcon={<AddIcon />} onClick={openNew} sx={{ mb: 2 }}>
        Nueva regla
      </Button>
      <RuleCards rules={rules} onEdit={show} onToggle={toggle} />
      <RuleSheet open={open} rule={target} onClose={close} onSave={save} onDelete={askDelete} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar regla"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
```

`client/src/pages/RulesPage.tsx` (reemplazar el archivo entero; la rama de compu es la misma tabla y formulario de hoy):

```tsx
import { Alert, Button, CircularProgress, Stack, Table, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useApplyRules, useCategoryRules, useCreateRule, useDeleteRule, useUpdateRule } from "../api/hooks.js";
import { CategoryRuleForm } from "../components/CategoryRuleForm.js";
import { CategoryRuleRow } from "../components/CategoryRuleRow.js";
import { RulesMobile } from "../components/RulesMobile.js";
import { MotionTableBody } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { useIsMobile } from "../useIsMobile.js";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: { xs: 2, md: 0 },
  mb: 3,
};

export const RulesPage = () => {
  const isMobile = useIsMobile();
  const { data, isLoading, isError, error } = useCategoryRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const apply = useApplyRules();

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const rules = data ?? [];
  const rulesView = isMobile ? (
    <RulesMobile
      rules={rules}
      onCreate={(values) => create.mutate(values)}
      onUpdate={(id, body) => update.mutate({ id, body })}
      onDelete={(id) => del.mutate(id)}
    />
  ) : (
    <>
      <CategoryRuleForm onCreate={(values) => create.mutate(values)} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Prioridad</TableCell><TableCell>Tipo</TableCell><TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell><TableCell>Activa</TableCell><TableCell />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rules.map((r) => (
            <CategoryRuleRow
              key={r.id}
              rule={r}
              onSave={(id, body) => update.mutate({ id, body })}
              onDelete={(id) => del.mutate(id)}
              onToggle={(id, enabled) => update.mutate({ id, body: { enabled } })}
            />
          ))}
        </MotionTableBody>
      </Table>
    </>
  );

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
        <Typography variant="h4">Reglas de categoría</Typography>
        <Button variant="outlined" onClick={() => apply.mutate()} disabled={apply.isPending}>
          Reaplicar a todo
        </Button>
      </Stack>

      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados (las reglas pisan también las categorías manuales cuando matchean)</Alert>}

      {rulesView}
    </>
  );
};
```

En ≥ 900px el encabezado queda en fila, centrado y con `space-between`, como hoy; por debajo se apila y el botón ocupa todo el ancho.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/RulesPage.test.tsx`
Expected: PASS (7 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/RulesMobile.tsx client/src/pages/RulesPage.tsx client/src/pages/RulesPage.test.tsx
git commit -m "feat(client): Reglas con tarjetas y hojas para crear y editar en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `FileDropzone` en mobile

**Files:**
- Modify: `client/src/components/FileDropzone.tsx`
- Test: `client/src/components/FileDropzone.test.tsx`

**Interfaces:**
- Consumes: `useIsMobile()`; `emulateMobile()`.
- Produces: misma API (`{ onFile: (file: File) => void; disabled?: boolean }`); en mobile, sin "Arrastrá el PDF del resumen o", botón «Elegir PDF» a ancho completo y menos padding.

- [ ] **Step 1: Write the failing tests**

En `client/src/components/FileDropzone.test.tsx`:

1. Imports y `afterEach` (reemplazan los de arriba del archivo):

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { FileDropzone } from "./FileDropzone.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
```

2. Agregar al final:

```tsx
describe("FileDropzone en mobile", () => {
  beforeEach(() => emulateMobile());

  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("no habla de arrastrar y ofrece «Elegir PDF»", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(screen.queryByText(/arrastrá el pdf/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elegir archivo" })).not.toBeInTheDocument();
  });

  it("«Elegir PDF» abre el selector de archivos", async () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    const opened = vi.fn();
    fileInput().addEventListener("click", opened);
    await userEvent.click(screen.getByRole("button", { name: "Elegir PDF" }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("acepta el PDF elegido y avisa si lo elegido no es PDF", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await user.upload(fileInput(), txt());
    expect(screen.getByText(/sólo se aceptan archivos pdf/i)).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await user.upload(fileInput(), pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sólo se aceptan archivos pdf/i)).not.toBeInTheDocument();
  });
});
```

(`applyAccept: false` simula que el selector del sistema deja pasar un archivo que no es PDF.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/FileDropzone.test.tsx`
Expected: FAIL en "no habla de arrastrar…" y "«Elegir PDF» abre…" (no hay botón «Elegir PDF»). El tercero de mobile y los 5 de compu pasan.

- [ ] **Step 3: Implement**

En `client/src/components/FileDropzone.tsx`:
- Import: `import { useIsMobile } from "../useIsMobile.js";`
- Primera línea del componente: `const isMobile = useIsMobile();`
- Antes del `return`: `const buttonLabel = isMobile ? "Elegir PDF" : "Elegir archivo";`
- En el `sx` del `Box`, `p: 5` pasa a `p: { xs: 3, md: 5 }`.
- Reemplazar el `Typography` "Arrastrá el PDF del resumen o" y el `Button` «Elegir archivo» por:

```tsx
      {!isMobile && <Typography sx={{ my: 1 }}>Arrastrá el PDF del resumen o</Typography>}
      <Button
        variant="contained"
        disabled={disabled}
        fullWidth={isMobile}
        onClick={() => inputRef.current?.click()}
        sx={{ mt: { xs: 1, md: 0 } }}
      >
        {buttonLabel}
      </Button>
```

El resto del archivo (drag & drop, aviso de no-PDF, `input` con `accept="application/pdf"`) queda igual.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/FileDropzone.test.tsx client/src/pages/ImportPage.test.tsx`
Expected: PASS (8 en `FileDropzone`; `ImportPage` sin cambios, 7).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FileDropzone.tsx client/src/components/FileDropzone.test.tsx
git commit -m "feat(client): elegir el PDF con un botón grande en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Archivos importados como tarjetas

**Files:**
- Modify: `client/src/importedFiles.ts`
- Test: `client/src/importedFiles.test.ts`
- Create: `client/src/components/ImportedFileCards.tsx`
- Test: `client/src/components/ImportedFileCards.test.tsx`
- Modify: `client/src/components/ImportedFilesSection.tsx`
- Test: `client/src/pages/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `RecordCard`, `recordListSx`, `RecordField` (Task 1); `ConfirmDialog`; `IMPORTED_FILE_KIND_LABELS`; `formatLocalDate`; `useDeleteImportedFile()` (`DELETE /api/imports/:kind/:id`); `useIsMobile()`.
- Produces:
  - `importedFileDeleteMessage(file: ImportedFileDTO | null): string` — el mismo texto que la tabla.
  - `ImportedFileCards` con props `{ rows: ImportedFileDTO[]; onDelete: (file: ImportedFileDTO) => void }` (las mismas que `ImportedFilesTable`).

- [ ] **Step 1: Write the failing tests**

En `client/src/importedFiles.test.ts`, sumar `importedFileDeleteMessage` al import de `./importedFiles.js` y agregar al final:

```ts
describe("importedFileDeleteMessage", () => {
  it("avisa que borrar un resumen también borra sus movimientos", () => {
    expect(importedFileDeleteMessage(files[0])).toBe(
      "¿Borrar visa-julio.pdf? También se borran sus movimientos. Esta acción no se puede deshacer.",
    );
  });

  it("para los demás tipos solo pide confirmar", () => {
    expect(importedFileDeleteMessage(files[1])).toBe("¿Borrar cupon-1.pdf? Esta acción no se puede deshacer.");
  });

  it("sin archivo pendiente no hay mensaje", () => {
    expect(importedFileDeleteMessage(null)).toBe("");
  });
});
```

`client/src/components/ImportedFileCards.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportedFileCards } from "./ImportedFileCards.js";

const rows: ImportedFileDTO[] = [
  { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
    documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
  { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
    documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
];

afterEach(cleanup);

const setup = (items: ImportedFileDTO[] = rows) => {
  const onDelete = vi.fn();
  renderWithProviders(<ImportedFileCards rows={items} onDelete={onDelete} />);
  return onDelete;
};

describe("ImportedFileCards", () => {
  it("muestra una tarjeta por archivo, el más reciente primero", () => {
    setup();
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["visa-julio.pdf", "recibo-junio.pdf"]);
  });

  it("cada tarjeta lleva tipo, detalle, fechas y la marca de revisar", () => {
    setup();
    const visa = within(screen.getByRole("article", { name: "visa-julio.pdf" }));
    expect(visa.getByText("Tarjeta")).toBeInTheDocument();
    expect(visa.getByText("revisar")).toBeInTheDocument();
    expect(visa.getByText("Visa ****1234 · 3 movimientos")).toBeInTheDocument();
    expect(visa.getByText("2026-07-02")).toBeInTheDocument();
    expect(visa.getByText("2026-07-05")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "recibo-junio.pdf" })).queryByText("revisar")).not.toBeInTheDocument();
  });

  it("borrar pide confirmación avisando que se van los movimientos y recién ahí llama onDelete", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar visa-julio.pdf" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar archivo" });
    expect(within(confirm).getByText(/también se borran sus movimientos/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(rows[1]);
  });

  it("cancelar no borra", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar recibo-junio.pdf" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Borrar archivo" })).getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("sin archivos que coincidan lo dice en castellano", () => {
    setup([]);
    expect(screen.getByText(/no hay archivos que coincidan/i)).toBeInTheDocument();
  });
});
```

En `client/src/pages/ImportPage.test.tsx`:

1. Cambiar el import de Testing Library y agregar el de viewport debajo del de `renderWithProviders`:

```tsx
import { cleanup, screen, waitFor, within } from "@testing-library/react";
```

```tsx
import { emulateMobile } from "../testing/viewport.js";
```

2. El `afterEach` queda:

```tsx
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

3. Agregar al final:

```tsx
describe("ImportPage en mobile", () => {
  const imported = [
    { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
      documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
    { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
      documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
  ];

  beforeEach(() => {
    emulateMobile();
    mockFetch((url) => (url.includes("/imports") ? imported : {}));
  });

  it("ofrece «Elegir PDF» y lista los archivos importados como tarjetas, sin grilla", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByRole("button", { name: "Elegir PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/arrastrá el pdf/i)).not.toBeInTheDocument();
    const visa = await screen.findByRole("article", { name: "visa-julio.pdf" });
    expect(within(visa).getByText("Tarjeta")).toBeInTheDocument();
    expect(within(visa).getByText("revisar")).toBeInTheDocument();
    expect(within(visa).getByText("Visa ****1234 · 3 movimientos")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "recibo-junio.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("borrar un archivo desde su tarjeta pide confirmación y manda el DELETE", async () => {
    renderWithProviders(<ImportPage />);
    await userEvent.click(await screen.findByRole("button", { name: "borrar recibo-junio.pdf" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar archivo" });
    expect(within(confirm).getByText(/¿borrar recibo-junio\.pdf\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(call?.[0])).toBe("/api/imports/payslip/p1");
    });
  });

  it("importa el PDF elegido y muestra el resultado", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "statement", status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return url.includes("/imports") ? imported : {};
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "visa-agosto.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/importedFiles.test.ts client/src/components/ImportedFileCards.test.tsx client/src/pages/ImportPage.test.tsx`
Expected: FAIL — `importedFileDeleteMessage` no existe, no se resuelve `./ImportedFileCards.js`, y en `ImportPage` falla "ofrece «Elegir PDF» y lista … como tarjetas" (se ve la grilla). Los otros dos de mobile ya pasan con la grilla (el botón de borrar tiene la misma etiqueta y el import no depende de la vista); quedan como regresión del flujo en el celular.

- [ ] **Step 3: Implement**

Al final de `client/src/importedFiles.ts`:

```ts
export const importedFileDeleteMessage = (file: ImportedFileDTO | null): string => {
  if (!file) return "";
  const cascade = file.kind === "statement" ? " También se borran sus movimientos." : "";
  return `¿Borrar ${file.fileName}?${cascade} Esta acción no se puede deshacer.`;
};
```

`client/src/components/ImportedFileCards.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import { Box, Chip, IconButton, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { formatLocalDate } from "../format.js";
import { IMPORTED_FILE_KIND_LABELS, importedFileDeleteMessage } from "../importedFiles.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";

interface ImportedFileCardsProps {
  rows: ImportedFileDTO[];
  onDelete: (file: ImportedFileDTO) => void;
}

interface FileBadgesProps {
  file: ImportedFileDTO;
}

const NO_DETAILS: RecordField[] = [];

const newestFirst = (a: ImportedFileDTO, b: ImportedFileDTO): number => b.uploadedAt.localeCompare(a.uploadedAt);

const highlightsOf = (file: ImportedFileDTO): RecordField[] => [
  { label: "Fecha", value: file.documentDate ?? "—" },
  { label: "Importado", value: formatLocalDate(file.uploadedAt) },
];

const FileBadges = ({ file }: FileBadgesProps) => (
  <>
    <Chip size="small" variant="outlined" label={IMPORTED_FILE_KIND_LABELS[file.kind]} />
    {file.needsReview && <Chip size="small" color="warning" label="revisar" />}
  </>
);

export const ImportedFileCards = ({ rows, onDelete }: ImportedFileCardsProps) => {
  const [pending, setPending] = useState<ImportedFileDTO | null>(null);
  const sorted = useMemo(() => [...rows].sort(newestFirst), [rows]);
  const cancelDelete = useCallback(() => setPending(null), []);

  const confirmDelete = () => {
    if (pending) onDelete(pending);
    setPending(null);
  };

  if (sorted.length === 0) {
    return <Typography color="text.secondary">No hay archivos que coincidan con los filtros</Typography>;
  }

  const cards = sorted.map((file) => (
    <RecordCard
      key={file.id}
      title={file.fileName}
      meta={file.description}
      badge={<FileBadges file={file} />}
      action={(
        <IconButton edge="end" aria-label={`borrar ${file.fileName}`} onClick={() => setPending(file)}>
          <DeleteIcon />
        </IconButton>
      )}
      highlights={highlightsOf(file)}
      details={NO_DETAILS}
    />
  ));

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <ConfirmDialog
        open={pending !== null}
        title="Borrar archivo"
        message={importedFileDeleteMessage(pending)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
```

En `client/src/components/ImportedFilesSection.tsx`:
- Imports: `import { useIsMobile } from "../useIsMobile.js";` y `import { ImportedFileCards } from "./ImportedFileCards.js";`.
- Primera línea del componente (antes de los `return` tempranos): `const isMobile = useIsMobile();`
- Antes del `return` final: `const FilesView = isMobile ? ImportedFileCards : ImportedFilesTable;`
- Reemplazar `<ImportedFilesTable rows={visibleFiles} onDelete={remove.mutate} />` por `<FilesView rows={visibleFiles} onDelete={remove.mutate} />`.

`ImportedFilesFilters` y el aviso de error del borrado quedan igual en las dos vistas.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/importedFiles.test.ts client/src/components/ImportedFileCards.test.tsx client/src/pages/ImportPage.test.tsx client/src/components/ImportedFilesSection.test.tsx client/src/components/ImportedFilesTable.test.tsx`
Expected: PASS (13 en `importedFiles`, 5 en `ImportedFileCards`, 10 en `ImportPage`; `ImportedFilesSection` (8) e `ImportedFilesTable` (6) sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/importedFiles.ts client/src/importedFiles.test.ts client/src/components/ImportedFileCards.tsx client/src/components/ImportedFileCards.test.tsx client/src/components/ImportedFilesSection.tsx client/src/pages/ImportPage.test.tsx
git commit -m "feat(client): archivos importados como tarjetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se corrige en el task que corresponde).

- [ ] **Step 1: Suite, tipos y build**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: todo en verde (en el cliente, 56 archivos de test).

- [ ] **Step 2: Servidor propio sin pisar otros**

Otras sesiones y el servicio instalado usan 4000, 4100 y 5173. Confirmar que 4400 está libre (`lsof -nP -iTCP:4400 -sTCP:LISTEN` no devuelve nada; si no, elegir otro). Con `client/dist` ya construido, copiar el `.env` del checkout principal (está ignorado por git) y levantar el server de este worktree en segundo plano:

```bash
cp ../../../.env .env
PORT=4400 node --env-file=.env --import tsx server/src/index.ts
```

El server sirve el cliente construido y la API en `http://localhost:4400`. Guardar el PID; al terminar, matar **solo ese PID** y borrar el `.env` copiado.

**Los datos son los reales**: en la revisión no confirmar borrados, no guardar TC, categorías ni reglas, no tocar «Reaplicar a todo» y no importar archivos. Abrir cada hoja o confirmación y salir con «Cancelar».

- [ ] **Step 3: Revisión visual**

En Chrome a 375×667 (iPhone SE) y 393×852 (iPhone 14 Pro). Si la ventana no se puede achicar (pantalla completa), emular con iframes del mismo origen de esos tamaños. Si se usa Claude in Chrome: `resize_window` y captura de cada punto. Checklist en Movimientos, Créditos, Auto, Sueldo, Reglas e Importar:

- Ninguna página tiene scroll horizontal (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), tampoco con comercios, patrones o nombres de archivo largos.
- **Movimientos**: filas con el comercio cortado con "…" y el monto a la derecha; chips de categoría y "N/M"; «Ver más» al final si hay más de 50. Tocar una fila abre la hoja con Fecha, Tipo, Monto, Cuota y Categoría; la lista de categorías del `Autocomplete` se ve por encima de la hoja; Guardar y Borrar quedan visibles por encima de la barra de inicio. «Seleccionar» muestra checkboxes y la barra «Cancelar» / «Borrar (n)» justo arriba de la navegación inferior, sin taparla ni tapar la última fila (scrollear hasta el final para comprobarlo).
- **Créditos, Auto y Sueldo**: el detalle mes a mes es una tarjeta por cupón/recibo con dos destacados; «Ver detalle» despliega el resto en dos columnas sin desbordar; el ✎ del TC abre la hoja "TC cuota N" / "TC recibo AAAA-MM" con el valor actual y Guardar deshabilitado hasta cambiarlo.
- **Reglas**: «Reaplicar a todo» a ancho completo debajo del título; «Nueva regla» abre la hoja vacía; tocar una tarjeta abre "Editar regla"; el switch está a la derecha y no abre la hoja.
- **Importar**: sin "Arrastrá el PDF…", botón «Elegir PDF» a ancho completo; los filtros se acomodan en varias líneas; los archivos importados son tarjetas con tipo, "revisar", fechas y el botón de borrar (abrir la confirmación y cancelar).
- En 1280px: Movimientos con la DataGrid, Créditos/Auto/Sueldo con sus tablas, Reglas con el formulario en línea y la tabla, «Reaplicar a todo» a la derecha del título, y el dropzone con "Arrastrá el PDF del resumen o" y «Elegir archivo», igual que en `main`.

- [ ] **Step 4: Prueba en el iPhone (la hace el usuario, después de mergear y `bun run deploy`)**

- En Créditos, Auto o Sueldo, el ✎ del TC abre el teclado numérico decimal (con coma); escribir un TC con coma y Guardar lo actualiza.
- En Importar, «Elegir PDF» abre el selector de iOS; elegir un PDF desde Archivos lo importa y muestra el resultado.
- En Movimientos, la barra de «Seleccionar» queda arriba de la navegación y de la barra de inicio, y las hojas no quedan tapadas por el teclado al editar la categoría.

Reportar al usuario el resultado de los Steps 1–3 con capturas y dejarle el checklist del Step 4.
