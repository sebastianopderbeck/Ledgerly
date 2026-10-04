# Calendario de vencimientos — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)

## Objetivo

Agregar una página nueva, **Vencimientos** (ruta `/vencimientos`), que responda una pregunta
concreta: **¿qué tengo que pagar y qué voy a cobrar en las próximas semanas, y cuánto?**

Es una línea de tiempo con cuatro fuentes:

- el **vencimiento de cada tarjeta** (`dueDate` del último resumen y la estimación de los siguientes);
- el **débito de la cuota del crédito UVA**;
- el **vencimiento del cupón del plan del auto**;
- la **fecha de cobro del sueldo**.

Cada fecha dice si está **confirmada** (sale de un documento importado) o es **estimada** (se
proyecta del patrón de los documentos anteriores). Muestra el monto cuando se conoce y, cuando se
puede estimar con criterio, lo muestra con «≈». La vista es una lista agrupada por semana o por
mes, pensada primero para el celular.

No es una agenda editable ni un recordatorio. No se cargan pagos a mano y no se marca nada como
pagado. Muestra lo que ya está importado más una proyección explicable.

## Punto de partida: lo que ya trae la base

La rama sale de `feat/base-nuevas-features`
(`docs/superpowers/specs/2026-10-03-base-nuevas-features-design.md`), que ya deja en su forma final
todo lo compartido. Esta feature **no toca** esos archivos:

- **Ruta y menú:** `/vencimientos` en `client/src/App.tsx` apunta a `VencimientosPage` (hoy un stub
  que muestra solo el `h4` «Vencimientos»). El ítem «Vencimientos» (`EventNoteOutlinedIcon`,
  `placement: "more"`) ya está entre Sueldo y Contexto en `client/src/components/layout/navItems.ts`,
  y `navItems.test.ts`, `MoreSheet.test.tsx` y `Layout.test.tsx` ya lo cubren. `App.test.tsx` exige
  el `h4` «Vencimientos» también mientras la página carga.
- **Fechas:** `client/src/isoDate.ts` ya existe con sus tests y con todas las firmas de la sección
  «Fechas» (la usa también gasto-real).
- **Datos:** no hay API, DTOs ni hooks nuevos. Se usan `useStatements`, `useCreditCoupons`,
  `useCreditSummary`, `useAutoCoupons`, `useAutoSummary`, `usePayslips` y `useMacroSeries` tal como
  están en `client/src/api/hooks.ts`. `useStoredState` y `cardCycle.ts` quedan sin cambios.

Archivos de esta feature: `client/src/vencimientos.ts` (+ test), `client/src/useVencimientos.ts`,
`client/src/components/VencimientosList.tsx` (+ test) y `client/src/pages/VencimientosPage.tsx`
(reemplaza el stub, + test).

## Decisiones tomadas

- **Todo se calcula en el cliente y no hay endpoint nuevo.** Los cuatro tipos de documento ya
  llegan al cliente con los hooks existentes, y el repo ya resuelve así `cardCycle.ts`,
  `realSalary.ts` y `macroSignals.ts`: el server sirve los documentos y un módulo puro del cliente
  los combina. No se toca `shared/` ni `server/`.
- **Horizonte:** desde hoy hasta el **último día del mes subsiguiente** (`MESES_ADELANTE = 2`). El 3
  de octubre, por ejemplo, va del 3/10 al 31/12, o sea tres meses calendario. No se muestran fechas
  pasadas: Ledgerly no sabe si algo se pagó.
- **Confirmado vs estimado:** es *confirmado* si la fecha sale tal cual de un documento
  (`Statement.dueDate`, `MortgageCoupon.fechaDebito`, `AutoCoupon.fechaVencimiento`,
  `Payslip.fechaPago`). Es *estimado* si se proyecta con el desplazamiento típico de los últimos
  documentos (ver Cálculo).
- **Montos:**
  - un ítem confirmado lleva el monto de su documento;
  - una **tarjeta estimada no lleva monto** («A confirmar»), porque el consumo varía demasiado;
  - una **cuota del crédito estimada** = cuota pura en UVA × UVA de hoy + el resto no-UVA del
    último cupón (seguro y otros);
  - una **cuota del auto estimada** = `totalAPagar` del último cupón;
  - un **sueldo estimado** = neto del último recibo mensual.

  Los montos estimados llevan «≈».
- **Fines de semana:** una fecha estimada que cae sábado o domingo se corre. Los **pagos** pasan al
  lunes siguiente, porque los vencimientos bancarios se mueven al día hábil siguiente. El
  **sueldo** pasa al viernes anterior. Los feriados no se contemplan. Las fechas confirmadas no se
  corren nunca.
- **Fuentes viejas no se estiman:** si el último documento de una fuente tiene más de 3 meses
  (`MESES_SIN_DOCUMENTO_MAX = 3`), esa fuente no se proyecta y figura al pie como «Sin estimar».
  Así no se arrastran para siempre una tarjeta dada de baja o un sueldo que ya no corresponde. La
  antigüedad se mide con el **mes ancla** del último documento (ver Cálculo).
