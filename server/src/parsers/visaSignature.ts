import type { PdfMeta, ParsedRow, ParsedStatement, StatementParser } from "@ledgerly/shared";
import {
  classifyType,
  extractAmounts,
  normalizeMerchant,
  parseArAmount,
  parseInstallment,
  parseVisaDate,
  shortDate,
} from "./normalize.js";

const ROW = /^\s*(\d{2}\.\d{2}\.\d{2})\s+(?:(\d{4,6})[*FK]?\s+)?(.*)$/;
const SKIP = /SALDO ANTERIOR|Total Consumos|SALDO ACTUAL|PAGO MINIMO|DEBITAREMOS/;

function splitRecords(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .replace(/(?<![\d,])(\d{2}\.\d{2}\.\d{2})\s/g, "\n$1 ")
    .replace(/(Tarjeta\s+\d{3,}\s+Total Consumos)/g, "\n$1")
    .replace(/(SALDO ANTERIOR)/g, "\n$1")
    .replace(/(SALDO ACTUAL)/g, "\n$1")
    .replace(/(PAGO MINIMO)/g, "\n$1")
    .replace(/(DEBITAREMOS)/g, "\n$1")
    .split("\n");
}

export const visaSignatureParser: StatementParser = {
  issuer: "visa_signature",

  detect(text) {
    return text.includes("VISA SIGNATURE");
  },

  parse(text, _meta: PdfMeta): ParsedStatement {
    const flat = text.replace(/\n+/g, " ");
    const rows: ParsedRow[] = [];
    let started = false;

    for (const line of splitRecords(text)) {
      if (/SALDO ANTERIOR/.test(line)) {
        started = true;
        continue;
      }
      if (!started || SKIP.test(line)) continue;

      const m = line.match(ROW);
      if (!m) continue;
      const [, rawDate, comprobante, rest] = m;

      const amounts = extractAmounts(rest);
      if (amounts.length === 0) continue;

      const { amount, direction } = parseArAmount(amounts[amounts.length - 1]);
      const installment = parseInstallment(rest);

      rows.push({
        date: parseVisaDate(rawDate),
        descriptionRaw: rest.replace(/\s+/g, " ").trim(),
        merchant: normalizeMerchant(rest),
        amount,
        currency: /USD|U\$S/.test(rest) ? "USD" : "ARS",
        direction,
        type: classifyType(rest),
        isInstallment: installment.isInstallment,
        installmentCurrent: installment.current,
        installmentTotal: installment.total,
        comprobante: comprobante ?? null,
      });
    }

    const totalConsumos = flat.match(/Total Consumos[^_]*?([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const saldoActual = flat.match(/SALDO ACTUAL\s+\$\s+([\d.]+,\d{2})\s+U\$S\s+([\d.]+,\d{2})/);
    const saldoAnterior = flat.match(/SALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const pagoMinimo = flat.match(/PAGO MINIMO\s+\$\s+([\d.]+,\d{2})/);
    const last4 = flat.match(/Tarjeta\s+(\d{4})/);

    return {
      header: {
        issuer: "visa_signature",
        cardLabel: last4 ? `Visa Signature ****${last4[1]}` : "Visa Signature",
        last4: last4?.[1] ?? null,
        closingDate: shortDate(flat, "CIERRE ACTUAL:"),
        dueDate: shortDate(flat, "VENCIMIENTO"),
        totals: {
          totalConsumos: {
            ars: totalConsumos ? parseArAmount(totalConsumos[1]).amount : 0,
            usd: totalConsumos ? parseArAmount(totalConsumos[2]).amount : 0,
          },
          saldoActual: {
            ars: saldoActual ? parseArAmount(saldoActual[1]).amount : 0,
            usd: saldoActual ? parseArAmount(saldoActual[2]).amount : 0,
          },
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
