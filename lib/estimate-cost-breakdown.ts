/**
 * One numbered, read-only view of every cost ledger of an estimate — the shape the
 * team is used to from the ERP quotation list: numbered sections with their
 * subtotal on the header row, lines numbered "1-1", "1-2", and an in-house /
 * outsourced split. Internal engineering cost only; no selling figures exist here.
 */

export type BreakdownSource = "in-house" | "outsourced";

export type BreakdownLine = {
  priceSetKey?: string | null;
  isPriceSet?: boolean;
  key: string;
  /** "1-3" — section ordinal and line ordinal. */
  number: string;
  title: string;
  module?: string;
  costType?: string;
  /** Secondary details shown under the title (item code, brand · model, package …). */
  details: string[];
  quantity: number;
  unit: string;
  source: BreakdownSource;
  /** Supplier name when the line is outsourced, otherwise null. */
  supplierName: string | null;
  unitCost: number;
  amount: number;
  /** True when the line still has no price, so the summary can flag it instead of showing ฿0. */
  awaitingPrice: boolean;
};

export type BreakdownSectionKind = "cost-items" | "manhour" | "expenses" | "other";

export type BreakdownSection = {
  key: string;
  ordinal: number;
  kind: BreakdownSectionKind;
  /** Two-digit cost category code for cost-item sections, otherwise null. */
  categoryCode: string | null;
  title: string;
  lines: BreakdownLine[];
  amount: number;
  inHouseAmount: number;
  inHouseCount: number;
  outsourcedAmount: number;
  outsourcedCount: number;
};

export type BreakdownInput = {
  costItems: ReadonlyArray<{
    priceSetKey?: string | null; isPriceSet?: boolean; id: number; categoryCode: string; category: string; module: string; itemCode: string; description: string;
    brand: string; model: string; specification: string | null; supplierName: string | null;
    quantity: number; unit: string; unitCost: number; lineTotal: number;
  }>;
  manhourLines: ReadonlyArray<{
    id: number; package: string; activity: string; costType?: string; department: string; level: string; provider: "Internal" | "Supplier";
    supplierName: string | null; engineers: number; manDays: number; dailyRate: number; lineCost: number;
  }>;
  expenseLines: ReadonlyArray<{
    id: number; package: string; expenseType: string; description: string; supplierName: string | null;
    quantity: number; unit: string; unitCost: number; lineTotal: number;
  }>;
  otherCostLines: ReadonlyArray<{
    id: number; category: string; description: string; quantity: number; unit: string; unitCost: number; lineTotal: number;
  }>;
};

export type BreakdownLabels = {
  manhour: string;
  expenses: string;
  other: string;
  manDayUnit: string;
};

const num = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const clean = (values: Array<string | null | undefined>) => values.map((value) => (value ?? "").trim()).filter(Boolean);

function finishSection(section: Omit<BreakdownSection, "amount" | "inHouseAmount" | "inHouseCount" | "outsourcedAmount" | "outsourcedCount">): BreakdownSection {
  const finished: BreakdownSection = { ...section, amount: 0, inHouseAmount: 0, inHouseCount: 0, outsourcedAmount: 0, outsourcedCount: 0 };
  for (const line of section.lines) {
    finished.amount += line.amount;
    if (line.source === "outsourced") { finished.outsourcedAmount += line.amount; finished.outsourcedCount += 1; }
    else { finished.inHouseAmount += line.amount; finished.inHouseCount += 1; }
  }
  return finished;
}

