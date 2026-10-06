# Simulador de precancelación del crédito UVA — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a Créditos una tarjeta «Simulador de precancelación» que, a partir de un monto en pesos y una modalidad (reducir plazo o reducir cuota), muestra el capital en UVA que se cancela, los intereses que se ahorran (en UVA y en pesos de hoy), cuántas cuotas menos o cuánto baja la cuota, y qué dice el veredicto de Contexto sobre adelantar capital.

**Architecture:** Todo el cálculo vive en un módulo puro nuevo, `client/src/uvaPrepayment.ts` (cuadro francés en UVA, simulación de las dos modalidades, lectura del veredicto y textos de la tarjeta), sobre datos que la API ya expone (`useCreditSummary`, `useMacroSeries`). `macroSignals.ts` exporta `retornoAdelantar` para que el simulador muestre el mismo número que el veredicto. Un hook (`usePrepaymentSimulator`) guarda monto y modo y memoriza datos y resultado; `PrepaymentSimulatorCard` es presentacional con un único early return, y `CreditsPage` la monta entre los KPIs y los gráficos. No hay cambios en server, shared, API ni en los helpers de la base.

**Tech Stack:** React 18 + MUI 6 + react-router 6 + React Query 5 (cliente); Vitest + Testing Library en jsdom; Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-simulador-uva-design.md`. Base del lote: `docs/superpowers/specs/2026-10-03-base-nuevas-features-design.md` (helpers `parseMoneyInput` y `formatSignedPercent`). Convenciones mobile: `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md`. Filtro de año: `docs/superpowers/specs/2026-10-02-filtro-anio-global-design.md`.

## Prerrequisitos

1. La rama es `feat/simulador-uva`, creada desde `feat/base-nuevas-features`, en el worktree de esta sesión. `bun install` ya corrido.
2. Verificar que la base trae lo que el plan usa, desde la raíz del worktree:

   ```bash
   grep -n "export function parseMoneyInput" client/src/moneyInput.ts
   grep -n "export function formatSignedPercent" client/src/format.ts
   grep -n "tasaRealMensual: z.number()" shared/src/dtos.ts
   grep -n "export const EMPATE_PP" client/src/macroSignals.ts
   grep -n "export function useNavSearch" client/src/components/layout/useNavSearch.ts
   grep -n "export const cssFor" client/src/testing/cssFor.ts
   ```

   Las seis tienen que dar resultado.
3. **No tocar**: `client/src/format.ts`, `client/src/moneyInput.ts`, `client/src/api/hooks.ts`, `client/src/App.tsx`, `client/src/components/layout/*`, `shared/*`, `server/*`, los `package.json`, `bun.lock`, `.env.example`, `README.md`. Importar desde ahí está bien; modificar, no.

## Ajustes respecto del spec

Decisiones de detalle tomadas al planificar; ya están volcadas en el spec:

- **`prepararSimulador(credito, series)`** junta en una función pura cuadro base, UVA de hoy, veredicto y aviso de comisión. El hook devuelve `datos: SimuladorDatos | null` en vez de cinco campos sueltos, y la tarjeta hace un solo early return.
- **`leerMontoTipeado(texto)`** envuelve a `parseMoneyInput` para los montos a medio tipear («20.», «20.000.0»): sin esto, el campo parpadea en rojo y los tiles desaparecen en cada punto de miles.
- **La tarjeta espera a las series macro** (`isLoading` de `useMacroSeries`) para no mostrar por un instante la cotización del último cupón ni el «Cargá las series macro».
- **`montoUva`** se suma al resultado para que la ayuda del campo muestre las UVA de todo el monto, también cuando supera el saldo.
- **Textos como funciones puras** (`textoSaldo`, `textoAyudaMonto`, `textoCancelacionTotal`, `textoLetraChica`), testeadas sin React.
- **Tiles accesibles**: cada uno es `role="group"` con `aria-labelledby` apuntando a su label; el valor va en un `<p>` (no un `h6`) para no llenar la página de encabezados.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits**: uno por task en `feat/simulador-uva`, con el mensaje del task, pathspec explícito y la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A` ni `git add .`. Nunca push, merge ni PR.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Hooks como `export function useX()`.
- Mapeos, filtros y condicionales complejos antes del `return`. Nunca usar el índice del array como `key` (los tiles usan `tile.id`, los modos `opcion.value`).
- Los hooks van antes de cualquier `return` temprano.
- **Helpers de la base**: `parseMoneyInput` (nunca un `parseMontoPesos` propio) y `formatSignedPercent` (nunca un `signedPercent` propio). El cliente importa solo **tipos** de `@ledgerly/shared`.
- **Mínimo del monto**: `montoPesos <= 0` es inválido en `simularPrecancelacion` (la base acepta `"0"`).
- **Corte mobile: `< md` (900px)** vía `useIsMobile()`. En mobile, cada `ToggleButton` y «Ver Contexto» llevan `tapTargetSx` (44px).
- Tests de cliente con más de un render llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado). Los que stubean globals llaman `vi.unstubAllGlobals()` en `afterEach`.
- `formatMoney` separa `$` con un espacio no separable. `getByText` normaliza los espacios del DOM pero no los del string esperado: un texto armado con `formatMoney` se compara pasándolo por `texto.replace(/\s+/g, " ")` (`comoSeLee` en el test de la tarjeta).
- Fixtures **sintéticos**: nada de `examples/`.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Copy en español rioplatense, exacto como en el spec.
- Comandos (desde la raíz del worktree): `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Montos escritos como los escribe una persona**: al tipear «20.000.000» tecla por tecla el campo pasa por «20.», «20.000.0» y «20.000.00»; no tiene que ponerse en rojo ni hacer desaparecer los tiles. «0», «abc» y «-5» sí marcan error. «1.5» es 1,5 pesos: válido, no mueve nada. → tests de `leerMontoTipeado` en Task 2, «un monto chico pero válido» en Task 1 y «a medio tipear no marca error» en Task 3.
2. **Un monto justo en el saldo o apenas por encima**: cancela todo sin sobrante negativo y el aviso no dice «te sobran $ 0,00». → «a un centésimo de UVA del saldo ya cancela todo» en Task 1 y `textoCancelacionTotal` sin sobrante en Task 2.
3. **Series macro que no llegan** (error 500, `hoy.uva` null, todavía cargando): la tarjeta igual funciona con la UVA del último cupón y lo aclara; no parpadea mientras carga. → `prepararSimulador` sin series en Task 2; «si /macro/series falla» y «sin UVA de hoy» en Task 3.
4. **Datos del crédito degenerados** (tasa 0, `tasaRealMensual` ausente por un server viejo, cuota que no cubre el interés): la tarjeta no se monta y la página no se rompe. → `cuadroRestante` con `NaN` en Task 1, `prepararSimulador` en Task 2 y «sin tasaRealMensual» en Task 4.
5. **Cambiar de modo con un monto cargado**: recalcula sin perder el monto, y tocar la opción ya elegida no la apaga (el grupo nunca queda sin selección). → «reducir cuota muestra la cuota nueva» y «tocar la opción elegida no la apaga» en Task 3.

---

### Task 1: Motor de precancelación (cuadro francés y simulación)

**Files:**
- Create: `client/src/uvaPrepayment.ts`
- Test: `client/src/uvaPrepayment.test.ts`

**Interfaces:**
- Consumes: `CreditSummaryDTO` (tipo) de `@ledgerly/shared`.
- Produces:
  - `RESIDUO = 0.01`, `MAX_CUOTAS = 600`.
  - `type ModoPrecancelacion = "plazo" | "cuota"`.
  - `interface CuadroRestante { cuotas: number; interesUva: number; ultimaCuotaUva: number }`.
  - `type CreditoSimulable = Pick<CreditSummaryDTO, "capitalPendienteUva" | "cuotaPuraUva" | "tasaRealMensual">`.
  - `interface PrecancelacionInput { credito: CreditoSimulable; montoPesos: number; uvaHoy: number; modo: ModoPrecancelacion }`.
  - `interface PrecancelacionResultado { modo; cancelaTodo; montoUva; capitalCanceladoUva; porcentajeDelSaldo; sobrantePesos; interesAhorradoUva; interesAhorradoPesos; cuotasRestantes; cuotasNuevas; cuotasMenos; cuotaNuevaUva; bajaCuotaUva; bajaCuotaPesos; ultimaCuotaUva }` (todos `number` salvo `modo` y `cancelaTodo: boolean`).
  - `cuadroRestante(saldoUva: number, tasaMensual: number, cuotaUva: number): CuadroRestante | null`.
  - `simularPrecancelacion(input: PrecancelacionInput): PrecancelacionResultado | null`.

- [ ] **Step 1: Write the failing test**

Crear `client/src/uvaPrepayment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  cuadroRestante, simularPrecancelacion,
  type CreditoSimulable, type ModoPrecancelacion, type PrecancelacionResultado,
} from "./uvaPrepayment.js";

const SALDO = 100000;
const TASA = 0.0075;
const CUOTA = (SALDO * TASA) / (1 - 1.0075 ** -240);
const UVA_HOY = 2000;

const credito: CreditoSimulable = { capitalPendienteUva: SALDO, cuotaPuraUva: CUOTA, tasaRealMensual: TASA };

const simular = (montoPesos: number, modo: ModoPrecancelacion = "plazo", uvaHoy = UVA_HOY) =>
  simularPrecancelacion({ credito, montoPesos, uvaHoy, modo });

const resultadoDe = (montoPesos: number, modo: ModoPrecancelacion = "plazo", uvaHoy = UVA_HOY): PrecancelacionResultado => {
  const resultado = simular(montoPesos, modo, uvaHoy);
  if (!resultado) throw new Error("la simulación no dio resultado");
  return resultado;
};

describe("cuadroRestante", () => {
  it("recorre el cuadro francés que falta pagar", () => {
    const cuadro = cuadroRestante(SALDO, TASA, CUOTA);
    expect(cuadro?.cuotas).toBe(240);
    expect(cuadro?.interesUva).toBeCloseTo(240 * CUOTA - SALDO, 4);
    expect(cuadro?.interesUva).toBeCloseTo(115934.23, 2);
    expect(cuadro?.ultimaCuotaUva).toBeCloseTo(CUOTA, 4);
  });

  it("devuelve null sin tasa, sin saldo, sin cuota o con una cuota que no cubre el interés", () => {
    expect(cuadroRestante(SALDO, 0, CUOTA)).toBeNull();
    expect(cuadroRestante(SALDO, Number.NaN, CUOTA)).toBeNull();
    expect(cuadroRestante(0, TASA, CUOTA)).toBeNull();
    expect(cuadroRestante(SALDO, TASA, 0)).toBeNull();
    expect(cuadroRestante(SALDO, TASA, SALDO * TASA)).toBeNull();
  });

  it("suma a la última cuota un residuo menor al 1 % de la cuota", () => {
    expect(cuadroRestante(SALDO + 1, TASA, CUOTA)?.cuotas).toBe(240);
    expect(cuadroRestante(SALDO + 5, TASA, CUOTA)?.cuotas).toBe(241);
  });

  it("corta un cuadro de más de 600 cuotas", () => {
    expect(cuadroRestante(SALDO, 0.0001, SALDO * 0.0001 + 1)).toBeNull();
  });
});

describe("simularPrecancelacion", () => {
  it("reducir plazo mantiene la cuota y baja la cantidad de cuotas", () => {
    const resultado = resultadoDe(20_000_000, "plazo");
    expect(resultado).toMatchObject({
      modo: "plazo", cancelaTodo: false, montoUva: 10000, capitalCanceladoUva: 10000, porcentajeDelSaldo: 0.1,
      sobrantePesos: 0, cuotasRestantes: 240, cuotasNuevas: 186, cuotasMenos: 54, bajaCuotaUva: 0, bajaCuotaPesos: 0,
    });
    expect(resultado.interesAhorradoUva).toBeCloseTo(38895.86, 2);
    expect(resultado.interesAhorradoPesos).toBeCloseTo(77791710.69, 1);
    expect(resultado.cuotaNuevaUva).toBeCloseTo(CUOTA, 10);
  });

  it("reducir cuota mantiene el plazo y baja la cuota en proporción al saldo", () => {
    const resultado = resultadoDe(20_000_000, "cuota");
    expect(resultado).toMatchObject({ modo: "cuota", cancelaTodo: false, cuotasNuevas: 240, cuotasMenos: 0 });
    expect(resultado.cuotaNuevaUva).toBeCloseTo(809.75, 2);
    expect(resultado.bajaCuotaUva).toBeCloseTo(89.97, 2);
    expect(resultado.bajaCuotaPesos).toBeCloseTo(179945.19, 2);
    expect(resultado.interesAhorradoUva).toBeCloseTo(11593.42, 2);
    expect(resultado.ultimaCuotaUva).toBeCloseTo(CUOTA * 0.9, 4);
  });

  it("con el mismo monto, reducir plazo ahorra más interés que reducir cuota", () => {
    for (const monto of [1_000_000, 20_000_000, 150_000_000]) {
      expect(resultadoDe(monto, "plazo").interesAhorradoUva).toBeGreaterThan(resultadoDe(monto, "cuota").interesAhorradoUva);
    }
  });

  it("con un monto chico en reducir plazo no baja ninguna cuota pero achica la última", () => {
    const resultado = resultadoDe(100 * UVA_HOY, "plazo");
    expect(resultado.cuotasMenos).toBe(0);
    expect(resultado.cuotasNuevas).toBe(240);
    expect(resultado.ultimaCuotaUva).toBeCloseTo(298.81, 2);
  });

  it("un monto chico pero válido da un resultado que casi no mueve nada", () => {
    const resultado = resultadoDe(1.5, "plazo");
    expect(resultado.cuotasMenos).toBe(0);
    expect(resultado.capitalCanceladoUva).toBeCloseTo(0.00075, 8);
  });

  it.each<ModoPrecancelacion>(["plazo", "cuota"])("con un monto mayor al saldo cancela todo el crédito (%s)", (modo) => {
    const resultado = resultadoDe(300_000_000, modo);
    expect(resultado).toMatchObject({
      modo, cancelaTodo: true, montoUva: 150000, capitalCanceladoUva: SALDO, porcentajeDelSaldo: 1,
      sobrantePesos: 100_000_000, cuotasRestantes: 240, cuotasNuevas: 0, cuotasMenos: 240,
      cuotaNuevaUva: 0, bajaCuotaUva: CUOTA, ultimaCuotaUva: 0,
    });
    expect(resultado.interesAhorradoUva).toBeCloseTo(cuadroRestante(SALDO, TASA, CUOTA)?.interesUva ?? 0, 6);
  });

  it("a un centésimo de UVA del saldo ya cancela todo, sin sobrante negativo", () => {
    const resultado = resultadoDe((SALDO - 0.005) * UVA_HOY);
    expect(resultado.cancelaTodo).toBe(true);
    expect(resultado.sobrantePesos).toBe(0);
  });

  it("devuelve null con monto 0 o negativo, sin UVA de hoy o sin cuadro base", () => {
    expect(simular(0)).toBeNull();
    expect(simular(-5)).toBeNull();
    expect(simular(20_000_000, "plazo", 0)).toBeNull();
    expect(simularPrecancelacion({
      credito: { ...credito, tasaRealMensual: 0 }, montoPesos: 20_000_000, uvaHoy: UVA_HOY, modo: "plazo",
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/uvaPrepayment.test.ts`
Expected: FAIL — no existe `./uvaPrepayment.js` ("Failed to resolve import" / "Cannot find module").

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/uvaPrepayment.ts`:

```ts
import type { CreditSummaryDTO } from "@ledgerly/shared";

export const RESIDUO = 0.01;
export const MAX_CUOTAS = 600;
const TOLERANCIA_CANCELACION_UVA = 0.01;

export type ModoPrecancelacion = "plazo" | "cuota";

export interface CuadroRestante {
  cuotas: number;
  interesUva: number;
  ultimaCuotaUva: number;
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

type EfectoPrecancelacion = Pick<
  PrecancelacionResultado,
  "cuotasNuevas" | "cuotasMenos" | "interesAhorradoUva" | "cuotaNuevaUva" | "bajaCuotaUva" | "ultimaCuotaUva"
>;

export function cuadroRestante(saldoUva: number, tasaMensual: number, cuotaUva: number): CuadroRestante | null {
  if (!(saldoUva > 0) || !(tasaMensual > 0) || !(cuotaUva > 0)) return null;

  let saldo = saldoUva;
  let cuotas = 0;
  let interesUva = 0;
  let ultimaCuotaUva = 0;

  while (saldo > 0) {
    const interes = saldo * tasaMensual;
    const amortizacion = cuotaUva - interes;
    if (amortizacion <= 0) return null;

    const cierra = saldo - amortizacion < RESIDUO * cuotaUva;
    ultimaCuotaUva = cierra ? interes + saldo : cuotaUva;
    saldo = cierra ? 0 : saldo - amortizacion;
    cuotas += 1;
    interesUva += interes;
    if (cuotas > MAX_CUOTAS) return null;
  }

  return { cuotas, interesUva, ultimaCuotaUva };
}

const cancelacionTotal = (base: CuadroRestante, cuotaUva: number): EfectoPrecancelacion => ({
  cuotasNuevas: 0,
  cuotasMenos: base.cuotas,
  interesAhorradoUva: base.interesUva,
  cuotaNuevaUva: 0,
  bajaCuotaUva: cuotaUva,
  ultimaCuotaUva: 0,
});

function reducirPlazo(base: CuadroRestante, saldoNuevo: number, credito: CreditoSimulable): EfectoPrecancelacion | null {
  const nuevo = cuadroRestante(saldoNuevo, credito.tasaRealMensual, credito.cuotaPuraUva);
  if (!nuevo) return null;
  return {
    cuotasNuevas: nuevo.cuotas,
    cuotasMenos: base.cuotas - nuevo.cuotas,
    interesAhorradoUva: base.interesUva - nuevo.interesUva,
    cuotaNuevaUva: credito.cuotaPuraUva,
    bajaCuotaUva: 0,
    ultimaCuotaUva: nuevo.ultimaCuotaUva,
  };
}

function reducirCuota(base: CuadroRestante, saldoNuevo: number, credito: CreditoSimulable): EfectoPrecancelacion {
  const factor = saldoNuevo / credito.capitalPendienteUva;
  const cuotaNuevaUva = credito.cuotaPuraUva * factor;
  return {
    cuotasNuevas: base.cuotas,
    cuotasMenos: 0,
    interesAhorradoUva: base.interesUva * (1 - factor),
    cuotaNuevaUva,
    bajaCuotaUva: credito.cuotaPuraUva - cuotaNuevaUva,
    ultimaCuotaUva: base.ultimaCuotaUva * factor,
  };
}

function efectoDe(
  modo: ModoPrecancelacion,
  cancelaTodo: boolean,
  base: CuadroRestante,
  saldoNuevo: number,
  credito: CreditoSimulable,
): EfectoPrecancelacion | null {
  if (cancelaTodo) return cancelacionTotal(base, credito.cuotaPuraUva);
  return modo === "plazo" ? reducirPlazo(base, saldoNuevo, credito) : reducirCuota(base, saldoNuevo, credito);
}

export function simularPrecancelacion({ credito, montoPesos, uvaHoy, modo }: PrecancelacionInput): PrecancelacionResultado | null {
  const saldo = credito.capitalPendienteUva;
  const base = cuadroRestante(saldo, credito.tasaRealMensual, credito.cuotaPuraUva);
  if (!base || !(montoPesos > 0) || !(uvaHoy > 0)) return null;

  const montoUva = montoPesos / uvaHoy;
  const cancelaTodo = montoUva >= saldo - TOLERANCIA_CANCELACION_UVA;
  const capitalCanceladoUva = cancelaTodo ? saldo : montoUva;
  const efecto = efectoDe(modo, cancelaTodo, base, saldo - capitalCanceladoUva, credito);
  if (!efecto) return null;

  return {
    modo,
    cancelaTodo,
    montoUva,
    capitalCanceladoUva,
    porcentajeDelSaldo: capitalCanceladoUva / saldo,
    sobrantePesos: cancelaTodo ? Math.max(0, montoPesos - saldo * uvaHoy) : 0,
    cuotasRestantes: base.cuotas,
    ...efecto,
    interesAhorradoPesos: efecto.interesAhorradoUva * uvaHoy,
    bajaCuotaPesos: efecto.bajaCuotaUva * uvaHoy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/uvaPrepayment.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/uvaPrepayment.ts client/src/uvaPrepayment.test.ts
git commit -m "feat(client): motor del simulador de precancelación UVA" -m "Recorre el cuadro francés que falta pagar en UVA (con el residuo menor al 1 % absorbido en la última cuota) y simula adelantar capital reduciendo plazo o cuota, o cancelando todo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Funciones de apoyo, veredicto y textos (más `retornoAdelantar` exportado)

**Files:**
- Modify: `client/src/macroSignals.ts` (`function retornoAdelantar` → `export function retornoAdelantar`)
- Modify: `client/src/macroSignals.test.ts`
- Modify: `client/src/uvaPrepayment.ts`
- Test: `client/src/uvaPrepayment.test.ts`

**Interfaces:**
- Consumes: Task 1 (`cuadroRestante`, `PrecancelacionResultado`, `CuadroRestante`); `parseMoneyInput` (`moneyInput.ts`); `formatMoney`, `formatPercent`, `formatSignedPercent`, `formatUva` (`format.ts`); `buildVerdict`, `defaultAssumptions`, `EMPATE_PP`, `retornoAdelantar`, `MacroVerdict` (`macroSignals.ts`).
- Produces:
  - `retornoAdelantar(credit: CreditSummaryDTO | undefined): number | null` (exportada, cuerpo sin cambios).
  - `interface UvaDeHoy { valor: number; fuente: "hoy" | "ultimoCupon" }`.
  - `interface SimuladorTile { id: "capital" | "intereses" | "cuotas" | "cuota"; label: string; value: string; sub: string }`.
  - `interface LecturaVeredicto { estado: "mejor" | "superado" | "sinComparar"; texto: string }`.
  - `interface SimuladorDatos { credito: CreditSummaryDTO; base: CuadroRestante; uva: UvaDeHoy; veredicto: LecturaVeredicto; comisionHastaCuota: number | null }`.
  - `leerMontoTipeado(texto: string): number | null`.
  - `uvaDeHoy(series: MacroSeriesDTO | undefined, credito: Pick<CreditSummaryDTO, "cotizacionUvaActual">): UvaDeHoy`.
  - `comisionPosibleHastaCuota(credito: Pick<CreditSummaryDTO, "cuotasPagadas" | "cuotasTotales">): number | null`.
  - `duracion(meses: number): string`.
  - `resultadoTiles(resultado: PrecancelacionResultado): SimuladorTile[]`.
  - `lecturaVeredicto(verdict: MacroVerdict | null, retornoReal: number): LecturaVeredicto` (`retornoReal` es el de adelantar, en % anual).
  - `prepararSimulador(credito: CreditSummaryDTO | undefined, series: MacroSeriesDTO | undefined): SimuladorDatos | null`.
  - `textoSaldo(datos: SimuladorDatos): string`, `textoAyudaMonto(resultado: PrecancelacionResultado | null, uva: UvaDeHoy, montoInvalido: boolean): string`, `textoCancelacionTotal(resultado: PrecancelacionResultado, uvaHoy: number): string`, `textoLetraChica(comisionHastaCuota: number | null): string`.

- [ ] **Step 1: Write the failing tests**

En `client/src/macroSignals.test.ts`, sumar `retornoAdelantar` al import:

```ts
import {
  dolarRealSeries, tasaRealSeries, inflacionInteranual, variacion12m, raceSeries,
  defaultAssumptions, buildVerdict, buildSignals, buildMacroView, macroChartsInYears, retornoAdelantar,
  type MacroAssumptions, type MacroView, type RaceSerie,
} from "./macroSignals.js";
```

y agregar al final del archivo (usa el helper `credit` que ya existe):

```ts
describe("retornoAdelantar", () => {
  it("anualiza la tasa real mensual del crédito", () => {
    expect(retornoAdelantar(credit(0.0075))).toBeCloseTo((1.0075 ** 12 - 1) * 100, 10);
    expect(retornoAdelantar(credit(0.0075))).toBeCloseTo(9.3807, 4);
  });

  it("sin crédito devuelve null", () => {
    expect(retornoAdelantar(undefined)).toBeNull();
  });
});
```

En `client/src/uvaPrepayment.test.ts`, reemplazar el import de arriba por:

```ts
import { describe, it, expect } from "vitest";
import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import { EMPATE_PP, type MacroOption, type MacroVerdict, type VerdictOption } from "./macroSignals.js";
import {
  comisionPosibleHastaCuota, cuadroRestante, duracion, lecturaVeredicto, leerMontoTipeado, prepararSimulador,
  resultadoTiles, simularPrecancelacion, textoAyudaMonto, textoCancelacionTotal, textoLetraChica, textoSaldo, uvaDeHoy,
  type CreditoSimulable, type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorDatos, type UvaDeHoy,
} from "./uvaPrepayment.js";
```

y agregar al final del archivo:

```ts
const series = (uva: number | null, meses: MacroMonth[] = []): MacroSeriesDTO => ({
  desde: "2025-01",
  meses,
  hoy: { fecha: "2026-10-02", usdOficial: null, uva, tasa30: null },
});

const MESES_CON_INFLACION: MacroMonth[] = [
  { periodo: "2026-08", usdOficial: null, uva: 1990, tasa30: null, inflacion: 2 },
];

const creditoCompleto = (cambios: Partial<CreditSummaryDTO> = {}): CreditSummaryDTO => ({
  prestamoNro: "0000000001", cuotasPagadas: 10, cuotasTotales: 250,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 110000, capitalAmortizadoUva: 10000, capitalPendienteUva: SALDO, capitalPendientePesos: SALDO * 1900,
  porcentajeAvanceCapital: 0.09, cotizacionUvaActual: 1900, cuotaPuraUva: CUOTA, tna: 9, tasaRealMensual: TASA,
  ...cambios,
});

const datosDe = (credito: CreditSummaryDTO, macro: MacroSeriesDTO | undefined): SimuladorDatos => {
  const datos = prepararSimulador(credito, macro);
  if (!datos) throw new Error("el simulador no tiene datos");
  return datos;
};

const LABELS: Record<MacroOption, string> = {
  dolar: "Comprar dólares",
  pesos: "Quedarse en pesos",
  adelantar: "Adelantar capital del crédito",
};

const opcion = (id: MacroOption, retornoReal: number): VerdictOption => ({
  opcion: id, label: LABELS[id], retornoReal, certeza: id === "adelantar" ? "alta" : "media",
});

const veredicto = (...ranking: VerdictOption[]): MacroVerdict => ({ ranking, resumen: "" });

describe("leerMontoTipeado", () => {
  it("lee los montos completos con el parser de la base", () => {
    expect(leerMontoTipeado("20.000.000")).toBe(20_000_000);
    expect(leerMontoTipeado("$ 1.500.000,50")).toBe(1500000.5);
    expect(leerMontoTipeado(" 5000000 ")).toBe(5_000_000);
    expect(leerMontoTipeado("1.5")).toBe(1.5);
    expect(leerMontoTipeado("0")).toBe(0);
  });

  it("acepta montos a medio tipear", () => {
    expect(leerMontoTipeado("20.")).toBe(20);
    expect(leerMontoTipeado("20.000.0")).toBe(200_000);
    expect(leerMontoTipeado("20.000.00")).toBe(2_000_000);
    expect(leerMontoTipeado("1.500.000,")).toBe(1_500_000);
    expect(leerMontoTipeado("$ 20.000.0")).toBe(200_000);
  });

  it("devuelve null si no queda un número", () => {
    expect(leerMontoTipeado("")).toBeNull();
    expect(leerMontoTipeado("abc")).toBeNull();
    expect(leerMontoTipeado("-5")).toBeNull();
    expect(leerMontoTipeado("1,2,3")).toBeNull();
  });
});

describe("uvaDeHoy", () => {
  it("usa la UVA de hoy de las series macro", () => {
    expect(uvaDeHoy(series(2000), { cotizacionUvaActual: 1900 })).toEqual({ valor: 2000, fuente: "hoy" });
  });

  it("sin dato de hoy o sin series usa la cotización del último cupón", () => {
    expect(uvaDeHoy(series(null), { cotizacionUvaActual: 1900 })).toEqual({ valor: 1900, fuente: "ultimoCupon" });
    expect(uvaDeHoy(undefined, { cotizacionUvaActual: 1900 })).toEqual({ valor: 1900, fuente: "ultimoCupon" });
  });
});

describe("comisionPosibleHastaCuota", () => {
  it("avisa hasta un cuarto del plazo o 6 cuotas, lo que sea mayor", () => {
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 10, cuotasTotales: 250 })).toBe(63);
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 2, cuotasTotales: 12 })).toBe(6);
  });

  it("devuelve null cuando ya pasó ese plazo", () => {
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 70, cuotasTotales: 250 })).toBeNull();
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 63, cuotasTotales: 250 })).toBeNull();
  });
});

describe("duracion", () => {
  it.each([
    [1, "1 mes"],
    [12, "1 año"],
    [13, "1 año y 1 mes"],
    [24, "2 años"],
    [54, "4 años y 6 meses"],
  ])("%i meses → %s", (meses, texto) => {
    expect(duracion(meses)).toBe(texto);
  });
});

describe("resultadoTiles", () => {
  it("en reducir plazo muestra capital, intereses y cuotas menos", () => {
    const tiles = resultadoTiles(resultadoDe(20_000_000, "plazo"));
    expect(tiles.map((tile) => tile.id)).toEqual(["capital", "intereses", "cuotas"]);
    expect(tiles.map((tile) => tile.label)).toEqual(["Capital que cancelás", "Intereses que te ahorrás", "Cuotas menos"]);
    expect(tiles[0]).toMatchObject({ value: "10.000,00 UVA", sub: "10,0% del saldo pendiente" });
    expect(tiles[1]).toMatchObject({ value: "38.895,86 UVA", sub: `≈ ${formatMoney(77791710.69, "ARS")} de hoy` });
    expect(tiles[2]).toMatchObject({ value: "54", sub: "Terminás 4 años y 6 meses antes: quedan 186 cuotas" });
  });

  it("en reducir cuota muestra la cuota nueva", () => {
    const tiles = resultadoTiles(resultadoDe(20_000_000, "cuota"));
    expect(tiles.map((tile) => tile.id)).toEqual(["capital", "intereses", "cuota"]);
    expect(tiles[2]).toMatchObject({
      label: "Cuota nueva",
      value: "809,75 UVA",
      sub: `Baja 89,97 UVA ≈ ${formatMoney(179945.19, "ARS")} por mes`,
    });
  });

  it("si no alcanza para una cuota entera explica cuánto baja la última", () => {
    const [, , cuotas] = resultadoTiles(resultadoDe(100 * UVA_HOY, "plazo"));
    expect(cuotas).toMatchObject({ value: "0", sub: "No alcanza para una cuota entera: la última baja a 298,81 UVA" });
  });

  it("cuando queda una sola cuota lo dice en singular", () => {
    const [, , cuotas] = resultadoTiles(resultadoDe(199_000_000, "plazo"));
    expect(cuotas).toMatchObject({ value: "239", sub: "Terminás 19 años y 11 meses antes: queda 1 cuota" });
  });

  it.each<ModoPrecancelacion>(["plazo", "cuota"])("si cancela todo muestra las cuotas menos en los dos modos (%s)", (modo) => {
    const [capital, , cuotas] = resultadoTiles(resultadoDe(300_000_000, modo));
    expect(capital).toMatchObject({ value: "100.000,00 UVA", sub: "100,0% del saldo pendiente" });
    expect(cuotas).toMatchObject({ id: "cuotas", value: "240", sub: "Cancelás el crédito completo" });
  });
});

describe("lecturaVeredicto", () => {
  it("con adelantar primero es la opción que más rinde", () => {
    expect(lecturaVeredicto(veredicto(opcion("adelantar", 9.38), opcion("pesos", 2)), 9.38)).toEqual({
      estado: "mejor",
      texto: "Según Contexto, hoy adelantar capital es la opción que más rinde: +9,4% real anual, y es el único retorno cierto.",
    });
  });

  it("segundo a menos de EMPATE_PP del líder empata con él", () => {
    const lectura = lecturaVeredicto(veredicto(opcion("dolar", 9.38 + EMPATE_PP - 0.1), opcion("adelantar", 9.38)), 9.38);
    expect(lectura).toEqual({
      estado: "mejor",
      texto: "Según Contexto, hoy adelantar capital empata con comprar dólares: +9,4% real anual, y es el único retorno cierto.",
    });
  });

  it("lejos del líder queda superado y lo nombra", () => {
    const lectura = lecturaVeredicto(veredicto(opcion("dolar", 15.2), opcion("adelantar", 9.38), opcion("pesos", 2)), 9.38);
    expect(lectura).toEqual({
      estado: "superado",
      texto: "Según Contexto, hoy comprar dólares rinde más (+15,2% real anual) que adelantar capital (+9,4%). Ese retorno depende de supuestos; el de adelantar es cierto.",
    });
  });

  it("a exactamente EMPATE_PP del líder ya no empata", () => {
    expect(lecturaVeredicto(veredicto(opcion("pesos", 10), opcion("adelantar", 9.5)), 9.5).estado).toBe("superado");
  });

  it("sin veredicto o sin la opción adelantar no compara", () => {
    const texto = "Adelantar capital rinde +9,4% real anual, sea cual sea el monto, y es un retorno cierto. Cargá las series macro para compararlo con el dólar y los pesos.";
    expect(lecturaVeredicto(null, 9.38)).toEqual({ estado: "sinComparar", texto });
    expect(lecturaVeredicto(veredicto(), 9.38)).toEqual({ estado: "sinComparar", texto });
    expect(lecturaVeredicto(veredicto(opcion("dolar", 15), opcion("pesos", 2)), 9.38)).toEqual({ estado: "sinComparar", texto });
  });
});

describe("prepararSimulador", () => {
  it("sin crédito, sin cuadro base o sin UVA no hay simulador", () => {
    expect(prepararSimulador(undefined, series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ tasaRealMensual: 0 }), series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ tasaRealMensual: Number.NaN }), series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ cotizacionUvaActual: 0 }), undefined)).toBeNull();
  });

  it("con series usa la UVA de hoy y arma el veredicto con los supuestos por defecto", () => {
    const datos = datosDe(creditoCompleto(), series(2000, MESES_CON_INFLACION));
    expect(datos.uva).toEqual({ valor: 2000, fuente: "hoy" });
    expect(datos.base.cuotas).toBe(240);
    expect(datos.veredicto.estado).toBe("mejor");
    expect(datos.comisionHastaCuota).toBe(63);
  });

  it("sin series usa la UVA del último cupón y no compara", () => {
    const datos = datosDe(creditoCompleto(), undefined);
    expect(datos.uva).toEqual({ valor: 1900, fuente: "ultimoCupon" });
    expect(datos.veredicto.estado).toBe("sinComparar");
  });
});

describe("textos de la tarjeta", () => {
  const HOY: UvaDeHoy = { valor: 2000, fuente: "hoy" };

  it("textoSaldo resume el saldo de referencia", () => {
    expect(textoSaldo(datosDe(creditoCompleto(), series(2000)))).toBe(
      `Saldo pendiente: 100.000,00 UVA ≈ ${formatMoney(200_000_000, "ARS")} · 240 cuotas de 899,73 UVA · después de la cuota 10.`,
    );
  });

  it("textoAyudaMonto guía, marca el error o muestra las UVA del monto", () => {
    expect(textoAyudaMonto(null, HOY, false)).toBe("En pesos. Se convierte a UVA con la cotización de hoy.");
    expect(textoAyudaMonto(null, HOY, true)).toBe("Ingresá un monto mayor a cero, por ejemplo 5.000.000.");
    expect(textoAyudaMonto(resultadoDe(20_000_000), HOY, false)).toBe(`10.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`);
    expect(textoAyudaMonto(resultadoDe(300_000_000), HOY, false)).toBe(`150.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`);
  });

  it("textoAyudaMonto aclara cuando usa la cotización del último cupón", () => {
    const ultimoCupon: UvaDeHoy = { valor: 1900, fuente: "ultimoCupon" };
    expect(textoAyudaMonto(resultadoDe(19_000_000, "plazo", 1900), ultimoCupon, false)).toBe(
      `10.000,00 UVA a ${formatMoney(1900, "ARS")} por UVA (cotización del último cupón)`,
    );
  });

  it("textoCancelacionTotal dice cuánto alcanza y cuánto sobra", () => {
    expect(textoCancelacionTotal(resultadoDe(300_000_000), UVA_HOY)).toBe(
      `Con este monto cancelás todo el crédito: alcanza con ${formatMoney(200_000_000, "ARS")} y te sobran ${formatMoney(100_000_000, "ARS")}.`,
    );
    expect(textoCancelacionTotal(resultadoDe(200_000_000), UVA_HOY)).toBe(
      `Con este monto cancelás todo el crédito: alcanza con ${formatMoney(200_000_000, "ARS")}.`,
    );
  });

  it("textoLetraChica suma el aviso de comisión solo si puede aplicar", () => {
    const base = "Los intereses ahorrados suman lo que dejás de pagar, valuado a la UVA de hoy; no descuentan el paso del tiempo. El seguro de incendio no cambia.";
    expect(textoLetraChica(null)).toBe(base);
    expect(textoLetraChica(63)).toBe(`${base} Hasta la cuota 63 el banco puede cobrar comisión por precancelar; no está incluida.`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/uvaPrepayment.test.ts client/src/macroSignals.test.ts`
Expected: FAIL — `retornoAdelantar`, `leerMontoTipeado`, `uvaDeHoy`, etc. no están exportadas ("is not a function").

- [ ] **Step 3: Implement**

En `client/src/macroSignals.ts`, cambiar solo la firma:

```ts
export function retornoAdelantar(credit: CreditSummaryDTO | undefined): number | null {
```

En `client/src/uvaPrepayment.ts`, reemplazar el import de arriba por:

```ts
import type { CreditSummaryDTO, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney, formatPercent, formatSignedPercent, formatUva } from "./format.js";
import { buildVerdict, defaultAssumptions, EMPATE_PP, retornoAdelantar, type MacroVerdict } from "./macroSignals.js";
import { parseMoneyInput } from "./moneyInput.js";
```

sumar, debajo de `TOLERANCIA_CANCELACION_UVA`:

```ts
const COMISION_CUOTAS_MINIMAS = 6;
const SOBRANTE_MINIMO_PESOS = 1;
const SEPARADOR_FINAL = /[.,]$/;
const AGRUPADO_EN_CURSO = /^\$?\s*\d[\d.]*$/;
const NO_DIGITOS = /\D/g;
```

sumar, debajo de `PrecancelacionResultado`:

```ts
export interface UvaDeHoy {
  valor: number;
  fuente: "hoy" | "ultimoCupon";
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

y agregar al final del archivo:

```ts
export function leerMontoTipeado(texto: string): number | null {
  const recortado = texto.trim().replace(SEPARADOR_FINAL, "");
  const valor = parseMoneyInput(recortado);
  if (valor !== null) return valor;
  return AGRUPADO_EN_CURSO.test(recortado) ? Number(recortado.replace(NO_DIGITOS, "")) : null;
}

export function uvaDeHoy(series: MacroSeriesDTO | undefined, credito: Pick<CreditSummaryDTO, "cotizacionUvaActual">): UvaDeHoy {
  const hoy = series?.hoy.uva ?? null;
  if (hoy !== null && hoy > 0) return { valor: hoy, fuente: "hoy" };
  return { valor: credito.cotizacionUvaActual, fuente: "ultimoCupon" };
}

export function comisionPosibleHastaCuota({
  cuotasPagadas,
  cuotasTotales,
}: Pick<CreditSummaryDTO, "cuotasPagadas" | "cuotasTotales">): number | null {
  const hasta = Math.max(Math.ceil(cuotasTotales / 4), COMISION_CUOTAS_MINIMAS);
  return cuotasPagadas < hasta ? hasta : null;
}

const contar = (cantidad: number, singular: string, plural: string): string =>
  `${cantidad} ${cantidad === 1 ? singular : plural}`;

export function duracion(meses: number): string {
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anios === 0) return contar(resto, "mes", "meses");
  if (resto === 0) return contar(anios, "año", "años");
  return `${contar(anios, "año", "años")} y ${contar(resto, "mes", "meses")}`;
}

const pesos = (value: number): string => formatMoney(value, "ARS");

const quedan = (cuotas: number): string => (cuotas === 1 ? "queda 1 cuota" : `quedan ${cuotas} cuotas`);

function subCuotas({ cancelaTodo, cuotasMenos, cuotasNuevas, ultimaCuotaUva }: PrecancelacionResultado): string {
  if (cancelaTodo) return "Cancelás el crédito completo";
  if (cuotasMenos === 0) return `No alcanza para una cuota entera: la última baja a ${formatUva(ultimaCuotaUva)}`;
  return `Terminás ${duracion(cuotasMenos)} antes: ${quedan(cuotasNuevas)}`;
}

function tileEfecto(resultado: PrecancelacionResultado): SimuladorTile {
  if (resultado.cancelaTodo || resultado.modo === "plazo") {
    return { id: "cuotas", label: "Cuotas menos", value: String(resultado.cuotasMenos), sub: subCuotas(resultado) };
  }
  return {
    id: "cuota",
    label: "Cuota nueva",
    value: formatUva(resultado.cuotaNuevaUva),
    sub: `Baja ${formatUva(resultado.bajaCuotaUva)} ≈ ${pesos(resultado.bajaCuotaPesos)} por mes`,
  };
}

export function resultadoTiles(resultado: PrecancelacionResultado): SimuladorTile[] {
  return [
    {
      id: "capital",
      label: "Capital que cancelás",
      value: formatUva(resultado.capitalCanceladoUva),
      sub: `${formatPercent(resultado.porcentajeDelSaldo * 100)} del saldo pendiente`,
    },
    {
      id: "intereses",
      label: "Intereses que te ahorrás",
      value: formatUva(resultado.interesAhorradoUva),
      sub: `≈ ${pesos(resultado.interesAhorradoPesos)} de hoy`,
    },
    tileEfecto(resultado),
  ];
}

export function lecturaVeredicto(verdict: MacroVerdict | null, retornoReal: number): LecturaVeredicto {
  const retorno = formatSignedPercent(retornoReal);
  const ranking = verdict?.ranking ?? [];
  const lider = ranking[0];
  const adelantar = ranking.find((opcion) => opcion.opcion === "adelantar");

  if (!lider || !adelantar) {
    return {
      estado: "sinComparar",
      texto: `Adelantar capital rinde ${retorno} real anual, sea cual sea el monto, y es un retorno cierto. Cargá las series macro para compararlo con el dólar y los pesos.`,
    };
  }
  if (lider.opcion === "adelantar") {
    return {
      estado: "mejor",
      texto: `Según Contexto, hoy adelantar capital es la opción que más rinde: ${retorno} real anual, y es el único retorno cierto.`,
    };
  }

  const nombreLider = lider.label.toLowerCase();
  if (lider.retornoReal - adelantar.retornoReal < EMPATE_PP) {
    return {
      estado: "mejor",
      texto: `Según Contexto, hoy adelantar capital empata con ${nombreLider}: ${retorno} real anual, y es el único retorno cierto.`,
    };
  }
  return {
    estado: "superado",
    texto: `Según Contexto, hoy ${nombreLider} rinde más (${formatSignedPercent(lider.retornoReal)} real anual) que adelantar capital (${retorno}). Ese retorno depende de supuestos; el de adelantar es cierto.`,
  };
}

export function prepararSimulador(
  credito: CreditSummaryDTO | undefined,
  series: MacroSeriesDTO | undefined,
): SimuladorDatos | null {
  if (!credito) return null;

  const base = cuadroRestante(credito.capitalPendienteUva, credito.tasaRealMensual, credito.cuotaPuraUva);
  const uva = uvaDeHoy(series, credito);
  const retorno = retornoAdelantar(credito);
  if (!base || !(uva.valor > 0) || retorno === null) return null;

  const verdict = series ? buildVerdict(series, credito, defaultAssumptions(series)) : null;
  return {
    credito,
    base,
    uva,
    veredicto: lecturaVeredicto(verdict, retorno),
    comisionHastaCuota: comisionPosibleHastaCuota(credito),
  };
}

export function textoSaldo({ credito, base, uva }: SimuladorDatos): string {
  const saldoPesos = pesos(credito.capitalPendienteUva * uva.valor);
  const cuotas = contar(base.cuotas, "cuota", "cuotas");
  return `Saldo pendiente: ${formatUva(credito.capitalPendienteUva)} ≈ ${saldoPesos} · ${cuotas} de ${formatUva(credito.cuotaPuraUva)} · después de la cuota ${credito.cuotasPagadas}.`;
}

export function textoAyudaMonto(resultado: PrecancelacionResultado | null, uva: UvaDeHoy, montoInvalido: boolean): string {
  if (montoInvalido) return "Ingresá un monto mayor a cero, por ejemplo 5.000.000.";
  if (!resultado) return "En pesos. Se convierte a UVA con la cotización de hoy.";
  const aclaracion = uva.fuente === "ultimoCupon" ? " (cotización del último cupón)" : "";
  return `${formatUva(resultado.montoUva)} a ${pesos(uva.valor)} por UVA${aclaracion}`;
}

export function textoCancelacionTotal({ capitalCanceladoUva, sobrantePesos }: PrecancelacionResultado, uvaHoy: number): string {
  const alcanza = `Con este monto cancelás todo el crédito: alcanza con ${pesos(capitalCanceladoUva * uvaHoy)}`;
  return sobrantePesos >= SOBRANTE_MINIMO_PESOS ? `${alcanza} y te sobran ${pesos(sobrantePesos)}.` : `${alcanza}.`;
}

export function textoLetraChica(comisionHastaCuota: number | null): string {
  const base = "Los intereses ahorrados suman lo que dejás de pagar, valuado a la UVA de hoy; no descuentan el paso del tiempo. El seguro de incendio no cambia.";
  if (comisionHastaCuota === null) return base;
  return `${base} Hasta la cuota ${comisionHastaCuota} el banco puede cobrar comisión por precancelar; no está incluida.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/uvaPrepayment.test.ts client/src/macroSignals.test.ts`
Expected: PASS (todos los de `uvaPrepayment.test.ts` y `macroSignals.test.ts`, incluidos los dos nuevos de `retornoAdelantar`).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/uvaPrepayment.ts client/src/uvaPrepayment.test.ts client/src/macroSignals.ts client/src/macroSignals.test.ts
git commit -m "feat(client): veredicto, textos y datos del simulador de precancelación" -m "Lee montos a medio tipear sobre parseMoneyInput, elige la UVA de hoy o la del último cupón, avisa hasta qué cuota puede haber comisión, arma los tiles y la lectura del veredicto de Contexto. macroSignals exporta retornoAdelantar para mostrar el mismo número." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hook y tarjeta del simulador

**Files:**
- Create: `client/src/components/usePrepaymentSimulator.ts`
- Create: `client/src/components/PrepaymentSimulatorCard.tsx`
- Test: `client/src/components/PrepaymentSimulatorCard.test.tsx`

**Interfaces:**
- Consumes: `useCreditSummary`, `useMacroSeries` (`api/hooks.ts`); de Task 1 y 2: `simularPrecancelacion`, `leerMontoTipeado`, `prepararSimulador`, `resultadoTiles`, `textoSaldo`, `textoAyudaMonto`, `textoCancelacionTotal`, `textoLetraChica` y sus tipos; `useIsMobile`, `useNavSearch`, `MotionBox`, `fadeUpItem`, `compactCardContentSx`, `tapTargetSx`.
- Produces:
  - `interface PrepaymentSimulator { datos: SimuladorDatos | null; monto: string; setMonto: (value: string) => void; modo: ModoPrecancelacion; setModo: (modo: ModoPrecancelacion) => void; resultado: PrecancelacionResultado | null; montoInvalido: boolean }`.
  - `usePrepaymentSimulator(): PrepaymentSimulator`.
  - `PrepaymentSimulatorCard` (sin props): `section` con nombre accesible «Simulador de precancelación».

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/PrepaymentSimulatorCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { cssFor } from "../testing/cssFor.js";
import { flushAsync } from "../testing/flushAsync.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { PrepaymentSimulatorCard } from "./PrepaymentSimulatorCard.js";

const SALDO = 100000;
const TASA = 0.0075;
const CUOTA = (SALDO * TASA) / (1 - 1.0075 ** -240);

const CREDITO: CreditSummaryDTO = {
  prestamoNro: "0000000001", cuotasPagadas: 10, cuotasTotales: 250,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 110000, capitalAmortizadoUva: 10000, capitalPendienteUva: SALDO, capitalPendientePesos: SALDO * 1900,
  porcentajeAvanceCapital: 0.09, cotizacionUvaActual: 1900, cuotaPuraUva: CUOTA, tna: 9, tasaRealMensual: TASA,
};

const MESES_CON_INFLACION: MacroMonth[] = [
  { periodo: "2026-08", usdOficial: null, uva: 1990, tasa30: null, inflacion: 2 },
];

const macro = (uva: number | null, meses: MacroMonth[]): MacroSeriesDTO => ({
  desde: "2025-01",
  meses,
  hoy: { fecha: "2026-10-02", usdOficial: null, uva, tasa30: null },
});

interface ApiStub {
  summary?: boolean;
  uvaHoy?: number | null;
  meses?: MacroMonth[];
  macroFalla?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubApi = ({ summary = true, uvaHoy = 2000, meses = [], macroFalla = false }: ApiStub = {}) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/credits/summary")) return summary ? json(CREDITO) : new Response(null, { status: 204 });
    if (url.includes("/macro/series")) return macroFalla ? json({ error: "sin red" }, 500) : json(macro(uvaHoy, meses));
    return json({});
  }));
};

const renderCard = (route = "/credits") => renderWithProviders(<PrepaymentSimulatorCard />, { route });

const findCard = () => screen.findByRole("region", { name: "Simulador de precancelación" });

const montoInput = () => screen.getByRole("textbox", { name: "Monto a adelantar" });

const tile = (name: string) => screen.getByRole("group", { name });

const comoSeLee = (texto: string) => texto.replace(/\s+/g, " ");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PrepaymentSimulatorCard", () => {
  beforeEach(() => stubApi());

  it("sin monto muestra la guía, el saldo de referencia y el aviso de comisión", async () => {
    renderCard();
    const card = await findCard();
    expect(within(card).getByText("Ingresá un monto para ver cuánto te ahorrás.")).toBeInTheDocument();
    expect(within(card).getByText("En pesos. Se convierte a UVA con la cotización de hoy.")).toBeInTheDocument();
    expect(within(card).getByText(/después de la cuota 10\./)).toBeInTheDocument();
    expect(within(card).getByText(/Hasta la cuota 63 el banco puede cobrar comisión/)).toBeInTheDocument();
    expect(montoInput()).toHaveAttribute("inputmode", "decimal");
  });

  it("con un monto en reducir plazo muestra las cuotas menos y el interés ahorrado", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    expect(within(tile("Cuotas menos")).getByText("54")).toBeInTheDocument();
    expect(within(tile("Intereses que te ahorrás")).getByText("38.895,86 UVA")).toBeInTheDocument();
    expect(within(tile("Capital que cancelás")).getByText("10.000,00 UVA")).toBeInTheDocument();
    expect(screen.getByText(comoSeLee(`10.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`))).toBeInTheDocument();
    expect(screen.queryByText("Ingresá un monto para ver cuánto te ahorrás.")).not.toBeInTheDocument();
  });

  it("reducir cuota muestra la cuota nueva sin perder el monto", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    await userEvent.click(screen.getByRole("button", { name: "Reducir cuota" }));
    expect(within(tile("Cuota nueva")).getByText("809,75 UVA")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cuotas menos" })).not.toBeInTheDocument();
    expect(montoInput()).toHaveValue("20.000.000");
  });

  it("tocar la opción elegida no la apaga", async () => {
    renderCard();
    await findCard();
    const plazo = screen.getByRole("button", { name: "Reducir plazo" });
    expect(plazo).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(plazo);
    expect(plazo).toHaveAttribute("aria-pressed", "true");
  });

  it("un monto mayor al saldo cancela todo el crédito", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "300.000.000");
    expect(screen.getByText(/Con este monto cancelás todo el crédito/)).toBeInTheDocument();
    expect(within(tile("Cuotas menos")).getByText("240")).toBeInTheDocument();
    expect(within(tile("Cuotas menos")).getByText("Cancelás el crédito completo")).toBeInTheDocument();
  });

  it("un texto que no es un monto marca el campo en error", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "abc");
    expect(montoInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ingresá un monto mayor a cero, por ejemplo 5.000.000.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un monto para ver cuánto te ahorrás.")).toBeInTheDocument();
  });

  it("un monto a medio tipear no marca error y sigue mostrando el resultado", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.0");
    expect(montoInput()).toHaveAttribute("aria-invalid", "false");
    expect(tile("Cuotas menos")).toBeInTheDocument();
  });

  it("sin meses macro muestra el retorno de adelantar sin compararlo", async () => {
    renderCard();
    const card = await findCard();
    expect(within(card).getByText(/^Adelantar capital rinde \+9,4% real anual/)).toBeInTheDocument();
    expect(within(card).queryByText("Ranking con los supuestos por defecto de Contexto.")).not.toBeInTheDocument();
  });

  it("el link Ver Contexto conserva el año elegido", async () => {
    renderCard("/credits?year=2026");
    const card = await findCard();
    expect(within(card).getByRole("link", { name: "Ver Contexto" })).toHaveAttribute("href", "/contexto?year=2026");
  });
});

describe("PrepaymentSimulatorCard con el veredicto de Contexto", () => {
  it("con adelantar primero lo dice y aclara los supuestos", async () => {
    stubApi({ meses: MESES_CON_INFLACION });
    renderCard();
    const card = await findCard();
    expect(within(card).getByText(/^Según Contexto, hoy adelantar capital es la opción que más rinde/)).toBeInTheDocument();
    expect(within(card).getByText("Ranking con los supuestos por defecto de Contexto.")).toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard sin la UVA de hoy", () => {
  it("con hoy.uva en null usa la cotización del último cupón y lo aclara", async () => {
    stubApi({ uvaHoy: null });
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "19.000.000");
    expect(screen.getByText(comoSeLee(`10.000,00 UVA a ${formatMoney(1900, "ARS")} por UVA (cotización del último cupón)`))).toBeInTheDocument();
  });

  it("si /macro/series falla la tarjeta igual se muestra con el último cupón", async () => {
    stubApi({ macroFalla: true });
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "19.000.000");
    expect(screen.getByText(/\(cotización del último cupón\)$/)).toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard sin crédito", () => {
  it("con summary 204 no se monta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubApi({ summary: false });
    renderCard();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/credits/summary"))).toBe(true));
    await flushAsync();
    await flushAsync();
    expect(screen.queryByRole("region", { name: "Simulador de precancelación" })).not.toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard en mobile", () => {
  beforeEach(() => {
    stubApi();
    emulateMobile();
  });

  it("los botones de modo y Ver Contexto tienen objetivos táctiles de 44px", async () => {
    renderCard();
    const card = await findCard();
    for (const name of ["Reducir plazo", "Reducir cuota"]) {
      expect(cssFor(within(card).getByRole("button", { name }))).toContain("min-height:44px");
    }
    expect(cssFor(within(card).getByRole("link", { name: "Ver Contexto" }))).toContain("min-height:44px");
  });

  it("calcula igual que en compu", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    expect(within(tile("Cuotas menos")).getByText("54")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/PrepaymentSimulatorCard.test.tsx`
Expected: FAIL — no existe `./PrepaymentSimulatorCard.js`.

- [ ] **Step 3: Write the hook**

Crear `client/src/components/usePrepaymentSimulator.ts`:

```ts
import { useMemo, useState } from "react";
import { useCreditSummary, useMacroSeries } from "../api/hooks.js";
import {
  leerMontoTipeado, prepararSimulador, simularPrecancelacion,
  type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorDatos,
} from "../uvaPrepayment.js";

export interface PrepaymentSimulator {
  datos: SimuladorDatos | null;
  monto: string;
  setMonto: (value: string) => void;
  modo: ModoPrecancelacion;
  setModo: (modo: ModoPrecancelacion) => void;
  resultado: PrecancelacionResultado | null;
  montoInvalido: boolean;
}

export function usePrepaymentSimulator(): PrepaymentSimulator {
  const { data: credito } = useCreditSummary();
  const { data: series, isLoading: cargandoSeries } = useMacroSeries();
  const [monto, setMonto] = useState("");
  const [modo, setModo] = useState<ModoPrecancelacion>("plazo");

  const datos = useMemo(
    () => (cargandoSeries ? null : prepararSimulador(credito, series)),
    [cargandoSeries, credito, series],
  );

  const resultado = useMemo(() => {
    const montoPesos = leerMontoTipeado(monto);
    if (!datos || montoPesos === null) return null;
    return simularPrecancelacion({ credito: datos.credito, montoPesos, uvaHoy: datos.uva.valor, modo });
  }, [datos, monto, modo]);

  const montoInvalido = monto.trim() !== "" && resultado === null;

  return { datos, monto, setMonto, modo, setModo, resultado, montoInvalido };
}
```

- [ ] **Step 4: Write the card**

Crear `client/src/components/PrepaymentSimulatorCard.tsx`:

```tsx
import { useCallback, useId, type ChangeEvent, type MouseEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import {
  resultadoTiles, textoAyudaMonto, textoCancelacionTotal, textoLetraChica, textoSaldo,
  type LecturaVeredicto, type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorTile,
} from "../uvaPrepayment.js";
import { useIsMobile } from "../useIsMobile.js";
import { useNavSearch } from "./layout/useNavSearch.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { tapTargetSx } from "./tapTarget.js";
import { usePrepaymentSimulator } from "./usePrepaymentSimulator.js";

const TITULO = "Simulador de precancelación";

const MODOS: { value: ModoPrecancelacion; label: string }[] = [
  { value: "plazo", label: "Reducir plazo" },
  { value: "cuota", label: "Reducir cuota" },
];

interface SimuladorTileBoxProps {
  tile: SimuladorTile;
}

const SimuladorTileBox = ({ tile }: SimuladorTileBoxProps) => {
  const labelId = useId();
  return (
    <Box role="group" aria-labelledby={labelId} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, minWidth: 0 }}>
      <Typography id={labelId} variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {tile.label}
      </Typography>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>{tile.value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{tile.sub}</Typography>
    </Box>
  );
};

interface ResultadoSimulacionProps {
  resultado: PrecancelacionResultado | null;
  uvaHoy: number;
}

const ResultadoSimulacion = ({ resultado, uvaHoy }: ResultadoSimulacionProps) => {
  if (!resultado) {
    return <Typography color="text.secondary">Ingresá un monto para ver cuánto te ahorrás.</Typography>;
  }

  const tiles = resultadoTiles(resultado);
  const avisoCancelacion = resultado.cancelaTodo ? textoCancelacionTotal(resultado, uvaHoy) : null;

  return (
    <>
      {avisoCancelacion && <Alert severity="success" sx={{ mb: 2 }}>{avisoCancelacion}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {tiles.map((item) => <SimuladorTileBox key={item.id} tile={item} />)}
      </Box>
    </>
  );
};

interface VeredictoContextoProps {
  veredicto: LecturaVeredicto;
}

const VeredictoContexto = ({ veredicto }: VeredictoContextoProps) => {
  const isMobile = useIsMobile();
  const navSearch = useNavSearch();
  const severidad = veredicto.estado === "mejor" ? "success" : "info";
  const leyenda = veredicto.estado === "sinComparar" ? null : (
    <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
      Ranking con los supuestos por defecto de Contexto.
    </Typography>
  );
  const verContexto = (
    <Button
      component={RouterLink}
      to={{ pathname: "/contexto", search: navSearch }}
      color="inherit"
      size="small"
      fullWidth={isMobile}
      sx={isMobile ? tapTargetSx : undefined}
    >
      Ver Contexto
    </Button>
  );

  if (isMobile) {
    return (
      <Alert severity={severidad} sx={{ mt: 2 }}>
        {veredicto.texto}
        {leyenda}
        <Box sx={{ mt: 1 }}>{verContexto}</Box>
      </Alert>
    );
  }

  return (
    <Alert severity={severidad} sx={{ mt: 2 }} action={verContexto}>
      {veredicto.texto}
      {leyenda}
    </Alert>
  );
};

export const PrepaymentSimulatorCard = () => {
  const { datos, monto, setMonto, modo, setModo, resultado, montoInvalido } = usePrepaymentSimulator();
  const isMobile = useIsMobile();
  const titleId = useId();

  const handleMonto = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value),
    [setMonto],
  );
  const handleModo = useCallback(
    (_event: MouseEvent<HTMLElement>, value: ModoPrecancelacion | null) => {
      if (value !== null) setModo(value);
    },
    [setModo],
  );

  if (!datos) return null;

  const toggleSx = isMobile ? tapTargetSx : undefined;

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
      <Card component="section" aria-labelledby={titleId} sx={{ mb: 3 }}>
        <CardContent sx={compactCardContentSx}>
          <Typography id={titleId} variant="h6">{TITULO}</Typography>
          <Typography variant="body2" color="text.secondary">
            Cuánto te ahorrás si adelantás capital hoy. No se guarda nada.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {textoSaldo(datos)}
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "stretch", md: "flex-start" },
              gap: 2,
              mt: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Monto a adelantar"
              value={monto}
              onChange={handleMonto}
              error={montoInvalido}
              helperText={textoAyudaMonto(resultado, datos.uva, montoInvalido)}
              fullWidth={isMobile}
              sx={{ width: { md: 280 }, flexShrink: 0 }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { inputMode: "decimal" },
              }}
            />
            <ToggleButtonGroup exclusive value={modo} onChange={handleModo} aria-label="Qué reducir" fullWidth={isMobile}>
              {MODOS.map((opcion) => (
                <ToggleButton key={opcion.value} value={opcion.value} sx={toggleSx}>{opcion.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <ResultadoSimulacion resultado={resultado} uvaHoy={datos.uva.valor} />
          <VeredictoContexto veredicto={datos.veredicto} />

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            {textoLetraChica(datos.comisionHastaCuota)}
          </Typography>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test client/src/components/PrepaymentSimulatorCard.test.tsx`
Expected: PASS (15 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/usePrepaymentSimulator.ts client/src/components/PrepaymentSimulatorCard.tsx client/src/components/PrepaymentSimulatorCard.test.tsx
git commit -m "feat(client): tarjeta del simulador de precancelación" -m "Monto en pesos y modo (reducir plazo o cuota), tres tiles con el resultado, aviso de cancelación total, lectura del veredicto de Contexto con link que conserva el año y letra chica con la comisión. En mobile el formulario va a todo el ancho y los botones tienen 44px." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Montar el simulador en Créditos

**Files:**
- Modify: `client/src/pages/CreditsPage.tsx`
- Test: `client/src/pages/CreditsPage.test.tsx`

**Interfaces:**
- Consumes: `PrepaymentSimulatorCard` (Task 3).
- Produces: la página Créditos con la `region` «Simulador de precancelación» entre `CreditKpiCards` y la grilla de gráficos.

- [ ] **Step 1: Write the failing test**

En `client/src/pages/CreditsPage.test.tsx`:

1. Reemplazar `route` y sumar el summary y las series como constantes:

```ts
const SUMMARY = {
  prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240, totalPagado: 13594820.38,
  capitalPagado: 2378973.78, interesPagado: 11097965.12, seguroPagado: 117881.48, capitalOriginalUva: 78316.73,
  capitalAmortizadoUva: 1355.89, capitalPendienteUva: 76960.84, capitalPendientePesos: 153827014.64,
  porcentajeAvanceCapital: 0.017313, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9, tasaRealMensual: 0.0074,
};

const MACRO_SERIES = {
  desde: "2025-01", meses: [], hoy: { fecha: "2026-10-02", usdOficial: null, uva: 2075.56, tasa30: null },
};

let summary: Record<string, unknown> = SUMMARY;

function route(url: string) {
  if (url.includes("/credits/summary")) return summary;
  if (url.includes("/credits/coupons")) return [coupon("1", 1, "2025-08-18"), coupon("2", 6, "2026-01-19")];
  if (url.includes("/macro/series")) return MACRO_SERIES;
  return {};
}
```

2. En el `beforeEach` de arriba, antes del `vi.stubGlobal`, volver al summary completo:

```ts
beforeEach(() => {
  summary = SUMMARY;
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
```

3. Sumar un helper debajo de `afterEach`:

```ts
const followsInDocument = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
```

4. Dentro de `describe("CreditsPage", …)`, agregar:

```ts
  it("muestra el simulador de precancelación entre los KPIs y los gráficos", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const simulador = await screen.findByRole("region", { name: "Simulador de precancelación" });
    expect(within(simulador).getByRole("textbox", { name: "Monto a adelantar" })).toBeInTheDocument();
    expect(followsInDocument(screen.getByText("Total pagado"), simulador)).toBe(true);
    expect(followsInDocument(simulador, screen.getByText(/capital vs interés por mes/i))).toBe(true);
  });

  it("sin tasaRealMensual sigue mostrando los KPIs y no monta el simulador", async () => {
    summary = { ...SUMMARY, tasaRealMensual: undefined };
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    await flushAsync();
    expect(screen.queryByRole("region", { name: "Simulador de precancelación" })).not.toBeInTheDocument();
  });
```

5. Dentro de `describe("CreditsPage en mobile", …)`, agregar:

```ts
  it("muestra el simulador de precancelación", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const simulador = await screen.findByRole("region", { name: "Simulador de precancelación" });
    expect(within(simulador).getByRole("button", { name: "Reducir plazo" })).toBeInTheDocument();
  });
```

`JSON.stringify` descarta las claves en `undefined`, así que el stub responde un summary sin `tasaRealMensual`, como un server viejo.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pages/CreditsPage.test.tsx`
Expected: FAIL — «muestra el simulador…» (compu y mobile) no encuentran la `region` «Simulador de precancelación». Los demás casos siguen en verde.

- [ ] **Step 3: Implement**

En `client/src/pages/CreditsPage.tsx`, sumar el import debajo del de `CreditKpiCards`:

```tsx
import { PrepaymentSimulatorCard } from "../components/PrepaymentSimulatorCard.js";
```

y montar la tarjeta justo después de `<CreditKpiCards />`:

```tsx
          <CreditKpiCards />
          <PrepaymentSimulatorCard />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/CreditsPage.test.tsx`
Expected: PASS (los 7 de antes + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/CreditsPage.tsx client/src/pages/CreditsPage.test.tsx
git commit -m "feat(client): simulador de precancelación en Créditos" -m "La tarjeta va entre los KPIs y los gráficos. El test de la página suma tasaRealMensual al summary, las series macro y los casos del simulador en compu, en mobile y con un summary sin tasa." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Verificación final

- [ ] `bun run test` — toda la suite en verde (la base tenía 131 archivos y 891 tests pasando; ahora se suman `uvaPrepayment.test.ts` y `PrepaymentSimulatorCard.test.tsx`).
- [ ] `bun run typecheck` — sin errores.
- [ ] `bun run build` — build del cliente sin errores.
- [ ] `git status` limpio salvo lo que no es de esta feature; `git log --oneline feat/base-nuevas-features..HEAD` muestra spec + plan + 4 commits de tasks.
- [ ] Revisar a ojo el diff contra la lista **No tocar** de Prerrequisitos: ningún archivo de esa lista aparece en `git diff --stat feat/base-nuevas-features..HEAD`.
