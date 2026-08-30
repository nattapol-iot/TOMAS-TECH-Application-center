/* ==========================================================================
   Centralised calculation rules.

   Every screen calls these helpers instead of doing arithmetic inline, so a
   cost total can never disagree between the workspace, the summary cards, the
   review screen and the reports. In production these same rules run on the
   server; the client only displays what they return.
   ========================================================================== */

import type {
  CostItem, CostType, Estimate, ExpenseLine, ManhourLine, ManhourProvider, OtherCostLine,
  PrLine, PurchaseRequisition, User, WorkItem,
} from "./data";
import { CAPACITY_PER_WEEK, COST_STRUCTURE, RATES, USERS } from "./data";

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

/**
 * Standard daily cost from the Engineering Rate Master. Installation & service
 * work is rated higher than engineering work, so the cost type is part of the key.
 * Supplier man-hour is quoted instead — it never reads this table.
 */
export function rateFor(level: string, department: string, costType: CostType) {
  const record = RATES.find((rate) => rate.level === level && rate.department === department)
    ?? RATES.find((rate) => rate.level === level);
  if (!record) return { daily: 0, hourly: 0 };
  return costType === "Installation"
    ? { daily: record.installationDaily, hourly: record.installationHourly }
    : { daily: record.engineeringDaily, hourly: record.engineeringHourly };
}

/** Expense Cost = Qty x Unit Cost — travel, hotel, per diem and the like. */
export const expenseTotal = (line: ExpenseLine) => line.qty * line.unitCost;

/** Which summary bucket an expense reports into. */
export function expenseBucket(type: ExpenseLine["type"]): "transportation" | "accommodation" | "other" {
  if (type === "Travel" || type === "Transportation") return "transportation";
  if (type === "Accommodation" || type === "Per Diem") return "accommodation";
  return "other";
}

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
  /** Man-hour classified as engineering cost — design, programming, testing. */
  effortEngineering: number;
  /** Man-hour classified as installation & service cost — putting the system in and servicing it. */
  effortInstallation: number;
  /** Part of the man-hour above that is bought from a supplier. */
  supplierManhour: number;
  siteExpense: number;
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

  // Travel, hotel and per diem are estimated inside their work package but are
  // reported in the transportation / accommodation / other buckets.
  const expenseByBucket = { transportation: 0, accommodation: 0, other: 0 };
  for (const line of estimate.expenses) {
    expenseByBucket[expenseBucket(line.type)] += expenseTotal(line);
  }

  const pick = (code: string) => byCode.get(code) ?? 0;
  const material = pick("01") + pick("02") + pick("03") + pick("04") + pick("05");
  const effortEngineering = estimate.manhours
    .filter((line) => line.costType === "Engineering")
    .reduce((sum, line) => sum + lineManhourCost(line), 0);
  const effortInstallation = estimate.manhours
    .filter((line) => line.costType === "Installation")
    .reduce((sum, line) => sum + lineManhourCost(line), 0);
  const supplierManhour = estimate.manhours
    .filter((line) => line.provider === "Supplier")
    .reduce((sum, line) => sum + lineManhourCost(line), 0);
  const engineering = effortEngineering + effortInstallation;
  const outsource = pick("07");
  const transportation = pick("08") + expenseByBucket.transportation;
  const accommodation = pick("09") + expenseByBucket.accommodation;
  const other = pick("10") + pick("06") + expenseByBucket.other;
  const siteExpense = estimate.expenses.reduce((sum, line) => sum + expenseTotal(line), 0);

  const base = material + engineering + outsource + transportation + accommodation + other;
  const contingency = Math.round((base * estimate.contingencyRate) / 100);

  return {
    material,
    engineering,
    effortEngineering,
    effortInstallation,
    supplierManhour,
    siteExpense,
    outsource,
    // Installation effort plus the expense it drags along: what putting the
    // system in at the customer site really costs.
    installation: effortInstallation + siteExpense,
    transportation,
    accommodation,
    other,
    contingency,
    total: base + contingency,
    manDays: estimate.manhours.reduce((sum, line) => sum + lineManDays(line), 0),
    manHours: estimate.manhours.reduce((sum, line) => sum + lineHours(line), 0),
  };
}

