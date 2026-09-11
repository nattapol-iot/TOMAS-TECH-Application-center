/**
 * Pure decision rules for copying one estimate's cost ledgers into another.
 *
 * The rules live here, away from SQL, so the copy can be reasoned about and
 * tested without a database. The route in
 * `backend-node/src/routes/estimate-copy.ts` is the only caller; it keeps every
 * write inside one transaction and applies these decisions per line.
 */

/** The ten controlled estimate sections. A copy never writes outside them. */
export const ESTIMATE_SECTION_CODES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const;

export type EstimateSectionCode = (typeof ESTIMATE_SECTION_CODES)[number];

/** Engineering man-hour is always section 06, the same section the man-hour write route guards. */
export const MANHOUR_SECTION_CODE: EstimateSectionCode = "06";

const EXPENSE_SECTIONS: Record<string, EstimateSectionCode> = {
  Travel: "08", Transportation: "08", Accommodation: "09", "Per Diem": "09", "Equipment Rental": "10", Other: "10",
};

const OTHER_COST_SECTIONS: Record<string, EstimateSectionCode> = {
  Outsource: "07", Transportation: "08", Accommodation: "09", "Other Cost": "10",
};

export const isEstimateSectionCode = (value: unknown): value is EstimateSectionCode =>
  typeof value === "string" && (ESTIMATE_SECTION_CODES as readonly string[]).includes(value);

/** Section that owns an expense line, matching `expenseSection()` in the expense write route. */
export function expenseSectionCode(expenseType: string): EstimateSectionCode | null {
  return EXPENSE_SECTIONS[expenseType] ?? null;
}

/** Section that owns an other-cost line, matching the category the other-cost write route accepts. */
export function otherCostSectionCode(category: string): EstimateSectionCode | null {
  return OTHER_COST_SECTIONS[category] ?? null;
}

/**
 * Allocate a free item code inside the target revision.
 *
 * `UX_cost_items_code` is unique on (estimate_id, revision, item_code) for live
 * rows, so a source code that already exists in the target must be suffixed
 * instead of aborting the copy. The suffix rule mirrors the allocation loop that
 * `apply-template` already runs in SQL, including its 100-character ceiling.
 */
export function allocateItemCode(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix <= 100_000; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = base.slice(0, Math.max(0, 100 - tail.length)) + tail;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`No free item code remains for '${base}'.`);
}

export type SupplierState = "active" | "inactive";

/**
 * How a copied line treats its source supplier.
 *
 * A supplier that has since been deactivated cannot be written again: the cost
 * and expense write routes reject it. Rather than making the whole copy
 * impossible, an optional supplier reference is dropped and reported, because
 * the engineer would have had to clear it by hand anyway. A supplier man-hour
 * line has no such option — `CK_manhour_lines_supplier` requires the supplier
 * and its quotation number together — so that one is refused by name.
 */
export function resolveCopiedSupplier(
  supplierId: number | null,
  state: SupplierState | null,
  supplierRequired: boolean,
): { supplierId: number | null; dropped: boolean; blocked: boolean } {
  if (supplierId === null) return { supplierId: null, dropped: false, blocked: false };
  if (state === "active") return { supplierId, dropped: false, blocked: false };
  if (supplierRequired) return { supplierId, dropped: false, blocked: true };
  return { supplierId: null, dropped: true, blocked: false };
}

/**
 * Owner of a copied line.
 *
 * A section already assigned to an engineer keeps producing lines owned by that
 * engineer; the copy never moves work onto somebody who was not already
 * responsible for the section. Only an unassigned section falls back to the
 * owner chosen for the copy.
 */
export function copiedLineOwnerId(sectionOwnerId: number | null, fallbackOwnerId: number): number {
  return sectionOwnerId && sectionOwnerId > 0 ? sectionOwnerId : fallbackOwnerId;
}

/**
 * Sections a copy would write into, given the ledgers it was asked to carry.
 * Used to run the section permission check once per section before any insert.
 */
export function touchedSections(input: {
  costCategoryCodes: readonly string[];
  manhourLineCount: number;
  expenseTypes: readonly string[];
  otherCostCategories: readonly string[];
}): EstimateSectionCode[] {
  const sections = new Set<EstimateSectionCode>();
  for (const code of input.costCategoryCodes) if (isEstimateSectionCode(code)) sections.add(code);
  if (input.manhourLineCount > 0) sections.add(MANHOUR_SECTION_CODE);
  for (const type of input.expenseTypes) { const section = expenseSectionCode(type); if (section) sections.add(section); }
  for (const category of input.otherCostCategories) { const section = otherCostSectionCode(category); if (section) sections.add(section); }
  return [...sections].sort();
}

/**
 * Requested sections, normalised. An empty or missing selection copies every
 * section; anything else is restricted to the codes the caller asked for.
 */
export function requestedSections(value: unknown): EstimateSectionCode[] {
  if (value === undefined || value === null) return [...ESTIMATE_SECTION_CODES];
  if (!Array.isArray(value)) return [];
  const selected = value.filter(isEstimateSectionCode);
  return [...new Set(selected)].sort();
}