- **Crédito y auto se cortan en la última cuota:** no se proyecta más allá de
  `CreditSummaryDTO.cuotasTotales` ni de `AutoSummaryDTO.cuotasTotales`.
- **El SAC no se proyecta.** Solo se usan los recibos `tipo: "mensual"`, tanto para los confirmados
  como para el patrón.
- **Un mismo vencimiento aparece una sola vez:** dos documentos de la misma fuente con la misma
  fecha (por ejemplo, un resumen reimportado con otro nombre de archivo) dan el mismo `id` y queda
  uno solo (en las tarjetas, el importado más recientemente, por `uploadedAt`). Así la `key` de
  React nunca se repite.
- **Pagos y cobros se aproximan por separado:** el encabezado de cada grupo pone «≈» en «Pagos» solo
  si algún pago estimado con monto entra en ese total, y lo mismo con «Cobros». La semana del 1°
  suele juntar un resumen confirmado con un sueldo estimado, y un solo indicador marcaría los dos.
- **Agrupación:** toggle **Semana / Mes**, con **Semana** por defecto. Se guarda por navegador con
  `useStoredState("ledgerly.vencimientosAgrupacion", …)`, igual que `ledgerly.sidebarCollapsed`. Las
  semanas arrancan el **lunes**.
- **Sin barra de filtros.** Según la regla del filtro de año global, lo que describe el estado
  actual no se filtra. La página ignora `year`, `currency`, `cardLabel`, `from` y `to`. Como los
  links del menú los siguen llevando, la selección se conserva al volver a otra sección.
- **Sin gráficos.** La pregunta es «qué viene y cuándo»; una lista con fecha y monto la responde
  mejor que un gráfico de barras por semana, y en 375px no compite por espacio.
- **Menú:** ítem «Vencimientos» en «Más» (`placement: "more"`), con `EventNoteOutlinedIcon`,
  **después de Sueldo** y antes de Contexto, porque es la sección que junta Créditos, Auto y Sueldo.
  Ya lo deja listo la base.

### Enfoques descartados

- **Endpoint `GET /api/vencimientos`:** ahorra requests, pero suma DTO en `shared/src/dtos.ts`, ruta
  en `app.ts` y tests con `withDb`, todo para datos que el cliente ya tiene cacheados por las otras
  páginas.
- **Leer «Prox.Vto.» del PDF:** los resúmenes reales imprimen el próximo vencimiento (ICBC como
  `Prox.Vto.:` en el encabezado, Visa en una grilla aparte). Convertiría la estimación de la tarjeta
  en una fecha de documento, pero obliga a tocar los parsers, la colección `Statement` y a reimportar
  todo para tener historia. Queda fuera de alcance (ver al final).
- **Calendario mensual en grilla (7 columnas):** en 375px cada día queda en ~50px y no entra un
  monto. La lista agrupada se lee mejor con el pulgar.

## Datos

No hay colecciones, campos ni endpoints nuevos. Todo sale de lo que ya exponen las rutas
existentes:

| Fuente | Colección (`server/src/db/models.ts`) | Endpoint → hook (`client/src/api/hooks.ts`) | Campos que se usan |
|---|---|---|---|
| Tarjetas | `Statement` | `GET /api/statements` → `useStatements()` | `issuer`, `cardLabel`, `closingDate`, `dueDate`, `totals.saldoActual.ars`, `totals.saldoActual.usd`, `totals.pagoMinimo.ars` |
| Crédito UVA | `MortgageCoupon` | `GET /api/credits/coupons` → `useCreditCoupons()` | `cuotaNro`, `fechaDebito`, `totalDebitado`, `capital`, `intereses`, `cuotaPuraUva`, `cotizacionUva` |
| Fin del crédito | (derivado) | `GET /api/credits/summary` → `useCreditSummary()` | `cuotasTotales` |
| Plan del auto | `AutoCoupon` | `GET /api/auto/coupons` → `useAutoCoupons()` | `cuotaNro`, `fechaVencimiento`, `totalAPagar` |
| Fin del plan | (derivado) | `GET /api/auto/summary` → `useAutoSummary()` | `cuotasTotales` (hoy `AUTO_CUOTAS_TOTALES = 120` en `server/src/stats/autoProgress.ts`) |
| Sueldo | `Payslip` | `GET /api/payslips` → `usePayslips()` | `periodo`, `tipo`, `fechaPago`, `neto` |
| UVA de hoy | `MacroSeries` (`serie: "uva"`) | `GET /api/macro/series` → `useMacroSeries()` | `hoy.uva` |

Notas:

- Las fechas llegan como string ISO `"YYYY-MM-DD"` (`isoDate` y `toISOString().slice(0, 10)` en
  `server/src/http/mappers.ts`). Toda la matemática es de calendario sobre esos strings, con
  `Date.UTC` adentro de los helpers de `isoDate.ts`.
