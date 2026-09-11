import { ERP_CATEGORIES } from "./estimate-erp.js";
import { ApiError } from "./errors.js";

/* Shared, side-effect-free rules for the labor rate master and the reusable
   labor work packages. Everything here is decided without a database so the
   arithmetic that turns a package default into an estimate line can be tested
   on its own, and so the route modules stay about locking and authorisation. */

export const LABOR_COST_TYPES = ["Engineering", "Installation"] as const;
export const LABOR_PROVIDERS = ["Internal", "Supplier"] as const;
export const LABOR_RATE_BASES = ["Daily", "Hourly"] as const;
export const LABOR_PACKAGE_STATUSES = ["Draft", "Active", "Retired"] as const;

export type LaborCostType = typeof LABOR_COST_TYPES[number];
export type LaborProvider = typeof LABOR_PROVIDERS[number];
export type LaborRateBasis = typeof LABOR_RATE_BASES[number];

/** A rate master row is only ever read for one cost type at a time. */
export type LaborRateValues = Readonly<{
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
}>;

export type LaborRateWindow = Readonly<{
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}>;

export type LaborRateStatus = "Effective" | "Future" | "Expired" | "Inactive";

/* dbo.manhour_lines.man_days is decimal(9,2), and the estimate ledger computes
   engineers * man_days * daily_rate. Two decimals is therefore the real
   resolution of any effort figure, not a display choice. */
export const MAN_DAYS_SCALE = 2;
export const MINIMUM_MAN_DAYS = 0.01;
export const MAXIMUM_HOURS_PER_DAY = 24;

export function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * factor) / factor;
}

function validation(message: string): ApiError {
  return new ApiError(400, "validation_failed", message);
}

/**
 * Convert an effort authored in hours into the man-days the ledger stores.
 *
 * hours_per_day is man-hour reporting metadata, never a cost factor, so the
 * conversion has to happen here and be stored: cost is always
 * engineers * man_days * daily_rate. The rounded man-days is authoritative, so
 * the effective hours can differ from the requested hours — callers show both.
 */
export function manDaysFromHours(hours: number, hoursPerDay: number): number {
  if (!Number.isFinite(hours) || hours <= 0) throw validation("Hours must be greater than zero.");
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > MAXIMUM_HOURS_PER_DAY) {
    throw validation(`Hours per day must be greater than zero and at most ${MAXIMUM_HOURS_PER_DAY}.`);
  }
  return Math.max(MINIMUM_MAN_DAYS, roundTo(hours / hoursPerDay, MAN_DAYS_SCALE));
}

/** The hours the line will actually report once man-days has been rounded. */
export function hoursFromManDays(manDays: number, hoursPerDay: number): number {
  return roundTo(manDays * hoursPerDay, MAN_DAYS_SCALE);
}

export function dailyRateFor(costType: LaborCostType, rate: LaborRateValues): number {
  return costType === "Installation" ? rate.installationDaily : rate.engineeringDaily;
}

export function hourlyRateFor(costType: LaborCostType, rate: LaborRateValues): number {
  return costType === "Installation" ? rate.installationHourly : rate.engineeringHourly;
}

/**
 * What the rate master row means on a given business date.
 *
 * Inactive wins over the window: a row that has been deactivated is not a rate
 * anyone may price from, whatever its dates say.
 */
export function laborRateStatus(window: LaborRateWindow, on: string): LaborRateStatus {
  if (!window.isActive) return "Inactive";
  if (window.effectiveFrom > on) return "Future";
  if (window.effectiveTo !== null && window.effectiveTo < on) return "Expired";
  return "Effective";
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function assertDateOnly(value: string, label: string): void {
  if (!DATE_ONLY.test(value)) throw validation(`${label} must be a YYYY-MM-DD date.`);
}

/** UTC-only date arithmetic: these are calendar dates, never instants. */
export function addDays(date: string, days: number): string {
  assertDateOnly(date, "Date");
  const shifted = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(shifted.getTime())) throw validation("Date is not a real calendar date.");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The two dates a supersede writes.
 *
 * The incumbent is closed the day before the successor starts, so the two
 * windows touch without overlapping — tr_engineering_rates_no_overlap rejects
 * any overlap — and the incumbent keeps covering every date it already priced.
 * That is what keeps lines already saved at the old rate both unchanged and
 * still valid under fn_estimate_validation's internal_rate_mismatch rule.
 */
export function supersedeWindow(incumbent: LaborRateWindow, successorFrom: string): {
  incumbentEffectiveTo: string;
  successorEffectiveFrom: string;
} {
  assertDateOnly(successorFrom, "Effective-from date");
  if (successorFrom <= incumbent.effectiveFrom) {
    throw new ApiError(409, "labor_rate_supersede_order",
      "The successor rate must start after the rate it replaces.");
  }
  if (incumbent.effectiveTo !== null && incumbent.effectiveTo < successorFrom) {
    throw new ApiError(409, "labor_rate_already_closed",
      "That rate already ends before the requested date, so there is nothing to supersede.");
  }
  return { incumbentEffectiveTo: addDays(successorFrom, -1), successorEffectiveFrom: successorFrom };
}

export function parseLaborCostType(value: unknown): LaborCostType {
  if (typeof value !== "string" || !(LABOR_COST_TYPES as readonly string[]).includes(value)) {
    throw validation(`Cost type must be one of: ${LABOR_COST_TYPES.join(", ")}.`);
  }
  return value as LaborCostType;
}

export function parseLaborProvider(value: unknown): LaborProvider {
  if (typeof value !== "string" || !(LABOR_PROVIDERS as readonly string[]).includes(value)) {
    throw validation(`Provider must be one of: ${LABOR_PROVIDERS.join(", ")}.`);
  }
  return value as LaborProvider;
}

export function parseLaborRateBasis(value: unknown): LaborRateBasis {
  if (typeof value !== "string" || !(LABOR_RATE_BASES as readonly string[]).includes(value)) {
    throw validation(`Rate basis must be one of: ${LABOR_RATE_BASES.join(", ")}.`);
  }
  return value as LaborRateBasis;
}

/**
 * A default ERP category, or null.
 *
 * `Unmapped` is what an unclassified line already falls back to at submit, so
 * storing it as a master default would say nothing; it is rejected here rather
 * than silently accepted.
 */
export function parseDefaultErpCategory(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(ERP_CATEGORIES as readonly string[]).includes(value)) {
    throw validation(`Default ERP category must be one of: ${ERP_CATEGORIES.join(", ")}.`);
  }
  return value;
}

