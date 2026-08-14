import { fetchOficialRate } from "./dollarRate.js";

export type RateResolver = (dateIso: string) => Promise<number | null>;

export function createRateResolver(fetchRate: RateResolver = fetchOficialRate): RateResolver {
  const cache = new Map<string, number | null>();
  return async (dateIso) => {
    const cached = cache.get(dateIso);
    if (cached !== undefined) return cached;
    const rate = await fetchRate(dateIso).catch(() => null);
    cache.set(dateIso, rate);
    return rate;
  };
}
