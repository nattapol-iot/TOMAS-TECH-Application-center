"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiRequest, type BootstrapData, type PagedResult, type ProjectSummary } from "../api-client";
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  Tabs,
  Toolbar,
} from "../ui";

export type AdminAnalyticsProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
  teamTestMode?: boolean;
};

type EngineeringRate = {
  id: number;
  level: string;
  department: string;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  rowVersion: string;
};

type AuditRow = {
  source: "Core" | "Material";
  id: number;
  actorId: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number;
  entityNumber: string;
  quantity: number | null;
  projectId: number | null;
  reason: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  occurredAt: string;
};

type InventoryValueReport = {
  asOf: string;
  slowMovingDays: number;
  valuationMethod: string;
  summary: {
    itemCount: number;
    usableValue: number;
    quarantineValue: number;
    totalValue: number;
    slowMovingItemCount: number;
    slowMovingValue: number;
  };
  items: {
    id: number;
    itemCode: string;
    partNumber: string;
    description: string;
    brand: string;
    unit: string;
    location: string;
    usable: number;
    quarantine: number;
    averageUnitCost: number;
    usableValue: number;
    quarantineValue: number;
    lastMovementAt: string | null;
    lastOutboundAt: string | null;
    inactiveDays: number;
    isSlowMoving: boolean;
  }[];
};

type SupplierPerformanceReport = {
  from: string;
  to: string;
  suppliers: {
    supplierId: number;
    supplierCode: string;
    supplierName: string;
    purchaseOrderCount: number;
    orderedQuantity: number;
    orderedValue: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    heldOrRejectedQuantity: number;
    receivedValue: number;
    openValue: number;
    fullyReceivedPurchaseOrderCount: number;
    completedWithExpectedDateCount: number;
    onTimeCompletedPurchaseOrderCount: number;
    fillRatePercent: number | null;
    acceptedFillRatePercent: number | null;
    defectRatePercent: number | null;
    onTimeRatePercent: number | null;
    averageCompletionLeadDays: number | null;
  }[];
};

type PrCycleTimeReport = {
  from: string;
  to: string;
  projectId: number | null;
  stages: {
    stage: string;
    completedCount: number;
    averageHours: number | null;
    minimumHours: number | null;
    maximumHours: number | null;
  }[];
  lifecycle: {
    prCount: number;
    averageCreatedToSubmittedHours: number | null;
    averageSubmittedToFinalApprovalHours: number | null;
    averageApprovalToFirstPurchaseOrderHours: number | null;
    averageCreatedToFirstPurchaseOrderHours: number | null;
  };
  statusCounts: Record<string, number>;
  durationBasis: string;
};

type ProjectCostReport = {
  project: { id: number; number: string; name: string; status: string; estimateNumber: string };
  budget: {
    approvedMaterial: number;
    approvedEngineering: number;
    approvedOutsource: number;
    approvedTransportation: number;
    approvedAccommodation: number;
    approvedOther: number;
    contingency: number;
    approvedEstimateTotal: number;
  };
  procurement: {
    poCommitted: number;
    receivedAtPoPrice: number;
    openPoCommitment: number;
    openPr: number;
    reserved: number;
  };
  actual: { materialConsumed: number };
  forecastExposure: number;
  remainingMaterialBudget: number;
  remainingMaterialBudgetAfterActual: number;
  remainingMaterialBudgetAfterForecast: number;
  accountingScope: string;
  forecastScope: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formatMoney = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
const formatPercent = (value: number | null) => value === null ? "—" : `${formatNumber(value)}%`;
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : "—";
const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(new Date(value))
  : "—";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const today = () => businessDate(new Date());
const yearAgo = () => businessDate(new Date(Date.now() - 365 * 86_400_000));
const query = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
};

function LoadError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong>โหลดข้อมูลไม่สำเร็จ</strong>{message}</span>
      {retry ? <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />ลองใหม่</button> : null}
    </div>
  );
}

