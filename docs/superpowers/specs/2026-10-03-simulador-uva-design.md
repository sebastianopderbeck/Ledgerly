# Simulador de precancelación del crédito UVA — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)

## Objetivo

Sumar a la página **Créditos** una tarjeta **«Simulador de precancelación»** que conteste una pregunta concreta: *si hoy adelanto $X del crédito UVA, ¿cuánto me ahorro?* El usuario ingresa un monto en pesos, elige **reducir plazo** o **reducir cuota**, y ve al instante:

- el **capital en UVA** que cancela y qué parte del saldo representa;
- los **intereses que se ahorra**, en UVA y en pesos de hoy;
- **cuántas cuotas menos** paga (reducir plazo) o **cuánto baja la cuota** (reducir cuota);
- qué dice el **veredicto de Contexto** sobre adelantar capital frente a comprar dólares o quedarse en pesos.

Todo se calcula en el cliente con funciones puras sobre datos que la API ya expone. No se persiste nada y no hay endpoints nuevos.

## Lo que ya trae la base (`feat/base-nuevas-features`)

La base del lote (`2026-10-03-base-nuevas-features-design.md`) unificó dos helpers que la primera versión de este diseño definía como propios. El simulador usa los de la base y no crea copias:

- **`parseMoneyInput(text)`** de `client/src/moneyInput.ts`, en lugar de `parseMontoPesos`. Lee el mismo formato argentino (`"5.000.000"`, `"5000000"` y `"$ 1.500.000,50"` → 1500000.5; `""` y `"abc"` → `null`), con dos diferencias decididas en la base:
  - **Acepta `"0"`** (devuelve 0). Por eso `simularPrecancelacion` trata `montoPesos <= 0` como inválido y devuelve `null`.
  - **`"1.5"` se lee 1,5**, no 15: sin coma, solo los puntos agrupados de a tres son de miles. Para el simulador da igual: 1,5 pesos es un monto válido que no mueve nada.
  - El parser ya tiene sus tests en `moneyInput.test.ts`: el simulador no los repite.
- **`formatSignedPercent(value)`** de `client/src/format.ts`, en lugar de `signedPercent`. Redondea a un decimal, usa «+» o «−» (U+2212) y deja el cero sin signo.

No hay API, DTOs ni hooks nuevos: se usan `useCreditSummary()` y `useMacroSeries()` tal como están en `client/src/api/hooks.ts`. Con 204 (no hay cupones), `apiFetch` devuelve `undefined` y React Query 5 deja `useCreditSummary` en `isError` con `data` `undefined`: la tarjeta no se monta.

## Decisiones tomadas