- `/credits/summary` y `/auto/summary` responden **204** cuando no hay cupones. `apiFetch` devuelve
  `undefined`, y React Query 5 deja esa query en **`isError`** («Query data cannot be undefined»).
  El `QueryClient` de la app tiene `retry: false`, así que el error llega enseguida. Por eso esos
  dos hooks y `useMacroSeries` son **datos opcionales**: se espera a que terminen de cargar, pero su
  error nunca pone a la página en estado de error. Sin resumen no hay límite de cuotas, y sin serie
  macro no hay UVA de hoy.
- Los statements con `dueDate: null` se ignoran.
- Se asume **un solo crédito y un solo plan**, como ya asumen `computeCreditProgress` y
  `computeAutoProgress`. Las tarjetas se agrupan por `issuer`, como `latestStatementPerIssuer` en
  `client/src/cardCycle.ts`.

## Cálculo

Todo vive en dos módulos puros del cliente, sin React y sin red: `client/src/isoDate.ts` (helpers
de fecha, ya en la base) y `client/src/vencimientos.ts` (el motor, nuevo).

### Fechas: `client/src/isoDate.ts` (ya en la base)

```ts
export const todayIso = (): string
export const monthOf = (fecha: string): string
export const addMonths = (mes: string, n: number): string
export const addDays = (fecha: string, n: number): string
export const daysBetween = (desde: string, hasta: string): number
export const lastDayOfMonth = (mes: string): string
export const weekdayOf = (fecha: string): number
export const startOfWeek = (fecha: string): string
export const formatDayMonth = (fecha: string): string
export const formatWeekdayShort = (fecha: string): string
export const formatDayOfMonthLong = (fecha: string): string
export const formatMonthYear = (mes: string): string
```

- `todayIso` devuelve la fecha **local** (getters locales, no UTC).
- `mes` es `"YYYY-MM"` y `fecha` es `"YYYY-MM-DD"`.
- `weekdayOf` va de 0 (domingo) a 6 (sábado). `startOfWeek` devuelve el lunes de esa semana; para un
  domingo, el lunes anterior.
- Los formatos usan arrays fijos en español, **no `Intl`**: `formatDayMonth("2026-10-13")` →
  `"13/10"`; `formatWeekdayShort` → `"dom" | "lun" | "mar" | "mié" | "jue" | "vie" | "sáb"`;
  `formatDayOfMonthLong("2026-10-12")` → `"12 de octubre"`; `formatMonthYear("2026-11")` →
  `"noviembre 2026"`.

### Tipos y constantes de `client/src/vencimientos.ts`

```ts
export const MESES_ADELANTE = 2;
export const MUESTRA_PATRON = 6;
export const MESES_SIN_DOCUMENTO_MAX = 3;

export type VencimientoTipo = "tarjeta" | "credito" | "auto" | "sueldo";
export type VencimientoSentido = "pago" | "cobro";
export type VencimientoEstado = "confirmado" | "estimado";
export type Corrimiento = "adelante" | "atras";
export type Agrupacion = "semana" | "mes";

export interface Vencimiento {
  id: string;
  tipo: VencimientoTipo;
  sentido: VencimientoSentido;
  estado: VencimientoEstado;
  fecha: string;
  titulo: string;
  detalle: string;
  monto: number | null;
  montoUsd: number | null;
}

export interface RangoFechas { desde: string; hasta: string; }
export interface Ocurrencia { mes: string; fecha: string; }
export interface FechaProyectada { mes: string; fecha: string; paso: number; }
export interface FuenteVencimientos { etiqueta: string; items: Vencimiento[]; desactualizada: boolean; }

export interface VencimientosInput {
  statements: StatementDTO[];
  creditCoupons: MortgageCouponDTO[];
  creditSummary: CreditSummaryDTO | undefined;
  autoCoupons: AutoCouponDTO[];
  autoSummary: AutoSummaryDTO | undefined;
  payslips: PayslipDTO[];
  uvaHoy: number | null;
}

export interface VencimientosView { rango: RangoFechas; items: Vencimiento[]; sinEstimar: string[]; }

export interface GrupoVencimientos {
  clave: string;
  titulo: string;
  items: Vencimiento[];
  totalPagos: number;
  totalPagosUsd: number;
  totalCobros: number;
  pagosAproximados: boolean;
  cobrosAproximados: boolean;
  aConfirmar: number;
}

export const isAgrupacion = (value: unknown): value is Agrupacion
```

`id` es `${tipo}-${clave}-${fecha}` para las tarjetas (la clave es el `issuer`, por ejemplo
`tarjeta-icbc-2026-10-14`) y `${tipo}-${fecha}` para las fuentes únicas (`credito-2026-11-05`). Es
único por fuente y fecha, y se usa como `key` de React.

### Rango

```ts
export function rangoDesde(hoy: string): RangoFechas
```

Devuelve `{ desde: hoy, hasta: lastDayOfMonth(addMonths(monthOf(hoy), MESES_ADELANTE)) }`. Las dos
puntas son inclusivas.

### Mes ancla y desplazamiento típico

Cada documento se ve como una **ocurrencia** `{ mes, fecha }`: el *mes ancla* al que pertenece el
pago y la fecha real.

