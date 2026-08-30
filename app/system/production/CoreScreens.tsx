"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCustomer,
  createEngineeringRate,
  createEstimate,
  createCostItem,
  createInquiry,
  createInventoryItem,
  createProject,
  createSupplier,
  downloadProjectDocument,
  estimateWorkflow,
  listEstimates,
  listInquiries,
  listInventory,
  listProjectDocuments,
  listProjects,
  loadEstimateCostWorkspace,
  removeCostItem,
  uploadProjectDocument,
  type BootstrapData,
  type CreateCustomerInput,
  type CreateEngineeringRateInput,
  type CreateEstimateInput,
  type CreateInquiryInput,
  type CreateInventoryItemInput,
  type CreateProjectInput,
  type CreateSupplierInput,
  type CostItemInput,
  type EstimateCostWorkspace,
  type EstimateSummary,
  type InquirySummary,
  type ItemBalance,
  type PagedResult,
  type ProjectDocument,
  type ProjectSummary,
} from "../api-client";
import {
  Badge,
  EmptyState,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  ProgressCell,
  SearchInput,
  Select,
  Tabs,
  Toolbar,
} from "../ui";

type CommonProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap: () => Promise<void>;
};

const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formText = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const optionalFormText = (data: FormData, name: string) => formText(data, name) || undefined;
const formNumber = (data: FormData, name: string) => Number(formText(data, name));
const formatDate = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const formatMoney = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const futureDate = (days: number) => businessDate(new Date(Date.now() + days * 86_400_000));
const today = () => businessDate(new Date());
const COST_CATEGORIES = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Other Material"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other"],
] as const;
const ESTIMATE_OWNER_ROLES = ["Engineer", "Engineering Manager", "Admin"] as const;
const canOwnEstimate = (role: string) => ESTIMATE_OWNER_ROLES.some((allowedRole) => allowedRole === role);
const MAX_PROJECT_DOCUMENT_BYTES = 50 * 1024 * 1024;
const PROJECT_DOCUMENT_FOLDERS = [
  ["00", "To do list"],
  ["01", "Concept Design and Proposal"],
  ["02", "Drawing"],
  ["03", "Estimate cost"],
  ["04", "Quote"],
  ["05", "PO"],
  ["06", "Specifications and Documentation"],
  ["07", "Development"],
  ["08", "Schedule"],
  ["09", "Installation"],
  ["10", "Report"],
  ["11", "Manual and Document"],
  ["12", "DATA & EXAMPLE"],
  ["13", "Pic and Video"],
  ["14", "Ref"],
] as const;
const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${unit}`;
};

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong>โหลดข้อมูลไม่สำเร็จ</strong>{message}</span>
      <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />ลองใหม่</button>
    </div>
  );
}

export function ProductionDashboard({ bootstrap, teamTestMode }: Pick<CommonProps, "bootstrap"> & { teamTestMode: boolean }) {
  const canReadInquiries = bootstrap.permissions.includes("inquiry.read");
  const canReadEstimates = bootstrap.permissions.includes("estimate.read");
  const canReadProjects = bootstrap.permissions.includes("project.read");
  const canApproveEstimates = bootstrap.permissions.includes("estimate.approve");
  const hasVisibleKpi = canReadInquiries || canReadEstimates || canReadProjects || canApproveEstimates;
  return (
    <>
      <PageHeader
        eyebrow={teamTestMode ? "TEAM TEST WORKSPACE" : "PRODUCTION WORKSPACE"}
        title={`ยินดีต้อนรับ ${bootstrap.user.name}`}
        subtitle={teamTestMode
          ? "ข้อมูลสรุปนี้อ่านจาก SQL Server ผ่าน API ด้วยรหัสทดสอบชั่วคราวสำหรับ UAT"
          : "ข้อมูลสรุปนี้อ่านจาก SQL Server ผ่าน API ที่ยืนยันตัวตนด้วย Microsoft Entra ID"}
        meta={<Badge tone="green">Connected · {bootstrap.user.role}</Badge>}
      />
      {hasVisibleKpi ? <div className="kpi-grid four">
        {canReadInquiries ? <KpiCard label="Inquiries" value={bootstrap.counts.inquiries} note="รายการในฐานข้อมูล" tone="blue" icon="inbox" /> : null}
        {canReadEstimates ? <KpiCard label="Estimates" value={bootstrap.counts.estimates} note="ประมาณการทั้งหมด" tone="violet" icon="file" /> : null}
        {canReadProjects ? <KpiCard label="Active projects" value={bootstrap.counts.activeProjects} note="โครงการที่ยังไม่ปิด" tone="green" icon="folder" /> : null}
        {canApproveEstimates ? <KpiCard label="Pending approvals" value={bootstrap.counts.approvals} note="รายการรออนุมัติ" tone="amber" icon="checkCircle" /> : null}
      </div> : null}
      <Panel title={teamTestMode ? "Team Test safeguards" : "Production safeguards"} subtitle="สถานะของเส้นทางข้อมูลจริง">
        <div className="settings-list">
          <div><span className={`setting-icon ${teamTestMode ? "amber" : "green"}`}><Icon name="shield" /></span><span><strong>{teamTestMode ? "Temporary Team Test access" : "Microsoft Entra ID"}</strong><small>{teamTestMode ? "ยืนยันตัวตนด้วยอีเมลและรหัสทดสอบชั่วคราวสำหรับ UAT เท่านั้น" : "รหัสผ่านถูกจัดการโดย Microsoft และไม่ถูกเก็บในระบบนี้"}</small></span><Badge tone={teamTestMode ? "amber" : "green"}>{teamTestMode ? "UAT only" : "Active"}</Badge></div>
          <div><span className="setting-icon blue"><Icon name="database" /></span><span><strong>Microsoft SQL Server</strong><small>Frontend ไม่เชื่อมฐานข้อมูลโดยตรง ทุกคำสั่งผ่าน API และ RBAC</small></span><Badge tone="green">Connected</Badge></div>
          <div><span className="setting-icon violet"><Icon name="gitBranch" /></span><span><strong>Audit & concurrency</strong><small>การเปลี่ยนสถานะสำคัญมี audit log และตรวจ row version</small></span><Badge tone="green">Enabled</Badge></div>
        </div>
      </Panel>
    </>
  );
}

export function ProductionInquiries({ bootstrap, notify, refreshBootstrap }: CommonProps) {
  const [result, setResult] = useState<PagedResult<InquirySummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await listInquiries({ page, pageSize: 25, search, status: status === "All status" ? undefined : status }));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canWrite = bootstrap.permissions.includes("inquiry.write");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <PageHeader
        eyebrow="SALES TO ENGINEERING"
        title="Inquiry Management"
        subtitle="รายการนี้มาจาก SQL Server และเลข Inquiry ถูกออกแบบ transaction-safe"
        actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New Inquiry</button> : undefined}
      />
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search inquiry, project or customer…" />
        <Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "New", "Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved", "Cancelled"]} />
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading}><Icon name="refresh" />Refresh</button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      <Panel title={`${result.total} inquiries`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {result.items.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Inquiry No.</th><th>Date</th><th>Customer</th><th>Project</th><th>Owner</th><th>Due</th><th>Progress</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>{result.items.map((item) => (
                <tr key={item.id}>
                  <td><strong className="mono">{item.number}</strong></td>
                  <td>{formatDate(item.inquiryDate)}</td>
                  <td><div className="cell-primary"><strong>{item.customerName}</strong><span>{item.projectType}</span></div></td>
                  <td><strong>{item.projectName}</strong></td>
                  <td>{item.estimateOwnerName}</td>
                  <td>{formatDate(item.dueDate)}</td>
                  <td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td>
                  <td><Badge tone={item.priority === "Urgent" ? "red" : item.priority === "High" ? "amber" : "slate"}>{item.priority}</Badge></td>
                  <td><Badge>{item.status}</Badge></td>
                  <td className="muted">{formatDateTime(item.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
            <Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} />
          </div>
        ) : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="inbox" title="No inquiry found" message="ปรับตัวกรองหรือสร้าง Inquiry รายการแรก" />}
      </Panel>
      {createOpen ? <CreateInquiryModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (number) => {
        setCreateOpen(false); notify(`${number} created`); await Promise.all([load(), refreshBootstrap()]);
      }} /> : null}
    </>
  );
}

function CreateInquiryModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const engineers = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const [form, setForm] = useState<CreateInquiryInput>({
    customerId: bootstrap.customers[0]?.id ?? 0,
    contact: "",
    projectName: "",
    projectType: "IoT / Automation",
    estimateOwnerId: engineers[0]?.id ?? 0,
    dueDate: futureDate(7),
    priority: "Normal",
    requirement: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof CreateInquiryInput>(key: K, value: CreateInquiryInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setError("");
    try { const created = await createInquiry(form); await onCreated(created.number); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New production inquiry" subtitle="เลขเอกสารจะสร้างโดย SQL Server เมื่อบันทึกสำเร็จ" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !form.customerId || !form.estimateOwnerId || !form.projectName.trim()} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Saving…" : "Create inquiry"}</button></>}>
      {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
      <div className="form-grid two">
        <label className="field"><span>Customer *</span><select value={form.customerId} onChange={(event) => update("customerId", Number(event.target.value))}>{bootstrap.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>
        <label className="field"><span>Contact</span><input maxLength={200} value={form.contact} onChange={(event) => update("contact", event.target.value)} /></label>
        <label className="field span-2"><span>Project name *</span><input required maxLength={300} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} /></label>
        <label className="field"><span>Project type *</span><input required maxLength={100} value={form.projectType} onChange={(event) => update("projectType", event.target.value)} /></label>
        <label className="field"><span>Estimate owner *</span><select value={form.estimateOwnerId} onChange={(event) => update("estimateOwnerId", Number(event.target.value))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.department}</option>)}</select></label>
        <label className="field"><span>Due date *</span><input type="date" min={today()} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
        <label className="field"><span>Priority *</span><select value={form.priority} onChange={(event) => update("priority", event.target.value)}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
        <label className="field span-2"><span>Requirement</span><textarea maxLength={20000} value={form.requirement} onChange={(event) => update("requirement", event.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function ProductionEstimates({ bootstrap, notify, refreshBootstrap }: CommonProps) {
  const [result, setResult] = useState<PagedResult<EstimateSummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceEstimate, setWorkspaceEstimate] = useState<EstimateSummary | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setResult(await listEstimates({ page, pageSize: 25, search, status: status === "All status" ? undefined : status })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [page, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);

  const act = async (item: EstimateSummary, action: "submit" | "approve" | "request-revision") => {
    const comment = action === "request-revision" ? window.prompt("Revision reason")?.trim() ?? "" : "";
    if (action === "request-revision" && !comment) return;
    setWorkingId(item.id); setError("");
    try { await estimateWorkflow(item.id, action, item.rowVersion, comment); notify(`${item.number} updated`); await Promise.all([load(), refreshBootstrap()]); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setWorkingId(null); }
  };
  const canWrite = bootstrap.permissions.includes("estimate.write");
  const canApprove = bootstrap.permissions.includes("estimate.approve");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <PageHeader eyebrow="ENGINEERING COST" title="Estimate Cost" subtitle="ต้นทุน Material, Engineering และ Total คำนวณจากข้อมูลจริงในฐานข้อมูล" actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Create from inquiry</button> : undefined} />
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search estimate, inquiry, project or customer…" />
        <Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Revision Required", "Approved", "Locked"]} />
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading}><Icon name="refresh" />Refresh</button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      <Panel title={`${result.total} estimates`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {result.items.length ? <div className="table-wrap"><table>
          <thead><tr><th>Estimate No.</th><th>Inquiry</th><th>Customer / Project</th><th>Owner</th><th>Due</th><th>Progress</th><th>Material</th><th>Engineering</th><th>Total</th><th>Status</th><th>Workflow</th></tr></thead>
          <tbody>{result.items.map((item) => <tr key={item.id}>
            <td><strong className="mono">{item.number}</strong><small className="muted">R{String(item.revision).padStart(2, "0")}</small></td>
            <td className="mono">{item.inquiryNumber}</td>
            <td><div className="cell-primary"><strong>{item.projectName}</strong><span>{item.customerName} · {item.projectType}</span></div></td>
            <td>{item.ownerName}</td><td>{formatDate(item.dueDate)}</td><td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td>
            <td className="num">{formatMoney(Number(item.materialTotal))}</td><td className="num">{formatMoney(Number(item.engineeringTotal))}</td><td className="num"><strong>{formatMoney(Number(item.total))}</strong></td>
            <td><Badge>{item.status}</Badge></td>
            <td><div className="row-actions">
              <button className="btn sm default" type="button" onClick={() => setWorkspaceEstimate(item)}><Icon name="table" />Costs</button>
              {canWrite && ["Draft", "Engineering Input", "Revision Required"].includes(item.status) ? <button className="btn sm ghost" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "submit"); }}>Submit</button> : null}
              {canApprove && item.status === "Engineering Review" ? <><button className="btn sm primary" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "approve"); }}>Approve</button><button className="btn sm danger" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "request-revision"); }}>Revise</button></> : null}
            </div></td>
          </tr>)}</tbody>
        </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="file" title="No estimate found" message="สร้าง Estimate จาก Inquiry ที่ลงทะเบียนแล้ว" />}
      </Panel>
      {createOpen ? <CreateEstimateModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (number) => { setCreateOpen(false); notify(`${number} created`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
      {workspaceEstimate ? <EstimateCostModal estimate={workspaceEstimate} bootstrap={bootstrap} notify={notify} onClose={() => setWorkspaceEstimate(null)} onChanged={async () => { await load(); }} /> : null}
    </>
  );
}

function EstimateCostModal({ estimate, bootstrap, notify, onClose, onChanged }: {
  estimate: EstimateSummary;
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<EstimateCostWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const costOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const defaultOwner = costOwners.find((member) => member.id === estimate.ownerId)?.id
    ?? costOwners.find((member) => member.id === bootstrap.user.id)?.id
    ?? costOwners[0]?.id
    ?? 0;
  const [form, setForm] = useState<Omit<CostItemInput, "estimateRowVersion">>({
    categoryCode: "01", category: "Hardware", subcategory: "", module: "Core", itemCode: "", description: "",
    brand: "", model: "", supplierId: undefined, quantity: 1, unit: "Set", unitCost: 0,
    priceSource: "Supplier Quotation", referenceNumber: "", priceDate: today(), ownerId: defaultOwner,
  });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setWorkspace(await loadEstimateCostWorkspace(estimate.id)); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [estimate.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const editable = Boolean(workspace && bootstrap.permissions.includes("estimate.write") && ["Draft", "Engineering Input", "Revision Required"].includes(workspace.header.status));
  const submit = async () => {
    if (!workspace) return;
    setBusy(true); setError("");
    try {
      await createCostItem(estimate.id, { ...form, estimateRowVersion: workspace.header.rowVersion });
      setAdding(false);
      setForm((current) => ({ ...current, itemCode: "", description: "", brand: "", model: "", unitCost: 0, referenceNumber: "" }));
      notify("Cost item saved");
      await Promise.all([load(), onChanged()]);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  const remove = async (lineId: number, lineVersion: string) => {
    if (!workspace || !window.confirm("Remove this cost item from the current revision?")) return;
    setBusy(true); setError("");
    try { await removeCostItem(estimate.id, lineId, workspace.header.rowVersion, lineVersion, "Removed from cost workspace"); notify("Cost item removed"); await Promise.all([load(), onChanged()]); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`${estimate.number} · Cost workspace`} subtitle={`${estimate.projectName} · ${workspace?.header.status ?? estimate.status}`} size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>Close</button>{editable && !adding ? <button className="btn primary" type="button" onClick={() => setAdding(true)}><Icon name="plus" />Add cost item</button> : null}</>}>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {workspace ? <>
      <div className="summary-strip four"><div className="summary-tile"><span>Material</span><strong>{formatMoney(Number(workspace.header.totals.material))}</strong></div><div className="summary-tile"><span>Engineering</span><strong>{formatMoney(Number(workspace.header.totals.engineering))}</strong></div><div className="summary-tile"><span>Contingency</span><strong>{formatMoney(Number(workspace.header.totals.contingency))}</strong></div><div className="summary-tile strong"><span>Total</span><strong>{formatMoney(Number(workspace.header.totals.total))}</strong></div></div>
      {adding ? <div className="form-section production-cost-form"><div className="form-section-title"><Icon name="plus" /><strong>New cost item</strong></div><div className="form-grid">
        <label className="field span-2"><span>Category *</span><select value={form.categoryCode} onChange={(event) => { const selected = COST_CATEGORIES.find(([code]) => code === event.target.value); setForm((current) => ({ ...current, categoryCode: event.target.value, category: selected?.[1] ?? current.category })); }}>{COST_CATEGORIES.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></label>
        <label className="field"><span>Module *</span><input required maxLength={200} value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))} /></label>
        <label className="field"><span>Item code *</span><input required maxLength={100} value={form.itemCode} onChange={(event) => setForm((current) => ({ ...current, itemCode: event.target.value }))} /></label>
        <label className="field span-2"><span>Description *</span><input required maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        <label className="field"><span>Brand</span><input maxLength={100} value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></label>
        <label className="field"><span>Model</span><input maxLength={200} value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} /></label>
        <label className="field"><span>Supplier</span><select value={form.supplierId ?? ""} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value ? Number(event.target.value) : undefined }))}><option value="">No supplier</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></label>
        <label className="field"><span>Quantity *</span><input required type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} /></label>
        <label className="field"><span>Unit *</span><input required maxLength={50} value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} /></label>
        <label className="field"><span>Unit cost (THB) *</span><input required type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: Number(event.target.value) }))} /></label>
        <label className="field"><span>Price source *</span><select value={form.priceSource} onChange={(event) => setForm((current) => ({ ...current, priceSource: event.target.value }))}><option>Supplier Quotation</option><option>Price Library</option><option>Previous Project</option><option>Budgetary</option></select></label>
        <label className="field"><span>Reference no.</span><input maxLength={200} value={form.referenceNumber} onChange={(event) => setForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
        <label className="field"><span>Price date</span><input type="date" value={form.priceDate} onChange={(event) => setForm((current) => ({ ...current, priceDate: event.target.value }))} /></label>
        <label className="field"><span>Owner *</span><select value={form.ownerId} disabled={costOwners.length === 0} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{costOwners.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      </div><div className="row"><button className="btn ghost" type="button" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !form.ownerId || form.categoryCode.length !== 2 || !form.itemCode.trim() || !form.description.trim() || form.quantity <= 0 || form.unitCost < 0} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Saving…" : "Save item"}</button></div></div> : null}
      {workspace.costItems.length ? <div className="table-wrap"><table><thead><tr><th>Code</th><th>Description</th><th>Module</th><th>Supplier</th><th>Qty</th><th>Unit cost</th><th>Line total</th><th>Source</th><th>Owner</th><th /></tr></thead><tbody>{workspace.costItems.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.categoryCode} · {line.category}</small></td><td><div className="cell-primary"><strong>{line.description}</strong><span>{[line.brand, line.model].filter(Boolean).join(" · ")}</span></div></td><td>{line.module}</td><td>{line.supplierName ?? "—"}</td><td className="num">{Number(line.quantity).toLocaleString("th-TH")} {line.unit}</td><td className="num">{formatMoney(Number(line.unitCost))}</td><td className="num"><strong>{formatMoney(Number(line.lineTotal))}</strong></td><td>{line.priceSource}</td><td>{line.ownerName}</td><td>{editable ? <button className="icon-btn danger" type="button" disabled={busy} aria-label="Remove item" onClick={() => { void remove(line.id, line.rowVersion); }}><Icon name="trash" /></button> : null}</td></tr>)}</tbody></table></div> : !adding ? <EmptyState icon="package" title="No cost item in this revision" message={editable ? "เพิ่มรายการต้นทุนอย่างน้อยหนึ่งรายการก่อนส่งตรวจ" : "Estimate นี้ไม่มีรายการต้นทุนใน revision ปัจจุบัน"} /> : null}
    </> : loading ? <div className="empty"><span className="spinner" />Loading cost workspace…</div> : null}
  </Modal>;
}

function CreateEstimateModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [form, setForm] = useState<CreateEstimateInput>({ inquiryId: 0, ownerId: bootstrap.user.id, dueDate: futureDate(7), contingencyRate: 5 });
  const [busy, setBusy] = useState(false);
  const [loadingInquiries, setLoadingInquiries] = useState(true);
  const [inquiryError, setInquiryError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState("");
  const canManageEstimates = ["Engineering Manager", "Admin"].includes(bootstrap.user.role);
  const ownerOptions = bootstrap.team.filter((member) =>
    canOwnEstimate(member.role)
    && (canManageEstimates || member.id === bootstrap.user.id));
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingInquiries(true);
      setInquiryError("");
      void listInquiries({ pageSize: 100, status: "New" }).then((page) => {
        if (cancelled) return;
        const eligible = page.items.filter((item) =>
          item.status === "New"
          && item.estimateId === null
          && (canManageEstimates || item.estimateOwnerId === bootstrap.user.id));
        setInquiries(eligible);
        setForm((current) => ({ ...current, inquiryId: eligible[0]?.id ?? 0 }));
      }).catch((requestError) => {
        if (!cancelled) setInquiryError(toError(requestError));
      }).finally(() => {
        if (!cancelled) setLoadingInquiries(false);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bootstrap.user.id, canManageEstimates, loadVersion]);
  const submit = async () => { setBusy(true); setError(""); try { const created = await createEstimate(form); await onCreated(created.number); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Modal title="Create estimate from inquiry" subtitle="ข้อมูลลูกค้าและโครงการจะคัดลอกจาก Inquiry" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !form.inquiryId || !form.ownerId} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Saving…" : "Create estimate"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    {inquiryError ? <LoadError message={inquiryError} retry={() => setLoadVersion((version) => version + 1)} /> : null}
    {!loadingInquiries && !inquiryError && inquiries.length === 0 ? <div className="info-strip amber" role="status"><Icon name="alertTriangle" /><span>ไม่มี Inquiry สถานะ New ที่ยังไม่สร้าง Estimate และอยู่ในสิทธิ์ของคุณ</span></div> : null}
    <div className="form-grid two">
      <label className="field span-2"><span>Inquiry *</span><select value={form.inquiryId} disabled={loadingInquiries || inquiries.length === 0} onChange={(event) => setForm((current) => ({ ...current, inquiryId: Number(event.target.value) }))}><option value={0}>{loadingInquiries ? "Loading eligible inquiries…" : "Select inquiry"}</option>{inquiries.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName}</option>)}</select></label>
      <label className="field"><span>Owner *</span><select value={form.ownerId} disabled={!canManageEstimates} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{ownerOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span>Due date *</span><input type="date" min={today()} value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
      <label className="field"><span>Contingency (%)</span><input type="number" min="0" max="100" step="0.01" value={form.contingencyRate} onChange={(event) => setForm((current) => ({ ...current, contingencyRate: Number(event.target.value) }))} /></label>
    </div>
  </Modal>;
}

export function ProductionProjects({ bootstrap, notify, refreshBootstrap, teamTestMode }: CommonProps & { teamTestMode: boolean }) {
  const [result, setResult] = useState<PagedResult<ProjectSummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [documentsProject, setDocumentsProject] = useState<ProjectSummary | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setResult(await listProjects({ page, pageSize: 25, search, status: status === "All status" ? undefined : status })); } catch (requestError) { setError(toError(requestError)); } finally { setLoading(false); } }, [page, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  const canWrite = bootstrap.permissions.includes("project.write");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <PageHeader eyebrow="APPROVED WORK" title="Projects" subtitle={teamTestMode ? "สร้างได้จาก Estimate ที่อนุมัติแล้ว และเก็บเอกสารชั่วคราวในเครื่องทดสอบ (ยังไม่เชื่อม NAS)" : "สร้างได้จาก Estimate ที่อนุมัติแล้ว พร้อมเอกสารโครงการบน NAS ตามโฟลเดอร์มาตรฐาน 15 รายการ"} actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Create project</button> : undefined} />
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search project or customer…" /><Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "On Hold", "Closed"]} /><button className="btn ghost" type="button" onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} projects`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
      {result.items.length ? <div className="table-wrap"><table><thead><tr><th>Project No.</th><th>Project</th><th>Customer</th><th>Type</th><th>Manager</th><th>Start</th><th>Target delivery</th><th>Progress</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.name}</strong></td><td>{item.customerName}</td><td>{item.projectType}</td><td>{item.managerName}</td><td>{formatDate(item.startDate)}</td><td>{formatDate(item.targetDelivery)}</td><td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td><td><Badge>{item.status}</Badge></td><td className="muted">{formatDateTime(item.updatedAt)}</td><td><button className="btn ghost sm" type="button" aria-label={`Documents for ${item.number}`} onClick={() => setDocumentsProject(item)}><Icon name="paperclip" />Documents</button></td></tr>)}</tbody></table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="folder" title="No project found" message="สร้าง Project จาก Estimate ที่อนุมัติแล้ว" />}
    </Panel>
    {createOpen ? <CreateProjectModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (number) => { setCreateOpen(false); notify(`${number} created with folder metadata`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
    {documentsProject ? <ProjectDocumentsModal project={documentsProject} canWrite={canWrite} teamTestMode={teamTestMode} notify={notify} onClose={() => setDocumentsProject(null)} /> : null}
  </>;
}

function ProjectDocumentsModal({ project, canWrite, teamTestMode, notify, onClose }: { project: ProjectSummary; canWrite: boolean; teamTestMode: boolean; notify: (message: string) => void; onClose: () => void }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [folderCode, setFolderCode] = useState<string>(PROJECT_DOCUMENT_FOLDERS[0][0]);
  const [documentType, setDocumentType] = useState("");
  const [remark, setRemark] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setDocuments(await listProjectDocuments(project.id));
    } catch (requestError) {
      setLoadError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError("");
    if (!file) {
      setActionError("กรุณาเลือกไฟล์ที่ต้องการอัปโหลด");
      return;
    }
    if (file.size === 0) {
      setActionError("ไม่สามารถอัปโหลดไฟล์เปล่าได้");
      return;
    }
    if (file.size > MAX_PROJECT_DOCUMENT_BYTES) {
      setActionError(`ไฟล์ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_PROJECT_DOCUMENT_BYTES)}`);
      return;
    }
    if (!documentType.trim()) {
      setActionError("กรุณาระบุประเภทเอกสาร");
      return;
    }
    setUploading(true);
    try {
      const created = await uploadProjectDocument(project.id, { file, folderCode, documentType: documentType.trim(), remark: remark.trim() || undefined });
      setDocuments((current) => [created, ...current]);
      setDocumentType("");
      setRemark("");
      setFile(null);
      setFileInputKey((current) => current + 1);
      notify(`${created.fileName} uploaded to ${teamTestMode ? "temporary local storage" : "NAS"}`);
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setUploading(false);
    }
  };

  const download = async (document: ProjectDocument) => {
    setDownloadingId(document.id);
    setActionError("");
    try {
      const result = await downloadProjectDocument(project.id, document.id);
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = (result.fileName || document.fileName).replace(/[\\/:*?"<>|]/g, "_");
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setDownloadingId(null);
    }
  };

  return <Modal
    title={`${project.number} · Documents`}
    subtitle={teamTestMode
      ? `${project.name} · ไฟล์จัดเก็บชั่วคราวในเครื่องทดสอบและ metadata จัดเก็บใน SQL Server`
      : `${project.name} · ไฟล์จัดเก็บบน NAS บริษัทและ metadata จัดเก็บใน SQL Server`}
    size="xl"
    onClose={onClose}
    footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}
  >
    {canWrite ? <form className="production-document-form" onSubmit={(event) => { void submit(event); }}>
      <div className="form-grid two">
        <label className="field"><span>Project folder *</span><select value={folderCode} disabled={uploading} onChange={(event) => setFolderCode(event.target.value)}>{PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <label className="field"><span>Document type *</span><input required maxLength={100} value={documentType} disabled={uploading} placeholder="เช่น Drawing, Manual, Report" onChange={(event) => setDocumentType(event.target.value)} /></label>
        <label className="field span-2"><span>File * · Maximum 50 MiB</span><input key={fileInputKey} required type="file" disabled={uploading} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setActionError(selected && selected.size > MAX_PROJECT_DOCUMENT_BYTES ? `ไฟล์ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_PROJECT_DOCUMENT_BYTES)}` : ""); }} />{file ? <small>{file.name} · {formatFileSize(file.size)}</small> : null}</label>
        <label className="field span-2"><span>Remark</span><textarea maxLength={2000} rows={2} value={remark} disabled={uploading} onChange={(event) => setRemark(event.target.value)} /></label>
      </div>
      <div className="production-document-submit"><small>{teamTestMode ? "API ตรวจนามสกุลและขนาดไฟล์ก่อนบันทึกลงพื้นที่ทดสอบชั่วคราว; ยังไม่เชื่อมต่อ NAS" : "API ตรวจนามสกุลและขนาดไฟล์ก่อนบันทึก; Production ต้องเปิดใช้การสแกนมัลแวร์ขององค์กรก่อนเปิดรับไฟล์จริง"}</small><button className="btn primary" type="submit" disabled={uploading || !file || !documentType.trim() || file.size === 0 || file.size > MAX_PROJECT_DOCUMENT_BYTES}><Icon name="paperclip" />{uploading ? "Uploading…" : "Upload document"}</button></div>
    </form> : <div className="info-strip" role="status"><Icon name="shield" /><span>บัญชีนี้อ่านและดาวน์โหลดเอกสารได้ แต่ไม่มีสิทธิ์อัปโหลดเอกสารโครงการ</span></div>}

    {actionError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong>ดำเนินการไม่สำเร็จ</strong>{actionError}</span></div> : null}
    {loadError ? <LoadError message={loadError} retry={() => { void load(); }} /> : null}

    <Panel title={`${documents.length} documents`} subtitle={loading ? "Loading document metadata…" : teamTestMode ? "Temporary local document register" : "NAS document register"} flush>
      {documents.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Folder</th><th>Type</th><th>Size</th><th>Remark</th><th>Uploaded by</th><th>Uploaded</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.fileName}</strong><small className="document-content-type" title={document.sha256 ? `SHA-256 ${document.sha256}` : undefined}>{document.contentType}{document.sha256 ? ` · SHA-256 ${document.sha256.slice(0, 12)}…` : ""}</small></td><td><Badge>{document.folderCode}</Badge><small className="document-folder-name">{document.folderName}</small></td><td>{document.documentType}</td><td className="num">{formatFileSize(Number(document.sizeBytes))}</td><td>{document.remark || "—"}</td><td>{document.uploadedByName}</td><td className="muted">{formatDateTime(document.uploadedAt)}</td><td><button className="btn ghost sm" type="button" disabled={downloadingId !== null} aria-label={`Download ${document.fileName}`} onClick={() => { void download(document); }}><Icon name="download" />{downloadingId === document.id ? "Downloading…" : "Download"}</button></td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : !loadError ? <EmptyState icon="file" title="No document uploaded" message={canWrite ? (teamTestMode ? "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยังพื้นที่ทดสอบชั่วคราว" : "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยัง NAS") : "ยังไม่มีเอกสารในโครงการนี้"} /> : null}
    </Panel>
  </Modal>;
}

function CreateProjectModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const managers = bootstrap.team.filter((member) => ["Project Manager", "Engineering Manager", "Admin"].includes(member.role));
  const engineers = bootstrap.team.filter((member) => ["Engineer", "Engineering Manager", "Admin"].includes(member.role));
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [form, setForm] = useState<CreateProjectInput>({ estimateId: 0, purchaseOrderNumber: "", purchaseOrderDate: today(), managerId: managers[0]?.id ?? 0, leadEngineerId: engineers[0]?.id ?? 0, startDate: today(), targetDelivery: futureDate(60), site: "", remark: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void listEstimates({ pageSize: 100, status: "Approved" }).then((page) => { setEstimates(page.items); setForm((current) => ({ ...current, estimateId: page.items[0]?.id ?? 0 })); }).catch((requestError) => setError(toError(requestError))); }, []);
  const submit = async () => { setBusy(true); setError(""); try { const created = await createProject(form); await onCreated(created.number); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Modal title="Create production project" subtitle="ใช้ได้เฉพาะ Estimate สถานะ Approved" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !form.estimateId || !form.managerId || !form.leadEngineerId || !form.purchaseOrderNumber.trim() || !form.site.trim()} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Saving…" : "Create project"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field span-2"><span>Approved estimate *</span><select value={form.estimateId} onChange={(event) => setForm((current) => ({ ...current, estimateId: Number(event.target.value) }))}><option value={0}>Select approved estimate</option>{estimates.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName}</option>)}</select></label>
      <label className="field"><span>Customer PO number *</span><input required maxLength={100} value={form.purchaseOrderNumber} onChange={(event) => setForm((current) => ({ ...current, purchaseOrderNumber: event.target.value }))} /></label>
      <label className="field"><span>PO date *</span><input type="date" value={form.purchaseOrderDate} onChange={(event) => setForm((current) => ({ ...current, purchaseOrderDate: event.target.value }))} /></label>
      <label className="field"><span>Project manager *</span><select value={form.managerId} onChange={(event) => setForm((current) => ({ ...current, managerId: Number(event.target.value) }))}>{managers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span>Lead engineer *</span><select value={form.leadEngineerId} onChange={(event) => setForm((current) => ({ ...current, leadEngineerId: Number(event.target.value) }))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span>Start date *</span><input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
      <label className="field"><span>Target delivery *</span><input type="date" min={form.startDate} value={form.targetDelivery} onChange={(event) => setForm((current) => ({ ...current, targetDelivery: event.target.value }))} /></label>
      <label className="field span-2"><span>Site *</span><input required maxLength={300} value={form.site} onChange={(event) => setForm((current) => ({ ...current, site: event.target.value }))} /></label>
    </div>
  </Modal>;
}

export function ProductionInventory({ bootstrap }: Pick<CommonProps, "bootstrap">) {
  const [items, setItems] = useState<ItemBalance[]>([]);
  const [search, setSearch] = useState("");
  const [reorderOnly, setReorderOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems(await listInventory({ search, reorderOnly })); } catch (requestError) { setError(toError(requestError)); } finally { setLoading(false); } }, [search, reorderOnly]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  const totals = useMemo(() => ({ available: items.reduce((sum, item) => sum + Number(item.available), 0), value: items.reduce((sum, item) => sum + Number(item.usable) * Number(item.averageUnitCost), 0), reorder: items.filter((item) => Number(item.available) <= Number(item.reorderLevel)).length }), [items]);
  return <>
    <PageHeader eyebrow="MATERIAL CONTROL" title="Inventory" subtitle={`สิทธิ์ปัจจุบัน: ${bootstrap.user.role} · ยอดคงเหลือคำนวณจาก immutable stock ledger`} />
    <div className="kpi-grid three"><KpiCard label="Items" value={items.length} icon="package" tone="blue" /><KpiCard label="Available units" value={totals.available.toLocaleString("th-TH")} icon="database" tone="green" /><KpiCard label="Reorder alerts" value={totals.reorder} note={formatMoney(totals.value)} icon="alertTriangle" tone={totals.reorder ? "amber" : "slate"} /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search item, part no., description or brand…" /><label className="checkbox-row"><input type="checkbox" checked={reorderOnly} onChange={(event) => setReorderOnly(event.target.checked)} /><span>Reorder only</span></label><button className="btn ghost" type="button" onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${items.length} inventory items`} subtitle={loading ? "Loading from production API…" : "Live stock ledger balance"} flush>{items.length ? <div className="table-wrap"><table><thead><tr><th>Item code</th><th>Part no.</th><th>Description</th><th>Brand</th><th>Location</th><th>Usable</th><th>Quarantine</th><th>Reserved</th><th>Available</th><th>On order</th><th>Avg. cost</th><th>Reorder</th></tr></thead><tbody>{items.map((item) => { const reorder = Number(item.available) <= Number(item.reorderLevel); return <tr key={item.itemId} className={reorder ? "row-wait" : undefined}><td><strong className="mono">{item.itemCode}</strong></td><td className="mono">{item.partNumber}</td><td>{item.description}</td><td>{item.brand}</td><td>{item.location}</td><td className="num">{Number(item.usable).toLocaleString("th-TH")}</td><td className="num">{Number(item.quarantine).toLocaleString("th-TH")}</td><td className="num">{Number(item.reserved).toLocaleString("th-TH")}</td><td className="num"><strong>{Number(item.available).toLocaleString("th-TH")}</strong> {item.unit}</td><td className="num">{Number(item.onOrder).toLocaleString("th-TH")}</td><td className="num">{formatMoney(Number(item.averageUnitCost))}</td><td>{reorder ? <Badge tone="amber">Reorder</Badge> : <Badge tone="green">OK</Badge>}</td></tr>; })}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="database" title="No inventory item found" message="เพิ่ม Material master และรับสินค้าเข้าระบบก่อน" />}</Panel>
  </>;
}

