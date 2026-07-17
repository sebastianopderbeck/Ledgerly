import type { MortgageCouponParser, ParsedCoupon } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const MARKER = "INFORME DE COBRO DE CUOTA PRESTAMO";
const CAPITAL = /CAPITAL\s+\$\s*([\d.]+,\d{2})/;
const INTERESES = /INTERESES\s+\$\s*([\d.]+,\d{2})/;
const SEGURO = /SEGURO INCENDIO\s+\$\s*([\d.]+,\d{2})/;
const TOTAL = /TOTAL DEBITADO\s+\$\s*([\d.]+,\d{2})/;
const CUOTA_UVA = /CUOTA PURA EN UVAS\s+\$\s*([\d.]+,\d{2})/;
const COTIZ = /Cotizac\.\s*UVAS al \d{2}-\d{2}-\d{4}\s*:\s*\$\s*([\d.]+,\d{2})/;
const CUOTA_PRESTAMO = /(\d{3})\s+HIPOTECARIO\s+(\d{6,})/;
const FECHA = /(\d{2}\/\d{2}\/\d{4})\s+\d{3}\s+HIPOTECARIO/;
const RATES = /CUOTA PURA EN UVAS\s+\$\s*[\d.]+,\d{2}\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(\d+,\d{2})\s+Cotizac/;

function required(flat: string, re: RegExp, field: string): string {
  const m = flat.match(re);
  if (!m) throw new Error(`Cupón inválido: falta ${field}`);
  return m[1];
}

export const icbcMortgageParser: MortgageCouponParser = {
  detect(text) {
    return text.includes(MARKER);
  },

  parse(text): ParsedCoupon {
    const flat = text.replace(/\n+/g, " ");
    const cp = flat.match(CUOTA_PRESTAMO);
    if (!cp) throw new Error("Cupón inválido: falta cuota/préstamo");
    const fecha = flat.match(FECHA);
    if (!fecha) throw new Error("Cupón inválido: falta fecha de débito");
    const rates = flat.match(RATES);

    return {
      prestamoNro: cp[2],
      cuotaNro: Number(cp[1]),
      fechaDebito: parseSlashDate(fecha[1]),
      capital: parseArAmount(required(flat, CAPITAL, "capital")).amount,
      intereses: parseArAmount(required(flat, INTERESES, "intereses")).amount,
      seguroIncendio: parseArAmount(required(flat, SEGURO, "seguro")).amount,
      totalDebitado: parseArAmount(required(flat, TOTAL, "total")).amount,
      cuotaPuraUva: parseArAmount(required(flat, CUOTA_UVA, "cuota UVA")).amount,
      cotizacionUva: parseArAmount(required(flat, COTIZ, "cotización UVA")).amount,
      cft: rates ? parseArAmount(rates[1]).amount : 0,
      tea: rates ? parseArAmount(rates[2]).amount : 0,
      tna: rates ? parseArAmount(rates[3]).amount : 0,
    };
  },
};
