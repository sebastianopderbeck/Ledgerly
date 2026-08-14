import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMonthLabel, formatPercent } from "./format.js";

export const DOLAR_REAL_BANDA = 10;
export const TASA_REAL_BANDA = 2;
export const EMPATE_PP = 0.5;

export interface DolarRealPoint {
  periodo: string;
  indice: number;
}

export interface DolarReal {
  serie: DolarRealPoint[];
  mediana: number;
  indiceHoy: number | null;
  ultimoPeriodoConIpc: string | null;
}

export interface TasaRealPoint {
  periodo: string;
  tasaReal: number;
}

export interface Variacion12m {
  meses: number;
  uva: number;
  usd: number;
  deuda: number;
}

export interface RaceSerie {
  id: string;
  data: { x: string; y: number }[];
}

const EMPTY_DOLAR_REAL: DolarReal = { serie: [], mediana: 0, indiceHoy: null, ultimoPeriodoConIpc: null };

const byPeriodo = (a: MacroMonth, b: MacroMonth): number => a.periodo.localeCompare(b.periodo);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function ipcIndex(meses: MacroMonth[]): Map<string, number> {
  const index = new Map<string, number>();
  let level = 1;
  meses.forEach((mes, position) => {
    if (position > 0) level *= 1 + (mes.inflacion ?? 0) / 100;
    index.set(mes.periodo, level);
  });
  return index;
}

const sortedMeses = (series: MacroSeriesDTO): MacroMonth[] => [...series.meses].sort(byPeriodo);

export function dolarRealSeries(series: MacroSeriesDTO): DolarReal {
  const meses = sortedMeses(series);
  if (meses.length === 0) return EMPTY_DOLAR_REAL;

  const ipc = ipcIndex(meses);
  const periodoActual = series.hoy.fecha.slice(0, 7);
  const cerrados = meses.filter((mes) => mes.periodo < periodoActual && mes.usdOficial !== null);
  if (cerrados.length === 0) return EMPTY_DOLAR_REAL;

  const reales = cerrados.map((mes) => ({ periodo: mes.periodo, real: mes.usdOficial! / ipc.get(mes.periodo)! }));
  const mediana = median(reales.map((punto) => punto.real));
  if (!(mediana > 0)) return EMPTY_DOLAR_REAL;

  const conIpc = meses.filter((mes) => mes.inflacion !== null);
  const ultimoPeriodoConIpc = conIpc.length > 0 ? conIpc[conIpc.length - 1].periodo : null;
  const ipcHoy = ultimoPeriodoConIpc === null ? null : ipc.get(ultimoPeriodoConIpc) ?? null;
  const spot = series.hoy.usdOficial;

  return {
    serie: reales.map(({ periodo, real }) => ({ periodo, indice: (real / mediana) * 100 })),
    mediana,
    indiceHoy: spot !== null && ipcHoy !== null ? (spot / ipcHoy / mediana) * 100 : null,
    ultimoPeriodoConIpc,
  };
}

export function tasaRealSeries(series: MacroSeriesDTO): TasaRealPoint[] {
  return sortedMeses(series)
    .filter((mes) => mes.tasa30 !== null && mes.inflacion !== null)
    .map((mes) => ({
      periodo: mes.periodo,
      tasaReal: ((1 + mes.tasa30! / 100 / 12) / (1 + mes.inflacion! / 100) - 1) * 100,
    }));
}

export function inflacionInteranual(series: MacroSeriesDTO): number {
  const ultimos = sortedMeses(series).filter((mes) => mes.inflacion !== null).slice(-12);
  if (ultimos.length === 0) return 0;
  const factor = ultimos.reduce((acc, mes) => acc * (1 + mes.inflacion! / 100), 1);
  return (factor - 1) * 100;
}

export function variacion12m(series: MacroSeriesDTO): Variacion12m | null {
  const conAmbos = sortedMeses(series).filter((mes) => mes.uva !== null && mes.usdOficial !== null);
  if (conAmbos.length < 2) return null;

  const inicioPosition = Math.max(0, conAmbos.length - 13);
  const inicio = conAmbos[inicioPosition];
  const ultimo = conAmbos[conAmbos.length - 1];
  const uva = ultimo.uva! / inicio.uva! - 1;
  const usd = ultimo.usdOficial! / inicio.usdOficial! - 1;

  return { meses: conAmbos.length - 1 - inicioPosition, uva, usd, deuda: (1 + uva) / (1 + usd) - 1 };
}

