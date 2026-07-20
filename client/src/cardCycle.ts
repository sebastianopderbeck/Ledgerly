import type { Issuer, StatementDTO } from "@ledgerly/shared";

export interface CardCycleEntry {
  issuer: Issuer;
  cardLabel: string;
  last4: string | null;
  saldoActualArs: number;
  saldoActualUsd: number;
  pagoMinimoArs: number;
  closingDate: string | null;
  dueDate: string | null;
}

export interface CardCycleSummary {
  cards: CardCycleEntry[];
  totalArs: number;
  totalUsd: number;
  totalPagoMinimoArs: number;
}

export interface CardCycleBarData {
  keys: string[];
  row: Record<string, string | number>;
}

const byClosingDateDesc = (a: StatementDTO, b: StatementDTO): number =>
  (b.closingDate ?? "").localeCompare(a.closingDate ?? "");

export function latestStatementPerIssuer(statements: StatementDTO[]): StatementDTO[] {
  const groups = new Map<Issuer, StatementDTO[]>();
  for (const statement of statements) {
    const list = groups.get(statement.issuer) ?? [];
    list.push(statement);
    groups.set(statement.issuer, list);
  }
  const latest: StatementDTO[] = [];
  for (const list of groups.values()) {
    latest.push([...list].sort(byClosingDateDesc)[0]);
  }
  return latest.sort(byClosingDateDesc);
}

export function buildCardCycleSummary(statements: StatementDTO[]): CardCycleSummary | null {
  if (!Array.isArray(statements) || statements.length === 0) return null;
  const cards: CardCycleEntry[] = latestStatementPerIssuer(statements).map((statement) => ({
    issuer: statement.issuer,
    cardLabel: statement.cardLabel,
    last4: statement.last4,
    saldoActualArs: statement.totals.saldoActual.ars,
    saldoActualUsd: statement.totals.saldoActual.usd,
    pagoMinimoArs: statement.totals.pagoMinimo.ars,
    closingDate: statement.closingDate,
    dueDate: statement.dueDate,
  }));
  return {
    cards,
    totalArs: cards.reduce((total, card) => total + card.saldoActualArs, 0),
    totalUsd: cards.reduce((total, card) => total + card.saldoActualUsd, 0),
    totalPagoMinimoArs: cards.reduce((total, card) => total + card.pagoMinimoArs, 0),
  };
}

export function buildCardCycleBarData(cards: CardCycleEntry[]): CardCycleBarData {
  const keys = cards.map((card) => card.cardLabel);
  const row: Record<string, string | number> = { label: "A pagar" };
  for (const card of cards) row[card.cardLabel] = card.saldoActualArs;
  return { keys, row };
}