- **Las dos modalidades.** `computeCreditProgress` modela el crédito con sistema francés, tasa real fija y cuota pura constante en UVA. En ese modelo, precancelar admite tanto reducir plazo (misma cuota, menos cuotas) como reducir cuota (mismo plazo, cuota más baja). Se ofrecen las dos con un `ToggleButtonGroup`. Por defecto va **Reducir plazo**, que es la que más intereses ahorra.
- **Cálculo en el cliente, sin API nueva.** Todo lo necesario ya viaja en `CreditSummaryDTO` (`capitalPendienteUva`, `cuotaPuraUva`, `tasaRealMensual`, `cuotasPagadas`, `cuotasTotales`, `cotizacionUvaActual`) y en `MacroSeriesDTO` (`hoy.uva`, más `meses` para el veredicto). El simulador recalcula en cada tecla; con un endpoint haría falta un request por cambio. Es el mismo reparto que Contexto: el server sirve los datos y el cliente los combina (`macroSignals.ts`).
- **La tasa es `tasaRealMensual`, no la TEA del cupón.** Es la `i` con la que `computeCreditProgress` deriva el saldo (`capitalPendienteUva = interesUva / i − capitalUva`) y la misma que usa el veredicto (`retornoAdelantar`). Si se usaran `tea` o `tna` del cupón, el cuadro quedaría inconsistente con el saldo. Entre la TEA del cupón y `(1 + i)¹² − 1` hay centésimas de diferencia.
- **«Pesos de hoy» = UVA × cotización UVA de hoy.** La cotización sale de `hoy.uva` de `/api/macro/series`, que es el último dato diario de la serie `uva`. Si no hay series macro, se usa `cotizacionUvaActual` del último cupón y la tarjeta lo aclara. Con esa misma cotización se pasa a UVA el monto ingresado, porque el banco toma la UVA del día del pago.
- **La tarjeta espera a las series macro.** Mientras `useMacroSeries` carga, la tarjeta no se muestra; si la query falla o no hay series, sigue con la UVA del último cupón. Así no parpadea el aviso de «cotización del último cupón» ni el «Cargá las series macro» durante el primer render.
- **Los intereses ahorrados no se descuentan.** Son la suma de las UVA de interés que se dejan de pagar, valuadas a la UVA de hoy. Como la UVA sigue a la inflación, el monto queda en poder adquisitivo de hoy, pero no descuenta el tiempo: ese ahorro se reparte en años. La tarjeta lo aclara y, como rendimiento comparable, muestra la tasa real del crédito, que es la que usa el veredicto.
- **El veredicto usa los supuestos por defecto.** Los supuestos de Contexto viven en un `useState` de `MacroPage` y no se persisten, así que el simulador usa `defaultAssumptions(series)`. Lo dice una leyenda, y hay un link «Ver Contexto».
- **Empate con la misma regla que el veredicto.** «Adelantar» empata con el líder si queda a menos de `EMPATE_PP` (diferencia estrictamente menor), igual que el resumen de `buildVerdict`.
- **Se usa el saldo del último cupón importado, sin proyectar.** Si faltan importar cupones recientes, el saldo queda un poco alto. No se proyectan las cuotas que no se importaron: la tarjeta dice «después de la cuota N» para que se note.
- **El cálculo no incluye la comisión de precancelación.** La normativa del BCRA permite cobrarla mientras no haya pasado un cuarto del plazo original o 180 días, lo que sea mayor. En vez de sumar un campo, la tarjeta avisa hasta qué cuota puede aplicar.
- **Monto tipeado que no sirve.** Si el campo tiene texto pero no da un monto mayor a cero («abc», «0», «-5»), el `TextField` se marca en error con «Ingresá un monto mayor a cero, por ejemplo 5.000.000.». Con el campo vacío se muestra la ayuda normal, sin error.
- **Montos a medio tipear.** El simulador recalcula en cada tecla, y al escribir «20.000.000» pasan por el campo «20.», «20.000.0» y «20.000.00», que `parseMoneyInput` rechaza. Para que el campo no parpadee en rojo ni desaparezcan los tiles, `leerMontoTipeado(texto)` envuelve al parser de la base: descarta un separador final («20.» → 20) y, si el parser igual rechaza un texto hecho solo de dígitos y puntos, toma los puntos como de miles («20.000.0» → 200000). Lo que el parser acepta no cambia («1.5» sigue siendo 1,5).
- **La ayuda del campo muestra las UVA pedidas**, no las canceladas: con un monto mayor al saldo dice cuántas UVA compra el monto completo, y el aviso de cancelación total explica el sobrante. Para eso el resultado suma `montoUva`.
- **El filtro de año no aplica.** El simulador describe el estado actual del crédito, igual que los KPIs de la página (regla de `2026-10-02-filtro-anio-global-design.md`). El link «Ver Contexto» conserva los filtros globales con `useNavSearch()`.
- **Ubicación.** La tarjeta va entre `CreditKpiCards` y la grilla de gráficos. Usa el mismo saldo que el KPI «Capital pendiente» y se ve sin tener que bajar por los cinco gráficos.
- **Sin gráfico.** Los cuatro números contestan la pregunta. Una curva de saldo con y sin adelanto queda fuera de alcance.
- **Datos listos en una función pura.** `prepararSimulador(credito, series)` junta cuadro base, UVA de hoy, veredicto y aviso de comisión, y devuelve `null` si falta algo. El hook queda en estado + memo, y la tarjeta hace un solo early return.

## Datos

No se agregan colecciones ni campos. La cadena completa es:

| Origen | Archivo | Campos usados |
|---|---|---|
| Colección `MortgageCoupon` | `server/src/db/models.ts` | `cuotaNro`, `capital`, `intereses`, `cuotaPuraUva`, `cotizacionUva`, `tna` (entrada de `computeCreditProgress`) |
| `computeCreditProgress(coupons)` | `server/src/stats/amortization.ts` | sin cambios |
| `GET /api/credits/summary` → `CreditSummaryDTO` | `server/src/http/routes/credits.ts`, `shared/src/dtos.ts` | `capitalPendienteUva`, `cuotaPuraUva`, `tasaRealMensual`, `cuotasPagadas`, `cuotasTotales`, `cotizacionUvaActual` |
| Colección `MacroSeries` (`serie: "uva"`) + `InflationRate` | `server/src/db/models.ts` | vía `buildMonthlySeries` (`server/src/stats/macroSeries.ts`) |
| `GET /api/macro/series` → `MacroSeriesDTO` | `server/src/http/routes/macro.ts` | `hoy.uva`; `meses[]` y `hoy` completos para `buildVerdict` |

