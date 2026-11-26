# Control de la retención de Ganancias — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección en la página Sueldo que rehace la retención de Ganancias del año en curso con los recibos y las tablas de ARCA, y dice si el empleador retiene bien, de más o de menos.

**Architecture:** Todo en el cliente, sin cambios de API. Tres módulos de dominio en TS plano (`gananciasTablas.ts` con los datos de ARCA, `gananciasConceptos.ts` con los códigos del recibo y `gananciasRetencion.ts` con el cálculo) toman `PayslipDTO[]` y devuelven un `ResultadoRetencion` listo para mostrar. Una sección colapsable, con tabla en desktop y tarjetas en mobile, lo muestra debajo de «Ajustes vs IPC».

**Tech Stack:** React 18 + MUI 6, TypeScript, Vitest + Testing Library (jsdom), bun.

**Spec:** `docs/superpowers/specs/2026-11-25-retencion-ganancias-design.md`

## Global Constraints

- Directorio de trabajo: el worktree `.claude/worktrees/retencion-ganancias`, rama `feat/retencion-ganancias`. Correr todo desde ahí.
- Imports ESM con sufijo `.js`. Prohibido `any`. Componentes funcionales con props desestructuradas en la firma e interfaces de props.
- **Sin comentarios en el código.**
- Los módulos de dominio son TS plano: sin React, sin hooks. Cada uno tiene su `.test.ts` al lado.
- Tests de cliente: `afterEach(cleanup)` explícito, porque el auto-cleanup de RTL está apagado.
- **Ningún dato real** (montos, recibos del usuario) en tests, commits ni textos de GitHub. Los tests usan recibos sintéticos.
- Copy en español rioplatense. Textos fijados por el spec: «Faltan las tablas de ARCA de <año>», «Falta el recibo de <mes> <año>: la cuenta llega hasta <mes>», «Ajuste de la liquidación anual <año anterior>: <monto> (no entra en la cuenta de <año>)», veredictos «Coincide» / «Te retienen de más» / «Te retienen de menos».
- Tolerancia del veredicto: `|diferencia| ≤ 1 %` del esperado acumulado.
- Commits con pathspec explícito, mensaje `feat(scope): …` o `docs(scope): …`, **sin ninguna atribución a Claude**.

## Review Focus

- **Recibo de SAC de junio presente, pero falta el sueldo de mayo** (los dos se cobran en junio): es un hueco en junio. La cuenta llega hasta mayo y se avisa que falta mayo; no se cuenta el SAC solo. → test en Task 3.
- **Retención mayor que cero con impuesto esperado cero** (meses de sueldo bajo): tiene que decir «Te retienen de más», no «Coincide». → test en Task 3.
- **Llega el sueldo de diciembre**, que se cobra en enero del año siguiente: el año pasa al siguiente y la sección muestra «Faltan las tablas de ARCA de <año>», sin romperse ni mezclar años. → test en Task 3.
- **Falta el recibo de diciembre del año anterior** (hueco en enero): no hay ningún mes calculable. La sección muestra el aviso, sin KPIs y sin romperse por la falta de un último mes. → tests en Task 3 y Task 4.
- **Mobile:** las filas pasan a tarjetas y el veredicto sigue visible sin expandir. → test en Task 4.

---

### Task 1: Tablas de ARCA 2026

**Files:**
- Create: `client/src/gananciasTablas.ts`
- Test: `client/src/gananciasTablas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TramoEscala { desde: number; hasta: number | null; pagaran: number; alicuota: number }
  export interface TablasMes { escala: readonly TramoEscala[]; gananciaNoImponible: number; deduccionEspecial: number }
  export interface TablasAnio { meses: readonly TablasMes[]; topeHipotecarioAnual: number }
  export const TABLAS_GANANCIAS: ReadonlyMap<number, TablasAnio>
  ```
  `meses[0]` es enero. Un año puede tener menos de 12 meses si solo se cargó un semestre. `hasta: null` es «en adelante». «Sobre el excedente de» siempre es igual a `desde`, así que no se guarda. `alicuota` va en porcentaje (5, 9, …, 35). `gananciaNoImponible` y `deduccionEspecial` son los acumulados del mes. `deduccionEspecial` es la del art. 30 inc. c **apartado 2**.

- [ ] **Step 1: Instalar dependencias del worktree**

Run: `bun install --frozen-lockfile`
Expected: termina sin errores y crea `node_modules`.

- [ ] **Step 2: Escribir el test de las tablas**