export function raceSeries(series: MacroSeriesDTO): RaceSerie[] {
  const meses = sortedMeses(series);
  if (meses.length === 0) return [];

  const ipc = ipcIndex(meses);
  const indexar = (pick: (mes: MacroMonth) => number | null): { x: string; y: number }[] => {
    const conDato = meses.filter((mes) => pick(mes) !== null);
    const base = conDato.length > 0 ? pick(conDato[0])! : 0;
    if (!(base > 0)) return [];
    return conDato.map((mes) => ({ x: mes.periodo, y: (pick(mes)! / base) * 100 }));
  };

  return [
    { id: "Dólar oficial", data: indexar((mes) => mes.usdOficial) },
    { id: "UVA", data: indexar((mes) => mes.uva) },
    { id: "Inflación", data: meses.map((mes) => ({ x: mes.periodo, y: ipc.get(mes.periodo)! * 100 })) },
  ].filter((serie) => serie.data.length > 0);
}

export interface MacroAssumptions {
  inflacionEsperada: number;
  tasaAnualPesos: number;
  reversionMeses: 12 | 24 | null;
}

export type SignalStatus = "good" | "neutral" | "bad";

export type MacroOption = "dolar" | "pesos" | "adelantar";

export interface MacroSignal {
  id: MacroOption;
  label: string;
  value: number;
  format: "indice" | "porcentaje";
  status: SignalStatus;
  reading: string;
}

export interface VerdictOption {
  opcion: MacroOption;
  label: string;
  retornoReal: number;
  certeza: "alta" | "media" | "baja";
}

export interface MacroVerdict {
  ranking: VerdictOption[];
  resumen: string;
}

export interface MacroView {
  signals: MacroSignal[];
  verdict: MacroVerdict;
  dolarReal: DolarReal;
  tasaReal: TasaRealPoint[];
}