Los hooks ya existen en `client/src/api/hooks.ts`: `useCreditSummary()` (`data` `undefined` cuando el server responde 204 porque no hay cupones) y `useMacroSeries()`.

**Huecos y meses sin datos**

- Los cupones salteados no afectan al simulador. `capitalPendienteUva` sale solo del último cupón y es auto-consistente. Los huecos solo afectan a `capitalAmortizadoUva`, que el simulador no usa.
- Si hay meses sin importar después del último cupón, el saldo es el de «después de la cuota `cuotasPagadas`» (ver Decisiones).
- Si la serie `uva` no tiene datos (`hoy.uva === null` o series no cargadas), se usa `cotizacionUvaActual`.
- Si `meses` está vacío, `buildVerdict` devuelve el ranking vacío y el simulador muestra el retorno de adelantar sin compararlo.

## Cálculo

Va en un módulo nuevo, **`client/src/uvaPrepayment.ts`**: puro (sin React ni red) y con el mismo estilo que `macroSignals.ts`. No define parser de montos ni formateo de porcentajes con signo: usa `parseMoneyInput` (desde el hook) y `formatSignedPercent`.

### Tipos

```ts
export type ModoPrecancelacion = "plazo" | "cuota";

export interface CuadroRestante {
  cuotas: number;
  interesUva: number;
  ultimaCuotaUva: number;
}

export interface UvaDeHoy {
  valor: number;
  fuente: "hoy" | "ultimoCupon";
}

export type CreditoSimulable = Pick<CreditSummaryDTO, "capitalPendienteUva" | "cuotaPuraUva" | "tasaRealMensual">;

export interface PrecancelacionInput {
  credito: CreditoSimulable;
  montoPesos: number;
  uvaHoy: number;
  modo: ModoPrecancelacion;
}

export interface PrecancelacionResultado {
  modo: ModoPrecancelacion;
  cancelaTodo: boolean;
  montoUva: number;
  capitalCanceladoUva: number;
  porcentajeDelSaldo: number;
  sobrantePesos: number;
  interesAhorradoUva: number;
  interesAhorradoPesos: number;
  cuotasRestantes: number;
  cuotasNuevas: number;
  cuotasMenos: number;
  cuotaNuevaUva: number;
  bajaCuotaUva: number;
  bajaCuotaPesos: number;
  ultimaCuotaUva: number;
}

export interface SimuladorTile {
  id: "capital" | "intereses" | "cuotas" | "cuota";
  label: string;
  value: string;
  sub: string;
}

export interface LecturaVeredicto {
  estado: "mejor" | "superado" | "sinComparar";
  texto: string;
}

export interface SimuladorDatos {
  credito: CreditSummaryDTO;
  base: CuadroRestante;
  uva: UvaDeHoy;
  veredicto: LecturaVeredicto;
  comisionHastaCuota: number | null;
}
```

### `cuadroRestante(saldoUva, tasaMensual, cuotaUva): CuadroRestante | null`

Recorre mes a mes, en UVA, el cuadro francés que falta pagar:

```
cuotas = 0, interes = 0, ultima = 0
mientras saldo > 0:
  int   = saldo × i
  amort = P − int                       → si amort ≤ 0: null (la cuota no cubre el interés)
  pago  = P
  si saldo − amort < RESIDUO × P:       → amort = saldo; pago = int + saldo
  saldo −= amort; cuotas += 1; interes += int; ultima = pago
  si cuotas > MAX_CUOTAS: null
```

- `RESIDUO = 0.01`. Un remanente menor al 1 % de una cuota se suma a la cuota actual, en vez de generar una cuota fantasma de centavos. Con el saldo que deriva `computeCreditProgress`, el cuadro base da exactamente `cuotasTotales − cuotasPagadas`. Se verificó al diseñar contra `server/src/testing/couponFixtures.ts`: 229 = 240 − 11. Sin esa absorción aparecería una cuota 230 de décimas de UVA.
- `MAX_CUOTAS = 600` (50 años) corta cualquier dato absurdo.
- También devuelve `null` si `!(saldoUva > 0)`, `!(tasaMensual > 0)` o `!(cuotaUva > 0)`.
- Se recorre el cuadro en vez de usar la fórmula cerrada `n = −ln(1 − B·i/P) / ln(1 + i)` porque así salen directo la última cuota parcial y el interés total, y se lee igual que el cuadro del banco. Son a lo sumo 600 iteraciones.

### `simularPrecancelacion(input): PrecancelacionResultado | null`

