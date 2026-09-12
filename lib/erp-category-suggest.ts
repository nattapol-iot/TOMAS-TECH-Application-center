import type { ErpCostCategory, ErpEstimateSourceType } from "./erp-estimate-workbook";

/** Minimal line shape shared by the ERP summary API and the workbook rows. */
export type ErpSuggestibleLine = {
  sourceType: ErpEstimateSourceType;
  internalCategory: string;
  description: string;
};

/** Internal cost module code (first two characters of `internalCategory` on CostItem lines) → ERP category. */
const COST_ITEM_CODE_MAP: Record<string, ErpCostCategory> = {
  "01": "Hardware",
  "02": "Software",
  "03": "Hardware",
  "04": "Hardware",
  "05": "Hardware",
  "06": "Service",
  "07": "Service",
  "08": "Installation",
  "09": "Installation",
};

/** Explicit description keywords win over the structural rule because they name the ERP category directly. */
const DESCRIPTION_RULES: Array<{ pattern: RegExp; category: ErpCostCategory }> = [
  { pattern: /licen[cs]e|subscription|ไลเซนส์|ลิขสิทธิ์/i, category: "License" },
  { pattern: /training|อบรม|ฝึกสอน/i, category: "Training" },
  { pattern: /maintenance|warranty|preventive|\bMA\b|บำรุงรักษา|ซ่อมบำรุง/i, category: "Maintenance" },
];

/**
 * Suggest an ERP category from the line's internal category and description.
 * Returns null when the line needs a human decision (OtherCostLine, Contingency, unknown module).
 */
export function suggestErpCategory(line: ErpSuggestibleLine): ErpCostCategory | null {
  if (line.sourceType === "OtherCostLine" || line.sourceType === "Contingency") return null;
  const description = line.description ?? "";
  for (const rule of DESCRIPTION_RULES) if (rule.pattern.test(description)) return rule.category;
  const internal = (line.internalCategory ?? "").trim();
  if (line.sourceType === "CostItem") return COST_ITEM_CODE_MAP[internal.slice(0, 2)] ?? null;
  if (line.sourceType === "ManhourLine" || line.sourceType === "ExpenseLine") {
    if (/\bInstallation\b/i.test(internal)) return "Installation";
    if (/\bEngineering\b/i.test(internal)) return "Service";
  }
  return null;
}

