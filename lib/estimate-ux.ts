export function estimateIssueTab(issue: { code: string; entityType: string }): "cost" | "manhour" | "other" | "validation" {
  if (issue.code === "engineering_manhour_required") return "manhour";
  if (issue.code === "empty_estimate") return "cost";
  if (issue.entityType === "ManhourLine" || issue.entityType === "ExpenseLine") return "manhour";
  if (issue.entityType === "OtherCostLine") return "other";
  if (issue.entityType === "CostItem") return "cost";
  return "validation";
}

export type EstimateNextActionKind = "resolve-blockers" | "address-revision" | "add-cost" | "add-effort" | "submit-review" | "approve" | "review-warnings" | "review-summary";

export function estimateNextAction(input: {
  criticalCount: number;
  warningCount: number;
  costItemCount: number;
  manhourLineCount: number;
  canEditCostItems: boolean;
  canEditManhour: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  /* A reviewer sending an estimate back is the most specific instruction the
     estimator can be given, and it lives in the workflow status rather than in
     any validation rule — which is why this function could not see it before. */
  status: string;
}): { kind: EstimateNextActionKind; tab: "summary" | "cost" | "manhour" | "validation" | "revision" | "review" } {
  if (input.criticalCount > 0) return { kind: "resolve-blockers", tab: "validation" };
  if (input.status === "Revision Required") return { kind: "address-revision", tab: "revision" };
  if (input.costItemCount === 0 && input.canEditCostItems) return { kind: "add-cost", tab: "cost" };
  if (input.manhourLineCount === 0 && input.canEditManhour) return { kind: "add-effort", tab: "manhour" };
  if (input.canApprove) return { kind: "approve", tab: "review" };
  if (input.canSubmit) return { kind: "submit-review", tab: "review" };
  if (input.warningCount > 0) return { kind: "review-warnings", tab: "validation" };
  return { kind: "review-summary", tab: "summary" };
}

export function estimateUxCopy(locale: string, th: string, en: string, ja: string): string {
  return locale.startsWith("th") ? th : locale.startsWith("ja") ? ja : en;
}

export function estimateBusinessDate(date = new Date(), timeZone = "Asia/Bangkok"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function estimateIssueMessage(issue: { code: string; message: string }, locale: string): string {
  const messages: Record<string, [string, string, string]> = {
    engineering_manhour_required: ["เพิ่มกิจกรรมวิศวกรรมอย่างน้อย 1 รายการ พร้อมจำนวนคนและวันทำงาน", "Add at least one engineering activity with staffing and work days.", "技術作業を1件以上追加し、人数と作業日数を入力してください。"],
    empty_estimate: ["เริ่มเพิ่มอุปกรณ์หรือค่าแรง เพื่อให้ประมาณการมีต้นทุน", "Start by adding equipment or effort to this estimate.", "機器または工数を追加してください。"],
    missing_unit_cost: ["ตรวจและใส่ราคาต่อหน่วยให้รายการนี้", "Check and enter the unit price for this item.", "この明細の単価を確認・入力してください。"],
    internal_rate_mismatch: ["ตรวจอัตราค่าแรงให้ตรงกับแผนก ระดับ และประเภทงาน หากไม่มีอัตราให้ผู้ดูแลตั้งค่าข้อมูลกลาง", "Match the rate to the department, level and work type. Ask an administrator to configure missing rates.", "部署・職位・作業種別の単価を確認してください。未設定の場合は管理者に設定を依頼してください。"],
    supplier_quote_required: ["เลือกผู้ขายและใส่เลขใบเสนอราคาสำหรับค่าแรงจ้างภายนอก", "Select a supplier and enter the quotation number for supplier effort.", "外注工数の仕入先と見積番号を入力してください。"],
  };
  const message = messages[issue.code];
  return message ? estimateUxCopy(locale, ...message) : issue.message;
}

/* Section permission for a library apply.

   Applying a module template or a labor package is a bulk line create, and the
   API authorises it exactly like a hand-typed line: the estimate owner, an
   engineering manager and an administrator may write any section, while an
   assigned engineer may write only the sections assigned to them and may only
   put a new line in their own name. The pickers add lines without an owner
   field, so the rule has to be read here rather than discovered as a 403 after
   the estimator has filled the form in. */

export type EstimateSectionCapabilities = {
  canEditAllSections: boolean;
  editableSections: readonly string[];
};

/** The owner a picker must send for a new estimate line, given who is looking at it. */
export function estimateApplyOwnerId(
  capabilities: EstimateSectionCapabilities,
  estimateOwnerId: number,
  currentUserId: number,
): number {
  return capabilities.canEditAllSections ? estimateOwnerId : currentUserId;
}

/** Sections in `sections` the current user is not allowed to write, in first-seen order. */
export function estimateForbiddenSections(
  capabilities: EstimateSectionCapabilities,
  sections: readonly string[],
): string[] {
  if (capabilities.canEditAllSections) return [];
  const seen = new Set<string>();
  return sections.filter((section) => {
    if (seen.has(section) || capabilities.editableSections.includes(section)) return false;
    seen.add(section);
    return true;
  });
}

/** Reasons a module template cannot be applied to the estimate in front of the user. */
export function moduleTemplateApplyBlocker(input: {
  status: string;
  lineSections: readonly string[];
  canEditCostItems: boolean;
  capabilities: EstimateSectionCapabilities;
}): string | null {
  if (!input.canEditCostItems) return "You cannot add cost lines to this estimate.";
  if (input.status === "Retired") return "This template has been retired.";
  if (input.status !== "Active") return "Only published templates can be applied. Ask the template maintainer to publish this draft.";
  if (!input.lineSections.length) return "This template has no lines to apply.";
  const forbidden = estimateForbiddenSections(input.capabilities, input.lineSections);
  if (forbidden.length) {
    return `This template writes to estimate section ${forbidden.join(", ")}, which is not assigned to you. Ask the estimate owner for the section, or pick a template in your own discipline.`;
  }
  return null;
}