`client/src/gananciasTablas.test.ts`, `describe("TABLAS_GANANCIAS 2026")`:
- `it("tiene 12 meses de 9 tramos con las alícuotas de la escala")`: `meses.length === 12`, y cada mes con `escala.map(t => t.alicuota)` igual a `[5, 9, 12, 15, 19, 23, 27, 31, 35]`. El primer tramo tiene `desde: 0, pagaran: 0` y el último `hasta: null`.
- `it("cada tramo continúa el anterior")`: en cada mes, `escala[i].hasta === escala[i + 1].desde` y `Math.abs(escala[i].pagaran + (escala[i].hasta - escala[i].desde) * escala[i].alicuota / 100 - escala[i + 1].pagaran) < 0.05`.
- `it("coincide con los valores puntuales de los PDF de ARCA")`:
  - `meses[0].escala[0].hasta` = `166669.17`
  - `meses[6].escala[8]` = `{ desde: 36290871.00, hasta: null, pagaran: 8765066.75, alicuota: 35 }`
  - `meses[11].escala[8]` = `{ desde: 65867941.10, hasta: null, pagaran: 15908598.62, alicuota: 35 }`
  - `meses[11].escala[0].hasta` = `2168491.89`
  - `topeHipotecarioAnual` = `20000`
- `it("tiene las deducciones del art. 30 acumuladas por mes")`: `meses.map(m => m.gananciaNoImponible)` y `meses.map(m => m.deduccionEspecial)` iguales a los arrays de Step 3.

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run client/src/gananciasTablas.test.ts`
Expected: FAIL, porque no se puede resolver `./gananciasTablas.js`.

- [ ] **Step 4: Escribir `client/src/gananciasTablas.ts` con los datos de 2026**

Art. 30, acumulados de enero a diciembre (PDF de deducciones julio–diciembre 2026, que repite enero–junio):

```
gananciaNoImponible: 429316.88, 858633.75, 1287950.63, 1717267.50, 2146584.38, 2575901.25,
                     3077540.53, 3579179.81, 4080819.09, 4582458.37, 5084097.65, 5585736.93
deduccionEspecial:   2060721.00, 4121442.00, 6182163.01, 8242884.01, 10303605.01, 12364326.01,
                     14772194.56, 17180063.10, 19587931.65, 21995800.20, 24403668.74, 26811537.29
```

Art. 94: los 9 tramos de cada mes (108 filas), transcriptos del PDF «Tabla-Art-94-LIG-per-jul-a-dic-2026.pdf» (URL en el spec). Ese PDF trae primero la tabla anual (9 filas) y después enero a diciembre, 9 filas por mes; enero–junio son iguales a las del PDF del primer semestre. Para no tipear a mano, extraer el texto con `unpdf`, la dependencia que ya usa `server/src/pdf/extract.ts`, en un script descartable fuera del repo. Las filas con montos cumplen `/^[0-9][0-9.]*,[0-9]{2} /`, con columnas `desde hasta pagarán % excedente` («en adelante» en el último tramo), y se pasan a literales del módulo. Si la sesión todavía tiene el scratchpad de la calibración, el texto ya extraído está en `…/scratchpad/arca-dl/Tabla-Art-94-LIG-per-jul-a-dic-2026.txt`.

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run client/src/gananciasTablas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/gananciasTablas.ts client/src/gananciasTablas.test.ts docs/superpowers/specs/2026-11-25-retencion-ganancias-design.md docs/superpowers/plans/2026-11-25-retencion-ganancias.md
git commit -m "feat(ganancias): tablas de ARCA 2026 para la retención"
```

---

### Task 2: Conceptos del recibo

**Files:**
- Create: `client/src/gananciasConceptos.ts`
- Test: `client/src/gananciasConceptos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CODIGOS_APORTES_DEDUCIBLES: ReadonlySet<string>   // "0401","0403","0402","0454","0405","0407","0314","0422","0425"
  export const CODIGOS_RETENIDO: ReadonlySet<string>            // "0430","0433"
  export const CODIGO_AJUSTE_ANIO_ANTERIOR = "0446"
  export const sumarConceptos = (payslip: PayslipDTO, codigos: ReadonlySet<string>): number
  ```

- [ ] **Step 1: Write the failing test**

