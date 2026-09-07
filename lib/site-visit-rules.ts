/* ==========================================================================
   Sales Intake & Engineer Site Visit — shared business rules.

   Pure functions with no imports, so the same rule set can be:
     * imported by the production screens (readiness meter, conflict warning,
       which buttons a role is allowed to see),
     * transpiled and unit-tested by tests/site-visit-rules.test.mjs, and
     * mirrored field-for-field by the API, which re-enforces every one of
       them server-side. The UI copy is a convenience, never the referee.

   The status vocabularies below are the single source of truth for the
   CHECK constraints in database/migrations/016_sales_intake_site_visit.sql
   and for SiteVisitCore.cs. tests/site-visit-guardrails.test.mjs asserts the
   three stay in step.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Status vocabularies
   -------------------------------------------------------------------------- */

export const INTAKE_STATUSES = [
  "Draft",
  "Pending Technical Review",
  "More Information Required",
  "Ready to Schedule",
  "Scheduled",
  "Completed",
  "On Hold",
  "Cancelled",
  "Closed",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const VISIT_STATUSES = [
  "Tentative",
  "Pending Engineer Confirmation",
  "Pending Customer Confirmation",
  "Confirmed",
  "In Progress",
  "Report Pending",
  "Report Under Review",
  "Completed",
  "On Hold",
  "Reschedule Requested",
  "Cancelled",
  "Customer No-show",
  "Closed",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const REPORT_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Revision Requested",
  "Approved",
  "Acknowledged",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  "Proposed",
  "Accepted",
  "Declined",
  "Information Requested",
  "New Time Proposed",
  "Withdrawn",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/* --------------------------------------------------------------------------
   Permissions. Declared here so a screen and the API cannot drift on the
   spelling of a capability code.
   -------------------------------------------------------------------------- */

export const SITE_VISIT_PERMISSIONS = [
  "intake.read",
  "intake.write",
  "intake.review",
  "visit.read",
  "visit.schedule",
  "visit.override",
  "visit.execute",
  "visit.report",
  "visit.report_approve",
  "visit.link",
  "visit.admin",
] as const;

export type SiteVisitPermission = (typeof SITE_VISIT_PERMISSIONS)[number];

/* --------------------------------------------------------------------------
   Workflow transitions

   Each edge names the permission that authorises it and whether a reason is
   mandatory. A status may never move except along an edge declared here —
   "no skipping a step without permission" is expressed as the absence of an
   edge, not as a runtime check somewhere else.
   -------------------------------------------------------------------------- */

export type Transition = {
  to: string;
  permission: SiteVisitPermission;
  /** A free-text reason must accompany the change. */
  requiresReason?: boolean;
  /** Short label for the button that performs it. */
  action: string;
};

export const INTAKE_TRANSITIONS: Record<string, Transition[]> = {
  Draft: [
    { to: "Pending Technical Review", permission: "intake.write", action: "Submit for technical review" },
    { to: "Cancelled", permission: "intake.write", requiresReason: true, action: "Cancel intake" },
  ],
  "Pending Technical Review": [
    { to: "More Information Required", permission: "intake.review", requiresReason: true, action: "Return to sales" },
    { to: "Ready to Schedule", permission: "intake.review", action: "Approve for scheduling" },
    { to: "On Hold", permission: "intake.review", requiresReason: true, action: "Put on hold" },
    { to: "Cancelled", permission: "intake.review", requiresReason: true, action: "Cancel intake" },
  ],
  "More Information Required": [
    { to: "Pending Technical Review", permission: "intake.write", action: "Resubmit for technical review" },
    { to: "Cancelled", permission: "intake.write", requiresReason: true, action: "Cancel intake" },
  ],
  "Ready to Schedule": [
    { to: "Scheduled", permission: "visit.schedule", action: "Site visit scheduled" },
    { to: "More Information Required", permission: "intake.review", requiresReason: true, action: "Return to sales" },
    { to: "On Hold", permission: "intake.review", requiresReason: true, action: "Put on hold" },
    { to: "Cancelled", permission: "intake.review", requiresReason: true, action: "Cancel intake" },
  ],
  Scheduled: [
    { to: "Completed", permission: "visit.schedule", action: "Mark intake complete" },
    { to: "Ready to Schedule", permission: "visit.schedule", requiresReason: true, action: "Return to scheduling" },
    { to: "On Hold", permission: "intake.review", requiresReason: true, action: "Put on hold" },
    { to: "Cancelled", permission: "intake.review", requiresReason: true, action: "Cancel intake" },
  ],
  Completed: [
    { to: "Closed", permission: "intake.review", action: "Close intake" },
  ],
  "On Hold": [
    { to: "Pending Technical Review", permission: "intake.review", requiresReason: true, action: "Resume review" },
    { to: "Ready to Schedule", permission: "intake.review", requiresReason: true, action: "Resume scheduling" },
    { to: "Cancelled", permission: "intake.review", requiresReason: true, action: "Cancel intake" },
  ],
  Cancelled: [],
  Closed: [],
};

export const VISIT_TRANSITIONS: Record<string, Transition[]> = {
  Tentative: [
    { to: "Pending Engineer Confirmation", permission: "visit.schedule", action: "Request engineer confirmation" },
    { to: "Reschedule Requested", permission: "visit.schedule", requiresReason: true, action: "Request reschedule" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
    { to: "On Hold", permission: "visit.schedule", requiresReason: true, action: "Put on hold" },
  ],
  "Pending Engineer Confirmation": [
    { to: "Pending Customer Confirmation", permission: "visit.schedule", action: "Engineers accepted" },
    { to: "Tentative", permission: "visit.schedule", requiresReason: true, action: "Return to tentative" },
    { to: "Reschedule Requested", permission: "visit.schedule", requiresReason: true, action: "Request reschedule" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
    { to: "On Hold", permission: "visit.schedule", requiresReason: true, action: "Put on hold" },
  ],
  "Pending Customer Confirmation": [
    { to: "Confirmed", permission: "visit.schedule", action: "Customer confirmed" },
    { to: "Reschedule Requested", permission: "visit.schedule", requiresReason: true, action: "Request reschedule" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
    { to: "On Hold", permission: "visit.schedule", requiresReason: true, action: "Put on hold" },
  ],
  Confirmed: [
    { to: "In Progress", permission: "visit.execute", action: "Check in" },
    { to: "Reschedule Requested", permission: "visit.schedule", requiresReason: true, action: "Request reschedule" },
    { to: "Customer No-show", permission: "visit.execute", requiresReason: true, action: "Record customer no-show" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
  ],
  "In Progress": [
    { to: "Report Pending", permission: "visit.execute", action: "Check out" },
    { to: "Customer No-show", permission: "visit.execute", requiresReason: true, action: "Record customer no-show" },
  ],
  "Report Pending": [
    { to: "Report Under Review", permission: "visit.report", action: "Submit report for review" },
  ],
  "Report Under Review": [
    { to: "Completed", permission: "visit.report_approve", action: "Approve report" },
    { to: "Report Pending", permission: "visit.report_approve", requiresReason: true, action: "Request revision" },
  ],
  Completed: [
    { to: "Closed", permission: "visit.schedule", action: "Close visit" },
  ],
  "Reschedule Requested": [
    { to: "Tentative", permission: "visit.schedule", action: "Reschedule" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
  ],
  "On Hold": [
    { to: "Tentative", permission: "visit.schedule", requiresReason: true, action: "Resume scheduling" },
    { to: "Cancelled", permission: "visit.schedule", requiresReason: true, action: "Cancel visit" },
  ],
  "Customer No-show": [
    { to: "Reschedule Requested", permission: "visit.schedule", requiresReason: true, action: "Request reschedule" },
    { to: "Closed", permission: "visit.schedule", requiresReason: true, action: "Close without report" },
  ],
  Cancelled: [],
  Closed: [],
};

export type TransitionDecision =
  | { allowed: true; transition: Transition }
  | { allowed: false; code: "unknown_status" | "not_allowed" | "permission_denied" | "reason_required"; message: string };

function decide(
  map: Record<string, Transition[]>,
  from: string,
  to: string,
  permissions: readonly string[],
  reason: string | null | undefined,
): TransitionDecision {
  const edges = map[from];
  if (!edges) return { allowed: false, code: "unknown_status", message: `'${from}' is not a known status.` };
  const transition = edges.find((edge) => edge.to === to);
  if (!transition) return { allowed: false, code: "not_allowed", message: `'${from}' cannot move directly to '${to}'.` };
  if (!permissions.includes(transition.permission))
    return { allowed: false, code: "permission_denied", message: `Permission '${transition.permission}' is required.` };
  if (transition.requiresReason && !(reason ?? "").trim())
    return { allowed: false, code: "reason_required", message: "A reason is required for this status change." };
  return { allowed: true, transition };
}

export const decideIntakeTransition = (
  from: string,
  to: string,
  permissions: readonly string[],
  reason?: string | null,
): TransitionDecision => decide(INTAKE_TRANSITIONS, from, to, permissions, reason);

export const decideVisitTransition = (
  from: string,
  to: string,
  permissions: readonly string[],
  reason?: string | null,
): TransitionDecision => decide(VISIT_TRANSITIONS, from, to, permissions, reason);

/** Transitions a holder of these permissions may perform from `from`. */
export function availableTransitions(
  map: Record<string, Transition[]>,
  from: string,
  permissions: readonly string[],
): Transition[] {
  return (map[from] ?? []).filter((edge) => permissions.includes(edge.permission));
}

/* --------------------------------------------------------------------------
   Readiness score

   Ten checks, each weighted. A "blocker" check must pass before the intake
   may leave Draft; a "warning" only lowers the score and is surfaced to the
   coordinator. The score is deliberately a plain weighted percentage so a
   salesperson can see which line to fix rather than a black-box number.
   -------------------------------------------------------------------------- */

export type ReadinessInput = {
  customerId?: number | null;
  siteName?: string | null;
  siteAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  problemStatement?: string | null;
  expectedResult?: string | null;
  purposeCount?: number;
  machineName?: string | null;
  machineModel?: string | null;
  existingSystem?: string | null;
  attachmentCount?: number;
  windowCount?: number;
  safetyRequirement?: string | null;
  siteAccessRequirement?: string | null;
  skillCount?: number;
};

export type ReadinessSeverity = "blocker" | "warning";

export type ReadinessCheck = {
  key: string;
  label: string;
  weight: number;
  severity: ReadinessSeverity;
  hint: string;
};

const text = (value: string | null | undefined, minimum = 1) => (value ?? "").trim().length >= minimum;

const READINESS_RULES: (ReadinessCheck & { test: (input: ReadinessInput) => boolean })[] = [
  {
    key: "customer_site", label: "Customer and site are identified", weight: 12, severity: "blocker",
    hint: "Choose the customer and name the site or factory the engineer must reach.",
    test: (i) => Boolean(i.customerId && i.customerId > 0) && text(i.siteName) && text(i.siteAddress, 5),
  },
  {
    key: "contact", label: "Site contact person is reachable", weight: 12, severity: "blocker",
    hint: "A name plus at least one of phone or email.",
    test: (i) => text(i.contactName) && (text(i.contactPhone, 6) || text(i.contactEmail, 5)),
  },
  {
    key: "problem", label: "Current problem is described", weight: 14, severity: "blocker",
    hint: "What is happening today that made the customer call.",
    test: (i) => text(i.problemStatement, 20),
  },
  {
    key: "expected_result", label: "Expected result is stated", weight: 14, severity: "blocker",
    hint: "What the customer wants to be true after the work is done.",
    test: (i) => text(i.expectedResult, 20),
  },
  {
    key: "purpose", label: "Visit purpose is selected", weight: 10, severity: "blocker",
    hint: "At least one purpose, so the right checklist and skills are chosen.",
    test: (i) => (i.purposeCount ?? 0) > 0,
  },
  {
    key: "machine", label: "Machine or system information is sufficient", weight: 10, severity: "warning",
    hint: "Machine name plus a model, or a description of the existing system.",
    test: (i) => text(i.machineName) && (text(i.machineModel) || text(i.existingSystem, 10)),
  },
  {
    key: "attachment", label: "A photo, drawing or document is attached", weight: 8, severity: "warning",
    hint: "One picture of the real machine saves an hour of guessing.",
    test: (i) => (i.attachmentCount ?? 0) > 0,
  },
  {
    key: "window", label: "Customer availability window is proposed", weight: 8, severity: "warning",
    hint: "At least one date range the customer said would suit them.",
    test: (i) => (i.windowCount ?? 0) > 0,
  },
  {
    key: "safety", label: "Safety and site access are recorded", weight: 6, severity: "warning",
    hint: "PPE, permits, escorts, photography rules — anything that stops an engineer at the gate.",
    test: (i) => text(i.safetyRequirement, 3) || text(i.siteAccessRequirement, 3),
  },
  {
    key: "skill", label: "Expected engineering skills are indicated", weight: 6, severity: "warning",
    hint: "Sales' best guess is enough; the coordinator can correct it.",
    test: (i) => (i.skillCount ?? 0) > 0,
  },
];

/** The declaration of each check, without the predicate that evaluates it. */
const describe = (rule: ReadinessCheck & { test: unknown }): ReadinessCheck => ({
  key: rule.key, label: rule.label, weight: rule.weight, severity: rule.severity, hint: rule.hint,
});

export const READINESS_CHECKS: ReadinessCheck[] = READINESS_RULES.map(describe);

export type ReadinessResult = {
  score: number;
  passed: string[];
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  canSubmit: boolean;
};

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const passed: string[] = [];
  const blockers: ReadinessCheck[] = [];
  const warnings: ReadinessCheck[] = [];
  let earned = 0;
  let total = 0;

  for (const rule of READINESS_RULES) {
    total += rule.weight;
    const check = describe(rule);
    if (rule.test(input)) {
      earned += rule.weight;
      passed.push(rule.key);
    } else if (rule.severity === "blocker") {
      blockers.push(check);
    } else {
      warnings.push(check);
    }
  }

  return {
    score: total === 0 ? 0 : Math.round((earned / total) * 100),
    passed,
    blockers,
    warnings,
    canSubmit: blockers.length === 0,
  };
}

/* --------------------------------------------------------------------------
   Schedule conflict detection

   Every candidate appointment is compared against the engineer's existing
   appointments and their recorded unavailable periods. Travel time is added
   to both ends of an existing appointment, because two visits that merely
   touch still conflict if the engineer has to drive between them.
   -------------------------------------------------------------------------- */

export type Appointment = {
  /** Site visit id, or 0 for a leave/unavailable block. */
  visitId: number;
  visitNumber: string;
  startsAt: string;
  endsAt: string;
  travelMinutesBefore?: number;
  travelMinutesAfter?: number;
  status?: string;
  label?: string;
};

export type UnavailablePeriod = {
  id: number;
  reason: string;
  startsAt: string;
  endsAt: string;
};

export type ScheduleConflict = {
  kind: "appointment" | "travel" | "unavailable";
  visitId: number;
  reference: string;
  message: string;
};

const ms = (value: string) => Date.parse(value);
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** Statuses that no longer occupy the engineer's calendar. */
export const RELEASED_VISIT_STATUSES: readonly string[] = ["Cancelled", "Closed", "Customer No-show"];

export function detectScheduleConflicts(
  candidate: { startsAt: string; endsAt: string; travelMinutesBefore?: number; travelMinutesAfter?: number; excludeVisitId?: number },
  appointments: readonly Appointment[],
  unavailable: readonly UnavailablePeriod[] = [],
): ScheduleConflict[] {
  const start = ms(candidate.startsAt);
  const end = ms(candidate.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const candidateTravelStart = start - (candidate.travelMinutesBefore ?? 0) * 60_000;
  const candidateTravelEnd = end + (candidate.travelMinutesAfter ?? 0) * 60_000;

  const conflicts: ScheduleConflict[] = [];

  for (const appointment of appointments) {
    if (candidate.excludeVisitId && appointment.visitId === candidate.excludeVisitId) continue;
    if (appointment.status && RELEASED_VISIT_STATUSES.includes(appointment.status)) continue;
    const otherStart = ms(appointment.startsAt);
    const otherEnd = ms(appointment.endsAt);
    if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd)) continue;

    if (overlaps(start, end, otherStart, otherEnd)) {
      conflicts.push({
        kind: "appointment",
        visitId: appointment.visitId,
        reference: appointment.visitNumber,
        message: `Overlaps ${appointment.visitNumber}${appointment.label ? ` — ${appointment.label}` : ""}.`,
      });
      continue;
    }

    const otherTravelStart = otherStart - (appointment.travelMinutesBefore ?? 0) * 60_000;
    const otherTravelEnd = otherEnd + (appointment.travelMinutesAfter ?? 0) * 60_000;
    if (overlaps(candidateTravelStart, candidateTravelEnd, otherTravelStart, otherTravelEnd)) {
      conflicts.push({
        kind: "travel",
        visitId: appointment.visitId,
        reference: appointment.visitNumber,
        message: `Not enough travel time between this visit and ${appointment.visitNumber}.`,
      });
    }
  }

  for (const period of unavailable) {
    const periodStart = ms(period.startsAt);
    const periodEnd = ms(period.endsAt);
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd)) continue;
    if (overlaps(start, end, periodStart, periodEnd)) {
      conflicts.push({
        kind: "unavailable",
        visitId: 0,
        reference: period.reason,
        message: `The engineer is unavailable: ${period.reason}.`,
      });
    }
  }

  return conflicts;
}

/* --------------------------------------------------------------------------
   Skill match
   -------------------------------------------------------------------------- */

export type SkillMatch = { percent: number; matched: string[]; missing: string[] };

export function skillMatch(required: readonly string[], engineerSkills: readonly string[]): SkillMatch {
  const wanted = Array.from(new Set(required.map((code) => code.trim().toUpperCase()).filter(Boolean)));
  const held = new Set(engineerSkills.map((code) => code.trim().toUpperCase()).filter(Boolean));
  if (wanted.length === 0) return { percent: 100, matched: [], missing: [] };
  const matched = wanted.filter((code) => held.has(code));
  return {
    percent: Math.round((matched.length / wanted.length) * 100),
    matched,
    missing: wanted.filter((code) => !held.has(code)),
  };
}

/** Skill coverage of a whole assigned team, not of one engineer. */
export function teamSkillCoverage(
  required: readonly string[],
  team: readonly { skills: readonly string[] }[],
): SkillMatch {
  return skillMatch(required, team.flatMap((member) => member.skills));
}

/* --------------------------------------------------------------------------
   Report SLA
   -------------------------------------------------------------------------- */

export const DEFAULT_REPORT_SLA_DAYS = 3;
/** Hours before the deadline at which the report is called "due soon". */
export const REPORT_SLA_WARNING_HOURS = 24;

export function reportDueAt(checkOutAt: string, slaDays: number = DEFAULT_REPORT_SLA_DAYS): string | null {
  const checkedOut = ms(checkOutAt);
  if (!Number.isFinite(checkedOut)) return null;
  const days = Number.isFinite(slaDays) && slaDays > 0 ? Math.floor(slaDays) : DEFAULT_REPORT_SLA_DAYS;
  return new Date(checkedOut + days * 86_400_000).toISOString();
}

export type ReportSlaState = "not_applicable" | "on_track" | "due_soon" | "overdue" | "met" | "missed";

export function reportSlaState(
  dueAt: string | null | undefined,
  now: string,
  reportStatus: string | null | undefined,
  submittedAt?: string | null,
): ReportSlaState {
  if (!dueAt) return "not_applicable";
  const due = ms(dueAt);
  const current = ms(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return "not_applicable";

  const settled = reportStatus === "Submitted" || reportStatus === "Under Review"
    || reportStatus === "Approved" || reportStatus === "Acknowledged";
  if (settled) {
    const submitted = submittedAt ? ms(submittedAt) : current;
    return Number.isFinite(submitted) && submitted <= due ? "met" : "missed";
  }
  if (current > due) return "overdue";
  if (due - current <= REPORT_SLA_WARNING_HOURS * 3_600_000) return "due_soon";
  return "on_track";
}

/* --------------------------------------------------------------------------
   Notification de-duplication

   A notification is identified by who it is for, what kind it is, and which
   record it concerns. The API stores this string in a filtered unique index,
   so re-running the same workflow step cannot produce a second copy.
   -------------------------------------------------------------------------- */

export function notificationKey(kind: string, entityType: string, entityId: number, discriminator = ""): string {
  const parts = [kind, entityType, String(entityId), discriminator]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
  return parts.join(":").slice(0, 200);
}

/* --------------------------------------------------------------------------
   Document numbers. Allocated by dbo.issue_document_number, which renders
   TYPE-YYMM-NNNN; these patterns exist so a screen or a test can recognise
   one without re-deriving the format.
   -------------------------------------------------------------------------- */

export const INTAKE_NUMBER_PREFIX = "SIN";
export const VISIT_NUMBER_PREFIX = "SV";
export const REPORT_NUMBER_PREFIX = "SVR";

export const numberPattern = (prefix: string) => new RegExp(`^${prefix}-\\d{4}-\\d{4}$`);

export const isIntakeNumber = (value: string) => numberPattern(INTAKE_NUMBER_PREFIX).test(value.trim());
export const isVisitNumber = (value: string) => numberPattern(VISIT_NUMBER_PREFIX).test(value.trim());
export const isReportNumber = (value: string) => numberPattern(REPORT_NUMBER_PREFIX).test(value.trim());

/* --------------------------------------------------------------------------
   Master vocabularies the UI offers. The database holds the authoritative,
   admin-editable rows; these are the codes the seed installs and the fallback
   the screens show before master data loads.
   -------------------------------------------------------------------------- */

export const VISIT_PURPOSE_CODES = [
  "PRE_SALES_SURVEY", "REQUIREMENT_MEETING", "MACHINE_INSPECTION", "TROUBLESHOOTING",
  "MECHANICAL_SURVEY", "ELECTRICAL_SURVEY", "SOFTWARE_PLC_SURVEY", "ROBOT_APPLICATION_SURVEY",
  "SAFETY_ASSESSMENT", "INSTALLATION", "COMMISSIONING", "TRAINING",
  "PREVENTIVE_MAINTENANCE", "AFTER_SALES_SUPPORT",
] as const;

export const SKILL_CODES = [
  "MECHANICAL", "ELECTRICAL", "PLC", "ROBOT", "VISION", "SOFTWARE", "SAFETY", "PROCESS", "PROJECT_MANAGEMENT",
] as const;

export const ASSIGNMENT_ROLES = ["Lead Engineer", "Supporting Engineer"] as const;

export const CONFIRMATION_CHANNELS = ["Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other"] as const;

export const INTAKE_SOURCES = ["Email", "Phone", "Meeting", "Existing Customer", "Referral", "Website", "Other"] as const;

export const ATTACHMENT_CATEGORIES = [
  "Photo", "Video", "Drawing", "Layout", "Specification", "Customer Requirement",
  "Email / Meeting Note", "Measurement", "Other",
] as const;
