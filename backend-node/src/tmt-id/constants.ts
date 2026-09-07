export const TMT_ID_SCOPE = "openid email profile";
export const CALLBACK_PATH = "/api/auth/callback";

export const SESSION_COOKIE_NAME = "itc_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const LOGIN_COOKIE_NAME = "itc_login";
export const LOGIN_COOKIE_PATH = "/api/auth";
export const LOGIN_TTL_SECONDS = 600;

export const RETRY_QUERY_KEY = "retry";
// The retry marker travels inside `state`, not only in the query string,
// because the guard exists for the case where the transient login cookie never
// arrived. `state` is the one value the provider always echoes to the callback.
export const RETRY_STATE_PREFIX = "r.";
export const FIRST_ATTEMPT_STATE_PREFIX = "n.";

// Browsers silently drop a cookie whose whole name=value pair passes 4096
// bytes, so the session is trimmed below that before it is sent.
export const SESSION_COOKIE_BUDGET_BYTES = 3800;

export const MASTER_DATA_CACHE_TTL_MS = 5 * 60_000;
export const MASTER_DATA_CACHE_MAX_ENTRIES = 500;
export const MASTER_DATA_TIMEOUT_MS = 4_000;

export const PROVISIONED_EMAIL_FALLBACK_DOMAIN = "tomastc.com";
export const PROVISIONED_INITIALS_MAX_LENGTH = 10;