`describe("sumarConceptos")`. Un recibo sintético con conceptos `0403: 1000`, `0402: 300`, `0422: 200`, `0430: 900`, `0433: -400`, `0446: -50`, `0201: 10000`:
- `it("suma los aportes deducibles")`: `sumarConceptos(recibo, CODIGOS_APORTES_DEDUCIBLES)` → `1500`.
- `it("suma retención y devolución con su signo")`: `sumarConceptos(recibo, CODIGOS_RETENIDO)` → `500`.
- `it("el ajuste del año anterior no es retenido")`: `CODIGOS_RETENIDO.has(CODIGO_AJUSTE_ANIO_ANTERIOR)` → `false`.
- `it("da 0 si el recibo no trae esos códigos")`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/gananciasConceptos.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `client/src/gananciasConceptos.ts`** con los códigos de la tabla «Conceptos del recibo» del spec. Los montos se toman con el signo que traen.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/gananciasConceptos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/gananciasConceptos.ts client/src/gananciasConceptos.test.ts
git commit -m "feat(ganancias): códigos del recibo para aportes y retención"
```

---

### Task 3: Cálculo de la retención

**Files:**
- Create: `client/src/gananciasRetencion.ts`
- Test: `client/src/gananciasRetencion.test.ts`

**Interfaces:**
- Consumes: `TramoEscala`, `TablasAnio`, `TABLAS_GANANCIAS` (Task 1); `CODIGOS_APORTES_DEDUCIBLES`, `CODIGOS_RETENIDO`, `CODIGO_AJUSTE_ANIO_ANTERIOR`, `sumarConceptos` (Task 2); `monthLabel` de `payslipConcepts.ts`.
- Produces:
  ```ts
  export interface MesDeCobro { anio: number; mes: number }
  export const mesDeCobro: (payslip: Pick<PayslipDTO, "periodo" | "tipo">) => MesDeCobro
  export const impuestoSegunEscala: (escala: readonly TramoEscala[], gananciaNetaSujeta: number) => number
  export const TOLERANCIA_RETENCION = 0.01
  export type VeredictoRetencion = "coincide" | "de_mas" | "de_menos"
  export const veredictoRetencion: (diferencia: number, esperado: number) => VeredictoRetencion
  export const veredictoRetencionLabel: (veredicto: VeredictoRetencion) => string
  export interface MesRetencion {
    mes: number; recibos: string[]; gananciaNetaSujeta: number;
    esperado: number; retenido: number; diferencia: number;
    veredicto: VeredictoRetencion; cambioDeTablas: boolean;
  }
  export type AvisoRetencion =
    | { tipo: "falta_recibo"; periodo: string; sac: boolean; hastaMes: number }
    | { tipo: "faltan_tablas"; desdeMes: number };
  export interface AjusteAnioAnterior { anio: number; monto: number }
  export type ResultadoRetencion =
    | { estado: "sin_recibos" }
    | { estado: "sin_tablas"; anio: number }
    | { estado: "calculado"; anio: number; meses: MesRetencion[]; avisos: AvisoRetencion[]; ajusteAnioAnterior: AjusteAnioAnterior | null };
  export const retencionGanancias: (payslips: PayslipDTO[], tablas?: ReadonlyMap<number, TablasAnio>) => ResultadoRetencion
  export const avisoRetencionTexto: (aviso: AvisoRetencion, anio: number) => string
  export const ajusteAnioAnteriorTexto: (ajuste: AjusteAnioAnterior, anio: number) => string
  ```
  - `tablas` tiene por defecto `TABLAS_GANANCIAS`.
  - `hastaMes` es el último mes de cobro calculado (0 si ninguno).
  - `recibos` son las etiquetas de los recibos cobrados ese mes: mensual `"Dic 2025"`, SAC `"SAC Jun 2026"` (con `monthLabel`).
  - `cambioDeTablas` es `true` en los meses 1 y 7.

**Tablas sintéticas para los tests** (fáciles de calcular a mano): una sola escala `[{ desde: 0, hasta: null, pagaran: 0, alicuota: 10 }]` para todos los meses, `gananciaNoImponible: 100 × mes`, `deduccionEspecial: 1100 × mes`, `topeHipotecarioAnual: 1200`, cargadas para 2026 en `new Map([[2026, …]])`. Con eso, deducciones del mes `m` = (100m + 1100m) × 13/12 + 1200 × m / 12 = **1400m**. Un recibo mensual sintético: remunerativo `12000`, aporte `0403: 1200`, retención `0430` configurable. Así el impuesto esperado acumulado sin SAC distinto da **1030 × m**.

- [ ] **Step 1: Write the failing tests**

`describe("mesDeCobro")`:
- `"2025-12"` mensual → `{ anio: 2026, mes: 1 }`; `"2026-05"` mensual → `{ anio: 2026, mes: 6 }`; `"2026-06"` sac → `{ anio: 2026, mes: 6 }`; `"2026-12"` sac → `{ anio: 2026, mes: 12 }`.

`describe("impuestoSegunEscala")` con `TABLAS_GANANCIAS.get(2026)!.meses[0].escala`:
- `1000000` → `toBeCloseTo(128332.41, 2)`; `166669.17` → `toBeCloseTo(8333.46, 2)`; `6000000` → `toBeCloseTo(1550825.07, 2)`; `0` y `-500` → `0`.

`describe("veredictoRetencion")`:
- `(10, 1000)` → `"coincide"` (borde incluido); `(10.01, 1000)` → `"de_mas"`; `(-10.01, 1000)` → `"de_menos"`; `(0, 0)` → `"coincide"`; `(50, 0)` → `"de_mas"` (Review Focus).

`describe("retencionGanancias")` con las tablas sintéticas:
- `it("sin recibos")` → `{ estado: "sin_recibos" }`.
- `it("doceavas: el SAC de junio reemplaza las doceavas")`: mensuales de `2025-12` a `2026-06`, SAC `2026-06` con remunerativo `6000` y `0403: 600`, y `0430: 1030` en cada mensual (en el SAC `0`). `meses.map(m => m.esperado)` → `[1030, 2060, 3090, 4120, 5150, 6180, 7210]`, todos `"coincide"`.
- `it("un SAC distinto de seis doceavas cambia junio")`: lo mismo con SAC `9000` y `0403: 900`. `meses[5].esperado` → `6450` y `meses[6].esperado` → `7480`.
- `it("cuenta la devolución con su signo y deja afuera el 0446")`: agregar `0433: -500` y `0446: -3000` al recibo `2026-03`. `meses[3].retenido` baja 500 respecto del caso base. `ajusteAnioAnterior` → `{ anio: 2025, monto: -3000 }`.
- `it("hueco a mitad de año: calcula hasta el mes anterior y avisa")`: sin el recibo `2026-02` y con recibos hasta `2026-04`. `meses.length` → `2`, `avisos` → `[{ tipo: "falta_recibo", periodo: "2026-02", sac: false, hastaMes: 2 }]`.
- `it("SAC de junio sin el sueldo de mayo es un hueco en junio")` (Review Focus): recibos `2025-12`…`2026-04`, SAC `2026-06` y sin `2026-05`. `meses.length` → `5`, aviso `{ periodo: "2026-05", sac: false, hastaMes: 5 }`.
- `it("falta el SAC de junio")`: recibos hasta `2026-06` mensual, sin SAC. `meses.length` → `5`, aviso `{ periodo: "2026-06", sac: true, hastaMes: 5 }`.
- `it("hueco en enero: ningún mes calculable")` (Review Focus): sin `2025-12`. `estado: "calculado"`, `meses` → `[]`, aviso con `hastaMes: 0`.
- `it("el mes en curso sin cobrar no es hueco")`: recibos `2025-12`…`2026-03`. `meses.length` → `4`, `avisos` → `[]`.
- `it("faltan tablas desde julio")`: tablas sintéticas con solo 6 meses y recibos hasta `2026-07` más el SAC de junio. `meses.length` → `6`, avisos → `[{ tipo: "faltan_tablas", desdeMes: 7 }]`.
- `it("el sueldo de diciembre pasa al año siguiente")` (Review Focus): recibos de 2026 más `2026-12` mensual. → `{ estado: "sin_tablas", anio: 2027 }`.
- `it("ganancia neta negativa da impuesto 0")`: remunerativo `100`, `0430: 0`. Todos los `esperado` → `0`, veredicto `"coincide"`.
- `it("marca cambio de tablas en enero y julio")`: `meses.filter(m => m.cambioDeTablas).map(m => m.mes)` → `[1, 7]`.
- `it("etiqueta los recibos de cada mes")`: `meses[5].recibos` → `["May 2026", "SAC Jun 2026"]`.

`describe("textos")`:
- `avisoRetencionTexto({ tipo: "falta_recibo", periodo: "2026-03", sac: false, hastaMes: 3 }, 2026)` → `"Falta el recibo de marzo 2026: la cuenta llega hasta marzo."`
- `ajusteAnioAnteriorTexto({ anio: 2025, monto: -3000 }, 2026)` → `` `Ajuste de la liquidación anual 2025: ${formatMoney(-3000, "ARS")} (no entra en la cuenta de 2026)` ``. El esperado se arma con `formatMoney`, porque `Intl` mete un espacio duro entre `$` y el número.
- Los textos de `sac: true`, `hastaMes: 0` y `faltan_tablas` los decide quien implementa, en el mismo tono, y se testean como mínimo con `toContain` del período o del mes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run client/src/gananciasRetencion.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `client/src/gananciasRetencion.ts`**

El algoritmo lo fija la sección «Cómo calcula el empleador» del spec (pasos 1 a 11). Lo que no determinan las firmas:

```
anio = max(mesDeCobro(p).anio) de todos los recibos
tablasAnio = tablas.get(anio) ?? → sin_tablas
delAnio = recibos con mesDeCobro.anio === anio
ultimoCobro = max(mesDeCobro.mes) de delAnio
para m = 1..ultimoCobro:
  si m > tablasAnio.meses.length → aviso faltan_tablas { desdeMes: m }, cortar
  requeridos(m) = mensual del período anterior (m=1 → diciembre de anio-1) + SAC si m ∈ {6, 12}
  si falta alguno → aviso falta_recibo { periodo, sac, hastaMes: m - 1 }, cortar
  cobrados = recibos de delAnio con mes ≤ m
  ultimoSac = max mes de cobro de los SAC cobrados (0 si ninguno)
  bruto   = Σ remunerativo de todos los cobrados + Σ remunerativo/12 de los mensuales con mes > ultimoSac
  aportes = ídem con sumarConceptos(·, CODIGOS_APORTES_DEDUCIBLES)
  base    = gananciaNoImponible + deduccionEspecial del mes m
  gns     = bruto − aportes − base − base/12 − topeHipotecarioAnual × m / 12
  esperado = impuestoSegunEscala(escala del mes m, gns)
  retenido = Σ sumarConceptos(·, CODIGOS_RETENIDO) de los cobrados
