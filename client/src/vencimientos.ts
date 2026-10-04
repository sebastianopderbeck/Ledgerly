import type { AutoCouponDTO, Issuer, MortgageCouponDTO, PayslipDTO, StatementDTO } from "@ledgerly/shared";
import { formatMoney, formatUva } from "./format.js";
import {
  addDays, addMonths, daysBetween, formatDayMonth, formatMonthYear, lastDayOfMonth, monthOf, weekdayOf,
} from "./isoDate.js";

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

type DatosVencimiento = Pick<Vencimiento, "fecha" | "titulo" | "detalle" | "monto" | "montoUsd">;

interface DefinicionFuente {
  tipo: VencimientoTipo;
  sentido: VencimientoSentido;
  clave: string | null;
  etiqueta: string;
  corrimiento: Corrimiento;
  ocurrencias: Ocurrencia[];
  documentos: DatosVencimiento[];
  pasosRestantes: number;
  estimar: (proyectada: FechaProyectada) => Omit<DatosVencimiento, "fecha">;
}

type StatementConVencimiento = StatementDTO & { dueDate: string };

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

const ETIQUETA_CREDITO = "Crédito UVA";
const ETIQUETA_AUTO = "Plan del auto";
const ETIQUETA_SUELDO = "Sueldo";
const SIN_LIMITE = Number.POSITIVE_INFINITY;

const enRango = (fecha: string, { desde, hasta }: RangoFechas): boolean => fecha >= desde && fecha <= hasta;

const unicosPorId = (items: Vencimiento[]): Vencimiento[] => [...new Map(items.map((item) => [item.id, item])).values()];

const pasosHastaElFinal = (cuotasTotales: number | null, ultimaCuota: number): number =>
  cuotasTotales === null ? SIN_LIMITE : cuotasTotales - ultimaCuota;

const armarFuente = (
  { tipo, sentido, clave, etiqueta, corrimiento, ocurrencias, documentos, pasosRestantes, estimar }: DefinicionFuente,
  rango: RangoFechas,
): FuenteVencimientos => {
  const crear = (estado: VencimientoEstado, datos: DatosVencimiento): Vencimiento => ({
    id: clave ? `${tipo}-${clave}-${datos.fecha}` : `${tipo}-${datos.fecha}`,
    tipo,
    sentido,
    estado,
    ...datos,
  });
  const ultimoMes = ordenarOcurrencias(ocurrencias).at(-1)?.mes;
  const terminada = pasosRestantes <= 0;
  const desactualizada = !terminada && ultimoMes !== undefined && estaDesactualizada(ultimoMes, rango.desde);
  const confirmados = documentos.filter(({ fecha }) => enRango(fecha, rango)).map((datos) => crear("confirmado", datos));
  const proyectadas = terminada || desactualizada ? [] : proyectarFechas(ocurrencias, rango, corrimiento);
  const estimados = proyectadas
    .filter(({ paso }) => paso <= pasosRestantes)
    .map((proyectada) => crear("estimado", { fecha: proyectada.fecha, ...estimar(proyectada) }));
  return { etiqueta, items: unicosPorId([...confirmados, ...estimados]), desactualizada };
};

const tieneVencimiento = (statement: StatementDTO): statement is StatementConVencimiento => statement.dueDate !== null;

const porVencimientoEImportacion = (a: StatementConVencimiento, b: StatementConVencimiento): number =>
  a.dueDate.localeCompare(b.dueDate) || a.uploadedAt.localeCompare(b.uploadedAt);

const detalleResumen = ({ closingDate, totals }: StatementDTO): string => {
  const origen = closingDate ? `Resumen con cierre ${formatDayMonth(closingDate)}` : "Resumen importado";
  return `${origen} · mín. ${formatMoney(totals.pagoMinimo.ars, "ARS")}`;
};

const detallePatron = (cantidad: number): string =>
  cantidad === 1 ? "Según el último resumen" : `Según los últimos ${cantidad} resúmenes`;

const fuenteDeTarjeta = (issuer: Issuer, statements: StatementConVencimiento[], rango: RangoFechas): FuenteVencimientos => {
  const ordenados = [...statements].sort(porVencimientoEImportacion);
  const ultimo = ordenados[ordenados.length - 1];
  const ocurrencias = ordenados.map(({ dueDate }) => ({ mes: monthOf(dueDate), fecha: dueDate }));
  const detalle = detallePatron(Math.min(MUESTRA_PATRON, ordenarOcurrencias(ocurrencias).length));
  return armarFuente({
    tipo: "tarjeta",
    sentido: "pago",
    clave: issuer,
    etiqueta: ultimo.cardLabel,
    corrimiento: "adelante",
    ocurrencias,
    documentos: ordenados.map((statement) => ({
      fecha: statement.dueDate,
      titulo: statement.cardLabel,
      detalle: detalleResumen(statement),
      monto: statement.totals.saldoActual.ars,
      montoUsd: statement.totals.saldoActual.usd > 0 ? statement.totals.saldoActual.usd : null,
    })),
    pasosRestantes: SIN_LIMITE,
    estimar: () => ({ titulo: ultimo.cardLabel, detalle, monto: null, montoUsd: null }),
  }, rango);
};

