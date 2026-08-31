"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError,
  apiRequest,
  listEstimates,
  listProjects,
  loadEstimateCostWorkspace,
  type BootstrapData,
  type EstimateCostItem,
  type EstimateSummary,
  type ProjectSummary,
} from "../api-client";
import {
  Badge,
  EmptyState,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Panel,
  ProgressCell,
  SearchInput,
  Select,
  Toolbar,
} from "../ui";

type ProductionPlanningProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
};

type MyWorkItem = {
  projectId: number;
  projectNo: string;
  projectName: string;
  taskId: number;
  parentId: number | null;
  wbs: string;
  name: string;
  planStart: string | null;
  planFinish: string | null;
  workDays: number;
  percentComplete: number;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  remark: string | null;
  rowVersion: string;
  updatedAt: string;
};

type SchedulePic = { id: number; name: string; email: string };

type ScheduleTask = {
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
  occurredAt: string;
  actor: { id: number; name: string };
};

type ProjectSchedule = {
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
  skippedWorkspaces: number;
};

type ScheduleLoadState = {
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
  remark: string | null;
};

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const isConcurrencyConflict = (error: unknown) => error instanceof ApiClientError
  && error.status === 409
  && error.code === "concurrency_conflict";
const money = (value: number) => new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
}).format(value);
const number = (value: number, maximumFractionDigits = 2) => new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(value);
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : "—";
const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", {
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
const sourceIncludesSupplier = (value: string) => /supplier|quotation|quote/i.test(value);
const flattenTasks = (tasks: ScheduleTask[]): ScheduleTask[] => tasks.flatMap((task) => [task, ...flattenTasks(task.children)]);
const leafTasks = (schedule: ProjectSchedule) => flattenTasks(schedule.tasks).filter((task) => task.kind !== "phase" && task.children.length === 0);

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert">
    <Icon name="alertTriangle" />
    <span><strong>โหลดข้อมูลไม่สำเร็จ</strong><small>{message}</small></span>
    <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />ลองใหม่</button>
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
  const estimates = await loadAllEstimates();
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
  records.sort((a, b) => (b.priceDate ?? "").localeCompare(a.priceDate ?? "") || b.itemId - a.itemId);
  return {
    records,
    estimateCount: estimates.length,
    skippedWorkspaces: settled.filter((item) => !item.ok).length,
  };
}

async function loadSchedules(): Promise<ScheduleLoadState> {
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
  const [state, setState] = useState<PriceLoadState>({ records: [], estimateCount: 0, skippedWorkspaces: 0 });
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
  onSubmit: (input: { percentComplete: number; status: string; actualStart: string | null; actualFinish: string | null; remark: string }) => Promise<void>;
  onConflict?: () => Promise<void>;
}) {
  const [percent, setPercent] = useState(Number(target.percentComplete));
  const [status, setStatus] = useState(target.status);
  const [actualStart, setActualStart] = useState(target.actualStart ?? "");
  const [actualFinish, setActualFinish] = useState(target.actualFinish ?? "");
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
    || Boolean(actualFinish && (!actualStart || actualFinish < actualStart));
  return <Modal
    title={`Update ${target.wbs} · ${target.name}`}
    subtitle={`${target.projectNo} · บันทึกลง SQL Server และ audit log`}
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || invalid}>
        <Icon name="check" />{busy ? "Saving…" : "Save progress"}
      </button>
    </>}
  >
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field"><span>Status *</span><select value={status} onChange={(event) => changeStatus(event.target.value)}><option>Not Started</option><option>In Progress</option><option>Blocked</option><option>Done</option></select></label>
      <label className="field"><span>Percent complete *</span><input type="number" min="0" max="100" step="1" value={percent} onChange={(event) => setPercent(Number(event.target.value))} /></label>
      <label className="field"><span>Actual start</span><input type="date" value={actualStart} onChange={(event) => setActualStart(event.target.value)} /></label>
      <label className="field"><span>Actual finish</span><input type="date" min={actualStart || undefined} value={actualFinish} onChange={(event) => setActualFinish(event.target.value)} /></label>
      <label className="field span-2"><span>Remark</span><textarea maxLength={20000} value={remark} onChange={(event) => setRemark(event.target.value)} /></label>
    </div>
  </Modal>;
}