const OPCION_LABEL: Record<MacroOption, string> = {
  dolar: "Comprar dólares",
  pesos: "Quedarse en pesos",
  adelantar: "Adelantar capital del crédito",
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

const signed = (value: number): string => `${value >= 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;

export function defaultAssumptions(series: MacroSeriesDTO): MacroAssumptions {
  return {
    inflacionEsperada: round1(inflacionInteranual(series)),
    tasaAnualPesos: series.hoy.tasa30 ?? 0,
    reversionMeses: 12,
  };
}

function retornoDolar(dolarReal: DolarReal, reversionMeses: MacroAssumptions["reversionMeses"]): number | null {
  if (dolarReal.indiceHoy === null || !(dolarReal.indiceHoy > 0)) return null;
  if (reversionMeses === null) return 0;
  return ((100 / dolarReal.indiceHoy) ** (12 / reversionMeses) - 1) * 100;
}

function retornoPesos({ tasaAnualPesos, inflacionEsperada }: MacroAssumptions): number {
  const tea = (1 + tasaAnualPesos / 100 / 12) ** 12 - 1;
  return ((1 + tea) / (1 + inflacionEsperada / 100) - 1) * 100;
}

function retornoAdelantar(credit: CreditSummaryDTO | undefined): number | null {
  if (!credit) return null;
  return ((1 + credit.tasaRealMensual) ** 12 - 1) * 100;
}

function resumir(ranking: VerdictOption[]): string {
  if (ranking.length === 0) return "No hay datos suficientes para comparar las opciones.";

  const [primero, segundo] = ranking;

  if (segundo && primero.retornoReal - segundo.retornoReal < EMPATE_PP) {
    const preferido = [primero, segundo].find((opcion) => opcion.certeza === "alta") ?? primero;
    const porQue = preferido.certeza === "alta" ? ", que es el único cierto" : "";
    return `Hoy empatan ${primero.label.toLowerCase()} y ${segundo.label.toLowerCase()}, los dos cerca de ${signed(primero.retornoReal)} real anual. Con retornos tan parejos conviene ${preferido.label.toLowerCase()}${porQue}.`;
  }

  const ventaja = segundo
    ? ` Le saca ${formatPercent(primero.retornoReal - segundo.retornoReal)} a ${segundo.label.toLowerCase()}.`
    : "";
  const cierto = ranking.find((opcion) => opcion.certeza === "alta");
  const aclaracion = cierto
    ? ` El único retorno cierto es el de ${cierto.label.toLowerCase()}; los demás dependen de los supuestos.`
    : " Ninguno de estos retornos es cierto: todos dependen de los supuestos.";

  return `Hoy conviene ${primero.label.toLowerCase()}, con ${signed(primero.retornoReal)} real anual.${ventaja}${aclaracion}`;
}

export function buildVerdict(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroVerdict {
  if (series.meses.length === 0) return { ranking: [], resumen: resumir([]) };

  const dolarReal = dolarRealSeries(series);
  const candidatos: VerdictOption[] = [];

  const dolar = retornoDolar(dolarReal, assumptions.reversionMeses);
  if (dolar !== null) candidatos.push({ opcion: "dolar", label: OPCION_LABEL.dolar, retornoReal: dolar, certeza: "baja" });

  candidatos.push({ opcion: "pesos", label: OPCION_LABEL.pesos, retornoReal: retornoPesos(assumptions), certeza: "media" });

  const adelantar = retornoAdelantar(credit);
  if (adelantar !== null) {
    candidatos.push({ opcion: "adelantar", label: OPCION_LABEL.adelantar, retornoReal: adelantar, certeza: "alta" });
  }

  const ranking = [...candidatos].sort((a, b) => b.retornoReal - a.retornoReal);
  return { ranking, resumen: resumir(ranking) };
}

function lecturaDolar(dolarReal: DolarReal, desde: string): string {
  const indice = dolarReal.indiceHoy ?? 100;
  const distancia = formatPercent(Math.abs(indice - 100));
  const lado = indice < 100 ? "por debajo de" : "por encima de";
  const ipc = dolarReal.ultimoPeriodoConIpc ? `, con IPC hasta ${formatMonthLabel(dolarReal.ultimoPeriodoConIpc)}` : "";
  return `El dólar está ${distancia} ${lado} su promedio desde ${formatMonthLabel(desde)}${ipc}.`;
}

function lecturaAdelantar(series: MacroSeriesDTO, retorno: number): string {
  const carrera = variacion12m(series);
  if (!carrera) return `Adelantar capital rinde ${signed(retorno)} real anual, y es el único retorno cierto.`;

  const verbo = carrera.deuda >= 0 ? "encareció" : "licuó";
  return `En ${carrera.meses} meses la UVA subió ${formatPercent(carrera.uva * 100)} y el dólar ${formatPercent(carrera.usd * 100)}: tu deuda se ${verbo} ${formatPercent(Math.abs(carrera.deuda) * 100)} medida en dólares.`;
}

export function buildSignals(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroSignal[] {
  if (series.meses.length === 0) return [];

  const dolarReal = dolarRealSeries(series);
  const { ranking } = buildVerdict(series, credit, assumptions);
  const signals: MacroSignal[] = [];

  if (dolarReal.indiceHoy !== null) {
    const indice = dolarReal.indiceHoy;
    signals.push({
      id: "dolar",
      label: "Dólar vs su promedio desde 2025",
      value: indice,
      format: "indice",
      status: indice < 100 - DOLAR_REAL_BANDA ? "good" : indice > 100 + DOLAR_REAL_BANDA ? "bad" : "neutral",
      reading: lecturaDolar(dolarReal, series.desde),
    });
  }

  const tasaReal = retornoPesos(assumptions);
  signals.push({
    id: "pesos",
    label: "Tasa real en pesos",
    value: tasaReal,
    format: "porcentaje",
    status: tasaReal > TASA_REAL_BANDA ? "good" : tasaReal < -TASA_REAL_BANDA ? "bad" : "neutral",
    reading: `Un plazo fijo a TNA ${formatPercent(assumptions.tasaAnualPesos)} deja ${signed(tasaReal)} real anual si la inflación se mantiene en ${formatPercent(assumptions.inflacionEsperada)}.`,
  });

  const adelantar = retornoAdelantar(credit);
  if (adelantar !== null) {
    const posicion = ranking.findIndex((opcion) => opcion.opcion === "adelantar");
    const mejor = ranking[0]?.retornoReal ?? adelantar;
    const empataConElMejor = adelantar >= mejor - EMPATE_PP;
    signals.push({
      id: "adelantar",
      label: "Adelantar capital",
      value: adelantar,
      format: "porcentaje",
      status: empataConElMejor ? "good" : posicion === ranking.length - 1 ? "bad" : "neutral",
      reading: lecturaAdelantar(series, adelantar),
    });
  }

  return signals;
}

export function buildMacroView(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroView {
  return {
    signals: buildSignals(series, credit, assumptions),
    verdict: buildVerdict(series, credit, assumptions),
    dolarReal: dolarRealSeries(series),
    tasaReal: tasaRealSeries(series),
  };
}