ajusteAnioAnterior = Σ 0446 de delAnio (null si da 0)
```

Si hay más de un hueco, se avisa solo el primero. `remunerativo` sale del campo `payslip.remunerativo`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run client/src/gananciasRetencion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/gananciasRetencion.ts client/src/gananciasRetencion.test.ts
git commit -m "feat(ganancias): cálculo acumulado de la retención esperada"
```

---

### Task 4: Sección «Retención de Ganancias»

**Files:**
- Create: `client/src/components/GananciasVeredictoChip.tsx`
- Create: `client/src/components/GananciasRetentionTable.tsx`
- Create: `client/src/components/GananciasRetentionCards.tsx`
- Create: `client/src/components/GananciasRetentionSection.tsx`
- Test: `client/src/components/GananciasRetentionSection.test.tsx`

**Interfaces:**
- Consumes: `ResultadoRetencion`, `MesRetencion`, `VeredictoRetencion`, `veredictoRetencionLabel`, `avisoRetencionTexto`, `ajusteAnioAnteriorTexto` (Task 3); `Kpi`, `KpiGrid` (`cardCount={3}`), `RecordCard`, `recordListSx`, `useIsMobile`, `formatMoney`.
- Produces: `export const GananciasRetentionSection = ({ resultado }: GananciasRetentionSectionProps)` con `interface GananciasRetentionSectionProps { resultado: ResultadoRetencion }`.