/** Sections in ERP order: cost categories (by code), then man-hour, expenses and other project cost. */
export function buildEstimateCostBreakdown(input: BreakdownInput, labels: BreakdownLabels): BreakdownSection[] {
  const sections: BreakdownSection[] = [];
  let ordinal = 0;

  const categories = new Map<string, { code: string; name: string; lines: BreakdownInput["costItems"][number][] }>();
  for (const line of input.costItems) {
    const entry = categories.get(line.categoryCode) ?? { code: line.categoryCode, name: line.category, lines: [] };
    entry.lines.push(line);
    categories.set(line.categoryCode, entry);
  }
  for (const entry of [...categories.values()].sort((left, right) => left.code.localeCompare(right.code))) {
    ordinal += 1;
    const lines = entry.lines;
    sections.push(finishSection({
      key: `category:${entry.code}`, ordinal, kind: "cost-items", categoryCode: entry.code, title: entry.name,
      lines: lines.map((line, index) => ({
        priceSetKey: line.priceSetKey, isPriceSet: line.isPriceSet, key: `cost:${line.id}`, number: `${ordinal}-${index + 1}`, title: line.description, module: line.module,
        details: clean([line.module, line.itemCode, [line.brand, line.model].filter((value) => value?.trim()).join(" · "), line.specification]),
        quantity: num(line.quantity), unit: line.unit, source: line.supplierName ? "outsourced" : "in-house",
        supplierName: line.supplierName, unitCost: num(line.unitCost), amount: num(line.lineTotal), awaitingPrice: num(line.unitCost) <= 0 && (!line.priceSetKey || Boolean(line.isPriceSet)),
      })),
    }));
  }

  if (input.manhourLines.length) {
    ordinal += 1;
    sections.push(finishSection({
      key: "manhour", ordinal, kind: "manhour", categoryCode: null, title: labels.manhour,
      lines: input.manhourLines.map((line, index) => ({
        key: `manhour:${line.id}`, number: `${ordinal}-${index + 1}`, title: line.activity, module: line.package, costType: line.costType,
        details: clean([line.package, [line.department, line.level].filter(Boolean).join(" · "), `${num(line.engineers)} × ${num(line.manDays)} ${labels.manDayUnit}`]),
        quantity: num(line.engineers) * num(line.manDays), unit: labels.manDayUnit,
        source: line.provider === "Supplier" ? "outsourced" : "in-house", supplierName: line.provider === "Supplier" ? line.supplierName : null,
        unitCost: num(line.dailyRate), amount: num(line.lineCost), awaitingPrice: num(line.dailyRate) <= 0,
      })),
    }));
  }

  if (input.expenseLines.length) {
    ordinal += 1;
    sections.push(finishSection({
      key: "expenses", ordinal, kind: "expenses", categoryCode: null, title: labels.expenses,
      lines: input.expenseLines.map((line, index) => ({
        key: `expense:${line.id}`, number: `${ordinal}-${index + 1}`, title: line.description, module: line.package,
        details: clean([line.expenseType, line.package]),
        quantity: num(line.quantity), unit: line.unit, source: line.supplierName ? "outsourced" : "in-house", supplierName: line.supplierName,
        unitCost: num(line.unitCost), amount: num(line.lineTotal), awaitingPrice: num(line.unitCost) <= 0,
      })),
    }));
  }

  if (input.otherCostLines.length) {
    ordinal += 1;
    sections.push(finishSection({
      key: "other", ordinal, kind: "other", categoryCode: null, title: labels.other,
      lines: input.otherCostLines.map((line, index) => ({
        key: `other:${line.id}`, number: `${ordinal}-${index + 1}`, title: line.description, module: line.category,
        details: clean([line.category]),
        quantity: num(line.quantity), unit: line.unit, source: line.category === "Outsource" ? "outsourced" : "in-house", supplierName: null,
        unitCost: num(line.unitCost), amount: num(line.lineTotal), awaitingPrice: num(line.unitCost) <= 0,
      })),
    }));
  }

  return sections;
}

export function breakdownLineCount(sections: readonly BreakdownSection[]): number {
  return sections.reduce((total, section) => total + section.lines.length, 0);
}

/**
 * Aggregate whole modules before filtering, retaining source lines for ERP mapping.
 *
 * A merged ERP line outranks the module a line belongs to: it is how the sheet is
 * written, so it becomes one row here too, wherever its lines came from.
 */
export function breakdownModules(section: BreakdownSection, mergedAs?: (line: BreakdownLine) => { id: number; title: string } | null) {
  // sections.flatMap(breakdownModules) is idiomatic and hands an index in here.
  const mergedOf = typeof mergedAs === "function" ? mergedAs : () => null;
  const groups = new Map<string, { key: string; title: string; lines: BreakdownLine[]; amount: number; inHouse: number; outsourced: number; standalone: boolean; merged: number | null }>();
  for (const line of section.lines) {
    const merged = mergedOf(line);
    const standalone = !merged && section.kind === "cost-items" && !line.module?.trim();
    const title = merged ? merged.title : standalone ? (line.priceSetKey ? section.lines.find(item=>item.priceSetKey===line.priceSetKey&&item.isPriceSet)?.title ?? line.title : line.title) : line.module?.trim() || "Unassigned module";
    const key = merged ? "group:" + merged.id : standalone ? (line.priceSetKey ? section.key + ":set:" + line.priceSetKey : section.key + ":item:" + line.key) : section.key + ":" + title;
    const group = groups.get(key) ?? { key, title, standalone, merged: merged?.id ?? null, lines: [], amount: 0, inHouse: 0, outsourced: 0 };
    group.lines.push(line);
    group.amount += line.amount;
    if (line.source === "in-house") group.inHouse += line.amount;
    else group.outsourced += line.amount;
    groups.set(key, group);
  }
  for (const group of groups.values()) if (group.standalone && group.lines.some(line=>line.isPriceSet)) group.lines.sort((a,b)=>Number(Boolean(b.isPriceSet))-Number(Boolean(a.isPriceSet)));
  return [...groups.values()];
}