function PermissionNotice({ permission }: { permission: string }) {
  return (
    <Panel>
      <EmptyState icon="lock" title="ไม่มีสิทธิ์เปิดหน้านี้" message={`บัญชีนี้ต้องมีสิทธิ์ ${permission} จึงจะอ่านข้อมูลจริงได้`} />
    </Panel>
  );
}

export function ProductionCustomers({ bootstrap, notify, refreshBootstrap }: AdminAnalyticsProps) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const customers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return bootstrap.customers;
    return bootstrap.customers.filter((customer) => `${customer.code} ${customer.name}`.toLocaleLowerCase().includes(needle));
  }, [bootstrap.customers, search]);
  const canRead = bootstrap.permissions.includes("master.read");
  const canWrite = bootstrap.permissions.includes("master.write");

  if (!canRead) return <PermissionNotice permission="master.read" />;
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER MASTER"
        title="Customers"
        subtitle="รายชื่อลูกค้าที่ active จาก SQL Server ผ่าน Production API"
        actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New Customer</button> : undefined}
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search customer code or name…" />
        <Badge tone="green">Live · {bootstrap.customers.length}</Badge>
      </Toolbar>
      <Panel title={`${customers.length} customers`} subtitle="Active customer master records" flush>
        {customers.length ? <div className="table-wrap"><table>
          <thead><tr><th>Customer code</th><th>Customer name</th><th>Source</th></tr></thead>
          <tbody>{customers.map((customer) => <tr key={customer.id}>
            <td><strong className="mono">{customer.code}</strong></td>
            <td><strong>{customer.name}</strong></td>
            <td><Badge tone="green">SQL Server</Badge></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon="users" title="No customer found" message="ปรับคำค้นหา หรือเพิ่มลูกค้ารายแรกเมื่อมีสิทธิ์ master.write" />}
      </Panel>
      {createOpen ? <CreateCustomerModal onClose={() => setCreateOpen(false)} onCreated={async (code) => {
        setCreateOpen(false);
        await refreshBootstrap?.();
        notify(`${code} created`);
      }} /> : null}
    </>
  );
}

function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const input = {
        code: String(form.get("code") ?? "").trim(),
        name: String(form.get("name") ?? "").trim(),
        contact: String(form.get("contact") ?? "").trim() || undefined,
        email: String(form.get("email") ?? "").trim() || undefined,
        phone: String(form.get("phone") ?? "").trim() || undefined,
        industry: String(form.get("industry") ?? "").trim() || undefined,
        site: String(form.get("site") ?? "").trim() || undefined,
      };
      const created = await apiRequest<{ code: string }>("/api/v1/master/customers", { method: "POST", body: JSON.stringify(input) });
      await onCreated(created.code);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New customer" subtitle="บันทึกลง customer master ใน SQL Server" size="lg" onClose={onClose}>
      <form onSubmit={(event) => { void submit(event); }}>
        {error ? <LoadError message={error} /> : null}
        <div className="form-grid two">
          <Field label="Customer code"><input name="code" required maxLength={30} /></Field>
          <Field label="Customer name"><input name="name" required maxLength={300} /></Field>
          <Field label="Contact"><input name="contact" maxLength={200} /></Field>
          <Field label="Email"><input name="email" type="email" maxLength={256} /></Field>
          <Field label="Phone"><input name="phone" maxLength={100} /></Field>
          <Field label="Industry"><input name="industry" maxLength={200} /></Field>
          <Field label="Site" span={2}><input name="site" maxLength={300} /></Field>
        </div>
        <div className="production-document-submit"><span /><div className="row-actions"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create customer"}</button></div></div>
      </form>
    </Modal>
  );
}

type ReportTab = "inventory" | "suppliers" | "pr-cycle" | "project-cost";