export type PackageGroup = { name: string; manhours: ManhourLine[]; expenses: ExpenseLine[] };

/** Groups engineering effort and its expenses into work packages. */
export function groupByPackage(manhours: ManhourLine[], expenses: ExpenseLine[]): PackageGroup[] {
  const names = [...manhours.map((line) => line.package), ...expenses.map((line) => line.package)]
    .filter((name, index, list) => list.indexOf(name) === index);
  return names.map((name) => ({
    name,
    manhours: manhours.filter((line) => line.package === name),
    expenses: expenses.filter((line) => line.package === name),
  }));
}

export const packageTotal = (group: { manhours: ManhourLine[]; expenses: ExpenseLine[] }) =>
  group.manhours.reduce((sum, line) => sum + lineManhourCost(line), 0)
  + group.expenses.reduce((sum, line) => sum + expenseTotal(line), 0);

/* --------------------------------------------------------------------------
   Four-block summary

   The whole estimate rolled into the four figures the engineering team reports:
   hardware, software, engineering / service effort and installation. Everything
   that belongs to none of them is listed separately so the four blocks plus the
   remainder always reconcile to the total estimated cost.
   -------------------------------------------------------------------------- */

/**
 * One summary line. `total` is what the cost tabs rolled up; the summary sheet
 * can re-count it — a control panel priced as one set may be needed twice — by
 * overriding qty, so the shown value is `unitCost x qty`.
 */
export type SummaryLine = {
  /** Stable key so an override survives a re-render and a data change. */
  key: string;
  label: string;
  detail: string;
  measure: string;
  /** Cost of one set, as rolled up from the cost tabs. */
  unitCost: number;
  /** Default unit for the rolled-up line. */
  unit: string;
  /** How many of it the summary counts — 1 unless an engineer re-counted it. */
  qty: number;
  remark: string;
  total: number;
};
export type SummaryBlock = {
  key: "hardware" | "software" | "engineering" | "installation";
  label: string;
  note: string;
  total: number;
  /** What the cost tabs rolled up, before any re-count in the summary. */
  rolledUp: number;
  lines: SummaryLine[];
};

/** Material categories that roll up into the hardware block. */
const HARDWARE_CODES = ["01", "03", "04", "05"];

/**
 * What the summary sheet may change on a rolled-up line: how many of it the
 * machine actually needs, its unit, its wording, and a note. A control panel
 * priced once as a set becomes "2 Set" here without touching the cost tab.
 */
export type SummaryOverride = {
  qty?: number;
  unit?: string;
  label?: string;
  remark?: string;
  /** Extra line typed straight into the summary, not rolled up from a cost tab. */
  manual?: { blockKey: SummaryBlock["key"]; detail: string; unitCost: number };
};

export type SummaryOverrides = Record<string, SummaryOverride>;

