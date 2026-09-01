const AREA_CODES = ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"] as const;
const SALES_AREA_CODES = ["PIPELINE", "CUSTOMER", "FORECAST", "COMMERCIAL", "HANDOVER"] as const;

export type EvidenceAreaCode = typeof AREA_CODES[number] | typeof SALES_AREA_CODES[number];
export type EvidenceSourceType = "PROJECT" | "INQUIRY" | "TASK";

export type ProjectEvidenceRow = {
  id: number; project_no: string; name: string; status: string; role_on_project: string;
  start_date: Date | string; target_delivery: Date | string; actual_delivery: Date | string | null;
};

export type ScheduleEvidenceRow = {
  id: number; project_id: number; project_no: string; project_name: string; name: string; status: string;
  is_milestone: boolean; due_date: Date | string | null; actual_end: Date | string | null;
  percent_done: number; updated_at: Date | string;
};

export type ResourceEvidenceRow = {
  id: number; inquiry_id: number | null; project_id: number | null; source_no: string; source_name: string;
  title: string; is_issue: boolean; state: string; execution_status: string;
  due_date: Date | string | null; actual_end: Date | string | null; percent_done: number; updated_at: Date | string;
};

export type InquiryEvidenceRow = {
  id: number; inquiry_no: string; project_name: string; status: string; due_date: Date | string;
  meeting_count: number; updated_at: Date | string;
};

export type SalesInquiryEvidenceRow = {
  id: number;
  inquiry_no: string;
  project_name: string;
  status: string;
  inquiry_date: Date | string;
  due_date: Date | string;
  updated_at: Date | string;
  project_probability: number;
  customer_interest_grade: string;
  meeting_count: number;
  estimate_id: number | null;
  estimate_status: string | null;
  estimate_total: number | null;
  project_id: number | null;
};

type EvidenceSignal = {
  id: string;
  areaCode: EvidenceAreaCode;
  sourceType: EvidenceSourceType;
  sourceId: number;
  sourceLabel: string;
  title: string;
  detail: string;
  occurredAt: string | null;
  tone: "green" | "blue" | "violet" | "amber" | "slate";
};

