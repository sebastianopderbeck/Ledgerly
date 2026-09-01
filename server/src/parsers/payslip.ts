import type { ParsedPayslip, ParsedPayslipConcepto, PayslipConceptoTipo, PayslipParseHints, PayslipParser, PayslipTipo } from "@ledgerly/shared";
import { MONTHS_ES, parseArAmount } from "./normalize.js";

const CODE = /(?<!\d)(0\d{3}|9999)(?=\s+[A-Za-zÁÉÍÓÚÑ])/g;
const SEGMENT = /^\s+([A-Za-zÁÉÍÓÚÑ].*?)\s+((?:-?\d[\d.]*,\d{2})(?:\s+-?\d[\d.]*,\d{2})*)/;
const AR_AMOUNT = /-?\d[\d.]*,\d{2}/g;
const CUIL_PERSONA = new Set(["20", "23", "24", "27"]);
const PERIODO = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/i;
const FECHA_DEPOSITO = /DEP[ÓO]SITO\s+\d{1,2}\/\d{4}\s+\d{1,2}\/(\d{1,2})\/(\d{4})/i;
const COSTO_EMPLEADOR = /COSTO TOTAL EMPLEADOR\s*\$?\s*(\d[\d.]*,\d{2})/i;
const SAC_PERIODO = /\b(primer|segundo|1er|2do|1°|2°)\s+SAC\s+(\d{4})\b/i;
const SAC_MARCA = /(?:^|[^a-z])sac(?:[^a-z]|$)/i;
const SAC_ORDINAL = /(primer|segundo|1er|2do|1°|2°)/i;
const SAC_ANIO = /(?<!\d)(20\d{2})(?!\d)/;
const SAC_PRIMER_SEMESTRE = /^(primer|1er|1°)$/i;

const semestreDeSac = (ordinal: string): string => (SAC_PRIMER_SEMESTRE.test(ordinal) ? "06" : "12");

const round2 = (value: number): number => Math.round(value * 100) / 100;

function clasificar(codigo: string, label: string): PayslipConceptoTipo | null {
  if (codigo.startsWith("05")) return null;
  if (/OBRA\s+SOCIAL/i.test(label)) return "descuento";
  if (codigo.startsWith("04")) return "descuento";
  if (codigo === "9999") return "no_remunerativo";
  return "remunerativo";
}

function parseConceptos(text: string): ParsedPayslipConcepto[] {
  const flat = text.replace(/\$/g, " ").replace(/\s+/g, " ");
  const starts = [...flat.matchAll(CODE)].map((m) => ({ codigo: m[1], index: m.index ?? 0 }));
  const porCodigo = new Map<string, ParsedPayslipConcepto>();

  for (let i = 0; i < starts.length; i += 1) {
    const { codigo, index } = starts[i];
    if (porCodigo.has(codigo)) continue;

    const end = i + 1 < starts.length ? starts[i + 1].index : flat.length;
    const segment = flat.slice(index + codigo.length, end);
    const match = segment.match(SEGMENT);
    if (!match) continue;

    const label = match[1].replace(/\s+\d{1,3}$/, "").trim();
    const tipo = clasificar(codigo, label);
    if (!tipo) continue;

    const amounts = match[2].match(AR_AMOUNT) ?? [];
    const raw = amounts[amounts.length - 1];
    if (!raw) continue;
    const signo = raw.trim().startsWith("-") ? -1 : 1;
    porCodigo.set(codigo, {
      codigo,
      label,
      tipo,
      monto: round2(signo * parseArAmount(raw).amount),
    });
  }
  return [...porCodigo.values()];
}

function periodoDesdeNombre(fileName: string): string | null {
  if (!SAC_MARCA.test(fileName)) return null;
  const ordinal = fileName.match(SAC_ORDINAL);
  const anio = fileName.match(SAC_ANIO);
  if (!ordinal || !anio) return null;
  return `${anio[1]}-${semestreDeSac(ordinal[1])}`;
}

function parsePeriodo(text: string, fileName?: string): string {
  const sac = text.match(SAC_PERIODO);
  if (sac) return `${sac[2]}-${semestreDeSac(sac[1])}`;

  const match = text.match(PERIODO);
  if (match) {
    const mes = MONTHS_ES[match[1].toLowerCase()];
    return `${match[2]}-${String(mes).padStart(2, "0")}`;
  }
  const deposito = text.match(FECHA_DEPOSITO);
  if (deposito) return `${deposito[2]}-${deposito[1].padStart(2, "0")}`;

  const desdeNombre = fileName ? periodoDesdeNombre(fileName) : null;
  if (desdeNombre) return desdeNombre;

  throw new Error("Recibo de sueldo inválido: falta período de pago");
}

function parseTipo(text: string, fileName?: string): PayslipTipo {
  if (SAC_PERIODO.test(text)) return "sac";
  if (fileName && SAC_MARCA.test(fileName)) return "sac";
  return "mensual";
}

function endOfMonth(periodo: string): string {
  const [year, month] = periodo.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodo}-${String(day).padStart(2, "0")}`;
}

function extractCuil(text: string): string {
  const matches = text.match(/\b\d{2}-\d{8}-\d\b/g) ?? [];
  const cuil = matches.find((candidate) => CUIL_PERSONA.has(candidate.slice(0, 2)));
  if (!cuil) throw new Error("Recibo de sueldo inválido: falta CUIL del empleado");
  return cuil;
}

function sumByTipo(conceptos: ParsedPayslipConcepto[], tipo: PayslipConceptoTipo): number {
  return round2(conceptos.filter((c) => c.tipo === tipo).reduce((acc, c) => acc + c.monto, 0));
}

export const payslipParser: PayslipParser = {
  detect(text) {
    const upper = text.toUpperCase();
    const hasPeriodo = upper.includes("PERÍODO DE PAGO") || upper.includes("PERIODO DE PAGO");
    const hasComposicion = upper.includes("COMPOSICIÓN SALARIAL") || upper.includes("COMPOSICION SALARIAL");
    const hasLiquidacion = upper.includes("SUELDO") || SAC_MARCA.test(text);
    return (hasPeriodo || hasComposicion) && hasLiquidacion;
  },

  parse(text, _meta, hints?: PayslipParseHints): ParsedPayslip {
    const periodo = parsePeriodo(text, hints?.fileName);
    const tipo = parseTipo(text, hints?.fileName);
    const cuil = extractCuil(text);
    const conceptos = parseConceptos(text);
    if (conceptos.length === 0) throw new Error("Recibo de sueldo inválido: sin conceptos");

    const remunerativo = sumByTipo(conceptos, "remunerativo");
    const noRemunerativo = sumByTipo(conceptos, "no_remunerativo");
    const descuentos = sumByTipo(conceptos, "descuento");
    const costoMatch = text.match(COSTO_EMPLEADOR);

    return {
      periodo,
      tipo,
      fechaPago: endOfMonth(periodo),
      cuil,
      conceptos,
      remunerativo,
      noRemunerativo,
      descuentos,
      brutoTotal: round2(remunerativo + noRemunerativo),
      neto: round2(remunerativo + noRemunerativo - descuentos),
      costoTotalEmpleador: costoMatch ? parseArAmount(costoMatch[1]).amount : null,
    };
  },
};