type MasterTab = "customers" | "suppliers" | "inventory" | "rates" | "team";

export function ProductionMasterData({ bootstrap, notify, refreshBootstrap }: CommonProps) {
  const [tab, setTab] = useState<MasterTab>("customers");
  const canWrite = bootstrap.permissions.includes("master.write");
  const tabs: { id: MasterTab; label: string; count?: number }[] = [
    { id: "customers", label: "Customers", count: bootstrap.customers.length },
    { id: "suppliers", label: "Suppliers", count: bootstrap.suppliers.length },
    { id: "inventory", label: "Inventory items" },
    { id: "rates", label: "Engineering rates" },
    { id: "team", label: "Team reference", count: bootstrap.team.length },
  ];

  return <>
    <PageHeader
      eyebrow="CONTROLLED MASTER RECORDS"
      title="Master Data"
      subtitle="ข้อมูลอ้างอิงกลางสำหรับ Inquiry, Estimate Cost, Project และ Material พร้อมตรวจสอบสิทธิ์และบันทึก Audit trail"
      meta={<Badge tone={canWrite ? "green" : "slate"}>{canWrite ? "Create access" : "Read only"}</Badge>}
    />
    <Tabs tabs={tabs} active={tab} onChange={setTab} />
    <div style={{ marginTop: 14 }}>
      {tab === "customers" ? <CustomerMasterTab bootstrap={bootstrap} canWrite={canWrite} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "suppliers" ? <SupplierMasterTab bootstrap={bootstrap} canWrite={canWrite} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "inventory" ? <InventoryItemMasterTab bootstrap={bootstrap} canWrite={canWrite} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "rates" ? <EngineeringRateMasterTab bootstrap={bootstrap} canWrite={canWrite} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "team" ? <TeamReferenceTab bootstrap={bootstrap} /> : null}
    </div>
  </>;
}

