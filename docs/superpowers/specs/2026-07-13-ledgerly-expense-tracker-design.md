# Ledgerly — Diseño (SDD)

- **Fecha:** 2026-07-13
- **Estado:** Aprobado para planificar implementación
- **Autor:** Sebastián Opderbeck (con asistencia de Claude)

---

## 1. Objetivo

Aplicación local para llevar los **gastos corrientes de una persona**. El usuario carga el **PDF del resumen de su tarjeta de crédito** y la app extrae los movimientos, los categoriza y muestra **gráficos y estadísticas**. Uso personal, un solo usuario, datos en **MongoDB local**.

## 2. Alcance

**Incluye**
- Importar resúmenes en PDF de **2–4 emisores concretos** (arranca con **Visa Signature** e **ICBC**).
- Extraer movimientos (fecha, comercio, monto, moneda, cuotas), separando consumos reales del "ruido" (pagos, impuestos, bonificaciones).
- **Categorización automática por reglas**, editable por el usuario.
- Consolidar **varias tarjetas** y acumular resúmenes a lo largo del tiempo.
- **Multi-moneda** (ARS y USD) como dimensión transversal.
- Cuatro visualizaciones: **gasto por categoría**, **evolución mensual**, **cuotas a vencer / deuda futura**, **top comercios** + KPIs.

**No-goals (YAGNI)**
- Sin autenticación / multiusuario.
- Sin nube ni hosting; sin integración con APIs de bancos ni descarga automática de resúmenes.
- Sin conversión FX ARS↔USD (se muestran separados; opcional a futuro).
- Sin presupuestos / alertas / metas.
- Sin OCR (solo PDFs con capa de texto).
- Sin app mobile.

## 3. Decisiones de arquitectura

Restricción base: **el navegador no puede conectarse a MongoDB**. Por lo tanto hay un **backend Node** que habla con Mongo y expone una API REST al SPA. El parseo del PDF y las estadísticas corren en el **servidor**.

