import { addMonths, monthRange } from "./months.js";

export const MESES_AUMENTO = ["01", "05", "09"];
export const VENTANA_IPC = 4;

export interface MonthlyInflation {
  periodo: string;
  variacion: number;
}

export interface SalaryInflation {
  publicada: MonthlyInflation[];
  esperadaMensual: number;
}

export interface SalaryRaise {
  mes: string;
  porcentaje: number;
  conRem: boolean;
}

const isRaiseMonth = (mes: string): boolean => MESES_AUMENTO.includes(mes.slice(5, 7));

const latestPublished = (publicada: MonthlyInflation[]): MonthlyInflation | null =>
  publicada.reduce<MonthlyInflation | null>((latest, point) => (!latest || point.periodo > latest.periodo ? point : latest), null);

export const expectedMonthlyInflation = (rem12m: number | null, publicada: MonthlyInflation[]): number => {
  if (rem12m !== null) return (1 + rem12m / 100) ** (1 / 12) - 1;
  return latestPublished(publicada)?.variacion ?? 0;
};

const raiseFor = (mes: string, publicadaPorMes: Map<string, number>, esperadaMensual: number): SalaryRaise => {
  const ventana = monthRange(addMonths(mes, -VENTANA_IPC), addMonths(mes, -1));
  const tasas = ventana.map((periodo) => publicadaPorMes.get(periodo));
  const factor = tasas.reduce<number>((total, tasa) => total * (1 + (tasa ?? esperadaMensual)), 1);
  return { mes, porcentaje: factor - 1, conRem: tasas.some((tasa) => tasa === undefined) };
};

export const raisesBetween = (desde: string, hasta: string, inflacion: SalaryInflation): SalaryRaise[] => {
  const publicadaPorMes = new Map(inflacion.publicada.map(({ periodo, variacion }) => [periodo, variacion]));
  return monthRange(addMonths(desde, 1), hasta)
    .filter(isRaiseMonth)
    .map((mes) => raiseFor(mes, publicadaPorMes, inflacion.esperadaMensual));
};

export const raiseFactor = (raises: SalaryRaise[]): number =>
  raises.reduce((factor, { porcentaje }) => factor * (1 + porcentaje), 1);