const dateOnly = (value: Date | string | null): string | null => {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const roundOne = (value: number) => Math.round(value * 10) / 10;
const plural = (count: number, singular: string, pluralValue = `${singular}s`) => `${count} ${count === 1 ? singular : pluralValue}`;

export function buildPerformanceEvidence(input: {
  employeeId: number;
  employeeName: string;
  cycleId: number;
  cycleCode: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  projects: ProjectEvidenceRow[];
  scheduleTasks: ScheduleEvidenceRow[];
  resourceTasks: ResourceEvidenceRow[];
  inquiries: InquiryEvidenceRow[];
  today?: Date | string;
}) {
  const periodStart = dateOnly(input.periodStart)!;
  const periodEnd = dateOnly(input.periodEnd)!;
  const today = dateOnly(input.today ?? new Date())!;
  const asOf = today < periodStart ? periodStart : today > periodEnd ? periodEnd : today;
  const allTasks = [
    ...input.scheduleTasks.map((task) => ({
      kind: "schedule" as const, id: task.id, sourceId: task.project_id, sourceType: "PROJECT" as const,
      sourceLabel: task.project_no, sourceName: task.project_name, title: task.name,
      completed: task.status === "Done" || task.actual_end !== null, due: dateOnly(task.due_date),
      actualEnd: dateOnly(task.actual_end), updatedAt: dateOnly(task.updated_at), percentDone: Number(task.percent_done),
      issue: false, milestone: Boolean(task.is_milestone), state: task.status,
    })),
    ...input.resourceTasks.map((task) => ({
      kind: "resource" as const, id: task.id, sourceId: Number(task.project_id ?? task.inquiry_id),
      sourceType: (task.project_id ? "PROJECT" : "INQUIRY") as "PROJECT" | "INQUIRY",
      sourceLabel: task.source_no, sourceName: task.source_name, title: task.title,
      completed: task.state === "Closed" || task.execution_status === "Done" || task.actual_end !== null,
      due: dateOnly(task.due_date), actualEnd: dateOnly(task.actual_end), updatedAt: dateOnly(task.updated_at),
      percentDone: Number(task.percent_done), issue: Boolean(task.is_issue), milestone: false, state: task.state,
    })),
  ];
  const dueTasks = allTasks.filter((task) => task.due && (task.due <= asOf || task.completed));
  const completedDueTasks = dueTasks.filter((task) => task.completed);
  const onTimeTasks = completedDueTasks.filter((task) => task.actualEnd && task.due && task.actualEnd <= task.due);
  const overdueTasks = dueTasks.filter((task) => !task.completed && task.due! < asOf);
  const completedTasks = allTasks.filter((task) => task.completed);
  const issueTasks = allTasks.filter((task) => task.issue);
  const closedIssues = issueTasks.filter((task) => task.completed);

  const completionRate = dueTasks.length ? completedDueTasks.length / dueTasks.length : null;
  const onTimeRate = completedDueTasks.filter((task) => task.due && task.actualEnd).length
    ? onTimeTasks.length / completedDueTasks.filter((task) => task.due && task.actualEnd).length
    : null;
  const deliverySuggestion = dueTasks.length >= 3 && completionRate !== null && onTimeRate !== null
    ? roundOne(clamp(1 + 4 * (completionRate * 0.55 + onTimeRate * 0.45), 1, 5))
    : null;
  const qualitySuggestion = issueTasks.length >= 2
    ? roundOne(clamp(1 + 4 * (closedIssues.length / issueTasks.length), 1, 5))
    : null;

  const signals: EvidenceSignal[] = [];
  if (dueTasks.length) {
    signals.push({
      id: "delivery-task-summary", areaCode: "DELIVERY", sourceType: "TASK", sourceId: 0, sourceLabel: "Assigned work",
      title: `${completedDueTasks.length} of ${dueTasks.length} due tasks completed`,
      detail: `${onTimeTasks.length} completed on time · ${overdueTasks.length} overdue as of ${asOf}`,
      occurredAt: asOf, tone: overdueTasks.length ? "amber" : "green",
    });
  }
  overdueTasks.slice(0, 2).forEach((task) => signals.push({
    id: `overdue-${task.kind}-${task.id}`, areaCode: "DELIVERY", sourceType: task.sourceType, sourceId: task.sourceId,
    sourceLabel: task.sourceLabel, title: task.title, detail: `Overdue since ${task.due} · ${task.sourceName}`,
    occurredAt: task.due, tone: "amber",
  }));
  input.projects.filter((project) => project.actual_delivery).slice(0, 2).forEach((project) => {
    const actual = dateOnly(project.actual_delivery)!;
    const target = dateOnly(project.target_delivery)!;
    signals.push({
      id: `delivery-project-${project.id}`, areaCode: "DELIVERY", sourceType: "PROJECT", sourceId: project.id,
      sourceLabel: project.project_no, title: project.name,
      detail: actual <= target ? `Delivered on or before ${target}` : `Delivered ${actual}; target was ${target}`,
      occurredAt: actual, tone: actual <= target ? "green" : "amber",
    });
  });
  if (issueTasks.length) {
    const issue = issueTasks[0]!;
    signals.push({
      id: "quality-issue-summary", areaCode: "QUALITY", sourceType: issue.sourceType, sourceId: issue.sourceId,
      sourceLabel: issue.sourceLabel, title: `${closedIssues.length} of ${issueTasks.length} customer issues closed`,
      detail: `${issueTasks.length - closedIssues.length} remain open in the selected cycle`, occurredAt: asOf,
      tone: closedIssues.length === issueTasks.length ? "green" : "amber",
    });
  }
  completedTasks.filter((task) => !task.issue).sort((left, right) => (right.actualEnd ?? right.updatedAt)!.localeCompare((left.actualEnd ?? left.updatedAt)!)).slice(0, 3)
    .forEach((task) => signals.push({
      id: `technical-${task.kind}-${task.id}`, areaCode: "TECHNICAL", sourceType: task.sourceType, sourceId: task.sourceId,
      sourceLabel: task.sourceLabel, title: task.title,
      detail: `Completed · ${task.sourceName}${task.milestone ? " · milestone" : ""}`,
      occurredAt: task.actualEnd ?? task.updatedAt, tone: "violet",
    }));
  input.projects.slice(0, 3).forEach((project) => signals.push({
    id: `teamwork-project-${project.id}`, areaCode: "TEAMWORK", sourceType: "PROJECT", sourceId: project.id,
    sourceLabel: project.project_no, title: project.name,
    detail: `${project.role_on_project} · ${project.status}`, occurredAt: dateOnly(project.actual_delivery ?? project.target_delivery), tone: "blue",
  }));
  input.inquiries.slice(0, 3).forEach((inquiry) => signals.push({
    id: `teamwork-inquiry-${inquiry.id}`, areaCode: "TEAMWORK", sourceType: "INQUIRY", sourceId: inquiry.id,
    sourceLabel: inquiry.inquiry_no, title: inquiry.project_name,
    detail: `${inquiry.status} · ${plural(Number(inquiry.meeting_count), "meeting")} owned or recorded`,
    occurredAt: dateOnly(inquiry.updated_at), tone: "blue",
  }));

  const evidenceText: Record<typeof AREA_CODES[number], string> = {
    DELIVERY: dueTasks.length
      ? `${completedDueTasks.length}/${dueTasks.length} due assigned tasks completed; ${onTimeTasks.length} on time; ${overdueTasks.length} overdue as of ${asOf}.`
      : `No due assigned tasks were found for ${input.cycleCode}; manager context is required.`,
    QUALITY: issueTasks.length
      ? `${closedIssues.length}/${issueTasks.length} assigned customer-issue tasks closed during the cycle.`
      : `No assigned customer-issue tasks were found; quality should be assessed from review and rework evidence.`,
    TECHNICAL: completedTasks.length
      ? `${completedTasks.length} assigned tasks completed across ${input.projects.length} projects and ${input.inquiries.length} inquiries.`
      : `No completed assigned tasks were found in the selected cycle.`,
    TEAMWORK: `${plural(input.projects.length, "project")} and ${plural(input.inquiries.length, "inquiry", "inquiries")} with recorded ownership or participation.`,
  };

  const measurableCount = allTasks.length + input.projects.length + input.inquiries.length;
  const sourceCoverage = [input.projects.length > 0, input.inquiries.length > 0, allTasks.length > 0].filter(Boolean).length;
  const confidence = measurableCount >= 8 && sourceCoverage >= 2 ? "HIGH" : measurableCount >= 3 ? "MEDIUM" : "LOW";

  return {
    frameworkCode: "ENGINEERING" as const,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    cycleId: input.cycleId,
    cycleCode: input.cycleCode,
    periodStart,
    periodEnd,
    asOf,
    confidence,
    methodology: "Suggestions use assigned work due within the cycle. They are decision support only; managers confirm impact, complexity and context.",
    sources: [
      { key: "PROJECT", label: "Projects", count: input.projects.length, connected: true },
      { key: "INQUIRY", label: "Inquiries", count: input.inquiries.length, connected: true },
      { key: "TASK", label: "Assigned tasks", count: allTasks.length, connected: true },
    ],
    metrics: {
      projectCount: input.projects.length, inquiryCount: input.inquiries.length,
      assignedTaskCount: allTasks.length, completedTaskCount: completedTasks.length,
      dueTaskCount: dueTasks.length, onTimeTaskCount: onTimeTasks.length, overdueTaskCount: overdueTasks.length,
      issueTaskCount: issueTasks.length, closedIssueCount: closedIssues.length,
    },
    areas: AREA_CODES.map((areaCode) => ({
      areaCode,
      suggestedScore: areaCode === "DELIVERY" ? deliverySuggestion : areaCode === "QUALITY" ? qualitySuggestion : null,
      evidenceText: evidenceText[areaCode],
      signals: signals.filter((signal) => signal.areaCode === areaCode).slice(0, 5),
    })),
  };
}

export function buildSalesPerformanceEvidence(input: {
  employeeId: number;
  employeeName: string;
  cycleId: number;
  cycleCode: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  inquiries: SalesInquiryEvidenceRow[];
  today?: Date | string;
}) {
  const periodStart = dateOnly(input.periodStart)!;
  const periodEnd = dateOnly(input.periodEnd)!;
  const today = dateOnly(input.today ?? new Date())!;
  const asOf = today < periodStart ? periodStart : today > periodEnd ? periodEnd : today;
  const inquiries = input.inquiries.map((item) => ({
    ...item,
    meeting_count: Number(item.meeting_count),
    project_probability: Number(item.project_probability),
    estimate_total: item.estimate_total === null ? null : Number(item.estimate_total),
    inquiryDate: dateOnly(item.inquiry_date)!,
    dueDate: dateOnly(item.due_date)!,
    updatedAt: dateOnly(item.updated_at)!,
  }));
  const closed = inquiries.filter((item) => item.status === "Approved" || item.status === "Cancelled");
  const approved = inquiries.filter((item) => item.status === "Approved" || item.project_id !== null);
  const cancelled = inquiries.filter((item) => item.status === "Cancelled");
  const active = inquiries.filter((item) => !["Approved", "Cancelled"].includes(item.status));
  const estimates = inquiries.filter((item) => item.estimate_id !== null);
  const approvedEstimates = estimates.filter((item) => ["Approved", "Locked"].includes(item.estimate_status ?? ""));
  const handovers = approved.filter((item) => item.project_id !== null);
  const meetingCount = inquiries.reduce((sum, item) => sum + item.meeting_count, 0);
  const totalEstimateValue = estimates.reduce((sum, item) => sum + (item.estimate_total ?? 0), 0);
  const approvedEstimateValue = approvedEstimates.reduce((sum, item) => sum + (item.estimate_total ?? 0), 0);
  const weightedPipelineValue = active.reduce((sum, item) => sum + (item.estimate_total ?? 0) * item.project_probability / 100, 0);
  // Current probabilities can be edited after an outcome. Without a dated pre-outcome
  // snapshot they cannot support an honest numeric forecast-accuracy rating.
  const forecastSuggestion: number | null = null;
  const handoverSuggestion = approved.length >= 2 ? roundOne(clamp(1 + 4 * handovers.length / approved.length, 1, 5)) : null;
  const money = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

  const signals: EvidenceSignal[] = [];
  active.sort((left, right) => right.project_probability - left.project_probability).slice(0, 4).forEach((item) => signals.push({
    id: `sales-pipeline-${item.id}`, areaCode: "PIPELINE", sourceType: "INQUIRY", sourceId: item.id,
    sourceLabel: item.inquiry_no, title: item.project_name,
    detail: `${item.status} · ${item.project_probability}% probability · grade ${item.customer_interest_grade}`,
    occurredAt: item.updatedAt, tone: item.project_probability >= 60 ? "green" : item.project_probability >= 30 ? "blue" : "slate",
  }));
  inquiries.filter((item) => item.meeting_count > 0).sort((left, right) => right.meeting_count - left.meeting_count).slice(0, 4).forEach((item) => signals.push({
    id: `sales-customer-${item.id}`, areaCode: "CUSTOMER", sourceType: "INQUIRY", sourceId: item.id,
    sourceLabel: item.inquiry_no, title: item.project_name,
    detail: `${plural(item.meeting_count, "customer meeting")} owned or recorded`, occurredAt: item.updatedAt, tone: "blue",
  }));
  if (closed.length) signals.push({
    id: "sales-forecast-summary", areaCode: "FORECAST", sourceType: "INQUIRY", sourceId: 0,
    sourceLabel: "Closed opportunities", title: `${approved.length} approved · ${cancelled.length} cancelled`,
    detail: "No dated pre-outcome probability snapshot is available; manager judgement is required",
    occurredAt: asOf, tone: "amber",
  });
  approvedEstimates.sort((left, right) => (right.estimate_total ?? 0) - (left.estimate_total ?? 0)).slice(0, 4).forEach((item) => signals.push({
    id: `sales-commercial-${item.id}`, areaCode: "COMMERCIAL", sourceType: "INQUIRY", sourceId: item.id,
    sourceLabel: item.inquiry_no, title: item.project_name,
    detail: `Approved estimate · THB ${money(item.estimate_total ?? 0)}`, occurredAt: item.updatedAt, tone: "green",
  }));
  handovers.slice(0, 4).forEach((item) => signals.push({
    id: `sales-handover-${item.id}`, areaCode: "HANDOVER", sourceType: "PROJECT", sourceId: item.project_id!,
    sourceLabel: item.inquiry_no, title: item.project_name,
    detail: "Approved opportunity transferred to an active Project record", occurredAt: item.updatedAt, tone: "violet",
  }));

  const evidenceText: Record<typeof SALES_AREA_CODES[number], string> = {
    PIPELINE: `${active.length} active opportunities; ${approved.length} approved; weighted recorded pipeline THB ${money(weightedPipelineValue)}.`,
    CUSTOMER: `${meetingCount} customer meetings owned or recorded across ${inquiries.filter((item) => item.meeting_count > 0).length} inquiries.`,
    FORECAST: `${closed.length} closed opportunities. Current probabilities are not historical forecasts; no numeric probability calibration accuracy is assigned without dated pre-outcome snapshots.`,
    COMMERCIAL: `${approvedEstimates.length}/${estimates.length} recorded estimates approved or locked; THB ${money(approvedEstimateValue)} approved of THB ${money(totalEstimateValue)} recorded.`,
    HANDOVER: `${handovers.length}/${approved.length} approved opportunities linked to Project records.`,
  };
  const measurableCount = inquiries.length + meetingCount + estimates.length + handovers.length;
  const coverage = [inquiries.length > 0, meetingCount > 0, estimates.length > 0, handovers.length > 0].filter(Boolean).length;
  const confidence = measurableCount >= 8 && coverage >= 2 ? "HIGH" : measurableCount >= 3 ? "MEDIUM" : "LOW";

  return {
    frameworkCode: "SALES" as const,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    cycleId: input.cycleId,
    cycleCode: input.cycleCode,
    periodStart,
    periodEnd,
    asOf,
    confidence,
    methodology: "Sales signals use owned inquiries, recorded customer meetings, estimate outcomes and Project handovers in the cycle. These are current records selected by cycle dates, not historical snapshots. Estimate values are recorded costs, not booked sales or margin. They are decision support only; managers confirm targets, margin, complexity and customer context.",
    sources: [
      { key: "INQUIRY", label: "Owned inquiries", count: inquiries.length, connected: true },
      { key: "MEETING", label: "Customer meetings", count: meetingCount, connected: true },
      { key: "ESTIMATE", label: "Approved estimates", count: approvedEstimates.length, connected: true },
      { key: "PROJECT", label: "Project handovers", count: handovers.length, connected: true },
    ],
    metrics: {
      projectCount: handovers.length,
      inquiryCount: inquiries.length,
      assignedTaskCount: 0,
      completedTaskCount: 0,
      dueTaskCount: closed.length,
      onTimeTaskCount: approved.length,
      overdueTaskCount: 0,
      issueTaskCount: 0,
      closedIssueCount: 0,
      meetingCount,
      estimateCount: estimates.length,
      approvedEstimateCount: approvedEstimates.length,
      handoverCount: handovers.length,
    },
    areas: SALES_AREA_CODES.map((areaCode) => ({
      areaCode,
      suggestedScore: areaCode === "FORECAST" ? forecastSuggestion : areaCode === "HANDOVER" ? handoverSuggestion : null,
      evidenceText: evidenceText[areaCode],
      signals: signals.filter((signal) => String(signal.areaCode) === areaCode).slice(0, 5),
    })),
  };
}
