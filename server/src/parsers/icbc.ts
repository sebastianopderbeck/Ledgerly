import type { PdfMeta, ParsedRow, ParsedStatement, StatementParser } from "@ledgerly/shared";
import {
  MONTHS_ES,
  classifyType,
  normalizeMerchant,
  parseArAmount,
  parseInstallment,
  shortDate,
} from "./normalize.js";

const PAGE_HEADER = /CUIT[\s\S]*?FINANCIACION \$\s*[\d.]+,\d{2}/g;
const SALDO_ANTERIOR = /SALDO ANTERIOR\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}/;
const REGION_END = /Tarjeta\s+\d+\s+Total Consumos|TOTAL CONSUMOS/i;
const RECORD =
  /(?:(\d{2})\s+([A-Za-zÁÉÍÓÚÑñáéíóú]+)\s+)?(\d{2})\s+(?:(\d{4,6})\s+[*K]?\s*)?(.+?)\s+(\d[\d.]*,\d{2}-?)(?=\s|$)/g;

export const icbcParser: StatementParser = {
  issuer: "icbc",

  detect(text) {
    return text.includes("ICBC");
  },

  parse(text, _meta: PdfMeta): ParsedStatement {
    const flat = text.replace(/\n+/g, " ");
    const stripped = flat.replace(PAGE_HEADER, " ");

    const startMatch = stripped.match(SALDO_ANTERIOR);
    const startIdx = startMatch ? startMatch.index! + startMatch[0].length : 0;
    const relEnd = stripped.slice(startIdx).search(REGION_END);
    const endIdx = relEnd === -1 ? stripped.length : startIdx + relEnd;
    const region = stripped.slice(startIdx, endIdx);

    const rows: ParsedRow[] = [];
    let year = "26";
    let month = "01";

    for (const m of region.matchAll(RECORD)) {
      const [, yy, monthName, dd, comprobante, description, rawAmount] = m;
      const monthNum = monthName ? MONTHS_ES[monthName.toLowerCase()] : undefined;
      if (monthNum) {
        month = String(monthNum).padStart(2, "0");
        if (yy) year = yy;
      }

      const { amount, direction } = parseArAmount(rawAmount);
      const installment = parseInstallment(description);

      rows.push({
        date: `20${year}-${month}-${dd.padStart(2, "0")}`,
        descriptionRaw: description.replace(/\s+/g, " ").trim(),
        merchant: normalizeMerchant(description),
        amount,
        currency: /USD|U\$S/.test(description) ? "USD" : "ARS",
        direction,
        type: classifyType(description),
        isInstallment: installment.isInstallment,
        installmentCurrent: installment.current,
        installmentTotal: installment.total,
        comprobante: comprobante ?? null,
      });
    }

    const totalConsumos = flat.match(
      /(?:Tarjeta\s+\d+\s+)?Total Consumos[^\n]*?([\d.]+,\d{2})(?:\s+\*?\s*([\d.]+,\d{2}))?/i,
    );
    const saldoAnterior = flat.match(/SALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const saldoActual = flat.match(/SALDO ACTUAL\s+\$\s+([\d.]+,\d{2})/);
    const pagoMinimo = flat.match(/PAGO MINIMO\s+\$\s+([\d.]+,\d{2})/);

    return {
      header: {
        issuer: "icbc",
        cardLabel: "ICBC",
        last4: null,
        closingDate: shortDate(flat, "CIERRE"),
        dueDate: shortDate(flat, "VENCIMIENTO"),
        totals: {
          totalConsumos: {
            ars: totalConsumos ? parseArAmount(totalConsumos[1]).amount : 0,
            usd: totalConsumos?.[2] ? parseArAmount(totalConsumos[2]).amount : 0,
          },
          saldoActual: { ars: saldoActual ? parseArAmount(saldoActual[1]).amount : 0, usd: 0 },
          pagoMinimo: { ars: pagoMinimo ? parseArAmount(pagoMinimo[1]).amount : 0, usd: 0 },
          saldoAnterior: {
            ars: saldoAnterior ? parseArAmount(saldoAnterior[1]).amount : 0,
            usd: saldoAnterior ? parseArAmount(saldoAnterior[2]).amount : 0,
          },
        },
      },
      rows,
    };
  },
};
