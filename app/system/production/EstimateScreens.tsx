"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  createCostItem,
  createEstimate,
  createEstimateExpense,
  createEstimateManhour,
  createEstimateOtherCost,
  estimateWorkflow,
  listEstimates,
  listInquiries,
  loadEstimateCostWorkspace,
  removeCostItem,
  removeEstimateExpense,
  removeEstimateManhour,
  removeEstimateOtherCost,
  updateCostItem,
  updateEstimateAssignment,
  updateEstimateContingency,
  updateEstimateExpense,
  updateEstimateManhour,
  updateEstimateOtherCost,
  type BootstrapData,
  type CostItemInput,
  type CreateEstimateInput,
  type EstimateAssignment,
  type EstimateAssignmentInput,
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
  type InquirySummary,
  type PagedResult,
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
  SummaryTile,
  Tabs,
  Toolbar,
} from "../ui";
import { exportXlsx } from "../../../lib/export-xlsx";

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap: () => Promise<void>;
};

type WorkspaceTab = "summary" | "cost" | "manhour" | "other" | "assignment" | "validation" | "revision" | "compare" | "review";

const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const COST_CATEGORIES = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Engineering"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other Cost"],
] as const;
const PROJECT_TYPES = ["Automation", "IoT", "PLC", "Software", "Electrical", "Mechanical", "Robot", "AMR", "Auto Warehouse", "WMS", "WCS", "Traceability", "Vision", "Data Collection", "Other"];
const PRICE_SOURCES = ["Supplier Quotation", "Price Library", "Previous Project", "Budgetary", "Previous Estimate", "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price"];
const SECTION_STATUSES = ["Not Started", "In Progress", "Waiting Information", "Waiting Supplier", "Completed", "Reviewed"];
const EXPENSE_TYPES = ["Travel", "Accommodation", "Per Diem", "Transportation", "Equipment Rental", "Other"];
const EXPENSE_SECTION_BY_TYPE: Record<string, "08" | "09" | "10"> = { Travel: "08", Transportation: "08", Accommodation: "09", "Per Diem": "09", "Equipment Rental": "10", Other: "10" };
const UNITS = ["Set", "Pcs", "Lot", "Unit", "Meter", "Day", "Month", "Service", "Trip", "Night", "Person", "Km"];
const OTHER_CATEGORIES: EstimateOtherCostInput["category"][] = ["Outsource", "Transportation", "Accommodation", "Other Cost"];
const INQUIRY_PAGE_SIZE = 100;
const INQUIRY_PAGE_BATCH_SIZE = 4;
const MAX_LEDGER_LINE_TOTAL = 999_999_999_999_999;

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const isCriticalValidationIssue = (issue: EstimateCostWorkspace["validationIssues"][number]) => issue.severity.trim().toLowerCase() === "error";
const numberOf = (value: number | string | null | undefined) => Number(value ?? 0);
const formatMoney = (value: number | string | null | undefined) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(numberOf(value));
const formatNumber = (value: number | string | null | undefined, maximumFractionDigits = 2) => numberOf(value).toLocaleString("th-TH", { maximumFractionDigits });
const dateValue = (value: string | null | undefined) => value ? value.slice(0, 10) : "";
const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(parsed);
};
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(parsed);
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
const revisionCode = (revision: number) => `R${String(revision).padStart(2, "0")}`;

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong>ดำเนินการไม่สำเร็จ</strong>{message}</span><button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />ลองใหม่</button></div>;
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

