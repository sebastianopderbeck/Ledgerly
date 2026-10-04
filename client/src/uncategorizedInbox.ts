import type { InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { UNCATEGORIZED } from "./categoryOptions.js";
import { ALL_YEARS } from "./filters/globalFilters.js";
import { transactionsLink } from "./filters/transactionsLink.js";
import { formatMoney } from "./format.js";

export const MIN_RULE_PATTERN_LENGTH = 3;
export const INBOX_PREVIEW_SIZE = 8;

export type InboxOrder = "amount" | "count";

export interface InboxRuleDraft {
  pattern: string;
  category: string;
}

export interface PatternCheck {
  valid: boolean;
  hint: string | null;
}

export interface InboxFeedback {
  severity: "success" | "info" | "error";
  message: string;
}

type GroupComparator = (a: UncategorizedGroupDTO, b: UncategorizedGroupDTO) => number;

const byAmount: GroupComparator = (a, b) =>
  b.equivalentArs - a.equivalentArs || b.count - a.count || a.pattern.localeCompare(b.pattern);

const byCount: GroupComparator = (a, b) =>
  b.count - a.count || b.equivalentArs - a.equivalentArs || a.pattern.localeCompare(b.pattern);

const COMPARATORS: Record<InboxOrder, GroupComparator> = { amount: byAmount, count: byCount };

const counted = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

const coversGroup = (needle: string, group: UncategorizedGroupDTO): boolean =>
  group.merchants.some((merchant) => merchant.toUpperCase().includes(needle));

export function sortInboxGroups(groups: UncategorizedGroupDTO[], order: InboxOrder): UncategorizedGroupDTO[] {
  return [...groups].sort(COMPARATORS[order]);
}

export function checkPattern(pattern: string, group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): PatternCheck {
  const needle = pattern.trim().toUpperCase();
  if (needle.length < MIN_RULE_PATTERN_LENGTH) return { valid: false, hint: `Mínimo ${MIN_RULE_PATTERN_LENGTH} caracteres` };
  if (!coversGroup(needle, group)) return { valid: false, hint: `No coincide con «${group.merchants[0]}»` };
  const others = groups.filter((other) => other.pattern !== group.pattern && coversGroup(needle, other)).length;
  if (others === 0) return { valid: true, hint: null };
  return { valid: true, hint: `También cubre ${counted(others, "comercio más", "comercios más")} de la bandeja` };
}

export function inboxSummary(pendingCount: number, groupCount: number): string {
  return `${counted(pendingCount, "movimiento", "movimientos")} en ${counted(groupCount, "comercio", "comercios")}`;
}

export function pendingLabel(pendingCount: number): string {
  return counted(pendingCount, "movimiento pendiente", "movimientos pendientes");
}

export function groupTotalLabel({ totalArs, totalUsd }: UncategorizedGroupDTO): string {
  const parts: string[] = [];
  if (totalArs !== 0) parts.push(formatMoney(totalArs, "ARS"));
  if (totalUsd !== 0) parts.push(formatMoney(totalUsd, "USD"));
  return parts.length === 0 ? formatMoney(0, "ARS") : parts.join(" · ");
}

export function groupCaption({ count, lastDate, merchants }: UncategorizedGroupDTO): string {
  const caption = `${counted(count, "movimiento", "movimientos")} · último ${lastDate}`;
  return merchants.length > 1 ? `${caption} · ${merchants.length} variantes` : caption;
}

export function missingUsdRate({ usdRate, groups }: UncategorizedInboxDTO): boolean {
  return usdRate === null && groups.some((group) => group.totalUsd > 0);
}

export function inboxTransactionsHref(pattern: string): string {
  return transactionsLink({ year: ALL_YEARS, category: UNCATEGORIZED, search: pattern });
}

export function inboxRuleFeedback({ rule, categorized }: InboxRuleResultDTO): InboxFeedback {
  const label = `Regla «${rule.pattern}» → ${rule.category}`;
  if (categorized === 0) {
    return { severity: "info", message: `${label} creada, pero no coincidió con ningún movimiento pendiente.` };
  }
  const outcome = counted(categorized, "movimiento categorizado", "movimientos categorizados");
  return { severity: "success", message: `${label}: ${outcome}.` };
}
