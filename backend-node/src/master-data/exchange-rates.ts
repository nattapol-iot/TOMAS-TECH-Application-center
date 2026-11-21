import { THB } from "./constants.js";

export type ThbRate = { currency: string; rate: number; effectiveFrom: string };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** The baht rate of a currency in force on a date: the row with the latest effective_from not after it. */
export function thbRateOn(items: readonly unknown[], currency: string, date: string): ThbRate | null {
  let best: ThbRate | null = null;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const from = text(row.effective_from), to = text(row.effective_to), rate = Number(row.rate);
    if (text(row.from_currency) !== currency || text(row.to_currency) !== THB) continue;
    if (!from || from > date || (to && to < date) || !Number.isFinite(rate) || rate <= 0) continue;
    if (!best || from > best.effectiveFrom) best = { currency, rate, effectiveFrom: from };
  }
  return best;
}
