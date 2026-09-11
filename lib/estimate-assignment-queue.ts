/**
 * How an engineer's assigned estimate sections are ordered and what each one
 * asks them to do next.
 *
 * Visibility is decided by the API (`GET /api/v1/me/estimate-assignments`
 * selects only rows where the caller is the responsible or support engineer).
 * This module decides nothing about who may see what — it only turns the rows
 * the caller already owns into a queue with a clear next action, so a newly
 * assigned section is understandable before any work has started on it.
 */

export type EstimateAssignmentRecord = {
  assignmentId: number;
  estimateId: number;
  estimateNumber: string;
  inquiryNumber: string;
  projectName: string;
  customerName: string;
  revision: number;
  estimateStatus: string;
  estimateDueDate: string | null;
  estimateOwnerName: string;
  section: string;
  sectionCode: string;
  role: string;
  ownerName: string;
  supportName: string | null;
  dueDate: string | null;
  status: string;
  progress: number;
  comment: string | null;
  costLineCount: number;
};

/** Assignment states that mean the section's own work is finished. */
export const FINISHED_ASSIGNMENT_STATUSES = ["Completed", "Reviewed"];
/** Estimate states that no longer accept cost edits. */
export const READ_ONLY_ESTIMATE_STATUSES = ["Approved", "Locked"];

export type AssignmentUrgency = "overdue" | "due-soon" | "on-track" | "none";

const DAY = 86_400_000;

const dayDistance = (due: string | null, todayIso: string): number | null => {
  if (!due) return null;
  const from = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(from) || Number.isNaN(to) ? null : Math.round((to - from) / DAY);
};

/** Days until the section is due; negative when it is late, null when no date is set. */
export const assignmentDaysRemaining = (record: EstimateAssignmentRecord, todayIso: string): number | null =>
  dayDistance(record.dueDate ?? record.estimateDueDate, todayIso);

export function assignmentUrgency(record: EstimateAssignmentRecord, todayIso: string): AssignmentUrgency {
  if (isFinishedAssignment(record)) return "none";
  const days = assignmentDaysRemaining(record, todayIso);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  return days <= 7 ? "due-soon" : "on-track";
}

export const isFinishedAssignment = (record: EstimateAssignmentRecord): boolean =>
  FINISHED_ASSIGNMENT_STATUSES.includes(record.status);

export const isReadOnlyEstimate = (record: EstimateAssignmentRecord): boolean =>
  READ_ONLY_ESTIMATE_STATUSES.includes(record.estimateStatus);

/**
 * Actionable means the engineer can still change something: the section is not
 * finished and the estimate still accepts edits. A section that has not been
 * started is actionable — starting work records timing, it does not grant
 * visibility.
 */
export const isActionableAssignment = (record: EstimateAssignmentRecord): boolean =>
  !isFinishedAssignment(record) && !isReadOnlyEstimate(record);

export type AssignmentNextAction = { code: string; label: string; detail: string; opensEstimate: boolean };

/** The single next step for one assigned section, stated in the engineer's terms. */
export function assignmentNextAction(record: EstimateAssignmentRecord): AssignmentNextAction {
  const section = `${record.sectionCode} ${sectionName(record.sectionCode)}`.trim();
  if (isReadOnlyEstimate(record)) {
    return { code: "read-only", label: "Open Estimate", detail: `${record.estimateNumber} is ${record.estimateStatus} — ${section} is read-only.`, opensEstimate: true };
  }
  if (isFinishedAssignment(record)) {
    return { code: "done", label: "Open Estimate", detail: `${section} is ${record.status}. Nothing is waiting for you.`, opensEstimate: true };
  }
  if (record.status === "Waiting Supplier") {
    return { code: "waiting-supplier", label: "Open Estimate", detail: `${section} is waiting for a supplier price. Chase the quotation, then update the section.`, opensEstimate: true };
  }
  if (record.status === "Waiting Information") {
    return { code: "waiting-information", label: "Open Estimate", detail: `${section} is waiting for information from ${record.estimateOwnerName}.`, opensEstimate: true };
  }
  if (record.costLineCount === 0) {
    return { code: "first-cost-line", label: "Open Estimate · Cost Items", detail: `${section} has no cost line yet. Add the first line in the Cost Items tab.`, opensEstimate: true };
  }
  return {
    code: "continue-costing",
    label: "Open Estimate · Cost Items",
    detail: `${section} has ${record.costLineCount} cost line(s) at ${Math.round(record.progress)}%. Continue and update the section status.`,
    opensEstimate: true,
  };
}

const SECTION_NAMES: Record<string, string> = {
  "01": "Hardware", "02": "Software", "03": "Electrical", "04": "Mechanical", "05": "Robot",
  "06": "Engineering", "07": "Outsource", "08": "Transportation", "09": "Accommodation", "10": "Other Cost",
};

export const sectionName = (sectionCode: string): string => SECTION_NAMES[sectionCode] ?? "";

const URGENCY_ORDER: Record<AssignmentUrgency, number> = { overdue: 0, "due-soon": 1, "on-track": 2, none: 3 };

/**
 * Most urgent first, then by due date, then by estimate and section so the order
 * is stable between reloads. Finished and read-only rows always sink.
 */
export function sortAssignmentQueue(records: readonly EstimateAssignmentRecord[], todayIso: string): EstimateAssignmentRecord[] {
  return [...records].sort((left, right) => {
    const actionable = Number(isActionableAssignment(right)) - Number(isActionableAssignment(left));
    if (actionable) return actionable;
    const urgency = URGENCY_ORDER[assignmentUrgency(left, todayIso)] - URGENCY_ORDER[assignmentUrgency(right, todayIso)];
    if (urgency) return urgency;
    const due = (left.dueDate ?? left.estimateDueDate ?? "9999-12-31").localeCompare(right.dueDate ?? right.estimateDueDate ?? "9999-12-31");
    if (due) return due;
    return left.estimateNumber.localeCompare(right.estimateNumber) || left.sectionCode.localeCompare(right.sectionCode);
  });
}

/** Counts for the My Work summary row. */
export function assignmentQueueSummary(records: readonly EstimateAssignmentRecord[], todayIso: string) {
  const actionable = records.filter(isActionableAssignment);
  return {
    total: records.length,
    actionable: actionable.length,
    notStarted: actionable.filter((record) => record.status === "Not Started").length,
    overdue: actionable.filter((record) => assignmentUrgency(record, todayIso) === "overdue").length,
    dueThisWeek: actionable.filter((record) => assignmentUrgency(record, todayIso) === "due-soon").length,
  };
}
