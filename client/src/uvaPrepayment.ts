import type { CreditSummaryDTO, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney, formatPercent, formatSignedPercent, formatUva } from "./format.js";
import { buildVerdict, defaultAssumptions, EMPATE_PP, retornoAdelantar, type MacroVerdict } from "./macroSignals.js";
import { parseMoneyInput } from "./moneyInput.js";

export const RESIDUO = 0.01;
export const MAX_CUOTAS = 600;
const TOLERANCIA_CANCELACION_UVA = 0.01;
const COMISION_CUOTAS_MINIMAS = 6;
const SOBRANTE_MINIMO_PESOS = 1;
const SEPARADOR_FINAL = /[.,]$/;
const AGRUPADO_EN_CURSO = /^\$?\s*\d[\d.]*$/;
const NO_DIGITOS = /\D/g;

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