type MasterTabProps = CommonProps & { canWrite: boolean };

function useMasterForm(refreshBootstrap: () => Promise<void>, notify: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (
    form: HTMLFormElement,
    action: () => Promise<unknown>,
    successMessage: string,
    afterReset?: () => void,
  ) => {
    setBusy(true);
    setError("");
    try {
      await action();
      form.reset();
      afterReset?.();
      try {
        await refreshBootstrap();
        notify(successMessage);
      } catch (refreshError) {
        setError(`บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: ${toError(refreshError)}`);
      }
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, submit };
}

function MasterFormError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong>โปรดตรวจสอบรายการนี้</strong>{message}</span></div>;
}

function ReadOnlyMasterPanel() {
  return <Panel title="Create record" subtitle="ต้องใช้สิทธิ์ master.write"><EmptyState icon="lock" title="Read-only access" message="คุณดูข้อมูล Master ได้ แต่บทบาทปัจจุบันไม่มีสิทธิ์สร้างรายการใหม่" /></Panel>;
}

function CustomerMasterTab({ bootstrap, canWrite, notify, refreshBootstrap }: MasterTabProps) {
  return <div className="grid-2">
    {canWrite ? <CustomerCreateForm notify={notify} refreshBootstrap={refreshBootstrap} /> : <ReadOnlyMasterPanel />}
    <Panel title={`${bootstrap.customers.length} customers`} subtitle="รายการ Active ที่ Inquiry เลือกใช้งานได้" flush>
      {bootstrap.customers.length ? <div className="table-wrap"><table><thead><tr><th>Code</th><th>Customer name</th></tr></thead><tbody>{bootstrap.customers.map((customer) => <tr key={customer.id}><td><strong className="mono">{customer.code}</strong></td><td>{customer.name}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No customer yet" message="สร้าง Customer รายแรกทางด้านซ้าย แล้วแบบฟอร์ม Inquiry จะเลือก Customer นี้ได้ทันที" />}
    </Panel>
  </div>;
}

function CustomerCreateForm({ notify, refreshBootstrap }: Pick<CommonProps, "notify" | "refreshBootstrap">) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateCustomerInput = {
      code: formText(data, "code"),
      name: formText(data, "name"),
      contact: optionalFormText(data, "contact"),
      email: optionalFormText(data, "email"),
      phone: optionalFormText(data, "phone"),
      industry: optionalFormText(data, "industry"),
      site: optionalFormText(data, "site"),
    };
    void submit(form, () => createCustomer(input), `Customer ${input.code.toUpperCase()} created`);
  };

  return <Panel title="Add customer" subtitle="Customer ใช้งานได้ทันทีใน Inquiry หลังบันทึก">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <div className="form-grid two">
        <label className="field"><span>Customer code *</span><input name="code" required maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" autoCapitalize="characters" autoComplete="off" placeholder="CUS-001" /></label>
        <label className="field"><span>Customer name *</span><input name="name" required maxLength={300} autoComplete="organization" /></label>
        <label className="field"><span>Contact person</span><input name="contact" maxLength={200} autoComplete="name" /></label>
        <label className="field"><span>Email</span><input name="email" type="email" maxLength={256} autoComplete="email" /></label>
        <label className="field"><span>Phone</span><input name="phone" type="tel" maxLength={100} autoComplete="tel" /></label>
        <label className="field"><span>Industry</span><input name="industry" maxLength={200} autoComplete="organization-title" /></label>
        <label className="field span-2"><span>Site / address</span><textarea name="site" maxLength={300} autoComplete="street-address" /></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create customer"}</button></div>
    </form>
  </Panel>;
}

function SupplierMasterTab({ bootstrap, canWrite, notify, refreshBootstrap }: MasterTabProps) {
  return <div className="grid-2">
    {canWrite ? <SupplierCreateForm notify={notify} refreshBootstrap={refreshBootstrap} /> : <ReadOnlyMasterPanel />}
    <Panel title={`${bootstrap.suppliers.length} suppliers`} subtitle="รายการ Active ที่ Material และ Cost item เลือกใช้งานได้" flush>
      {bootstrap.suppliers.length ? <div className="table-wrap"><table><thead><tr><th>Code</th><th>Supplier name</th><th>Category</th></tr></thead><tbody>{bootstrap.suppliers.map((supplier) => <tr key={supplier.id}><td><strong className="mono">{supplier.code}</strong></td><td>{supplier.name}</td><td><Badge>{supplier.category}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon="truck" title="No supplier yet" message="สร้าง Supplier ก่อนกำหนด Preferred supplier ให้ Inventory item" />}
    </Panel>
  </div>;
}

function SupplierCreateForm({ notify, refreshBootstrap }: Pick<CommonProps, "notify" | "refreshBootstrap">) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const brands = formText(data, "brands").split(",").map((brand) => brand.trim()).filter(Boolean);
    const input: CreateSupplierInput = {
      code: formText(data, "code"),
      name: formText(data, "name"),
      category: formText(data, "category"),
      contact: optionalFormText(data, "contact"),
      email: optionalFormText(data, "email"),
      phone: optionalFormText(data, "phone"),
      brands,
    };
    void submit(form, async () => {
      if (brands.length > 100) throw new Error("Brands ใส่ได้ไม่เกิน 100 รายการ");
      if (brands.some((brand) => brand.length > 100)) throw new Error("Brand แต่ละรายการต้องยาวไม่เกิน 100 ตัวอักษร");
      await createSupplier(input);
    }, `Supplier ${input.code.toUpperCase()} created`);
  };

  return <Panel title="Add supplier" subtitle="ใช้ใน Cost item และ Preferred supplier">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <div className="form-grid two">
        <label className="field"><span>Supplier code *</span><input name="code" required maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" autoCapitalize="characters" autoComplete="off" placeholder="SUP-001" /></label>
        <label className="field"><span>Supplier name *</span><input name="name" required maxLength={300} autoComplete="organization" /></label>
        <label className="field"><span>Category *</span><input name="category" required maxLength={100} placeholder="Automation equipment" /></label>
        <label className="field"><span>Contact person</span><input name="contact" maxLength={200} autoComplete="name" /></label>
        <label className="field"><span>Email</span><input name="email" type="email" maxLength={256} autoComplete="email" /></label>
        <label className="field"><span>Phone</span><input name="phone" type="tel" maxLength={100} autoComplete="tel" /></label>
        <label className="field span-2"><span>Brands</span><input name="brands" maxLength={10099} placeholder="Siemens, Omron, SMC" /><small>คั่นแต่ละ Brand ด้วย comma; สูงสุด 100 รายการ และรายการละ 100 ตัวอักษร</small></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create supplier"}</button></div>
    </form>
  </Panel>;
}

function InventoryItemMasterTab({ bootstrap, canWrite, notify, refreshBootstrap }: MasterTabProps) {
  return <div className="grid-2">
    {canWrite ? <InventoryItemCreateForm bootstrap={bootstrap} notify={notify} refreshBootstrap={refreshBootstrap} /> : <ReadOnlyMasterPanel />}
    <Panel title="Inventory item rules" subtitle="ข้อมูลตั้งต้นสำหรับ Stock ledger">
      <div className="settings-list">
        <div><span className="setting-icon blue"><Icon name="package" /></span><span><strong>Stable item code</strong><small>รหัส Item ต้องไม่ซ้ำ และรองรับตัวอักษร ตัวเลข . _ / -</small></span></div>
        <div><span className="setting-icon green"><Icon name="database" /></span><span><strong>Opening balance is separate</strong><small>การสร้าง Master ไม่เพิ่มยอด Stock; ยอดคงเหลือมาจาก Stock ledger เท่านั้น</small></span></div>
        <div><span className="setting-icon amber"><Icon name="truck" /></span><span><strong>{bootstrap.suppliers.length} active suppliers</strong><small>Preferred supplier เป็นตัวเลือก ไม่บังคับสำหรับการสร้าง Item</small></span></div>
      </div>
    </Panel>
  </div>;
}

function InventoryItemCreateForm({ bootstrap, notify, refreshBootstrap }: Pick<CommonProps, "bootstrap" | "notify" | "refreshBootstrap">) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const preferredSupplier = formText(data, "preferredSupplierId");
    const input: CreateInventoryItemInput = {
      itemCode: formText(data, "itemCode"),
      partNumber: optionalFormText(data, "partNumber"),
      description: formText(data, "description"),
      brand: optionalFormText(data, "brand"),
      unit: formText(data, "unit"),
      location: optionalFormText(data, "location"),
      reorderLevel: formNumber(data, "reorderLevel"),
      averageUnitCost: formNumber(data, "averageUnitCost"),
      leadTimeDays: formNumber(data, "leadTimeDays"),
      preferredSupplierId: preferredSupplier ? Number(preferredSupplier) : undefined,
    };
    void submit(form, () => createInventoryItem(input), `Inventory item ${input.itemCode.toUpperCase()} created`);
  };

  return <Panel title="Add inventory item" subtitle="สร้าง Material master โดยไม่สร้างยอด Stock เริ่มต้น">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <div className="form-grid two">
        <label className="field"><span>Item code *</span><input name="itemCode" required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" autoCapitalize="characters" autoComplete="off" placeholder="MAT-001" /></label>
        <label className="field"><span>Part number</span><input name="partNumber" maxLength={200} autoComplete="off" /></label>
        <label className="field span-2"><span>Description *</span><textarea name="description" required maxLength={500} /></label>
        <label className="field"><span>Brand</span><input name="brand" maxLength={100} /></label>
        <label className="field"><span>Unit *</span><input name="unit" required maxLength={50} defaultValue="pcs" /></label>
        <label className="field"><span>Location</span><input name="location" maxLength={100} /></label>
        <label className="field"><span>Preferred supplier</span><select name="preferredSupplierId" defaultValue=""><option value="">No preferred supplier</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></label>
        <label className="field"><span>Reorder level *</span><input name="reorderLevel" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Average unit cost (THB) *</span><input name="averageUnitCost" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Lead time (days) *</span><input name="leadTimeDays" type="number" required min="0" max="2147483647" step="1" defaultValue="0" /></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create inventory item"}</button></div>
    </form>
  </Panel>;
}

