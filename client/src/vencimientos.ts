import type {
  AutoCouponDTO, AutoSummaryDTO, CreditSummaryDTO, Issuer, MortgageCouponDTO, PayslipDTO, StatementDTO,
} from "@ledgerly/shared";
import { formatMoney, formatUva } from "./format.js";
import {
  addDays, addMonths, daysBetween, formatDayMonth, formatDayOfMonthLong, formatMonthYear, formatWeekdayShort,
  lastDayOfMonth, monthOf, startOfWeek, weekdayOf,
} from "./isoDate.js";

export const MESES_ADELANTE = 2;
export const MUESTRA_PATRON = 6;
export const MESES_SIN_DOCUMENTO_MAX = 3;
export const DIAS_CIERRE_A_VENCIMIENTO = 12;

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
  montoAproximado: boolean;
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

interface Agrupador {
  clave: (fecha: string) => string;
  titulo: (clave: string, hoy: string) => string;
}

type DatosVencimiento = Pick<Vencimiento, "fecha" | "titulo" | "detalle" | "monto" | "montoUsd">;

type DatosDocumento = DatosVencimiento & Pick<Vencimiento, "estado">;

interface DefinicionFuente {
  tipo: VencimientoTipo;
  sentido: VencimientoSentido;
  clave: string | null;
  etiqueta: string;
  corrimiento: Corrimiento;
  ocurrencias: Ocurrencia[];
  documentos: DatosDocumento[];
  pasosRestantes: number;
  estimar: (proyectada: FechaProyectada) => Omit<DatosVencimiento, "fecha">;
}

interface ResumenConVencimiento { statement: StatementDTO; fecha: string; confirmado: boolean; }

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
  const crear = (datos: DatosVencimiento, estado: VencimientoEstado, montoAproximado: boolean): Vencimiento => ({
    id: clave ? `${tipo}-${clave}-${datos.fecha}` : `${tipo}-${datos.fecha}`,
    tipo,
    sentido,
    estado,
    montoAproximado,
    ...datos,
  });
  const ultimoMes = ordenarOcurrencias(ocurrencias).at(-1)?.mes;
  const terminada = pasosRestantes <= 0;
  const desactualizada = !terminada && ultimoMes !== undefined && estaDesactualizada(ultimoMes, rango.desde);
  const documentados = documentos
    .filter(({ fecha }) => enRango(fecha, rango))
    .map(({ estado, ...datos }) => crear(datos, estado, false));
  const proyectadas = terminada || desactualizada ? [] : proyectarFechas(ocurrencias, rango, corrimiento);
  const estimados = proyectadas
    .filter(({ paso }) => paso <= pasosRestantes)
    .map((proyectada) => crear({ fecha: proyectada.fecha, ...estimar(proyectada) }, "estimado", true));
  return { etiqueta, items: unicosPorId([...documentados, ...estimados]), desactualizada };
};

const estadoDe = (confirmado: boolean): VencimientoEstado => (confirmado ? "confirmado" : "estimado");

const vencimientoDeResumen = (statement: StatementDTO): ResumenConVencimiento | null => {
  if (statement.dueDate) return { statement, fecha: statement.dueDate, confirmado: true };
  if (!statement.closingDate) return null;
  const fecha = ajustarFinDeSemana(addDays(statement.closingDate, DIAS_CIERRE_A_VENCIMIENTO), "adelante");
  return { statement, fecha, confirmado: false };
};

const tieneVencimiento = (resumen: ResumenConVencimiento | null): resumen is ResumenConVencimiento => resumen !== null;

const porVencimientoEImportacion = (a: ResumenConVencimiento, b: ResumenConVencimiento): number =>
  a.fecha.localeCompare(b.fecha) || a.statement.uploadedAt.localeCompare(b.statement.uploadedAt);

const detalleResumen = ({ statement, confirmado }: ResumenConVencimiento): string => {
  const origen = statement.closingDate ? `Resumen con cierre ${formatDayMonth(statement.closingDate)}` : "Resumen importado";
  const vencimiento = confirmado ? "" : " · vencimiento estimado";
  return `${origen}${vencimiento} · mín. ${formatMoney(statement.totals.pagoMinimo.ars, "ARS")}`;
};

