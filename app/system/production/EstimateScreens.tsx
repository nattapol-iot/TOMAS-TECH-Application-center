"use client";
import { DocumentLifecycleButton, DocumentHistoryButton } from "./DocumentLifecycle";
import { EstimateModuleQuantityCells } from "./EstimateModuleQuantityCells";
import { EstimatePriceSetEditor } from "./EstimatePriceSetEditor";
import { EstimateEffortCells } from "./EstimateEffortCells";
import { EstimateModuleEditor } from "./EstimateModuleEditor";
import { useT as useStaticCopy } from "../i18n";
import { EstimateExcelImport, EstimateImportHistory } from "./EstimateExcelImport";
import { EstimateOverheadPanel } from "./EstimateOverheadPanel";
import { ESTIMATE_OVERHEAD_ENABLED } from "../../../lib/feature-flags";
import { ESTIMATE_ASSIGNMENT_SECTIONS } from "../../../lib/estimate-sections";
import { insertCostLine, moveModule, moveSibling, type ReorderEstimate } from "../../../lib/estimate-order";

import { EstimateErpSheetPanel } from "./EstimateErpSheet";
import { ApplyLaborPackageModal, SaveLaborPackageModal } from "./LaborPackagePicker";
import { LaborPackageMaster } from "./LaborPackageMaster";
import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { CostItemFields, COST_CATEGORIES, PRICE_SOURCES, UNITS } from "./CostItemFields";
import { CostItemLookupInput, SupplierLookupInput } from "./CostItemLookup";
import type { CostItemLookupPatch } from "../../../lib/cost-item-lookup";
import { validCostItemNumbers } from "../../../lib/cost-item-validation";
import { estimateApplyOwnerId, estimateIssueTab, estimateNextAction, estimateUxCopy, estimateIssueMessage, moduleTemplateApplyBlocker } from "../../../lib/estimate-ux";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError,
  apiRequest,
  copyEstimateContent,
  createCostItem,
  createEstimate,
  createEstimateAssignment,
  createEstimateExpense,
  createEstimateManhour,
  createEstimateOtherCost,
  estimateWorkflow,
  listEstimates,
  listInquiries,
  listSupplierPriceHistory,
  applyModuleTemplate,
  createModuleTemplateFromEstimate,
  listModuleTemplates,
  loadEstimateCostWorkspace,
  loadModuleTemplate,
  removeCostItem,
  removeEstimateExpense,
  removeEstimateManhour,
  removeEstimateOtherCost,
  updateCostItem,
  updateEstimateAssignment,
  updateEstimateContingency,
  updateEstimateExpense,
  updateEstimateManhour,
  updateEstimateManhourEffort,
  type EstimateEffortInput,
  updateEstimateOtherCost,
  type BootstrapData,
  type CostItemInput,
  type CreateEstimateInput,
  type EstimateAssignment,
  type EstimateAssignmentCreateInput,
  type EstimateAssignmentInput,
  type EstimateAssignmentMutationResult,
  type EstimateCopyInput,
  type EstimateCopyResult,
  type EstimateCostItem,
  type EstimateCostWorkspace,
  type EstimateExpenseInput,
  type EstimateExpenseLine,
  type EstimateManhourInput,
  type EstimateManhourLine,
  type EstimateOtherCostInput,
  type EstimateOtherCostLine,
  type EstimateRevision,
  type EstimateSummary,
  type ModuleTemplateDetail,
  type ModuleTemplateSummary,
  type InquirySummary,
  type PagedResult,
  type SupplierPriceHistoryRecord,
} from "../api-client";
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  Progress,
  ProgressCell,
  SearchInput,
  Select,
  StatusLegend,
  SummaryTile,
  TablePageSize,
  Tabs,
  Toolbar,
} from "../ui";
import { exportXlsx } from "../../../lib/export-xlsx";
import { readSpreadsheet, type SpreadsheetRow } from "../../../lib/import-spreadsheet";

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap: () => Promise<void>;
};

type WorkspaceTab = "summary" | "cost" | "manhour" | "other" | "assignment" | "validation" | "revision" | "review";
type ManhourSeed = Partial<Pick<EstimateManhourInput, "package" | "costType" | "provider">>;
type ExpenseSeed = Partial<Pick<EstimateExpenseInput, "package" | "costType">>;
type CostItemSeed = Partial<Omit<CostItemInput, "estimateRowVersion" | "lineRowVersion">>;
type PriceLibraryRecord = {
  key: string;
  sourceNumber: string;
  projectName: string;
  customerName: string;
  sourceKind: "Estimate" | "Historical Purchase";
  sourceEstimateId?: number;
  sourceRevision?: number;
  sourceStatus?: string;
  item: EstimateCostItem;
};
type QuickManhourDraft = {
  version: number;
  groupKey: string;
  package: string;
  activity: string;
  department: string;
  level: string;
  costType: EstimateManhourInput["costType"];
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  ownerId: number;
  remark: string;
};

type EngineeringRateOption = {
  id: number;
  level: string;
  department: string;
  engineeringDaily: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};
type QuickCostDraft = Omit<CostItemInput, "estimateRowVersion" | "lineRowVersion"> & { version: number; groupKey: string };

const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";

const PROJECT_TYPES = ["Automation", "IoT", "PLC", "Software", "Electrical", "Mechanical", "Robot", "AMR", "Auto Warehouse", "WMS", "WCS", "Traceability", "Vision", "Data Collection", "Other"];

const STALE_TEMPLATE_PRICE_DAYS = 180;
/* Module scope on purpose: the age of a reference price is read once, when the
   engineer picks the template, not recomputed on every render. */
const priceAgeInDays = (date: string | null) => date ? Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000) : null;
const SECTION_STATUSES = ["Not Started", "In Progress", "Waiting Information", "Waiting Supplier", "Completed", "Reviewed"];
const EXPENSE_TYPES = ["Travel", "Accommodation", "Per Diem", "Transportation", "Equipment Rental", "Other"];
const EXPENSE_SECTION_BY_TYPE: Record<string, "08" | "09" | "10"> = { Travel: "08", Transportation: "08", Accommodation: "09", "Per Diem": "09", "Equipment Rental": "10", Other: "10" };

const OTHER_CATEGORIES: EstimateOtherCostInput["category"][] = ["Outsource", "Transportation", "Accommodation", "Other Cost"];
const INQUIRY_PAGE_SIZE = 100;
const INQUIRY_PAGE_BATCH_SIZE = 4;
const MAX_LEDGER_LINE_TOTAL = 999_999_999_999_999;

async function loadAllEstimateSummaries() {
  const items: EstimateSummary[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listEstimates({ page, pageSize: 100 });
    items.push(...result.items);
    if (!result.items.length || items.length >= result.total) return items;
  }
}

async function loadAllSupplierPriceHistoryRecords() {
  const items: SupplierPriceHistoryRecord[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listSupplierPriceHistory({ page, pageSize: 200 });
    items.push(...result.items);
    if (!result.items.length || items.length >= result.total) return items;
  }
}

async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await work(items[index]); }
      catch { results[index] = null; }
    }
  }));
  return results;
}

async function loadPriceLibraryRecords(currentEstimateId: number) {
  const [estimates, historyResult] = await Promise.all([
    loadAllEstimateSummaries(),
    loadAllSupplierPriceHistoryRecords(),
  ]);
  const loaded = await mapLimited(estimates.filter((estimate) => estimate.id !== currentEstimateId), 5, async (estimate) => ({ estimate, workspace: await loadEstimateCostWorkspace(estimate.id) }));
  const estimateRecords: PriceLibraryRecord[] = loaded.flatMap((entry) => entry ? entry.workspace.costItems.map((item) => ({
    key: `estimate:${entry.estimate.id}:${item.id}`,
    sourceNumber: entry.estimate.number,
    sourceEstimateId: entry.estimate.id,
    sourceRevision: entry.workspace.header.revision,
    sourceStatus: entry.workspace.header.status,
    projectName: entry.estimate.projectName,
    customerName: entry.estimate.customerName,
    sourceKind: "Estimate" as const,
    item,
  })) : []);
  const historicalRecords: PriceLibraryRecord[] = historyResult.map((history) => ({
    key: `history:${history.id}`,
    sourceNumber: history.quotationNumber || history.purchaseOrderNumber || history.projectNumber,
    projectName: `${history.projectNumber} · ${history.projectName}`,
    customerName: history.customerName,
    sourceKind: "Historical Purchase",
    item: {
      id: history.id,
      categoryCode: history.categoryCode,
      category: history.category,
      subcategory: "",
      module: history.module,
      itemCode: history.itemCode,
      description: history.description,
      brand: history.brand,
      model: "",
      specification: null,
      supplierId: history.supplierId,
      supplierName: history.supplierName,
      quantity: Number(history.quantity),
      unit: history.unit,
      unitCost: Number(history.actualUnitCost),
      lineTotal: Number(history.actualLineCost),
      priceSource: "Historical Purchase",
      referenceNumber: history.quotationNumber || history.purchaseOrderNumber,
      referenceProject: history.projectNumber,
      priceDate: history.quotationDate,
      remark: [history.remark, `PO: ${history.purchaseOrderNumber}`].filter(Boolean).join(" · "),
      ownerId: 0,
      ownerName: "PR import",
      status: history.purchaseOrderStatus || "Purchased",
      updatedAt: history.importedAt,
      canEdit: false,
      rowVersion: "",
    },
  }));
  return [...estimateRecords, ...historicalRecords]
    .sort((left, right) => (right.item.priceDate ?? "").localeCompare(left.item.priceDate ?? "") || right.item.id - left.item.id);
}

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const isCriticalValidationIssue = (issue: EstimateCostWorkspace["validationIssues"][number]) => issue.severity.trim().toLowerCase() === "error";
const numberOf = (value: number | string | null | undefined) => Number(value ?? 0);
const formatMoney = (value: number | string | null | undefined) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(numberOf(value));
const formatNumber = (value: number | string | null | undefined, maximumFractionDigits = 2) => numberOf(value).toLocaleString(currentLocale(), { maximumFractionDigits });
const dateValue = (value: string | null | undefined) => value ? value.slice(0, 10) : "";
const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(parsed);
};
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(parsed);
};
const businessDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const futureDate = (days: number) => businessDate(new Date(Date.now() + days * 86_400_000));
const normalizeEstimateDueDate = (value: string | undefined, earliest: string, latest: string) => value && value >= earliest && value <= latest ? value : futureDate(7);
const canOwnEstimate = (role: string) => ["Engineer", "Engineering Manager", "Admin"].includes(role);
const canAssignEstimateOwner = (role: string) => ["Engineering Manager", "Admin"].includes(role);
const assignmentResultMessage = (action: "created" | "updated", result: EstimateAssignmentMutationResult) => {
  const saved = `Assignment ${action}`;
  if (result.notification.status === "sent") return `${saved} · email sent to ${result.notification.recipients.length} recipient(s)`;
  if (result.notification.status === "failed") return `${saved} · email could not be sent; please notify the assignee manually`;
  if (result.notification.status === "disabled") return `${saved} · email notification is not configured on this environment`;
  return saved;
};
const revisionCode = (revision: number) => `R${String(revision).padStart(2, "0")}`;
const copyResultMessage = (result: EstimateCopyResult) => {
  const copied = [
    [result.costItems, "cost item"], [result.manhourLines, "man-hour line"],
    [result.expenseLines, "expense line"], [result.otherCostLines, "other-cost line"],
  ] as const;
  const parts = copied.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}(s)`);
  const notes = [
    result.erpCategories ? `${result.erpCategories} ERP classification(s) carried over` : "",
    result.renamedItemCodes.length ? `${result.renamedItemCodes.length} item code(s) renumbered to stay unique` : "",
    result.droppedSuppliers.length ? `${result.droppedSuppliers.length} inactive supplier reference(s) cleared` : "",
  ].filter(Boolean);
  return [`Copied from ${result.sourceNumber} ${revisionCode(result.sourceRevision)} · ${parts.join(" · ")} written in one transaction`, ...notes].join(" · ");
};

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{message}</span><button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="select-field"><span className="sr-only">{label}</span><select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Icon name="chevronDown" /></label>;
}

async function listAllNewInquiries() {
  const first = await listInquiries({ page: 1, pageSize: INQUIRY_PAGE_SIZE, status: "New" });
  const pages = Math.max(1, Math.ceil(first.total / Math.max(first.pageSize, 1)));
  const items = [...first.items];
  for (let start = 2; start <= pages; start += INQUIRY_PAGE_BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(INQUIRY_PAGE_BATCH_SIZE, pages - start + 1) }, (_, index) => start + index);
    const results = await Promise.all(batch.map((page) => listInquiries({ page, pageSize: INQUIRY_PAGE_SIZE, status: "New" })));
    results.forEach((result) => items.push(...result.items));
  }
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function ProductionEstimates({ bootstrap, notify, refreshBootstrap, initialEstimateId = null }: Props & { initialEstimateId?: number | null }) {
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<EstimateSummary>>(EMPTY_PAGE);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(initialEstimateId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [customerId, setCustomerId] = useState("All customers");
  const [projectType, setProjectType] = useState("All project types");
  const [mine, setMine] = useState(() => canOwnEstimate(bootstrap.user.role));
  const [ownerId, setOwnerId] = useState("All owners");
  const [department, setDepartment] = useState("All departments");
  const [revision, setRevision] = useState("All revisions");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await listEstimates({
        page,
        pageSize,
        search,
        status: status === "All status" ? undefined : status,
        customerId: customerId === "All customers" ? undefined : Number(customerId),
        projectType: projectType === "All project types" ? undefined : projectType,
        mine,
        ownerId: ownerId === "All owners" ? undefined : Number(ownerId),
        department: department === "All departments" ? undefined : department,
        revision: revision === "All revisions" ? undefined : Number(revision),
      }));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [customerId, department, mine, ownerId, page, pageSize, projectType, revision, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (selectedEstimateId !== null) {
    return <ProductionEstimateWorkspace
      estimateId={selectedEstimateId}
      bootstrap={bootstrap}
      notify={notify}
      refreshBootstrap={refreshBootstrap}
      onBack={() => { setSelectedEstimateId(null); void load(); }}
      onListChanged={load}
    />;
  }

  const canCreate = bootstrap.permissions.includes("estimate.write");
  const pageCount = Math.max(1, Math.ceil(result.total / Math.max(result.pageSize, 1)));
  const resetPage = () => setPage(1);
  const departments = [...new Set(bootstrap.team.map((member) => member.department).filter(Boolean))].sort();
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const todayIso = businessDate();

  return <>
    <PageHeader
      eyebrow="ENGINEERING COST"
      title={uiText("Estimate Cost")}
      subtitle="จัดทำต้นทุน ตรวจสอบ revision และอนุมัติจากข้อมูล SQL Server ชุดเดียวกัน"
      actions={<><DocumentHistoryButton kind="estimates" notify={notify} onOpen={setSelectedEstimateId} onChanged={async () => { await load(); await refreshBootstrap(); }} />{canCreate ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New estimate from inquiry"} /></button> : null}</>}
    />
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); resetPage(); }} placeholder="Search estimate, inquiry, project or customer…" />
      {canOwnEstimate(bootstrap.user.role) ? <>
        <button className={mine ? "btn primary" : "btn default"} type="button" onClick={() => { setMine(true); setOwnerId("All owners"); resetPage(); }}><Icon name="user" /><LocalizedText text={"My estimates"} /></button>
        <button className={!mine && ownerId === "All owners" ? "btn primary" : "btn default"} type="button" onClick={() => { setMine(false); setOwnerId("All owners"); resetPage(); }}><Icon name="users" /><LocalizedText text={"All estimates"} /></button>
      </> : null}
      <Select label="Status" value={status} onChange={(value) => { setStatus(value); resetPage(); }} options={["All status", "Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Revision Required", "Approved", "Locked"]} />
      <button className={advancedFiltersOpen ? "btn default active" : "btn default"} type="button" aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen((current) => !current)}><Icon name="filter" /><LocalizedText text={"Advanced filters"} /></button>
      <button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
    </Toolbar>
    {advancedFiltersOpen ? <Toolbar>
      <FilterSelect label="Customer" value={customerId} onChange={(value) => { setCustomerId(value); resetPage(); }} options={[{ value: "All customers", label: "All customers" }, ...bootstrap.customers.map((customer) => ({ value: String(customer.id), label: `${customer.code} — ${customer.name}` }))]} />
      <Select label="Project type" value={projectType} onChange={(value) => { setProjectType(value); resetPage(); }} options={["All project types", ...PROJECT_TYPES]} />
      <FilterSelect label="Owner" value={ownerId} onChange={(value) => { setMine(false); setOwnerId(value); resetPage(); }} options={[{ value: "All owners", label: "All owners" }, ...owners.map((owner) => ({ value: String(owner.id), label: owner.name }))]} />
      <Select label="Department" value={department} onChange={(value) => { setDepartment(value); resetPage(); }} options={["All departments", ...departments]} />
      <FilterSelect label="Revision" value={revision} onChange={(value) => { setRevision(value); resetPage(); }} options={[{ value: "All revisions", label: "All revisions" }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index), label: revisionCode(index) }))]} />
    </Toolbar> : null}
    {/* The eight statuses dbo.estimates actually allows, in workflow order.
        "Overdue" used to be listed here but is not a status — it is a derived
        flag — while "Revision Required", which the grid does show, was missing. */}
    <StatusLegend items={[
      { label: "Draft" },
      { label: "Engineering Input" },
      { label: "Waiting Supplier Price" },
      { label: "Estimate Completed" },
      { label: "Engineering Review" },
      { label: "Revision Required" },
      { label: "Approved" },
      { label: "Locked" },
    ]} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} ${uiText("estimates")}`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data · click a row to open the full workspace"} flush>
      {result.items.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); resetPage(); }} /><table>
        <thead><tr><th><LocalizedText text={"Estimate No."} /></th><th><LocalizedText text={"Inquiry"} /></th><th><LocalizedText text={"Customer"} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Rev."} /></th><th><LocalizedText text={"Created"} /></th><th><LocalizedText text={"Due"} /></th><th className="num"><LocalizedText text={"Material"} /></th><th className="num"><LocalizedText text={"Engineering"} /></th><th className="num"><LocalizedText text={"Outsource"} /></th><th className="num"><LocalizedText text={"Other"} /></th><th className="num"><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Updated"} /></th><th /></tr></thead>
        <tbody>{result.items.map((item) => {
          const late = item.dueDate < todayIso && !["Approved", "Locked"].includes(item.status);
          const other = numberOf(item.transportationTotal) + numberOf(item.accommodationTotal) + numberOf(item.otherTotal) + numberOf(item.contingencyTotal);
          return <tr key={item.id} className={`clickable ${late ? "row-late" : ["Approved", "Locked"].includes(item.status) ? "row-ok" : item.status === "Waiting Supplier Price" ? "row-wait" : ""}`} onClick={() => setSelectedEstimateId(item.id)}>
            <td><strong className="mono">{item.number}</strong></td><td className="mono">{item.inquiryNumber}</td><td>{item.customerName}</td>
            <td><div className="cell-primary"><strong>{item.projectName}</strong><span>{item.projectType}</span></div></td><td>{item.ownerName}</td><td><span className="pill">{revisionCode(item.revision)}</span></td>
            <td>{formatDate(item.createdDate)}</td><td className={late ? "red-text" : undefined}>{formatDate(item.dueDate)}{late ? <Badge tone="red">{"Overdue"}</Badge> : null}</td>
            <td className="num">{formatMoney(item.materialTotal)}</td><td className="num">{formatMoney(item.engineeringTotal)}</td><td className="num">{formatMoney(item.outsourceTotal)}</td><td className="num">{formatMoney(other)}</td><td className="num"><strong>{formatMoney(item.total)}</strong></td>
            <td style={{ minWidth: 110 }}><ProgressCell value={numberOf(item.progress)} /></td><td><Badge>{item.status}</Badge></td><td className="muted">{formatDateTime(item.updatedAt)}</td>
            <td><button className="row-action" type="button" aria-label={`Open ${item.number}`} onClick={(event) => { event.stopPropagation(); setSelectedEstimateId(item.id); }}><Icon name="chevronRight" /></button></td>
          </tr>;
        })}</tbody>
      </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div>
        : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div>
          : <EmptyState icon="file" title="No estimate matches the filters" message="ปรับตัวกรองหรือสร้าง Estimate จาก Inquiry ที่ยังไม่มี Estimate" />}
    </Panel>
    {createOpen ? <CreateEstimateModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (created) => {
      setCreateOpen(false);
      notify(`${created.number} created`);
      await Promise.all([load(), refreshBootstrap()]);
      setSelectedEstimateId(created.id);
    }} /> : null}
  </>;
}

function CreateEstimateModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (created: { id: number; number: string }) => Promise<void> }) {
  const uiText = useUiText();
  const allOwners = useMemo(() => bootstrap.team.filter((member) => canOwnEstimate(member.role)), [bootstrap.team]);
  const owners = useMemo(() => canAssignEstimateOwner(bootstrap.user.role) ? allOwners : allOwners.filter((member) => member.id === bootstrap.user.id), [allOwners, bootstrap.user.id, bootstrap.user.role]);
  const earliestDueDate = businessDate();
  const latestDueDate = futureDate(365 * 5);
  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [form, setForm] = useState<CreateEstimateInput>({ inquiryId: 0, ownerId: owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0, dueDate: normalizeEstimateDueDate(undefined, earliestDueDate, latestDueDate), contingencyRate: 5 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const inquiries = await listAllNewInquiries();
      const available = inquiries.filter((item) => item.estimateId === null && item.status === "New" && (canAssignEstimateOwner(bootstrap.user.role) || item.estimateOwnerId === bootstrap.user.id));
      setInquiries(available);
      setForm((current) => {
        if (available.some((item) => item.id === current.inquiryId)) return current;
        const first = available[0];
        return {
          ...current,
          inquiryId: first?.id ?? 0,
          ownerId: owners.find((owner) => owner.id === first?.estimateOwnerId)?.id ?? current.ownerId,
          dueDate: normalizeEstimateDueDate(first?.dueDate, earliestDueDate, latestDueDate),
        };
      });
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [bootstrap.user.id, bootstrap.user.role, earliestDueDate, latestDueDate, owners, setInquiries]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const submit = async () => {
    setBusy(true); setError("");
    try { await onCreated(await createEstimate(form)); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={uiText("New estimate from inquiry")} subtitle="SQL Server ออกเลข Estimate และสร้าง R00 ภายใน transaction เดียว" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || loading || !form.inquiryId || !form.ownerId || !form.dueDate} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Creating…" : "Create R00"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading inquiries…"} /></div> : inquiries.length ? <div className="form-grid two">
      <Field label="Registered inquiry *" span={2}><select value={form.inquiryId} onChange={(event) => { const inquiry = inquiries.find((item) => item.id === Number(event.target.value)); const requestedOwner = owners.find((owner) => owner.id === inquiry?.estimateOwnerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id; setForm((current) => ({ ...current, inquiryId: Number(event.target.value), ownerId: requestedOwner ?? current.ownerId, dueDate: normalizeEstimateDueDate(inquiry?.dueDate, earliestDueDate, latestDueDate) })); }}>{inquiries.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName} <LocalizedText text={"·"} /> {item.customerName}</option>)}</select></Field>
      <div className="span-2 info-strip" role="status"><Icon name="check" /><span><LocalizedText text={"The estimator and due date come from the inquiry · contingency starts at 5%"} /></span></div>
      <details className="span-2"><summary><LocalizedText text={"ปรับผู้ประเมิน กำหนดส่ง หรือ Contingency"} /></summary><div className="form-grid two" style={{marginTop:12}}>
        <Field label="Estimate owner *"><select value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field>
        <Field label="Due date *" hint="Today through five years"><input type="date" min={earliestDueDate} max={latestDueDate} value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
        <Field label="Contingency %"><input type="number" min="0" max="100" step="0.01" value={form.contingencyRate} onChange={(event) => setForm((current) => ({ ...current, contingencyRate: Number(event.target.value) }))} /></Field>
      </div></details>
    </div> : <EmptyState icon="inbox" title="No inquiry available" message="ทุก Inquiry มี Estimate แล้ว หรือบัญชีนี้ไม่มี Inquiry ที่อ่านได้" />}
  </Modal>;
}