| Capa | Elección | Notas |
|---|---|---|
| Lenguaje | **TypeScript** en todo el repo | Prohibido `any`. Interfaces para props y tipos de retorno. |
| Frontend | **Vite + React 19 + MUI v6** | Requisito del proyecto. |
| Gráficos | **MUI X Charts** | Mismo theming que MUI. Consultar skill `dataviz` al implementar. |
| Estado servidor | **TanStack Query** | Cache + loading/error states con early returns. |
| Ruteo | **React Router** | Filtros en URL search params. |
| Backend | **Node + Express** | Uploads con **multer**; validación de req/res con **zod**. |
| Acceso a datos | **Mongoose** | Schemas para statements / transactions / categoryRules. |
| Extracción PDF | **unpdf / pdfjs-dist** (Node) | JS puro; debe abrir PDFs AES con password vacía (ver Riesgo #1). |
| Base de datos | **MongoDB local** vía **Docker Compose** | Alt: `mongod` instalado local. |
| Tests | **Vitest** + React Testing Library + supertest + mongodb-memory-server | Un runner para front y back. |
| Dev runner | **concurrently** + `tsx watch` | Vite proxya `/api` al backend. |

## 4. Arquitectura de alto nivel

```
┌─────────────────────────┐        HTTP /api        ┌──────────────────────────┐
│  client/ (SPA Vite)      │  ───────────────────▶   │  server/ (Express + TS)   │
│  React 19 · MUI · Charts │  ◀───────────────────   │  parsers · stats · rules  │
│  TanStack Query          │        JSON             │                           │
└─────────────────────────┘                          └────────────┬─────────────┘
        navegador                                        Mongoose   │
                                                                    ▼
                                                        ┌──────────────────────────┐
                                                        │  MongoDB local (Docker)   │
                                                        │  statements · transactions│
                                                        │  categoryRules            │
                                                        └──────────────────────────┘
```

## 5. Estructura del repo (monorepo, npm workspaces)

```
Ledgerly/
├─ client/                 # SPA Vite + React 19 + MUI
│  └─ src/
│     ├─ pages/            # Dashboard, Import, Transactions, Rules
│     ├─ components/       # charts, FiltersBar, TransactionsTable, ...
│     ├─ api/              # hooks TanStack Query (typed)
│     └─ theme/
├─ server/                 # Express + TS
│  └─ src/
│     ├─ http/             # rutas + middlewares (multer, zod, errores)
│     ├─ parsers/          # registry + visaSignature + icbc + normalize
│     ├─ ingestion/        # pipeline: extract → detect → parse → reconcile → persist
│     ├─ stats/            # aggregations + cómputo de cuotas futuras
│     ├─ rules/            # motor de categorización + seed
│     ├─ db/               # conexión Mongoose + modelos
│     └─ index.ts
├─ shared/                 # tipos TS + schemas zod compartidos (single source of truth)
├─ docker-compose.yml      # MongoDB local
├─ .env.example            # MONGO_URL, PORT
└─ docs/superpowers/specs/ # este documento
```

## 6. Modelo de datos

### 6.1 `statements` — un documento por PDF importado
| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | |
| `issuer` | `'visa_signature' \| 'icbc'` | Emisor detectado |
| `cardLabel` | string | Etiqueta legible (ej. "Visa Signature ****8883") |
| `last4` | string | Últimos 4 de la tarjeta |
| `closingDate` | Date | Cierre actual |
| `dueDate` | Date | Vencimiento |
| `prevClosingDate` / `nextClosingDate` | Date | Para contexto/validación |
| `saldoActual` | `{ ars: number, usd: number }` | Saldo del resumen |
| `saldoAnterior` | `{ ars: number, usd: number }` | |
| `pagoMinimo` | `{ ars: number, usd: number }` | |
| `limits` | `{ compra, financiacion, cuotas }` | |
| `sourceFileName` | string | |
| `sourceHash` | string (sha256) | **Idempotencia**: mismo PDF → no se duplica |
| `pageCount` | number | |
| `parserVersion` | string | Versión del parser usado |
| `needsReview` | boolean | La reconciliación no cuadró |
| `reconciliation` | `{ expected, parsed, diff }[]` | Detalle por moneda |
| `uploadedAt` | Date | |

### 6.2 `transactions` — un documento por movimiento
| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | |
| `statementId` | ObjectId (ref) | |
| `issuer` | Issuer | Desnormalizado para queries |
| `cardLabel` | string | Desnormalizado |
| `date` | Date | Fecha del movimiento (ISO) |
| `descriptionRaw` | string | Texto original del resumen |
| `merchant` | string | Comercio normalizado (para ranking) |
| `category` | string | Asignada por reglas; editable |
| `categorySource` | `'rule' \| 'manual'` | Si el usuario la corrigió, no la pisan las reglas |
| `amount` | number | Positivo |
| `currency` | `'ARS' \| 'USD'` | |
| `direction` | `'debit' \| 'credit'` | `-` final ⇒ credit |
| `type` | `'purchase' \| 'payment' \| 'tax' \| 'fee' \| 'refund' \| 'adjustment'` | **Solo `purchase` cuenta como gasto** |
| `isInstallment` | boolean | |
| `installmentCurrent` / `installmentTotal` | number | ej. 3 / 6 |
| `comprobante` | string | Nº de comprobante |
| `fingerprint` | string | Red de seguridad anti-duplicados: hash de `issuer+date+comprobante+amount+currency` |

### 6.3 `categoryRules` — reglas editables
| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | |
| `priority` | number | Menor = evalúa primero |
| `matchType` | `'contains' \| 'regex'` | |
| `pattern` | string | Se matchea contra `descriptionRaw`/`merchant` |
| `category` | string | Categoría a asignar |
| `source` | `'system' \| 'user'` | |
| `enabled` | boolean | |

### 6.4 Estado derivado (NO se persiste)
- **Categorías**: lista sembrada (Comida, Transporte, Suscripciones, Supermercado, Salud, Hogar, Entretenimiento, Otros, Sin categoría). Editable indirectamente vía reglas.
- **Cuotas a vencer / deuda futura**: se **deriva** de `transactions` con `installmentCurrent < installmentTotal`. La proyección impresa en el resumen se usa como **cross-check**, no como fuente.

## 7. Pipeline de ingesta

```
1. UPLOAD     multer → buffer en memoria
2. HASH       sourceHash = sha256(bytes) → si existe: corto circuito (idempotente)
3. EXTRACT    unpdf/pdfjs → texto (AES pw vacía) ; 0 texto → 422 "escaneado/corrupto"
4. DETECT     parserRegistry: primer parser cuyo detect(text, meta) === true
5. PARSE      parser del banco: text → ParsedStatement { header, rows[] }  (función pura)
6. NORMALIZE  cada row → Transaction (números AR, type, moneda, cuotas, merchant)
7. CATEGORIZE aplicar categoryRules por prioridad → category ('Sin categoría' por defecto)
8. RECONCILE  Σ purchases por moneda vs 'Total Consumos' impreso → needsReview si difiere
9. PERSIST    insertar statement + transactions; si falla → rollback (borrar lo insertado)
```

## 8. Parsers por banco

Interfaz común, módulos aislados y testeables. **Agregar un banco = agregar un módulo** que implemente la interfaz y registrarlo. Nada más cambia.

```ts
interface StatementParser {
  issuer: Issuer;
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedStatement;
}
```

`parserRegistry: StatementParser[]` — se itera y gana el primero cuyo `detect` devuelve `true`.

### 8.1 Visa Signature
- **Detección**: el texto contiene `VISA SIGNATURE` y/o el producer del PDF es Adobe LiveCycle.
- **Layout de fila**: `FECHA · COMPROBANTE · DETALLE · PESOS · DÓLARES`
  ```
  05.06.26                SU PAGO EN PESOS                 1.990.883,84-
  27.01.26   589410*      MERPAGO*TECNOPARAVOS  Cuota 05/06     8.855,00
  02.06.26   279762F      mytrip_...  USD 363,27                          363,27
  ```
- Fecha `DD.MM.YY` por fila. Cuota `Cuota NN/MM`. USD embebido como `USD x` + monto en columna DÓLARES.
- **Límites de sección**: inicia tras `SALDO ANTERIOR`; los consumos terminan en `Total Consumos ...`; luego vienen impuestos (IVA RG, IIBB PERCEP, DB.RG 5617) y totales (`SALDO ACTUAL`, `PAGO MINIMO`).
- También imprime **"Cuotas a vencer"** (proyección por mes) → cross-check.

### 8.2 ICBC
- **Detección**: el texto contiene `ICBC`; producer iText; PDF encriptado AES (pw vacía).
- **Layout de fila**: `[AA Mes] DD · COMPROBANTE[suf] · DETALLE · IMPORTE`
  ```
  26 Junio   08          SU PAGO EN PESOS               2705.742,75-
  25 Agosto  25 001061 * VISUAR ICBC MALL     C.11/12       9.999,95
             04 002452 * MEGATONE ICBC MALL   C.02/03      32.310,33
             28 002713 K PAYU*AR*UBER                      13.647,00
  ```
- **Fecha agrupada**: `AA Mes DD`; el `AA Mes` solo aparece cuando cambia → **arrastrar** el último año+mes visto; el día siempre está.
- Cuota `C.NN/MM`. Monto en pesos; `-` final = crédito. Sección USD aparte si aparece.

## 9. Normalización (común a todos los parsers)

- **Números AR**: `1.990.883,84` → `1990883.84` (`.` miles, `,` decimales). **`-` final ⇒ `direction: 'credit'`**.
- **`type`** por patrones sobre la descripción:
  - `SU PAGO` → `payment`
  - `IVA | IIBB | RG 5617 | DB.RG | PERCEP` → `tax`
  - `BONIF` → `refund`
  - `SALDO ANTERIOR` → se descarta (no es movimiento)
  - resto → `purchase`
  - **Solo `purchase` cuenta como gasto en los gráficos.**
- **Moneda**: monto en columna DÓLARES o `USD x` en el detalle → `USD`; si no → `ARS`.
- **Merchant**: quitar prefijos de pasarela (`MERPAGO*`, `PEDIDOSYA*`, `DLO*`, `PAYU*AR*`, `INI*`) para el ranking de comercios.
- **Cuotas**: parsear `Cuota NN/MM` / `C.NN/MM` → `installmentCurrent`, `installmentTotal`, `isInstallment=true`.

## 10. Idempotencia, reconciliación y errores

**Idempotencia**: `sourceHash` en el statement. Reimportar el mismo PDF → por defecto **se omite** (200 "Ya importado"); opción explícita en UI para **reemplazar** (borra el statement anterior y sus transacciones y reimporta).

**Reconciliación** (guarda de correctitud): `Σ(purchases por moneda)` se compara contra el `Total Consumos` / `SALDO ACTUAL` impreso. Si la diferencia supera una tolerancia chica → statement `needsReview = true` con detalle. Detecta desalineación del parser (p. ej. cambio de layout del banco).

**Fingerprint**: red de seguridad secundaria anti-duplicados a nivel transacción.

| Situación | Respuesta |
|---|---|
| PDF sin capa de texto (escaneado) | 422 "No se pudo extraer texto (¿escaneado?)" |
| Ningún parser detecta el formato | 422 "Formato no reconocido" + markers buscados |
| Parser encuentra 0 movimientos | 422, no se persiste |
| Reconciliación falla | **201** con `needsReview: true` + detalle (se persiste para inspección) |
| Duplicado (`sourceHash` existe) | 200 "Ya importado" (idempotente), salvo reemplazo explícito |

## 11. Categorización

- Motor puro `categorize(tx, rules): { category, source }` que aplica reglas por `priority` (contains/regex) contra `descriptionRaw`/`merchant`; default `'Sin categoría'`.
- **Override manual** (`categorySource = 'manual'`) tiene prioridad y **no lo pisan** las reglas al reaplicar.
- Seed inicial de reglas de sistema (ej.: `NETFLIX|SPOTIFY|YOUTUBE|APPLE.COM|GOOGLE *` → Suscripciones; `SUBE|UBER|CABIFY` → Transporte; `PEDIDOSYA|RAPPI|MERPAGO*...CAFE|BAR` → Comida; `CARREFOUR|COTO|DIA|MARKET` → Supermercado; etc.).
- `POST /api/category-rules/apply` reaplica reglas a todo lo importado (respetando overrides manuales).

## 12. Estadísticas (aggregation pipelines, filtradas a `type: 'purchase'`)

| Endpoint | Cálculo |
|---|---|
| `GET /api/stats/by-category` | `$match` (rango, moneda) → `$group` por `category` `$sum amount` → sort desc |
| `GET /api/stats/monthly` | `$group` por `{año, mes}` → total; serie temporal por moneda |
| `GET /api/stats/future-installments` | Cómputo puro en Node: por cada compra con `installmentCurrent < installmentTotal`, proyectar cuotas restantes a meses futuros; agrupar por mes. Cross-check vs proyección impresa |
| `GET /api/stats/top-merchants` | `$group` por `merchant` → total → sort desc → `$limit N` |
| `GET /api/stats/summary` | total del período, #movimientos, saldo actual, pago mínimo, deuda total en cuotas |

Filtros transversales (query params, validados con zod): `from`, `to`, `currency`, `issuer`/`cardLabel`, `category`.

## 13. API REST (`/api`)

Requests/responses validados con **zod**; tipos importados desde `shared/`.

```
POST   /api/statements              multipart (file) → parse → store. 200 dup | 201 ok | 422 error
GET    /api/statements              lista de resúmenes importados
GET    /api/statements/:id          resumen + sus transacciones
DELETE /api/statements/:id          borra resumen y sus transacciones
GET    /api/transactions            filtrado + búsqueda + paginado
PATCH  /api/transactions/:id        override manual de category/type
GET    /api/stats/by-category | monthly | future-installments | top-merchants | summary
GET    /api/category-rules          lista
POST   /api/category-rules          crear
PATCH  /api/category-rules/:id      editar
DELETE /api/category-rules/:id      borrar
POST   /api/category-rules/apply    reaplica reglas a lo ya importado
```

## 14. Frontend

| Página (ruta) | Contenido |
|---|---|
| **Dashboard** `/` | `KpiCards` + 4 gráficos + `FiltersBar` (período / moneda / tarjeta) |
| **Importar** `/import` | `FileDropzone` → resultado del parseo + `ReconciliationBanner` + `StatementList` (borrar / reimportar) |
| **Movimientos** `/transactions` | `TransactionsTable` (MUI DataGrid): filtros, búsqueda, editar categoría inline, paginado |
| **Reglas** `/rules` | CRUD de `categoryRules` + botón "reaplicar a todo" |

**Componentes de gráfico** (cada uno wrappea MUI X Charts, tipado, con empty-state):
`CategoryBreakdownChart` (torta/barras), `MonthlyTrendChart` (barras/línea), `FutureInstallmentsChart` (barras apiladas por mes), `TopMerchantsChart` (barras horizontales).

**Estado / UX**
- TanStack Query por endpoint; query keys incluyen los filtros. Filtros en **URL search params**.
- Loading y errores con **early returns** (no ternarios anidados en JSX).

**Estándares de código (CLAUDE.md)**: functional components, destructuring en la firma, fragments `<>`, `clsx` con patrón base + objeto de condicionales para CSS Modules, `useMemo`/`useCallback` donde corresponda, sin index como `key`, sin `any`, sin comentarios. Al implementar los gráficos, consultar la skill **`dataviz`** (paleta, accesibilidad, light/dark).

## 15. Testing (Vitest)

- **Parsers (TDD, lo más valioso)**: fixtures **anonimizadas** de los 2 PDFs → asserts sobre filas parseadas, totales y reconciliación (golden snapshot del `ParsedStatement`).
- **Unit**: normalización (números AR, `type`, merchant, moneda, cuotas), cómputo de cuotas futuras (función pura), motor de reglas.
- **Integración API**: `supertest` + `mongodb-memory-server`; subir sample → verificar documentos persistidos y respuestas de `/stats`.
- **Componentes**: React Testing Library (flujo de import, empty-states de gráficos, edición inline en la tabla).

## 16. Privacidad de datos

- Los PDFs de `examples/` contienen **datos personales reales** (nombre, domicilio, tarjeta, consumos) → agregar `examples/` a **`.gitignore`**. **No se commitea data financiera real.**
- Los fixtures de test son **anonimizados** (nombre/tarjeta/montos ficticios) preservando el **layout** de cada emisor.

## 17. Dev / build / run

- `docker compose up -d` → MongoDB en `localhost:27017` (db `ledgerly`).
- Scripts raíz: `npm run dev` (concurrently: Vite + `tsx watch` server), `npm run build`, `npm test`, `npm run seed` (categorías + reglas base).
- `.env` (`MONGO_URL`, `PORT`) con `.env.example` commiteado. Vite proxya `/api` → backend.
- "Producción" local: `vite build` → estáticos servidos por Express junto a la API (un solo proceso Node).

## 18. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | La lib de extracción no abre el PDF AES de ICBC con pw vacía | **Spike temprano** (milestone 0) antes de comprometer la lib; fallback a otra (pdf-parse, pdfjs con `password:''`) |
| 2 | Variaciones de layout dentro de un mismo emisor | Reconciliación + `needsReview` lo exponen; fixtures cubren casos |
| 3 | Descripciones ambiguas para categorizar | Reglas editables + override manual persistente |
| 4 | Fechas ICBC agrupadas mal arrastradas | Tests unitarios específicos del arrastre año+mes |

## 19. Orden de implementación (alimenta el plan)

`0` Spike extracción (ICBC AES) →
`1` Scaffold monorepo + TS + lint + docker-compose + conexión Mongo →
`2` Tipos + schemas zod compartidos (`shared/`) →
`3` **Parsers Visa + ICBC (TDD) + registry + normalización + reconciliación** →
`4` Persistencia (modelos Mongoose) + endpoint de upload + dedupe →
`5` Motor de reglas + seed →
`6` Stats (aggregations + cuotas futuras) + endpoints →
`7` Frontend: Importar + tabla de Movimientos →
`8` Frontend: Dashboard + 4 gráficos + filtros →
`9` Frontend: Reglas →
`10` Pulido, empty/error states, README.

## 20. Decisiones tomadas (defaults)

- **Backend**: Express (elección explícita del usuario).
- **Reimportar mismo PDF**: se **omite** por defecto; reemplazo explícito disponible en UI.
- **Reconciliación fallida**: se **persiste con `needsReview`** (no rechaza).
- **FX ARS↔USD**: fuera de alcance; ARS y USD se muestran por separado.