const detallePatron = (cantidad: number): string =>
  cantidad === 1 ? "Según el último resumen" : `Según los últimos ${cantidad} resúmenes`;

const fuenteDeTarjeta = (issuer: Issuer, resumenes: ResumenConVencimiento[], rango: RangoFechas): FuenteVencimientos => {
  const ordenados = [...resumenes].sort(porVencimientoEImportacion);
  const ultimo = ordenados[ordenados.length - 1].statement;
  const ocurrencias = ordenados.map(({ fecha }) => ({ mes: monthOf(fecha), fecha }));
  const detalle = detallePatron(Math.min(MUESTRA_PATRON, ordenarOcurrencias(ocurrencias).length));
  return armarFuente({
    tipo: "tarjeta",
    sentido: "pago",
    clave: issuer,
    etiqueta: ultimo.cardLabel,
    corrimiento: "adelante",
    ocurrencias,
    documentos: ordenados.map((resumen) => ({
      fecha: resumen.fecha,
      estado: estadoDe(resumen.confirmado),
      titulo: resumen.statement.cardLabel,
      detalle: detalleResumen(resumen),
      monto: resumen.statement.totals.saldoActual.ars,
      montoUsd: resumen.statement.totals.saldoActual.usd > 0 ? resumen.statement.totals.saldoActual.usd : null,
    })),
    pasosRestantes: SIN_LIMITE,
    estimar: () => ({ titulo: ultimo.cardLabel, detalle, monto: null, montoUsd: null }),
  }, rango);
};

export function vencimientosDeTarjetas(statements: StatementDTO[], rango: RangoFechas): FuenteVencimientos[] {
  const resumenes = statements.map(vencimientoDeResumen).filter(tieneVencimiento);
  const emisores = [...new Set(resumenes.map(({ statement }) => statement.issuer))].sort();
  return emisores.map((issuer) =>
    fuenteDeTarjeta(issuer, resumenes.filter(({ statement }) => statement.issuer === issuer), rango));
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
      estado: "confirmado",
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
      estado: "confirmado",
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
      estado: "confirmado",
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

const ORDEN_SENTIDO: Record<VencimientoSentido, number> = { cobro: 0, pago: 1 };

const compararVencimientos = (a: Vencimiento, b: Vencimiento): number =>
  a.fecha.localeCompare(b.fecha) || ORDEN_SENTIDO[a.sentido] - ORDEN_SENTIDO[b.sentido] || a.titulo.localeCompare(b.titulo);

export function listVencimientos(input: VencimientosInput, rango: RangoFechas): VencimientosView {
  const fuentes = [
    ...vencimientosDeTarjetas(input.statements, rango),
    ...vencimientosDeCredito(input.creditCoupons, input.creditSummary?.cuotasTotales ?? null, input.uvaHoy, rango),
    ...vencimientosDeAuto(input.autoCoupons, input.autoSummary?.cuotasTotales ?? null, rango),
    ...vencimientosDeSueldo(input.payslips, rango),
  ];
  return {
    rango,
    items: fuentes.flatMap(({ items }) => items).sort(compararVencimientos),
    sinEstimar: fuentes.filter(({ desactualizada }) => desactualizada).map(({ etiqueta }) => etiqueta),
  };
}

export function hayDocumentos({ statements, creditCoupons, autoCoupons, payslips }: VencimientosInput): boolean {
  return statements.length + creditCoupons.length + autoCoupons.length + payslips.length > 0;
}

export const isAgrupacion = (value: unknown): value is Agrupacion => value === "semana" || value === "mes";

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

const tituloSemana = (clave: string, hoy: string): string => {
  const estaSemana = startOfWeek(hoy);
  if (clave === estaSemana) return "Esta semana";
  if (clave === addDays(estaSemana, 7)) return "La semana que viene";
  return `Semana del ${formatDayOfMonthLong(clave)}`;
};

const tituloMes = (clave: string, hoy: string): string =>
  clave === monthOf(hoy) ? "Este mes" : capitalizar(formatMonthYear(clave));

const AGRUPADORES: Record<Agrupacion, Agrupador> = {
  semana: { clave: startOfWeek, titulo: tituloSemana },
  mes: { clave: monthOf, titulo: tituloMes },
};

const sumar = (items: Vencimiento[], valor: (item: Vencimiento) => number | null): number =>
  items.reduce((total, item) => total + (valor(item) ?? 0), 0);

const hayMontoAproximado = (items: Vencimiento[]): boolean =>
  items.some(({ montoAproximado, monto }) => montoAproximado && monto !== null);

const armarGrupo = (clave: string, titulo: string, items: Vencimiento[]): GrupoVencimientos => {
  const pagos = items.filter(({ sentido }) => sentido === "pago");
  const cobros = items.filter(({ sentido }) => sentido === "cobro");
  return {
    clave,
    titulo,
    items,
    totalPagos: sumar(pagos, ({ monto }) => monto),
    totalPagosUsd: sumar(pagos, ({ montoUsd }) => montoUsd),
    totalCobros: sumar(cobros, ({ monto }) => monto),
    pagosAproximados: hayMontoAproximado(pagos),
    cobrosAproximados: hayMontoAproximado(cobros),
    aConfirmar: items.filter(({ monto }) => monto === null).length,
  };
};

export function agruparVencimientos(items: Vencimiento[], agrupacion: Agrupacion, hoy: string): GrupoVencimientos[] {
  const { clave: claveDe, titulo } = AGRUPADORES[agrupacion];
  const porClave = new Map<string, Vencimiento[]>();
  for (const item of items) {
    const clave = claveDe(item.fecha);
    porClave.set(clave, [...(porClave.get(clave) ?? []), item]);
  }
  return [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, delGrupo]) => armarGrupo(clave, titulo(clave, hoy), delGrupo));
}