export function ProductionReports({ bootstrap }: AdminAnalyticsProps) {
  const [tab, setTab] = useState<ReportTab>("inventory");
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState(0);
  const [inventory, setInventory] = useState<InventoryValueReport | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierPerformanceReport | null>(null);
  const [prCycle, setPrCycle] = useState<PrCycleTimeReport | null>(null);
  const [projectCost, setProjectCost] = useState<ProjectCostReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reportRequest = useRef(0);
  const canReport = bootstrap.permissions.includes("report.read");
  const canInventory = bootstrap.permissions.includes("inventory.read");
  const canProcurement = bootstrap.permissions.includes("procurement.read");
  const canProject = bootstrap.permissions.includes("project.read");
  const tabs = useMemo<{ id: ReportTab; label: string }[]>(() => [
    ...(canInventory ? [{ id: "inventory" as const, label: "Inventory Value" }] : []),
    ...(canProcurement ? [{ id: "suppliers" as const, label: "Supplier Performance" }, { id: "pr-cycle" as const, label: "PR Cycle Time" }] : []),
    ...(canProject ? [{ id: "project-cost" as const, label: "Project Cost" }] : []),
  ], [canInventory, canProcurement, canProject]);
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? tab;

  useEffect(() => {
    if (!canProject) return;
    void apiRequest<PagedResult<ProjectSummary>>("/api/v1/projects/?page=1&pageSize=100")
      .then((result) => {
        setProjects(result.items);
        setProjectId((current) => current || result.items[0]?.id || 0);
      })
      .catch(() => setProjects([]));
  }, [canProject]);

  const load = useCallback(async () => {
    if (!canReport) return;
    const requestId = ++reportRequest.current;
    setLoading(true);
    setError("");
    if (activeTab === "inventory") setInventory(null);
    if (activeTab === "suppliers") setSuppliers(null);
    if (activeTab === "pr-cycle") setPrCycle(null);
    if (activeTab === "project-cost") setProjectCost(null);
    try {
      if (activeTab === "inventory") {
        const value = await apiRequest<InventoryValueReport>(`/api/v1/reports/inventory-value${query({ asOf: to, slowMovingDays: 90 })}`);
        if (reportRequest.current === requestId) setInventory(value);
      }
      if (activeTab === "suppliers") {
        const value = await apiRequest<SupplierPerformanceReport>(`/api/v1/reports/supplier-performance${query({ from, to })}`);
        if (reportRequest.current === requestId) setSuppliers(value);
      }
      if (activeTab === "pr-cycle") {
        const value = await apiRequest<PrCycleTimeReport>(`/api/v1/reports/pr-cycle-time${query({ from, to })}`);
        if (reportRequest.current === requestId) setPrCycle(value);
      }
      if (activeTab === "project-cost" && projectId) {
        const value = await apiRequest<ProjectCostReport>(`/api/v1/reports/project-cost${query({ projectId })}`);
        if (reportRequest.current === requestId) setProjectCost(value);
      }
    } catch (requestError) {
      if (reportRequest.current === requestId) setError(toError(requestError));
    } finally {
      if (reportRequest.current === requestId) setLoading(false);
    }
  }, [activeTab, canReport, from, projectId, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!canReport) return <PermissionNotice permission="report.read" />;
  if (!tabs.length) return <PermissionNotice permission="inventory.read, procurement.read หรือ project.read" />;
  return (
    <>
      <PageHeader eyebrow="LIVE ANALYTICS" title="Reports" subtitle="รายงานคำนวณจาก SQL ledger และเอกสารจริงตามสิทธิ์ของผู้ใช้" meta={<Badge tone="green">Production API</Badge>} />
      <Tabs<ReportTab> tabs={tabs} active={activeTab} onChange={setTab} />
      <Toolbar>
        {activeTab !== "project-cost" ? <>
          {activeTab !== "inventory" ? <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label> : null}
          <label className="field"><span>{activeTab === "inventory" ? "As of" : "To"}</span><input type="date" value={to} min={activeTab === "inventory" ? undefined : from} max={today()} onChange={(event) => setTo(event.target.value)} /></label>
        </> : <label className="select-field"><span className="sr-only">Project</span><select value={projectId} onChange={(event) => setProjectId(Number(event.target.value))} aria-label="Project"><option value={0}>Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.number} · {project.name}</option>)}</select><Icon name="chevronDown" /></label>}
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading || (activeTab === "project-cost" && !projectId)}><Icon name="refresh" />{loading ? "Loading…" : "Refresh"}</button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      {activeTab === "inventory" ? <InventoryReportView report={inventory} loading={loading} /> : null}
      {activeTab === "suppliers" ? <SupplierReportView report={suppliers} loading={loading} /> : null}
      {activeTab === "pr-cycle" ? <PrCycleReportView report={prCycle} loading={loading} /> : null}
      {activeTab === "project-cost" ? <ProjectCostReportView report={projectCost} loading={loading} projectSelected={Boolean(projectId)} /> : null}
    </>
  );
}

