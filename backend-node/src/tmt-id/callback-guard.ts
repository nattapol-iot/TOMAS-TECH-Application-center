import { RETRY_STATE_PREFIX } from "./constants.js";
import { sanitizeNextPath } from "./next-path.js";
import type { CallbackAction, TransientLogin } from "./types.js";

export function isRetriedState(state: string | undefined): boolean {
  return state?.startsWith(RETRY_STATE_PREFIX) === true;
}

// A stale or missing transient cookie is the normal outcome of a bookmarked
// callback or a browser that dropped the cookie, so login restarts once. The
// marker inside `state` is what stops a permanently broken cookie from turning
// that restart into an endless bounce.
export function resolveCallbackAction(
  login: TransientLogin | null,
  query: { state?: string; code?: string; error?: string },
): CallbackAction {
  if (query.error) return { kind: "fail", reason: query.error };
  const retried = isRetriedState(query.state);
  if (!login || !query.state || login.state !== query.state) {
    return retried
      ? { kind: "fail", reason: "state_mismatch" }
      : { kind: "retry", next: sanitizeNextPath(login?.next) };
  }
  if (!query.code) return { kind: "fail", reason: "missing_code" };
  return { kind: "exchange", login };
}