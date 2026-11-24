/*
 * Where a project document came from (task doc 5.5), read from what the handover and the plan export write in its remark:
 * the handover (backend-node/src/project-handover.ts) writes "Source: <type> <number>…" for each attachment it copies and
 * each snapshot it makes; the customer schedule export (PlanSheet.tsx) writes "Exported from the plan on <date>".
 */
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
