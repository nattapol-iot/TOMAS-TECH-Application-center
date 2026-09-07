export type PerformanceInsightConfidence = "LOW" | "MEDIUM" | "HIGH";
export type PerformanceInsightKind = "STRENGTH" | "ATTENTION" | "NEXT" | "CONTEXT";
export type PerformanceInsightAreaCode =
  | "DELIVERY" | "QUALITY" | "TECHNICAL"
  | "CUSTOMER" | "COMMERCIAL" | "HANDOVER" | "FORECAST";

export type PerformanceInsight = {
  reasonCode: string;
  kind: PerformanceInsightKind;
  areaCode: PerformanceInsightAreaCode;
  confidence: PerformanceInsightConfidence;
  priority: number;
  facts: Record<string, number | string | boolean | null>;
  source: { type: "PROJECT" | "INQUIRY" | "TASK"; id: number; label: string } | null;
};

type ProjectRow = {
  id: number;
  project_no: string;
  target_delivery: Date | string;
  actual_delivery: Date | string | null;
};

type ScheduleTaskRow = {
  id: number;
  status: string;
  due_date: Date | string | null;
  actual_end: Date | string | null;
  updated_at: Date | string;
  name: string;
};

type ResourceTaskRow = {
  id: number;
  title: string;
  is_issue: boolean;
  state: string;
  execution_status: string;
  due_date: Date | string | null;
  actual_end: Date | string | null;
  updated_at: Date | string;
};

type SalesInquiryRow = {
  id: number;
  inquiry_no: string;
  status: string;
  inquiry_date: Date | string;
  meeting_count: number;
  estimate_id: number | null;
  project_id: number | null;
};

type Candidate = PerformanceInsight & { magnitude: number };

const confidenceRank: Record<PerformanceInsightConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const dateOnly = (value: Date | string | null): string | null => value === null
  ? null
  : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

function distinctById<T extends { id: number }>(rows: T[]): T[] {
  const distinct = new Map<number, T>();
  for (const row of rows) if (!distinct.has(Number(row.id))) distinct.set(Number(row.id), row);
  return [...distinct.values()];
}

function asCandidate(
  reasonCode: string,
  kind: Exclude<PerformanceInsightKind, "NEXT">,
  areaCode: PerformanceInsightAreaCode,
  confidence: PerformanceInsightConfidence,
  priority: number,
  facts: PerformanceInsight["facts"],
  source: PerformanceInsight["source"],
  magnitude: number,
): Candidate {
  // LOW-confidence data may provide context, but cannot support a personal praise or warning.
  return { reasonCode, kind: confidence === "LOW" ? "CONTEXT" : kind, areaCode, confidence, priority, facts, source, magnitude };
}

function selectInsights(candidates: Candidate[]): PerformanceInsight[] {
  const sorted = [...candidates].sort((left, right) =>
    confidenceRank[right.confidence] - confidenceRank[left.confidence]
    || left.priority - right.priority
    || right.magnitude - left.magnitude
    || left.reasonCode.localeCompare(right.reasonCode));
  const selected: Candidate[] = [];
  for (const candidate of sorted) {
    if (selected.some((item) => item.kind === candidate.kind)) continue;
    selected.push(candidate);
  }
  const presentationOrder: Record<PerformanceInsightKind, number> = { STRENGTH: 0, ATTENTION: 1, NEXT: 2, CONTEXT: 3 };
  return selected.slice(0, 3)
    .sort((left, right) => presentationOrder[left.kind] - presentationOrder[right.kind])
    .map((candidate) => ({
      reasonCode: candidate.reasonCode,
      kind: candidate.kind,
      areaCode: candidate.areaCode,
      confidence: candidate.confidence,
      priority: candidate.priority,
      facts: candidate.facts,
      source: candidate.source,
    }));
}

