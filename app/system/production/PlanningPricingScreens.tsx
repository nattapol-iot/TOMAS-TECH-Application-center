"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CreateSignableDocumentModal } from "./SigningScreens";
import { ResourceTaskWorkspace, type ResourceTask } from "./ResourceTaskWorkspace";
import { SearchMultiPicker } from "./SearchMultiPicker";
import { buildScheduleWorkbook, scheduleWorkbookName } from "../../../lib/schedule-workbook";
import { downloadErpEstimateWorkbookBytes } from "../../../lib/erp-estimate-workbook";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { useActivitySubView } from "../use-activity-presence";
import { listProjectOverview, type ProjectOverviewItem } from "../project-overview-client";
import { ganttFitWindow, ganttWindow, shiftGanttAnchor } from "../../../lib/gantt";
import { GanttChart, GanttLegend, GanttToolbar, scheduleTone, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";
import { HealthBadge } from "./ProjectPlanFields";
import "./my-work.css";
import {
  ApiClientError,
  addProjectMember,
  apiRequest,
  listProjectMembers,
  createReferencePrice,
  createSupplierQuotation,
  deleteSupplierQuotation,
  downloadSupplierQuotation,
  findOrCreateSupplier,
  updateSupplierQuotation,
  listAllQuotationLinesForPriceLibrary,
  listEstimates,
  listMyEstimateAssignments,
  listInquiries,
  listProjects,
  listQuotationLines,
  lookupCostItems,
  type CostItemLookupField,
  type CostItemLookupRecord,
  listSupplierQuotations,
  listSupplierPriceHistory,
  loadEstimateCostWorkspace,
  parsePdfViaBackend,
  saveQuotationLines,
  type BootstrapData,
  type EstimateCostItem,
  type EstimateSummary,
  type MyEstimateAssignment,
  type PagedResult,
  type ProjectHealth,
  type ProjectSummary,
  type QuotationLineForPriceLibrary,
  type QuotationLineItem,
  type ParsedQuotationResult,
  type SupplierQuotationRecord,
  type SupplierPriceHistoryRecord,
} from "../api-client";
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  FilterChips,
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
import { COST_ITEM_LOOKUP_MIN_CHARS } from "../../../lib/cost-item-lookup";
import {
  assignmentNextAction, assignmentQueueSummary, assignmentUrgency, isActionableAssignment, sectionName, sortAssignmentQueue,
} from "../../../lib/estimate-assignment-queue";
import {
  canAnswerDayRequests, canFinishWork, canImportDrawingRow, canProgressScheduleRow, canRequestMoreDays, isLateAgainstPlan, percentChangePatch, statusChangePatch, isStaleInProgress, myWorkNeedsAttention, needsForecastDate, needsZeroProgressFinishConfirmation, offersDayRequest, offersPersonalTask, parseMyWorkExpansion, sortMyWorkGroups, type MyWorkExpansion,
} from "../../../lib/my-work";

import { CrmMyWork } from "./CrmScreens";

type ProductionPlanningProps = {
  openCrmOpportunity?: (id: number) => void;
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
  openProjectSchedule?: (projectId: number, taskId?: number) => void;
  openEstimate?: (estimateId: number) => void;
  preferredProjectId?: number | null;
  /** Opens the plan with this task's drawer, e.g. from a bar in the portfolio timeline. */
  preferredTaskId?: number | null;
  /** Called once the Plan has used the preferred project and task, so a later visit does not reopen them. */
  onPreferredConsumed?: () => void;
  onMyWorkUrgentCountChange?: (count: number) => void;
  newAssignmentCount?: number;
  onNewAssignmentChanged?: () => void;
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
  /** A Resource Plan task owns this row: only its assignee updates progress, and dates change through Resource Plan. */
  managedByResourcePlan?: boolean;
  /** Server verdict: canUpdate, not managed, and no request already waiting. */
  canRequestDays?: boolean;
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
  planManDays: number;
  actualManDays: number;
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
  /** When progress was last reported; plan edits and baselines also touch updatedAt, so quiet days count from this. */
  lastProgressAt?: string | null;
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
  /** The start as stored; null for a phase or a row linked to a predecessor. */
  storedPlanStart?: string | null;
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
  /** A Resource Plan task owns this row; the server refuses plan edits and drawings on it. */
  managedByResourcePlan?: boolean;
  /** Server verdict for the signed-in user: PIC, or the PM/Admin on a row Resource Plan does not manage. */
  canProgress?: boolean;
  /** False for a Master Plan frame leaf, which the shared summary leaves out of late and blocked counts. */
  countsTowardHealth?: boolean;
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
  /** Whether the signed-in user may answer day requests; an older API omits it and canPlan decides. */
  canAnswerRequests?: boolean;
  summary: {
    planStart: string | null;
    planFinish: string | null;
    workDays: number;
    percentComplete: number;
    taskCount: number;
    doneCount: number;
    blockedCount: number;
    /** The shared health and progress summary (backend-node/src/project-health.ts); an older API omits these. */
    health?: ProjectHealth;
    plannedProgress?: number | null;
    overdueCount?: number;
    slipDays?: number | null;
  };
  latestBaseline: ScheduleBaseline | null;
  baselines: ScheduleBaseline[];
  recentUpdates: ScheduleUpdate[];
  tasks: ScheduleTask[];
};

type PriceRecord = {
  key: string;
  /* "Web Reference" is a price someone read off a public page: a link and a date,
     with no document behind it. It is kept apart from the three evidenced kinds. */
  sourceKind: "Estimate" | "Historical Purchase" | "Supplier Quotation" | "Web Reference";
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
  /** Set only for a web reference: the page the price was read from. */
  sourceUrl: string | null;
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
  /** The note as stored, when the form shows a cleaned-up version of it; sent back unchanged unless edited. */
  originalRemark?: string | null;
  /** The version the dialog opened on; it saves against this, not a newer one a background reload brought. */
  rowVersion: string;
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
// The business day in the configured zone, whatever zone the reader's device is set to.
const isoToday = () => estimateBusinessDate(new Date(), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const ageInDays = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const today = Date.parse(`${isoToday()}T00:00:00Z`);
  return Math.max(0, Math.floor((today - parsed) / 86_400_000));
};
/* Only the host earns the column width; the full link lives on the href and title. */
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const flattenTasks =(tasks: ScheduleTask[]): ScheduleTask[] => tasks.flatMap((task) => [task, ...flattenTasks(task.children)]);

/* Rows a Resource Plan task owns: progress comes from its assignee and the dates from Resource Plan. */
function ResourcePlanLock() {
  return <Badge tone="slate"><Icon name="lock" /><LocalizedText text={"Resource Plan"} /></Badge>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert">
    <Icon name="alertTriangle" />
    <span><strong><LocalizedText text={"Could not load"} /></strong><small>{message}</small></span>
    <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>
  </div>;
}

function PermissionNotice({ permission, message }: { permission: string; message: string }) {
  const localizeCopy = useStaticCopy();
  return <Panel title={localizeCopy("Access unavailable")} subtitle={`${localizeCopy("Required permission")}: ${permission}`}>
    <EmptyState icon="lock" title={localizeCopy("This page is restricted by role")} message={message} />
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
      sourceUrl: null,
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
    sourceUrl: null,
  }));
  quotationLines.forEach((item) => records.push({
    key: `sqline:${item.id}`,
    /* Both kinds arrive through the same table; only the source tells them apart, and
       the library must never present a page someone read as a price a supplier sent. */
    sourceKind: item.sourceKind === "WebReference" ? "Web Reference" : "Supplier Quotation",
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
    priceSource: item.sourceKind === "WebReference" ? "Web Reference" : "Supplier Quotation",
    referenceNumber: item.quotationNumber,
    priceDate: item.receivedDate,
    ownerName: item.supplierName,
    lineStatus: item.sourceKind === "WebReference" ? "Referenced" : "Quoted",
    ageDays: ageInDays(item.receivedDate),
    sourceUrl: item.sourceUrl || null,
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

/** The first rule a progress entry breaks, as a dictionary key; null when it can be saved. Mirrors progressInput() on the server. */
function progressProblem(input: { initialStatus: string; percent: number; status: string; actualStart: string; actualFinish: string; forecastFinish: string; remark: string }): string | null {
  const { percent, status, actualStart, actualFinish, forecastFinish } = input;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return "Progress.percentRange";
  if (status === "Done" && !canFinishWork(input.initialStatus)) return "Progress.doneWhileBlocked";
  if (status === "Done" && (percent !== 100 || !actualStart || !actualFinish)) return "Progress.doneNeeds";
  if (status === "Not Started" && (percent !== 0 || actualStart || actualFinish)) return "Progress.notStartedNeeds";
  if (status !== "Done" && percent === 100) return input.initialStatus === "Blocked" ? "Progress.doneWhileBlocked" : "Progress.hundredNeedsDone";
  if (status === "Blocked" && !input.remark.trim()) return "Progress.blockedNeedsReason";
  if (actualFinish && (!actualStart || actualFinish < actualStart)) return "Progress.finishBeforeStart";
  if (forecastFinish && actualStart && forecastFinish < actualStart) return "Progress.forecastBeforeStart";
  return null;
}

function ProgressModal({ target, latestRowVersion, onClose, onSubmit, onConflict }: {
  target: ProgressTarget;
  /** The row's version in the latest data; adopted only after this dialog's own save met a conflict. */
  latestRowVersion?: string | undefined;
  onClose: () => void;
  onSubmit: (input: { percentComplete: number; status: string; actualStart: string | null; actualFinish: string | null; forecastFinish: string | null; remark: string }, rowVersion: string) => Promise<void>;
  /** Reloads the latest task; the dialog stays open with the user's entry so they can check it and save again. */
  onConflict?: () => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const [percent, setPercent] = useState(Number(target.percentComplete));
  const [status, setStatus] = useState(target.status);
  const [actualStart, setActualStart] = useState(target.actualStart ?? "");
  const [actualFinish, setActualFinish] = useState(target.actualFinish ?? "");
  const [forecastFinish, setForecastFinish] = useState(target.forecastFinish ?? "");
  const [remark, setRemark] = useState(target.remark ?? "");
  const [remarkEdited, setRemarkEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const changeStatus = (next: string) => {
    if (!canFinishWork(target.status) && next === "Done") return;
    setStatus(next);
    if (next === "Not Started") {
      setPercent(0); setActualStart(""); setActualFinish("");
    } else if (next === "Done") {
      setPercent(100);
      setActualStart((value) => value || isoToday());
      setActualFinish((value) => value || isoToday());
    } else if (next === "In Progress" || next === "Blocked") {
      setPercent((value) => value === 100 ? 99 : next === "In Progress" && value === 0 ? 1 : value);
      setActualStart((value) => value || isoToday());
      setActualFinish("");
    }
  };
  // A typed percent moves the status with it, the way the one-click strip does.
  const changePercent = (value: number) => {
    setPercent(value);
    if (value === 100 && status !== "Blocked" && canFinishWork(target.status)) {
      setStatus("Done"); setActualStart((current) => current || isoToday()); setActualFinish((current) => current || isoToday());
    } else if (value > 0 && value < 100 && (status === "Not Started" || status === "Done")) {
      setStatus("In Progress"); setActualStart((current) => current || isoToday()); setActualFinish("");
    }
  };
  const problem = progressProblem({ initialStatus: target.status, percent, status, actualStart, actualFinish, forecastFinish, remark });
  const submit = async () => {
    if (needsZeroProgressFinishConfirmation(Number(target.percentComplete), status)
      && !window.confirm(localizeCopy("This task is at 0%. Confirm that the work is complete and finish it today?"))) return;
    setBusy(true); setError(""); setConflict(false);
    try {
      await onSubmit({
        percentComplete: percent,
        status,
        actualStart: actualStart || null,
        actualFinish: actualFinish || null,
        forecastFinish: forecastFinish || null,
        // An untouched note keeps what was stored, including a provenance line the form does not show.
        remark: remarkEdited ? remark.trim() : (target.originalRemark ?? remark).trim(),
      }, conflict ? latestRowVersion ?? target.rowVersion : target.rowVersion);
      onClose();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError) && onConflict) {
        try {
          await onConflict();
          setConflict(true);
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
  return <Modal
    title={`${uiText("Update")} ${target.wbs} · ${target.name}`}
    subtitle={target.projectNo}
    onClose={onClose}
    footer={<>
      {problem ? <span className="progress-problem" role="status"><Icon name="alertCircle" />{uiText(problem)}</span> : null}
      <span className="spacer" />
      <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || problem !== null}>
        <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Save progress"} />}
      </button>
    </>}
  >
    {conflict ? <div className="callout warning" role="alert"><Icon name="alertTriangle" /><span>{uiText("Progress.conflict")}</span></div> : null}
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field"><span><LocalizedText text={"Status *"} /></span><select value={status} onChange={(event) => changeStatus(event.target.value)}><option value={"Not Started"}><LocalizedText text={"Not Started"} /></option><option value={"In Progress"}><LocalizedText text={"In Progress"} /></option><option value={"Blocked"}><LocalizedText text={"Blocked"} /></option><option value={"Done"} disabled={target.status === "Blocked"}><LocalizedText text={"Done"} /></option></select></label>
      <label className="field"><span><LocalizedText text={"Percent complete *"} /></span><input type="number" min="0" max="100" step="1" value={percent} onChange={(event) => changePercent(Number(event.target.value))} /></label>
      <label className="field"><span><LocalizedText text={"Actual start"} /></span><input type="date" value={actualStart} onChange={(event) => setActualStart(event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Actual finish"} /></span><input type="date" min={actualStart || undefined} value={actualFinish} onChange={(event) => setActualFinish(event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Forecast finish"} /></span><input type="date" min={actualStart || undefined} value={forecastFinish} onChange={(event) => setForecastFinish(event.target.value)} /></label>
      <label className="field span-2"><span>{status === "Blocked" ? <LocalizedText text={"Blocked reason *"} /> : <LocalizedText text={"Remark"} />}</span><textarea maxLength={20000} value={remark} onChange={(event) => { setRemark(event.target.value); setRemarkEdited(true); }} /></label>
    </div>
  </Modal>;
}

// The due date that counts: the plan finish while the work is open (a forecast does not move it), the actual finish once done.
const workEffectiveFinish = (item: MyWorkItem) => item.status === "Done" ? item.actualFinish ?? item.planFinish : item.planFinish;
// The shared rules in lib/my-work.ts: late against the current plan, a forecast owed, quiet too long.
const workIsLate = (item: MyWorkItem) => isLateAgainstPlan(item, isoToday());
const workNeedsForecast = (item: MyWorkItem) => needsForecastDate(item, isoToday());
const workIsStale = (item: MyWorkItem) => isStaleInProgress({ status: item.status, updatedAt: workLastReport(item) }, Date.now());
/** The last progress report; an older API without it falls back to the row's update time. */
const workLastReport = (item: MyWorkItem) => item.lastProgressAt ?? item.updatedAt;
const workNeedsUpdate = (item: MyWorkItem) => myWorkNeedsAttention({ ...item, canUpdate: true, updatedAt: workLastReport(item) }, isoToday(), Date.now());
const workUserNote = (value: string | null) => value?.trim().startsWith("Imported from Overall Project Plan") ? "" : value ?? "";
/** A progress save copies the task's note onto every field it changes, so in a history only a day request, its answer and a baseline carry words written for that event. */
const historyReason = (entry: { field: string; comment: string | null }) => entry.comment && ["request", "request_answer", "baseline"].includes(entry.field) ? ` · “${entry.comment}”` : "";
/** The plan importer wrote its provenance into the note and the blocked reason; nobody typed it, so a history shows it as empty. */
const historyNoteFields = ["remark", "blocked_reason"];
const historyValue = (field: string, value: string | null) => historyNoteFields.includes(field) && /^\s*Imported (?:from Overall Project Plan|source status:)/.test(value ?? "") ? null : value;
/** A note or blocked-reason row that only moved the importer's text says nothing. */
const historyShown = (entry: { field: string; fromValue: string | null; toValue: string | null }) => !historyNoteFields.includes(entry.field) || historyValue(entry.field, entry.fromValue) !== historyValue(entry.field, entry.toValue);
const daysFromToday = (value: string | null) => value
  ? Math.round((Date.parse(`${value.slice(0, 10)}T00:00:00Z`) - Date.parse(`${isoToday()}T00:00:00Z`)) / 86_400_000)
  : null;
const myWorkInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
const quietDays = (updatedAt: string) => {
  const updated = Date.parse(updatedAt);
  return Number.isNaN(updated) ? 0 : Math.max(0, Math.floor((Date.now() - updated) / 86_400_000));
};

const MY_WORK_AUDIT_FIELD_LABELS: Record<string, string> = {
  percent_complete: "Progress",
  actual_start: "Actual start",
  actual_finish: "Actual finish",
  forecast_finish: "Forecast finish",
  status: "Status",
  blocked_reason: "Blocked reason",
  remark: "Remark",
  progress: "Progress",
  plan: "Plan",
  plan_days: "Plan days",
  request_answer: "Request answer",
  baseline: "Baseline",
  created: "Created item",
  deleted: "Deleted",
};

const myWorkAuditFieldLabel = (field: string) => MY_WORK_AUDIT_FIELD_LABELS[field] ?? field.replaceAll("_", " ");

type MyWorkProgressInput = {
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  remark: string;
};

type MyWorkFilter = "attention" | "open" | "late" | "blocked" | "week" | "waiting";
type MyWorkSort = "priority" | "due" | "project";
type MyWorkTab = "new" | "active" | "updates";
type MyWorkSource = "all" | "crm" | "estimate" | "project" | "service" | "personal";
type ScheduleWorkGroup = {
  key: string;
  source: Exclude<MyWorkSource, "all" | "estimate" | "service">;
  projectId: number;
  projectNo: string;
  projectName: string;
  phaseWbs: string | null;
  phaseName: string;
  managerName: string;
  items: MyWorkItem[];
  lateCount: number;
  blockedCount: number;
  needsUpdateCount: number;
  dueThisWeekCount: number;
  waitingCount: number;
  progress: number;
  effort: number;
  nearestDue: string | null;
  updatedAt: string;
  urgency: number;
};

type EstimateWorkGroup = {
  key: string;
  estimateId: number;
  estimateNumber: string;
  revision: number;
  projectName: string;
  customerName: string;
  rows: MyEstimateAssignment[];
  lateCount: number;
  blockedCount: number;
  needsUpdateCount: number;
  dueThisWeekCount: number;
  progress: number;
  nearestDue: string | null;
  updatedAt: string;
  urgency: number;
};

const MY_WORK_SOURCE_OPTIONS: { id: MyWorkSource; label: string }[] = [
  { id: "all", label: "All" },
  { id: "crm", label: "CRM" },
  { id: "estimate", label: "Inquiry / Estimate" },
  { id: "project", label: "Project" },
  { id: "service", label: "Service" },
  { id: "personal", label: "Personal" },
];

const MY_WORK_SOURCE_AVAILABILITY: Record<MyWorkTab, MyWorkSource[]> = {
  new: ["all", "estimate", "project", "service"],
  active: ["all", "crm", "estimate", "project", "personal"],
  updates: ["all"],
};

const matchesWorkFilter = (item: MyWorkItem, filter: MyWorkFilter) => {
  if (filter === "attention") return item.canUpdate && item.status !== "Done" && workNeedsUpdate(item);
  if (filter === "open") return item.status !== "Done";
  if (filter === "late") return item.canUpdate && workIsLate(item);
  if (filter === "blocked") return item.canUpdate && item.status === "Blocked";
  if (filter === "week") {
    const days = daysFromToday(workEffectiveFinish(item));
    return item.canUpdate && item.status !== "Done" && days !== null && days >= 0 && days <= 7;
  }
  if (filter === "waiting") return Boolean(item.pendingRequest);
  return item.status !== "Done";
};

function groupScheduleWork(items: MyWorkItem[]): ScheduleWorkGroup[] {
  const groups = new Map<string, MyWorkItem[]>();
  for (const item of items) {
    const key = item.isOwnDetail
      ? `personal:${item.projectId}:${workEffectiveFinish(item) ?? "no-date"}`
      : `project:${item.projectId}:${item.phaseWbs ?? "other"}`;
    const current = groups.get(key);
    if (current) current.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const first = rows[0]!;
    const lateCount = rows.filter(workIsLate).length;
    const blockedCount = rows.filter((item) => item.status === "Blocked").length;
    const needsUpdateCount = rows.filter(workNeedsUpdate).length;
    const dueThisWeekCount = rows.filter((item) => {
      const days = daysFromToday(workEffectiveFinish(item));
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const waitingCount = rows.filter((item) => item.pendingRequest).length;
    const nearestDue = rows.map(workEffectiveFinish).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    const updatedAt = rows.reduce((latest, item) => Date.parse(workLastReport(item)) > Date.parse(latest) ? workLastReport(item) : latest, workLastReport(first));
    const urgency = blockedCount ? 0 : lateCount ? 1 : needsUpdateCount ? 2 : dueThisWeekCount ? 3 : waitingCount ? 4 : 5;
    return {
      key,
      source: (first.isOwnDetail ? "personal" : "project") as ScheduleWorkGroup["source"],
      projectId: first.projectId,
      projectNo: first.projectNo,
      projectName: first.projectName,
      phaseWbs: first.isOwnDetail ? null : first.phaseWbs,
      phaseName: first.isOwnDetail ? "Personal tasks" : first.phaseName ?? "Other work",
      managerName: first.managerName,
      items: [...rows].sort((left, right) => left.wbs.localeCompare(right.wbs, undefined, { numeric: true })),
      lateCount,
      blockedCount,
      needsUpdateCount,
      dueThisWeekCount,
      waitingCount,
      progress: Math.round(rows.reduce((sum, item) => sum + Number(item.percentComplete), 0) / rows.length),
      effort: rows.reduce((sum, item) => sum + Number(item.planManDays || 0), 0),
      nearestDue,
      updatedAt,
      urgency,
    };
  }).sort((left, right) => left.urgency - right.urgency
    || (left.nearestDue ?? "9999-12-31").localeCompare(right.nearestDue ?? "9999-12-31")
    || Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
}

function groupEstimateWork(assignments: MyEstimateAssignment[], todayIso: string): EstimateWorkGroup[] {
  const grouped = new Map<string, MyEstimateAssignment[]>();
  for (const record of sortAssignmentQueue(assignments.filter(isActionableAssignment), todayIso)) {
    const key = `estimate:${record.estimateId}:${record.revision}`;
    const rows = grouped.get(key);
    if (rows) rows.push(record);
    else grouped.set(key, [record]);
  }
  return [...grouped.entries()].map(([key, rows]) => {
    const first = rows[0]!;
    const lateCount = rows.filter((record) => assignmentUrgency(record, todayIso) === "overdue").length;
    const blockedCount = rows.filter((record) => record.status === "Blocked").length;
    const needsUpdateCount = rows.filter((record) => assignmentUrgency(record, todayIso) === "overdue"
      || record.status === "Not Started" || quietDays(record.updatedAt) > 5).length;
    const dueThisWeekCount = rows.filter((record) => assignmentUrgency(record, todayIso) === "due-soon").length;
    const nearestDue = rows.map((record) => record.dueDate ?? record.estimateDueDate).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    const updatedAt = rows.reduce((latest, record) => Date.parse(record.updatedAt) > Date.parse(latest) ? record.updatedAt : latest, first.updatedAt);
    const urgency = blockedCount ? 0 : lateCount ? 1 : needsUpdateCount ? 2 : dueThisWeekCount ? 3 : 5;
    return {
      key,
      estimateId: first.estimateId,
      estimateNumber: first.estimateNumber,
      revision: first.revision,
      projectName: first.projectName,
      customerName: first.customerName,
      rows,
      lateCount,
      blockedCount,
      needsUpdateCount,
      dueThisWeekCount,
      progress: Math.round(rows.reduce((sum, record) => sum + Number(record.progress), 0) / rows.length),
      nearestDue,
      updatedAt,
      urgency,
    };
  }).sort((left, right) => left.urgency - right.urgency
    || (left.nearestDue ?? "9999-12-31").localeCompare(right.nearestDue ?? "9999-12-31")
    || Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
}

const estimateGroupMatchesFilter = (group: EstimateWorkGroup, filter: MyWorkFilter, todayIso: string) => group.rows.some((record) => {
  if (filter === "late") return assignmentUrgency(record, todayIso) === "overdue";
  if (filter === "week") return assignmentUrgency(record, todayIso) === "due-soon";
  if (filter === "blocked" || filter === "waiting") return false;
  if (filter === "attention") return assignmentUrgency(record, todayIso) === "overdue"
    || record.status === "Not Started" || quietDays(record.updatedAt) > 5;
  return true;
});

const ASSIGNMENT_TONE: Record<string, Parameters<typeof Badge>[0]["tone"]> = { overdue: "red", "due-soon": "amber", "on-track": "blue", none: "slate" };

/**
 * Estimate sections assigned to the signed-in engineer.
 *
 * Project schedule tasks and the estimate ledger are two different queues, and
 * only the first one had a home in My Work. An assigned section used to surface
 * nowhere until somebody had already worked on it, so the engineer had to guess
 * which estimate to open. This panel lists the assignment itself — estimate,
 * discipline, status, due date — with the next step and a direct way in.
 */
function MyEstimateAssignmentsPanel({ assignments, loading, error, todayIso, filter, isExpanded, onToggle, onOpenEstimate, onReload }: {
  assignments: MyEstimateAssignment[];
  loading: boolean;
  error: string;
  todayIso: string;
  filter: MyWorkFilter;
  isExpanded: (key: string, urgent: boolean) => boolean;
  onToggle: (key: string, current: boolean) => void;
  onOpenEstimate?: ((estimateId: number) => void) | undefined;
  onReload: () => void;
}) {
  const localizeCopy = useStaticCopy();
  const summary = useMemo(() => assignmentQueueSummary(assignments, todayIso), [assignments, todayIso]);
  const groups = useMemo(() => groupEstimateWork(assignments, todayIso).filter((group) => estimateGroupMatchesFilter(group, filter, todayIso)), [assignments, filter, todayIso]);
  return <Panel
    title={localizeCopy("Estimate work")}
    subtitle={localizeCopy("Grouped by Estimate and revision so each job has one clear place to continue.")}
    flush
    actions={<button className="btn ghost sm" type="button" disabled={loading} onClick={onReload}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>}
  >
    <div className="my-work-filter-row" role="status">
      <span className="my-work-result-count"><LocalizedText text={"Assigned to me"} /> <strong>{summary.actionable}</strong></span>
      <span className="my-work-result-count"><LocalizedText text={"Not started"} /> <strong>{summary.notStarted}</strong></span>
      <span className="my-work-result-count"><LocalizedText text={"Overdue"} /> <strong>{summary.overdue}</strong></span>
      <span className="my-work-result-count"><LocalizedText text={"Due this week"} /> <strong>{summary.dueThisWeek}</strong></span>
    </div>
    {error ? <LoadError message={error} retry={onReload} /> : null}
    {loading && !assignments.length ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading your estimate assignments…"} /></div> : null}
    {!loading && !groups.length ? <EmptyState
      icon="checkCircle"
      title={localizeCopy("No estimate section is waiting for you")}
      message={localizeCopy("A section appears here as soon as the estimate owner assigns it to you, before any work starts.")}
    /> : null}
    {groups.length ? <div className="estimate-work-groups">{groups.map((group) => <EstimateWorkGroupCard key={group.key} group={group} todayIso={todayIso} expanded={isExpanded(group.key, group.urgency <= 2)} onToggle={() => onToggle(group.key, isExpanded(group.key, group.urgency <= 2))} onOpenEstimate={onOpenEstimate} />)}</div> : null}
  </Panel>;
}

function EstimateWorkGroupCard({ group, todayIso, expanded, onToggle, onOpenEstimate }: {
  group: EstimateWorkGroup;
  todayIso: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenEstimate?: ((estimateId: number) => void) | undefined;
}) {
  return <article className={`estimate-work-group urgency-${group.urgency}${expanded ? " expanded" : ""}`}>
    <header className="estimate-work-group-head">
      <div>
        <div className="estimate-work-reference"><Badge tone="slate"><LocalizedText text={"Inquiry / Estimate"} /></Badge><strong className="mono">{group.estimateNumber}</strong><Badge tone="slate">R{String(group.revision).padStart(2, "0")}</Badge></div>
        <h3>{group.projectName}</h3>
        <p>{group.customerName}</p>
      </div>
      <div className="estimate-work-group-actions">
        {onOpenEstimate ? <button className="btn primary sm" type="button" onClick={() => onOpenEstimate(group.estimateId)}><Icon name="arrowRight" /><LocalizedText text={"Open Estimate"} /></button> : null}
        <button className="btn default sm" type="button" aria-expanded={expanded} aria-controls={`${group.key}-items`} onClick={onToggle}><Icon name={expanded ? "chevronDown" : "chevronRight"} /><LocalizedText text={expanded ? "Collapse" : "Expand"} /></button>
      </div>
    </header>
    <div className="work-group-metrics">
      <span><LocalizedText text={"Sections"} /><strong>{group.rows.length}</strong></span>
      <span><LocalizedText text={"Late"} /><strong className={group.lateCount ? "danger-text" : undefined}>{group.lateCount}</strong></span>
      <span><LocalizedText text={"Blocked"} /><strong>{group.blockedCount}</strong></span>
      <span><LocalizedText text={"Needs update"} /><strong>{group.needsUpdateCount}</strong></span>
      <span><LocalizedText text={"Progress"} /><strong>{group.progress}%</strong></span>
      <span><LocalizedText text={"Nearest due"} /><strong>{date(group.nearestDue)}</strong></span>
      <span><LocalizedText text={"Last update"} /><strong>{date(group.updatedAt)} · {quietDays(group.updatedAt)} <LocalizedText text={"quiet days"} /></strong></span>
    </div>
    {expanded ? <div className="estimate-work-sections" id={`${group.key}-items`}>{group.rows.map((record) => {
      const urgency = assignmentUrgency(record, todayIso);
      const next = assignmentNextAction(record);
      return <section className="estimate-work-section" key={record.assignmentId}>
        <div className="estimate-work-section-title"><strong>{record.sectionCode} · <LocalizedText text={sectionName(record.sectionCode)} /></strong><Badge tone={ASSIGNMENT_TONE[urgency]}><LocalizedText text={record.status} /></Badge></div>
        <p><EstimateNextActionDetail record={record} code={next.code} /></p>
        <div className="estimate-work-section-meta"><span>{record.role}</span><span><LocalizedText text={"Due Date"} /> {date(record.dueDate ?? record.estimateDueDate)}</span><span>{record.costLineCount} <LocalizedText text={"cost lines"} /></span><span>{Math.round(record.progress)}%</span></div>
      </section>;
    })}</div> : null}
  </article>;
}

function EstimateNextActionDetail({ record, code }: { record: MyEstimateAssignment; code: string }) {
  const section = <><strong>{record.sectionCode} · <LocalizedText text={sectionName(record.sectionCode)} /></strong> </>;
  if (code === "waiting-supplier") return <>{section}<LocalizedText text={"is waiting for a supplier price. Follow up on the quotation, then update this section."} /></>;
  if (code === "waiting-information") return <>{section}<LocalizedText text={"is waiting for information from"} /> {record.estimateOwnerName}.</>;
  if (code === "first-cost-line") return <>{section}<LocalizedText text={"has no cost line yet. Add the first line in Cost Items."} /></>;
  if (code === "continue-costing") return <>{section}<LocalizedText text={"has"} /> {record.costLineCount} <LocalizedText text={"cost lines at"} /> {Math.round(record.progress)}%. <LocalizedText text={"Continue costing and update the section status."} /></>;
  return <LocalizedText text={assignmentNextAction(record).detail} />;
}

/** Loads the caller's estimate assignments; the API returns only their own rows. */
function useMyEstimateAssignments(enabled: boolean) {
  const [assignments, setAssignments] = useState<MyEstimateAssignment[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError("");
    try { setAssignments(await listMyEstimateAssignments({ includeClosed: true })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { assignments, loading, error, reload: () => { void load(); } };
}

export function ProductionMyWork({
  bootstrap,
  notify,
  openProjectSchedule,
  openEstimate,
  onMyWorkUrgentCountChange,
  newAssignmentCount = 0,
  onNewAssignmentChanged,
  openCrmOpportunity,
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
  const [tab, setTab] = useState<MyWorkTab>("active");
  const [saving, setSaving] = useState<Set<number>>(() => new Set());
  const [requestFor, setRequestFor] = useState<MyWorkItem | null>(null);
  const [inquiryWork, setInquiryWork] = useState<ResourceTask[]>([]);
  const [inquirySaving, setInquirySaving] = useState<number | null>(null);
  // The dialog saves against the row it opened on; the latest row is offered only after its own conflict.
  const [editingFor, setEditingFor] = useState<MyWorkItem | null>(null);
  const editingLatest = editingFor ? items.find((item) => item.taskId === editingFor.taskId) ?? null : null;
  const [personalTaskFor, setPersonalTaskFor] = useState<{ parentId: number | null } | null>(null);
  const [taskFilter, setTaskFilter] = useState<MyWorkFilter>("open");
  const [sourceFilter, setSourceFilter] = useState<MyWorkSource>("all");
  const [expandedGroups, setExpandedGroups] = useState<MyWorkExpansion>({});
  const [expansionReady, setExpansionReady] = useState(false);
  const expansionOwner = useRef("");
  // The chosen sort is remembered per user, like the expanded groups.
  const sortStorageKey = `tomas-tech-my-work-sort:${bootstrap.user.id}`;
  const [taskSort, setTaskSortState] = useState<MyWorkSort>(() => {
    try { const stored = window.localStorage.getItem(sortStorageKey); return stored === "due" || stored === "project" ? stored : "priority"; } catch { return "priority"; }
  });
  const setTaskSort = (next: MyWorkSort) => {
    setTaskSortState(next);
    try { window.localStorage.setItem(sortStorageKey, next); } catch { /* The sort is a convenience when storage is blocked. */ }
  };
  const [taskSearch, setTaskSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  /* Estimate assignments are read on their own permission and their own request:
     an engineer without schedule rights still has to find the sections they own. */
  const estimateQueue = useMyEstimateAssignments(bootstrap.permissions.includes("estimate.read"));
  const todayIso = isoToday();
  const expansionStorageKey = `tomas-tech-my-work-groups:${bootstrap.user.id}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(expansionStorageKey);
        expansionOwner.current = expansionStorageKey;
        setExpandedGroups(parseMyWorkExpansion(stored));
      } catch { setExpandedGroups({}); }
      setExpansionReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expansionStorageKey]);
  useEffect(() => {
    if (!expansionReady || expansionOwner.current !== expansionStorageKey) return;
    try { window.localStorage.setItem(expansionStorageKey, JSON.stringify(expandedGroups)); }
    catch { /* Expansion preferences are optional when storage is blocked. */ }
  }, [expandedGroups, expansionReady, expansionStorageKey]);
  const isGroupExpanded = useCallback((key: string, urgent: boolean) => expandedGroups[key] ?? urgent, [expandedGroups]);
  const toggleGroup = useCallback((key: string, current: boolean) => {
    setExpandedGroups((values) => ({ ...values, [key]: !current }));
  }, []);
  const estimateAssignmentsPanel = bootstrap.permissions.includes("estimate.read")
    && (sourceFilter === "all" || sourceFilter === "estimate")
    && taskFilter !== "blocked"
    && taskFilter !== "waiting"
    ? <MyEstimateAssignmentsPanel
      assignments={estimateQueue.assignments}
      loading={estimateQueue.loading}
      error={estimateQueue.error}
      todayIso={todayIso}
      filter={taskFilter}
      isExpanded={isGroupExpanded}
      onToggle={toggleGroup}
      onOpenEstimate={openEstimate}
      onReload={estimateQueue.reload}
    />
    : null;

  // Only the newest reload may land: a quick save starts one in the background, and an older one
  // finishing later must not bring back the values (and row version) the save just replaced.
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    if (!allowed) return;
    const request = ++loadSequence.current;
    setLoading(true); setError("");
    try {
      const [loadedItems, loadedUpdates, loadedInquiryWork] = await Promise.all([
        apiRequest<MyWorkItem[]>("/api/v1/me/work"),
        apiRequest<MyWorkUpdate[]>("/api/v1/me/work/updates"),
        // Approved Inquiry / Estimate tasks have no schedule row, so /me/work never lists them; after
        // acknowledgment they are worked here. A failure leaves them out rather than failing My Work.
        apiRequest<PagedResult<ResourceTask>>("/api/v1/resource-tasks?mine=true&filter=Approved&source=estimate&pageSize=100").catch(() => null),
      ]);
      if (request !== loadSequence.current) return;
      setItems(loadedItems);
      setUpdates(loadedUpdates);
      setInquiryWork((loadedInquiryWork?.items ?? []).filter((task) => task.acknowledgedAt && !task.scheduleTaskId && task.status !== "Done"));
    } catch (requestError) {
      if (request === loadSequence.current) setError(toError(requestError));
    } finally {
      if (request === loadSequence.current) setLoading(false);
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
  const actionableEstimateAssignments = useMemo(() => estimateQueue.assignments.filter(isActionableAssignment), [estimateQueue.assignments]);
  const lateEstimateAssignments = useMemo(() => actionableEstimateAssignments.filter((record) => assignmentUrgency(record, todayIso) === "overdue"), [actionableEstimateAssignments, todayIso]);
  const dueEstimateAssignments = useMemo(() => actionableEstimateAssignments.filter((record) => assignmentUrgency(record, todayIso) === "due-soon"), [actionableEstimateAssignments, todayIso]);
  const estimateAssignmentsNeedingUpdate = useMemo(() => actionableEstimateAssignments.filter((record) => assignmentUrgency(record, todayIso) === "overdue"
    || record.status === "Not Started" || quietDays(record.updatedAt) > 5), [actionableEstimateAssignments, todayIso]);
  const projectOptions = useMemo(() => Array.from(new Map(items.map((item) => [String(item.projectId), `${item.projectNo} · ${item.projectName}`])).entries()), [items]);
  const personalTaskParents = useMemo(() => items.filter(offersPersonalTask), [items]);
  const visibleScheduleItems = useMemo(() => {
    const needle = taskSearch.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (item.status === "Done") return false;
      if (sourceFilter === "estimate" || sourceFilter === "service" || sourceFilter === "crm") return false;
      if (sourceFilter === "project" && item.isOwnDetail) return false;
      if (sourceFilter === "personal" && !item.isOwnDetail) return false;
      if (projectFilter !== "all" && String(item.projectId) !== projectFilter) return false;
      if (needle && ![item.projectNo, item.projectName, item.wbs, item.name, item.phaseName ?? "", item.status]
        .some((value) => value.toLocaleLowerCase().includes(needle))) return false;
      return true;
    });
  }, [items, projectFilter, sourceFilter, taskSearch]);
  const scheduleGroups = useMemo(() => {
    const groups = groupScheduleWork(visibleScheduleItems).filter((group) => group.items.some((item) => matchesWorkFilter(item, taskFilter)));
    if (taskSort === "project") return [...groups].sort((left, right) => `${left.projectNo}:${left.phaseWbs ?? ""}`.localeCompare(`${right.projectNo}:${right.phaseWbs ?? ""}`, undefined, { numeric: true }));
    if (taskSort === "due") return [...groups].sort((left, right) => (left.nearestDue ?? "9999-12-31").localeCompare(right.nearestDue ?? "9999-12-31"));
    return groups;
  }, [taskFilter, taskSort, visibleScheduleItems]);
  const visibleEstimateGroups = useMemo(() => {
    if (sourceFilter !== "all" && sourceFilter !== "estimate") return [];
    if (projectFilter !== "all") return [];
    const needle = taskSearch.trim().toLocaleLowerCase();
    return groupEstimateWork(estimateQueue.assignments, todayIso)
      .filter((group) => estimateGroupMatchesFilter(group, taskFilter, todayIso))
      .filter((group) => !needle || [group.estimateNumber, group.projectName, group.customerName]
        .some((value) => value.toLocaleLowerCase().includes(needle)));
  }, [estimateQueue.assignments, projectFilter, sourceFilter, taskFilter, taskSearch, todayIso]);
  const activeWorkGroups = useMemo(() => {
    const groups = [
      ...scheduleGroups.map((group) => ({ kind: "schedule" as const, group })),
      ...visibleEstimateGroups.map((group) => ({ kind: "estimate" as const, group })),
    ];
    return sortMyWorkGroups(groups, taskSort, (entry) => {
      return entry.kind === "schedule" ? `${entry.group.projectNo}:${entry.group.phaseWbs ?? ""}` : entry.group.estimateNumber;
    });
  }, [scheduleGroups, taskSort, visibleEstimateGroups]);
  const visibleUpdates = updates.filter(historyShown);
  const activeLoading = loading || ((sourceFilter === "all" || sourceFilter === "estimate") && estimateQueue.loading);
  const activeEstimateError = sourceFilter === "all" || sourceFilter === "estimate" ? estimateQueue.error : "";

  useEffect(() => {
    onMyWorkUrgentCountChange?.(needsUpdate.length);
  }, [needsUpdate.length, onMyWorkUrgentCountChange]);

  const saveProgress = useCallback(async (item: MyWorkItem, input: MyWorkProgressInput, message: string) => {
    setSaving((current) => new Set(current).add(item.taskId));
    try {
      const saved = await apiRequest<{ rowVersion: string }>(`/api/v1/schedule/tasks/${item.taskId}/updates`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion, ...input }),
      });
      // Show the saved values at once; the reload behind it brings the server's derived flags and times.
      loadSequence.current += 1;
      setItems((current) => current.map((entry) => entry.taskId === item.taskId ? { ...entry, ...input, rowVersion: saved.rowVersion } : entry));
      notify(message);
      void load();
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

  // Resource-task progress (no schedule row): the same one-click control, saved against the task's row version.
  // The saved task replaces the card at once, so a second click sends the new row version; the error of a
  // refused save stays on screen because only a success or a conflict reloads.
  const saveInquiryProgress = useCallback(async (task: ResourceTask, patch: Partial<MyWorkProgressInput>, message: string) => {
    setInquirySaving(task.id);
    try {
      const saved = await apiRequest<ResourceTask>(`/api/v1/resource-tasks/${task.id}/progress`, { method: "POST", body: JSON.stringify({
        rowVersion: task.rowVersion, percentComplete: Number(task.percentComplete), status: task.status,
        actualStart: task.actualStart, actualFinish: task.actualFinish, forecastFinish: null, remark: null, ...patch,
      }) });
      loadSequence.current += 1;
      setInquiryWork((current) => current.map((entry) => entry.id === task.id ? { ...entry, percentComplete: saved.percentComplete, status: saved.status,
        actualStart: saved.actualStart, actualFinish: saved.actualFinish, rowVersion: saved.rowVersion, updatedAt: saved.updatedAt } : entry));
      notify(message);
      void load();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError)) {
        notify(`${task.reference} · ${uiText("Plan.changedReloaded")}`);
        await load();
      } else {
        setError(toError(requestError));
      }
    } finally {
      setInquirySaving(null);
    }
  }, [load, notify, uiText]);

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
    if (bootstrap.permissions.includes("crm.read")) return <CrmMyWork openOpportunity={openCrmOpportunity} />;
    const missing = [!hasProgressPermission ? "schedule.progress" : "", !hasReadPermission ? "schedule.read" : ""].filter(Boolean).join(" + ");
    return <><PageHeader eyebrow="PERSONAL WORKSPACE" title={uiText("My Work")} subtitle={uiText("Schedule work assigned to the signed-in user")} /><PermissionNotice permission={missing} message={uiText("Ask an administrator for Schedule read and progress permissions.")} />{estimateAssignmentsPanel}</>;
  }

  return <>
    <PageHeader
      eyebrow="MY WORK"
      title={uiText("My Work")}
      subtitle={uiText("Your daily work queue across assignments, project schedules and Estimate sections.")}
      actions={<>
        <button className="btn primary" type="button" disabled={loading || !personalTaskParents.length} title={localizeCopy(personalTaskParents.length ? "Add work inside an eligible assigned schedule task" : "No eligible assigned schedule task is available")} onClick={() => setPersonalTaskFor({ parentId: null })}><Icon name="plus" /><LocalizedText text={"Add Personal Task"} /></button>
        <button className="btn ghost" type="button" disabled={loading || estimateQueue.loading} onClick={() => { void load(); estimateQueue.reload(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      </>}
    />
    <div className="info-strip my-work-guidance"><Icon name="lock" /><LocalizedText text={"You update the tasks assigned to you. Dates and scope belong to the project manager — use Request more days when you need a change."} /></div>
    <section className="my-work-kpis" aria-label={localizeCopy("Task overview")}>
      <MyWorkStat label="Late" value={actionableOpen.filter(workIsLate).length + lateEstimateAssignments.length} tone="red" active={tab === "active" && taskFilter === "late"} onClick={() => { setTab("active"); setSourceFilter("all"); setTaskFilter("late"); }} />
      <MyWorkStat label="Blocked" value={actionableOpen.filter((item) => item.status === "Blocked").length} tone="amber" active={tab === "active" && taskFilter === "blocked"} onClick={() => { setTab("active"); setSourceFilter("all"); setTaskFilter("blocked"); }} />
      <MyWorkStat label="Needs update" value={needsUpdate.length + estimateAssignmentsNeedingUpdate.length} tone="navy" active={tab === "active" && taskFilter === "attention"} onClick={() => { setTab("active"); setSourceFilter("all"); setTaskFilter("attention"); }} />
      <MyWorkStat label="Due this week" value={dueThisWeek.length + dueEstimateAssignments.length} tone="blue" active={tab === "active" && taskFilter === "week"} onClick={() => { setTab("active"); setSourceFilter("all"); setTaskFilter("week"); }} />
      <MyWorkStat label="Awaiting the PM" value={waiting.length} tone="violet" active={tab === "active" && taskFilter === "waiting"} onClick={() => { setTab("active"); setSourceFilter("all"); setTaskFilter("waiting"); }} />
    </section>
    <Tabs<MyWorkTab> active={tab} onChange={(nextTab) => {
      setTab(nextTab);
      if (!MY_WORK_SOURCE_AVAILABILITY[nextTab].includes(sourceFilter)) setSourceFilter("all");
    }} tabs={[
      { id: "new", label: "New Assignments", count: newAssignmentCount },
      { id: "active", label: "My Active Work", count: open.length + actionableEstimateAssignments.length },
      { id: "updates", label: "My Updates", count: updates.length },
    ]} />
    <div className="my-work-source-filter" role="group" aria-label={localizeCopy("Filter by source")}>
      {MY_WORK_SOURCE_OPTIONS.map((option) => {
        const available = MY_WORK_SOURCE_AVAILABILITY[tab].includes(option.id);
        return <button key={option.id} type="button" disabled={!available} title={available ? undefined : localizeCopy("This source is not available in this tab yet") } className={sourceFilter === option.id ? "active" : ""} aria-pressed={sourceFilter === option.id} onClick={() => { setSourceFilter(option.id); if (option.id === "estimate") setProjectFilter("all"); }}><LocalizedText text={option.label} /></button>;
      })}
    </div>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}

    {tab === "new" ? <ResourceTaskWorkspace
      bootstrap={bootstrap}
      notify={notify}
      mine
      initialFilter="Acknowledgment"
      variant="new-assignments"
      sourceFilter={sourceFilter === "crm" ? "all" : sourceFilter}
      isGroupExpanded={isGroupExpanded}
      onToggleGroup={toggleGroup}
      openProjectSchedule={openProjectSchedule}
      onViewActive={() => setTab("active")}
      onChanged={() => { void load(); onNewAssignmentChanged?.(); }}
    /> : null}

    {tab === "active" ? <>
      {(sourceFilter === "all" || sourceFilter === "crm") && bootstrap.permissions.includes("crm.read") ? <CrmMyWork openOpportunity={openCrmOpportunity} /> : null}
      {sourceFilter !== "crm" ? <>
      <Panel
        title={taskFilter === "attention" ? uiText("Needs your update") : `${activeWorkGroups.length} ${uiText("work groups")}`}
        subtitle={taskFilter === "attention" ? uiText("Late, blocked or quiet for too long — clear these first") : uiText("All work is grouped and sorted by urgency, then due date.")}
        flush
      >
        {activeEstimateError ? <LoadError message={activeEstimateError} retry={estimateQueue.reload} /> : null}
        <div className="my-work-toolbar">
          <SearchInput value={taskSearch} onChange={setTaskSearch} placeholder="Search project, WBS or task…" />
          {sourceFilter !== "estimate" ? <label className="select-field my-work-project-filter">
            <span className="sr-only"><LocalizedText text={"Project"} /></span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label={localizeCopy("Project")}>
              <option value="all"><LocalizedText text={"All projects"} /></option>
              {projectOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <Icon name="chevronDown" />
          </label> : null}
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
          <button type="button" className={taskFilter === "open" ? "active" : ""} onClick={() => setTaskFilter("open")}><LocalizedText text={"All open"} /><span>{open.length + actionableEstimateAssignments.length}</span></button>
          <span className="my-work-result-count"><LocalizedText text={"Showing"} /> <strong>{activeWorkGroups.length}</strong> <LocalizedText text={"work groups"} /></span>
        </div>

        <div className="my-work-task-list work-group-list">
          {activeWorkGroups.map((entry) => entry.kind === "estimate"
            ? <EstimateWorkGroupCard key={entry.group.key} group={entry.group} todayIso={todayIso} expanded={isGroupExpanded(entry.group.key, entry.group.urgency <= 2)} onToggle={() => toggleGroup(entry.group.key, isGroupExpanded(entry.group.key, entry.group.urgency <= 2))} onOpenEstimate={openEstimate} />
            : <ProductionScheduleWorkGroup
              key={entry.group.key}
              group={entry.group}
              expanded={isGroupExpanded(entry.group.key, entry.group.urgency <= 2)}
              onToggle={() => toggleGroup(entry.group.key, isGroupExpanded(entry.group.key, entry.group.urgency <= 2))}
              saving={saving}
              notify={notify}
              patchProgress={patchProgress}
              openProjectSchedule={openProjectSchedule}
              onEdit={setEditingFor}
              onRequest={setRequestFor}
              onAdd={(item) => setPersonalTaskFor({ parentId: item.taskId })}
              onDelete={async (item) => {
              if (!window.confirm(`${localizeCopy("Delete your task")} “${item.name}”?`)) return;
              setSaving((current) => new Set(current).add(item.taskId));
              try {
                await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/details`, {
                  method: "DELETE",
                  body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion }),
                });
                notify(`${item.wbs} ${localizeCopy("deleted")}`);
                await load();
              } catch (requestError) {
                setError(toError(requestError));
              } finally {
                setSaving((current) => { const next = new Set(current); next.delete(item.taskId); return next; });
              }
              }}
            />)}
          {!activeWorkGroups.length && !activeLoading && !activeEstimateError ? <EmptyState icon="search" title={uiText("No work groups match these filters")} message={uiText("Try another source, project, status or search term.")} action={<button className="btn default" type="button" onClick={() => { setTaskSearch(""); setProjectFilter("all"); setSourceFilter("all"); setTaskFilter("open"); }}><LocalizedText text={"Clear filters"} /></button>} /> : null}
          {activeLoading && !activeWorkGroups.length ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading your work…"} /></div> : null}
        </div>
      </Panel>

      {(sourceFilter === "all" || sourceFilter === "estimate") && inquiryWork.length ? <Panel title="MyWork.inquiryWork" subtitle="MyWork.inquiryWorkHint" flush><div className="my-work-task-list">
        {inquiryWork.map((task) => <article key={task.id} className={`my-task-card${isLateAgainstPlan({ status: task.status, planFinish: task.end }, todayIso) ? " late" : ""}${task.status === "Blocked" ? " blocked" : ""}`}>
          <div className="my-task-card-main">
            <div className="my-task-identity">
              <div className="my-task-kicker"><Badge tone="blue"><LocalizedText text={"Inquiry / Estimate"} /></Badge><span className="mono">{task.reference}</span></div>
              <h3>{task.title}</h3>
              <div className="my-task-meta"><span>{task.sourceTitle}</span><span><Icon name="calendar" />{date(task.start)} → {date(task.end)}</span>{task.manDays !== null ? <span><Icon name="users" />{task.manDays} <LocalizedText text={"estimated man-days"} /></span> : null}</div>
            </div>
            <div className="my-task-progress"><ProgressCell value={Number(task.percentComplete)} /></div>
          </div>
          <QuickProgressControls target={{ key: `rt:${task.id}`, wbs: task.reference, percentComplete: Number(task.percentComplete), status: task.status, actualStart: task.actualStart, actualFinish: task.actualFinish, forecastFinish: null, planFinish: task.end, remark: null, updatedAt: task.updatedAt }}
            editable={inquirySaving === null} taskNotes={false} notify={notify} onPatch={(patch, message) => { void saveInquiryProgress(task, patch, message); }} />
        </article>)}
      </div></Panel> : null}
      {(sourceFilter === "all" || sourceFilter === "project" || sourceFilter === "personal") && !items.length && !loading ? <Panel title={uiText("My tasks")} flush><EmptyState icon="checkCircle" title={uiText("Nothing assigned to you yet")} message={uiText("When the project manager assigns you a task it appears here.")} /></Panel> : null}
      {loading && !items.length ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading your live schedule…"} /></div> : null}
      </> : null}
    </> : null}

    {tab === "updates" ? <Panel title={uiText("My Updates")} subtitle={uiText("What you reported, in order")} flush>
      <div className="panel-body feed">
        {visibleUpdates.slice(0, 40).map((entry) => <div className="feed-row" key={entry.id}>
          <span className="avatar sm">{myWorkInitials(bootstrap.user.name)}</span>
          <div>
            <p><strong>{entry.projectNo}{entry.wbs ? ` · ${entry.wbs}` : ""} {entry.taskName ?? entry.projectName}</strong></p>
            <p className="muted">
              {entry.field === "request" || entry.requestDays > 0
                ? <><LocalizedText text={"Requested"} /> {entry.requestDays} <LocalizedText text={"more days"} /> · <LocalizedText text={entry.answer ?? "waiting"} /></>
                : <><LocalizedText text={myWorkAuditFieldLabel(entry.field)} />: {historyValue(entry.field, entry.fromValue) ?? "—"} → {historyValue(entry.field, entry.toValue) ?? "—"}</>}
              {historyReason(entry)}
              {entry.answerNote ? ` · PM: “${entry.answerNote}”` : ""}
            </p>
          </div>
          <span className="muted mono" style={{ fontSize: 11 }}>{dateTime(entry.occurredAt)}</span>
        </div>)}
        {!visibleUpdates.length && !loading ? <p className="muted"><LocalizedText text={"No update yet."} /></p> : null}
      </div>
    </Panel> : null}

    {requestFor ? <ProductionRequestDaysModal item={requestFor} onClose={() => setRequestFor(null)} onSubmitted={async () => {
      setRequestFor(null);
      notify(localizeCopy("Request sent to the project manager"));
      await load();
    }} /> : null}
    {editingFor ? <ProgressModal
      target={{ ...editingFor, remark: workUserNote(editingFor.remark), originalRemark: editingFor.remark }}
      latestRowVersion={editingLatest?.rowVersion}
      onClose={() => setEditingFor(null)}
      onConflict={load}
      onSubmit={async (input, rowVersion) => {
        await apiRequest(`/api/v1/schedule/tasks/${editingFor.taskId}/updates`, {
          method: "POST",
          body: JSON.stringify({ scheduleVersion: editingFor.scheduleVersion, rowVersion, ...input }),
        });
        notify(`${editingFor.wbs} ${localizeCopy("progress updated")}`);
        await load();
      }}
    /> : null}
    {personalTaskFor ? <ProductionPersonalTaskModal items={personalTaskParents} initialParentId={personalTaskFor.parentId} onClose={() => setPersonalTaskFor(null)} onCreated={async () => {
      setPersonalTaskFor(null);
      notify(localizeCopy("Your personal task was added to the live schedule"));
      await load();
    }} /> : null}
  </>;
}

function MyWorkStat({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return <button className={`my-work-stat ${tone}${active ? " active" : ""}`} type="button" onClick={onClick} aria-pressed={active}>
    <span><LocalizedText text={label} /></span><strong>{value}</strong><small><LocalizedText text={"View tasks"} /></small>
  </button>;
}

type QuickProgressTarget = {
  key: string;
  wbs: string;
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  forecastFinish: string | null;
  planFinish: string | null;
  remark: string | null;
  updatedAt: string;
};

/**
 * The one-click progress control, on every My Work card and in the plan's task drawer: the percent
 * strip, the status, a forecast once the task is late, and the note. Choosing Blocked without a note
 * asks for the reason in place and saves once. Rules: percentChangePatch / statusChangePatch in lib/my-work.ts.
 * `taskNotes={false}` is for a row that keeps no note or forecast (a Resource Plan task without a schedule
 * row): those inputs are left out, and a Blocked row changes status first, since the API asks for the
 * blocking reason again on every save and the row has none to send.
 */
function QuickProgressControls({ target, editable, notify, onPatch, extra, taskNotes = true }: {
  target: QuickProgressTarget;
  editable: boolean;
  notify: (message: string) => void;
  onPatch: (patch: Partial<MyWorkProgressInput>, message: string) => void;
  extra?: ReactNode;
  taskNotes?: boolean;
}) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const today = isoToday();
  const userNote = workUserNote(target.remark);
  const percent = Number(target.percentComplete);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const late = isLateAgainstPlan(target, today);
  const saveBlocked = () => {
    const reason = blockedReason?.trim() ?? "";
    if (!reason) return;
    const patch = statusChangePatch(target, "Blocked", today);
    setBlockedReason(null);
    if (patch) onPatch({ ...patch, remark: reason }, `${target.wbs} ${localizeCopy("status changed to")} ${localizeCopy("Blocked")}`);
  };
  return <div className="quick-controls">
    <div className="pct-strip" role="group" aria-label={uiText("Percent done")}>
      {[0, 25, 50, 75, 100].map((value) => <button key={value} type="button" aria-pressed={percent === value} disabled={!editable || (target.status === "Done" && value !== 100) || (target.status === "Blocked" && (value === 100 || !taskNotes))} className={percent === value ? "on" : undefined} onClick={() => {
        const patch = percentChangePatch(target, value, today);
        if (!patch) return;
        if (needsZeroProgressFinishConfirmation(percent, value === 100 ? "Done" : target.status)
          && !window.confirm(localizeCopy("This task is at 0%. Confirm that the work is complete and finish it today?"))) return;
        onPatch(patch, `${target.wbs} ${localizeCopy("progress updated to")} ${value}%`);
      }}>{value}</button>)}
    </div>
    <select disabled={!editable} value={target.status} aria-label={uiText("Status")} onChange={(event) => {
      const status = event.target.value;
      if (status === "Done" && !canFinishWork(target.status)) return;
      if (needsZeroProgressFinishConfirmation(percent, status)
        && !window.confirm(localizeCopy("This task is at 0%. Confirm that the work is complete and finish it today?"))) return;
      if (status === "Blocked" && !userNote.trim()) { setBlockedReason(""); return; }
      const patch = statusChangePatch(target, status, today);
      if (patch) onPatch(patch, `${target.wbs} ${localizeCopy("status changed to")} ${localizeCopy(status)}`);
    }}>
      <option value={"Not Started"}><LocalizedText text={"Not Started"} /></option><option value={"In Progress"}><LocalizedText text={"In Progress"} /></option><option value={"Blocked"}><LocalizedText text={"Blocked"} /></option><option value={"Done"} disabled={target.status === "Blocked"}><LocalizedText text={"Done"} /></option>
    </select>
    {blockedReason !== null ? <span className="blocked-reason">
      <input maxLength={20000} aria-label={localizeCopy("What is blocking it? (required)")} placeholder={localizeCopy("What is blocking it? (required)")} value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") saveBlocked();
        // Escape cancels the reason only; preventDefault keeps the drawer underneath open.
        if (event.key === "Escape") { event.preventDefault(); setBlockedReason(null); }
      }} />
      <button className="btn sm primary" type="button" disabled={!blockedReason.trim()} onClick={saveBlocked}><Icon name="check" />{uiText("MyWork.saveBlocked")}</button>
      <button className="btn sm ghost" type="button" onClick={() => setBlockedReason(null)}><LocalizedText text={"Cancel"} /></button>
    </span> : null}
    {taskNotes && (late || target.forecastFinish) ? <label className="forecast-inline"><span><LocalizedText text={"Forecast"} /></span><input
      key={`${target.key}:forecast:${target.forecastFinish ?? ""}`}
      type="date"
      disabled={!editable}
      defaultValue={target.forecastFinish ?? ""}
      className={workNeedsForecastFor(target) ? "needs-input" : undefined}
      min={target.actualStart ?? undefined}
      onBlur={(event) => {
        // A half-typed date reads as empty; keep the stored forecast instead of clearing it.
        if (event.target.validity.badInput) { event.target.value = target.forecastFinish ?? ""; return; }
        const value = event.target.value || null;
        if (value === (target.forecastFinish ?? null)) return;
        onPatch({ forecastFinish: value }, `${target.wbs} ${localizeCopy("forecast updated")}`);
      }}
    /></label> : null}
    {taskNotes ? <input
      key={`${target.key}:note:${userNote}`}
      className="note-inline"
      disabled={!editable}
      placeholder={localizeCopy(target.status === "Blocked" ? "What is blocking it? (required)" : "Note…")}
      defaultValue={userNote}
      onBlur={(event) => {
        const value = event.target.value.trim();
        if (value === userNote) return;
        if (target.status === "Blocked" && !value) { notify(localizeCopy("Blocked tasks require a reason")); return; }
        onPatch({ remark: value }, `${target.wbs} ${localizeCopy("note updated")}`);
      }}
    /> : null}
    {extra}
  </div>;
}

const workNeedsForecastFor = (target: QuickProgressTarget) => needsForecastDate(target, isoToday());

const myWorkProgressTarget = (item: MyWorkItem): QuickProgressTarget => ({
  key: String(item.taskId), wbs: item.wbs, percentComplete: Number(item.percentComplete), status: item.status,
  actualStart: item.actualStart, actualFinish: item.actualFinish, forecastFinish: item.forecastFinish,
  planFinish: item.planFinish, remark: item.remark, updatedAt: item.updatedAt,
});

function ProductionWorkControls({ item, busy, notify, patchProgress, onRequest }: {
  item: MyWorkItem;
  busy: boolean;
  notify: (message: string) => void;
  patchProgress: (item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => void;
  onRequest: () => void;
}) {
  const localizeCopy = useStaticCopy();
  const editable = item.canUpdate && !busy;
  return <QuickProgressControls target={myWorkProgressTarget(item)} editable={editable} notify={notify} onPatch={(patch, message) => patchProgress(item, patch, message)}
    extra={offersDayRequest(item) ? <button className="row-action" type="button" disabled={!editable || !canRequestMoreDays(item)} title={localizeCopy(item.pendingRequest ? "A request is already waiting for the PM" : "Request more days")} aria-label={localizeCopy("Request more days")} onClick={onRequest}><Icon name="clock" /></button> : null} />;
}

function ProductionScheduleWorkGroup({ group, expanded, onToggle, saving, notify, patchProgress, openProjectSchedule, onEdit, onRequest, onAdd, onDelete }: {
  group: ScheduleWorkGroup;
  expanded: boolean;
  onToggle: () => void;
  saving: Set<number>;
  notify: (message: string) => void;
  patchProgress: (item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => void;
  openProjectSchedule?: (projectId: number, taskId?: number) => void;
  onEdit: (item: MyWorkItem) => void;
  onRequest: (item: MyWorkItem) => void;
  onAdd: (item: MyWorkItem) => void;
  onDelete: (item: MyWorkItem) => Promise<void>;
}) {
  const focus = group.items.find((item) => item.status === "Blocked")
    ?? group.items.find(workIsLate)
    ?? group.items.find(workNeedsUpdate)
    ?? group.items[0]!;
  const urgent = group.urgency <= 2;
  return <article className={`schedule-work-group urgency-${group.urgency}${expanded ? " expanded" : ""}`}>
    <header className="schedule-work-group-head">
      <div className="schedule-work-group-title">
        <div className="estimate-work-reference">
          <Badge tone={group.source === "personal" ? "blue" : "slate"}><LocalizedText text={group.source === "personal" ? "Personal" : "Project"} /></Badge>
          <strong className="mono">{group.projectNo}</strong>
          {group.phaseWbs ? <span className="mono">WBS {group.phaseWbs}</span> : null}
        </div>
        <h3><LocalizedText text={group.phaseName} /></h3>
        <p>{group.projectName}</p>
      </div>
      <div className="schedule-work-group-actions">
        {urgent ? <span className="work-group-focus"><LocalizedText text={"Priority task"} />: <strong>WBS {focus.wbs}</strong> · {focus.name}</span> : null}
        {urgent && focus.canUpdate ? <button className="btn primary sm" type="button" disabled={saving.has(focus.taskId)} onClick={() => onEdit(focus)}><Icon name="edit" /><LocalizedText text={"Update progress"} /></button> : null}
        {urgent && offersDayRequest(focus) ? <button className="btn default sm" type="button" disabled={saving.has(focus.taskId) || !canRequestMoreDays(focus)} onClick={() => onRequest(focus)}><Icon name="clock" /><LocalizedText text={"Request more days"} /></button> : null}
        <button className="btn ghost sm" type="button" disabled={!openProjectSchedule} onClick={() => openProjectSchedule?.(group.projectId)}><Icon name="calendar" /><LocalizedText text={"Open Project"} /></button>
        <button className="btn default sm" type="button" aria-expanded={expanded} aria-controls={`${group.key}-items`} onClick={onToggle}><Icon name={expanded ? "chevronDown" : "chevronRight"} /><LocalizedText text={expanded ? "Collapse" : "Expand"} /></button>
      </div>
    </header>
    <div className="work-group-metrics">
      <span><LocalizedText text={"Tasks"} /><strong>{group.items.length}</strong></span>
      <span><LocalizedText text={"Late"} /><strong className={group.lateCount ? "danger-text" : undefined}>{group.lateCount}</strong></span>
      <span><LocalizedText text={"Blocked"} /><strong>{group.blockedCount}</strong></span>
      <span><LocalizedText text={"Needs update"} /><strong>{group.needsUpdateCount}</strong></span>
      <span><LocalizedText text={"Estimated effort"} /><strong>{group.effort || "—"} MD</strong></span>
      <span><LocalizedText text={"Progress"} /><strong>{group.progress}%</strong></span>
      <span><LocalizedText text={"Nearest due"} /><strong>{date(group.nearestDue)}</strong></span>
      <span><LocalizedText text={"Last update"} /><strong>{date(group.updatedAt)} · {quietDays(group.updatedAt)} <LocalizedText text={"quiet days"} /></strong></span>
    </div>
    {group.source === "project" ? <div className="work-group-owner"><LocalizedText text={"PM:"} /> {group.managerName}</div> : null}
    {expanded ? <div className="schedule-work-group-items" id={`${group.key}-items`}>{group.items.map((item) => <ProductionMyTaskRow
      key={item.taskId}
      item={item}
      busy={saving.has(item.taskId)}
      notify={notify}
      patchProgress={patchProgress}
      openProjectSchedule={openProjectSchedule}
      onEdit={() => onEdit(item)}
      onRequest={() => onRequest(item)}
      onAdd={() => onAdd(item)}
      onDelete={() => onDelete(item)}
    />)}</div> : null}
  </article>;
}

function ProductionMyTaskRow({ item, busy, notify, patchProgress, openProjectSchedule, onEdit, onRequest, onAdd, onDelete }: {
  item: MyWorkItem;
  busy: boolean;
  notify: (message: string) => void;
  patchProgress: (item: MyWorkItem, patch: Partial<MyWorkProgressInput>, message: string) => void;
  openProjectSchedule?: (projectId: number, taskId?: number) => void;
  onEdit: () => void;
  onRequest: () => void;
  onAdd: () => void;
  onDelete: () => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const late = workIsLate(item);
  const needsForecast = workNeedsForecast(item);
  // Due is the plan finish; a forecast is shown beside it but does not move the due date.
  const dueDays = daysFromToday(item.planFinish);
  const silentDays = quietDays(workLastReport(item));
  const attention = item.status === "Blocked" ? "Blocked" : late ? "Late" : workIsStale(item) ? "Update due" : null;
  const timing = item.status === "Done" ? <LocalizedText text={"Completed"} />
    : dueDays === null ? <LocalizedText text={"No due date"} />
      : dueDays < 0 ? <>{Math.abs(dueDays)} <LocalizedText text={"days late"} /></>
        : dueDays === 0 ? <LocalizedText text={"Due today"} />
          : dueDays <= 7 ? <><LocalizedText text={"Due in"} /> {dueDays} <LocalizedText text={"days"} /></>
            : <><LocalizedText text={"Due Date"} /> {date(item.planFinish)}</>;
  return <article className={`my-task-card${late ? " late" : ""}${item.status === "Blocked" ? " blocked" : ""}`}>
    <div className="my-task-card-main">
      <div className="my-task-identity">
        <div className="my-task-kicker">
          {attention ? <Badge><LocalizedText text={attention} /></Badge> : <Badge><LocalizedText text={item.status} /></Badge>}
          <span className="mono">WBS {item.wbs}</span>
          {item.isOwnDetail ? <Pill tone="blue"><LocalizedText text={"own"} /></Pill> : null}
          {item.isMilestone ? <Pill tone="violet"><LocalizedText text={"◆ Milestone"} /></Pill> : null}
          {item.managedByResourcePlan ? <ResourcePlanLock /> : null}
        </div>
        <h3>{item.name}</h3>
        <div className="my-task-meta">
          <span><Icon name="calendar" />{date(item.planStart)} → {date(item.planFinish)}</span>
          <span>{item.workDays} <LocalizedText text={"work days"} /></span>
          {item.forecastFinish ? <span><LocalizedText text={"Forecast"} /> {date(item.forecastFinish)}</span> : null}
          {item.planManDays > 0 ? <span><Icon name="users" />{item.planManDays} <LocalizedText text={"estimated man-days"} />{item.actualManDays > 0 ? <> · {item.actualManDays} <LocalizedText text={"actual"} /></> : null}</span> : null}
          <span><Icon name="clock" />{item.lastProgressAt === null ? <LocalizedText text={"MyWork.noReportYet"} /> : <><LocalizedText text={"Last update"} /> {dateTime(workLastReport(item))} · {silentDays} <LocalizedText text={"quiet days"} /></>}</span>
        </div>
      </div>
      <div className="my-task-progress">
        <ProgressCell value={Number(item.percentComplete)} />
        <span className={late ? "late-text" : ""}>{timing}</span>
      </div>
    </div>

    {item.pendingRequest ? <div className="my-task-request"><Icon name="clock" /><strong><LocalizedText text={"Awaiting the PM"} /></strong><span>{item.pendingRequest.requestDays} <LocalizedText text={"more days requested"} />{item.pendingRequest.comment ? ` · ${item.pendingRequest.comment}` : ""}</span></div> : null}
    {needsForecast ? <div className="my-task-alert"><Icon name="alertTriangle" /><span><LocalizedText text={"This was due"} /> {date(item.planFinish)}<LocalizedText text={"MyWork.forecastBelow"} /></span></div> : null}

    {item.canUpdate ? <ProductionWorkControls item={item} busy={busy} notify={notify} patchProgress={patchProgress} onRequest={onRequest} /> : null}

    <div className="my-task-actions">
      {item.canUpdate ? <button className="btn default sm" type="button" disabled={busy} onClick={onEdit}><Icon name="edit" /><LocalizedText text={"Update details"} /></button> : null}
      <button className="btn ghost sm" type="button" disabled={!openProjectSchedule} onClick={() => openProjectSchedule?.(item.projectId, item.taskId)}><Icon name="calendar" /><LocalizedText text={"Open plan"} /></button>
      <span className="spacer" />
      {offersDayRequest(item) || offersPersonalTask(item) || item.canDeleteDetail ? <details className="my-task-more-actions">
        <summary><LocalizedText text={"More actions"} /><Icon name="chevronDown" /></summary>
        <div>
          {offersDayRequest(item) ? <button className="btn ghost sm" type="button" disabled={busy || !canRequestMoreDays(item)} onClick={onRequest}><Icon name="clock" /><LocalizedText text={"Request more days"} /></button> : null}
          {offersPersonalTask(item) ? <button className="btn ghost sm" type="button" disabled={busy} title={localizeCopy("Add a private detail task")} onClick={onAdd}><Icon name="plus" /><LocalizedText text={"Add Personal Task"} /></button> : null}
          {item.canDeleteDetail ? <button className="btn ghost sm danger-text" type="button" disabled={busy} title={localizeCopy("Delete my task")} onClick={() => { void onDelete(); }}><Icon name="trash" /><LocalizedText text={"Delete my task"} /></button> : null}
        </div>
      </details> : null}
    </div>
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

function ProductionPersonalTaskModal({ items, initialParentId = null, onClose, onCreated }: {
  items: MyWorkItem[];
  /** The task a card opened the dialog from; the header button leaves it empty. */
  initialParentId?: number | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const uiText = useUiText();
  const [parentId, setParentId] = useState(String(initialParentId ?? items[0]?.taskId ?? ""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // No fallback to another task: a parent that stopped qualifying must not silently become a different one.
  const item = items.find((candidate) => String(candidate.taskId) === parentId);
  const planSpan = item?.planStart && item.planFinish
    ? Math.round((Date.parse(`${item.planFinish.slice(0, 10)}T00:00:00Z`) - Date.parse(`${item.planStart.slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1
    : 1;
  const planDays = Number.isFinite(planSpan) ? Math.max(1, planSpan) : 1;
  const submit = async () => {
    if (!item) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/schedule/tasks/${item.taskId}/details`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion: item.scheduleVersion, rowVersion: item.rowVersion, name: name.trim(), planDays }),
      });
      await onCreated();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal
    title={uiText("Add Personal Task")}
    subtitle={uiText("Add a private detail beneath one of your assigned schedule tasks.")}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || !item || !name.trim()} onClick={() => { void submit(); }}><Icon name="plus" />{busy ? <LocalizedText text={"Adding…"} /> : <LocalizedText text={"Add task"} />}</button>
    </>}
  >
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    {!item ? <div className="callout warning" role="alert"><Icon name="alertTriangle" /><span>{uiText("MyWork.parentUnavailable")}</span></div> : null}
    <div className="form-grid">
      <Field label={uiText("Project task")} span={3}><select value={parentId} onChange={(event) => setParentId(event.target.value)}>{!item ? <option value={parentId}>—</option> : null}{items.map((candidate) => <option key={candidate.taskId} value={candidate.taskId}>{candidate.projectNo} · WBS {candidate.wbs} · {candidate.name}</option>)}</select></Field>
      <Field label={uiText("Personal task")} span={3}><input maxLength={500} value={name} onChange={(event) => setName(event.target.value)} placeholder={uiText("What will you do?")} /></Field>
      <Field label={uiText("Schedule window")}><input value={item ? `${date(item.planStart)} → ${date(item.planFinish)}` : "—"} readOnly /></Field>
      <Field label={uiText("Days")}><input className="num" type="number" value={planDays} readOnly /></Field>
    </div>
    <div className="info-strip"><Icon name="alertCircle" /><LocalizedText text={"The personal task follows the selected project task dates and does not add workload effort."} /></div>
  </Modal>;
}

/** Everyone can be picked; a person not yet on the project joins it first, because a PIC must be a member. */
function usePicOptions(bootstrap: BootstrapData) {
  return useMemo(() => bootstrap.team.map((member) => ({ id: member.id, label: member.name, detail: member.department })), [bootstrap.team]);
}
async function ensureScheduleMembers(projectId: number, managerId: number, userIds: number[]) {
  if (!userIds.length) return;
  const members = new Set((await listProjectMembers(projectId)).map((member) => member.userId));
  for (const userId of userIds) if (userId !== managerId && !members.has(userId)) await addProjectMember(projectId, { userId, roleOnProject: "Member" });
}
function PicPicker({ options, value, onChange }: { options: { id: number; label: string; detail?: string }[]; value: number[]; onChange: (value: number[]) => void }) {
  const t = useUiText();
  return <div className="field span-2"><span>{t("Schedule.pics")}</span>
    <SearchMultiPicker options={options} value={value} onChange={onChange} label={t("Schedule.pics")} placeholder={t("Schedule.searchPeople")}
      removeLabel={t("Schedule.removePic")} noMatchText={t("Schedule.noPersonMatch")} allChosenText={t("Schedule.everyoneChosen")} />
    <small>{t("Schedule.picsHint")}</small></div>;
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
  const [picUserIds, setPicUserIds] = useState<number[]>([]);
  const picOptions = usePicOptions(bootstrap);
  const [picExternal, setPicExternal] = useState("");
  const [planManDays, setPlanManDays] = useState(0);
  const [milestone, setMilestone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phases = flattenTasks(schedule.tasks).filter((task) => task.kind === "phase");
  const allRows = flattenTasks(schedule.tasks);
  const selectedParent = parentId ? Number(parentId) : null;
  const sortOrder = Math.max(0, ...allRows.filter((task) => task.parentId === selectedParent).map((task) => task.sortOrder)) + 10;
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (kind === "task") await ensureScheduleMembers(schedule.projectId, schedule.managerId, picUserIds);
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
          picUserIds,
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
        <PicPicker options={picOptions} value={picUserIds} onChange={setPicUserIds} />
        <label className="field"><span><LocalizedText text={"External PIC"} /></span><input maxLength={300} value={picExternal} onChange={(event) => setPicExternal(event.target.value)} /></label>
        <label className="checkbox-row span-2"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /><LocalizedText text={"Milestone (1 day)"} /></label>
      </> : <div className="callout warning span-2"><Icon name="alertCircle" /><span><strong><LocalizedText text={"Phase เป็นแถวสรุป"} /></strong><small><LocalizedText text={"วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase"} /></small></span></div>}
    </div>
  </Modal>;
}

/*
 * Changes one schedule row's plan: name, visibility, dates, effort and who is responsible.
 * Progress stays where it is. A row whose dates come from its detail rows or from a
 * predecessor keeps them; they are shown but not editable here.
 */
function EditScheduleTaskModal({ bootstrap, schedule, task, onClose, onSaved, onConflict }: {
  bootstrap: BootstrapData;
  schedule: ProjectSchedule;
  task: ScheduleTask;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConflict: () => Promise<void>;
}) {
  const t = useUiText();
  const isPhase = task.kind === "phase";
  const datesLocked = isPhase || task.children.length > 0 || task.startMode !== "manual";
  const [name, setName] = useState(task.name);
  const [visibility, setVisibility] = useState(task.visibility);
  const [planStart, setPlanStart] = useState(task.storedPlanStart ?? task.planStart ?? isoToday());
  const [planDays, setPlanDays] = useState(task.planDays);
  const [milestone, setMilestone] = useState(task.isMilestone);
  const [planManDays, setPlanManDays] = useState(task.planManDays);
  const [picUserIds, setPicUserIds] = useState<number[]>(task.pics.map((pic) => pic.id));
  const [picExternal, setPicExternal] = useState(task.picExternal);
  const picOptions = usePicOptions(bootstrap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (!isPhase) await ensureScheduleMembers(schedule.projectId, schedule.managerId, picUserIds);
      await apiRequest(`/api/v1/schedule/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({
        scheduleVersion: schedule.scheduleVersion, rowVersion: task.rowVersion,
        parentId: task.parentId, sortOrder: task.sortOrder, kind: task.kind, name: name.trim(),
        isMilestone: isPhase ? false : milestone, visibility,
        // Locked dates go back exactly as stored, so the API sees them unchanged.
        planStart: isPhase ? null : datesLocked ? task.storedPlanStart ?? null : planStart,
        planDays: isPhase ? 1 : milestone && !datesLocked ? 1 : datesLocked ? task.planDays : planDays,
        startMode: task.startMode, predecessorId: task.predecessorId, lagDays: task.lagDays,
        picUserIds: isPhase ? [] : picUserIds, picExternal: isPhase ? "" : picExternal.trim(), planManDays: isPhase ? 0 : planManDays,
      }) });
      await onSaved();
      onClose();
    } catch (requestError) {
      if (isConcurrencyConflict(requestError)) {
        try { await onConflict(); onClose(); } catch (reloadError) { setError(toError(reloadError)); }
        return;
      }
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="Schedule.editRow" subtitle={`${schedule.projectNo} · ${task.wbs} · ${task.name}`} size="lg" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={busy || !name.trim() || (!datesLocked && (!planStart || planDays < 1)) || planManDays < 0} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : t("Schedule.saveRow")}</button>
  </>}>
    {error ? <LoadError message={t(error)} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field span-2"><span><LocalizedText text={"Name *"} /></span><input maxLength={500} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Visibility *"} /></span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value={"Internal"}><LocalizedText text={"Internal"} /></option><option value={"Customer"}><LocalizedText text={"Customer"} /></option></select></label>
      {isPhase ? <div className="callout warning span-2"><Icon name="alertCircle" /><span><strong><LocalizedText text={"Phase เป็นแถวสรุป"} /></strong><small><LocalizedText text={"วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase"} /></small></span></div> : <>
        <label className="field"><span><LocalizedText text={"Plan man-days"} /></span><input type="number" min="0" max="1000000" step="0.25" value={planManDays} onChange={(event) => setPlanManDays(Number(event.target.value))} /></label>
        <label className="field"><span><LocalizedText text={"Plan start *"} /></span><input type="date" value={datesLocked ? task.planStart ?? "" : planStart} disabled={datesLocked} onChange={(event) => setPlanStart(event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Plan days *"} /></span><input type="number" min="1" max="3650" value={datesLocked ? task.planDays : milestone ? 1 : planDays} disabled={datesLocked || milestone} onChange={(event) => setPlanDays(Number(event.target.value))} /></label>
        {datesLocked ? <p className="muted span-2">{t("Schedule.datesDerived")}</p> : <label className="checkbox-row span-2"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /><LocalizedText text={"Milestone (1 day)"} /></label>}
        <PicPicker options={picOptions} value={picUserIds} onChange={setPicUserIds} />
        <label className="field span-2"><span><LocalizedText text={"External PIC"} /></span><input maxLength={300} value={picExternal} onChange={(event) => setPicExternal(event.target.value)} /></label>
      </>}
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

type PlanFilter = "late" | "blocked" | "mine" | "waiting";
const PLAN_FILTERS: { key: PlanFilter; label: string; tone: "red" | "amber" | "blue" }[] = [
  { key: "late", label: "Plan.filterLate", tone: "red" },
  { key: "blocked", label: "Plan.filterBlocked", tone: "red" },
  { key: "waiting", label: "Plan.filterWaiting", tone: "amber" },
  { key: "mine", label: "Plan.filterMine", tone: "blue" },
];
const planProjectStorageKey = (userId: number) => `tomas-tech-plan-project:${userId}`;
/** Project numbers in natural order: PJ26009 before PJ26010. */
const byProjectNumber = (a: { number: string }, b: { number: string }) => a.number.localeCompare(b.number, "en", { numeric: true, sensitivity: "base" });
const isLeafTask = (task: ScheduleTask) => task.kind !== "phase" && task.children.length === 0;
const taskOrDescendantMatches = (task: ScheduleTask, matches: (task: ScheduleTask) => boolean): boolean =>
  matches(task) || task.children.some((child) => taskOrDescendantMatches(child, matches));

/** The rows the plan draws: collapsed branches hidden; under a quick filter, matching tasks with their parents. */
function planRows(tasks: ScheduleTask[], collapsed: Set<number>, matches: ((task: ScheduleTask) => boolean) | null): ScheduleTask[] {
  const rows: ScheduleTask[] = [];
  const visit = (list: ScheduleTask[]) => {
    for (const task of list) {
      if (matches && !taskOrDescendantMatches(task, matches)) continue;
      rows.push(task);
      if (task.children.length && (matches || !collapsed.has(task.id))) visit(task.children);
    }
  };
  visit(tasks);
  return rows;
}

/**
 * Projects > Plan: a project's schedule as a Gantt. The bars come from the API's resolved dates; a
 * bar or a row opens the task drawer, where the PIC, the PM or an Admin updates progress (canProgress)
 * and the plan owner edits the row. Reloads keep the plan on screen instead of blanking it.
 */
export function ProductionProjectSchedule({ bootstrap, notify, preferredProjectId, preferredTaskId, onPreferredConsumed }: ProductionPlanningProps) {
  const uiText = useUiText();
  useActivitySubView("projects-schedule");
  const allowed = bootstrap.permissions.includes("schedule.read");
  const storageKey = planProjectStorageKey(bootstrap.user.id);
  const today = isoToday();
  const [projects, setProjects] = useState<ProjectOverviewItem[]>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(allowed);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<GanttZoomChoice>("fit");
  const [anchor, setAnchor] = useState(today);
  const [filter, setFilter] = useState<PlanFilter | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [drawerTaskId, setDrawerTaskId] = useState<number | null>(preferredTaskId ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  // Dialogs keep the row they opened on, so a background reload never swaps in a newer version unseen.
  const [progressTask, setProgressTask] = useState<ScheduleTask | null>(null);
  const [editTask, setEditTask] = useState<ScheduleTask | null>(null);
  const [drawerError, setDrawerError] = useState("");
  const [drawingTask, setDrawingTask] = useState<{projectId:number;taskId:number} | null>(null);
  const [answerRequest, setAnswerRequest] = useState<ScheduleUpdate | null>(null);
  const [saving, setSaving] = useState(false);
  const scheduleRequestId = useRef(0);
  const loadProjects = useCallback(async () => {
    if (!allowed) return;
    setLoadingProjects(true); setError("");
    try {
      const loaded = [...(await listProjectOverview({ includeClosed: true })).items].sort(byProjectNumber);
      setProjects(loaded);
      // The current pick wins, so Refresh never snaps back; a deep link only seeds the first pick.
      setSelectedId((current) => {
        if (current && loaded.some((project) => project.id === current)) return current;
        if (preferredProjectId && loaded.some((project) => project.id === preferredProjectId)) {
          try { window.localStorage.setItem(storageKey, String(preferredProjectId)); } catch { /* Remembering the project is a convenience. */ }
          return preferredProjectId;
        }
        let remembered: number | null = null;
        try { remembered = Number(window.localStorage.getItem(storageKey)) || null; } catch { remembered = null; }
        if (remembered && loaded.some((project) => project.id === remembered)) return remembered;
        return loaded.find((project) => project.status !== "Closed")?.id ?? loaded[0]?.id ?? null;
      });
      // Used once: a later visit to the Plan opens the remembered project, not this link's drawer again.
      if (preferredProjectId || preferredTaskId) onPreferredConsumed?.();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoadingProjects(false); }
  }, [allowed, preferredProjectId, preferredTaskId, onPreferredConsumed, storageKey]);
  // A reload keeps the current plan on screen; only switching projects clears it.
  const loadSchedule = useCallback(async () => {
    const requestId = ++scheduleRequestId.current;
    if (!selectedId) { setSchedule(null); setLoadingSchedule(false); return; }
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
  const selectProject = (nextId: number | null) => {
    scheduleRequestId.current += 1;
    setSchedule(null); setDrawerTaskId(null); setFilter(null); setCollapsed(new Set()); setZoom("fit");
    setCreateOpen(false); setBaselineOpen(false); setProgressTask(null); setEditTask(null); setAnswerRequest(null); setDrawerError("");
    setLoadingSchedule(Boolean(nextId));
    setSelectedId(nextId);
    try { if (nextId) window.localStorage.setItem(storageKey, String(nextId)); } catch { /* Remembering the project is a convenience. */ }
  };
  if (!allowed) return <><PageHeader eyebrow="PROJECT CONTROL" title={uiText("Plan.title")} subtitle="Plan.subtitle" /><PermissionNotice permission="schedule.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Schedule Read ให้บทบาทนี้" /></>;
  const activeSchedule = schedule?.projectId === selectedId ? schedule : null;
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const rows = activeSchedule ? flattenTasks(activeSchedule.tasks) : [];
  const taskById = new Map(rows.map((task) => [task.id, task] as const));
  const canPlan = Boolean(activeSchedule?.canPlan && bootstrap.permissions.includes("schedule.plan"));
  const canAnswerRequests = activeSchedule ? canAnswerDayRequests(activeSchedule, bootstrap.permissions.includes("schedule.plan")) : false;
  const pendingDayRequests = activeSchedule?.recentUpdates.filter((update) => update.field === "request" && update.requestDays > 0 && !update.answer) ?? [];
  const pendingTaskIds = new Set(pendingDayRequests.map((request) => request.taskId));
  const filterRules: Record<PlanFilter, (task: ScheduleTask) => boolean> = {
    // A Master Plan frame row is left out, as the summary's Overdue and Blocked counts leave it out.
    late: (task) => isLeafTask(task) && task.countsTowardHealth !== false && isLateAgainstPlan(task, today),
    blocked: (task) => isLeafTask(task) && task.countsTowardHealth !== false && task.status === "Blocked",
    waiting: (task) => pendingTaskIds.has(task.id),
    mine: (task) => isLeafTask(task) && task.pics.some((pic) => pic.id === bootstrap.user.id),
  };
  const filterItems = PLAN_FILTERS.map((item) => ({ ...item, value: rows.filter(filterRules[item.key]).length }));
  const visible = activeSchedule ? planRows(activeSchedule.tasks, collapsed, filter ? filterRules[filter] : null) : [];
  const target = selectedProject?.targetDelivery ?? null;
  const range = zoom === "fit"
    ? ganttFitWindow([activeSchedule?.summary.planStart, activeSchedule?.summary.planFinish, target, ...rows.map((task) => task.forecastFinish)], today)
    : ganttWindow(zoom, anchor);
  const toggleRow = (taskId: number) => setCollapsed((current) => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
  const ganttRows: GanttRowSpec[] = visible.map((task) => {
    const summaryRow = task.kind === "phase" || task.children.length > 0;
    const lock = task.managedByResourcePlan ? <ResourcePlanLock /> : pendingTaskIds.has(task.id) ? <Badge tone="amber">{uiText("Plan.waitingBadge")}</Badge> : null;
    return {
      key: `task:${task.id}`, depth: task.depth, kind: summaryRow ? "phase" : "task",
      label: <><span className="mono">{task.wbs}</span> {task.name}</>,
      meta: [task.pics.map((pic) => pic.name).join(", ") || task.picExternal, uiText(task.status), `${Math.round(Number(task.percentComplete))}%`].filter(Boolean).join(" · "),
      ...(lock ? { status: lock } : {}),
      ...(task.children.length && !filter ? { expandable: true, expanded: !collapsed.has(task.id), onToggle: () => toggleRow(task.id) } : {}),
      onOpen: () => setDrawerTaskId(task.id),
      start: task.planStart, finish: task.planFinish, progress: Number(task.percentComplete), tone: scheduleTone(task, today),
      baselineStart: task.baselineStart, baselineFinish: task.baselineFinish, forecastFinish: task.forecastFinish,
      milestone: task.isMilestone, target, selected: drawerTaskId === task.id,
      title: `${task.wbs} ${task.name} · ${task.planStart ?? "—"} → ${task.planFinish ?? "—"} · ${Math.round(Number(task.percentComplete))}%`,
    };
  });
  const drawerTask = drawerTaskId === null ? null : taskById.get(drawerTaskId) ?? null;
  const filteredProjects = projects.filter((project) => project.id === selectedId || !projectQuery.trim()
    || `${project.number} ${project.name} ${project.customerName}`.toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase()));
  const saveTaskProgress = async (task: ScheduleTask, patch: Partial<MyWorkProgressInput>, message: string) => {
    if (!activeSchedule) return;
    setSaving(true); setDrawerError("");
    try {
      await apiRequest(`/api/v1/schedule/tasks/${task.id}/updates`, { method: "POST", body: JSON.stringify({
        scheduleVersion: activeSchedule.scheduleVersion, rowVersion: task.rowVersion,
        percentComplete: Number(task.percentComplete), status: task.status, actualStart: task.actualStart, actualFinish: task.actualFinish,
        forecastFinish: task.forecastFinish, remark: task.remark ?? "", ...patch,
      }) });
      notify(`${activeSchedule.projectNo} · ${message}`);
      await loadSchedule();
    } catch (failure) {
      if (isConcurrencyConflict(failure)) { notify(`${activeSchedule.projectNo} · ${task.wbs} ${uiText("Plan.changedReloaded")}`); await loadSchedule(); }
      else {
        // Shown in the drawer, where the user is; the page-level error sits behind its backdrop.
        setDrawerError(toError(failure));
        notify(`${activeSchedule.projectNo} · ${task.wbs} ${uiText("Plan.saveFailed")}`);
        await loadSchedule();
      }
    } finally { setSaving(false); }
  };
  const summary = activeSchedule?.summary;
  const planned = summary?.plannedProgress === null || summary?.plannedProgress === undefined ? null : Math.round(summary.plannedProgress);
  const slip = summary?.slipDays ?? selectedProject?.slipDays ?? null;
  return <>
    <PageHeader eyebrow="PROJECT CONTROL" title={uiText("Plan.title")} subtitle="Plan.subtitle" actions={<button className="btn ghost" type="button" disabled={loadingProjects || loadingSchedule} onClick={() => { void Promise.all([loadProjects(), loadSchedule()]); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>} />
    <Toolbar>
      <SearchInput value={projectQuery} onChange={setProjectQuery} placeholder="Plan.findProject" />
      <label className="select-field plan-project-picker"><select value={selectedId ?? ""} onChange={(event) => selectProject(event.target.value ? Number(event.target.value) : null)} aria-label={uiText("Project")}><option value=""><LocalizedText text={"Select project…"} /></option>{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.number} · {project.name}{project.status === "Closed" ? ` (${uiText("Closed")})` : ""}</option>)}</select><Icon name="chevronDown" /></label>
      <span className="spacer" />
      {activeSchedule ? <button className="btn default" type="button" disabled={!rows.length} onClick={() => {
        const exportedOn = isoToday();
        downloadErpEstimateWorkbookBytes(buildScheduleWorkbook({
          projectNo: activeSchedule.projectNo, projectName: activeSchedule.projectName, exportedOn,
          planStart: activeSchedule.summary.planStart, planFinish: activeSchedule.summary.planFinish, percentComplete: Number(activeSchedule.summary.percentComplete),
          labels: { title: uiText("Schedule.exportTitle"), project: uiText("Project"), exported: uiText("Schedule.exportedOn"), planPeriod: uiText("Plan period"), progress: uiText("Progress"),
            columns: ["WBS", uiText("Task"), uiText("Schedule.kind"), uiText("Visibility"), uiText("Schedule.planStart"), uiText("Schedule.planFinish"), uiText("Work days"), uiText("PIC"),
              uiText("Plan man-days"), uiText("Schedule.actualManDays"), uiText("Progress"), uiText("Status"), uiText("Schedule.actualStart"), uiText("Schedule.actualFinish"), uiText("Schedule.forecastFinish"), uiText("Remark")] },
          rows: rows.map((task) => ({ wbs: task.wbs, depth: task.depth, kind: task.kind, name: task.name, visibility: task.visibility,
            planStart: task.planStart, planFinish: task.planFinish, workDays: task.workDays,
            pics: [...task.pics.map((pic) => pic.name), task.picExternal].filter(Boolean).join(", "),
            planManDays: Number(task.planManDays), actualManDays: Number(task.actualManDays), percentComplete: Number(task.percentComplete), status: task.status,
            actualStart: task.actualStart, actualFinish: task.actualFinish, forecastFinish: task.forecastFinish, remark: task.remark })),
        }), scheduleWorkbookName(activeSchedule.projectNo, exportedOn));
      }}><Icon name="download" />{uiText("Schedule.exportExcel")}</button> : null}
      {canPlan ? <button className="btn default" type="button" disabled={!rows.length} onClick={() => setBaselineOpen(true)}><Icon name="gitBranch" /><LocalizedText text={"Create baseline"} /></button> : null}
      {canPlan ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add schedule row"} /></button> : null}
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void (selectedId ? loadSchedule() : loadProjects()); }} /> : null}
    {activeSchedule && summary ? <>
      <section className="plan-summary" aria-label={uiText("Plan.summary")}>
        <HealthBadge health={summary.health ?? selectedProject?.health ?? "No plan"} />
        <span><small>{uiText("Progress")}</small><strong>{number(Number(summary.percentComplete), 0)}%</strong>{planned !== null ? <em>{uiText("Portfolio.plannedToday")} {planned}%</em> : null}</span>
        <span><small>{uiText("Plan period")}</small><strong>{summary.planStart ? `${date(summary.planStart)} – ${date(summary.planFinish)}` : uiText("Not planned")}</strong></span>
        <span><small>{uiText("Target delivery")}</small><strong>{target ? date(target) : "—"}</strong>{slip !== null ? <em className={slip > 0 ? "late" : undefined}>{uiText("Portfolio.slipDays").replace("{n}", slip > 0 ? `+${slip}` : String(slip))}</em> : null}</span>
        <span><small>{uiText("Plan.overdue")}</small><strong className={summary.overdueCount ? "danger-text" : undefined}>{summary.overdueCount ?? "—"}</strong></span>
        <span><small>{uiText("Blocked")}</small><strong className={summary.blockedCount ? "danger-text" : undefined}>{summary.blockedCount}</strong></span>
        <span><small>{uiText("Baseline")}</small><strong>{activeSchedule.latestBaseline ? `R${activeSchedule.latestBaseline.revision}` : "—"}</strong></span>
        {loadingSchedule ? <span className="plan-summary-loading" role="status"><span className="spinner" />{uiText("Plan.refreshing")}</span> : null}
      </section>
      <Panel title={`${activeSchedule.projectNo} · ${activeSchedule.projectName}`} subtitle={`${rows.length} ${uiText("Plan.rows")} · ${uiText(activeSchedule.projectStatus)}`} flush>
        {rows.length ? <div className="plan-gantt">
          <div className="plan-gantt-controls">
            <FilterChips label="Plan.quickFilters" items={filterItems} active={filter} onPick={(key) => setFilter(key as PlanFilter | null)} />
            <GanttToolbar zoom={zoom} allowFit onZoom={(next) => { setZoom(next); setAnchor(today); }} onShift={(direction) => { if (zoom !== "fit") setAnchor((value) => shiftGanttAnchor(zoom, value, direction)); }} onToday={() => { if (zoom === "fit") setZoom("quarter"); setAnchor(today); }} />
          </div>
          <GanttLegend baseline={Boolean(activeSchedule.latestBaseline)} target={Boolean(target)} />
          {visible.length ? <GanttChart rows={ganttRows} range={range} today={today} sideHeader="Gantt.taskColumn" label="Gantt.planLabel" />
            : <EmptyState icon="filter" title="Plan.noMatch" message="Plan.noMatchHint" action={<button className="btn ghost sm" type="button" onClick={() => setFilter(null)}><Icon name="x" />{uiText("Portfolio.clearFilters")}</button>} />}
        </div> : loadingSchedule ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="calendar" title={uiText("This project has no schedule yet")} message={canPlan ? "สร้าง Phase หรือ Task แรกเพื่อเริ่มแผนโครงการ" : "Project Manager หรือ Engineering Manager เป็นผู้สร้างแผน"} />}
      </Panel>
      {(() => {
        const projectHistory = activeSchedule.recentUpdates.filter((update) => (update.taskId === null || !taskById.has(update.taskId)) && historyShown(update)).slice(0, 20);
        return projectHistory.length ? <details className="plan-project-history"><summary>{uiText("Plan.projectHistory")} ({projectHistory.length})</summary><ul className="plan-history">{projectHistory.map((update) => <li key={update.id}>
          <span className="plan-history-when">{dateTime(update.occurredAt)} · {update.actor.name}</span>
          <span><strong><LocalizedText text={myWorkAuditFieldLabel(update.field)} /></strong>{update.fromValue || update.toValue ? ` · ${historyValue(update.field, update.fromValue) ?? "—"} → ${historyValue(update.field, update.toValue) ?? "—"}` : ""}{historyReason(update)}</span>
        </li>)}</ul></details> : null;
      })()}
      {canAnswerRequests && pendingDayRequests.length ? <Panel title="Requests waiting for the PM" subtitle="Accepting extends the task plan; rejecting leaves the dates unchanged" flush><div className="panel-body">
        {pendingDayRequests.map((request) => {
          const requestedTask = request.taskId ? taskById.get(request.taskId) ?? null : null;
          return <div className="request-row" key={`pending:${request.id}`}><div className="request-head"><Badge tone="amber">+{request.requestDays} {"days"}</Badge><strong>{requestedTask ? `${requestedTask.wbs} · ${requestedTask.name}` : `Task ${request.taskId ?? "—"}`}</strong><span className="muted"><LocalizedText text={"requested by"} /> {request.actor.name} <LocalizedText text={"·"} /> {dateTime(request.occurredAt)}</span></div><p className="muted">{request.comment || "No reason provided"}</p><button className="btn primary sm" type="button" disabled={!requestedTask} onClick={() => setAnswerRequest(request)}><Icon name="checkCircle" /><LocalizedText text={"Review request"} /></button></div>;
        })}
      </div></Panel> : null}
    </> : loadingProjects || loadingSchedule ? <Panel><div className="empty"><span className="spinner" /><LocalizedText text={"Loading schedule…"} /></div></Panel> : <Panel><EmptyState icon="folder" title="No accessible project" message="สร้าง Project หรือขอสิทธิ์เข้าถึงโครงการก่อนเปิด Schedule" /></Panel>}
    {drawerTask && activeSchedule ? <PlanTaskDrawer
      task={drawerTask}
      schedule={activeSchedule}
      bootstrap={bootstrap}
      canPlan={canPlan}
      canAnswerRequests={canAnswerRequests}
      saving={saving || loadingSchedule}
      error={drawerError}
      notify={notify}
      onClose={() => { setDrawerTaskId(null); setDrawerError(""); }}
      onPatch={(patch, message) => { void saveTaskProgress(drawerTask, patch, message); }}
      onDetails={() => setProgressTask(drawerTask)}
      onEditPlan={() => setEditTask(drawerTask)}
      onImportDrawing={() => setDrawingTask({ projectId: activeSchedule.projectId, taskId: drawerTask.id })}
      onReview={setAnswerRequest}
    /> : null}
    {createOpen && activeSchedule ? <CreateScheduleTaskModal bootstrap={bootstrap} schedule={activeSchedule} onClose={() => setCreateOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} schedule row created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {editTask && activeSchedule ? <EditScheduleTaskModal bootstrap={bootstrap} schedule={activeSchedule} task={editTask} onClose={() => setEditTask(null)}
      onSaved={async () => { notify(`${activeSchedule.projectNo} · ${editTask.wbs} ${uiText("Schedule.rowSaved")}`); await loadSchedule(); }}
      onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {drawingTask ? <CreateSignableDocumentModal initialProjectId={drawingTask.projectId} initialTaskId={drawingTask.taskId} onClose={() => setDrawingTask(null)} onCreated={message => {setDrawingTask(null);notify(`${message} · Open Signed Documents to request approval`);}} /> : null}
    {baselineOpen && activeSchedule ? <BaselineModal schedule={activeSchedule} onClose={() => setBaselineOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} baseline created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {progressTask && activeSchedule ? <ProgressModal target={{ taskId: progressTask.id, projectNo: activeSchedule.projectNo, wbs: progressTask.wbs, name: progressTask.name, percentComplete: Number(progressTask.percentComplete), status: progressTask.status, actualStart: progressTask.actualStart, actualFinish: progressTask.actualFinish, forecastFinish: progressTask.forecastFinish, remark: workUserNote(progressTask.remark), originalRemark: progressTask.remark, rowVersion: progressTask.rowVersion }} latestRowVersion={taskById.get(progressTask.id)?.rowVersion} onClose={() => setProgressTask(null)} onSubmit={async (input, rowVersion) => {
      await apiRequest(`/api/v1/schedule/tasks/${progressTask.id}/updates`, { method: "POST", body: JSON.stringify({ scheduleVersion: activeSchedule.scheduleVersion, rowVersion, ...input }) });
      notify(`${activeSchedule.projectNo} · ${progressTask.wbs} progress updated`);
      await loadSchedule();
    }} onConflict={loadSchedule} /> : null}
    {answerRequest && activeSchedule ? <ScheduleDayRequestAnswerModal
      request={answerRequest}
      schedule={activeSchedule}
      task={answerRequest.taskId ? taskById.get(answerRequest.taskId) ?? null : null}
      onClose={() => setAnswerRequest(null)}
      onAnswered={async (answer) => { notify(`${activeSchedule.projectNo} day request ${answer.toLowerCase()}`); await loadSchedule(); }}
    /> : null}
  </>;
}

/** One task of the plan: its dates, the quick progress control, the plan owner's edit, and its history. */
function PlanTaskDrawer({ task, schedule: activeSchedule, bootstrap, canPlan, canAnswerRequests, saving, error, notify, onClose, onPatch, onDetails, onEditPlan, onImportDrawing, onReview }: {
  task: ScheduleTask;
  schedule: ProjectSchedule;
  bootstrap: BootstrapData;
  canPlan: boolean;
  canAnswerRequests: boolean;
  /** A save or a reload is running; the actions wait for the latest row. */
  saving: boolean;
  error: string;
  notify: (message: string) => void;
  onClose: () => void;
  onPatch: (patch: Partial<MyWorkProgressInput>, message: string) => void;
  onDetails: () => void;
  onEditPlan: () => void;
  onImportDrawing: () => void;
  onReview: (request: ScheduleUpdate) => void;
}) {
  const uiText = useUiText();
  const canProgress = canProgressScheduleRow(task, {
    scheduleAllowsProgress: activeSchedule.canUpdateProgress,
    hasProgressPermission: bootstrap.permissions.includes("schedule.progress"),
    userId: bootstrap.user.id,
  });
  const managed = Boolean(task.managedByResourcePlan);
  const canImportDrawing = canImportDrawingRow(task, {
    scheduleAllowsProgress: activeSchedule.canUpdateProgress,
    hasSigningRequest: bootstrap.permissions.includes("signing.request"),
    userId: bootstrap.user.id,
  });
  const leaf = isLeafTask(task);
  const history = activeSchedule.recentUpdates.filter((update) => update.taskId === task.id && historyShown(update));
  const pic = task.pics.map((person) => person.name).join(", ") || task.picExternal || "—";
  return <Drawer title={`${task.wbs} · ${task.name}`} subtitle={activeSchedule.projectNo} onClose={onClose} width={560}>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {managed ? <div className="info-strip"><ResourcePlanLock /><span>{uiText("Plan.managedHint")}</span></div> : null}
    <dl className="plan-facts">
      <div><dt>{uiText("Plan")}</dt><dd>{date(task.planStart)} – {date(task.planFinish)} · {task.workDays} {uiText("work days")}</dd></div>
      {task.baselineFinish ? <div><dt>{uiText("Baseline")}</dt><dd>{date(task.baselineStart)} – {date(task.baselineFinish)}</dd></div> : null}
      {task.forecastFinish ? <div><dt>{uiText("Forecast")}</dt><dd>{date(task.forecastFinish)}</dd></div> : null}
      {task.actualStart ? <div><dt>{uiText("Plan.actualDates")}</dt><dd>{date(task.actualStart)} → {task.actualFinish ? date(task.actualFinish) : "…"}</dd></div> : null}
      <div><dt>{uiText("PIC")}</dt><dd>{pic}</dd></div>
      {task.planManDays > 0 ? <div><dt>{uiText("Plan man-days")}</dt><dd>{number(Number(task.planManDays))} <LocalizedText text={"MD"} /></dd></div> : null}
      <div><dt>{uiText("Status")}</dt><dd><Badge tone={scheduleTone(task, isoToday())}>{uiText(task.status)}</Badge> <ProgressCell value={Number(task.percentComplete)} /></dd></div>
    </dl>
    {leaf && canProgress ? <section className="plan-drawer-section"><h3>{uiText("Plan.updateProgress")}</h3>
      <QuickProgressControls target={{ key: String(task.id), wbs: task.wbs, percentComplete: Number(task.percentComplete), status: task.status, actualStart: task.actualStart, actualFinish: task.actualFinish, forecastFinish: task.forecastFinish, planFinish: task.planFinish, remark: task.remark, updatedAt: String(task.updatedAt) }}
        editable={!saving} notify={notify} onPatch={onPatch} />
    </section> : null}
    <div className="row-actions plan-drawer-actions">
      {leaf && canProgress ? <button className="btn sm default" type="button" disabled={saving} onClick={onDetails}><Icon name="edit" /><LocalizedText text={"Update details"} /></button> : null}
      {canPlan && activeSchedule.projectStatus !== "Closed" && !managed ? <button className="btn sm ghost" type="button" disabled={saving} aria-label={`${uiText("Schedule.editRow")} ${task.wbs}`} onClick={onEditPlan}><Icon name="settings" />{uiText("Schedule.edit")}</button> : null}
      {canImportDrawing ? <button className="btn sm default" type="button" disabled={saving} onClick={onImportDrawing}><Icon name="upload" /><LocalizedText text={"Import Drawing"} /></button> : null}
    </div>
    <section className="plan-drawer-section"><h3>{uiText("Plan.history")}</h3>
      {history.length ? <ul className="plan-history">{history.map((update) => {
        const requestedTask = update.taskId === task.id ? task : null;
        const pendingRequest = update.field === "request" && update.requestDays > 0 && !update.answer;
        return <li key={update.id}>
          <span className="plan-history-when">{dateTime(update.occurredAt)} · {update.actor.name}</span>
          <span><strong><LocalizedText text={myWorkAuditFieldLabel(update.field)} /></strong>{update.requestDays > 0 ? ` · +${update.requestDays} ${uiText("days")}` : update.field === "plan" ? "" : ` · ${historyValue(update.field, update.fromValue) ?? "—"} → ${historyValue(update.field, update.toValue) ?? "—"}`}{historyReason(update)}</span>
          {pendingRequest && requestedTask && canAnswerRequests ? <button className="btn sm primary" type="button" onClick={() => onReview(update)}><Icon name="checkCircle" /><LocalizedText text={"Review"} /></button>
            : update.answer ? <span><Badge tone={update.answer === "Accepted" ? "green" : "red"}>{update.answer}</Badge> {update.answerBy?.name ?? "PM"}{update.answerNote ? ` · ${update.answerNote}` : ""}</span> : null}
        </li>;
      })}</ul> : <p className="muted">{uiText("Plan.noHistory")}</p>}
    </section>
  </Drawer>;
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

export function ProductionPriceLibrary({ bootstrap, notify }: ProductionPlanningProps) {
  const uiText = useUiText();
  const allowed = bootstrap.permissions.includes("estimate.read");
  /* The library itself is derived and has nothing to write to. Adding a price means
     recording the quotation it came from — done here so nobody has to know that. */
  const canAdd = bootstrap.permissions.includes("estimate.write");
  const { records, estimateCount, historicalCount, quotationLineCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [showAdd, setShowAdd] = useState(false);
  const [showLink, setShowLink] = useState(false);
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
    <PageHeader eyebrow="COST KNOWLEDGE" title={uiText("Price Library")} subtitle="รวม Cost item ของ Estimate ปัจจุบันและราคาซื้อจริงที่ตรวจสอบจาก PR/ใบเสนอราคา; ไม่มี Mock price" actions={<>
      <button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      {canAdd ? <button className="btn default" type="button" onClick={() => setShowAdd(true)}><Icon name="upload" /><LocalizedText text={"Upload quotation"} /></button> : null}
      {canAdd ? <button className="btn primary" type="button" onClick={() => setShowLink(true)}><Icon name="globe" /><LocalizedText text={"Add price"} /></button> : null}
    </>} />
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
            <td><div className="cell-primary">
              <strong>{record.priceSource || "Unspecified"}</strong>
              {/* A referenced price is only as good as the page it came from, so the
                  page is one click away rather than a number nobody can check. */}
              {record.sourceUrl
                ? <a className="mono" href={record.sourceUrl} target="_blank" rel="noopener noreferrer" title={record.sourceUrl}>
                  {record.referenceNumber || "—"} <Icon name="externalLink" /> {hostOf(record.sourceUrl)}
                </a>
                : <span className="mono">{record.referenceNumber || "—"} <LocalizedText text={"·"} /> {record.sourceKind}</span>}
            </div></td>
            <td><div className="cell-primary"><strong className="mono">{record.estimateNo}</strong><span>{record.projectName}</span></div></td>
            <td>{record.ownerName}</td>
            <td><Badge>{record.lineStatus}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading cost workspaces…"} /></div> : <EmptyState icon="book" title="No priced cost item found" message="ไม่พบข้อมูลตามตัวกรอง หรือยังไม่มี Unit cost ใน Estimate" />}
      <Pagination page={currentPage} pageCount={pageCount} from={from} to={to} total={rows.length} onPage={setPage} />
    </Panel>
    {showAdd ? <SupplierQuotationUploadModal bootstrap={bootstrap} onClose={() => setShowAdd(false)} onCreated={async (quotationNumber, lineCount) => {
      setShowAdd(false);
      notify(lineCount
        ? `${quotationNumber} · เพิ่ม ${lineCount} ราคาเข้าคลังแล้ว`
        : `${quotationNumber} · บันทึกเอกสารแล้วแต่ยังไม่มีรายการราคา`);
      await load();
    }} /> : null}
    {showLink ? <ReferencePriceModal bootstrap={bootstrap} onClose={() => setShowLink(false)} onCreated={async (quotationNumber, lineCount) => {
      setShowLink(false);
      notify(`${quotationNumber} · เพิ่ม ${lineCount} ราคาอ้างอิงเข้าคลังแล้ว`);
      await load();
    }} /> : null}
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

const blankQuotationLine = (lineNo: number, currency: string): QuotationLineItem => ({
  lineNo, itemCode: "", description: "", brand: "", model: "",
  qty: 1, unit: "EA", unitPrice: 0, currency, remark: "",
});

const quotationLinesTotal = (lines: QuotationLineItem[]) =>
  lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0);

/*
 * What the company already knows about the parts on a quotation.
 *
 * Importing a document only files it away; matching each line against the price
 * catalogue imports the knowledge with it. The catalogue supplies the brand and model
 * nobody ever types, and it puts what the part cost last time beside what it costs
 * now — so a rise is seen while the quotation is being entered rather than months
 * later at approval. It is also the only memory this flow has: every correction
 * someone made to an earlier line is what the next one is matched against.
 */
const CATALOGUE_MATCH_LIMIT = 20;
const CATALOGUE_DEBOUNCE_MS = 400;

/** "code:PLC-01" or "desc:Media converter" — a part number identifies far better. */
function catalogueKeyOf(line: QuotationLineItem): string | null {
  const code = line.itemCode.trim();
  if (code.length >= COST_ITEM_LOOKUP_MIN_CHARS) return `code:${code}`;
  const description = line.description.trim();
  return description.length >= COST_ITEM_LOOKUP_MIN_CHARS ? `desc:${description}` : null;
}

function useCatalogueMatches(lines: QuotationLineItem[]): Record<string, CostItemLookupRecord> {
  const [matches, setMatches] = useState<Record<string, CostItemLookupRecord>>({});
  const searched = useRef(new Set<string>());
  /* The effect depends on this one string rather than the array, and reads the keys
     back out of it, so the lookups re-run exactly when the set of parts changes. */
  const signature = lines.map(catalogueKeyOf).filter(Boolean).join("\n");

  useEffect(() => {
    const keys = Array.from(new Set(signature.split("\n").filter(Boolean)));
    const pending = keys.filter((key) => !searched.current.has(key)).slice(0, CATALOGUE_MATCH_LIMIT);
    if (!pending.length) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        /* Marked before the call, not after: a part the catalogue does not know, and a
           lookup that fails, both stop here rather than being asked again on every
           keystroke. This panel is help, not something to retry at the user's expense. */
        for (const key of pending) searched.current.add(key);
        const results = await mapSettledLimited(pending, 4, async (key) => {
          const field: CostItemLookupField = key.startsWith("code:") ? "itemCode" : "description";
          const { items } = await lookupCostItems({ q: key.slice(key.indexOf(":") + 1), field, limit: 1 });
          return { key, record: items[0] };
        });
        if (!active) return;
        const found: Record<string, CostItemLookupRecord> = {};
        for (const result of results) {
          if (result.ok && result.value.record) found[result.value.key] = result.value.record;
        }
        if (Object.keys(found).length) setMatches((previous) => ({ ...previous, ...found }));
      })();
    }, CATALOGUE_DEBOUNCE_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, [signature]);

  return matches;
}

/** Percentage this line moved against the catalogue, or null when there is nothing to compare. */
function priceChange(line: QuotationLineItem, match: CostItemLookupRecord): number | null {
  if (!(match.unitCost > 0) || !(line.unitPrice > 0)) return null;
  return ((line.unitPrice - match.unitCost) / match.unitCost) * 100;
}

type CatalogueRow = {
  line: QuotationLineItem;
  index: number;
  match: CostItemLookupRecord;
  change: number | null;
};

/*
 * The catalogue's answer, shown while the lines are still being typed: what each part
 * cost last time, and what this quotation is asking for it. The rise is the reason to
 * look — finding it here is worth more than finding it after the estimate is approved.
 */
function CatalogueComparison({ lines, matches, disabled, onChange }: {
  lines: QuotationLineItem[];
  matches: Record<string, CostItemLookupRecord>;
  disabled: boolean;
  onChange: (lines: QuotationLineItem[]) => void;
}) {
  const rows = lines.flatMap<CatalogueRow>((line, index) => {
    /* Cost lines are held in baht, so a foreign-currency line has nothing comparable. */
    if (line.currency !== "THB") return [];
    const key = catalogueKeyOf(line);
    const match = key ? matches[key] : undefined;
    return match ? [{ line, index, match, change: priceChange(line, match) }] : [];
  });
  if (!rows.length) return null;

  const missing = (value: string, known: string) => !value.trim() && Boolean(known);
  const fillable = rows.filter(({ line, match }) =>
    missing(line.itemCode, match.itemCode) || missing(line.brand, match.brand) || missing(line.model, match.model));
  /* Only the blanks are filled: whatever the supplier actually wrote stays as written. */
  const fill = () => onChange(lines.map((line, index) => {
    const row = rows.find((candidate) => candidate.index === index);
    if (!row) return line;
    return {
      ...line,
      itemCode: line.itemCode.trim() || row.match.itemCode,
      brand: line.brand.trim() || row.match.brand,
      model: line.model.trim() || row.match.model,
    };
  }));

  return <div className="catalogue-match">
    <div className="catalogue-match-head">
      <div>
        <strong>{`เคยซื้อแล้ว ${rows.length} จาก ${lines.length} รายการ`}</strong>
        <span>เทียบกับราคาล่าสุดที่บริษัทเคยจ่าย</span>
      </div>
      {fillable.length && !disabled ? <button className="btn ghost sm" type="button" onClick={fill}>
        <Icon name="check" />{`เติมรหัส/ยี่ห้อ/รุ่นที่ว่าง ${fillable.length} รายการ`}
      </button> : null}
    </div>
    <div className="table-wrap">
      <table style={{ minWidth: 760 }}>
        <thead><tr>
          <th><LocalizedText text={"Item"} /></th>
          <th><LocalizedText text={"Previous price"} /></th>
          <th><LocalizedText text={"This quotation"} /></th>
          <th><LocalizedText text={"Change"} /></th>
          <th><LocalizedText text={"Source / Reference"} /></th>
        </tr></thead>
        <tbody>{rows.map(({ line, match, change }) => <tr key={line.lineNo}>
          <td><div className="cell-primary">
            <strong className="mono">{match.itemCode || line.itemCode || "—"}</strong>
            <span>{line.description || match.description}</span>
          </div></td>
          <td className="num">{money(match.unitCost)}<small className="muted"> / {match.unit}</small></td>
          <td className="num">{money(line.unitPrice)}<small className="muted"> / {line.unit}</small></td>
          <td className="num">{change === null
            ? "—"
            : <Badge tone={change > 1 ? "red" : change < -1 ? "green" : "slate"}>
              {`${change > 0 ? "+" : ""}${number(change, 1)}%`}
            </Badge>}</td>
          <td><div className="cell-primary">
            <strong>{match.priceSource}</strong>
            <span className="mono">{match.sourceNumber} <LocalizedText text={"·"} /> {date(match.priceDate)}</span>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

/*
 * The price lines are the only part of a supplier quotation the Price Library reads.
 * The document is the evidence; these rows are the prices. They therefore get a real
 * entry grid — one row per price, the arithmetic on the right, a running total under
 * it — instead of the footnote they used to be beneath the header form.
 */
function QuotationLinesEditor({ lines, currency, minWidth = 920, disabled = false, emptyHint, onChange }: {
  lines: QuotationLineItem[];
  currency: string;
  minWidth?: number;
  disabled?: boolean;
  emptyHint?: string;
  onChange: (lines: QuotationLineItem[]) => void;
}) {
  const renumber = (next: QuotationLineItem[]) => next.map((line, index) => ({ ...line, lineNo: index + 1 }));
  const update = (index: number, patch: Partial<QuotationLineItem>) =>
    onChange(lines.map((line, position) => position === index ? { ...line, ...patch } : line));
  const remove = (index: number) => onChange(renumber(lines.filter((_, position) => position !== index)));
  const add = () => onChange([...lines, blankQuotationLine(lines.length + 1, currency)]);
  /* A row with no name or no price is stored but reaches the library as nothing useful. */
  const incomplete = lines.filter((line) => !line.description.trim() || !(line.unitPrice > 0)).length;
  const matches = useCatalogueMatches(lines);

  return <div className="quotation-lines">
    <div className="quotation-lines-head">
      <div>
        <strong><LocalizedText text={"Price lines"} /></strong>
        <span>{lines.length
          ? `${lines.length} รายการ · เข้าคลังราคาทันทีที่บันทึก`
          : "ยังไม่มีรายการ — ใบนี้จะไม่เพิ่มราคาเข้าคลัง"}</span>
      </div>
      {lines.length ? <button className="btn ghost sm" type="button" disabled={disabled} onClick={add}>
        <Icon name="plus" /><LocalizedText text={"Add line"} />
      </button> : null}
    </div>
    {lines.length ? <div className="quotation-lines-grid">
      <div className="table-wrap">
        <table className="sheet" style={{ minWidth }}>
          <thead><tr>
            <th style={{ width: 34 }}>#</th>
            <th style={{ width: 124 }}><LocalizedText text={"Item code"} /></th>
            <th><LocalizedText text={"Description"} /></th>
            <th style={{ width: 118 }}><LocalizedText text={"Brand"} /></th>
            <th style={{ width: 66 }}><LocalizedText text={"Qty"} /></th>
            <th style={{ width: 70 }}><LocalizedText text={"Unit"} /></th>
            <th style={{ width: 112 }}><LocalizedText text={"Unit price"} /></th>
            <th style={{ width: 112 }}><LocalizedText text={"Line total"} /></th>
            <th style={{ width: 74 }}><LocalizedText text={"Currency"} /></th>
            <th style={{ width: 36 }} />
          </tr></thead>
          <tbody>{lines.map((line, index) => <tr key={index}>
            <td className="computed" style={{ fontWeight: 400, color: "var(--muted)", textAlign: "center" }}>{line.lineNo}</td>
            <td><input value={line.itemCode} disabled={disabled} maxLength={200} placeholder="—"
              onChange={(event) => update(index, { itemCode: event.target.value })} /></td>
            <td><input value={line.description} disabled={disabled} maxLength={500} placeholder="ชื่อรายการ"
              onChange={(event) => update(index, { description: event.target.value })} /></td>
            <td><input value={line.brand} disabled={disabled} maxLength={100} placeholder="—"
              onChange={(event) => update(index, { brand: event.target.value })} /></td>
            <td><input className="num" type="number" min="0.0001" step="1" value={line.qty} disabled={disabled}
              onChange={(event) => update(index, { qty: Number(event.target.value) })} /></td>
            <td><input value={line.unit} disabled={disabled} maxLength={50}
              onChange={(event) => update(index, { unit: event.target.value })} /></td>
            <td><input className="num" type="number" min="0" step="0.01" value={line.unitPrice} disabled={disabled}
              onChange={(event) => update(index, { unitPrice: Number(event.target.value) })} /></td>
            <td className="computed">{number((Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 2)}</td>
            <td><select value={line.currency} disabled={disabled}
              onChange={(event) => update(index, { currency: event.target.value })}>
              <option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select></td>
            <td><button className="btn ghost sm" type="button" disabled={disabled} title="Remove line"
              style={{ padding: "2px 6px" }} onClick={() => remove(index)}><Icon name="x" /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="quotation-lines-foot">
        {incomplete
          ? <span className="warn"><Icon name="alertTriangle" /> {incomplete} รายการยังไม่มีชื่อหรือราคา</span>
          : <span />}
        <span><LocalizedText text={"Lines total"} /> <strong>{number(quotationLinesTotal(lines), 2)}</strong> {currency}</span>
      </div>
    </div> : <button className="quotation-lines-empty" type="button" disabled={disabled} onClick={add}>
      <Icon name="plus" />
      <span>
        <strong><LocalizedText text={"Add the first price line"} /></strong>
        <small>{emptyHint ?? "กรอกชื่อรายการกับราคาต่อหน่วย แล้วราคาจะเข้าคลังราคาทันทีที่บันทึก"}</small>
      </span>
    </button>}
    <CatalogueComparison lines={lines} matches={matches} disabled={disabled} onChange={onChange} />
  </div>;
}

function SupplierQuotationUploadModal({ bootstrap, onClose, onCreated }: {
  bootstrap: BootstrapData;
  onClose: () => void;
  onCreated: (quotationNumber: string, lineCount: number) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [receivedDate, setReceivedDate] = useState(isoToday());
  const [validUntil, setValidUntil] = useState(addIsoDays(isoToday(), 30));
  const [currency, setCurrency] = useState<SupplierQuotationRecord["currency"]>("THB");
  const [amount, setAmount] = useState("");
  /* True once the total has been stated rather than derived — by the PDF or by hand. */
  const [amountPinned, setAmountPinned] = useState(false);
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
  const pdfObjectUrlRef = useRef<string | null>(null);

  const hasParsed = Object.keys(confidence).length > 0;

  const selectFile = (selectedFile: File | null) => {
    if (pdfObjectUrlRef.current) URL.revokeObjectURL(pdfObjectUrlRef.current);

    setFile(selectedFile);
    if (selectedFile?.name.toLowerCase().endsWith(".pdf")) {
      const url = URL.createObjectURL(selectedFile);
      pdfObjectUrlRef.current = url;
      setPdfObjectUrl(url);
      setShowPdf(true);
      return;
    }

    pdfObjectUrlRef.current = null;
    setPdfObjectUrl(null);
    setShowPdf(false);
  };

  useEffect(() => {
    return () => {
      if (pdfObjectUrlRef.current) URL.revokeObjectURL(pdfObjectUrlRef.current);
    };
  }, []);

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
    setAmountPinned(false);
    setLines([]);
    try {
      const result: ParsedQuotationResult = await parsePdfViaBackend(targetFile);

      setConfidence(result.confidence ?? {});

      if (result.quotationNumber) setSupplierReference(result.quotationNumber);
      if (result.receivedDate) setReceivedDate(result.receivedDate);
      if (result.validUntil) setValidUntil(result.validUntil);
      if (result.currency) setCurrency(result.currency);
      /* A total printed on the document outranks the line arithmetic: it can include
         freight, discount or tax that no single line carries. */
      if (result.totalAmount > 0) { setAmount(String(result.totalAmount)); setAmountPinned(true); }

      // Auto-match supplier: try exact/substring match against master data first;
      // fall back to pre-filling the new-supplier text box so user can confirm.
      if (result.supplierName) {
        const normalizedParsed = result.supplierName.toLowerCase().trim();
        const matched = bootstrap.suppliers.find(
          (s) => s.name.toLowerCase() === normalizedParsed
            || s.name.toLowerCase().includes(normalizedParsed)
            || normalizedParsed.includes(s.name.toLowerCase()),
        );
        if (matched) {
          setSupplierId(String(matched.id));
          setNewSupplierName("");
        } else {
          setNewSupplierName(result.supplierName);
        }
      }

      // Auto-populate line items extracted from the PDF
      if (result.lines?.length > 0) {
        const parsed = result.lines.map((l, i) => ({ ...l, lineNo: i + 1, currency: l.currency || result.currency }));
        setLines(parsed);
        /* No total was printed, so the lines are the only statement of what it costs. */
        if (!(result.totalAmount > 0)) {
          const total = quotationLinesTotal(parsed);
          if (total > 0) setAmount(String(Number(total.toFixed(4))));
        }
      }

      if (result.requiresOcr) {
        setParseWarning("PDF เป็นไฟล์สแกน — ระบบอ่านได้บางส่วน กรุณาตรวจสอบทุก field");
      }
    } catch (e) {
      setError(`Parse PDF ไม่สำเร็จ: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setParsing(false);
    }
  };

  /* While nothing has stated the total, the lines are the total — typing a price is
     then the whole job. Once the PDF or the user states one it stays put. */
  const applyLines = (next: QuotationLineItem[]) => {
    setLines(next);
    if (amountPinned) return;
    const total = quotationLinesTotal(next);
    setAmount(total > 0 ? String(Number(total.toFixed(4))) : "");
  };

  const parsedAmount = Number(amount);
  const hasSupplier = !!supplierId || !!newSupplierName.trim();
  const invalid = !hasSupplier || !receivedDate || !validUntil || validUntil < receivedDate
    || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !file;

  // Warn when manual line items total doesn't match declared amount (>1% diff)
  const linesTotal = quotationLinesTotal(lines);
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

      /* Lines travel with the document: the backend commits both or neither, so an
         upload can no longer succeed while the prices it carried vanish unreported. */
      const created = await createSupplierQuotation({
        file, supplierId: resolvedSupplierId,
        supplierReference: supplierReference.trim(), receivedDate, validUntil,
        inquiryId: inquiryId ? Number(inquiryId) : undefined, currency, amount: parsedAmount,
        lines,
      });
      await onCreated(created.quotationNumber, created.lineCount);
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
          <strong>อ่าน PDF แล้ว</strong> · Supplier / วันที่ / ยอดรวม / สกุลเงิน / รายการสินค้า ถูก fill อัตโนมัติ
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
    {/* Uploading with no lines stores a document and no price — say so before it happens. */}
    {file && !parsing && !lines.length ? (
      <div className="callout warning" style={{ marginBottom: 12 }}>
        <Icon name="alertTriangle" />
        <span>
          <strong>ยังไม่มีรายการราคา</strong>
          อัปโหลดตอนนี้จะได้เฉพาะไฟล์เอกสาร คลังราคาจะไม่ได้ราคาจากใบนี้ — เพิ่มรายการด้านล่างก่อน
        </span>
      </div>
    ) : null}
    {linesTotalMismatch && (
      <div className="callout warning" style={{ marginBottom: 12 }}>
        <Icon name="alertTriangle" />
        <span>ผลรวมรายการ ({number(linesTotal, 2)}) ไม่ตรงกับยอดใบเสนอราคา ({number(parsedAmount, 2)}) — ต่างกันได้ถ้ามีค่าขนส่ง ภาษี หรือส่วนลด</span>
        <button className="btn ghost sm" type="button" style={{ whiteSpace: "nowrap", alignSelf: "center" }}
          onClick={() => { setAmount(String(Number(linesTotal.toFixed(4)))); setAmountPinned(true); }}>
          ใช้ยอดรวมรายการ
        </button>
      </div>
    )}

    {/* Main layout: form on left, PDF viewer on right when showPdf */}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>

      {/* ── Left: form content ── */}
      <div style={{ flex: "1 1 0", minWidth: 0 }}>

        {/* File selector — auto-parses PDF on select */}
        <div className="form-grid two" style={{ marginBottom: 16 }}>
          <Field label="Quotation file *" hint="PDF → อ่านอัตโนมัติ · Excel, CSV, JPG, PNG · maximum 50 MB" span={2}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="file" accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={(event) => {
                  const f = event.target.files?.[0] ?? null;
                  selectFile(f); setConfidence({}); setParseWarning(""); setNewSupplierName("");
                  setLines([]); setAmount(""); setAmountPinned(false);
                  if (f?.name.toLowerCase().endsWith(".pdf")) void parsePdf(f);
                }} />
              {isPdf && parsing && <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}><span className="spinner" /> กำลังอ่าน PDF…</span>}
              {isPdf && !parsing && !hasParsed && (
                <button className="btn ghost sm" type="button" disabled={busy}
                  onClick={() => { if (file) void parsePdf(file); }} style={{ whiteSpace: "nowrap" }}>
                  <Icon name="eye" /> Parse PDF
                </button>
              )}
              {/* Hiding the document used to be one-way: the only path back was picking the file again. */}
              {pdfObjectUrl && !showPdf ? (
                <button className="btn ghost sm" type="button" style={{ whiteSpace: "nowrap" }}
                  onClick={() => setShowPdf(true)}>
                  <Icon name="eye" /> แสดง PDF
                </button>
              ) : null}
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
            <Field label="Quotation amount *" hint={confHint("totalAmount") ?? (amountPinned ? undefined : "คิดจากผลรวมรายการให้อัตโนมัติ แก้เองได้")}>
              <input type="number" min="0.0001" step="0.01" value={amount} placeholder="0.00"
                onChange={(event) => { setAmount(event.target.value); setAmountPinned(true); }} />
            </Field>
          </div>
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
        <div className="quotation-pdf-pane">
          <div className="quotation-pdf-head">
            <span>PDF ต้นฉบับ</span>
            <button className="btn ghost sm" type="button" onClick={() => setShowPdf(false)} style={{ padding: "2px 8px" }}>
              <Icon name="x" /> ซ่อน
            </button>
          </div>
          <iframe src={pdfObjectUrl} title="PDF Preview" />
        </div>
      )}

    </div>

    {/*
      The price lines get the full width of the dialog rather than the half left over
      beside the PDF. Squeezed into that half, the description column — the one thing
      an engineer reads to know what the line is — collapsed to a single character.
    */}
    <QuotationLinesEditor
      lines={lines}
      currency={currency}
      disabled={busy}
      emptyHint={parsing
        ? "กำลังอ่าน PDF…"
        : hasParsed
          ? "ไม่พบรายการในไฟล์ — กรอกเองได้เลย ชื่อรายการกับราคาต่อหน่วยก็พอ"
          : "กรอกชื่อรายการกับราคาต่อหน่วย หรือเลือกไฟล์ PDF ให้ระบบอ่านรายการให้"}
      onChange={applyLines}
    />
  </Modal>;
}

function EditQuotationModal({
  record,
  bootstrap,
  onClose,
  onSaved,
}: {
  record: SupplierQuotationRecord;
  bootstrap: BootstrapData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState(String(record.supplierId));
  const [supplierReference, setSupplierReference] = useState(record.supplierReference);
  const [receivedDate, setReceivedDate] = useState(record.receivedDate);
  const [validUntil, setValidUntil] = useState(record.validUntil);
  const [currency, setCurrency] = useState<SupplierQuotationRecord["currency"]>(record.currency);
  const [amount, setAmount] = useState(String(record.amount));
  const [inquiryId, setInquiryId] = useState(record.inquiryId ? String(record.inquiryId) : "");
  const [inquiries, setInquiries] = useState<{ id: number; number: string; projectName: string; customerName: string }[]>([]);
  const [sourceUrl, setSourceUrl] = useState(record.sourceUrl);
  const [lines, setLines] = useState<QuotationLineItem[]>([]);
  /* Until the existing lines are in hand, saving must not touch them: a write replaces
     them wholesale, so saving an unloaded list would erase the prices already stored. */
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listInquiries({ page: 1, pageSize: 100 }).then((r) =>
      setInquiries(r.items.map((i) => ({ id: i.id, number: i.number, projectName: i.projectName, customerName: i.customerName })))
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void listQuotationLines(record.id)
      .then((loaded) => { if (active) { setLines(loaded); setLinesLoaded(true); } })
      .catch((loadError) => { if (active) setError("โหลดรายการราคาไม่สำเร็จ: " + toError(loadError)); });
    return () => { active = false; };
  }, [record.id]);

  const isReference = record.sourceKind === "WebReference";
  const urlLooksOpenable = /^https?:\/\/[^\s<>"']+$/i.test(sourceUrl.trim());
  const parsedAmount = Number(amount);
  const invalid = !supplierId || !receivedDate || !validUntil || validUntil < receivedDate
    || !Number.isFinite(parsedAmount) || parsedAmount <= 0
    || (isReference && !urlLooksOpenable);
  const linesTotal = quotationLinesTotal(lines);
  const linesTotalMismatch = lines.length > 0 && parsedAmount > 0
    && Math.abs(linesTotal - parsedAmount) > parsedAmount * 0.01;

  const submit = async () => {
    if (invalid) return;
    setBusy(true); setError("");
    try {
      await updateSupplierQuotation(record.id, {
        supplierId: Number(supplierId),
        supplierReference: supplierReference.trim(),
        receivedDate,
        validUntil,
        currency,
        amount: parsedAmount,
        inquiryId: inquiryId ? Number(inquiryId) : null,
        ...(isReference ? { sourceUrl: sourceUrl.trim() } : {}),
        rowVersion: record.rowVersion,
      });
      if (linesLoaded) await saveQuotationLines(record.id, lines);
      onSaved();
    } catch (e) {
      setError(toError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit ${record.quotationNumber}`}
      subtitle="แก้หัวใบเสนอราคาและรายการราคา — รายการที่บันทึกคือสิ่งที่เข้าคลังราคา"
      size="xl"
      onClose={onClose}
      footer={<>
        <button className="btn default" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || invalid} onClick={() => { void submit(); }}>
          <Icon name="check" />{busy ? "Saving…" : "Save changes"}
        </button>
      </>}
    >
      {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
      {linesTotalMismatch ? (
        <div className="callout warning">
          <Icon name="alertTriangle" />
          <span>ผลรวมรายการ ({number(linesTotal, 2)}) ไม่ตรงกับยอดใบเสนอราคา ({number(parsedAmount, 2)}) — ต่างกันได้ถ้ามีค่าขนส่ง ภาษี หรือส่วนลด</span>
          <button className="btn ghost sm" type="button" style={{ whiteSpace: "nowrap", alignSelf: "center" }}
            onClick={() => setAmount(String(Number(linesTotal.toFixed(4))))}>
            ใช้ยอดรวมรายการ
          </button>
        </div>
      ) : null}
      <div className="form-grid two">
        <Field label="Supplier *">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— เลือก Supplier —</option>
            {bootstrap.suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier reference">
          <input maxLength={200} value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="e.g. QT-2609-001" />
        </Field>
        <Field label="Received date *">
          <input type="date" value={receivedDate} onChange={(e) => { setReceivedDate(e.target.value); if (e.target.value && validUntil < e.target.value) setValidUntil(addIsoDays(e.target.value, 30)); }} />
        </Field>
        <Field label="Valid until *">
          <input type="date" min={receivedDate || undefined} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
        <Field label="Currency *">
          <select value={currency} onChange={(e) => setCurrency(e.target.value as SupplierQuotationRecord["currency"])}>
            <option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </Field>
        <Field label="Amount *">
          <input type="number" min="0.0001" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        {/* A reference price is only checkable through its link, so the link is editable
            here; a document-backed row keeps its stored file and the server refuses one. */}
        {isReference ? (
          <Field label="Source link *" span={2}
            hint={urlLooksOpenable ? "หน้าเว็บที่อ่านราคานี้มา" : "ต้องขึ้นต้นด้วย http:// หรือ https://"}>
            <input value={sourceUrl} maxLength={1000} inputMode="url" placeholder="https://..."
              onChange={(e) => setSourceUrl(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Related inquiry" span={2}>
          <select value={inquiryId} onChange={(e) => setInquiryId(e.target.value)}>
            <option value="">Not linked</option>
            {inquiries.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.projectName} · {i.customerName}</option>)}
          </select>
        </Field>
      </div>
      {linesLoaded
        ? <QuotationLinesEditor lines={lines} currency={currency} disabled={busy} onChange={setLines} />
        : <div className="quotation-lines"><div className="empty"><span className="spinner" />กำลังโหลดรายการราคา…</div></div>}
    </Modal>
  );
}

/*
 * A price read off a vendor's public page. Deliberately small next to the upload
 * dialog: a supplier, the link, the day it was read, and the prices. There is no
 * file to attach because there is no document — the link and the date are what make
 * the number checkable months later, and the row is stored saying exactly that, so
 * it can never be read back as a price the supplier quoted.
 */
function ReferencePriceModal({ bootstrap, onClose, onCreated }: {
  bootstrap: BootstrapData;
  onClose: () => void;
  onCreated: (quotationNumber: string, lineCount: number) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [capturedDate, setCapturedDate] = useState(isoToday());
  const [validUntil, setValidUntil] = useState(addIsoDays(isoToday(), 30));
  const [currency, setCurrency] = useState<SupplierQuotationRecord["currency"]>("THB");
  /* One empty row, so the first thing on screen is a box to type a price into. */
  const [lines, setLines] = useState<QuotationLineItem[]>([blankQuotationLine(1, "THB")]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const trimmedUrl = sourceUrl.trim();
  const urlLooksOpenable = /^https?:\/\/[^\s<>"']+$/i.test(trimmedUrl);
  const hasSupplier = !!supplierId || !!newSupplierName.trim();
  const priced = lines.filter((line) => line.description.trim() && line.unitPrice > 0).length;
  /* The lines are the whole price here: a web page has no separate stated total. */
  const linesTotal = quotationLinesTotal(lines);
  const invalid = !hasSupplier || !urlLooksOpenable || !capturedDate || !validUntil
    || validUntil < capturedDate || !priced || linesTotal <= 0;

  const submit = async () => {
    if (invalid) return;
    setBusy(true); setError("");
    try {
      let resolvedSupplierId = supplierId ? Number(supplierId) : 0;
      if (!resolvedSupplierId) {
        const found = await findOrCreateSupplier({ name: newSupplierName.trim(), taxId: "" });
        resolvedSupplierId = found.id;
        setSupplierId(String(found.id));
      }
      const created = await createReferencePrice({
        supplierId: resolvedSupplierId, sourceUrl: trimmedUrl,
        supplierReference: supplierReference.trim(), receivedDate: capturedDate, validUntil,
        currency, amount: linesTotal, lines: lines.filter((line) => line.description.trim()),
      });
      await onCreated(created.quotationNumber, created.lineCount);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    title="Add price from a link"
    subtitle="ราคาที่อ่านจากหน้าเว็บผู้ขาย — ไม่ต้องแนบไฟล์ แต่ต้องมีลิงก์และวันที่อ่าน"
    size="xl"
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || invalid} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? "กำลังบันทึก…" : `บันทึก ${priced} ราคาเข้าคลัง`}
      </button>
    </>}
  >
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout">
      <Icon name="globe" />
      <span>
        <strong>ราคาอ้างอิง ไม่ใช่ราคายืนยันจากผู้ขาย</strong>
        ในคลังราคาจะติดป้าย <em>Web reference</em> แยกจากใบเสนอราคาจริง และราคาหน้าเว็บเปลี่ยนได้ตลอด — วันที่อ่านคือสิ่งเดียวที่บอกว่าราคานี้เก่าแค่ไหน
      </span>
    </div>

    <div className="form-grid two">
      <Field label="Supplier *">
        <select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setNewSupplierName(""); }}>
          <option value="">— เลือก Supplier (หรือกรอกชื่อใหม่ด้านล่าง) —</option>
          {bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}
        </select>
        {!supplierId ? <div style={{ marginTop: 6 }}>
          <input placeholder="ชื่อ Supplier ใหม่..." value={newSupplierName} maxLength={200} style={{ width: "100%" }}
            onChange={(event) => setNewSupplierName(event.target.value)} />
        </div> : null}
      </Field>
      <Field label="Source link *" hint={trimmedUrl && !urlLooksOpenable ? "ต้องขึ้นต้นด้วย http:// หรือ https://" : "วาง URL ของหน้าที่เห็นราคา"}>
        <input value={sourceUrl} maxLength={1000} placeholder="https://..." inputMode="url"
          onChange={(event) => setSourceUrl(event.target.value)} />
      </Field>
      <Field label="Captured date *" hint="วันที่เปิดหน้านั้นและเห็นราคานี้">
        <input type="date" value={capturedDate} onChange={(event) => {
          setCapturedDate(event.target.value);
          if (event.target.value && validUntil < event.target.value) setValidUntil(addIsoDays(event.target.value, 30));
        }} />
      </Field>
      <Field label="Treat as current until *" hint="พ้นวันนี้แล้วคลังราคาจะเตือนให้เช็กใหม่">
        <input type="date" min={capturedDate || undefined} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
      </Field>
      <Field label="Currency *">
        <select value={currency} onChange={(event) => setCurrency(event.target.value as SupplierQuotationRecord["currency"])}>
          <option value="THB">THB</option><option value="JPY">JPY</option><option value="USD">USD</option><option value="EUR">EUR</option>
        </select>
      </Field>
      <Field label="Page or catalogue reference" hint="เช่น รหัสหน้า, ชื่อแคตตาล็อก (ไม่บังคับ)">
        <input maxLength={200} value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} placeholder="—" />
      </Field>
    </div>

    <QuotationLinesEditor
      lines={lines}
      currency={currency}
      disabled={busy}
      emptyHint="กรอกชื่อรายการกับราคาต่อหน่วยที่เห็นบนหน้าเว็บ"
      onChange={setLines}
    />
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
  const [showLink, setShowLink] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SupplierQuotationRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const deleteQuotation = async (record: SupplierQuotationRecord) => {
    if (!window.confirm(`ลบ ${record.quotationNumber} (${record.supplierName}) ใช่หรือไม่?\nการลบไม่สามารถย้อนกลับได้`)) return;
    setDeletingId(record.id);
    try {
      await deleteSupplierQuotation(record.id);
      setRefreshKey((v) => v + 1);
      notify(`ลบ ${record.quotationNumber} แล้ว`);
    } catch (e) {
      notify("ลบไม่สำเร็จ: " + toError(e));
    } finally {
      setDeletingId(null);
    }
  };

  return <>
    <PageHeader
      eyebrow="SUPPLIER SOURCING"
      title="Supplier Quotations"
      subtitle="ใบเสนอราคาผู้ขายพร้อมไฟล์ต้นฉบับ และราคาอ้างอิงจากหน้าเว็บที่บันทึกลิงก์ไว้แทนไฟล์"
      actions={<>
        <button className="btn ghost" type="button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
        {canUpload ? <button className="btn default" type="button" onClick={() => setShowLink(true)}><Icon name="globe" /><LocalizedText text={"Add price"} /></button> : null}
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
        <table style={{ minWidth: 1600 }}>
          <thead><tr><th><LocalizedText text={"Quotation No."} /></th><th><LocalizedText text={"Supplier reference"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Valid until"} /></th><th><LocalizedText text={"Inquiry / Project"} /></th><th><LocalizedText text={"Currency"} /></th><th><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"Price lines"} /></th><th><LocalizedText text={"Uploaded by"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Attachment"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead>
          <tbody>{result.items.map((record) => <tr key={record.id}>
            <td><strong className="mono">{record.quotationNumber}</strong></td>
            <td className="mono">{record.supplierReference || "—"}</td>
            <td><strong>{record.supplierName}</strong></td>
            <td>{date(record.receivedDate)}</td>
            <td>{date(record.validUntil)}</td>
            <td><div className="cell-primary"><strong className="mono">{record.inquiryNumber || "Not linked"}</strong><span>{record.projectName || "—"}</span></div></td>
            <td><Badge>{record.currency}</Badge></td>
            <td className="num"><strong>{supplierQuotationCurrency(record.amount, record.currency)}</strong></td>
            {/* Zero here is the failure this column exists to expose: a stored document
                that put no price into the Price Library. */}
            <td className="num">{record.lineCount > 0
              ? <strong>{record.lineCount}</strong>
              : <Badge tone="amber"><LocalizedText text={"No price line"} /></Badge>}</td>
            <td><div className="cell-primary"><strong>{record.uploadedByName}</strong><span>{dateTime(record.uploadedAt)}</span></div></td>
            <td><Badge>{record.status}</Badge></td>
            {/* A reference has no file to describe; the page it cites stands in its place. */}
            <td><div className="cell-primary">{record.sourceKind === "WebReference"
              ? <>
                <strong><LocalizedText text={"Web reference"} /></strong>
                <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" title={record.sourceUrl}>
                  <Icon name="externalLink" /> {hostOf(record.sourceUrl)}
                </a>
              </>
              : <>
                <strong>{quotationFileKind(record.fileName)}</strong>
                <span title={record.fileName}>{record.fileName} <LocalizedText text={"·"} /> {number(record.sizeBytes / 1024, 1)} KB</span>
              </>}</div></td>
            <td>
              <div style={{ display: "flex", gap: 4 }}>
                {record.sourceKind === "Document" ? (
                  <button className="btn ghost sm" type="button" disabled={downloadingId === record.id} onClick={() => { void download(record); }}>
                    <Icon name="download" />{downloadingId === record.id ? "Downloading…" : <LocalizedText text={"Download"} />}
                  </button>
                ) : null}
                {canUpload && (
                  <button className="btn ghost sm" type="button" onClick={() => setEditingRecord(record)}>
                    <Icon name="edit" />{record.lineCount
                      ? <LocalizedText text={"Edit"} />
                      : <LocalizedText text={"Add price"} />}
                  </button>
                )}
                {canUpload && (
                  <button className="btn ghost sm" type="button" disabled={deletingId === record.id} onClick={() => { void deleteQuotation(record); }}
                    style={{ color: "#dc2626" }}>
                    <Icon name="trash" />{deletingId === record.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading supplier quotations…"} /></div> : <EmptyState icon="quote" title="No supplier quotation found" message="อัปโหลด PDF, Excel หรือรูปใบเสนอราคาผู้ขายเพื่อสร้างรายการแรก" action={canUpload ? <button className="btn primary" type="button" onClick={() => setShowUpload(true)}><Icon name="upload" /><LocalizedText text={"Upload quotation"} /></button> : undefined} />}
      <Pagination page={page} pageCount={pageCount} from={from} to={to} total={result.total} onPage={setPage} />
    </Panel>
    {showUpload ? <SupplierQuotationUploadModal bootstrap={bootstrap} onClose={() => setShowUpload(false)} onCreated={async (quotationNumber, lineCount) => {
      setShowUpload(false);
      setPage(1);
      setRefreshKey((value) => value + 1);
      notify(lineCount
        ? `${quotationNumber} อัปโหลดแล้ว · ${lineCount} ราคาเข้าคลังราคา`
        : `${quotationNumber} อัปโหลดแล้ว · ยังไม่มีรายการราคา กด Add price เพื่อเพิ่ม`);
    }} /> : null}
    {showLink ? <ReferencePriceModal bootstrap={bootstrap} onClose={() => setShowLink(false)} onCreated={async (quotationNumber, lineCount) => {
      setShowLink(false);
      setPage(1);
      setRefreshKey((value) => value + 1);
      notify(`${quotationNumber} · เพิ่ม ${lineCount} ราคาอ้างอิงเข้าคลังแล้ว`);
    }} /> : null}
    {editingRecord ? (
      <EditQuotationModal
        record={editingRecord}
        bootstrap={bootstrap}
        onClose={() => setEditingRecord(null)}
        onSaved={() => {
          setEditingRecord(null);
          setRefreshKey((v) => v + 1);
          notify("Quotation updated");
        }}
      />
    ) : null}
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