```
base        = cuadroRestante(B, i, P)      → null si base es null, !(montoPesos > 0) o !(uvaHoy > 0)
montoUva    = montoPesos / uvaHoy
cancelaTodo = montoUva ≥ B − 0,01
A           = cancelaTodo ? B : montoUva    (capitalCanceladoUva)
saldoNuevo  = B − A
porcentajeDelSaldo = A / B
sobrantePesos      = cancelaTodo ? max(0, montoPesos − B × uvaHoy) : 0
cuotasRestantes    = base.cuotas
```

`montoPesos <= 0` es inválido aunque `parseMoneyInput("0")` devuelva 0.

**Cancelación total** (`cancelaTodo`, en cualquier modo): `cuotasNuevas = 0`, `cuotasMenos = base.cuotas`, `interesAhorradoUva = base.interesUva`, `cuotaNuevaUva = 0`, `bajaCuotaUva = P`, `ultimaCuotaUva = 0`.

**Reducir plazo** (`modo: "plazo"`): misma cuota, menos cuotas.

```
nuevo              = cuadroRestante(saldoNuevo, i, P)
cuotasNuevas       = nuevo.cuotas
cuotasMenos        = base.cuotas − nuevo.cuotas
interesAhorradoUva = base.interesUva − nuevo.interesUva
cuotaNuevaUva      = P,  bajaCuotaUva = 0
ultimaCuotaUva     = nuevo.ultimaCuotaUva
```

**Reducir cuota** (`modo: "cuota"`): mismo plazo, cuota proporcional al saldo.

```
f                  = saldoNuevo / B
cuotasNuevas       = base.cuotas,  cuotasMenos = 0
cuotaNuevaUva      = P × f
bajaCuotaUva       = P − cuotaNuevaUva
interesAhorradoUva = base.interesUva × (1 − f)
ultimaCuotaUva     = base.ultimaCuotaUva × f
```

Con `i` y `n` fijos, la cuota francesa es lineal en el saldo (`P = B·i / (1 − (1+i)⁻ⁿ)`), y también lo es cada interés del cuadro. La regla del residuo escala igual, porque los dos lados de la comparación se multiplican por `f`. Por eso escalar por `f` es exacto y respeta la cuota real del banco aunque `B` y `n` vengan redondeados. Recalcular con la fórmula de anualidad podría mover la cuota base unas centésimas.

**Pesos de hoy:** `interesAhorradoPesos = interesAhorradoUva × uvaHoy` y `bajaCuotaPesos = bajaCuotaUva × uvaHoy`. No se redondea nada: el redondeo queda para el formato.

Los tests garantizan una propiedad: para un mismo monto, reducir plazo ahorra más interés que reducir cuota, porque el capital se devuelve antes.

### Funciones de apoyo (mismo módulo)

- `leerMontoTipeado(texto: string): number | null` — `parseMoneyInput` sobre el texto sin espacios en los bordes ni separador final; si da `null` y el texto es solo dígitos y puntos (con un `$` opcional adelante), los dígitos sin puntos. `"20."` → 20, `"20.000.0"` → 200000, `"1.500.000,"` → 1500000, `"1.5"` → 1,5, `"0"` → 0, `"abc"` y `"-5"` → `null`. No valida el mínimo: eso lo hace `simularPrecancelacion`.
- `uvaDeHoy(series: MacroSeriesDTO | undefined, credito: Pick<CreditSummaryDTO, "cotizacionUvaActual">): UvaDeHoy` — si `series?.hoy.uva > 0`, devuelve `{ valor, fuente: "hoy" }`; si no, `{ valor: cotizacionUvaActual, fuente: "ultimoCupon" }`.
- `comisionPosibleHastaCuota(credito: Pick<CreditSummaryDTO, "cuotasPagadas" | "cuotasTotales">): number | null` — calcula `hasta = max(ceil(cuotasTotales / 4), 6)`. Devuelve `hasta` si `cuotasPagadas < hasta`, y `null` si no.
- `duracion(meses: number): string` — `54` → «4 años y 6 meses», `12` → «1 año», `1` → «1 mes», `13` → «1 año y 1 mes», `24` → «2 años».
- `resultadoTiles(resultado: PrecancelacionResultado): SimuladorTile[]` — arma los textos de los tres tiles (ver UI), así el JSX solo mapea.
- `lecturaVeredicto(verdict: MacroVerdict | null, retornoReal: number): LecturaVeredicto` (`retornoReal` es el de adelantar, en % anual):
  - `sinComparar`: `verdict` es `null` o el ranking no tiene la opción `adelantar`.
  - `mejor`: `adelantar` está 1º, o a menos de `EMPATE_PP` del 1º (constante ya exportada de `macroSignals.ts`).
  - `superado`: cualquier otro caso; el texto nombra al líder.
  - Los porcentajes salen de `formatSignedPercent`.