function InventoryReportView({ report, loading }: { report: InventoryValueReport | null; loading: boolean }) {
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" />Loading live report…</div> : <EmptyState icon="chart" title="No report loaded" message="เลือกวันที่แล้วกด Refresh" />}</Panel>;
  return <>
    <div className="kpi-grid four">
      <KpiCard label="Inventory value" value={formatMoney(report.summary.totalValue)} note={`As of ${formatDate(report.asOf)}`} tone="blue" icon="database" />
      <KpiCard label="Usable" value={formatMoney(report.summary.usableValue)} note={`${report.summary.itemCount} items`} tone="green" icon="package" />
      <KpiCard label="Quarantine" value={formatMoney(report.summary.quarantineValue)} note="Held inventory value" tone="amber" icon="alertTriangle" />
      <KpiCard label="Slow moving" value={formatMoney(report.summary.slowMovingValue)} note={`${report.summary.slowMovingItemCount} items · ${report.slowMovingDays} days`} tone="violet" icon="clock" />
    </div>
    <Panel title="Inventory valuation" subtitle={report.valuationMethod} flush>{report.items.length ? <div className="table-wrap"><table>
      <thead><tr><th>Item</th><th>Description</th><th>Location</th><th>Usable</th><th>Quarantine</th><th>Avg. cost</th><th>Total value</th><th>Last movement</th><th>Status</th></tr></thead>
      <tbody>{report.items.map((item) => <tr key={item.id}><td><strong className="mono">{item.itemCode}</strong><div className="muted">{item.partNumber}</div></td><td><strong>{item.description}</strong><div className="muted">{item.brand}</div></td><td>{item.location || "—"}</td><td>{formatNumber(item.usable)} {item.unit}</td><td>{formatNumber(item.quarantine)} {item.unit}</td><td>{formatMoney(item.averageUnitCost)}</td><td><strong>{formatMoney(item.usableValue + item.quarantineValue)}</strong></td><td>{formatDateTime(item.lastMovementAt)}</td><td><Badge tone={item.isSlowMoving ? "amber" : "green"}>{item.isSlowMoving ? `${item.inactiveDays} days` : "Moving"}</Badge></td></tr>)}</tbody>
    </table></div> : <EmptyState icon="package" title="No inventory value" message="ยังไม่มี stock transaction ถึงวันที่รายงาน" />}</Panel>
  </>;
}