| Fuente | `mes` (ancla) | `fecha` |
|---|---|---|
| Tarjeta | `monthOf(dueDate)` | `dueDate` |
| Crédito | `monthOf(fechaDebito)` | `fechaDebito` |
| Auto | `monthOf(fechaVencimiento)` | `fechaVencimiento` |
| Sueldo | `addMonths(periodo, 1)` | `fechaPago` |

El sueldo se ancla en el **mes siguiente al período** porque se cobra alrededor del cambio de mes:
el de julio puede entrar el 31/7 o el 1/8. Contra el 1° del mes siguiente, los desplazamientos
quedan agrupados cerca de 0 (−1, 0, +2). Contra su propio mes saltarían entre 30 y 0, y la mediana
no serviría.

```ts
export function desplazamientoTipico(ocurrencias: Ocurrencia[]): number | null
```

1. Deduplica por `mes` (si dos documentos caen en el mismo mes ancla, se queda con la fecha mayor),
   ordena por `mes` y toma las **últimas `MUESTRA_PATRON` (6)**.
2. Para cada una calcula `daysBetween(`${mes}-01`, fecha)`.
3. Devuelve la **mediana**. Con cantidad par promedia las dos del medio con `Math.round`. Sin
   ocurrencias devuelve `null`.

### Proyección

```ts
export function ajustarFinDeSemana(fecha: string, corrimiento: Corrimiento): string
export function proyectarFechas(ocurrencias: Ocurrencia[], rango: RangoFechas, corrimiento: Corrimiento): FechaProyectada[]
export function estaDesactualizada(ultimoMes: string, desde: string): boolean
```

- `ajustarFinDeSemana`: con `"adelante"`, sábado → +2 y domingo → +1 (al lunes). Con `"atras"`,
  sábado → −1 y domingo → −2 (al viernes). Un día de semana queda igual.
- `proyectarFechas`: parte de la última ocurrencia (la de mayor `mes` tras deduplicar) y del
  desplazamiento típico `d`. Para `paso = 1, 2, …`:
  1. `mes = addMonths(ultima.mes, paso)`;
  2. `base = addDays(`${mes}-01`, d)`. Si `d >= 0` y `base` se pasa del mes (un día 31 en
     febrero), se usa `lastDayOfMonth(mes)`;
  3. `fecha = ajustarFinDeSemana(base, corrimiento)`;
  4. si `fecha > rango.hasta`, corta. Si `fecha >= rango.desde`, la agrega como
     `{ mes, fecha, paso }`. Las que quedan antes de `desde` se descartan: son meses que ya pasaron
     sin documento.

  El ciclo nunca pasa de `addMonths(monthOf(rango.hasta), 1)`: con corrimiento hacia atrás, el
  ancla de enero puede caer el 30 o 31 de diciembre.
- `estaDesactualizada(ultimoMes, desde)` es `ultimoMes < addMonths(monthOf(desde), -MESES_SIN_DOCUMENTO_MAX)`.
  Con `desde = 2026-10-03` el umbral es `2026-07`: un último documento de julio todavía se proyecta,
  uno de junio ya no. Para el sueldo, `ultimoMes` es el ancla (período + 1).

### Fuentes

```ts
export function estimarCuotaCredito(ultimo: MortgageCouponDTO, uvaHoy: number | null): number
export function vencimientosDeTarjetas(statements: StatementDTO[], rango: RangoFechas): FuenteVencimientos[]
export function vencimientosDeCredito(coupons: MortgageCouponDTO[], cuotasTotales: number | null, uvaHoy: number | null, rango: RangoFechas): FuenteVencimientos[]
export function vencimientosDeAuto(coupons: AutoCouponDTO[], cuotasTotales: number | null, rango: RangoFechas): FuenteVencimientos[]
export function vencimientosDeSueldo(payslips: PayslipDTO[], rango: RangoFechas): FuenteVencimientos[]
```

Cada función devuelve `[]` si no hay documentos. Las tarjetas devuelven una fuente por `issuer`
(en orden alfabético de `issuer`) y el resto, una sola fuente. Dentro de cada fuente:

- **Confirmados:** los documentos cuya fecha cae dentro del rango.
- **Estimados:** `proyectarFechas(...)`, solo si la fuente no está desactualizada ni terminada.

| Fuente | `etiqueta` | Confirmado: `titulo` / `detalle` / `monto` | Estimado: `titulo` / `detalle` / `monto` | Corrimiento |
|---|---|---|---|---|
| Tarjeta (`sentido: "pago"`) | `cardLabel` del resumen con mayor `dueDate` | `cardLabel` / `Resumen con cierre 02/10 · mín. $ 42.000,00` (sin `closingDate`: `Resumen importado · mín. …`) / `saldoActual.ars`; `montoUsd` = `saldoActual.usd` si es > 0, si no `null` | `cardLabel` del último / `Según los últimos N resúmenes` (`Según el último resumen` si N = 1; N = mín(6, meses ancla distintos)) / `null` | adelante |
| Crédito (`"pago"`) | `Crédito UVA` | `Crédito UVA · cuota 24` / `Cupón importado · 123,45 UVA` (`formatUva`) / `totalDebitado` | `Crédito UVA · cuota {último + paso}` / `123,45 UVA a la UVA de hoy`, o `Igual a la cuota 24` si no hay UVA más nueva / `estimarCuotaCredito(...)` | adelante |
| Auto (`"pago"`) | `Plan del auto` | `Plan del auto · cuota 25` / `Cupón importado` / `totalAPagar` | `Plan del auto · cuota {último + paso}` / `Igual a la cuota 25` / `totalAPagar` del último | adelante |
| Sueldo (`"cobro"`) | `Sueldo` | `Sueldo de agosto 2026` (`formatMonthYear(periodo)`) / `Recibo importado` / `neto` | `Sueldo de {formatMonthYear(addMonths(mes, -1))}` / `Igual al neto de agosto 2026` / `neto` del último recibo mensual | atrás |

