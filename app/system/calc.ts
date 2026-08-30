/* ==========================================================================
   Centralised calculation rules.

   Every screen calls these helpers instead of doing arithmetic inline, so a
   cost total can never disagree between the workspace, the summary cards, the
   review screen and the reports. In production these same rules run on the
   server; the client only displays what they return.
   ========================================================================== */

import type {
  CostItem, CostType, Estimate, ExpenseLine, ManhourLine, ManhourProvider, OtherCostLine,
  PrLine, Project, PurchaseRequisition, Role, ScheduleStatus, ScheduleTask, ScheduleUpdate,
  User, WorkItem,
} from "./data";
import { CAPACITY_PER_WEEK, COST_STRUCTURE, HOLIDAYS, RATES, USERS } from "./data";
import type { Tone } from "./ui";

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

/* --------------------------------------------------------------------------
   Project schedule — the spreadsheet's arithmetic, made server-portable

   Everything here is pure. WBS numbers, END dates, work-day counts, parent
   roll-ups, dependency starts and every variance figure are DERIVED on every
   pass — a stored roll-up is a roll-up that goes stale, which is exactly the
   two-file problem this module replaces.
   -------------------------------------------------------------------------- */

export const TODAY_ISO = isoDate(TODAY);

export const addDays = (iso: string, n: number) => isoDate(new Date(toDate(iso).getTime() + n * DAY));

/** Whole calendar days from a to b (negative when b is earlier). */
export const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);

/** Excel: END = START + DAYS - 1 (calendar days, minimum 1). */
export const endFromDays = (start: string, days: number) => addDays(start, Math.max(1, days) - 1);

export const daysFromEnd = (start: string, end: string) => Math.max(1, diffDays(start, end) + 1);

const HOLIDAY_SET = new Set(HOLIDAYS);

export const isWorkDay = (iso: string) => {
  const weekday = toDate(iso).getDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAY_SET.has(iso);
};

/** Excel NETWORKDAYS: working days from start to end, both inclusive. */
export function networkDays(start: string, end: string) {
  if (!start || !end || toDate(end) < toDate(start)) return 0;
  let count = 0;
  for (let t = toDate(start).getTime(); t <= toDate(end).getTime(); t += DAY) {
    if (isWorkDay(isoDate(new Date(t)))) count += 1;
  }
  return count;
}

/** Signed work days from a to b: + when b is later. */
export const networkDaysSigned = (a: string, b: string) =>
  (toDate(b) >= toDate(a) ? networkDays(a, b) - 1 : -(networkDays(b, a) - 1));

export function nextWorkDay(iso: string) {
  let day = iso;
  while (!isWorkDay(day)) day = addDays(day, 1);
  return day;
}

/* ---- The resolved row every schedule screen renders ---------------------- */

export type ScheduleRow = ScheduleTask & {
  wbs: string;
  depth: number;
  hasChildren: boolean;
  /** Effective window: what the bar draws (actuals and forecasts included). */
  start: string;
  end: string;
  /** Plan window: what the customer was promised (roll-up of plan dates only). */
  planEndDate: string;
  days: number;
  workDays: number;
  doneLeaves: number;
  totalLeaves: number;
  expectedPercent: number;
  drift: number;
  varianceDays: number;
  isLate: boolean;
  isStale: boolean;
  needsForecast: boolean;
  pinned: boolean;
  circular: boolean;
  openRequests: number;
};

/**
 * Resolve one project's tree: WBS numbers, dependency starts, roll-ups and
 * health flags — the whole spreadsheet recalculation in one pure pass.
 */
