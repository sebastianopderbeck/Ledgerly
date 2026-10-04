const CURRENCY_SYMBOLS = /US\$|\$/gi;
const SPACES = /[\s  ]/g;
const THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/;
const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

const inputFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

const toPlainNumber = (cleaned: string): string => {
  if (cleaned.includes(",")) return cleaned.replace(/\./g, "").replace(",", ".");
  if (THOUSANDS_ONLY.test(cleaned)) return cleaned.replace(/\./g, "");
  return cleaned;
};

export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(CURRENCY_SYMBOLS, "").replace(SPACES, "");
  if (cleaned === "") return null;
  const plain = toPlainNumber(cleaned);
  if (!PLAIN_NUMBER.test(plain)) return null;
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

export function formatMoneyInput(value: number): string {
  return inputFormat.format(value);
}
