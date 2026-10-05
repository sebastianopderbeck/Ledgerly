import type { InflationRateDTO } from "@ledgerly/shared";
import { addMonths } from "./isoDate.js";

export interface InflationAssumption {
  periodo: string;
  variacionMensual: number;
}

export interface InflationFactor {
  factor: number;
  estimated: boolean;
}

export interface Deflator {
  pesosDe: string;
  factor: (periodo: string) => number;
}

const growth = (variacionMensual: number): number => 1 + variacionMensual / 100;

export function inflationRates(inflation: InflationRateDTO[]): Map<string, number> {
  return new Map(inflation.map(({ periodo, variacionMensual }) => [periodo, variacionMensual]));
}

export function latestInflation(inflation: InflationRateDTO[]): InflationAssumption | null {
  if (inflation.length === 0) return null;
  const latest = inflation.reduce((best, rate) => (rate.periodo > best.periodo ? rate : best));
  return { periodo: latest.periodo, variacionMensual: latest.variacionMensual };
}

export function latestInflationPeriod(inflation: InflationRateDTO[]): string | null {
  return latestInflation(inflation)?.periodo ?? null;
}

export function inflationFactor(inflation: InflationRateDTO[], from: string, to: string): number {
  if (from === to) return 1;
  if (from > to) return 1 / inflationFactor(inflation, to, from);
  return inflation
    .filter(({ periodo }) => periodo > from && periodo <= to)
    .reduce((factor, { variacionMensual }) => factor * growth(variacionMensual), 1);
}

export function inflationFactorBetween(
  rates: Map<string, number>,
  fromPeriodo: string,
  toPeriodo: string,
  assumption: InflationAssumption,
): InflationFactor {
  let factor = 1;
  let estimated = false;
  for (let month = addMonths(fromPeriodo, 1); month <= toPeriodo; month = addMonths(month, 1)) {
    const published = rates.get(month);
    if (published === undefined) estimated = true;
    factor *= growth(published ?? assumption.variacionMensual);
  }
  return { factor, estimated };
}

export function buildDeflator(inflation: InflationRateDTO[]): Deflator | null {
  const pesosDe = latestInflationPeriod(inflation);
  if (pesosDe === null) return null;
  return {
    pesosDe,
    factor: (periodo: string) => (periodo >= pesosDe ? 1 : inflationFactor(inflation, periodo, pesosDe)),
  };
}
