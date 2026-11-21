export const MASTER_DATA_PATHS = {
  me: "/api/v1/me",
  companyCalendar: "/api/v1/company-calendar",
  exchangeRates: "/api/v1/exchange-rates",
  customers: "/api/v1/customers",
  suppliers: "/api/v1/suppliers",
  projects: "/api/v1/projects",
} as const;

export const PROJECT_SEARCH_LIMIT = 30;
export const PROJECT_CLOSED_STATUS = "CANCELLED";

// Attendance reads the same calendar and also leaves out WEEKLY and BANK rows; weekends are already
// rest days in every schedule calculation here, so SPECIAL (a Saturday off) changes nothing.
export const WORKING_CALENDAR_HOLIDAY_TYPES: readonly string[] = ["NATIONAL", "COMPANY", "SPECIAL"];
export const WORKING_CALENDAR_BRANCH = "BKK";
export const HOLIDAY_NAME_MAX = 200;
export const HOLIDAY_SYNC_INTERVAL_MS = 60 * 60_000;
export const HOLIDAY_SYNC_FIRST_RUN_MS = 10_000;
export const HOLIDAY_REFRESH_MIN_GAP_MS = 5 * 60_000;

export const THB = "THB";
export const EXCHANGE_RATE_CACHE_TTL_MS = 15 * 60_000;

export const OWN_RECORD_CACHE_TTL_MS = 30 * 60_000;
