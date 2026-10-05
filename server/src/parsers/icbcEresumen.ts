import type { ParsedRow, ParsedStatement, StatementParser } from "@ledgerly/shared";
import {
  MONTHS_ES,
  classifyType,
  normalizeMerchant,
  parseArAmount,
  parseInstallment,
  parseSpanishDate,
  parseVisaDate,
} from "./normalize.js";

const LABELS_FIRST_HEADER = /VENCIMIENTO ACTUAL\s*\n\s*CIERRE ACTUAL/;
const WHOLE_LINE_DATE = /^\s*(\d{2}) ([A-Za-z]{3}) (\d{2})\s*$/gm;
const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}-?`;
const SALDO_ANTERIOR_LINE = new RegExp(`^\\s*SALDO ANTERIOR\\s+(${AMOUNT})\\s+(${AMOUNT})`, "m");
const TOTAL_CONSUMOS_LINE = new RegExp(`Total Consumos[^\\n]*?\\s(${AMOUNT})\\s+(${AMOUNT})`);
const SALDO_ACTUAL_LINE = new RegExp(`^\\s*SALDO ACTUAL\\s+\\$\\s+(${AMOUNT})(?:\\s+U\\$D\\s+(${AMOUNT}))?`, "m");
const PAGO_MINIMO_LINE = new RegExp(`^\\s*PAGO MINIMO\\s+\\$\\s+(${AMOUNT})(?:\\s+U\\$D\\s+(${AMOUNT}))?`, "m");
const RECORD = new RegExp(
  `(\\d{2}\\.\\d{2}\\.\\d{2})\\s+(?:(\\d{4,8})\\*\\s+)?(.+?)\\s+(${AMOUNT})(?:\\s+(${AMOUNT}))?`,
  "g",
);

export function isIcbcEresumen(text: string): boolean {
  return text.includes("ICBC") && text.includes("SALDO ANTERIOR") && LABELS_FIRST_HEADER.test(text);
}

function headerDates(text: string): { dueDate: string | null; closingDate: string | null } {
  const [dueDate = null, closingDate = null] = [...text.matchAll(WHOLE_LINE_DATE)]
    .filter(([, , monthName]) => MONTHS_ES[monthName.toLowerCase()] !== undefined)
    .map(([, dd, monthName, yy]) => parseSpanishDate(dd, monthName, yy));
  return { dueDate, closingDate };
}

function regionLines(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => SALDO_ANTERIOR_LINE.test(line));
  const afterStart = start === -1 ? lines : lines.slice(start + 1);
  const end = afterStart.findIndex((line) => line.includes("Total Consumos"));
  return end === -1 ? afterStart : afterStart.slice(0, end);
}

function rowsOfRecord(match: RegExpMatchArray): ParsedRow[] {
  const [, rawDate, comprobante, rawDescription, pesos, dolares] = match;
  const description = rawDescription.replace(/\s+/g, " ").trim();
  const installment = parseInstallment(description);
  const base = {
    date: parseVisaDate(rawDate),
    descriptionRaw: description,
    merchant: normalizeMerchant(description),
    type: classifyType(description),
    isInstallment: installment.isInstallment,
    installmentCurrent: installment.current,
    installmentTotal: installment.total,
    comprobante: comprobante ?? null,
  };
  const pesosAmount = parseArAmount(pesos);
  const rows: ParsedRow[] = [
    {
      ...base,
      amount: pesosAmount.amount,
      direction: pesosAmount.direction,
      currency: /USD|U\$S/.test(description) ? "USD" : "ARS",
    },
  ];
  const dolaresAmount = dolares ? parseArAmount(dolares) : null;
  if (dolaresAmount && dolaresAmount.amount !== 0) {
    rows.push({ ...base, amount: dolaresAmount.amount, direction: dolaresAmount.direction, currency: "USD" });
  }
  return rows;
}

function rowsOfLine(line: string): ParsedRow[] {
  const seen = new Set<string>();
  return [...line.matchAll(RECORD)]
    .filter(([record]) => !seen.has(record) && Boolean(seen.add(record)))
    .flatMap(rowsOfRecord);
}

function pair(match: RegExpMatchArray | null): { ars: number; usd: number } {
  return {
    ars: match ? parseArAmount(match[1]).amount : 0,
    usd: match?.[2] ? parseArAmount(match[2]).amount : 0,
  };
}

export const icbcEresumenParser: StatementParser = {
  issuer: "icbc",

  detect: isIcbcEresumen,

  parse(text): ParsedStatement {
    const { dueDate, closingDate } = headerDates(text);
    return {
      header: {
        issuer: "icbc",
        cardLabel: "ICBC",
        last4: null,
        closingDate,
        dueDate,
        totals: {
          totalConsumos: pair(text.match(TOTAL_CONSUMOS_LINE)),
          saldoActual: pair(text.match(SALDO_ACTUAL_LINE)),
          pagoMinimo: pair(text.match(PAGO_MINIMO_LINE)),
          saldoAnterior: pair(text.match(SALDO_ANTERIOR_LINE)),
        },
      },
      rows: regionLines(text).flatMap(rowsOfLine),
    };
  },
};
