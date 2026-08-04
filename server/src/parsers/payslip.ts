import type { ParsedPayslip, ParsedPayslipConcepto, PayslipConceptoTipo, PayslipParser } from "@ledgerly/shared";
import { MONTHS_ES, parseArAmount } from "./normalize.js";

const CODE = /(?<!\d)(0\d{3}|9999)(?=\s+[A-Za-zÁÉÍÓÚÑ])/g;
const SEGMENT = /^\s+([A-Za-zÁÉÍÓÚÑ].*?)\s+((?:-?\d[\d.]*,\d{2})(?:\s+-?\d[\d.]*,\d{2})*)/;
const AR_AMOUNT = /-?\d[\d.]*,\d{2}/g;
const CUIL_PERSONA = new Set(["20", "23", "24", "27"]);
const PERIODO = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/i;
const FECHA_DEPOSITO = /DEP[ÓO]SITO\s+\d{1,2}\/\d{4}\s+\d{1,2}\/(\d{1,2})\/(\d{4})/i;
const COSTO_EMPLEADOR = /COSTO TOTAL EMPLEADOR\s*\$?\s*(\d[\d.]*,\d{2})/i;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function clasificar(codigo: string): PayslipConceptoTipo | null {
  if (codigo.startsWith("05")) return null;
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
    const tipo = clasificar(codigo);
    if (!tipo || porCodigo.has(codigo)) continue;

    const end = i + 1 < starts.length ? starts[i + 1].index : flat.length;
    const segment = flat.slice(index + codigo.length, end);
    const match = segment.match(SEGMENT);
    if (!match) continue;

    const amounts = match[2].match(AR_AMOUNT) ?? [];
    const raw = amounts[amounts.length - 1];
    if (!raw) continue;
    const signo = raw.trim().startsWith("-") ? -1 : 1;
    porCodigo.set(codigo, {
      codigo,
      label: match[1].replace(/\s+\d{1,3}$/, "").trim(),
      tipo,
      monto: round2(signo * parseArAmount(raw).amount),
    });
  }
  return [...porCodigo.values()];
}

function parsePeriodo(text: string): string {
  const match = text.match(PERIODO);
  if (match) {
    const mes = MONTHS_ES[match[1].toLowerCase()];
    return `${match[2]}-${String(mes).padStart(2, "0")}`;
  }
  const deposito = text.match(FECHA_DEPOSITO);
  if (deposito) return `${deposito[2]}-${deposito[1].padStart(2, "0")}`;
  throw new Error("Recibo de sueldo inválido: falta período de pago");
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
    return (hasPeriodo || hasComposicion) && upper.includes("SUELDO");
  },

  parse(text): ParsedPayslip {
    const periodo = parsePeriodo(text);
    const cuil = extractCuil(text);
    const conceptos = parseConceptos(text);
    if (conceptos.length === 0) throw new Error("Recibo de sueldo inválido: sin conceptos");

    const remunerativo = sumByTipo(conceptos, "remunerativo");
    const noRemunerativo = sumByTipo(conceptos, "no_remunerativo");
    const descuentos = sumByTipo(conceptos, "descuento");
    const costoMatch = text.match(COSTO_EMPLEADOR);

    return {
      periodo,
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
