/* Labor rate master and labor work package arithmetic for the Estimate screens.
   The same rules the API applies, expressed once so the picker's preview and the
   line the server writes cannot disagree. No React, no fetch: importable from a
   test and from a "use client" screen alike. */

export const LABOR_RATE_BASES = ["Daily", "Hourly"] as const;
export type LaborRateBasis = typeof LABOR_RATE_BASES[number];
export type LaborCostType = "Engineering" | "Installation";
export type LaborProvider = "Internal" | "Supplier";
export type LaborRateStatus = "Effective" | "Future" | "Expired" | "Inactive";

/* dbo.manhour_lines.man_days is decimal(9,2) and the ledger computes
   engineers × man_days × daily_rate, so two decimals is the real resolution of
   any effort figure. hours_per_day is man-hour reporting, not a cost factor. */
export const MAN_DAYS_SCALE = 2;
export const MINIMUM_MAN_DAYS = 0.01;

export function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * factor) / factor;
}

/** Hours the estimator asked for → man-days the line can actually store. */
export function manDaysFromHours(hours: number, hoursPerDay: number): number {
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return MINIMUM_MAN_DAYS;
  return Math.max(MINIMUM_MAN_DAYS, roundTo(hours / hoursPerDay, MAN_DAYS_SCALE));
}

/** Hours the line will report once man-days has been rounded. */
export function hoursFromManDays(manDays: number, hoursPerDay: number): number {
  return roundTo(manDays * hoursPerDay, MAN_DAYS_SCALE);
}

export type LaborRateOption = {
  id: number;
  code: string | null;
  level: string;
  department: string;
  roleActivity: string;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: LaborRateStatus;
  version: number;
  defaultErpCategory: string | null;
};

export function rateDailyFor(costType: LaborCostType, rate: Pick<LaborRateOption, "engineeringDaily" | "installationDaily">): number {
  return costType === "Installation" ? rate.installationDaily : rate.engineeringDaily;
}

export function rateHourlyFor(costType: LaborCostType, rate: Pick<LaborRateOption, "engineeringHourly" | "installationHourly">): number {
  return costType === "Installation" ? rate.installationHourly : rate.engineeringHourly;
}

/** One line of text describing a rate master row in a picker. */
export function rateLabel(rate: LaborRateOption): string {
  const parts = [rate.code, rate.level, rate.department].filter((part): part is string => Boolean(part && part.trim()));
  const role = rate.roleActivity.trim();
  return role ? `${parts.join(" · ")} — ${role}` : parts.join(" · ");
}

/** The window, said plainly. An open-ended rate has no end to show. */
export function rateWindowLabel(rate: Pick<LaborRateOption, "effectiveFrom" | "effectiveTo">): string {
  return rate.effectiveTo ? `${rate.effectiveFrom} → ${rate.effectiveTo}` : `${rate.effectiveFrom} → open`;
}

/**
 * Only an effective rate may seed a new line.
 *
 * A future or expired rate is shown — an estimator needs to see that a rate card
 * changes next month — but picking one would write a line the server would
 * reject, and an inactive one has no live rate at all.
 */
export function rateSelectable(rate: Pick<LaborRateOption, "status">): boolean {
  return rate.status === "Effective";
}

export type ManhourSeedFromRate = {
  department: string;
  level: string;
  dailyRate: number;
  hourlyRate: number;
  erpCategory: string | null;
};

/**
 * What selecting a rate fills in.
 *
 * The estimator still enters people and duration; the rate supplies the
 * classification and the money. dailyRate is what the server will freeze on the
 * line, so showing it here is a preview of the real value, not a guess.
 */
export function seedFromRate(rate: LaborRateOption, costType: LaborCostType): ManhourSeedFromRate {
  return {
    department: rate.department,
    level: rate.level,
    dailyRate: rateDailyFor(costType, rate),
    hourlyRate: rateHourlyFor(costType, rate),
    erpCategory: rate.defaultErpCategory,
  };
}

