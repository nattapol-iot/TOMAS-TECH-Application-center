type Cell = string | number | null;

export type BomSheetHeader = { number: string; revision: number; projectNumber: string; projectName: string; estimateNumber: string; estimateRevision: number };
export type BomSheetLine = { module: string; sectionCode: string; itemCode: string | null; estimateItemCode: string | null; partNumber: string | null; description: string;
  brand: string | null; quantityRequired: number; unit: string; estimatedUnitCost: number; budget: number; requested: number; purchaseRequired: number };

export const BOM_SHEET_HEADERS = ["No.", "Item code", "Description", "Part No.", "Brand", "Module", "Section", "Qty required", "Unit", "Est. unit cost", "Budget", "Requested qty", "Still to buy"];

const thb = (value: number) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
/** What a line still to buy is worth at the estimate's cost. */
export const toBuyValue = (line: Pick<BomSheetLine, "purchaseRequired" | "estimatedUnitCost">) => Math.max(0, line.purchaseRequired) * line.estimatedUnitCost;

/**
 * A BOM as a sheet for exportXlsx: note rows, the header on the sixth row (where that writer styles a header), then the lines.
 * Quantities stay on their lines: the units differ (pcs, set, lot), so only THB is added up.
 */
export function bomSheetRows(bom: BomSheetHeader, lines: BomSheetLine[], exportedOn: string): Cell[][] {
  const open = lines.filter((line) => line.purchaseRequired > 0);
  return [
    [`BOM ${bom.number} R${bom.revision} · ${bom.projectNumber} ${bom.projectName}`],
    [`Estimate ${bom.estimateNumber} R${bom.estimateRevision} · exported ${exportedOn}`],
    [`Lines ${lines.length} · Budget THB ${thb(lines.reduce((sum, line) => sum + line.budget, 0))}`],
    [`Still to buy ${open.length} lines · THB ${thb(open.reduce((sum, line) => sum + toBuyValue(line), 0))}`],
    [],
    BOM_SHEET_HEADERS,
    ...lines.map((line, index) => [index + 1, line.itemCode || line.estimateItemCode || "", line.description, line.partNumber || "", line.brand || "", line.module, line.sectionCode,
      line.quantityRequired, line.unit, line.estimatedUnitCost, line.budget, line.requested, line.purchaseRequired]),
  ];
}