function SupplierReportView({ report, loading }: { report: SupplierPerformanceReport | null; loading: boolean }) {
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" />Loading live report…</div> : <EmptyState icon="truck" title="No report loaded" message="เลือกช่วงเวลาแล้วกด Refresh" />}</Panel>;
  return <Panel title="Supplier performance" subtitle={`${formatDate(report.from)} – ${formatDate(report.to)}`} flush>{report.suppliers.length ? <div className="table-wrap"><table>
    <thead><tr><th>Supplier</th><th>POs</th><th>Ordered</th><th>Received</th><th>Open</th><th>Fill rate</th><th>Accepted</th><th>Defect</th><th>On time</th><th>Lead days</th></tr></thead>
    <tbody>{report.suppliers.map((item) => <tr key={item.supplierId}><td><strong>{item.supplierName}</strong><div className="muted mono">{item.supplierCode}</div></td><td>{item.purchaseOrderCount}</td><td>{formatMoney(item.orderedValue)}</td><td>{formatMoney(item.receivedValue)}</td><td>{formatMoney(item.openValue)}</td><td>{formatPercent(item.fillRatePercent)}</td><td>{formatPercent(item.acceptedFillRatePercent)}</td><td>{formatPercent(item.defectRatePercent)}</td><td>{formatPercent(item.onTimeRatePercent)}</td><td>{item.averageCompletionLeadDays === null ? "—" : formatNumber(item.averageCompletionLeadDays)}</td></tr>)}</tbody>
  </table></div> : <EmptyState icon="truck" title="No supplier activity" message="ไม่พบ Purchase Order ในช่วงวันที่นี้" />}</Panel>;
}

function PrCycleReportView({ report, loading }: { report: PrCycleTimeReport | null; loading: boolean }) {
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" />Loading live report…</div> : <EmptyState icon="clock" title="No report loaded" message="เลือกช่วงเวลาแล้วกด Refresh" />}</Panel>;
  const hours = (value: number | null) => value === null ? "—" : `${formatNumber(value)} h`;
  return <>
    <div className="kpi-grid four">
      <KpiCard label="PR count" value={report.lifecycle.prCount} note={`${formatDate(report.from)} – ${formatDate(report.to)}`} tone="blue" icon="file" />
      <KpiCard label="Create → Submit" value={hours(report.lifecycle.averageCreatedToSubmittedHours)} note="Average elapsed" tone="slate" icon="clock" />
      <KpiCard label="Submit → Approve" value={hours(report.lifecycle.averageSubmittedToFinalApprovalHours)} note="Average elapsed" tone="violet" icon="checkCircle" />
      <KpiCard label="Create → PO" value={hours(report.lifecycle.averageCreatedToFirstPurchaseOrderHours)} note="Average elapsed" tone="green" icon="truck" />
    </div>
    <Panel title="Approval stage duration" subtitle={report.durationBasis} flush>{report.stages.length ? <div className="table-wrap"><table><thead><tr><th>Stage</th><th>Completed</th><th>Average</th><th>Minimum</th><th>Maximum</th></tr></thead><tbody>{report.stages.map((stage) => <tr key={stage.stage}><td><strong>{stage.stage}</strong></td><td>{stage.completedCount}</td><td>{hours(stage.averageHours)}</td><td>{hours(stage.minimumHours)}</td><td>{hours(stage.maximumHours)}</td></tr>)}</tbody></table></div> : <EmptyState icon="clock" title="No completed stages" message="ยังไม่มีขั้นตอนอนุมัติที่เสร็จในช่วงวันที่นี้" />}</Panel>
    {Object.keys(report.statusCounts).length ? <Panel title="PR status"><div className="kpi-grid four">{Object.entries(report.statusCounts).map(([status, count]) => <KpiCard key={status} label={status} value={count} icon="file" />)}</div></Panel> : null}
  </>;
}

