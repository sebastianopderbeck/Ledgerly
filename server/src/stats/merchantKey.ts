export const PALABRAS_CLAVE = 2;
export const MIN_PREFIJO = 4;
export const MIN_BUSQUEDA = 3;

const DIACRITICS = /[̀-ͯ]/g;
const HAS_DIGIT = /\d/;
const LEADING_VOUCHER = /^\d{4,7}[A-Z*]?\s+/i;
const TRAILING_SEPARATORS = /[^\p{L}\p{N}]+$/u;

export function merchantWords(merchant: string): string[] {
  return merchant
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && word !== "USD" && !HAS_DIGIT.test(word));
}

export function merchantKey(merchant: string): string {
  return merchantWords(merchant).slice(0, PALABRAS_CLAVE).join(" ");
}

export function merchantMatchKey(merchant: string): string {
  const words = merchantWords(merchant);
  return words.length > 0 ? words.join(" ") : merchant.trim().toUpperCase();
}

const absorbs = (shorter: string, longer: string): boolean => {
  const shortWords = shorter.split(" ");
  const longWords = longer.split(" ");
  if (shortWords.length !== longWords.length) return false;
  const last = shortWords.length - 1;
  const sameHead = shortWords.slice(0, last).every((word, index) => word === longWords[index]);
  return sameHead && shortWords[last].length >= MIN_PREFIJO && longWords[last].startsWith(shortWords[last]);
};

const byLengthThenAlphabetical = (a: string, b: string): number => a.length - b.length || a.localeCompare(b);

export function canonicalMerchantKeys(keys: string[]): Map<string, string> {
  const canonicals: string[] = [];
  const mapping = new Map<string, string>();
  for (const key of [...new Set(keys)].sort(byLengthThenAlphabetical)) {
    const canonical = canonicals.find((candidate) => absorbs(candidate, key));
    if (canonical) {
      mapping.set(key, canonical);
    } else {
      canonicals.push(key);
      mapping.set(key, key);
    }
  }
  return mapping;
}

export function merchantDisplayName(merchant: string): string {
  const words = merchant.split(/\s+/).filter((word) => word !== "" && !HAS_DIGIT.test(word));
  return words.length > 0 ? words.join(" ") : merchant;
}

const commonPrefix = (first: string, other: string): string => {
  const upperFirst = first.toUpperCase();
  const upperOther = other.toUpperCase();
  let length = 0;
  while (length < first.length && upperFirst[length] === upperOther[length]) length += 1;
  return first.slice(0, length);
};

export function merchantSearchTerm(merchants: string[]): string {
  if (merchants.length === 0) return "";
  const cleaned = merchants.map((merchant) => merchant.trim().replace(LEADING_VOUCHER, ""));
  const prefix = cleaned.slice(1).reduce(commonPrefix, cleaned[0]).replace(TRAILING_SEPARATORS, "");
  return prefix.length >= MIN_BUSQUEDA ? prefix : merchantDisplayName(merchants[0]);
}
