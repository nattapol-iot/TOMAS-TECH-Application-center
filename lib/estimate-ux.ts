export function estimateIssueTab(issue: { code: string; entityType: string }): "cost" | "manhour" | "other" | "validation" {
  if (issue.code === "engineering_manhour_required") return "manhour";
  if (issue.code === "empty_estimate") return "cost";
  if (issue.entityType === "ManhourLine" || issue.entityType === "ExpenseLine") return "manhour";
  if (issue.entityType === "OtherCostLine") return "other";
  if (issue.entityType === "CostItem") return "cost";
  return "validation";
}

export type EstimateNextActionKind = "resolve-blockers" | "add-cost" | "add-effort" | "submit-review" | "approve" | "review-warnings" | "review-summary";

export function estimateNextAction(input: {
  criticalCount: number;
  warningCount: number;
  costItemCount: number;
  manhourLineCount: number;
  canEditCostItems: boolean;
  canEditManhour: boolean;
  canSubmit: boolean;
  canApprove: boolean;
}): { kind: EstimateNextActionKind; tab: "summary" | "cost" | "manhour" | "validation" | "review" } {
  if (input.criticalCount > 0) return { kind: "resolve-blockers", tab: "validation" };
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