export function ProductionMyWork({ bootstrap, notify }: ProductionPlanningProps) {
  const hasProgressPermission = bootstrap.permissions.includes("schedule.progress");
  const hasReadPermission = bootstrap.permissions.includes("schedule.read");
  const allowed = hasProgressPermission && hasReadPermission;
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [editableKeys, setEditableKeys] = useState<Set<string>>(() => new Set());
  const [unverifiedProjects, setUnverifiedProjects] = useState(0);
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [active, setActive] = useState<MyWorkItem | null>(null);
  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setError(""); setEditableKeys(new Set()); setUnverifiedProjects(0);
    try {
      const loaded = await apiRequest<MyWorkItem[]>("/api/v1/me/work");
      const projectIds = Array.from(new Set(loaded.map((item) => item.projectId)));
      const schedules = await mapSettledLimited(projectIds, 5, (projectId) =>
        apiRequest<ProjectSchedule>(`/api/v1/projects/${projectId}/schedule`));
      const nextEditable = new Set<string>();
      schedules.forEach((result, index) => {
        if (!result.ok) return;
        const tasks = new Map(flattenTasks(result.value.tasks).map((task) => [task.id, task]));
        loaded.filter((item) => item.projectId === projectIds[index]).forEach((item) => {
          const task = tasks.get(item.taskId);
          if (task && task.kind !== "phase" && task.children.length === 0
            && task.pics.some((pic) => pic.id === bootstrap.user.id)) {
            nextEditable.add(`${item.projectId}:${item.taskId}`);
          }
        });
      });
      setItems(loaded);
      setEditableKeys(nextEditable);
      setUnverifiedProjects(schedules.filter((result) => !result.ok).length);
    }
    catch (requestError) { setEditableKeys(new Set()); setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [allowed, bootstrap.user.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const rows = useMemo(() => items.filter((item) => {
    const matchesSearch = `${item.projectNo} ${item.projectName} ${item.wbs} ${item.name}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === "All status" || item.status === status);
  }), [items, search, status]);
  const overdue = items.filter((item) => item.status !== "Done" && isBeforeToday(item.planFinish)).length;
  const blocked = items.filter((item) => item.status === "Blocked").length;
  const activeCount = items.filter((item) => item.status === "In Progress").length;
  if (!allowed) {
    const missing = [!hasProgressPermission ? "schedule.progress" : "", !hasReadPermission ? "schedule.read" : ""].filter(Boolean).join(" + ");
    return <><PageHeader eyebrow="PERSONAL WORKSPACE" title="My Work" subtitle="งาน Schedule ที่มอบหมายให้ผู้ใช้ปัจจุบัน" /><PermissionNotice permission={missing} message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์อ่าน Schedule และอัปเดต Progress ให้บทบาทนี้" /></>;
  }
  return <>
    <PageHeader eyebrow="PERSONAL WORKSPACE" title="My Work" subtitle="งานที่มอบหมายให้คุณโดยตรงจาก Schedule ของโครงการจริง" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>} />
    <div className="kpi-grid four">
      <KpiCard label="Assigned tasks" value={items.length} note="งานที่เป็น PIC" tone="blue" icon="checkCircle" />
      <KpiCard label="In progress" value={activeCount} note="กำลังดำเนินการ" tone="violet" icon="play" />
      <KpiCard label="Blocked" value={blocked} note="ต้องการความช่วยเหลือ" tone="amber" icon="alertTriangle" />
      <KpiCard label="Overdue" value={overdue} note="เลยกำหนดและยังไม่เสร็จ" tone={overdue ? "red" : "green"} icon="clock" />
    </div>
    <Toolbar>
      <SearchInput value={search} onChange={setSearch} placeholder="Search project, WBS or task…" />
      <Select label="Status" value={status} onChange={setStatus} options={["All status", "Not Started", "In Progress", "Blocked", "Done"]} />
    </Toolbar>
    {unverifiedProjects ? <div className="callout warning"><Icon name="alertTriangle" /><span><strong>บาง Project ตรวจสอบสิทธิ์แก้ไขไม่ได้</strong><small>ปุ่ม Update ถูกปิดไว้สำหรับงานจาก {unverifiedProjects} Project จนกว่าจะโหลด Schedule สำเร็จ</small></span></div> : null}
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${rows.length} assigned tasks`} subtitle={loading ? "Loading from production API…" : "Live schedule assignments"} flush>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th>Project</th><th>WBS / Task</th><th>Plan</th><th>Days</th><th>Progress</th><th>Status</th><th>Remark</th><th>Updated</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={`${item.projectId}:${item.taskId}`}>
        <td><div className="cell-primary"><strong className="mono">{item.projectNo}</strong><span>{item.projectName}</span></div></td>
        <td><div className="cell-primary"><strong>{item.wbs} · {item.name}</strong><span>Task ID {item.taskId}</span></div></td>
        <td>{date(item.planStart)} – {date(item.planFinish)}</td>
        <td className="num">{item.workDays}</td>
        <td style={{ minWidth: 120 }}><ProgressCell value={Number(item.percentComplete)} /></td>
        <td><Badge>{item.status}</Badge></td>
        <td className="wrap">{item.remark || "—"}</td>
        <td>{dateTime(item.updatedAt)}</td>
        <td>{editableKeys.has(`${item.projectId}:${item.taskId}`)
          ? <button className="btn sm default" type="button" disabled={loading} onClick={() => setActive(item)}><Icon name="edit" />Update</button>
          : <span className="muted" title="Only an assigned PIC can update a non-phase leaf task">Not editable</span>}</td>
      </tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="checkCircle" title="No assigned schedule task" message="เมื่อ Project Manager มอบหมาย PIC งานจะแสดงที่นี่" />}
    </Panel>
    {active ? <ProgressModal target={{ ...active }} onClose={() => setActive(null)} onSubmit={async (input) => {
      const schedule = await apiRequest<ProjectSchedule>(`/api/v1/projects/${active.projectId}/schedule`);
      const freshTask = flattenTasks(schedule.tasks).find((task) => task.id === active.taskId);
      if (!freshTask) throw new Error("Task นี้ไม่มีอยู่ใน Schedule ล่าสุดแล้ว กรุณารีเฟรชรายการ");
      if (freshTask.kind === "phase" || freshTask.children.length > 0
        || !freshTask.pics.some((pic) => pic.id === bootstrap.user.id)) {
        throw new Error("Task นี้ไม่ใช่งานย่อยที่คุณมีสิทธิ์อัปเดตแล้ว กรุณารีเฟรชรายการ");
      }
      await apiRequest(`/api/v1/schedule/tasks/${active.taskId}/updates`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion: schedule.scheduleVersion, rowVersion: freshTask.rowVersion, ...input }),
      });
      notify(`${active.projectNo} · ${active.wbs} progress updated`);
      await load();
    }} onConflict={async () => {
      notify(`${active.projectNo} · ${active.wbs} changed by another user; the list was reloaded`);
      await load();
    }} /> : null}
  </>;
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
    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
    <button className="btn primary" type="button" disabled={busy || !name.trim() || (kind === "task" && (!planStart || planDays < 1))} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Saving…" : "Create row"}</button>
  </>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field"><span>Row kind *</span><select value={kind} onChange={(event) => { const value = event.target.value as "phase" | "task"; setKind(value); if (value === "phase") setParentId(""); }}><option value="task">Task</option><option value="phase">Phase (roll-up)</option></select></label>
      <label className="field"><span>Visibility *</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option>Internal</option><option>Customer</option></select></label>
      <label className="field span-2"><span>Name *</span><input maxLength={500} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {kind === "task" ? <>
        <label className="field"><span>Parent phase</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Top-level task</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.wbs} · {phase.name}</option>)}</select></label>
        <label className="field"><span>Plan start *</span><input type="date" value={planStart} onChange={(event) => setPlanStart(event.target.value)} /></label>
        <label className="field"><span>Plan days *</span><input type="number" min="1" max="3650" value={milestone ? 1 : planDays} disabled={milestone} onChange={(event) => setPlanDays(Number(event.target.value))} /></label>
        <label className="field"><span>Plan man-days</span><input type="number" min="0" max="1000000" step="0.25" value={planManDays} onChange={(event) => setPlanManDays(Number(event.target.value))} /></label>
        <label className="field"><span>PIC (known project member)</span><select value={picUserId} onChange={(event) => setPicUserId(event.target.value)}><option value="">Unassigned</option>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.department}</option>)}</select><small>{eligibleMembers.length ? "แสดงเฉพาะ Project Manager, ผู้ใช้ปัจจุบัน และ PIC ที่พบใน Schedule; API จะตรวจสอบสมาชิกอีกครั้ง" : "ยังไม่พบผู้ใช้ที่ยืนยันได้จาก Schedule นี้ จึงบันทึกเป็น Unassigned เท่านั้น"}</small></label>
        <label className="field"><span>External PIC</span><input maxLength={300} value={picExternal} onChange={(event) => setPicExternal(event.target.value)} /></label>
        <label className="checkbox-row span-2"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} />Milestone (1 day)</label>
      </> : <div className="callout warning span-2"><Icon name="alertCircle" /><span><strong>Phase เป็นแถวสรุป</strong><small>วันที่ ระยะเวลา และความคืบหน้าจะคำนวณจาก Task ใต้ Phase</small></span></div>}
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
    <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
    <button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || !label.trim() || !reason.trim()}><Icon name="check" />{busy ? "Saving…" : "Create baseline"}</button>
  </>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="form-grid two">
      <label className="field span-2"><span>Label *</span><input maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label className="field span-2"><span>Reason *</span><textarea maxLength={20000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
  </Modal>;
}