export function vencimientosDeTarjetas(statements: StatementDTO[], rango: RangoFechas): FuenteVencimientos[] {
  const conVencimiento = statements.filter(tieneVencimiento);
  const emisores = [...new Set(conVencimiento.map(({ issuer }) => issuer))].sort();
  return emisores.map((issuer) =>
    fuenteDeTarjeta(issuer, conVencimiento.filter((statement) => statement.issuer === issuer), rango));
}

const ultimaCuota = <T extends { cuotaNro: number }>(coupons: T[]): T =>
  coupons.reduce((ultimo, coupon) => (coupon.cuotaNro > ultimo.cuotaNro ? coupon : ultimo));

export function estimarCuotaCredito(ultimo: MortgageCouponDTO, uvaHoy: number | null): number {
  const uva = Math.max(uvaHoy ?? 0, ultimo.cotizacionUva);
  const resto = ultimo.totalDebitado - ultimo.capital - ultimo.intereses;
  return ultimo.cuotaPuraUva * uva + resto;
}

export function vencimientosDeCredito(
  coupons: MortgageCouponDTO[],
  cuotasTotales: number | null,
  uvaHoy: number | null,
  rango: RangoFechas,
): FuenteVencimientos[] {
  if (coupons.length === 0) return [];
  const ultimo = ultimaCuota(coupons);
  const conUvaDeHoy = uvaHoy !== null && uvaHoy > ultimo.cotizacionUva;
  const detalle = conUvaDeHoy ? `${formatUva(ultimo.cuotaPuraUva)} a la UVA de hoy` : `Igual a la cuota ${ultimo.cuotaNro}`;
  const monto = estimarCuotaCredito(ultimo, uvaHoy);
  return [armarFuente({
    tipo: "credito",
    sentido: "pago",
    clave: null,
    etiqueta: ETIQUETA_CREDITO,
    corrimiento: "adelante",
    ocurrencias: coupons.map(({ fechaDebito }) => ({ mes: monthOf(fechaDebito), fecha: fechaDebito })),
    documentos: coupons.map((coupon) => ({
      fecha: coupon.fechaDebito,
      titulo: `${ETIQUETA_CREDITO} · cuota ${coupon.cuotaNro}`,
      detalle: `Cupón importado · ${formatUva(coupon.cuotaPuraUva)}`,
      monto: coupon.totalDebitado,
      montoUsd: null,
    })),
    pasosRestantes: pasosHastaElFinal(cuotasTotales, ultimo.cuotaNro),
    estimar: ({ paso }) => ({ titulo: `${ETIQUETA_CREDITO} · cuota ${ultimo.cuotaNro + paso}`, detalle, monto, montoUsd: null }),
  }, rango)];
}

export function vencimientosDeAuto(coupons: AutoCouponDTO[], cuotasTotales: number | null, rango: RangoFechas): FuenteVencimientos[] {
  if (coupons.length === 0) return [];
  const ultimo = ultimaCuota(coupons);
  return [armarFuente({
    tipo: "auto",
    sentido: "pago",
    clave: null,
    etiqueta: ETIQUETA_AUTO,
    corrimiento: "adelante",
    ocurrencias: coupons.map(({ fechaVencimiento }) => ({ mes: monthOf(fechaVencimiento), fecha: fechaVencimiento })),
    documentos: coupons.map((coupon) => ({
      fecha: coupon.fechaVencimiento,
      titulo: `${ETIQUETA_AUTO} · cuota ${coupon.cuotaNro}`,
      detalle: "Cupón importado",
      monto: coupon.totalAPagar,
      montoUsd: null,
    })),
    pasosRestantes: pasosHastaElFinal(cuotasTotales, ultimo.cuotaNro),
    estimar: ({ paso }) => ({
      titulo: `${ETIQUETA_AUTO} · cuota ${ultimo.cuotaNro + paso}`,
      detalle: `Igual a la cuota ${ultimo.cuotaNro}`,
      monto: ultimo.totalAPagar,
      montoUsd: null,
    }),
  }, rango)];
}

export function vencimientosDeSueldo(payslips: PayslipDTO[], rango: RangoFechas): FuenteVencimientos[] {
  const mensuales = payslips.filter(({ tipo }) => tipo === "mensual");
  if (mensuales.length === 0) return [];
  const ultimo = mensuales.reduce((actual, recibo) => (recibo.periodo > actual.periodo ? recibo : actual));
  return [armarFuente({
    tipo: "sueldo",
    sentido: "cobro",
    clave: null,
    etiqueta: ETIQUETA_SUELDO,
    corrimiento: "atras",
    ocurrencias: mensuales.map(({ periodo, fechaPago }) => ({ mes: addMonths(periodo, 1), fecha: fechaPago })),
    documentos: mensuales.map(({ periodo, fechaPago, neto }) => ({
      fecha: fechaPago,
      titulo: `${ETIQUETA_SUELDO} de ${formatMonthYear(periodo)}`,
      detalle: "Recibo importado",
      monto: neto,
      montoUsd: null,
    })),
    pasosRestantes: SIN_LIMITE,
    estimar: ({ mes }) => ({
      titulo: `${ETIQUETA_SUELDO} de ${formatMonthYear(addMonths(mes, -1))}`,
      detalle: `Igual al neto de ${formatMonthYear(ultimo.periodo)}`,
      monto: ultimo.neto,
      montoUsd: null,
    }),
  }, rango)];
}
