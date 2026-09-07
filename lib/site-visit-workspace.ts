import type { SiteVisitDetail } from "../app/system/api-client";

export function canRecordSurvey(visit: Pick<SiteVisitDetail, "canExecute" | "status">) {
  return visit.canExecute && ["Confirmed", "In Progress", "Report Pending"].includes(visit.status);
}

export function surveyAnswerComplete(answer: { value: string; numeric: string; na: boolean } | undefined) {
  return Boolean(answer && (answer.na || answer.value.trim() || (answer.numeric.trim() !== "" && Number.isFinite(Number(answer.numeric)))));
}

export function reportEvidence(visit: Pick<SiteVisitDetail, "findings" | "checklist" | "executionNote">) {
  const findings = visit.findings.map((item) => [item.title, item.detail].filter(Boolean).join(": ")).join("\n");
  const measurements = [
    ...visit.findings.filter((item) => item.measurementValue != null).map((item) => `${item.title}: ${item.measurementValue} ${item.measurementUnit ?? ""}`.trim()),
    ...visit.checklist.filter((item) => !item.isNotApplicable && item.numericValue != null).map((item) => `${item.prompt}: ${item.numericValue} ${item.unit || item.itemUnit || ""}`.trim()),
  ].join("\n");
  return { findingsSummary: findings, measurementSummary: measurements, visitSummary: visit.executionNote ?? "" };
}

/** Fill only empty draft fields; an engineer's written conclusion is never replaced. */
export function fillReportEvidence(draft: Record<string, string>, evidence: Record<string, string>) {
  const result = { ...draft };
  for (const [key, value] of Object.entries(evidence)) if (!result[key]?.trim() && value.trim()) result[key] = value;
  return result;
}