Comportamiento:
- `sin_recibos` → `null`.
- `sin_tablas` → título «Retención de Ganancias <año>» y el texto «Faltan las tablas de ARCA de <año>».
- `calculado`: un `Accordion` como `SalaryRaisesSection`. El summary dice «Retención de Ganancias <año>» y, si hay meses, el `GananciasVeredictoChip` del último mes (visible sin expandir). Adentro van:
  - los avisos (`Alert severity="warning"`) y la línea del ajuste del año anterior;
  - si hay meses: tres `Kpi` del último mes («Impuesto esperado acum.», «Retenido acum.», «Diferencia») y la tabla o las tarjetas.
  - Columnas: «Mes de cobro», «Sueldos», «Ganancia neta sujeta acum.», «Esperado acum.», «Retenido acum.», «Diferencia», veredicto.
  - En los meses con `cambioDeTablas`, una etiqueta visible «Cambio de tablas» con `Tooltip`: «El empleador suele aplicar las tablas nuevas de ARCA un mes tarde y corregir al mes siguiente.»
- Colores del chip: `coincide` success, `de_mas` warning, `de_menos` error (variant outlined, como `SalaryRaiseChip`).
- En mobile, `GananciasRetentionCards` con un `RecordCard` por mes (título = nombre del mes de cobro).

