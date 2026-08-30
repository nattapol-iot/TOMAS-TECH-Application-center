"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COST_STRUCTURE, CUSTOMERS, ENGINEERING_ACTIVITIES, ENGINEER_LEVELS, DEPARTMENTS,
  ESTIMATES, EXPENSE_TYPES, EXPENSE_UNITS, INQUIRIES, MODULE_PRESETS, PACKAGE_PRESETS,
  COST_TYPE_LABEL, COST_TYPE_SHORT, QUOTATIONS, RATES, SUPPLIERS, UNITS, USERS, BRANDS,
  type CostItem, type Estimate, type ExpenseLine, type ExpenseType, type ManhourLine,
  type ManhourProvider, type PriceRecord, type SectionStatus, type CostType,
} from "../data";
import {
  categoryTotals, countLevel, departmentEffort, estimateTotals, expenseTotal, formatDate,
  groupByModule, groupByPackage, isGeneratedCode, itemCodePrefix, lineHours, lineManDays,
  lineManhourCost, lineTotal, nextItemCode,
  costTypeEffort, millions, moduleTotal, money, moneyShort, packageTotal, priceAge, providerEffort, rateFor,
  summaryBlocks, type SummaryOverride, type SummaryOverrides,
  revisionDiff, supplierTotals, topCostItems, userName, userOf, validateEstimate,
} from "../calc";
import {
  Badge, Donut, Drawer, EmptyState, Field, HBarList, Icon, Menu, Modal, Panel,
  PageHeader, Person, Pill, Progress, ProgressCell, SearchInput, SummaryTile, Tabs, toneOf,
  type IconName, type Tone,
} from "../ui";
import { PriceSearchModal } from "./PriceSearch";
import { exportXlsx } from "../../../lib/export-xlsx";
import type { ScreenProps } from "../routes";

type WorkspaceTab =
  | "summary" | "cost" | "manhour" | "other" | "assignment" | "validation"
  | "revision" | "compare" | "review";

const SECTION_STATUSES: SectionStatus[] = [
  "Not Started", "In Progress", "Waiting Information", "Waiting Supplier", "Completed", "Reviewed",
];

const blankItem = (categoryCode = "01", module = ""): CostItem => {
  const structure = COST_STRUCTURE.find((c) => c.code === categoryCode) ?? COST_STRUCTURE[0];
  return {
    id: `new-${Math.random().toString(36).slice(2, 8)}`,
    categoryCode: structure.code, category: structure.name, subcategory: structure.subs[0]?.name ?? "",
    module,
    itemCode: "", description: "", brand: "", model: "", specification: "", supplier: "",
    qty: 1, unit: "Set", unitCost: 0, source: "", referenceNo: "", referenceProject: "",
    priceDate: "2026-08-29", remark: "", owner: "u1", status: "In Progress",
  };
};

/* --------------------------------------------------------------------------
   Main modules — the level between a discipline and its individual items.
   A module ("Main Control Box", "In-feed Conveyor") is declared per category so
   it can exist before its first item is typed.
   -------------------------------------------------------------------------- */

export type ModuleDef = { id: string; name: string; categoryCode: string };
export type ModuleForm = { mode: "new" | "rename"; categoryCode: string; name: string };

/** A work package is the man-hour equivalent of a main module. */
export type PackageDef = { id: string; name: string; costType: CostType };
export type PackageForm = { mode: "new" | "rename"; name: string; costType: CostType };

function packagesFromLines(manhours: ManhourLine[], expenses: ExpenseLine[]): PackageDef[] {
  const seen = new Set<string>();
  return [...manhours, ...expenses].reduce<PackageDef[]>((list, line) => {
    if (!line.package || seen.has(line.package)) return list;
    seen.add(line.package);
    return [...list, { id: line.package, name: line.package, costType: line.costType }];
  }, []);
}

/**
 * Work packages to render: declared ones first — so a package created for the
 * site trip exists before its first activity — then anything found only on the
 * lines, and finally unassigned effort.
 */
function packagesInView(estimate: Estimate, packages: PackageDef[]) {
  const found = groupByPackage(estimate.manhours, estimate.expenses);
  const declaredGroups = packages.map((entry) => {
    const group = found.find((candidate) => candidate.name === entry.name);
    return { name: entry.name, costType: entry.costType, manhours: group?.manhours ?? [], expenses: group?.expenses ?? [] };
  });
  const extra = found
    .filter((group) => !packages.some((entry) => entry.name === group.name))
    .map((group) => ({
      ...group,
      costType: (group.manhours[0]?.costType ?? group.expenses[0]?.costType ?? "Engineering") as CostType,
    }));
  return [...declaredGroups, ...extra];
}

/** Seeds the module list from whatever the stored cost items already use. */
function modulesFromItems(items: CostItem[]): ModuleDef[] {
  const seen = new Set<string>();
  return items.reduce<ModuleDef[]>((list, item) => {
    const key = `${item.categoryCode}|${item.module}`;
    if (!item.module || seen.has(key)) return list;
    seen.add(key);
    return [...list, { id: key, name: item.module, categoryCode: item.categoryCode }];
  }, []);
}

/**
 * Modules to render for one category: every declared module (even an empty one
 * that was just created) followed by anything found only on the items,
 * with unassigned items last.
 */
function modulesInCategory(items: CostItem[], modules: ModuleDef[], categoryCode: string) {
  const categoryItems = items.filter((item) => item.categoryCode === categoryCode);
  const found = groupByModule(categoryItems);
  const declared = modules.filter((module) => module.categoryCode === categoryCode);
  const declaredGroups = declared.map((module) => ({
    module: module.name,
    items: found.find((group) => group.module === module.name)?.items ?? [],
  }));
  const undeclared = found.filter((group) => !declared.some((module) => module.name === group.module));
  return [...declaredGroups, ...undeclared];
}

