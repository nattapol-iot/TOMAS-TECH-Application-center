/* Pure helpers behind the type-ahead on the cost item form. The API returns one
   row per distinct part; these decide how a pick lands on the form and how the
   supplier list is filtered while typing. No React, no fetch — tested in node. */

export const COST_ITEM_LOOKUP_MIN_CHARS = 2;

export type CostItemLookupSourceKind = "Estimate" | "Historical Purchase" | "Supplier Quotation" | "Web Reference";

/* What a pick records as the origin of the number. An estimate line is a Price
   Library reference and an imported PO line a Purchase Price, as before; a
   quotation line keeps its own provenance so a price read off a web page is never
   written down as one the supplier quoted. */
const PRICE_SOURCE_OF: Record<CostItemLookupSourceKind, string> = {
  "Estimate": "Price Library",
  "Historical Purchase": "Purchase Price",
  "Supplier Quotation": "Supplier Quotation",
  "Web Reference": "Web Reference",
};

export type CostItemLookupRecordLike = {
  sourceKind: CostItemLookupSourceKind;
  sourceNumber: string;
  projectName: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string | null;
  supplierId: number | null;
  unit: string;
  unitCost: number;
  priceDate: string | null;
};

export type CostItemLookupPatch = {
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string;
  supplierId?: number;
  unit: string;
  unitCost: number;
  priceSource: string;
  referenceNumber: string;
  referenceProject: string;
  priceDate?: string;
};

export type LookupSupplierLike = { id: number; code: string; name: string };

/** Whether the typed text is long enough to ask the server. */
export const lookupQueryReady = (text: string): boolean => text.trim().length >= COST_ITEM_LOOKUP_MIN_CHARS;

/* Mirrors the Price Library picker: the pick fills the whole line and records where
   the number came from. The supplier is only carried when it is still active in the
   bootstrap list, otherwise the form would submit an id the API rejects. */
export function costItemPatchFromLookup(record: CostItemLookupRecordLike, activeSuppliers: ReadonlyArray<{ id: number }>): CostItemLookupPatch {
  const supplierId = record.supplierId !== null && activeSuppliers.some((supplier) => supplier.id === record.supplierId) ? record.supplierId : undefined;
  return {
    itemCode: record.itemCode,
    description: record.description,
    brand: record.brand ?? "",
    model: record.model ?? "",
    specification: record.specification ?? "",
    supplierId,
    unit: record.unit,
    unitCost: record.unitCost,
    priceSource: PRICE_SOURCE_OF[record.sourceKind] ?? "Price Library",
    referenceNumber: record.sourceNumber,
    referenceProject: record.projectName,
    ...(record.priceDate ? { priceDate: record.priceDate.slice(0, 10) } : {}),
  };
}

const fold = (value: string) => value.trim().toLocaleLowerCase();

/** Suppliers whose code or name contains the needle; name-prefix matches first, then code-prefix, then the rest, each alphabetically. */
export function filterSuppliers<T extends LookupSupplierLike>(suppliers: ReadonlyArray<T>, needle: string, limit = 12): T[] {
  const query = fold(needle);
  if (!query) return suppliers.slice(0, limit);
  const rank = (supplier: T) => {
    const name = fold(supplier.name);
    const code = fold(supplier.code);
    if (name.startsWith(query)) return 0;
    if (code.startsWith(query)) return 1;
    if (name.includes(query) || code.includes(query)) return 2;
    return -1;
  };
  return suppliers
    .map((supplier) => ({ supplier, rank: rank(supplier) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.supplier.name.localeCompare(right.supplier.name))
    .slice(0, limit)
    .map((entry) => entry.supplier);
}

/** Exact (case-insensitive) match on name or code, for committing free text on blur. */
export function matchSupplierExactly<T extends LookupSupplierLike>(suppliers: ReadonlyArray<T>, text: string): T | undefined {
  const query = fold(text);
  if (!query) return undefined;
  return suppliers.find((supplier) => fold(supplier.name) === query) ?? suppliers.find((supplier) => fold(supplier.code) === query);
}
