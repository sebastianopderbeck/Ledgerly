export interface RuleInput {
  priority: number;
  matchType: "contains" | "regex";
  pattern: string;
  category: string;
  enabled: boolean;
}

export function categorize(
  descriptionRaw: string,
  merchant: string,
  rules: RuleInput[],
): { category: string; source: "rule" } {
  const haystack = `${descriptionRaw} ${merchant}`.toUpperCase();
  const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    const matched =
      rule.matchType === "contains"
        ? haystack.includes(rule.pattern.toUpperCase())
        : new RegExp(rule.pattern, "i").test(haystack);
    if (matched) return { category: rule.category, source: "rule" };
  }
  return { category: "Sin categoría", source: "rule" };
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
