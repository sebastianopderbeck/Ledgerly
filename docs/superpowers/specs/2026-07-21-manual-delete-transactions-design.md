# Borrado manual de movimientos

**Fecha:** 2026-07-21

## Objetivo

Permitir al usuario borrar movimientos (transacciones) manualmente desde la
página "Movimientos", tanto de a uno como en lote, con confirmación previa en
todos los casos.

## Alcance

- Borrado individual mediante un ícono de tacho por fila en el `DataGrid`.
- Borrado en lote mediante selección múltiple (checkboxes) + botón "Borrar
  seleccionados (N)".
- Confirmación obligatoria antes de cada borrado (individual y en lote).
- El borrado elimina el documento de la transacción de la base. No modifica el
  statement asociado ni su reconciliación (fuera de alcance).

## Diseño

### Server

Nuevo endpoint de borrado en lote en `server/src/http/routes/transactions.ts`:

- `POST /transactions/delete`
- Body: `{ ids: string[] }`
- Valida que `ids` sea un array de strings no vacío. Si no lo es, responde
  `400`.
- Ejecuta `TransactionModel.deleteMany({ _id: { $in: ids } })`.
- Responde `{ deleted: number }` con la cantidad efectivamente borrada.

Tanto el borrado individual como el en lote usan este único endpoint (el
individual envía `ids` con un solo elemento). Un solo camino de código y un
solo test.

### Client

**Hook** (`client/src/api/hooks.ts`):

- `useDeleteTransactions`: mutación `POST /transactions/delete` con
  `{ ids: string[] }`. `onSuccess: () => qc.invalidateQueries()` para refrescar
  tabla, estadísticas y categorías.

**Componente reutilizable** `client/src/components/ConfirmDialog.tsx`:

- MUI `Dialog`.
- Props: `open: boolean`, `title: string`, `message: string`,
  `confirmLabel: string`, `onConfirm: () => void`, `onClose: () => void`.
- Presentacional: no conoce transacciones ni mutaciones.

**`TransactionsTable`** (`client/src/components/TransactionsTable.tsx`):

- Agregar `checkboxSelection` al `DataGrid` y manejar el modelo de selección con
  estado interno (`useState`).
- Agregar una columna de acciones con `IconButton` + `DeleteIcon` por fila.
- Barra superior con botón "Borrar seleccionados (N)" visible sólo cuando hay
  filas seleccionadas.
- El estado del diálogo de confirmación vive dentro del Table: guarda los `ids`
  objetivo y si está abierto.
- Al confirmar, llama a la prop `onDelete(ids: string[])` y limpia la selección.
- Nueva prop: `onDelete: (ids: string[]) => void` (se suma a las existentes
  `rows` y `onCategoryChange`).

**`TransactionsPage`** (`client/src/pages/TransactionsPage.tsx`):

- Instancia `useDeleteTransactions`.
- Pasa `onDelete={(ids) => del.mutate(ids)}` al `TransactionsTable`.

## Flujo de datos

1. El usuario hace click en el tacho de una fila, o selecciona filas y presiona
   "Borrar seleccionados (N)".
2. `TransactionsTable` abre `ConfirmDialog` con los `ids` objetivo.
3. Al confirmar, el Table llama `onDelete(ids)` y limpia su selección.
4. `TransactionsPage` dispara `del.mutate(ids)` → `POST /transactions/delete`.
5. El server borra con `deleteMany` y responde `{ deleted }`.
6. `onSuccess` invalida las queries y la tabla se refresca.

## Manejo de errores

- Server: body inválido (ids no array o vacío) → `400`.
- Client: los errores de la mutación se manejan con el patrón de react-query ya
  existente (no se agrega UI de error nueva en esta feature).

## Testing

- **Server** (`transactions.test.ts`): borra por lista de ids y verifica
  `deleted` y que las transacciones ya no existen; caso `ids` vacío → `400`.
- **Client**: flujo de confirmación en `TransactionsTable`:
  - Abrir diálogo desde el ícono de fila y confirmar → llama `onDelete` con el
    id correcto.
  - Seleccionar filas, presionar "Borrar seleccionados", confirmar → llama
    `onDelete` con los ids seleccionados.
  - Cancelar → no llama `onDelete`.