- `prepararSimulador(credito: CreditSummaryDTO | undefined, series: MacroSeriesDTO | undefined): SimuladorDatos | null` — `null` sin crédito, sin cuadro base (`cuadroRestante` → `null`) o sin una UVA de hoy positiva. Si no, arma `base`, `uva` (con `uvaDeHoy`), `veredicto` (`series ? buildVerdict(series, credito, defaultAssumptions(series)) : null`, pasado a `lecturaVeredicto` con `retornoAdelantar(credito)`) y `comisionHastaCuota`.
- Textos de la tarjeta, para que el JSX no arme strings:
  - `textoSaldo(datos: SimuladorDatos): string` — «Saldo pendiente: {formatUva(B)} ≈ {formatMoney(B × uva)} · {base.cuotas} cuotas de {formatUva(P)} · después de la cuota {cuotasPagadas}.»
  - `textoAyudaMonto(resultado: PrecancelacionResultado | null, uva: UvaDeHoy, montoInvalido: boolean): string` — ver UI.
  - `textoCancelacionTotal(resultado: PrecancelacionResultado, uvaHoy: number): string` — ver UI.
  - `textoLetraChica(comisionHastaCuota: number | null): string` — ver UI.

En `client/src/macroSignals.ts` se **exporta** `retornoAdelantar(credit)`, que hoy es privada (el cuerpo no cambia). Así el simulador muestra exactamente el mismo número que la señal ③ y el veredicto.

### Casos borde

| Situación | Resultado |
|---|---|
| Sin cupones (`/credits/summary` → 204) | La página ya muestra su estado vacío; la tarjeta no se monta (`prepararSimulador` → `null`) |
| Series macro cargando | La tarjeta no se muestra todavía |
| `tasaRealMensual` ausente o ≤ 0, o una cuota que no cubre el interés | `cuadroRestante` → `null`; la tarjeta no se renderiza |
| Monto vacío | `simularPrecancelacion` no se llama; se muestra el texto guía, sin error |
| Monto 0, negativo o no numérico | Resultado `null`; texto guía y el campo en error |
| Monto ≥ saldo en pesos | `cancelaTodo`; aviso con el sobrante (si es de al menos $1) |
| Reducir plazo con un monto chico | `cuotasMenos = 0` y `ultimaCuotaUva < P`; el sub lo explica |
| Sin series macro o con `hoy.uva` null | UVA del último cupón y veredicto `sinComparar` |
| `meses` vacío | Ranking vacío → `sinComparar` |
| Ya pasó un cuarto del plazo | No se muestra el aviso de comisión |

## API

**No hay endpoints nuevos ni cambios de DTO.** La tarjeta consume:

- `GET /api/credits/summary` → `CreditSummaryDTO` (204 sin cupones), con `useCreditSummary()`.
- `GET /api/macro/series` → `MacroSeriesDTO`, con `useMacroSeries()` (staleTime de 1 h).

Ninguna de las dos depende del filtro de año.

## UI

### Componentes

- **`client/src/components/usePrepaymentSimulator.ts`** — hook que junta datos y estado.

  ```ts
  export interface PrepaymentSimulator {
    datos: SimuladorDatos | null;
    monto: string;
    setMonto: (value: string) => void;
    modo: ModoPrecancelacion;
    setModo: (modo: ModoPrecancelacion) => void;
    resultado: PrecancelacionResultado | null;
    montoInvalido: boolean;
  }
  export function usePrepaymentSimulator(): PrepaymentSimulator
  ```

  Usa `useCreditSummary()`, `useMacroSeries()`, `useState("")` para el monto y `useState<ModoPrecancelacion>("plazo")`. Con `useMemo` calcula `datos` (`null` mientras las series cargan; si no, `prepararSimulador(credito, series)`) y `resultado` (con `leerMontoTipeado(monto)` y `simularPrecancelacion`). `montoInvalido` es `monto.trim() !== "" && resultado === null`. No se persiste nada: al salir de la página se pierde.