- [ ] **Step 1: Write the failing tests**

Con `renderWithProviders` y `ResultadoRetencion` armados a mano (sin pasar por el cálculo), `afterEach(cleanup)`:
- `it("sin recibos no muestra nada")`: `queryByText(/Retención de Ganancias/)` → null.
- `it("sin tablas avisa")`: `getByText("Faltan las tablas de ARCA de 2027")`.
- `it("muestra el veredicto del último mes sin expandir")`: con dos meses y el último `de_mas`, aparecen `getByText("Retención de Ganancias 2026")` y `getByText("Te retienen de más")`.
- `it("al expandir muestra la tabla con el cambio de tablas en enero")`: click en el summary, `getByRole("table")` tiene 2 filas de datos y `getByText("Cambio de tablas")`.
- `it("muestra avisos y el ajuste del año anterior")`: textos de `avisoRetencionTexto` y de `ajusteAnioAnteriorTexto`.
- `it("sin meses calculables muestra solo el aviso")` (Review Focus): `meses: []` con un aviso `hastaMes: 0`. Después de expandir aparece el aviso y no hay `table` ni «Impuesto esperado acum.».
- `describe("mobile")` con `beforeEach(() => emulateMobile())`: `it("muestra tarjetas y el veredicto")` (Review Focus). No hay `table`, hay `article` por mes y el chip del summary sigue visible.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run client/src/components/GananciasRetentionSection.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar los cuatro componentes** según «Comportamiento». Filtros, mapeos y condicionales van antes del `return`; los estados `sin_recibos` y `sin_tablas` se resuelven con early returns.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run client/src/components/GananciasRetentionSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/GananciasVeredictoChip.tsx client/src/components/GananciasRetentionTable.tsx client/src/components/GananciasRetentionCards.tsx client/src/components/GananciasRetentionSection.tsx client/src/components/GananciasRetentionSection.test.tsx
git commit -m "feat(client): sección de retención de Ganancias"
```

---

### Task 5: Integración en la página Sueldo y verificación

**Files:**
- Modify: `client/src/pages/PayslipsPage.tsx` (imports, el `useMemo` y debajo de `<SalaryRaisesSection … />`)
- Test: `client/src/pages/PayslipsPage.test.tsx`

**Interfaces:**
- Consumes: `retencionGanancias` (Task 3), `GananciasRetentionSection` (Task 4).

- [ ] **Step 1: Write the failing test**

En `PayslipsPage.test.tsx`, dentro de `describe("PayslipsPage")`:
- `it("muestra la retención de Ganancias del año del último recibo aunque el filtro sea otro año")`: `renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=2019" })` → `findByText("Retención de Ganancias 2026")`. Con el mock actual, el último recibo `2026-03` se cobra en abril de 2026.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/PayslipsPage.test.tsx`
Expected: FAIL en el test nuevo; el resto PASS.

- [ ] **Step 3: Integrar**

`const retencion = useMemo(() => retencionGanancias(payslips), [payslips]);` y `<GananciasRetentionSection resultado={retencion} />` después de `<SalaryRaisesSection … />`. Se usan todos los `payslips`, no `inYears`.

- [ ] **Step 4: Suite completa y typecheck**

Run: `bunx vitest run client shared && bun run typecheck`
Expected: todo PASS, typecheck sin errores.

- [ ] **Step 5: Verificación contra los recibos reales (solo lectura, fuera del repo)**

Script descartable en el scratchpad de la sesión. Lee los recibos de Atlas con `find` (nunca escribe, `autoIndex` apagado, `dbName: "ledgerly"`, `ATLAS_URL` del `.env` del árbol principal). Los mapea a la forma de `PayslipDTO` (`periodo`, `tipo`, `conceptos`, `remunerativo`) e importa `retencionGanancias` del worktree con `bunx tsx --conditions=source`.
Expected: `estado: "calculado"`, `anio: 2026`. En cada mes salvo 1 y 7, `Math.abs(diferencia) ≤ 0.01 × esperado`; en los meses 1 y 7, la diferencia es positiva. Si no se cumple, no se cierra: se revisa contra el spec. Los números no se copian a ningún commit ni texto de GitHub.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/PayslipsPage.tsx client/src/pages/PayslipsPage.test.tsx
git commit -m "feat(client): retención de Ganancias en la página Sueldo"
```