export function buildEngineeringPerformanceInsights(input: {
  projects: ProjectRow[];
  scheduleTasks: ScheduleTaskRow[];
  resourceTasks: ResourceTaskRow[];
  asOf: Date | string;
  confidence: PerformanceInsightConfidence;
}): PerformanceInsight[] {
  const asOf = dateOnly(input.asOf)!;
  const projects = distinctById(input.projects);
  const scheduleTasks = distinctById(input.scheduleTasks);
  const resourceTasks = distinctById(input.resourceTasks);
  // The canonical evidence query excludes Resource tasks linked to Schedule tasks.
  // Within each canonical source, repeated joins are still collapsed by identity here.
  const tasks = [
    ...scheduleTasks.map((task) => ({
      id: task.id, label: task.name, issue: false, due: dateOnly(task.due_date), actual: dateOnly(task.actual_end),
      completed: task.status === "Done" || task.actual_end !== null, updated: dateOnly(task.updated_at)!,
    })),
    ...resourceTasks.map((task) => ({
      id: task.id, label: task.title, issue: Boolean(task.is_issue), due: dateOnly(task.due_date), actual: dateOnly(task.actual_end),
      completed: task.state === "Closed" || task.execution_status === "Done" || task.actual_end !== null,
      updated: dateOnly(task.updated_at)!,
    })),
  ];
  const dueTasks = tasks.filter((task) => task.due && (task.due <= asOf || task.completed));
  const onTimeTasks = dueTasks.filter((task) => task.completed && task.actual && task.due && task.actual <= task.due);
  const overdueTasks = dueTasks.filter((task) => !task.completed && task.due! < asOf)
    .sort((left, right) => left.due!.localeCompare(right.due!) || left.id - right.id);
  const issueTasks = resourceTasks.filter((task) => task.is_issue);
  // Only the canonical Closed state proves closure. An actual_end value on a reopened Issue does not.
  const closedIssues = issueTasks.filter((task) => task.state === "Closed");
  const openIssues = issueTasks.filter((task) => task.state !== "Closed")
    .sort((left, right) => (dateOnly(left.due_date) ?? dateOnly(left.updated_at)!).localeCompare(dateOnly(right.due_date) ?? dateOnly(right.updated_at)!) || left.id - right.id);
  const completedTechnical = tasks.filter((task) => !task.issue && task.completed)
    .sort((left, right) => (right.actual ?? right.updated).localeCompare(left.actual ?? left.updated) || left.id - right.id);
  const deliveredProjects = projects.filter((project) => project.actual_delivery !== null);
  const earlyProjects = deliveredProjects.filter((project) => dateOnly(project.actual_delivery)! < dateOnly(project.target_delivery)!)
    .sort((left, right) => dateOnly(left.actual_delivery)!.localeCompare(dateOnly(right.actual_delivery)!) || left.id - right.id);
  const candidates: Candidate[] = [];

  if (earlyProjects.length) {
    const project = earlyProjects[0]!;
    candidates.push(asCandidate("DELIVERY_EARLY", "STRENGTH", "DELIVERY", input.confidence, 10, {
      actualDate: dateOnly(project.actual_delivery)!, targetDate: dateOnly(project.target_delivery)!,
      earlyProjectCount: earlyProjects.length, deliveredProjectCount: deliveredProjects.length,
    }, { type: "PROJECT", id: project.id, label: project.project_no }, earlyProjects.length / Math.max(1, deliveredProjects.length)));
  }
  if (dueTasks.length >= 3 && onTimeTasks.length / dueTasks.length >= 0.8) {
    candidates.push(asCandidate("DELIVERY_ON_TIME", "STRENGTH", "DELIVERY", input.confidence, 20, {
      onTimeCount: onTimeTasks.length, dueCount: dueTasks.length,
    }, null, onTimeTasks.length / dueTasks.length));
  }
  if (overdueTasks.length >= 2 || (dueTasks.length >= 4 && overdueTasks.length / dueTasks.length >= 0.25)) {
    const oldest = overdueTasks[0]!;
    candidates.push(asCandidate("DELIVERY_REVIEW", "ATTENTION", "DELIVERY", input.confidence, 10, {
      overdueCount: overdueTasks.length, dueCount: dueTasks.length, oldestDueDate: oldest.due,
    }, { type: "TASK", id: oldest.id, label: oldest.label }, overdueTasks.length / Math.max(1, dueTasks.length)));
  }
  if (issueTasks.length >= 2 && closedIssues.length / issueTasks.length >= 0.8) {
    candidates.push(asCandidate("ISSUE_HANDLING_STRONG", "STRENGTH", "QUALITY", input.confidence, 30, {
      closedIssueCount: closedIssues.length, issueCount: issueTasks.length,
    }, null, closedIssues.length / issueTasks.length));
  }
  if (openIssues.length >= 2) {
    const oldest = openIssues[0]!;
    candidates.push(asCandidate("ISSUE_WORKLOAD_REVIEW", "ATTENTION", "QUALITY", input.confidence, 20, {
      openIssueCount: openIssues.length, issueCount: issueTasks.length,
      oldestIssueDate: dateOnly(oldest.due_date) ?? dateOnly(oldest.updated_at),
    }, { type: "TASK", id: oldest.id, label: oldest.title }, openIssues.length / Math.max(1, issueTasks.length)));
  }
  if (completedTechnical.length) {
    const recent = completedTechnical[0]!;
    candidates.push(asCandidate("TECHNICAL_CONTRIBUTION", "STRENGTH", "TECHNICAL", input.confidence, 40, {
      completedCount: completedTechnical.length,
    }, { type: "TASK", id: recent.id, label: recent.label }, completedTechnical.length));
  }
  return selectInsights(candidates);
}

