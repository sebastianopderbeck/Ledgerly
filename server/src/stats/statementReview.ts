import {
  UNCATEGORIZED_CATEGORY,
  type ReviewCategoryFinding,
  type ReviewCheck,
  type ReviewDuplicateRef,
  type ReviewFinding,
  type ReviewReason,
  type ReviewTransactionFinding,
  type TransactionDTO,
} from "@ledgerly/shared";
import { merchantMatchKey } from "./merchantKey.js";
import { daysBetween } from "./months.js";

export const REVIEW_WINDOW = 6;
export const DUPLICATE_WINDOW_DAYS = 3;
export const USD_SPIKE_RATIO = 1.2;
export const CATEGORY_MIN_HISTORY = 3;
export const CATEGORY_SPIKE_RATIO = 1.5;
export const CATEGORY_SPIKE_MIN_SHARE = 0.05;
export const REASON_ORDER: ReviewReason[] = ["duplicado", "usd", "nuevo", "sin-categoria"];
export const CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];

const AMOUNT_TOLERANCE = 0.005;

export interface StatementReviewInput {
  current: TransactionDTO[];
  history: TransactionDTO[][];
  knownMerchants: string[];
  previousStatements: number;
}

export interface StatementReviewResult {
  findings: ReviewFinding[];
  skippedChecks: ReviewCheck[];
}

interface DuplicateCandidate {
  tx: TransactionDTO;
  key: string;
  sameStatement: boolean;
}

export const purchases = (txs: TransactionDTO[]): TransactionDTO[] => txs.filter((tx) => tx.type === "purchase");

export const charges = (txs: TransactionDTO[]): TransactionDTO[] =>
  purchases(txs).filter((tx) => tx.direction === "debit");

export const isOldInstallment = (tx: TransactionDTO): boolean => tx.isInstallment && (tx.installmentCurrent ?? 1) > 1;

export const signedAmount = (tx: TransactionDTO): number => (tx.direction === "credit" ? -tx.amount : tx.amount);

const distance = (a: TransactionDTO, b: TransactionDTO): number => Math.abs(daysBetween(a.date, b.date));

const byDateThenId = (a: TransactionDTO, b: TransactionDTO): number =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

const toCandidate = (sameStatement: boolean) => (tx: TransactionDTO): DuplicateCandidate => ({
  tx,
  key: merchantMatchKey(tx.merchant),
  sameStatement,
});

const isSameCharge = (candidate: DuplicateCandidate, charge: DuplicateCandidate): boolean =>
  candidate.key === charge.key
  && candidate.tx.currency === charge.tx.currency
  && Math.abs(candidate.tx.amount - charge.tx.amount) < AMOUNT_TOLERANCE
  && distance(candidate.tx, charge.tx) <= DUPLICATE_WINDOW_DAYS
  && (candidate.tx.installmentCurrent ?? null) === (charge.tx.installmentCurrent ?? null);

const closestTo = (charge: TransactionDTO) => (a: DuplicateCandidate, b: DuplicateCandidate): number =>
  distance(a.tx, charge) - distance(b.tx, charge)
  || Number(b.sameStatement) - Number(a.sameStatement)
  || a.tx.id.localeCompare(b.tx.id);

export function findDuplicates(current: TransactionDTO[], history: TransactionDTO[][]): Map<string, ReviewDuplicateRef> {
  const ordered = charges(current).sort(byDateThenId).map(toCandidate(true));
  const previous = charges(history.flat()).map(toCandidate(false));
  const duplicates = new Map<string, ReviewDuplicateRef>();
  ordered.forEach((charge, position) => {
    const matches = [...ordered.slice(0, position), ...previous].filter((candidate) => isSameCharge(candidate, charge));
    const [closest] = matches.sort(closestTo(charge.tx));
    if (closest) {
      duplicates.set(charge.tx.id, {
        transactionId: closest.tx.id,
        date: closest.tx.date,
        sameStatement: closest.sameStatement,
      });
    }
  });
  return duplicates;
}

const usdCeilings = (history: TransactionDTO[][]): Map<string, number> => {
  const ceilings = new Map<string, number>();
  for (const tx of charges(history.flat())) {
    if (tx.currency !== "USD") continue;
    const key = merchantMatchKey(tx.merchant);
    ceilings.set(key, Math.max(ceilings.get(key) ?? 0, tx.amount));
  }
  return ceilings;
};

export function findUnusualUsd(current: TransactionDTO[], history: TransactionDTO[][]): Map<string, number | null> {
  const ceilings = usdCeilings(history);
  const unusual = new Map<string, number | null>();
  for (const tx of charges(current)) {
    if (tx.currency !== "USD" || isOldInstallment(tx)) continue;
    const ceiling = ceilings.get(merchantMatchKey(tx.merchant));
    if (ceiling === undefined) unusual.set(tx.id, null);
    else if (tx.amount > ceiling * USD_SPIKE_RATIO) unusual.set(tx.id, ceiling);
  }
  return unusual;
}