function EngineeringRateMasterTab({ bootstrap, canWrite, notify, refreshBootstrap }: MasterTabProps) {
  const departments = [...new Set(bootstrap.team.map((member) => member.department).filter(Boolean))].sort();
  const levels = [...new Set(bootstrap.team.map((member) => member.level).filter(Boolean))].sort();
  return <div className="grid-2">
    {canWrite ? <EngineeringRateCreateForm departments={departments} levels={levels} notify={notify} refreshBootstrap={refreshBootstrap} /> : <ReadOnlyMasterPanel />}
    <Panel title="Rate governance" subtitle="ช่วงวันที่ของ Level และ Department เดียวกันต้องไม่ซ้อนกัน">
      <div className="settings-list">
        <div><span className="setting-icon blue"><Icon name="cpu" /></span><span><strong>Engineering rate</strong><small>กำหนด Hourly และ Daily rate สำหรับงาน Engineering</small></span></div>
        <div><span className="setting-icon amber"><Icon name="truck" /></span><span><strong>Installation rate</strong><small>แยก Hourly และ Daily rate สำหรับ Installation &amp; Service</small></span></div>
        <div><span className="setting-icon green"><Icon name="calendar" /></span><span><strong>Effective dating</strong><small>เว้น Effective to ว่างเพื่อให้ Rate มีผลต่อเนื่อง; API ป้องกันช่วงวันที่ซ้อน</small></span></div>
      </div>
    </Panel>
  </div>;
}

