import type { ErpCostCategory, ErpEstimateSourceType } from "./erp-estimate-workbook";

/** Minimal line shape shared by the ERP summary API and the workbook rows. */
export type ErpSuggestibleLine = {
  sourceType: ErpEstimateSourceType;
  internalCategory: string;
  description: string;
  brand?: string | null;
};

/** The ERP API supplies the labor department in brand, as in the existing workbook. */
export function automaticLaborCategory(line: ErpSuggestibleLine): ErpCostCategory | null {
  if (line.sourceType !== "ManhourLine") return null;
  const [costType, provider] = line.internalCategory.split("/").map(value => value.trim().toLowerCase());
  if (costType === "installation") return "Installation";
  if (costType !== "engineering" || provider !== "internal") return null;
  const department = line.brand?.trim().toLowerCase();
  return department === "software" ? "Software" : department === "electrical" || department === "mechanical" ? "Service" : null;
}
