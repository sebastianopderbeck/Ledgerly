import type { Direction, TxType } from "@ledgerly/shared";

const AR_NUMBER = /(?<![\d.])\d[\d.]*,\d{2}-?/g;

export function extractAmounts(line: string): string[] {
  return line.match(AR_NUMBER) ?? [];
}

export function parseArAmount(raw: string): { amount: number; direction: Direction } {
  const direction: Direction = raw.trim().endsWith("-") ? "credit" : "debit";
  const normalized = raw.replace(/-/g, "").replace(/\./g, "").replace(",", ".").trim();
  return { amount: Number.parseFloat(normalized), direction };
}

export function parseVisaDate(raw: string): string {
  const [dd, mm, yy] = raw.trim().split(".");
  return `20${yy}-${mm}-${dd}`;
}

export const MONTHS_ES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

export function parseSpanishDate(day: string, monthName: string, yy: string): string {
  const month = MONTHS_ES[monthName.toLowerCase()];
  if (!month) throw new Error(`Mes desconocido: ${monthName}`);
  return `20${yy}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function shortDate(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}\\s+(\\d{2})\\s+([A-Za-z]{3})\\s+(\\d{2})`));
  return m ? parseSpanishDate(m[1], m[2], m[3]) : null;
}

export function parseInstallment(desc: string): {
  isInstallment: boolean;
  current: number | null;
  total: number | null;
} {
  const m = desc.match(/(?:Cuota\s+|C\.)(\d{1,2})\/(\d{1,2})/);
  if (!m) return { isInstallment: false, current: null, total: null };
  return { isInstallment: true, current: Number(m[1]), total: Number(m[2]) };
}

export function classifyType(desc: string): TxType {
  const d = desc.toUpperCase();
  if (/SU\s+PAGO/.test(d)) return "payment";
  if (/\b(IVA|IIBB|PERCEP|DB\.RG|DEV\.IMP|RG\s*\d)/.test(d)) return "tax";
  if (/BONIF/.test(d)) return "refund";
  return "purchase";
}

export function normalizeMerchant(detail: string): string {
  return detail
    .replace(/(?:Cuota\s+|C\.)\d{1,2}\/\d{1,2}/g, " ")
    .replace(/USD\s+[\d.]*,\d{2}/g, " ")
    .replace(/(?<![\d.])\d[\d.]*,\d{2}-?/g, " ")
    .replace(/^\s*(?:MERPAGO\*|PEDIDOSYA\*|DLO\*|PAYU\*AR\*|INI\*)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