function EngineeringRateCreateForm({ departments, levels, notify, refreshBootstrap }: Pick<CommonProps, "notify" | "refreshBootstrap"> & { departments: string[]; levels: string[] }) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState("");
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateEngineeringRateInput = {
      level: formText(data, "level"),
      department: formText(data, "department"),
      engineeringHourly: formNumber(data, "engineeringHourly"),
      engineeringDaily: formNumber(data, "engineeringDaily"),
      installationHourly: formNumber(data, "installationHourly"),
      installationDaily: formNumber(data, "installationDaily"),
      effectiveFrom,
      effectiveTo: effectiveTo || undefined,
    };
    void submit(form, () => createEngineeringRate(input), `${input.department} · ${input.level} rate created`, () => { setEffectiveFrom(today()); setEffectiveTo(""); });
  };

  return <Panel title="Add engineering rate" subtitle="Rate มีผลตาม Level, Department และช่วงวันที่">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <datalist id="master-level-options">{levels.map((level) => <option key={level} value={level} />)}</datalist>
      <datalist id="master-department-options">{departments.map((department) => <option key={department} value={department} />)}</datalist>
      <div className="form-grid two">
        <label className="field"><span>Level *</span><input name="level" required maxLength={100} list="master-level-options" placeholder="Senior Engineer" /></label>
        <label className="field"><span>Department *</span><input name="department" required maxLength={100} list="master-department-options" placeholder="IoT Engineering" /></label>
        <label className="field"><span>Engineering hourly (THB) *</span><input name="engineeringHourly" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Engineering daily (THB) *</span><input name="engineeringDaily" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Installation hourly (THB) *</span><input name="installationHourly" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Installation daily (THB) *</span><input name="installationDaily" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span>Effective from *</span><input name="effectiveFrom" type="date" required max="9999-12-31" value={effectiveFrom} onChange={(event) => { setEffectiveFrom(event.target.value); if (effectiveTo && effectiveTo < event.target.value) setEffectiveTo(""); }} /></label>
        <label className="field"><span>Effective to</span><input name="effectiveTo" type="date" min={effectiveFrom} max="9999-12-31" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} /></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? "Saving…" : "Create rate"}</button></div>
    </form>
  </Panel>;
}