function ProductionEstimateWorkspace({ estimateId, bootstrap, notify, refreshBootstrap, onBack, onListChanged }: Props & { estimateId: number; onBack: () => void; onListChanged: () => Promise<void> }) {
  const [workspace, setWorkspace] = useState<EstimateCostWorkspace | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const [classificationDirty, setClassificationDirty] = useState(false);
  const [costFocus, setCostFocus] = useState<string | null>(null);
  const clearCostFocus = useCallback(() => setCostFocus(null), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [costEditor, setCostEditor] = useState<EstimateCostItem | "new" | null>(null);
  const [costSeed, setCostSeed] = useState<CostItemSeed>({});
  const [manhourEditor, setManhourEditor] = useState<EstimateManhourLine | "new" | null>(null);
  const [manhourSeed, setManhourSeed] = useState<ManhourSeed>({});
  const [expenseEditor, setExpenseEditor] = useState<EstimateExpenseLine | "new" | null>(null);
  const [expenseSeed, setExpenseSeed] = useState<ExpenseSeed>({});
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [otherEditor, setOtherEditor] = useState<EstimateOtherCostLine | "new" | null>(null);
  const [assignmentCreateOpen, setAssignmentCreateOpen] = useState(false);
  const [assignmentEditor, setAssignmentEditor] = useState<EstimateAssignment | null>(null);
  const [workflowAction, setWorkflowAction] = useState<"submit" | "approve" | "request-revision" | "create-revision" | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setWorkspace(await loadEstimateCostWorkspace(estimateId)); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [estimateId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const reorder: ReorderEstimate = async (sourceType, orderedIds, move) => {
    if (!workspace || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/estimates/${estimateId}/line-order`, { method: "PUT", body: JSON.stringify({ sourceType, orderedIds, move, estimateRowVersion: workspace.header.rowVersion }) });
      await afterMutation(move ? "ย้ายรายการและบันทึกลำดับแล้ว / Item moved" : "บันทึกลำดับแล้ว / Order saved");
    } catch (error) { await mutationError(error); }
    finally { setBusy(false); }
  };
  const afterMutation = async (message: string) => {
    notify(message);
    await Promise.all([load(), onListChanged(), refreshBootstrap()]);
  };
  const mutationError = async (requestError: unknown) => {
    const message = toError(requestError);
    setError(message);
    notify(message);
    if (requestError instanceof ApiClientError && requestError.status === 409) {
      setCostEditor(null);
      setCostSeed({});
      setManhourEditor(null);
      setManhourSeed({});
      setExpenseEditor(null);
      setExpenseSeed({});
      setPackageEditorOpen(false);
      setOtherEditor(null);
      setAssignmentEditor(null);
      setWorkflowAction(null);
      await load();
    }
  };
  const removeModule = async (group: CostModuleGroup) => {
    if (!workspace || busy || !window.confirm(`ลบ Main Module "${group.module}" และรายการต้นทุนทั้งหมด ${group.lines.length} รายการ? การลบนี้มีบันทึกประวัติ
Remove this module and all ${group.lines.length} cost items?`)) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/estimates/${estimateId}/cost-modules/remove`, { method: "POST", body: JSON.stringify({ categoryCode: group.categoryCode, module: group.module, estimateRowVersion: workspace.header.rowVersion }) });
      await afterMutation("ลบ Main Module แล้ว / Main module removed");
    } catch (error) { await mutationError(error); }
    finally { setBusy(false); }
  };
  const removeLine = async (kind: "cost" | "manhour" | "expense" | "other", id: number, rowVersion: string) => {
    if (!workspace || !window.confirm("Remove this line from the current revision? This action is audited.")) return;
    setBusy(true); setError("");
    try {
      if (kind === "cost") await removeCostItem(estimateId, id, workspace.header.rowVersion, rowVersion, "Removed from estimate workspace");
      if (kind === "manhour") await removeEstimateManhour(estimateId, id, workspace.header.rowVersion, rowVersion, "Removed from estimate workspace");
      if (kind === "expense") await removeEstimateExpense(estimateId, id, workspace.header.rowVersion, rowVersion, "Removed from estimate workspace");
      if (kind === "other") await removeEstimateOtherCost(estimateId, id, workspace.header.rowVersion, rowVersion, "Removed from estimate workspace");
      await afterMutation("Line removed");
    } catch (requestError) { await mutationError(requestError); }
    finally { setBusy(false); }
  };

  if (!workspace) return <><button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Estimate Cost"} /></button>{error ? <LoadError message={error} retry={() => { void load(); }} /> : null}{loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading estimate workspace…"} /></div> : null}</>;

  const header = workspace.header;
  const totals = header.totals;
  const capabilities = workspace.capabilities;
  const currentLate = header.dueDate < businessDate() && !["Approved", "Locked"].includes(header.status);
  const validationCount = workspace.validationIssues.length;
  const criticalIssues = workspace.validationIssues.filter(isCriticalValidationIssue);
  const warningIssues = workspace.validationIssues.filter((issue) => !isCriticalValidationIssue(issue));
  const criticalCount = criticalIssues.length;
  const warningCount = warningIssues.length;
  const exportWorkspace = () => {
    if (header.status !== "Approved") return;
    const rows: (string | number | null)[][] = [
      ["ESTIMATE COST — LIVE PRODUCTION DATA"],
      ["Estimate", header.number, "Revision", revisionCode(header.revision), "Status", header.status],
      ["Inquiry", header.inquiryNumber, "Customer", header.customerName, "Project", header.projectName],
      ["Owner", header.ownerName, "Created", header.createdDate, "Due", header.dueDate],
      [],
      ["COST ITEMS"],
      ["Category code", "Category", "Subcategory", "Module", "Item code", "Description", "Brand", "Model", "Specification", "Supplier", "Qty", "Unit", "Unit cost", "Line total", "Price source", "Reference", "Reference project", "Price date", "Owner", "Status", "Remark", "Updated"],
      ...workspace.costItems.map((line) => [line.categoryCode, line.category, line.subcategory, line.module, line.itemCode, line.description, line.brand, line.model, line.specification, line.supplierName, numberOf(line.quantity), line.unit, numberOf(line.unitCost), numberOf(line.lineTotal), line.priceSource, line.referenceNumber, line.referenceProject, line.priceDate, line.ownerName, line.status, line.remark, line.updatedAt]),
      [], ["ENGINEERING MAN-HOUR"],
      ["Package", "Activity", "Department", "Level", "Cost type", "Provider", "Supplier", "Quotation", "Quotation date", "Engineers", "Man-days", "Hours/day", "Daily rate", "Man-hours", "Line cost", "Owner", "Remark", "Updated"],
      ...workspace.manhourLines.map((line) => [line.package, line.activity, line.department, line.level, line.costType, line.provider, line.supplierName, line.quotationNumber, line.priceDate, numberOf(line.engineers), numberOf(line.manDays), numberOf(line.hoursPerDay), numberOf(line.dailyRate), numberOf(line.manHours), numberOf(line.lineCost), line.ownerName, line.remark, line.updatedAt]),
      [], ["PROJECT EXPENSE"],
      ["Package", "Type", "Description", "Cost type", "Supplier", "Reference", "Qty", "Unit", "Unit cost", "Line total", "Owner", "Remark", "Updated"],
      ...workspace.expenseLines.map((line) => [line.package, line.expenseType, line.description, line.costType, line.supplierName, line.referenceNumber, numberOf(line.quantity), line.unit, numberOf(line.unitCost), numberOf(line.lineTotal), line.ownerName, line.remark, line.updatedAt]),
      [], ["OTHER PROJECT COST"],
      ["Category", "Description", "Qty", "Unit", "Unit cost", "Line total", "Remark"],
      ...workspace.otherCostLines.map((line) => [line.category, line.description, numberOf(line.quantity), line.unit, numberOf(line.unitCost), numberOf(line.lineTotal), line.remark]),
      [], ["ASSIGNMENTS"],
      ["Section", "Owner", "Support", "Due date", "Status", "Progress %", "Comment"],
      ...workspace.assignments.map((assignment) => [assignment.section, assignment.ownerName, assignment.supportName, assignment.dueDate, assignment.status, numberOf(assignment.progress), assignment.comment]),
      [], ["REVISION HISTORY"],
      ["Revision", "Reason", "Description", "Created by", "Created", "Reviewed by", "Reviewed", "Status", "Total"],
      ...workspace.revisionHistory.map((revision) => [revision.code, revision.reason, revision.description, revision.createdByName, revision.createdAt, revision.reviewedByName, revision.reviewedAt, revision.status, numberOf(revision.total)]),
      [], ["VALIDATION"],
      ["Severity", "Code", "Message", "Entity type", "Entity ID"],
      ...workspace.validationIssues.map((issue) => [issue.severity, issue.code, issue.message, issue.entityType, issue.entityId]),
      [], ["TOTALS"],
      ...(ESTIMATE_OVERHEAD_ENABLED ? [["Overhead state", header.overhead?.state ?? "Missing"], ["Overhead policy version", header.overhead?.policyVersion ?? null], ["Overhead hourly rate", header.overhead?.hourlyRate ?? null], ["Overhead eligible hours", header.overhead?.eligibleDirectHours ?? null], ["Overhead", totals.overhead ?? null]] : []),
      ["Material", numberOf(totals.material)], ["Engineering", numberOf(totals.engineering)], ["Outsource", numberOf(totals.outsource)], ["Transportation", numberOf(totals.transportation)], ["Accommodation", numberOf(totals.accommodation)], ["Other", numberOf(totals.other)], [`Contingency ${formatNumber(header.contingencyRate)}%`, numberOf(totals.contingency)], ["TOTAL ESTIMATED COST", numberOf(totals.total)],
    ];
    exportXlsx(rows, `${header.number}_${revisionCode(header.revision)}_${header.status.replaceAll(" ", "-")}_EstimateCost.xlsx`);
    notify("Estimate exported from live workspace");
  };

  return <>
    <div className="breadcrumb"><button type="button" onClick={onBack}><LocalizedText text={"Estimate Cost"} /></button><Icon name="chevronRight" /><span>{header.number}</span></div>
    <header className="estimate-heading-compact">
      <div className="estimate-title-line"><h1>{header.projectName}</h1><Badge tone={["Approved", "Locked"].includes(header.status) ? "green" : header.status === "Revision Required" ? "amber" : "blue"}>{header.status}</Badge></div>
      <div className="estimate-heading-reference">{header.number} · {revisionCode(header.revision)} <span> | </span> {header.customerCode} — {header.customerName} <span> | </span> Inquiry {header.inquiryNumber}</div>
      <div className="estimate-heading-owner"><span><LocalizedText text="Estimate owner" />: <strong>{header.ownerName}</strong></span><span><LocalizedText text="Due" />: <strong className={currentLate ? "red-text" : undefined}>{formatDate(header.dueDate)}</strong></span></div>
    {header.archived ? <div className="info-strip"><Icon name="lock" /><LocalizedText text="Archived document — read only" /></div> : null}
    <div className="workspace-bar estimate-workspace-bar">
      <details className="estimate-more"><summary className="btn default">{estimateUxCopy(currentLocale(), "เพิ่มเติม", "More", "その他")} <Icon name="chevronDown" /></summary><div className="estimate-more-content">
      <div className="estimate-document-meta"><span><LocalizedText text="Created" />: {formatDate(header.createdDate)}</span></div>
      <DocumentLifecycleButton kind="estimates" id={header.id} notify={notify} onChanged={async () => { onBack(); await refreshBootstrap(); }} />
      <button className="btn default" type="button" disabled={loading || busy} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      <button className="btn default" type="button" disabled={header.status !== "Approved"} title={header.status !== "Approved" ? "Approve the estimate before export" : undefined} onClick={exportWorkspace}><Icon name="download" /><LocalizedText text={"Export Excel"} /></button>
      <button className="btn default" type="button" onClick={() => setTab("validation")}><Icon name="shield" /><LocalizedText text={"Validation"} />{validationCount ? <span className={`badge ${criticalCount ? "red" : "amber"}`}>{validationCount}</span> : <span className="badge green"><LocalizedText text={"OK"} /></span>}</button>
      <button className="btn ghost" type="button" onClick={() => setTab("assignment")}><LocalizedText text="Assignment" /></button>
      <button className="btn ghost" type="button" onClick={() => setTab("revision")}><LocalizedText text="Revision Control" /></button>
      <button className="btn ghost" type="button" onClick={() => setTab("review")}><LocalizedText text="Engineering Review" /></button>
      </div></details>
      <span className="spacer" />
      {capabilities.canSubmit ? <button className="btn primary" type="button" disabled={busy || criticalCount > 0 || classificationDirty} onClick={() => setWorkflowAction("submit")}><Icon name="send" /><LocalizedText text={"Submit Review"} /></button> : null}
      {capabilities.canRequestRevision ? <button className="btn warn" type="button" disabled={busy} onClick={() => setWorkflowAction("request-revision")}><Icon name="refresh" /><LocalizedText text={"Request Revision"} /></button> : null}
      {capabilities.canCreateRevision ? <button className="btn primary" type="button" disabled={busy} onClick={() => setWorkflowAction("create-revision")}><Icon name="gitBranch" /><LocalizedText text={"Create Revision"} /></button> : null}
      {capabilities.canApprove ? <button className="btn success" type="button" disabled={busy || criticalCount > 0 || classificationDirty} onClick={() => setWorkflowAction("approve")}><Icon name="checkCircle" /><LocalizedText text={"Approve"} /></button> : null}
    </div>
    </header>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {classificationDirty ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{estimateUxCopy(currentLocale(), "มีการจัดหมวดที่ยังไม่บันทึก กรุณาบันทึกก่อนส่งตรวจ", "Save category changes before submitting for review.", "提出前に分類の変更を保存してください。")}</span><button className="link-btn" type="button" onClick={() => setTab("summary")}>{estimateUxCopy(currentLocale(), "กลับไปบันทึก", "Return to save", "保存へ戻る")}</button></div> : null}
    {validationCount ? <div className="info-strip estimate-validation-strip estimate-advisory"><Icon name="alertTriangle" /><span>{criticalCount ? <strong className="red-text">{criticalCount} {estimateUxCopy(currentLocale(), "รายการต้องแก้ก่อนส่งตรวจ", "issues to resolve before submission", "提出前に修正が必要")}</strong> : null}{criticalCount && warningCount ? " · " : null}{warningCount ? <span>{warningCount} {estimateUxCopy(currentLocale(), "คำเตือนที่ควรทบทวน (ไม่ขัดขวางการส่ง)", "advisory warnings (do not block submission)", "警告（提出を妨げません）")}</span> : null}</span><span className="spacer" /><button className="link-btn" type="button" onClick={() => setTab("validation")}><LocalizedText text="Open validation" /><Icon name="arrowRight" /></button></div> : null}
    {["Approved", "Locked"].includes(header.status) ? <div className="info-strip green"><Icon name="lock" /><span><LocalizedText text={"Revision นี้ถูกล็อกแล้ว ข้อมูลต้นทุนอ่านได้อย่างเดียว การแก้ไขต้องผ่าน revision workflow"} /></span></div> : null}
    <Tabs active={tab} onChange={setTab} tabs={[
      { id: "summary", label: estimateUxCopy(currentLocale(), "สรุปต้นทุน", "Cost summary", "原価サマリー") }, { id: "cost", label: estimateUxCopy(currentLocale(), "รายการต้นทุน", "Cost Items", "原価明細"), count: workspace.costItems.length }, { id: "manhour", label: estimateUxCopy(currentLocale(), "ค่าแรง", "Labor", "労務費"), count: workspace.manhourLines.length }, { id: "other", label: estimateUxCopy(currentLocale(), "ค่าใช้จ่ายอื่น", "Other costs", "その他費用"), count: workspace.otherCostLines.length },
    ]} />
    {!["summary", "cost", "manhour", "other"].includes(tab) ? <div className="estimate-secondary-heading"><button className="btn ghost sm" type="button" onClick={() => setTab("summary")}><Icon name="chevronLeft" />{estimateUxCopy(currentLocale(), "กลับสรุปต้นทุน", "Back to cost summary", "原価サマリーへ")}</button><strong><LocalizedText text={tab === "assignment" ? "Assignment" : tab === "revision" ? "Revision Control" : tab === "review" ? "Engineering Review" : "Validation"} /></strong></div> : null}

    <div hidden={tab !== "summary"}><EstimateErpSheetPanel workspace={workspace} notify={notify} onChanged={afterMutation} onDirtyChange={setClassificationDirty} />
    </div>
    {tab === "summary" ? <>
      {header.status === "Revision Required" ? <EstimateNextSteps workspace={workspace} busy={busy} onOpen={setTab} onSubmit={() => setWorkflowAction("submit")} /> : null}
      {ESTIMATE_OVERHEAD_ENABLED ? <EstimateOverheadPanel workspace={workspace} bootstrap={bootstrap} onSaved={async () => { await afterMutation("Overhead updated"); }} /> : null}
      <details className="estimate-secondary"><summary>{estimateUxCopy(currentLocale(), "รายละเอียดต้นทุนและความพร้อม", "Cost breakdown and readiness", "原価と準備状況")}</summary>
    <section className="summary-strip">
      <SummaryTile label="Material Cost" value={formatMoney(totals.material)} note="01–05" />
      <SummaryTile label="Engineering cost" value={formatMoney(totals.engineering)} note={`${formatNumber(workspace.manhourLines.reduce((sum, line) => sum + numberOf(line.manDays) * numberOf(line.engineers), 0))} MD`} />
      <SummaryTile label="Outsource" value={formatMoney(totals.outsource)} note="Supplier and other outsource" />
      <SummaryTile label="Transportation" value={formatMoney(totals.transportation)} note="Material and project expense" />
      <SummaryTile label="Accommodation" value={formatMoney(totals.accommodation)} note="Hotel and per diem" />
      <SummaryTile label="Other Cost" value={formatMoney(totals.other)} note="06 and 10" />
      <SummaryTile label={`Contingency ${formatNumber(header.contingencyRate)}%`} value={formatMoney(totals.contingency)} note="Calculated by SQL Server" />
      <SummaryTile label="Total Estimated Cost" value={formatMoney(totals.total)} note="Internal cost · no margin" strong />
    </section>
<EstimateSummaryTab workspace={workspace} /></details></> : null}
    {tab === "cost" ? <EstimateCostItemsTab onRemoveModule={removeModule} onReorder={reorder} onExcelImported={async () => { await afterMutation("นำเข้า Excel ทั้งชุดสำเร็จ"); }} bootstrap={bootstrap} workspace={workspace} busy={busy} focusModuleKey={costFocus} onFocusHandled={clearCostFocus} onAdd={(seed = {}) => { setCostSeed(seed); setCostEditor("new"); }} onBulkAddCost={async (seeds, message) => {
      if (!seeds.length) return false;
      setBusy(true); setError("");
      let rowVersion = workspace.header.rowVersion;
      let saved = 0;
      try {
        for (const seed of seeds) {
          const result = await createCostItem(estimateId, { ...seed, estimateRowVersion: rowVersion } as CostItemInput);
          rowVersion = result.estimateRowVersion;
          saved += 1;
        }
        await afterMutation(`${message} · ${saved} line(s) written to SQL Server`);
        return true;
      } catch (requestError) {
        notify(`${saved} line(s) saved before the operation stopped`);
        await mutationError(requestError);
        return false;
      } finally { setBusy(false); }
    }} onApplyTemplate={async (input) => {
      if (!workspace) return false;
      setBusy(true); setError("");
      try {
        const result = await applyModuleTemplate(estimateId, { ...input, estimateRowVersion: workspace.header.rowVersion });
        await afterMutation(`${result.lines} line(s) added to "${result.module}" from ${result.reference}`);
        return true;
      } catch (requestError) { await mutationError(requestError); return false; }
      finally { setBusy(false); }
    }} onSaveTemplate={async (input) => {
      setBusy(true); setError("");
      try {
        const result = await createModuleTemplateFromEstimate({ estimateId, ...input });
        notify(`${result.code} saved to the master library · ${result.lineCount} line(s)`);
        return true;
      } catch (requestError) { await mutationError(requestError); return false; }
      finally { setBusy(false); }
    }} onQuickAddCost={async (input) => {
      setBusy(true); setError("");
      try { await createCostItem(estimateId, input); await afterMutation("Cost item created · press Enter to continue adding rows"); return true; }
      catch (requestError) { await mutationError(requestError); return false; }
      finally { setBusy(false); }
    }} onCopyFrom={async (input) => {
      if (!workspace) return false;
      setBusy(true); setError("");
      try {
        const result = await copyEstimateContent(estimateId, { ...input, estimateRowVersion: workspace.header.rowVersion, ownerId: workspace.header.ownerId });
        await afterMutation(copyResultMessage(result));
        return true;
      } catch (requestError) { await mutationError(requestError); return false; }
      finally { setBusy(false); }
    }} onEdit={(line) => { setCostSeed({}); setCostEditor(line); }} onRemove={(line) => { void removeLine("cost", line.id, line.rowVersion); }} /> : null}
    {tab === "manhour" ? <EstimateManhourTab
      bootstrap={bootstrap}
      workspace={workspace}
      busy={busy}
      onNewPackage={() => setPackageEditorOpen(true)}
      onAddManhour={(seed = {}) => { setManhourSeed(seed); setManhourEditor("new"); }}
      onQuickAddManhour={async (input) => {
        setBusy(true); setError("");
        try { await createEstimateManhour(estimateId, input); await afterMutation("Activity created · press Enter to continue adding rows"); return true; }
        catch (requestError) { await mutationError(requestError); return false; }
        finally { setBusy(false); }
      }}
      onSaveEffort={async (line, effort, lineRowVersion) => {
        setBusy(true); setError("");
        try { await updateEstimateManhourEffort(estimateId, line.id, workspace.header.rowVersion, lineRowVersion, effort); await afterMutation("Effort updated"); return true; }
        catch (requestError) { await mutationError(requestError); return false; }
        finally { setBusy(false); }
      }}
      onLaborLibraryChanged={async (message) => { await afterMutation(message); }}
      onEditManhour={(line) => { setManhourSeed({}); setManhourEditor(line); }}
      onRemoveManhour={(line) => { void removeLine("manhour", line.id, line.rowVersion); }}
      onAddExpense={(seed = {}) => { setExpenseSeed(seed); setExpenseEditor("new"); }}
      onEditExpense={(line) => { setExpenseSeed({}); setExpenseEditor(line); }}
      onRemoveExpense={(line) => { void removeLine("expense", line.id, line.rowVersion); }}
    /> : null}
    {tab === "other" ? <EstimateOtherCostTab key={header.rowVersion} workspace={workspace} busy={busy} onAddOther={() => setOtherEditor("new")} onEditOther={setOtherEditor} onRemoveOther={(line) => { void removeLine("other", line.id, line.rowVersion); }} onUpdateContingency={async (rate) => {
      setBusy(true); setError("");
      try { await updateEstimateContingency(estimateId, rate, header.rowVersion); await afterMutation("Contingency updated"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {tab === "assignment" ? <EstimateAssignmentTab workspace={workspace} onAssign={() => setAssignmentCreateOpen(true)} onEdit={setAssignmentEditor} /> : null}
    {tab === "validation" ? <EstimateValidationTab workspace={workspace} onFix={(issue) => {
      setTab(estimateIssueTab(issue));
      const cost = workspace.costItems.find((line) => issue.entityType === "CostItem" && line.id === issue.entityId);
      const manhour = workspace.manhourLines.find((line) => issue.entityType === "ManhourLine" && line.id === issue.entityId);
      const expense = workspace.expenseLines.find((line) => issue.entityType === "ExpenseLine" && line.id === issue.entityId);
      const other = workspace.otherCostLines.find((line) => issue.entityType === "OtherCostLine" && line.id === issue.entityId);
      if (cost?.canEdit) { setCostSeed({}); setCostEditor(cost); }
      if (manhour?.canEdit) { setManhourSeed({}); setManhourEditor(manhour); }
      if (expense?.canEdit) { setExpenseSeed({}); setExpenseEditor(expense); }
      if (other && capabilities.canEditOtherCosts) setOtherEditor(other);
    }} /> : null}
    {tab === "revision" ? <div className="stack"><EstimateImportHistory key={header.rowVersion} estimateId={header.id} /><EstimateRevisionTab revisions={workspace.revisionHistory} currentRevision={header.revision} currentTotal={numberOf(totals.total)} /><div><EstimateCompareTab revisions={workspace.revisionHistory} currentRevision={header.revision} currentTotal={numberOf(totals.total)} /></div></div> : null}

    {tab === "review" ? <EstimateReviewTab workspace={workspace} onWorkflow={action => { if (classificationDirty && (action === "submit" || action === "approve")) { setTab("summary"); return; } setWorkflowAction(action); }} /> : null}

    {costEditor ? <CostItemEditor bootstrap={bootstrap} workspace={workspace} line={costEditor === "new" ? null : costEditor} seed={costSeed} busy={busy} onClose={() => { setCostEditor(null); setCostSeed({}); }} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateCostItem(estimateId, lineId, input); else await createCostItem(estimateId, input); setCostEditor(null); setCostSeed({}); await afterMutation(lineId ? "Cost item updated" : "Cost item created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {packageEditorOpen ? <WorkPackageEditor busy={busy} onClose={() => setPackageEditorOpen(false)} onContinue={(seed) => {
      setPackageEditorOpen(false);
      setManhourSeed(seed);
      setManhourEditor("new");
    }} /> : null}
    {manhourEditor ? <ManhourEditor bootstrap={bootstrap} workspace={workspace} line={manhourEditor === "new" ? null : manhourEditor} seed={manhourSeed} busy={busy} onClose={() => { setManhourEditor(null); setManhourSeed({}); }} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateManhour(estimateId, lineId, input); else await createEstimateManhour(estimateId, input); setManhourEditor(null); setManhourSeed({}); await afterMutation(lineId ? "Man-hour updated" : "Man-hour created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {expenseEditor ? <ExpenseEditor bootstrap={bootstrap} workspace={workspace} line={expenseEditor === "new" ? null : expenseEditor} seed={expenseSeed} busy={busy} onClose={() => { setExpenseEditor(null); setExpenseSeed({}); }} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateExpense(estimateId, lineId, input); else await createEstimateExpense(estimateId, input); setExpenseEditor(null); setExpenseSeed({}); await afterMutation(lineId ? "Expense updated" : "Expense created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {otherEditor ? <OtherCostEditor workspace={workspace} line={otherEditor === "new" ? null : otherEditor} busy={busy} onClose={() => setOtherEditor(null)} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateOtherCost(estimateId, lineId, input); else await createEstimateOtherCost(estimateId, input); setOtherEditor(null); await afterMutation(lineId ? "Other cost updated" : "Other cost created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {assignmentCreateOpen ? <CreateAssignmentModal bootstrap={bootstrap} workspace={workspace} busy={busy} onClose={() => setAssignmentCreateOpen(false)} onSave={async (input) => {
      setBusy(true); setError("");
      try { const result = await createEstimateAssignment(estimateId, input); setAssignmentCreateOpen(false); await afterMutation(assignmentResultMessage("created", result)); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {assignmentEditor ? <AssignmentEditor bootstrap={bootstrap} workspace={workspace} assignment={assignmentEditor} busy={busy} onClose={() => setAssignmentEditor(null)} onSave={async (input) => {
      setBusy(true); setError("");
      try { const result = await updateEstimateAssignment(estimateId, assignmentEditor.id, input); setAssignmentEditor(null); await afterMutation(assignmentResultMessage("updated", result)); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {workflowAction ? <WorkflowModal action={workflowAction} estimate={header.number} busy={busy} onClose={() => setWorkflowAction(null)} onConfirm={async (comment) => {
      setBusy(true); setError("");
      try { await estimateWorkflow(estimateId, workflowAction, header.rowVersion, comment); const label = workflowAction === "approve" ? "approved and locked" : workflowAction === "submit" ? "submitted for engineering review" : workflowAction === "create-revision" ? "opened a new revision" : "returned for revision"; setWorkflowAction(null); await afterMutation(`${header.number} ${label}`); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
  </>;
}

/* Cost items are grouped the way an engineer thinks about the machine: one band per
   main module inside a discipline. The summary reuses this grouping, so the module
   totals on the two tabs can never disagree. */
type CostModuleGroup = {
  key: string;
  module: string;
  categoryCode: string;
  category: string;
  lines: EstimateCostItem[];
  total: number;
  needPrice: number;
  needSupplier: number;
};

const MATERIAL_CODES = ["01", "02", "03", "04", "05"];
const moduleKeyOf = (categoryCode: string, module: string) => `${categoryCode}::${module}`;

function costModuleGroups(lines: EstimateCostItem[]): CostModuleGroup[] {
  const groups = new Map<string, CostModuleGroup>();
  for (const line of lines) {
    const moduleName = line.module.trim();
    const key = moduleName ? moduleKeyOf(line.categoryCode, moduleName) : (line.priceSetKey ? `set:${line.priceSetKey}` : `standalone:${line.id}`);
    let group = groups.get(key);
    if (!group) {
      group = { key, module: moduleName, categoryCode: line.categoryCode, category: line.category, lines: [], total: 0, needPrice: 0, needSupplier: 0 };
      groups.set(key, group);
    }
    group.lines.push(line);
    group.total += numberOf(line.lineTotal);
    if (numberOf(line.unitCost) <= 0 && (!line.priceSetKey || line.isPriceSet)) group.needPrice += 1;
    else if (!line.supplierId && MATERIAL_CODES.includes(line.categoryCode)) group.needSupplier += 1;
  }
  for (const group of groups.values()) {
    const ordered: EstimateCostItem[] = []; const seen = new Set<string>();
    for (const line of group.lines) { if (!line.priceSetKey) ordered.push(line); else if (!seen.has(line.priceSetKey)) { seen.add(line.priceSetKey); ordered.push(...group.lines.filter(item => item.priceSetKey === line.priceSetKey).sort((a,b) => Number(Boolean(b.isPriceSet))-Number(Boolean(a.isPriceSet)))); } }
    group.lines=ordered;
  }
  return [...groups.values()].sort((left, right) => left.categoryCode.localeCompare(right.categoryCode));
}

function EstimateNextSteps({ workspace, busy, onOpen, onSubmit }: { workspace: EstimateCostWorkspace; busy: boolean; onOpen: (tab: WorkspaceTab) => void; onSubmit: () => void }) {
  if (workspace.header.archived || workspace.header.status === "Cancelled") return null;
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const { capabilities } = workspace;
  const criticalCount = workspace.validationIssues.filter(isCriticalValidationIssue).length;
  const warningCount = workspace.validationIssues.length - criticalCount;
  const action = estimateNextAction({ criticalCount, warningCount, costItemCount: workspace.costItems.length, manhourLineCount: workspace.manhourLines.length, canEditCostItems: capabilities.canEditCostItems, canEditManhour: capabilities.canEditManhour, status: workspace.header.status, canSubmit: capabilities.canSubmit, canApprove: capabilities.canApprove });
  const content = {
    "address-revision": [copy("แก้ตามที่ผู้ตรวจส่งกลับ", "Address what the reviewer sent back", "差し戻し内容に対応"), copy("เปิด Revision Control เพื่ออ่านเหตุผลฉบับเต็ม", "Open Revision Control for the full note", "改訂管理で差し戻し理由を確認")],
    "resolve-blockers": [copy(`แก้ ${criticalCount} รายการที่ปิดกั้นการส่งตรวจ`, `Resolve ${criticalCount} submission blocker(s)`, `送信を妨げる${criticalCount}件を修正`), copy("เปิด Validation เพื่อไปยังรายการที่ต้องแก้", "Open Validation and go directly to the affected lines.", "Validationから対象明細を開きます。")],
    "add-cost": [copy("เพิ่มรายการต้นทุนรายการแรก", "Add the first cost item", "最初の原価明細を追加"), copy("เริ่มจากอุปกรณ์ ซอฟต์แวร์ หรือใช้ Template", "Start with equipment, software or a template.", "機器、ソフトウェア、テンプレートから開始します。")],
    "add-effort": [copy("เพิ่มค่าแรงวิศวกรรม", "Add engineering effort", "技術工数を追加"), copy("ระบุงาน จำนวนคน และวันทำงานก่อนตรวจความพร้อม", "Add the activity, staffing and work days before validation.", "作業、人数、日数を入力してから確認します。")],
    "submit-review": [copy("ส่ง Estimate ให้ Engineering Review", "Submit for Engineering Review", "技術レビューへ送信"), warningCount
      ? copy(`มีคำเตือน ${warningCount} รายการที่ยังไม่ได้ตรวจ ซึ่งไม่ปิดกั้นการส่ง`, `${warningCount} advisory warning(s) are still open. They do not block submission.`, `未確認の注意事項が${warningCount}件あります。送信は妨げられません。`)
      : copy("ไม่มีข้อผิดพลาดที่ปิดกั้น สามารถตรวจสรุปแล้วส่งได้", "No blocking errors remain. Review the totals and submit.", "重大エラーはありません。合計を確認して送信できます。")],
    approve: [copy("ตรวจและอนุมัติ Estimate", "Review and approve the Estimate", "見積を確認して承認"), copy("ตรวจยอดต้นทุนและคำเตือนก่อนอนุมัติ", "Review totals and advisory warnings before approval.", "承認前に合計と注意事項を確認します。")],
    "review-warnings": [copy(`ตรวจคำเตือน ${warningCount} รายการ`, `Review ${warningCount} advisory warning(s)`, `${warningCount}件の注意事項を確認`), copy("คำเตือนไม่ปิดกั้น workflow แต่ควรตรวจความถูกต้อง", "Warnings do not block workflow, but should be checked.", "注意事項は処理を妨げませんが、確認してください。")],
    "review-summary": [copy("ตรวจสรุป Estimate", "Review the Estimate summary", "見積サマリーを確認"), copy("ข้อมูลปัจจุบันไม่มีงานที่ระบบระบุว่าต้องแก้", "There is no system-identified action for the current state.", "現在、システムが要求する修正はありません。")],
  } as const;
  const [title, subtitle] = content[action.kind];
  /* `description` is the FOR JSON PATH snapshot the workflow archives with each
     revision (estimates.ts:151), not prose — printing it puts the whole estimate
     on screen. `reason` carries the words a person typed, and only a row whose
     own status is "Revision Required" is a send-back: approving writes the
     literal "Approved" into the same column (estimates.ts:350). */
  const sentBack = action.kind === "address-revision"
    ? [...workspace.revisionHistory].reverse().find((entry) => entry.status === "Revision Required") ?? null
    : null;
  return <Panel title={copy("สิ่งที่ต้องทำต่อ", "Next action", "次の作業")} subtitle={subtitle}>
    {sentBack ? <div className="info-strip amber" style={{ marginBottom: 12 }}>
      <Icon name="alertTriangle" />
      <span>
        <strong>{sentBack.reason.trim() || copy("ไม่ได้ระบุเหตุผล", "No reason was given", "理由の記載なし")}</strong>
        {sentBack.reviewedByName ? <> · {sentBack.reviewedByName}</> : null}
        {sentBack.reviewedAt ? <> · {formatDate(sentBack.reviewedAt)}</> : null}
      </span>
    </div> : null}
    {action.kind === "submit-review"
      ? <button className="btn primary" type="button" disabled={busy} onClick={onSubmit}><Icon name="send" />{title}</button>
      : <button className="btn primary" type="button" onClick={() => onOpen(action.tab)}><Icon name="arrowRight" />{title}</button>}
  </Panel>;
}

function EstimateSummaryTab({ workspace }: { workspace: EstimateCostWorkspace }) {
  const uiText = useUiText();
  const { header, costItems, manhourLines, expenseLines, otherCostLines } = workspace;
  const criticalCount = workspace.validationIssues.filter(isCriticalValidationIssue).length;
  const warningCount = workspace.validationIssues.length - criticalCount;
  const validationTone = criticalCount ? "error" : warningCount ? "warning" : "pass";
  const validationIcon = criticalCount ? "alertCircle" : warningCount ? "alertTriangle" : "checkCircle";
  const modules = costModuleGroups(costItems);
  const openLines = modules.reduce((sum, group) => sum + group.needPrice + group.needSupplier, 0);
  const manDays = manhourLines.reduce((sum, line) => sum + numberOf(line.manDays) * numberOf(line.engineers), 0);
  return <>
    <section className="grid-2">
      <Panel title={uiText("Readiness")} subtitle="ยอดเงินอยู่ในแถบด้านบนแล้ว หน้านี้ตอบว่าพร้อมส่งหรือยัง"><ul className="check-list">
        <li className={`check-item ${costItems.length ? "pass" : "warning"}`}><Icon name={costItems.length ? "checkCircle" : "alertTriangle"} /><div><strong>{costItems.length} <LocalizedText text={"cost item ·"} /> {modules.length} <LocalizedText text={"module"} /></strong><p>{!costItems.length ? "ยังไม่มีรายการอุปกรณ์" : openLines ? `${openLines} item ยังไม่มีราคาหรือผู้ขาย` : "ทุก item มีราคาและผู้ขายแล้ว"}</p></div></li>
        <li className={`check-item ${manhourLines.length ? "pass" : "warning"}`}><Icon name={manhourLines.length ? "checkCircle" : "alertTriangle"} /><div><strong>{formatNumber(manDays)} <LocalizedText text={"man-days"} /></strong><p>{manhourLines.length} <LocalizedText text={"man-hour line ·"} /> {expenseLines.length + otherCostLines.length} <LocalizedText text={"project cost line"} /></p></div></li>
        <li className={`check-item ${validationTone}`}><Icon name={validationIcon} /><div><strong>{workspace.validationIssues.length ? `${criticalCount} error · ${warningCount} warning` : "Server validation passed"}</strong><p>{criticalCount ? "Critical error ปิดกั้นการ submit และ approve" : warningCount ? "Warning เป็นคำเตือน ไม่ปิดกั้น workflow" : "ตรวจกับ revision ปัจจุบันแล้ว"}</p></div></li>
      </ul></Panel>
      <Panel title="Revision information"><dl className="def-list one"><div><dt><LocalizedText text={"Revision"} /></dt><dd><strong>{revisionCode(header.revision)}</strong></dd></div><div><dt><LocalizedText text={"Status"} /></dt><dd><Badge>{header.status}</Badge></dd></div><div><dt><LocalizedText text={"Last updated"} /></dt><dd>{formatDateTime(header.updatedAt)}</dd></div><div><dt><LocalizedText text={"Lock"} /></dt><dd>{header.lockedAt ? `${formatDateTime(header.lockedAt)} · ${header.lockedByName ?? "—"}` : "Not locked"}</dd></div></dl></Panel>
    </section>
  </>;
}

function EstimateCostItemsTab({ onRemoveModule, onReorder, onExcelImported, bootstrap, workspace, busy, focusModuleKey, onFocusHandled, onAdd, onBulkAddCost, onQuickAddCost, onCopyFrom, onApplyTemplate, onSaveTemplate, onEdit, onRemove }: { onRemoveModule: (group: CostModuleGroup) => Promise<void>; onReorder: ReorderEstimate; onExcelImported: () => Promise<void>; bootstrap: BootstrapData; workspace: EstimateCostWorkspace; busy: boolean; focusModuleKey: string | null; onFocusHandled: () => void; onAdd: (seed?: CostItemSeed) => void; onBulkAddCost: (seeds: CostItemSeed[], message: string) => Promise<boolean>; onQuickAddCost: (input: CostItemInput) => Promise<boolean>; onCopyFrom: (input: Omit<EstimateCopyInput, "estimateRowVersion" | "ownerId">) => Promise<boolean>; onApplyTemplate: (input: { templateId: number; module: string; modules: number; ownerId: number; keepReferencePrices: boolean }) => Promise<boolean>; onSaveTemplate: (input: { categoryCode: string; module: string; code: string; name: string; projectType: string; description: string }) => Promise<boolean>; onEdit: (line: EstimateCostItem) => void; onRemove: (line: EstimateCostItem) => void }) {
  const [setSelection,setSetSelection]=useState<number[]>([]);
  const [setEditor,setSetEditor]=useState<{members:EstimateCostItem[];header?:EstimateCostItem}|null>(null);
  const [setError,setSetError]=useState("");
  const [setBusy,setSetBusy]=useState(false);
  const detachSetItem=async(line:EstimateCostItem)=>{
    if(!window.confirm("นำรายการออกจากเซ็ต? ราคาต่อชิ้นจะเป็นรอราคา และต้องตรวจราคาใหม่ หากเป็นชิ้นสุดท้าย เซ็ตจะถูกลบด้วย"))return;
    setSetBusy(true);setSetError("");try{await apiRequest(`/api/v1/estimates/${workspace.header.id}/price-set-detach`,{method:"POST",body:JSON.stringify({lineId:line.id,estimateRowVersion:workspace.header.rowVersion})});await onExcelImported();}catch(error){setSetError(toError(error));}finally{setSetBusy(false);}
  };
  const [moduleEditor, setModuleEditor] = useState<{ key: string; title: string } | null>(null);
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const [category, setCategory] = useState("all");
  const [tool, setTool] = useState<"price" | "import" | "import-flat" | "copy" | "module" | "template" | null>(null);
  const [saveTarget, setSaveTarget] = useState<CostModuleGroup | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickCostDraft | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dense, setDense] = useState(true);
  const [pendingModule, setPendingModule] = useState<{ categoryCode: string; category: string; module: string } | null>(null);
  const [viewReady, setViewReady] = useState(false);
  const quickItemCodeRef = useRef<HTMLInputElement>(null);
  const bandRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const quickDraftOpen = Boolean(quickDraft);
  const quickDraftVersion = quickDraft?.version;
  useEffect(() => { if (quickDraftOpen) quickItemCodeRef.current?.focus(); }, [quickDraftOpen, quickDraftVersion]);

  /* Which modules the engineer left folded is a per-estimate preference, not data.
     A browser with site data blocked simply starts with everything open. */
  const viewKey = `estimate-cost-view:${workspace.header.id}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(viewKey) ?? "{}") as { collapsed?: unknown; dense?: unknown };
        if (Array.isArray(saved.collapsed)) setCollapsed(saved.collapsed.filter((key): key is string => typeof key === "string"));
        if (typeof saved.dense === "boolean") setDense(saved.dense);
      } catch {
        window.localStorage.removeItem(viewKey);
      }
      setViewReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [viewKey]);
  useEffect(() => {
    if (!viewReady) return;
    window.localStorage.setItem(viewKey, JSON.stringify({ collapsed, dense }));
  }, [viewKey, collapsed, dense, viewReady]);

  const canAdd = workspace.capabilities.canEditCostItems;
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const defaultOwnerId = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const presentCategories = COST_CATEGORIES.filter(([code]) => workspace.costItems.some((line) => line.categoryCode === code));
  /* Deleting the last item of the filtered discipline retires its chip, so the
     filter falls back here rather than leaving an empty table behind a tab
     that no longer exists. Derived, not stored: setting state from an effect
     would trip react-hooks/set-state-in-effect. */
  const activeCategory = category !== "all" && presentCategories.some(([code]) => code === category) ? category : "all";
  const groups = useMemo(() => costModuleGroups(activeCategory === "all" ? workspace.costItems : workspace.costItems.filter((line) => line.categoryCode === activeCategory)), [workspace.costItems, activeCategory]);
  const [draggedCostId, setDraggedCostId] = useState<number | null>(null);
  const [dropMarker, setDropMarker] = useState("");
  const clearDrag = () => { setDraggedCostId(null); setDropMarker(""); };
  const allowDrop = (event: React.DragEvent, marker: string) => {
    if (!canAdd || busy || quickSaving || draggedCostId === null) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropMarker(marker);
  };
  const dropCost = (event: React.DragEvent, targetId: number, after: boolean) => {
    event.preventDefault();
    const lineId = draggedCostId;
    clearDrag();
    if (!canAdd || busy || quickSaving || lineId === null || lineId === targetId) return;
    const source = workspace.costItems.find(line => line.id === lineId);
    const target = workspace.costItems.find(line => line.id === targetId);
    if (!source?.canEdit || !target) return;
    const ids = workspace.costItems.map(line => line.id);
    const ordered = insertCostLine(ids, lineId, targetId, after);
    const crossModule = source.categoryCode !== target.categoryCode || source.module !== target.module;
    if (!crossModule && ordered.every((id, index) => id === ids[index])) return;
    void onReorder("CostItem", ordered, { lineId, targetLineId: targetId });
  };
  const moveCostModule = (group: CostModuleGroup, direction: -1 | 1) => {
    const siblings = workspace.costItems.filter(line => line.categoryCode === group.categoryCode);
    const moved = moveModule(siblings, line => line.module.trim() ? moduleKeyOf(line.categoryCode, line.module.trim()) : `standalone:${line.id}`, group.key, direction);
    let offset = 0;
    const ordered = workspace.costItems.map(line => line.categoryCode === group.categoryCode ? moved[offset++] : line);
    void onReorder("CostItem", ordered.map(line => line.id));
  };
  const moveCostLine = (group: CostModuleGroup, index: number, direction: -1 | 1) => {
    const moved = moveSibling(group.lines, index, direction);
    const ids = new Set(group.lines.map(line => line.id)); let offset = 0;
    void onReorder("CostItem", workspace.costItems.map(line => ids.has(line.id) ? moved[offset++].id : line.id));
  };
  const visibleLines = groups.flatMap((group) => group.lines);
  const isCollapsed = (key: string) => collapsed.includes(key);
  const toggleModule = (key: string) => setCollapsed((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const pendingKey = pendingModule ? moduleKeyOf(pendingModule.categoryCode, pendingModule.module) : null;
  const showPending = Boolean(pendingModule && pendingKey && !groups.some((group) => group.key === pendingKey) && (category === "all" || category === pendingModule?.categoryCode));

  /* The module the summary asked for wins over whatever was folded before. */
  useEffect(() => {
    if (!focusModuleKey) return;
    const timer = window.setTimeout(() => {
      setCategory("all");
      if (focusModuleKey.startsWith("price-set:")) { const key=focusModuleKey.slice(10);const header=workspace.costItems.find(line=>line.priceSetKey===key&&line.isPriceSet);if(header)setSetEditor({header,members:workspace.costItems.filter(line=>line.priceSetKey===key&&!line.isPriceSet)}); }
      setCollapsed((current) => current.filter((key) => key !== focusModuleKey));
      bandRefs.current[focusModuleKey]?.scrollIntoView({ block: "center" });
      onFocusHandled();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusModuleKey, onFocusHandled, workspace.costItems]);

  const startQuickRow = (group: { key: string; categoryCode: string; category: string; module: string }) => {
    const prior = workspace.costItems.find((line) => line.categoryCode === group.categoryCode && line.module === group.module) ?? workspace.costItems.find((line) => line.categoryCode === group.categoryCode);
    setCollapsed((current) => current.filter((key) => key !== group.key));
    setQuickDraft({ version: (quickDraft?.version ?? 0) + 1, groupKey: group.key, categoryCode: group.categoryCode, category: group.category, subcategory: prior?.subcategory ?? "", module: group.module, itemCode: "", description: "", brand: "", model: "", specification: "", supplierId: prior?.supplierId ?? undefined, quantity: 1, unit: prior?.unit ?? "Pcs", unitCost: 0, priceSource: prior?.priceSource ?? "Manual Estimate", referenceNumber: "", referenceProject: workspace.header.number, priceDate: businessDate(), remark: "", ownerId: defaultOwnerId });
  };
  const updateQuick = <K extends keyof QuickCostDraft>(key: K, value: QuickCostDraft[K]) => setQuickDraft((current) => current ? { ...current, [key]: value } : current);
  /* A pick from the type-ahead lands the whole reference line; the date only moves when the reference carries one. */
  const applyQuickLookup = (patch: CostItemLookupPatch) => setQuickDraft((current) => current ? { ...current, ...patch, module: current.module, priceDate: patch.priceDate ?? current.priceDate } : current);
  const quickValid = Boolean(quickDraft && quickDraft.categoryCode.length === 2 && quickDraft.itemCode.trim() && quickDraft.description.trim() && Number.isInteger(quickDraft.quantity) && quickDraft.quantity > 0 && quickDraft.unit.trim() && quickDraft.unitCost >= 0 && quickDraft.quantity * quickDraft.unitCost <= MAX_LEDGER_LINE_TOTAL && quickDraft.priceSource && quickDraft.ownerId > 0);
  const saveQuickRow = async (continueAdding: boolean) => {
    if (!quickDraft || !quickValid || busy || quickSaving) return;
    setQuickSaving(true);
    const saved = await onQuickAddCost({ ...quickDraft, estimateRowVersion: workspace.header.rowVersion });
    setQuickSaving(false);
    if (!saved) return;
    setPendingModule(null);
    setQuickDraft(continueAdding ? { ...quickDraft, version: quickDraft.version + 1, itemCode: "", description: "", model: "", specification: "", referenceNumber: "", remark: "" } : null);
  };

  const colCount = dense ? 10 : 16;
  const sheetWidth = dense ? 1320 : 2190;
  const draftRow = (groupKey: string) => quickDraft?.groupKey === groupKey ? <tr className="item-row inline-draft-row cost-draft-row" key={`quick-${groupKey}-${quickDraft.version}`} title={localizeCopy("Enter: save and create the next row · Esc: cancel")} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setQuickDraft(null); } if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void saveQuickRow(true); } }}>
    <td><span className="cell-text quick-new"><LocalizedText text={"New"} />{!quickDraft.module ? <small style={{ display: "block" }}><LocalizedText text={"standalone"} /></small> : null}</span></td>
    <td><CostItemLookupInput field="itemCode" inputRef={(node) => { quickItemCodeRef.current = node; }} required aria-label={uiText("Item code")} maxLength={100} placeholder={localizeCopy("Part No. *")} value={quickDraft.itemCode} onChange={(text) => updateQuick("itemCode", text)} onPick={applyQuickLookup} suppliers={bootstrap.suppliers} /></td>
    <td><div className="inline-stack"><CostItemLookupInput field="description" required aria-label={uiText("Description")} maxLength={500} placeholder={localizeCopy("Description *")} value={quickDraft.description} onChange={(text) => updateQuick("description", text)} onPick={applyQuickLookup} suppliers={bootstrap.suppliers} /><input aria-label={uiText("Specification")} maxLength={20000} placeholder={uiText("Specification")} value={quickDraft.specification ?? ""} onChange={(event) => updateQuick("specification", event.target.value)} /></div></td>
    <td><div className="inline-stack"><CostItemLookupInput field="brand" aria-label={uiText("Brand")} maxLength={100} placeholder={uiText("Brand")} value={quickDraft.brand ?? ""} onChange={(text) => updateQuick("brand", text)} onPick={applyQuickLookup} suppliers={bootstrap.suppliers} /><input aria-label={uiText("Model")} maxLength={200} placeholder={uiText("Model")} value={quickDraft.model ?? ""} onChange={(event) => updateQuick("model", event.target.value)} /></div></td>
    <td><SupplierLookupInput suppliers={bootstrap.suppliers} aria-label={uiText("Supplier")} placeholder={uiText("Supplier")} value={quickDraft.supplierId} onChange={(supplierId) => updateQuick("supplierId", supplierId)} /></td>
    <td><input className="num" aria-label={uiText("Quantity")} type="number" min="1" max="1000000000" step="1" value={quickDraft.quantity} onChange={(event) => updateQuick("quantity", Number(event.target.value))} /></td>
    <td><select aria-label={uiText("Unit")} value={quickDraft.unit} onChange={(event) => updateQuick("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
    <td><input className="num" aria-label={uiText("Unit cost")} type="number" min="0" max="1000000000" step="0.0001" value={quickDraft.unitCost} onChange={(event) => updateQuick("unitCost", Number(event.target.value))} /></td>
    <td className="quick-computed"><strong>{formatMoney(quickDraft.quantity * quickDraft.unitCost)}</strong></td>
    {dense ? null : <>
      <td><select aria-label={localizeCopy("Price source")} value={quickDraft.priceSource} onChange={(event) => updateQuick("priceSource", event.target.value)}>{PRICE_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></td>
      <td><div className="inline-stack"><input aria-label={localizeCopy("Reference number")} maxLength={200} placeholder={localizeCopy("Reference No.")} value={quickDraft.referenceNumber ?? ""} onChange={(event) => updateQuick("referenceNumber", event.target.value)} /><input aria-label={localizeCopy("Reference project")} maxLength={200} placeholder={localizeCopy("Reference project")} value={quickDraft.referenceProject ?? ""} onChange={(event) => updateQuick("referenceProject", event.target.value)} /></div></td>
      <td><input aria-label={uiText("Price date")} type="date" value={quickDraft.priceDate ?? ""} onChange={(event) => updateQuick("priceDate", event.target.value || undefined)} /></td>
      <td><select aria-label={localizeCopy("Cost owner")} value={quickDraft.ownerId} onChange={(event) => updateQuick("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></td>
      <td><input aria-label={localizeCopy("Cost remark")} maxLength={20000} placeholder={uiText("Remark")} value={quickDraft.remark ?? ""} onChange={(event) => updateQuick("remark", event.target.value)} /></td>
      <td><span className="cell-text"><Badge>{"Draft"}</Badge></span></td>
    </>}
    <td><div className="row-actions"><button className="row-action save" type="button" disabled={!quickValid || busy || quickSaving} onClick={() => { void saveQuickRow(false); }} aria-label={localizeCopy("Save cost item")}><Icon name="check" /></button><button className="row-action" type="button" disabled={busy || quickSaving} onClick={() => setQuickDraft(null)} aria-label={localizeCopy("Cancel new cost item")}><Icon name="x" /></button></div></td>
  </tr> : null;

  const moduleBand = (group: { key: string; categoryCode: string; category: string; module: string }, ordinal: number, lineCount: number, groupTotal: number, issues: number) => <tr className={"module-row" + (dropMarker === group.key ? " cost-drop-module" : "")} onDragOver={event => { if (lineCount) allowDrop(event, group.key); }} onDrop={event => { const target = groups.find(entry => entry.key === group.key)?.lines.at(-1); if (target) dropCost(event, target.id, true); }} key={`band-${group.key}`} ref={(node) => { bandRefs.current[group.key] = node; }}>
    <td colSpan={colCount - 1}><div className="row band">
      <button type="button" className="module-toggle" aria-label={(isCollapsed(group.key) ? "Expand " : "Collapse ") + group.module} aria-expanded={!isCollapsed(group.key)} onClick={() => toggleModule(group.key)}>
        <Icon name={isCollapsed(group.key) ? "chevronRight" : "chevronDown"} />
        <span className="module-ordinal">{ordinal}</span>
      </button>
      {canAdd && lineCount ? <button type="button" className="module-name-edit" disabled={busy || quickSaving} title={localizeCopy("แก้ชื่อ Main Module / Rename Main Module")} onClick={() => setModuleEditor({ key: "category:" + group.categoryCode + ":" + group.module, title: group.module })}><strong>{group.module}</strong><Icon name="edit" /></button> : <strong>{group.module}</strong>}
      <span className="pill">{group.categoryCode}</span>
      <span className="muted">{group.category} <LocalizedText text={"·"} /> {lineCount} <LocalizedText text={"item"} /></span>
      {issues ? <Badge tone="amber">{issues} <LocalizedText text={"to fix"} /></Badge> : null}
      {isCollapsed(group.key) ? <strong className="num cost-collapsed-total">{formatMoney(groupTotal)}</strong> : null}

      {canAdd && lineCount ? <button type="button" className="group-action" disabled={busy} onClick={() => setSaveTarget(groups.find((entry) => entry.key === group.key) ?? null)} title={localizeCopy("เก็บโมดูลนี้เข้าคลัง Master Template")}><Icon name="package" /><LocalizedText text={"Save as template"} /></button> : null}
    </div></td><td className="cost-module-controls">{canAdd && lineCount ? <span className="row-actions cost-order-actions">{([-1, 1] as const).map(direction => {
        const siblings = groups.filter(entry => entry.categoryCode === group.categoryCode);
        const index = siblings.findIndex(entry => entry.key === group.key);
        return <button key={direction} className="icon-btn" type="button" aria-label={(direction === -1 ? "Move up " : "Move down ") + group.module} title={localizeCopy(direction === -1 ? "ขยับขึ้น / Move up" : "ขยับลง / Move down")} disabled={busy || quickSaving || index + direction < 0 || index + direction >= siblings.length} onClick={() => moveCostModule(siblings[index], direction)}>{direction === -1 ? "▲" : "▼"}</button>;
      })}<button className="icon-btn" type="button" disabled={busy || quickSaving} title={localizeCopy("แก้ไข Main Module / Edit Main Module")} aria-label={"Edit Main Module " + group.module} onClick={() => setModuleEditor({ key: "category:" + group.categoryCode + ":" + group.module, title: group.module })}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy || quickSaving} title={localizeCopy("ลบ Main Module / Delete Main Module")} aria-label={"Delete Main Module " + group.module} onClick={() => { const target = groups.find(entry => entry.key === group.key); if (target) void onRemoveModule(target); }}><Icon name="trash" /></button></span> : null}</td>
  </tr>;

  return <>
  {moduleEditor ? <EstimateModuleEditor workspace={workspace} moduleKey={moduleEditor.key} initialTitle={moduleEditor.title} onClose={() => setModuleEditor(null)} onSaved={onExcelImported} /> : null}
  {setError ? <div role="alert" className="info-strip red">{setError}</div> : null}
  {setEditor ? <EstimatePriceSetEditor workspace={workspace} bootstrap={bootstrap} members={setEditor.members} header={setEditor.header} onClose={()=>setSetEditor(null)} onSaved={async()=>{setSetSelection([]);await onExcelImported();}}/> : null}
  <Panel className="estimate-cost-panel" title={estimateUxCopy(currentLocale(), "รายการประมาณต้นทุน", "Cost estimate items", "見積原価明細")} subtitle={estimateUxCopy(currentLocale(), `${groups.filter(group => group.module).length} โมดูล · ${visibleLines.filter(line => !line.isPriceSet).length} รายการ`, `${groups.filter(group => group.module).length} modules · ${visibleLines.filter(line => !line.isPriceSet).length} items`, `${groups.filter(group => group.module).length} モジュール · ${visibleLines.filter(line => !line.isPriceSet).length} 明細`)} actions={canAdd ? <>
    {setSelection.length ? <button type="button" className="btn default sm" disabled={busy || setBusy} onClick={() => setSetEditor({ members: workspace.costItems.filter(line => setSelection.includes(line.id) && !line.priceSetKey) })}>{estimateUxCopy(currentLocale(), "รวมเป็นเซ็ต", "Set price", "セット化")} ({setSelection.length})</button> : null}
    <button className="btn default sm" type="button" disabled={busy} onClick={() => onAdd({ module: "", categoryCode: category === "all" ? "01" : category })}><Icon name="plus" />{estimateUxCopy(currentLocale(), "เพิ่มรายการ", "Add item", "明細を追加")}</button>
    <details className="estimate-more estimate-cost-menu"><summary className="btn default sm">{estimateUxCopy(currentLocale(), "นำเข้า / คัดลอก", "Import / copy", "インポート / コピー")}<Icon name="chevronDown" /></summary><div className="estimate-more-content">
      <button className="btn ghost sm" type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setTool("price"); }}><Icon name="search" /><LocalizedText text="Search Price Library" /></button>
      <button className="btn ghost sm" type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setTool("import"); }}><Icon name="upload" /><LocalizedText text="Import Excel" /></button>
      <button className="btn ghost sm" type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setTool("copy"); }}><Icon name="copy" /><LocalizedText text="Copy Previous Estimate" /></button>
      <button className="btn ghost sm" type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setTool("template"); }}><Icon name="package" /><LocalizedText text="เลือกจาก Template" /></button>
    </div></details>
    <button className="btn primary sm" type="button" disabled={busy} onClick={() => setTool("module")}><Icon name="layers" />{estimateUxCopy(currentLocale(), "เพิ่มโมดูล", "Add module", "モジュールを追加")}</button>
  </> : undefined} flush>
    <div className="sheet-controls">
      <div className="subtabs" role="tablist" aria-label={localizeCopy("Cost category")}>
        {presentCategories.length ? <>
        <button type="button" className={activeCategory === "all" ? "subtab active" : "subtab"} onClick={() => { setCategory("all"); setQuickDraft(null); }}><LocalizedText text={"All disciplines"} /><em>{workspace.costItems.length}</em></button>
        {presentCategories.map(([code, name]) => { const count = workspace.costItems.filter((line) => line.categoryCode === code).length; return <button key={code} type="button" className={activeCategory === code ? "subtab active" : "subtab"} onClick={() => { setCategory(code); setQuickDraft(null); }}><span className="pill">{code}</span>{name}<em>{count}</em></button>; })}
        </> : null}
      </div>
      <div className="sheet-tools">
        <button type="button" className="sheet-tool" disabled={!groups.length} onClick={() => setCollapsed(groups.filter(group => group.module).map((group) => group.key))} title={localizeCopy("หุบทุกโมดูล")}><Icon name="chevronRight" /><LocalizedText text={"Collapse all"} /></button>
        <button type="button" className="sheet-tool" disabled={!collapsed.length} onClick={() => setCollapsed([])} title={localizeCopy("กางทุกโมดูล")}><Icon name="chevronDown" /><LocalizedText text={"Expand all"} /></button>
        <button type="button" className={dense ? "sheet-tool" : "sheet-tool active"} onClick={() => setDense((current) => !current)} title={dense ? "แสดง price source, reference, price date, owner, remark และ status" : "ซ่อนคอลัมน์อ้างอิงเพื่อให้ตารางพอดีจอ"}><Icon name="table" />{dense ? "All columns" : "Compact"}</button>
      </div>
    </div>
    {canAdd ? <p className="cost-drag-help estimate-entry-help">{estimateUxCopy(currentLocale(), "เพิ่มรายการท้ายโมดูลเพื่อกรอกในกลุ่มนั้น · Enter บันทึกและเพิ่มต่อ · Esc ยกเลิก · ลาก ⠿ เพื่อย้ายรายการ", "Add at a module footer to enter items in that group · Enter saves and continues · Esc cancels · Drag ⠿ to move", "モジュール末尾から明細を追加 · Enterで保存して続行 · Escで取消 · ⠿で移動")}</p> : null}
    {groups.length || showPending ? <div className="table-wrap cost-sheet-wrap"><table className="cost-inline-sheet cost-sheet" style={{ minWidth: sheetWidth }}>
      <thead><tr>
        <th style={{ width: 48 }}><LocalizedText text={"No."} /></th>
        <th style={{ width: 140 }}><LocalizedText text={"Item code"} /></th>
        <th style={{ width: 300 }}><LocalizedText text={"Description / Specification"} /></th>
        <th style={{ width: 160 }}><LocalizedText text={"Brand / Model"} /></th>
        <th style={{ width: 180 }}><LocalizedText text={"Supplier"} /></th>
        <th className="num" style={{ width: 100 }}><LocalizedText text={"Qty"} /></th>
        <th style={{ width: 140 }}><LocalizedText text={"Unit"} /></th>
        <th className="num" style={{ width: 120 }}><LocalizedText text={"Unit cost"} /></th>
        <th className="num" style={{ width: 130 }}><LocalizedText text={"Total"} /></th>
        {dense ? null : <>
          <th style={{ width: 150 }}><LocalizedText text={"Price source"} /></th>
          <th style={{ width: 170 }}><LocalizedText text={"Reference"} /></th>
          <th style={{ width: 110 }}><LocalizedText text={"Price date"} /></th>
          <th style={{ width: 150 }}><LocalizedText text={"Owner"} /></th>
          <th style={{ width: 180 }}><LocalizedText text={"Remark"} /></th>
          <th style={{ width: 110 }}><LocalizedText text={"Status"} /></th>
        </>}
        <th style={{ width: 164 }} aria-label={uiText("Action")} />
      </tr></thead>
      <tbody>
        {groups.flatMap((group, groupIndex) => {
          const issues = group.needPrice + group.needSupplier;
          if (group.module && isCollapsed(group.key)) return [moduleBand(group, groupIndex + 1, group.lines.length, group.total, issues)];
          return [
            group.module ? moduleBand(group, groupIndex + 1, group.lines.length, group.total, issues) : null,
            ...group.lines.map((line, index) => <tr key={line.id} className={"item-row" + (line.isPriceSet ? " price-set-header" : line.priceSetKey ? " price-set-component" : "") + (dropMarker === line.id + ":before" ? " cost-drop-before" : dropMarker === line.id + ":after" ? " cost-drop-after" : "")} onDragOver={event => { const bounds = event.currentTarget.getBoundingClientRect(); allowDrop(event, line.id + (event.clientY < bounds.top + bounds.height / 2 ? ":before" : ":after")); }} onDrop={event => { const bounds = event.currentTarget.getBoundingClientRect(); dropCost(event, line.id, event.clientY >= bounds.top + bounds.height / 2); }}>
              <td><span className="cell-text muted mono">{group.module ? `${groupIndex + 1}-${index + 1}` : String(groupIndex + 1)}</span></td>
              <td><span className="cell-text">{canAdd && line.canEdit && !line.priceSetKey ? <input type="checkbox" aria-label={"Select for price set " + line.itemCode} checked={setSelection.includes(line.id)} onChange={event=>setSetSelection(current=>event.target.checked?[...current,line.id]:current.filter(id=>id!==line.id))}/> : null}<strong className="mono">{line.isPriceSet ? "SET" : line.itemCode}</strong></span></td>
              <td><div className="cell-primary"><strong>{line.isPriceSet ? "▣ " : line.priceSetKey ? "↳ " : ""}{line.description}</strong>{line.priceSetKey && !line.isPriceSet ? <span>{line.quantityPerSet} {line.unit} / Set · รวมในราคาเซ็ต</span> : null}{!group.module ? <span>รายการเดี่ยว / Standalone · {line.category}</span> : null}{line.specification ? <span>{line.specification}</span> : null}</div></td>
              <td><div className="cell-primary"><strong>{line.brand || "—"}</strong>{line.model ? <span>{line.model}</span> : null}</div></td>
              <td><span className="cell-text">{line.supplierName ?? <span className="soft-warn"><LocalizedText text={"ยังไม่เลือกผู้ขาย"} /></span>}</span></td>
              {line.canEdit ? <EstimateModuleQuantityCells key={line.id+":"+line.rowVersion} name={line.itemCode} quantity={line.quantity} unit={line.unit} units={workspace.costItems.map(item=>item.unit)} showCostRatio={!line.priceSetKey||Boolean(line.isPriceSet)} disabled={busy||setBusy} onSave={async (quantity,unit)=>{setSetBusy(true);try{await apiRequest(`/api/v1/estimates/${workspace.header.id}/cost-items/${line.id}/quantity`,{method:"PUT",body:JSON.stringify({estimateRowVersion:workspace.header.rowVersion,lineRowVersion:line.rowVersion,quantity,unit})});await onExcelImported();}finally{setSetBusy(false);}}}/> : <><td className="num">{formatNumber(line.quantity, 0)}</td><td><span className="cell-text">{line.unit}</span></td></>}
              <td className="num">{line.priceSetKey && !line.isPriceSet ? <span className="muted"><LocalizedText text={"Included in the set price"} /></span> : numberOf(line.unitCost) > 0 ? formatMoney(line.unitCost) : <span className="soft-warn"><LocalizedText text={"รอราคา"} /></span>}</td>
              <td className="num"><strong>{line.priceSetKey && !line.isPriceSet ? "—" : formatMoney(line.lineTotal)}</strong></td>
              {dense ? null : <>
                <td><span className="cell-text">{line.priceSource}</span></td>
                <td><div className="cell-primary"><strong>{line.referenceNumber || "—"}</strong>{line.referenceProject ? <span>{line.referenceProject}</span> : null}</div></td>
                <td><span className="cell-text">{formatDate(line.priceDate)}</span></td>
                <td><span className="cell-text">{line.ownerName}</span></td>
                <td><span className="cell-text">{line.remark || "—"}</span></td>
                <td><span className="cell-text"><Badge>{line.status}</Badge></span></td>
              </>}
              <td><div className="row-actions cost-order-actions">{line.canEdit && line.isPriceSet ? <button type="button" className="btn default sm" disabled={busy||setBusy} onClick={()=>setSetEditor({header:line,members:workspace.costItems.filter(item=>item.priceSetKey===line.priceSetKey&&!item.isPriceSet)})}>Edit set</button> : line.canEdit && line.priceSetKey ? <button type="button" className="icon-btn" disabled={busy||setBusy} title="นำออกจากเซ็ต / Remove from set" onClick={()=>void detachSetItem(line)}>↗</button> : null}{canAdd && line.canEdit && !line.priceSetKey ? <button type="button" className="icon-btn cost-drag-handle" draggable={!busy && !quickSaving} disabled={busy || quickSaving} aria-label={"Drag " + line.itemCode + " to reorder or move to another module"} title="ลากเพื่อย้ายรายการ / Drag to move item" onDragStart={event => { setDraggedCostId(line.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(line.id)); }} onDragEnd={clearDrag}>⠿</button> : null}{canAdd && !line.priceSetKey ? <>{([-1, 1] as const).map(direction => <button key={direction} className="icon-btn" type="button" aria-label={(direction === -1 ? "Move up " : "Move down ") + line.itemCode} disabled={busy || quickSaving || (group.module ? index + direction < 0 || index + direction >= group.lines.length : groups.filter(entry => entry.categoryCode === group.categoryCode).findIndex(entry => entry.key === group.key) + direction < 0 || groups.filter(entry => entry.categoryCode === group.categoryCode).findIndex(entry => entry.key === group.key) + direction >= groups.filter(entry => entry.categoryCode === group.categoryCode).length)} onClick={() => group.module ? moveCostLine(group, index, direction) : moveCostModule(group, direction)}>{direction === -1 ? "▲" : "▼"}</button>)}</> : null}{line.canEdit && !line.priceSetKey ? <><button className="icon-btn" type="button" disabled={busy} aria-label={`Edit ${line.itemCode}`} onClick={() => onEdit(line)}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} aria-label={`Remove ${line.itemCode}`} onClick={() => onRemove(line)}><Icon name="trash" /></button></> : line.priceSetKey ? null : <Icon name="lock" />}</div></td>
            </tr>),
            group.module ? draftRow(group.key) : null,
            group.module ? <tr className="cost-module-subtotal" key={`add-${group.key}`}><td colSpan={8}><div className="cost-module-footer"><button type="button" className="add-row-btn" disabled={!canAdd || busy || quickSaving} onClick={() => startQuickRow(group)}><span><Icon name="plus" />{estimateUxCopy(currentLocale(), "เพิ่มรายการในโมดูลนี้", "Add item to this module", "このモジュールに明細を追加")}</span></button><span>{estimateUxCopy(currentLocale(), "รวมโมดูล", "Module subtotal", "モジュール小計")}</span></div></td><td className="num"><strong>{formatMoney(group.total)}</strong></td>{!dense ? <td colSpan={6} /> : null}<td /></tr> : null,
            draftRow(`standalone-after:${group.key}`),
          ];
        })}
        {showPending && pendingModule && pendingKey ? [
          moduleBand({ key: pendingKey, ...pendingModule }, groups.length + 1, 0, 0, 0),
          draftRow(pendingKey),
          quickDraft?.groupKey === pendingKey ? null : <tr className="module-empty" key={`empty-${pendingKey}`}><td colSpan={colCount}><LocalizedText text={"ยังไม่มี item ในโมดูลนี้ — เพิ่ม item แรกเพื่อบันทึกโมดูลลง revision"} /></td></tr>,
          <tr className="add-row" key={`add-${pendingKey}`}><td colSpan={colCount}><button type="button" className="add-row-btn" disabled={!canAdd || busy} onClick={() => startQuickRow({ key: pendingKey, ...pendingModule })}><span><Icon name="plus" /><LocalizedText text={"Add item to"} /> {pendingModule.module}</span></button></td></tr>,
        ] : null}
      </tbody>
    </table></div> : <EmptyState icon="package" title={uiText("No cost item")} message={canAdd ? "เพิ่มรายการเดี่ยวได้ทันที หรือสร้าง Main Module เพื่อจัดกลุ่มรายการ" : "ไม่มีรายการที่บัญชีนี้อ่านได้"} action={canAdd ? <button className="btn primary" type="button" onClick={() => onAdd({ module: "", categoryCode: category === "all" ? "01" : category })}><Icon name="plus" /><LocalizedText text={"Add a standalone item"} /></button> : undefined} />}
    <div className="sticky-foot"><div className="foot-item"><span><LocalizedText text={"Modules"} /></span><strong>{groups.filter(group => group.module).length}</strong></div><div className="foot-item"><span><LocalizedText text={"Shown lines"} /></span><strong>{visibleLines.length}</strong></div><div className="foot-item"><span><LocalizedText text={"Shown subtotal"} /></span><strong>{formatMoney(visibleLines.reduce((sum, line) => sum + numberOf(line.lineTotal), 0))}</strong></div><div className="foot-total"><span><LocalizedText text={"Total estimated cost"} /></span><strong>{formatMoney(workspace.header.totals.total)}</strong></div></div>
  </Panel>
  {tool === "price" ? <PriceLibraryPicker workspace={workspace} busy={busy} onClose={() => setTool(null)} onUse={async (record) => {
    const saved = await onBulkAddCost([costSeedFromLine(record.item, workspace.header.ownerId, record.sourceKind === "Historical Purchase" ? "Purchase Price" : "Price Library", record.sourceNumber, record.projectName)], "Price selected from live Price Library");
    if (saved) setTool(null);
  }} /> : null}
  {tool === "import" ? <EstimateExcelImport workspace={workspace} bootstrap={bootstrap} onClose={() => setTool(null)} onImported={onExcelImported} onLegacy={() => setTool("import-flat")} /> : null}
  {tool === "import-flat" ? <ImportCostItemsModal bootstrap={bootstrap} workspace={workspace} busy={busy} onClose={() => setTool(null)} onImport={async (seeds) => { const saved = await onBulkAddCost(seeds, "Excel import completed"); if (saved) setTool(null); }} /> : null}
  {tool === "copy" ? <CopyPreviousEstimateModal workspace={workspace} busy={busy} onClose={() => setTool(null)} onCopy={async (input) => {
    const saved = await onCopyFrom(input);
    if (saved) setTool(null);
  }} /> : null}
  {tool === "template" ? <ApplyModuleTemplateModal workspace={workspace} currentUserId={bootstrap.user.id} busy={busy} onClose={() => setTool(null)} onApply={async (input) => {
    const applied = await onApplyTemplate(input);
    if (applied) setTool(null);
    return applied;
  }} /> : null}
  {saveTarget ? <SaveModuleTemplateModal group={saveTarget} busy={busy} onClose={() => setSaveTarget(null)} onSave={async (input) => {
    const saved = await onSaveTemplate(input);
    if (saved) setSaveTarget(null);
    return saved;
  }} /> : null}
  {tool === "module" ? <MainModuleEditor workspace={workspace} busy={busy} onClose={() => setTool(null)} onContinue={(seed) => {
    setTool(null);
    const pending = { categoryCode: seed.categoryCode ?? "01", category: seed.category ?? "Hardware", module: (seed.module ?? "").trim() };
    if (!pending.module) return;
    setCategory("all");
    setPendingModule(pending);
    startQuickRow({ key: moduleKeyOf(pending.categoryCode, pending.module), ...pending });
  }} /> : null}
  </>;
}

function costSeedFromLine(line: EstimateCostItem, ownerId: number, priceSource: string, referenceNumber: string, referenceProject: string): CostItemSeed {
  return {
    categoryCode: line.categoryCode, category: line.category, subcategory: line.subcategory, module: line.module,
    itemCode: line.itemCode, description: line.description, brand: line.brand, model: line.model,
    specification: line.specification ?? "", supplierId: line.supplierId ?? undefined, quantity: numberOf(line.quantity),
    unit: line.unit, unitCost: numberOf(line.unitCost), priceSource, referenceNumber, referenceProject,
    priceDate: dateValue(line.priceDate) || businessDate(), remark: line.remark ?? "", ownerId,
  };
}

function PriceLibraryPicker({ workspace, busy, onClose, onUse }: { workspace: EstimateCostWorkspace; busy: boolean; onClose: () => void; onUse: (record: PriceLibraryRecord) => Promise<void> }) {
  const uiText = useUiText();
  const [source, setSource] = useState<PriceLibraryRecord | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [records, setRecords] = useState<PriceLibraryRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadPriceLibraryRecords(workspace.header.id).then((items) => { if (active) setRecords(items); }).catch((requestError) => { if (active) setError(toError(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.header.id]);
  const needle = search.trim().toLocaleLowerCase();
  const matches = records.filter(({ item, sourceNumber, projectName, customerName }) => !needle || [item.itemCode, item.description, item.brand, item.model, item.supplierName, sourceNumber, projectName, customerName].some((value) => value?.toLocaleLowerCase().includes(needle))).sort((a, b) => (b.item.priceDate ?? "").localeCompare(a.item.priceDate ?? ""));
  const visible = matches.slice(0, visibleLimit);
  return <Modal title={uiText("Search Price Library")} subtitle="ค้นจาก Estimate เดิมและประวัติราคาซื้อจริงที่ตรวจสอบจาก PR/ใบเสนอราคา" size="xl" onClose={onClose} footer={<><span className="muted">{records.length} <LocalizedText text={"live price record(s)"} /></span><span className="spacer" /><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Close"} /></button></>}>
    <SearchInput value={search} onChange={(value) => { setSearch(value); setVisibleLimit(100); }} placeholder="Search item code, description, brand, supplier or estimate…" />
    <p className="muted">{estimateUxCopy(currentLocale(), "ราคาอ้างอิงเรียงจากวันที่ล่าสุด ตรวจหน่วย จำนวน และเงื่อนไขก่อนใช้ ราคานี้ไม่ได้ยืนยันว่าผู้ขายยังเสนออยู่", "Newest reference dates first. Check units, quantities and terms; these are not confirmed current offers.", "参照日の新しい順です。単位・数量・条件を確認してください。現在有効な見積価格とは限りません。")}</p>
    {source ? <div className="panel" style={{ padding: 12, marginTop: 12 }}><strong>{source.sourceNumber} {source.sourceRevision !== undefined ? revisionCode(source.sourceRevision) : ""} · {source.sourceStatus ?? source.sourceKind}</strong><p>{source.item.description} · {source.item.quantity} {source.item.unit} × {formatMoney(source.item.unitCost)} · {formatDate(source.item.priceDate)}</p><p>{source.item.referenceNumber || "—"} · {source.item.remark || "—"}</p>{source.sourceEstimateId ? <EstimateImportHistory estimateId={source.sourceEstimateId} /> : null}<button className="btn ghost sm" type="button" onClick={() => setSource(null)}><LocalizedText text="Close" /></button></div> : null}
    {matches.length > visibleLimit ? <button type="button" className="btn default sm" onClick={() => setVisibleLimit((value) => value + 100)}>{estimateUxCopy(currentLocale(), "แสดงเพิ่ม", "Show more", "さらに表示")} ({visible.length}/{matches.length})</button> : null}
    {error ? <div className="callout danger"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading live Price Library…"} /></div> : visible.length ? <div className="table-wrap tall" style={{ marginTop: 12 }}><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand / Model"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Source"} /></th><th><LocalizedText text={"Price date"} /></th><th className="num"><LocalizedText text={"Unit cost"} /></th><th /></tr></thead><tbody>{visible.map((record) => <tr key={record.key}><td><strong className="mono">{record.item.itemCode}</strong></td><td>{record.item.description}</td><td>{[record.item.brand, record.item.model].filter(Boolean).join(" · ") || "—"}</td><td>{record.item.supplierName ?? "—"}</td><td><div className="cell-primary"><button type="button" className="link-btn" onClick={() => setSource(record)}>{record.sourceNumber} {record.sourceRevision !== undefined ? revisionCode(record.sourceRevision) : ""}</button><span>{record.projectName} <LocalizedText text={"·"} /> {record.sourceKind}</span></div></td><td>{formatDate(record.item.priceDate)}</td><td className="num"><strong>{formatMoney(record.item.unitCost)}</strong><div className="muted">/ {record.item.unit} · Qty {record.item.quantity}</div></td><td><button className="btn primary sm" type="button" disabled={busy} onClick={() => { void onUse(record); }}><Icon name="plus" /><LocalizedText text={"Use price"} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon="search" title="No matching price" message="ลองค้นด้วย Part No., Description, Brand, Supplier หรือเลขที่เอกสาร" />}
  </Modal>;
}

/* Copy Previous Estimate hands the whole selection to one server transaction.
   It used to POST one cost line at a time, which meant a duplicate item code or
   a deactivated supplier stopped halfway and left a partial copy behind, and it
   only ever carried cost items. The server now copies the cost, man-hour,
   expense and other-cost ledgers with their ERP classifications, or nothing. */
function CopyPreviousEstimateModal({ workspace, busy, onClose, onCopy }: { workspace: EstimateCostWorkspace; busy: boolean; onClose: () => void; onCopy: (input: Omit<EstimateCopyInput, "estimateRowVersion" | "ownerId">) => Promise<void> }) {
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [sourceId, setSourceId] = useState(0);
  const [sourceWorkspace, setSourceWorkspace] = useState<EstimateCostWorkspace | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [ledgers, setLedgers] = useState({ manhour: true, expenses: true, otherCosts: true, erpCategories: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadAllEstimateSummaries().then((items) => {
      if (!active) return;
      const choices = items.filter((item) => item.id !== workspace.header.id);
      setEstimates(choices);
      setSourceId(choices[0]?.id ?? 0);
    }).catch((requestError) => { if (active) setError(toError(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace.header.id]);
  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    void loadEstimateCostWorkspace(sourceId).then((loaded) => { if (active) { setSourceWorkspace(loaded); setSelected([...new Set(loaded.costItems.map((line) => line.categoryCode))]); } }).catch((requestError) => { if (active) setError(toError(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceId]);
  const source = estimates.find((item) => item.id === sourceId);
  const allowedSection = (code: string) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(code);
  const sectionCounts = (code: string) => {
    if (!sourceWorkspace) return 0;
    const costs = sourceWorkspace.costItems.filter((line) => line.categoryCode === code).length;
    const manhour = code === "06" && ledgers.manhour ? sourceWorkspace.manhourLines.length : 0;
    const expenses = ledgers.expenses ? sourceWorkspace.expenseLines.filter((line) => EXPENSE_SECTION_BY_TYPE[line.expenseType] === code).length : 0;
    const other = ledgers.otherCosts ? sourceWorkspace.otherCostLines.filter((line) => OTHER_COST_SECTION_BY_CATEGORY[line.category] === code).length : 0;
    return costs + manhour + expenses + other;
  };
  const totalLines = COST_CATEGORIES.reduce((sum, [code]) => sum + (selected.includes(code) && allowedSection(code) ? sectionCounts(code) : 0), 0);
  return <Modal title="Copy Previous Estimate" subtitle="คัดลอกทั้งชุด ต้นทุน แรงงาน ค่าใช้จ่ายและการจัดประเภท ERP จาก Estimate จริงเข้ามาใน revision นี้ในทรานแซกชันเดียว" size="lg" onClose={onClose} footer={<><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || loading || !source || !totalLines} onClick={() => { if (source) void onCopy({ sourceEstimateId: source.id, sections: selected.filter(allowedSection), includeManhour: ledgers.manhour, includeExpenses: ledgers.expenses, includeOtherCosts: ledgers.otherCosts, includeErpCategories: ledgers.erpCategories }); }}><Icon name="copy" /><LocalizedText text={"Copy"} /> {totalLines} <LocalizedText text={"line(s)"} /></button></>}>
    <Field label="Source estimate *"><select value={sourceId} disabled={loading && !estimates.length} onChange={(event) => { setLoading(true); setError(""); setSourceId(Number(event.target.value)); }}>{estimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.number} <LocalizedText text={"·"} /> {estimate.projectName} <LocalizedText text={"·"} /> {estimate.customerName}</option>)}</select></Field>
    {error ? <div className="callout danger"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="info-strip"><Icon name="shield" /><span><LocalizedText text={"ต้นฉบับไม่ถูกแก้ไข สถานะอนุมัติ ประวัติการอนุมัติและผู้รับผิดชอบ section เดิมไม่ถูกคัดลอก อัตราค่าแรงภายในคำนวณใหม่ตามอัตราที่มีผลวันนี้"} /></span></div>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading source estimate…"} /></div> : sourceWorkspace ? <>
      <div className="settings-list" style={{ marginTop: 12 }}>{COST_CATEGORIES.map(([code, name]) => {
        const count = sectionCounts(code);
        if (!count) return null;
        const allowed = allowedSection(code);
        return <div key={code} className="check-row"><input id={`copy-category-${code}`} type="checkbox" disabled={!allowed} checked={allowed && selected.includes(code)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, code] : current.filter((item) => item !== code))} /><label htmlFor={`copy-category-${code}`}><strong>{code} — {name}</strong><small>{count} <LocalizedText text={"line(s)"} />{allowed ? "" : " · no permission for this section"}</small></label></div>;
      })}</div>
      <div className="settings-list" style={{ marginTop: 12 }}>
        {([["manhour", "Engineering man-hour", sourceWorkspace.manhourLines.length], ["expenses", "Expenses", sourceWorkspace.expenseLines.length], ["otherCosts", "Other project cost", sourceWorkspace.otherCostLines.length], ["erpCategories", "ERP classifications", 0]] as const).map(([key, label, count]) => (
          <div key={key} className="check-row"><input id={`copy-ledger-${key}`} type="checkbox" checked={ledgers[key]} onChange={(event) => setLedgers((current) => ({ ...current, [key]: event.target.checked }))} /><label htmlFor={`copy-ledger-${key}`}><strong><LocalizedText text={label} /></strong>{count ? <small>{count} <LocalizedText text={"line(s)"} /></small> : null}</label></div>
        ))}
      </div>
    </> : null}
  </Modal>;
}

const OTHER_COST_SECTION_BY_CATEGORY: Record<string, string> = { Outsource: "07", Transportation: "08", Accommodation: "09", "Other Cost": "10" };

const normalizedHeader = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9ก-๙]+/g, "");
const spreadsheetValue = (row: SpreadsheetRow, aliases: string[]) => {
  const match = Object.entries(row).find(([key]) => aliases.includes(normalizedHeader(key)));
  return match?.[1] ?? "";
};
const spreadsheetText = (row: SpreadsheetRow, aliases: string[]) => String(spreadsheetValue(row, aliases)).trim();
const spreadsheetNumber = (row: SpreadsheetRow, aliases: string[], fallback: number) => {
  const parsed = Number(String(spreadsheetValue(row, aliases)).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const excelDate = (value: string | number) => {
  if (typeof value === "number" && value > 1) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? businessDate() : parsed.toISOString().slice(0, 10);
};

function ImportCostItemsModal({ bootstrap, workspace, busy, onClose, onImport }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; busy: boolean; onClose: () => void; onImport: (seeds: CostItemSeed[]) => Promise<void> }) {
  const uiText = useUiText();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const allowedCodes = COST_CATEGORIES.filter(([code]) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(code)).map(([code]) => code);
  const seeds = rows.map((row, index): CostItemSeed | null => {
    const rawCategory = spreadsheetText(row, ["categorycode", "category", "discipline", "หมวด", "หมวดหมู่"]);
    const matchedCategory = COST_CATEGORIES.find(([code, name]) => code === rawCategory.padStart(2, "0") || normalizedHeader(name) === normalizedHeader(rawCategory)) ?? COST_CATEGORIES[0];
    if (!allowedCodes.includes(matchedCategory[0])) return null;
    const supplierName = spreadsheetText(row, ["supplier", "suppliername", "vendor", "ผู้ขาย"]);
    const supplier = bootstrap.suppliers.find((item) => [item.name, item.code].some((value) => normalizedHeader(value) === normalizedHeader(supplierName)));
    const description = spreadsheetText(row, ["description", "itemdescription", "name", "รายละเอียด", "รายการ"]);
    if (!description) return null;
    const itemCode = spreadsheetText(row, ["itemcode", "partno", "partnumber", "modelno", "รหัส", "รหัสสินค้า"]) || `IMPORT-${String(index + 1).padStart(4, "0")}`;
    const quantity = spreadsheetNumber(row, ["qty", "quantity", "จำนวน"], 1);
    const unitCost = spreadsheetNumber(row, ["unitcost", "price", "unitprice", "ราคา", "ราคาต่อหน่วย"], 0);
    if (quantity <= 0 || unitCost < 0 || quantity * unitCost > MAX_LEDGER_LINE_TOTAL) return null;
    const priceDateValue = spreadsheetValue(row, ["pricedate", "date", "วันที่ราคา"]);
    return { categoryCode: matchedCategory[0], category: matchedCategory[1], subcategory: spreadsheetText(row, ["subcategory", "subcategoryname", "หมวดย่อย"]), module: spreadsheetText(row, ["module", "mainmodule", "workpackage", "โมดูล"]) || matchedCategory[1], itemCode, description, brand: spreadsheetText(row, ["brand", "ยี่ห้อ"]), model: spreadsheetText(row, ["model", "รุ่น"]), specification: spreadsheetText(row, ["specification", "spec", "ขนาด", "สเปค"]), supplierId: supplier?.id, quantity, unit: spreadsheetText(row, ["unit", "uom", "หน่วย"]) || "Pcs", unitCost, priceSource: spreadsheetText(row, ["pricesource", "source", "แหล่งราคา"]) || "Supplier Quotation", referenceNumber: spreadsheetText(row, ["referencenumber", "reference", "quotationno", "quoteno", "เลขที่ใบเสนอราคา"]), referenceProject: workspace.header.number, priceDate: priceDateValue === "" ? businessDate() : excelDate(priceDateValue), remark: spreadsheetText(row, ["remark", "note", "หมายเหตุ"]), ownerId: workspace.header.ownerId };
  }).filter((seed): seed is CostItemSeed => Boolean(seed));
  const choose = async (file: File | null) => {
    if (!file) return;
    setReading(true); setError(""); setRows([]); setFileName(file.name);
    try { const imported = await readSpreadsheet(file); if (!imported.length) throw new Error("ไม่พบแถวข้อมูลใต้ Header ในชีตแรก"); setRows(imported); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setReading(false); }
  };
  return <Modal title={uiText("Import Excel")} subtitle="รองรับ .xlsx, .csv และ .tsv · อ่านชีตแรก · ตรวจ Preview ก่อนเขียนลง SQL Server" size="xl" onClose={onClose} footer={<><span className="muted">{seeds.length} <LocalizedText text={"valid of"} /> {rows.length} <LocalizedText text={"row(s)"} /></span><span className="spacer" /><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || reading || !seeds.length} onClick={() => { void onImport(seeds); }}><Icon name="upload" /><LocalizedText text={"Import"} /> {seeds.length} <LocalizedText text={"row(s)"} /></button></>}>
    <Field label="Excel file *" hint="Header ที่รองรับ เช่น Category, Module, Item Code, Description, Brand, Model, Supplier, Qty, Unit, Unit Cost"><input type="file" accept=".xlsx,.csv,.tsv" disabled={busy || reading} onChange={(event) => { void choose(event.target.files?.[0] ?? null); }} /></Field>
    {fileName ? <div className="info-strip"><Icon name="file" /><span><strong>{fileName}</strong> <LocalizedText text={"·"} /> {reading ? "Reading…" : `${rows.length} source row(s)`}</span></div> : null}
    {error ? <div className="callout danger"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {rows.length ? <div className="table-wrap tall" style={{ marginTop: 12 }}><table><thead><tr><th><LocalizedText text={"Category"} /></th><th><LocalizedText text={"Module"} /></th><th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand / Model"} /></th><th><LocalizedText text={"Supplier"} /></th><th className="num"><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"Unit cost"} /></th><th className="num"><LocalizedText text={"Total"} /></th></tr></thead><tbody>{seeds.slice(0, 100).map((seed, index) => <tr key={`${seed.itemCode}-${index}`}><td><span className="pill">{seed.categoryCode}</span> {seed.category}</td><td>{seed.module}</td><td><strong className="mono">{seed.itemCode}</strong></td><td>{seed.description}</td><td>{[seed.brand, seed.model].filter(Boolean).join(" · ") || "—"}</td><td>{bootstrap.suppliers.find((supplier) => supplier.id === seed.supplierId)?.name ?? "—"}</td><td className="num">{formatNumber(seed.quantity)}</td><td>{seed.unit}</td><td className="num">{formatMoney(seed.unitCost)}</td><td className="num"><strong>{formatMoney(numberOf(seed.quantity) * numberOf(seed.unitCost))}</strong></td></tr>)}</tbody></table></div> : null}
  </Modal>;
}

/* Pull a whole module out of the library. The engineer says how many of it the project
   needs; the multiplication is the point of the feature. */
function ApplyModuleTemplateModal({ workspace, currentUserId, busy, onClose, onApply }: { workspace: EstimateCostWorkspace; currentUserId: number; busy: boolean; onClose: () => void; onApply: (input: { templateId: number; module: string; modules: number; ownerId: number; keepReferencePrices: boolean }) => Promise<boolean> }) {
  const [templates, setTemplates] = useState<ModuleTemplateSummary[]>([]);
  const [templatePage, setTemplatePage] = useState(1);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [selected, setSelected] = useState<ModuleTemplateDetail | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [modules, setModules] = useState(1);
  const [keepPrices, setKeepPrices] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staleDays, setStaleDays] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listModuleTemplates({ status: "Active", search: search || undefined, categoryCode: discipline || undefined, page: templatePage, pageSize: 50 })
        .then((result) => { if (active) { setTemplates(result.items); setTemplateTotal(result.total); setError(""); } })
        .catch((requestError) => { if (active) setError(toError(requestError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, discipline, templatePage]);
  const choose = async (template: ModuleTemplateSummary) => {
    setError("");
    try {
      const detail = await loadModuleTemplate(template.id);
      setSelected(detail);
      setModuleName(detail.name);
      setModules(1);
      setKeepPrices(true);
      setStaleDays(priceAgeInDays(detail.oldestPriceDate));
    } catch (requestError) { setError(toError(requestError)); }
  };
  const stale = staleDays !== null && staleDays > STALE_TEMPLATE_PRICE_DAYS;
  const projected = selected ? selected.lines.map((line) => ({ line, quantity: line.quantityPerModule * modules, total: line.quantityPerModule * modules * (keepPrices ? line.referenceUnitCost : 0) })) : [];
  const projectedTotal = projected.reduce((sum, entry) => sum + entry.total, 0);
  /* A template can carry lines from several disciplines, so the section check has
     to read every line rather than the template's primary discipline. */
  const blocker = selected ? moduleTemplateApplyBlocker({
    status: selected.status,
    lineSections: selected.lines.map((line) => line.categoryCode),
    canEditCostItems: workspace.capabilities.canEditCostItems,
    capabilities: workspace.capabilities,
  }) : null;
  const valid = Boolean(selected && moduleName.trim() && modules >= 1) && !blocker;
  return <Modal title="Apply Master Template" subtitle="เลือกโมดูลจากคลัง ใส่จำนวนชุด แล้วดูผลก่อนลงจริง" size="wide" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" disabled={busy || saving} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={!valid || busy || saving} onClick={async () => {
      if (!selected) return;
      setSaving(true);
      await onApply({ templateId: selected.id, module: moduleName.trim(), modules, ownerId: estimateApplyOwnerId(workspace.capabilities, workspace.header.ownerId, currentUserId), keepReferencePrices: keepPrices });
      setSaving(false);
    }}><Icon name="plus" />{saving ? "Applying…" : selected ? `Apply ${projected.length} line(s)` : "Apply"}</button>
  </>}>
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    <div className="row" style={{ gap: 8 }}>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setTemplatePage(1); }} placeholder="ค้นหา code, ชื่อ, item, brand" />
      <FilterSelect label="Discipline" value={discipline} onChange={(value) => { setDiscipline(value); setTemplatePage(1); }} options={[{ value: "", label: "ทุก discipline" }, ...COST_CATEGORIES.map(([code, name]) => ({ value: code, label: `${code} ${name}` }))]} />
    </div>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading templates…"} /></div> : templates.length ? <div className="table-wrap estimate-template-picker-list"><table><thead><tr><th><LocalizedText text={"Template"} /></th><th style={{ width: 140 }}><LocalizedText text={"Discipline"} /></th><th className="num" style={{ width: 70 }}><LocalizedText text={"Lines"} /></th><th className="num" style={{ width: 140 }}><LocalizedText text={"Reference"} /></th><th style={{ width: 80 }} /></tr></thead><tbody>{templates.map((template) => <tr key={template.id} className={selected?.id === template.id ? "selected" : undefined}>
      <td><div className="cell-primary"><strong>{template.code} <LocalizedText text={"·"} /> {template.name}</strong><span>{template.description || `ใช้ไปแล้ว ${template.usageCount} ใบเสนอราคา`}</span></div></td>
      <td><span className="pill">{template.categoryCode}</span> {template.category}</td>
      <td className="num">{template.lineCount}</td>
      <td className="num">{formatMoney(template.referenceTotal)}</td>
      <td><button className="btn default sm" type="button" disabled={busy} onClick={() => { void choose(template); }}>{selected?.id === template.id ? "Selected" : "Select"}</button></td>
    </tr>)}</tbody></table></div> : <EmptyState icon="package" title="No template" message="ไม่พบชุดที่พร้อมใช้งาน — สร้างได้ที่หน้า Module Templates หรือปุ่ม Save as template บนแถบโมดูล" />}
    <Pagination page={templatePage} pageCount={Math.max(1, Math.ceil(templateTotal / 50))} from={templateTotal ? (templatePage - 1) * 50 + 1 : 0} to={Math.min(templatePage * 50, templateTotal)} total={templateTotal} onPage={setTemplatePage} />
    {selected ? <>
      {blocker ? <div className="info-strip red"><Icon name="alertCircle" /><span>{blocker}</span></div> : null}
      <div className="info-strip"><Icon name="user" /><span>{selected.name} <LocalizedText text={"· Revision"} /> {selected.revision} <LocalizedText text={"· สร้างโดย"} /> {selected.createdByName} <LocalizedText text={"· แก้ไขล่าสุดโดย"} /> {selected.updatedByName} <LocalizedText text={"เมื่อ"} /> {new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(selected.updatedAt))}</span></div>
      <div className="form-grid three" style={{ marginTop: 12 }}>
        <Field label="ชื่อโมดูลในใบนี้ *"><input required maxLength={200} value={moduleName} onChange={(event) => setModuleName(event.target.value)} /></Field>
        <Field label="จำนวนชุด *"><input className="num" type="number" min="1" max="500" step="1" value={modules} onChange={(event) => setModules(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></Field>
        <Field label="ราคา"><label className="check-inline"><input type="checkbox" checked={keepPrices} onChange={(event) => setKeepPrices(event.target.checked)} /><LocalizedText text={"ใช้ราคาอ้างอิงจาก template"} /></label></Field>
      </div>
      {stale ? <div className="info-strip amber"><Icon name="alertTriangle" /><span><LocalizedText text={"ราคาอ้างอิงเก่าสุดในชุดนี้อายุ"} /> {staleDays} <LocalizedText text={"วัน — ควรทบทวนราคาหลังลงรายการ"} /></span></div> : null}
      {!keepPrices ? <div className="info-strip"><Icon name="alertCircle" /><span><LocalizedText text={"จะลงรายการด้วยราคา 0 ทุกบรรทัด แล้วค่อยใส่ราคาเองหรือดึงจาก Price Library"} /></span></div> : null}
      <div className="table-wrap" style={{ maxHeight: 240, marginTop: 10 }}><table><thead><tr><th style={{ width: 130 }}><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Description"} /></th><th style={{ width: 130 }}><LocalizedText text={"Discipline"} /></th><th className="num" style={{ width: 90 }}><LocalizedText text={"Qty"} /></th><th style={{ width: 80 }}><LocalizedText text={"Unit"} /></th><th className="num" style={{ width: 130 }}><LocalizedText text={"Total"} /></th></tr></thead><tbody>{projected.map((entry) => <tr key={entry.line.id}>
        <td><strong className="mono">{entry.line.itemCode}</strong></td>
        <td><div className="cell-primary"><strong>{entry.line.description}</strong>{entry.line.brand || entry.line.model ? <span>{[entry.line.brand, entry.line.model].filter(Boolean).join(" · ")}</span> : null}</div></td>
        <td><span className="pill">{entry.line.categoryCode}</span> {entry.line.category}</td>
        <td className="num">{formatNumber(entry.quantity, 4)}</td>
        <td>{entry.line.unit}</td>
        <td className="num"><strong>{formatMoney(entry.total)}</strong></td>
      </tr>)}</tbody></table></div>
      <div className="sticky-foot" style={{ marginTop: 0 }}><div className="foot-item"><span><LocalizedText text={"Lines"} /></span><strong>{projected.length}</strong></div><div className="foot-item"><span><LocalizedText text={"Modules"} /></span><strong>{modules}</strong></div><div className="foot-total"><span><LocalizedText text={"Added to estimate"} /></span><strong>{formatMoney(projectedTotal)}</strong></div></div>
    </> : null}
  </Modal>;
}

/* The other half: a module that turned out well becomes a library entry without
   anyone retyping it. */
function SaveModuleTemplateModal({ group, busy, onClose, onSave }: { group: CostModuleGroup; busy: boolean; onClose: () => void; onSave: (input: { categoryCode: string; module: string; code: string; name: string; projectType: string; description: string }) => Promise<boolean> }) {
  const localizeCopy = useStaticCopy();
  const suggested = group.module.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const [code, setCode] = useState(suggested || "MODULE");
  const [name, setName] = useState(group.module);
  const [projectType, setProjectType] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = Boolean(code.trim() && name.trim());
  return <Modal title="Save as Master Template" subtitle={`${group.lines.length} รายการในโมดูล "${group.module}" จะถูกเก็บเป็นชุดตั้งต้น`} size="sm" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" disabled={busy || saving} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={!valid || busy || saving} onClick={async () => {
      setSaving(true);
      await onSave({ categoryCode: group.categoryCode, module: group.module, code: code.trim().toUpperCase(), name: name.trim(), projectType, description });
      setSaving(false);
    }}><Icon name="package" />{saving ? <LocalizedText text={"Saving…"} /> : "Save to library"}</button>
  </>}>
    <div className="form-grid two">
      <Field label="Template code *"><input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="เช่น CTU-A-800" /></Field>
      <Field label="Template name *"><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Project type"><select value={projectType} onChange={(event) => setProjectType(event.target.value)}><option value=""><LocalizedText text={"ไม่ระบุ"} /></option>{PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
      <Field label="Discipline"><input value={`${group.categoryCode} ${group.category}`} readOnly /></Field>
    </div>
    <Field label="Description"><textarea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={localizeCopy("ชุดนี้ใช้กับงานแบบไหน มีอะไรที่ต้องรู้ก่อนดึงไปใช้")} /></Field>
    <div className="info-strip" style={{ marginTop: 10 }}><Icon name="alertCircle" /><span><LocalizedText text={"ราคาที่เก็บไปเป็น"} /><b><LocalizedText text={"ราคาอ้างอิง"} /></b><LocalizedText text={"พร้อมวันที่ ไม่ใช่ราคาปัจจุบัน ตอนดึงไปใช้จะเตือนถ้าเก่าเกิน"} /> {STALE_TEMPLATE_PRICE_DAYS} <LocalizedText text={"days"} /></span></div>
  </Modal>;
}

function MainModuleEditor({ workspace, busy, onClose, onContinue }: { workspace: EstimateCostWorkspace; busy: boolean; onClose: () => void; onContinue: (seed: CostItemSeed) => void }) {
  const localizeCopy = useStaticCopy();
  const nameRef = useRef<HTMLInputElement>(null);
  const allowedCategories = COST_CATEGORIES.filter(([code]) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(code));
  const [categoryCode, setCategoryCode] = useState<string>(allowedCategories[0]?.[0] ?? "01");
  const [name, setName] = useState("");
  const selected = COST_CATEGORIES.find(([code]) => code === categoryCode) ?? COST_CATEGORIES[0];
  /* jsx-a11y forbids autoFocus; the name is still the one field that must be
     typed, so the dialog puts the caret there on open. */
  useEffect(() => { nameRef.current?.focus(); }, []);
  const submit = () => { if (!busy && name.trim()) onContinue({ categoryCode: selected[0], category: selected[1], module: name.trim(), priceSource: "Manual Estimate" }); };
  return <Modal title="New Main Module" subtitle="Name the module, then add its first item to save it into this revision" size="md" onClose={onClose} footer={<><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={submit}><Icon name="arrowRight" /><LocalizedText text={"Continue to first item"} /></button></>}>
    <div className="form-grid two"><Field label="Discipline *"><select value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>{allowedCategories.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></Field><Field label="Main module name *"><input required ref={nameRef} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder={localizeCopy("เช่น Control Panel หรือ PLC System")} /></Field></div>
    <div className="info-strip" style={{ marginTop: 12 }}><Icon name="layers" /><span><LocalizedText text={"Main Module จะถูกบันทึกจริงเมื่อ Item แรกถูกสร้าง เพื่อไม่ให้เกิดโมดูลว่างในฐานข้อมูล"} /></span></div>
  </Modal>;
}

function EstimateManhourTab({ bootstrap, workspace, busy, onNewPackage, onAddManhour, onQuickAddManhour, onEditManhour, onRemoveManhour, onAddExpense, onEditExpense, onRemoveExpense, onLaborLibraryChanged, onSaveEffort }: {
  onSaveEffort: (line: EstimateManhourLine, effort: EstimateEffortInput, rowVersion: string) => Promise<boolean>;
  bootstrap: BootstrapData;
  workspace: EstimateCostWorkspace;
  busy: boolean;
  onNewPackage: () => void;
  onLaborLibraryChanged: (message: string) => Promise<void>;
  onAddManhour: (seed?: ManhourSeed) => void;
  onQuickAddManhour: (input: EstimateManhourInput) => Promise<boolean>;
  onEditManhour: (line: EstimateManhourLine) => void;
  onRemoveManhour: (line: EstimateManhourLine) => void;
  onAddExpense: (seed?: ExpenseSeed) => void;
  onEditExpense: (line: EstimateExpenseLine) => void;
  onRemoveExpense: (line: EstimateExpenseLine) => void;
}) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const [moduleEditor, setModuleEditor] = useState<{ key: string; title: string } | null>(null);
  const [costType, setCostType] = useState("all");
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [columnsReady, setColumnsReady] = useState(false);
  const columnsKey = "estimate-manhour-columns";
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setShowAllColumns(window.localStorage.getItem(columnsKey) === "true"); } catch { /* site data blocked: start collapsed */ }
      setColumnsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [columnsKey]);
  useEffect(() => {
    if (!columnsReady) return;
    try { window.localStorage.setItem(columnsKey, String(showAllColumns)); } catch { /* nothing to remember it with */ }
  }, [columnsKey, showAllColumns, columnsReady]);
  const columnCount = showAllColumns ? 17 : 13;
  const [quickDraft, setQuickDraft] = useState<QuickManhourDraft | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [laborLibraryOpen, setLaborLibraryOpen] = useState(false);
  const [laborMasterOpen, setLaborMasterOpen] = useState(false);
  /* The master is a destination from the sidebar and a detour from the package
     picker; only the detour gets a way back. */
  const [laborMasterFromLibrary, setLaborMasterFromLibrary] = useState(false);
  const closeLaborMaster = () => { setLaborMasterOpen(false); setLaborMasterFromLibrary(false); };
  const [savedLaborPackageId, setSavedLaborPackageId] = useState<number | undefined>();
  const [laborSaveTarget, setLaborSaveTarget] = useState<{ name: string; costType: EstimateManhourInput["costType"]; lineCount: number } | null>(null);
  const quickActivityRef = useRef<HTMLInputElement>(null);
  const quickDraftGroupKey = quickDraft?.groupKey;
  const quickDraftVersion = quickDraft?.version;
  const quickDraftOpen = Boolean(quickDraft);
  useEffect(() => { if (quickDraftOpen) quickActivityRef.current?.focus(); }, [quickDraftGroupKey, quickDraftOpen, quickDraftVersion]);
  const canAddManhour = workspace.capabilities.canEditManhour;
  const canAddExpense = workspace.capabilities.canEditExpenses;
  const groupKeys = [...new Set([
    ...workspace.manhourLines.map((line) => `${line.costType}\u0000${line.package}`),
    ...workspace.expenseLines.map((line) => `${line.costType}\u0000${line.package}`),
  ])];
  const groups = groupKeys.map((key) => {
    const [groupCostType, packageName] = key.split("\u0000") as [EstimateManhourInput["costType"], string];
    return {
      key,
      name: packageName,
      costType: groupCostType,
      manhours: workspace.manhourLines.filter((line) => line.package === packageName && line.costType === groupCostType),
      expenses: workspace.expenseLines.filter((line) => line.package === packageName && line.costType === groupCostType),
    };
  }).sort((left, right) => left.costType.localeCompare(right.costType) || left.name.localeCompare(right.name));
  const visible = costType === "all" ? groups : groups.filter((group) => group.costType === costType);
  const countOf = (value: string) => value === "all"
    ? workspace.manhourLines.length + workspace.expenseLines.length
    : workspace.manhourLines.filter((line) => line.costType === value).length + workspace.expenseLines.filter((line) => line.costType === value).length;
  const engineeringCost = workspace.manhourLines.filter((line) => line.costType === "Engineering").reduce((sum, line) => sum + numberOf(line.lineCost), 0);
  const installationCost = workspace.manhourLines.filter((line) => line.costType === "Installation").reduce((sum, line) => sum + numberOf(line.lineCost), 0);
  const supplierCost = workspace.manhourLines.filter((line) => line.provider === "Supplier").reduce((sum, line) => sum + numberOf(line.lineCost), 0);
  const expenseCost = workspace.expenseLines.reduce((sum, line) => sum + numberOf(line.lineTotal), 0);
  const visibleManhours = visible.flatMap((group) => group.manhours);
  const visibleExpenses = visible.flatMap((group) => group.expenses);
  const visibleCost = visibleManhours.reduce((sum, line) => sum + numberOf(line.lineCost), 0) + visibleExpenses.reduce((sum, line) => sum + numberOf(line.lineTotal), 0);
  const defaultGroup = visible[0] ?? groups[0];
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const defaultOwnerId = !workspace.capabilities.canEditAllSections ? bootstrap.user.id : owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const departments = [...new Set(bootstrap.team.map((member) => member.department.trim()).filter(Boolean))].sort();
  const levels = [...new Set(bootstrap.team.map((member) => member.level.trim()).filter(Boolean))].sort();
  const startQuickRow = (group: { key: string; name: string; costType: EstimateManhourInput["costType"]; manhours?: EstimateManhourLine[] }) => {
    const reference = group.manhours?.find(line => line.provider === "Internal");
    setQuickDraft({
      version: (quickDraft?.version ?? 0) + 1,
      groupKey: group.key,
      package: group.name,
      activity: "",
      department: reference?.department || bootstrap.user.department || departments[0] || "Engineering",
      level: reference?.level || bootstrap.team.find((member) => member.id === bootstrap.user.id)?.level || levels[0] || "Middle Engineer",
      costType: group.costType,
      engineers: 1,
      manDays: 1,
      hoursPerDay: 8,
      ownerId: defaultOwnerId,
      remark: "",
    });
  };
  const updateQuick = <K extends keyof QuickManhourDraft>(key: K, value: QuickManhourDraft[K]) => setQuickDraft((current) => current ? { ...current, [key]: value } : current);
  const quickValid = Boolean(quickDraft && quickDraft.activity.trim() && quickDraft.department.trim() && quickDraft.level.trim() && quickDraft.engineers > 0 && quickDraft.manDays > 0 && quickDraft.hoursPerDay > 0 && quickDraft.ownerId);
  const saveQuickRow = async (continueAdding: boolean) => {
    if (!quickDraft || !quickValid || busy || quickSaving) return;
    setQuickSaving(true);
    const saved = await onQuickAddManhour({
      estimateRowVersion: workspace.header.rowVersion,
      package: quickDraft.package,
      activity: quickDraft.activity.trim(),
      department: quickDraft.department,
      level: quickDraft.level,
      costType: quickDraft.costType,
      provider: "Internal",
      engineers: quickDraft.engineers,
      manDays: quickDraft.manDays,
      hoursPerDay: quickDraft.hoursPerDay,
      dailyRate: 0,
      ownerId: quickDraft.ownerId,
      remark: quickDraft.remark,
    });
    setQuickSaving(false);
    if (!saved) return;
    setQuickDraft(continueAdding ? { ...quickDraft, version: quickDraft.version + 1, activity: "", remark: "" } : null);
  };
  const addDefaultActivity = () => defaultGroup ? startQuickRow(defaultGroup) : onNewPackage();

  return <Panel
    title="Engineering Man-hour & Site Expense"
    subtitle="Work package → activity → cost · engineering, installation, supplier man-hour และค่าเดินทางอยู่ในโครงเดียวกัน"
    actions={canAddManhour ? <><button className="btn default sm" type="button" disabled={busy} onClick={addDefaultActivity}><Icon name="plus" /><LocalizedText text={"Add activity"} /></button><button className="btn default sm" type="button" disabled={busy} onClick={() => setLaborLibraryOpen(true)}><Icon name="package" /><LocalizedText text={"Add from library"} /></button><button className="btn primary sm" type="button" disabled={busy} onClick={onNewPackage}><Icon name="layers" /><LocalizedText text={"New Work Package"} /></button></> : undefined}
    flush
  >
    {moduleEditor ? <EstimateModuleEditor workspace={workspace} moduleKey={moduleEditor.key} initialTitle={moduleEditor.title} onClose={() => setModuleEditor(null)} onSaved={() => onLaborLibraryChanged("Work package updated")} /> : null}
    <div className="info-strip"><LocalizedText text={canAddManhour ? "แก้ Qty / Man-days / Hours ได้ในช่อง · Enter หรือ ✓ เพื่อบันทึก · เพิ่มแถวแล้วกด Enter เพื่อเพิ่มต่อเนื่อง" : "Revision นี้ไม่เปิดให้แก้ไขค่าแรงในสถานะปัจจุบัน หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข"} /></div>
    <div className="subtabs" role="tablist" aria-label={localizeCopy("Cost type")}>
      <button type="button" role="tab" aria-selected={costType === "all"} className={costType === "all" ? "subtab active" : "subtab"} onClick={() => setCostType("all")}><LocalizedText text={"All work"} /><em>{countOf("all")}</em></button>
      <button type="button" role="tab" aria-selected={costType === "Engineering"} className={costType === "Engineering" ? "subtab active" : "subtab"} onClick={() => setCostType("Engineering")}><Icon name="cpu" /><LocalizedText text={"Engineering cost"} /><em>{countOf("Engineering")}</em></button>
      <button type="button" role="tab" aria-selected={costType === "Installation"} className={costType === "Installation" ? "subtab active" : "subtab"} onClick={() => setCostType("Installation")}><Icon name="truck" /><LocalizedText text={"Installation & Service cost"} /><em>{countOf("Installation")}</em></button>
      <span className="spacer" /><button type="button" className="btn ghost sm" aria-pressed={showAllColumns} onClick={() => setShowAllColumns((current) => !current)}><Icon name="table" /><LocalizedText text={showAllColumns ? "Fewer columns" : "More columns"} /></button><span className="muted" style={{ fontSize: "var(--fs-2xs)" }}><LocalizedText text={"Engineering"} /> {formatMoney(engineeringCost)} <LocalizedText text={"· Installation"} /> {formatMoney(installationCost)} <LocalizedText text={"· Supplier"} /> {formatMoney(supplierCost)} <LocalizedText text={"· Expense"} /> {formatMoney(expenseCost)}</span>
    </div>
    <div className="table-wrap tall">
      <table className="sheet manhour-sheet" style={{ minWidth: showAllColumns ? 2250 : 1580 }}>
        <thead><tr><th style={{ width: 44 }}><LocalizedText text={"No."} /></th><th style={{ width: 130 }}><LocalizedText text={"Type"} /></th><th style={{ width: 250 }}><LocalizedText text={"Activity / Description"} /></th><th style={{ width: 150 }}><LocalizedText text={"Department & level"} /></th><th style={{ width: 140 }}><LocalizedText text={"Cost Type"} /></th><th className="num" style={{ width: 80 }}><LocalizedText text={"Qty"} /></th><th style={{ width: 110 }}><LocalizedText text={"Unit"} /></th><th className="num" style={{ width: 90 }}><LocalizedText text={"Man-days"} /></th><th className="num" style={{ width: 160 }}><LocalizedText text={"Hours / Day"} /></th><th className="num" style={{ width: 120 }}><LocalizedText text={"Rate"} /></th><th className="num" style={{ width: 100 }}><LocalizedText text={"Man-hours"} /></th><th className="num" style={{ width: 130 }}><LocalizedText text={"Cost"} /></th>{showAllColumns ? <th style={{ width: 190 }}><LocalizedText text={"Supplier"} /></th> : null}{showAllColumns ? <th style={{ width: 150 }}><LocalizedText text={"Quotation No."} /></th> : null}{showAllColumns ? <th style={{ width: 150 }}><LocalizedText text={"Owner"} /></th> : null}{showAllColumns ? <th style={{ width: 180 }}><LocalizedText text={"Remark"} /></th> : null}<th style={{ width: 72 }} aria-label={uiText("Action")} /></tr></thead>
        <tbody>{visible.flatMap((group) => {
          const packageTotal = group.manhours.reduce((sum, line) => sum + numberOf(line.lineCost), 0) + group.expenses.reduce((sum, line) => sum + numberOf(line.lineTotal), 0);
          const packageManDays = group.manhours.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0);
          return [
            <tr className="module-row" key={`package-${group.key}`}><td colSpan={columnCount}><div className="row band"><span className="module-bullet"><Icon name={group.costType === "Installation" ? "truck" : "cpu"} /></span>{group.manhours.every(line => line.canEdit) && group.expenses.every(line => line.canEdit) ? <button type="button" className="module-name-edit" disabled={busy || quickSaving} title={localizeCopy("แก้ชื่อ Main Module / Rename Main Module")} onClick={() => setModuleEditor({ key: "package:" + group.costType + ":" + group.name, title: group.name })}><strong>{group.name}</strong><Icon name="edit" /></button> : <strong>{group.name}</strong>}<Badge tone={group.costType === "Installation" ? "amber" : "blue"}>{group.costType === "Installation" ? "Installation & Service" : "Engineering"}</Badge><span className="muted">{formatNumber(packageManDays)} <LocalizedText text={"MD"} />{group.expenses.length ? ` · ${group.expenses.length} expense` : ""}</span><strong className="num">{formatMoney(packageTotal)}</strong>{canAddManhour ? <><button type="button" className="group-action" disabled={busy} onClick={() => startQuickRow(group)}><Icon name="plus" /><LocalizedText text={"Add activity"} /></button><button type="button" className="group-action" disabled={busy} onClick={() => onAddManhour({ package: group.name, costType: group.costType, provider: "Supplier" })}><Icon name="quote" /><LocalizedText text={"Supplier man-hour"} /></button>{group.manhours.length ? <button type="button" className="group-action" disabled={busy} onClick={() => setLaborSaveTarget({ name: group.name, costType: group.costType, lineCount: group.manhours.length })}><Icon name="package" /><LocalizedText text={"Save as labor package"} /></button> : null}</> : null}{canAddExpense ? <button type="button" className="group-action" disabled={busy} onClick={() => onAddExpense({ package: group.name, costType: group.costType })}><Icon name="truck" /><LocalizedText text={"Add expense"} /></button> : null}</div></td></tr>,
            ...group.manhours.map((line, lineIndex) => <tr className="mh-row" key={`manhour-${line.id}`}><td><span className="cell-text muted">{lineIndex + 1}</span></td><td><span className="cell-text"><Badge tone={line.provider === "Supplier" ? "violet" : "slate"}>{line.provider === "Supplier" ? "Supplier MH" : "Own engineer"}</Badge></span></td><td><span className="cell-text"><strong>{line.activity}</strong>{!showAllColumns && line.provider === "Supplier" && line.supplierName ? <small className="cell-sub">{line.supplierName}</small> : null}</span></td><td><span className="cell-text">{line.department}<small className="cell-sub">{line.level}</small></span></td><td><span className="cell-text"><Badge tone={line.costType === "Installation" ? "amber" : "blue"}>{line.costType}</Badge></span></td><EstimateEffortCells line={line} busy={busy || quickSaving} money={formatMoney} number={formatNumber} onSave={(effort, rowVersion) => onSaveEffort(line, effort, rowVersion)} />{showAllColumns ? <><td><span className="cell-text">{line.supplierName ?? "TOMAS TECH"}</span></td><td><span className="cell-text">{line.quotationNumber || "—"}</span></td><td><span className="cell-text">{line.ownerName}</span></td><td><span className="cell-text">{line.remark || "—"}</span></td></> : null}<td><div className="row-actions">{line.canEdit ? <><button className="row-action" type="button" disabled={busy} onClick={() => onEditManhour(line)} aria-label={`Edit ${line.activity}`}><Icon name="edit" /></button><button className="row-action" type="button" disabled={busy} onClick={() => onRemoveManhour(line)} aria-label={`Remove ${line.activity}`}><Icon name="trash" /></button></> : <Icon name="lock" />}</div></td></tr>),
            ...group.expenses.map((line, lineIndex) => <tr key={`expense-${line.id}`} className="expense-row mh-row"><td><span className="cell-text muted">{group.manhours.length + lineIndex + 1}</span></td><td><span className="cell-text"><Badge tone="amber">{line.expenseType}</Badge></span></td><td><span className="cell-text"><strong>{line.description}</strong>{!showAllColumns && line.supplierName ? <small className="cell-sub">{line.supplierName}</small> : null}</span></td><td><span className="cell-text muted">—</span></td><td><span className="cell-text"><Badge tone="amber">{line.costType}</Badge></span></td><td><span className="cell-text num">{formatNumber(line.quantity)}</span></td><td><span className="cell-text">{line.unit}</span></td><td><span className="cell-text muted">—</span></td><td><span className="cell-text muted">—</span></td><td className="computed">{formatMoney(line.unitCost)}</td><td><span className="cell-text muted">—</span></td><td className="computed"><strong>{formatMoney(line.lineTotal)}</strong></td>{showAllColumns ? <><td><span className="cell-text">{line.supplierName ?? "Vendor"}</span></td><td><span className="cell-text">{line.referenceNumber || "—"}</span></td></> : null}{showAllColumns ? <><td><span className="cell-text">{line.ownerName}</span></td><td><span className="cell-text">{line.remark || "—"}</span></td></> : null}<td><div className="row-actions">{line.canEdit ? <><button className="row-action" type="button" disabled={busy} onClick={() => onEditExpense(line)} aria-label={`Edit ${line.description}`}><Icon name="edit" /></button><button className="row-action" type="button" disabled={busy} onClick={() => onRemoveExpense(line)} aria-label={`Remove ${line.description}`}><Icon name="trash" /></button></> : <Icon name="lock" />}</div></td></tr>),
            quickDraft?.groupKey === group.key ? <tr className="inline-draft-row mh-row" key={`quick-${group.key}-${quickDraft.version}`} title={localizeCopy("Enter: save and create the next row · Esc: cancel")} onKeyDown={(event) => {
              if (event.key === "Escape") { event.preventDefault(); setQuickDraft(null); }
              if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void saveQuickRow(true); }
            }}><td><span className="cell-text quick-new"><LocalizedText text={"New"} /></span></td><td><span className="cell-text"><Badge tone="slate"><LocalizedText text={"Own engineer"} /></Badge></span></td><td><input ref={quickActivityRef} required aria-label={localizeCopy("New activity")} maxLength={300} placeholder={localizeCopy("Activity *")} value={quickDraft.activity} onChange={(event) => updateQuick("activity", event.target.value)} /></td><td><div className="cell-stack"><select aria-label={uiText("Department")} value={quickDraft.department} onChange={(event) => updateQuick("department", event.target.value)}>{departments.map((department) => <option key={department}>{department}</option>)}</select><select aria-label={localizeCopy("Engineer level")} value={quickDraft.level} onChange={(event) => updateQuick("level", event.target.value)}>{levels.map((level) => <option key={level}>{level}</option>)}</select></div></td><td><span className="cell-text"><Badge tone={quickDraft.costType === "Installation" ? "amber" : "blue"}>{quickDraft.costType}</Badge></span></td><td><input className="num" aria-label={localizeCopy("Engineer quantity")} type="number" min="0.01" max="10000" step="0.01" value={quickDraft.engineers} onChange={(event) => updateQuick("engineers", Number(event.target.value))} /></td><td><span className="cell-text"><LocalizedText text={"Engineer"} /></span></td><td><input className="num" aria-label={uiText("Man-days")} type="number" min="0.01" max="100000" step="0.01" value={quickDraft.manDays} onChange={(event) => updateQuick("manDays", Number(event.target.value))} /></td><td><input className="num" aria-label={localizeCopy("Hours per day")} type="number" min="0.01" max="24" step="0.01" value={quickDraft.hoursPerDay} onChange={(event) => updateQuick("hoursPerDay", Number(event.target.value))} /></td><td className="computed"><span className="muted"><LocalizedText text={"Rate master"} /></span></td><td className="computed">{formatNumber(quickDraft.engineers * quickDraft.manDays * quickDraft.hoursPerDay)} <LocalizedText text={"HR"} /></td><td className="computed"><span className="muted"><LocalizedText text={"On save"} /></span></td>{showAllColumns ? <><td><span className="cell-text">TOMAS TECH</span></td><td><span className="cell-text muted">—</span></td><td><select aria-label={localizeCopy("Activity owner")} value={quickDraft.ownerId} onChange={(event) => updateQuick("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></td><td><input aria-label={localizeCopy("Activity remark")} maxLength={20000} placeholder={uiText("Remark")} value={quickDraft.remark} onChange={(event) => updateQuick("remark", event.target.value)} /></td></> : null}<td><div className="row-actions"><button className="row-action save" type="button" disabled={!quickValid || busy || quickSaving} onClick={() => { void saveQuickRow(true); }} aria-label={localizeCopy("Save activity")}><Icon name="check" /></button><button className="row-action" type="button" disabled={busy || quickSaving} onClick={() => setQuickDraft(null)} aria-label={localizeCopy("Cancel new activity")}><Icon name="x" /></button></div></td></tr> : null,
            <tr className="add-row" key={`add-activity-${group.key}`}><td colSpan={columnCount}><button type="button" className="add-row-btn" disabled={!canAddManhour || busy} onClick={() => startQuickRow(group)}><span><Icon name="plus" /><LocalizedText text={"Add activity to"} /> {group.name}</span></button></td></tr>,
            <tr className="add-row" key={`add-expense-${group.key}`}><td colSpan={columnCount}><button type="button" className="add-row-btn expense" disabled={!canAddExpense || busy} onClick={() => onAddExpense({ package: group.name, costType: group.costType })}><span><Icon name="truck" /><LocalizedText text={"Add travel, accommodation or other expense to"} /> {group.name}</span></button></td></tr>,
            <tr className="subtotal-row" key={`subtotal-${group.key}`}><td colSpan={3}>{group.name} <LocalizedText text={"subtotal"} /></td><td colSpan={8} /><td className="num">{formatMoney(packageTotal)}</td><td colSpan={columnCount - 12} /></tr>,
          ];
        })}{!visible.length ? <tr><td colSpan={columnCount}><EmptyState icon="layers" title="No work package yet" message="สร้าง Work Package แล้วเพิ่ม Activity, Supplier man-hour หรือค่าเดินทางที่เกี่ยวข้อง" action={canAddManhour ? <button className="btn primary" type="button" disabled={busy} onClick={onNewPackage}><Icon name="layers" /><LocalizedText text={"New Work Package"} /></button> : undefined} /></td></tr> : null}</tbody>
      </table>
    </div>
    {laborLibraryOpen ? <ApplyLaborPackageModal workspace={workspace} currentUserId={bootstrap.user.id} busy={busy} onClose={() => setLaborLibraryOpen(false)} onApplied={onLaborLibraryChanged} onManageLibrary={() => { setLaborLibraryOpen(false); setSavedLaborPackageId(undefined); setLaborMasterFromLibrary(true); setLaborMasterOpen(true); }} /> : null}
    {laborSaveTarget ? <SaveLaborPackageModal estimateId={workspace.header.id} packageName={laborSaveTarget.name} costType={laborSaveTarget.costType} lineCount={laborSaveTarget.lineCount} busy={busy} onClose={() => setLaborSaveTarget(null)} onSaved={onLaborLibraryChanged} onOpenSaved={(id) => { setLaborSaveTarget(null); setSavedLaborPackageId(id); setLaborMasterFromLibrary(false); setLaborMasterOpen(true); }} /> : null}
    {laborMasterOpen ? <Modal title="Labor Package Master" size="xl" onClose={closeLaborMaster}><LaborPackageMaster bootstrap={bootstrap} initialPackageId={savedLaborPackageId} onClose={closeLaborMaster} onBack={laborMasterFromLibrary ? () => { closeLaborMaster(); setLaborLibraryOpen(true); } : undefined} /></Modal> : null}
    <div className="sticky-foot"><div className="foot-item"><span><LocalizedText text={"Engineering cost"} /></span><strong>{formatMoney(engineeringCost)}</strong></div><div className="foot-item"><span><LocalizedText text={"Installation & service"} /></span><strong>{formatMoney(installationCost)}</strong></div><div className="foot-item"><span><LocalizedText text={"Supplier man-hour"} /></span><strong>{formatMoney(supplierCost)}</strong></div><div className="foot-item"><span><LocalizedText text={"Travel / hotel / per diem"} /></span><strong>{formatMoney(expenseCost)}</strong></div><div className="foot-item"><span><LocalizedText text={"Man-days"} /></span><strong>{formatNumber(visibleManhours.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))} <LocalizedText text={"MD"} /></strong></div><div className="foot-item"><span><LocalizedText text={"Man-hours"} /></span><strong>{formatNumber(visibleManhours.reduce((sum, line) => sum + numberOf(line.manHours), 0))} <LocalizedText text={"HR"} /></strong></div><div className="foot-total"><span><LocalizedText text={costType === "all" ? "Shown" : costType === "Engineering" ? "Engineering cost" : "Installation & Service cost"} /> <LocalizedText text={"subtotal"} /></span><strong>{formatMoney(visibleCost)}</strong></div></div>
  </Panel>;
}

function EstimateOtherCostTab({ workspace, busy, onAddOther, onEditOther, onRemoveOther, onUpdateContingency }: {
  workspace: EstimateCostWorkspace;
  busy: boolean;
  onAddOther: () => void;
  onEditOther: (line: EstimateOtherCostLine) => void;
  onRemoveOther: (line: EstimateOtherCostLine) => void;
  onUpdateContingency: (rate: number) => Promise<void>;
}) {
  const uiText = useUiText();
  const [contingency, setContingency] = useState(numberOf(workspace.header.contingencyRate));
  const previewContingency = Math.round(numberOf(workspace.header.totals.subtotal) * contingency / 100);
  const previewTotal = numberOf(workspace.header.totals.subtotal) + previewContingency;
  return <section className="grid-main">
    <div className="stack">
      <Panel title="Outsource & Other Project Cost" subtitle="Cost line ที่ไม่ใช่ material หรือ man-hour" actions={workspace.capabilities.canEditOtherCosts ? <button className="btn primary sm" type="button" onClick={onAddOther}><Icon name="plus" /><LocalizedText text={"Add other cost"} /></button> : undefined} flush>
        {workspace.otherCostLines.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Category"} /></th><th><LocalizedText text={"Description"} /></th><th className="num"><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"Unit cost"} /></th><th className="num"><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Remark"} /></th><th /></tr></thead><tbody>{workspace.otherCostLines.map((line) => <tr key={line.id}><td><Badge>{line.category}</Badge></td><td><strong>{line.description}</strong></td><td className="num">{formatNumber(line.quantity, 4)}</td><td>{line.unit}</td><td className="num">{formatMoney(line.unitCost)}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td><td>{line.remark || "—"}</td><td>{line.canEdit ? <div className="row-actions"><button className="icon-btn" type="button" disabled={busy} onClick={() => onEditOther(line)} aria-label={`Edit ${line.description}`}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} onClick={() => onRemoveOther(line)} aria-label={`Remove ${line.description}`}><Icon name="trash" /></button></div> : <Icon name="lock" />}</td></tr>)}</tbody></table></div> : <EmptyState icon="package" title="No other project cost" message="ยังไม่มี outsource, transportation, accommodation หรือ other cost" action={workspace.capabilities.canEditOtherCosts ? <button className="btn primary" type="button" onClick={onAddOther}><Icon name="plus" /><LocalizedText text={"Add other cost"} /></button> : undefined} />}
      </Panel>
    </div>
    <div className="stack">
      <Panel title={uiText("Contingency")} subtitle="Applied by SQL Server to the current cost base">
        <Field label={`Contingency rate — ${formatNumber(contingency)}%`} hint={workspace.capabilities.canUpdateContingency ? "Save เพื่อบันทึกพร้อม optimistic concurrency" : "บัญชีนี้ไม่มีสิทธิ์แก้ contingency"}><input type="range" min="0" max="100" step="0.25" value={contingency} disabled={!workspace.capabilities.canUpdateContingency || busy} onChange={(event) => setContingency(Number(event.target.value))} /></Field>
        <div className="calc-strip" style={{ marginTop: 10 }}><Icon name="cpu" /><span>{formatMoney(workspace.header.totals.subtotal)} × {formatNumber(contingency)}%</span><strong>{formatMoney(previewContingency)}</strong></div>
        <div className="calc-strip" style={{ marginTop: 8 }}><Icon name="chart" /><span><LocalizedText text={"Preview total after contingency"} /></span><strong>{formatMoney(previewTotal)}</strong></div>
        {workspace.capabilities.canUpdateContingency ? <button className="btn primary block" style={{ marginTop: 12 }} type="button" disabled={busy || contingency === numberOf(workspace.header.contingencyRate)} onClick={() => { void onUpdateContingency(contingency); }}><Icon name="check" /><LocalizedText text={"Save contingency"} /></button> : null}
      </Panel>
      <Panel title="Cost base"><dl className="def-list one"><div><dt><LocalizedText text={"Material"} /></dt><dd>{formatMoney(workspace.header.totals.material)}</dd></div><div><dt><LocalizedText text={"Engineering"} /></dt><dd>{formatMoney(workspace.header.totals.engineering)}</dd></div><div><dt><LocalizedText text={"Outsource"} /></dt><dd>{formatMoney(workspace.header.totals.outsource)}</dd></div><div><dt><LocalizedText text={"Transportation"} /></dt><dd>{formatMoney(workspace.header.totals.transportation)}</dd></div><div><dt><LocalizedText text={"Accommodation"} /></dt><dd>{formatMoney(workspace.header.totals.accommodation)}</dd></div><div><dt><LocalizedText text={"Other"} /></dt><dd>{formatMoney(workspace.header.totals.other)}</dd></div><div><dt><LocalizedText text={"Subtotal"} /></dt><dd>{formatMoney(workspace.header.totals.subtotal)}</dd></div><div><dt><LocalizedText text={"Contingency"} /></dt><dd>{formatMoney(workspace.header.totals.contingency)}</dd></div><div><dt><LocalizedText text={"Total"} /></dt><dd><strong>{formatMoney(workspace.header.totals.total)}</strong></dd></div></dl></Panel>
    </div>
  </section>;
}

function EstimateAssignmentTab({ workspace, onAssign, onEdit }: { workspace: EstimateCostWorkspace; onAssign: () => void; onEdit: (assignment: EstimateAssignment) => void }) {
  const overall = workspace.assignments.length ? workspace.assignments.reduce((sum, assignment) => sum + numberOf(assignment.progress), 0) / workspace.assignments.length : 0;
  return <section className="grid-main"><Panel title="Estimate sections" subtitle="ผู้รับผิดชอบ วันครบกำหนด สถานะ และ progress จากฐานข้อมูล" flush actions={workspace.capabilities.canManageAssignments && ESTIMATE_ASSIGNMENT_SECTIONS.some(([code]) => !workspace.assignments.some((assignment) => assignment.section.trim().slice(0, 2) === code)) ? <button className="btn primary sm" type="button" onClick={onAssign}><Icon name="plus" /><LocalizedText text={"Assign section"} /></button> : undefined}>
    {workspace.assignments.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Section"} /></th><th><LocalizedText text={"Responsible Engineer"} /></th><th><LocalizedText text={"Support Engineer"} /></th><th><LocalizedText text={"Due Date"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Comment"} /></th><th /></tr></thead><tbody>{workspace.assignments.map((assignment) => <tr key={assignment.id}><td><strong>{assignment.section}</strong></td><td>{assignment.ownerName}</td><td>{assignment.supportName ?? "—"}</td><td>{formatDate(assignment.dueDate)}</td><td><Badge>{assignment.status}</Badge></td><td style={{ minWidth: 120 }}><ProgressCell value={numberOf(assignment.progress)} /></td><td>{assignment.comment || "—"}</td><td>{assignment.canEdit ? <button className="icon-btn" type="button" onClick={() => onEdit(assignment)} aria-label={`Edit assignment ${assignment.section}`}><Icon name="edit" /></button> : <Icon name="lock" />}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No section assignment" message={workspace.capabilities.canManageAssignments ? "กด Assign section เพื่อมอบหมายงานก่อนเริ่มกรอกต้นทุน" : "ยังไม่มีผู้รับผิดชอบ section ใน Estimate นี้"} />}
  </Panel><div className="stack"><Panel title="Estimate completion"><div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}><span className="muted"><LocalizedText text={"Overall assignment progress"} /></span><strong style={{ fontSize: "var(--fs-xl)" }}>{Math.round(overall)}%</strong></div><Progress value={overall} /><ul className="check-list" style={{ marginTop: 12 }}>{workspace.assignments.map((assignment) => <li key={assignment.id} className={`check-item ${numberOf(assignment.progress) === 100 ? "pass" : ""}`}><Icon name={numberOf(assignment.progress) === 100 ? "checkCircle" : assignment.status.includes("Waiting") ? "clock" : "alertCircle"} /><div><strong>{assignment.section} — {formatNumber(assignment.progress)}%</strong><p>{assignment.ownerName} <LocalizedText text={"·"} /> {assignment.status}</p></div></li>)}</ul></Panel><Panel title="Permission"><div className="info-strip"><Icon name="shield" /><span>{workspace.capabilities.canManageAssignments ? "บัญชีนี้สามารถมอบหมายผู้รับผิดชอบ เปลี่ยน schedule และอัปเดต progress ได้" : workspace.assignments.some((assignment) => assignment.canEdit) ? "คุณอัปเดตสถานะ progress และ comment ของ section ที่รับผิดชอบได้ โดยเปลี่ยนผู้รับผิดชอบหรือ due date ไม่ได้" : "อ่านอย่างเดียว — Estimate owner, Engineering Manager หรือ Admin เป็นผู้จัด assignment"}</span></div></Panel></div></section>;
}

function EstimateValidationTab({ workspace, onFix }: { workspace: EstimateCostWorkspace; onFix: (issue: EstimateCostWorkspace["validationIssues"][number]) => void }) {
  const criticalIssues = workspace.validationIssues.filter(isCriticalValidationIssue);
  const warningIssues = workspace.validationIssues.filter((issue) => !isCriticalValidationIssue(issue));
  const orderedIssues = [...criticalIssues, ...warningIssues];
  const resultTone = criticalIssues.length ? "red" : warningIssues.length ? "amber" : "green";
  const resultIcon = criticalIssues.length || warningIssues.length ? "alertTriangle" : "checkCircle";
  return <section className="grid-main"><Panel title="Estimate Validation" subtitle="ตรวจโดย API/SQL Server ก่อน Submit และ Approve">
    {orderedIssues.length ? <ul className="check-list">{orderedIssues.map((issue) => { const critical = isCriticalValidationIssue(issue); return <li className={`check-item ${critical ? "error" : "warning"}`} key={`${issue.code}-${issue.entityType}-${issue.entityId}`}><Icon name={critical ? "alertCircle" : "alertTriangle"} /><div style={{ flex: 1 }}><strong>{estimateIssueMessage(issue, currentLocale())}</strong><details><summary>{estimateUxCopy(currentLocale(), "รายละเอียดการตรวจ", "Validation details", "検証の詳細")}</summary><p>{issue.message} · {issue.code} · {issue.entityType} #{issue.entityId}</p></details></div>{estimateIssueTab(issue) !== "validation" ? <button className="btn ghost sm" type="button" onClick={() => onFix(issue)}>{estimateUxCopy(currentLocale(), "เปิดจุดที่ต้องตรวจ", "Open affected section", "該当箇所を開く")}<Icon name="arrowRight" /></button> : null}</li>; })}</ul> : <div className="empty"><span className="empty-icon"><Icon name="checkCircle" /></span><strong><LocalizedText text={"Server validation passed"} /></strong><p><LocalizedText text={"Revision ปัจจุบันไม่มี critical issue หรือ advisory warning"} /></p></div>}
  </Panel><div className="stack"><Panel title="Result"><div className={`info-strip ${resultTone}`}><Icon name={resultIcon} /><span>{criticalIssues.length ? `${criticalIssues.length} error(s) block submission and approval${warningIssues.length ? ` · ${warningIssues.length} warning(s) are advisory` : ""}` : warningIssues.length ? `${warningIssues.length} advisory warning(s) do not block submission or approval` : "No validation error or warning"}</span></div></Panel><Panel title="Rules enforced"><ul className="check-list"><li className="check-item"><Icon name="cpu" /><div><strong><LocalizedText text={"Positive quantity"} /></strong><p><LocalizedText text={"Every persisted line must have quantity greater than zero."} /></p></div></li><li className="check-item"><Icon name="cpu" /><div><strong><LocalizedText text={"Unit cost and owner"} /></strong><p><LocalizedText text={"Required references are checked at the API boundary."} /></p></div></li><li className="check-item"><Icon name="cpu" /><div><strong><LocalizedText text={"Supplier man-hour"} /></strong><p><LocalizedText text={"Supplier and quotation are mandatory."} /></p></div></li><li className="check-item"><Icon name="cpu" /><div><strong><LocalizedText text={"Non-empty revision"} /></strong><p><LocalizedText text={"At least one cost or effort line is required."} /></p></div></li></ul></Panel></div></section>;
}

function revisionWithCurrent(revisions: EstimateRevision[], currentRevision: number, currentTotal: number) {
  const existing = revisions.find((revision) => revision.revision === currentRevision);
  if (existing) return revisions.map((revision) => revision.revision === currentRevision ? { ...revision, total: currentTotal } : revision).sort((left, right) => left.revision - right.revision);
  return [...revisions, { id: -1, revision: currentRevision, code: revisionCode(currentRevision), reason: "Current revision", description: "Current live revision", createdById: 0, createdByName: "—", createdAt: "", reviewedById: null, reviewedByName: null, reviewedAt: null, status: "Active", total: currentTotal }].sort((left, right) => left.revision - right.revision);
}

function RevisionDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <>—</>;
  if (text.length <= 160 && !text.includes("\n")) return <span className="revision-description-text">{text}</span>;
  let formatted = text;
  if (expanded) {
    try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Plain descriptions retain their original text. */ }
  }
  return <div className="revision-description">
    <div className={expanded ? "revision-description-text expanded" : "revision-description-text collapsed"}>{expanded ? formatted : text.slice(0, 160) + (text.length > 160 ? "…" : "")}</div>
    <button type="button" className="link-btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? estimateUxCopy(currentLocale(), "ย่อรายละเอียด", "Show less", "折りたたむ") : estimateUxCopy(currentLocale(), "ขยายรายละเอียด", "Show more", "詳細を表示")}</button>
  </div>;
}

function EstimateRevisionTab({ revisions, currentRevision, currentTotal }: { revisions: EstimateRevision[]; currentRevision: number; currentTotal: number }) {
  const rows = revisionWithCurrent(revisions, currentRevision, currentTotal);
  return <Panel title="Revision Control" subtitle="Revision history เป็น immutable record; เปิด revision ใหม่จากแถบคำสั่งของรายการที่ Approved หรือ Locked" flush>{rows.length ? <div className="table-wrap"><table className="estimate-revision-table"><thead><tr><th><LocalizedText text={"Revision"} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Created by"} /></th><th><LocalizedText text={"Created"} /></th><th><LocalizedText text={"Reviewed by"} /></th><th><LocalizedText text={"Reviewed"} /></th><th className="num"><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead><tbody>{rows.map((revision) => <tr key={revision.id}><td><span className="pill blue">{revision.code || revisionCode(revision.revision)}</span></td><td><strong>{revision.reason}</strong></td><td><RevisionDescription text={revision.description} /></td><td>{revision.createdByName}</td><td>{formatDateTime(revision.createdAt)}</td><td>{revision.reviewedByName ?? "—"}</td><td>{formatDateTime(revision.reviewedAt)}</td><td className="num"><strong>{formatMoney(revision.total)}</strong></td><td><Badge>{revision.revision === currentRevision ? "Current" : revision.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon="gitBranch" title="No revision history" message="ยังไม่มี revision record ที่ API ส่งกลับ" />}</Panel>;
}

function EstimateCompareTab({ revisions, currentRevision, currentTotal }: { revisions: EstimateRevision[]; currentRevision: number; currentTotal: number }) {
  const uiText = useUiText();
  const rows = revisionWithCurrent(revisions, currentRevision, currentTotal);
  const [selectedFromRevision, setFromRevision] = useState<number | null>(null);
  const [selectedToRevision, setToRevision] = useState<number | null>(null);
  const defaultFromRevision = rows[Math.max(0, rows.length - 2)]?.revision ?? currentRevision;
  const defaultToRevision = rows[rows.length - 1]?.revision ?? currentRevision;
  const fromRevision = selectedFromRevision !== null && rows.some((revision) => revision.revision === selectedFromRevision) ? selectedFromRevision : defaultFromRevision;
  const toRevision = selectedToRevision !== null && rows.some((revision) => revision.revision === selectedToRevision) ? selectedToRevision : defaultToRevision;
  const from = rows.find((revision) => revision.revision === fromRevision);
  const to = rows.find((revision) => revision.revision === toRevision);
  const delta = numberOf(to?.total) - numberOf(from?.total);
  if (rows.length < 2) return <Panel title={uiText("Compare Revision")}><EmptyState icon="compare" title="Comparison is not available yet" message="ต้องมี revision history อย่างน้อยสอง revision; ระบบไม่สร้างข้อมูลเปรียบเทียบจำลอง" /></Panel>;
  return <><Panel title="Compare Estimate Revision" subtitle="เปรียบเทียบยอดรวมจาก revision history จริง"><div className="row"><Field label="From revision"><select value={fromRevision} onChange={(event) => setFromRevision(Number(event.target.value))}>{rows.map((revision) => <option key={revision.revision} value={revision.revision}>{revision.code || revisionCode(revision.revision)}</option>)}</select></Field><Icon name="arrowRight" /><Field label="To revision"><select value={toRevision} onChange={(event) => setToRevision(Number(event.target.value))}>{rows.map((revision) => <option key={revision.revision} value={revision.revision}>{revision.code || revisionCode(revision.revision)}</option>)}</select></Field></div></Panel><div style={{ height: 14 }} /><section className="grid-3"><Panel title={`${from?.code ?? revisionCode(fromRevision)} Total`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{formatMoney(from?.total)}</strong><p className="muted">{from?.reason}</p></Panel><Panel title={`${to?.code ?? revisionCode(toRevision)} Total`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{formatMoney(to?.total)}</strong><p className="muted">{to?.reason}</p></Panel><Panel title="Difference"><strong style={{ fontSize: "var(--fs-2xl)" }} className={delta > 0 ? "red-text" : delta < 0 ? "green-text" : "muted"}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatMoney(Math.abs(delta))}</strong><p className="muted">{numberOf(from?.total) ? `${(delta / numberOf(from?.total) * 100).toFixed(1)}%` : "No baseline total"}</p></Panel></section><div className="info-strip" style={{ marginTop: 14 }}><Icon name="alertCircle" /><span><LocalizedText text={"Line-by-line historical comparison จะเปิดเมื่อ backend ส่ง revision snapshots; หน้านี้แสดงเฉพาะ revision totals ที่มีอยู่จริง"} /></span></div></>;
}

function EstimateReviewTab({ workspace, onWorkflow }: { workspace: EstimateCostWorkspace; onWorkflow: (action: "submit" | "approve" | "request-revision") => void }) {
  const uiText = useUiText();
  const topItems = [...workspace.costItems].sort((left, right) => numberOf(right.lineTotal) - numberOf(left.lineTotal)).slice(0, 10);
  const effortByDepartment = [...new Set(workspace.manhourLines.map((line) => line.department))].map((department) => ({ department, lines: workspace.manhourLines.filter((line) => line.department === department) }));
  const criticalIssues = workspace.validationIssues.filter(isCriticalValidationIssue);
  const warningIssues = workspace.validationIssues.filter((issue) => !isCriticalValidationIssue(issue));
  const orderedIssues = [...criticalIssues, ...warningIssues];
  return <section className="grid-main"><div className="stack"><Panel title={uiText("Project information")}><dl className="def-list"><div><dt><LocalizedText text={"Estimate"} /></dt><dd className="mono">{workspace.header.number} <LocalizedText text={"·"} /> {revisionCode(workspace.header.revision)}</dd></div><div><dt><LocalizedText text={"Inquiry"} /></dt><dd className="mono">{workspace.header.inquiryNumber}</dd></div><div><dt><LocalizedText text={"Customer"} /></dt><dd>{workspace.header.customerName}</dd></div><div><dt><LocalizedText text={"Project"} /></dt><dd>{workspace.header.projectName}</dd></div><div><dt><LocalizedText text={"Project type"} /></dt><dd>{workspace.header.projectType}</dd></div><div><dt><LocalizedText text={"Estimate owner"} /></dt><dd>{workspace.header.ownerName}</dd></div><div><dt><LocalizedText text={"Due date"} /></dt><dd>{formatDate(workspace.header.dueDate)}</dd></div><div><dt><LocalizedText text={"Status"} /></dt><dd><Badge>{workspace.header.status}</Badge></dd></div></dl></Panel>
    <Panel title="Cost summary" subtitle="Approval covers internal engineering cost only — no margin" flush><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Cost block"} /></th><th className="num"><LocalizedText text={"Amount"} /></th><th className="num"><LocalizedText text={"Share"} /></th></tr></thead><tbody>{[["Material", workspace.header.totals.material], ["Engineering", workspace.header.totals.engineering], ["Outsource", workspace.header.totals.outsource], ["Transportation", workspace.header.totals.transportation], ["Accommodation", workspace.header.totals.accommodation], ["Other", workspace.header.totals.other], [`Contingency ${formatNumber(workspace.header.contingencyRate)}%`, workspace.header.totals.contingency]].map(([label, value]) => <tr key={String(label)}><td>{label}</td><td className="num">{formatMoney(value as number)}</td><td className="num muted">{numberOf(workspace.header.totals.total) ? `${Math.round(numberOf(value) / numberOf(workspace.header.totals.total) * 100)}%` : "0%"}</td></tr>)}<tr className="subtotal-row"><td><LocalizedText text={"Total estimated cost"} /></td><td className="num"><strong>{formatMoney(workspace.header.totals.total)}</strong></td><td className="num">100%</td></tr></tbody></table></div></Panel>
    <Panel title="Top 10 highest cost items" flush>{topItems.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Supplier"} /></th><th className="num"><LocalizedText text={"Total"} /></th></tr></thead><tbody>{topItems.map((line) => <tr key={line.id}><td><div className="cell-primary"><strong>{line.description}</strong><span>{line.brand} {line.model}</span></div></td><td>{line.supplierName ?? "—"}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td></tr>)}</tbody></table></div> : <EmptyState icon="package" title={uiText("No cost item")} message="ยังไม่มี cost item สำหรับ review" />}</Panel>
    <Panel title="Engineering man-hour by department" flush>{effortByDepartment.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Department"} /></th><th className="num"><LocalizedText text={"Man-days"} /></th><th className="num"><LocalizedText text={"Man-hours"} /></th><th className="num"><LocalizedText text={"Cost"} /></th></tr></thead><tbody>{effortByDepartment.map((entry) => <tr key={entry.department}><td><strong>{entry.department}</strong></td><td className="num">{formatNumber(entry.lines.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))}</td><td className="num">{formatNumber(entry.lines.reduce((sum, line) => sum + numberOf(line.manHours), 0))}</td><td className="num">{formatMoney(entry.lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0))}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No man-hour" message="ยังไม่มี engineering effort สำหรับ review" />}</Panel></div>
    <div className="stack"><Panel title="Reviewer decision" subtitle="Actions shown from API capabilities"><div className="stack" style={{ gap: 8 }}>{workspace.capabilities.canSubmit ? <button className="btn primary block" type="button" disabled={criticalIssues.length > 0} onClick={() => onWorkflow("submit")}><Icon name="send" /><LocalizedText text={"Submit for Engineering Review"} /></button> : null}{workspace.capabilities.canApprove ? <button className="btn success block" type="button" disabled={criticalIssues.length > 0} onClick={() => onWorkflow("approve")}><Icon name="checkCircle" /><LocalizedText text={"Approve Estimate Cost"} /></button> : null}{workspace.capabilities.canRequestRevision ? <button className="btn warn block" type="button" onClick={() => onWorkflow("request-revision")}><Icon name="refresh" /><LocalizedText text={"Request Revision"} /></button> : null}{!workspace.capabilities.canSubmit && !workspace.capabilities.canApprove && !workspace.capabilities.canRequestRevision ? <div className="info-strip"><Icon name="shield" /><span><LocalizedText text={"บัญชีนี้ไม่มี workflow action สำหรับสถานะปัจจุบัน"} /></span></div> : null}</div>{criticalIssues.length ? <div className="info-strip red" style={{ marginTop: 10 }}><Icon name="alertTriangle" />{criticalIssues.length} <LocalizedText text={"critical error(s) block submission and approval."} /></div> : null}{warningIssues.length ? <div className="info-strip amber" style={{ marginTop: 10 }}><Icon name="alertTriangle" />{warningIssues.length} <LocalizedText text={"warning(s) are advisory and do not block workflow."} /></div> : null}</Panel>
    <Panel title="Validation for reviewer">{orderedIssues.length ? <ul className="check-list">{orderedIssues.map((issue) => { const critical = isCriticalValidationIssue(issue); return <li className={`check-item ${critical ? "error" : "warning"}`} key={`${issue.code}-${issue.entityType}-${issue.entityId}`}><Icon name={critical ? "alertCircle" : "alertTriangle"} /><div><strong>{issue.code.replaceAll("_", " ")} <LocalizedText text={"·"} /> {issue.severity}</strong><p>{issue.message}</p></div></li>; })}</ul> : <p className="muted"><LocalizedText text={"No server validation issue."} /></p>}</Panel>
    <Panel title={uiText("Revision history")} flush><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Rev."} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Status"} /></th><th className="num"><LocalizedText text={"Total"} /></th></tr></thead><tbody>{workspace.revisionHistory.map((revision) => <tr key={revision.id}><td><span className="pill">{revision.code}</span></td><td>{revision.reason}</td><td><Badge>{revision.status}</Badge></td><td className="num">{formatMoney(revision.total)}</td></tr>)}</tbody></table></div></Panel></div>
  </section>;
}

function CostItemEditor({ bootstrap, workspace, line, seed = {}, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateCostItem | null; seed?: CostItemSeed; busy: boolean; onClose: () => void; onSave: (input: CostItemInput, lineId?: number) => Promise<void> }) {
  const allOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const owners = workspace.capabilities.canEditAllSections
    ? allOwners
    : allOwners.filter((owner) => owner.id === (line?.ownerId ?? bootstrap.user.id));
  const defaultOwner = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const allowedCategories = COST_CATEGORIES.filter(([code]) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(code) || line?.categoryCode === code);
  const initialCategory = allowedCategories[0] ?? COST_CATEGORIES[0];
  const [form, setForm] = useState<CostItemInput>(() => ({
    estimateRowVersion: workspace.header.rowVersion,
    lineRowVersion: line?.rowVersion,
    categoryCode: line?.categoryCode ?? seed.categoryCode ?? initialCategory[0],
    category: line?.category ?? seed.category ?? initialCategory[1],
    subcategory: line?.subcategory ?? seed.subcategory ?? "",
    module: line?.module ?? seed.module ?? "",
    itemCode: line?.itemCode ?? seed.itemCode ?? "",
    description: line?.description ?? seed.description ?? "",
    brand: line?.brand ?? seed.brand ?? "",
    model: line?.model ?? seed.model ?? "",
    specification: line?.specification ?? seed.specification ?? "",
    supplierId: line?.supplierId ?? seed.supplierId ?? undefined,
    quantity: numberOf(line?.quantity ?? seed.quantity) || 1,
    unit: line?.unit ?? seed.unit ?? "Set",
    unitCost: numberOf(line?.unitCost ?? seed.unitCost),
    priceSource: line?.priceSource ?? seed.priceSource ?? "Supplier Quotation",
    referenceNumber: line?.referenceNumber ?? seed.referenceNumber ?? "",
    referenceProject: line?.referenceProject ?? seed.referenceProject ?? "",
    priceDate: dateValue(line?.priceDate ?? seed.priceDate) || businessDate(),
    remark: line?.remark ?? seed.remark ?? "",
    ownerId: line?.ownerId ?? seed.ownerId ?? defaultOwner,
  }));
  const update = <K extends keyof CostItemInput>(key: K, value: CostItemInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.categoryCode.length === 2 && form.itemCode.trim() && form.description.trim() && Number.isInteger(form.quantity) && validCostItemNumbers(form.quantity, form.unitCost) && form.unit.trim() && form.priceSource && form.ownerId > 0;
  return <Modal title={line ? `Edit ${line.itemCode}` : "Add cost item"} subtitle={line ? "Save checks both estimate and line row versions" : "New line is written to the current revision and audit trail"} size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : line ? "Save changes" : "Create item"}</button></>}>
    <CostItemFields form={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} onLookupPick={(patch) => setForm((current) => ({ ...current, ...patch, priceDate: patch.priceDate ?? current.priceDate }))} suppliers={bootstrap.suppliers} allowedCategories={allowedCategories}
      moduleField={<Field label="Main module (optional)" hint={estimateUxCopy(currentLocale(), "เลือกโมดูลปลายทาง หรือรายการทั่วไปหากไม่อยู่ในโมดูล", "Choose the destination module, or General items for an ungrouped line", "追加先モジュールまたは一般明細を選択")}>
        {line ? <input maxLength={200} value={form.module} onChange={event => update("module", event.target.value)} /> : <select value={form.module} onChange={event => update("module", event.target.value)}>
          <option value="">{estimateUxCopy(currentLocale(), "รายการทั่วไป (ไม่อยู่ในโมดูล)", "General items (no module)", "一般明細（モジュールなし）")}</option>
          {[...new Set([form.module, ...workspace.costItems.filter(item => item.categoryCode === form.categoryCode).map(item => item.module)].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}
        </select>}
      </Field>}
      ownerField={<Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign a cost line" : "Line owner is protected by section permission"}><select disabled={!workspace.capabilities.canEditAllSections && Boolean(line)} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field>}
      referenceNumberField={<Field label="Reference number"><input maxLength={200} value={form.referenceNumber ?? ""} onChange={(event) => update("referenceNumber", event.target.value)} /></Field>}
      referenceProjectField={<Field label="Reference project"><input maxLength={200} value={form.referenceProject ?? ""} onChange={(event) => update("referenceProject", event.target.value)} /></Field>}
      statusField={line ? <Field label="Line status"><input readOnly value={line.status} /></Field> : null}
    />
  </Modal>;
}

function WorkPackageEditor({ busy, onClose, onContinue }: { busy: boolean; onClose: () => void; onContinue: (seed: ManhourSeed) => void }) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const [name, setName] = useState("");
  const [costType, setCostType] = useState<EstimateManhourInput["costType"]>("Engineering");
  return <Modal title={uiText("New Work Package")} subtitle="ตั้งชื่อ Package แล้วเพิ่ม Activity แรกเพื่อบันทึกลง revision ปัจจุบัน" size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={() => onContinue({ package: name.trim(), costType, provider: "Internal" })}><Icon name="arrowRight" /><LocalizedText text={"Continue to activity"} /></button></>}>
    <div className="form-grid two"><Field label="Work package name *"><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder={localizeCopy("เช่น Design & Engineering หรือ Site Installation")} /></Field><Field label="Cost type *"><select value={costType} onChange={(event) => setCostType(event.target.value as EstimateManhourInput["costType"])}><option value="Engineering"><LocalizedText text={"Engineering cost"} /></option><option value="Installation"><LocalizedText text={"Installation & Service cost"} /></option></select></Field></div>
    <div className="info-strip" style={{ marginTop: 12 }}><Icon name="layers" /><span><LocalizedText text={"Work Package จะเกิดขึ้นจริงเมื่อ Activity แรกถูกบันทึก เพื่อไม่สร้าง Package ว่างในฐานข้อมูล"} /></span></div>
  </Modal>;
}

function ManhourEditor({ bootstrap, workspace, line, seed = {}, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateManhourLine | null; seed?: ManhourSeed; busy: boolean; onClose: () => void; onSave: (input: EstimateManhourInput, lineId?: number) => Promise<void> }) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const allOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const owners = workspace.capabilities.canEditAllSections ? allOwners : allOwners.filter((owner) => owner.id === (line?.ownerId ?? bootstrap.user.id));
  const defaultOwner = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const canReadRateMaster = bootstrap.permissions.includes("master.read");
  const importedExcelRate = line?.provider === "Internal" && line.level === "Imported Excel rate";
  const [rateOptions, setRateOptions] = useState<EngineeringRateOption[]>([]);
  const [rateLoading, setRateLoading] = useState(canReadRateMaster && !importedExcelRate);
  const [rateLoadError, setRateLoadError] = useState("");
  const supplierRateDraft = useRef(line?.provider === "Supplier" ? numberOf(line.dailyRate) : 0);
  const [form, setForm] = useState<EstimateManhourInput>(() => ({
    estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion,
    package: line?.package ?? seed.package ?? "Design & Engineering", activity: line?.activity ?? "System Design", department: line?.department ?? bootstrap.user.department,
    level: line?.level ?? bootstrap.team.find((member) => member.id === bootstrap.user.id)?.level ?? "Middle Engineer", costType: line?.costType ?? seed.costType ?? "Engineering", provider: line?.provider ?? seed.provider ?? "Internal",
    supplierId: line?.supplierId ?? undefined, quotationNumber: line?.quotationNumber ?? "", priceDate: line?.priceDate ? dateValue(line.priceDate) : undefined, engineers: numberOf(line?.engineers) || 1, manDays: numberOf(line?.manDays) || 1,
    hoursPerDay: numberOf(line?.hoursPerDay) || 8, dailyRate: numberOf(line?.dailyRate), ownerId: line?.ownerId ?? defaultOwner, remark: line?.remark ?? "",
  }));
  useEffect(() => {
    if (!canReadRateMaster || importedExcelRate) return;
    let cancelled = false;
    const loadRates = async () => {
      setRateLoading(true);
      setRateLoadError("");
      try {
        const firstPage = await apiRequest<PagedResult<EngineeringRateOption>>("/api/v1/estimates/engineering-rate-options?page=1&pageSize=100");
        const pageCount = Math.ceil(firstPage.total / firstPage.pageSize);
        const remainingPages = pageCount > 1
          ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => apiRequest<PagedResult<EngineeringRateOption>>(`/api/v1/estimates/engineering-rate-options?page=${index + 2}&pageSize=100`)))
          : [];
        if (cancelled) return;
        const today = businessDate();
        const available = [firstPage, ...remainingPages].flatMap((page) => page.items).filter((rate) => rate.isActive && rate.effectiveFrom <= today && (!rate.effectiveTo || rate.effectiveTo >= today));
        setRateOptions(available);
        setForm((current) => {
          if (current.provider !== "Internal" || current.level === "Imported Excel rate") return current;
          const currentRate = available.find((rate) => rate.department === current.department && rate.level === current.level);
          return currentRate ? {
            ...current,
            dailyRate: current.costType === "Installation" ? currentRate.installationDaily : currentRate.engineeringDaily,
          } : current;
        });
      } catch (requestError) {
        if (!cancelled) setRateLoadError(toError(requestError));
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    };
    void loadRates();
    return () => { cancelled = true; };
  }, [canReadRateMaster, importedExcelRate, line]);
  const update = <K extends keyof EstimateManhourInput>(key: K, value: EstimateManhourInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const availableRateOptions = rateOptions.filter((rate) => (form.costType === "Installation" ? rate.installationDaily : rate.engineeringDaily) > 0);
  const selectedRate = availableRateOptions.find((rate) => rate.department === form.department && rate.level === form.level);
  const rateSelectionRequired = form.provider === "Internal" && canReadRateMaster && !importedExcelRate && !rateLoadError;
  const internalRateReady = !rateSelectionRequired || (!rateLoading && Boolean(selectedRate));
  const supplierValid = form.provider === "Internal" || Boolean(form.supplierId && form.quotationNumber?.trim() && form.priceDate);
  const lineCostWithinRange = form.provider === "Internal" || form.engineers * form.manDays * form.dailyRate <= MAX_LEDGER_LINE_TOTAL;
  const valid = Boolean(form.package.trim() && form.activity.trim() && form.department.trim() && form.level.trim() && form.engineers > 0 && form.manDays > 0 && form.hoursPerDay > 0 && form.dailyRate >= 0 && form.ownerId && supplierValid && lineCostWithinRange && internalRateReady);
  const chooseRate = (rateId: string) => {
    const rate = availableRateOptions.find((option) => option.id === Number(rateId));
    if (!rate) return;
    setForm((current) => ({ ...current, department: rate.department, level: rate.level, dailyRate: current.costType === "Installation" ? rate.installationDaily : rate.engineeringDaily }));
  };
  const changeCostType = (costType: EstimateManhourInput["costType"]) => setForm((current) => ({
    ...current,
    costType,
    dailyRate: current.provider === "Internal" && current.level !== "Imported Excel rate"
      ? (() => { const rate = rateOptions.find((option) => option.department === current.department && option.level === current.level); const amount = rate ? (costType === "Installation" ? rate.installationDaily : rate.engineeringDaily) : 0; return amount > 0 ? amount : 0; })()
      : current.dailyRate,
  }));
  return <Modal title={line ? `Edit ${line.activity}` : "Add engineering man-hour"} subtitle={copy("เลือกอัตราที่ใช้งานได้ก่อนบันทึก ระบบจะตรวจอัตราอีกครั้งที่ API", "Choose an available rate before saving. The API verifies it again.", "保存前に利用可能な単価を選択してください。APIでも再確認します。")} size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : line ? "Save changes" : "Create man-hour"}</button></>}>
    {form.provider === "Internal" && canReadRateMaster && !importedExcelRate && !rateLoading && !rateLoadError && !availableRateOptions.length ? <div className="info-strip red" role="alert" style={{ marginBottom: 12 }}><Icon name="alertTriangle" /><span><strong>{copy("ยังไม่มีอัตราค่าแรงที่ใช้งานได้", "No available engineering rate", "利用可能な技術単価がありません")}</strong><br />{copy("กรุณาให้ผู้ดูแลเพิ่ม Engineering Rate ที่มีผลวันนี้และมากกว่า 0 ก่อนสร้างรายการค่าแรง", "Ask an administrator to add an Engineering Rate effective today and greater than zero before creating this line.", "この工数を作成する前に、本日有効で0より大きい技術単価を管理者に登録してもらってください。")}</span></div> : null}
    {form.provider === "Internal" && !canReadRateMaster && !importedExcelRate ? <div className="info-strip amber" role="note" style={{ marginBottom: 12 }}><Icon name="alertTriangle" /><span>{copy("บัญชีนี้ดู Rate Master ไม่ได้ กรุณาเลือก Department และ Level ให้ตรงกับข้อมูลกลาง โดย API จะตรวจสอบก่อนบันทึก", "This account cannot view the Rate Master. Match Department and Level to the master data; the API will verify them before saving.", "このアカウントは単価マスターを閲覧できません。部門とレベルをマスターに合わせてください。保存前にAPIが確認します。")}</span></div> : null}
    {form.provider === "Internal" && rateLoadError ? <div className="info-strip amber" role="alert" style={{ marginBottom: 12 }}><Icon name="alertTriangle" /><span>{copy("โหลด Rate Master ไม่สำเร็จ", "Could not load the Rate Master", "単価マスターを読み込めませんでした")}: {rateLoadError} {copy("กรุณาตรวจ Department และ Level ก่อนลองบันทึก", "Check Department and Level before trying to save.", "保存する前に部門とレベルを確認してください。")}</span></div> : null}
    <div className="form-grid four">
      <Field label="Work package *" span={2}><input required maxLength={200} value={form.package} onChange={(event) => update("package", event.target.value)} /></Field><Field label="Activity *" span={2}><input required maxLength={300} value={form.activity} onChange={(event) => update("activity", event.target.value)} /></Field>
      <Field label="Provider *"><select value={form.provider} onChange={(event) => { const provider = event.target.value as EstimateManhourInput["provider"]; setForm((current) => ({ ...current, provider, dailyRate: provider === "Supplier" ? supplierRateDraft.current : selectedRate ? (current.costType === "Installation" ? selectedRate.installationDaily : selectedRate.engineeringDaily) : 0, ...(provider === "Internal" ? { supplierId: undefined, quotationNumber: "", priceDate: undefined } : {}) })); }}><option value="Internal"><LocalizedText text={"Own engineer"} /></option><option value="Supplier"><LocalizedText text={"Supplier man-hour"} /></option></select></Field><Field label="Cost type *"><select value={form.costType} onChange={(event) => changeCostType(event.target.value as EstimateManhourInput["costType"])}><option value={"Engineering"}><LocalizedText text={"Engineering"} /></option><option value={"Installation"}><LocalizedText text={"Installation"} /></option></select></Field>
      {form.provider === "Internal" && canReadRateMaster && !importedExcelRate && !rateLoadError ? <Field label={copy("อัตราที่ใช้งานได้ *", "Available rate *", "利用可能な単価 *")} span={2} hint={rateLoading ? copy("กำลังโหลด Rate Master…", "Loading Rate Master…", "単価マスターを読み込み中…") : selectedRate ? `${form.department} · ${form.level}` : copy("เลือกจากอัตราที่มีผลวันนี้เท่านั้น", "Only rates effective today are shown.", "本日有効な単価のみ表示します。")}><select disabled={rateLoading || !availableRateOptions.length} value={selectedRate?.id ?? ""} onChange={(event) => chooseRate(event.target.value)}><option value="">{rateLoading ? copy("กำลังโหลดอัตรา…", "Loading rates…", "単価を読み込み中…") : copy("เลือกอัตราที่ใช้งานได้", "Select an available rate", "利用可能な単価を選択")}</option>{availableRateOptions.map((rate) => <option key={rate.id} value={rate.id}>{rate.department} — {rate.level} · {formatMoney(form.costType === "Installation" ? rate.installationDaily : rate.engineeringDaily)}/{copy("วัน", "day", "日")}</option>)}</select></Field> : <><Field label="Department *"><input required maxLength={100} value={form.department} onChange={(event) => update("department", event.target.value)} /></Field><Field label="Engineer level *"><input required maxLength={100} value={form.level} onChange={(event) => update("level", event.target.value)} /></Field></>}
      <Field label="Supplier" hint={form.provider === "Supplier" ? "Required" : "Not used for internal rate"}><select disabled={form.provider === "Internal"} value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value=""><LocalizedText text={"Select supplier"} /></option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field><Field label="Quotation number" hint={form.provider === "Supplier" ? "Required" : undefined}><input disabled={form.provider === "Internal"} maxLength={100} value={form.quotationNumber ?? ""} onChange={(event) => update("quotationNumber", event.target.value)} /></Field><Field label="Quotation date" hint={form.provider === "Supplier" ? "Required" : undefined}><input disabled={form.provider === "Internal"} type="date" value={form.priceDate ?? ""} onChange={(event) => update("priceDate", event.target.value || undefined)} /></Field><Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign" : "Assigned line must remain yours"}><select disabled={!workspace.capabilities.canEditAllSections} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field>
      <Field label="Engineer qty *"><input type="number" min="0.01" max="10000" step="0.01" value={form.engineers} onChange={(event) => update("engineers", Number(event.target.value))} /></Field><Field label="Man-days *"><input type="number" min="0.01" max="100000" step="0.01" value={form.manDays} onChange={(event) => update("manDays", Number(event.target.value))} /></Field><Field label="Hours / day *"><input type="number" min="0.01" max="24" step="0.01" value={form.hoursPerDay} onChange={(event) => update("hoursPerDay", Number(event.target.value))} /></Field><Field label={form.provider === "Internal" ? (form.level === "Imported Excel rate" ? "Daily rate (Excel)" : "Daily rate (Rate Master)") : "Daily rate (THB) *"} hint={form.provider === "Internal" ? (form.level === "Imported Excel rate" ? "Original Excel rate is retained when adjusting quantity" : "Server resolves the active rate after save") : "Supplier quotation rate"}><input type="number" readOnly={form.provider === "Internal"} className={form.provider === "Internal" ? "calculated" : undefined} min="0" max="1000000000" step="0.0001" value={form.dailyRate} onChange={(event) => { const dailyRate = Number(event.target.value); supplierRateDraft.current = dailyRate; update("dailyRate", dailyRate); }} /></Field>
      <Field label="Man-hours"><input className="calculated" readOnly value={formatNumber(form.engineers * form.manDays * form.hoursPerDay)} /></Field><Field label="Line cost" hint={!lineCostWithinRange ? "Exceeds the maximum amount supported by the estimate ledger" : undefined}><input className="calculated" readOnly value={formatMoney(form.engineers * form.manDays * form.dailyRate)} /></Field><Field label="Remark" span={2}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field>
    </div>
  </Modal>;
}

function ExpenseEditor({ bootstrap, workspace, line, seed = {}, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateExpenseLine | null; seed?: ExpenseSeed; busy: boolean; onClose: () => void; onSave: (input: EstimateExpenseInput, lineId?: number) => Promise<void> }) {
  const allOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const owners = workspace.capabilities.canEditAllSections ? allOwners : allOwners.filter((owner) => owner.id === (line?.ownerId ?? bootstrap.user.id));
  const defaultOwner = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const allowedExpenseTypes = EXPENSE_TYPES.filter((expenseType) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(EXPENSE_SECTION_BY_TYPE[expenseType]) || line?.expenseType === expenseType);
  const [form, setForm] = useState<EstimateExpenseInput>(() => ({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion, package: line?.package ?? seed.package ?? "Site Installation", expenseType: line?.expenseType ?? allowedExpenseTypes[0] ?? "Other", description: line?.description ?? "", costType: line?.costType ?? seed.costType ?? "Installation", supplierId: line?.supplierId ?? undefined, referenceNumber: line?.referenceNumber ?? "", quantity: numberOf(line?.quantity) || 1, unit: line?.unit ?? "Trip", unitCost: numberOf(line?.unitCost), ownerId: line?.ownerId ?? defaultOwner, remark: line?.remark ?? "" }));
  const update = <K extends keyof EstimateExpenseInput>(key: K, value: EstimateExpenseInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = Boolean(form.package.trim() && form.description.trim() && form.expenseType && form.quantity > 0 && form.unit && form.unitCost >= 0 && form.quantity * form.unitCost <= MAX_LEDGER_LINE_TOTAL && form.ownerId);
  return <Modal title={line ? `Edit ${line.description}` : "Add project expense"} subtitle="Expense is reported under transportation, accommodation or other cost" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : line ? "Save changes" : "Create expense"}</button></>}>
    <div className="form-grid four"><Field label="Work package *" span={2}><input required maxLength={200} value={form.package} onChange={(event) => update("package", event.target.value)} /></Field><Field label="Expense type *" hint={workspace.capabilities.canEditAllSections ? "Mapped to canonical section 08, 09 or 10" : "Only expense types assigned to your sections"}><select value={form.expenseType} onChange={(event) => update("expenseType", event.target.value)}>{allowedExpenseTypes.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Cost type *"><select value={form.costType} onChange={(event) => update("costType", event.target.value as EstimateExpenseInput["costType"])}><option value={"Engineering"}><LocalizedText text={"Engineering"} /></option><option value={"Installation"}><LocalizedText text={"Installation"} /></option></select></Field><Field label="Description *" span={2}><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Supplier"><select value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value=""><LocalizedText text={"No supplier"} /></option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field><Field label="Reference number"><input maxLength={200} value={form.referenceNumber ?? ""} onChange={(event) => update("referenceNumber", event.target.value)} /></Field><Field label="Quantity *"><input type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} /></Field><Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label="Unit cost (THB) *"><input type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => update("unitCost", Number(event.target.value))} /></Field><Field label="Line total"><input readOnly className="calculated" value={formatMoney(form.quantity * form.unitCost)} /></Field><Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign" : "Assigned line must remain yours"}><select disabled={!workspace.capabilities.canEditAllSections} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field><Field label="Remark" span={3}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field></div>
  </Modal>;
}

function OtherCostEditor({ workspace, line, busy, onClose, onSave }: { workspace: EstimateCostWorkspace; line: EstimateOtherCostLine | null; busy: boolean; onClose: () => void; onSave: (input: EstimateOtherCostInput, lineId?: number) => Promise<void> }) {
  const [form, setForm] = useState<EstimateOtherCostInput>(() => ({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion, category: line?.category ?? "Other Cost", description: line?.description ?? "", quantity: numberOf(line?.quantity) || 1, unit: line?.unit ?? "Lot", unitCost: numberOf(line?.unitCost), remark: line?.remark ?? "" }));
  const update = <K extends keyof EstimateOtherCostInput>(key: K, value: EstimateOtherCostInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = Boolean(form.category && form.description.trim() && form.quantity > 0 && form.unit && form.unitCost >= 0 && form.quantity * form.unitCost <= MAX_LEDGER_LINE_TOTAL);
  return <Modal title={line ? `Edit ${line.description}` : "Add other project cost"} subtitle="Outsource, transportation, accommodation and other project cost" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : line ? "Save changes" : "Create line"}</button></>}>
    <div className="form-grid two"><Field label="Category *"><select value={form.category} onChange={(event) => update("category", event.target.value as EstimateOtherCostInput["category"])}>{OTHER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Description *"><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Quantity *"><input type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} /></Field><Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label="Unit cost (THB) *"><input type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => update("unitCost", Number(event.target.value))} /></Field><Field label="Line total"><input readOnly className="calculated" value={formatMoney(form.quantity * form.unitCost)} /></Field><Field label="Remark" span={2}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field></div>
  </Modal>;
}

function CreateAssignmentModal({ bootstrap, workspace, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; busy: boolean; onClose: () => void; onSave: (input: EstimateAssignmentCreateInput) => Promise<void> }) {
  const localizeCopy = useStaticCopy();
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const availableSections = ESTIMATE_ASSIGNMENT_SECTIONS.filter(([code]) => !workspace.assignments.some((assignment) => assignment.section.trim().slice(0, 2) === code));
  const defaultOwnerId = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners[0]?.id ?? 0;
  const [form, setForm] = useState<EstimateAssignmentCreateInput>({
    estimateRowVersion: workspace.header.rowVersion,
    section: availableSections[0]?.[0] ?? "",
    ownerId: defaultOwnerId,
    supportId: undefined,
    dueDate: dateValue(workspace.header.dueDate),
    comment: "",
  });
  const update = <K extends keyof EstimateAssignmentCreateInput>(key: K, value: EstimateAssignmentCreateInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = Boolean(form.section && form.ownerId && form.dueDate && form.dueDate <= dateValue(workspace.header.dueDate) && form.supportId !== form.ownerId);
  return <Modal title="Assign estimate section" subtitle={`${workspace.header.number} · ผู้รับผิดชอบจะได้รับอีเมลหลังบันทึกสำเร็จ`} size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form); }}><Icon name="send" />{busy ? "Assigning…" : "Assign and notify"}</button></>}>
    <div className="info-strip"><Icon name="bell" /><span><LocalizedText text={"ระบบจะส่งอีเมลให้ Responsible Engineer และ Support Engineer ที่เลือก โดยการบันทึก assignment จะไม่สูญหายหากระบบอีเมลขัดข้อง"} /></span></div>
    <div className="form-grid two" style={{ marginTop: 14 }}>
      <Field label="Section *"><select value={form.section} onChange={(event) => update("section", event.target.value)}>{availableSections.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select></Field>
      <Field label="Due date *" hint={`Must not exceed ${formatDate(workspace.header.dueDate)}`}><input type="date" max={dateValue(workspace.header.dueDate)} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></Field>
      <Field label="Responsible engineer *"><select value={form.ownerId} onChange={(event) => { const ownerId = Number(event.target.value); setForm((current) => ({ ...current, ownerId, supportId: current.supportId === ownerId ? undefined : current.supportId })); }}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field>
      <Field label="Support engineer"><select value={form.supportId ?? ""} onChange={(event) => update("supportId", event.target.value ? Number(event.target.value) : undefined)}><option value=""><LocalizedText text={"None"} /></option>{owners.filter((owner) => owner.id !== form.ownerId).map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field>
      <Field label="Assignment note" span={2}><textarea maxLength={20000} rows={3} value={form.comment ?? ""} onChange={(event) => update("comment", event.target.value)} placeholder={localizeCopy("Scope, deliverable or context for the assignee…")} /></Field>
    </div>
  </Modal>;
}

function AssignmentEditor({ bootstrap, workspace, assignment, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; assignment: EstimateAssignment; busy: boolean; onClose: () => void; onSave: (input: EstimateAssignmentInput) => Promise<void> }) {
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const canReassign = workspace.capabilities.canManageAssignments;
  const [form, setForm] = useState<EstimateAssignmentInput>({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: assignment.rowVersion, ownerId: assignment.ownerId, supportId: assignment.supportId ?? undefined, dueDate: dateValue(assignment.dueDate), status: assignment.status, progress: numberOf(assignment.progress), comment: assignment.comment ?? "" });
  const update = <K extends keyof EstimateAssignmentInput>(key: K, value: EstimateAssignmentInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const statusMatchesProgress = form.status === "Not Started" ? form.progress === 0 : ["Completed", "Reviewed"].includes(form.status) ? form.progress === 100 : true;
  const valid = Boolean(form.ownerId && form.dueDate && form.dueDate <= dateValue(workspace.header.dueDate) && form.supportId !== form.ownerId && form.progress >= 0 && form.progress <= 100 && statusMatchesProgress);
  return <Modal title={`Assignment · ${assignment.section}`} subtitle={canReassign ? "Owner, schedule and progress changes are audited; newly added assignees receive email" : "You may update status, progress and comment for your assigned section"} size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save assignment"}</button></>}>
    <div className="form-grid two"><Field label="Responsible engineer *" hint={canReassign ? undefined : "Only the estimate owner or manager can reassign"}><select disabled={!canReassign} value={form.ownerId} onChange={(event) => { const ownerId = Number(event.target.value); setForm((current) => ({ ...current, ownerId, supportId: current.supportId === ownerId ? undefined : current.supportId })); }}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} <LocalizedText text={"·"} /> {owner.department}</option>)}</select></Field><Field label="Support engineer" hint={canReassign ? undefined : "Reassignment is locked for this account"}><select disabled={!canReassign} value={form.supportId ?? ""} onChange={(event) => update("supportId", event.target.value ? Number(event.target.value) : undefined)}><option value=""><LocalizedText text={"None"} /></option>{owners.filter((owner) => owner.id !== form.ownerId).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></Field><Field label="Due date *" hint={`Must not exceed ${formatDate(workspace.header.dueDate)}`}><input disabled={!canReassign} type="date" max={dateValue(workspace.header.dueDate)} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></Field><Field label="Status *"><select value={form.status} onChange={(event) => { const status = event.target.value; setForm((current) => ({ ...current, status, progress: status === "Not Started" ? 0 : ["Completed", "Reviewed"].includes(status) ? 100 : current.progress })); }}>{SECTION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field><Field label="Progress %" hint={!statusMatchesProgress ? "Not Started requires 0%; Completed/Reviewed requires 100%" : undefined}><input type="number" min="0" max="100" step="0.01" value={form.progress} onChange={(event) => update("progress", Number(event.target.value))} /></Field><Field label="Comment"><textarea maxLength={20000} rows={2} value={form.comment ?? ""} onChange={(event) => update("comment", event.target.value)} /></Field></div>
  </Modal>;
}

function WorkflowModal({ action, estimate, busy, onClose, onConfirm }: { action: "submit" | "approve" | "request-revision" | "create-revision"; estimate: string; busy: boolean; onClose: () => void; onConfirm: (comment: string) => Promise<void> }) {
  const [comment, setComment] = useState("");
  const requiresComment = action === "request-revision" || action === "create-revision";
  const title = action === "approve" ? "Approve estimate cost?" : action === "submit" ? "Submit for Engineering Review?" : action === "create-revision" ? "Create a new estimate revision?" : "Request estimate revision";
  const label = action === "approve" ? "Approve and lock" : action === "submit" ? "Submit review" : action === "create-revision" ? "Create revision" : "Return for revision";
  return <Modal title={title} subtitle={`${estimate} · this workflow decision is written to the audit trail`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className={action === "approve" ? "btn success" : action === "request-revision" ? "btn warn" : "btn primary"} type="button" disabled={busy || (requiresComment && !comment.trim())} onClick={() => { void onConfirm(comment.trim()); }}><Icon name={action === "approve" ? "checkCircle" : action === "submit" ? "send" : action === "create-revision" ? "gitBranch" : "refresh"} />{busy ? "Working…" : label}</button></>}>
    <div className={action === "approve" ? "info-strip green" : action === "request-revision" ? "info-strip amber" : "info-strip"}><Icon name={action === "approve" ? "lock" : action === "request-revision" ? "alertTriangle" : action === "create-revision" ? "copy" : "shield"} /><span>{action === "approve" ? "Approved revision becomes read-only." : action === "request-revision" ? "A reason is required so the estimate owner knows what to change." : action === "create-revision" ? "The locked revision remains immutable and its current lines are copied into the next revision." : "Server validation runs again before the status changes."}</span></div>
    <Field label={requiresComment ? "Revision reason *" : "Workflow comment"}><textarea maxLength={20000} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={requiresComment ? "Describe the scope, price or effort that must be revised…" : "Optional note for the audit trail…"} /></Field>
  </Modal>;
}