`estimarCuotaCredito(ultimo, uvaHoy)`:

```
uva   = max(uvaHoy ?? 0, ultimo.cotizacionUva)
resto = ultimo.totalDebitado − ultimo.capital − ultimo.intereses
monto = ultimo.cuotaPuraUva × uva + resto
```

El `max` cubre una serie macro desactualizada: la UVA no baja, así que nunca se estima por debajo
de la cotización del último cupón. Si gana la cotización del cupón (o empatan), el detalle dice
`Igual a la cuota N`.

Cortes por fin de plan:

- **Crédito:** con `cuotasTotales` conocido (`creditSummary?.cuotasTotales`), se descartan las
  proyecciones con `cuota > cuotasTotales`. Si `ultimo.cuotaNro >= cuotasTotales`, la fuente está
  **terminada**: no se proyecta y no cuenta como desactualizada.
- **Auto:** igual, con `autoSummary?.cuotasTotales`.
- `ultimo` es el cupón de mayor `cuotaNro`, y `ultimo.mes` es el ancla de ese cupón.

### Lista completa

```ts
export function listVencimientos(input: VencimientosInput, rango: RangoFechas): VencimientosView
export function hayDocumentos(input: VencimientosInput): boolean
```

- Junta las cuatro fuentes (`cuotasTotales` sale de los resúmenes opcionales y `uvaHoy` de
  `useMacroSeries().data?.hoy.uva ?? null`).
- Ordena por `fecha` ascendente; en el mismo día, primero los **cobros** y después por `titulo`
  (`localeCompare`).
- `sinEstimar` son las `etiqueta` de las fuentes con `desactualizada: true`, en el orden tarjetas,
  crédito, auto, sueldo.
- `hayDocumentos` es `true` si hay al menos un statement, cupón o recibo.

### Agrupación y textos

```ts
export function agruparVencimientos(items: Vencimiento[], agrupacion: Agrupacion, hoy: string): GrupoVencimientos[]
export function resumenDeGrupo(grupo: GrupoVencimientos): string
export function montoTexto(item: Vencimiento): string
export function montoUsdTexto(item: Vencimiento): string | null
export function etiquetaDia(fecha: string, hoy: string): string
export function diaDelMes(fecha: string): number
export function notaSinEstimar(sinEstimar: string[]): string | null
```

- `clave`: con `"semana"` es `startOfWeek(fecha)` y con `"mes"` es `monthOf(fecha)`. Los grupos van
  en orden de clave y **solo aparecen los que tienen ítems**. Dentro de cada grupo los ítems quedan
  en el orden en que llegan.
- `titulo` por semana:
  - `"Esta semana"` si la clave es `startOfWeek(hoy)`;
  - `"La semana que viene"` si es `addDays(startOfWeek(hoy), 7)`;
  - si no, `Semana del ${formatDayOfMonthLong(clave)}`, por ejemplo «Semana del 12 de octubre».
- `titulo` por mes: `"Este mes"` para `monthOf(hoy)`; si no, `formatMonthYear` con mayúscula
  inicial, por ejemplo «Noviembre 2026».
- Totales:
  - `totalPagos` suma el `monto` no nulo de los pagos y `totalPagosUsd` suma su `montoUsd`;
  - `totalCobros` suma el `monto` de los cobros;
  - `pagosAproximados` es `true` si algún pago estimado con monto entra en `totalPagos`;
    `cobrosAproximados`, lo mismo con los cobros;
  - `aConfirmar` cuenta los ítems con `monto === null`.
- `resumenDeGrupo` arma el texto del encabezado con las partes no vacías unidas por ` · `:
  - `Pagos ≈ $ 1.234.567,00` (si hay algún pago con monto; el `≈` solo si `pagosAproximados`);
  - `+ US$ 35,00` (si `totalPagosUsd > 0`);
  - `Cobros ≈ $ 2.100.000,00` (si hay algún cobro con monto; el `≈` solo si `cobrosAproximados`);
  - `1 a confirmar` (si `aConfirmar > 0`).
- `montoTexto`:
  - `null` → `"A confirmar"`;
  - si no, `formatMoney(monto, "ARS")`, con prefijo `+` en los cobros y `≈ ` en los estimados. Por
    ejemplo: `≈ $ 812.000,00`, `+$ 2.100.000,00` o `≈ +$ 2.100.000,00`.
