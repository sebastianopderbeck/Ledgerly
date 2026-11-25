import type { PayslipDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel } from "./format.js";
import {
  CODIGO_AJUSTE_ANIO_ANTERIOR,
  CODIGOS_APORTES_DEDUCIBLES,
  CODIGOS_RETENIDO,
  sumarConceptos,
} from "./gananciasConceptos.js";
import { TABLAS_GANANCIAS, type TablasAnio, type TablasMes, type TramoEscala } from "./gananciasTablas.js";
import { monthLabel } from "./payslipConcepts.js";

export interface MesDeCobro {
  anio: number;
  mes: number;
}

export type VeredictoRetencion = "coincide" | "de_mas" | "de_menos";

export interface MesRetencion {
  mes: number;
  recibos: string[];
  gananciaNetaSujeta: number;
  esperado: number;
  retenido: number;
  diferencia: number;
  veredicto: VeredictoRetencion;
  cambioDeTablas: boolean;
}

export type AvisoRetencion =
  | { tipo: "falta_recibo"; periodo: string; sac: boolean; hastaMes: number }
  | { tipo: "faltan_tablas"; desdeMes: number };

export interface AjusteAnioAnterior {
  anio: number;
  monto: number;
}

export type ResultadoRetencion =
  | { estado: "sin_recibos" }
  | { estado: "sin_tablas"; anio: number }
  | {
    estado: "calculado";
    anio: number;
    meses: MesRetencion[];
    avisos: AvisoRetencion[];
    ajusteAnioAnterior: AjusteAnioAnterior | null;
  };

interface ReciboCobrado extends MesDeCobro {
  payslip: PayslipDTO;
}

interface ReciboRequerido {
  periodo: string;
  sac: boolean;
}

export const TOLERANCIA_RETENCION = 0.01;

const MESES_DEL_ANIO = 12;
const MESES_CON_SAC = [6, 12];
const MESES_CON_CAMBIO_DE_TABLAS = [1, 7];
const CODIGOS_AJUSTE_ANIO_ANTERIOR: ReadonlySet<string> = new Set([CODIGO_AJUSTE_ANIO_ANTERIOR]);

const VEREDICTO_LABEL: Record<VeredictoRetencion, string> = {
  coincide: "Coincide",
  de_mas: "Te retienen de más",
  de_menos: "Te retienen de menos",
};

export type ColorVeredicto = "success" | "warning" | "error";

const VEREDICTO_COLOR: Record<VeredictoRetencion, ColorVeredicto> = {
  coincide: "success",
  de_mas: "warning",
  de_menos: "error",
};

export const mesDeCobro = ({ periodo, tipo }: Pick<PayslipDTO, "periodo" | "tipo">): MesDeCobro => {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  if (tipo === "sac") return { anio, mes };
  return mes === MESES_DEL_ANIO ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
};

export const impuestoSegunEscala = (escala: readonly TramoEscala[], gananciaNetaSujeta: number): number => {
  if (gananciaNetaSujeta <= 0) return 0;
  const tramo = escala.find(({ hasta }) => hasta === null || gananciaNetaSujeta <= hasta);
  if (!tramo) return 0;
  return tramo.pagaran + (gananciaNetaSujeta - tramo.desde) * tramo.alicuota / 100;
};

export const veredictoRetencion = (diferencia: number, esperado: number): VeredictoRetencion => {
  if (Math.abs(diferencia) <= TOLERANCIA_RETENCION * esperado) return "coincide";
  return diferencia > 0 ? "de_mas" : "de_menos";
};

export const veredictoRetencionLabel = (veredicto: VeredictoRetencion): string => VEREDICTO_LABEL[veredicto];

export const veredictoRetencionColor = (veredicto: VeredictoRetencion): ColorVeredicto => VEREDICTO_COLOR[veredicto];

const periodoDe = (anio: number, mes: number): string => `${anio}-${String(mes).padStart(2, "0")}`;

export const mesDeCobroLabel = (anio: number, mes: number): string => formatMonthLabel(periodoDe(anio, mes));

const periodoMensualCobradoEn = (anio: number, mes: number): string =>
  mes === 1 ? periodoDe(anio - 1, MESES_DEL_ANIO) : periodoDe(anio, mes - 1);

const recibosRequeridos = (anio: number, mes: number): ReciboRequerido[] => {
  const mensual = { periodo: periodoMensualCobradoEn(anio, mes), sac: false };
  return MESES_CON_SAC.includes(mes) ? [mensual, { periodo: periodoDe(anio, mes), sac: true }] : [mensual];
};

const esElRecibo = ({ periodo, tipo }: PayslipDTO, requerido: ReciboRequerido): boolean =>
  periodo === requerido.periodo && (tipo === "sac") === requerido.sac;

const reciboLabel = ({ periodo, tipo }: PayslipDTO): string =>
  `${tipo === "sac" ? "SAC " : ""}${monthLabel(periodo)} ${periodo.slice(0, 4)}`;

const sumar = (recibos: ReciboCobrado[], valor: (payslip: PayslipDTO) => number): number =>
  recibos.reduce((total, { payslip }) => total + valor(payslip), 0);

const remunerativoDe = (payslip: PayslipDTO): number => payslip.remunerativo;

const aportesDe = (payslip: PayslipDTO): number => sumarConceptos(payslip, CODIGOS_APORTES_DEDUCIBLES);

const retenidoDe = (payslip: PayslipDTO): number => sumarConceptos(payslip, CODIGOS_RETENIDO);