export const LABOR_MODULE_NAMES: Record<string, string> = {
  Software: "Specification Design / Software Development / SAT",
  Service: "Hardware Design Assembly / Wirring Internal Test and BuyOff Local Transportation and Packing",
  Installation: "System implementation and Configuration Wiring and Installation ( Include Heavy Tools ) Test And Commissioning UAT",
};

/**
 * Reuse source amounts and identities; only labor presentation changes.
 *
 * A labour section is the ERP category of its own lines. The derived rule decides
 * that for most lines, so the section only claims a line when the rule would have
 * put it there — unless a person overrode the category on purpose, in which case
 * the section follows their decision and the page shows what will be exported.
 */
export function groupErpLaborSections(sections: BreakdownSection[], categories: ReadonlyMap<string, string>, overridden: ReadonlySet<string> = new Set()): BreakdownSection[] {
  const result: BreakdownSection[] = [];
  for (const section of sections) {
    if (section.kind !== "manhour") { result.push(section); continue; }
    const buckets = new Map<string, BreakdownLine[]>();
    for (const line of section.lines) {
      const category = categories.get(line.key) ?? "Unmapped";
      const grouped = overridden.has(line.key) ? Boolean(LABOR_MODULE_NAMES[category]) :
        category === "Installation" ? line.costType === "Installation" :
        (category === "Software" || category === "Service") && line.costType === "Engineering" && line.source === "in-house";
      const bucket = grouped ? category : "Other labor";
      const lines = buckets.get(bucket) ?? [];
      lines.push(grouped ? { ...line, module: LABOR_MODULE_NAMES[category] } : line);
      buckets.set(bucket, lines);
    }
    for (const category of ["Software", "Service", "Installation", "Other labor"]) {
      const lines = buckets.get(category);
      if (lines) result.push(finishSection({ ...section, key: "labor:" + category, title: category, lines }));
    }
  }
  return result.map((section, index) => ({ ...section, ordinal: index + 1 }));
}

/** Rows for the ERP sheet, retaining their source ledger. */
export function breakdownSheetModules(sections: BreakdownSection[], mergedAs?: (line: BreakdownLine) => { id: number; title: string } | null) {
  const rows: Array<ReturnType<typeof breakdownModules>[number] & { source: BreakdownSection }> = [];
  const mergedRows = new Map<number, (typeof rows)[number]>();
  for (const source of sections) {
    for (const row of breakdownModules(source, mergedAs)) {
      // ERP groups span ledgers; a section boundary must not split their price.
      const existing = row.merged === null ? undefined : mergedRows.get(row.merged);
      if (existing) {
        existing.lines.push(...row.lines);
        existing.amount += row.amount;
        existing.inHouse += row.inHouse;
        existing.outsourced += row.outsourced;
      } else {
        const entry = { ...row, source };
        rows.push(entry);
        if (row.merged !== null) mergedRows.set(row.merged, entry);
      }
    }
  }
  return rows;
}

/** A cost module summarizes all its current components as one set, not a multiplier. */
export function erpSheetQuantity(
  row: { standalone: boolean; source: { kind: BreakdownSectionKind }; lines: readonly { quantity: number; unit: string }[] },
  merged: { quantity: number; unit: string } | null,
  detail?: { quantity?: number; unit?: string },
) {
  if (merged) return { quantity: merged.quantity, unit: merged.unit };
  if (row.standalone) return { quantity: row.lines[0].quantity, unit: row.lines[0].unit };
  if (row.source.kind === 'cost-items') return { quantity: 1, unit: 'Set' };
  return { quantity: detail?.quantity ?? 1, unit: detail?.unit ?? 'Set' };
}
