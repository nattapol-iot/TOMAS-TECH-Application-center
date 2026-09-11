"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateSignableDocumentModal } from "./SigningScreens";
import {
  ApiClientError,
  apiRequest,
  createSupplierQuotation,
  downloadSupplierQuotation,
  findOrCreateSupplier,
  listAllQuotationLinesForPriceLibrary,
  listEstimates,
  listInquiries,
  listProjects,
  listQuotationLines,
  listSupplierQuotations,
  listSupplierPriceHistory,
  loadEstimateCostWorkspace,
  parsePdfViaBackend,
  saveQuotationLines,
  type BootstrapData,
  type EstimateCostItem,
  type EstimateSummary,
  type ProjectSummary,
  type QuotationLineForPriceLibrary,
  type QuotationLineItem,
  type ParsedQuotationResult,
  type SupplierQuotationRecord,
  type SupplierPriceHistoryRecord,
} from "../api-client";
import type { ParsedLine } from "./supplier-quotation-pdf-parser";
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
  Pill,
  ProgressCell,
  SearchInput,
  Select,
  TablePageSize,
  Tabs,
  Toolbar,
} from "../ui";

type ProductionPlanningProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
  openProjectSchedule?: (projectId: number) => void;
  preferredProjectId?: number | null;
  onMyWorkUrgentCountChange?: (count: number) => void;
};

type MyWorkItem = {
  projectId: number;
  projectNo: string;
  projectName: string;
  managerId: number;
  managerName: string;
  projectStatus: string;
  scheduleVersion: string | null;
  canUpdate: boolean;
  isOwnDetail: boolean;
  canAddDetail: boolean;
  canDeleteDetail: boolean;
  taskId: number;
  parentId: number | null;
  wbs: string;
  name: string;
  kind: "task" | "detail";
  origin: string;
  isMilestone: boolean;
  phaseWbs: string | null;
  phaseName: string | null;
  planStart: string | null;
  planFinish: string | null;
  workDays: number;
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  remark: string | null;
  pendingRequest: {
    id: number;
    requestDays: number;
    comment: string | null;
    occurredAt: string;
  } | null;
  rowVersion: string;
  updatedAt: string;
};

type MyWorkUpdate = {
  id: number;
  projectId: number;
  projectNo: string;
  projectName: string;
  taskId: number | null;
  wbs: string | null;
  taskName: string | null;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  comment: string | null;
  requestDays: number;
  answer: string | null;
  answerNote: string | null;
  occurredAt: string;
};

type SchedulePic = { id: number; name: string; email: string };

export type ScheduleTask = {
  id: number;
  parentId: number | null;
  sortOrder: number;
  wbs: string;
  depth: number;
  kind: "phase" | "task" | "detail";
  name: string;
  isMilestone: boolean;
  origin: string;
  visibility: string;
  planStart: string | null;
  planFinish: string | null;
  planDays: number;
  workDays: number;
  startMode: string;
  predecessorId: number | null;
  lagDays: number;
  pics: SchedulePic[];
  picExternal: string;
  planManDays: number;
  baselineStart: string | null;
  baselineFinish: string | null;
  baselineDays: number;
  baselineRevision: number;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  percentComplete: number;
  status: string;
  remark: string | null;
  actualManDays: number;
  rowVersion: string;
  updatedAt: string;
  updatedBy: number;
  children: ScheduleTask[];
};

type ScheduleBaseline = {
  id: number;
  revision: number;
  label: string;
  takenAt: string;
  takenBy: string;
  reason: string;
  taskCount: number;
  promisedFinish: string | null;
};

type ScheduleUpdate = {
  id: number;
  taskId: number | null;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  comment: string | null;
  requestDays: number;
  answer: string | null;
  answerBy: { id: number; name: string } | null;
  answerNote: string | null;
  answeredAt: string | null;
  occurredAt: string;
  actor: { id: number; name: string };
};

export type ProjectSchedule = {
  projectId: number;
  projectNo: string;
  projectName: string;
  managerId: number;
  projectStatus: string;
  scheduleVersion: string | null;
  canPlan: boolean;
  canUpdateProgress: boolean;
  summary: {
    planStart: string | null;
    planFinish: string | null;
    workDays: number;
    percentComplete: number;
    taskCount: number;
    doneCount: number;
    blockedCount: number;
  };
  latestBaseline: ScheduleBaseline | null;
  baselines: ScheduleBaseline[];
  recentUpdates: ScheduleUpdate[];
  tasks: ScheduleTask[];
};

type PriceRecord = {
  key: string;
  sourceKind: "Estimate" | "Historical Purchase" | "Supplier Quotation";
  estimateId: number;
  estimateNo: string;
  estimateStatus: string;
  projectName: string;
  customerName: string;
  itemId: number;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  supplierId: number | null;
  supplierName: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  priceSource: string;
  referenceNumber: string | null;
  priceDate: string | null;
  ownerName: string;
  lineStatus: string;
  ageDays: number | null;
};

type PriceLoadState = {
  records: PriceRecord[];
  estimateCount: number;
  historicalCount: number;
  quotationLineCount: number;
  skippedWorkspaces: number;
};

export type ScheduleLoadState = {
  projects: ProjectSummary[];
  schedules: ProjectSchedule[];
  skippedSchedules: number;
};

type ProgressTarget = {
  taskId: number;
  projectNo: string;
  wbs: string;
  name: string;
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  remark: string | null;
};

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const isConcurrencyConflict = (error: unknown) => error instanceof ApiClientError
  && error.status === 409
  && error.code === "concurrency_conflict";
const money = (value: number) => new Intl.NumberFormat(currentLocale(), {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
}).format(value);
const number = (value: number, maximumFractionDigits = 2) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits }).format(value);
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : "—";
const dateTime = (value: string) => new Intl.DateTimeFormat(currentLocale(), {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(value));
const isoToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const isBeforeToday = (value: string | null) => Boolean(value && value.slice(0, 10) < isoToday());
const ageInDays = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const today = Date.parse(`${isoToday()}T00:00:00Z`);
  return Math.max(0, Math.floor((today - parsed) / 86_400_000));
};
const flattenTasks = (tasks: ScheduleTask[]): ScheduleTask[] => tasks.flatMap((task) => [task, ...flattenTasks(task.children)]);
const leafTasks = (schedule: ProjectSchedule) => flattenTasks(schedule.tasks).filter((task) => task.kind !== "phase" && task.children.length === 0);

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert">
    <Icon name="alertTriangle" />
    <span><strong><LocalizedText text={"Could not load"} /></strong><small>{message}</small></span>
    <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>
  </div>;
}

function PermissionNotice({ permission, message }: { permission: string; message: string }) {
  return <Panel title="ไม่พบสิทธิ์เข้าถึง" subtitle={`Required permission: ${permission}`}>
    <EmptyState icon="lock" title="รายการนี้ถูกจำกัดตามบทบาท" message={message} />
  </Panel>;
}

