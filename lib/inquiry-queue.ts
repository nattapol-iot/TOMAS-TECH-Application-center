export type InquiryQueueScope = "mine" | "team";

export type InquiryNextAction =
  | "review_inputs"
  | "complete_costs"
  | "follow_supplier"
  | "submit_review"
  | "engineering_review"
  | "handover_project"
  | "closed";

const TEAM_QUEUE_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Sales Manager"]);

/** Engineers land on owned work; coordinators and managers retain the team overview. */
export function defaultInquiryQueueScope(role: string): InquiryQueueScope {
  return TEAM_QUEUE_ROLES.has(role) ? "team" : role === "Engineer" ? "mine" : "team";
}

/** Give each list row one concrete next action without treating progress as workflow state. */
export function inquiryNextAction(status: string, hasEstimate: boolean): InquiryNextAction {
  switch (status) {
    case "Cancelled": return "closed";
    case "Approved": return "handover_project";
    case "Engineering Review": return "engineering_review";
    case "Estimate Completed": return "submit_review";
    case "Waiting Supplier Price": return "follow_supplier";
    case "Estimating": return "complete_costs";
    default: return hasEstimate ? "complete_costs" : "review_inputs";
  }
}
