// Copilot holds one request up to 120 s; a little less leaves room for the network.
export const SCAN_WAIT_SECONDS = 110;
// Scans queue for one shared GPU; past this the person is told to try again rather than kept waiting.
export const SCAN_DEADLINE_MS = 280_000;
export const SCAN_SETTLED_STATES: readonly string[] = ["done", "error", "cancelled"];

export const BUSINESS_CARD_MAX_BYTES = 12 * 1024 * 1024;
export const BUSINESS_CARD_TYPES: readonly string[] = ["image/jpeg", "image/png"];
export const NAME_SCRIPTS = ["th", "en", "ja"] as const;
export const PHONE_PREFERENCE: readonly string[] = ["mobile", "tel", "fax"];

export const QUOTATION_CURRENCIES = ["THB", "JPY", "USD", "EUR"] as const;
export const QUOTATION_DEFAULT_CURRENCY = "THB";
export const TAX_ID_DIGITS = 13;