export function ProductionProjectSchedule({ bootstrap, notify }: ProductionPlanningProps) {
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
  const scheduleRequestId = useRef(0);
  const loadProjects = useCallback(async () => {
    if (!allowed) return;
    setLoadingProjects(true); setError("");
    try {
      const loaded = await loadAllProjects();
      setProjects(loaded);
      setSelectedId((current) => current && loaded.some((project) => project.id === current) ? current : loaded[0]?.id ?? null);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoadingProjects(false); }
  }, [allowed]);
  const loadSchedule = useCallback(async () => {
    const requestId = ++scheduleRequestId.current;
    setCreateOpen(false);
    setBaselineOpen(false);
    setProgressTask(null);
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
  if (!allowed) return <><PageHeader eyebrow="PROJECT CONTROL" title="Project Schedule" subtitle="แผนงานและความคืบหน้าจากฐานข้อมูลจริง" /><PermissionNotice permission="schedule.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Schedule Read ให้บทบาทนี้" /></>;
  const activeSchedule = schedule?.projectId === selectedId && !loadingSchedule ? schedule : null;
  const rows = activeSchedule ? flattenTasks(activeSchedule.tasks) : [];
  const canPlan = Boolean(activeSchedule?.canPlan && bootstrap.permissions.includes("schedule.plan"));
  return <>
    <PageHeader eyebrow="PROJECT CONTROL" title="Project Schedule" subtitle="จัดทำแผน อัปเดตความคืบหน้า และเก็บ Baseline พร้อม concurrency control" actions={<button className="btn ghost" type="button" disabled={loadingProjects || loadingSchedule} onClick={() => { void Promise.all([loadProjects(), loadSchedule()]); }}><Icon name="refresh" />Refresh</button>} />
    <Toolbar>
      <label className="select-field" style={{ minWidth: 320 }}><select style={{ maxWidth: 520, width: "100%" }} value={selectedId ?? ""} onChange={(event) => {
        const nextId = event.target.value ? Number(event.target.value) : null;
        scheduleRequestId.current += 1;
        setCreateOpen(false);
        setBaselineOpen(false);
        setProgressTask(null);
        setSchedule(null);
        setLoadingSchedule(Boolean(nextId));
        setSelectedId(nextId);
      }} aria-label="Project"><option value="">Select project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.number} · {project.name}</option>)}</select><Icon name="chevronDown" /></label>
      <span className="spacer" />
      {canPlan ? <button className="btn default" type="button" disabled={!rows.length} onClick={() => setBaselineOpen(true)}><Icon name="gitBranch" />Create baseline</button> : null}
      {canPlan ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Add schedule row</button> : null}
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
        {rows.length ? <div className="table-wrap"><table><thead><tr><th>WBS</th><th>Task</th><th>Visibility</th><th>Plan</th><th>Work days</th><th>PIC</th><th>Effort</th><th>Progress</th><th>Status</th><th /></tr></thead><tbody>{rows.map((task) => {
          const canProgress = activeSchedule.canUpdateProgress
            && bootstrap.permissions.includes("schedule.progress")
            && task.kind !== "phase"
            && task.children.length === 0
            && task.pics.some((pic) => pic.id === bootstrap.user.id);
          return <tr key={task.id}>
            <td><strong className="mono">{task.wbs}</strong></td>
            <td style={{ paddingLeft: 10 + task.depth * 18 }}><div className="cell-primary"><strong>{task.name}</strong><span>{task.kind}{task.isMilestone ? " · Milestone" : ""} · {task.origin}</span></div></td>
            <td><Badge tone={task.visibility === "Customer" ? "blue" : "slate"}>{task.visibility}</Badge></td>
            <td>{date(task.planStart)} – {date(task.planFinish)}</td>
            <td className="num">{task.workDays}</td>
            <td>{task.pics.length ? task.pics.map((pic) => pic.name).join(", ") : task.picExternal || "—"}</td>
            <td className="num">{number(task.planManDays)} MD</td>
            <td style={{ minWidth: 120 }}><ProgressCell value={Number(task.percentComplete)} /></td>
            <td><Badge>{task.status}</Badge></td>
            <td>{canProgress ? <button className="btn sm default" type="button" onClick={() => setProgressTask(task)}><Icon name="edit" />Update</button> : null}</td>
          </tr>;
        })}</tbody></table></div> : loadingSchedule ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="calendar" title="This project has no schedule yet" message={canPlan ? "สร้าง Phase หรือ Task แรกเพื่อเริ่มแผนโครงการ" : "Project Manager หรือ Engineering Manager เป็นผู้สร้างแผน"} />}
      </Panel>
      {activeSchedule.recentUpdates.length ? <Panel title="Recent schedule activity" subtitle="100 รายการล่าสุดจาก audit trail ของ Schedule" flush><div className="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Task</th><th>Field</th><th>Change</th><th>Comment</th></tr></thead><tbody>{activeSchedule.recentUpdates.slice(0, 20).map((update) => <tr key={update.id}><td>{dateTime(update.occurredAt)}</td><td>{update.actor.name}</td><td>{update.taskId ?? "Schedule"}</td><td><Badge>{update.field}</Badge></td><td className="wrap">{update.fromValue ?? "—"} → {update.toValue ?? "—"}</td><td className="wrap">{update.comment || "—"}</td></tr>)}</tbody></table></div></Panel> : null}
    </> : loadingProjects || loadingSchedule ? <Panel><div className="empty"><span className="spinner" />Loading schedule…</div></Panel> : <Panel><EmptyState icon="folder" title="No accessible project" message="สร้าง Project หรือขอสิทธิ์เข้าถึงโครงการก่อนเปิด Schedule" /></Panel>}
    {createOpen && activeSchedule ? <CreateScheduleTaskModal bootstrap={bootstrap} schedule={activeSchedule} onClose={() => setCreateOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} schedule row created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {baselineOpen && activeSchedule ? <BaselineModal schedule={activeSchedule} onClose={() => setBaselineOpen(false)} onCreated={async () => { notify(`${activeSchedule.projectNo} baseline created`); await loadSchedule(); }} onConflict={async () => { notify(`${activeSchedule.projectNo} schedule changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
    {progressTask && activeSchedule ? <ProgressModal target={{ taskId: progressTask.id, projectNo: activeSchedule.projectNo, wbs: progressTask.wbs, name: progressTask.name, percentComplete: Number(progressTask.percentComplete), status: progressTask.status, actualStart: progressTask.actualStart, actualFinish: progressTask.actualFinish, remark: progressTask.remark }} onClose={() => setProgressTask(null)} onSubmit={async (input) => {
      await apiRequest(`/api/v1/schedule/tasks/${progressTask.id}/updates`, { method: "POST", body: JSON.stringify({ scheduleVersion: activeSchedule.scheduleVersion, rowVersion: progressTask.rowVersion, ...input }) });
      notify(`${activeSchedule.projectNo} · ${progressTask.wbs} progress updated`);
      await loadSchedule();
    }} onConflict={async () => { notify(`${activeSchedule.projectNo} · ${progressTask.wbs} changed by another user; reloaded latest data`); await loadSchedule(); }} /> : null}
  </>;
}

export function ProductionResourcePlan({ bootstrap }: ProductionPlanningProps) {
  const hasScheduleRead = bootstrap.permissions.includes("schedule.read");
  const hasProjectRead = bootstrap.permissions.includes("project.read");
  const allowed = hasScheduleRead && hasProjectRead;
  const { projects, schedules, skippedSchedules, loading, error, load } = useSchedules(allowed);
  if (!allowed) {
    const missing = [!hasScheduleRead ? "schedule.read" : "", !hasProjectRead ? "project.read" : ""].filter(Boolean).join(" + ");
    return <><PageHeader eyebrow="CAPACITY VISIBILITY" title="Resource Plan" subtitle="ภาระงานจริงจาก Project Schedule" /><PermissionNotice permission={missing} message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์อ่าน Project และ Schedule ให้บทบาทนี้" /></>;
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
    <PageHeader eyebrow="CAPACITY VISIBILITY" title="Resource Plan" subtitle="สรุป PIC และ Planned man-days จาก Schedule จริง; ระบบไม่สมมติ Capacity ที่ยังไม่มี Master data" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>} />
    <div className="kpi-grid four">
      <KpiCard label="Projects loaded" value={schedules.length} note={`${projects.length} projects returned by portfolio`} tone="blue" icon="folder" />
      <KpiCard label="Planned tasks" value={allLeaves.length} note="leaf schedule tasks" tone="violet" icon="checkCircle" />
      <KpiCard label="Planned effort" value={`${number(plannedEffort)} MD`} note="ยังไม่หักวันหยุดรายบุคคล" tone="green" icon="users" />
      <KpiCard label="Unassigned" value={unassigned} note="tasks without internal PIC" tone={unassigned ? "amber" : "green"} icon="alertTriangle" />
    </div>
    {skippedSchedules ? <div className="callout warning"><Icon name="alertTriangle" /><span><strong>บางโครงการไม่ถูกนำมารวม</strong><small>โหลด Schedule ไม่สำเร็จหรือไม่มีสิทธิ์ {skippedSchedules} โครงการจาก {projects.length} โครงการ</small></span></div> : null}
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <div className="grid-main">
      <Panel title={`${resourceRows.length} active team members`} subtitle="Effort แบ่งเท่ากันเมื่อ Task มี PIC หลายคน" flush>
        {resourceRows.length ? <div className="table-wrap"><table><thead><tr><th>Team member</th><th>Role / Department</th><th>Assigned</th><th>Active</th><th>Overdue</th><th>Planned effort</th><th>Next finish</th></tr></thead><tbody>{resourceRows.map(({ member, assigned, active, overdue, effort, nextFinish }) => <tr key={member.id}><td><div className="cell-primary"><strong>{member.name}</strong><span>{member.email}</span></div></td><td><div className="cell-primary"><strong>{member.role}</strong><span>{member.department} · {member.level || "—"}</span></div></td><td className="num">{assigned}</td><td className="num">{active}</td><td className="num">{overdue ? <Badge tone="red">{overdue}</Badge> : "0"}</td><td className="num"><strong>{number(effort)} MD</strong></td><td>{date(nextFinish)}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="users" title="No active team member" message="Provision users before assigning schedule work" />}
      </Panel>
      <Panel title="Schedule coverage" subtitle="ข้อมูลที่ใช้คำนวณ Resource Plan" flush>
        {schedules.length ? <div className="table-wrap"><table><thead><tr><th>Project</th><th>Tasks</th><th>Progress</th><th>Plan finish</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.projectId}><td><div className="cell-primary"><strong className="mono">{schedule.projectNo}</strong><span>{schedule.projectName}</span></div></td><td className="num">{schedule.summary.taskCount}</td><td style={{ minWidth: 105 }}><ProgressCell value={Number(schedule.summary.percentComplete)} /></td><td>{date(schedule.summary.planFinish)}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading…</div> : <EmptyState icon="calendar" title="No schedule data" message="สร้าง Schedule ในโครงการเพื่อเริ่ม Resource Plan" />}
      </Panel>
    </div>
  </>;
}

function PriceAgeBadge({ record }: { record: PriceRecord }) {
  if (record.ageDays === null) return <Badge tone="amber">No date</Badge>;
  if (record.ageDays <= 90) return <Badge tone="green">{record.ageDays} days</Badge>;
  if (record.ageDays <= 180) return <Badge tone="amber">{record.ageDays} days</Badge>;
  return <Badge tone="red">{record.ageDays} days</Badge>;
}

function PriceLoadWarning({ estimateCount, skippedWorkspaces }: Pick<PriceLoadState, "estimateCount" | "skippedWorkspaces">) {
  return skippedWorkspaces ? <div className="callout warning"><Icon name="alertTriangle" /><span><strong>Price view บางส่วนไม่ถูกโหลด</strong><small>ไม่สามารถอ่าน Cost workspace {skippedWorkspaces} จาก {estimateCount} estimates ได้ รายการที่แสดงยังคงเป็นข้อมูลจริงที่โหลดสำเร็จเท่านั้น</small></span></div> : null;
}

export function ProductionPriceLibrary({ bootstrap }: ProductionPlanningProps) {
  const allowed = bootstrap.permissions.includes("estimate.read");
  const { records, estimateCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("All sources");
  if (!allowed) return <><PageHeader eyebrow="COST KNOWLEDGE" title="Price Library" subtitle="ราคาที่ใช้งานจริงจาก Estimate cost items" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;
  const priced = records.filter((record) => record.unitCost > 0);
  const sources = ["All sources", ...Array.from(new Set(priced.map((record) => record.priceSource).filter(Boolean))).sort()];
  const rows = priced.filter((record) => {
    const haystack = `${record.itemCode} ${record.description} ${record.brand} ${record.model} ${record.supplierName ?? ""} ${record.estimateNo} ${record.projectName} ${record.referenceNumber ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (source === "All sources" || record.priceSource === source);
  });
  const fresh = priced.filter((record) => record.ageDays !== null && record.ageDays <= 90).length;
  const aging = priced.filter((record) => record.ageDays !== null && record.ageDays > 90 && record.ageDays <= 180).length;
  const stale = priced.filter((record) => record.ageDays === null || record.ageDays > 180).length;
  return <>
    <PageHeader eyebrow="COST KNOWLEDGE" title="Price Library" subtitle="สร้างจาก Cost item ของ revision ปัจจุบันใน Estimate จริงที่เข้าถึงได้; ไม่มี Mock price" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>} />
    <div className="kpi-grid four"><KpiCard label="Price usages" value={priced.length} note={`from ${estimateCount} estimates`} tone="blue" icon="book" /><KpiCard label="Fresh 0–90 days" value={fresh} note="ตรวจ Price date" tone="green" icon="checkCircle" /><KpiCard label="Aging 91–180" value={aging} note="พิจารณายืนยันราคา" tone="amber" icon="clock" /><KpiCard label="Stale / undated" value={stale} note="ขอราคาใหม่ก่อนอนุมัติ" tone={stale ? "red" : "green"} icon="alertTriangle" /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search item, brand, model, supplier, project or reference…" /><Select label="Price source" value={source} onChange={setSource} options={sources} /></Toolbar>
    <PriceLoadWarning estimateCount={estimateCount} skippedWorkspaces={skippedWorkspaces} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${rows.length} live price records`} subtitle="แต่ละแถวคือการใช้ราคาใน Estimate cost item จริง" flush>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Brand / Model</th><th>Supplier</th><th>Unit price</th><th>Price date / Age</th><th>Source</th><th>Reference</th><th>Estimate / Project</th><th>Owner</th></tr></thead><tbody>{rows.map((record) => <tr key={record.key}><td><div className="cell-primary"><strong className="mono">{record.itemCode || `LINE-${record.itemId}`}</strong><span>{record.description}</span></div></td><td><div className="cell-primary"><strong>{record.brand || "—"}</strong><span>{record.model || "—"}</span></div></td><td>{record.supplierName || "—"}</td><td className="num"><strong>{money(record.unitCost)}</strong><small className="muted"> / {record.unit}</small></td><td><div className="cell-primary"><strong>{date(record.priceDate)}</strong><span><PriceAgeBadge record={record} /></span></div></td><td><Badge>{record.priceSource || "Unspecified"}</Badge></td><td className="mono">{record.referenceNumber || "—"}</td><td><div className="cell-primary"><strong className="mono">{record.estimateNo}</strong><span>{record.projectName}</span></div></td><td>{record.ownerName}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading cost workspaces…</div> : <EmptyState icon="book" title="No priced cost item found" message="เพิ่ม Unit cost ใน Estimate เพื่อสร้าง Price record จริงรายการแรก" />}
    </Panel>
  </>;
}

export function ProductionSupplierQuotations({ bootstrap }: ProductionPlanningProps) {
  const allowed = bootstrap.permissions.includes("estimate.read");
  const { records, estimateCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [search, setSearch] = useState("");
  if (!allowed) return <><PageHeader eyebrow="SUPPLIER SOURCING" title="Supplier Quotations" subtitle="แหล่งราคาผู้ขายที่ผูกกับ Estimate" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;
  const supplierRows = records.filter((record) => record.supplierId !== null && (sourceIncludesSupplier(record.priceSource) || Boolean(record.referenceNumber)));
  const rows = supplierRows.filter((record) => `${record.supplierName ?? ""} ${record.referenceNumber ?? ""} ${record.itemCode} ${record.description} ${record.estimateNo} ${record.projectName}`.toLowerCase().includes(search.toLowerCase()));
  const supplierCount = new Set(supplierRows.map((record) => record.supplierId)).size;
  const referenced = supplierRows.filter((record) => Boolean(record.referenceNumber)).length;
  const stale = supplierRows.filter((record) => record.ageDays === null || record.ageDays > 180).length;
  return <>
    <PageHeader eyebrow="SUPPLIER SOURCING" title="Supplier Quotations" subtitle="รายการนี้สรุปจาก Cost item ที่มี Supplier และ Price source/reference จริง; ระบบยังไม่สร้างเอกสาร quotation จำลอง" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>} />
    <div className="kpi-grid four"><KpiCard label="Supplier-linked lines" value={supplierRows.length} note={`from ${estimateCount} estimates`} tone="blue" icon="quote" /><KpiCard label="Suppliers" value={supplierCount} note="unique linked suppliers" tone="violet" icon="truck" /><KpiCard label="With reference" value={referenced} note="traceable source number" tone="green" icon="paperclip" /><KpiCard label="Stale / undated" value={stale} note="older than 180 days" tone={stale ? "red" : "green"} icon="alertTriangle" /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search supplier, quotation reference, item, estimate or project…" /></Toolbar>
    <PriceLoadWarning estimateCount={estimateCount} skippedWorkspaces={skippedWorkspaces} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${rows.length} supplier-linked price records`} subtitle="เลขอ้างอิงว่างหมายถึง Cost item ยังไม่ได้ผูกเลขเอกสารผู้ขาย" flush>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Supplier</th><th>Item</th><th>Price</th><th>Date / Age</th><th>Source</th><th>Estimate</th><th>Project</th><th>Status</th></tr></thead><tbody>{rows.map((record) => <tr key={record.key}><td><strong className="mono">{record.referenceNumber || "No reference"}</strong></td><td>{record.supplierName}</td><td><div className="cell-primary"><strong className="mono">{record.itemCode || `LINE-${record.itemId}`}</strong><span>{record.description}</span></div></td><td className="num"><strong>{money(record.unitCost)}</strong></td><td><div className="cell-primary"><strong>{date(record.priceDate)}</strong><span><PriceAgeBadge record={record} /></span></div></td><td><Badge>{record.priceSource}</Badge></td><td className="mono">{record.estimateNo}</td><td>{record.projectName}</td><td><Badge>{record.lineStatus}</Badge></td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading cost workspaces…</div> : <EmptyState icon="quote" title="No supplier-linked price source" message="ระบุ Supplier และ Price source/reference ใน Estimate cost item เพื่อให้แสดงที่นี่" />}
    </Panel>
  </>;
}

export function ProductionWaitingSupplierPrice({ bootstrap }: ProductionPlanningProps) {
  const allowed = bootstrap.permissions.includes("estimate.read");
  const { records, estimateCount, skippedWorkspaces, loading, error, load } = usePrices(allowed);
  const [search, setSearch] = useState("");
  if (!allowed) return <><PageHeader eyebrow="PRICE FOLLOW-UP" title="Waiting Supplier Price" subtitle="รายการราคาผู้ขายที่ต้องติดตาม" /><PermissionNotice permission="estimate.read" message="ผู้ดูแลระบบต้องเพิ่มสิทธิ์ Estimate Read ให้บทบาทนี้" /></>;
  const waiting = records.filter((record) => record.supplierId !== null && (record.unitCost <= 0 || record.ageDays === null || record.ageDays > 180));
  const rows = waiting.filter((record) => `${record.supplierName ?? ""} ${record.itemCode} ${record.description} ${record.estimateNo} ${record.projectName}`.toLowerCase().includes(search.toLowerCase()));
  const missing = waiting.filter((record) => record.unitCost <= 0).length;
  const undated = waiting.filter((record) => record.unitCost > 0 && record.ageDays === null).length;
  const stale = waiting.filter((record) => record.unitCost > 0 && record.ageDays !== null && record.ageDays > 180).length;
  const reason = (record: PriceRecord) => record.unitCost <= 0 ? "Missing / zero price" : record.ageDays === null ? "Missing price date" : `Stale ${record.ageDays} days`;
  return <>
    <PageHeader eyebrow="PRICE FOLLOW-UP" title="Waiting Supplier Price" subtitle="Derivation: Cost item ต้องมี Supplier และราคาเป็นศูนย์/ไม่มี Price date/เก่ากว่า 180 วัน โดยคำนวณจากวันที่ปัจจุบัน" actions={<button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" />Refresh</button>} />
    <div className="kpi-grid four"><KpiCard label="Needs follow-up" value={waiting.length} note={`from ${estimateCount} estimates`} tone="amber" icon="clock" /><KpiCard label="Missing / zero" value={missing} note="no usable unit price" tone={missing ? "red" : "green"} icon="alertTriangle" /><KpiCard label="Missing date" value={undated} note="cannot validate price age" tone={undated ? "amber" : "green"} icon="calendar" /><KpiCard label="Older than 180" value={stale} note="request reconfirmation" tone={stale ? "red" : "green"} icon="refresh" /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search supplier, item, estimate or project…" /></Toolbar>
    <PriceLoadWarning estimateCount={estimateCount} skippedWorkspaces={skippedWorkspaces} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${rows.length} supplier price follow-ups`} subtitle="รายการนี้เป็นมุมมองคำนวณจากข้อมูลจริง ไม่ได้เปลี่ยนสถานะ Cost item อัตโนมัติ" flush>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th>Reason</th><th>Supplier</th><th>Item</th><th>Current price</th><th>Price date</th><th>Estimate / Project</th><th>Estimate status</th><th>Owner</th><th>Line status</th></tr></thead><tbody>{rows.map((record) => <tr key={record.key}><td><Badge tone="red">{reason(record)}</Badge></td><td>{record.supplierName}</td><td><div className="cell-primary"><strong className="mono">{record.itemCode || `LINE-${record.itemId}`}</strong><span>{record.description}</span></div></td><td className="num">{record.unitCost > 0 ? money(record.unitCost) : "—"}</td><td>{date(record.priceDate)}</td><td><div className="cell-primary"><strong className="mono">{record.estimateNo}</strong><span>{record.projectName}</span></div></td><td><Badge>{record.estimateStatus}</Badge></td><td>{record.ownerName}</td><td><Badge>{record.lineStatus}</Badge></td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" />Loading cost workspaces…</div> : <EmptyState icon="checkCircle" title="No supplier price needs follow-up" message="ไม่พบ Cost item ที่มี Supplier และเข้าเกณฑ์ราคาไม่พร้อมใช้งาน" />}
    </Panel>
  </>;
}