- `montoUsdTexto`: `+ US$ 35,00` si hay `montoUsd`; si no, `null`.
- `etiquetaDia`: `"hoy"`, `"mañana"` o `formatWeekdayShort(fecha)`. `diaDelMes` es el número de día.
- `notaSinEstimar`: `null` si la lista está vacía; si no, `Sin estimar porque no hay documentos de
  los últimos 3 meses: ICBC, Crédito UVA.`

### Casos borde

| Situación | Comportamiento |
|---|---|
| Fuente sin documentos | No aporta ítems ni aparece en «Sin estimar» |
| Un solo documento en la fuente | El desplazamiento típico es el de ese documento; se proyecta igual |
| Último resumen con `dueDate` futuro | Ese vencimiento es confirmado y las estimaciones arrancan el mes siguiente |
| Último resumen con `dueDate: null` | Se ignora; el patrón usa los anteriores |
| Todos los resúmenes de un emisor sin `dueDate` | Ese emisor no aporta nada |
| Último documento con más de 3 meses | Sin estimados; la etiqueta va a «Sin estimar» |
| Crédito o auto en su última cuota | Sin estimados y sin aviso |
| Mes proyectado que cae antes de hoy | Se descarta (ya pasó y no hay documento) |
| Día 29–31 en un mes más corto | Último día del mes, después el corrimiento de fin de semana |
| Sin serie macro (`seed:macro` nunca corrido) | El crédito estimado usa `cotizacionUva` del último cupón |
| Dos documentos de una fuente con la misma fecha | Un solo ítem (en tarjetas, el importado más recientemente) |
| Hay documentos pero ningún ítem en el rango | Mensaje «No hay pagos ni cobros entre hoy y el 31 de diciembre.» |
| Statement con saldo 0 | Se muestra con `$ 0,00` (sigue siendo una fecha de vencimiento) |

### Ejemplo (fixtures sintéticos)

`hoy = 2026-10-03` (sábado), rango del 3/10 al 31/12.

| Fuente | Documentos | Desplazamiento | Ítems |
|---|---|---|---|
| Visa | vencimientos 2026-08-13, 2026-09-14, 2026-10-13 | mediana(12, 13, 12) = 12 | mar 13/10 **confirmado** (saldo); vie 13/11 estimado; dom 13/12 → **lun 14/12** estimado |
| ICBC | vencimiento 2026-09-14 | 13 | mié 14/10, sáb 14/11 → **lun 16/11**, lun 14/12, los tres estimados y «A confirmar» |
| Crédito | cuotas 22–24 con débitos 2026-07-06, 2026-08-05, 2026-09-04 | mediana(5, 4, 3) = 4 | lun 5/10 cuota 25, jue 5/11 cuota 26, sáb 5/12 → **lun 7/12** cuota 27, todos ≈ |
| Auto | cupones 2026-08-10, 2026-09-09, cuota 25 al 2026-10-09 | mediana(9, 8, 8) = 8 | vie 9/10 cuota 25 **confirmado**; lun 9/11 cuota 26 y mié 9/12 cuota 27 ≈ |
| Sueldo | 2026-06 → 07-01, 2026-07 → 07-31, 2026-08 → 09-01 | mediana(0, −1, 0) = 0 | ancla 2026-10 → 1/10, ya pasó; ancla 2026-11 → dom 1/11 → **vie 30/10** (octubre); mar 1/12 (noviembre) |

Agrupado por semana: «La semana que viene» (crédito 5/10, auto 9/10), «Semana del 12 de octubre»
(Visa 13/10, ICBC 14/10), «Semana del 26 de octubre» (sueldo 30/10), etc. «Esta semana» no
aparece porque no tiene ítems.

## API

**Sin endpoints ni DTOs nuevos.** La página consume siete requests que ya existen y que React
Query ya cachea para otras páginas: `/statements`, `/credits/coupons`, `/credits/summary`,
`/auto/coupons`, `/auto/summary`, `/payslips` y `/macro/series`.

### Hook `client/src/useVencimientos.ts`

```ts
export interface UseVencimientosResult {
  isLoading: boolean;
  isError: boolean;
  hasDocuments: boolean;
  hoy: string;
  view: VencimientosView;
}

export function useVencimientos(): UseVencimientosResult
```

- Llama `useStatements`, `useCreditCoupons`, `useCreditSummary`, `useAutoCoupons`,
  `useAutoSummary`, `usePayslips` y `useMacroSeries`.
- `isLoading` es `true` si **cualquiera** de los siete está cargando, así un monto estimado no
  cambia cuando llega la UVA.
- `isError` es `true` solo si falla alguna de las **cuatro listas de documentos**. Los resúmenes con
  204 y la serie macro no cuentan.
- `hoy` se calcula una vez con `useMemo(todayIso, [])`.
- `view` es `useMemo(() => listVencimientos(input, rangoDesde(hoy)), [...])` sobre los `data` de
  las queries, con `[]` y `undefined` como valores por defecto.

## UI

