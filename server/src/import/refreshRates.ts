import type { RateRefreshCount } from "@ledgerly/shared";
import { AutoCouponModel, MortgageCouponModel, PayslipModel } from "../db/models.js";
import { createRateResolver, type RateResolver } from "../fx/rateCache.js";

export type { RateRefreshCount };

export interface RatesRefreshResult {
  cupones: RateRefreshCount;
  auto: RateRefreshCount;
  sueldos: RateRefreshCount;
}

interface RateBearingDoc {
  tipoCambioUsd?: number | null;
  tipoCambioSource?: string | null;
  save: () => Promise<unknown>;
}

const NOT_MANUAL = { tipoCambioSource: { $ne: "manual" } };

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

function applyRate(doc: RateBearingDoc, rate: number): void {
  doc.tipoCambioUsd = rate;
  doc.tipoCambioSource = "api";
}

export async function refreshDocRates<T extends RateBearingDoc>(
  docs: T[],
  dateOf: (doc: T) => Date,
  resolve: RateResolver,
): Promise<RateRefreshCount> {
  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const rate = await resolve(toIsoDate(dateOf(doc)));
    if (rate == null) {
      skipped += 1;
      continue;
    }
    applyRate(doc, rate);
    await doc.save();
    updated += 1;
  }
  return { updated, skipped };
}

export async function refreshAllRates(resolve: RateResolver = createRateResolver()): Promise<RatesRefreshResult> {
  const [cupones, autos, sueldos] = await Promise.all([
    MortgageCouponModel.find(NOT_MANUAL),
    AutoCouponModel.find(NOT_MANUAL),
    PayslipModel.find(NOT_MANUAL),
  ]);
  return {
    cupones: await refreshDocRates(cupones, (doc) => doc.fechaDebito, resolve),
    auto: await refreshDocRates(autos, (doc) => doc.fechaVencimiento, resolve),
    sueldos: await refreshDocRates(sueldos, (doc) => doc.fechaPago, resolve),
  };
}