const prefijoAproximado = (aproximado: boolean): string => (aproximado ? "≈ " : "");

const tieneMonto = (items: Vencimiento[], sentido: VencimientoSentido): boolean =>
  items.some((item) => item.sentido === sentido && item.monto !== null);

export function resumenDeGrupo({
  items, totalPagos, totalPagosUsd, totalCobros, pagosAproximados, cobrosAproximados, aConfirmar,
}: GrupoVencimientos): string {
  const partes = [
    tieneMonto(items, "pago") ? `Pagos ${prefijoAproximado(pagosAproximados)}${formatMoney(totalPagos, "ARS")}` : null,
    totalPagosUsd > 0 ? `+ ${formatMoney(totalPagosUsd, "USD")}` : null,
    tieneMonto(items, "cobro") ? `Cobros ${prefijoAproximado(cobrosAproximados)}${formatMoney(totalCobros, "ARS")}` : null,
    aConfirmar > 0 ? `${aConfirmar} a confirmar` : null,
  ];
  return partes.filter((parte): parte is string => parte !== null).join(" · ");
}

export function montoTexto({ monto, sentido, montoAproximado }: Vencimiento): string {
  if (monto === null) return "A confirmar";
  const signo = sentido === "cobro" ? "+" : "";
  return `${prefijoAproximado(montoAproximado)}${signo}${formatMoney(monto, "ARS")}`;
}

export function montoUsdTexto({ montoUsd }: Vencimiento): string | null {
  return montoUsd === null ? null : `+ ${formatMoney(montoUsd, "USD")}`;
}

export function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  if (fecha === addDays(hoy, 1)) return "mañana";
  return formatWeekdayShort(fecha);
}

export const diaDelMes = (fecha: string): number => Number(fecha.slice(8, 10));

export function notaSinEstimar(sinEstimar: string[]): string | null {
  if (sinEstimar.length === 0) return null;
  return `Sin estimar porque no hay documentos de los últimos ${MESES_SIN_DOCUMENTO_MAX} meses: ${sinEstimar.join(", ")}.`;
}