async function loadAllEstimates() {
  const items: EstimateSummary[] = [];
  let page = 1;
  while (true) {
    const result = await listEstimates({ page, pageSize: 100 });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

async function loadAllProjects() {
  const items: ProjectSummary[] = [];
  let page = 1;
  while (true) {
    const result = await listProjects({ page, pageSize: 100 });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

async function loadAllSupplierPriceHistory() {
  const items: SupplierPriceHistoryRecord[] = [];
  let page = 1;
  while (true) {
    const result = await listSupplierPriceHistory({ page, pageSize: 200 });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

async function mapSettledLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: ({ ok: true; value: R } | { ok: false })[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { ok: true, value: await work(items[index]) };
      } catch {
        results[index] = { ok: false };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadPriceRecords(): Promise<PriceLoadState> {
  const [estimates, historical, quotationLines] = await Promise.all([
    loadAllEstimates(), loadAllSupplierPriceHistory(),
    listAllQuotationLinesForPriceLibrary().catch(() => [] as QuotationLineForPriceLibrary[]),
  ]);
  const settled = await mapSettledLimited(estimates, 5, async (estimate) => ({
    estimate,
    workspace: await loadEstimateCostWorkspace(estimate.id),
  }));
  const records: PriceRecord[] = [];
  settled.forEach((result) => {
    if (!result.ok) return;
    const { estimate, workspace } = result.value;
    workspace.costItems.forEach((item: EstimateCostItem) => records.push({
      key: `${estimate.id}:${item.id}`,
      sourceKind: "Estimate",
      estimateId: estimate.id,
      estimateNo: estimate.number,
      estimateStatus: estimate.status,
      projectName: estimate.projectName,
      customerName: estimate.customerName,
      itemId: item.id,
      itemCode: item.itemCode,
      description: item.description,
      brand: item.brand,
      model: item.model,
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitCost: Number(item.unitCost),
      lineTotal: Number(item.lineTotal),
      priceSource: item.priceSource,
      referenceNumber: item.referenceNumber,
      priceDate: item.priceDate,
      ownerName: item.ownerName,
      lineStatus: item.status,
      ageDays: ageInDays(item.priceDate),
    }));
  });
  historical.forEach((item) => records.push({
    key: `history:${item.id}`,
    sourceKind: "Historical Purchase",
    estimateId: 0,
    estimateNo: item.purchaseOrderNumber || item.projectNumber,
    estimateStatus: "Purchased",
    projectName: `${item.projectNumber} · ${item.projectName}`,
    customerName: item.customerName,
    itemId: item.id,
    itemCode: item.itemCode,
    description: item.description,
    brand: item.brand,
    model: "",
    supplierId: item.supplierId,
    supplierName: item.supplierName,
    quantity: Number(item.quantity),
    unit: item.unit,
    unitCost: Number(item.actualUnitCost),
    lineTotal: Number(item.actualLineCost),
    priceSource: "Historical Purchase",
    referenceNumber: item.quotationNumber || item.purchaseOrderNumber,
    priceDate: item.quotationDate,
    ownerName: "PR import",
    lineStatus: item.purchaseOrderStatus || "Purchased",
    ageDays: ageInDays(item.quotationDate),
  }));
  quotationLines.forEach((item) => records.push({
    key: `sqline:${item.id}`,
    sourceKind: "Supplier Quotation",
    estimateId: 0,
    estimateNo: item.quotationNumber,
    estimateStatus: "Quoted",
    projectName: item.supplierReference || item.quotationNumber,
    customerName: "",
    itemId: item.id ?? 0,
    itemCode: item.itemCode,
    description: item.description,
    brand: item.brand,
    model: item.model,
    supplierId: item.supplierId,
    supplierName: item.supplierName,
    quantity: Number(item.qty),
    unit: item.unit,
    unitCost: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal ?? item.qty * item.unitPrice),
    priceSource: "Supplier Quotation",
    referenceNumber: item.quotationNumber,
    priceDate: item.receivedDate,
    ownerName: item.supplierName,
    lineStatus: "Quoted",
    ageDays: ageInDays(item.receivedDate),
  }));
  records.sort((a, b) => (b.priceDate ?? "").localeCompare(a.priceDate ?? "") || b.itemId - a.itemId);
  return {
    records,
    estimateCount: estimates.length,
    historicalCount: historical.length,
    quotationLineCount: quotationLines.length,
    skippedWorkspaces: settled.filter((item) => !item.ok).length,
  };
}

export async function loadSchedules(): Promise<ScheduleLoadState> {
  const projects = await loadAllProjects();
  const settled = await mapSettledLimited(projects, 5, (project) =>
    apiRequest<ProjectSchedule>(`/api/v1/projects/${project.id}/schedule`));
  return {
    projects,
    schedules: settled.flatMap((item) => item.ok ? [item.value] : []),
    skippedSchedules: settled.filter((item) => !item.ok).length,
  };
}

function usePrices(enabled: boolean) {
  const [state, setState] = useState<PriceLoadState>({ records: [], estimateCount: 0, historicalCount: 0, quotationLineCount: 0, skippedWorkspaces: 0 });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try { setState(await loadPriceRecords()); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { ...state, loading, error, load };
}

function useSchedules(enabled: boolean) {
  const [state, setState] = useState<ScheduleLoadState>({ projects: [], schedules: [], skippedSchedules: 0 });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try { setState(await loadSchedules()); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { ...state, loading, error, load };
}

function ProgressModal({ target, onClose, onSubmit, onConflict }: {
  target: ProgressTarget;
  onClose: () => void;
  onSubmit: (input: { percentComplete: number; status: string; actualStart: string | null; actualFinish: string | null; forecastFinish: string | null; remark: string }) => Promise<void>;
  onConflict?: () => Promise<void>;
}) {
  const [percent, setPercent] = useState(Number(target.percentComplete));
  const [status, setStatus] = useState(target.status);
  const [actualStart, setActualStart] = useState(target.actualStart ?? "");
  const [actualFinish, setActualFinish] = useState(target.actualFinish ?? "");
  const [forecastFinish, setForecastFinish] = useState(target.forecastFinish ?? "");
  const [remark, setRemark] = useState(target.remark ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changeStatus = (next: string) => {
    setStatus(next);
    if (next === "Not Started") {
      setPercent(0); setActualStart(""); setActualFinish("");
    } else if (next === "Done") {
      setPercent(100);
      setActualStart((value) => value || isoToday());
      setActualFinish((value) => value || isoToday());
    } else if (next === "In Progress") {
      setPercent((value) => value === 0 || value === 100 ? 1 : value);
      setActualStart((value) => value || isoToday());
      setActualFinish("");
    }
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await onSubmit({
        percentComplete: percent,
        status,
        actualStart: actualStart || null,
        actualFinish: actualFinish || null,
        forecastFinish: forecastFinish || null,
        remark: remark.trim(),
      });
      onClose();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError) && onConflict) {
        try {
          await onConflict();
          onClose();
        } catch (reloadError) {
          setError(toError(reloadError));
        }
        return;
      }
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  const invalid = percent < 0 || percent > 100
    || (status === "Done" && (percent !== 100 || !actualStart || !actualFinish))
    || (status === "Not Started" && (percent !== 0 || Boolean(actualStart) || Boolean(actualFinish)))
    || (status !== "Done" && percent === 100)
    || (status === "Blocked" && !remark.trim())
    || Boolean(actualFinish && (!actualStart || actualFinish < actualStart))
    || Boolean(forecastFinish && actualStart && forecastFinish < actualStart);
  return <Modal
    title={`Update ${target.wbs} · ${target.name}`}
    subtitle={`${target.projectNo} · บันทึกลง SQL Server และ audit log`}
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || invalid}>
        <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save progress"}
      </button>
    </>}
  >
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field"><span><LocalizedText text={"Status *"} /></span><select value={status} onChange={(event) => changeStatus(event.target.value)}><option value={"Not Started"}><LocalizedText text={"Not Started"} /></option><option value={"In Progress"}><LocalizedText text={"In Progress"} /></option><option value={"Blocked"}><LocalizedText text={"Blocked"} /></option><option value={"Done"}><LocalizedText text={"Done"} /></option></select></label>
      <label className="field"><span><LocalizedText text={"Percent complete *"} /></span><input type="number" min="0" max="100" step="1" value={percent} onChange={(event) => setPercent(Number(event.target.value))} /></label>
      <label className="field"><span><LocalizedText text={"Actual start"} /></span><input type="date" value={actualStart} onChange={(event) => setActualStart(event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Actual finish"} /></span><input type="date" min={actualStart || undefined} value={actualFinish} onChange={(event) => setActualFinish(event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Forecast finish"} /></span><input type="date" min={actualStart || undefined} value={forecastFinish} onChange={(event) => setForecastFinish(event.target.value)} /></label>
      <label className="field span-2"><span>{status === "Blocked" ? "Blocked reason *" : <LocalizedText text={"Remark"} />}</span><textarea maxLength={20000} value={remark} onChange={(event) => setRemark(event.target.value)} /></label>
    </div>
  </Modal>;
}

const workEffectiveFinish = (item: MyWorkItem) => item.actualFinish ?? item.forecastFinish ?? item.planFinish;
const workIsLate = (item: MyWorkItem) => item.status !== "Done" && isBeforeToday(workEffectiveFinish(item));
const workNeedsForecast = (item: MyWorkItem) => item.status !== "Done" && !item.actualFinish
  && isBeforeToday(item.planFinish) && !item.forecastFinish;
const workIsStale = (item: MyWorkItem) => item.status === "In Progress"
  && Date.now() - Date.parse(item.updatedAt) > 5 * 86_400_000;
const workNeedsUpdate = (item: MyWorkItem) => workIsLate(item) || item.status === "Blocked"
  || workNeedsForecast(item) || workIsStale(item);
const workUserNote = (value: string | null) => value?.trim().startsWith("Imported from Overall Project Plan") ? "" : value ?? "";
const daysFromToday = (value: string | null) => value
  ? Math.round((Date.parse(`${value.slice(0, 10)}T00:00:00Z`) - Date.parse(`${isoToday()}T00:00:00Z`)) / 86_400_000)
  : null;
const myWorkInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";

type MyWorkProgressInput = {
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  remark: string;
};

type MyWorkFilter = "attention" | "open" | "late" | "blocked" | "week" | "waiting" | "all";
type MyWorkSort = "priority" | "due" | "project";

export function ProductionMyWork({
  bootstrap,
  notify,
  openProjectSchedule,
  onMyWorkUrgentCountChange,
}: ProductionPlanningProps) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const hasProgressPermission = bootstrap.permissions.includes("schedule.progress");
  const hasReadPermission = bootstrap.permissions.includes("schedule.read");
  const allowed = hasProgressPermission && hasReadPermission;
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [updates, setUpdates] = useState<MyWorkUpdate[]>([]);
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"tasks" | "updates">("tasks");
  const [saving, setSaving] = useState<Set<number>>(() => new Set());
  const [requestFor, setRequestFor] = useState<MyWorkItem | null>(null);
  const [addingFor, setAddingFor] = useState<MyWorkItem | null>(null);
  const [editingFor, setEditingFor] = useState<MyWorkItem | null>(null);
  const [taskFilter, setTaskFilter] = useState<MyWorkFilter>("attention");
  const [taskSort, setTaskSort] = useState<MyWorkSort>("priority");
  const [taskSearch, setTaskSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setError("");
    try {
      const [loadedItems, loadedUpdates] = await Promise.all([
        apiRequest<MyWorkItem[]>("/api/v1/me/work"),
        apiRequest<MyWorkUpdate[]>("/api/v1/me/work/updates"),
      ]);
      setItems(loadedItems);
      setUpdates(loadedUpdates);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = useMemo(() => items.filter((item) => item.status !== "Done"), [items]);
  const actionableOpen = useMemo(() => open.filter((item) => item.canUpdate), [open]);
  const needsUpdate = useMemo(() => actionableOpen.filter(workNeedsUpdate), [actionableOpen]);
  const dueThisWeek = useMemo(() => actionableOpen.filter((item) => {
    const days = daysFromToday(workEffectiveFinish(item));
    return days !== null && days >= 0 && days <= 7;
  }), [actionableOpen]);
  const waiting = useMemo(() => items.filter((item) => item.pendingRequest), [items]);
  const projectOptions = useMemo(() => Array.from(new Map(items.map((item) => [String(item.projectId), `${item.projectNo} · ${item.projectName}`])).entries()), [items]);
  const visibleTasks = useMemo(() => {
    const needle = taskSearch.trim().toLocaleLowerCase();
    const selected = items.filter((item) => {
      if (projectFilter !== "all" && String(item.projectId) !== projectFilter) return false;
      if (needle && ![item.projectNo, item.projectName, item.wbs, item.name, item.phaseName ?? "", item.status]
        .some((value) => value.toLocaleLowerCase().includes(needle))) return false;
      if (taskFilter === "attention") return item.canUpdate && item.status !== "Done" && workNeedsUpdate(item);
      if (taskFilter === "open") return item.status !== "Done";
      if (taskFilter === "late") return item.canUpdate && workIsLate(item);
      if (taskFilter === "blocked") return item.canUpdate && item.status === "Blocked";
      if (taskFilter === "week") return item.canUpdate && item.status !== "Done" && (() => {
        const days = daysFromToday(workEffectiveFinish(item));
        return days !== null && days >= 0 && days <= 7;
      })();
      if (taskFilter === "waiting") return Boolean(item.pendingRequest);
      return true;
    });
    return selected.sort((left, right) => {
      if (taskSort === "project") return `${left.projectNo}:${left.wbs}`.localeCompare(`${right.projectNo}:${right.wbs}`, undefined, { numeric: true });
      const leftDue = workEffectiveFinish(left) ?? "9999-12-31";
      const rightDue = workEffectiveFinish(right) ?? "9999-12-31";
      if (taskSort === "due") return leftDue.localeCompare(rightDue);
      const urgency = (item: MyWorkItem) => item.status === "Blocked" ? 0 : workIsLate(item) ? 1 : workNeedsForecast(item) ? 2 : workIsStale(item) ? 3 : 4;
      return urgency(left) - urgency(right) || leftDue.localeCompare(rightDue);
    });
  }, [items, projectFilter, taskFilter, taskSearch, taskSort]);

  useEffect(() => {
    onMyWorkUrgentCountChange?.(needsUpdate.length);
  }, [needsUpdate.length, onMyWorkUrgentCountChange]);

  const saveProgress = useCallback(async (item: MyWorkItem, input: MyWorkProgressInput, message: string) => {
    setSaving((current) => new Set(current).add(item.taskId));
    try {
      await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/updates`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion, ...input }),
      });
      notify(message);
      await load();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError)) {
        notify(`${item.projectNo} · ${item.wbs} changed by another user; reloaded the latest data`);
        await load();
      } else {
        setError(toError(requestError));
      }
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(item.taskId);
        return next;
      });
    }
  }, [load, notify]);

  const patchProgress = useCallback((item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => {
    const input: MyWorkProgressInput = {
      percentComplete: Number(item.percentComplete),
      status: item.status,
      actualStart: item.actualStart,
      actualFinish: item.actualFinish,
      forecastFinish: item.forecastFinish,
      remark: item.remark ?? "",
      ...patch,
    };
    void saveProgress(item, input, message);
  }, [saveProgress]);

  if (!allowed) {
    const missing = [!hasProgressPermission ? "schedule.progress" : "", !hasReadPermission ? "schedule.read" : ""].filter(Boolean).join(" + ");
    return <><PageHeader eyebrow="PERSONAL WORKSPACE" title={uiText("My Work")} subtitle="งาน Schedule ที่มอบหมายให้ผู้ใช้ปัจจุบัน" /><PermissionNotice permission={missing} message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์อ่าน Schedule และอัปเดต Progress ให้บทบาทนี้" /></>;
  }

  return <>
    <PageHeader
      eyebrow="MY WORK"
      title={uiText("My Work")}
      subtitle="Everything assigned to you, across every project. Updates here are written to the live project schedule and SQL audit log."
      actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>}
    />
    <div className="info-strip my-work-guidance"><Icon name="lock" /><LocalizedText text={"You update the tasks assigned to you. Dates and scope belong to the project manager — use Request more days when you need a change."} /></div>
    <section className="my-work-kpis" aria-label={localizeCopy("Task overview")}>
      <MyWorkStat label="Needs update" value={needsUpdate.length} tone="navy" active={taskFilter === "attention"} onClick={() => setTaskFilter("attention")} />
      <MyWorkStat label="Late" value={actionableOpen.filter(workIsLate).length} tone="red" active={taskFilter === "late"} onClick={() => setTaskFilter("late")} />
      <MyWorkStat label="Blocked" value={actionableOpen.filter((item) => item.status === "Blocked").length} tone="amber" active={taskFilter === "blocked"} onClick={() => setTaskFilter("blocked")} />
      <MyWorkStat label="Due this week" value={dueThisWeek.length} tone="blue" active={taskFilter === "week"} onClick={() => setTaskFilter("week")} />
      <MyWorkStat label="Awaiting the PM" value={waiting.length} tone="violet" active={taskFilter === "waiting"} onClick={() => setTaskFilter("waiting")} />
    </section>
    <Tabs<"tasks" | "updates"> active={tab} onChange={setTab} tabs={[{ id: "tasks", label: "My tasks", count: open.length }, { id: "updates", label: "My updates" }]} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}

    {tab === "tasks" ? <>
      <Panel
        title={taskFilter === "attention" ? uiText("Needs your update") : `${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"}`}
        subtitle={taskFilter === "attention" ? "Late, blocked or quiet for too long — clear these first" : "Search, filter and update without leaving this workspace"}
        flush
      >
        <div className="my-work-toolbar">
          <SearchInput value={taskSearch} onChange={setTaskSearch} placeholder="Search project, WBS or task…" />
          <label className="select-field my-work-project-filter">
            <span className="sr-only"><LocalizedText text={"Project"} /></span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label={localizeCopy("Project")}>
              <option value="all"><LocalizedText text={"All projects"} /></option>
              {projectOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <Icon name="chevronDown" />
          </label>
          <label className="select-field my-work-sort">
            <span className="sr-only"><LocalizedText text={"Sort tasks"} /></span>
            <select value={taskSort} onChange={(event) => setTaskSort(event.target.value as MyWorkSort)} aria-label={localizeCopy("Sort tasks")}>
              <option value="priority"><LocalizedText text={"Priority first"} /></option>
              <option value="due"><LocalizedText text={"Due date"} /></option>
              <option value="project"><LocalizedText text={"Project & WBS"} /></option>
            </select>
            <Icon name="chevronDown" />
          </label>
        </div>
        <div className="my-work-filter-row" role="group" aria-label={localizeCopy("Task filters")}>
          {([
            ["attention", "Needs update", needsUpdate.length],
            ["open", "All open", open.length],
            ["late", "Late", actionableOpen.filter(workIsLate).length],
            ["blocked", "Blocked", actionableOpen.filter((item) => item.status === "Blocked").length],
            ["week", "Due this week", dueThisWeek.length],
            ["waiting", "Awaiting the PM", waiting.length],
            ["all", "All tasks", items.length],
          ] as [MyWorkFilter, string, number][]).map(([id, label, count]) => <button key={id} type="button" className={taskFilter === id ? "active" : ""} onClick={() => setTaskFilter(id)}>{label}<span>{count}</span></button>)}
          <span className="my-work-result-count"><LocalizedText text={"Showing"} /> <strong>{visibleTasks.length}</strong></span>
        </div>

        <div className="my-work-task-list">
          {visibleTasks.map((item) => <ProductionMyTaskRow
            key={item.taskId}
            item={item}
            busy={saving.has(item.taskId)}
            notify={notify}
            patchProgress={patchProgress}
            openProjectSchedule={openProjectSchedule}
            onEdit={() => setEditingFor(item)}
            onRequest={() => setRequestFor(item)}
            onAdd={() => setAddingFor(item)}
            onDelete={async () => {
              if (!window.confirm(`Delete your task “${item.name}”?`)) return;
              setSaving((current) => new Set(current).add(item.taskId));
              try {
                await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/details`, {
                  method: "DELETE",
                  body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion }),
                });
                notify(`${item.wbs} deleted`);
                await load();
              } catch (requestError) {
                setError(toError(requestError));
              } finally {
                setSaving((current) => { const next = new Set(current); next.delete(item.taskId); return next; });
              }
            }}
          />)}
          {!visibleTasks.length && !loading ? <EmptyState icon="search" title="No tasks match these filters" message="Try another project, status or search term." action={<button className="btn default" type="button" onClick={() => { setTaskSearch(""); setProjectFilter("all"); setTaskFilter("open"); }}><LocalizedText text={"Clear filters"} /></button>} /> : null}
        </div>
      </Panel>

      {!items.length && !loading ? <Panel title={uiText("My tasks")} flush><EmptyState icon="checkCircle" title={uiText("Nothing assigned to you yet")} message="When the project manager assigns you a task it appears here." /></Panel> : null}
      {loading && !items.length ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading your live schedule…"} /></div> : null}
    </> : null}

    {tab === "updates" ? <Panel title={uiText("My updates")} subtitle="What you reported, in order — loaded from the append-only SQL audit trail" flush>
      <div className="panel-body feed">
        {updates.slice(0, 40).map((entry) => <div className="feed-row" key={entry.id}>
          <span className="avatar sm">{myWorkInitials(bootstrap.user.name)}</span>
          <div>
            <p><strong>{entry.projectNo}{entry.wbs ? ` · ${entry.wbs}` : ""} {entry.taskName ?? entry.projectName}</strong></p>
            <p className="muted">
              {entry.field === "request" || entry.requestDays > 0
                ? `Requested ${entry.requestDays} more day${entry.requestDays === 1 ? "" : "s"} · ${entry.answer ?? "waiting"}`
                : `${entry.field}: ${entry.fromValue ?? "—"} → ${entry.toValue ?? "—"}`}
              {entry.comment ? ` · “${entry.comment}”` : ""}
              {entry.answerNote ? ` · PM: “${entry.answerNote}”` : ""}
            </p>
          </div>
          <span className="muted mono" style={{ fontSize: 11 }}>{dateTime(entry.occurredAt)}</span>
        </div>)}
        {!updates.length && !loading ? <p className="muted"><LocalizedText text={"No update yet."} /></p> : null}
      </div>
    </Panel> : null}

    {requestFor ? <ProductionRequestDaysModal item={requestFor} onClose={() => setRequestFor(null)} onSubmitted={async () => {
      setRequestFor(null);
      notify("Request sent to the project manager");
      await load();
    }} /> : null}
    {addingFor ? <ProductionAddDetailModal item={addingFor} onClose={() => setAddingFor(null)} onCreated={async () => {
      setAddingFor(null);
      notify("Your task was added to the live schedule");
      await load();
    }} /> : null}
    {editingFor ? <ProgressModal
      target={{ ...editingFor, remark: workUserNote(editingFor.remark) }}
      onClose={() => setEditingFor(null)}
      onConflict={load}
      onSubmit={async (input) => {
        await apiRequest(`/api/v1/schedule/tasks/${editingFor.taskId}/updates`, {
          method: "POST",
          body: JSON.stringify({ scheduleVersion: editingFor.scheduleVersion, rowVersion: editingFor.rowVersion, ...input }),
        });
        notify(`${editingFor.wbs} progress updated`);
        await load();
      }}
    /> : null}
  </>;
}

function MyWorkStat({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return <button className={`my-work-stat ${tone}${active ? " active" : ""}`} type="button" onClick={onClick} aria-pressed={active}>
    <span>{label}</span><strong>{value}</strong><small><LocalizedText text={"View tasks"} /></small>
  </button>;
}

function ProductionWorkControls({ item, busy, notify, patchProgress, onRequest }: {
  item: MyWorkItem;
  busy: boolean;
  notify: (message: string) => void;
  patchProgress: (item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => void;
  onRequest: () => void;
}) {
  const uiText = useUiText();
  const today = isoToday();
  const editable = item.canUpdate && !busy;
  const userNote = workUserNote(item.remark);
  return <div className="quick-controls">
    <div className="pct-strip" role="group" aria-label={uiText("Percent done")}>
      {[0, 25, 50, 75, 100].map((value) => <button key={value} type="button" disabled={!editable || (item.status === "Done" && value !== 100)} className={Number(item.percentComplete) === value ? "on" : undefined} onClick={() => {
        patchProgress(item, {
          percentComplete: value,
          ...(value === 100 ? { status: "Done", actualStart: item.actualStart ?? today, actualFinish: item.actualFinish ?? today } : {}),
          ...(value > 0 && value < 100 && item.status === "Not Started" ? { status: "In Progress", actualStart: item.actualStart ?? today } : {}),
        }, `${item.wbs} progress updated to ${value}%`);
      }}>{value}</button>)}
    </div>
    <select disabled={!editable} value={item.status} onChange={(event) => {
      const status = event.target.value;
      if (status === "Blocked" && !userNote.trim()) {
        notify("Enter the blocking reason in Note first, then choose Blocked");
        return;
      }
      patchProgress(item, {
        status,
        ...(status === "Not Started" ? { percentComplete: 0, actualStart: null, actualFinish: null } : {}),
        ...(status === "In Progress" ? { actualStart: item.actualStart ?? today, actualFinish: null, percentComplete: Number(item.percentComplete) === 100 ? 99 : Number(item.percentComplete) } : {}),
        ...(status === "Blocked" ? { actualStart: item.actualStart ?? today, actualFinish: null, percentComplete: Number(item.percentComplete) === 100 ? 99 : Number(item.percentComplete) } : {}),
        ...(status === "Done" ? { percentComplete: 100, actualStart: item.actualStart ?? today, actualFinish: item.actualFinish ?? today } : {}),
      }, `${item.wbs} status changed to ${status}`);
    }}>
      <option value={"Not Started"}><LocalizedText text={"Not Started"} /></option><option value={"In Progress"}><LocalizedText text={"In Progress"} /></option><option value={"Blocked"}><LocalizedText text={"Blocked"} /></option><option value={"Done"}><LocalizedText text={"Done"} /></option>
    </select>
    {!item.actualStart ? <button className="btn default sm" type="button" disabled={!editable} onClick={() => patchProgress(item, { actualStart: today, status: "In Progress" }, `${item.wbs} started today`)}><Icon name="play" /><LocalizedText text={"Start today"} /></button> : null}
    {item.status !== "Done" ? <button className="btn default sm" type="button" disabled={!editable} onClick={() => patchProgress(item, { actualStart: item.actualStart ?? today, actualFinish: today, percentComplete: 100, status: "Done" }, `${item.wbs} finished today`)}><Icon name="checkCircle" /><LocalizedText text={"Finish today"} /></button> : null}
    {workNeedsForecast(item) || workIsLate(item) ? <label className="forecast-inline"><span><LocalizedText text={"Forecast"} /></span><input type="date" disabled={!editable} value={item.forecastFinish ?? ""} className={workNeedsForecast(item) ? "needs-input" : undefined} min={item.actualStart ?? undefined} onChange={(event) => patchProgress(item, { forecastFinish: event.target.value || null }, `${item.wbs} forecast updated`)} /></label> : null}
    <input
      key={`${item.taskId}:${item.updatedAt}:note`}
      className="note-inline"
      disabled={!editable}
      placeholder={item.status === "Blocked" ? "What is blocking it? (required)" : "Note…"}
      defaultValue={userNote}
      onBlur={(event) => {
        const value = event.target.value.trim();
        if (value === userNote) return;
        if (item.status === "Blocked" && !value) { notify("Blocked tasks require a reason"); return; }
        patchProgress(item, { remark: value }, `${item.wbs} note updated`);
      }}
    />
    <button className="row-action" type="button" disabled={!editable || Boolean(item.pendingRequest)} title={item.pendingRequest ? "A request is already waiting for the PM" : "Request more days"} onClick={onRequest}><Icon name="clock" /></button>
  </div>;
}

function ProductionMyTaskRow({ item, busy, notify, patchProgress, openProjectSchedule, onEdit, onRequest, onAdd, onDelete }: {
  item: MyWorkItem;
  busy: boolean;
  notify: (message: string) => void;
  patchProgress: (item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => void;
  openProjectSchedule?: (projectId: number) => void;
  onEdit: () => void;
  onRequest: () => void;
  onAdd: () => void;
  onDelete: () => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const late = workIsLate(item);
  const needsForecast = workNeedsForecast(item);
  const dueDays = daysFromToday(workEffectiveFinish(item));
  const attention = item.status === "Blocked" ? "Blocked" : late ? "Late" : needsForecast ? "Forecast needed" : workIsStale(item) ? "Update due" : null;
  const timing = item.status === "Done" ? "Completed"
    : dueDays === null ? "No due date"
      : dueDays < 0 ? `${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? "" : "s"} late`
        : dueDays === 0 ? "Due today" : dueDays <= 7 ? `Due in ${dueDays} days` : `Due ${date(workEffectiveFinish(item))}`;
  return <article className={`my-task-card${late ? " late" : ""}${item.status === "Blocked" ? " blocked" : ""}`}>
    <div className="my-task-card-main">
      <div className="my-task-identity">
        <div className="my-task-kicker">
          {attention ? <Badge>{attention}</Badge> : <Badge>{item.status}</Badge>}
          <button className="my-task-project" type="button" disabled={!openProjectSchedule} onClick={() => openProjectSchedule?.(item.projectId)}>{item.projectNo}</button>
          <span className="mono">WBS {item.wbs}</span>
          {item.isOwnDetail ? <Pill tone="blue"><LocalizedText text={"own"} /></Pill> : null}
          {item.isMilestone ? <Pill tone="violet"><LocalizedText text={"◆ Milestone"} /></Pill> : null}
        </div>
        <h3>{item.name}</h3>
        <div className="my-task-meta">
          <span><Icon name="calendar" />{date(item.planStart)} → {date(item.planFinish)}</span>
          <span>{item.workDays} <LocalizedText text={"work days"} /></span>
          <span><Icon name="layers" />{item.phaseWbs ? `${item.phaseWbs} · ` : ""}{item.phaseName ?? "Other work"}</span>
          <span><LocalizedText text={"PM:"} /> {item.managerName}</span>
        </div>
      </div>
      <div className="my-task-progress">
        <ProgressCell value={Number(item.percentComplete)} />
        <span className={late ? "late-text" : ""}>{timing}</span>
      </div>
    </div>

    {item.pendingRequest ? <div className="my-task-request"><Icon name="clock" /><strong><LocalizedText text={"Awaiting the PM"} /></strong><span>{item.pendingRequest.requestDays} <LocalizedText text={"more days requested"} />{item.pendingRequest.comment ? ` · ${item.pendingRequest.comment}` : ""}</span></div> : null}
    {needsForecast ? <div className="my-task-alert"><Icon name="alertTriangle" /><span><LocalizedText text={"This was due"} /> {date(item.planFinish)}<LocalizedText text={". Add a forecast date in Update details."} /></span></div> : null}

    <div className="my-task-actions">
      {item.canUpdate && !item.actualStart ? <button className="btn default sm" type="button" disabled={busy} onClick={() => patchProgress(item, { actualStart: isoToday(), status: "In Progress" }, `${item.wbs} started today`)}><Icon name="play" /><LocalizedText text={"Start today"} /></button> : null}
      {item.canUpdate ? <button className="btn primary sm" type="button" disabled={busy} onClick={onEdit}><Icon name="edit" /><LocalizedText text={"Update details"} /></button> : null}
      {item.canUpdate && item.status !== "Done" ? <button className="btn default sm" type="button" disabled={busy} onClick={() => patchProgress(item, { actualStart: item.actualStart ?? isoToday(), actualFinish: isoToday(), percentComplete: 100, status: "Done" }, `${item.wbs} finished today`)}><Icon name="checkCircle" /><LocalizedText text={"Finish today"} /></button> : null}
      {item.canUpdate ? <button className="btn ghost sm" type="button" disabled={busy || Boolean(item.pendingRequest)} onClick={onRequest}><Icon name="clock" /><LocalizedText text={"Request more days"} /></button> : null}
      <button className="btn ghost sm" type="button" disabled={!openProjectSchedule} onClick={() => openProjectSchedule?.(item.projectId)}><Icon name="calendar" /><LocalizedText text={"Whole plan"} /></button>
      <span className="spacer" />
      {item.canAddDetail ? <button className="link-btn" type="button" disabled={busy} title={localizeCopy("Add a private detail task")} onClick={onAdd}><Icon name="plus" /><LocalizedText text={"Add my task"} /></button> : null}
      {item.canDeleteDetail ? <button className="link-btn danger-text" type="button" disabled={busy} title={localizeCopy("Delete my task")} onClick={() => { void onDelete(); }}><Icon name="trash" /><LocalizedText text={"Delete my task"} /></button> : null}
    </div>

    {item.canUpdate ? <details className="my-task-quick-update">
      <summary><Icon name="settings" /><LocalizedText text={"Quick update"} /></summary>
      <ProductionWorkControls item={item} busy={busy} notify={notify} patchProgress={patchProgress} onRequest={onRequest} />
    </details> : null}
  </article>;
}

function ProductionRequestDaysModal({ item, onClose, onSubmitted }: {
  item: MyWorkItem;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const uiText = useUiText();
  const [days, setDays] = useState(2);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/day-requests`, { method: "POST", body: JSON.stringify({ requestDays: days, comment: comment.trim() }) });
      await onSubmitted();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={uiText("Request more days")} subtitle={`${item.wbs} ${item.name} · plan ${date(item.planStart)} → ${date(item.planFinish)}`} onClose={onClose} footer={<>
    <span className="muted"><LocalizedText text={"The dates change only when the PM accepts."} /></span><span className="spacer" />
    <button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={busy || days < 1 || !comment.trim()} onClick={() => { void submit(); }}><Icon name="send" />{busy ? "Sending…" : <LocalizedText text={"Send request"} />}</button>
  </>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid"><Field label="Extra days needed"><input className="num" type="number" min="1" max="3650" value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value)))} /></Field><Field label="Why? (required — the PM decides with this)" span={3}><input maxLength={20000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={uiText("e.g. rack anchor rework — re-drilling takes 3 days")} /></Field></div>
  </Modal>;
}

function ProductionAddDetailModal({ item, onClose, onCreated }: {
  item: MyWorkItem;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const uiText = useUiText();
  const [name, setName] = useState("");
  const planSpan = item.planStart && item.planFinish
    ? Math.round((Date.parse(`${item.planFinish.slice(0, 10)}T00:00:00Z`) - Date.parse(`${item.planStart.slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1
    : 1;
  const planDays = Number.isFinite(planSpan) ? Math.max(1, planSpan) : 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/details`, { method: "POST", body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion, name: name.trim(), planDays }) });
      await onCreated();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={uiText("Add my task")} subtitle={`${item.projectNo} · inside ${item.wbs} ${item.name} · internal visibility`} onClose={onClose} footer={<><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !name.trim() || planDays < 1} onClick={() => { void submit(); }}><Icon name="plus" />{busy ? "Adding…" : <LocalizedText text={"Add task"} />}</button></>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid"><Field label="What will you do inside this task?" span={3}><input maxLength={500} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Days (fixed to the parent plan)"><input className="num" type="number" value={planDays} readOnly /></Field></div>
  </Modal>;
}

function CreateScheduleTaskModal({ bootstrap, schedule, onClose, onCreated, onConflict }: {
  bootstrap: BootstrapData;
  schedule: ProjectSchedule;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onConflict?: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"phase" | "task">("task");
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [planStart, setPlanStart] = useState(isoToday());
  const [planDays, setPlanDays] = useState(1);
  const [visibility, setVisibility] = useState("Internal");
  const [picUserId, setPicUserId] = useState("");
  const [picExternal, setPicExternal] = useState("");
  const [planManDays, setPlanManDays] = useState(0);
  const [milestone, setMilestone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phases = flattenTasks(schedule.tasks).filter((task) => task.kind === "phase");
  const allRows = flattenTasks(schedule.tasks);
  const knownEligibleIds = new Set<number>([schedule.managerId, bootstrap.user.id]);
  allRows.forEach((task) => task.pics.forEach((pic) => knownEligibleIds.add(pic.id)));
  const eligibleMembers = bootstrap.team.filter((member) => knownEligibleIds.has(member.id));
  const selectedParent = parentId ? Number(parentId) : null;
  const sortOrder = Math.max(0, ...allRows.filter((task) => task.parentId === selectedParent).map((task) => task.sortOrder)) + 10;
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/projects/${schedule.projectId}/schedule/tasks`, {
        method: "POST",
        body: JSON.stringify(kind === "phase" ? {
          scheduleVersion: schedule.scheduleVersion,
          parentId: null,
          sortOrder,
          kind: "phase",
          name: name.trim(),
          isMilestone: false,
          visibility,
          planStart: null,
          planDays: 1,
          startMode: "manual",
          predecessorId: null,
          lagDays: 0,
          picUserIds: [],
          picExternal: "",
          planManDays: 0,
        } : {
          scheduleVersion: schedule.scheduleVersion,
          parentId: selectedParent,
          sortOrder,
          kind: "task",
          name: name.trim(),
          isMilestone: milestone,
          visibility,
          planStart,
          planDays: milestone ? 1 : planDays,
          startMode: "manual",
          predecessorId: null,
          lagDays: 0,
          picUserIds: picUserId ? [Number(picUserId)] : [],
          picExternal: picExternal.trim(),
          planManDays,
        }),
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError) && onConflict) {
        try {
          await onConflict();
          onClose();
        } catch (reloadError) {
          setError(toError(reloadError));
        }
        return;
      }
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="Add schedule row" subtitle={`${schedule.projectNo} · บันทึกแผนลงฐานข้อมูลจริง`} size="lg" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={busy || !name.trim() || (kind === "task" && (!planStart || planDays < 1))} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create row"}</button>
  </>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field"><span><LocalizedText text={"Row kind *"} /></span><select value={kind} onChange={(event) => { const value = event.target.value as "phase" | "task"; setKind(value); if (value === "phase") setParentId(""); }}><option value="task"><LocalizedText text={"Task"} /></option><option value="phase"><LocalizedText text={"Phase (roll-up)"} /></option></select></label>
      <label className="field"><span><LocalizedText text={"Visibility *"} /></span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value={"Internal"}><LocalizedText text={"Internal"} /></option><option value={"Customer"}><LocalizedText text={"Customer"} /></option></select></label>
      <label className="field span-2"><span><LocalizedText text={"Name *"} /></span><input maxLength={500} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {kind === "task" ? <>
        <label className="field"><span><LocalizedText text={"Parent phase"} /></span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value=""><LocalizedText text={"Top-level task"} /></option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.wbs} <LocalizedText text={"·"} /> {phase.name}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Plan start *"} /></span><input type="date" value={planStart} onChange={(event) => setPlanStart(event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Plan days *"} /></span><input type="number" min="1" max="3650" value={milestone ? 1 : planDays} disabled={milestone} onChange={(event) => setPlanDays(Number(event.target.value))} /></label>
        <label className="field"><span><LocalizedText text={"Plan man-days"} /></span><input type="number" min="0" max="1000000" step="0.25" value={planManDays} onChange={(event) => setPlanManDays(Number(event.target.value))} /></label>
        <label className="field"><span><LocalizedText text={"PIC (known project member)"} /></span><select value={picUserId} onChange={(event) => setPicUserId(event.target.value)}><option value=""><LocalizedText text={"Unassigned"} /></option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name} <LocalizedText text={"·"} /> {member.department}</option>)}</select><small>{eligibleMembers.length ? "แสดงเฉพาะ Project Manager, ผู้ใช้ปัจจุบัน และ PIC ที่พบใน Schedule; API จะตรวจสอบสมาชิกอีกครั้ง" : "ยังไม่พบผู้ใช้ที่ยืนยันได้จาก Schedule นี้ จึงบันทึกเป็น Unassigned เท่านั้น"}</small></label>
        <label className="field"><span><LocalizedText text={"External PIC"} /></span><input maxLength={300} value={picExternal} onChange={(event) => setPicExternal(event.target.value)} /></label>
        <label className="checkbox-row span-2"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /><LocalizedText text={"Milestone (1 day)"} /></label>
      </> : <div className="callout warning span-2"><Icon name="alertCircle" /><span><strong><LocalizedText text={"Phase เป็นแถวสรุป"} /></strong><small><LocalizedText text={"วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase"} /></small></span></div>}
    </div>
  </Modal>;
}

function BaselineModal({ schedule, onClose, onCreated, onConflict }: {
  schedule: ProjectSchedule;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onConflict?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(`Baseline ${schedule.baselines.length + 1}`);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/projects/${schedule.projectId}/schedule/baseline`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion: schedule.scheduleVersion, label: label.trim(), reason: reason.trim() }),
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError) && onConflict) {
        try {
          await onConflict();
          onClose();
        } catch (reloadError) {
          setError(toError(reloadError));
        }
        return;
      }
      setError(toError(requestError));
    }
    finally { setBusy(false); }
  };
  return <Modal title="Create schedule baseline" subtitle="Freeze วันที่แผนปัจจุบันเป็น revision ใหม่ใน SQL Server" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || !label.trim() || !reason.trim()}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create baseline"}</button>
  </>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field span-2"><span><LocalizedText text={"Label *"} /></span><input maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label className="field span-2"><span><LocalizedText text={"Reason *"} /></span><textarea maxLength={20000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
  </Modal>;
}

function ScheduleDayRequestAnswerModal({ request, schedule, task, onClose, onAnswered }: {
  request: ScheduleUpdate;
  schedule: ProjectSchedule;
  task: ScheduleTask | null;
  onClose: () => void;
  onAnswered: (answer: "Accepted" | "Rejected") => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const [answer, setAnswer] = useState<"Accepted" | "Rejected">("Accepted");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!task) { setError("The requested task is no longer available. Reload the schedule."); return; }
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/schedule/day-requests/${request.id}/answer`, {
        method: "POST",
        body: JSON.stringify({
          scheduleVersion: schedule.scheduleVersion,
          rowVersion: task.rowVersion,
          answer,
          note: note.trim(),
        }),
      });
      await onAnswered(answer);
      onClose();
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  const taskLabel = task ? `${task.wbs} ${task.name}` : `Task ${request.taskId ?? "—"}`;
  return <Modal
    title="Review request for more days"
    subtitle={`${schedule.projectNo} · ${taskLabel}`}
    onClose={onClose}
    footer={<><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className={answer === "Accepted" ? "btn success" : "btn danger"} type="button" disabled={busy || !task || !note.trim()} onClick={() => { void submit(); }}><Icon name={answer === "Accepted" ? "check" : "x"} />{busy ? <LocalizedText text={"Saving…"} /> : answer}</button></>}
  >
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="request-impact"><Icon name="clock" /><span>{request.requestDays} <LocalizedText text={"calendar day"} />{request.requestDays === 1 ? "" : "s"} <LocalizedText text={"requested. Accepting extends the task duration and recalculates the project schedule."} /></span></div>
    <div className="form-grid two">
      <Field label="Decision"><select value={answer} onChange={(event) => setAnswer(event.target.value as "Accepted" | "Rejected")}><option value={"Accepted"}><LocalizedText text={"Accepted"} /></option><option value={"Rejected"}><LocalizedText text={"Rejected"} /></option></select></Field>
      <Field label="PM note (required)" span={2}><textarea maxLength={20000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={localizeCopy("Explain the decision for the team and audit trail")} /></Field>
    </div>
  </Modal>;
}

export function ProductionProjectSchedule({ bootstrap, notify, preferredProjectId }: ProductionPlanningProps) {
  const uiText = useUiText();
  const allowed = bootstrap.permissions.includes("schedule.read");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(allowed);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [progressTask, setProgressTask] = useState<ScheduleTask | null>(null);
  const [drawingTask, setDrawingTask] = useState<{projectId:number;taskId:number} | null>(null);
  const [answerRequest, setAnswerRequest] = useState<ScheduleUpdate | null>(null);
  const scheduleRequestId = useRef(0);
  const loadProjects = useCallback(async () => {
    if (!allowed) return;
    setLoadingProjects(true); setError("");
    try {
      const loaded = await loadAllProjects();
      setProjects(loaded);
      setSelectedId((current) => {
        if (preferredProjectId && loaded.some((project) => project.id === preferredProjectId)) return preferredProjectId;
        return current && loaded.some((project) => project.id === current) ? current : loaded[0]?.id ?? null;
      });
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoadingProjects(false); }
  }, [allowed, preferredProjectId]);
  const loadSchedule = useCallback(async () => {
    const requestId = ++scheduleRequestId.current;
    setCreateOpen(false);
    setBaselineOpen(false);
    setProgressTask(null);
    setAnswerRequest(null);
    setSchedule(null);
    if (!selectedId) { setLoadingSchedule(false); return; }
    setLoadingSchedule(true); setError("");
    try {
      const loaded = await apiRequest<ProjectSchedule>(`/api/v1/projects/${selectedId}/schedule`);
      if (scheduleRequestId.current === requestId && loaded.projectId === selectedId) setSchedule(loaded);
    }
    catch (requestError) {
      if (scheduleRequestId.current === requestId) setError(toError(requestError));
    }
    finally {
      if (scheduleRequestId.current === requestId) setLoadingSchedule(false);
    }
  }, [selectedId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProjects(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSchedule(); }, 0);
    return () => {
      window.clearTimeout(timer);
      scheduleRequestId.current += 1;
    };
  }, [loadSchedule]);
  if (!allowed) return <><PageHeader eyebrow="PROJECT CONTROL" title={uiText("Project Schedule")} subtitle="แผนงานและความคืบหน้าจากฐานข้อมูลจริง" /><PermissionNotice permission="schedule.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Schedule Read ให้บทบาทนี้" /></>;
  const activeSchedule = schedule?.projectId === selectedId && !loadingSchedule ? schedule : null;
  const rows = activeSchedule ? flattenTasks(activeSchedule.tasks) : [];
  const canPlan = Boolean(activeSchedule?.canPlan && bootstrap.permissions.includes("schedule.plan"));
  const pendingDayRequests = activeSchedule?.recentUpdates.filter((update) => update.field === "request" && update.requestDays > 0 && !update.answer) ?? [];
  return <>
    <PageHeader eyebrow="PROJECT CONTROL" title={uiText("Project Schedule")} subtitle="จัดทำแผน อัปเดตความคืบหน้า และเก็บ Baseline พร้อม concurrency control" actions={<button className="btn ghost" type="button" disabled={loadingProjects || loadingSchedule} onClick={() => { void Promise.all([loadProjects(), loadSchedule()]); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
    <Toolbar>
      <label className="select-field" style={{ minWidth: 320 }}><select style={{ maxWidth: 520, width: "100%" }} value={selectedId ?? ""} onChange={(event) => {
        const nextId = event.target.value ? Number(event.target.value) : null;
        scheduleRequestId.current += 1;
        setCreateOpen(false);
        setBaselineOpen(false);
        setProgressTask(null);
        setAnswerRequest(null);
        setSchedule(null);
        setLoadingSchedule(Boolean(nextId));
        setSelectedId(nextId);
      }} aria-label={uiText("Project")}><option value=""><LocalizedText text={"Select project…"} /></option>{projects.map((project) => <option key={project.id} value={project.id}>{project.number} <LocalizedText text={"·"} /> {project.name}</option>)}</select><Icon name="chevronDown" /></label>
      <span className="spacer" />
      {canPlan ? <button className="btn default" type="button" disabled={!rows.length} onClick={() => setBaselineOpen(true)}><Icon name="gitBranch" /><LocalizedText text={"Create baseline"} /></button> : null}
      {canPlan ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add schedule row"} /></button> : null}
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void (selectedId ? loadSchedule() : loadProjects()); }} /> : null}
    {activeSchedule ? <>
      <div className="kpi-grid four">
        <KpiCard label="Plan period" value={activeSchedule.summary.planStart ? `${date(activeSchedule.summary.planStart)} – ${date(activeSchedule.summary.planFinish)}` : "Not planned"} note={`${activeSchedule.summary.workDays} work days`} tone="blue" icon="calendar" />
        <KpiCard label="Progress" value={`${number(activeSchedule.summary.percentComplete)}%`} note={`${activeSchedule.summary.doneCount}/${activeSchedule.summary.taskCount} done`} tone="green" icon="trendingUp" />
        <KpiCard label="Blocked" value={activeSchedule.summary.blockedCount} note="leaf tasks" tone={activeSchedule.summary.blockedCount ? "red" : "green"} icon="alertTriangle" />
        <KpiCard label="Baseline" value={activeSchedule.latestBaseline ? `R${activeSchedule.latestBaseline.revision}` : "None"} note={activeSchedule.latestBaseline?.label ?? "ยังไม่มี baseline"} tone="violet" icon="gitBranch" />
      </div>
      <Panel title={`${activeSchedule.projectNo} · ${activeSchedule.projectName}`} subtitle={`${rows.length} schedule rows · ${activeSchedule.projectStatus}`} flush>
        {rows.length ? <div className="table-wrap"><table><thead><tr><th>WBS</th><th><LocalizedText text={"Task"} /></th><th><LocalizedText text={"Visibility"} /></th><th><LocalizedText text={"Plan"} /></th><th><LocalizedText text={"Work days"} /></th><th><LocalizedText text={"PIC"} /></th><th><LocalizedText text={"Effort"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Status"} /></th><th /></tr></thead><tbody>{rows.map((task) => {
          const canProgress = activeSchedule.canUpdateProgress
            && bootstrap.permissions.includes("schedule.progress")
            && task.kind !== "phase"
            && task.children.length === 0
            && task.pics.some((pic) => pic.id === bootstrap.user.id);
          return <tr key={task.id}>
            <td><strong className="mono">{task.wbs}</strong></td>
            <td style={{ paddingLeft: 10 + task.depth * 18 }}><div className="cell-primary"><strong>{task.name}</strong><span>{task.kind}{task.isMilestone ? " · Milestone" : ""} <LocalizedText text={"·"} /> {task.origin}</span></div></td>
            <td><Badge tone={task.visibility === "Customer" ? "blue" : "slate"}>{task.visibility}</Badge></td>
            <td>{date(task.planStart)} – {date(task.planFinish)}</td>
            <td className="num">{task.workDays}</td>
            <td>{task.pics.length ? task.pics.map((pic) => pic.name).join(", ") : task.picExternal || "—"}</td>
            <td className="num">{number(task.planManDays)} <LocalizedText text={"MD"} /></td>
            <td style={{ minWidth: 120 }}><ProgressCell value={Number(task.percentComplete)} /></td>
            <td><Badge>{task.status}</Badge></td>
            <td>{canProgress ? <button className="btn sm default" type="button" onClick={() => setProgressTask(task)}><Icon name="edit" /><LocalizedText text={"Update"} /></button> : null}
              {canProgress && bootstrap.permissions.includes("signing.request") ? <button className="btn sm default" type="button" onClick={() => setDrawingTask({projectId:activeSchedule.projectId,taskId:task.id})}><Icon name="upload" /><LocalizedText text={"Import Drawing"} /></button> : null}
            </td>
          </tr>;
        })}</tbody></table></div> : loadingSchedule ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="calendar" title={uiText("This project has no schedule yet")} message={canPlan ? "สร้าง Phase หรือ Task แรกเพื่อเริ่มแผนโครงการ" : "Project Manager หรือ Engineering Manager เป็นผู้สร้างแผน"} />}
      </Panel>
      {canPlan && pendingDayRequests.length ? <Panel title="Requests waiting for the PM" subtitle="Accepting extends the task plan; rejecting leaves the dates unchanged" flush><div className="panel-body">
        {pendingDayRequests.map((request) => {
          const requestedTask = request.taskId ? rows.find((task) => task.id === request.taskId) : null;
          return <div className="request-row" key={`pending:${request.id}`}><div className="request-head"><Badge tone="amber">+{request.requestDays} {"days"}</Badge><strong>{requestedTask ? `${requestedTask.wbs} · ${requestedTask.name}` : `Task ${request.taskId ?? "—"}`}</strong><span className="muted"><LocalizedText text={"requested by"} /> {request.actor.name} <LocalizedText text={"·"} /> {dateTime(request.occurredAt)}</span></div><p className="muted">{request.comment || "No reason provided"}</p><button className="btn primary sm" type="button" disabled={!requestedTask} onClick={() => setAnswerRequest(request)}><Icon name="checkCircle" /><LocalizedText text={"Review request"} /></button></div>;
        })}
      </div></Panel> : null}
      {activeSchedule.recentUpdates.length ? <Panel title="Recent schedule activity" subtitle="100 รายการล่าสุดจาก audit trail ของ Schedule" flush><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"When"} /></th><th><LocalizedText text={"Actor"} /></th><th><LocalizedText text={"Task"} /></th><th><LocalizedText text={"Field"} /></th><th><LocalizedText text={"Change"} /></th><th><LocalizedText text={"Comment"} /></th><th><LocalizedText text={"Decision"} /></th></tr></thead><tbody>{activeSchedule.recentUpdates.slice(0, 20).map((update) => {
        const requestedTask = update.taskId ? rows.find((task) => task.id === update.taskId) : null;
        const pendingRequest = update.field === "request" && update.requestDays > 0 && !update.answer;
        return <tr key={update.id}>
          <td>{dateTime(update.occurredAt)}</td><td>{update.actor.name}</td><td>{requestedTask ? `${requestedTask.wbs} · ${requestedTask.name}` : update.taskId ?? "Schedule"}</td><td><Badge>{update.field}</Badge></td>
          <td className="wrap">{update.requestDays > 0 ? `+${update.requestDays} days requested` : `${update.fromValue ?? "—"} → ${update.toValue ?? "—"}`}</td>
          <td className="wrap">{update.comment || "—"}</td>
          <td>{pendingRequest && requestedTask && canPlan ? <button className="btn sm primary" type="button" onClick={() => setAnswerRequest(update)}><Icon name="checkCircle" /><LocalizedText text={"Review"} /></button> : update.answer ? <div className="cell-primary"><Badge tone={update.answer === "Accepted" ? "green" : "red"}>{update.answer}</Badge><span>{update.answerBy?.name ?? "PM"}{update.answerNote ? ` · ${update.answerNote}` : ""}</span></div> : "—"}</td>
        </tr>;
      })}</tbody></table></div></Panel> : null}
    </> : loadingProjects || loadingSchedule ? <Panel><div className="empty"><span className="spinner" /><LocalizedText text={"Loading schedule…"} /></div></Panel> : <Panel><EmptyState icon="folder" title="No accessible project" message="สร้าง Project หรือขอสิทธิ์เข้าถึงโครงการก่อนเปิด Schedule" /></Panel>}
    {createOpen && activeSchedule ? <CreateScheduleTaskModal bootstrap={bootstrap} schedule={activeSchedule} onClose={() => setCreateOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} schedule row created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {drawingTask ? <CreateSignableDocumentModal initialProjectId={drawingTask.projectId} initialTaskId={drawingTask.taskId} onClose={() => setDrawingTask(null)} onCreated={message => {setDrawingTask(null);notify(`${message} · Open Signed Documents to request approval`);}} /> : null}
    {baselineOpen && activeSchedule ? <BaselineModal schedule={activeSchedule} onClose={() => setBaselineOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} baseline created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {progressTask && activeSchedule ? <ProgressModal target={{ taskId: progressTask.id, projectNo: activeSchedule.projectNo, wbs: progressTask.wbs, name: progressTask.name, percentComplete: Number(progressTask.percentComplete), status: progressTask.status, actualStart: progressTask.actualStart, actualFinish: progressTask.actualFinish, forecastFinish: progressTask.forecastFinish, remark: progressTask.remark }} onClose={() => setProgressTask(null)} onSubmit={async (input) => {
      await apiRequest(`/api/v1/schedule/tasks/${progressTask.id}/updates`, { method: "POST", body: JSON.stringify({ scheduleVersion: activeSchedule.scheduleVersion, rowVersion: progressTask.rowVersion, ...input }) });
      notify(`${activeSchedule.projectNo} · ${progressTask.wbs} progress updated`);
      await loadSchedule();
    }} onConflict={async () => { notify(`${activeSchedule.projectNo} · ${progressTask.wbs} changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {answerRequest && activeSchedule ? <ScheduleDayRequestAnswerModal
      request={answerRequest}
      schedule={activeSchedule}
      task={rows.find((task) => task.id === answerRequest.taskId) ?? null}
      onClose={() => setAnswerRequest(null)}
      onAnswered={async (answer) => { notify(`${activeSchedule.projectNo} day request ${answer.toLowerCase()}`); await loadSchedule(); }}
    /> : null}
  </>;
}

export function ProductionResourcePlan({ bootstrap }: ProductionPlanningProps) {
  const uiText = useUiText();
  const hasScheduleRead = bootstrap.permissions.includes("schedule.read");
  const hasProjectRead = bootstrap.permissions.includes("project.read");
  const allowed = hasScheduleRead && hasProjectRead;
  const { projects, schedules, skippedSchedules, loading, error, load } = useSchedules(allowed);
  if (!allowed) {
    const missing = [!hasScheduleRead ? "schedule.read" : "", !hasProjectRead ? "project.read" : ""].filter(Boolean).join(" + ");
    return <><PageHeader eyebrow="CAPACITY VISIBILITY" title={uiText("Resource Plan")} subtitle="ภาระงานจริงจาก Project Schedule" /><PermissionNotice permission={missing} message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์อ่าน Project และ Schedule ให้บทบาทนี้" /></>;
  }
  const allLeaves = schedules.flatMap((schedule) => leafTasks(schedule).map((task) => ({ schedule, task })));
  const resourceRows = bootstrap.team.map((member) => {
    const assigned = allLeaves.filter(({ task }) => task.pics.some((pic) => pic.id === member.id));
    const effort = assigned.reduce((sum, { task }) => sum + Number(task.planManDays) / Math.max(1, task.pics.length), 0);
    const active = assigned.filter(({ task }) => task.status !== "Done");
    const overdue = active.filter(({ task }) => isBeforeToday(task.planFinish));
    const nextFinish = active.map(({ task }) => task.planFinish).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    return { member, assigned: assigned.length, active: active.length, overdue: overdue.length, effort, nextFinish };
  }).sort((a, b) => b.effort - a.effort || b.active - a.active || a.member.name.localeCompare(b.member.name));
  const unassigned = allLeaves.filter(({ task }) => task.pics.length === 0).length;
  const plannedEffort = allLeaves.reduce((sum, { task }) => sum + Number(task.planManDays), 0);
  return <>
    <PageHeader eyebrow="CAPACITY VISIBILITY" title={uiText("Resource Plan")} subtitle="สรุป PIC และ Planned man-days จาก Schedule จริง; ระบบไม่สมมติ Capacity ที่ยังไม่มี Master data" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
    <div className="kpi-grid four">
      <KpiCard label="Projects loaded" value={schedules.length} note={`${projects.length} projects returned by portfolio`} tone="blue" icon="folder" />
      <KpiCard label="Planned tasks" value={allLeaves.length} note="leaf schedule tasks" tone="violet" icon="checkCircle" />
      <KpiCard label="Planned effort" value={`${number(plannedEffort)} MD`} note="ยังไม่หักวันหยุดรายบุคคล" tone="green" icon="users" />
      <KpiCard label="Unassigned" value={unassigned} note="tasks without internal PIC" tone={unassigned ? "amber" : "green"} icon="alertTriangle" />
    </div>
    {skippedSchedules ? <div className="callout warning"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"บางโครงการไม่ถูกนำมารวม"} /></strong><small><LocalizedText text={"โหลด Schedule ไม่สำเร็จหรือไม่มีสิทธิ์"} /> {skippedSchedules} <LocalizedText text={"โครงการจาก"} /> {projects.length} <LocalizedText text={"โครงการ"} /></small></span></div> : null}
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <div className="grid-main">
      <Panel title={`${resourceRows.length} active team members`} subtitle="Effort แบ่งเท่ากันเมื่อ Task มี PIC หลายคน" flush>
        {resourceRows.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Team member"} /></th><th><LocalizedText text={"Role / Department"} /></th><th><LocalizedText text={"Assigned"} /></th><th><LocalizedText text={"Active"} /></th><th><LocalizedText text={"Overdue"} /></th><th><LocalizedText text={"Planned effort"} /></th><th><LocalizedText text={"Next finish"} /></th></tr></thead><tbody>{resourceRows.map(({ member, assigned, active, overdue, effort, nextFinish }) => <tr key={member.id}><td><div className="cell-primary"><strong>{member.name}</strong><span>{member.email}</span></div></td><td><div className="cell-primary"><strong>{member.role}</strong><span>{member.department} <LocalizedText text={"·"} /> {member.level || "—"}</span></div></td><td className="num">{assigned}</td><td className="num">{active}</td><td className="num">{overdue ? <Badge tone="red">{overdue}</Badge> : "0"}</td><td className="num"><strong>{number(effort)} <LocalizedText text={"MD"} /></strong></td><td>{date(nextFinish)}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="users" title="No active team member" message="Provision users before assigning schedule work" />}
      </Panel>
      <Panel title="Schedule coverage" subtitle="ข้อมูลที่ใช้คำนวณ Resource Plan" flush>
        {schedules.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Tasks"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Plan finish"} /></th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.projectId}><td><div className="cell-primary"><strong className="mono">{schedule.projectNo}</strong><span>{schedule.projectName}</span></div></td><td className="num">{schedule.summary.taskCount}</td><td style={{ minWidth: 105 }}><ProgressCell value={Number(schedule.summary.percentComplete)} /></td><td>{date(schedule.summary.planFinish)}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="calendar" title="No schedule data" message="สร้าง Schedule ในโครงการเพื่อเริ่ม Resource Plan" />}
      </Panel>
    </div>
  </>;
}

function PriceAgeBadge({ record }: { record: PriceRecord }) {
  if (record.ageDays === null) return <Badge tone="amber"><LocalizedText text={"No date"} /></Badge>;
  if (record.ageDays <= 90) return <Badge tone="green">{record.ageDays} {"days"}</Badge>;
  if (record.ageDays <= 180) return <Badge tone="amber">{record.ageDays} {"days"}</Badge>;
  return <Badge tone="red">{record.ageDays} {"days"}</Badge>;
}

function PriceLoadWarning({ estimateCount, skippedWorkspaces }: Pick<PriceLoadState, "estimateCount" | "skippedWorkspaces">) {
  return skippedWorkspaces ? <div className="callout warning"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"Price view บางส่วนไม่ถูกโหลด"} /></strong><small><LocalizedText text={"ไม่สามารถอ่าน Cost workspace"} /> {skippedWorkspaces} <LocalizedText text={"From"} /> {estimateCount} <LocalizedText text={"estimates ได้ รายการที่แสดงยังคงเป็นข้อมูลจริงที่โหลดสำเร็จเท่านั้น"} /></small></span></div> : null;
}

export function ProductionPriceLibrary({ bootstrap }: ProductionPlanningProps) {
  const uiText = useUiText();
  const allowed = bootstrap.permissions.includes("estimate.read");
  const { records, estimateCount, historicalCount, quotationLineCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("All sources");
  const [supplier, setSupplier] = useState("All suppliers");
  const [age, setAge] = useState("All ages");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  if (!allowed) return <><PageHeader eyebrow="COST KNOWLEDGE" title={uiText("Price Library")} subtitle="ราคาที่ใช้งานจริงจาก Estimate cost items" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;
  const priced = records.filter((record) => record.unitCost > 0);
  const sources = ["All sources", ...Array.from(new Set(priced.map((record) => record.priceSource).filter(Boolean))).sort()];
  const suppliers = ["All suppliers", ...Array.from(new Set(priced.map((record) => record.supplierName).filter((value): value is string => Boolean(value)))).sort()];
  const rows = priced.filter((record) => {
    const haystack = `${record.itemCode} ${record.description} ${record.brand} ${record.model} ${record.supplierName ?? ""} ${record.estimateNo} ${record.projectName} ${record.referenceNumber ?? ""}`.toLowerCase();
    const ageMatches = age === "All ages"
      || (age === "Fresh 0–90 days" && record.ageDays !== null && record.ageDays <= 90)
      || (age === "Aging 91–180 days" && record.ageDays !== null && record.ageDays > 90 && record.ageDays <= 180)
      || (age === "Stale / undated" && (record.ageDays === null || record.ageDays > 180));
    return haystack.includes(search.toLowerCase())
      && (source === "All sources" || record.priceSource === source)
      && (supplier === "All suppliers" || record.supplierName === supplier)
      && ageMatches;
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const from = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, rows.length);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fresh = priced.filter((record) => record.ageDays !== null && record.ageDays <= 90).length;
  const aging = priced.filter((record) => record.ageDays !== null && record.ageDays > 90 && record.ageDays <= 180).length;
  const stale = priced.filter((record) => record.ageDays === null || record.ageDays > 180).length;
  return <>
    <PageHeader eyebrow="COST KNOWLEDGE" title={uiText("Price Library")} subtitle="รวม Cost item ของ Estimate ปัจจุบันและราคาซื้อจริงที่ตรวจสอบจาก PR/ใบเสนอราคา; ไม่มี Mock price" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
    <div className="kpi-grid four"><KpiCard label="Price usages" value={priced.length} note={`${estimateCount} estimates · ${historicalCount} purchases · ${quotationLineCount} quotation lines`} tone="blue" icon="book" /><KpiCard label="Fresh 0–90 days" value={fresh} note="ตรวจ Price date" tone="green" icon="checkCircle" /><KpiCard label="Aging 91–180" value={aging} note="พิจารณายืนยันราคา" tone="amber" icon="clock" /><KpiCard label="Stale / undated" value={stale} note="ขอราคาใหม่ก่อนอนุมัติ" tone={stale ? "red" : "green"} icon="alertTriangle" /></div>
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search item, brand, model, supplier, project or reference…" />
      <Select label="Price source" value={source} onChange={(value) => { setSource(value); setPage(1); }} options={sources} />
      <Select label="Supplier" value={supplier} onChange={(value) => { setSupplier(value); setPage(1); }} options={suppliers} />
      <Select label="Price age" value={age} onChange={(value) => { setAge(value); setPage(1); }} options={["All ages", "Fresh 0–90 days", "Aging 91–180 days", "Stale / undated"]} />
    </Toolbar>
    <PriceLoadWarning estimateCount={estimateCount} skippedWorkspaces={skippedWorkspaces} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={rows.length + " live price records"} subtitle="แต่ละแถวสืบย้อนกลับไปยัง Estimate หรือ PR/PO ที่ซื้อจริงได้" flush>
      <TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
      {pageRows.length ? <div className="table-wrap">
        <table style={{ minWidth: 1580 }}>
          <thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Brand / Model"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Qty / Unit"} /></th><th><LocalizedText text={"Unit price"} /></th><th><LocalizedText text={"Line total"} /></th><th><LocalizedText text={"Price date / Age"} /></th><th><LocalizedText text={"Source / Reference"} /></th><th><LocalizedText text={"Estimate / Project"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
          <tbody>{pageRows.map((record) => <tr key={record.key}>
            <td><div className="cell-primary"><strong className="mono">{record.itemCode || "LINE-" + record.itemId}</strong><span>{record.description}</span></div></td>
            <td><div className="cell-primary"><strong>{record.brand || "—"}</strong><span>{record.model || "—"}</span></div></td>
            <td>{record.supplierName || "—"}</td>
            <td className="num"><strong>{number(record.quantity)}</strong><small className="muted"> {record.unit}</small></td>
            <td className="num"><strong>{money(record.unitCost)}</strong><small className="muted"> <LocalizedText text={"of"} /> {record.unit}</small></td>
            <td className="num"><strong>{money(record.lineTotal)}</strong></td>
            <td><div className="cell-primary"><strong>{date(record.priceDate)}</strong><span><PriceAgeBadge record={record} /></span></div></td>
            <td><div className="cell-primary"><strong>{record.priceSource || "Unspecified"}</strong><span className="mono">{record.referenceNumber || "—"} <LocalizedText text={"·"} /> {record.sourceKind}</span></div></td>
            <td><div className="cell-primary"><strong className="mono">{record.estimateNo}</strong><span>{record.projectName}</span></div></td>
            <td>{record.ownerName}</td>
            <td><Badge>{record.lineStatus}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading cost workspaces…"} /></div> : <EmptyState icon="book" title="No priced cost item found" message="ไม่พบข้อมูลตามตัวกรอง หรือยังไม่มี Unit cost ใน Estimate" />}
      <Pagination page={currentPage} pageCount={pageCount} from={from} to={to} total={rows.length} onPage={setPage} />
    </Panel>
  </>;
}

const supplierQuotationCurrency = (value: number, currency: SupplierQuotationRecord["currency"]) =>
  new Intl.NumberFormat(currentLocale(), { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(value);

const addIsoDays = (value: string, days: number) => {
  const parsed = new Date(value + "T00:00:00Z");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const quotationFileKind = (name: string) => {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF";
  if (extension === "xls" || extension === "xlsx" || extension === "csv") return "Excel";
  if (extension === "jpg" || extension === "jpeg" || extension === "png") return "Image";
  return "File";
};

function SupplierQuotationUploadModal({ bootstrap, onClose, onCreated }: {
  bootstrap: BootstrapData;
  onClose: () => void;
  onCreated: (quotationNumber: string) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [receivedDate, setReceivedDate] = useState(isoToday());
  const [validUntil, setValidUntil] = useState(addIsoDays(isoToday(), 30));
  const [currency, setCurrency] = useState<SupplierQuotationRecord["currency"]>("THB");
  const [amount, setAmount] = useState("");
  const [inquiryId, setInquiryId] = useState("");
  const [inquiries, setInquiries] = useState<{ id: number; number: string; projectName: string; customerName: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [parseWarning, setParseWarning] = useState("");
  const [lines, setLines] = useState<QuotationLineItem[]>([]);
  const [confidence, setConfidence] = useState<Record<string, "high" | "low" | "none">>({});
  // Editable new-supplier name — pre-filled from PDF extraction, user can correct before Upload
  const [newSupplierName, setNewSupplierName] = useState("");
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  const hasParsed = Object.keys(confidence).length > 0;

  // Create / revoke an object URL for the selected PDF so the iframe can display it.
  // Always show the PDF panel immediately when a PDF is selected.
  useEffect(() => {
    if (file?.name.toLowerCase().endsWith(".pdf")) {
      const url = URL.createObjectURL(file);
      setPdfObjectUrl(url);
      setShowPdf(true);
      return () => URL.revokeObjectURL(url);
    }
    setPdfObjectUrl(null);
    setShowPdf(false);
    return undefined;
  }, [file]);

  // Left-border colour per confidence level — applied as wrapper div style
  const confWrap = (key: string): React.CSSProperties => {
    if (!hasParsed) return {};
    const c = confidence[key];
    if (c === "high") return { borderLeft: "3px solid #22c55e", paddingLeft: 6, marginLeft: -6, borderRadius: 2 };
    if (c === "low")  return { borderLeft: "3px solid #f59e0b", paddingLeft: 6, marginLeft: -6, borderRadius: 2 };
    return               { borderLeft: "3px solid #ef4444",  paddingLeft: 6, marginLeft: -6, borderRadius: 2 };
  };

  // hint string shown under each field (Field label prop only accepts string)
  const confHint = (key: string): string | undefined => {
    if (!hasParsed) return undefined;
    const c = confidence[key];
    if (c === "high") return "✓ อ่านได้";
    if (c === "low")  return "⚠ ควรตรวจสอบ";
    return "ไม่พบใน PDF — กรอกเอง";
  };

  useEffect(() => {
    let active = true;
    void listInquiries({ page: 1, pageSize: 100 }).then((response) => {
      if (active) setInquiries(response.items.map((item) => ({
        id: item.id, number: item.number, projectName: item.projectName, customerName: item.customerName,
      })));
    }).catch((requestError) => { if (active) setError(toError(requestError)); });
    return () => { active = false; };
  }, []);

  // Accept File directly so we can call from onChange before state updates
  const parsePdf = async (targetFile: File) => {
    if (!targetFile.name.toLowerCase().endsWith(".pdf")) return;
    setParsing(true); setParseWarning(""); setError(""); setConfidence({}); setNewSupplierName("");
    // Reset header fields so stale values from a previous PDF don't persist
    setSupplierReference("");
    setReceivedDate(isoToday());
    setValidUntil(addIsoDays(isoToday(), 30));
    setCurrency("THB");
    setAmount("");
    try {
      const result: ParsedQuotationResult = await parsePdfViaBackend(targetFile);

      setConfidence(result.confidence ?? {});

      // Only fill the 3 reliable fields: date, total, currency (+ ref no)
      if (result.quotationNumber) setSupplierReference(result.quotationNumber);
      if (result.receivedDate) setReceivedDate(result.receivedDate);
      if (result.validUntil) setValidUntil(result.validUntil);
      if (result.currency) setCurrency(result.currency);
      if (result.totalAmount > 0) setAmount(String(result.totalAmount));

      if (result.requiresOcr) {
        setParseWarning("PDF เป็นไฟล์สแกน — ระบบอ่านได้บางส่วน กรุณาตรวจสอบทุก field");
      }
    } catch (e) {
      setError(`Parse PDF ไม่สำเร็จ: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setParsing(false);
    }
  };

  const updateLine = (idx: number, patch: Partial<QuotationLineItem>) =>
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, lineNo: i + 1 })));
  const addLine = () =>
    setLines((prev) => [...prev, { lineNo: prev.length + 1, itemCode: "", description: "", brand: "", model: "", qty: 1, unit: "EA", unitPrice: 0, currency, remark: "" }]);

  const parsedAmount = Number(amount);
  const hasSupplier = !!supplierId || !!newSupplierName.trim();
  const invalid = !hasSupplier || !receivedDate || !validUntil || validUntil < receivedDate
    || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !file;

  // Warn when manual line items total doesn't match declared amount (>1% diff)
  const linesTotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const linesTotalMismatch = lines.length > 0 && parsedAmount > 0
    && Math.abs(linesTotal - parsedAmount) > parsedAmount * 0.01;

  const submit = async () => {
    if (invalid || !file) return;
    setBusy(true); setError("");
    try {
      // Resolve supplier:
      //   1. User selected from dropdown → use that ID directly
      //   2. PDF extracted a name → find-or-create in Master Data
      //   3. User typed a name manually → find-or-create in Master Data
      let resolvedSupplierId = supplierId ? Number(supplierId) : 0;

      if (!resolvedSupplierId) {
        const nameToUse = newSupplierName.trim();
        if (!nameToUse) throw new Error("กรุณาเลือกหรือกรอกชื่อ Supplier");
        const found = await findOrCreateSupplier({ name: nameToUse, taxId: "" });
        resolvedSupplierId = found.id;
        setSupplierId(String(found.id));
        if (found.created) setParseWarning(`เพิ่ม Supplier ใหม่: "${found.name}" ใน Master Data แล้ว`);
      }

      const created = await createSupplierQuotation({
        file, supplierId: resolvedSupplierId,
        supplierReference: supplierReference.trim(), receivedDate, validUntil,
        inquiryId: inquiryId ? Number(inquiryId) : undefined, currency, amount: parsedAmount,
      });
      if (lines.length > 0) {
        await saveQuotationLines(created.id, lines).catch(() => {/* non-blocking */});
      }
      await onCreated(created.quotationNumber);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;

  // Summary counts for the parse-result banner
  const confValues = Object.values(confidence);
  const highCount = confValues.filter((v) => v === "high").length;
  const lowCount  = confValues.filter((v) => v === "low").length;
  const noneCount = confValues.filter((v) => v === "none").length;

  return <Modal
    title="Upload supplier quotation"
    subtitle="เลือกไฟล์ PDF · ดู PDF ต้นฉบับด้านขวา · กรอก Supplier + Line items ด้านซ้าย"
    size="xl"
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || invalid} onClick={() => { void submit(); }}>
        <Icon name="upload" /><LocalizedText text={busy ? "Uploading…" : "Upload quotation"} />
      </button>
    </>}
  >
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"Error"} /></strong> {error}</span></div> : null}
    {parseWarning ? <div className="callout warning"><Icon name="alertTriangle" /><span>{parseWarning}</span></div> : null}

    {/* Parse result summary banner */}
    {hasParsed && !parseWarning && (
      <div className="callout" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <Icon name="check" />
        <span>
          <strong>อ่าน PDF แล้ว</strong> · วันที่ / ยอดรวม / สกุลเงิน ถูก fill อัตโนมัติ
          {highCount > 0 && <> · <span style={{ color: "#15803d" }}>●</span> {highCount} field มั่นใจ</>}
          {lowCount > 0  && <> · <span style={{ color: "#a16207" }}>●</span> {lowCount} field ควรตรวจสอบ</>}
          {noneCount > 0 && <> · <span style={{ color: "#dc2626" }}>●</span> {noneCount} field ดูจาก PDF</>}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {isPdf && (
            <button className="btn ghost sm" type="button" disabled={parsing || busy}
              onClick={() => { if (file) void parsePdf(file); }}
              style={{ whiteSpace: "nowrap" }}>
              {parsing ? <><span className="spinner" /> กำลังอ่าน…</> : <><Icon name="refresh" /> อ่านใหม่</>}
            </button>
          )}
        </div>
      </div>
    )}
    {linesTotalMismatch && (
      <div className="callout warning" style={{ marginBottom: 12 }}>
        <Icon name="alertTriangle" />
        <span>ผลรวม line items ({number(linesTotal, 2)}) ไม่ตรงกับยอด Quotation ({number(parsedAmount, 2)}) — กรุณาตรวจสอบ</span>
      </div>
    )}

    {/* Main layout: form on left, PDF viewer on right when showPdf */}
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

      {/* ── Left: form content ── */}
      <div style={{ flex: "1 1 0", minWidth: 0 }}>

        {/* File selector — auto-parses PDF on select */}
        <div className="form-grid two" style={{ marginBottom: 16 }}>
          <Field label="Quotation file *" hint="PDF → อ่านอัตโนมัติ · Excel, CSV, JPG, PNG · maximum 50 MB" span={2}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="file" accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={(event) => {
                  const f = event.target.files?.[0] ?? null;
                  setFile(f); setConfidence({}); setParseWarning(""); setNewSupplierName("");
                  if (f?.name.toLowerCase().endsWith(".pdf")) void parsePdf(f);
                }} />
              {isPdf && parsing && <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}><span className="spinner" /> กำลังอ่าน PDF…</span>}
              {isPdf && !parsing && !hasParsed && (
                <button className="btn ghost sm" type="button" disabled={busy}
                  onClick={() => { if (file) void parsePdf(file); }} style={{ whiteSpace: "nowrap" }}>
                  <Icon name="eye" /> Parse PDF
                </button>
              )}
            </div>
          </Field>
        </div>

        {/* Header form — fields tinted by confidence */}
        <div className="form-grid two">
          <Field label="System quotation no." hint="Generated automatically after upload">
            <input value="SQ-YYMM-XXXX" readOnly />
          </Field>
          <div>
            <Field label="Supplier *">
              <select value={supplierId} onChange={(event) => {
                setSupplierId(event.target.value);
                setNewSupplierName("");
              }}>
                <option value="">— เลือก Supplier (หรือกรอกชื่อใหม่ด้านล่าง) —</option>
                {bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}
              </select>
              {!supplierId && (
                <div style={{ marginTop: 6 }}>
                  <input
                    placeholder="ชื่อ Supplier ใหม่..."
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    maxLength={200}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 12, color: newSupplierName.trim() ? "var(--accent)" : "var(--text-muted)", marginTop: 3 }}>
                    {newSupplierName.trim()
                      ? `จะสร้าง Supplier ใหม่ "${newSupplierName.trim()}" ใน Master Data เมื่อกด Upload`
                      : "กรอกชื่อ Supplier ใหม่ หรือเลือกจากรายการด้านบน"}
                  </div>
                </div>
              )}
            </Field>
          </div>
          <div style={confWrap("quotationNumber")}>
            <Field label="Supplier quotation / reference" hint={confHint("quotationNumber")}>
              <input maxLength={200} value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} placeholder="e.g. QT-2609-001" />
            </Field>
          </div>
          <Field label="Related inquiry">
            <select value={inquiryId} onChange={(event) => setInquiryId(event.target.value)}>
              <option value="">Not linked</option>
              {inquiries.map((inquiry) => <option key={inquiry.id} value={inquiry.id}>{inquiry.number} · {inquiry.projectName} · {inquiry.customerName}</option>)}
            </select>
          </Field>
          <div style={confWrap("receivedDate")}>
            <Field label="Received date *" hint={confHint("receivedDate")}>
              <input type="date" value={receivedDate} onChange={(event) => {
                setReceivedDate(event.target.value);
                if (event.target.value && validUntil < event.target.value) setValidUntil(addIsoDays(event.target.value, 30));
              }} />
            </Field>
          </div>
          <div style={confWrap("validUntil")}>
            <Field label="Valid until *" hint={confHint("validUntil")}>
              <input type="date" min={receivedDate || undefined} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
            </Field>
          </div>
          <Field label="Currency *">
            <select value={currency} onChange={(event) => setCurrency(event.target.value as SupplierQuotationRecord["currency"])}>
              <option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </Field>
          <div style={confWrap("totalAmount")}>
            <Field label="Quotation amount *" hint={confHint("totalAmount")}>
              <input type="number" min="0.0001" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </Field>
          </div>
        </div>

        {/* Line items table */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Line items ({lines.length}) — จะเข้า Price Library อัตโนมัติ</strong>
            <button className="btn ghost sm" type="button" onClick={addLine}><Icon name="plus" /> Add line</button>
          </div>
          {lines.length > 0 ? <div className="table-wrap">
            <table style={{ fontSize: 12, minWidth: showPdf ? 600 : 900 }}>
              <thead><tr>
                <th style={{ width: 36 }}>#</th><th>Item code</th><th>Description *</th><th style={{ width: 60 }}>Qty</th>
                <th style={{ width: 60 }}>Unit</th><th style={{ width: 110 }}>Unit price</th><th style={{ width: 70 }}>Cur.</th>
                <th style={{ width: 32 }}></th>
              </tr></thead>
              <tbody>{lines.map((line, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{line.lineNo}</td>
                  <td><input style={{ width: "100%" }} value={line.itemCode} onChange={(e) => updateLine(idx, { itemCode: e.target.value })} placeholder="—" /></td>
                  <td><input style={{ width: "100%" }} value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} required /></td>
                  <td><input type="number" style={{ width: "100%" }} value={line.qty} min="0.0001" step="1" onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })} /></td>
                  <td><input style={{ width: "100%" }} value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} /></td>
                  <td><input type="number" style={{ width: "100%" }} value={line.unitPrice} min="0" step="0.01"
                    onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })} /></td>
                  <td><select value={line.currency} onChange={(e) => updateLine(idx, { currency: e.target.value })}>
                    <option>THB</option><option>JPY</option><option>USD</option><option>EUR</option>
                  </select></td>
                  <td><button className="btn ghost sm" type="button" style={{ padding: "2px 6px" }} onClick={() => removeLine(idx)}><Icon name="x" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div> : <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            {parsing ? "กำลังอ่าน PDF…" : "กด \"Add line\" เพื่อเพิ่มรายการ — อ่านจาก PDF ต้นฉบับด้านขวาได้เลย"}
          </div>}
        </div>

        {/* Legend */}
        {hasParsed && <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
          <span><span style={{ color: "#22c55e" }}>●</span> มั่นใจ</span>
          <span><span style={{ color: "#f59e0b" }}>●</span> ควรตรวจสอบ</span>
          <span><span style={{ color: "#ef4444" }}>●</span> ไม่พบ — กรอกเอง</span>
        </div>}

        {file ? <div className="file-row" style={{ marginTop: 12 }}><span className="file-icon"><Icon name="paperclip" /></span><div className="cell-primary"><strong>{file.name}</strong><span>{quotationFileKind(file.name)} · {number(file.size / 1024, 1)} KB</span></div></div> : null}
      </div>

      {/* ── Right: PDF viewer (sticky — stays in view while scrolling the form) ── */}
      {showPdf && pdfObjectUrl && (
        <div style={{ width: 480, flexShrink: 0, position: "sticky", top: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>PDF ต้นฉบับ</span>
            <button className="btn ghost sm" type="button" onClick={() => setShowPdf(false)} style={{ padding: "2px 8px" }}>
              <Icon name="x" /> ซ่อน
            </button>
          </div>
          <iframe
            src={pdfObjectUrl}
            title="PDF Preview"
            style={{ width: "100%", height: 680, border: "1px solid #e5e7eb", borderRadius: 6, display: "block" }}
          />
        </div>
      )}

    </div>
  </Modal>;
}

export function ProductionSupplierQuotations({ bootstrap, notify }: ProductionPlanningProps) {
  const allowed = bootstrap.permissions.includes("estimate.read");
  const canUpload = bootstrap.permissions.includes("estimate.write");
  const [result, setResult] = useState<{ items: SupplierQuotationRecord[]; page: number; pageSize: number; total: number }>({
    items: [], page: 1, pageSize: 50, total: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!allowed) return;
    void refreshKey;
    setLoading(true);
    setError("");
    try {
      setResult(await listSupplierQuotations({
        page,
        pageSize,
        search: search.trim() || undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        status: status === "All statuses" ? undefined : status,
      }));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [allowed, page, pageSize, refreshKey, search, status, supplierId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!allowed) return <><PageHeader eyebrow="SUPPLIER SOURCING" title="Supplier Quotations" subtitle="ทะเบียนใบเสนอราคาผู้ขาย" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;

  const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
  const from = result.total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, result.total);
  const countStatus = (value: SupplierQuotationRecord["status"]) => result.items.filter((item) => item.status === value).length;
  const download = async (record: SupplierQuotationRecord) => {
    setDownloadingId(record.id);
    try {
      const downloaded = await downloadSupplierQuotation(record.id);
      const href = URL.createObjectURL(downloaded.blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = downloaded.fileName || record.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (requestError) {
      notify("Download failed: " + toError(requestError));
    } finally {
      setDownloadingId(null);
    }
  };

  return <>
    <PageHeader
      eyebrow="SUPPLIER SOURCING"
      title="Supplier Quotations"
      subtitle="อัปโหลดและติดตามใบเสนอราคาผู้ขายจริง พร้อมไฟล์ต้นฉบับ เลขอ้างอิง และอายุเอกสาร"
      actions={<>
        <button className="btn ghost" type="button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
        {canUpload ? <button className="btn primary" type="button" onClick={() => setShowUpload(true)}><Icon name="upload" /><LocalizedText text={"Upload quotation"} /></button> : null}
      </>}
    />
    <div className="kpi-grid four">
      <KpiCard label="All quotations" value={result.total} note="stored quotation documents" tone="blue" icon="quote" />
      <KpiCard label="Valid on this page" value={countStatus("Valid")} note="more than 30 days remaining" tone="green" icon="checkCircle" />
      <KpiCard label="Expiring on this page" value={countStatus("Expiring")} note="within 30 days" tone="amber" icon="clock" />
      <KpiCard label="Expired on this page" value={countStatus("Expired")} note="validity ended" tone={countStatus("Expired") ? "red" : "green"} icon="alertTriangle" />
    </div>
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search quotation no., supplier, inquiry, project or file…" />
      <label className="select-field">
        <span className="sr-only"><LocalizedText text={"Supplier"} /></span>
        <select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }}>
          <option value=""><LocalizedText text={"All suppliers"} /></option>
          {bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} <LocalizedText text={"·"} /> {supplier.name}</option>)}
        </select>
        <Icon name="chevronDown" />
      </label>
      <Select label="Quotation status" value={status} options={["All statuses", "Valid", "Expiring", "Expired", "Superseded"]} onChange={(value) => { setStatus(value); setPage(1); }} />
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={result.total + " supplier quotations"} subtitle="เอกสารทุกแถวจัดเก็บใน secure document storage และ metadata อยู่ใน SQL Server" flush>
      <TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
      {result.items.length ? <div className="table-wrap">
        <table style={{ minWidth: 1500 }}>
          <thead><tr><th><LocalizedText text={"Quotation No."} /></th><th><LocalizedText text={"Supplier reference"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Valid until"} /></th><th><LocalizedText text={"Inquiry / Project"} /></th><th><LocalizedText text={"Currency"} /></th><th><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"Uploaded by"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Attachment"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead>
          <tbody>{result.items.map((record) => <tr key={record.id}>
            <td><strong className="mono">{record.quotationNumber}</strong></td>
            <td className="mono">{record.supplierReference || "—"}</td>
            <td><strong>{record.supplierName}</strong></td>
            <td>{date(record.receivedDate)}</td>
            <td>{date(record.validUntil)}</td>
            <td><div className="cell-primary"><strong className="mono">{record.inquiryNumber || "Not linked"}</strong><span>{record.projectName || "—"}</span></div></td>
            <td><Badge>{record.currency}</Badge></td>
            <td className="num"><strong>{supplierQuotationCurrency(record.amount, record.currency)}</strong></td>
            <td><div className="cell-primary"><strong>{record.uploadedByName}</strong><span>{dateTime(record.uploadedAt)}</span></div></td>
            <td><Badge>{record.status}</Badge></td>
            <td><div className="cell-primary"><strong>{quotationFileKind(record.fileName)}</strong><span title={record.fileName}>{record.fileName} <LocalizedText text={"·"} /> {number(record.sizeBytes / 1024, 1)} KB</span></div></td>
            <td><button className="btn ghost sm" type="button" disabled={downloadingId === record.id} onClick={() => { void download(record); }}><Icon name="download" />{downloadingId === record.id ? "Downloading…" : <LocalizedText text={"Download"} />}</button></td>
          </tr>)}</tbody>
        </table>
      </div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading supplier quotations…"} /></div> : <EmptyState icon="quote" title="No supplier quotation found" message="อัปโหลด PDF, Excel หรือรูปใบเสนอราคาผู้ขายเพื่อสร้างรายการแรก" action={canUpload ? <button className="btn primary" type="button" onClick={() => setShowUpload(true)}><Icon name="upload" /><LocalizedText text={"Upload quotation"} /></button> : undefined} />}
      <Pagination page={page} pageCount={pageCount} from={from} to={to} total={result.total} onPage={setPage} />
    </Panel>
    {showUpload ? <SupplierQuotationUploadModal bootstrap={bootstrap} onClose={() => setShowUpload(false)} onCreated={async (quotationNumber) => {
      setShowUpload(false);
      setPage(1);
      setRefreshKey((value) => value + 1);
      notify("Supplier quotation " + quotationNumber + " uploaded");
    }} /> : null}
  </>;
}

export function ProductionWaitingSupplierPrice({ bootstrap }: ProductionPlanningProps) {
  const uiText = useUiText();
  const allowed = bootstrap.permissions.includes("estimate.read");
  const { records, estimateCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [search, setSearch] = useState("");
  if (!allowed) return <><PageHeader eyebrow="PRICE FOLLOW-UP" title={uiText("Waiting Supplier Price")} subtitle="รายการราคาผู้ขายที่ต้องติดตาม" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;
  const waiting = records.filter((record) => record.sourceKind === "Estimate" && record.supplierId !== null && (record.unitCost <= 0 || record.ageDays === null || record.ageDays > 180));
  const rows = waiting.filter((record) => `${record.supplierName ?? ""} ${record.itemCode} ${record.description} ${record.estimateNo} ${record.projectName}`.toLowerCase().includes(search.toLowerCase()));
  const missing = waiting.filter((record) => record.unitCost <= 0).length;
  const undated = waiting.filter((record) => record.unitCost > 0 && record.ageDays === null).length;
  const stale = waiting.filter((record) => record.unitCost > 0 && record.ageDays !== null && record.ageDays > 180).length;
  const reason = (record: PriceRecord) => record.unitCost <= 0 ? "Missing / zero price" : record.ageDays === null ? "Missing price date" : `Stale ${record.ageDays} days`;
  return <>
    <PageHeader eyebrow="PRICE FOLLOW-UP" title={uiText("Waiting Supplier Price")} subtitle="Derivation: Cost item ต้องมี Supplier และราคาเป็นศูนย์/ไม่มี Price date/เก่ากว่า 180 วัน โดยคำนวณจากวันที่ปัจจุบัน" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
    <div className="kpi-grid four"><KpiCard label="Needs follow-up" value={waiting.length} note={`from ${estimateCount} estimates`} tone="amber" icon="clock" /><KpiCard label="Missing / zero" value={missing} note="no usable unit price" tone={missing ? "red" : "green"} icon="alertTriangle" /><KpiCard label="Missing date" value={undated} note="cannot validate price age" tone={undated ? "amber" : "green"} icon="calendar" /><KpiCard label="Older than 180" value={stale} note="request reconfirmation" tone={stale ? "red" : "green"} icon="refresh" /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search supplier, item, estimate or project…" /></Toolbar>
    <PriceLoadWarning estimateCount={estimateCount} skippedWorkspaces={skippedWorkspaces} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${rows.length} supplier price follow-ups`} subtitle="รายการนี้เป็นมุมมองคำนวณจากข้อมูลจริง ไม่ได้เปลี่ยนสถานะ Cost item อัตโนมัติ" flush>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Current price"} /></th><th><LocalizedText text={"Price date"} /></th><th><LocalizedText text={"Estimate / Project"} /></th><th><LocalizedText text={"Estimate status"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Line status"} /></th></tr></thead><tbody>{rows.map((record) => <tr key={record.key}><td><Badge tone="red">{reason(record)}</Badge></td><td>{record.supplierName}</td><td><div className="cell-primary"><strong className="mono">{record.itemCode || `LINE-${record.itemId}`}</strong><span>{record.description}</span></div></td><td className="num">{record.unitCost > 0 ? money(record.unitCost) : "—"}</td><td>{date(record.priceDate)}</td><td><div className="cell-primary"><strong className="mono">{record.estimateNo}</strong><span>{record.projectName}</span></div></td><td><Badge>{record.estimateStatus}</Badge></td><td>{record.ownerName}</td><td><Badge>{record.lineStatus}</Badge></td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading cost workspaces…"} /></div> : <EmptyState icon="checkCircle" title="No supplier price needs follow-up" message="ไม่พบ Cost item ที่มี Supplier และเข้าเกณฑ์ราคาไม่พร้อมใช้งาน" />}
    </Panel>
  </>;
}
