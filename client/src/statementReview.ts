import type {
  ReviewCategoryFinding,
  ReviewCheck,
  ReviewDuplicateRef,
  ReviewFinding,
  ReviewReason,
  ReviewTransactionFinding,
  StatementDTO,
  StatementReviewDTO,
} from "@ledgerly/shared";
import { latestStatementPerIssuer } from "./cardCycle.js";
import { formatMoney, formatSignedPercent } from "./format.js";

export type ReviewChipColor = "error" | "warning" | "info" | "default";

export const REVIEW_CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];

export const REVIEW_CHECK_LABELS: Record<ReviewCheck, string> = {
  duplicado: "Duplicados",
  usd: "USD inusuales",
  nuevo: "Comercios nuevos",
  categoria: "Categorías en alza",
  "sin-categoria": "Sin categoría",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  duplicado: "¿Duplicado?",
  usd: "USD inusual",
  nuevo: "Comercio nuevo",
  "sin-categoria": "Sin categoría",
};

export const REVIEW_CHECK_COLORS: Record<ReviewCheck, ReviewChipColor> = {
  duplicado: "error",
  usd: "warning",
  nuevo: "info",
  categoria: "warning",
  "sin-categoria": "default",
};

export const CATEGORY_HISTORY_NEEDED = 3;

export interface ReviewOption {
  statement: StatementDTO;
  isLatest: boolean;
}

export interface ReviewProgress {
  reviewed: number;
  total: number;
  pending: number;
  done: boolean;
  pendingKeys: string[];
}

export interface ReviewCheckSummary {
  check: ReviewCheck;
  label: string;
  count: number;
  skipped: boolean;
}

export interface SplitFindings {
  transactions: ReviewTransactionFinding[];
  categories: ReviewCategoryFinding[];
}

export function applyReviewedDelta(current: string[], keys: string[], reviewed: boolean): string[] {
  const unique = [...new Set(current)];
  if (!reviewed) {
    const removed = new Set(keys);
    return unique.filter((key) => !removed.has(key));
  }
  const present = new Set(unique);
  const added = [...new Set(keys)].filter((key) => !present.has(key));
  return [...unique, ...added];
}

export function reviewOptions(statements: StatementDTO[] | undefined, focus: StatementDTO | null): ReviewOption[] {
  const list = Array.isArray(statements) ? statements : [];
  const latest = latestStatementPerIssuer(list).map((statement) => ({ statement, isLatest: true }));
  if (!focus || latest.some((option) => option.statement.id === focus.id)) return latest;
  return [{ statement: focus, isLatest: false }, ...latest];
}

export function selectedReviewId(options: { id: string }[], selected: string | null): string | null {
  if (selected !== null && options.some((option) => option.id === selected)) return selected;
  return options[0]?.id ?? null;
}

export function reviewProgress(findings: ReviewFinding[], reviewedKeys: string[]): ReviewProgress {
  const marked = new Set(reviewedKeys);
  const pendingKeys = findings.filter((finding) => !marked.has(finding.key)).map((finding) => finding.key);
  const total = findings.length;
  return {
    reviewed: total - pendingKeys.length,
    total,
    pending: pendingKeys.length,
    done: pendingKeys.length === 0,
    pendingKeys,
  };
}

export function splitFindings(findings: ReviewFinding[]): SplitFindings {
  const transactions: ReviewTransactionFinding[] = [];
  const categories: ReviewCategoryFinding[] = [];
  for (const finding of findings) {
    if (finding.kind === "transaction") transactions.push(finding);
    else categories.push(finding);
  }
  return { transactions, categories };
}

export function reviewCheckSummary(review: StatementReviewDTO): ReviewCheckSummary[] {
  const { transactions, categories } = splitFindings(review.findings);
  const skipped = new Set(review.skippedChecks);
  const countFor = (check: ReviewCheck): number =>
    check === "categoria"
      ? categories.length
      : transactions.filter((finding) => finding.reasons.some((reason) => reason === check)).length;
  return REVIEW_CHECK_ORDER.map((check) => ({
    check,
    label: REVIEW_CHECK_LABELS[check],
    count: countFor(check),
    skipped: skipped.has(check),
  }));
}

const windowPhrase = (historyStatements: number): string =>
  historyStatements === 1 ? "el resumen anterior" : `los últimos ${historyStatements} resúmenes`;

const previousPhrase = (count: number): string => (count === 1 ? "1 resumen anterior" : `${count} resúmenes anteriores`);

const duplicateNote = ({ date, sameStatement }: ReviewDuplicateRef): string =>
  sameStatement
    ? `Mismo comercio y monto que el cargo del ${date}.`
    : `Mismo comercio y monto que un cargo del ${date}, en un resumen anterior.`;

const usdNote = (amount: number, usualUsd: number | null, historyStatements: number): string => {
  if (usualUsd === null) return `Sin cargos en USD de este comercio en ${windowPhrase(historyStatements)}.`;
  const rise = formatSignedPercent((amount / usualUsd - 1) * 100);
  return `Hasta ahora, como mucho ${formatMoney(usualUsd, "USD")} (${rise}).`;
};

export function transactionFindingNotes(finding: ReviewTransactionFinding, historyStatements: number): string[] {
  const notes: string[] = [];
  if (finding.duplicateOf) notes.push(duplicateNote(finding.duplicateOf));
  if (finding.reasons.includes("usd")) notes.push(usdNote(finding.transaction.amount, finding.usualUsd, historyStatements));
  return notes;
}

export function categoryFindingNote(finding: ReviewCategoryFinding, historyStatements: number): string {
  if (finding.ratio === null) return `Sin gasto en ${windowPhrase(historyStatements)}`;
  return `Promedio de ${windowPhrase(historyStatements)}: ${formatMoney(finding.average, "ARS")}`;
}

export function categoryFindingBadge(finding: ReviewCategoryFinding): string {
  return finding.ratio === null ? "Nueva" : formatSignedPercent((finding.ratio - 1) * 100);
}

export function historyCaption(review: StatementReviewDTO): string {
  if (review.previousStatements === 0) {
    return "Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría.";
  }
  const compared = previousPhrase(review.historyStatements);
  if (review.skippedChecks.includes("categoria")) {
    return `Comparado con ${compared}. Para comparar categorías hacen falta ${CATEGORY_HISTORY_NEEDED}.`;
  }
  return `Comparado con los ${compared} de esta tarjeta.`;
}

export function statementCaption(statement: StatementDTO): string {
  const { ars, usd } = statement.totals.saldoActual;
  const usdPart = usd > 0 ? ` + ${formatMoney(usd, "USD")}` : "";
  return `Cierre ${statement.closingDate ?? "—"} · Vence ${statement.dueDate ?? "—"} · Saldo ${formatMoney(ars, "ARS")}${usdPart}`;
}