export function ProductionEstimates({ bootstrap, notify, refreshBootstrap }: Props) {
  const [result, setResult] = useState<PagedResult<EstimateSummary>>(EMPTY_PAGE);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [customerId, setCustomerId] = useState("All customers");
  const [projectType, setProjectType] = useState("All project types");
  const [ownerId, setOwnerId] = useState("All owners");
  const [department, setDepartment] = useState("All departments");
  const [revision, setRevision] = useState("All revisions");
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
        ownerId: ownerId === "All owners" ? undefined : Number(ownerId),
        department: department === "All departments" ? undefined : department,
        revision: revision === "All revisions" ? undefined : Number(revision),
      }));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [customerId, department, ownerId, page, pageSize, projectType, revision, search, status]);

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
      title="Estimate Cost"
      subtitle="จัดทำต้นทุน ตรวจสอบ revision และอนุมัติจากข้อมูล SQL Server ชุดเดียวกัน"
      actions={canCreate ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New estimate from inquiry</button> : undefined}
    />
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); resetPage(); }} placeholder="Search estimate, inquiry, project or customer…" />
      <FilterSelect label="Customer" value={customerId} onChange={(value) => { setCustomerId(value); resetPage(); }} options={[{ value: "All customers", label: "All customers" }, ...bootstrap.customers.map((customer) => ({ value: String(customer.id), label: `${customer.code} — ${customer.name}` }))]} />
      <Select label="Project type" value={projectType} onChange={(value) => { setProjectType(value); resetPage(); }} options={["All project types", ...PROJECT_TYPES]} />
      <FilterSelect label="Owner" value={ownerId} onChange={(value) => { setOwnerId(value); resetPage(); }} options={[{ value: "All owners", label: "All owners" }, ...owners.map((owner) => ({ value: String(owner.id), label: owner.name }))]} />
      <Select label="Department" value={department} onChange={(value) => { setDepartment(value); resetPage(); }} options={["All departments", ...departments]} />
      <Select label="Status" value={status} onChange={(value) => { setStatus(value); resetPage(); }} options={["All status", "Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Revision Required", "Approved", "Locked"]} />
      <FilterSelect label="Revision" value={revision} onChange={(value) => { setRevision(value); resetPage(); }} options={[{ value: "All revisions", label: "All revisions" }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index), label: revisionCode(index) }))]} />
      <Select label="Rows" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); resetPage(); }} options={["10", "25", "50", "100"]} />
      <button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} estimates`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data · click a row to open the full workspace"} flush>
      {result.items.length ? <div className="table-wrap"><table>
        <thead><tr><th>Estimate No.</th><th>Inquiry</th><th>Customer</th><th>Project</th><th>Owner</th><th>Rev.</th><th>Created</th><th>Due</th><th className="num">Material</th><th className="num">Engineering</th><th className="num">Outsource</th><th className="num">Other</th><th className="num">Total</th><th>Progress</th><th>Status</th><th>Updated</th><th /></tr></thead>
        <tbody>{result.items.map((item) => {
          const late = item.dueDate < todayIso && !["Approved", "Locked"].includes(item.status);
          const other = numberOf(item.transportationTotal) + numberOf(item.accommodationTotal) + numberOf(item.otherTotal) + numberOf(item.contingencyTotal);
          return <tr key={item.id} className={`clickable ${late ? "row-late" : ["Approved", "Locked"].includes(item.status) ? "row-ok" : item.status === "Waiting Supplier Price" ? "row-wait" : ""}`} onClick={() => setSelectedEstimateId(item.id)}>
            <td><strong className="mono">{item.number}</strong></td><td className="mono">{item.inquiryNumber}</td><td>{item.customerName}</td>
            <td><div className="cell-primary"><strong>{item.projectName}</strong><span>{item.projectType}</span></div></td><td>{item.ownerName}</td><td><span className="pill">{revisionCode(item.revision)}</span></td>
            <td>{formatDate(item.createdDate)}</td><td className={late ? "red-text" : undefined}>{formatDate(item.dueDate)}{late ? <Badge tone="red">Overdue</Badge> : null}</td>
            <td className="num">{formatMoney(item.materialTotal)}</td><td className="num">{formatMoney(item.engineeringTotal)}</td><td className="num">{formatMoney(item.outsourceTotal)}</td><td className="num">{formatMoney(other)}</td><td className="num"><strong>{formatMoney(item.total)}</strong></td>
            <td style={{ minWidth: 110 }}><ProgressCell value={numberOf(item.progress)} /></td><td><Badge>{item.status}</Badge></td><td className="muted">{formatDateTime(item.updatedAt)}</td>
            <td><button className="row-action" type="button" aria-label={`Open ${item.number}`} onClick={(event) => { event.stopPropagation(); setSelectedEstimateId(item.id); }}><Icon name="chevronRight" /></button></td>
          </tr>;
        })}</tbody>
      </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div>
        : loading ? <div className="empty"><span className="spinner" />Loading…</div>
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
  return <Modal title="New estimate from inquiry" subtitle="SQL Server ออกเลข Estimate และสร้าง R00 ภายใน transaction เดียว" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || loading || !form.inquiryId || !form.ownerId || !form.dueDate} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Creating…" : "Create R00"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {loading ? <div className="empty"><span className="spinner" />Loading inquiries…</div> : inquiries.length ? <div className="form-grid two">
      <Field label="Registered inquiry *" span={2}><select value={form.inquiryId} onChange={(event) => { const inquiry = inquiries.find((item) => item.id === Number(event.target.value)); const requestedOwner = owners.find((owner) => owner.id === inquiry?.estimateOwnerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id; setForm((current) => ({ ...current, inquiryId: Number(event.target.value), ownerId: requestedOwner ?? current.ownerId, dueDate: normalizeEstimateDueDate(inquiry?.dueDate, earliestDueDate, latestDueDate) })); }}>{inquiries.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName} · {item.customerName}</option>)}</select></Field>
      <Field label="Estimate owner *"><select value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.department}</option>)}</select></Field>
      <Field label="Due date *" hint="Today through five years"><input type="date" min={earliestDueDate} max={latestDueDate} value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
      <Field label="Contingency %"><input type="number" min="0" max="100" step="0.01" value={form.contingencyRate} onChange={(event) => setForm((current) => ({ ...current, contingencyRate: Number(event.target.value) }))} /></Field>
    </div> : <EmptyState icon="inbox" title="No inquiry available" message="ทุก Inquiry มี Estimate แล้ว หรือบัญชีนี้ไม่มี Inquiry ที่อ่านได้" />}
  </Modal>;
}

function ProductionEstimateWorkspace({ estimateId, bootstrap, notify, refreshBootstrap, onBack, onListChanged }: Props & { estimateId: number; onBack: () => void; onListChanged: () => Promise<void> }) {
  const [workspace, setWorkspace] = useState<EstimateCostWorkspace | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [costEditor, setCostEditor] = useState<EstimateCostItem | "new" | null>(null);
  const [manhourEditor, setManhourEditor] = useState<EstimateManhourLine | "new" | null>(null);
  const [expenseEditor, setExpenseEditor] = useState<EstimateExpenseLine | "new" | null>(null);
  const [otherEditor, setOtherEditor] = useState<EstimateOtherCostLine | "new" | null>(null);
  const [assignmentEditor, setAssignmentEditor] = useState<EstimateAssignment | null>(null);
  const [workflowAction, setWorkflowAction] = useState<"submit" | "approve" | "request-revision" | null>(null);

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
      setManhourEditor(null);
      setExpenseEditor(null);
      setOtherEditor(null);
      setAssignmentEditor(null);
      setWorkflowAction(null);
      await load();
    }
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

  if (!workspace) return <><button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" />Estimate Cost</button>{error ? <LoadError message={error} retry={() => { void load(); }} /> : null}{loading ? <div className="empty"><span className="spinner" />Loading estimate workspace…</div> : null}</>;

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
      ["Material", numberOf(totals.material)], ["Engineering", numberOf(totals.engineering)], ["Outsource", numberOf(totals.outsource)], ["Transportation", numberOf(totals.transportation)], ["Accommodation", numberOf(totals.accommodation)], ["Other", numberOf(totals.other)], [`Contingency ${formatNumber(header.contingencyRate)}%`, numberOf(totals.contingency)], ["TOTAL ESTIMATED COST", numberOf(totals.total)],
    ];
    exportXlsx(rows, `${header.number}_${revisionCode(header.revision)}_EstimateCost.xlsx`);
    notify("Estimate exported from live workspace");
  };

  return <>
    <div className="breadcrumb"><button type="button" onClick={onBack}>Estimate Cost</button><Icon name="chevronRight" /><span>{header.number}</span></div>
    <PageHeader eyebrow={`${header.number} · ${revisionCode(header.revision)}`} title={header.projectName} subtitle={`${header.customerCode} — ${header.customerName} · Inquiry ${header.inquiryNumber}`} meta={<>
      <div><span>Estimate owner</span><strong>{header.ownerName}</strong></div><div><span>Created</span><strong>{formatDate(header.createdDate)}</strong></div><div><span>Due</span><strong className={currentLate ? "red-text" : undefined}>{formatDate(header.dueDate)}</strong></div><div><span>Status</span><strong><Badge tone={["Approved", "Locked"].includes(header.status) ? "green" : header.status === "Revision Required" ? "amber" : "blue"}>{header.status}</Badge></strong></div><div><span>Progress</span><strong style={{ minWidth: 110 }}><ProgressCell value={numberOf(header.progress)} /></strong></div>
    </>} />
    <div className="workspace-bar">
      <button className="btn default" type="button" disabled={loading || busy} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>
      <button className="btn default" type="button" onClick={exportWorkspace}><Icon name="download" />Export Excel</button>
      <button className="btn default" type="button" onClick={() => setTab("validation")}><Icon name="shield" />Validation{validationCount ? <span className={`badge ${criticalCount ? "red" : "amber"}`}>{validationCount}</span> : <span className="badge green">OK</span>}</button>
      <span className="spacer" />
      {capabilities.canSubmit ? <button className="btn primary" type="button" disabled={busy || criticalCount > 0} onClick={() => setWorkflowAction("submit")}><Icon name="send" />Submit Review</button> : null}
      {capabilities.canRequestRevision ? <button className="btn warn" type="button" disabled={busy} onClick={() => setWorkflowAction("request-revision")}><Icon name="refresh" />Request Revision</button> : null}
      {capabilities.canApprove ? <button className="btn success" type="button" disabled={busy || criticalCount > 0} onClick={() => setWorkflowAction("approve")}><Icon name="checkCircle" />Approve</button> : null}
    </div>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {criticalCount ? <div className="info-strip red"><Icon name="alertTriangle" /><span><strong>{criticalCount} critical validation issue(s)</strong> must be resolved before submission or approval.</span><span className="spacer" /><button className="link-btn" type="button" onClick={() => setTab("validation")}>Open validation<Icon name="arrowRight" /></button></div> : null}
    {warningCount ? <div className="info-strip amber"><Icon name="alertTriangle" /><span><strong>{warningCount} advisory warning(s)</strong> do not block workflow, but should be reviewed.</span><span className="spacer" /><button className="link-btn" type="button" onClick={() => setTab("validation")}>Review warnings<Icon name="arrowRight" /></button></div> : null}
    {["Approved", "Locked"].includes(header.status) ? <div className="info-strip green"><Icon name="lock" /><span>Revision นี้ถูกล็อกแล้ว ข้อมูลต้นทุนอ่านได้อย่างเดียว การแก้ไขต้องผ่าน revision workflow</span></div> : null}
    <section className="summary-strip">
      <SummaryTile label="Material Cost" value={formatMoney(totals.material)} note="01–05" />
      <SummaryTile label="Engineering Cost" value={formatMoney(totals.engineering)} note={`${formatNumber(workspace.manhourLines.reduce((sum, line) => sum + numberOf(line.manDays) * numberOf(line.engineers), 0))} MD`} />
      <SummaryTile label="Outsource" value={formatMoney(totals.outsource)} note="Supplier and other outsource" />
      <SummaryTile label="Transportation" value={formatMoney(totals.transportation)} note="Material and project expense" />
      <SummaryTile label="Accommodation" value={formatMoney(totals.accommodation)} note="Hotel and per diem" />
      <SummaryTile label="Other Cost" value={formatMoney(totals.other)} note="06 and 10" />
      <SummaryTile label={`Contingency ${formatNumber(header.contingencyRate)}%`} value={formatMoney(totals.contingency)} note="Calculated by SQL Server" />
      <SummaryTile label="Total Estimated Cost" value={formatMoney(totals.total)} note="Internal cost · no margin" strong />
    </section>
    <Tabs active={tab} onChange={setTab} tabs={[
      { id: "summary", label: "Summary" }, { id: "cost", label: "Cost Items", count: workspace.costItems.length }, { id: "manhour", label: "Engineering Man-hour", count: workspace.manhourLines.length }, { id: "other", label: "Other Project Cost", count: workspace.expenseLines.length + workspace.otherCostLines.length }, { id: "assignment", label: "Assignment", count: workspace.assignments.length }, { id: "validation", label: "Validation", count: validationCount }, { id: "revision", label: "Revision History", count: workspace.revisionHistory.length }, { id: "compare", label: "Compare Revision" }, { id: "review", label: "Engineering Review" },
    ]} />

    {tab === "summary" ? <EstimateSummaryTab workspace={workspace} /> : null}
    {tab === "cost" ? <EstimateCostItemsTab workspace={workspace} busy={busy} onAdd={() => setCostEditor("new")} onEdit={setCostEditor} onRemove={(line) => { void removeLine("cost", line.id, line.rowVersion); }} /> : null}
    {tab === "manhour" ? <EstimateManhourTab workspace={workspace} busy={busy} onAdd={() => setManhourEditor("new")} onEdit={setManhourEditor} onRemove={(line) => { void removeLine("manhour", line.id, line.rowVersion); }} /> : null}
    {tab === "other" ? <EstimateOtherCostTab key={header.rowVersion} workspace={workspace} busy={busy} onAddExpense={() => setExpenseEditor("new")} onEditExpense={setExpenseEditor} onRemoveExpense={(line) => { void removeLine("expense", line.id, line.rowVersion); }} onAddOther={() => setOtherEditor("new")} onEditOther={setOtherEditor} onRemoveOther={(line) => { void removeLine("other", line.id, line.rowVersion); }} onUpdateContingency={async (rate) => {
      setBusy(true); setError("");
      try { await updateEstimateContingency(estimateId, rate, header.rowVersion); await afterMutation("Contingency updated"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {tab === "assignment" ? <EstimateAssignmentTab workspace={workspace} onEdit={setAssignmentEditor} /> : null}
    {tab === "validation" ? <EstimateValidationTab workspace={workspace} onFix={(entityType) => setTab(entityType === "ManhourLine" ? "manhour" : entityType === "ExpenseLine" || entityType === "OtherCostLine" ? "other" : "cost")} /> : null}
    {tab === "revision" ? <EstimateRevisionTab revisions={workspace.revisionHistory} currentRevision={header.revision} currentTotal={numberOf(totals.total)} /> : null}
    {tab === "compare" ? <EstimateCompareTab revisions={workspace.revisionHistory} currentRevision={header.revision} currentTotal={numberOf(totals.total)} /> : null}
    {tab === "review" ? <EstimateReviewTab workspace={workspace} onWorkflow={setWorkflowAction} /> : null}

    {costEditor ? <CostItemEditor bootstrap={bootstrap} workspace={workspace} line={costEditor === "new" ? null : costEditor} busy={busy} onClose={() => setCostEditor(null)} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateCostItem(estimateId, lineId, input); else await createCostItem(estimateId, input); setCostEditor(null); await afterMutation(lineId ? "Cost item updated" : "Cost item created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {manhourEditor ? <ManhourEditor bootstrap={bootstrap} workspace={workspace} line={manhourEditor === "new" ? null : manhourEditor} busy={busy} onClose={() => setManhourEditor(null)} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateManhour(estimateId, lineId, input); else await createEstimateManhour(estimateId, input); setManhourEditor(null); await afterMutation(lineId ? "Man-hour updated" : "Man-hour created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {expenseEditor ? <ExpenseEditor bootstrap={bootstrap} workspace={workspace} line={expenseEditor === "new" ? null : expenseEditor} busy={busy} onClose={() => setExpenseEditor(null)} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateExpense(estimateId, lineId, input); else await createEstimateExpense(estimateId, input); setExpenseEditor(null); await afterMutation(lineId ? "Expense updated" : "Expense created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {otherEditor ? <OtherCostEditor workspace={workspace} line={otherEditor === "new" ? null : otherEditor} busy={busy} onClose={() => setOtherEditor(null)} onSave={async (input, lineId) => {
      setBusy(true); setError("");
      try { if (lineId) await updateEstimateOtherCost(estimateId, lineId, input); else await createEstimateOtherCost(estimateId, input); setOtherEditor(null); await afterMutation(lineId ? "Other cost updated" : "Other cost created"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {assignmentEditor ? <AssignmentEditor bootstrap={bootstrap} workspace={workspace} assignment={assignmentEditor} busy={busy} onClose={() => setAssignmentEditor(null)} onSave={async (input) => {
      setBusy(true); setError("");
      try { await updateEstimateAssignment(estimateId, assignmentEditor.id, input); setAssignmentEditor(null); await afterMutation("Assignment updated"); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
    {workflowAction ? <WorkflowModal action={workflowAction} estimate={header.number} busy={busy} onClose={() => setWorkflowAction(null)} onConfirm={async (comment) => {
      setBusy(true); setError("");
      try { await estimateWorkflow(estimateId, workflowAction, header.rowVersion, comment); const label = workflowAction === "approve" ? "approved and locked" : workflowAction === "submit" ? "submitted for engineering review" : "returned for revision"; setWorkflowAction(null); await afterMutation(`${header.number} ${label}`); }
      catch (requestError) { await mutationError(requestError); }
      finally { setBusy(false); }
    }} /> : null}
  </>;
}

function EstimateSummaryTab({ workspace }: { workspace: EstimateCostWorkspace }) {
  const { header, costItems, manhourLines, expenseLines, otherCostLines } = workspace;
  const criticalCount = workspace.validationIssues.filter(isCriticalValidationIssue).length;
  const warningCount = workspace.validationIssues.length - criticalCount;
  const validationTone = criticalCount ? "error" : warningCount ? "warning" : "pass";
  const validationIcon = criticalCount ? "alertCircle" : warningCount ? "alertTriangle" : "checkCircle";
  const materialByCategory = COST_CATEGORIES.map(([code, name]) => ({ code, name, lines: costItems.filter((line) => line.categoryCode === code) })).filter((entry) => entry.lines.length);
  const effortByDepartment = [...new Set(manhourLines.map((line) => line.department))].map((department) => {
    const lines = manhourLines.filter((line) => line.department === department);
    return { department, manDays: lines.reduce((sum, line) => sum + numberOf(line.manDays) * numberOf(line.engineers), 0), total: lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0) };
  }).sort((left, right) => right.total - left.total);
  const packageTotals = [...new Set([...manhourLines.map((line) => line.package), ...expenseLines.map((line) => line.package)])].map((packageName) => ({
    packageName,
    effort: manhourLines.filter((line) => line.package === packageName).reduce((sum, line) => sum + numberOf(line.lineCost), 0),
    expense: expenseLines.filter((line) => line.package === packageName).reduce((sum, line) => sum + numberOf(line.lineTotal), 0),
  }));
  return <>
    <section className="grid-main">
      <Panel title="Estimate cost summary" subtitle="ยอดทั้งหมดคำนวณจาก revision ปัจจุบันใน SQL Server" flush>
        <div className="table-wrap"><table><thead><tr><th>Cost block</th><th>Source</th><th className="num">Amount</th><th className="num">Share</th></tr></thead><tbody>
          {[
            ["Material", "Cost items 01–05", header.totals.material], ["Engineering", "Man-hour lines", header.totals.engineering], ["Outsource", "07 and other project cost", header.totals.outsource], ["Transportation", "08 and travel expense", header.totals.transportation], ["Accommodation", "09, hotel and per diem", header.totals.accommodation], ["Other", "06 Engineering and 10 Other Cost", header.totals.other], ["Contingency", `${formatNumber(header.contingencyRate)}% of subtotal`, header.totals.contingency],
          ].map(([label, source, value]) => <tr key={String(label)}><td><strong>{label}</strong></td><td className="muted">{source}</td><td className="num">{formatMoney(value as number)}</td><td className="num muted">{numberOf(header.totals.total) ? `${Math.round(numberOf(value) / numberOf(header.totals.total) * 100)}%` : "0%"}</td></tr>)}
          <tr className="subtotal-row"><td colSpan={2}>Total estimated cost</td><td className="num"><strong>{formatMoney(header.totals.total)}</strong></td><td className="num">100%</td></tr>
        </tbody></table></div>
      </Panel>
      <div className="stack">
        <Panel title="Workspace completeness"><ul className="check-list">
          <li className={`check-item ${costItems.length ? "pass" : "warning"}`}><Icon name={costItems.length ? "checkCircle" : "alertTriangle"} /><div><strong>{costItems.length} cost item(s)</strong><p>Material and purchased service lines</p></div></li>
          <li className={`check-item ${manhourLines.length ? "pass" : "warning"}`}><Icon name={manhourLines.length ? "checkCircle" : "alertTriangle"} /><div><strong>{manhourLines.length} man-hour line(s)</strong><p>{formatNumber(manhourLines.reduce((sum, line) => sum + numberOf(line.manDays) * numberOf(line.engineers), 0))} man-days</p></div></li>
          <li className="check-item pass"><Icon name="checkCircle" /><div><strong>{expenseLines.length + otherCostLines.length} project cost line(s)</strong><p>Travel, accommodation, outsource and other</p></div></li>
          <li className={`check-item ${validationTone}`}><Icon name={validationIcon} /><div><strong>{workspace.validationIssues.length ? `${criticalCount} error(s) · ${warningCount} warning(s)` : "Server validation passed"}</strong><p>{criticalCount ? "Critical errors block workflow" : warningCount ? "Advisory warnings do not block workflow" : "Checked against current revision"}</p></div></li>
        </ul></Panel>
        <Panel title="Revision information"><dl className="def-list one"><div><dt>Revision</dt><dd><strong>{revisionCode(header.revision)}</strong></dd></div><div><dt>Status</dt><dd><Badge>{header.status}</Badge></dd></div><div><dt>Last updated</dt><dd>{formatDateTime(header.updatedAt)}</dd></div><div><dt>Lock</dt><dd>{header.lockedAt ? `${formatDateTime(header.lockedAt)} · ${header.lockedByName ?? "—"}` : "Not locked"}</dd></div></dl></Panel>
      </div>
    </section>
    <section className="grid-2">
      <Panel title="Cost categories" subtitle="Current revision" flush><div className="table-wrap"><table><thead><tr><th>Category</th><th className="num">Lines</th><th className="num">Total</th></tr></thead><tbody>{materialByCategory.map((entry) => <tr key={entry.code}><td><span className="pill">{entry.code}</span> {entry.name}</td><td className="num">{entry.lines.length}</td><td className="num">{formatMoney(entry.lines.reduce((sum, line) => sum + numberOf(line.lineTotal), 0))}</td></tr>)}</tbody></table></div></Panel>
      <Panel title="Engineering by department" flush>{effortByDepartment.length ? <div className="table-wrap"><table><thead><tr><th>Department</th><th className="num">Man-days</th><th className="num">Cost</th></tr></thead><tbody>{effortByDepartment.map((entry) => <tr key={entry.department}><td><strong>{entry.department}</strong></td><td className="num">{formatNumber(entry.manDays)}</td><td className="num">{formatMoney(entry.total)}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No man-hour yet" message="เพิ่ม engineering man-hour เพื่อคำนวณ effort cost" />}</Panel>
      <Panel title="Work package totals" flush>{packageTotals.length ? <div className="table-wrap"><table><thead><tr><th>Package</th><th className="num">Effort</th><th className="num">Expense</th><th className="num">Total</th></tr></thead><tbody>{packageTotals.map((entry) => <tr key={entry.packageName}><td><strong>{entry.packageName}</strong></td><td className="num">{formatMoney(entry.effort)}</td><td className="num">{formatMoney(entry.expense)}</td><td className="num">{formatMoney(entry.effort + entry.expense)}</td></tr>)}</tbody></table></div> : <EmptyState icon="layers" title="No work package yet" message="เพิ่ม man-hour หรือ project expense พร้อมชื่อ package" />}</Panel>
      <Panel title="Other project cost" flush>{otherCostLines.length ? <div className="table-wrap"><table><thead><tr><th>Category</th><th>Description</th><th className="num">Total</th></tr></thead><tbody>{otherCostLines.map((line) => <tr key={line.id}><td><Badge>{line.category}</Badge></td><td>{line.description}</td><td className="num">{formatMoney(line.lineTotal)}</td></tr>)}</tbody></table></div> : <EmptyState icon="package" title="No other project cost" message="ไม่มี outsource, transportation, accommodation หรือ other line" />}</Panel>
    </section>
  </>;
}

function EstimateCostItemsTab({ workspace, busy, onAdd, onEdit, onRemove }: { workspace: EstimateCostWorkspace; busy: boolean; onAdd: () => void; onEdit: (line: EstimateCostItem) => void; onRemove: (line: EstimateCostItem) => void }) {
  const [category, setCategory] = useState("all");
  const visible = category === "all" ? workspace.costItems : workspace.costItems.filter((line) => line.categoryCode === category);
  const canAdd = workspace.capabilities.canEditCostItems;
  return <Panel title="Estimate Cost Table" subtitle="ข้อมูลทุก field อยู่ใน revision ปัจจุบัน · Total = Qty × Unit Cost จาก SQL Server" actions={canAdd ? <button className="btn primary sm" type="button" onClick={onAdd}><Icon name="plus" />Add cost item</button> : undefined} flush>
    <div className="subtabs" role="tablist" aria-label="Cost category"><button type="button" className={category === "all" ? "subtab active" : "subtab"} onClick={() => setCategory("all")}>All disciplines<em>{workspace.costItems.length}</em></button>{COST_CATEGORIES.map(([code, name]) => { const count = workspace.costItems.filter((line) => line.categoryCode === code).length; return count ? <button key={code} type="button" className={category === code ? "subtab active" : "subtab"} onClick={() => setCategory(code)}><span className="pill">{code}</span>{name}<em>{count}</em></button> : null; })}</div>
    {visible.length ? <div className="table-wrap tall"><table style={{ minWidth: 2200 }}><thead><tr><th>Category</th><th>Module</th><th>Item code</th><th>Description / Specification</th><th>Brand / Model</th><th>Supplier</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit cost</th><th className="num">Total</th><th>Price source</th><th>Reference</th><th>Price date</th><th>Owner</th><th>Status</th><th>Remark</th><th /></tr></thead><tbody>{visible.map((line) => <tr key={line.id}>
      <td><span className="pill">{line.categoryCode}</span><small>{line.category} · {line.subcategory || "—"}</small></td><td>{line.module}</td><td><strong className="mono">{line.itemCode}</strong></td><td><div className="cell-primary"><strong>{line.description}</strong><span>{line.specification || "—"}</span></div></td><td><div className="cell-primary"><strong>{line.brand || "—"}</strong><span>{line.model || "—"}</span></div></td><td>{line.supplierName ?? "—"}</td><td className="num">{formatNumber(line.quantity, 4)}</td><td>{line.unit}</td><td className="num">{formatMoney(line.unitCost)}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td><td>{line.priceSource}</td><td><div className="cell-primary"><strong>{line.referenceNumber || "—"}</strong><span>{line.referenceProject || "—"}</span></div></td><td>{formatDate(line.priceDate)}</td><td>{line.ownerName}</td><td><Badge>{line.status}</Badge></td><td>{line.remark || "—"}</td><td><div className="row-actions">{line.canEdit ? <><button className="icon-btn" type="button" disabled={busy} aria-label={`Edit ${line.itemCode}`} onClick={() => onEdit(line)}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} aria-label={`Remove ${line.itemCode}`} onClick={() => onRemove(line)}><Icon name="trash" /></button></> : <Icon name="lock" />}</div></td>
    </tr>)}</tbody></table></div> : <EmptyState icon="package" title="No cost item" message={canAdd ? "เพิ่มรายการต้นทุนแรกใน revision นี้" : "ไม่มีรายการที่บัญชีนี้อ่านได้"} action={canAdd ? <button className="btn primary" type="button" onClick={onAdd}><Icon name="plus" />Add cost item</button> : undefined} />}
    <div className="sticky-foot"><div className="foot-item"><span>Shown lines</span><strong>{visible.length}</strong></div><div className="foot-item"><span>Shown subtotal</span><strong>{formatMoney(visible.reduce((sum, line) => sum + numberOf(line.lineTotal), 0))}</strong></div><div className="foot-total"><span>Total estimated cost</span><strong>{formatMoney(workspace.header.totals.total)}</strong></div></div>
  </Panel>;
}

function EstimateManhourTab({ workspace, busy, onAdd, onEdit, onRemove }: { workspace: EstimateCostWorkspace; busy: boolean; onAdd: () => void; onEdit: (line: EstimateManhourLine) => void; onRemove: (line: EstimateManhourLine) => void }) {
  const [costType, setCostType] = useState("all");
  const visible = costType === "all" ? workspace.manhourLines : workspace.manhourLines.filter((line) => line.costType === costType);
  const packages = [...new Set(visible.map((line) => line.package))];
  return <>
    <Panel title="Engineering Man-hour" subtitle="Internal และ supplier effort · Cost = Engineers × Man-days × Daily rate" actions={workspace.capabilities.canEditManhour ? <button className="btn primary sm" type="button" onClick={onAdd}><Icon name="plus" />Add man-hour</button> : undefined} flush>
      <div className="subtabs"><button type="button" className={costType === "all" ? "subtab active" : "subtab"} onClick={() => setCostType("all")}>All work<em>{workspace.manhourLines.length}</em></button><button type="button" className={costType === "Engineering" ? "subtab active" : "subtab"} onClick={() => setCostType("Engineering")}>Engineering<em>{workspace.manhourLines.filter((line) => line.costType === "Engineering").length}</em></button><button type="button" className={costType === "Installation" ? "subtab active" : "subtab"} onClick={() => setCostType("Installation")}>Installation &amp; Service<em>{workspace.manhourLines.filter((line) => line.costType === "Installation").length}</em></button></div>
      {visible.length ? <div className="table-wrap tall"><table style={{ minWidth: 1900 }}><thead><tr><th>Package</th><th>Provider</th><th>Activity</th><th>Department</th><th>Level</th><th>Cost type</th><th>Supplier / Quotation</th><th className="num">Engineers</th><th className="num">Man-days</th><th className="num">Hours/day</th><th className="num">Daily rate</th><th className="num">Man-hours</th><th className="num">Cost</th><th>Owner</th><th>Remark</th><th /></tr></thead><tbody>{packages.flatMap((packageName) => {
        const lines = visible.filter((line) => line.package === packageName);
        return [<tr className="module-row" key={`package-${packageName}`}><td colSpan={16}><div className="row band"><Icon name="layers" /><strong>{packageName}</strong><span className="muted">{lines.length} activity(ies)</span><strong className="num">{formatMoney(lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0))}</strong></div></td></tr>, ...lines.map((line) => <tr key={line.id}><td>{line.package}</td><td><Badge tone={line.provider === "Supplier" ? "violet" : "slate"}>{line.provider}</Badge></td><td><strong>{line.activity}</strong></td><td>{line.department}</td><td>{line.level}</td><td><Badge tone={line.costType === "Installation" ? "amber" : "blue"}>{line.costType}</Badge></td><td><div className="cell-primary"><strong>{line.supplierName ?? "TOMAS TECH"}</strong><span>{line.quotationNumber || "—"}{line.priceDate ? ` · ${formatDate(line.priceDate)}` : ""}</span></div></td><td className="num">{formatNumber(line.engineers)}</td><td className="num">{formatNumber(line.manDays)}</td><td className="num">{formatNumber(line.hoursPerDay)}</td><td className="num">{formatMoney(line.dailyRate)}</td><td className="num">{formatNumber(line.manHours)}</td><td className="num"><strong>{formatMoney(line.lineCost)}</strong></td><td>{line.ownerName}</td><td>{line.remark || "—"}</td><td>{line.canEdit ? <div className="row-actions"><button className="icon-btn" type="button" disabled={busy} onClick={() => onEdit(line)} aria-label={`Edit ${line.activity}`}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} onClick={() => onRemove(line)} aria-label={`Remove ${line.activity}`}><Icon name="trash" /></button></div> : <Icon name="lock" />}</td></tr>)];
      })}</tbody></table></div> : <EmptyState icon="users" title="No man-hour line" message={workspace.capabilities.canEditManhour ? "เพิ่ม engineering หรือ installation effort" : "Revision นี้ไม่มี man-hour หรือ section 06 ไม่ได้มอบหมายให้บัญชีนี้"} action={workspace.capabilities.canEditManhour ? <button className="btn primary" type="button" onClick={onAdd}><Icon name="plus" />Add man-hour</button> : undefined} />}
      <div className="sticky-foot"><div className="foot-item"><span>Man-days</span><strong>{formatNumber(visible.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))}</strong></div><div className="foot-item"><span>Man-hours</span><strong>{formatNumber(visible.reduce((sum, line) => sum + numberOf(line.manHours), 0))}</strong></div><div className="foot-total"><span>Shown effort cost</span><strong>{formatMoney(visible.reduce((sum, line) => sum + numberOf(line.lineCost), 0))}</strong></div></div>
    </Panel>
  </>;
}

function EstimateOtherCostTab({ workspace, busy, onAddExpense, onEditExpense, onRemoveExpense, onAddOther, onEditOther, onRemoveOther, onUpdateContingency }: {
  workspace: EstimateCostWorkspace;
  busy: boolean;
  onAddExpense: () => void;
  onEditExpense: (line: EstimateExpenseLine) => void;
  onRemoveExpense: (line: EstimateExpenseLine) => void;
  onAddOther: () => void;
  onEditOther: (line: EstimateOtherCostLine) => void;
  onRemoveOther: (line: EstimateOtherCostLine) => void;
  onUpdateContingency: (rate: number) => Promise<void>;
}) {
  const [contingency, setContingency] = useState(numberOf(workspace.header.contingencyRate));
  const previewContingency = Math.round(numberOf(workspace.header.totals.subtotal) * contingency / 100);
  const previewTotal = numberOf(workspace.header.totals.subtotal) + previewContingency;
  return <section className="grid-main">
    <div className="stack">
      <Panel title="Project expense" subtitle="Travel, accommodation, per diem, transportation and equipment rental" actions={workspace.capabilities.canEditExpenses ? <button className="btn primary sm" type="button" onClick={onAddExpense}><Icon name="plus" />Add expense</button> : undefined} flush>
        {workspace.expenseLines.length ? <div className="table-wrap"><table style={{ minWidth: 1400 }}><thead><tr><th>Package</th><th>Type</th><th>Description</th><th>Cost type</th><th>Supplier / Reference</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit cost</th><th className="num">Total</th><th>Owner</th><th>Remark</th><th /></tr></thead><tbody>{workspace.expenseLines.map((line) => <tr key={line.id}><td><strong>{line.package}</strong></td><td><Badge>{line.expenseType}</Badge></td><td>{line.description}</td><td>{line.costType}</td><td><div className="cell-primary"><strong>{line.supplierName ?? "—"}</strong><span>{line.referenceNumber || "—"}</span></div></td><td className="num">{formatNumber(line.quantity, 4)}</td><td>{line.unit}</td><td className="num">{formatMoney(line.unitCost)}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td><td>{line.ownerName}</td><td>{line.remark || "—"}</td><td>{line.canEdit ? <div className="row-actions"><button className="icon-btn" type="button" disabled={busy} onClick={() => onEditExpense(line)} aria-label={`Edit ${line.description}`}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} onClick={() => onRemoveExpense(line)} aria-label={`Remove ${line.description}`}><Icon name="trash" /></button></div> : <Icon name="lock" />}</td></tr>)}</tbody></table></div> : <EmptyState icon="truck" title="No project expense" message="ยังไม่มี travel, accommodation หรือ expense อื่นใน section ที่บัญชีนี้แก้ได้" action={workspace.capabilities.canEditExpenses ? <button className="btn primary" type="button" onClick={onAddExpense}><Icon name="plus" />Add expense</button> : undefined} />}
      </Panel>
      <Panel title="Outsource & Other Project Cost" subtitle="Cost line ที่ไม่ใช่ material หรือ man-hour" actions={workspace.capabilities.canEditOtherCosts ? <button className="btn primary sm" type="button" onClick={onAddOther}><Icon name="plus" />Add other cost</button> : undefined} flush>
        {workspace.otherCostLines.length ? <div className="table-wrap"><table><thead><tr><th>Category</th><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit cost</th><th className="num">Total</th><th>Remark</th><th /></tr></thead><tbody>{workspace.otherCostLines.map((line) => <tr key={line.id}><td><Badge>{line.category}</Badge></td><td><strong>{line.description}</strong></td><td className="num">{formatNumber(line.quantity, 4)}</td><td>{line.unit}</td><td className="num">{formatMoney(line.unitCost)}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td><td>{line.remark || "—"}</td><td>{line.canEdit ? <div className="row-actions"><button className="icon-btn" type="button" disabled={busy} onClick={() => onEditOther(line)} aria-label={`Edit ${line.description}`}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} onClick={() => onRemoveOther(line)} aria-label={`Remove ${line.description}`}><Icon name="trash" /></button></div> : <Icon name="lock" />}</td></tr>)}</tbody></table></div> : <EmptyState icon="package" title="No other project cost" message="ยังไม่มี outsource, transportation, accommodation หรือ other cost" action={workspace.capabilities.canEditOtherCosts ? <button className="btn primary" type="button" onClick={onAddOther}><Icon name="plus" />Add other cost</button> : undefined} />}
      </Panel>
    </div>
    <div className="stack">
      <Panel title="Contingency" subtitle="Applied by SQL Server to the current cost base">
        <Field label={`Contingency rate — ${formatNumber(contingency)}%`} hint={workspace.capabilities.canUpdateContingency ? "Save เพื่อบันทึกพร้อม optimistic concurrency" : "บัญชีนี้ไม่มีสิทธิ์แก้ contingency"}><input type="range" min="0" max="100" step="0.25" value={contingency} disabled={!workspace.capabilities.canUpdateContingency || busy} onChange={(event) => setContingency(Number(event.target.value))} /></Field>
        <div className="calc-strip" style={{ marginTop: 10 }}><Icon name="cpu" /><span>{formatMoney(workspace.header.totals.subtotal)} × {formatNumber(contingency)}%</span><strong>{formatMoney(previewContingency)}</strong></div>
        <div className="calc-strip" style={{ marginTop: 8 }}><Icon name="chart" /><span>Preview total after contingency</span><strong>{formatMoney(previewTotal)}</strong></div>
        {workspace.capabilities.canUpdateContingency ? <button className="btn primary block" style={{ marginTop: 12 }} type="button" disabled={busy || contingency === numberOf(workspace.header.contingencyRate)} onClick={() => { void onUpdateContingency(contingency); }}><Icon name="check" />Save contingency</button> : null}
      </Panel>
      <Panel title="Cost base"><dl className="def-list one"><div><dt>Material</dt><dd>{formatMoney(workspace.header.totals.material)}</dd></div><div><dt>Engineering</dt><dd>{formatMoney(workspace.header.totals.engineering)}</dd></div><div><dt>Outsource</dt><dd>{formatMoney(workspace.header.totals.outsource)}</dd></div><div><dt>Transportation</dt><dd>{formatMoney(workspace.header.totals.transportation)}</dd></div><div><dt>Accommodation</dt><dd>{formatMoney(workspace.header.totals.accommodation)}</dd></div><div><dt>Other</dt><dd>{formatMoney(workspace.header.totals.other)}</dd></div><div><dt>Subtotal</dt><dd>{formatMoney(workspace.header.totals.subtotal)}</dd></div><div><dt>Contingency</dt><dd>{formatMoney(workspace.header.totals.contingency)}</dd></div><div><dt>Total</dt><dd><strong>{formatMoney(workspace.header.totals.total)}</strong></dd></div></dl></Panel>
    </div>
  </section>;
}

function EstimateAssignmentTab({ workspace, onEdit }: { workspace: EstimateCostWorkspace; onEdit: (assignment: EstimateAssignment) => void }) {
  const overall = workspace.assignments.length ? workspace.assignments.reduce((sum, assignment) => sum + numberOf(assignment.progress), 0) / workspace.assignments.length : 0;
  return <section className="grid-main"><Panel title="Estimate sections" subtitle="ผู้รับผิดชอบ วันครบกำหนด สถานะ และ progress จากฐานข้อมูล" flush>
    {workspace.assignments.length ? <div className="table-wrap"><table><thead><tr><th>Section</th><th>Responsible Engineer</th><th>Support Engineer</th><th>Due Date</th><th>Status</th><th>Progress</th><th>Comment</th><th /></tr></thead><tbody>{workspace.assignments.map((assignment) => <tr key={assignment.id}><td><strong>{assignment.section}</strong></td><td>{assignment.ownerName}</td><td>{assignment.supportName ?? "—"}</td><td>{formatDate(assignment.dueDate)}</td><td><Badge>{assignment.status}</Badge></td><td style={{ minWidth: 120 }}><ProgressCell value={numberOf(assignment.progress)} /></td><td>{assignment.comment || "—"}</td><td>{assignment.canEdit ? <button className="icon-btn" type="button" onClick={() => onEdit(assignment)} aria-label={`Edit assignment ${assignment.section}`}><Icon name="edit" /></button> : <Icon name="lock" />}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No section assignment" message="Assignment จะถูกสร้างเมื่อ cost section ถูกมอบหมายให้ engineer" />}
  </Panel><div className="stack"><Panel title="Estimate completion"><div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}><span className="muted">Overall assignment progress</span><strong style={{ fontSize: "var(--fs-xl)" }}>{Math.round(overall)}%</strong></div><Progress value={overall} /><ul className="check-list" style={{ marginTop: 12 }}>{workspace.assignments.map((assignment) => <li key={assignment.id} className={`check-item ${numberOf(assignment.progress) === 100 ? "pass" : ""}`}><Icon name={numberOf(assignment.progress) === 100 ? "checkCircle" : assignment.status.includes("Waiting") ? "clock" : "alertCircle"} /><div><strong>{assignment.section} — {formatNumber(assignment.progress)}%</strong><p>{assignment.ownerName} · {assignment.status}</p></div></li>)}</ul></Panel><Panel title="Permission"><div className="info-strip"><Icon name="shield" /><span>{workspace.capabilities.canManageAssignments ? "บัญชีนี้สามารถมอบหมายผู้รับผิดชอบ เปลี่ยน schedule และอัปเดต progress ได้" : workspace.assignments.some((assignment) => assignment.canEdit) ? "คุณอัปเดตสถานะ progress และ comment ของ section ที่รับผิดชอบได้ โดยเปลี่ยนผู้รับผิดชอบหรือ due date ไม่ได้" : "อ่านอย่างเดียว — Estimate owner, Engineering Manager หรือ Admin เป็นผู้จัด assignment"}</span></div></Panel></div></section>;
}

function EstimateValidationTab({ workspace, onFix }: { workspace: EstimateCostWorkspace; onFix: (entityType: string) => void }) {
  const criticalIssues = workspace.validationIssues.filter(isCriticalValidationIssue);
  const warningIssues = workspace.validationIssues.filter((issue) => !isCriticalValidationIssue(issue));
  const orderedIssues = [...criticalIssues, ...warningIssues];
  const resultTone = criticalIssues.length ? "red" : warningIssues.length ? "amber" : "green";
  const resultIcon = criticalIssues.length || warningIssues.length ? "alertTriangle" : "checkCircle";
  return <section className="grid-main"><Panel title="Estimate Validation" subtitle="ตรวจโดย API/SQL Server ก่อน Submit และ Approve">
    {orderedIssues.length ? <ul className="check-list">{orderedIssues.map((issue) => { const critical = isCriticalValidationIssue(issue); return <li className={`check-item ${critical ? "error" : "warning"}`} key={`${issue.code}-${issue.entityType}-${issue.entityId}`}><Icon name={critical ? "alertCircle" : "alertTriangle"} /><div style={{ flex: 1 }}><strong>{issue.code.replaceAll("_", " ")} · {issue.severity}</strong><p>{issue.message} · {issue.entityType} #{issue.entityId}</p></div><button className="btn ghost sm" type="button" onClick={() => onFix(issue.entityType)}>Open line<Icon name="arrowRight" /></button></li>; })}</ul> : <div className="empty"><span className="empty-icon"><Icon name="checkCircle" /></span><strong>Server validation passed</strong><p>Revision ปัจจุบันไม่มี critical issue หรือ advisory warning</p></div>}
  </Panel><div className="stack"><Panel title="Result"><div className={`info-strip ${resultTone}`}><Icon name={resultIcon} /><span>{criticalIssues.length ? `${criticalIssues.length} error(s) block submission and approval${warningIssues.length ? ` · ${warningIssues.length} warning(s) are advisory` : ""}` : warningIssues.length ? `${warningIssues.length} advisory warning(s) do not block submission or approval` : "No validation error or warning"}</span></div></Panel><Panel title="Rules enforced"><ul className="check-list"><li className="check-item"><Icon name="cpu" /><div><strong>Positive quantity</strong><p>Every persisted line must have quantity greater than zero.</p></div></li><li className="check-item"><Icon name="cpu" /><div><strong>Unit cost and owner</strong><p>Required references are checked at the API boundary.</p></div></li><li className="check-item"><Icon name="cpu" /><div><strong>Supplier man-hour</strong><p>Supplier and quotation are mandatory.</p></div></li><li className="check-item"><Icon name="cpu" /><div><strong>Non-empty revision</strong><p>At least one cost or effort line is required.</p></div></li></ul></Panel></div></section>;
}

function revisionWithCurrent(revisions: EstimateRevision[], currentRevision: number, currentTotal: number) {
  const existing = revisions.find((revision) => revision.revision === currentRevision);
  if (existing) return revisions.map((revision) => revision.revision === currentRevision ? { ...revision, total: currentTotal } : revision).sort((left, right) => left.revision - right.revision);
  return [...revisions, { id: -1, revision: currentRevision, code: revisionCode(currentRevision), reason: "Current revision", description: "Current live revision", createdById: 0, createdByName: "—", createdAt: "", reviewedById: null, reviewedByName: null, reviewedAt: null, status: "Active", total: currentTotal }].sort((left, right) => left.revision - right.revision);
}

function EstimateRevisionTab({ revisions, currentRevision, currentTotal }: { revisions: EstimateRevision[]; currentRevision: number; currentTotal: number }) {
  const rows = revisionWithCurrent(revisions, currentRevision, currentTotal);
  return <Panel title="Revision Control" subtitle="Revision history เป็น immutable record; UI นี้ไม่แสดงปุ่มสร้าง revision จนกว่า backend revision-clone endpoint จะพร้อม" flush>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Revision</th><th>Reason</th><th>Description</th><th>Created by</th><th>Created</th><th>Reviewed by</th><th>Reviewed</th><th className="num">Total</th><th>Status</th></tr></thead><tbody>{rows.map((revision) => <tr key={revision.id}><td><span className="pill blue">{revision.code || revisionCode(revision.revision)}</span></td><td><strong>{revision.reason}</strong></td><td>{revision.description}</td><td>{revision.createdByName}</td><td>{formatDateTime(revision.createdAt)}</td><td>{revision.reviewedByName ?? "—"}</td><td>{formatDateTime(revision.reviewedAt)}</td><td className="num"><strong>{formatMoney(revision.total)}</strong></td><td><Badge>{revision.revision === currentRevision ? "Current" : revision.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon="gitBranch" title="No revision history" message="ยังไม่มี revision record ที่ API ส่งกลับ" />}</Panel>;
}

function EstimateCompareTab({ revisions, currentRevision, currentTotal }: { revisions: EstimateRevision[]; currentRevision: number; currentTotal: number }) {
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
  if (rows.length < 2) return <Panel title="Compare Revision"><EmptyState icon="compare" title="Comparison is not available yet" message="ต้องมี revision history อย่างน้อยสอง revision; ระบบไม่สร้างข้อมูลเปรียบเทียบจำลอง" /></Panel>;
  return <><Panel title="Compare Estimate Revision" subtitle="เปรียบเทียบยอดรวมจาก revision history จริง"><div className="row"><Field label="From revision"><select value={fromRevision} onChange={(event) => setFromRevision(Number(event.target.value))}>{rows.map((revision) => <option key={revision.revision} value={revision.revision}>{revision.code || revisionCode(revision.revision)}</option>)}</select></Field><Icon name="arrowRight" /><Field label="To revision"><select value={toRevision} onChange={(event) => setToRevision(Number(event.target.value))}>{rows.map((revision) => <option key={revision.revision} value={revision.revision}>{revision.code || revisionCode(revision.revision)}</option>)}</select></Field></div></Panel><div style={{ height: 14 }} /><section className="grid-3"><Panel title={`${from?.code ?? revisionCode(fromRevision)} Total`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{formatMoney(from?.total)}</strong><p className="muted">{from?.reason}</p></Panel><Panel title={`${to?.code ?? revisionCode(toRevision)} Total`}><strong style={{ fontSize: "var(--fs-2xl)" }}>{formatMoney(to?.total)}</strong><p className="muted">{to?.reason}</p></Panel><Panel title="Difference"><strong style={{ fontSize: "var(--fs-2xl)" }} className={delta > 0 ? "red-text" : delta < 0 ? "green-text" : "muted"}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatMoney(Math.abs(delta))}</strong><p className="muted">{numberOf(from?.total) ? `${(delta / numberOf(from?.total) * 100).toFixed(1)}%` : "No baseline total"}</p></Panel></section><div className="info-strip" style={{ marginTop: 14 }}><Icon name="alertCircle" /><span>Line-by-line historical comparison จะเปิดเมื่อ backend ส่ง revision snapshots; หน้านี้แสดงเฉพาะ revision totals ที่มีอยู่จริง</span></div></>;
}

function EstimateReviewTab({ workspace, onWorkflow }: { workspace: EstimateCostWorkspace; onWorkflow: (action: "submit" | "approve" | "request-revision") => void }) {
  const topItems = [...workspace.costItems].sort((left, right) => numberOf(right.lineTotal) - numberOf(left.lineTotal)).slice(0, 10);
  const effortByDepartment = [...new Set(workspace.manhourLines.map((line) => line.department))].map((department) => ({ department, lines: workspace.manhourLines.filter((line) => line.department === department) }));
  const criticalIssues = workspace.validationIssues.filter(isCriticalValidationIssue);
  const warningIssues = workspace.validationIssues.filter((issue) => !isCriticalValidationIssue(issue));
  const orderedIssues = [...criticalIssues, ...warningIssues];
  return <section className="grid-main"><div className="stack"><Panel title="Project information"><dl className="def-list"><div><dt>Estimate</dt><dd className="mono">{workspace.header.number} · {revisionCode(workspace.header.revision)}</dd></div><div><dt>Inquiry</dt><dd className="mono">{workspace.header.inquiryNumber}</dd></div><div><dt>Customer</dt><dd>{workspace.header.customerName}</dd></div><div><dt>Project</dt><dd>{workspace.header.projectName}</dd></div><div><dt>Project type</dt><dd>{workspace.header.projectType}</dd></div><div><dt>Estimate owner</dt><dd>{workspace.header.ownerName}</dd></div><div><dt>Due date</dt><dd>{formatDate(workspace.header.dueDate)}</dd></div><div><dt>Status</dt><dd><Badge>{workspace.header.status}</Badge></dd></div></dl></Panel>
    <Panel title="Cost summary" subtitle="Approval covers internal engineering cost only — no margin" flush><div className="table-wrap"><table><thead><tr><th>Cost block</th><th className="num">Amount</th><th className="num">Share</th></tr></thead><tbody>{[["Material", workspace.header.totals.material], ["Engineering", workspace.header.totals.engineering], ["Outsource", workspace.header.totals.outsource], ["Transportation", workspace.header.totals.transportation], ["Accommodation", workspace.header.totals.accommodation], ["Other", workspace.header.totals.other], [`Contingency ${formatNumber(workspace.header.contingencyRate)}%`, workspace.header.totals.contingency]].map(([label, value]) => <tr key={String(label)}><td>{label}</td><td className="num">{formatMoney(value as number)}</td><td className="num muted">{numberOf(workspace.header.totals.total) ? `${Math.round(numberOf(value) / numberOf(workspace.header.totals.total) * 100)}%` : "0%"}</td></tr>)}<tr className="subtotal-row"><td>Total estimated cost</td><td className="num"><strong>{formatMoney(workspace.header.totals.total)}</strong></td><td className="num">100%</td></tr></tbody></table></div></Panel>
    <Panel title="Top 10 highest cost items" flush>{topItems.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Supplier</th><th className="num">Total</th></tr></thead><tbody>{topItems.map((line) => <tr key={line.id}><td><div className="cell-primary"><strong>{line.description}</strong><span>{line.brand} {line.model}</span></div></td><td>{line.supplierName ?? "—"}</td><td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td></tr>)}</tbody></table></div> : <EmptyState icon="package" title="No cost item" message="ยังไม่มี cost item สำหรับ review" />}</Panel>
    <Panel title="Engineering man-hour by department" flush>{effortByDepartment.length ? <div className="table-wrap"><table><thead><tr><th>Department</th><th className="num">Man-days</th><th className="num">Man-hours</th><th className="num">Cost</th></tr></thead><tbody>{effortByDepartment.map((entry) => <tr key={entry.department}><td><strong>{entry.department}</strong></td><td className="num">{formatNumber(entry.lines.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))}</td><td className="num">{formatNumber(entry.lines.reduce((sum, line) => sum + numberOf(line.manHours), 0))}</td><td className="num">{formatMoney(entry.lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0))}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No man-hour" message="ยังไม่มี engineering effort สำหรับ review" />}</Panel></div>
    <div className="stack"><Panel title="Reviewer decision" subtitle="Actions shown from API capabilities"><div className="stack" style={{ gap: 8 }}>{workspace.capabilities.canSubmit ? <button className="btn primary block" type="button" disabled={criticalIssues.length > 0} onClick={() => onWorkflow("submit")}><Icon name="send" />Submit for Engineering Review</button> : null}{workspace.capabilities.canApprove ? <button className="btn success block" type="button" disabled={criticalIssues.length > 0} onClick={() => onWorkflow("approve")}><Icon name="checkCircle" />Approve Estimate Cost</button> : null}{workspace.capabilities.canRequestRevision ? <button className="btn warn block" type="button" onClick={() => onWorkflow("request-revision")}><Icon name="refresh" />Request Revision</button> : null}{!workspace.capabilities.canSubmit && !workspace.capabilities.canApprove && !workspace.capabilities.canRequestRevision ? <div className="info-strip"><Icon name="shield" /><span>บัญชีนี้ไม่มี workflow action สำหรับสถานะปัจจุบัน</span></div> : null}</div>{criticalIssues.length ? <div className="info-strip red" style={{ marginTop: 10 }}><Icon name="alertTriangle" />{criticalIssues.length} critical error(s) block submission and approval.</div> : null}{warningIssues.length ? <div className="info-strip amber" style={{ marginTop: 10 }}><Icon name="alertTriangle" />{warningIssues.length} warning(s) are advisory and do not block workflow.</div> : null}</Panel>
    <Panel title="Validation for reviewer">{orderedIssues.length ? <ul className="check-list">{orderedIssues.map((issue) => { const critical = isCriticalValidationIssue(issue); return <li className={`check-item ${critical ? "error" : "warning"}`} key={`${issue.code}-${issue.entityType}-${issue.entityId}`}><Icon name={critical ? "alertCircle" : "alertTriangle"} /><div><strong>{issue.code.replaceAll("_", " ")} · {issue.severity}</strong><p>{issue.message}</p></div></li>; })}</ul> : <p className="muted">No server validation issue.</p>}</Panel>
    <Panel title="Revision history" flush><div className="table-wrap"><table><thead><tr><th>Rev.</th><th>Reason</th><th>Status</th><th className="num">Total</th></tr></thead><tbody>{workspace.revisionHistory.map((revision) => <tr key={revision.id}><td><span className="pill">{revision.code}</span></td><td>{revision.reason}</td><td><Badge>{revision.status}</Badge></td><td className="num">{formatMoney(revision.total)}</td></tr>)}</tbody></table></div></Panel></div>
  </section>;
}

function CostItemEditor({ bootstrap, workspace, line, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateCostItem | null; busy: boolean; onClose: () => void; onSave: (input: CostItemInput, lineId?: number) => Promise<void> }) {
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
    categoryCode: line?.categoryCode ?? initialCategory[0],
    category: line?.category ?? initialCategory[1],
    subcategory: line?.subcategory ?? "",
    module: line?.module ?? "",
    itemCode: line?.itemCode ?? "",
    description: line?.description ?? "",
    brand: line?.brand ?? "",
    model: line?.model ?? "",
    specification: line?.specification ?? "",
    supplierId: line?.supplierId ?? undefined,
    quantity: numberOf(line?.quantity) || 1,
    unit: line?.unit ?? "Set",
    unitCost: numberOf(line?.unitCost),
    priceSource: line?.priceSource ?? "Supplier Quotation",
    referenceNumber: line?.referenceNumber ?? "",
    referenceProject: line?.referenceProject ?? "",
    priceDate: dateValue(line?.priceDate) || businessDate(),
    remark: line?.remark ?? "",
    ownerId: line?.ownerId ?? defaultOwner,
  }));
  const update = <K extends keyof CostItemInput>(key: K, value: CostItemInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.categoryCode.length === 2 && form.module.trim() && form.itemCode.trim() && form.description.trim() && form.quantity > 0 && form.unit.trim() && form.unitCost >= 0 && form.quantity * form.unitCost <= MAX_LEDGER_LINE_TOTAL && form.priceSource && form.ownerId > 0;
  return <Modal title={line ? `Edit ${line.itemCode}` : "Add cost item"} subtitle={line ? "Save checks both estimate and line row versions" : "New line is written to the current revision and audit trail"} size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? "Saving…" : line ? "Save changes" : "Create item"}</button></>}>
    <div className="form-grid four">
      <Field label="Category *" hint={workspace.capabilities.canEditAllSections ? "Canonical production category" : "Only sections assigned to you"}><select value={form.categoryCode} onChange={(event) => { const selected = COST_CATEGORIES.find(([code]) => code === event.target.value); setForm((current) => ({ ...current, categoryCode: event.target.value, category: selected?.[1] ?? current.category })); }}>{allowedCategories.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select></Field>
      <Field label="Subcategory"><input maxLength={100} value={form.subcategory ?? ""} onChange={(event) => update("subcategory", event.target.value)} /></Field>
      <Field label="Main module *"><input required maxLength={200} value={form.module} onChange={(event) => update("module", event.target.value)} /></Field>
      <Field label="Item code *"><input required maxLength={100} value={form.itemCode} onChange={(event) => update("itemCode", event.target.value)} /></Field>
      <Field label="Description *" span={2}><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
      <Field label="Brand"><input maxLength={100} value={form.brand ?? ""} onChange={(event) => update("brand", event.target.value)} /></Field>
      <Field label="Model"><input maxLength={200} value={form.model ?? ""} onChange={(event) => update("model", event.target.value)} /></Field>
      <Field label="Specification" span={2}><textarea maxLength={20000} rows={3} value={form.specification ?? ""} onChange={(event) => update("specification", event.target.value)} /></Field>
      <Field label="Supplier"><select value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value="">No supplier</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field>
      <Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign a cost line" : "Line owner is protected by section permission"}><select disabled={!workspace.capabilities.canEditAllSections && Boolean(line)} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.department}</option>)}</select></Field>
      <Field label="Quantity *"><input type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} /></Field>
      <Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
      <Field label="Unit cost (THB) *"><input type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => update("unitCost", Number(event.target.value))} /></Field>
      <Field label="Line total" hint="Calculated by SQL Server"><input className="calculated" readOnly value={formatMoney(form.quantity * form.unitCost)} /></Field>
      <Field label="Price source *"><select value={form.priceSource} onChange={(event) => update("priceSource", event.target.value)}>{PRICE_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></Field>
      <Field label="Reference number"><input maxLength={200} value={form.referenceNumber ?? ""} onChange={(event) => update("referenceNumber", event.target.value)} /></Field>
      <Field label="Reference project"><input maxLength={200} value={form.referenceProject ?? ""} onChange={(event) => update("referenceProject", event.target.value)} /></Field>
      <Field label="Price date"><input type="date" value={form.priceDate ?? ""} onChange={(event) => update("priceDate", event.target.value || undefined)} /></Field>
      <Field label="Remark" span={4}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field>
      {line ? <Field label="Line status"><input readOnly value={line.status} /></Field> : null}
    </div>
  </Modal>;
}

function ManhourEditor({ bootstrap, workspace, line, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateManhourLine | null; busy: boolean; onClose: () => void; onSave: (input: EstimateManhourInput, lineId?: number) => Promise<void> }) {
  const allOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const owners = workspace.capabilities.canEditAllSections ? allOwners : allOwners.filter((owner) => owner.id === (line?.ownerId ?? bootstrap.user.id));
  const defaultOwner = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const [form, setForm] = useState<EstimateManhourInput>(() => ({
    estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion,
    package: line?.package ?? "Design & Engineering", activity: line?.activity ?? "System Design", department: line?.department ?? bootstrap.user.department,
    level: line?.level ?? bootstrap.team.find((member) => member.id === bootstrap.user.id)?.level ?? "Middle Engineer", costType: line?.costType ?? "Engineering", provider: line?.provider ?? "Internal",
    supplierId: line?.supplierId ?? undefined, quotationNumber: line?.quotationNumber ?? "", priceDate: line?.priceDate ? dateValue(line.priceDate) : undefined, engineers: numberOf(line?.engineers) || 1, manDays: numberOf(line?.manDays) || 1,
    hoursPerDay: numberOf(line?.hoursPerDay) || 8, dailyRate: numberOf(line?.dailyRate), ownerId: line?.ownerId ?? defaultOwner, remark: line?.remark ?? "",
  }));
  const update = <K extends keyof EstimateManhourInput>(key: K, value: EstimateManhourInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const supplierValid = form.provider === "Internal" || Boolean(form.supplierId && form.quotationNumber?.trim() && form.priceDate);
  const lineCostWithinRange = form.provider === "Internal" || form.engineers * form.manDays * form.dailyRate <= MAX_LEDGER_LINE_TOTAL;
  const valid = Boolean(form.package.trim() && form.activity.trim() && form.department.trim() && form.level.trim() && form.engineers > 0 && form.manDays > 0 && form.hoursPerDay > 0 && form.dailyRate >= 0 && form.ownerId && supplierValid && lineCostWithinRange);
  return <Modal title={line ? `Edit ${line.activity}` : "Add engineering man-hour"} subtitle="Internal rate is validated by the API; supplier effort requires a supplier and quotation" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? "Saving…" : line ? "Save changes" : "Create man-hour"}</button></>}>
    <div className="form-grid four">
      <Field label="Work package *" span={2}><input required maxLength={200} value={form.package} onChange={(event) => update("package", event.target.value)} /></Field><Field label="Activity *" span={2}><input required maxLength={300} value={form.activity} onChange={(event) => update("activity", event.target.value)} /></Field>
      <Field label="Provider *"><select value={form.provider} onChange={(event) => { const provider = event.target.value as EstimateManhourInput["provider"]; setForm((current) => ({ ...current, provider, ...(provider === "Internal" ? { supplierId: undefined, quotationNumber: "", priceDate: undefined } : {}) })); }}><option value="Internal">Own engineer</option><option value="Supplier">Supplier man-hour</option></select></Field><Field label="Cost type *"><select value={form.costType} onChange={(event) => update("costType", event.target.value as EstimateManhourInput["costType"])}><option>Engineering</option><option>Installation</option></select></Field><Field label="Department *"><input required maxLength={100} value={form.department} onChange={(event) => update("department", event.target.value)} /></Field><Field label="Engineer level *"><input required maxLength={100} value={form.level} onChange={(event) => update("level", event.target.value)} /></Field>
      <Field label="Supplier" hint={form.provider === "Supplier" ? "Required" : "Not used for internal rate"}><select disabled={form.provider === "Internal"} value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value="">Select supplier</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field><Field label="Quotation number" hint={form.provider === "Supplier" ? "Required" : undefined}><input disabled={form.provider === "Internal"} maxLength={100} value={form.quotationNumber ?? ""} onChange={(event) => update("quotationNumber", event.target.value)} /></Field><Field label="Quotation date" hint={form.provider === "Supplier" ? "Required" : undefined}><input disabled={form.provider === "Internal"} type="date" value={form.priceDate ?? ""} onChange={(event) => update("priceDate", event.target.value || undefined)} /></Field><Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign" : "Assigned line must remain yours"}><select disabled={!workspace.capabilities.canEditAllSections} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.department}</option>)}</select></Field>
      <Field label="Engineer qty *"><input type="number" min="0.01" max="10000" step="0.01" value={form.engineers} onChange={(event) => update("engineers", Number(event.target.value))} /></Field><Field label="Man-days *"><input type="number" min="0.01" max="100000" step="0.01" value={form.manDays} onChange={(event) => update("manDays", Number(event.target.value))} /></Field><Field label="Hours / day *"><input type="number" min="0.01" max="24" step="0.01" value={form.hoursPerDay} onChange={(event) => update("hoursPerDay", Number(event.target.value))} /></Field><Field label={form.provider === "Internal" ? "Daily rate (Rate Master)" : "Daily rate (THB) *"} hint={form.provider === "Internal" ? "Server resolves the active rate after save" : "Supplier quotation rate"}><input type="number" readOnly={form.provider === "Internal"} className={form.provider === "Internal" ? "calculated" : undefined} min="0" max="1000000000" step="0.0001" value={form.dailyRate} onChange={(event) => update("dailyRate", Number(event.target.value))} /></Field>
      <Field label="Man-hours"><input className="calculated" readOnly value={formatNumber(form.engineers * form.manDays * form.hoursPerDay)} /></Field><Field label="Line cost" hint={!lineCostWithinRange ? "Exceeds the maximum amount supported by the estimate ledger" : undefined}><input className="calculated" readOnly value={formatMoney(form.engineers * form.manDays * form.dailyRate)} /></Field><Field label="Remark" span={2}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field>
    </div>
  </Modal>;
}

function ExpenseEditor({ bootstrap, workspace, line, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; line: EstimateExpenseLine | null; busy: boolean; onClose: () => void; onSave: (input: EstimateExpenseInput, lineId?: number) => Promise<void> }) {
  const allOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const owners = workspace.capabilities.canEditAllSections ? allOwners : allOwners.filter((owner) => owner.id === (line?.ownerId ?? bootstrap.user.id));
  const defaultOwner = owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const allowedExpenseTypes = EXPENSE_TYPES.filter((expenseType) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(EXPENSE_SECTION_BY_TYPE[expenseType]) || line?.expenseType === expenseType);
  const [form, setForm] = useState<EstimateExpenseInput>(() => ({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion, package: line?.package ?? "Site Installation", expenseType: line?.expenseType ?? allowedExpenseTypes[0] ?? "Other", description: line?.description ?? "", costType: line?.costType ?? "Installation", supplierId: line?.supplierId ?? undefined, referenceNumber: line?.referenceNumber ?? "", quantity: numberOf(line?.quantity) || 1, unit: line?.unit ?? "Trip", unitCost: numberOf(line?.unitCost), ownerId: line?.ownerId ?? defaultOwner, remark: line?.remark ?? "" }));
  const update = <K extends keyof EstimateExpenseInput>(key: K, value: EstimateExpenseInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = Boolean(form.package.trim() && form.description.trim() && form.expenseType && form.quantity > 0 && form.unit && form.unitCost >= 0 && form.quantity * form.unitCost <= MAX_LEDGER_LINE_TOTAL && form.ownerId);
  return <Modal title={line ? `Edit ${line.description}` : "Add project expense"} subtitle="Expense is reported under transportation, accommodation or other cost" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? "Saving…" : line ? "Save changes" : "Create expense"}</button></>}>
    <div className="form-grid four"><Field label="Work package *" span={2}><input required maxLength={200} value={form.package} onChange={(event) => update("package", event.target.value)} /></Field><Field label="Expense type *" hint={workspace.capabilities.canEditAllSections ? "Mapped to canonical section 08, 09 or 10" : "Only expense types assigned to your sections"}><select value={form.expenseType} onChange={(event) => update("expenseType", event.target.value)}>{allowedExpenseTypes.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Cost type *"><select value={form.costType} onChange={(event) => update("costType", event.target.value as EstimateExpenseInput["costType"])}><option>Engineering</option><option>Installation</option></select></Field><Field label="Description *" span={2}><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Supplier"><select value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value="">No supplier</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field><Field label="Reference number"><input maxLength={200} value={form.referenceNumber ?? ""} onChange={(event) => update("referenceNumber", event.target.value)} /></Field><Field label="Quantity *"><input type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} /></Field><Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label="Unit cost (THB) *"><input type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => update("unitCost", Number(event.target.value))} /></Field><Field label="Line total"><input readOnly className="calculated" value={formatMoney(form.quantity * form.unitCost)} /></Field><Field label="Owner *" hint={workspace.capabilities.canEditAllSections ? "Estimate owner can reassign" : "Assigned line must remain yours"}><select disabled={!workspace.capabilities.canEditAllSections} value={form.ownerId} onChange={(event) => update("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.department}</option>)}</select></Field><Field label="Remark" span={3}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field></div>
  </Modal>;
}

function OtherCostEditor({ workspace, line, busy, onClose, onSave }: { workspace: EstimateCostWorkspace; line: EstimateOtherCostLine | null; busy: boolean; onClose: () => void; onSave: (input: EstimateOtherCostInput, lineId?: number) => Promise<void> }) {
  const [form, setForm] = useState<EstimateOtherCostInput>(() => ({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: line?.rowVersion, category: line?.category ?? "Other Cost", description: line?.description ?? "", quantity: numberOf(line?.quantity) || 1, unit: line?.unit ?? "Lot", unitCost: numberOf(line?.unitCost), remark: line?.remark ?? "" }));
  const update = <K extends keyof EstimateOtherCostInput>(key: K, value: EstimateOtherCostInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const valid = Boolean(form.category && form.description.trim() && form.quantity > 0 && form.unit && form.unitCost >= 0 && form.quantity * form.unitCost <= MAX_LEDGER_LINE_TOTAL);
  return <Modal title={line ? `Edit ${line.description}` : "Add other project cost"} subtitle="Outsource, transportation, accommodation and other project cost" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form, line?.id); }}><Icon name="check" />{busy ? "Saving…" : line ? "Save changes" : "Create line"}</button></>}>
    <div className="form-grid two"><Field label="Category *"><select value={form.category} onChange={(event) => update("category", event.target.value as EstimateOtherCostInput["category"])}>{OTHER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Description *"><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><Field label="Quantity *"><input type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => update("quantity", Number(event.target.value))} /></Field><Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label="Unit cost (THB) *"><input type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => update("unitCost", Number(event.target.value))} /></Field><Field label="Line total"><input readOnly className="calculated" value={formatMoney(form.quantity * form.unitCost)} /></Field><Field label="Remark" span={2}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field></div>
  </Modal>;
}

function AssignmentEditor({ bootstrap, workspace, assignment, busy, onClose, onSave }: { bootstrap: BootstrapData; workspace: EstimateCostWorkspace; assignment: EstimateAssignment; busy: boolean; onClose: () => void; onSave: (input: EstimateAssignmentInput) => Promise<void> }) {
  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const canReassign = workspace.capabilities.canManageAssignments;
  const [form, setForm] = useState<EstimateAssignmentInput>({ estimateRowVersion: workspace.header.rowVersion, lineRowVersion: assignment.rowVersion, ownerId: assignment.ownerId, supportId: assignment.supportId ?? undefined, dueDate: dateValue(assignment.dueDate), status: assignment.status, progress: numberOf(assignment.progress), comment: assignment.comment ?? "" });
  const update = <K extends keyof EstimateAssignmentInput>(key: K, value: EstimateAssignmentInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const statusMatchesProgress = form.status === "Not Started" ? form.progress === 0 : ["Completed", "Reviewed"].includes(form.status) ? form.progress === 100 : true;
  const valid = Boolean(form.ownerId && form.dueDate && form.dueDate <= dateValue(workspace.header.dueDate) && form.supportId !== form.ownerId && form.progress >= 0 && form.progress <= 100 && statusMatchesProgress);
  return <Modal title={`Assignment · ${assignment.section}`} subtitle={canReassign ? "Owner, schedule and progress changes are concurrency checked and audited" : "You may update status, progress and comment for your assigned section"} size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void onSave(form); }}><Icon name="check" />{busy ? "Saving…" : "Save assignment"}</button></>}>
    <div className="form-grid two"><Field label="Responsible engineer *" hint={canReassign ? undefined : "Only the estimate owner or manager can reassign"}><select disabled={!canReassign} value={form.ownerId} onChange={(event) => { const ownerId = Number(event.target.value); setForm((current) => ({ ...current, ownerId, supportId: current.supportId === ownerId ? undefined : current.supportId })); }}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.department}</option>)}</select></Field><Field label="Support engineer" hint={canReassign ? undefined : "Reassignment is locked for this account"}><select disabled={!canReassign} value={form.supportId ?? ""} onChange={(event) => update("supportId", event.target.value ? Number(event.target.value) : undefined)}><option value="">None</option>{owners.filter((owner) => owner.id !== form.ownerId).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></Field><Field label="Due date *" hint={`Must not exceed ${formatDate(workspace.header.dueDate)}`}><input disabled={!canReassign} type="date" max={dateValue(workspace.header.dueDate)} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></Field><Field label="Status *"><select value={form.status} onChange={(event) => { const status = event.target.value; setForm((current) => ({ ...current, status, progress: status === "Not Started" ? 0 : ["Completed", "Reviewed"].includes(status) ? 100 : current.progress })); }}>{SECTION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field><Field label="Progress %" hint={!statusMatchesProgress ? "Not Started requires 0%; Completed/Reviewed requires 100%" : undefined}><input type="number" min="0" max="100" step="0.01" value={form.progress} onChange={(event) => update("progress", Number(event.target.value))} /></Field><Field label="Comment"><textarea maxLength={20000} rows={2} value={form.comment ?? ""} onChange={(event) => update("comment", event.target.value)} /></Field></div>
  </Modal>;
}

function WorkflowModal({ action, estimate, busy, onClose, onConfirm }: { action: "submit" | "approve" | "request-revision"; estimate: string; busy: boolean; onClose: () => void; onConfirm: (comment: string) => Promise<void> }) {
  const [comment, setComment] = useState("");
  const requiresComment = action === "request-revision";
  const title = action === "approve" ? "Approve estimate cost?" : action === "submit" ? "Submit for Engineering Review?" : "Request estimate revision";
  const label = action === "approve" ? "Approve and lock" : action === "submit" ? "Submit review" : "Return for revision";
  return <Modal title={title} subtitle={`${estimate} · this workflow decision is written to the audit trail`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={action === "approve" ? "btn success" : action === "request-revision" ? "btn warn" : "btn primary"} type="button" disabled={busy || (requiresComment && !comment.trim())} onClick={() => { void onConfirm(comment.trim()); }}><Icon name={action === "approve" ? "checkCircle" : action === "submit" ? "send" : "refresh"} />{busy ? "Working…" : label}</button></>}>
    <div className={action === "approve" ? "info-strip green" : action === "request-revision" ? "info-strip amber" : "info-strip"}><Icon name={action === "approve" ? "lock" : action === "request-revision" ? "alertTriangle" : "shield"} /><span>{action === "approve" ? "Approved revision becomes read-only." : action === "request-revision" ? "A reason is required so the estimate owner knows what to change." : "Server validation runs again before the status changes."}</span></div>
    <Field label={requiresComment ? "Revision reason *" : "Workflow comment"}><textarea maxLength={20000} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={requiresComment ? "Describe the scope, price or effort that must be revised…" : "Optional note for the audit trail…"} /></Field>
  </Modal>;
}
