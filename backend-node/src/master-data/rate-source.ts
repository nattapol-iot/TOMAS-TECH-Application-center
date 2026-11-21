import type { MasterDataClient } from "./client.js";
import { EXCHANGE_RATE_CACHE_TTL_MS, MASTER_DATA_PATHS } from "./constants.js";
import { thbRateOn, type ThbRate } from "./exchange-rates.js";

export type RateSource = { thbRate: (currency: string, date: string) => Promise<ThbRate | null> };

export function createRateSource(client: MasterDataClient, now: () => number = Date.now): RateSource {
  let cached: { at: number; rows: unknown[] } | null = null;
  return {
    async thbRate(currency, date) {
      if (!cached || now() - cached.at >= EXCHANGE_RATE_CACHE_TTL_MS) cached = { at: now(), rows: await client.listAll(MASTER_DATA_PATHS.exchangeRates) };
      return thbRateOn(cached.rows, currency, date);
    },
  };
}