export type LaborPackageLinePreview = {
  id: number;
  activity: string;
  department: string;
  level: string;
  costType: LaborCostType;
  provider: LaborProvider;
  rateBasis: LaborRateBasis;
  defaultEngineers: number;
  defaultManDays: number;
  defaultHours: number | null;
  defaultHoursPerDay: number;
  referenceDailyRate: number;
  defaultErpCategory: string | null;
};

export type LaborLineDraft = {
  skip: boolean;
  engineers: number;
  /** Present only while the line is being entered in hours. */
  hours: number | null;
  manDays: number;
  hoursPerDay: number;
  /** Supplier lines only; an internal rate always comes from the master. */
  dailyRate: number | null;
  supplierId: number | null;
  quotationNumber: string;
  priceDate: string;
  erpCategory: string | null;
};

export function draftFromPackageLine(line: LaborPackageLinePreview, today: string): LaborLineDraft {
  const hours = line.rateBasis === "Hourly" ? line.defaultHours : null;
  return {
    skip: false,
    engineers: line.defaultEngineers,
    hours,
    manDays: hours === null ? line.defaultManDays : manDaysFromHours(hours, line.defaultHoursPerDay),
    hoursPerDay: line.defaultHoursPerDay,
    dailyRate: line.provider === "Supplier" ? line.referenceDailyRate : null,
    supplierId: null,
    quotationNumber: "",
    priceDate: today,
    erpCategory: line.defaultErpCategory,
  };
}

export type LaborLinePreview = {
  manDays: number;
  /** Hours asked for, when the line is being entered in hours. */
  requestedHours: number | null;
  /** Hours the saved line will report, after man-days rounding. */
  effectiveHours: number;
  /** Rounding lost or gained time the estimator should see before applying. */
  hoursDiffer: boolean;
  /** Null for an internal line until the master rate is known. */
  estimatedCost: number | null;
  ready: boolean;
  blocker: string | null;
};

/**
 * Preview one drafted line.
 *
 * `masterDailyRate` is the live rate the picker read for this level, department
 * and cost type; it is null when no effective master rate covers them, which is
 * the one case an internal line cannot be applied.
 */
export function previewLaborLine(
  line: LaborPackageLinePreview,
  draft: LaborLineDraft,
  masterDailyRate: number | null,
): LaborLinePreview {
  const manDays = draft.hours === null ? roundTo(draft.manDays, MAN_DAYS_SCALE) : manDaysFromHours(draft.hours, draft.hoursPerDay);
  const effectiveHours = hoursFromManDays(manDays, draft.hoursPerDay);
  const supplier = line.provider === "Supplier";
  const dailyRate = supplier ? draft.dailyRate : masterDailyRate;

  let blocker: string | null = null;
  if (draft.engineers <= 0) blocker = "Engineers must be more than zero.";
  else if (manDays <= 0) blocker = "Duration must be more than zero.";
  else if (draft.hoursPerDay <= 0 || draft.hoursPerDay > 24) blocker = "Hours per day must be between 0 and 24.";
  else if (supplier && (!draft.supplierId || !draft.quotationNumber.trim() || !draft.priceDate)) {
    blocker = "A supplier activity needs a supplier, a quotation number and a price date.";
  } else if (supplier && (draft.dailyRate === null || draft.dailyRate <= 0)) {
    blocker = "A supplier activity needs its quoted daily rate.";
  } else if (!supplier && masterDailyRate === null) {
    blocker = `No effective rate master covers ${line.level} · ${line.department} · ${line.costType}.`;
  }

  return {
    manDays,
    requestedHours: draft.hours,
    effectiveHours,
    hoursDiffer: draft.hours !== null && roundTo(draft.hours, MAN_DAYS_SCALE) !== effectiveHours,
    estimatedCost: dailyRate === null ? null : roundTo(draft.engineers * manDays * dailyRate, 4),
    ready: blocker === null && !draft.skip,
    blocker,
  };
}

