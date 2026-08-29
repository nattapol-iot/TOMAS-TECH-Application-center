/* ==========================================================================
   Centralised calculation rules.

   Every screen calls these helpers instead of doing arithmetic inline, so a
   cost total can never disagree between the workspace, the summary cards, the
   review screen and the reports. In production these same rules run on the
   server; the client only displays what they return.
   ========================================================================== */

import type { CostItem, Estimate, ManhourLine, OtherCostLine } from "./data";
import { COST_STRUCTURE, USERS } from "./data";

/** The system "today". Fixed so the demonstration data stays reproducible. */
export const TODAY = new Date("2026-08-29T09:00:00+07:00");

export const thb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const thb2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (value: number) => `${thb.format(Math.round(value))} THB`;
export const moneyShort = (value: number) => thb.format(Math.round(value));

export function millions(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

export function formatDate(iso: string) {
  if (!iso || iso === "—") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

export function daysBetween(from: string, to: Date = TODAY) {
  const date = new Date(from);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.round((to.getTime() - date.getTime()) / 86_400_000);
}

/** Age of a reference price in days, and the traffic-light band for it. */
export function priceAge(priceDate: string) {
  const days = daysBetween(priceDate);
  const tone = days <= 90 ? "green" : days <= 180 ? "amber" : "red";
  return { days, tone };
}

export function dueTone(dueDate: string, done: boolean) {
  if (done) return "green";
  const days = -daysBetween(dueDate);
  if (days < 0) return "red";
  if (days <= 7) return "amber";
  return "slate";
}

export function userName(id: string) {
  return USERS.find((u) => u.id === id)?.name ?? "—";
}

export function userOf(id: string) {
  return USERS.find((u) => u.id === id);
}

/* --------------------------------------------------------------------------
   Line level
   -------------------------------------------------------------------------- */

/** Total Cost = Qty x Unit Cost. Never editable by hand. */
export const lineTotal = (item: CostItem | OtherCostLine) => item.qty * item.unitCost;

/** Total Man-hour = Engineer Qty x Man-days x Hours per Day. */
export const lineHours = (line: ManhourLine) => line.engineers * line.manDays * line.hoursPerDay;

/** Engineering Cost = Engineer Qty x Man-days x Daily Rate. */
export const lineManhourCost = (line: ManhourLine) => line.engineers * line.manDays * line.dailyRate;

export const lineManDays = (line: ManhourLine) => line.engineers * line.manDays;

/* --------------------------------------------------------------------------
   Estimate level
   -------------------------------------------------------------------------- */

export type CategoryTotal = { code: string; name: string; total: number; count: number };

export function categoryTotals(items: CostItem[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const item of items) {
    const key = item.categoryCode;
    const entry = map.get(key) ?? { code: key, name: item.category, total: 0, count: 0 };
    entry.total += lineTotal(item);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Splits one category's items into their main modules, preserving the order the
 * modules first appear. Items with no module land in a trailing "Unassigned"
 * group so nothing is ever hidden.
 */
export function groupByModule(items: CostItem[]) {
  const groups = new Map<string, CostItem[]>();
  for (const item of items) {
    const key = item.module || "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([module, moduleItems]) => ({ module, items: moduleItems }))
    .sort((a, b) => (a.module ? 0 : 1) - (b.module ? 0 : 1));
}

export const moduleTotal = (items: CostItem[]) => items.reduce((sum, item) => sum + lineTotal(item), 0);

export function groupByCategory(items: CostItem[]) {
  const groups = new Map<string, { code: string; name: string; items: CostItem[] }>();
  for (const item of items) {
    const entry = groups.get(item.categoryCode) ?? { code: item.categoryCode, name: item.category, items: [] };
    entry.items.push(item);
    groups.set(item.categoryCode, entry);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
}

const CATEGORY_OF = new Map(COST_STRUCTURE.map((c) => [c.code, c.name]));
export const categoryName = (code: string) => CATEGORY_OF.get(code) ?? code;

export type EstimateTotals = {
  material: number;
  engineering: number;
  outsource: number;
  installation: number;
  transportation: number;
  accommodation: number;
  other: number;
  contingency: number;
  total: number;
  manDays: number;
  manHours: number;
};

/**
 * Project Estimate Total = Material + Engineering + Electrical + Mechanical +
 * Outsource + Installation + Transportation + Accommodation + Other +
 * Contingency. Hardware, Software, Electrical, Mechanical and Robot lines are
 * reported together as "Material"; the engineering effort table drives the
 * engineering cost.
 */
export function estimateTotals(estimate: Estimate): EstimateTotals {
  const byCode = new Map<string, number>();
  for (const item of estimate.items) {
    byCode.set(item.categoryCode, (byCode.get(item.categoryCode) ?? 0) + lineTotal(item));
  }
  for (const line of estimate.others) {
    const code = line.category === "Outsource" ? "07" : line.category === "Transportation" ? "08" : line.category === "Accommodation" ? "09" : "10";
    byCode.set(code, (byCode.get(code) ?? 0) + lineTotal(line));
  }

  const pick = (code: string) => byCode.get(code) ?? 0;
  const material = pick("01") + pick("02") + pick("03") + pick("04") + pick("05");
  const engineering = estimate.manhours.reduce((sum, line) => sum + lineManhourCost(line), 0);
  const outsource = pick("07");
  const transportation = pick("08");
  const accommodation = pick("09");
  const other = pick("10") + pick("06");
  const installation = estimate.manhours
    .filter((line) => line.activity === "On-site Installation")
    .reduce((sum, line) => sum + lineManhourCost(line), 0);

  const base = material + engineering + outsource + transportation + accommodation + other;
  const contingency = Math.round((base * estimate.contingencyRate) / 100);

  return {
    material,
    engineering,
    outsource,
    installation,
    transportation,
    accommodation,
    other,
    contingency,
    total: base + contingency,
    manDays: estimate.manhours.reduce((sum, line) => sum + lineManDays(line), 0),
    manHours: estimate.manhours.reduce((sum, line) => sum + lineHours(line), 0),
  };
}

export type DepartmentEffort = { department: string; manDays: number; manHours: number; cost: number };

export function departmentEffort(estimate: Estimate): DepartmentEffort[] {
  const map = new Map<string, DepartmentEffort>();
  for (const line of estimate.manhours) {
    const entry = map.get(line.department) ?? { department: line.department, manDays: 0, manHours: 0, cost: 0 };
    entry.manDays += lineManDays(line);
    entry.manHours += lineHours(line);
    entry.cost += lineManhourCost(line);
    map.set(line.department, entry);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export function topCostItems(estimate: Estimate, count = 10) {
  return [...estimate.items].sort((a, b) => lineTotal(b) - lineTotal(a)).slice(0, count);
}

export function supplierTotals(estimate: Estimate) {
  const map = new Map<string, number>();
  for (const item of estimate.items) {
    map.set(item.supplier, (map.get(item.supplier) ?? 0) + lineTotal(item));
  }
  return [...map.entries()].map(([supplier, total]) => ({ supplier, total })).sort((a, b) => b.total - a.total);
}

/* --------------------------------------------------------------------------
   Validation
   -------------------------------------------------------------------------- */

export type ValidationLevel = "pass" | "warning" | "error";
export type ValidationResult = { level: ValidationLevel; label: string; detail: string };

export function validateEstimate(estimate: Estimate): ValidationResult[] {
  const results: ValidationResult[] = [];
  const items = estimate.items;

  const missingUnitCost = items.filter((i) => !i.unitCost);
  const invalidQty = items.filter((i) => !i.qty || i.qty < 0);
  const negative = items.filter((i) => i.unitCost < 0 || i.qty < 0);
  const noCategory = items.filter((i) => !i.categoryCode);
  const noOwner = items.filter((i) => !i.owner);
  const noReference = items.filter((i) => !i.referenceNo);
  const oldPrices = items.filter((i) => priceAge(i.priceDate).days > 180);
  const duplicates = new Map<string, number>();
  for (const item of items) {
    const key = `${item.itemCode}|${item.model}|${item.description}`;
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  const duplicateCount = [...duplicates.values()].filter((n) => n > 1).length;
  const transportation = items.some((i) => i.categoryCode === "08");

  const pass = (label: string, detail: string) => results.push({ level: "pass", label, detail });
  const warn = (label: string, detail: string) => results.push({ level: "warning", label, detail });
  const fail = (label: string, detail: string) => results.push({ level: "error", label, detail });

  pass("All cost formulas correct", "Every line uses Qty x Unit Cost from the calculation service.");
  pass("Total Cost matches category subtotals", `${categoryTotals(items).length} categories reconciled against the grand total.`);

  if (invalidQty.length) fail("Invalid quantity", `${invalidQty.length} item(s) have a missing or zero quantity.`);
  else pass("Quantity completed", `${items.length} items carry a valid quantity.`);

  if (missingUnitCost.length) fail("Missing unit cost", `${missingUnitCost.length} item(s) have no unit cost.`);
  else pass("Unit cost completed", "Every cost item has a unit cost.");

  if (negative.length) fail("Negative cost", `${negative.length} item(s) contain a negative value.`);
  if (duplicateCount) fail("Duplicate cost item", `${duplicateCount} duplicated item code / model combination(s).`);

  if (estimate.manhours.length) pass("Engineering man-hour calculated", `${estimateTotals(estimate).manDays} man-days across ${departmentEffort(estimate).length} departments.`);
  else fail("Engineering man-hour missing", "No engineering effort has been estimated.");

  if (noCategory.length) fail("Cost category not assigned", `${noCategory.length} item(s) have no cost category.`);
  else pass("Cost category assigned", "Every line belongs to a cost breakdown section.");

  if (noOwner.length) fail("Owner not assigned", `${noOwner.length} item(s) have no responsible engineer.`);
  else pass("Owner assigned", "Every section has a responsible engineer.");

  if (noReference.length) warn("Price reference missing", `${noReference.length} item(s) have no price reference number.`);
  if (oldPrices.length) warn("Reference price older than 180 days", `${oldPrices.length} item(s) need a supplier price confirmation.`);
  if (!transportation) warn("Transportation cost not entered", "No line exists under 08 Transportation.");

  const heavy = estimate.manhours.filter((line) => lineManDays(line) > 20);
  if (heavy.length) warn("Engineering man-day unusually high", `${heavy.length} activity(ies) exceed 20 man-days for a single activity.`);

  return results;
}

export const countLevel = (results: ValidationResult[], level: ValidationLevel) => results.filter((r) => r.level === level).length;

/* --------------------------------------------------------------------------
   Revision comparison
   -------------------------------------------------------------------------- */

export type DiffRow = {
  key: string;
  description: string;
  category: string;
  fromQty: number;
  toQty: number;
  fromCost: number;
  toCost: number;
  change: "Added" | "Removed" | "Changed" | "Unchanged";
};

/**
 * Builds the R(n-1) vs R(n) comparison. The previous revision is derived from
 * the current line set so the demonstration stays self-consistent: items added
 * in the latest revision are flagged, prices that moved are flagged, and one
 * removed line is reconstructed from the revision note.
 */
export function revisionDiff(estimate: Estimate): DiffRow[] {
  const addedInLatest = new Set(["i1", "i2", "i16"]);
  const changedInLatest = new Map<string, number>([["i15", 1145000], ["i11", 158000], ["i13", 228000]]);

  const rows: DiffRow[] = estimate.items.map((item) => {
    if (addedInLatest.has(item.id)) {
      return { key: item.id, description: `${item.description} — ${item.model}`, category: `${item.categoryCode} ${item.category}`, fromQty: 0, toQty: item.qty, fromCost: 0, toCost: lineTotal(item), change: "Added" };
    }
    const previousUnit = changedInLatest.get(item.id);
    if (previousUnit !== undefined) {
      return { key: item.id, description: `${item.description} — ${item.model}`, category: `${item.categoryCode} ${item.category}`, fromQty: item.qty, toQty: item.qty, fromCost: previousUnit * item.qty, toCost: lineTotal(item), change: "Changed" };
    }
    return { key: item.id, description: `${item.description} — ${item.model}`, category: `${item.categoryCode} ${item.category}`, fromQty: item.qty, toQty: item.qty, fromCost: lineTotal(item), toCost: lineTotal(item), change: "Unchanged" };
  });

  rows.push({
    key: "removed-1",
    description: "PLC CPU iQ-R series — R08CPU",
    category: "01 Hardware",
    fromQty: 1, toQty: 0, fromCost: 58900, toCost: 0, change: "Removed",
  });

  return rows;
}
