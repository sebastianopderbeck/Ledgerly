import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf, weekdayOf } from "./isoDate.js";

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

const CORRIMIENTO_DIAS: Record<Corrimiento, Record<number, number>> = {
  adelante: { 6: 2, 0: 1 },
  atras: { 6: -1, 0: -2 },
};

const primeroDe = (mes: string): string => `${mes}-01`;

export function rangoDesde(hoy: string): RangoFechas {
  return { desde: hoy, hasta: lastDayOfMonth(addMonths(monthOf(hoy), MESES_ADELANTE)) };
}

const ordenarOcurrencias = (ocurrencias: Ocurrencia[]): Ocurrencia[] => {
  const porMes = new Map<string, Ocurrencia>();
  for (const ocurrencia of ocurrencias) {
    const anterior = porMes.get(ocurrencia.mes);
    if (!anterior || ocurrencia.fecha > anterior.fecha) porMes.set(ocurrencia.mes, ocurrencia);
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
};

const mediana = (valores: number[]): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio];
  return Math.round((ordenados[medio - 1] + ordenados[medio]) / 2);
};

export function desplazamientoTipico(ocurrencias: Ocurrencia[]): number | null {
  const muestra = ordenarOcurrencias(ocurrencias).slice(-MUESTRA_PATRON);
  if (muestra.length === 0) return null;
  return mediana(muestra.map(({ mes, fecha }) => daysBetween(primeroDe(mes), fecha)));
}

export function ajustarFinDeSemana(fecha: string, corrimiento: Corrimiento): string {
  return addDays(fecha, CORRIMIENTO_DIAS[corrimiento][weekdayOf(fecha)] ?? 0);
}

const fechaBase = (mes: string, desplazamiento: number): string => {
  const base = addDays(primeroDe(mes), desplazamiento);
  return desplazamiento >= 0 && monthOf(base) !== mes ? lastDayOfMonth(mes) : base;
};

export function proyectarFechas(ocurrencias: Ocurrencia[], rango: RangoFechas, corrimiento: Corrimiento): FechaProyectada[] {
  const desplazamiento = desplazamientoTipico(ocurrencias);
  const ultima = ordenarOcurrencias(ocurrencias).at(-1);
  if (desplazamiento === null || !ultima) return [];
  const mesTope = addMonths(monthOf(rango.hasta), 1);
  const proyectadas: FechaProyectada[] = [];
  for (let paso = 1; addMonths(ultima.mes, paso) <= mesTope; paso += 1) {
    const mes = addMonths(ultima.mes, paso);
    const fecha = ajustarFinDeSemana(fechaBase(mes, desplazamiento), corrimiento);
    if (fecha > rango.hasta) break;
    if (fecha >= rango.desde) proyectadas.push({ mes, fecha, paso });
  }
  return proyectadas;
}

export function estaDesactualizada(ultimoMes: string, desde: string): boolean {
  return ultimoMes < addMonths(monthOf(desde), -MESES_SIN_DOCUMENTO_MAX);
}