export type LaborPackageLineEffort = Readonly<{
  rateBasis: LaborRateBasis;
  defaultEngineers: number;
  defaultManDays: number;
  defaultHours: number | null;
  defaultHoursPerDay: number;
}>;

export type LaborEffortOverride = Readonly<{
  engineers?: number | undefined;
  manDays?: number | undefined;
  hours?: number | undefined;
  hoursPerDay?: number | undefined;
}>;

export type ResolvedLaborEffort = Readonly<{
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  /** Hours the resulting line will report, after man-days rounding. */
  effectiveHours: number;
  /** Hours asked for, when the effort was authored or overridden in hours. */
  requestedHours: number | null;
}>;

/**
 * Turn a package line's stored defaults, plus whatever the estimator changed in
 * the picker, into the three effort numbers dbo.manhour_lines actually stores.
 *
 * Every default is overrideable: this is the single place that decides which
 * value wins, so the picker preview and the apply endpoint cannot disagree.
 */
export function resolveLaborEffort(line: LaborPackageLineEffort, override: LaborEffortOverride = {}): ResolvedLaborEffort {
  const hoursPerDay = override.hoursPerDay ?? line.defaultHoursPerDay;
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > MAXIMUM_HOURS_PER_DAY) {
    throw validation(`Hours per day must be greater than zero and at most ${MAXIMUM_HOURS_PER_DAY}.`);
  }
  const engineers = override.engineers ?? line.defaultEngineers;
  if (!Number.isFinite(engineers) || engineers <= 0) throw validation("Engineers must be greater than zero.");

  /* An explicit man-days override beats an hours override, and an hours
     override beats the stored basis. Only when nothing was overridden does the
     line's own rate_basis decide. */
  if (override.manDays !== undefined) {
    if (!Number.isFinite(override.manDays) || override.manDays <= 0) throw validation("Man-days must be greater than zero.");
    const manDays = roundTo(override.manDays, MAN_DAYS_SCALE);
    return { engineers, manDays, hoursPerDay, effectiveHours: hoursFromManDays(manDays, hoursPerDay), requestedHours: null };
  }

  const requestedHours = override.hours ?? (line.rateBasis === "Hourly" ? line.defaultHours : null);
  if (requestedHours !== null && requestedHours !== undefined) {
    const manDays = manDaysFromHours(requestedHours, hoursPerDay);
    return { engineers, manDays, hoursPerDay, effectiveHours: hoursFromManDays(manDays, hoursPerDay), requestedHours };
  }

  const manDays = roundTo(line.defaultManDays, MAN_DAYS_SCALE);
  if (!Number.isFinite(manDays) || manDays <= 0) throw validation("Man-days must be greater than zero.");
  return { engineers, manDays, hoursPerDay, effectiveHours: hoursFromManDays(manDays, hoursPerDay), requestedHours: null };
}

/** Guard the estimate ledger's monetary ceiling before any row is written. */
export const MAXIMUM_LINE_COST = 999_999_999_999_999;

export function laborLineCost(engineers: number, manDays: number, dailyRate: number): number {
  return roundTo(engineers * manDays * dailyRate, 4);
}

export function assertLaborLineCost(activity: string, engineers: number, manDays: number, dailyRate: number): number {
  const cost = laborLineCost(engineers, manDays, dailyRate);
  if (cost > MAXIMUM_LINE_COST) {
    throw validation(`Activity '${activity}' exceeds the maximum amount supported by the estimate ledger.`);
  }
  return cost;
}