function ProjectCostReportView({ report, loading, projectSelected }: { report: ProjectCostReport | null; loading: boolean; projectSelected: boolean }) {
  if (!projectSelected) return <Panel><EmptyState icon="folder" title="Select a project" message="เลือกโครงการเพื่อคำนวณต้นทุนจาก estimate, procurement และ stock ledger" /></Panel>;
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" />Loading live report…</div> : <EmptyState icon="chart" title="No report loaded" message="กด Refresh เพื่อลองอีกครั้ง" />}</Panel>;
  return <>
    <PageHeader title={`${report.project.number} · ${report.project.name}`} subtitle={`Estimate ${report.project.estimateNumber}`} meta={<Badge>{report.project.status}</Badge>} />
    <div className="kpi-grid four">
      <KpiCard label="Approved estimate" value={formatMoney(report.budget.approvedEstimateTotal)} note="Total approved budget" tone="blue" icon="file" />
      <KpiCard label="Material actual" value={formatMoney(report.actual.materialConsumed)} note="Net MIR issue / return" tone="violet" icon="package" />
      <KpiCard label="Forecast exposure" value={formatMoney(report.forecastExposure)} note="Actual + commitments" tone="amber" icon="trendingUp" />
      <KpiCard label="Remaining material" value={formatMoney(report.remainingMaterialBudgetAfterForecast)} note="After forecast exposure" tone={report.remainingMaterialBudgetAfterForecast < 0 ? "red" : "green"} icon="chart" />
    </div>
    <div className="grid-2">
      <Panel title="Approved budget"><div className="settings-list">
        {Object.entries(report.budget).map(([label, value]) => <div key={label}><span className="setting-icon blue"><Icon name="file" /></span><span><strong>{label}</strong><small>Approved estimate</small></span><strong>{formatMoney(value)}</strong></div>)}
      </div></Panel>
      <Panel title="Procurement exposure"><div className="settings-list">
        {Object.entries(report.procurement).map(([label, value]) => <div key={label}><span className="setting-icon amber"><Icon name="truck" /></span><span><strong>{label}</strong><small>Procurement ledger</small></span><strong>{formatMoney(value)}</strong></div>)}
      </div></Panel>
    </div>
    <div className="callout info"><Icon name="database" /><span><strong>Accounting scope</strong>{report.accountingScope}<br />{report.forecastScope}</span></div>
  </>;
}