const ESTIMATE_REQUIRED_STATUSES = new Set(["Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved"]);

export function buildSalesPerformanceInsights(input: {
  inquiries: SalesInquiryRow[];
  confidence: PerformanceInsightConfidence;
}): PerformanceInsight[] {
  const inquiries = distinctById(input.inquiries).map((row) => ({ ...row, meeting_count: Number(row.meeting_count) }));
  const active = inquiries.filter((row) => !["Approved", "Cancelled"].includes(row.status));
  const activeWithMeeting = active.filter((row) => row.meeting_count > 0);
  const eligible = inquiries.filter((row) => ESTIMATE_REQUIRED_STATUSES.has(row.status));
  const estimateCovered = eligible.filter((row) => row.estimate_id !== null);
  const approved = inquiries.filter((row) => row.status === "Approved");
  const cancelled = inquiries.filter((row) => row.status === "Cancelled");
  const handovers = approved.filter((row) => row.project_id !== null);
  const candidates: Candidate[] = [];
  const oldest = (rows: typeof inquiries) => [...rows].sort((left, right) =>
    dateOnly(left.inquiry_date)!.localeCompare(dateOnly(right.inquiry_date)!) || left.id - right.id)[0];

  if (active.length >= 3 && activeWithMeeting.length / active.length >= 0.7) {
    const source = oldest(activeWithMeeting);
    candidates.push(asCandidate("CUSTOMER_FOLLOWUP_COVERED", "STRENGTH", "CUSTOMER", input.confidence, 20, {
      activeInquiryCount: active.length, inquiriesWithMeetingCount: activeWithMeeting.length,
    }, source ? { type: "INQUIRY", id: source.id, label: source.inquiry_no } : null, activeWithMeeting.length / active.length));
  }
  if (active.length >= 3 && activeWithMeeting.length / active.length <= 0.3) {
    const source = oldest(active.filter((row) => row.meeting_count === 0));
    candidates.push(asCandidate("CUSTOMER_FOLLOWUP_REVIEW", "CONTEXT", "CUSTOMER", input.confidence, 20, {
      activeInquiryCount: active.length, inquiriesWithMeetingCount: activeWithMeeting.length,
    }, source ? { type: "INQUIRY", id: source.id, label: source.inquiry_no } : null, (active.length - activeWithMeeting.length) / active.length));
  }
  if (eligible.length >= 3 && estimateCovered.length / eligible.length >= 0.8) {
    candidates.push(asCandidate("ESTIMATE_COVERAGE_STRONG", "STRENGTH", "COMMERCIAL", input.confidence, 30, {
      eligibleInquiryCount: eligible.length, estimateCoveredCount: estimateCovered.length,
    }, null, estimateCovered.length / eligible.length));
  }
  if (eligible.length >= 3 && estimateCovered.length / eligible.length < 0.5) {
    const source = oldest(eligible.filter((row) => row.estimate_id === null));
    candidates.push(asCandidate("ESTIMATE_COVERAGE_REVIEW", "ATTENTION", "COMMERCIAL", input.confidence, 30, {
      eligibleInquiryCount: eligible.length, estimateCoveredCount: estimateCovered.length,
    }, source ? { type: "INQUIRY", id: source.id, label: source.inquiry_no } : null, (eligible.length - estimateCovered.length) / eligible.length));
  }
  if (approved.length >= 2 && handovers.length === approved.length) {
    candidates.push(asCandidate("HANDOVER_COMPLETE", "STRENGTH", "HANDOVER", input.confidence, 10, {
      approvedCount: approved.length, handoverCount: handovers.length,
    }, null, 1));
  }
  if (handovers.length < approved.length) {
    const source = oldest(approved.filter((row) => row.project_id === null));
    candidates.push(asCandidate("HANDOVER_REVIEW", "ATTENTION", "HANDOVER", input.confidence, 10, {
      approvedCount: approved.length, handoverCount: handovers.length,
    }, source ? { type: "INQUIRY", id: source.id, label: source.inquiry_no } : null, (approved.length - handovers.length) / approved.length));
  }
  if (approved.length || cancelled.length) {
    candidates.push(asCandidate("FORECAST_CONTEXT", "CONTEXT", "FORECAST", input.confidence, 50, {
      approvedCount: approved.length, cancelledCount: cancelled.length,
    }, null, approved.length + cancelled.length));
  }
  return selectInsights(candidates);
}
