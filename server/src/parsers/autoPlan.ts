import type { AutoCouponParser, ParsedAutoConcept, ParsedAutoCoupon } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const MARKER = "Ahorro para Fines Determinados";
const HEADER = /GRUPO\s+(\d+)\s+ORDEN\s+(\d+)\s+CUOTA\s+(\d+)\s+PLAN\s+(\w+)/;
const EMISION = /Fecha de Emisión\s+(\d{2}\/\d{2}\/\d{4})/;
const VENCIMIENTO = /VENCIMIENTO\s+(\d{2}\/\d{2}\/\d{4})/;
const COMPROBANTE = /Comprobante Nro\.:\s*(\d+)/;
const TOTAL = /TOTAL A PAGAR\s+\$\s*(\d[\d.]*,\d{2})/;
const VALOR = /A fecha emisión de esta cuota\s+\$\s*(\d[\d.]*,\d{2})/;
const MODELO = /Modelo de ahorro a fecha de emisión\s+(.+?)\./;
const CONCEPT = /([A-ZÁÉÍÓÚ][^$\n]*?)\s+\$\s*(-\s*)?(\d[\d.]*,\d{2})/g;

function required(flat: string, re: RegExp, field: string): string {
  const m = flat.match(re);
  if (!m) throw new Error(`Cupón de auto inválido: falta ${field}`);
  return m[1];
}

function normalizeLabel(raw: string): string {
  const label = raw.replace(/\s+/g, " ").trim();
  return label.replace(/^(DIFERIMIENTO COMERCIAL)\s+\d+$/, "$1");
}

function parseConceptos(block: string): ParsedAutoConcept[] {
  const conceptos: ParsedAutoConcept[] = [];
  for (const m of block.matchAll(CONCEPT)) {
    const amount = parseArAmount(m[3]).amount * (m[2] ? -1 : 1);
    conceptos.push({ label: normalizeLabel(m[1]), amount });
  }
  return conceptos;
}

export const autoPlanParser: AutoCouponParser = {
  detect(text) {
    return text.includes(MARKER);
  },

  parse(text): ParsedAutoCoupon {
    const flat = text.replace(/\n+/g, " ");
    const header = flat.match(HEADER);
    if (!header) throw new Error("Cupón de auto inválido: falta encabezado grupo/orden/cuota");

    const comp = flat.match(COMPROBANTE);
    if (!comp) throw new Error("Cupón de auto inválido: falta comprobante");
    const startIdx = (comp.index ?? 0) + comp[0].length;
    const claveIdx = flat.indexOf("Clave de Acceso", startIdx);
    const totalIdx = flat.indexOf("TOTAL A PAGAR", startIdx);
    const endIdx = claveIdx === -1 ? totalIdx : claveIdx;
    const block = flat.slice(startIdx, endIdx === -1 ? undefined : endIdx);

    return {
      grupo: header[1],
      orden: String(Number(header[2])),
      cuotaNro: Number(header[3]),
      plan: header[4],
      fechaEmision: parseSlashDate(required(flat, EMISION, "fecha de emisión")),
      fechaVencimiento: parseSlashDate(required(flat, VENCIMIENTO, "vencimiento")),
      comprobante: comp[1],
      modelo: required(flat, MODELO, "modelo").trim(),
      valorMovil: parseArAmount(required(flat, VALOR, "valor del auto")).amount,
      conceptos: parseConceptos(block),
      totalAPagar: parseArAmount(required(flat, TOTAL, "total a pagar")).amount,
    };
  },
};
