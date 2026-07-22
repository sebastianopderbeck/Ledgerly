# Borrado manual de movimientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir borrar movimientos manualmente desde la página "Movimientos", de a uno (ícono por fila) o en lote (selección múltiple), siempre con confirmación previa.

**Architecture:** Un único endpoint de borrado en lote `POST /transactions/delete` en el backend (el borrado individual envía una lista de un solo id). En el frontend, un componente presentacional reutilizable `ConfirmDialog`, un hook `useDeleteTransactions`, y `TransactionsTable` con `checkboxSelection` + columna de acciones que dispara la confirmación.

**Tech Stack:** Express + Mongoose (server), React + MUI v6 + MUI X DataGrid v7 + TanStack Query + Vitest + Testing Library (client).

## Global Constraints

- **TypeScript estricto:** prohibido `any`. Interfaces para props, tipos para retornos.
- **Componentes:** funcionales con destructuring en la firma, fragments cortos `<>…</>`.
- **Sin comentarios** en el código generado.
- **DataGrid MUI X v7:** el modelo de selección es un array (`GridRowSelectionModel = GridRowId[]`), props `checkboxSelection`, `rowSelectionModel`, `onRowSelectionModelChange`.
- **Tests de client:** el auto-cleanup de RTL está apagado (no hay `globals:true` en `vitest.config.ts`). Todo archivo de test de client con múltiples renders DEBE incluir `afterEach(cleanup)` importando `cleanup` de `@testing-library/react`.
- **Config de tests:** un único `vitest.config.ts` en la raíz. Correr todo con `npm test` (= `vitest run`); un archivo puntual con `npx vitest run <ruta>`.
- **Git:** no hacer push/PR/merge. Los commits son locales; el usuario prefiere hacerlos él. Dejar los cambios stageados y confirmar antes de commitear si se ejecuta interactivamente. Los pasos "Commit" de abajo documentan el punto de corte de cada tarea.

---

### Task 1: Endpoint de borrado en lote

**Files:**
- Modify: `server/src/http/routes/transactions.ts` (agregar ruta `POST /delete` después del handler `PATCH /:id`)
- Test: `server/src/http/routes/transactions.test.ts` (agregar `describe` nuevo al final)

**Interfaces:**
- Consumes: `TransactionModel` (de `../../db/models.js`), `HttpError` y `asyncHandler` (de `../errors.js`) — ya importados en el archivo.
- Produces: endpoint `POST /api/transactions/delete`, body `{ ids: string[] }`, respuesta `{ deleted: number }`. Rechaza con `400` si `ids` no es un array de strings no vacío.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `server/src/http/routes/transactions.test.ts`:

```ts
describe("POST /api/transactions/delete", () => {
  it("borra los movimientos por id y devuelve la cantidad", async () => {
    const list = await request(app).get("/api/transactions");
    const ids = list.body.items.map((t: { id: string }) => t.id);
    const res = await request(app).post("/api/transactions/delete").send({ ids });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("borra sólo los ids indicados", async () => {
    const list = await request(app).get("/api/transactions?category=Compras");
    const id = list.body.items[0].id;
    const res = await request(app).post("/api/transactions/delete").send({ ids: [id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(1);
  });

  it("rechaza ids vacío con 400", async () => {
    const res = await request(app).post("/api/transactions/delete").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("rechaza body sin ids con 400", async () => {
    const res = await request(app).post("/api/transactions/delete").send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run server/src/http/routes/transactions.test.ts`
Expected: FAIL — los casos nuevos devuelven 404/otros en vez de 200/400 (la ruta no existe).

- [ ] **Step 3: Implementar la ruta**

En `server/src/http/routes/transactions.ts`, agregar después del handler `PATCH /:id` (líneas ~64), antes del cierre del archivo:

```ts
transactionsRouter.post(
  "/delete",
  asyncHandler(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
      throw new HttpError(400, "ids debe ser un array de strings no vacío");
    }
    const result = await TransactionModel.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: result.deletedCount });
  }),
);
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run server/src/http/routes/transactions.test.ts`
Expected: PASS (todos los casos, viejos y nuevos).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/transactions.ts server/src/http/routes/transactions.test.ts
git commit -m "feat(server): add bulk delete endpoint for transactions"
```

---

### Task 2: Componente ConfirmDialog

**Files:**
- Create: `client/src/components/ConfirmDialog.tsx`
- Test: `client/src/components/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog` con props `{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }`. Renderiza un MUI `Dialog` con botón "Cancelar" (dispara `onClose`) y un botón de confirmación con texto `confirmLabel` en `color="error"` (dispara `onConfirm`).

- [ ] **Step 1: Escribir el test que falla**

Crear `client/src/components/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("muestra el mensaje cuando está abierto", () => {
    renderWithProviders(
      <ConfirmDialog open title="Borrar" message="¿Seguro?" confirmLabel="Borrar"
        onConfirm={() => undefined} onClose={() => undefined} />,
    );
    expect(screen.getByText("¿Seguro?")).toBeInTheDocument();
  });

  it("confirmar dispara onConfirm y cancelar dispara onClose", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <ConfirmDialog open title="Borrar" message="¿Seguro?" confirmLabel="Borrar"
        onConfirm={onConfirm} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run client/src/components/ConfirmDialog.test.tsx`
Expected: FAIL — `Cannot find module './ConfirmDialog.js'`.

- [ ] **Step 3: Implementar el componente**

Crear `client/src/components/ConfirmDialog.tsx`:

```tsx
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog = ({ open, title, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <DialogContentText>{message}</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancelar</Button>
      <Button onClick={onConfirm} color="error" autoFocus>{confirmLabel}</Button>
    </DialogActions>
  </Dialog>
);
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run client/src/components/ConfirmDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ConfirmDialog.tsx client/src/components/ConfirmDialog.test.tsx
git commit -m "feat(client): add reusable ConfirmDialog component"
```

---

### Task 3: Borrado en TransactionsTable + hook + página

**Files:**
- Modify: `client/src/api/hooks.ts` (agregar `useDeleteTransactions` después de `usePatchTransaction`, ~línea 80)
- Modify: `client/src/components/TransactionsTable.tsx` (reescritura completa del componente)
- Modify: `client/src/pages/TransactionsPage.tsx` (instanciar el hook y pasar `onDelete`)
- Create: `client/src/components/TransactionsTable.test.tsx`
- Test: `client/src/pages/TransactionsPage.test.tsx` (agregar un caso que verifica el POST)

**Interfaces:**
- Consumes: `ConfirmDialog` (de `./ConfirmDialog.js`, Task 2); endpoint `POST /transactions/delete` (Task 1); `apiFetch`, `useMutation`, `useQueryClient` (ya en `hooks.ts`).
- Produces:
  - `useDeleteTransactions(): UseMutationResult` cuya `mutate` recibe `ids: string[]` y hace `POST /transactions/delete` con `{ ids }`, invalidando todas las queries en `onSuccess`.
  - `TransactionsTable` con nueva prop `onDelete: (ids: string[]) => void` (se suma a `rows` y `onCategoryChange`).

- [ ] **Step 1: Escribir el hook**

En `client/src/api/hooks.ts`, agregar justo después de `usePatchTransaction` (después de la línea 80):

```ts
export function useDeleteTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number }>("/transactions/delete", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

- [ ] **Step 2: Escribir los tests que fallan (tabla)**

Crear `client/src/components/TransactionsTable.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionsTable } from "./TransactionsTable.js";

const rows: TransactionDTO[] = [
  { id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
    descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
    amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: "1" },
  { id: "2", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-06-08",
    descriptionRaw: "SU PAGO", merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule",
    amount: 5000, currency: "ARS", direction: "credit", type: "payment", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: null },
];

afterEach(cleanup);

const setup = () => {
  const onDelete = vi.fn();
  renderWithProviders(<TransactionsTable rows={rows} onCategoryChange={() => undefined} onDelete={onDelete} />);
  return onDelete;
};

describe("TransactionsTable borrado", () => {
  it("el ícono de fila + confirmar llama onDelete con ese id", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: /borrar MERCADOLIBRE/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });

  it("cancelar no llama onDelete", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: /borrar SU PAGO/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("selección múltiple + borrar seleccionados + confirmar llama onDelete con los ids", async () => {
    const onDelete = setup();
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /borrar seleccionados \(1\)/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });
});
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run client/src/components/TransactionsTable.test.tsx`
Expected: FAIL — la prop `onDelete` no existe y no hay checkboxes ni botón de borrado.

- [ ] **Step 4: Reescribir TransactionsTable**

Reemplazar TODO el contenido de `client/src/components/TransactionsTable.tsx` por:

```tsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Box, Button } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  DataGrid, GridActionsCellItem,
  type GridColDef, type GridRowModel, type GridRowParams, type GridRowSelectionModel,
} from "@mui/x-data-grid";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface TransactionsTableProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
}

export const TransactionsTable = ({ rows, onCategoryChange, onDelete }: TransactionsTableProps) => {
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

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
    {
      field: "actions", type: "actions", headerName: "", width: 60,
      getActions: (params: GridRowParams<TransactionDTO>) => [
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label={`borrar ${params.row.merchant}`}
          onClick={() => setPendingIds([String(params.id)])}
        />,
      ],
    },
  ], []);

  const processRowUpdate = (next: GridRowModel<TransactionDTO>, prev: GridRowModel<TransactionDTO>) => {
    if (next.category !== prev.category) onCategoryChange(next.id, next.category);
    return next;
  };

  const selectedIds = selection.map(String);
  const confirmMessage = pendingIds && pendingIds.length === 1
    ? "¿Borrar este movimiento? Esta acción no se puede deshacer."
    : `¿Borrar ${pendingIds?.length ?? 0} movimientos? Esta acción no se puede deshacer.`;

  const confirmDelete = () => {
    if (pendingIds) onDelete(pendingIds);
    setPendingIds(null);
    setSelection([]);
  };

  return (
    <motion.div
      style={{ width: "100%" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {selectedIds.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setPendingIds(selectedIds)}>
            {`Borrar seleccionados (${selectedIds.length})`}
          </Button>
        </Box>
      )}
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        autoHeight
        checkboxSelection
        rowSelectionModel={selection}
        onRowSelectionModelChange={setSelection}
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={() => undefined}
        initialState={{ pagination: { paginationModel: { pageSize: 100, page: 0 } } }}
        pageSizeOptions={[25, 50, 100]}
      />
      <ConfirmDialog
        open={pendingIds !== null}
        title="Borrar movimientos"
        message={confirmMessage}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={() => setPendingIds(null)}
      />
    </motion.div>
  );
};
```

- [ ] **Step 5: Conectar la página**

En `client/src/pages/TransactionsPage.tsx`:

1. Actualizar el import de hooks (línea 3) para sumar `useDeleteTransactions`:

```tsx
import { useDeleteTransactions, usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
```

2. Instanciar el hook junto a `patch` (después de la línea 9 `const patch = usePatchTransaction();`):

```tsx
  const del = useDeleteTransactions();
```

3. Pasar `onDelete` al `TransactionsTable` (reemplazar el bloque `<TransactionsTable ... />`):

```tsx
      <TransactionsTable
        rows={data?.items ?? []}
        onCategoryChange={(id, category) => patch.mutate({ id, body: { category } })}
        onDelete={(ids) => del.mutate(ids)}
      />
```

- [ ] **Step 6: Correr los tests de la tabla para verificar que pasan**

Run: `npx vitest run client/src/components/TransactionsTable.test.tsx`
Expected: PASS (los 3 casos).

- [ ] **Step 7: Agregar el test de integración de la página (POST)**

En `client/src/pages/TransactionsPage.test.tsx`, dentro del `describe("TransactionsPage", …)`, agregar este caso al final. El mock de `fetch` del `beforeEach` ya responde `{}` para métodos no-GET, así que sirve tal cual:

```tsx
  it("borrar una fila y confirmar dispara POST /transactions/delete con el id", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /borrar MERCADOLIBRE/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(
        (c) => String(c[0]).includes("/transactions/delete") && (c[1] as RequestInit)?.method === "POST",
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ ids: ["1"] });
    });
  });
```

Nota: este archivo hace múltiples renders; ya tiene `afterEach(() => vi.restoreAllMocks())`. No usa `cleanup` hoy — si al agregar este tercer caso aparecen matches duplicados (p. ej. dos "MERCADOLIBRE"), agregar `import { cleanup } from "@testing-library/react"` y `afterEach(cleanup)` (además del `restoreAllMocks`).

- [ ] **Step 8: Correr los tests de la página**

Run: `npx vitest run client/src/pages/TransactionsPage.test.tsx`
Expected: PASS (los casos previos + el nuevo).

- [ ] **Step 9: Correr toda la suite y typecheck**

Run: `npm test`
Expected: PASS toda la suite (server + client).

Run: `npm run build` (o el script de typecheck del repo, p. ej. `tsc -b`)
Expected: sin errores de tipos.

- [ ] **Step 10: Commit**

```bash
git add client/src/api/hooks.ts client/src/components/TransactionsTable.tsx \
  client/src/components/TransactionsTable.test.tsx client/src/pages/TransactionsPage.tsx \
  client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): manual delete for transactions (row + bulk) with confirmation"
```

---

## Notas de verificación final

- **Cobertura del spec:**
  - Borrado individual (ícono por fila) → Task 3 (columna `actions` + `ConfirmDialog`).
  - Borrado en lote (checkbox + botón) → Task 3 (`checkboxSelection` + botón "Borrar seleccionados").
  - Confirmación en ambos casos → Task 2 (`ConfirmDialog`) usado en Task 3 para las dos vías.
  - Endpoint `POST /transactions/delete` `{ ids }` → `{ deleted }` con 400 en body inválido → Task 1.
  - Refresco tras borrar (`invalidateQueries`) → Task 3 (`useDeleteTransactions`).
  - Tests server (borra por ids, 400 vacío) y client (flujo de confirmación fila + lote + cancelar, y POST end-to-end) → Tasks 1 y 3.
- **Fuera de alcance (confirmado en el spec):** no se toca el statement asociado ni su reconciliación al borrar transacciones.