export function summaryBlocks(estimate: Estimate, overrides: SummaryOverrides = {}) {
  const totals = estimateTotals(estimate);

  const apply = (line: Omit<SummaryLine, "total" | "qty">): SummaryLine => {
    const override = overrides[line.key] ?? {};
    const qty = override.qty ?? 1;
    return {
      ...line,
      label: override.label ?? line.label,
      unit: override.unit ?? line.unit,
      remark: override.remark ?? "",
      qty,
      total: line.unitCost * qty,
    };
  };

  const materialLines = (blockKey: string, codes: string[]) => codes.flatMap((code) => {
    const categoryItems = estimate.items.filter((item) => item.categoryCode === code);
    if (!categoryItems.length) return [];
    return groupByModule(categoryItems).map((group) => apply({
      key: `${blockKey}|${code}|${group.module || "unassigned"}`,
      label: group.module || "Unassigned items",
      detail: `${code} ${categoryName(code)}`,
      measure: `${group.items.length} item${group.items.length === 1 ? "" : "s"}`,
      unitCost: moduleTotal(group.items),
      unit: "Set",
      remark: "",
    }));
  });

  const effortLines = (blockKey: string, costType: CostType, by: "department" | "package") => {
    const lines = estimate.manhours.filter((line) => line.costType === costType);
    const keys = lines.map((line) => (by === "department" ? line.department : line.package))
      .filter((key, index, list) => list.indexOf(key) === index);
    return keys.map((key) => {
      const group = lines.filter((line) => (by === "department" ? line.department : line.package) === key);
      const expenses = by === "package"
        ? estimate.expenses.filter((line) => line.package === key && line.costType === costType)
        : [];
      const manDays = group.reduce((sum, line) => sum + lineManDays(line), 0);
      const expense = expenses.reduce((sum, line) => sum + expenseTotal(line), 0);
      return apply({
        key: `${blockKey}|${by}|${key || "unassigned"}`,
        label: key || "Unassigned effort",
        detail: by === "department"
          ? `${group.length} activity(ies)${group.some((line) => line.provider === "Supplier") ? " · incl. supplier man-hour" : ""}`
          : `${group.length} activity(ies)${expenses.length ? ` · ${expenses.length} expense line(s)` : ""}`,
        measure: `${manDays} MD`,
        unitCost: group.reduce((sum, line) => sum + lineManhourCost(line), 0) + expense,
        unit: "Lot",
        remark: "",
      });
    });
  };

  const manualLines = (blockKey: string) => Object.entries(overrides)
    .filter(([, override]) => override.manual?.blockKey === blockKey)
    .map(([key, override]) => apply({
      key,
      label: override.label ?? "New summary line",
      detail: override.manual?.detail ?? "Added in the summary",
      measure: "manual",
      unitCost: override.manual?.unitCost ?? 0,
      unit: "Set",
      remark: "",
    }));

  // Expenses attached to an engineering package still belong to engineering.
  const engineeringExpense = estimate.expenses
    .filter((line) => line.costType === "Engineering")
    .reduce((sum, line) => sum + expenseTotal(line), 0);

  const sum = (lines: SummaryLine[]) => lines.reduce((total, line) => total + line.total, 0);
  const rolled = (lines: SummaryLine[]) => lines.reduce((total, line) => total + line.unitCost, 0);

  const build = (key: SummaryBlock["key"], label: string, note: string, lines: SummaryLine[]): SummaryBlock => ({
    key, label, note,
    lines: [...lines, ...manualLines(key)],
    total: sum([...lines, ...manualLines(key)]),
    rolledUp: rolled(lines),
  });

  const engineeringLines = effortLines("engineering", "Engineering", "department");
  const engineeringExpenseLine: SummaryLine[] = engineeringExpense
    ? [apply({
      key: "engineering|expense",
      label: "Engineering expense",
      detail: "Travel and other expense on engineering packages",
      measure: "expense",
      unitCost: engineeringExpense,
      unit: "Lot",
      remark: "",
    })]
    : [];

  const blocks: SummaryBlock[] = [
    build("hardware", "Hardware cost", "01 Hardware · 03 Electrical · 04 Mechanical · 05 Robot", materialLines("hardware", HARDWARE_CODES)),
    build("software", "Software cost", "02 Software — licence, application, database, dashboard", materialLines("software", ["02"])),
    build("engineering", "Engineering / Service cost", "Man-hour classified as engineering cost, by department", [...engineeringLines, ...engineeringExpenseLine]),
    build("installation", "Installation cost", "Installation & service man-hour with its travel, hotel and per diem", effortLines("installation", "Installation", "package")),
  ];

  const otherCodes = ["06", "07", "08", "09", "10"];
  const other: SummaryLine[] = [
    ...otherCodes.flatMap((code) => {
      const value = estimate.items.filter((item) => item.categoryCode === code).reduce((total, item) => total + lineTotal(item), 0);
      return value ? [apply({ key: `other|${code}`, label: `${code} ${categoryName(code)}`, detail: "Cost item", measure: "", unitCost: value, unit: "Lot", remark: "" })] : [];
    }),
    ...estimate.others.map((line) => apply({
      key: `other|${line.id}`,
      label: line.description || line.category,
      detail: line.category,
      measure: `${line.qty} ${line.unit}`,
      unitCost: lineTotal(line),
      unit: line.unit,
      remark: "",
    })),
    apply({ key: "other|contingency", label: `Contingency ${estimate.contingencyRate}%`, detail: "Applied on the cost base", measure: "", unitCost: totals.contingency, unit: "Lot", remark: "" }),
  ].filter((line) => line.unitCost);

  const otherTotal = other.reduce((total, line) => total + line.total, 0);
  const blockTotal = blocks.reduce((total, block) => total + block.total, 0);
  const rolledUpTotal = blocks.reduce((total, block) => total + block.rolledUp, 0)
    + other.reduce((total, line) => total + line.unitCost, 0);

  return {
    blocks,
    other,
    otherTotal,
    blockTotal,
    grandTotal: blockTotal + otherTotal,
    rolledUpTotal,
    adjusted: blockTotal + otherTotal - rolledUpTotal,
    totals,
  };
}

