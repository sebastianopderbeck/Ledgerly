# Gasto por categoría del último resumen — Diseño

## Objetivo

Agregar al Dashboard un segundo gráfico de torta, "Gasto por categoría (último
resumen)", con el mismo aspecto que el gráfico "Gasto por categoría" existente,
pero que agrega únicamente los movimientos del resumen más reciente de cada
tarjeta.

## Comportamiento

- **Alcance:** el gráfico toma el resumen (`statement`) con `closingDate` más
  reciente por cada emisor (`issuer`), replicando el criterio de
  `latestStatementPerIssuer`, y suma los movimientos `type: "purchase"` de esos
  resúmenes, agrupados por categoría.
- **Filtros respetados:**
  - Moneda (`currency`, ARS/USD): agrega solo los movimientos de esa moneda,
    igual que `/stats/by-category`.
  - Tarjeta (`cardLabel`): si viene, primero se acota a los resúmenes de esa
    tarjeta; el "último por issuer" resultante es el último resumen de esa
    tarjeta.
- **Filtros ignorados:**
  - Rango de fechas (`from`/`to`): el conjunto de datos lo define "el último
    resumen", no un rango; por eso el endpoint y el hook ignoran `from`/`to`.
    Esta es la única diferencia de comportamiento respecto del gráfico de
    categoría existente.
- **Sin datos:** si no hay resúmenes/movimientos, muestra "Sin datos", igual
  que el gráfico actual.

## Backend

### Helper puro `server/src/stats/lastStatement.ts`

- `latestStatementIdsPerIssuer(statements)`: recibe los statements (con `id`,
  `issuer`, `closingDate`, `uploadedAt`) y devuelve el id del resumen más
  reciente por issuer.
- Orden: `closingDate` descendente; desempate por `uploadedAt` descendente
  (cubre resúmenes con `closingDate` nulo o repetido).
- Es una función pura, testeable sin Mongo.

### Endpoint `GET /stats/last-statement/by-category`

En `server/src/http/routes/stats.ts`:

1. Buscar statements con `StatementModel.find(filter)`, donde `filter` incluye
   `cardLabel` si viene en el query (mismo criterio de filtrado que el resto).
2. Calcular los ids con `latestStatementIdsPerIssuer`.
3. Agregar con el mismo `$group`/`$project`/`$sort` que `/by-category`, pero con
   `$match: { type: "purchase", currency, statementId: { $in: ids } }`.
4. Si no hay ids, responder `[]`.

Devuelve `CategoryStat[]` (reutiliza el tipo existente).

## Frontend

### Refactor: componente presentacional `CategoryPie`

`client/src/components/charts/CategoryPie.tsx`

- Props: `{ data: CategoryStat[]; currency: Currency }`.
- Contiene el markup del `ResponsivePie` que hoy vive en
  `CategoryBreakdownChart` (tema, paleta, leyendas, `valueFormat`, etc.).
- Maneja el caso vacío ("Sin datos").
- Evita duplicar la configuración de nivo entre los dos gráficos.

### `CategoryBreakdownChart`

- Pasa a llamar `useByCategory(filters)` y renderizar
  `<CategoryPie data={data} currency={filters.currency} />`.

### `LastStatementCategoryChart`

`client/src/components/charts/LastStatementCategoryChart.tsx`

- Llama a un nuevo hook `useByCategoryLastStatement(filters)`.
- Renderiza el mismo `<CategoryPie/>`.

### Hook `useByCategoryLastStatement`

En `client/src/api/hooks.ts`:

- `GET /stats/last-statement/by-category` con `currency` y `cardLabel`
  (no envía `from`/`to`).
- Devuelve `CategoryStat[]`.

### `DashboardPage`

- Nueva `ChartCard` titulada "Gasto por categoría (último resumen)" ubicada al
  lado de "Gasto por categoría", renderizando `<LastStatementCategoryChart>`.

## Tests

### Server

- Helper puro `latestStatementIdsPerIssuer`:
  - Elige el `closingDate` más reciente por issuer.
  - Desempata por `uploadedAt` cuando `closingDate` es nulo o igual.
  - Maneja lista vacía.
- Endpoint `/stats/last-statement/by-category`:
  - Con resúmenes de dos issuers y varios ciclos, agrega solo movimientos del
    último ciclo de cada issuer.
  - Respeta `cardLabel` (devuelve solo el último resumen de esa tarjeta).
  - Respeta `currency`.

### Client

- `LastStatementCategoryChart` renderiza las categorías del último resumen.
- `CategoryBreakdownChart` sigue funcionando tras el refactor a `CategoryPie`.

## Fuera de alcance

- Leyenda/caption con las fechas de cierre cubiertas por el gráfico.
- Selección de un resumen puntual distinto del último.
