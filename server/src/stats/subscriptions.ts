import {
  issuerSchema,
  type Cadencia,
  type Currency,
  type Direction,
  type Issuer,
  type SubscriptionDTO,
  type SubscriptionIncrease,
  type SubscriptionsReportDTO,
  type TxType,
} from "@ledgerly/shared";
import { canonicalMerchantKeys, merchantDisplayName, merchantKey, merchantSearchTerm } from "./merchantKey.js";
import { addDays, addMonths, addMonthsClamped, daysBetween, monthOf } from "./months.js";

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
export const CATEGORIA_SUSCRIPCIONES = "Suscripciones";
export const MESES_CADENCIA: Record<Cadencia, number> = { mensual: 1, anual: 12 };

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
  manuales: ReadonlySet<string>;
  anuales: ReadonlySet<string>;
  cotizacion: number | null;
}

export interface Charge extends SubscriptionTx {
  key: string;
}

type SubscriptionTotals = Pick<SubscriptionsReportDTO, "totalMensualArs" | "totalMensualUsd" | "totalAnualArs">;

interface KeyedTx {
  tx: SubscriptionTx;
  rawKey: string;
}

type Marked = (marks: ReadonlySet<string>) => boolean;

const LOG_PARECIDO = Math.log(1 + VARIACION_PARECIDA);

const roundCents = (value: number): number => Math.round(value * 100) / 100;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

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

const closestTo = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  candidates.reduce<Charge | undefined>(
    (best, candidate) =>
      best === undefined || amountGap(reference, candidate) < amountGap(reference, best) ? candidate : best,
    undefined,
  );

const closestRepeat = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  closestTo(reference, candidates.filter((candidate) => repeatsAmount(reference, candidate)));

const closestSameCurrency = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  closestTo(reference, candidates.filter(({ currency }) => currency === reference.currency));

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

const previousYearCharge = (current: Charge, monthCharges: Charge[]): Charge | undefined =>
  monthCharges.length === 1 ? monthCharges[0] : closestSameCurrency(current, monthCharges);

export function annualRun(charges: Charge[]): Charge[] {
  const months = groupBy(charges, ({ date }) => monthOf(date));
  const run: Charge[] = [];
  let current = latestCharge(charges);
  while (current !== undefined) {
    run.unshift(current);
    const previousMonth = addMonths(monthOf(current.date), -MESES_CADENCIA.anual);
    current = previousYearCharge(current, months.get(previousMonth) ?? []);
  }
  return run;
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
  const since = addMonths(monthOf(last.date), -VENTANA_AUMENTO_MESES);
  const reference = currencyTail(run).find(({ date }) => monthOf(date) >= since);
  if (reference === undefined || reference === last) return null;
  const variacion = last.amount / reference.amount - 1;
  if (variacion < UMBRAL_AUMENTO) return null;
  return { variacion, desde: monthOf(reference.date), montoAnterior: reference.amount };
}

const isValidRun = (run: Charge[]): boolean => run.length >= MIN_COBROS && similarAmounts(run);

const isEligibleDebit = ({ type, direction, isInstallment, amount }: SubscriptionTx): boolean =>
  type === "purchase" && direction === "debit" && !isInstallment && amount > 0;

const isRefundCredit = ({ type, direction }: SubscriptionTx): boolean =>
  direction === "credit" && (type === "purchase" || type === "refund");

const keyed = (txs: SubscriptionTx[]): KeyedTx[] =>
  txs.map((tx) => ({ tx, rawKey: merchantKey(tx.merchant) })).filter(({ rawKey }) => rawKey !== "");

const hasLaterSimilar = (charges: Charge[], last: Charge): boolean =>
  charges.some((charge) => monthOf(charge.date) > monthOf(last.date) && isSimilar(last, charge));

const statusOf = (last: Charge, proximoCobro: string, { ultimoCierre }: SubscriptionContext): SubscriptionDTO["estado"] => {
  const cierre = ultimoCierre[last.issuer];
  return cierre !== undefined && addDays(proximoCobro, GRACIA_DIAS) < cierre ? "cortada" : "activa";
};

const monthlyArs = ({ amount, currency }: Charge, meses: number, cotizacion: number | null): number | null => {
  if (currency === "ARS") return roundCents(amount / meses);
  return cotizacion === null ? null : roundCents((amount * cotizacion) / meses);
};

const previousCurrency = (run: Charge[], last: Charge): Currency | null =>
  run.find(({ currency }) => currency !== last.currency)?.currency ?? null;

const hasMark = (key: string, rawKeys: ReadonlySet<string>, marks: ReadonlySet<string>): boolean =>
  marks.has(key) || [...rawKeys].some((rawKey) => marks.has(rawKey));

const isForced = (charges: Charge[], marked: Marked, { manuales, anuales }: SubscriptionContext): boolean =>
  latestCharge(charges)?.category === CATEGORIA_SUSCRIPCIONES || marked(manuales) || marked(anuales);

