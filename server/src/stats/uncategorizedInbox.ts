import type { Currency, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { suggestPattern } from "../rules/suggestPattern.js";

export interface PendingPurchase {
  merchant: string;
  amount: number;
  currency: Currency;
  date: string;
}

const byFrequencyThenName = (counts: Map<string, number>) => (a: string, b: string): number =>
  (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b);

const byEquivalentThenCount = (a: UncategorizedGroupDTO, b: UncategorizedGroupDTO): number =>
  b.equivalentArs - a.equivalentArs || b.count - a.count || a.pattern.localeCompare(b.pattern);

const toGroup = (pattern: string, rows: PendingPurchase[], usdRate: number | null): UncategorizedGroupDTO => {
  const counts = new Map<string, number>();
  let totalArs = 0;
  let totalUsd = 0;
  let lastDate = "";
  for (const row of rows) {
    counts.set(row.merchant, (counts.get(row.merchant) ?? 0) + 1);
    if (row.currency === "USD") totalUsd += row.amount;
    else totalArs += row.amount;
    if (row.date > lastDate) lastDate = row.date;
  }
  return {
    pattern,
    merchants: [...counts.keys()].sort(byFrequencyThenName(counts)),
    count: rows.length,
    totalArs,
    totalUsd,
    equivalentArs: totalArs + (usdRate === null ? 0 : totalUsd * usdRate),
    lastDate,
  };
};

export function buildUncategorizedInbox(rows: PendingPurchase[], usdRate: number | null): UncategorizedInboxDTO {
  const byPattern = new Map<string, PendingPurchase[]>();
  for (const row of rows) {
    const pattern = suggestPattern(row.merchant);
    const bucket = byPattern.get(pattern);
    if (bucket) bucket.push(row);
    else byPattern.set(pattern, [row]);
  }
  const groups = [...byPattern]
    .map(([pattern, groupRows]) => toGroup(pattern, groupRows, usdRate))
    .sort(byEquivalentThenCount);
  return { pendingCount: rows.length, usdRate, groups };
}
