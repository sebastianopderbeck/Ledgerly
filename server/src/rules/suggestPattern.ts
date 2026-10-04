export const MIN_RULE_PATTERN_LENGTH = 3;
export const MAX_PATTERN_WORDS = 3;

const TRAILING_SEPARATORS = /[\s*.\-#/]+$/;

const cutBeforeFirstDigit = (clean: string): string => {
  const digitAt = clean.search(/\d/);
  if (digitAt === -1) return clean;
  const wordStart = clean.lastIndexOf(" ", digitAt) + 1;
  return wordStart === 0 ? clean.slice(0, digitAt) : clean.slice(0, wordStart);
};

export function suggestPattern(merchant: string): string {
  const clean = merchant.toUpperCase().replace(/\s+/g, " ").trim();
  const words = cutBeforeFirstDigit(clean).split(" ").slice(0, MAX_PATTERN_WORDS);
  const pattern = words.join(" ").replace(TRAILING_SEPARATORS, "");
  return pattern.length < MIN_RULE_PATTERN_LENGTH ? clean : pattern;
}
