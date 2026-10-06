import type { MortgageCouponImageParser, ParsedCouponImage } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const AMOUNT = String.raw`\$\s*(\d[\d.]*,\d{2})`;
const amountRow = (label: string): RegExp => new RegExp(String.raw`^${label}\s+${AMOUNT}`, "m");

const CUOTA = /^Cuota\s+(\d+)\s*\/\s*(\d+)/m;
const VENCIMIENTO = /^Vencimiento\s+(\d{2}\/\d{2}\/\d{4})/m;
const CAPITAL = amountRow("Capital");
const INTERESES = amountRow("Intereses");
const IVA = amountRow("IVA");
const SEGUROS = amountRow("Seguros");
const TOTAL_PAGADO = amountRow("Total pagado");
const TOTAL_UVA = /^Total en UVA\s+UVA\s*(\d[\d.]*,\d{2})/m;
const TOTAL_UVA_LABEL = "Total en UVA";

const required = (text: string, re: RegExp, field: string): RegExpMatchArray => {
  const found = text.match(re);
  if (!found) throw new Error(`Captura inválida: falta ${field}`);
  return found;
};

const amount = (text: string, re: RegExp, field: string): number =>
  parseArAmount(required(text, re, field)[1]).amount;

const toCents = (value: number): number => Math.round(value * 100);

const isRealDate = (iso: string): boolean => {
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
};

const dueDate = (text: string): string => {
  const iso = parseSlashDate(required(text, VENCIMIENTO, "vencimiento")[1]);
  if (!isRealDate(iso)) throw new Error("Captura inválida: vencimiento inexistente");
  return iso;
};

export const icbcMortgageImageParser: MortgageCouponImageParser = {
  detect(text) {
    return CUOTA.test(text) && text.includes(TOTAL_UVA_LABEL);
  },

  parse(text) {
    const cuota = required(text, CUOTA, "cuota");
    const totalUva = amount(text, TOTAL_UVA, "total en UVA");
    if (totalUva <= 0) throw new Error("Captura inválida: total en UVA en cero");
    return {
      cuotaNro: Number(cuota[1]),
      cuotasTotales: Number(cuota[2]),
      fechaDebito: dueDate(text),
      capital: amount(text, CAPITAL, "capital"),
      intereses: amount(text, INTERESES, "intereses"),
      iva: amount(text, IVA, "IVA"),
      seguros: amount(text, SEGUROS, "seguros"),
      totalPagado: amount(text, TOTAL_PAGADO, "total pagado"),
      totalUva,
    };
  },
};

export const totalsMatch = ({ capital, intereses, iva, seguros, totalPagado }: ParsedCouponImage): boolean =>
  toCents(capital) + toCents(intereses) + toCents(iva) + toCents(seguros) === toCents(totalPagado);