- **`client/src/components/PrepaymentSimulatorCard.tsx`** — presentacional sobre el hook. Hace early return de `null` si `datos` es `null` (todos los hooks van antes). Los tiles y textos se arman antes del `return`, con `resultadoTiles`, `textoSaldo`, `textoAyudaMonto`, `textoCancelacionTotal` y `textoLetraChica`. Adentro tiene tres componentes privados: `SimuladorTileBox` (label, valor y sub, con `role="group"` y `aria-labelledby` apuntando al label; el valor va en un `<p>` para no sumar encabezados), `ResultadoSimulacion` (texto guía o aviso de cancelación + tiles, con early return sin resultado) y `VeredictoContexto` (el `Alert` del veredicto, con el botón en `action` en compu y debajo del texto en mobile). Los handlers del formulario van con `useCallback`, antes del early return.
- **`client/src/pages/CreditsPage.tsx`** — renderiza `<PrepaymentSimulatorCard />` entre `<CreditKpiCards />` y el `MotionBox` de gráficos.

### Contenido de la tarjeta, de arriba a abajo

`MotionBox` con `fadeUpItem` (como `VerdictCard`) → `Card` con `component="section"`, `aria-labelledby` apuntando al título (id con `useId()`) y `mb: 3` → `CardContent` con `compactCardContentSx`.

1. **Título** `h6`: «Simulador de precancelación». Debajo, en `body2` secundario: «Cuánto te ahorrás si adelantás capital hoy. No se guarda nada.»
2. **Saldo de referencia** (`caption`): `textoSaldo(datos)`.
3. **Formulario:**
   - `TextField` «Monto a adelantar», con `InputAdornment` «$» y `slotProps={{ htmlInput: { inputMode: "decimal" } }}`. El `helperText` (`textoAyudaMonto`):
     - sin monto válido: «En pesos. Se convierte a UVA con la cotización de hoy.»;
     - con texto que no es un monto mayor a cero: «Ingresá un monto mayor a cero, por ejemplo 5.000.000.» y el campo en `error`;
     - con un monto válido: «{formatUva(montoUva)} a {formatMoney(uva.valor)} por UVA», más « (cotización del último cupón)» si `uva.fuente === "ultimoCupon"`.
   - `ToggleButtonGroup` exclusivo con `aria-label="Qué reducir"`: «Reducir plazo» (`plazo`) · «Reducir cuota» (`cuota`). Un click sobre la opción ya elegida (`value === null`) se ignora, como en `MacroAssumptionsBar`.
4. **Resultado:**
   - Sin resultado: `Typography` secundario con «Ingresá un monto para ver cuánto te ahorrás.»
   - Con resultado: una grilla de tres tiles (`Box` con borde `divider` y `borderRadius: 2`; label en `overline`, valor en `h6` negrita, sub en `caption`), cada uno con `key={tile.id}`:

     | id | Label | Valor | Sub |
     |---|---|---|---|
     | `capital` | Capital que cancelás | `formatUva(capitalCanceladoUva)` | «{formatPercent(porcentajeDelSaldo × 100)} del saldo pendiente» |
     | `intereses` | Intereses que te ahorrás | `formatUva(interesAhorradoUva)` | «≈ {formatMoney(interesAhorradoPesos)} de hoy» |
     | `cuotas` (reducir plazo o cancelación total) | Cuotas menos | `String(cuotasMenos)` | «Terminás {duracion(cuotasMenos)} antes: quedan {cuotasNuevas} cuotas» («queda 1 cuota» en singular). Si `cuotasMenos = 0`: «No alcanza para una cuota entera: la última baja a {formatUva(ultimaCuotaUva)}». Si `cancelaTodo`: «Cancelás el crédito completo» |
     | `cuota` (reducir cuota) | Cuota nueva | `formatUva(cuotaNuevaUva)` | «Baja {formatUva(bajaCuotaUva)} ≈ {formatMoney(bajaCuotaPesos)} por mes» |

   - Si `cancelaTodo`, arriba de los tiles va un `Alert severity="success"` con `textoCancelacionTotal`: «Con este monto cancelás todo el crédito: alcanza con {formatMoney(B × uva)} y te sobran {formatMoney(sobrantePesos)}.» Si el sobrante es menor a $1, termina en «alcanza con {…}.».
5. **Relación con Contexto.** Un `Alert` (`success` si `estado === "mejor"`, `info` en los otros dos casos) con el `texto` de `lecturaVeredicto` y un botón «Ver Contexto» (`component={RouterLink}`, `to={{ pathname: "/contexto", search: useNavSearch() }}`) para que el año viaje. Se ve siempre, haya monto o no, porque el retorno de adelantar no depende del monto.
   - `mejor`: «Según Contexto, hoy adelantar capital es la opción que más rinde: +9,4% real anual, y es el único retorno cierto.» Si empata sin estar 1º: «Según Contexto, hoy adelantar capital empata con {líder en minúscula}: +9,4% real anual, y es el único retorno cierto.»
   - `superado`: «Según Contexto, hoy {líder en minúscula} rinde más (+X% real anual) que adelantar capital (+9,4%). Ese retorno depende de supuestos; el de adelantar es cierto.»
   - `sinComparar`: «Adelantar capital rinde +9,4% real anual, sea cual sea el monto, y es un retorno cierto. Cargá las series macro para compararlo con el dólar y los pesos.»
   - Debajo, salvo en `sinComparar`, una `caption`: «Ranking con los supuestos por defecto de Contexto.»