export type LaborApplySummary = {
  included: number;
  skipped: number;
  blocked: number;
  manDays: number;
  /* Only unblocked lines are counted, and a line with no rate to cost it with
     is always blocked, so this is never a partial total. */
  estimatedCost: number;
  canApply: boolean;
};

export function summarizeLaborApply(previews: LaborLinePreview[], drafts: LaborLineDraft[]): LaborApplySummary {
  let included = 0;
  let skipped = 0;
  let blocked = 0;
  let manDays = 0;
  let cost = 0;
  previews.forEach((preview, index) => {
    if (drafts[index]?.skip) { skipped += 1; return; }
    if (preview.blocker) { blocked += 1; return; }
    included += 1;
    manDays = roundTo(manDays + (drafts[index]?.engineers ?? 0) * preview.manDays, MAN_DAYS_SCALE);
    cost = roundTo(cost + (preview.estimatedCost ?? 0), 4);
  });
  return {
    included, skipped, blocked, manDays,
    estimatedCost: cost,
    /* A blocked line is not silently dropped: the whole apply waits until the
       estimator fixes it or skips it explicitly. */
    canApply: included > 0 && blocked === 0,
  };
}

export type LaborApplyOverride = {
  lineId: number;
  skip?: boolean;
  engineers?: number;
  manDays?: number;
  hours?: number;
  hoursPerDay?: number;
  dailyRate?: number;
  supplierId?: number;
  quotationNumber?: string;
  priceDate?: string;
  erpCategory?: string | null;
};

/**
 * Turn the drafts into the smallest request body that says what changed.
 *
 * Sending only real differences keeps the server's own defaults authoritative
 * and keeps the audit entry readable.
 */
export function applyOverrides(
  lines: LaborPackageLinePreview[],
  drafts: LaborLineDraft[],
  today: string,
): LaborApplyOverride[] {
  const overrides: LaborApplyOverride[] = [];
  lines.forEach((line, index) => {
    const draft = drafts[index];
    if (!draft) return;
    const base = draftFromPackageLine(line, today);
    const override: LaborApplyOverride = { lineId: line.id };
    let changed = false;
    if (draft.skip) { overrides.push({ lineId: line.id, skip: true }); return; }
    if (draft.engineers !== base.engineers) { override.engineers = draft.engineers; changed = true; }
    if (draft.hoursPerDay !== base.hoursPerDay) { override.hoursPerDay = draft.hoursPerDay; changed = true; }
    if (draft.hours !== null) {
      if (draft.hours !== base.hours) { override.hours = draft.hours; changed = true; }
    } else if (draft.manDays !== base.manDays) { override.manDays = draft.manDays; changed = true; }
    if (line.provider === "Supplier") {
      /* Supplier facts belong to this estimate, never to the library, so they
         always travel with the apply. */
      if (draft.dailyRate !== null) override.dailyRate = draft.dailyRate;
      if (draft.supplierId !== null) override.supplierId = draft.supplierId;
      if (draft.quotationNumber.trim()) override.quotationNumber = draft.quotationNumber.trim();
      if (draft.priceDate) override.priceDate = draft.priceDate;
      changed = true;
    }
    if (draft.erpCategory !== base.erpCategory) { override.erpCategory = draft.erpCategory; changed = true; }
    if (changed) overrides.push(override);
  });
  return overrides;
}

/** Reasons a package cannot be applied to the estimate in front of the user. */
export function packageApplyBlocker(
  status: string,
  lineCount: number,
  canEditManhour: boolean,
): string | null {
  if (!canEditManhour) return "You cannot add man-hour lines to this estimate.";
  if (status === "Retired") return "This package has been retired.";
  if (status !== "Active") return "Only published packages can be applied.";
  if (lineCount === 0) return "This package has no activities.";
  return null;
}
