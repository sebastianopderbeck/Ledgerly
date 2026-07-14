import type {
  Currency,
  ParsedStatement,
  ReconciliationEntry,
  ReconciliationResult,
} from "@ledgerly/shared";

const DEFAULT_TOLERANCE = { ars: 1, usd: 0.01 };
const CONSUMO_TYPES = new Set(["purchase", "refund"]);

export function reconcile(
  statement: ParsedStatement,
  tolerance: { ars: number; usd: number } = DEFAULT_TOLERANCE,
): ReconciliationResult {
  const signedSum = (currency: Currency) =>
    statement.rows
      .filter((r) => CONSUMO_TYPES.has(r.type) && r.currency === currency)
      .reduce((acc, r) => acc + (r.direction === "credit" ? -r.amount : r.amount), 0);

  const build = (currency: Currency, expected: number, tol: number): ReconciliationEntry => {
    const parsed = Math.round(signedSum(currency) * 100) / 100;
    const diff = Math.round((parsed - expected) * 100) / 100;
    return { currency, expected, parsed, diff, ok: Math.abs(diff) <= tol };
  };

  const entries: ReconciliationEntry[] = [
    build("ARS", statement.header.totals.totalConsumos.ars, tolerance.ars),
    build("USD", statement.header.totals.totalConsumos.usd, tolerance.usd),
  ];

  return { ok: entries.every((e) => e.ok), entries };
}
