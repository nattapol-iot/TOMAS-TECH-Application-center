// Pure data/types shared by the Reports UI (ReportScreens.tsx) and the
// PPTX exporter (report-pptx.ts). No React/CSS imports here so this file
// can be used by non-UI code (and tested outside a browser/bundler).

export const REPORT_TYPES = ["INSTALLATION", "UAT", "SERVICE", "INSPECTION", "POC"] as const;
export type ReportType = typeof REPORT_TYPES[number];
export const REPORT_STATUSES = ["DRAFT", "SUBMITTED", "REVIEWED", "APPROVED", "AWAITING_CUSTOMER", "COMPLETED", "CHANGES_REQUESTED", "VOID"] as const;
export const labels: Record<string, string> = { INSTALLATION: "Installation", UAT: "UAT", SERVICE: "Service", INSPECTION: "Inspection", POC: "POC", DRAFT: "Draft", SUBMITTED: "Team review", REVIEWED: "Awaiting approval", APPROVED: "Approved", AWAITING_CUSTOMER: "Customer signature", COMPLETED: "Complete", CHANGES_REQUESTED: "Changes requested", VOID: "Void" };

export type ReportBody = Record<string, unknown>;
export type InputField = { key: string; label: string; type?: "date" | "datetime-local" | "number" | "url" | "email" | "tel"; options?: string[] };
export type Section = { key: string; label: string; fields: InputField[]; repeat?: boolean };
const field = (key: string, label: string, type?: InputField["type"]): InputField => ({ key, label, ...(type ? { type } : {}) });
const resultField: InputField = { key: "result", label: "Result", options: ["PASS", "FAIL", "PARTIAL"] };
const hardware: Section = { key: "hardware", label: "Hardware", repeat: true, fields: [field("item", "Item"), field("model", "Model"), field("serial", "Serial number"), field("quantity", "Quantity", "number"), field("action", "Action"), field("status", "Status")] };
const software: Section = { key: "software", label: "Software", repeat: true, fields: [field("module", "Module"), field("versionBefore", "Version before"), field("versionAfter", "Version after"), field("configurationLicense", "Configuration / license"), field("action", "Action"), field("status", "Status")] };
const commonSections: Section[] = [
  { key: "context", label: "Site & work details", fields: [field("site", "Site / location"), field("requestedBy", "Requested by"), field("contact", "Customer contact"), field("contactPhone", "Contact phone", "tel"), field("contactEmail", "Contact email", "email"), field("team", "Team on site"), field("start", "Start date & time", "datetime-local"), field("end", "End date & time", "datetime-local"), field("environment", "Environment"), field("mode", "Operating mode")] },
  { key: "overview", label: "Objective & summary", fields: [field("objective", "Objective"), field("summary", "Summary")] },
];
const finalSections: Section[] = [
  { key: "evidence", label: "Evidence references", repeat: true, fields: [field("topic", "Report topic"), field("description", "What is shown"), field("purpose", "Evidence purpose"), field("reference", "File / document reference"), field("url", "Evidence URL", "url")] },
  { key: "issues", label: "Issues & pending actions / Punchlist", repeat: true, fields: [field("issue", "Issue / pending action"), field("owner", "Owner"), field("dueDate", "Due date", "date"), field("status", "Status")] },
  { key: "deliverables", label: "Deliverables", repeat: true, fields: [field("item", "Deliverable"), field("reference", "Reference / version"), field("status", "Delivery status")] },
  { key: "closing", label: "Remarks", fields: [field("remarks", "Remarks / follow-up notes")] },
];
export function reportSections(type: string): Section[] {
  const specific: Record<string, Section[]> = {
    SERVICE: [hardware, software, { key: "service", label: "Service diagnosis & resolution", fields: [field("symptom", "Symptom"), field("impact", "Impact"), field("rootCause", "Root cause"), field("action", "Corrective action"), field("downtime", "Downtime"), field("backup", "Backup"), field("rollback", "Rollback plan / result"), field("verification", "Verification"), field("testResult", "Test result"), field("customerAcceptance", "Customer acceptance"), field("followUp", "Follow-up")] }],
    INSTALLATION: [hardware, software, { key: "commissioning", label: "Commissioning", repeat: true, fields: [field("checkpoint", "Check / activity"), field("expected", "Expected"), field("observed", "Observed"), resultField, field("remarks", "Remarks")] }],
    UAT: [{ key: "scenarios", label: "UAT scenarios & test steps", repeat: true, fields: [field("scenario", "Scenario (repeat for each step)"), field("step", "Step"), field("input", "Input"), field("expected", "Expected result"), field("actual", "Actual result"), resultField, field("remark", "Remark"), field("evidence", "Evidence reference")] }, { key: "uatSummary", label: "UAT summary & acceptance", fields: [field("testFrom", "Test from", "date"), field("testTo", "Test to", "date"), { ...resultField, key: "overallResult", label: "Overall result" }, field("issueCount", "Issue count", "number"), field("correctiveCount", "Corrective action count", "number"), field("followUpOwner", "Follow-up owner"), field("acceptance", "Acceptance"), field("revisionEvidence", "Revision evidence")] }],
    INSPECTION: [
      { key: "assets", label: "Assets / units under inspection", repeat: true, fields: [field("name", "Asset / unit name"), field("assetType", "Asset type"), field("location", "Location"), field("identifier", "Identifier (panel / serial / hostname)")] },
      { key: "measurements", label: "Measurements", repeat: true, fields: [field("asset", "Asset / unit"), field("parameter", "Parameter"), field("unit", "Unit of measure"), field("specValue", "Spec value"), field("actualValue", "Actual value"), resultField, field("remarks", "Remarks")] },
      { key: "checkpoints", label: "Inspection checkpoints", repeat: true, fields: [field("checkpoint", "Checkpoint"), field("expected", "Expected"), field("observed", "Observed"), field("unit", "Unit"), field("category", "Category"), resultField, field("corrective", "Corrective action")] },
    ],
    POC: [{ key: "trials", label: "POC hypotheses & trials", repeat: true, fields: [field("hypothesis", "Hypothesis"), field("successCriteria", "Success criteria"), field("baseline", "Baseline"), field("trial", "Trial / method"), field("result", "Result"), field("limitations", "Limitations")] }],
  };
  const punchlist: Section = { key: "punchlist", label: "UAT punchlist", repeat: true, fields: [field("scenario", "Scenario"), field("step", "Step"), field("issue", "Issue"), field("owner", "Owner"), field("updatedDate", "Updated date", "date"), field("status", "Status"), field("dueDate", "Due date", "date"), field("correctiveResult", "Corrective result"), { ...resultField, key: "resultStatus", label: "Result status" }] };
  const topicOptions:Record<string,string[]>={
    SERVICE:["Work details","Scope & objective","Hardware","Software","Problem & resolution","Verification & handover","Pending actions","Deliverables"],
    UAT:["Work details","Scope & objective","UAT summary","UAT test scenarios","UAT punchlist","Deliverables"],
    INSTALLATION:["Work details","Scope & objective","Hardware","Software","Commissioning","Pending actions","Deliverables"],
    INSPECTION:["Work details","Scope & objective","Assets","Measurements","Inspection checkpoints","Pending actions","Deliverables"],
    POC:["Work details","Scope & objective","POC trials","Pending actions","Deliverables"],
  };
  return [...commonSections, ...(specific[type] ?? []), ...finalSections.map(section => type === "UAT" && section.key === "issues" ? punchlist : section.key === "evidence" ? {...section,fields:section.fields.map(definition=>definition.key==="topic"?{...definition,options:topicOptions[type]??topicOptions.SERVICE}:definition)} : section)];
}

export type Signer = { id: number; name: string };
export type ReportRecord = {
  id: number; number: string; reportType: ReportType; sourceKind: "INQUIRY" | "PROJECT"; sourceId: number;
  sourceReference: string; sourceTitle: string; customer: string; endUserName?: string | null; revision: number; currentRevision: number;
  title: string; reportDate: string; locale: string; body: ReportBody; status: string; rowVersion: string;
  preparedById: number; reviewerId: number | null; approverId: number; decisionNote: string;
  preparedBy: Signer | null; reviewer: Signer | null; approver: Signer | null; customerLink: { expiresAt: string } | null;
  template?: { id: number; name: string; version: number } | null;
  updatedAt: string; allowedActions?: string[]; snapshotSha256: string | null;
  signatures: { stage: string; actorId: number; actorName: string; occurredAt: string }[];
  customerAcknowledgment: { name: string; title: string; company: string; date: string; mode: string; occurredAt: string; signatureDataUrl?: string | null } | null;
  revisions: { revision: number; status: string; title: string; createdAt: string }[];
};