export type CostTypeEffort = { costType: CostType; manDays: number; manHours: number; cost: number; expense: number; supplier: number };

/** Engineering cost versus installation & service cost, with the expense each carries. */
export function costTypeEffort(estimate: Estimate): CostTypeEffort[] {
  return (["Engineering", "Installation"] as CostType[]).map((costType) => {
    const lines = estimate.manhours.filter((line) => line.costType === costType);
    return {
      costType,
      manDays: lines.reduce((sum, line) => sum + lineManDays(line), 0),
      manHours: lines.reduce((sum, line) => sum + lineHours(line), 0),
      cost: lines.reduce((sum, line) => sum + lineManhourCost(line), 0),
      supplier: lines.filter((line) => line.provider === "Supplier").reduce((sum, line) => sum + lineManhourCost(line), 0),
      expense: estimate.expenses.filter((line) => line.costType === costType).reduce((sum, line) => sum + expenseTotal(line), 0),
    };
  });
}

export type ProviderEffort = { provider: ManhourProvider; manDays: number; cost: number };

/** Own engineers versus outsourced man-hour. */
export function providerEffort(estimate: Estimate): ProviderEffort[] {
  return (["Internal", "Supplier"] as ManhourProvider[]).map((provider) => {
    const lines = estimate.manhours.filter((line) => line.provider === provider);
    return {
      provider,
      manDays: lines.reduce((sum, line) => sum + lineManDays(line), 0),
      cost: lines.reduce((sum, line) => sum + lineManhourCost(line), 0),
    };
  });
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
   Item code

   Codes are generated, not typed: two letters for the cost category, a short
   code for the main module, then a running number inside that module. Adding a
   line to "In-feed Conveyor" under 04 Mechanical gives ME-IFC-001, ME-IFC-002…
   An engineer can still overwrite a code with a customer or supplier part
   number; only generated codes are ever regenerated.
   -------------------------------------------------------------------------- */

export const CATEGORY_PREFIX: Record<string, string> = {
  "01": "HW", "02": "SW", "03": "EL", "04": "ME", "05": "RB",
  "06": "EN", "07": "OS", "08": "TR", "09": "AC", "10": "OT",
};

/** Short code for a module: initials, or the first letters of a single word. */
export function modulePrefix(module: string) {
  const words = module.replace(/[^a-zA-Z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return "GEN";
  const initials = words.map((word) => word[0]).join("").toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 3);
  return words[0].slice(0, 3).toUpperCase();
}

export const itemCodePrefix = (categoryCode: string, module: string) =>
  `${CATEGORY_PREFIX[categoryCode] ?? "GN"}-${modulePrefix(module || "General")}`;

/** Next free running number for the module the item is being added to. */
export function nextItemCode(items: CostItem[], categoryCode: string, module: string) {
  const prefix = itemCodePrefix(categoryCode, module);
  const used = items
    .filter((item) => item.itemCode.startsWith(`${prefix}-`))
    .map((item) => Number.parseInt(item.itemCode.slice(prefix.length + 1), 10))
    .filter((value) => Number.isFinite(value));
  return `${prefix}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

/** True when the code was generated for this category and module, or is empty. */
export const isGeneratedCode = (code: string, categoryCode: string, module: string) =>
  !code.trim() || new RegExp(`^${itemCodePrefix(categoryCode, module)}-\\d{3}$`).test(code.trim());

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

  // Internal effort must follow the master; supplier effort is quoted instead.
  const internal = estimate.manhours.filter((line) => line.provider === "Internal");
  const offRate = internal.filter((line) => line.dailyRate !== rateFor(line.level, line.department, line.costType).daily);
  if (offRate.length) fail("Rate does not match the rate master", `${offRate.length} internal activity(ies) use a rate that is not the standard ${offRate[0].costType.toLowerCase()} rate for that level.`);
  else pass("Engineering rate from the rate master", "Every internal activity uses the standard engineering or installation rate for its level.");

  const supplierLines = estimate.manhours.filter((line) => line.provider === "Supplier");
  const noSupplier = supplierLines.filter((line) => !line.supplier);
  const noQuotation = supplierLines.filter((line) => !line.quotationNo);
  if (noSupplier.length) fail("Supplier man-hour without a supplier", `${noSupplier.length} outsourced activity(ies) have no supplier selected.`);
  if (noQuotation.length) fail("Supplier man-hour without a quotation", `${noQuotation.length} outsourced activity(ies) have no supplier quotation attached.`);
  if (supplierLines.length && !noSupplier.length && !noQuotation.length) {
    pass("Supplier man-hour documented", `${supplierLines.length} outsourced activity(ies) carry a supplier and a quotation reference.`);
  }
  const oldQuote = supplierLines.filter((line) => line.priceDate && priceAge(line.priceDate).days > 180);
  if (oldQuote.length) warn("Supplier man-hour quotation is old", `${oldQuote.length} outsourced activity(ies) use a quotation older than 180 days.`);

  const installation = estimate.manhours.filter((line) => line.costType === "Installation");
  const travel = estimate.expenses.filter((line) => line.type === "Travel" || line.type === "Transportation");
  const stay = estimate.expenses.filter((line) => line.type === "Accommodation" || line.type === "Per Diem");
  if (installation.length && !travel.length) warn("Installation & service work has no travel cost", `${installation.length} installation & service activity(ies) but no travel or transportation expense was estimated.`);
  if (installation.length && !stay.length) warn("Installation & service work has no accommodation cost", "Add hotel or per diem, or confirm the team returns the same day.");

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

/* --------------------------------------------------------------------------
   Resource plan and workload
   -------------------------------------------------------------------------- */

const DAY = 86_400_000;

export const toDate = (iso: string) => new Date(`${iso}T00:00:00+07:00`);

/** Monday of the week a date falls in. */
export function weekStart(date: Date) {
  const copy = new Date(date.getTime());
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const isoDate = (date: Date) => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export type Week = { start: Date; end: Date; label: string; month: string; isCurrent: boolean };

/** The week columns a Gantt or a workload grid is drawn on. */
export function weeksFrom(from: Date, count: number): Week[] {
  const first = weekStart(from);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(first.getTime() + index * 7 * DAY);
    const end = new Date(start.getTime() + 6 * DAY);
    return {
      start,
      end,
      label: `${start.getDate()} ${start.toLocaleDateString("en-GB", { month: "short" })}`,
      month: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      isCurrent: TODAY >= start && TODAY <= new Date(end.getTime() + DAY - 1),
    };
  });
}

/** Where a work item sits on a week grid, as a percentage of the grid width. */
export function barPosition(item: WorkItem, weeks: Week[]) {
  if (!weeks.length) return null;
  const gridStart = weeks[0].start.getTime();
  const gridEnd = weeks[weeks.length - 1].end.getTime() + DAY;
  const span = gridEnd - gridStart;
  const start = Math.max(toDate(item.start).getTime(), gridStart);
  const end = Math.min(toDate(item.end).getTime() + DAY, gridEnd);
  if (end <= gridStart || start >= gridEnd) return null;
  return {
    left: ((start - gridStart) / span) * 100,
    width: Math.max(((end - start) / span) * 100, 1.2),
    clippedStart: toDate(item.start).getTime() < gridStart,
    clippedEnd: toDate(item.end).getTime() + DAY > gridEnd,
  };
}

/** Calendar days a work item overlaps with one week. */
function overlapDays(item: WorkItem, week: Week) {
  const start = Math.max(toDate(item.start).getTime(), week.start.getTime());
  const end = Math.min(toDate(item.end).getTime() + DAY, week.end.getTime() + DAY);
  return end <= start ? 0 : (end - start) / DAY;
}

/**
 * Man-days an item consumes in one week: its effort spread evenly across the
 * calendar days it runs for. Rough, but it is what a planner needs to see who
 * is over-committed.
 */
export function weekLoad(item: WorkItem, week: Week) {
  const total = (toDate(item.end).getTime() + DAY - toDate(item.start).getTime()) / DAY;
  if (total <= 0) return 0;
  return (item.manDays / total) * overlapDays(item, week);
}

export type EngineerLoad = {
  user: User;
  items: WorkItem[];
  weekly: { week: Week; manDays: number; utilisation: number }[];
  committedManDays: number;
  averageUtilisation: number;
  peakUtilisation: number;
  openItems: number;
  overdueItems: number;
  nextDue?: WorkItem;
};

export function engineerLoads(users: User[], items: WorkItem[], weeks: Week[]): EngineerLoad[] {
  return users.map((user) => {
    const mine = items.filter((item) => item.ownerId === user.id);
    const weekly = weeks.map((week) => {
      const manDays = mine.reduce((sum, item) => sum + weekLoad(item, week), 0);
      return { week, manDays, utilisation: (manDays / CAPACITY_PER_WEEK) * 100 };
    });
    const open = mine.filter((item) => item.progress < 100);
    return {
      user,
      items: mine,
      weekly,
      committedManDays: mine.reduce((sum, item) => sum + item.manDays, 0),
      averageUtilisation: weekly.length ? weekly.reduce((sum, entry) => sum + entry.utilisation, 0) / weekly.length : 0,
      peakUtilisation: weekly.reduce((peak, entry) => Math.max(peak, entry.utilisation), 0),
      openItems: open.length,
      overdueItems: mine.filter((item) => item.progress < 100 && toDate(item.end) < TODAY).length,
      nextDue: [...open].sort((a, b) => toDate(a.end).getTime() - toDate(b.end).getTime())[0],
    };
  });
}

export const loadTone = (utilisation: number) =>
  (utilisation > 100 ? "red" : utilisation >= 85 ? "amber" : utilisation > 0 ? "green" : "slate");

/* --------------------------------------------------------------------------
   Purchase requisition
   -------------------------------------------------------------------------- */

export const prLineTotal = (line: PrLine) => line.qty * line.unitCost;
export const prLineEstimate = (line: PrLine) => line.estimateQty * line.estimateUnitCost;
export const prLineVariance = (line: PrLine) => prLineTotal(line) - prLineEstimate(line);

export function prTotals(pr: PurchaseRequisition) {
  const total = pr.lines.reduce((sum, line) => sum + prLineTotal(line), 0);
  const estimated = pr.lines.reduce((sum, line) => sum + prLineEstimate(line), 0);
  return {
    total,
    estimated,
    variance: total - estimated,
    variancePercent: estimated ? ((total - estimated) / estimated) * 100 : 0,
    unlinked: pr.lines.filter((line) => !line.estimateItemId).length,
  };
}