6. **Letra chica** (`caption` secundario, `textoLetraChica`): «Los intereses ahorrados suman lo que dejás de pagar, valuado a la UVA de hoy; no descuentan el paso del tiempo. El seguro de incendio no cambia.» Si `comisionHastaCuota !== null`, se agrega: « Hasta la cuota {n} el banco puede cobrar comisión por precancelar; no está incluida.»

### Compu

- El formulario va en una fila: `TextField` de 280px y al lado el `ToggleButtonGroup` horizontal.
- Los tiles usan `gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }` con `gap: 2`.
- El botón «Ver Contexto» va en el `action` del `Alert` del veredicto.

### Mobile (`useIsMobile()`)

- `TextField` y `ToggleButtonGroup` van `fullWidth`, en columna. El grupo queda horizontal, porque dos opciones entran en 390px. Cada `ToggleButton` lleva `tapTargetSx` (44px).
- `inputMode="decimal"` abre el teclado numérico del iPhone.
- Los tiles van en una sola columna.
- «Ver Contexto» sale del `action` del `Alert` y va debajo del texto, como `Button` `fullWidth` con `tapTargetSx`.
- No hace falta `BottomSheet`: no hay tabla ni edición de registros.

## Tests

- **`client/src/uvaPrepayment.test.ts`** — con un crédito **sintético**: `B = 100.000 UVA`, `i = 0,0075`, `P = B·i / (1 − 1,0075⁻²⁴⁰) ≈ 899,7260 UVA` y `uvaHoy = 2.000`.
  - `cuadroRestante(B, i, P)` → 240 cuotas e `interesUva ≈ 115.934,23` (= 240·P − B).
  - `cuadroRestante` → `null` con tasa 0, con saldo 0 y con cuota ≤ saldo × i. Absorbe un residuo menor al 1 % de la cuota: un saldo apenas mayor que el de 240 cuotas (`B + 1`) sigue dando 240; con `B + 5` ya hay una cuota 241.
  - Reducir plazo con $20.000.000 (10.000 UVA): `cuotasNuevas = 186`, `cuotasMenos = 54`, `interesAhorradoUva ≈ 38.895,86`, `interesAhorradoPesos ≈ 77.791.710,69` y `porcentajeDelSaldo = 0,1`.
  - Reducir cuota con el mismo monto: `cuotaNuevaUva ≈ 809,75`, `bajaCuotaUva ≈ 89,97`, `bajaCuotaPesos ≈ 179.945,19`, `interesAhorradoUva ≈ 11.593,42` y `cuotasMenos = 0`.
  - Con el mismo monto, reducir plazo ahorra más que reducir cuota.
  - Monto chico (100 UVA) en reducir plazo: `cuotasMenos = 0` y `ultimaCuotaUva ≈ 298,81`.
  - Con $300.000.000: `cancelaTodo`, `capitalCanceladoUva = B`, `montoUva = 150.000`, `cuotasMenos = 240`, `interesAhorradoUva = base.interesUva` y `sobrantePesos = 100.000.000`, igual en los dos modos.
  - Devuelve `null` con monto 0 (lo que da `parseMoneyInput("0")`), con monto negativo y con `uvaHoy` 0.
  - `leerMontoTipeado` con montos completos, a medio tipear («20.», «20.000.0», «1.500.000,»), «1.5», «0», «abc» y «-5».
  - `uvaDeHoy` con `hoy.uva`, con `hoy.uva = null` y sin series.
  - `comisionPosibleHastaCuota`: 10/250 → 63; 70/250 → `null`; 2/12 → 6.
  - `duracion` con 1, 12, 13, 24 y 54.
  - `resultadoTiles`: ids y labels por modo, y el sub cuando `cuotasMenos = 0`, cuando queda una sola cuota y cuando se cancela todo.
  - `lecturaVeredicto` con `MacroVerdict` armados a mano: adelantar 1º → `mejor`; 2º a menos de `EMPATE_PP` → `mejor` con «empata»; 2º lejos → `superado`, nombrando al líder; `null` y ranking sin `adelantar` → `sinComparar`.
  - `prepararSimulador`: `null` sin crédito y con tasa 0; con series usa `hoy.uva` y arma el veredicto; sin series usa la UVA del último cupón y queda `sinComparar`.
  - Textos: `textoSaldo`, `textoAyudaMonto` (las tres variantes y la aclaración del último cupón), `textoCancelacionTotal` (con y sin sobrante) y `textoLetraChica` (con y sin comisión).