function TeamReferenceTab({ bootstrap }: Pick<CommonProps, "bootstrap">) {
  return <Panel title={`${bootstrap.team.length} active users`} subtitle="ใช้ Department และ Level เป็นข้อมูลอ้างอิงเมื่อสร้าง Engineering rate" flush>
    {bootstrap.team.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Level</th></tr></thead><tbody>{bootstrap.team.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td><Badge tone={member.role === "Admin" ? "violet" : "blue"}>{member.role}</Badge></td><td>{member.department}</td><td>{member.level || "—"}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No active team member" message="Provision users before creating rate references" />}
  </Panel>;
}

export function ProductionTeam({ bootstrap, teamTestMode }: Pick<CommonProps, "bootstrap"> & { teamTestMode: boolean }) {
  return <><PageHeader eyebrow="ACCESS CONTROL" title="Team & permissions" subtitle={teamTestMode ? "ผู้ใช้และบทบาทถูกอ่านจากฐานข้อมูล ส่วนการยืนยันตัวตนใช้รหัสทดสอบชั่วคราวสำหรับ UAT" : "ผู้ใช้และบทบาทถูกอ่านจากฐานข้อมูล ส่วนการยืนยันตัวตนมาจาก Microsoft Entra ID"} /><Panel title={`${bootstrap.team.length} active users`} subtitle={`${bootstrap.permissions.length} permissions for your role`} flush><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Level</th></tr></thead><tbody>{bootstrap.team.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td><Badge tone={member.role === "Admin" ? "violet" : "blue"}>{member.role}</Badge></td><td>{member.department}</td><td>{member.level || "—"}</td></tr>)}</tbody></table></div></Panel></>;
}