### Página `client/src/pages/VencimientosPage.tsx`

Ruta `/vencimientos` en `client/src/App.tsx` (ya en la base). De arriba a abajo:

1. Título `h4` **«Vencimientos»**, con `mb: 3` como el resto de las páginas.
2. Fila de encabezado:
   - a la izquierda, `De hoy al 31 de diciembre.` (`formatDayOfMonthLong(view.rango.hasta)`) en
     `body2`/`text.secondary`;
   - a la derecha, un `ToggleButtonGroup` exclusivo con `aria-label="Agrupar por"` y los botones
     **Semana** y **Mes**.

   El valor sale de `useStoredState("ledgerly.vencimientosAgrupacion", "semana", isAgrupacion)`, y
   el `onChange` ignora `null`, para que siempre quede uno elegido.
3. Leyenda en `caption`: «Confirmado: la fecha sale de un documento importado. Estimado: se
   proyecta del patrón de los últimos documentos; los montos estimados llevan ≈.»
4. `VencimientosList` con `agruparVencimientos(view.items, agrupacion, hoy)` (en `useMemo`), con
   `key={agrupacion}` para que al cambiar de agrupación la lista entre de nuevo con su animación.
5. Si `view.sinEstimar` no está vacío, una nota al pie en `caption` con `notaSinEstimar`: «Sin
   estimar porque no hay documentos de los últimos 3 meses: ICBC, Crédito UVA.»

Estados, todos como early returns antes del `return` principal:

| Situación | Se ve |
|---|---|
| `isLoading` | título + `CircularProgress` |
| `isError` | título + `Alert` de error «No se pudieron cargar los vencimientos. Probá de nuevo en un rato.» |
| `!hasDocuments` | título + «Todavía no importaste resúmenes, cupones ni recibos. Subilos desde la página Importar.» |
| Sin grupos | encabezado y leyenda + «No hay pagos ni cobros entre hoy y el 31 de diciembre.» + nota «Sin estimar» si corresponde |

### Lista `client/src/components/VencimientosList.tsx`

```ts
interface VencimientosListProps { grupos: GrupoVencimientos[]; hoy: string; }
```

Es presentacional: recibe grupos ya resueltos y los textos salen de los helpers de
`vencimientos.ts`.

- Contenedor `MotionBox` con `staggerContainer` y `display: "grid"`, `gap: 2`, `maxWidth: 840`.
- Cada grupo va en `MotionBox` (`fadeUpItem`) + `Card component="section"` con
  `aria-labelledby` (id de `useId`). El encabezado tiene el `titulo` como `Typography component="h2"
  variant="subtitle1"` en 600 y, debajo, `resumenDeGrupo(grupo)` en `caption`/`text.secondary`.
- Los ítems van en `List disablePadding`; cada uno es un `ListItem divider` con
  `aria-label={`${titulo}, ${formatDayOfMonthLong(fecha)}, ${estado}`}`.
- **Fila** (mismo esquema que `TransactionsList`):
  - **Ficha de fecha** a la izquierda, de 44 × 44 como mínimo (`MIN_TAP_SIZE`), con el día del mes
    en negrita y debajo `hoy`, `mañana` o el día corto (`etiquetaDia`).
    - *Confirmado:* fondo `alpha(primary.main, 0.12)` y texto `primary.main`.
    - *Estimado:* borde `1px dashed` `divider` y texto `text.secondary`.
  - **Centro:** primera línea con el `titulo` (`noWrap`, 500) y el monto a la derecha
    (`montoTexto`, 600, `whiteSpace: nowrap`, `success.main` en los cobros, `caption` en «A
    confirmar»). Segunda línea, que puede partirse: `detalle` en `caption`, un `Chip size="small"
    variant="outlined"` con «Confirmado» (`color="success"`) o «Estimado» (default, con
    `borderStyle: "dashed"`), y si hay `montoUsd`, `+ US$ 35,00` en `caption`.
- Las filas son de solo lectura: no son botones ni abren hojas.

### Compu

Una sola columna, `maxWidth: 840`, alineada a la izquierda como el resto del contenido. El toggle
queda a la derecha del texto «De hoy al…» (`display: flex`, `justifyContent: space-between`,
`alignItems: center`).

### Mobile (< `md`)

- Las diferencias son solo de layout y se resuelven con breakpoints de `sx`, sin `useIsMobile()`:
  es la misma lista en las dos vistas, como pide el spec responsive para lo que no es estructural.
- La fila de encabezado pasa a columna (`flexDirection: { xs: "column", md: "row" }`, `gap: 1.5`).
  El toggle ocupa todo el ancho (`width: { xs: "100%", md: "auto" }`) y cada botón usa `flex: 1` y
  44px de alto (`MIN_TAP_SIZE`); en compu vuelve al tamaño `small`.
- La ficha de fecha mide 44px, así el título conserva espacio en 375px. El título trunca con
  ellipsis y el detalle se parte en varias líneas.
- El espacio bajo la barra inferior ya lo resuelve el `Container` de `Layout`.

## Tests