- **`client/src/macroSignals.test.ts`** — `retornoAdelantar`, ya exportada: devuelve `((1 + i)¹² − 1) × 100` y `null` sin crédito.
- **`client/src/components/PrepaymentSimulatorCard.test.tsx`** — con `renderWithProviders` y `vi.stubGlobal("fetch", …)` ruteando `/credits/summary` (el crédito sintético de arriba con `cuotasPagadas: 10`, `cuotasTotales: 250`, `cotizacionUvaActual: 1900`) y `/macro/series` (`hoy.uva: 2000`). Lleva `afterEach(cleanup)`, porque en este repo el auto-cleanup de RTL está apagado.
  - Sin monto: el texto guía, el saldo «después de la cuota 10» y el aviso «Hasta la cuota 63».
  - Tipear «20.000.000»: «Cuotas menos» con 54 y «38.895,86 UVA».
  - Click en «Reducir cuota»: «Cuota nueva» con «809,75 UVA».
  - «300.000.000»: «cancelás todo el crédito».
  - «abc»: el campo queda inválido y se ve «Ingresá un monto mayor a cero».
  - «20.000.0» (a medio tipear): el campo no queda inválido y se ven los tiles.
  - Si `/macro/series` falla, la tarjeta igual se muestra con la cotización del último cupón.
  - Con `hoy.uva: null`, el helper text dice «cotización del último cupón».
  - El link «Ver Contexto» apunta a `/contexto?year=2026` cuando la ruta es `/credits?year=2026`.
  - Con summary 204 no hay `region` «Simulador de precancelación».
  - Mobile (`emulateMobile()`): los `ToggleButton` y «Ver Contexto» tienen `min-height:44px` (`cssFor`).
- **`client/src/pages/CreditsPage.test.tsx`** — el stub de `/credits/summary` suma `tasaRealMensual: 0.0074`. Hay que agregar una ruta para `/macro/series` (`{ desde: "2025-01", meses: [], hoy: { fecha: "2026-10-02", usdOficial: null, uva: 2075.56, tasa30: null } }`), porque hoy el stub devuelve `{}` para cualquier URL desconocida y `uvaDeHoy` fallaría. Se agrega un caso: la página muestra la `region` «Simulador de precancelación» después de los KPIs y antes de los gráficos, tanto en compu como en mobile. Y otro: con un summary sin `tasaRealMensual` (un server viejo), la página sigue mostrando los KPIs y no monta el simulador.

## Fuera de alcance

- Incluir la comisión de precancelación en el cálculo (solo se avisa).
- Proyectar las cuotas no importadas desde el último cupón.
- Gráfico de saldo con y sin adelanto, o el cuadro de amortización completo.
- Descontar los intereses ahorrados a valor presente (como medida comparable se muestra la tasa real).
- Varios adelantos programados (por ejemplo, uno por aguinaldo).
- Usar los supuestos editados en Contexto (no se persisten).
- Guardar simulaciones.
- Multi-crédito: como el resto de la página, usa el único crédito.
- Cambios en server, shared, API ni en los helpers de la base (`moneyInput.ts`, `format.ts`).

## Archivos

**Nuevos**

```
client/src/uvaPrepayment.ts
client/src/uvaPrepayment.test.ts
client/src/components/usePrepaymentSimulator.ts
client/src/components/PrepaymentSimulatorCard.tsx
client/src/components/PrepaymentSimulatorCard.test.tsx
docs/superpowers/specs/2026-10-03-simulador-uva-design.md
docs/superpowers/plans/2026-10-03-simulador-uva.md
```

**Modificados**

```
client/src/pages/CreditsPage.tsx        (monta la tarjeta después de CreditKpiCards)
client/src/pages/CreditsPage.test.tsx   (tasaRealMensual + ruta /macro/series + caso nuevo)
client/src/macroSignals.ts              (export de retornoAdelantar)
client/src/macroSignals.test.ts         (test de retornoAdelantar)
```

## Orden de implementación

1. **Motor:** `uvaPrepayment.ts` con su batería de tests, y el export de `retornoAdelantar`. No depende de la UI.
2. **UI:** `usePrepaymentSimulator`, `PrepaymentSimulatorCard` y sus tests.
3. **Página:** montar la tarjeta en `CreditsPage` y actualizar su test. Se verifica con `bun run test`, `bun run typecheck` y `bun run build`.