const mensualesPrimero = (a: ReciboCobrado, b: ReciboCobrado): number =>
  Number(a.payslip.tipo === "sac") - Number(b.payslip.tipo === "sac");

const mesRetencion = (cobrados: ReciboCobrado[], mes: number, tablasMes: TablasMes, topeHipotecarioAnual: number): MesRetencion => {
  const ultimoSac = Math.max(0, ...cobrados.filter(({ payslip }) => payslip.tipo === "sac").map((recibo) => recibo.mes));
  const conDoceava = cobrados.filter((recibo) => recibo.payslip.tipo === "mensual" && recibo.mes > ultimoSac);
  const bruto = sumar(cobrados, remunerativoDe) + sumar(conDoceava, remunerativoDe) / MESES_DEL_ANIO;
  const aportes = sumar(cobrados, aportesDe) + sumar(conDoceava, aportesDe) / MESES_DEL_ANIO;
  const deducciones = tablasMes.gananciaNoImponible + tablasMes.deduccionEspecial;
  const hipotecario = topeHipotecarioAnual * mes / MESES_DEL_ANIO;
  const gananciaNetaSujeta = bruto - aportes - deducciones - deducciones / MESES_DEL_ANIO - hipotecario;
  const esperado = impuestoSegunEscala(tablasMes.escala, gananciaNetaSujeta);
  const retenido = sumar(cobrados, retenidoDe);
  const diferencia = retenido - esperado;
  const delMes = cobrados.filter((recibo) => recibo.mes === mes).sort(mensualesPrimero);
  return {
    mes,
    recibos: delMes.map(({ payslip }) => reciboLabel(payslip)),
    gananciaNetaSujeta,
    esperado,
    retenido,
    diferencia,
    veredicto: veredictoRetencion(diferencia, esperado),
    cambioDeTablas: MESES_CON_CAMBIO_DE_TABLAS.includes(mes),
  };
};

const ajusteDelAnioAnterior = (delAnio: ReciboCobrado[], anio: number): AjusteAnioAnterior | null => {
  const monto = sumar(delAnio, (payslip) => sumarConceptos(payslip, CODIGOS_AJUSTE_ANIO_ANTERIOR));
  return monto === 0 ? null : { anio: anio - 1, monto };
};

const calcularMeses = (delAnio: ReciboCobrado[], anio: number, tablasAnio: TablasAnio) => {
  const ultimoCobro = Math.max(...delAnio.map((recibo) => recibo.mes));
  const meses: MesRetencion[] = [];
  for (let mes = 1; mes <= ultimoCobro; mes += 1) {
    const tablasMes = tablasAnio.meses[mes - 1];
    if (!tablasMes) return { meses, avisos: [{ tipo: "faltan_tablas", desdeMes: mes } as const] };
    const faltante = recibosRequeridos(anio, mes).find((requerido) => !delAnio.some(({ payslip }) => esElRecibo(payslip, requerido)));
    if (faltante) return { meses, avisos: [{ tipo: "falta_recibo", ...faltante, hastaMes: mes - 1 } as const] };
    const cobradosHastaElMes = delAnio.filter((recibo) => recibo.mes <= mes);
    meses.push(mesRetencion(cobradosHastaElMes, mes, tablasMes, tablasAnio.topeHipotecarioAnual));
  }
  return { meses, avisos: [] };
};

export const retencionGanancias = (
  payslips: PayslipDTO[],
  tablas: ReadonlyMap<number, TablasAnio> = TABLAS_GANANCIAS,
): ResultadoRetencion => {
  if (payslips.length === 0) return { estado: "sin_recibos" };
  const cobrados: ReciboCobrado[] = payslips.map((payslip) => ({ payslip, ...mesDeCobro(payslip) }));
  const anio = Math.max(...cobrados.map((recibo) => recibo.anio));
  const tablasAnio = tablas.get(anio);
  if (!tablasAnio) return { estado: "sin_tablas", anio };
  const delAnio = cobrados.filter((recibo) => recibo.anio === anio);
  const { meses, avisos } = calcularMeses(delAnio, anio, tablasAnio);
  return { estado: "calculado", anio, meses, avisos, ajusteAnioAnterior: ajusteDelAnioAnterior(delAnio, anio) };
};

const nombreMes = (mes: number): string =>
  new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(2000, mes - 1, 1));

const periodoTexto = (periodo: string): string => `${nombreMes(Number(periodo.slice(5, 7)))} ${periodo.slice(0, 4)}`;

const alcanceTexto = (hastaMes: number, faltante: string): string =>
  hastaMes === 0 ? `sin ${faltante} no se puede calcular.` : `la cuenta llega hasta ${nombreMes(hastaMes)}.`;

export const avisoRetencionTexto = (aviso: AvisoRetencion, anio: number): string => {
  if (aviso.tipo === "faltan_tablas") {
    return `Faltan las tablas de ARCA desde ${nombreMes(aviso.desdeMes)} ${anio}: ${alcanceTexto(aviso.desdeMes - 1, "ellas")}`;
  }
  const recibo = aviso.sac ? `el recibo del SAC de ${periodoTexto(aviso.periodo)}` : `el recibo de ${periodoTexto(aviso.periodo)}`;
  return `Falta ${recibo}: ${alcanceTexto(aviso.hastaMes, "él")}`;
};

export const ajusteAnioAnteriorTexto = ({ anio: anioAjuste, monto }: AjusteAnioAnterior, anio: number): string =>
  `Ajuste de la liquidación anual ${anioAjuste}: ${formatMoney(monto, "ARS")} (no entra en la cuenta de ${anio})`;