Con TDD: cada pieza arranca con un test en rojo. Los archivos con varios renders llevan
`afterEach(cleanup)`, porque en este repo el auto-cleanup de RTL está apagado. Todos los fixtures
son sintéticos.

- `client/src/isoDate.test.ts`: ya en la base.
- `client/src/vencimientos.test.ts`:
  - `rangoDesde`: hasta el último día del mes subsiguiente, cruzando el año;
  - `desplazamientoTipico`: mediana impar y par (con redondeo), solo las últimas 6, dedup por mes y
    vacío → `null`;
  - `ajustarFinDeSemana`: sábado y domingo en las dos direcciones, y día hábil sin cambios;
  - `proyectarFechas`: clamp del 31 en febrero, descarte de las fechas antes de `desde`, corte en
    `hasta`, `paso` correlativo y ancla de enero que cae en diciembre con corrimiento hacia atrás;
  - `estaDesactualizada` en el borde exacto de 3 meses;
  - `estimarCuotaCredito`: con UVA de hoy, sin UVA, y con UVA de hoy menor que la del cupón (gana la
    del cupón);
  - tarjetas: resumen futuro confirmado con saldo ARS + USD y mínimo en el detalle; mes siguiente
    estimado con `monto: null`; `dueDate: null` ignorado; dos emisores independientes; emisor
    viejo → `desactualizada`; mismo vencimiento importado dos veces → un ítem;
  - crédito: número de cuota correlativo, corte en `cuotasTotales` y fuente terminada sin aviso;
  - auto: cupón futuro confirmado con `totalAPagar` y estimados con el mismo monto;
  - sueldo: ancla en `periodo + 1`, corrimiento hacia atrás, SAC ignorado y `titulo` con el período
    correcto;
  - `listVencimientos`: orden por fecha con cobro antes que pago el mismo día, `sinEstimar`;
  - `agruparVencimientos`: títulos «Esta semana», «La semana que viene», «Semana del 12 de octubre»,
    «Este mes», «Noviembre 2026»; totales, aproximación por separado, `aConfirmar`; grupos vacíos
    omitidos;
  - `resumenDeGrupo`, `montoTexto`, `montoUsdTexto`, `etiquetaDia` y `notaSinEstimar`;
  - el ejemplo completo de este spec como caso de integración del motor.
- `client/src/components/VencimientosList.test.tsx`: un encabezado `h2` por grupo con su resumen;
  filas con `aria-label`; chip «Confirmado» o «Estimado»; «≈» en montos estimados; «A confirmar»;
  `+ US$`; «hoy» y «mañana» en la ficha.
- `client/src/pages/VencimientosPage.test.tsx`, con `fetch` stubeado por URL y la fecha fijada en
  `2026-10-03T12:00:00`:
  - con datos se ven «La semana que viene», «Crédito UVA · cuota 25» como estimado y «Plan del auto
    · cuota 25» como confirmado con su monto;
  - tocar «Mes» muestra «Este mes» y «Noviembre 2026», y al volver a renderizar sigue en Mes
    (`localStorage`);
  - `/credits/summary` y `/auto/summary` con 204 no muestran error;
  - mientras carga se ve el `h4` y el spinner;
  - sin documentos → mensaje de Importar;
  - `/statements` con 500 → mensaje de error;
  - fuente vieja → nota «Sin estimar…»;
  - documentos sin ítems en el rango → mensaje «No hay pagos ni cobros…»;
  - con `emulateMobile()` se ve la lista (ni `table` ni `grid`) y los dos botones de agrupación.
- Navegación (`navItems.test.ts`, `MoreSheet.test.tsx`, `Layout.test.tsx`, `App.test.tsx`): ya en la
  base.

**Verificación final:** `bun run test`, `bun run typecheck` y `bun run build` en verde. Revisión
visual a 375px y 1280px con datos reales, sin commitear nada de `examples/`.

## Orden de implementación

1. **Fechas:** ya en la base (`isoDate.ts`).
2. **Motor:** `vencimientos.ts` completo con su batería de tests, en tres pasos (proyección,
   fuentes, lista y agrupación). No depende de ninguna UI.
3. **UI:** `VencimientosList`, después `useVencimientos` + `VencimientosPage` (la ruta y el menú ya
   están en la base).

## Fuera de alcance (YAGNI)

- Leer «Prox.Vto.» / «PROXIMO VTO.» de los PDFs de tarjeta para confirmar el próximo vencimiento.
- Estimar el monto del próximo resumen de tarjeta (con cuotas ya comprometidas o promedio de
  consumos).
- Feriados nacionales en el corrimiento de fechas.
- Marcar vencimientos como pagados, cargar vencimientos manuales (alquiler, expensas, servicios) o
  editar fechas.
- Recordatorios, notificaciones push o exportar a calendario (.ics).
- Proyectar el SAC (aguinaldo).
- Integrar las suscripciones detectadas (#3) como vencimientos; queda como extensión natural con
  `proyectarFechas`.
- Un KPI «Próximo vencimiento» en el Dashboard.
- Filtros de año, moneda o tarjeta en esta página.
- Varios créditos o varios planes de auto en paralelo.