export function ProductionEngineeringRates({ bootstrap, notify }: AdminAnalyticsProps) {
  const [result, setResult] = useState<PagedResult<EngineeringRate>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canRead = bootstrap.permissions.includes("master.read");
  const canWrite = bootstrap.permissions.includes("master.write");
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setResult(await apiRequest<PagedResult<EngineeringRate>>(`/api/v1/admin/engineering-rates${query({ page, pageSize: 25, search, activeOnly })}`));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [activeOnly, canRead, page, search]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  if (!canRead) return <PermissionNotice permission="master.read" />;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <PageHeader eyebrow="COST MASTER" title="Engineering Rate" subtitle="อัตราที่มีผลตามช่วงวันที่จาก SQL Server" actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New Rate</button> : undefined} />
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search level, department or creator…" /><label className="checkbox-row"><input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPage(1); }} />Enabled records only</label><button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} rate records`} subtitle="Effective-dated engineering and installation rates" flush>{result.items.length ? <div className="table-wrap"><table>
      <thead><tr><th>Level</th><th>Department</th><th>Engineering / hour</th><th>Engineering / day</th><th>Installation / hour</th><th>Installation / day</th><th>Effective</th><th>Created by</th><th>Status</th></tr></thead>
      <tbody>{result.items.map((rate) => <tr key={rate.id}><td><strong>{rate.level}</strong></td><td>{rate.department}</td><td>{formatMoney(rate.engineeringHourly)}</td><td>{formatMoney(rate.engineeringDaily)}</td><td>{formatMoney(rate.installationHourly)}</td><td>{formatMoney(rate.installationDaily)}</td><td>{formatDate(rate.effectiveFrom)} – {formatDate(rate.effectiveTo)}</td><td><strong>{rate.createdByName}</strong><div className="muted">{formatDateTime(rate.createdAt)}</div></td><td><Badge tone={rate.isActive ? "green" : "slate"}>{rate.isActive ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody>
    </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="chart" title="No engineering rates" message="เพิ่มอัตราแรกเมื่อมีสิทธิ์ master.write" />}</Panel>
    {createOpen ? <CreateRateModal onClose={() => setCreateOpen(false)} onCreated={async (label) => { setCreateOpen(false); notify(`${label} created`); await load(); }} /> : null}
  </>;
}

function CreateRateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (label: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const optional = (name: string) => text(name) || undefined;
    setBusy(true);
    setError("");
    try {
      const input = {
        level: text("level"), department: text("department"),
        engineeringHourly: Number(text("engineeringHourly")), engineeringDaily: Number(text("engineeringDaily")),
        installationHourly: Number(text("installationHourly")), installationDaily: Number(text("installationDaily")),
        effectiveFrom: text("effectiveFrom"), effectiveTo: optional("effectiveTo"),
      };
      const created = await apiRequest<{ level: string; department: string }>("/api/v1/master/engineering-rates", { method: "POST", body: JSON.stringify(input) });
      await onCreated(`${created.department} · ${created.level}`);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="New engineering rate" subtitle="ช่วงวันที่และอัตราซ้ำซ้อนจะถูกตรวจใน transaction" size="lg" onClose={onClose}><form onSubmit={(event) => { void submit(event); }}>
    {error ? <LoadError message={error} /> : null}
    <div className="form-grid two">
      <Field label="Level"><input name="level" required maxLength={100} /></Field><Field label="Department"><input name="department" required maxLength={100} /></Field>
      <Field label="Engineering hourly"><input name="engineeringHourly" type="number" min={0} step="0.0001" required /></Field><Field label="Engineering daily"><input name="engineeringDaily" type="number" min={0} step="0.0001" required /></Field>
      <Field label="Installation hourly"><input name="installationHourly" type="number" min={0} step="0.0001" required /></Field><Field label="Installation daily"><input name="installationDaily" type="number" min={0} step="0.0001" required /></Field>
      <Field label="Effective from"><input name="effectiveFrom" type="date" required defaultValue={today()} /></Field><Field label="Effective to"><input name="effectiveTo" type="date" /></Field>
    </div><div className="production-document-submit"><span /><div className="row-actions"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create rate"}</button></div></div>
  </form></Modal>;
}

export function ProductionAuditLog({ bootstrap }: AdminAnalyticsProps) {
  const [result, setResult] = useState<PagedResult<AuditRow>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("All sources");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRead = bootstrap.permissions.includes("audit.read");
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setResult(await apiRequest<PagedResult<AuditRow>>(`/api/v1/admin/audit${query({ page, pageSize: 50, search, source: source === "All sources" ? undefined : source, entityType })}`));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [canRead, entityType, page, search, source]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  if (!canRead) return <PermissionNotice permission="audit.read" />;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <PageHeader eyebrow="IMMUTABLE LEDGER" title="Audit Log" subtitle="รวม Core audit และ Material audit แบบ read-only จากฐานข้อมูลจริง" meta={<Badge tone="green">Append only</Badge>} />
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search document, action, actor or reason…" /><Select label="Source" value={source} options={["All sources", "Core", "Material"]} onChange={(value) => { setSource(value); setPage(1); }} /><label className="field"><span>Entity</span><input value={entityType} maxLength={50} placeholder="e.g. Estimate" onChange={(event) => { setEntityType(event.target.value); setPage(1); }} /></label><button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} audit events`} subtitle="This endpoint is read-only; both audit ledgers remain append-only" flush>{result.items.length ? <div className="table-wrap"><table>
      <thead><tr><th>Occurred</th><th>Source</th><th>Entity</th><th>Action</th><th>Actor</th><th>Project / Qty</th><th>Reason</th><th>Change</th></tr></thead>
      <tbody>{result.items.map((row) => <tr key={`${row.source}-${row.id}`}><td className="muted">{formatDateTime(row.occurredAt)}</td><td><Badge tone={row.source === "Material" ? "violet" : "blue"}>{row.source}</Badge></td><td><strong>{row.entityType}</strong><div className="muted mono">{row.entityNumber || `#${row.entityId}`}</div></td><td><Badge>{row.action}</Badge></td><td><strong>{row.actorName}</strong><div className="muted">{row.actorRole}</div></td><td>{row.projectId ? <div>Project #{row.projectId}</div> : "—"}{row.quantity !== null ? <div className="muted">Qty {formatNumber(row.quantity)}</div> : null}</td><td>{row.reason || "—"}</td><td>{row.beforeJson || row.afterJson ? <details><summary>View JSON</summary>{row.beforeJson ? <><strong>Before</strong><pre>{row.beforeJson}</pre></> : null}{row.afterJson ? <><strong>After</strong><pre>{row.afterJson}</pre></> : null}</details> : "—"}</td></tr>)}</tbody>
    </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="shield" title="No audit events" message="ไม่พบเหตุการณ์ตามตัวกรองนี้" />}</Panel>
  </>;
}

export function ProductionSettings({ bootstrap, teamTestMode = false }: AdminAnalyticsProps) {
  const endpoint = (() => { try { return new URL(API_BASE_URL).origin; } catch { return "Not configured"; } })();
  return <>
    <PageHeader eyebrow="RUNTIME STATUS" title="Settings" subtitle="ข้อมูลสถานะจริงแบบ read-only ไม่มีปุ่ม Save จำลอง" meta={<Badge tone={teamTestMode ? "amber" : "green"}>{teamTestMode ? "Team Test" : "Production"}</Badge>} />
    <div className="grid-2">
      <Panel title="Signed-in identity" subtitle="Resolved by the API and SQL user registry"><div className="settings-list">
        <div><span className="setting-icon blue"><Icon name="user" /></span><span><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></span><Badge>{bootstrap.user.role}</Badge></div>
        <div><span className="setting-icon violet"><Icon name="users" /></span><span><strong>{bootstrap.user.department || "No department"}</strong><small>Database user ID {bootstrap.user.id}</small></span><Badge tone={bootstrap.user.isActive ? "green" : "red"}>{bootstrap.user.isActive ? "Active" : "Disabled"}</Badge></div>
      </div></Panel>
      <Panel title="Live connections" subtitle="Verified by the successful bootstrap request"><div className="settings-list">
        <div><span className="setting-icon green"><Icon name="database" /></span><span><strong>SQL Server via API</strong><small>Bootstrap, master and permissions loaded successfully</small></span><Badge tone="green">Connected</Badge></div>
        <div><span className="setting-icon blue"><Icon name="globe" /></span><span><strong>API origin</strong><small>{endpoint}</small></span><Badge tone="green">Configured</Badge></div>
        <div><span className="setting-icon amber"><Icon name="clock" /></span><span><strong>Business timezone</strong><small>{BUSINESS_TIME_ZONE}</small></span><Badge tone="blue">Active</Badge></div>
        <div><span className="setting-icon violet"><Icon name="shield" /></span><span><strong>Authentication</strong><small>{teamTestMode ? "Temporary LAN Team Test session" : "Microsoft Entra ID access token"}</small></span><Badge tone={teamTestMode ? "amber" : "green"}>{teamTestMode ? "UAT only" : "Entra"}</Badge></div>
      </div></Panel>
    </div>
    <Panel title={`Permissions (${bootstrap.permissions.length})`} subtitle="สิทธิ์ RBAC ที่ API ส่งให้บัญชีปัจจุบัน"><div className="chip-select">{bootstrap.permissions.map((permission) => <Badge key={permission} tone="slate">{permission}</Badge>)}</div></Panel>
    <div className="callout info"><Icon name="settings" /><span><strong>Configuration ownership</strong>ค่า connection string, Entra, CORS และ host ถูกจัดการที่ server environment เพื่อไม่ให้ browser แก้ไขความปลอดภัยของ Production ได้</span></div>
  </>;
}
