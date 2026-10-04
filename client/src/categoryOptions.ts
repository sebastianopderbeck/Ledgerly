import type { CategoryRuleDTO } from "@ledgerly/shared";

export const UNCATEGORIZED = "Sin categoría";

export function categoryOptions(categories: string[], rules: Pick<CategoryRuleDTO, "category">[]): string[] {
  const names = [...categories, ...rules.map((rule) => rule.category)]
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== UNCATEGORIZED);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "es"));
}