export default function Workspace({ estimateId, initialTab, go, notify }: ScreenProps & { estimateId: string; initialTab?: string }) {
  const base = ESTIMATES.find((e) => e.id === estimateId) ?? ESTIMATES[0];
  const inquiry = INQUIRIES.find((i) => i.no === base.inquiryNo);
  const customer = CUSTOMERS.find((c) => c.id === base.customerId);

  const [items, setItems] = useState<CostItem[]>(base.items);
  const [manhours, setManhours] = useState<ManhourLine[]>(base.manhours);
  const [expenses, setExpenses] = useState<ExpenseLine[]>(base.expenses);
  const [packages, setPackages] = useState<PackageDef[]>(() => packagesFromLines(base.manhours, base.expenses));
  const [activeCostType, setActiveCostType] = useState("all");
  const [packageForm, setPackageForm] = useState<PackageForm | null>(null);
  const [deletePackage, setDeletePackage] = useState<string | null>(null);
  const [quotationTarget, setQuotationTarget] = useState<string | null>(null);
  // Re-counts typed on the summary sheet, keyed by summary line.
  const [summaryOverrides, setSummaryOverrides] = useState<SummaryOverrides>({});
  const [others, setOthers] = useState(base.others);
  const [assignments, setAssignments] = useState(base.assignments);
  const [contingency, setContingency] = useState(base.contingencyRate);
  const [status, setStatus] = useState(base.status);
  const [tab, setTab] = useState<WorkspaceTab>((initialTab as WorkspaceTab) ?? "summary");
  const [dirty, setDirty] = useState(false);

  const [modules, setModules] = useState<ModuleDef[]>(() => modulesFromItems(base.items));
  const [activeCategory, setActiveCategory] = useState("all");
  const [moduleForm, setModuleForm] = useState<ModuleForm | null>(null);
  const [deleteModule, setDeleteModule] = useState<{ categoryCode: string; module: string } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  // Row added inline gets the caret straight away, the way the man-hour table works.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [priceSearch, setPriceSearch] = useState<{ open: boolean; query: string; target?: string }>({ open: false, query: "" });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);

  const estimate: Estimate = useMemo(
    () => ({ ...base, items, manhours, expenses, others, assignments, contingencyRate: contingency, status }),
    [base, items, manhours, expenses, others, assignments, contingency, status],
  );

  const totals = estimateTotals(estimate);
  const validation = validateEstimate(estimate);
  const errors = countLevel(validation, "error");
  const warnings = countLevel(validation, "warning");
  const locked = status === "Approved" || status === "Locked";

  /**
   * Moving a line to another category or module re-issues its item code, but
   * only when the current code was generated — a supplier or customer part
   * number typed by an engineer is never overwritten.
   */
  const patchItem = (id: string, patch: Partial<CostItem>) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      const moved = (patch.categoryCode && patch.categoryCode !== item.categoryCode)
        || (patch.module !== undefined && patch.module !== item.module);
      if (moved && isGeneratedCode(item.itemCode, item.categoryCode, item.module)) {
        next.itemCode = nextItemCode(prev.filter((entry) => entry.id !== id), next.categoryCode, next.module);
      }
      return next;
    }));
    setDirty(true);
  };
  /**
   * Patching effort re-reads the standard rate whenever the level, department
   * or cost type changes — installation work costs more than the same work done
   * in-house, and engineers must never type the rate themselves.
   */
  const patchManhour = (id: string, patch: Partial<ManhourLine>) => {
    setManhours((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      if (patch.level || patch.department || patch.costType) {
        next.dailyRate = rateFor(next.level, next.department, next.costType).daily || next.dailyRate;
      }
      return next;
    }));
    setDirty(true);
  };

  const patchExpense = (id: string, patch: Partial<ExpenseLine>) => {
    setExpenses((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    setDirty(true);
  };

  /**
   * Adds an empty activity into a work package and focuses it. Internal effort
   * is rated from the master; supplier effort starts at zero and waits for the
   * quoted rate, its supplier and its quotation number.
   */
  function addActivity(packageName: string, costType: CostType, provider: ManhourProvider = "Internal") {
    const level = "Middle Engineer";
    const department = "PLC";
    const line: ManhourLine = {
      id: `mh-${Math.random().toString(36).slice(2, 8)}`,
      package: packageName, activity: "System Design", department, level, costType,
      provider, supplier: "", quotationNo: "", priceDate: provider === "Supplier" ? "2026-08-30" : "",
      engineers: 1, manDays: 1, hoursPerDay: 8,
      dailyRate: provider === "Supplier" ? 0 : rateFor(level, department, costType).daily,
      owner: base.ownerId, remark: "",
    };
    setManhours((prev) => [...prev, line]);
    setFocusId(line.id);
    setDirty(true);
  }

  /** Adds a travel / accommodation / per diem line to a work package. */
  function addExpense(packageName: string, costType: CostType) {
    const line: ExpenseLine = {
      id: `ex-${Math.random().toString(36).slice(2, 8)}`,
      package: packageName, type: costType === "Installation" ? "Travel" : "Other",
      description: "", costType, supplier: "", reference: "",
      qty: 1, unit: costType === "Installation" ? "Trip" : "Lot",
      unitCost: 0, owner: base.ownerId, remark: "",
    };
    setExpenses((prev) => [...prev, line]);
    setFocusId(line.id);
    setDirty(true);
  }

  /** Creates a work package, or renames one and moves its lines with it. */
  function savePackage(form: PackageForm, name: string, costType: CostType) {
    const clean = name.trim();
    if (!clean) return;
    if (form.mode === "new") {
      if (!packages.some((entry) => entry.name === clean)) {
        setPackages((prev) => [...prev, { id: clean, name: clean, costType }]);
      }
      setActiveCostType(costType);
      notify(`Work package “${clean}” created — ${costType.toLowerCase()} rates will be applied`);
    } else {
      setPackages((prev) => prev.map((entry) => (entry.name === form.name ? { id: clean, name: clean, costType } : entry)));
      setManhours((prev) => prev.map((line) => (line.package === form.name
        ? { ...line, package: clean, costType, dailyRate: rateFor(line.level, line.department, costType).daily || line.dailyRate }
        : line)));
      setExpenses((prev) => prev.map((line) => (line.package === form.name ? { ...line, package: clean, costType } : line)));
      notify(`Work package renamed to “${clean}”`);
    }
    setPackageForm(null);
    setDirty(true);
  }

  function removePackage(name: string) {
    setPackages((prev) => prev.filter((entry) => entry.name !== name));
    setManhours((prev) => prev.filter((line) => line.package !== name));
    setExpenses((prev) => prev.filter((line) => line.package !== name));
    setDeletePackage(null);
    setDirty(true);
    notify(`Work package “${name}” removed`);
  }

  /** Appends an empty line into a module and focuses its description. */
  function addRow(categoryCode: string, module = "") {
    const row = { ...blankItem(categoryCode, module), itemCode: nextItemCode(items, categoryCode, module) };
    setItems((prev) => [...prev, row]);
    setFocusId(row.id);
    setDirty(true);
  }

  /** Creates a main module, or renames one and moves its items with it. */
  function saveModule(form: ModuleForm, name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (form.mode === "new") {
      const exists = modules.some((module) => module.categoryCode === form.categoryCode && module.name === clean);
      if (!exists) setModules((prev) => [...prev, { id: `${form.categoryCode}|${clean}`, name: clean, categoryCode: form.categoryCode }]);
      setActiveCategory(form.categoryCode);
      notify(`Main module “${clean}” created — add the items it is built from`);
    } else {
      setModules((prev) => prev.map((module) =>
        module.categoryCode === form.categoryCode && module.name === form.name
          ? { ...module, id: `${form.categoryCode}|${clean}`, name: clean }
          : module));
      setItems((prev) => prev.map((item) => {
        if (item.categoryCode !== form.categoryCode || item.module !== form.name) return item;
        return {
          ...item,
          module: clean,
          itemCode: isGeneratedCode(item.itemCode, item.categoryCode, item.module)
            ? item.itemCode.replace(itemCodePrefix(item.categoryCode, item.module), itemCodePrefix(item.categoryCode, clean))
            : item.itemCode,
        };
      }));
      notify(`Module renamed to “${clean}”`);
    }
    setModuleForm(null);
    setDirty(true);
  }

  /** Removes a module together with the items hanging under it. */
  function removeModule(categoryCode: string, module: string) {
    const count = items.filter((item) => item.categoryCode === categoryCode && item.module === module).length;
    setModules((prev) => prev.filter((entry) => !(entry.categoryCode === categoryCode && entry.name === module)));
    setItems((prev) => prev.filter((item) => !(item.categoryCode === categoryCode && item.module === module)));
    setDeleteModule(null);
    setDirty(true);
    notify(`Module “${module}” removed${count ? ` with ${count} item(s)` : ""}`);
  }

  function save() {
    setDirty(false);
    notify(`${base.no} ${base.revision} saved — totals recalculated by the server`);
  }

  /** Exports the four-block summary — the sheet management asks for. */
  function exportSummary() {
    const summary = summaryBlocks(estimate, summaryOverrides);
    const rows: (string | number | null)[][] = [
      ["ESTIMATE COST SUMMARY — INTERNAL ENGINEERING COST"],
      ["Project", "", base.projectName, "Estimate No.", base.no],
      ["Customer", "", customer?.name ?? "", "Revision", base.revision],
      ["Inquiry", "", base.inquiryNo, "Status", status],
      [],
      ["Cost block", "Detail", "Group", "Measure", "", "", "", "", "", "Amount (THB)"],
    ];
    for (const block of summary.blocks) {
      rows.push([block.label, block.note, "", "", "", "", "", "", "", block.total]);
      for (const line of block.lines) {
        rows.push(["", line.detail, line.label, line.measure, "", "", "", "", "", line.total]);
      }
    }
    rows.push([]);
    for (const line of summary.other) rows.push([line.label, line.detail, "", line.measure, "", "", "", "", "", line.total]);
    rows.push([], ["", "", "", "", "", "", "", "TOTAL ESTIMATED COST", "", summary.grandTotal]);
    exportXlsx(rows, base.no + "_" + base.revision + "_Summary.xlsx");
    notify("Cost summary exported to Excel");
  }
  function exportExcel() {
    const rows: (string | number | null)[][] = [
      ["ESTIMATE COST — INTERNAL ENGINEERING COST"],
      ["Project", "", base.projectName, "Estimate No.", base.no],
      ["Customer", "", customer?.name ?? "", "Revision", base.revision],
      ["Inquiry", "", base.inquiryNo, "Status", status],
      [],
      ["No.", "Item Code", "Description", "Supplier", "Brand", "Model", "Price Source", "Unit Cost", "Qty", "Total (THB)", "Unit", "Remark"],
    ];
    items.forEach((item, index) => rows.push([
      index + 1, item.itemCode, item.description, item.supplier, item.brand, item.model,
      item.source, item.unitCost, item.qty, lineTotal(item), item.unit, item.remark,
    ]));
    rows.push([], ["", "", "", "", "", "", "", "Material Cost", "", totals.material]);
    rows.push(["", "", "", "", "", "", "", "Engineering Cost", "", totals.engineering]);
    rows.push(["", "", "", "", "", "", "", "Outsource Cost", "", totals.outsource]);
    rows.push(["", "", "", "", "", "", "", "Transportation", "", totals.transportation]);
    rows.push(["", "", "", "", "", "", "", "Other Cost", "", totals.other + totals.accommodation]);
    rows.push(["", "", "", "", "", "", "", `Contingency ${contingency}%`, "", totals.contingency]);
    rows.push(["", "", "", "", "", "", "", "TOTAL ESTIMATED COST", "", totals.total]);
    exportXlsx(rows, `${base.no}_${base.revision}_EstimateCost.xlsx`);
    notify("Estimate cost exported to Excel");
  }

  function applyPrice(record: PriceRecord) {
    if (priceSearch.target) {
      patchItem(priceSearch.target, {
        unitCost: record.price, supplier: record.supplier, brand: record.brand,
        model: record.model, source: record.source, referenceNo: record.reference,
        referenceProject: record.project, priceDate: record.priceDate,
      });
      notify(`${record.model || record.itemCode} price applied — ${money(record.price)}`);
    } else {
      setItems((prev) => [...prev, {
        ...blankItem(),
        itemCode: record.itemCode, description: record.description, brand: record.brand,
        model: record.model, supplier: record.supplier, unitCost: record.price,
        source: record.source, referenceNo: record.reference, referenceProject: record.project,
        priceDate: record.priceDate, category: record.category.split(" / ")[0],
        categoryCode: COST_STRUCTURE.find((c) => c.name === record.category.split(" / ")[0])?.code ?? "01",
        subcategory: record.category.split(" / ")[1] ?? "",
      }]);
      notify(`${record.model || record.itemCode} added from the price library`);
    }
    setDirty(true);
    setPriceSearch({ open: false, query: "" });
  }

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "estimates" })}>Estimate Cost</button>
        <Icon name="chevronRight" />
        <button type="button" onClick={() => inquiry && go({ name: "inquiry", id: inquiry.id })}>{base.inquiryNo}</button>
        <Icon name="chevronRight" />
        <span>{base.no}</span>
      </div>

      <PageHeader
        eyebrow={`${base.no} · REVISION ${base.revision}`}
        title={base.projectName}
        subtitle={`${customer?.name} · Inquiry ${base.inquiryNo}`}
        meta={
          <>
            <div><span>Estimate owner</span><strong>{userName(base.ownerId)}</strong></div>
            <div><span>Estimate due</span><strong>{formatDate(base.dueDate)}</strong></div>
            <div><span>Status</span><strong><Badge tone={toneOf(status)}>{status}</Badge></strong></div>
            <div><span>Progress</span><strong style={{ minWidth: 120 }}><ProgressCell value={base.progress} /></strong></div>
            {locked ? <div><span>Lock</span><strong className="green-text"><Icon name="lock" /> Approved revision locked</strong></div> : null}
          </>
        }
      />

      <div className="workspace-bar">
        <button className="btn primary" type="button" onClick={save} disabled={locked || !dirty}>
          <Icon name="check" />{dirty ? "Save" : "Saved"}
        </button>
        <button className="btn default" type="button" onClick={() => { setTab("validation"); setValidationOpen(true); }}>
          <Icon name="shield" />Validate
          {errors ? <span className="badge red">{errors}</span> : warnings ? <span className="badge amber">{warnings}</span> : <span className="badge green">OK</span>}
        </button>
        <button className="btn default" type="button" onClick={() => setRevisionOpen(true)}><Icon name="gitBranch" />Create Revision</button>
        <button className="btn default" type="button" onClick={() => setTab("compare")}><Icon name="compare" />Compare Revision</button>
        <span className="spacer" />
        {status === "Engineering Review" ? (
          <>
            <button className="btn warn" type="button" onClick={() => { setStatus("Revision Required"); notify("Revision requested — estimate owner notified"); }}>
              <Icon name="refresh" />Request Revision
            </button>
            <button className="btn success" type="button" onClick={() => { setStatus("Approved"); notify(`${base.no} ${base.revision} approved and locked`); }} disabled={errors > 0}>
              <Icon name="checkCircle" />Approve
            </button>
          </>
        ) : (
          <button className="btn primary" type="button" disabled={locked || errors > 0} onClick={() => { setStatus("Engineering Review"); notify("Submitted for engineering review"); }}>
            <Icon name="send" />Submit Review
          </button>
        )}
        <button className="btn default" type="button" onClick={exportExcel}><Icon name="download" />Export Excel</button>
        <Menu
          label="More"
          items={[
            { label: "Import existing estimate (Excel)", icon: "upload", onClick: () => setImportOpen(true) },
            { label: "Copy from previous estimate", icon: "copy", onClick: () => setCopyOpen(true) },
            { label: "Search price library", icon: "search", onClick: () => setPriceSearch({ open: true, query: "" }) },
            { label: "Create purchase requisition", icon: "package", onClick: () => go({ name: "purchase" }) },
            { label: "Print estimate summary", icon: "file", onClick: () => notify("Estimate summary sent to printer") },
            { label: "Freeze revision", icon: "lock", onClick: () => { setStatus("Locked"); notify("Revision frozen — a new revision is required to edit"); } },
          ]}
        />
      </div>

      {errors > 0 ? (
        <div className="info-strip red">
          <Icon name="alertTriangle" />
          <span><strong>{errors} critical error(s)</strong> must be resolved before this estimate can be approved.</span>
          <span className="spacer" />
          <button className="link-btn" type="button" onClick={() => setTab("validation")}>Open validation<Icon name="arrowRight" /></button>
        </div>
      ) : null}

      <section className="summary-strip">
        <SummaryTile label="Total Material Cost" value={moneyShort(totals.material)} note="Hardware · Software · Electrical · Mechanical · Robot" />
        <SummaryTile label="Total Engineering Cost" value={moneyShort(totals.engineering)} note={`${totals.manDays} MD · engineering ${moneyShort(totals.effortEngineering)} · installation &amp; service ${moneyShort(totals.effortInstallation)}`} />
        <SummaryTile label="Total Outsource Cost" value={moneyShort(totals.outsource)} note="07 Outsource" />
        <SummaryTile label="Total Installation &amp; Service Cost" value={moneyShort(totals.installation)} note={`Installation effort + ${moneyShort(totals.siteExpense)} travel / hotel`} />
        <SummaryTile label="Total Transportation" value={moneyShort(totals.transportation)} note="08 Transportation" />
        <SummaryTile label="Other Cost" value={moneyShort(totals.other + totals.accommodation)} note="09 Accommodation · 10 Other" />
        <SummaryTile label={`Contingency ${contingency}%`} value={moneyShort(totals.contingency)} note="Applied on the cost base" />
        <SummaryTile label="Total Estimated Cost" value={`${moneyShort(totals.total)} THB`} note="Internal cost — no margin" strong />
      </section>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: "Summary" },
          { id: "cost", label: "Cost Items", count: items.length },
          { id: "manhour", label: "Engineering Man-hour", count: manhours.length },
          { id: "other", label: "Other Project Cost", count: others.length },
          { id: "assignment", label: "Assignment", count: assignments.length },
          { id: "validation", label: "Validation", count: errors + warnings },
          { id: "revision", label: "Revision History", count: base.revisions.length },
          { id: "compare", label: "Compare Revision" },
          { id: "review", label: "Engineering Review" },
        ]}
      />

      {tab === "summary" ? (
        <SummaryTab
          estimate={estimate}
          overrides={summaryOverrides}
          locked={locked}
          onOverride={(key, patch) => {
            setSummaryOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
            setDirty(true);
          }}
          onAddLine={(blockKey) => {
            const key = `${blockKey}|manual|${Object.keys(summaryOverrides).length + 1}`;
            setSummaryOverrides((prev) => ({
              ...prev,
              [key]: {
                qty: 1,
                label: "New summary line",
                manual: { blockKey: blockKey as "hardware", detail: "Added in the summary", unitCost: 0 },
              },
            }));
            setDirty(true);
            notify("Summary line added — give it a name and a quantity");
          }}
          onExport={exportSummary}
        />
      ) : null}

      {tab === "cost" ? (
        <CostItemsTab
          items={items} modules={modules} locked={locked}
          activeCategory={activeCategory} onCategory={setActiveCategory}
          onModuleForm={setModuleForm}
          onDeleteModule={(categoryCode, module) => setDeleteModule({ categoryCode, module })}
          onPatch={patchItem}
          onRemove={(id) => { setItems((prev) => prev.filter((item) => item.id !== id)); setDirty(true); }}
          onDuplicate={(id) => {
            const source = items.find((item) => item.id === id);
            if (!source) return;
            setItems((prev) => [...prev, {
              ...source,
              id: `copy-${Date.now()}`,
              itemCode: isGeneratedCode(source.itemCode, source.categoryCode, source.module)
                ? nextItemCode(prev, source.categoryCode, source.module)
                : source.itemCode,
            }]);
            setDirty(true);
            notify("Row duplicated");
          }}
          onAdd={() => setAddOpen(true)}
          onAddRow={addRow}
          focusId={focusId}
          onFocused={() => setFocusId(null)}
          onSearch={(target) => setPriceSearch({ open: true, query: "", target })}
          onImport={() => setImportOpen(true)}
          onCopy={() => setCopyOpen(true)}
          totals={totals}
        />
      ) : null}

      {tab === "manhour" ? (
        <ManhourTab
          estimate={estimate} packages={packages} locked={locked}
          activeCostType={activeCostType} onCostType={setActiveCostType}
          onPatch={patchManhour} onPatchExpense={patchExpense}
          onAddActivity={addActivity} onAddExpense={addExpense}
          onPickQuotation={(lineId) => setQuotationTarget(lineId)}
          focusId={focusId} onFocused={() => setFocusId(null)}
          onPackageForm={setPackageForm}
          onDeletePackage={setDeletePackage}
          onRemove={(id) => { setManhours((prev) => prev.filter((line) => line.id !== id)); setDirty(true); }}
          onRemoveExpense={(id) => { setExpenses((prev) => prev.filter((line) => line.id !== id)); setDirty(true); }}
        />
      ) : null}

      {tab === "other" ? (
        <OtherCostTab
          others={others} contingency={contingency} totals={totals} locked={locked}
          onContingency={(value) => { setContingency(value); setDirty(true); }}
          onPatch={(id, patch) => { setOthers((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line))); setDirty(true); }}
          onAdd={() => { setOthers((prev) => [...prev, { id: `oc-${Date.now()}`, category: "Other Cost", description: "", qty: 1, unit: "Lot", unitCost: 0, remark: "" }]); setDirty(true); }}
          onRemove={(id) => { setOthers((prev) => prev.filter((line) => line.id !== id)); setDirty(true); }}
        />
      ) : null}

      {tab === "assignment" ? (
        <AssignmentTab
          assignments={assignments}
          onPatch={(id, patch) => { setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))); setDirty(true); }}
          notify={notify}
        />
      ) : null}

      {tab === "validation" ? <ValidationTab results={validation} onFix={() => setTab("cost")} /> : null}

      {tab === "revision" ? <RevisionTab estimate={estimate} totals={totals.total} onCreate={() => setRevisionOpen(true)} /> : null}

      {tab === "compare" ? <CompareTab estimate={estimate} /> : null}

      {tab === "review" ? (
        <ReviewTab
          estimate={estimate} totals={totals} validation={validation}
          onApprove={() => { setStatus("Approved"); notify(`${base.no} ${base.revision} approved — revision locked`); }}
          onRequest={() => { setStatus("Revision Required"); notify("Revision requested with reviewer comment"); }}
          onReject={() => { setStatus("Draft"); notify("Estimate rejected and returned to draft"); }}
          disabled={errors > 0}
        />
      ) : null}

      {quotationTarget ? (
        <QuotationPickerModal
          onClose={() => setQuotationTarget(null)}
          onUse={(quotation) => {
            patchManhour(quotationTarget, {
              supplier: quotation.supplier,
              quotationNo: quotation.no,
              priceDate: quotation.receivedDate,
            });
            setQuotationTarget(null);
            notify(`${quotation.no} attached — supplier ${quotation.supplier}`);
          }}
        />
      ) : null}

      {packageForm ? (
        <PackageModal
          form={packageForm}
          onClose={() => setPackageForm(null)}
          onSave={(name, costType) => savePackage(packageForm, name, costType)}
        />
      ) : null}

      {deletePackage ? (
        <Modal
          title={`Delete “${deletePackage}”?`}
          subtitle={`${manhours.filter((line) => line.package === deletePackage).length} activity(ies) and ${expenses.filter((line) => line.package === deletePackage).length} expense line(s) will be removed.`}
          size="sm"
          onClose={() => setDeletePackage(null)}
          footer={
            <>
              <span className="spacer" />
              <button className="btn default" type="button" onClick={() => setDeletePackage(null)}>Cancel</button>
              <button className="btn danger" type="button" onClick={() => removePackage(deletePackage)}>
                <Icon name="trash" />Delete work package
              </button>
            </>
          }
        >
          <div className="info-strip amber">
            <Icon name="alertTriangle" />
            Removing the package also removes the travel and accommodation cost estimated under it.
          </div>
        </Modal>
      ) : null}

      {moduleForm ? (
        <ModuleModal
          form={moduleForm}
          onClose={() => setModuleForm(null)}
          onSave={(name) => saveModule(moduleForm, name)}
        />
      ) : null}

      {deleteModule ? (
        <Modal
          title={`Delete “${deleteModule.module}”?`}
          subtitle={`${items.filter((item) => item.categoryCode === deleteModule.categoryCode && item.module === deleteModule.module).length} item(s) under this module will be removed from the estimate.`}
          size="sm"
          onClose={() => setDeleteModule(null)}
          footer={
            <>
              <span className="spacer" />
              <button className="btn default" type="button" onClick={() => setDeleteModule(null)}>Cancel</button>
              <button className="btn danger" type="button" onClick={() => removeModule(deleteModule.categoryCode, deleteModule.module)}>
                <Icon name="trash" />Delete module
              </button>
            </>
          }
        >
          <div className="info-strip amber">
            <Icon name="alertTriangle" />
            Deleting is recorded in the audit log and can be reversed by creating a new revision from {base.revision}.
          </div>
        </Modal>
      ) : null}

      {addOpen ? (
        <AddCostItemDrawer
          items={items}
          modules={modules}
          onClose={() => setAddOpen(false)}
          onSearchPrice={() => setPriceSearch({ open: true, query: "" })}
          onSave={(item, again) => {
            setItems((prev) => [...prev, item]);
            setDirty(true);
            notify(`${item.description || "Cost item"} added`);
            if (!again) setAddOpen(false);
          }}
        />
      ) : null}

      {priceSearch.open ? (
        <PriceSearchModal
          initialQuery={priceSearch.query}
          onClose={() => setPriceSearch({ open: false, query: "" })}
          onUse={applyPrice}
          onHistory={(record) => { setPriceSearch({ open: false, query: "" }); go({ name: "price-history", id: record.id }); }}
        />
      ) : null}

      {revisionOpen ? (
        <CreateRevisionModal
          estimate={estimate}
          onClose={() => setRevisionOpen(false)}
          onCreate={(reason) => {
            setRevisionOpen(false);
            setStatus("Engineering Input");
            notify(`Revision R03 created — ${reason}. All data cloned from ${base.revision}.`);
          }}
        />
      ) : null}

      {importOpen ? <ImportExcelModal onClose={() => setImportOpen(false)} onImport={(count) => { setImportOpen(false); notify(`${count} rows imported into the estimate workspace`); }} /> : null}

      {copyOpen ? <CopyPreviousModal onClose={() => setCopyOpen(false)} onCopy={(sections) => { setCopyOpen(false); notify(`${sections.length} section(s) copied — prices marked "Reference From Previous Estimate"`); }} /> : null}

      {validationOpen ? (
        <Modal
          title="Estimate validation"
          subtitle={`${countLevel(validation, "pass")} checks passed · ${warnings} warning(s) · ${errors} critical error(s)`}
          size="lg"
          onClose={() => setValidationOpen(false)}
          footer={
            <>
              <span className={errors ? "red-text" : "green-text"}>
                {errors ? "Critical errors must be resolved before approval." : "No critical error — this estimate can be submitted."}
              </span>
              <span className="spacer" />
              <button className="btn default" type="button" onClick={() => setValidationOpen(false)}>Close</button>
              <button className="btn primary" type="button" disabled={errors > 0} onClick={() => { setValidationOpen(false); setStatus("Engineering Review"); notify("Submitted for engineering review"); }}>
                Submit for review
              </button>
            </>
          }
        >
          <ValidationList results={validation} />
        </Modal>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Cost items — the spreadsheet-style editing surface
   ========================================================================== */

function CostItemsTab({
  items, modules, locked, activeCategory, onCategory, onPatch, onRemove, onDuplicate,
  onAdd, onAddRow, focusId, onFocused, onModuleForm, onDeleteModule, onSearch, onImport, onCopy, totals,
}: {
  items: CostItem[];
  modules: ModuleDef[];
  locked: boolean;
  activeCategory: string;
  onCategory: (code: string) => void;
  onPatch: (id: string, patch: Partial<CostItem>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAdd: () => void;
  onAddRow: (categoryCode: string, module: string) => void;
  focusId: string | null;
  onFocused: () => void;
  onModuleForm: (form: ModuleForm) => void;
  onDeleteModule: (categoryCode: string, module: string) => void;
  onSearch: (target?: string) => void;
  onImport: () => void;
  onCopy: () => void;
  totals: ReturnType<typeof estimateTotals>;
}) {
  const countOf = (code: string) => items.filter((item) => item.categoryCode === code).length;
  const modulesOf = (code: string) => modulesInCategory(items, modules, code);

  // Which disciplines get a sub-tab: everything that already carries items or
  // declared modules, so the bar stays short but never hides work.
  const tabCategories = COST_STRUCTURE.filter((category) => countOf(category.code) > 0 || modules.some((m) => m.categoryCode === category.code));
  const visibleCategories = activeCategory === "all" ? tabCategories : COST_STRUCTURE.filter((c) => c.code === activeCategory);
  const visibleItems = activeCategory === "all" ? items : items.filter((item) => item.categoryCode === activeCategory);
  const targetCategory = activeCategory === "all" ? (tabCategories[tabCategories.length - 1]?.code ?? "01") : activeCategory;

  // Row numbering follows what is on screen, derived instead of mutated.
  const orderedIds = visibleCategories.flatMap((category) => modulesOf(category.code).flatMap((group) => group.items.map((item) => item.id)));

  return (
    <Panel
      title="Estimate Cost Table"
      subtitle="Discipline → main module → items · Enter opens a new line in the same module · Total Cost is calculated as Qty × Unit Cost and cannot be typed over"
      actions={
        <>
          <button className="btn default sm" type="button" onClick={() => onSearch(undefined)}><Icon name="search" />Search Price Library</button>
          <button className="btn default sm" type="button" onClick={onImport}><Icon name="upload" />Import Excel</button>
          <button className="btn default sm" type="button" onClick={onCopy}><Icon name="copy" />Copy Previous Estimate</button>
          <button className="btn default sm" type="button" onClick={onAdd} disabled={locked}><Icon name="edit" />Add with details</button>
          <button
            className="btn primary sm"
            type="button"
            disabled={locked}
            onClick={() => onModuleForm({ mode: "new", categoryCode: targetCategory, name: "" })}
          >
            <Icon name="layers" />New Main Module
          </button>
        </>
      }
      flush
    >
      <div className="subtabs" role="tablist" aria-label="Cost discipline">
        <button type="button" role="tab" aria-selected={activeCategory === "all"}
          className={activeCategory === "all" ? "subtab active" : "subtab"} onClick={() => onCategory("all")}>
          All disciplines<em>{items.length}</em>
        </button>
        {COST_STRUCTURE.map((category) => {
          const count = countOf(category.code);
          const declared = modules.filter((m) => m.categoryCode === category.code).length;
          if (!count && !declared) return null;
          return (
            <button
              key={category.code} type="button" role="tab"
              aria-selected={activeCategory === category.code}
              className={activeCategory === category.code ? "subtab active" : "subtab"}
              onClick={() => onCategory(category.code)}
            >
              <span className="pill">{category.code}</span>{category.name}<em>{count}</em>
            </button>
          );
        })}
        <span className="spacer" />
        <button className="btn ghost sm" type="button" disabled={locked}
          onClick={() => onModuleForm({ mode: "new", categoryCode: targetCategory, name: "" })}>
          <Icon name="plus" />Add discipline / module
        </button>
      </div>

      <div className="table-wrap tall">
        <table className="sheet" style={{ minWidth: 2956 }}>
          <thead>
            <tr>
              <th style={{ width: 44 }}>No.</th>
              <th style={{ width: 120 }}>Cost Category</th>
              <th style={{ width: 170 }}>Main Module</th>
              <th style={{ width: 130 }}>Subcategory</th>
              <th style={{ width: 110 }}>Item Code</th>
              <th style={{ width: 250 }}>Description</th>
              <th style={{ width: 110 }}>Brand</th>
              <th style={{ width: 140 }}>Model</th>
              <th style={{ width: 200 }}>Specification</th>
              <th style={{ width: 190 }}>Supplier</th>
              <th className="num" style={{ width: 70 }}>Qty</th>
              <th style={{ width: 80 }}>Unit</th>
              <th className="num" style={{ width: 110 }}>Unit Cost</th>
              <th className="num" style={{ width: 120 }}>Total Cost</th>
              <th style={{ width: 150 }}>Price Source</th>
              <th style={{ width: 120 }}>Reference No.</th>
              <th style={{ width: 150 }}>Reference Project</th>
              <th style={{ width: 110 }}>Price Date</th>
              <th style={{ width: 96 }}>Price Age</th>
              <th style={{ width: 160 }}>Remark</th>
              <th style={{ width: 130 }}>Owner</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 66 }} aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {visibleCategories.flatMap((category) => {
              const categoryItems = items.filter((item) => item.categoryCode === category.code);
              const subtotal = moduleTotal(categoryItems);
              const structure = category;
              const moduleGroups = modulesOf(category.code);

              return [
                <tr className="group-row" key={`g-${category.code}`}>
                  <td colSpan={23}>
                    <div className="row band">
                      <Pill>{category.code}</Pill>
                      <strong>{category.name}</strong>
                      <span style={{ opacity: 0.7 }}>{moduleGroups.filter((g) => g.module).length} modules · {categoryItems.length} items</span>
                      <strong>{money(subtotal)}</strong>
                      <button type="button" className="group-action" disabled={locked}
                        onClick={() => onModuleForm({ mode: "new", categoryCode: category.code, name: "" })}>
                        <Icon name="plus" />New module
                      </button>
                    </div>
                  </td>
                </tr>,
                ...moduleGroups.flatMap((group) => [
                  <tr className="module-row" key={`m-${category.code}-${group.module || "none"}`}>
                    <td colSpan={23}>
                      <div className="row band">
                        <span className="module-bullet"><Icon name="package" /></span>
                        <strong>{group.module || "Unassigned items"}</strong>
                        <span className="muted">{group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
                        <strong className="num">{money(moduleTotal(group.items))}</strong>
                        <button type="button" className="group-action" disabled={locked}
                          onClick={() => onAddRow(category.code, group.module)} title="Add an item to this module">
                          <Icon name="plus" />Add item
                        </button>
                        {group.module ? (
                          <>
                            <button type="button" className="group-action" disabled={locked}
                              onClick={() => onModuleForm({ mode: "rename", categoryCode: category.code, name: group.module })} title="Rename module">
                              <Icon name="edit" />Rename
                            </button>
                            <button type="button" className="group-action danger" disabled={locked}
                              onClick={() => onDeleteModule(category.code, group.module)} title="Delete module and its items">
                              <Icon name="trash" />Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>,
                  ...group.items.map((item) => {
                  const age = priceAge(item.priceDate);
                  // Enter behaves the way it does in the Excel sheet engineers
                  // are used to: it opens a fresh line in the same module.
                  const enterAddsRow = {
                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== "Enter" || locked) return;
                      event.preventDefault();
                      onAddRow(item.categoryCode, item.module);
                    },
                  };
                  return (
                    <tr key={item.id}>
                      <td><span className="cell-text muted">{orderedIds.indexOf(item.id) + 1}</span></td>
                      <td>
                        <select value={item.categoryCode} disabled={locked} onChange={(e) => {
                          const next = COST_STRUCTURE.find((c) => c.code === e.target.value);
                          onPatch(item.id, { categoryCode: e.target.value, category: next?.name ?? item.category, subcategory: next?.subs[0]?.name ?? "", module: "" });
                        }}>
                          {COST_STRUCTURE.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={item.module} disabled={locked} onChange={(e) => onPatch(item.id, { module: e.target.value })}>
                          <option value="">— unassigned —</option>
                          {modulesOf(item.categoryCode).filter((g) => g.module).map((g) => <option key={g.module} value={g.module}>{g.module}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={item.subcategory} disabled={locked} onChange={(e) => onPatch(item.id, { subcategory: e.target.value })}>
                          {(structure?.subs ?? []).map((sub) => <option key={sub.code} value={sub.name}>{sub.name}</option>)}
                        </select>
                      </td>
                      <td><input {...enterAddsRow} value={item.itemCode} disabled={locked} onChange={(e) => onPatch(item.id, { itemCode: e.target.value })} /></td>
                      <td>
                        <input
                          {...enterAddsRow}
                          value={item.description}
                          disabled={locked}
                          placeholder="Describe the item…"
                          onChange={(e) => onPatch(item.id, { description: e.target.value })}
                          ref={(element) => {
                            if (element && focusId === item.id) {
                              element.focus();
                              onFocused();
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input {...enterAddsRow} list="brand-list" value={item.brand} disabled={locked} onChange={(e) => onPatch(item.id, { brand: e.target.value })} />
                      </td>
                      <td><input {...enterAddsRow} value={item.model} disabled={locked} onChange={(e) => onPatch(item.id, { model: e.target.value })} /></td>
                      <td><input {...enterAddsRow} value={item.specification} disabled={locked} onChange={(e) => onPatch(item.id, { specification: e.target.value })} /></td>
                      <td>
                        <input {...enterAddsRow} list="supplier-list" value={item.supplier} disabled={locked} onChange={(e) => onPatch(item.id, { supplier: e.target.value })} />
                      </td>
                      <td><input {...enterAddsRow} className="num" type="number" min="0" step="1" value={item.qty} disabled={locked} onChange={(e) => onPatch(item.id, { qty: Number(e.target.value) })} /></td>
                      <td>
                        <select value={item.unit} disabled={locked} onChange={(e) => onPatch(item.id, { unit: e.target.value })}>
                          {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </td>
                      <td><input {...enterAddsRow} className="num" type="number" min="0" step="100" value={item.unitCost} disabled={locked} onChange={(e) => onPatch(item.id, { unitCost: Number(e.target.value) })} /></td>
                      <td className="computed" title="Calculated by the system — Qty × Unit Cost">{moneyShort(lineTotal(item))}</td>
                      <td>
                        <select value={item.source} disabled={locked} onChange={(e) => onPatch(item.id, { source: e.target.value as CostItem["source"] })}>
                          <option value="">— not set —</option>
                          {["Supplier Quotation", "Previous Estimate", "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price"].map((source) => <option key={source}>{source}</option>)}
                        </select>
                      </td>
                      <td><input {...enterAddsRow} value={item.referenceNo} disabled={locked} onChange={(e) => onPatch(item.id, { referenceNo: e.target.value })} placeholder="—" /></td>
                      <td><input {...enterAddsRow} value={item.referenceProject} disabled={locked} onChange={(e) => onPatch(item.id, { referenceProject: e.target.value })} placeholder="—" /></td>
                      <td><input type="date" value={item.priceDate} disabled={locked} onChange={(e) => onPatch(item.id, { priceDate: e.target.value })} /></td>
                      <td><span className="cell-text"><span className={`age ${age.tone}`}><i />{age.days} d</span></span></td>
                      <td><input {...enterAddsRow} value={item.remark} disabled={locked} onChange={(e) => onPatch(item.id, { remark: e.target.value })} /></td>
                      <td>
                        <select value={item.owner} disabled={locked} onChange={(e) => onPatch(item.id, { owner: e.target.value })}>
                          {USERS.filter((u) => u.role === "Engineer" || u.role === "Project Manager").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={item.status} disabled={locked} onChange={(e) => onPatch(item.id, { status: e.target.value as SectionStatus })}>
                          {SECTION_STATUSES.map((value) => <option key={value}>{value}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="row tight" style={{ padding: "0 4px", flexWrap: "nowrap" }}>
                          <button className="row-action" type="button" title="Find price" onClick={() => onSearch(item.id)}><Icon name="search" /></button>
                          <button className="row-action" type="button" title="Duplicate row" onClick={() => onDuplicate(item.id)} disabled={locked}><Icon name="copy" /></button>
                          <button className="row-action" type="button" title="Delete row" onClick={() => onRemove(item.id)} disabled={locked}><Icon name="trash" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }),
                  <tr className="add-row" key={`a-${category.code}-${group.module || "none"}`}>
                    <td colSpan={23}>
                      <button type="button" className="add-row-btn" onClick={() => onAddRow(category.code, group.module)} disabled={locked}>
                        <span><Icon name="plus" />Add item to {group.module || `${category.code} ${category.name}`}</span>
                      </button>
                    </td>
                  </tr>,
                  ...(group.items.length ? [] : [
                    <tr className="module-empty" key={`e-${category.code}-${group.module}`}>
                      <td colSpan={23}>
                        <span>This module has no item yet — add the equipment, material and service lines it is built from.</span>
                      </td>
                    </tr>,
                  ]),
                ]),
                <tr className="subtotal-row" key={`s-${category.code}`}>
                  <td colSpan={13}>{category.code} {category.name} subtotal</td>
                  <td className="num">{moneyShort(subtotal)}</td>
                  <td colSpan={9} />
                </tr>,
              ];
            })}
            {!visibleItems.length && !visibleCategories.some((category) => modulesOf(category.code).length) ? (
              <tr>
                <td colSpan={23}>
                  <EmptyState
                    icon="layers"
                    title="No main module yet"
                    message="Create a main module such as “Main Control Box”, then add the items it is built from — or import an Excel estimate."
                    action={
                      <button className="btn primary" type="button" disabled={locked}
                        onClick={() => onModuleForm({ mode: "new", categoryCode: targetCategory, name: "" })}>
                        <Icon name="layers" />New Main Module
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <datalist id="brand-list">{BRANDS.map((brand) => <option key={brand} value={brand} />)}</datalist>
      <datalist id="supplier-list">{SUPPLIERS.map((supplier) => <option key={supplier.id} value={supplier.name} />)}</datalist>

      <div className="sticky-foot">
        {activeCategory === "all"
          ? categoryTotals(items).slice(0, 5).map((entry) => (
            <div className="foot-item" key={entry.code}>
              <span>{entry.code} {entry.name}</span>
              <strong>{moneyShort(entry.total)}</strong>
            </div>
          ))
          : modulesOf(activeCategory).slice(0, 5).map((group) => (
            <div className="foot-item" key={group.module || "none"}>
              <span>{group.module || "Unassigned"}</span>
              <strong>{moneyShort(moduleTotal(group.items))}</strong>
            </div>
          ))}
        <div className="foot-total">
          <span>{activeCategory === "all" ? "Material + all cost items" : `${activeCategory} subtotal`}</span>
          <strong>{moneyShort(moduleTotal(visibleItems))} THB</strong>
        </div>
        <div className="foot-total">
          <span>Total estimated cost</span>
          <strong>{moneyShort(totals.total)} THB</strong>
        </div>
      </div>
    </Panel>
  );
}

/* ==========================================================================
   Summary — the whole estimate in four figures
   ========================================================================== */

const BLOCK_TONE: Record<string, Tone> = {
  hardware: "blue",
  software: "violet",
  engineering: "green",
  installation: "amber",
};

const BLOCK_ICON: Record<string, IconName> = {
  hardware: "package",
  software: "cpu",
  engineering: "users",
  installation: "truck",
};

function SummaryTab({ estimate, overrides, onOverride, onAddLine, locked, onExport }: {
  estimate: Estimate;
  overrides: SummaryOverrides;
  onOverride: (key: string, patch: SummaryOverride) => void;
  onAddLine: (blockKey: string) => void;
  locked: boolean;
  onExport: () => void;
}) {
  const summary = summaryBlocks(estimate, overrides);
  const share = (value: number) => (summary.grandTotal ? Math.round((value / summary.grandTotal) * 100) : 0);

  return (
    <>
      <section className="summary-blocks">
        {summary.blocks.map((block) => (
          <article className={`summary-block ${BLOCK_TONE[block.key]}`} key={block.key}>
            <div className="summary-block-head">
              <span className="summary-block-icon"><Icon name={BLOCK_ICON[block.key]} /></span>
              <span className="summary-block-label">{block.label}</span>
            </div>
            <strong>{moneyShort(block.total)}<em>THB</em></strong>
            <Progress value={share(block.total)} tone={BLOCK_TONE[block.key]} />
            <div className="summary-block-foot">
              <span>{share(block.total)}% of estimate</span>
              <span>{block.lines.length} group(s)</span>
            </div>
            <p>{block.note}</p>
          </article>
        ))}
      </section>

      <section className="grid-main">
        <Panel
          title="Estimate cost summary"
          subtitle="Four main blocks, plus everything that belongs to none of them"
          actions={<button className="btn default sm" type="button" onClick={onExport}><Icon name="download" />Export summary</button>}
          flush
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cost block</th><th>What it collects</th><th className="num">Share</th><th className="num">Amount (THB)</th></tr>
              </thead>
              <tbody>
                {summary.blocks.map((block) => (
                  <tr key={block.key}>
                    <td><Badge tone={BLOCK_TONE[block.key]}>{block.label}</Badge></td>
                    <td className="muted">{block.note}</td>
                    <td className="num muted">{share(block.total)}%</td>
                    <td className="num"><strong>{moneyShort(block.total)}</strong></td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td colSpan={2}>Four main blocks</td>
                  <td className="num">{share(summary.blockTotal)}%</td>
                  <td className="num">{moneyShort(summary.blockTotal)}</td>
                </tr>
                {summary.other.map((line) => (
                  <tr key={line.label}>
                    <td>{line.label}</td>
                    <td className="muted">{line.detail}</td>
                    <td className="num muted">{share(line.total)}%</td>
                    <td className="num">{moneyShort(line.total)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td colSpan={2}>Other project cost and contingency</td>
                  <td className="num">{share(summary.otherTotal)}%</td>
                  <td className="num">{moneyShort(summary.otherTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="sticky-foot">
            <div className="foot-item"><span>Hardware</span><strong>{moneyShort(summary.blocks[0].total)}</strong></div>
            <div className="foot-item"><span>Software</span><strong>{moneyShort(summary.blocks[1].total)}</strong></div>
            <div className="foot-item"><span>Engineering / Service</span><strong>{moneyShort(summary.blocks[2].total)}</strong></div>
            <div className="foot-item"><span>Installation</span><strong>{moneyShort(summary.blocks[3].total)}</strong></div>
            <div className="foot-total">
              <span>Total estimated cost</span>
              <strong>{moneyShort(summary.grandTotal)} THB</strong>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Share of the estimate">
            <Donut
              data={[
                ...summary.blocks.map((block) => ({ label: block.label, value: block.total })),
                ...(summary.otherTotal ? [{ label: "Other project cost", value: summary.otherTotal }] : []),
              ]}
              centerLabel="Total cost"
              centerValue={millions(summary.grandTotal)}
              format={(value) => moneyShort(value)}
            />
          </Panel>
          <Panel title="Reconciliation" subtitle="What the cost tabs rolled up, and what the summary re-counted">
            <dl className="def-list one">
              <div><dt>Material (hardware + software)</dt><dd>{money(summary.blocks[0].total + summary.blocks[1].total)}</dd></div>
              <div><dt>Man-hour and site expense</dt><dd>{money(summary.blocks[2].total + summary.blocks[3].total)}</dd></div>
              <div><dt>Other project cost and contingency</dt><dd>{money(summary.otherTotal)}</dd></div>
              <div><dt>Rolled up from the cost tabs</dt><dd>{money(summary.rolledUpTotal)}</dd></div>
              <div><dt>Adjusted in this summary</dt><dd className={summary.adjusted ? "amber-text" : "muted"}>{summary.adjusted >= 0 ? "+" : "−"}{money(Math.abs(summary.adjusted))}</dd></div>
              <div><dt>Summary total</dt><dd><strong>{money(summary.grandTotal)}</strong></dd></div>
            </dl>
            <div className={summary.adjusted === 0 ? "info-strip green" : "info-strip amber"} style={{ marginTop: 12 }}>
              <Icon name={summary.adjusted === 0 ? "checkCircle" : "alertTriangle"} />
              {summary.adjusted === 0
                ? "Every line is counted once — the summary matches the cost tabs and the header total."
                : `Quantities were re-counted here, so the summary is ${money(Math.abs(summary.adjusted))} ${summary.adjusted > 0 ? "above" : "below"} the cost tabs (header total ${money(summary.totals.total)}).`}
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid-2">
        {summary.blocks.map((block) => (
          <Panel key={block.key} title={block.label} subtitle={block.note} flush>
            {block.lines.length ? (
              <div className="table-wrap">
                <table className="sheet" style={{ minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 210 }}>{block.key === "hardware" || block.key === "software" ? "Main module" : block.key === "engineering" ? "Department" : "Work package"}</th>
                      <th style={{ width: 180 }}>{block.key === "hardware" || block.key === "software" ? "Cost category" : "Content"}</th>
                      <th className="num" style={{ width: 120 }}>Cost / unit</th>
                      <th className="num" style={{ width: 74 }}>Qty</th>
                      <th style={{ width: 92 }}>Unit</th>
                      <th className="num" style={{ width: 130 }}>Total (THB)</th>
                      <th style={{ width: 170 }}>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.lines.map((line) => (
                      <tr key={line.key}>
                        <td>
                          <input value={line.label} disabled={locked} onChange={(event) => onOverride(line.key, { label: event.target.value })} />
                        </td>
                        <td>
                          <span className="cell-text muted">{line.detail}{line.measure ? ` · ${line.measure}` : ""}</span>
                        </td>
                        <td className="computed" title="Rolled up from the cost tabs — the cost of one set">{moneyShort(line.unitCost)}</td>
                        <td>
                          <input className="num" type="number" min="0" step="1" value={line.qty} disabled={locked}
                            onChange={(event) => onOverride(line.key, { qty: Number(event.target.value) })} />
                        </td>
                        <td>
                          <select value={line.unit} disabled={locked} onChange={(event) => onOverride(line.key, { unit: event.target.value })}>
                            {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                          </select>
                        </td>
                        <td className={line.qty === 1 ? "computed" : "computed amber-text"}>{moneyShort(line.total)}</td>
                        <td>
                          <input value={line.remark} disabled={locked} placeholder={line.qty === 1 ? "" : `Re-counted ×${line.qty}`}
                            onChange={(event) => onOverride(line.key, { remark: event.target.value })} />
                        </td>
                      </tr>
                    ))}
                    <tr className="add-row">
                      <td colSpan={7}>
                        <button type="button" className="add-row-btn" disabled={locked} onClick={() => onAddLine(block.key)}>
                          <span><Icon name="plus" />Add a line to {block.label}</span>
                        </button>
                      </td>
                    </tr>
                    <tr className="subtotal-row">
                      <td colSpan={5}>
                        {block.label} total
                        {block.total !== block.rolledUp ? ` · rolled up ${moneyShort(block.rolledUp)}, re-counted here` : ""}
                      </td>
                      <td className="num">{moneyShort(block.total)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="table" title={`No ${block.label.toLowerCase()} yet`} message="Lines added in the cost items or man-hour tab appear here automatically." />
            )}
          </Panel>
        ))}
      </section>
    </>
  );
}

/* ==========================================================================
   Engineering man-hour
   ========================================================================== */

function ManhourTab({
  estimate, packages, locked, activeCostType, onCostType, onPatch, onPatchExpense,
  onAddActivity, onAddExpense, onPickQuotation, onRemove, onRemoveExpense, focusId, onFocused,
  onPackageForm, onDeletePackage,
}: {
  estimate: Estimate;
  packages: PackageDef[];
  locked: boolean;
  activeCostType: string;
  onCostType: (costType: string) => void;
  onPatch: (id: string, patch: Partial<ManhourLine>) => void;
  onPatchExpense: (id: string, patch: Partial<ExpenseLine>) => void;
  onAddActivity: (packageName: string, costType: CostType, provider?: ManhourProvider) => void;
  onPickQuotation: (lineId: string) => void;
  onAddExpense: (packageName: string, costType: CostType) => void;
  onRemove: (id: string) => void;
  onRemoveExpense: (id: string) => void;
  focusId: string | null;
  onFocused: () => void;
  onPackageForm: (form: PackageForm) => void;
  onDeletePackage: (name: string) => void;
}) {
  const effort = departmentEffort(estimate);
  const totals = estimateTotals(estimate);
  const byCostType = costTypeEffort(estimate);

  const groups = packagesInView(estimate, packages);
  const visible = activeCostType === "all"
    ? groups
    : groups.filter((group) => group.costType === activeCostType);

  const countOf = (costType: string) => (costType === "all"
    ? estimate.manhours.length + estimate.expenses.length
    : estimate.manhours.filter((line) => line.costType === costType).length
      + estimate.expenses.filter((line) => line.costType === costType).length);

  const orderedIds = visible.flatMap((group) => [...group.manhours.map((l) => l.id), ...group.expenses.map((l) => l.id)]);
  const visibleManhours = visible.flatMap((group) => group.manhours);
  const visibleExpenses = visible.flatMap((group) => group.expenses);
  const visibleCost = visibleManhours.reduce((sum, line) => sum + lineManhourCost(line), 0)
    + visibleExpenses.reduce((sum, line) => sum + expenseTotal(line), 0);

  const expenseByType = EXPENSE_TYPES
    .map((type) => ({ label: type, value: estimate.expenses.filter((line) => line.type === type).reduce((sum, line) => sum + expenseTotal(line), 0) }))
    .filter((entry) => entry.value > 0);

  return (
    <>
      <Panel
        title="Engineering Man-hour & Site Expense"
        subtitle="Work package → activity → cost · engineering and installation work are rated differently, and man-hour bought from a supplier carries its quotation"
        actions={
          <>
            <button className="btn default sm" type="button" disabled={locked}
              onClick={() => onAddActivity(visible[0]?.name ?? "", (visible[0]?.costType ?? "Engineering") as CostType)}>
              <Icon name="plus" />Add activity
            </button>
            <button className="btn primary sm" type="button" disabled={locked}
              onClick={() => onPackageForm({ mode: "new", name: "", costType: activeCostType === "Installation" ? "Installation" : "Engineering" })}>
              <Icon name="layers" />New Work Package
            </button>
          </>
        }
        flush
      >
        <div className="subtabs" role="tablist" aria-label="Cost type">
          {[
            { id: "all", label: "All work" },
            { id: "Engineering", label: COST_TYPE_LABEL.Engineering },
            { id: "Installation", label: COST_TYPE_LABEL.Installation },
          ].map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeCostType === tab.id}
              className={activeCostType === tab.id ? "subtab active" : "subtab"} onClick={() => onCostType(tab.id)}>
              {tab.id !== "all" ? <Icon name={tab.id === "Installation" ? "truck" : "cpu"} /> : null}
              {tab.label}<em>{countOf(tab.id)}</em>
            </button>
          ))}
          <span className="spacer" />
          <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
            Engineering {moneyShort(totals.effortEngineering)} · Installation &amp; service {moneyShort(totals.effortInstallation)} · Supplier {moneyShort(totals.supplierManhour)} · Expense {moneyShort(totals.siteExpense)} THB
          </span>
        </div>

        <div className="table-wrap tall">
          <table className="sheet" style={{ minWidth: 2360 }}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>No.</th>
                <th style={{ width: 130 }}>Type</th>
                <th style={{ width: 250 }}>Activity / Description</th>
                <th style={{ width: 130 }}>Department</th>
                <th style={{ width: 150 }}>Engineer Level</th>
                <th style={{ width: 140 }}>Cost Type</th>
                <th style={{ width: 190 }}>Supplier</th>
                <th style={{ width: 150 }}>Quotation No.</th>
                <th className="num" style={{ width: 80 }}>Qty</th>
                <th style={{ width: 110 }}>Unit</th>
                <th className="num" style={{ width: 90 }}>Man-days</th>
                <th className="num" style={{ width: 95 }}>Hours / Day</th>
                <th className="num" style={{ width: 120 }}>Rate</th>
                <th className="num" style={{ width: 100 }}>Man-hours</th>
                <th className="num" style={{ width: 130 }}>Cost</th>
                <th style={{ width: 150 }}>Owner</th>
                <th style={{ width: 180 }}>Remark</th>
                <th style={{ width: 52 }} aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {visible.flatMap((group) => [
                <tr className="module-row" key={`p-${group.name}`}>
                  <td colSpan={18}>
                    <div className="row band">
                      <span className="module-bullet"><Icon name={group.costType === "Installation" ? "truck" : "cpu"} /></span>
                      <strong>{group.name || "Unassigned effort"}</strong>
                      <Badge tone={group.costType === "Installation" ? "amber" : "blue"}>{COST_TYPE_SHORT[group.costType]}</Badge>
                      <span className="muted">
                        {group.manhours.reduce((sum, line) => sum + lineManDays(line), 0)} MD
                        {group.expenses.length ? ` · ${group.expenses.length} expense` : ""}
                      </span>
                      <strong className="num">{money(packageTotal(group))}</strong>
                      <button type="button" className="group-action" disabled={locked}
                        onClick={() => onAddActivity(group.name, group.costType)}>
                        <Icon name="plus" />Add activity
                      </button>
                      <button type="button" className="group-action" disabled={locked}
                        onClick={() => onAddActivity(group.name, group.costType, "Supplier")}>
                        <Icon name="quote" />Supplier man-hour
                      </button>
                      <button type="button" className="group-action" disabled={locked}
                        onClick={() => onAddExpense(group.name, group.costType)}>
                        <Icon name="truck" />Add expense
                      </button>
                      {group.name ? (
                        <>
                          <button type="button" className="group-action" disabled={locked}
                            onClick={() => onPackageForm({ mode: "rename", name: group.name, costType: group.costType })}>
                            <Icon name="edit" />Rename
                          </button>
                          <button type="button" className="group-action danger" disabled={locked}
                            onClick={() => onDeletePackage(group.name)}>
                            <Icon name="trash" />Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>,

                ...group.manhours.map((line) => {
                  const master = rateFor(line.level, line.department, line.costType);
                  const offRate = line.provider === "Internal" && master.daily !== line.dailyRate;
                  const enterAddsRow = {
                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== "Enter" || locked) return;
                      event.preventDefault();
                      onAddActivity(group.name, line.costType);
                    },
                  };
                  return (
                    <tr key={line.id}>
                      <td><span className="cell-text muted">{orderedIds.indexOf(line.id) + 1}</span></td>
                      <td>
                        <select value={line.provider} disabled={locked} onChange={(e) => onPatch(line.id, { provider: e.target.value as ManhourProvider })}>
                          <option value="Internal">Own engineer</option>
                          <option value="Supplier">Supplier MH</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={line.activity}
                          disabled={locked}
                          onChange={(e) => onPatch(line.id, { activity: e.target.value })}
                          ref={(element) => {
                            if (element && focusId === line.id) {
                              element.focus();
                              onFocused();
                            }
                          }}
                        >
                          {ENGINEERING_ACTIVITIES.map((activity) => <option key={activity}>{activity}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={line.department} disabled={locked} onChange={(e) => onPatch(line.id, { department: e.target.value })}>
                          {DEPARTMENTS.map((department) => <option key={department}>{department}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={line.level} disabled={locked} onChange={(e) => onPatch(line.id, { level: e.target.value })}>
                          {ENGINEER_LEVELS.map((level) => <option key={level}>{level}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={line.costType} disabled={locked} onChange={(e) => onPatch(line.id, { costType: e.target.value as CostType })}>
                          <option value="Engineering">{COST_TYPE_LABEL.Engineering}</option>
                          <option value="Installation">{COST_TYPE_LABEL.Installation}</option>
                        </select>
                      </td>
                      <td>
                        {line.provider === "Supplier" ? (
                          <select value={line.supplier} disabled={locked} onChange={(e) => onPatch(line.id, { supplier: e.target.value })}>
                            <option value="">— select supplier —</option>
                            {SUPPLIERS.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}
                          </select>
                        ) : <span className="cell-text muted">TOMAS TECH</span>}
                      </td>
                      <td>
                        {line.provider === "Supplier" ? (
                          <div className="quote-cell">
                            <input
                              {...enterAddsRow}
                              list="quotation-list"
                              value={line.quotationNo}
                              disabled={locked}
                              placeholder="Attach SQ…"
                              onChange={(e) => onPatch(line.id, { quotationNo: e.target.value })}
                            />
                            <button className="row-action" type="button" title="Pick a supplier quotation"
                              onClick={() => onPickQuotation(line.id)} disabled={locked}>
                              <Icon name="quote" />
                            </button>
                          </div>
                        ) : <span className="cell-text muted">—</span>}
                      </td>
                      <td><input {...enterAddsRow} className="num" type="number" min="1" value={line.engineers} disabled={locked} onChange={(e) => onPatch(line.id, { engineers: Number(e.target.value) })} /></td>
                      <td><span className="cell-text muted">{line.provider === "Supplier" ? "Man" : "Engineer"}</span></td>
                      <td><input {...enterAddsRow} className="num" type="number" min="0" step="0.5" value={line.manDays} disabled={locked} onChange={(e) => onPatch(line.id, { manDays: Number(e.target.value) })} /></td>
                      <td><input {...enterAddsRow} className="num" type="number" min="1" max="12" value={line.hoursPerDay} disabled={locked} onChange={(e) => onPatch(line.id, { hoursPerDay: Number(e.target.value) })} /></td>
                      {line.provider === "Supplier" ? (
                        <td title="Quoted rate from the supplier quotation">
                          <input {...enterAddsRow} className="num" type="number" min="0" step="100" value={line.dailyRate}
                            disabled={locked} onChange={(e) => onPatch(line.id, { dailyRate: Number(e.target.value) })} />
                        </td>
                      ) : (
                        <td className="computed" title={`${line.costType} rate for ${line.level} — from the Engineering Rate Master`}>
                          {offRate ? <span className="red-text">{moneyShort(line.dailyRate)}</span> : moneyShort(line.dailyRate)}
                        </td>
                      )}
                      <td className="computed">{lineHours(line)} HR</td>
                      <td className="computed">{moneyShort(lineManhourCost(line))}</td>
                      <td>
                        <select value={line.owner} disabled={locked} onChange={(e) => onPatch(line.id, { owner: e.target.value })}>
                          {USERS.filter((u) => u.role === "Engineer" || u.role === "Project Manager").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </td>
                      <td><input {...enterAddsRow} value={line.remark} disabled={locked} onChange={(e) => onPatch(line.id, { remark: e.target.value })} /></td>
                      <td>
                        <button className="row-action" type="button" onClick={() => onRemove(line.id)} disabled={locked} aria-label="Remove activity"><Icon name="trash" /></button>
                      </td>
                    </tr>
                  );
                }),

                ...group.expenses.map((line) => {
                  const enterAddsRow = {
                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== "Enter" || locked) return;
                      event.preventDefault();
                      onAddExpense(group.name, line.costType);
                    },
                  };
                  return (
                    <tr key={line.id} className="expense-row">
                      <td><span className="cell-text muted">{orderedIds.indexOf(line.id) + 1}</span></td>
                      <td>
                        <select value={line.type} disabled={locked} onChange={(e) => onPatchExpense(line.id, { type: e.target.value as ExpenseType })}>
                          {EXPENSE_TYPES.map((type) => <option key={type}>{type}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          {...enterAddsRow}
                          value={line.description}
                          disabled={locked}
                          placeholder="e.g. Hotel near site, 2 rooms x 5 nights"
                          onChange={(e) => onPatchExpense(line.id, { description: e.target.value })}
                          ref={(element) => {
                            if (element && focusId === line.id) {
                              element.focus();
                              onFocused();
                            }
                          }}
                        />
                      </td>
                      <td><span className="cell-text muted">—</span></td>
                      <td><span className="cell-text muted">—</span></td>
                      <td>
                        <select value={line.costType} disabled={locked} onChange={(e) => onPatchExpense(line.id, { costType: e.target.value as CostType })}>
                          <option value="Engineering">{COST_TYPE_LABEL.Engineering}</option>
                          <option value="Installation">{COST_TYPE_LABEL.Installation}</option>
                        </select>
                      </td>
                      <td>
                        <input {...enterAddsRow} list="supplier-list" value={line.supplier} disabled={locked}
                          placeholder="Vendor" onChange={(e) => onPatchExpense(line.id, { supplier: e.target.value })} />
                      </td>
                      <td>
                        <input {...enterAddsRow} list="quotation-list" value={line.reference} disabled={locked}
                          placeholder="—" onChange={(e) => onPatchExpense(line.id, { reference: e.target.value })} />
                      </td>
                      <td><input {...enterAddsRow} className="num" type="number" min="0" value={line.qty} disabled={locked} onChange={(e) => onPatchExpense(line.id, { qty: Number(e.target.value) })} /></td>
                      <td>
                        <select value={line.unit} disabled={locked} onChange={(e) => onPatchExpense(line.id, { unit: e.target.value })}>
                          {EXPENSE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </td>
                      <td><span className="cell-text muted">—</span></td>
                      <td><span className="cell-text muted">—</span></td>
                      <td><input {...enterAddsRow} className="num" type="number" min="0" step="100" value={line.unitCost} disabled={locked} onChange={(e) => onPatchExpense(line.id, { unitCost: Number(e.target.value) })} /></td>
                      <td><span className="cell-text muted">—</span></td>
                      <td className="computed" title="Calculated by the system — Qty × Unit Cost">{moneyShort(expenseTotal(line))}</td>
                      <td>
                        <select value={line.owner} disabled={locked} onChange={(e) => onPatchExpense(line.id, { owner: e.target.value })}>
                          {USERS.filter((u) => u.role === "Engineer" || u.role === "Project Manager").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </td>
                      <td><input {...enterAddsRow} value={line.remark} disabled={locked} onChange={(e) => onPatchExpense(line.id, { remark: e.target.value })} /></td>
                      <td>
                        <button className="row-action" type="button" onClick={() => onRemoveExpense(line.id)} disabled={locked} aria-label="Remove expense"><Icon name="trash" /></button>
                      </td>
                    </tr>
                  );
                }),

                <tr className="add-row" key={`a-${group.name}`}>
                  <td colSpan={18}>
                    <button type="button" className="add-row-btn" onClick={() => onAddActivity(group.name, group.costType)} disabled={locked}>
                      <span><Icon name="plus" />Add activity to {group.name || "this package"}</span>
                    </button>
                  </td>
                </tr>,
                <tr className="add-row" key={`ax-${group.name}`}>
                  <td colSpan={18}>
                    <button type="button" className="add-row-btn expense" onClick={() => onAddExpense(group.name, group.costType)} disabled={locked}>
                      <span><Icon name="truck" />Add travel, accommodation or other expense to {group.name || "this package"}</span>
                    </button>
                  </td>
                </tr>,
                ...(group.manhours.length || group.expenses.length ? [] : [
                  <tr className="module-empty" key={`e-${group.name}`}>
                    <td colSpan={18}><span>This work package is empty — add the activities and the travel or accommodation cost they need.</span></td>
                  </tr>,
                ]),
                <tr className="subtotal-row" key={`s-${group.name}`}>
                  <td colSpan={14}>{group.name || "Unassigned effort"} subtotal</td>
                  <td className="num">{moneyShort(packageTotal(group))}</td>
                  <td colSpan={3} />
                </tr>,
              ])}
              {!visible.length ? (
                <tr>
                  <td colSpan={18}>
                    <EmptyState
                      icon="layers"
                      title="No work package yet"
                      message="Create a work package such as “Site Installation”, then add its activities and the travel and accommodation cost that go with them."
                      action={
                        <button className="btn primary" type="button" disabled={locked}
                          onClick={() => onPackageForm({ mode: "new", name: "", costType: "Engineering" })}>
                          <Icon name="layers" />New Work Package
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <datalist id="quotation-list">
          {QUOTATIONS.map((quotation) => <option key={quotation.id} value={quotation.no}>{quotation.supplier} · {moneyShort(quotation.amount)} THB</option>)}
        </datalist>
        <datalist id="supplier-list-mh">{SUPPLIERS.map((supplier) => <option key={supplier.id} value={supplier.name} />)}</datalist>

        <div className="sticky-foot">
          <div className="foot-item"><span>Engineering cost</span><strong>{moneyShort(totals.effortEngineering)}</strong></div>
          <div className="foot-item"><span>Installation &amp; service</span><strong>{moneyShort(totals.effortInstallation)}</strong></div>
          <div className="foot-item"><span>Supplier man-hour</span><strong>{moneyShort(totals.supplierManhour)}</strong></div>
          <div className="foot-item"><span>Travel / hotel / per diem</span><strong>{moneyShort(totals.siteExpense)}</strong></div>
          <div className="foot-item"><span>Man-days</span><strong>{totals.manDays} MD</strong></div>
          <div className="foot-item"><span>Man-hours</span><strong>{totals.manHours} HR</strong></div>
          <div className="foot-total">
            <span>{activeCostType === "all" ? "Shown" : activeCostType} subtotal</span>
            <strong>{moneyShort(visibleCost)} THB</strong>
          </div>
          <div className="foot-total">
            <span>Engineering + site expense</span>
            <strong>{moneyShort(totals.engineering + totals.siteExpense)} THB</strong>
          </div>
        </div>
      </Panel>

      <div style={{ height: 14 }} />

      <section className="grid-3">
        <Panel title="Engineering vs Installation &amp; Service cost" subtitle="Same engineer, different standard rate" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cost type</th><th className="num">Man-days</th><th className="num">Man-hours</th>
                  <th className="num">Effort cost</th><th className="num">of which supplier</th><th className="num">Expense</th>
                </tr>
              </thead>
              <tbody>
                {byCostType.map((row) => (
                  <tr key={row.costType}>
                    <td><Badge tone={row.costType === "Installation" ? "amber" : "blue"}>{COST_TYPE_LABEL[row.costType]}</Badge></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">{row.manHours} HR</td>
                    <td className="num">{moneyShort(row.cost)}</td>
                    <td className="num">{row.supplier ? moneyShort(row.supplier) : "—"}</td>
                    <td className="num">{row.expense ? moneyShort(row.expense) : "—"}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total</td>
                  <td className="num">{totals.manDays} MD</td>
                  <td className="num">{totals.manHours} HR</td>
                  <td className="num">{moneyShort(totals.engineering)}</td>
                  <td className="num">{moneyShort(totals.supplierManhour)}</td>
                  <td className="num">{moneyShort(totals.siteExpense)}</td>
                </tr>
                {providerEffort(estimate).map((row) => (
                  <tr key={row.provider}>
                    <td><Badge tone={row.provider === "Supplier" ? "violet" : "slate"}>{row.provider === "Supplier" ? "Supplier man-hour" : "Own engineers"}</Badge></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">—</td>
                    <td className="num">{moneyShort(row.cost)}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Engineering Cost Summary" subtitle="By department" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Department</th><th className="num">Man-days</th><th className="num">Man-hours</th><th className="num">Estimated Cost</th></tr>
              </thead>
              <tbody>
                {effort.map((row) => (
                  <tr key={row.department}>
                    <td><strong>{row.department}</strong></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">{row.manHours} HR</td>
                    <td className="num">{moneyShort(row.cost)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total</td>
                  <td className="num">{totals.manDays} MD</td>
                  <td className="num">{totals.manHours} HR</td>
                  <td className="num">{money(totals.engineering)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Site expense by type" subtitle="Reported under transportation, accommodation and other cost">
          {expenseByType.length ? (
            <HBarList data={expenseByType} format={(value) => moneyShort(value)} />
          ) : (
            <EmptyState icon="truck" title="No site expense" message="Add travel, accommodation or per diem to an on-site work package." />
          )}
        </Panel>
      </section>
    </>
  );
}

/* ==========================================================================
   Other project cost
   ========================================================================== */

function OtherCostTab({ others, contingency, totals, locked, onContingency, onPatch, onAdd, onRemove }: {
  others: Estimate["others"]; contingency: number; totals: ReturnType<typeof estimateTotals>; locked: boolean;
  onContingency: (value: number) => void;
  onPatch: (id: string, patch: Partial<Estimate["others"][number]>) => void;
  onAdd: () => void; onRemove: (id: string) => void;
}) {
  return (
    <section className="grid-main">
      <Panel
        title="Outsource & Other Project Cost"
        subtitle="Outsource service, transportation, accommodation and other project cost"
        actions={<button className="btn primary sm" type="button" onClick={onAdd} disabled={locked}><Icon name="plus" />Add line</button>}
        flush
      >
        <div className="table-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Category</th>
                <th style={{ width: 300 }}>Description</th>
                <th className="num" style={{ width: 80 }}>Qty</th>
                <th style={{ width: 90 }}>Unit</th>
                <th className="num" style={{ width: 120 }}>Unit Cost</th>
                <th className="num" style={{ width: 130 }}>Total Cost</th>
                <th style={{ width: 200 }}>Remark</th>
                <th style={{ width: 50 }} aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {others.map((line) => (
                <tr key={line.id}>
                  <td>
                    <select value={line.category} disabled={locked} onChange={(e) => onPatch(line.id, { category: e.target.value })}>
                      {["Outsource", "Transportation", "Accommodation", "Other Cost"].map((category) => <option key={category}>{category}</option>)}
                    </select>
                  </td>
                  <td><input value={line.description} disabled={locked} onChange={(e) => onPatch(line.id, { description: e.target.value })} /></td>
                  <td><input className="num" type="number" min="0" value={line.qty} disabled={locked} onChange={(e) => onPatch(line.id, { qty: Number(e.target.value) })} /></td>
                  <td>
                    <select value={line.unit} disabled={locked} onChange={(e) => onPatch(line.id, { unit: e.target.value })}>
                      {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                    </select>
                  </td>
                  <td><input className="num" type="number" min="0" step="500" value={line.unitCost} disabled={locked} onChange={(e) => onPatch(line.id, { unitCost: Number(e.target.value) })} /></td>
                  <td className="computed">{moneyShort(lineTotal(line))}</td>
                  <td><input value={line.remark} disabled={locked} onChange={(e) => onPatch(line.id, { remark: e.target.value })} /></td>
                  <td><button className="row-action" type="button" onClick={() => onRemove(line.id)} disabled={locked} aria-label="Remove line"><Icon name="trash" /></button></td>
                </tr>
              ))}
              {!others.length ? <tr><td colSpan={8}><EmptyState icon="package" title="No other project cost" message="Add outsource service, transportation or accommodation cost lines." /></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="stack">
        <Panel title="Contingency" subtitle="Applied to the whole cost base">
          <Field label={`Contingency rate — ${contingency}%`} hint="Engineering judgement for unknown scope, approved by the Engineering Manager">
            <input type="range" min="0" max="15" step="1" value={contingency} disabled={locked} onChange={(e) => onContingency(Number(e.target.value))} />
          </Field>
          <div className="calc-strip" style={{ marginTop: 10 }}>
            <Icon name="cpu" />
            <span>Contingency cost</span>
            <strong>{moneyShort(totals.contingency)}</strong>
          </div>
        </Panel>
        <Panel title="Cost base" subtitle="What the contingency is applied to">
          <dl className="def-list one">
            <div><dt>Material</dt><dd>{money(totals.material)}</dd></div>
            <div><dt>Engineering</dt><dd>{money(totals.engineering)}</dd></div>
            <div><dt>Outsource</dt><dd>{money(totals.outsource)}</dd></div>
            <div><dt>Transportation</dt><dd>{money(totals.transportation)}</dd></div>
            <div><dt>Accommodation</dt><dd>{money(totals.accommodation)}</dd></div>
            <div><dt>Other cost</dt><dd>{money(totals.other)}</dd></div>
            <div><dt>Contingency</dt><dd>{money(totals.contingency)}</dd></div>
            <div><dt>Total estimated cost</dt><dd><strong>{money(totals.total)}</strong></dd></div>
          </dl>
        </Panel>
      </div>
    </section>
  );
}

/* ==========================================================================
   Assignment (multi-engineer estimate)
   ========================================================================== */

function AssignmentTab({ assignments, onPatch, notify }: {
  assignments: Estimate["assignments"];
  onPatch: (id: string, patch: Partial<Estimate["assignments"][number]>) => void;
  notify: (message: string) => void;
}) {
  const overall = Math.round(assignments.reduce((sum, a) => sum + a.progress, 0) / (assignments.length || 1));

  return (
    <section className="grid-main">
      <Panel
        title="Estimate sections"
        subtitle="One estimate divided across departments — each section has its own owner, due date and status"
        actions={<button className="btn default sm" type="button" onClick={() => notify("Reminder sent to every section owner")}><Icon name="send" />Remind owners</button>}
        flush
      >
        <div className="table-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Section</th>
                <th style={{ width: 170 }}>Responsible Engineer</th>
                <th style={{ width: 170 }}>Support Engineer</th>
                <th style={{ width: 130 }}>Due Date</th>
                <th style={{ width: 160 }}>Status</th>
                <th style={{ width: 140 }}>Progress</th>
                <th style={{ width: 260 }}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td><span className="cell-text"><strong>{assignment.section}</strong></span></td>
                  <td>
                    <select value={assignment.ownerId} onChange={(e) => onPatch(assignment.id, { ownerId: e.target.value })}>
                      {USERS.filter((u) => u.role === "Engineer").map((u) => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={assignment.supportId} onChange={(e) => onPatch(assignment.id, { supportId: e.target.value })}>
                      <option value="—">— none —</option>
                      {USERS.filter((u) => u.role === "Engineer").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </td>
                  <td><input type="date" value={assignment.dueDate} onChange={(e) => onPatch(assignment.id, { dueDate: e.target.value })} /></td>
                  <td>
                    <select value={assignment.status} onChange={(e) => onPatch(assignment.id, { status: e.target.value as SectionStatus })}>
                      {SECTION_STATUSES.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td><span className="cell-text"><ProgressCell value={assignment.progress} /></span></td>
                  <td><input value={assignment.comment} onChange={(e) => onPatch(assignment.id, { comment: e.target.value })} placeholder="Add a comment…" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="stack">
        <Panel title="Estimate completion" subtitle="What the manager sees">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="muted">Overall</span>
            <strong style={{ fontSize: "var(--fs-xl)" }}>{overall}%</strong>
          </div>
          <Progress value={overall} />
          <ul className="check-list" style={{ marginTop: 12 }}>
            {assignments.map((assignment) => (
              <li className="check-item" key={assignment.id}>
                <Icon name={assignment.progress === 100 ? "checkCircle" : assignment.status === "Waiting Supplier" ? "clock" : "alertCircle"}
                  className={assignment.progress === 100 ? "green-text" : assignment.status === "Waiting Supplier" ? "amber-text" : "blue-text"} />
                <div style={{ flex: 1 }}>
                  <strong>{assignment.section} — {assignment.progress}%</strong>
                  <p>{userName(assignment.ownerId)} · {assignment.status}</p>
                  <Progress value={assignment.progress} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Section owners">
          {assignments.map((assignment) => {
            const owner = userOf(assignment.ownerId);
            return (
              <div className="file-row" key={assignment.id}>
                <span className="avatar md">{owner?.initials}</span>
                <div style={{ flex: 1 }}>
                  <strong>{owner?.name}</strong>
                  <small>{owner?.department} · {owner?.level}</small>
                </div>
                <Badge tone={toneOf(assignment.status)}>{assignment.status}</Badge>
              </div>
            );
          })}
        </Panel>
      </div>
    </section>
  );
}

/* ==========================================================================
   Validation
   ========================================================================== */

function ValidationList({ results }: { results: ReturnType<typeof validateEstimate> }) {
  const icon = (level: string) => (level === "pass" ? "checkCircle" : level === "warning" ? "alertTriangle" : "alertCircle");
  return (
    <ul className="check-list">
      {results.map((result, index) => (
        <li className={`check-item ${result.level}`} key={`${result.label}-${index}`}>
          <Icon name={icon(result.level)} />
          <div>
            <strong>{result.level === "pass" ? "✓ " : result.level === "warning" ? "⚠ " : "✕ "}{result.label}</strong>
            <p>{result.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ValidationTab({ results, onFix }: { results: ReturnType<typeof validateEstimate>; onFix: () => void }) {
  const passes = countLevel(results, "pass");
  const warnings = countLevel(results, "warning");
  const errors = countLevel(results, "error");
  return (
    <section className="grid-main">
      <Panel title="Estimate Validation" subtitle="Run automatically on save and before every review submission">
        <ValidationList results={results} />
      </Panel>
      <div className="stack">
        <Panel title="Result">
          <div className="kpi-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="kpi green"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">Checks passed</span><strong className="kpi-value">{passes}</strong></span></div>
            <div className="kpi amber"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">Warnings</span><strong className="kpi-value">{warnings}</strong><span className="kpi-note">Review before approval</span></span></div>
            <div className="kpi red"><span className="kpi-icon"><Icon name="alertCircle" /></span><span className="kpi-body"><span className="kpi-label">Critical errors</span><strong className="kpi-value">{errors}</strong><span className="kpi-note">Must be resolved</span></span></div>
          </div>
          <button className="btn default block" type="button" style={{ marginTop: 12 }} onClick={onFix}>Go to cost items<Icon name="arrowRight" /></button>
        </Panel>
        <Panel title="Rule reference">
          <ul className="check-list">
            <li className="check-item"><Icon name="cpu" /><div><strong>Total Cost = Qty × Unit Cost</strong><p>Calculated centrally; the field is read-only in the table.</p></div></li>
            <li className="check-item"><Icon name="cpu" /><div><strong>Man-hour = Engineers × Man-days × Hours/Day</strong><p>Daily rate comes from the Engineering Rate Master.</p></div></li>
            <li className="check-item"><Icon name="cpu" /><div><strong>Category Total = Σ cost items</strong><p>Subtotals are derived, never typed.</p></div></li>
            <li className="check-item"><Icon name="cpu" /><div><strong>Estimate Total</strong><p>Material + Engineering + Outsource + Installation & Service + Transportation + Accommodation + Other + Contingency.</p></div></li>
          </ul>
        </Panel>
      </div>
    </section>
  );
}

/* ==========================================================================
   Revision history & comparison
   ========================================================================== */

function RevisionTab({ estimate, totals, onCreate }: { estimate: Estimate; totals: number; onCreate: () => void }) {
  return (
    <Panel
      title="Revision Control"
      subtitle="An approved revision is locked. Editing it requires a new revision."
      actions={<button className="btn primary sm" type="button" onClick={onCreate}><Icon name="gitBranch" />Create Revision</button>}
      flush
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Revision</th><th>Reason</th><th>Change Description</th><th>Created By</th><th>Created Date</th><th>Reviewed By</th><th className="num">Total Cost</th><th>Status</th><th aria-label="Action" /></tr>
          </thead>
          <tbody>
            {estimate.revisions.map((revision, index) => {
              const isCurrent = index === estimate.revisions.length - 1;
              return (
                <tr key={revision.id}>
                  <td><span className="pill blue">{revision.code}</span></td>
                  <td><strong>{revision.reason}</strong></td>
                  <td>{revision.description}</td>
                  <td><Person initials={revision.createdBy.split(" ").map((p) => p[0]).join("")} name={revision.createdBy} /></td>
                  <td>{formatDate(revision.createdAt)}</td>
                  <td>{revision.reviewedBy}</td>
                  <td className="num"><strong>{moneyShort(isCurrent ? totals : revision.total)}</strong></td>
                  <td>
                    <Badge tone={toneOf(revision.status)}>{revision.status}</Badge>
                    {revision.status === "Locked" ? <span className="muted" style={{ marginLeft: 6 }}><Icon name="lock" /></span> : null}
                  </td>
                  <td><button className="link-btn" type="button">View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CompareTab({ estimate }: { estimate: Estimate }) {
  const codes = estimate.revisions.map((revision) => revision.code);
  const [from, setFrom] = useState(codes[Math.max(0, codes.length - 2)]);
  const [to, setTo] = useState(codes[codes.length - 1]);
  const rows = revisionDiff(estimate).filter((row) => row.change !== "Unchanged");
  const unchanged = revisionDiff(estimate).filter((row) => row.change === "Unchanged");

  const fromTotal = revisionDiff(estimate).reduce((sum, row) => sum + row.fromCost, 0);
  const toTotal = revisionDiff(estimate).reduce((sum, row) => sum + row.toCost, 0);
  const difference = toTotal - fromTotal;

  return (
    <>
      <Panel title="Compare Estimate Revision" subtitle="Green added · red removed · orange changed">
        <div className="row">
          <Field label="From revision">
            <select value={from} onChange={(e) => setFrom(e.target.value)}>{codes.map((code) => <option key={code}>{code}</option>)}</select>
          </Field>
          <Icon name="arrowRight" />
          <Field label="To revision">
            <select value={to} onChange={(e) => setTo(e.target.value)}>{codes.map((code) => <option key={code}>{code}</option>)}</select>
          </Field>
          <span className="spacer" />
          <div className="row">
            <Badge tone="green">{rows.filter((r) => r.change === "Added").length} added</Badge>
            <Badge tone="red">{rows.filter((r) => r.change === "Removed").length} removed</Badge>
            <Badge tone="amber">{rows.filter((r) => r.change === "Changed").length} changed</Badge>
            <Badge tone="slate">{unchanged.length} unchanged</Badge>
          </div>
        </div>
      </Panel>

      <div style={{ height: 14 }} />

      <section className="grid-4">
        <Panel title={`${from} Total Cost`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{moneyShort(fromTotal)}</strong><p className="muted">THB · material and cost items</p></Panel>
        <Panel title={`${to} Total Cost`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{moneyShort(toTotal)}</strong><p className="muted">THB · material and cost items</p></Panel>
        <Panel title="Difference">
          <strong style={{ fontSize: "var(--fs-2xl)" }} className={difference >= 0 ? "red-text" : "green-text"}>
            {difference >= 0 ? "+" : "−"}{moneyShort(Math.abs(difference))}
          </strong>
          <p className="muted">{((difference / (fromTotal || 1)) * 100).toFixed(1)}% versus {from}</p>
        </Panel>
        <Panel title="Change summary">
          <ul className="check-list">
            <li className="check-item pass"><Icon name="plus" /><div><strong>Material cost difference</strong><p className="green-text">{moneyShort(difference)} THB</p></div></li>
            <li className="check-item"><Icon name="minus" /><div><strong>Engineering / outsource</strong><p className="muted">No change in this revision</p></div></li>
          </ul>
        </Panel>
      </section>

      <div style={{ height: 14 }} />

      <Panel title="Line by line comparison" flush>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Cost Item</th><th>Category</th>
                <th className="num">{from} Qty</th><th className="num">{to} Qty</th><th className="num">Qty Diff.</th>
                <th className="num">{from} Cost</th><th className="num">{to} Cost</th><th className="num">Cost Diff.</th>
                <th>Change Type</th>
              </tr>
            </thead>
            <tbody>
              {[...rows, ...unchanged].map((row) => {
                const className = row.change === "Added" ? "diff-add" : row.change === "Removed" ? "diff-remove" : row.change === "Changed" ? "diff-change" : undefined;
                const delta = row.toCost - row.fromCost;
                return (
                  <tr key={row.key} className={className}>
                    <td><strong>{row.description}</strong></td>
                    <td>{row.category}</td>
                    <td className="num">{row.fromQty || "—"}</td>
                    <td className="num">{row.toQty || "—"}</td>
                    <td className="num">{row.toQty - row.fromQty === 0 ? "—" : row.toQty - row.fromQty}</td>
                    <td className="num">{row.fromCost ? moneyShort(row.fromCost) : "—"}</td>
                    <td className="num">{row.toCost ? moneyShort(row.toCost) : "—"}</td>
                    <td className={`num ${delta > 0 ? "red-text" : delta < 0 ? "green-text" : "muted"}`}>
                      {delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${moneyShort(Math.abs(delta))}`}
                    </td>
                    <td>
                      <Badge tone={row.change === "Added" ? "green" : row.change === "Removed" ? "red" : row.change === "Changed" ? "amber" : "slate"}>
                        {row.change}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Engineering review
   ========================================================================== */

function ReviewTab({ estimate, totals, validation, onApprove, onRequest, onReject, disabled }: {
  estimate: Estimate;
  totals: ReturnType<typeof estimateTotals>;
  validation: ReturnType<typeof validateEstimate>;
  onApprove: () => void; onRequest: () => void; onReject: () => void; disabled: boolean;
}) {
  const [comment, setComment] = useState("");
  const customer = CUSTOMERS.find((c) => c.id === estimate.customerId);
  const inquiry = INQUIRIES.find((i) => i.no === estimate.inquiryNo);
  const warnings = validation.filter((result) => result.level !== "pass");

  return (
    <section className="grid-main">
      <div className="stack">
        <Panel title="Project information">
          <dl className="def-list">
            <div><dt>Estimate</dt><dd className="mono">{estimate.no} · {estimate.revision}</dd></div>
            <div><dt>Inquiry</dt><dd className="mono">{estimate.inquiryNo}</dd></div>
            <div><dt>Customer</dt><dd>{customer?.name}</dd></div>
            <div><dt>Project</dt><dd>{estimate.projectName}</dd></div>
            <div><dt>Project type</dt><dd>{estimate.projectType}</dd></div>
            <div><dt>Estimate owner</dt><dd>{userName(estimate.ownerId)}</dd></div>
            <div><dt>Target delivery</dt><dd>{formatDate(inquiry?.targetDelivery ?? "")}</dd></div>
            <div><dt>Site location</dt><dd>{inquiry?.siteLocation ?? "—"}</dd></div>
          </dl>
          <div className="form-section">
            <div className="form-section-title"><h3>Scope summary</h3><span /></div>
            <p>{inquiry?.scopeSummary}</p>
          </div>
        </Panel>

        <Panel title="Cost summary" subtitle="Approval covers technical scope, cost accuracy, engineering effort and completeness — no margin approval exists here" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cost block</th><th className="num">Amount (THB)</th><th className="num">Share</th></tr></thead>
              <tbody>
                {[
                  ["Material cost", totals.material],
                  ["Engineering man-hour cost", totals.engineering],
                  ["Outsource cost", totals.outsource],
                  ["Transportation", totals.transportation],
                  ["Accommodation", totals.accommodation],
                  ["Other cost", totals.other],
                  [`Contingency ${estimate.contingencyRate}%`, totals.contingency],
                ].map(([label, value]) => (
                  <tr key={String(label)}>
                    <td>{label}</td>
                    <td className="num">{moneyShort(Number(value))}</td>
                    <td className="num muted">{Math.round((Number(value) / totals.total) * 100)}%</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total estimated cost</td>
                  <td className="num">{moneyShort(totals.total)}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <section className="grid-2">
          <Panel title="Cost category breakdown">
            <Donut
              data={categoryTotals(estimate.items).map((entry) => ({ label: `${entry.code} ${entry.name}`, value: entry.total }))}
              centerLabel="Material"
              centerValue={`${Math.round(totals.material / 1000)}K`}
              format={(value) => moneyShort(value)}
            />
          </Panel>
          <Panel title="Top 10 highest cost items" flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Supplier</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {topCostItems(estimate).map((item) => (
                    <tr key={item.id}>
                      <td><div className="cell-primary"><strong>{item.description}</strong><span>{item.brand} {item.model}</span></div></td>
                      <td>{item.supplier}</td>
                      <td className="num"><strong>{moneyShort(lineTotal(item))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <Panel title="Engineering man-hour" subtitle="By department, and by where the work is done" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Department</th><th className="num">Man-days</th><th className="num">Man-hours</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {departmentEffort(estimate).map((row) => (
                  <tr key={row.department}>
                    <td><strong>{row.department}</strong></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">{row.manHours} HR</td>
                    <td className="num">{moneyShort(row.cost)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total</td><td className="num">{totals.manDays} MD</td><td className="num">{totals.manHours} HR</td><td className="num">{moneyShort(totals.engineering)}</td>
                </tr>
                {costTypeEffort(estimate).map((row) => (
                  <tr key={row.costType}>
                    <td><Badge tone={row.costType === "Installation" ? "amber" : "blue"}>{COST_TYPE_SHORT[row.costType]}</Badge></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">{row.manHours} HR</td>
                    <td className="num">{moneyShort(row.cost)}{row.expense ? <span className="muted"> + {moneyShort(row.expense)} expense</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="stack">
        <Panel title="Reviewer decision" subtitle="Engineering Manager">
          <Field label="Reviewer comment">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Scope, cost accuracy, engineering effort, completeness…" />
          </Field>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn success block" type="button" onClick={onApprove} disabled={disabled}><Icon name="checkCircle" />Approve Estimate Cost</button>
            <button className="btn warn block" type="button" onClick={onRequest}><Icon name="refresh" />Request Revision</button>
            <button className="btn danger block" type="button" onClick={onReject}><Icon name="x" />Reject</button>
          </div>
          {disabled ? <div className="info-strip red" style={{ marginTop: 10 }}><Icon name="alertTriangle" />Critical validation errors block approval.</div> : null}
        </Panel>

        <Panel title="Warnings for the reviewer">
          {warnings.length ? (
            <ul className="check-list">
              {warnings.map((warning, index) => (
                <li className={`check-item ${warning.level}`} key={index}>
                  <Icon name={warning.level === "warning" ? "alertTriangle" : "alertCircle"} />
                  <div><strong>{warning.label}</strong><p>{warning.detail}</p></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No warning — every price has a reference and is current.</p>}
        </Panel>

        <Panel title="Top cost supplier" flush>
          <div className="panel-body">
            <HBarList data={supplierTotals(estimate).slice(0, 5).map((row) => ({ label: row.supplier, value: row.total }))} format={(value) => moneyShort(value)} />
          </div>
        </Panel>

        <Panel title="Revision history" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Rev.</th><th>Reason</th><th>By</th><th>Status</th></tr></thead>
              <tbody>
                {estimate.revisions.map((revision) => (
                  <tr key={revision.id}>
                    <td><span className="pill">{revision.code}</span></td>
                    <td>{revision.reason}</td>
                    <td>{revision.createdBy}</td>
                    <td><Badge tone={toneOf(revision.status)}>{revision.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Attachments">
          {(inquiry?.attachments ?? []).map((file) => (
            <div className="file-row" key={file.id}>
              <span className="file-icon"><Icon name="paperclip" /></span>
              <div style={{ flex: 1 }}><strong>{file.name}</strong><small>{file.category} · {file.size}</small></div>
            </div>
          ))}
        </Panel>
      </div>
    </section>
  );
}

/* ==========================================================================
   Drawers and modals
   ========================================================================== */

function ModuleModal({ form, onClose, onSave }: { form: ModuleForm; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(form.name);
  const [categoryCode, setCategoryCode] = useState(form.categoryCode);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const category = COST_STRUCTURE.find((entry) => entry.code === categoryCode);
  const presets = MODULE_PRESETS[categoryCode] ?? [];

  return (
    <Modal
      title={form.mode === "new" ? "New main module" : `Rename “${form.name}”`}
      subtitle={form.mode === "new"
        ? "A main module groups the items an assembly is built from — for example a Main Control Box with its breakers, PLC and wiring."
        : "Every item under this module moves with the new name."}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" disabled={!name.trim()} onClick={() => onSave(name)}>
            <Icon name="check" />{form.mode === "new" ? "Create module" : "Save name"}
          </button>
        </>
      }
    >
      <div className="form-grid two">
        <Field label="Discipline / cost category">
          <select value={categoryCode} disabled={form.mode === "rename"} onChange={(event) => setCategoryCode(event.target.value)}>
            {COST_STRUCTURE.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} {entry.name}</option>)}
          </select>
        </Field>
        <Field label="Module name" hint="e.g. Main Control Box">
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Control Box" />
        </Field>
      </div>

      {form.mode === "new" && presets.length ? (
        <div className="form-section">
          <div className="form-section-title"><h3>Common modules in {category?.name}</h3><span /></div>
          <div className="chip-select">
            {presets.map((preset) => (
              <button key={preset} type="button" className={name === preset ? "chip on" : "chip"} onClick={() => setName(preset)}>
                {name === preset ? <Icon name="check" /> : <Icon name="plus" />} {preset}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="info-strip" style={{ marginTop: 14 }}>
        <Icon name="layers" />
The module is created empty — add its items straight in the sheet, from the price library, or with the detailed form. Its item codes run as <strong>{itemCodePrefix(categoryCode, name || "Module")}-001</strong>, <strong>-002</strong> and so on.
      </div>
    </Modal>
  );
}

/**
 * Attaches a supplier quotation to an outsourced man-hour line — the same idea
 * as picking a price from the library on the hardware side.
 */
function QuotationPickerModal({ onClose, onUse }: {
  onClose: () => void;
  onUse: (quotation: (typeof QUOTATIONS)[number]) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = QUOTATIONS.filter((quotation) =>
    `${quotation.no} ${quotation.supplier} ${quotation.project} ${quotation.inquiryNo}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal
      title="Attach supplier quotation"
      subtitle="Man-hour bought from a supplier must carry the quotation its rate came from"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="muted">{rows.length} quotation(s) · upload a new one from the Supplier Quotation screen</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder="Search quotation no., supplier or project…" />
      <div className="table-wrap tall" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Quotation No.</th><th>Supplier</th><th>Project</th><th>Received</th>
              <th>Valid Until</th><th className="num">Amount</th><th>Status</th><th>File</th><th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {rows.map((quotation) => (
              <tr key={quotation.id} className="clickable" onClick={() => onUse(quotation)}>
                <td><strong className="mono">{quotation.no}</strong></td>
                <td>{quotation.supplier}</td>
                <td>{quotation.project}</td>
                <td>{formatDate(quotation.receivedDate)}</td>
                <td className={quotation.status === "Expired" ? "red-text" : undefined}>{formatDate(quotation.validUntil)}</td>
                <td className="num">{moneyShort(quotation.amount)}</td>
                <td><Badge tone={toneOf(quotation.status)}>{quotation.status}</Badge></td>
                <td><span className="row"><Pill tone={quotation.fileType === "PDF" ? "red" : quotation.fileType === "Excel" ? "green" : "blue"}>{quotation.fileType}</Pill></span></td>
                <td><button className="btn sm default" type="button" onClick={(event) => { event.stopPropagation(); onUse(quotation); }}>Use</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="info-strip" style={{ marginTop: 12 }}>
        <Icon name="alertCircle" />
        The quotation number, supplier and quotation date are written onto the man-hour line, so the quoted rate can always be traced back to its document.
      </div>
    </Modal>
  );
}

function PackageModal({ form, onClose, onSave }: {
  form: PackageForm;
  onClose: () => void;
  onSave: (name: string, costType: CostType) => void;
}) {
  const [name, setName] = useState(form.name);
  const [costType, setCostType] = useState<CostType>(form.costType);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const presets = PACKAGE_PRESETS.filter((preset) => preset.costType === costType);
  const sample = RATES.find((rate) => rate.level === "Middle Engineer" && rate.department === "Electrical");

  return (
    <Modal
      title={form.mode === "new" ? "New work package" : `Rename “${form.name}”`}
      subtitle={form.mode === "new"
        ? "A work package groups the activities and the travel, hotel and per diem cost that belong together."
        : "Every activity and expense in this package follows the new name and cost type."}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" disabled={!name.trim()} onClick={() => onSave(name, costType)}>
            <Icon name="check" />{form.mode === "new" ? "Create package" : "Save package"}
          </button>
        </>
      }
    >
      <div className="form-grid two">
        <Field label="Cost type" hint="Installation & service work uses the higher standard rate">
          <select value={costType} onChange={(event) => setCostType(event.target.value as CostType)}>
            <option value="Engineering">{COST_TYPE_LABEL.Engineering}</option>
            <option value="Installation">{COST_TYPE_LABEL.Installation}</option>
          </select>
        </Field>
        <Field label="Package name" hint="e.g. Site Installation">
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Site Installation" />
        </Field>
      </div>

      {presets.length ? (
        <div className="form-section">
          <div className="form-section-title"><h3>Common {COST_TYPE_SHORT[costType].toLowerCase()} packages</h3><span /></div>
          <div className="chip-select">
            {presets.map((preset) => (
              <button key={preset.name} type="button" className={name === preset.name ? "chip on" : "chip"} onClick={() => setName(preset.name)}>
                {name === preset.name ? <Icon name="check" /> : <Icon name="plus" />} {preset.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={costType === "Installation" ? "info-strip amber" : "info-strip"} style={{ marginTop: 14 }}>
        <Icon name={costType === "Installation" ? "truck" : "cpu"} />
        {costType === "Installation"
          ? `Installation & service rate applies — a Middle Electrical Engineer costs ${moneyShort(sample?.installationDaily ?? 0)} THB/day instead of ${moneyShort(sample?.engineeringDaily ?? 0)}. Travel, accommodation, per diem and supplier man-hour can be added inside the package.`
          : `Engineering rate applies — a Middle Electrical Engineer costs ${moneyShort(sample?.engineeringDaily ?? 0)} THB/day.`}
      </div>
    </Modal>
  );
}

function AddCostItemDrawer({ items, modules, onClose, onSave, onSearchPrice }: {
  items: CostItem[];
  modules: ModuleDef[];
  onClose: () => void;
  onSave: (item: CostItem, again: boolean) => void;
  onSearchPrice: () => void;
}) {
  const [item, setItem] = useState<CostItem>(() => ({ ...blankItem(), itemCode: nextItemCode(items, "01", "") }));
  const set = <K extends keyof CostItem>(key: K, value: CostItem[K]) => setItem((prev) => ({ ...prev, [key]: value }));
  const structure = COST_STRUCTURE.find((c) => c.code === item.categoryCode);

  /** Keeps the generated code in step with the category and module chosen. */
  const retitle = (next: CostItem) => (
    isGeneratedCode(item.itemCode, item.categoryCode, item.module)
      ? { ...next, itemCode: nextItemCode(items, next.categoryCode, next.module) }
      : next
  );

  return (
    <Drawer
      title="Add Cost Item"
      subtitle="Search the price library first — typing a price by hand should be the last resort"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn default" type="button" onClick={onSearchPrice}><Icon name="search" />Search Price Library</button>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={() => onSave(item, true)}>Save &amp; Add Another</button>
          <button className="btn primary" type="button" onClick={() => onSave(item, false)}><Icon name="check" />Save</button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn default sm" type="button" onClick={onSearchPrice}><Icon name="book" />Search Price Library</button>
        <button className="btn default sm" type="button" onClick={() => setItem((prev) => ({ ...prev, unitCost: 76000, supplier: "Keyence (Thailand) Co., Ltd.", brand: "KEYENCE", model: "KV-8000", source: "Supplier Quotation", referenceNo: "SQ-2608-0012", priceDate: "2026-08-12" }))}>
          <Icon name="clock" />Use Last Price
        </button>
      </div>

      <div className="form-grid two">
        <Field label="Cost Category">
          <select value={item.categoryCode} onChange={(e) => {
            const next = COST_STRUCTURE.find((c) => c.code === e.target.value);
            setItem((prev) => retitle({ ...prev, categoryCode: e.target.value, category: next?.name ?? prev.category, subcategory: next?.subs[0]?.name ?? "" }));
          }}>
            {COST_STRUCTURE.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Subcategory">
          <select value={item.subcategory} onChange={(e) => set("subcategory", e.target.value)}>
            {(structure?.subs ?? []).map((sub) => <option key={sub.code} value={sub.name}>{sub.code} {sub.name}</option>)}
          </select>
        </Field>
        <Field label="Main Module" span={2} hint="Pick an existing module or type a new name">
          <input
            list="module-list"
            value={item.module}
            onChange={(e) => setItem((prev) => retitle({ ...prev, module: e.target.value }))}
            placeholder="e.g. Main Control Box"
          />
          <datalist id="module-list">
            {[...modules.filter((module) => module.categoryCode === item.categoryCode).map((module) => module.name),
              ...(MODULE_PRESETS[item.categoryCode] ?? [])]
              .filter((name, index, list) => list.indexOf(name) === index)
              .map((name) => <option key={name} value={name} />)}
          </datalist>
        </Field>
        <Field label="Item Code" hint={`Generated as ${itemCodePrefix(item.categoryCode, item.module)}-NNN — overwrite it with a supplier part number if you prefer`}>
          <input value={item.itemCode} onChange={(e) => set("itemCode", e.target.value)} placeholder="HW-PLC-001" />
        </Field>
        <Field label="Brand">
          <input list="brand-list-drawer" value={item.brand} onChange={(e) => set("brand", e.target.value)} />
          <datalist id="brand-list-drawer">{BRANDS.map((brand) => <option key={brand} value={brand} />)}</datalist>
        </Field>
        <Field label="Description" span={2}><input value={item.description} onChange={(e) => set("description", e.target.value)} placeholder="PLC CPU Unit with EtherNet/IP" /></Field>
        <Field label="Model"><input value={item.model} onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="Supplier">
          <select value={item.supplier} onChange={(e) => set("supplier", e.target.value)}>
            <option value="">— select supplier —</option>
            {SUPPLIERS.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label="Specification" span={2}><textarea value={item.specification} onChange={(e) => set("specification", e.target.value)} /></Field>
        <Field label="Quantity"><input type="number" min="0" value={item.qty} onChange={(e) => set("qty", Number(e.target.value))} /></Field>
        <Field label="Unit">
          <select value={item.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
        </Field>
        <Field label="Unit Cost (THB)"><input type="number" min="0" step="100" value={item.unitCost} onChange={(e) => set("unitCost", Number(e.target.value))} /></Field>
        <Field label="Total Cost" hint="Calculated by the system">
          <input className="calculated" readOnly value={`${moneyShort(lineTotal(item))} THB`} />
        </Field>
        <Field label="Price Source">
          <select value={item.source} onChange={(e) => set("source", e.target.value as CostItem["source"])}>
            <option value="">— not set —</option>
            {["Supplier Quotation", "Previous Estimate", "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price"].map((source) => <option key={source}>{source}</option>)}
          </select>
        </Field>
        <Field label="Reference Number"><input value={item.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} placeholder="SQ-2608-0012" /></Field>
        <Field label="Reference Project"><input value={item.referenceProject} onChange={(e) => set("referenceProject", e.target.value)} /></Field>
        <Field label="Price Date"><input type="date" value={item.priceDate} onChange={(e) => set("priceDate", e.target.value)} /></Field>
        <Field label="Remark" span={2}><textarea value={item.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
      </div>

      <div className="calc-strip" style={{ marginTop: 14 }}>
        <Icon name="cpu" />
        <span>{item.qty} {item.unit} × {moneyShort(item.unitCost)} THB =</span>
        <strong>{moneyShort(lineTotal(item))} THB</strong>
      </div>
    </Drawer>
  );
}

function CreateRevisionModal({ estimate, onClose, onCreate }: { estimate: Estimate; onClose: () => void; onCreate: (reason: string) => void }) {
  const [reason, setReason] = useState("Customer Requirement Change");
  const [description, setDescription] = useState("");
  const next = `R0${estimate.revisions.length}`;

  return (
    <Modal
      title="Create new revision"
      subtitle={`All data from ${estimate.revision} is cloned into ${next}. The previous revision stays read-only.`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onCreate(reason)}><Icon name="gitBranch" />Create {next}</button>
        </>
      }
    >
      <div className="info-strip"><Icon name="copy" />Cost items, engineering man-hour, assignment and attachments are copied into the new revision.</div>
      <div className="form-grid two" style={{ marginTop: 14 }}>
        <Field label="New revision"><input value={next} readOnly /></Field>
        <Field label="Revision Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {["Customer Requirement Change", "Scope Change", "Technical Change", "Cost Update", "Supplier Price Update", "Other"].map((option) => <option key={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="What changed?" span={2} hint="Written into the revision history and the audit log">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Added safety fence with interlock door after the safety review." />
        </Field>
      </div>
    </Modal>
  );
}

function ImportExcelModal({ onClose, onImport }: { onClose: () => void; onImport: (count: number) => void }) {
  const [mapped, setMapped] = useState<Record<string, string>>({
    Description: "Column C — Description/Detail",
    Qty: "Column I — Quantity",
    Unit: "Column K — Unit",
    "Unit Cost": "Column H — Unit price",
    Category: "Column A — Item group",
    Supplier: "Column D — Supplier",
    Brand: "Column E — Brand",
    Model: "Column B — Model/Part Number",
    Remark: "Column L — Remark",
  });

  const preview = [
    { row: 7, description: "PLC CPU Unit with EtherNet/IP", qty: 1, unit: "Set", unitCost: 76000, status: "ok" },
    { row: 8, description: "Expansion I/O Unit 16DI/16DO", qty: 4, unit: "Pcs", unitCost: 9800, status: "ok" },
    { row: 9, description: "Touch Panel 12.1 inch", qty: 1, unit: "Set", unitCost: 62500, status: "ok" },
    { row: 10, description: "Field wiring material", qty: 1, unit: "Lot", unitCost: 0, status: "error" },
    { row: 11, description: "Safety fence", qty: 0, unit: "Lot", unitCost: 88000, status: "warning" },
  ];

  return (
    <Modal
      title="Import Existing Estimate"
      subtitle="Upload the current Excel estimate, map the columns and review the validation before importing"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="muted">1 row has a missing unit cost and 1 row has zero quantity — both are flagged, not silently imported.</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onImport(preview.length)}><Icon name="upload" />Import 5 rows</button>
        </>
      }
    >
      <div className="attachment-drop">
        <Icon name="upload" />
        <strong>Estimate_Cost_ASTEMO_R01.xlsx</strong>
        <span>Sheet &quot;Summary cost&quot; · 5 data rows detected</span>
      </div>

      <div className="form-section">
        <div className="form-section-title"><h3>Column mapping</h3><span /></div>
        <div className="form-grid two">
          {Object.entries(mapped).map(([field, column]) => (
            <Field key={field} label={field}>
              <select value={column} onChange={(e) => setMapped((prev) => ({ ...prev, [field]: e.target.value }))}>
                <option>{column}</option>
                <option>— not mapped —</option>
              </select>
            </Field>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title"><h3>Validation preview</h3><span /></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Excel row</th><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit Cost</th><th className="num">Total</th><th>Check</th></tr></thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.row}>
                  <td className="mono">{row.row}</td>
                  <td>{row.description}</td>
                  <td className="num">{row.qty}</td>
                  <td>{row.unit}</td>
                  <td className="num">{moneyShort(row.unitCost)}</td>
                  <td className="num"><strong>{moneyShort(row.qty * row.unitCost)}</strong></td>
                  <td>
                    <Badge tone={row.status === "ok" ? "green" : row.status === "warning" ? "amber" : "red"}>
                      {row.status === "ok" ? "Valid" : row.status === "warning" ? "Quantity is zero" : "Missing unit cost"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function CopyPreviousModal({ onClose, onCopy }: { onClose: () => void; onCopy: (sections: string[]) => void }) {
  const [project, setProject] = useState("FTS Traceability 2026 — EST-2601-0004 R02");
  const [sections, setSections] = useState<string[]>(["Hardware", "Engineering Man-hour"]);
  const options = ["Hardware", "Software", "Engineering Man-hour", "Electrical", "Mechanical", "Outsource", "Transportation"];

  return (
    <Modal
      title="Copy From Previous Estimate"
      subtitle="Copied prices keep their original reference and are marked “Reference From Previous Estimate”"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onCopy(sections)} disabled={!sections.length}>
            <Icon name="copy" />Copy {sections.length} section(s)
          </button>
        </>
      }
    >
      <Field label="Previous project">
        <select value={project} onChange={(e) => setProject(e.target.value)}>
          <option>FTS Traceability 2026 — EST-2601-0004 R02</option>
          <option>AAPICO Press Line — EST-2604-0022 R01</option>
          <option>TTS Robot Cell — EST-2605-0031 R00</option>
          <option>Meiji OEE Phase 1 — EST-2512-0007 R03</option>
        </select>
      </Field>
      <div className="form-section">
        <div className="form-section-title"><h3>Sections to copy</h3><span /></div>
        <div className="chip-select">
          {options.map((option) => (
            <button
              key={option} type="button"
              className={sections.includes(option) ? "chip on" : "chip"}
              onClick={() => setSections((prev) => prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option])}
            >
              {sections.includes(option) ? <Icon name="check" /> : <Icon name="plus" />} {option}
            </button>
          ))}
        </div>
      </div>
      <div className="info-strip amber" style={{ marginTop: 14 }}>
        <Icon name="alertTriangle" />
        Prices older than 180 days will be flagged red in the estimate so they are confirmed before approval.
      </div>
    </Modal>
  );
}
