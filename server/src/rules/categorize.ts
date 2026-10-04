import { UNCATEGORIZED_CATEGORY } from "@ledgerly/shared";

export const UNCATEGORIZED = UNCATEGORIZED_CATEGORY;

export interface RuleInput {
  priority: number;
  matchType: "contains" | "regex";
  pattern: string;
  category: string;
  enabled: boolean;
}

export function matchRule(descriptionRaw: string, merchant: string, rules: RuleInput[]): string | null {
  const haystack = `${descriptionRaw} ${merchant}`.toUpperCase();
  const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    let matched = false;
    if (rule.matchType === "contains") {
      matched = haystack.includes(rule.pattern.toUpperCase());
    } else {
      try {
        matched = new RegExp(rule.pattern, "i").test(haystack);
      } catch {
        matched = false;
      }
    }
    if (matched) return rule.category;
  }
  return null;
}

export function categorize(
  descriptionRaw: string,
  merchant: string,
  rules: RuleInput[],
): { category: string; source: "rule" } {
  return { category: matchRule(descriptionRaw, merchant, rules) ?? UNCATEGORIZED, source: "rule" };
}

export interface RuleCandidate {
  id: string;
  descriptionRaw: string;
  merchant: string;
}

export function idsMatchingRule(candidates: RuleCandidate[], rule: RuleInput): string[] {
  return candidates
    .filter((candidate) => matchRule(candidate.descriptionRaw, candidate.merchant, [rule]) !== null)
    .map((candidate) => candidate.id);
}

export const SEED_RULES: Omit<RuleInput, "enabled">[] = [
  { priority: 10, matchType: "regex", pattern: "NETFLIX|SPOTIFY|YOUTUBE|APPLE\\.COM|GOOGLE \\*|HBO|DISNEY", category: "Suscripciones" },
  { priority: 20, matchType: "regex", pattern: "SUBE|UBER|CABIFY|DIDI", category: "Transporte" },
  { priority: 30, matchType: "regex", pattern: "PEDIDOSYA|RAPPI|CAFE|BAR|RESTO|HELAD|WORKPLACE|RAPANUI", category: "Comida" },
  { priority: 40, matchType: "regex", pattern: "CARREFOUR|COTO|DIA|JUMBO|MARKET|SUPER", category: "Supermercado" },
  { priority: 50, matchType: "regex", pattern: "PHARMACIE|FARMACIA|FIBRAHUMANA", category: "Salud" },
  { priority: 60, matchType: "regex", pattern: "MERCADOLIBRE|MERCADOPAGO|MEGATONE|TIENDA", category: "Compras" },
  { priority: 70, matchType: "regex", pattern: "ELECTRICIDAD|GAS|AGUA|EDESUR|EDENOR", category: "Servicios" },
];
