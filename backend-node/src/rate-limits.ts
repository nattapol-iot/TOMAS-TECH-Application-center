import type { FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";

/** One person with an estimate open polls about 11 times a minute without doing anything. */
export const PER_PERSON_REQUESTS_PER_MINUTE = 300;
/**
 * Requests with no signed-in person (health probes, the sign-in redirects) are counted per
 * address. Behind the Mac mini's port forwarding every client can share one address, so this
 * allows a whole office signing in at once.
 */
export const UNIDENTIFIED_REQUESTS_PER_MINUTE = 1200;
/** Rejected credentials per address per minute before further attempts get 429. */
export const FAILED_SIGN_INS_PER_MINUTE = 300;

const WINDOW_MS = 60_000;
const MAX_TRACKED_ADDRESSES = 10_000;

export function rateLimitedError(): ApiError {
  return new ApiError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
}

/** @fastify/rate-limit's max: a signed-in person gets their own allowance. */
export function requestAllowance(request: FastifyRequest): number {
  return request.identity ? PER_PERSON_REQUESTS_PER_MINUTE : UNIDENTIFIED_REQUESTS_PER_MINUTE;
}

// IPv6 clients usually own a whole /64, so a per-address count groups by it.
function addressKey(address: string): string {
  return address.includes(":") ? address.split(":").slice(0, 4).join(":") : address;
}

/**
 * Counts credentials the API rejected (401), per address. It is separate from
 * @fastify/rate-limit on purpose: every limiter from one plugin registration shares a
 * "this request was already limited" mark, so a second one is skipped once the first has run.
 */
export function failedSignInLimit(max = FAILED_SIGN_INS_PER_MINUTE, now: () => number = Date.now) {
  const windows = new Map<string, { started: number; count: number }>();
  return {
    /** Records one rejected attempt; throws 429 once the address is over its allowance. */
    record(address: string): void {
      const at = now(), key = addressKey(address);
      const window = windows.get(key);
      if (window && at - window.started < WINDOW_MS) {
        window.count += 1;
        if (window.count > max) throw rateLimitedError();
        return;
      }
      windows.delete(key);
      // Oldest windows go first (a Map keeps insertion order), so memory stays bounded.
      while (windows.size >= MAX_TRACKED_ADDRESSES) windows.delete(windows.keys().next().value!);
      windows.set(key, { started: at, count: 1 });
    },
  };
}