export function findNewMerchants(current: TransactionDTO[], knownMerchants: string[]): Set<string> {
  const known = new Set(knownMerchants.map(merchantMatchKey));
  const fresh = charges(current).filter((tx) => !isOldInstallment(tx) && !known.has(merchantMatchKey(tx.merchant)));
  return new Set(fresh.map((tx) => tx.id));
}

export function findUncategorized(current: TransactionDTO[]): Set<string> {
  const uncategorized = purchases(current).filter((tx) => tx.category === UNCATEGORIZED_CATEGORY);
  return new Set(uncategorized.map((tx) => tx.id));
}

const arsPurchases = (txs: TransactionDTO[]): TransactionDTO[] => purchases(txs).filter((tx) => tx.currency === "ARS");

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const categoryTotals = (txs: TransactionDTO[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const tx of arsPurchases(txs)) {
    if (tx.category === UNCATEGORIZED_CATEGORY) continue;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + signedAmount(tx));
  }
  return totals;
};

const isSpike = (total: number, average: number, threshold: number): boolean =>
  average <= 0
    ? total >= threshold
    : total >= average * CATEGORY_SPIKE_RATIO && total - average >= threshold;

const bySpikeSize = (a: ReviewCategoryFinding, b: ReviewCategoryFinding): number =>
  b.total - b.average - (a.total - a.average) || a.category.localeCompare(b.category);

export function findCategorySpikes(current: TransactionDTO[], history: TransactionDTO[][]): ReviewCategoryFinding[] {
  const statementTotal = sum(arsPurchases(current).map(signedAmount));
  if (history.length === 0 || statementTotal <= 0) return [];
  const threshold = CATEGORY_SPIKE_MIN_SHARE * statementTotal;
  const historyTotals = history.map(categoryTotals);
  const spikes: ReviewCategoryFinding[] = [];
  for (const [category, total] of categoryTotals(current)) {
    if (total <= 0) continue;
    const average = sum(historyTotals.map((totals) => totals.get(category) ?? 0)) / history.length;
    if (!isSpike(total, average, threshold)) continue;
    spikes.push({
      kind: "category",
      key: `cat:${category}`,
      category,
      total,
      average,
      ratio: average > 0 ? total / average : null,
    });
  }
  return spikes.sort(bySpikeSize);
}

const reasonRank = (reason: ReviewReason): number => REASON_ORDER.indexOf(reason);

const byReasonDateId = (a: ReviewTransactionFinding, b: ReviewTransactionFinding): number =>
  reasonRank(a.reasons[0]) - reasonRank(b.reasons[0]) || byDateThenId(a.transaction, b.transaction);

const skippedChecksFor = ({ history, previousStatements }: StatementReviewInput): ReviewCheck[] => {
  const skipped = new Set<ReviewCheck>();
  if (history.length === 0) skipped.add("usd");
  if (previousStatements === 0) skipped.add("nuevo");
  if (history.length < CATEGORY_MIN_HISTORY) skipped.add("categoria");
  return CHECK_ORDER.filter((check) => skipped.has(check));
};

export function buildStatementReview(input: StatementReviewInput): StatementReviewResult {
  const { current, history, knownMerchants } = input;
  const skippedChecks = skippedChecksFor(input);
  const skipped = new Set(skippedChecks);
  const duplicates = findDuplicates(current, history);
  const unusualUsd = skipped.has("usd") ? new Map<string, number | null>() : findUnusualUsd(current, history);
  const newMerchants = skipped.has("nuevo") ? new Set<string>() : findNewMerchants(current, knownMerchants);
  const uncategorized = findUncategorized(current);
  const hasReason: Record<ReviewReason, (id: string) => boolean> = {
    duplicado: (id) => duplicates.has(id),
    usd: (id) => unusualUsd.has(id),
    nuevo: (id) => newMerchants.has(id),
    "sin-categoria": (id) => uncategorized.has(id),
  };
  const transactionFindings = purchases(current)
    .map((transaction): ReviewTransactionFinding => ({
      kind: "transaction",
      key: `tx:${transaction.id}`,
      transaction,
      reasons: REASON_ORDER.filter((reason) => hasReason[reason](transaction.id)),
      duplicateOf: duplicates.get(transaction.id) ?? null,
      usualUsd: unusualUsd.get(transaction.id) ?? null,
    }))
    .filter((finding) => finding.reasons.length > 0)
    .sort(byReasonDateId);
  const categoryFindings = skipped.has("categoria") ? [] : findCategorySpikes(current, history);
  return { findings: [...transactionFindings, ...categoryFindings], skippedChecks };
}
