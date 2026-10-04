import {
  issuerSchema,
  type Currency,
  type Direction,
  type Issuer,
  type SubscriptionIncrease,
  type TxType,
} from "@ledgerly/shared";
import { addMonths, addMonthsClamped, daysBetween, monthOf } from "./months.js";

export { addMonthsClamped };

export const MIN_COBROS = 3;
export const VARIACION_PARECIDA = 0.25;
export const MISMO_MONTO = 0.01;
export const UMBRAL_AUMENTO = 0.05;
export const VENTANA_AUMENTO_MESES = 12;
export const GRACIA_DIAS = 7;
export const VENTANA_CORTADAS_MESES = 12;
export const DIAS_ANULACION = 15;
export const TOLERANCIA_ANULACION = 0.01;

export interface SubscriptionTx {
  date: string;
  merchant: string;
  amount: number;
  currency: Currency;
  direction: Direction;
  type: TxType;
  isInstallment: boolean;
  category: string;
  issuer: Issuer;
  cardLabel: string;
}

export interface SubscriptionContext {
  hoy: string;
  ultimoCierre: Partial<Record<Issuer, string>>;
  ocultas: ReadonlySet<string>;
  cotizacion: number | null;
}

export interface Charge extends SubscriptionTx {
  key: string;
}

const LOG_PARECIDO = Math.log(1 + VARIACION_PARECIDA);

const byDate = (a: Charge, b: Charge): number => a.date.localeCompare(b.date);

const groupBy = <T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
};

const isSimilar = (a: Charge, b: Charge): boolean =>
  a.currency === b.currency && Math.abs(Math.log(b.amount / a.amount)) <= LOG_PARECIDO;

const amountGap = (reference: Charge, candidate: Charge): number => Math.abs(candidate.amount / reference.amount - 1);

const repeatsAmount = (reference: Charge, candidate: Charge): boolean =>
  reference.currency === candidate.currency && amountGap(reference, candidate) <= MISMO_MONTO;

export function latestClosingByIssuer(
  statements: { issuer: string; closingDate: Date | null }[],
): Partial<Record<Issuer, string>> {
  const latest: Partial<Record<Issuer, string>> = {};
  for (const { issuer, closingDate } of statements) {
    const parsed = issuerSchema.safeParse(issuer);
    if (!closingDate || !parsed.success) continue;
    const closing = closingDate.toISOString().slice(0, 10);
    const current = latest[parsed.data];
    if (current === undefined || closing > current) latest[parsed.data] = closing;
  }
  return latest;
}

const refunds = (credit: Charge, debit: Charge): boolean => {
  const days = daysBetween(debit.date, credit.date);
  return debit.key === credit.key
    && debit.currency === credit.currency
    && Math.abs(debit.amount - credit.amount) <= TOLERANCIA_ANULACION
    && days >= 0
    && days <= DIAS_ANULACION;
};

const latestCharge = (charges: Charge[]): Charge | undefined =>
  charges.reduce<Charge | undefined>(
    (latest, charge) => (latest === undefined || charge.date > latest.date ? charge : latest),
    undefined,
  );

export function removeRefunded(debits: Charge[], credits: Charge[]): Charge[] {
  const annulled = new Set<Charge>();
  for (const credit of [...credits].sort(byDate)) {
    const match = latestCharge(debits.filter((debit) => !annulled.has(debit) && refunds(credit, debit)));
    if (match) annulled.add(match);
  }
  return debits.filter((debit) => !annulled.has(debit));
}

const closestRepeat = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  candidates
    .filter((candidate) => repeatsAmount(reference, candidate))
    .reduce<Charge | undefined>(
      (best, candidate) =>
        best === undefined || amountGap(reference, candidate) < amountGap(reference, best) ? candidate : best,
      undefined,
    );

const nextCharge = (last: Charge | undefined, monthCharges: Charge[]): Charge | undefined => {
  if (monthCharges.length === 1) return monthCharges[0];
  return last === undefined ? undefined : closestRepeat(last, monthCharges);
};

const followsMonth = (last: Charge, month: string): boolean => addMonths(monthOf(last.date), 1) === month;

export function monthlyRuns(charges: Charge[]): Charge[][] {
  const runs: Charge[][] = [];
  let run: Charge[] = [];
  const closeRun = (): void => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  const months = groupBy([...charges].sort(byDate), ({ date }) => monthOf(date));
  for (const [month, monthCharges] of months) {
    const last = run.at(-1);
    if (last !== undefined && !followsMonth(last, month)) closeRun();
    const next = nextCharge(run.at(-1), monthCharges);
    if (next === undefined) closeRun();
    else run.push(next);
  }
  closeRun();
  return runs;
}

const consecutivePairs = (run: Charge[]): [Charge, Charge][] =>
  run.slice(1).map((charge, index): [Charge, Charge] => [run[index], charge]);

export function similarAmounts(run: Charge[]): boolean {
  const pairs = consecutivePairs(run).filter(([previous, current]) => previous.currency === current.currency);
  if (pairs.length === 0) return false;
  const similar = pairs.filter(([previous, current]) => isSimilar(previous, current)).length;
  return similar * 2 > pairs.length;
}

const currencyTail = (run: Charge[]): Charge[] => {
  const currency = run.at(-1)?.currency;
  let start = run.length;
  while (start > 0 && run[start - 1].currency === currency) start -= 1;
  return run.slice(start);
};

export function priceIncrease(run: Charge[]): SubscriptionIncrease | null {
  const last = run.at(-1);
  if (last === undefined) return null;
  const since = addMonthsClamped(last.date, -VENTANA_AUMENTO_MESES);
  const reference = currencyTail(run).find(({ date }) => date >= since);
  if (reference === undefined || reference === last) return null;
  const variacion = last.amount / reference.amount - 1;
  if (variacion < UMBRAL_AUMENTO) return null;
  return { variacion, desde: monthOf(reference.date), montoAnterior: reference.amount };
}
