export type InquiryQueueScope = "mine" | "team";

export type InquiryNextAction =
  | "review_inputs"
  | "complete_costs"
  | "follow_supplier"
  | "submit_review"
  | "engineering_review"
  | "await_cost_approval"
  | "follow_sales"
  | "follow_customer"
  | "verify_order"
  | "verify_sales"
  | "project_created"
  | "handover_project"
  | "review_cancellation"
  | "restore_estimate"
  | "closed";

const TEAM_QUEUE_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Sales Manager"]);

/** Engineers land on owned work; coordinators and managers retain the team overview. */
export function defaultInquiryQueueScope(role: string): InquiryQueueScope {
  return TEAM_QUEUE_ROLES.has(role) ? "team" : role === "Engineer" ? "mine" : "team";
}

/** Give each list row one concrete next action without treating progress as workflow state. */
export function inquiryNextAction(status: string, hasEstimate: boolean, estimateStatus?: string | null, sales?: { stage?: string | null; proposalSentOn?: string | null; wonOn?: string | null; hasProject?: boolean }): InquiryNextAction {
  if (status !== "Cancelled" && estimateStatus === "Cancelled") return "review_cancellation";
  if (status !== "Cancelled" && estimateStatus === "Deleted") return "restore_estimate";
  if (status !== "Cancelled" && sales?.hasProject) return "project_created";
  if (status !== "Cancelled" && sales?.stage === "WON") {
    if (!["Approved", "Locked"].includes(estimateStatus ?? "")) return "await_cost_approval";
    return sales.wonOn ? "handover_project" : "verify_order";
  }
  switch (status) {
    case "Cancelled": return "closed";
    case "Approved":
      if (sales?.hasProject) return "project_created";
      if (sales?.stage === "LOST") return "review_cancellation";
      if (["PROPOSAL", "NEGOTIATION"].includes(sales?.stage ?? "")) return sales?.proposalSentOn ? "follow_customer" : "verify_sales";
      return "follow_sales";
    case "Engineering Review": return "engineering_review";
    case "Estimate Completed": return "submit_review";
    case "Waiting Supplier Price": return "follow_supplier";
    case "Estimating": return "complete_costs";
    default: return hasEstimate ? "complete_costs" : "review_inputs";
  }
}
