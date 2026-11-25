/*
 * Where a project document came from (task doc 5.5), read from what the handover and the plan export write in its remark:
 * the handover (backend-node/src/project-handover.ts) writes "Source: <type> <number>…" for each attachment it copies and
 * each snapshot it makes; the customer schedule export (PlanSheet.tsx) writes "Exported from the plan on <date>".
 */
/** The company's standard project folders; the API creates the same set for every project. */
export const PROJECT_DOCUMENT_FOLDERS = [
  ["00", "To do list"],
  ["01", "Concept Design and Proposal"],
  ["02", "Drawing"],
  ["03", "Estimate cost"],
  ["04", "Quote"],
  ["05", "PO"],
  ["06", "Specifications and Documentation"],
  ["07", "Development"],
  ["08", "Schedule"],
  ["09", "Installation"],
  ["10", "Report"],
  ["11", "Manual and Document"],
  ["12", "DATA & EXAMPLE"],
  ["13", "Pic and Video"],
  ["14", "Ref"],
] as const;

export type DocumentSource = "inquiry" | "siteVisit" | "estimate" | "plan" | "upload";
export const DOCUMENT_SOURCES: DocumentSource[] = ["inquiry", "siteVisit", "estimate", "plan", "upload"];

/** The handover's source types, as the tab groups them: the sales intake belongs to the inquiry, a supplier quote to the estimate. */
const HANDOVER_SOURCES: Record<string, DocumentSource> = {
  Inquiry: "inquiry",
  SalesIntake: "inquiry",
  SiteVisit: "siteVisit",
  SiteVisitReport: "siteVisit",
  Estimate: "estimate",
  SupplierQuotation: "estimate",
};

export function documentSource(document: { remark: string | null; documentType: string }): DocumentSource {
  const remark = document.remark ?? "";
  const handover = /^Source: ([A-Za-z]+)\b/.exec(remark)?.[1];
  if (handover && HANDOVER_SOURCES[handover]) return HANDOVER_SOURCES[handover];
  if (/^Exported from the plan on /.test(remark)) return "plan";
  return "upload";
}
