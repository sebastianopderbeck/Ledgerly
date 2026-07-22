# Filtro por categoría (multi-select) en Movimientos — Diseño

## Objetivo

Agregar un filtro por categoría en la sección de Movimientos. Permite elegir una
o varias categorías a la vez; el listado se acota a los movimientos de esas
categorías. Con ninguna categoría elegida, se muestran todas.

## Estado actual

- El parámetro de URL `category` ya fluye: `TransactionsPage` lo lee, `useTransactions`
  lo envía y el endpoint `GET /api/transactions` lo filtra por igualdad exacta.
- Falta únicamente el control de UI: `FiltersBar` con `showCategory` hoy solo
  renderiza el buscador de comercio ("Buscar comercio"), no un selector de categoría.
- Las categorías son texto libre (`z.string()`); no hay enum fijo. El conjunto real
  es el que aparece en los movimientos (categorías de reglas + manuales + "Sin categoría").

## Comportamiento

- **Multi-select:** el usuario elige 0..N categorías. 0 = todas (sin filtro).
- **Fuente de opciones:** categorías distintas presentes en TODOS los movimientos
  (ignora moneda y tarjeta), para que la lista sea estable y completa.
- **Filtrado:** `category IN {seleccionadas}`.
- **Encoding en URL:** parámetros repetidos, `?category=Compras&category=Transporte`.

## Backend

`server/src/http/routes/transactions.ts`

- `buildFilter`: normalizar `category` a arreglo y filtrar con `$in`.
  Express entrega `string` para un valor y `string[]` para parámetros repetidos.
  Un `?category=Compras` (un solo valor) sigue funcionando.
  ```ts
  const categories = Array.isArray(q.category)
    ? q.category.filter((c): c is string => typeof c === "string")
    : typeof q.category === "string" ? [q.category] : [];
  if (categories.length) filter.category = { $in: categories };
  ```
- Nuevo endpoint `GET /api/transactions/categories`:
  ```ts
  const categories = await TransactionModel.distinct<string>("category");
  res.json([...categories].sort((a, b) => a.localeCompare(b)));
  ```
  Se define junto al `GET "/"` (antes del `PATCH "/:id"`). Devuelve `string[]`.

## Frontend

`client/src/api/hooks.ts`

- `qs()`: expandir valores de tipo arreglo en parámetros repetidos
  (`for (const item of v) sp.append(k, String(item))`), ignorando vacíos.
  Los valores no-arreglo mantienen el comportamiento actual (`sp.set`).
- `TxFilters.category`: cambia de `string` a `string[]`.
- Nuevo hook `useCategories(): UseQueryResult<string[]>` → `GET /transactions/categories`,
  queryKey `["categories"]`.

`client/src/pages/TransactionsPage.tsx`

- `category: params.getAll("category")` (arreglo vacío ⇒ sin filtro).

`client/src/components/FiltersBar.tsx`

- `useCategories()` con guarda `Array.isArray`.
- Bajo `showCategory`, agregar un `TextField select` múltiple "Categorías"
  (`SelectProps={{ multiple: true, renderValue }}`), value = `params.getAll("category")`,
  onChange = `setMulti("category", ...)`. Se mantiene el buscador de comercio existente.
- Nuevo helper `setMulti(key, values)`: `next.delete(key)` y luego `next.append(key, v)` por cada valor.

## Tests

### Server (`transactions.test.ts`)

- `GET /categories` devuelve las categorías distintas, ordenadas (p. ej. `["Compras", "Sin categoría"]`).
- `?category=Compras&category=Sin categoría` filtra con `$in` (devuelve ambos).
- El test existente `?category=Compras` (un valor) sigue en verde.

### Client (`FiltersBar.test.tsx`)

- El select "Categorías" lista las categorías provistas por `/transactions/categories`.
- Al hacer click en dos opciones, ambas quedan `aria-selected="true"` (verifica el
  ida-y-vuelta value ⇄ URL params).

## Fuera de alcance

- Que las opciones de categoría se acoten según moneda/tarjeta seleccionadas.
- Renombrar el prop `showCategory` o separar buscador y categoría en props distintos.
- Cambios en la tabla o en el KPI "Deuda en cuotas" (tarea aparte).