const detectedRun = (charges: Charge[]): Charge[] | undefined => {
  const run = monthlyRuns(charges).filter(isValidRun).at(-1);
  if (run === undefined || hasLaterSimilar(charges, run[run.length - 1])) return undefined;
  return run;
};

const lastMonthlyRun = (charges: Charge[]): Charge[] | undefined => {
  const latest = latestCharge(charges);
  if (latest === undefined) return undefined;
  const run = monthlyRuns(charges).at(-1);
  const reachesLatestMonth = run !== undefined && monthOf(run[run.length - 1].date) === monthOf(latest.date);
  return reachesLatestMonth ? run : [latest];
};

const monthlyRun = (charges: Charge[], forced: boolean): Charge[] | undefined =>
  detectedRun(charges) ?? (forced ? lastMonthlyRun(charges) : undefined);

const runFor = (charges: Charge[], cadencia: Cadencia, forced: boolean): Charge[] | undefined =>
  cadencia === "anual" ? annualRun(charges) : monthlyRun(charges, forced);

const tooOldToList = (cadencia: Cadencia, last: Charge, proximoCobro: string, hoy: string): boolean =>
  (cadencia === "anual" ? proximoCobro : last.date) < addMonthsClamped(hoy, -VENTANA_CORTADAS_MESES);

const subscriptionOf = (charges: Charge[], marked: Marked, ctx: SubscriptionContext): SubscriptionDTO | null => {
  const cadencia: Cadencia = marked(ctx.anuales) ? "anual" : "mensual";
  const run = runFor(charges, cadencia, isForced(charges, marked, ctx));
  if (run === undefined) return null;
  const first = run[0];
  const last = run[run.length - 1];
  const meses = MESES_CADENCIA[cadencia];
  const proximoCobro = addMonthsClamped(last.date, meses);
  const estado = statusOf(last, proximoCobro, ctx);
  if (estado === "cortada" && tooOldToList(cadencia, last, proximoCobro, ctx.hoy)) return null;
  return {
    key: last.key,
    nombre: merchantDisplayName(last.merchant),
    busqueda: merchantSearchTerm(run.map(({ merchant }) => merchant).reverse()),
    categoria: last.category,
    cardLabel: last.cardLabel,
    moneda: last.currency,
    montoActual: last.amount,
    montoMensualArs: monthlyArs(last, meses, ctx.cotizacion),
    primerCobro: first.date,
    ultimoCobro: last.date,
    proximoCobro,
    cobros: run.length,
    estado,
    oculta: marked(ctx.ocultas),
    aumento: priceIncrease(run),
    monedaAnterior: previousCurrency(run, last),
    cadencia,
  };
};

const compareMonthlyArs = (a: number | null, b: number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
};

const compareSubscriptions = (a: SubscriptionDTO, b: SubscriptionDTO): number => {
  if (a.estado !== b.estado) return a.estado === "activa" ? -1 : 1;
  if (a.estado === "cortada") return b.ultimoCobro.localeCompare(a.ultimoCobro);
  return compareMonthlyArs(a.montoMensualArs, b.montoMensualArs) || a.nombre.localeCompare(b.nombre);
};

export function detectSubscriptions(txs: SubscriptionTx[], ctx: SubscriptionContext): SubscriptionDTO[] {
  const debitRows = keyed(txs.filter(isEligibleDebit));
  const creditRows = keyed(txs.filter(isRefundCredit));
  const canonical = canonicalMerchantKeys([...debitRows, ...creditRows].map(({ rawKey }) => rawKey));
  const canonicalOf = (rawKey: string): string => canonical.get(rawKey) ?? rawKey;
  const toCharge = ({ tx, rawKey }: KeyedTx): Charge => ({ ...tx, key: canonicalOf(rawKey) });
  const rowsByGroup = groupBy(debitRows, ({ rawKey }) => canonicalOf(rawKey));
  const debits = removeRefunded(debitRows.map(toCharge), creditRows.map(toCharge));
  return [...groupBy(debits, ({ key }) => key)]
    .flatMap(([key, charges]) => {
      const rawKeys = new Set((rowsByGroup.get(key) ?? []).map(({ rawKey }) => rawKey));
      const marked: Marked = (marks) => hasMark(key, rawKeys, marks);
      const subscription = subscriptionOf(charges, marked, ctx);
      return subscription ? [subscription] : [];
    })
    .sort(compareSubscriptions);
}

const monthlyUsd = ({ montoActual, cadencia }: SubscriptionDTO): number => montoActual / MESES_CADENCIA[cadencia];

export function summarizeSubscriptions(items: SubscriptionDTO[]): SubscriptionTotals {
  const counted = items.filter(({ estado, oculta }) => estado === "activa" && !oculta);
  const totalMensualArs = roundCents(sum(counted.map(({ montoMensualArs }) => montoMensualArs ?? 0)));
  const totalMensualUsd = roundCents(sum(counted.filter(({ moneda }) => moneda === "USD").map(monthlyUsd)));
  return { totalMensualArs, totalMensualUsd, totalAnualArs: roundCents(totalMensualArs * 12) };
}