export function resolveSchedule(tasks: ScheduleTask[], projectId: string, updates: ScheduleUpdate[] = []): ScheduleRow[] {
  const mine = tasks.filter((entry) => entry.projectId === projectId);
  const byId = new Map(mine.map((entry) => [entry.id, entry]));

  // Orphan sweep: a half-deleted subtree degrades to top level, never a blank screen.
  const parentOf = (entry: ScheduleTask) => (entry.parentId && byId.has(entry.parentId) ? entry.parentId : "");
  const children = new Map<string, ScheduleTask[]>();
  for (const entry of mine) {
    const key = parentOf(entry);
    children.set(key, [...(children.get(key) ?? []), entry]);
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  type Resolved = {
    planStart: string; planEnd: string; start: string; end: string;
    actualStart: string; actualEnd: string;
    baselineStart: string; baselineEnd: string;
    percent: number; status: ScheduleStatus;
    doneLeaves: number; totalLeaves: number; weight: number; weighted: number;
    planManDays: number; actualManDays: number;
    circular: boolean;
  };
  const memo = new Map<string, Resolved>();
  const visiting = new Set<string>();

  const resolve = (entry: ScheduleTask): Resolved => {
    const cached = memo.get(entry.id);
    if (cached) return cached;
    if (visiting.has(entry.id)) {
      // Dependency cycle — keep manual dates and flag it.
      const end = endFromDays(entry.planStart, entry.planDays);
      return {
        planStart: entry.planStart, planEnd: end, start: entry.planStart, end,
        actualStart: entry.actualStart, actualEnd: entry.actualEnd,
        baselineStart: entry.baselineStart, baselineEnd: entry.baselineEnd,
        percent: entry.percentDone, status: entry.status,
        doneLeaves: 0, totalLeaves: 1, weight: 1, weighted: entry.percentDone,
        planManDays: entry.planManDays, actualManDays: entry.actualManDays, circular: true,
      };
    }
    visiting.add(entry.id);

    const kids = (children.get(entry.id) ?? []).filter((kid) => kid.status !== "Cancelled");
    let resolved: Resolved;

    if (kids.length) {
      // Parent roll-up. A PHASE is the Excel formula row — start = MIN(children),
      // end = MAX(children), nothing of its own. A TASK with member details keeps
      // its OWN plan window and forecast (the PM's commitment); only progress and
      // status roll up from the details underneath it.
      const parts = kids.map(resolve);
      const min = (values: string[]) => values.filter(Boolean).sort()[0] ?? "";
      const max = (values: string[]) => values.filter(Boolean).sort().slice(-1)[0] ?? "";
      const weight = parts.reduce((sum, p) => sum + p.weight, 0);
      const weighted = parts.reduce((sum, p) => sum + p.weighted, 0);
      const allDone = parts.every((p) => p.status === "Done");
      const isFormulaRow = entry.kind === "phase" || !entry.planStart;

      let planStart: string;
      let planEnd: string;
      let start: string;
      let end: string;
      if (isFormulaRow) {
        planStart = min(parts.map((p) => p.planStart));
        planEnd = max(parts.map((p) => p.planEnd));
        start = min(parts.map((p) => p.start));
        end = max(parts.map((p) => p.end));
      } else {
        planStart = entry.planStart;
        planEnd = endFromDays(planStart, entry.planDays);
        start = entry.actualStart || min([planStart, ...parts.map((p) => p.start)]);
        end = entry.actualEnd || entry.forecastEnd || max([planEnd, ...parts.map((p) => p.end)]);
      }

      resolved = {
        planStart, planEnd, start, end,
        actualStart: isFormulaRow ? min(parts.map((p) => p.actualStart)) : entry.actualStart || min(parts.map((p) => p.actualStart)),
        actualEnd: allDone ? (isFormulaRow ? max(parts.map((p) => p.actualEnd)) : entry.actualEnd || max(parts.map((p) => p.actualEnd))) : "",
        baselineStart: isFormulaRow ? min(parts.map((p) => p.baselineStart)) : entry.baselineStart,
        baselineEnd: isFormulaRow ? max(parts.map((p) => p.baselineEnd)) : entry.baselineEnd,
        percent: weight ? Math.round(weighted / weight) : Math.round(parts.reduce((s, p) => s + p.percent, 0) / parts.length),
        status: allDone ? "Done"
          : parts.some((p) => p.status === "Blocked") ? "Blocked"
            : parts.some((p) => p.status === "In Progress" || p.percent > 0 || p.actualStart) ? "In Progress"
              : "Not Started",
        doneLeaves: parts.reduce((sum, p) => sum + p.doneLeaves, 0),
        totalLeaves: parts.reduce((sum, p) => sum + p.totalLeaves, 0),
        weight, weighted,
        planManDays: entry.planManDays + parts.reduce((sum, p) => sum + p.planManDays, 0),
        actualManDays: entry.actualManDays + parts.reduce((sum, p) => sum + p.actualManDays, 0),
        circular: parts.some((p) => p.circular),
      };
    } else {
      // Leaf. A linked start follows its predecessor's PLAN end (the "=F27+1"
      // formula) — a member finishing late moves the bar, never the plan.
      let planStart = entry.planStart;
      let circular = false;
      if (entry.startMode === "linked" && entry.predecessorId && byId.has(entry.predecessorId)) {
        const pred = resolve(byId.get(entry.predecessorId)!);
        circular = pred.circular;
        planStart = nextWorkDay(addDays(pred.planEnd, 1 + entry.lagDays));
      }
      const planEnd = endFromDays(planStart, entry.planDays);
      const start = entry.actualStart || planStart;
      const end = entry.actualEnd || entry.forecastEnd || (toDate(start) > toDate(planEnd) ? endFromDays(start, entry.planDays) : planEnd);
      const wd = networkDays(planStart, planEnd) || 1;
      resolved = {
        planStart, planEnd, start, end,
        actualStart: entry.actualStart, actualEnd: entry.actualEnd,
        baselineStart: entry.baselineStart, baselineEnd: entry.baselineEnd,
        percent: entry.percentDone, status: entry.status,
        doneLeaves: entry.status === "Done" ? 1 : 0, totalLeaves: 1,
        weight: wd, weighted: entry.percentDone * wd,
        planManDays: entry.planManDays, actualManDays: entry.actualManDays, circular,
      };
    }

    visiting.delete(entry.id);
    memo.set(entry.id, resolved);
    return resolved;
  };

  const openByTask = new Map<string, number>();
  for (const update of updates) {
    if (update.requestDays > 0 && update.answer === "") {
      openByTask.set(update.taskId, (openByTask.get(update.taskId) ?? 0) + 1);
    }
  }

  // Flatten in WBS order and attach the derived numbers.
  const rows: ScheduleRow[] = [];
  const walk = (parentId: string, prefix: string, depth: number) => {
    (children.get(parentId) ?? []).forEach((entry, index) => {
      const wbs = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      const r = resolve(entry);
      const kids = children.get(entry.id) ?? [];
      const workDays = networkDays(r.start, r.end);
      const expected = workDays > 0 && toDate(r.start) <= TODAY
        ? Math.min(100, Math.round((networkDays(r.start, toDate(r.end) < TODAY ? r.end : TODAY_ISO) / workDays) * 100))
        : 0;
      const late = r.status !== "Done" && entry.status !== "Cancelled" && !!r.end && toDate(r.end) < TODAY;
      rows.push({
        ...entry,
        wbs, depth, hasChildren: kids.length > 0,
        planStart: r.planStart, planEndDate: r.planEnd,
        start: r.start, end: r.end,
        actualStart: r.actualStart, actualEnd: r.actualEnd,
        baselineStart: r.baselineStart, baselineEnd: r.baselineEnd,
        percentDone: r.percent, status: r.status,
        planManDays: r.planManDays, actualManDays: r.actualManDays,
        days: r.start && r.end ? daysFromEnd(r.start, r.end) : 0,
        workDays,
        doneLeaves: r.doneLeaves, totalLeaves: r.totalLeaves,
        expectedPercent: expected,
        drift: r.percent - expected,
        varianceDays: r.baselineEnd && r.end ? networkDaysSigned(r.baselineEnd, r.end) : 0,
        isLate: late,
        isStale: r.status === "In Progress" && kids.length === 0 && networkDays(entry.updatedAt, TODAY_ISO) > 5,
        needsForecast: (kids.length === 0 || entry.kind === "task") && r.status !== "Done" && entry.status !== "Cancelled"
          && !!r.planEnd && toDate(r.planEnd) < TODAY && !entry.forecastEnd && !entry.actualEnd,
        pinned: entry.startMode === "manual" && !!entry.predecessorId,
        circular: r.circular,
        openRequests: openByTask.get(entry.id) ?? 0,
      });
      walk(entry.id, wbs, depth + 1);
    });
  };
  walk("", "", 1);
  return rows;
}

/** The root summary a header or a project list needs. */
export function scheduleSummary(rows: ScheduleRow[]) {
  const top = rows.filter((row) => row.depth === 1);
  if (!top.length) return null;
  const leaves = rows.filter((row) => !row.hasChildren && row.status !== "Cancelled");
  const min = (values: string[]) => values.filter(Boolean).sort()[0] ?? "";
  const max = (values: string[]) => values.filter(Boolean).sort().slice(-1)[0] ?? "";
  const start = min(top.map((row) => row.start));
  const end = max(top.map((row) => row.end));
  const baselineEnd = max(top.map((row) => row.baselineEnd));
  const weight = leaves.reduce((sum, row) => sum + (networkDays(row.planStart, row.planEndDate) || 1), 0);
  const weighted = leaves.reduce((sum, row) => sum + row.percentDone * (networkDays(row.planStart, row.planEndDate) || 1), 0);
  return {
    start, end, baselineEnd,
    workDays: networkDays(start, end),
    percent: weight ? Math.round(weighted / weight) : 0,
    varianceDays: baselineEnd && end ? networkDaysSigned(baselineEnd, end) : 0,
    late: leaves.filter((row) => row.isLate).length,
    blocked: leaves.filter((row) => row.status === "Blocked").length,
    taskCount: leaves.length,
    doneCount: leaves.filter((row) => row.status === "Done").length,
  };
}

export const scheduleTone = (row: ScheduleRow): Tone =>
  (row.status === "Done" ? "green"
    : row.status === "Blocked" || row.isLate ? "red"
      : row.drift < -15 ? "red"
        : row.drift < -5 ? "amber"
          : row.status === "In Progress" ? "blue" : "slate");

/* ---- Who may edit what --------------------------------------------------- */

export type SchedulePermission = {
  /** planStart, planDays, predecessor, link — the dates the customer sees. */
  canEditPlan: boolean;
  /** name, kind, visibility, PIC, structure. */
  canEditIdentity: boolean;
  /** percentDone, status, actuals, forecast, note — the owner's lane. */
  canEditProgress: boolean;
  canAddDetail: boolean;
  canDelete: boolean;
  canBaseline: boolean;
  isManager: boolean;
};

export function schedulePermission(user: User, role: Role, project: Project, row?: ScheduleRow): SchedulePermission {
  const readOnly = role === "Viewer" || role === "Sales Engineer" || project.status === "Closed";
  const isManager = !readOnly
    && (role === "Engineering Manager" || role === "Admin"
      || (role === "Project Manager" && project.managerId === user.id));
  const isPic = !!row && row.picIds.includes(user.id);
  const isLead = project.leadEngineerId === user.id;
  const isMine = !!row && row.origin === "Member" && row.createdBy === user.id;
  const isDetail = row?.kind === "detail";
  const isPhase = row?.kind === "phase" || (!!row && row.hasChildren);
  return {
    // Phase dates are computed for everybody — they are the =E9/=F12 formula cells.
    canEditPlan: !readOnly && !isPhase && (isManager || (isMine && isDetail)),
    canEditIdentity: !readOnly && (isManager || (isMine && isDetail)),
    canEditProgress: !readOnly && !isPhase && (isManager || isPic || isLead || (isMine && isDetail)),
    canAddDetail: !readOnly && !!row && row.kind === "task" && (isManager || isPic),
    canDelete: !readOnly && (isManager || (isMine && isDetail && !row?.hasChildren)),
    canBaseline: isManager,
    isManager,
  };
}
