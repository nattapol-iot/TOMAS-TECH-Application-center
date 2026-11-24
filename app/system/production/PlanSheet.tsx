"use client";
/* Projects > Plan, the Sheet view (V2, owner 2026-11-23/24): the plan typed like the team's Excel Gantt, laid out as
   the approved plan-grid mockup (artifact K9ySwjytLc7dvgVrjbEisu): a toolbar, a colour key, frozen columns WBS to
   status, a Gantt in 20 px days with week / date / weekday headers, an add row at the bottom and a status bar.
   A cell saves itself when it is left: the whole row goes back to the API with the one field changed
   (PUT /schedule/tasks/:id); % DONE and status go as a progress update (POST /updates); rows move with
   POST /schedule/tasks/:id/move. Saves run one at a time in the order they were typed, each on the newest row
   version, and the plan is read again when they stop. What a typed date, link or percentage means is in
   lib/plan-sheet.ts. "After" (ต่อจาก) is finish-to-start only and its +N counts work days (owner 2026-11-24); the plan
   keeps storing calendar days, so existing plans do not move. */

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest, createScheduleTemplate, listProjectDocuments, listScheduleTemplates, uploadProjectDocument, type ScheduleTemplate } from "../api-client";
import { planFromTemplate, templateFromPlan } from "../../../lib/plan-template";
import { confirmDialog, promptDialog } from "../dialogs";
import { LanguageContext, useT } from "../i18n";
import { Modal } from "../ui";
import { CUSTOMER_SCHEDULE_TEMPLATE_URL, fillCustomerSchedule } from "../../../lib/customer-schedule-template";
import { customerScheduleDays, customerScheduleFileName, customerScheduleSheet, type CustomerScheduleInput, type CustomerScheduleRow } from "../../../lib/customer-schedule-workbook";
import { downloadErpEstimateWorkbookBytes } from "../../../lib/erp-estimate-workbook";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { cellsToGrid, importChanges, readPlanTable, type ImportedPlan } from "../../../lib/plan-excel-import";
import { linkedStart, nextWorkDay } from "../../../lib/gantt";
import { percentChangePatch, statusChangePatch } from "../../../lib/my-work";
import {
  hoursText,
  linkText,
  mondayOn,
  parseDays,
  parseHours,
  parseLink,
  parsePercent,
  parseSheetDate,
  sheetOrder,
  shiftDay,
  spanDays,
  type ExtraLink,
  type SheetLinkRow,
} from "../../../lib/plan-sheet";
import type { ProjectSchedule, ScheduleTask } from "./PlanningPricingScreens";
import "./plan-sheet.css";

type Fields = {
  name: string;
  picExternal: string;
  planStart: string | null;
  planDays: number;
  startMode: string;
  predecessorId: number | null;
  lagDays: number;
  /** The other rows it waits for (migration 126). */
  extraLinks: ExtraLink[];
  /** Planned effort; the sheet shows and takes it in hours (8 a man-day). */
  planManDays: number;
  picUserIds: number[];
  discipline: string | null;
};
type Patch = Partial<Fields>;
type Column = "wbs" | "name" | "pic" | "start" | "end" | "days" | "done" | "work" | "after" | "member" | "status" | "hplan" | "hact" | "hleft";
type Result = { patch?: Patch; percent?: number; status?: string; notice?: string } | { error: string; wbs?: string };
type Row = {
  task: ScheduleTask;
  fields: Fields;
  /** A main heading or a row with rows under it: no progress or status of its own. */
  parent: boolean;
  /** Rows under it: its dates and link come from them. */
  rollup: boolean;
  start: string | null;
  finish: string | null;
  days: number | null;
  workDays: number | null;
  percent: number;
  status: string;
  after: string;
  /** Leaf rows under it that run past their END (a heading's "late" chip). */
  lateKids: number;
  /** Planned hours: its own, or what the rows under it plan when they plan any. */
  planHours: number;
  /** planHours is what the rows under it plan (then it is not typed on this row). */
  planFromRows: boolean;
  /** Hours confirmed in My Work, its rows' included. */
  actualHours: number;
};
type Job = { seq: number; retried?: boolean } & (
  | { type: "plan"; taskId: number; patch: Patch }
  | { type: "progress"; taskId: number; percent?: number; status?: string }
  | { type: "move"; taskId: number; parentId: number | null; beforeId: number | null }
  /** Task doc 3.5: the row done by an outside supplier (or by us again), through the People table's save. */
  | { type: "labor"; taskId: number; laborSource: "Own" | "Outsourced"; laborSupplier: string }
  /** Task doc 3.7: the purchase request an outsourced row is bought on, by number; null unlinks it. */
  | { type: "pr"; taskId: number; prNo: string | null }
  | { type: "create"; parentId: number | null; parentSeq?: number; beforeId: number | null; kind: "phase" | "task"; fields: Fields; percent?: number }
);
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type JobInput = DistributiveOmit<Job, "seq">;
type Pending = { seq: number; taskId: number; patch?: Patch; percent?: number; status?: string };
type Saving = { seq: number; parentId: number | null; beforeId: number | null; name: string; depth: number; atEnd: boolean };
type Draft = { key: number; parentId: number | null; beforeId: number | null; kind: "phase" | "task"; start: string | null; text: string };
type Cell = { id: number; col: number };
type Editing = Cell & { initial: string; typed: string | null };
type Removal = { label: string; reason?: string; onRemove: () => void } | undefined;
type UndoEntry = { kind: "plan"; taskId: number; patch: Patch } | { kind: "move"; taskId: number; parentId: number | null; beforeId: number | null };

/** The add row under the last row (mockup "ghost" row): type a name or paste from Excel there. */
const FOOT = -1;
const DW = 20,
  GUT = 28;
const COLUMNS: { key: Column; label: string; lines?: [string, string]; sub?: string; width: number; mono?: boolean; right?: boolean; select?: boolean }[] = [
  { key: "wbs", label: "WBS", width: 54, mono: true },
  { key: "name", label: "Sheet.colTask", width: 262 },
  { key: "pic", label: "Sheet.colPic", sub: "Sheet.subParty", width: 78 },
  { key: "start", label: "Sheet.colStart", width: 110, mono: true },
  { key: "end", label: "Sheet.colEnd", width: 110, mono: true },
  { key: "days", label: "Sheet.colDays", width: 46, mono: true, right: true },
  { key: "done", label: "Sheet.colDone", lines: ["%", "DONE"], width: 54, mono: true, right: true },
  { key: "work", label: "Sheet.colWork", lines: ["WORK", "DAYS"], width: 52, mono: true, right: true },
  { key: "after", label: "Sheet.colAfter", sub: "WBS", width: 74, mono: true },
  { key: "member", label: "Sheet.colMember", sub: "Sheet.subTeam", width: 132, select: true },
  { key: "status", label: "Sheet.colStatus", sub: "Sheet.subInternal", width: 116, select: true },
  // Task doc 3.1: people's work in hours only, planned against what My Work confirmed; never money.
  { key: "hplan", label: "Sheet.colPlanHours", width: 62, mono: true, right: true },
  { key: "hact", label: "Sheet.colActualHours", width: 62, mono: true, right: true },
  { key: "hleft", label: "Sheet.colLeftHours", width: 62, mono: true, right: true },
];
const LAST_COLUMN = COLUMNS.length - 1;
const COLUMN_AT = Object.fromEntries(COLUMNS.map((column, index) => [column.key, index])) as Record<Column, number>;
const WIDTH_KEY = "tomas-tech-plan-sheet-widths";
/** The columns from PIC to Status fold away together, leaving WBS and TASK beside a wider Gantt (owner 2026-11-24). */
const FOLD_KEY = "tomas-tech-plan-sheet-folded";
const readFolded = () => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(FOLD_KEY) === "1";
  } catch {
    return false;
  }
};
const readWidths = (): Record<string, number> => {
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(WIDTH_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
};
type Drop = { id: number; where: "before" | "after" | "into" };
type Menu = { id: number; x: number; y: number };
const DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation"] as const;
const DISCIPLINE_SHORT: Record<string, string> = { EE: "Electrical", ME: "Mechanical", SW: "Software", IN: "Installation" };
const STATUSES = ["Not Started", "In Progress", "Blocked", "Done"] as const;
const STATUS_LABEL: Record<string, string> = { "Not Started": "Sheet.stNotStarted", "In Progress": "Sheet.stInProgress", Blocked: "Sheet.stBlocked", Done: "Sheet.stDone" };
const STATUS_CHIP: Record<string, string> = { "Not Started": "s-ns", "In Progress": "s-ip", Blocked: "s-bl", Done: "s-dn" };
const UNDO_LIMIT = 100;
/* Weekday and month names as the mockup writes them (Sunday first): short for dates, one letter for the day row. */
const NAMES: Record<string, { day: string[]; letter: string[]; month: string[] }> = {
  TH: {
    day: ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."],
    letter: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    month: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
  },
  EN: {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    letter: ["S", "M", "T", "W", "T", "F", "S"],
    month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  JP: {
    day: ["日", "月", "火", "水", "木", "金", "土"],
    letter: ["日", "月", "火", "水", "木", "金", "土"],
    month: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  },
};

const isConflict = (error: unknown) => error instanceof ApiClientError && error.status === 409 && error.code === "concurrency_conflict";
const failureText = (error: unknown) => (error instanceof Error ? error.message : "The request could not be completed.");
const versionBytes = (value: string) => {
  try {
    return Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return [];
  }
};
/** Whether row version `a` is newer than `b`: SQL Server row versions are 8-byte counters, sent as base64. */
function newer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  const left = versionBytes(a),
    right = versionBytes(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const step = (left[index] ?? 0) - (right[index] ?? 0);
    if (step) return step > 0;
  }
  return false;
}
const newest = (a: string | null | undefined, b: string | null | undefined) => (newer(b, a) ? b : a) ?? b ?? null;
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const isWorkDay = (iso: string, holidays: ReadonlySet<string>) => {
  const weekday = asDate(iso).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(iso);
};
function countWorkDays(start: string, finish: string, holidays: ReadonlySet<string>): number {
  let count = 0;
  for (let day = start, guard = 0; day <= finish && guard < 3700; day = shiftDay(day, 1), guard++) if (isWorkDay(day, holidays)) count += 1;
  return count;
}
const fieldsOf = (task: ScheduleTask): Fields => ({
  name: task.name,
  picExternal: task.picExternal ?? "",
  planStart: task.storedPlanStart === undefined ? task.planStart : task.storedPlanStart,
  planDays: task.planDays,
  startMode: task.startMode,
  predecessorId: task.predecessorId,
  lagDays: task.lagDays,
  extraLinks: task.startMode === "linked" ? (task.extraLinks ?? []) : [],
  planManDays: Number(task.planManDays) || 0,
  picUserIds: task.pics.map((pic) => pic.id),
  discipline: task.discipline ?? null,
});
/** Where a linked row starts: after the latest of the rows it waits for, each with its own gap (migration 126). */
function latestStart(fields: Fields, finishOf: (id: number) => string | null, holidays: ReadonlySet<string>): string | null {
  let start = fields.predecessorId === null ? null : linkedStart(finishOf(fields.predecessorId), fields.lagDays, holidays);
  for (const link of fields.extraLinks) {
    const other = linkedStart(finishOf(link.predecessorId), link.lagDays, holidays);
    if (other && (!start || other > start)) start = other;
  }
  return start;
}
const sameValue = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b);
/** The fields of `patch` that differ from `fields`; null when nothing changes. */
function changed(fields: Fields, patch: Patch): Patch | null {
  const out: Patch = {};
  for (const key of Object.keys(patch) as (keyof Fields)[]) if (!sameValue(patch[key], fields[key])) (out as Record<string, unknown>)[key] = patch[key];
  return Object.keys(out).length ? out : null;
}
const pick = (fields: Fields, keys: (keyof Fields)[]): Patch => Object.fromEntries(keys.map((key) => [key, fields[key]])) as Patch;
const flatById = (schedule: ProjectSchedule) => new Map(sheetOrder(schedule.tasks).map((task) => [task.id, task] as const));
const isLate = (row: { status: string; finish: string | null; parent: boolean }, today: string) => !row.parent && row.status !== "Done" && row.finish !== null && row.finish < today;

/* The mockup's line icons, 16 px. */
function Glyph({ d }: { d: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
const GLYPH = {
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  plus: ["M12 5v14M5 12h14"],
  outdent: ["M21 12H11M21 6H11M21 18H11", "m7 8-4 4 4 4"],
  indent: ["M21 12H11M21 6H11M21 18H11", "m3 8 4 4-4 4"],
  up: ["m18 15-6-6-6 6"],
  down: ["m6 9 6 6 6-6"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  fold: ["m11 17-5-5 5-5", "m18 17-5-5 5-5"],
  unfold: ["m13 17 5-5-5-5", "m6 17 5-5-5-5"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  calendar: ["M16 2v4M8 2v4M3 10h18", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
};

export function PlanSheet({
  schedule,
  team,
  today,
  lockedIds,
  notify,
  onReload,
  onOpenTask,
  removeFor,
  ensureMembers,
  canAddSub,
  project,
}: {
  schedule: ProjectSchedule;
  /** The people a row may be given: everyone for a planner, the project's own people for a member (usePlanTeam). */
  team: readonly { id: number; name: string; email?: string }[];
  today: string;
  /** Rows that wait on a day request: the server refuses every plan change on them. */
  lockedIds: ReadonlySet<number | null>;
  notify: (message: string) => void;
  /** Reads the plan again and hands it back (null when it could not be read). */
  onReload: () => Promise<ProjectSchedule | null>;
  onOpenTask: (taskId: number) => void;
  /** The plan's own delete rules and confirmation (the bin on a Gantt row). */
  removeFor: (task: ScheduleTask) => Removal;
  /** A person named on a row joins the project first, because a PIC must be a member. */
  ensureMembers: (userIds: number[]) => Promise<void>;
  canAddSub: (task: ScheduleTask) => boolean;
  /** The project's own facts for the customer file's title block. */
  project?: { customerName: string; purchaseOrderNumber: string; leadEngineerName: string; startDate: string | null } | null;
}) {
  const t = useT();
  const { lang } = useContext(LanguageContext);
  const canPlan = schedule.canPlan;
  const holidays = useMemo(() => new Set(schedule.holidays ?? []), [schedule.holidays]);
  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [saving, setSaving] = useState<readonly Saving[]>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [headingsOnly, setHeadingsOnly] = useState(false);
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null);
  const [followOpen, setFollowOpen] = useState(false);
  // Task doc 4.1-4.3: save this plan as a master schedule, or add one to it from a start date.
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<ScheduleTemplate[] | null>(null);
  const [templatePick, setTemplatePick] = useState("");
  const [templateStart, setTemplateStart] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  // Suppliers for the member cell (task doc 3.5): those on this plan, then the ERP's, read once when a member cell opens.
  const [erpVendors, setErpVendors] = useState<string[] | null>(null);
  const [active, setActive] = useState<Cell | null>(null);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  // The same two cells, kept as they change: two keys in one tick (a held arrow) each move from the one before.
  const cursor = useRef<{ active: Cell | null; anchor: Cell | null }>({ active: null, anchor: null });
  const place = useCallback((next: Cell, corner: Cell | null) => {
    cursor.current = { active: next, anchor: corner };
    setActive(next);
    setAnchor(corner);
  }, []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const [frameWidth, setFrameWidth] = useState(0);
  // The customer file (owner 2026-11-23): date language and the two internal options.
  const [exporting, setExporting] = useState(false);
  const [exportLang, setExportLang] = useState<"th" | "en">(() => (lang === "TH" ? "th" : "en"));
  const [exportMember, setExportMember] = useState(false);
  const [exportSub, setExportSub] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  // Import from Excel (owner 2026-11-23): the file read in the browser, then applied by WBS.
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ file: string; sheet: string; plan: ImportedPlan } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importReading, setImportReading] = useState(false);
  // A copy that did not reach folder 08: its reason, and the file to try again without a second download.
  const [exportFailed, setExportFailed] = useState<{ reason: string; bytes: Uint8Array; name: string } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>(readWidths);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [folded, setFolded] = useState(readFolded);
  const isFolded = (col: number) => folded && col > COLUMN_AT.name;
  const lastColumn = folded ? COLUMN_AT.name : LAST_COLUMN;
  const width = (col: number) => (isFolded(col) ? 0 : Math.max(36, widths[COLUMNS[col]!.key] ?? COLUMNS[col]!.width));
  const toggleFold = () => {
    const next = !folded;
    setFolded(next);
    try {
      window.localStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {
      /* Remembering the fold is a convenience. */
    }
    const current = cursor.current.active;
    if (next && current && current.col > COLUMN_AT.name) place({ id: current.id, col: COLUMN_AT.name }, null);
  };
  const LEFT = COLUMNS.map((_, col) => GUT + COLUMNS.slice(0, col).reduce((sum, _column, index) => sum + width(index), 0));
  const LEFT_WIDTH = LEFT[LAST_COLUMN]! + width(LAST_COLUMN);

  const model = useMemo(() => {
    const all = sheetOrder(schedule.tasks);
    const byTask = new Map(all.map((task) => [task.id, task] as const));
    const patches = new Map<number, Patch>(),
      percents = new Map<number, number>(),
      statuses = new Map<number, string>();
    for (const entry of pending) {
      if (entry.patch) patches.set(entry.taskId, { ...patches.get(entry.taskId), ...entry.patch });
      if (entry.percent !== undefined) percents.set(entry.taskId, entry.percent);
      if (entry.status !== undefined) statuses.set(entry.taskId, entry.status);
    }
    const linkRows: SheetLinkRow[] = all.map((task) => {
      const patch = patches.get(task.id);
      return {
        id: task.id,
        parentId: task.parentId,
        wbs: task.wbs,
        kind: task.kind,
        predecessorId: patch?.predecessorId !== undefined ? patch.predecessorId : task.predecessorId,
        startMode: patch?.startMode ?? task.startMode,
        extraIds: (patch?.extraLinks ?? task.extraLinks ?? []).map((link) => link.predecessorId),
      };
    });
    const rows: Row[] = all.map((task) => {
      const patch = patches.get(task.id),
        fields = { ...fieldsOf(task), ...patch },
        parent = task.children.length > 0;
      let start = task.planStart,
        finish = task.planFinish,
        workDays: number | null = start && finish ? task.workDays : null;
      if (patch && !parent) {
        start = fields.startMode === "linked" ? (latestStart(fields, (id) => byTask.get(id)?.planFinish ?? null, holidays) ?? task.planStart) : fields.planStart;
        finish = start ? shiftDay(start, Math.max(1, fields.planDays) - 1) : null;
        workDays = start && finish ? countWorkDays(start, finish, holidays) : null;
      }
      const heading = task.kind === "phase";
      // The API sends the gap in working days (migration 125).
      const gap = fields.lagDays;
      return {
        task,
        fields,
        parent: parent || heading,
        rollup: parent,
        start,
        finish,
        workDays,
        days: start && finish ? spanDays(start, finish) : null,
        percent: percents.get(task.id) ?? Number(task.percentComplete),
        status: statuses.get(task.id) ?? (percents.get(task.id) === 100 ? "Done" : (percents.get(task.id) ?? 0) > 0 && task.status === "Not Started" ? "In Progress" : task.status),
        after: linkText(fields, linkRows, gap),
        lateKids: 0,
        // One decimal: hours are stored as man-days to two decimals, so 1 h comes back as 1.04 before rounding.
        planHours: Math.round(fields.planManDays * 8 * 10) / 10,
        planFromRows: false,
        actualHours: Number(task.actualHours ?? 0),
      };
    });
    const byId = new Map(rows.map((row) => [row.task.id, row] as const));
    // Hours add up from the bottom: a row with rows under it plans what they plan (its own figure when they plan none),
    // and its actual hours include theirs. Reading order puts a row before its rows, so the reverse walk is bottom-up.
    const underPlan = new Map<number, number>();
    for (const row of [...rows].reverse()) {
      if (row.rollup && (underPlan.get(row.task.id) ?? 0) > 0) {
        row.planHours = Math.round(underPlan.get(row.task.id)! * 10) / 10;
        row.planFromRows = true;
      }
      const up = row.task.parentId === null ? undefined : byId.get(row.task.parentId);
      if (!up) continue;
      underPlan.set(up.task.id, (underPlan.get(up.task.id) ?? 0) + row.planHours);
      up.actualHours += row.actualHours;
    }
    for (const row of rows)
      if (isLate(row, today))
        for (let up = row.task.parentId === null ? undefined : byId.get(row.task.parentId); up; up = up.task.parentId === null ? undefined : byId.get(up.task.parentId)) up.lateKids += 1;
    const visible: Row[] = [];
    let hideBelow: number | null = null;
    for (const row of rows) {
      if (headingsOnly && row.task.depth > 0) continue;
      // The budget strip's discipline filter keeps headings and parent rows, so the rows shown keep their place.
      if (
        disciplineFilter &&
        !row.parent &&
        (disciplineFilter === "Outsourced" ? row.task.laborSource !== "Outsourced" : row.task.laborSource === "Outsourced" || (row.fields.discipline ?? "None") !== disciplineFilter)
      )
        continue;
      if (hideBelow !== null) {
        if (row.task.depth > hideBelow) continue;
        hideBelow = null;
      }
      visible.push(row);
      if (row.parent && collapsed.has(row.task.id)) hideBelow = row.task.depth;
    }
    return { rows, byId, visible, linkRows };
  }, [schedule, pending, collapsed, headingsOnly, holidays, today, disciplineFilter]);

  // The Gantt: 20 px days from the Monday of the plan's first day, at least 16 weeks, two weeks past the last END.
  const timeline = useMemo(() => {
    let first: string | null = null,
      last: string | null = null;
    for (const row of model.rows) {
      if (row.start && (!first || row.start < first)) first = row.start;
      if (row.finish && (!last || row.finish > last)) last = row.finish;
    }
    const from = mondayOn(first ?? today);
    const end = last && last > today ? last : today;
    const days = Math.max(16 * 7, Math.ceil((spanDays(from, end) + 14) / 7) * 7);
    const x = (iso: string) => spanDays(from, iso) - 1;
    return { from, days, x, dates: Array.from({ length: days }, (_, index) => shiftDay(from, index)) };
  }, [model.rows, today]);
  // Task doc 3.1: hours by discipline, planned and confirmed against the Estimate's labor hours; never money.
  const budget = useMemo(() => {
    const perDay = schedule.manHours?.hoursPerManDay ?? 8;
    const byDiscipline = new Map<string, { budget: number; plan: number; actual: number }>();
    const entry = (key: string) => byDiscipline.get(key) ?? byDiscipline.set(key, { budget: 0, plan: 0, actual: 0 }).get(key)!;
    for (const line of schedule.manHours?.disciplines ?? []) entry(line.discipline).budget += line.manDays * perDay;
    // As manhour-budget.ts counts effort: a row's own figure unless its rows carry one; outsourced people stay apart.
    // Outsourced work (task doc 3.7): its own entry, against the Estimate's supplier labor; never the team's budget.
    const outBudget = (schedule.manHours?.outsourceBudgetManDays ?? 0) * perDay;
    if (outBudget) entry("Outsourced").budget += outBudget;
    for (const row of model.rows) {
      if (row.task.laborSource === "Outsourced" && !row.planFromRows && row.task.kind !== "phase" && (row.planHours || row.actualHours)) {
        const item = entry("Outsourced");
        item.plan += row.planHours;
        item.actual += row.rollup ? Number(row.task.actualHours ?? 0) : row.actualHours;
        continue;
      }
      if (row.planFromRows || row.task.kind === "phase" || row.task.laborSource === "Outsourced" || (!row.planHours && !row.actualHours)) continue;
      // A row with rows under it adds only its own hours here; its rows add theirs.
      const ownActual = row.rollup ? Number(row.task.actualHours ?? 0) : row.actualHours;
      const item = entry(row.fields.discipline ?? "None");
      item.plan += row.planHours;
      item.actual += ownActual;
    }
    const order = [...DISCIPLINES, "Other", "None", "Outsourced"] as string[];
    return [...byDiscipline.entries()].map(([discipline, value]) => ({ discipline, ...value })).sort((left, right) => order.indexOf(left.discipline) - order.indexOf(right.discipline));
  }, [model.rows, schedule.manHours]);
  const disciplineLabel = (key: string) =>
    key === "None" ? t("Sheet.budgetNone") : key === "Other" ? t("Plan.mhDiscipline.Other") : key === "Outsourced" ? t("Sheet.vendorGroup") : t(`Discipline.${key}`);
  const vendorChoices = useMemo(() => {
    const used = model.rows.flatMap((row) => (row.task.laborSource === "Outsourced" && row.task.laborSupplier ? [row.task.laborSupplier] : []));
    return [...new Set([...used.sort((a, b) => a.localeCompare(b)), ...(erpVendors ?? [])])];
  }, [model.rows, erpVendors]);
  const memberEditing = editing !== null && COLUMNS[editing.col]?.key === "member";
  const vendorsAsked = useRef(false),
    vendorPrompt = useRef(false);
  useEffect(() => {
    if (!memberEditing || vendorsAsked.current || !canPlan) return;
    vendorsAsked.current = true;
    void apiRequest<{ items?: { name: string }[] }>("/api/v1/master/suppliers?source=erp&pageSize=100")
      .then((page) => setErpVendors((page.items ?? []).map((item) => item.name).filter(Boolean)))
      .catch(() => setErpVendors([]));
  }, [memberEditing, canPlan]);
  // Task doc 3.8: what needs following up on this plan, each one a link to its row.
  const followUps = useMemo(() => {
    const groups: { key: string; rows: Row[] }[] = [
      { key: "late", rows: [] },
      { key: "blocked", rows: [] },
      { key: "due", rows: [] },
      { key: "noMember", rows: [] },
      { key: "noPr", rows: [] },
    ];
    const at = Object.fromEntries(groups.map((group) => [group.key, group.rows])) as Record<string, Row[]>;
    for (const row of model.rows) {
      if (row.parent || row.task.id < 0) continue;
      if (isLate(row, today)) at.late!.push(row);
      if (row.status === "Blocked") at.blocked!.push(row);
      if (!isLate(row, today) && row.status === "Not Started" && row.start !== null && row.start <= today) at.due!.push(row);
      if (row.task.kind === "task" && row.status !== "Done" && row.task.laborSource !== "Outsourced" && !row.fields.picUserIds.length) at.noMember!.push(row);
      if (row.task.laborSource === "Outsourced" && !row.task.purchaseRequest && row.status !== "Done") at.noPr!.push(row);
    }
    return groups.filter((group) => group.rows.length);
  }, [model.rows, today]);
  // A row in two lists (late and blocked) counts once.
  const followCount = new Set(followUps.flatMap((group) => group.rows.map((row) => row.task.id))).size;
  /** Opens the rows above a row, puts the cursor on it and scrolls it into view. */
  const goToRow = (row: Row) => {
    setFollowOpen(false);
    setHeadingsOnly(false);
    setDisciplineFilter(null);
    setCollapsed((current) => {
      const next = new Set(current);
      for (let up = row.task.parentId; up !== null; up = model.byId.get(up)?.task.parentId ?? null) next.delete(up);
      return next;
    });
    place({ id: row.task.id, col: COLUMN_AT.name }, null);
    // Two frames: the rows above it open first, then it is on the page to scroll to.
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`.plan-sheet tr[data-id="${row.task.id}"]`)?.scrollIntoView({ block: "center" })));
  };
  const names = NAMES[lang] ?? NAMES.EN!;
  const dayDate = (iso: string | null) => (iso ? `${names.day[asDate(iso).getUTCDay()]} ${shortDate(iso)}` : "");
  const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${names.month[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

  // Everything the save queue and the native listeners read runs through this, so they always see the latest render.
  const live = useRef({ schedule, model, t, notify, onReload, ensureMembers, today, holidays, canPlan, onOpenTask });
  useLayoutEffect(() => {
    live.current = { schedule, model, t, notify, onReload, ensureMembers, today, holidays, canPlan, onOpenTask };
  });
  // The newest plan this view has seen, from the props or its own reads, and the versions its own saves handed back.
  const latest = useRef(schedule);
  useLayoutEffect(() => {
    if (schedule.projectId !== latest.current.projectId || !newer(latest.current.scheduleVersion, schedule.scheduleVersion)) latest.current = schedule;
  }, [schedule]);
  const versions = useRef({ schedule: null as string | null, rows: new Map<number, string>() });
  const saved = useRef(new Map<number, Patch>());
  const created = useRef(new Map<number, number>());
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const stale = useRef(false);
  const seq = useRef(0);
  const doneSeq = useRef(0);
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const draftKey = useRef(0);
  const frame = useRef<HTMLDivElement | null>(null);
  const links = useRef<SVGSVGElement | null>(null);
  const editRef = useRef<Editing | null>(null);

  const say = useCallback((text: string, error = false) => setNote({ text, error }), []);
  const dropPending = useCallback((test: (entry: { seq: number }) => boolean) => {
    setPending((current) => (current.some(test) ? current.filter((entry) => !test(entry)) : current));
    setSaving((current) => (current.some(test) ? current.filter((entry) => !test(entry)) : current));
  }, []);

  /** Reads the plan again between saves; edits already saved leave the screen's overlay once the plan shows them. */
  const refresh = useCallback(async () => {
    const upTo = doneSeq.current;
    const loaded = await live.current.onReload().catch(() => null);
    if (loaded && loaded.projectId === latest.current.projectId && !newer(latest.current.scheduleVersion, loaded.scheduleVersion)) latest.current = loaded;
    saved.current.clear();
    stale.current = false;
    dropPending((entry) => entry.seq <= upTo);
  }, [dropPending]);

  const run = useCallback(async (job: Job) => {
    const plan = latest.current,
      scheduleVersion = newest(plan.scheduleVersion, versions.current.schedule);
    const remember = (id: number, result: { rowVersion?: string; scheduleVersion?: string | null }) => {
      if (result.rowVersion) versions.current.rows.set(id, newest(versions.current.rows.get(id), result.rowVersion)!);
      if (result.scheduleVersion) versions.current.schedule = newest(versions.current.schedule, result.scheduleVersion);
    };
    if (job.type === "create") {
      const { fields, kind } = job;
      const parentId = job.parentSeq === undefined ? job.parentId : (created.current.get(job.parentSeq) ?? null);
      if (job.parentSeq !== undefined && parentId === null) throw new Error("Sheet.parentFailed");
      if (kind === "task" && live.current.canPlan && fields.picUserIds.length) await live.current.ensureMembers(fields.picUserIds);
      const made = await apiRequest<{ id: number; rowVersion: string; scheduleVersion: string }>(`/api/v1/projects/${plan.projectId}/schedule/tasks`, {
        method: "POST",
        body: JSON.stringify({
          scheduleVersion,
          parentId,
          beforeId: job.beforeId,
          sortOrder: 0,
          kind,
          name: fields.name,
          isMilestone: false,
          visibility: kind === "phase" ? "Customer" : "Internal",
          planStart: fields.planStart,
          planDays: fields.planDays,
          startMode: fields.startMode,
          predecessorId: fields.predecessorId,
          lagDays: fields.lagDays,
          extraLinks: fields.startMode === "linked" ? fields.extraLinks : [],
          picUserIds: kind === "phase" ? [] : fields.picUserIds,
          picExternal: kind === "phase" ? "" : fields.picExternal,
          planManDays: kind === "phase" ? 0 : fields.planManDays,
          ...(kind === "phase" || !fields.discipline ? {} : { discipline: fields.discipline }),
        }),
      });
      created.current.set(job.seq, made.id);
      remember(made.id, made);
      // Rows after it were renumbered, so their versions moved: the plan is read again before one of them is saved.
      if (job.beforeId !== null || job.percent) stale.current = true;
      if (job.percent) queue.current.unshift({ seq: ++seq.current, type: "progress", taskId: made.id, percent: job.percent });
      return;
    }
    const task = flatById(plan).get(job.taskId);
    if (!task) return;
    const rowVersion = newest(task.rowVersion, versions.current.rows.get(task.id));
    if (job.type === "pr") {
      const linked = await apiRequest<{ scheduleVersion: string | null }>(`/api/v1/schedule/tasks/${task.id}/purchase-request`, {
        method: "PUT",
        body: JSON.stringify({ prNo: job.prNo }),
      });
      remember(task.id, { scheduleVersion: linked.scheduleVersion });
      stale.current = true;
      return;
    }
    if (job.type === "labor") {
      const saved = await apiRequest<{ scheduleVersion: string }>(`/api/v1/projects/${plan.projectId}/schedule/people`, {
        method: "PUT",
        body: JSON.stringify({ scheduleVersion, rows: [{ taskId: task.id, laborSource: job.laborSource, laborSupplier: job.laborSupplier }] }),
      });
      remember(task.id, saved);
      // The row's own version moved without being handed back, so the plan is read again before it is saved.
      stale.current = true;
      return;
    }
    if (job.type === "move") {
      const moved = await apiRequest<{ rowVersion: string; scheduleVersion: string }>(`/api/v1/schedule/tasks/${task.id}/move`, {
        method: "POST",
        body: JSON.stringify({ scheduleVersion, rowVersion, parentId: job.parentId, beforeId: job.beforeId }),
      });
      remember(task.id, moved);
      stale.current = true;
      return;
    }
    if (job.type === "progress") {
      const patch = job.status !== undefined ? statusChangePatch(task, job.status, live.current.today) : percentChangePatch(task, job.percent ?? 0, live.current.today);
      if (!patch) return;
      const result = await apiRequest<{ rowVersion: string; scheduleVersion: string }>(`/api/v1/schedule/tasks/${task.id}/updates`, {
        method: "POST",
        body: JSON.stringify({
          scheduleVersion,
          rowVersion,
          percentComplete: Number(task.percentComplete),
          status: task.status,
          actualStart: task.actualStart,
          actualFinish: task.actualFinish,
          forecastFinish: task.forecastFinish,
          remark: task.remark ?? "",
          ...patch,
        }),
      });
      remember(task.id, result);
      return;
    }
    const fields = { ...fieldsOf(task), ...saved.current.get(task.id), ...job.patch };
    if (live.current.canPlan && job.patch.picUserIds?.length) await live.current.ensureMembers(job.patch.picUserIds);
    const result = await apiRequest<{ rowVersion: string; scheduleVersion: string }>(`/api/v1/schedule/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify({
        scheduleVersion,
        rowVersion,
        parentId: task.parentId,
        sortOrder: task.sortOrder,
        kind: task.kind,
        name: fields.name,
        isMilestone: task.isMilestone,
        visibility: task.visibility,
        planStart: fields.planStart,
        planDays: fields.planDays,
        startMode: fields.startMode,
        predecessorId: fields.predecessorId,
        lagDays: fields.lagDays,
        extraLinks: fields.startMode === "linked" ? fields.extraLinks : [],
        picUserIds: fields.picUserIds,
        picExternal: fields.picExternal,
        planManDays: fields.planManDays,
        ...(task.kind === "phase" ? {} : { discipline: fields.discipline }),
      }),
    });
    remember(task.id, result);
    saved.current.set(task.id, { ...saved.current.get(task.id), ...job.patch });
  }, []);

  /** Runs the queued saves one by one; the plan is read again whenever the queue runs dry. */
  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let wrote = false,
      failed = false;
    try {
      while (queue.current.length) {
        const job = queue.current.shift()!;
        if (job.type !== "create" && stale.current) await refresh();
        try {
          await run(job);
          doneSeq.current = Math.max(doneSeq.current, job.seq);
          wrote = true;
        } catch (failure) {
          const { t: translate, notify: tell, schedule: plan } = live.current;
          const label = job.type === "create" ? job.fields.name : (flatById(latest.current).get(job.taskId)?.wbs ?? "");
          if (isConflict(failure) && !job.retried) {
            // Someone else saved this plan meanwhile: read it again and put this one edit on top of what they saved.
            await refresh();
            queue.current.unshift({ ...job, retried: true });
            continue;
          }
          failed = true;
          dropPending((entry) => entry.seq === job.seq);
          if (isConflict(failure)) {
            tell(`${plan.projectNo} · ${label} ${translate("Plan.changedReloaded")}`);
            stale.current = true;
          } else {
            say(`${label} · ${translate("Plan.saveFailed")}: ${translate(failureText(failure))}`, true);
            tell(`${plan.projectNo} · ${label} ${translate("Plan.saveFailed")}`);
          }
        }
        if (!queue.current.length && (wrote || stale.current)) {
          await refresh();
          wrote = false;
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
    if (!failed) {
      const now = new Date();
      setSavedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [refresh, run, dropPending, say]);

  const enqueue = useCallback(
    (job: JobInput) => {
      const entry = { ...job, seq: ++seq.current } as Job;
      queue.current.push(entry);
      void drain();
      return entry.seq;
    },
    [drain],
  );

  const startOf = (row: Row, fields: Fields): string | null => {
    if (row.rollup) return row.start;
    if (fields.startMode !== "linked") return fields.planStart;
    return latestStart(fields, (id) => model.byId.get(id)?.finish ?? null, holidays) ?? row.start;
  };
  /** The row just above in the sheet that has a finish: what +N in START counts from. */
  const finishAbove = (row: Row): string | null => {
    const at = model.rows.indexOf(row);
    for (let index = at - 1; index >= 0; index--) if (model.rows[index]!.finish) return model.rows[index]!.finish;
    return null;
  };
  const lockOf = (row: Row, column: Column): string => {
    const { task } = row;
    if (column === "wbs" || column === "work" || column === "hact" || column === "hleft") return "Sheet.calculated";
    if (column === "done" || column === "status") {
      if (task.kind === "phase" || row.parent) return "Sheet.headingNoProgress";
      return task.canProgress ? "" : "Sheet.progressRights";
    }
    if (task.id > 0) {
      if (!canPlan && !task.canEditOwn) return "Sheet.readOnly";
      if (task.managedByResourcePlan) return "Sheet.resourceRow";
      if (lockedIds.has(task.id)) return "Sheet.lockedRow";
    }
    if (task.kind === "phase" && (column === "pic" || column === "after" || column === "member")) return "Sheet.headingRow";
    if (row.rollup && (column === "start" || column === "end" || column === "days" || column === "after")) return "Sheet.rollupDates";
    if (column === "member" && task.kind === "detail") return "Sheet.detailMember";
    if (column === "member" && task.pics.length > 1) return "Sheet.manyMembers";
    if (column === "days" && task.isMilestone) return "Sheet.milestoneDay";
    if (column === "hplan") {
      if (row.planFromRows || task.kind === "phase") return "Sheet.rollupHours";
      if (task.isMilestone) return "Sheet.milestoneHours";
      if (task.peopleByDay?.length) return "Sheet.peopleHours";
    }
    return "";
  };
  /** A member typed or pasted: a person by id, name or email, else a discipline the row waits for. */
  const memberFor = (text: string, own: readonly { id: number; name: string }[]): Patch | undefined => {
    const value = text.trim(),
      lower = value.toLowerCase();
    if (!value) return { picUserIds: [], discipline: null };
    if (lower.startsWith("d:")) {
      const code = DISCIPLINES.find((item) => item.toLowerCase() === lower.slice(2));
      return code ? { picUserIds: [], discipline: code } : undefined;
    }
    const person =
      own.find((pic) => String(pic.id) === lower || pic.name.toLowerCase() === lower) ??
      team.find((item) => String(item.id) === lower || item.name.toLowerCase() === lower || (item.email ?? "").toLowerCase() === lower) ??
      team.find((item) => item.name.toLowerCase().startsWith(lower));
    if (person) return { picUserIds: [person.id] };
    const code = DISCIPLINES.find((item) => item.toLowerCase() === lower || t(`Discipline.${item}`).toLowerCase() === lower) ?? DISCIPLINE_SHORT[value.toUpperCase()];
    return code ? { picUserIds: [], discipline: code } : undefined;
  };
  const statusFor = (text: string): string | undefined => {
    const lower = text.trim().toLowerCase();
    return STATUSES.find((status) => status.toLowerCase() === lower || t(STATUS_LABEL[status]!).toLowerCase() === lower);
  };
  /** What one typed cell changes on its row; `fields` already holds the cells typed before it on the same row. */
  const cellResult = (row: Row, column: Column, raw: string, fields: Fields): Result => {
    const text = raw.trim(),
      { task } = row;
    switch (column) {
      case "name":
        return text ? { patch: { name: text.slice(0, 500) } } : { error: "Sheet.needsName" };
      case "pic":
        return { patch: { picExternal: text.slice(0, 300) } };
      case "start":
      case "end": {
        const start = startOf(row, fields);
        const date = column === "start" ? parseSheetDate(text.replace(/^\D+\s/, ""), today, finishAbove(row)) : parseSheetDate(text.replace(/^\D+\s/, ""), start ?? today, start);
        if (date === "") return task.kind === "phase" ? { patch: { planStart: null, planDays: 1 } } : { error: "Sheet.badDate" };
        if (date === null) return { error: "Sheet.badDate" };
        if (column === "end" && start && !task.isMilestone) return date < start ? { error: "Sheet.endBeforeStart" } : { patch: { planDays: spanDays(start, date) } };
        const patch: Patch = { planStart: date, ...(task.isMilestone || !start ? { planDays: 1 } : {}) };
        if (fields.startMode === "linked") {
          const before = model.linkRows.find((candidate) => candidate.id === fields.predecessorId);
          return { patch: { ...patch, startMode: "manual", predecessorId: null, lagDays: 0, extraLinks: [] }, notice: t("Sheet.unlinked").replace("{wbs}", before?.wbs ?? "") };
        }
        return { patch };
      }
      case "days": {
        if (!startOf(row, fields)) return { error: "Sheet.startFirst" };
        const days = parseDays(text);
        return days === null ? { error: "Sheet.badDays" } : { patch: { planDays: days } };
      }
      case "done": {
        const percent = text === "" ? 0 : parsePercent(text);
        return percent === null ? { error: "Sheet.badPercent" } : { percent };
      }
      case "hplan": {
        const hours = parseHours(text);
        return hours === null ? { error: "Sheet.badHours" } : { patch: { planManDays: Math.round((hours / 8) * 100) / 100 } };
      }
      case "hact":
      case "hleft":
        return { error: "Sheet.calculated" };
      case "status": {
        const status = statusFor(text);
        return status ? { status } : { error: "Sheet.badStatus" };
      }
      case "after": {
        const self: SheetLinkRow = {
          id: task.id,
          parentId: task.parentId,
          wbs: task.wbs,
          kind: task.kind,
          predecessorId: fields.predecessorId,
          startMode: fields.startMode,
          extraIds: fields.extraLinks.map((link) => link.predecessorId),
        };
        const link = parseLink(text, self, model.linkRows);
        if ("error" in link) return link;
        if (link.predecessorId === null) return { patch: { startMode: "manual", predecessorId: null, lagDays: 0, extraLinks: [], planStart: startOf(row, fields) ?? today } };
        return { patch: { startMode: "linked", predecessorId: link.predecessorId, lagDays: link.lagDays, extraLinks: link.extraLinks } };
      }
      case "member": {
        const patch = memberFor(text, task.pics);
        return patch ? { patch } : { error: "Sheet.memberUnknown" };
      }
      default:
        return { error: "Sheet.calculated" };
    }
  };
  const pushUndo = (entry: UndoEntry) => {
    undoStack.current = [...undoStack.current.slice(1 - UNDO_LIMIT), entry];
    redoStack.current = [];
    setSteps({ undo: undoStack.current.length, redo: 0 });
  };
  /** Queues what a row's typed cells change, shows it at once, and keeps the old values for Ctrl+Z. */
  const apply = (row: Row, patch: Patch | undefined, percent: number | undefined, status: string | undefined, keepUndo = true) => {
    const change = patch ? changed(row.fields, patch) : null;
    if (change) {
      if (keepUndo) pushUndo({ kind: "plan", taskId: row.task.id, patch: pick(row.fields, Object.keys(change) as (keyof Fields)[]) });
      const id = enqueue({ type: "plan", taskId: row.task.id, patch: change });
      setPending((current) => [...current, { seq: id, taskId: row.task.id, patch: change }]);
    }
    if (percent !== undefined && percent !== row.percent) {
      const id = enqueue({ type: "progress", taskId: row.task.id, percent });
      setPending((current) => [...current, { seq: id, taskId: row.task.id, percent }]);
    }
    if (status !== undefined && status !== row.status) {
      const id = enqueue({ type: "progress", taskId: row.task.id, status });
      setPending((current) => [...current, { seq: id, taskId: row.task.id, status, ...(status === "Done" ? { percent: 100 } : status === "Not Started" ? { percent: 0 } : {}) }]);
    }
    return Boolean(change) || (percent !== undefined && percent !== row.percent) || (status !== undefined && status !== row.status);
  };
  const commit = async (row: Row, column: Column, text: string) => {
    const lock = lockOf(row, column);
    if (lock) return say(t(lock), true);
    // An outside supplier does the row (task doc 3.5); our member stays on it as the one who looks after the work.
    if (column === "member" && text.startsWith("v:")) {
      if (!canPlan) return say(t("Sheet.readOnly"), true);
      if (row.rollup || row.task.kind !== "task") return say(t("Sheet.vendorRow"), true);
      let supplier = text.slice(2).trim().slice(0, 200);
      if (supplier === "?") {
        // One question at a time, even when "v:?" was pasted into many cells.
        if (vendorPrompt.current) return;
        vendorPrompt.current = true;
        const typed = await promptDialog(t("Sheet.vendorAsk"), { title: t("Sheet.vendorGroup") }).finally(() => (vendorPrompt.current = false));
        if (!typed?.trim()) return;
        supplier = typed.trim().slice(0, 200);
      }
      const outsourced = row.task.laborSource === "Outsourced";
      if (supplier ? outsourced && row.task.laborSupplier === supplier : !outsourced) return;
      enqueue({ type: "labor", taskId: row.task.id, laborSource: supplier ? "Outsourced" : "Own", laborSupplier: supplier });
      say(t(supplier ? "Sheet.vendorSet" : "Sheet.vendorCleared").replace("{name}", supplier));
      return;
    }
    const result = cellResult(row, column, text, row.fields);
    if ("error" in result) return say(t(result.error).replace("{wbs}", result.wbs ?? ""), true);
    if (result.status === "Blocked") {
      // A blocked task needs its reason, which the task's own window asks for.
      say(t("Sheet.blockedNeedsReason"));
      onOpenTask(row.task.id);
      return;
    }
    if (result.status === "Done" && row.percent === 0 && !(await confirmDialog(t("This task is at 0%. Confirm that the work is complete and finish it today?")))) return;
    if (apply(row, result.patch, result.percent, result.status)) setNote(result.notice ? { text: result.notice, error: false } : null);
  };

  const cellText = (row: Row, column: Column): string => {
    switch (column) {
      case "wbs":
        return row.task.wbs;
      case "name":
        return row.fields.name;
      case "pic":
        return row.task.kind === "phase" ? "" : row.fields.picExternal;
      case "start":
        return dayDate(row.start);
      case "end":
        return dayDate(row.finish);
      case "days":
        return row.days === null ? "" : String(row.days);
      case "done":
        return row.parent && !row.start ? "" : `${Math.round(row.percent)}%`;
      case "work":
        return row.workDays === null ? "" : String(row.workDays);
      case "after":
        return row.after;
      case "member": {
        const names = row.fields.picUserIds.map((id) => row.task.pics.find((pic) => pic.id === id)?.name ?? team.find((person) => person.id === id)?.name ?? `#${id}`).join(", ");
        // Outsourced: the supplier, and our member who looks after it.
        if (row.task.laborSource === "Outsourced" && row.task.laborSupplier) return names ? `${row.task.laborSupplier} · ${names}` : row.task.laborSupplier;
        return row.fields.picUserIds.length ? names : "";
      }
      case "status":
        return row.parent ? (row.lateKids ? t("Sheet.lateKids").replace("{count}", String(row.lateKids)) : "") : t(STATUS_LABEL[row.status] ?? row.status);
      case "hplan":
        return hoursText(row.planHours);
      case "hact":
        return hoursText(row.actualHours);
      case "hleft":
        return row.planHours ? String(Math.round((row.planHours - row.actualHours) * 10) / 10) : "";
    }
  };

  // Moving around: the active cell, and the corner a Shift-move or Shift-click runs the selection from. The add row at
  // the bottom (FOOT) is the last line the keyboard reaches.
  const lineCount = model.visible.length + 1;
  const indexOf = (cell: Cell | null) => (!cell ? -1 : cell.id === FOOT ? model.visible.length : model.visible.findIndex((row) => row.task.id === cell.id));
  const idAt = (index: number) => (index >= model.visible.length ? FOOT : model.visible[index]!.task.id);
  const activeIndex = indexOf(active);
  const activeRow = activeIndex >= 0 && activeIndex < model.visible.length ? model.visible[activeIndex]! : null;
  const area = (() => {
    const from = indexOf(anchor),
      to = activeIndex;
    if (!active || to < 0) return null;
    const start = from >= 0 ? from : to,
      startColumn = from >= 0 && anchor ? anchor.col : active.col;
    return { r0: Math.min(start, to), r1: Math.max(start, to), c0: Math.min(startColumn, active.col), c1: Math.max(startColumn, active.col) };
  })();
  const focusFrame = () => frame.current?.focus({ preventScroll: true });
  const moveBy = (down: number, across: number, extend: boolean) => {
    const { active: from, anchor: corner } = cursor.current;
    const at = indexOf(from);
    const index = at < 0 ? 0 : Math.max(0, Math.min(lineCount - 1, at + down));
    const next = { id: idAt(index), col: Math.max(0, Math.min(lastColumn, (from?.col ?? 1) + across)) };
    place(next, extend ? (corner ?? from ?? next) : next);
  };

  // Adding rows: the + at the start of a row, Insert row, "+ sub task", and the add row at the bottom.
  const lastHeading = () => [...schedule.tasks].reverse().find((task) => task.kind === "phase") ?? null;
  const placeFor = (row: Row | null, sub: boolean): Omit<Draft, "key" | "start" | "text"> | null => {
    if (!row) {
      const heading = lastHeading();
      if (heading) return canPlan || heading.canAddChild ? { parentId: heading.id, beforeId: null, kind: "task" } : null;
      return canPlan ? { parentId: null, beforeId: null, kind: "phase" } : null;
    }
    if (sub)
      return row.task.kind === "task" && canAddSub(row.task) && !lockedIds.has(row.task.id) && (canPlan || row.task.canAddChild) ? { parentId: row.task.id, beforeId: null, kind: "task" } : null;
    if (row.task.kind === "phase") return canPlan || row.task.canAddChild ? { parentId: row.task.id, beforeId: null, kind: "task" } : null;
    if (row.task.kind === "detail") return null;
    const parent = row.task.parentId === null ? null : (model.byId.get(row.task.parentId) ?? null);
    if (parent && (lockedIds.has(parent.task.id) || (!canPlan && !parent.task.canAddChild))) return null;
    if (!parent && !canPlan) return null;
    const siblings = parent ? parent.task.children : schedule.tasks;
    return { parentId: row.task.parentId, beforeId: siblings[siblings.findIndex((task) => task.id === row.task.id) + 1]?.id ?? null, kind: row.task.parentId === null ? "phase" : "task" };
  };
  const draftStart = (place: Omit<Draft, "key" | "start" | "text">): string | null => {
    if (place.kind === "phase") return null;
    const parent = place.parentId === null ? null : model.byId.get(place.parentId);
    const above = (() => {
      if (place.beforeId !== null) {
        const at = model.rows.findIndex((row) => row.task.id === place.beforeId);
        return at > 0 ? model.rows[at - 1]! : null;
      }
      const at = parent ? model.rows.indexOf(parent) : -1;
      let end = at;
      while (parent && end + 1 < model.rows.length && model.rows[end + 1]!.task.depth > parent.task.depth) end++;
      return end >= 0 ? model.rows[end]! : null;
    })();
    if (!above || above === parent) return parent?.start ?? today;
    return above.finish ? nextWorkDay(shiftDay(above.finish, 1), holidays) : today;
  };
  const openDraft = (place: Omit<Draft, "key" | "start" | "text"> | null, text = "") => {
    if (!place) return say(t("Sheet.subNotHere"), true);
    if (place.parentId !== null && collapsed.has(place.parentId)) setCollapsed((current) => new Set([...current].filter((id) => id !== place.parentId)));
    if (headingsOnly && place.kind === "task") setHeadingsOnly(false);
    draftKey.current = ++seq.current;
    setDraft({ ...place, key: draftKey.current, start: draftStart(place), text });
  };
  const closeDraft = () => {
    draftKey.current = 0;
    setDraft(null);
    focusFrame();
  };
  const submitDraft = (key: number, value: string, keepOpen: boolean) => {
    const current = draft,
      name = value.trim().slice(0, 500);
    if (!current || key !== draftKey.current) return;
    if (!name) return closeDraft();
    const fields: Fields = {
      name,
      picExternal: "",
      planStart: current.start,
      planDays: 1,
      startMode: "manual",
      predecessorId: null,
      lagDays: 0,
      extraLinks: [],
      planManDays: 0,
      picUserIds: [],
      discipline: null,
    };
    const parent = current.parentId === null ? null : model.byId.get(current.parentId);
    const id = enqueue({ type: "create", parentId: current.parentId, beforeId: current.beforeId, kind: current.kind, fields });
    setSaving((list) => [...list, { seq: id, parentId: current.parentId, beforeId: current.beforeId, name, depth: parent ? parent.task.depth + 2 : 1, atEnd: false }]);
    if (keepOpen) {
      draftKey.current = ++seq.current;
      setDraft({ ...current, key: draftKey.current, text: "", start: current.start ? nextWorkDay(shiftDay(current.start, 1), holidays) : null });
    } else closeDraft();
  };

  // Moving rows: up and down among their siblings, in under the row above, out beside their parent (plan owner only).
  const moveFor = (row: Row | null, how: "up" | "down" | "in" | "out"): { parentId: number | null; beforeId: number | null; undo: { parentId: number | null; beforeId: number | null } } | string => {
    if (!row) return "Sheet.cannotMove";
    if (!canPlan) return "Sheet.planOnly";
    const { task } = row,
      parent = task.parentId === null ? null : (model.byId.get(task.parentId) ?? null);
    const siblings = parent ? parent.task.children : schedule.tasks,
      at = siblings.findIndex((item) => item.id === task.id);
    const back = { parentId: task.parentId, beforeId: siblings[at + 1]?.id ?? null };
    if (how === "up") return at > 0 ? { parentId: task.parentId, beforeId: siblings[at - 1]!.id, undo: back } : "Sheet.cannotMove";
    if (how === "down") return at >= 0 && at < siblings.length - 1 ? { parentId: task.parentId, beforeId: siblings[at + 2]?.id ?? null, undo: back } : "Sheet.cannotMove";
    if (task.kind !== "task" || task.managedByResourcePlan || lockedIds.has(task.id)) return how === "in" ? "Sheet.cannotIndent" : "Sheet.cannotOutdent";
    if (how === "in") {
      const above = siblings[at - 1];
      return above && (above.kind === "phase" || (above.kind === "task" && canAddSub(above))) && !lockedIds.has(above.id) ? { parentId: above.id, beforeId: null, undo: back } : "Sheet.cannotIndent";
    }
    if (!parent || parent.task.kind === "phase" || parent.task.parentId === null) return "Sheet.cannotOutdent";
    const grand = model.byId.get(parent.task.parentId);
    const uncles = grand ? grand.task.children : schedule.tasks,
      parentAt = uncles.findIndex((item) => item.id === parent.task.id);
    return { parentId: parent.task.parentId, beforeId: uncles[parentAt + 1]?.id ?? null, undo: back };
  };
  /** Where a dragged row lands on another: above it, below it, or under it as its last row; null when it cannot. */
  const dropMove = (id: number, target: Drop): { parentId: number | null; beforeId: number | null } | null => {
    const dragged = model.byId.get(id),
      over = model.byId.get(target.id);
    if (!dragged || !over || !canPlan) return null;
    for (let up: Row | undefined = over; up; up = up.task.parentId === null ? undefined : model.byId.get(up.task.parentId)) if (up.task.id === id) return null;
    let parentId: number | null, beforeId: number | null;
    if (target.where === "into") {
      parentId = over.task.id;
      beforeId = null;
    } else {
      parentId = over.task.parentId;
      const list = parentId === null ? schedule.tasks : (model.byId.get(parentId)?.task.children ?? []),
        at = list.findIndex((item) => item.id === over.task.id);
      beforeId = target.where === "before" ? over.task.id : (list[at + 1]?.id ?? null);
      if (beforeId === id) beforeId = list[at + 2]?.id ?? null;
    }
    if (dragged.task.kind === "phase" ? parentId !== null : parentId === null) return null;
    if (parentId !== dragged.task.parentId && (dragged.task.managedByResourcePlan || lockedIds.has(id) || (parentId !== null && lockedIds.has(parentId)))) return null;
    const own = dragged.task.parentId === null ? schedule.tasks : (model.byId.get(dragged.task.parentId)?.task.children ?? []),
      at = own.findIndex((item) => item.id === id);
    if (parentId === dragged.task.parentId && (own[at + 1]?.id ?? null) === beforeId) return null;
    return { parentId, beforeId };
  };
  const landRow = (id: number, target: Drop) => {
    const move = dropMove(id, target),
      dragged = model.byId.get(id);
    if (!move || !dragged) return say(t("Sheet.cannotMove"), true);
    const own = dragged.task.parentId === null ? schedule.tasks : (model.byId.get(dragged.task.parentId)?.task.children ?? []);
    pushUndo({ kind: "move", taskId: id, parentId: dragged.task.parentId, beforeId: own[own.findIndex((item) => item.id === id) + 1]?.id ?? null });
    enqueue({ type: "move", taskId: id, parentId: move.parentId, beforeId: move.beforeId });
    if (move.parentId !== null && collapsed.has(move.parentId)) setCollapsed((current) => new Set([...current].filter((item) => item !== move.parentId)));
  };
  const moveRow = (how: "up" | "down" | "in" | "out") => {
    const move = moveFor(activeRow, how);
    if (typeof move === "string") return say(t(move), true);
    pushUndo({ kind: "move", taskId: activeRow!.task.id, ...move.undo });
    enqueue({ type: "move", taskId: activeRow!.task.id, parentId: move.parentId, beforeId: move.beforeId });
    if (move.parentId !== null && collapsed.has(move.parentId)) setCollapsed((current) => new Set([...current].filter((id) => id !== move.parentId)));
  };

  /** Ctrl+Z and Ctrl+Y: each step puts back what the step before changed, and keeps the way back for the other key. */
  const step = (from: React.MutableRefObject<UndoEntry[]>, to: React.MutableRefObject<UndoEntry[]>, done: string) => {
    const entry = from.current.at(-1);
    from.current = from.current.slice(0, -1);
    const row = entry ? model.byId.get(entry.taskId) : undefined;
    if (!entry || !row) {
      setSteps({ undo: undoStack.current.length, redo: redoStack.current.length });
      return say(t("Sheet.undoNothing"));
    }
    if (entry.kind === "plan") {
      to.current = [...to.current, { kind: "plan", taskId: row.task.id, patch: pick(row.fields, Object.keys(entry.patch) as (keyof Fields)[]) }];
      apply(row, entry.patch, undefined, undefined, false);
    } else {
      const parent = row.task.parentId === null ? null : model.byId.get(row.task.parentId);
      const siblings = parent ? parent.task.children : schedule.tasks;
      to.current = [...to.current, { kind: "move", taskId: row.task.id, parentId: row.task.parentId, beforeId: siblings[siblings.findIndex((item) => item.id === row.task.id) + 1]?.id ?? null }];
      enqueue({ type: "move", taskId: row.task.id, parentId: entry.parentId, beforeId: entry.beforeId });
    }
    setSteps({ undo: undoStack.current.length, redo: redoStack.current.length });
    say(`${row.task.wbs} · ${t(done)}`);
  };
  const undoLast = () => step(undoStack, redoStack, "Sheet.undone");
  const redoLast = () => step(redoStack, undoStack, "Sheet.redone");

  const startEdit = (row: Row, col: number, typed: string | null) => {
    const column = COLUMNS[col]!.key,
      lock = lockOf(row, column);
    if (lock) return say(t(lock), column !== "work" && column !== "wbs");
    const initial =
      column === "member"
        ? row.fields.picUserIds.length === 1
          ? String(row.fields.picUserIds[0])
          : !row.fields.picUserIds.length && row.fields.discipline
            ? `d:${row.fields.discipline}`
            : ""
        : column === "status"
          ? row.status
          : column === "done"
            ? String(Math.round(row.percent))
            : column === "start" || column === "end"
              ? (column === "start" ? row.start : row.finish)
                ? shortDate((column === "start" ? row.start : row.finish)!)
                : ""
              : cellText(row, column);
    const next = { id: row.task.id, col, initial, typed };
    editRef.current = next;
    setEditing(next);
  };
  /** Leaves the cell being typed: `value` null throws the typing away; then the selection moves as Enter or Tab asks. */
  const finishEdit = (value: string | null, down: number, across: number) => {
    const current = editRef.current;
    if (!current) return;
    editRef.current = null;
    setEditing(null);
    const row = model.byId.get(current.id),
      column = COLUMNS[current.col]!;
    if (row && value !== null && value !== current.initial) void commit(row, column.key, value);
    if (down || across) moveBy(down, across, false);
    focusFrame();
  };
  const focusEditor = useCallback((node: HTMLInputElement | HTMLSelectElement | null) => {
    if (!node || node === document.activeElement) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLInputElement) {
      if (node.dataset.typed) node.setSelectionRange(node.value.length, node.value.length);
      else node.select();
    }
  }, []);

  /** Ctrl+D: the cell above the selection fills the selected cells below it, as in Excel. */
  const fillDown = () => {
    if (!area || area.r0 < 1) return;
    const above = model.visible[area.r0 - 1];
    if (!above) return;
    for (let index = area.r0; index <= Math.min(area.r1, model.visible.length - 1); index++) {
      const row = model.visible[index]!;
      let fields = row.fields,
        patch: Patch | undefined,
        percent: number | undefined,
        status: string | undefined;
      for (let col = area.c0; col <= area.c1; col++) {
        const column = COLUMNS[col]!.key;
        if (lockOf(row, column)) continue;
        const value =
          column === "start" || column === "end"
            ? ((column === "start" ? above.start : above.finish) ?? "")
            : column === "status"
              ? above.status
              : column === "member"
                ? above.fields.picUserIds.length === 1
                  ? String(above.fields.picUserIds[0])
                  : above.fields.discipline
                    ? `d:${above.fields.discipline}`
                    : ""
                : cellText(above, column);
        const result = cellResult(row, column, value, fields);
        if ("error" in result) continue;
        if (result.patch) {
          patch = { ...patch, ...result.patch };
          fields = { ...fields, ...result.patch };
        }
        if (result.percent !== undefined) percent = result.percent;
        if (result.status !== undefined && result.status !== "Blocked") status = result.status;
      }
      apply(row, patch, percent, status);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const arrow = arrows[event.key],
      control = event.ctrlKey || event.metaKey,
      col = active?.col ?? 1;
    if (control && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoLast();
      else undoLast();
    } else if (control && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoLast();
    } else if (control && event.key.toLowerCase() === "d") {
      event.preventDefault();
      fillDown();
    } else if (control && event.key === "Enter") {
      event.preventDefault();
      openDraft(placeFor(activeRow, false));
    } else if (arrow && event.altKey && event.shiftKey) {
      event.preventDefault();
      moveRow(event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "ArrowRight" ? "in" : "out");
    } else if (arrow) {
      event.preventDefault();
      moveBy(arrow[0], arrow[1], event.shiftKey);
    } else if (event.key === "Tab") {
      if ((event.shiftKey && col === 0) || (!event.shiftKey && col >= lastColumn)) return;
      event.preventDefault();
      moveBy(0, event.shiftKey ? -1 : 1, false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      moveBy(event.shiftKey ? -1 : 1, 0, false);
    } else if (event.key === "Escape") {
      if (active) place(active, active);
    } else if (active?.id === FOOT) {
      // The add row: a name typed in WBS or TASK starts a row at the end of the plan.
      if (event.key.length === 1 && !control && !event.altKey && col <= COLUMN_AT.name) {
        event.preventDefault();
        openDraft(placeFor(null, false), event.key);
      } else if (event.key === "F2") say(t("Sheet.newRowHint"));
    } else if (event.key === "F2" && activeRow && active) {
      event.preventDefault();
      startEdit(activeRow, active.col, null);
    } else if ((event.key === "Delete" || event.key === "Backspace") && activeRow && active) {
      event.preventDefault();
      const column = COLUMNS[active.col]!.key,
        lock = lockOf(activeRow, column);
      if (lock) say(t(lock), column !== "work" && column !== "wbs");
      else if (cellText(activeRow, column) !== "") void commit(activeRow, column, "");
    } else if (event.key.length === 1 && !control && !event.altKey && activeRow && active) {
      event.preventDefault();
      startEdit(activeRow, active.col, COLUMNS[active.col]!.select ? null : event.key);
    }
  };
  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !area) return;
    event.preventDefault();
    const lines: string[] = [];
    for (let index = area.r0; index <= Math.min(area.r1, model.visible.length - 1); index++) {
      const row = model.visible[index]!;
      lines.push(
        COLUMNS.slice(area.c0, area.c1 + 1)
          .map((column) => (column.key === "start" || column.key === "end" ? ((column.key === "start" ? row.start : row.finish) ?? "") : cellText(row, column.key)).replace(/[\t\n]/g, " "))
          .map((value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? shortDate(value) : value))
          .join("\t"),
      );
    }
    event.clipboardData.setData("text/plain", lines.join("\n"));
    say(t("Sheet.copied"));
  };

  /** Lines that become new rows. From the WBS column, the WBS sets the level (1 heading, 1.1 task, 1.1.1 sub task);
   * from TASK, every line is a row beside `base`, or under the last heading when there is no base. */
  const addLines = (lines: string[][], startCol: number, base: Row | null, problems: string[]) => {
    const at = (line: string[], key: Column) => (COLUMN_AT[key] >= startCol ? (line[COLUMN_AT[key] - startCol] ?? "") : "");
    const heading = lastHeading();
    const levels: ({ id: number } | { seq: number } | null)[] = [null, heading ? { id: heading.id } : null, null, null];
    const sibling = base
      ? (() => {
          const parentId = base.task.kind === "phase" ? base.task.id : base.task.parentId;
          const parent = parentId === null ? null : (model.byId.get(parentId) ?? null);
          const list = parent ? parent.task.children : schedule.tasks;
          return { parentId, beforeId: base.task.kind === "phase" ? null : (list[list.findIndex((task) => task.id === base.task.id) + 1]?.id ?? null), depth: parent ? parent.task.depth + 2 : 1 };
        })()
      : null;
    const after = base?.finish ?? [...model.rows].reverse().find((row) => row.finish)?.finish ?? null;
    let start = after ? nextWorkDay(shiftDay(after, 1), holidays) : today,
      count = 0;
    for (const line of lines) {
      const name = at(line, "name").trim();
      if (!name) continue;
      const wbs = startCol === COLUMN_AT.wbs ? at(line, "wbs").trim() : "";
      let level = wbs && /^\d+(\.\d+)*$/.test(wbs) ? Math.min(3, wbs.split(".").length) : sibling ? sibling.depth : heading ? 2 : 1;
      if (level === 3 && !levels[2]) level = 2;
      if (level === 2 && !levels[1]) level = 1;
      if (!canPlan && (level === 1 || !(levels[level - 1] && "id" in levels[level - 1]! && model.byId.get((levels[level - 1] as { id: number }).id)?.task.canAddChild))) {
        problems.push(t("Sheet.readOnly"));
        break;
      }
      const kind = level === 1 ? "phase" : "task";
      const parentRef = sibling && !wbs ? (sibling.parentId === null ? null : { id: sibling.parentId }) : level === 1 ? null : levels[level - 1]!;
      const base0: Fields = {
        name,
        picExternal: "",
        planStart: kind === "phase" ? null : start,
        planDays: 1,
        startMode: "manual",
        predecessorId: null,
        lagDays: 0,
        extraLinks: [],
        planManDays: 0,
        picUserIds: [],
        discipline: null,
      };
      const task = {
        ...(base ?? model.rows[0])?.task,
        id: -1 - count,
        parentId: parentRef && "id" in parentRef ? parentRef.id : null,
        kind,
        depth: level,
        wbs: "",
        pics: [],
        children: [],
        isMilestone: false,
        managedByResourcePlan: false,
        canEditOwn: true,
        canProgress: true,
        storedPlanStart: base0.planStart,
        planStart: base0.planStart,
        planFinish: base0.planStart,
        planDays: 1,
        startMode: "manual",
        predecessorId: null,
        lagDays: 0,
        picExternal: "",
        discipline: null,
        name,
      } as ScheduleTask;
      const row: Row = {
        task,
        fields: base0,
        parent: kind === "phase",
        rollup: false,
        start: base0.planStart,
        finish: base0.planStart,
        days: base0.planStart ? 1 : null,
        workDays: null,
        percent: 0,
        status: "Not Started",
        after: "",
        lateKids: 0,
        planHours: 0,
        planFromRows: false,
        actualHours: 0,
      };
      let fields = base0,
        percent: number | undefined;
      for (const key of ["pic", "start", "end", "days", "done", "after", "member"] as Column[]) {
        const value = at(line, key);
        if (!value.trim() || lockOf(row, key)) continue;
        const result = cellResult(row, key, value, fields);
        if ("error" in result) {
          problems.push(`${wbs || name} ${t(COLUMNS[COLUMN_AT[key]]!.label)}: ${t(result.error).replace("{wbs}", result.wbs ?? "")}`);
          continue;
        }
        if (result.patch) fields = { ...fields, ...result.patch };
        if (result.percent !== undefined && kind === "task") percent = result.percent;
      }
      const job = enqueue({
        type: "create",
        parentId: parentRef && "id" in parentRef ? parentRef.id : null,
        ...(parentRef && "seq" in parentRef ? { parentSeq: parentRef.seq } : {}),
        beforeId: sibling && !wbs ? sibling.beforeId : null,
        kind,
        fields,
        ...(percent ? { percent } : {}),
      });
      setSaving((list) => [
        ...list,
        { seq: job, parentId: sibling && !wbs ? sibling.parentId : null, beforeId: sibling && !wbs ? sibling.beforeId : null, name, depth: level, atEnd: !(sibling && !wbs) },
      ]);
      levels[level] = { seq: job };
      for (let deeper = level + 1; deeper < levels.length; deeper++) levels[deeper] = null;
      const finish = fields.planStart ? shiftDay(fields.planStart, fields.planDays - 1) : null;
      if (finish) start = nextWorkDay(shiftDay(finish, 1), holidays);
      count += 1;
    }
    return count;
  };
  /** A block copied from Excel: cells land from the active cell; lines past the last row become new rows. */
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !active) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const lines = text
      .replace(/\r/g, "")
      .replace(/\n+$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const problems: string[] = [];
    let cells = 0,
      lastRow: Row | null = null;
    const extra: string[][] = [];
    lines.forEach((line, down) => {
      const row = activeIndex + down < model.visible.length ? model.visible[activeIndex + down] : undefined;
      if (!row) return extra.push(line);
      lastRow = row;
      let fields = row.fields,
        patch: Patch | undefined,
        percent: number | undefined,
        status: string | undefined;
      line.forEach((value, across) => {
        const column = COLUMNS[active.col + across]?.key;
        if (!column || column === "work" || column === "wbs") return;
        if (value.trim() === cellText(row, column)) return;
        const lock = lockOf(row, column);
        if (lock) {
          if (value.trim()) problems.push(`${row.task.wbs} ${t(COLUMNS[active.col + across]!.label)}: ${t(lock)}`);
          return;
        }
        const result = cellResult(row, column, value, fields);
        if ("error" in result) {
          problems.push(`${row.task.wbs} ${t(COLUMNS[active.col + across]!.label)}: ${t(result.error).replace("{wbs}", result.wbs ?? "")}`);
          return;
        }
        if (result.percent !== undefined) percent = result.percent;
        if (result.status !== undefined && result.status !== "Blocked") status = result.status;
        if (result.patch) {
          patch = { ...patch, ...result.patch };
          fields = { ...fields, ...result.patch };
        }
        cells += 1;
      });
      apply(row, patch, percent, status);
    });
    if (extra.length) {
      if (active.col > COLUMN_AT.name) problems.push(t("Sheet.pasteNoName"));
      else cells += addLines(extra, active.col, active.id === FOOT ? null : lastRow, problems);
    }
    say(`${t("Sheet.pasted").replace("{count}", String(cells))}${problems.length ? ` · ${problems.slice(0, 4).join(" · ")}${problems.length > 4 ? " …" : ""}` : ""}`, problems.length > 0);
  };

  // The mouse: press on a cell to select it, Shift-click to run a selection to it, double-click to type in it or, on a
  // bar, to open the task.
  const editHandler = useRef<(cell: Cell) => void>(() => undefined);
  const dragHandler = useRef<{ aim: (id: number, over: number, at: number) => Drop | null; land: (id: number, target: Drop) => void }>({ aim: () => null, land: () => undefined });
  useLayoutEffect(() => {
    dragHandler.current = {
      aim: (id, over, at) => {
        const row = model.byId.get(over);
        const takes = row && (row.task.kind === "phase" || (row.task.kind === "task" && canAddSub(row.task)));
        const where: Drop["where"] = at > 0.3 && at < 0.7 && takes ? "into" : at < 0.5 ? "before" : "after";
        return dropMove(id, { id: over, where }) ? { id: over, where } : null;
      },
      land: landRow,
    };
    editHandler.current = (cell: Cell) => {
      const row = model.byId.get(cell.id);
      if (row) startEdit(row, cell.col, null);
      else if (cell.id === FOOT && cell.col <= COLUMN_AT.name) openDraft(placeFor(null, false));
    };
  });
  useEffect(() => {
    const box = frame.current;
    if (!box) return;
    const cellOf = (target: EventTarget | null): Cell | null => {
      if (!(target instanceof Element) || target.closest("input,select,button,a")) return null;
      const cell = target.closest<HTMLElement>("td[data-c]"),
        line = cell?.closest<HTMLElement>("tr[data-id]");
      return cell && line ? { id: Number(line.dataset.id), col: Number(cell.dataset.c) } : null;
    };
    const resize = (event: MouseEvent, handle: HTMLElement) => {
      const col = Number(handle.dataset.col),
        startX = event.clientX,
        startWidth = handle.parentElement?.getBoundingClientRect().width ?? COLUMNS[col]!.width,
        key = COLUMNS[col]!.key;
      const move = (next: MouseEvent) => setWidths((current) => ({ ...current, [key]: Math.max(36, Math.round(startWidth + next.clientX - startX)) }));
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        setWidths((current) => {
          try {
            window.localStorage.setItem(WIDTH_KEY, JSON.stringify(current));
          } catch {
            /* Remembering widths is a convenience. */
          }
          return current;
        });
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };
    // A row's WBS cell is its handle: press and move to drag it; the line shows where it lands, the middle of a row
    // puts it under that row.
    const dragRow = (event: MouseEvent, id: number) => {
      const startY = event.clientY;
      let dragging = false,
        target: Drop | null = null;
      const move = (next: MouseEvent) => {
        if (!dragging && Math.abs(next.clientY - startY) < 6) return;
        dragging = true;
        box.classList.add("dragging");
        const bounds = box.getBoundingClientRect();
        if (next.clientY < bounds.top + 70) box.scrollTop -= 12;
        else if (next.clientY > bounds.bottom - 30) box.scrollTop += 12;
        const line = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>("tr[data-id]");
        const over = line && box.contains(line) ? Number(line.dataset.id) : 0;
        target = over > 0 && over !== id ? dragHandler.current.aim(id, over, (next.clientY - line!.getBoundingClientRect().top) / line!.offsetHeight) : null;
        setDrop(target);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        box.classList.remove("dragging");
        setDrop(null);
        if (dragging && target) dragHandler.current.land(id, target);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };
    const down = (event: MouseEvent) => {
      const handle = event.button === 0 && event.target instanceof Element ? event.target.closest<HTMLElement>(".rsz") : null;
      if (handle) {
        event.preventDefault();
        return resize(event, handle);
      }
      const cell = event.button === 0 ? cellOf(event.target) : null;
      if (!cell) return;
      event.preventDefault();
      box.focus({ preventScroll: true });
      place(cell, event.shiftKey ? (cursor.current.anchor ?? cursor.current.active ?? cell) : cell);
      if (cell.col === COLUMN_AT.wbs && cell.id > 0 && !event.shiftKey && live.current.canPlan) dragRow(event, cell.id);
    };
    const context = (event: MouseEvent) => {
      const line = event.target instanceof Element ? event.target.closest<HTMLElement>("tr[data-id]") : null;
      const id = line ? Number(line.dataset.id) : 0;
      if (id <= 0) return;
      event.preventDefault();
      const cell = cellOf(event.target);
      place({ id, col: cell?.col ?? cursor.current.active?.col ?? COLUMN_AT.name }, null);
      setMenu({ id, x: event.clientX, y: event.clientY });
    };
    const double = (event: MouseEvent) => {
      const bar = event.target instanceof Element ? event.target.closest<HTMLElement>(".gb[data-id]") : null;
      if (bar) return live.current.onOpenTask(Number(bar.dataset.id));
      const cell = cellOf(event.target);
      if (cell) editHandler.current(cell);
    };
    box.addEventListener("mousedown", down);
    box.addEventListener("dblclick", double);
    box.addEventListener("contextmenu", context);
    return () => {
      box.removeEventListener("mousedown", down);
      box.removeEventListener("dblclick", double);
      box.removeEventListener("contextmenu", context);
    };
  }, [place]);
  // The follow-up list closes on a click outside it or Escape, like the row menu.
  useEffect(() => {
    if (!followOpen) return;
    const close = (event: Event) => {
      if (event instanceof MouseEvent && event.target instanceof Element && event.target.closest(".ps-follow-wrap")) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setFollowOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [followOpen]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof MouseEvent && event.target instanceof Element && event.target.closest(".ps-menu")) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  // How wide the sheet is: with room for 360 px of Gantt, every column up to status stays frozen; else WBS and TASK.
  useEffect(() => {
    const box = frame.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setFrameWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const stickyCount = frameWidth - LEFT_WIDTH >= 360 ? COLUMNS.length : 2;
  const stickyWidth = LEFT[stickyCount - 1]! + width(stickyCount - 1);
  // Keeps the active cell in view, clear of the frozen columns and the header.
  useEffect(() => {
    const box = frame.current;
    if (!active || !box) return;
    const cell = box.querySelector<HTMLElement>(`tr[data-id="${active.id}"] td[data-c="${active.col}"]`);
    if (!cell) return;
    const top = (cell.parentElement as HTMLElement).offsetTop,
      bottom = top + cell.offsetHeight,
      head = 60;
    if (top - head < box.scrollTop) box.scrollTop = Math.max(0, top - head);
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    if (active.col >= stickyCount) {
      const left = cell.offsetLeft,
        right = left + cell.offsetWidth;
      if (left - stickyWidth < box.scrollLeft) box.scrollLeft = left - stickyWidth;
      else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth;
    }
  }, [active, stickyCount, stickyWidth]);
  // Finish-to-start lines over the Gantt: from a predecessor's bar end to its follower's bar start.
  useLayoutEffect(() => {
    const box = frame.current,
      svg = links.current;
    if (!box || !svg) return;
    const at = new Map<number, { s: number; e: number; y: number }>();
    box.querySelectorAll<HTMLElement>(".gb[data-id]").forEach((bar) => {
      const cell = bar.closest<HTMLElement>("td"),
        line = cell?.parentElement;
      if (!cell || !line) return;
      const x = cell.offsetLeft + bar.offsetLeft;
      at.set(Number(bar.dataset.id), { s: x, e: x + bar.offsetWidth, y: line.offsetTop + cell.offsetHeight / 2 });
    });
    let paths = "";
    for (const row of model.visible) {
      if (row.fields.startMode !== "linked" || row.fields.predecessorId === null) continue;
      const to = at.get(row.task.id);
      if (!to) continue;
      // One line from each row it waits for.
      for (const id of [row.fields.predecessorId, ...row.fields.extraLinks.map((link) => link.predecessorId)]) {
        const from = at.get(id);
        if (!from) continue;
        const x1 = from.e + 1,
          x2 = to.s - 1,
          turn = Math.min(x1 + 8, x2 - 4);
        paths += `<path class="ln" d="M${x1} ${from.y} H${turn} V${to.y} H${x2}" marker-end="url(#shArrow)"/>`;
      }
    }
    const table = box.querySelector<HTMLElement>("table.grid");
    svg.setAttribute("width", String(table?.offsetWidth ?? 0));
    svg.setAttribute("height", String(table?.offsetHeight ?? 0));
    svg.innerHTML = `<defs><marker id="shArrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6 z" class="ln-head"/></marker></defs>${paths}`;
  });
  const goToday = () => {
    const box = frame.current;
    if (box) box.scrollLeft = Math.max(0, LEFT_WIDTH + timeline.x(today) * DW - stickyWidth - 3 * DW);
  };
  const toggle = (id: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Where the typing row and the rows still saving sit: before the row they go before, else after their parent's rows.
  const placeAt = (parentId: number | null, beforeId: number | null) => {
    const rows = model.visible;
    if (beforeId !== null) {
      const at = rows.findIndex((row) => row.task.id === beforeId);
      if (at >= 0) return at;
    }
    if (parentId === null) return rows.length;
    const at = rows.findIndex((row) => row.task.id === parentId);
    if (at < 0) return -1;
    let end = at + 1;
    while (end < rows.length && rows[end]!.task.depth > rows[at]!.task.depth) end++;
    return end;
  };
  const lastSticky = Math.min(stickyCount - 1, lastColumn);
  const sticky = (col: number) =>
    col < stickyCount
      ? { className: ` stk${col === lastSticky ? " stk-last" : ""}${isFolded(col) ? " fold" : ""}`, style: { left: LEFT[col] } }
      : { className: isFolded(col) ? " fold" : "", style: undefined };
  const extras = new Map<number, React.ReactNode[]>();
  const addExtra = (at: number, node: React.ReactNode) => {
    if (at >= 0) extras.set(at, [...(extras.get(at) ?? []), node]);
  };
  const blankCells = (skip: number) =>
    COLUMNS.slice(skip).map((column, offset) => {
      const col = skip + offset,
        frozen = sticky(col);
      return <td key={column.key} className={`c${frozen.className}`} style={frozen.style} />;
    });
  for (const row of saving)
    addExtra(
      row.atEnd ? model.visible.length : placeAt(row.parentId, row.beforeId),
      <tr key={`saving-${row.seq}`} className={`lvl${Math.min(3, row.depth)} saving`}>
        <td className="gut stk" style={{ left: 0 }} />
        <td className={`c ps-mono${sticky(0).className}`} style={sticky(0).style} />
        <td className={`c${sticky(1).className}`} style={sticky(1).style}>
          <div className="nmw" style={{ paddingLeft: (row.depth - 1) * 16 }}>
            <span className="sp" />
            <span className="nt">{row.name}</span>
            <span className="spinner" />
          </div>
        </td>
        {blankCells(2)}
        <td className="tl">
          <div className="tli" />
        </td>
      </tr>,
    );
  if (draft) {
    const parent = draft.parentId === null ? null : model.byId.get(draft.parentId),
      depth = parent ? parent.task.depth + 2 : 1;
    addExtra(
      placeAt(draft.parentId, draft.beforeId),
      <tr key={`draft-${draft.key}`} className={`lvl${Math.min(3, depth)} drafting`}>
        <td className="gut stk" style={{ left: 0 }} />
        <td className={`c ps-mono${sticky(0).className}`} style={sticky(0).style} />
        <td className={`c editing${sticky(1).className}`} style={sticky(1).style}>
          <div className="nmw" style={{ paddingLeft: (depth - 1) * 16 }}>
            <span className="sp" />
            <input
              key={draft.key}
              ref={focusEditor}
              className="ed"
              maxLength={500}
              defaultValue={draft.text}
              data-typed={draft.text ? "1" : undefined}
              placeholder={t(draft.kind === "phase" ? "Plan.addHeading" : "Sheet.newName")}
              aria-label={t("Sheet.newName")}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitDraft(draft.key, event.currentTarget.value, true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeDraft();
                }
              }}
              onBlur={(event) => submitDraft(draft.key, event.currentTarget.value, false)}
            />
          </div>
        </td>
        <td className="c hint" colSpan={COLUMNS.length - 2}>
          {t("Sheet.newHint")}
        </td>
        <td className="tl">
          <div className="tli" />
        </td>
      </tr>,
    );
  }

  const editor = (row: Row, col: number) => {
    const column = COLUMNS[col]!;
    const keys = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      event.stopPropagation();
      const value = event.currentTarget.value;
      if (event.key === "Enter") {
        event.preventDefault();
        finishEdit(value, event.shiftKey ? -1 : 1, 0);
      } else if (event.key === "Tab") {
        event.preventDefault();
        finishEdit(value, 0, event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(null, 0, 0);
      } else if (!column.select && editing?.typed !== null && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        finishEdit(value, event.key === "ArrowUp" ? -1 : 1, 0);
      }
    };
    const label = `${row.task.wbs} ${column.lines ? column.lines.join(" ") : t(column.label)}`;
    if (column.key === "member") {
      const people = [...team, ...row.task.pics.filter((pic) => !team.some((person) => person.id === pic.id))].sort((a, b) => a.name.localeCompare(b.name));
      return (
        <select ref={focusEditor} className="ed" defaultValue={editing?.initial ?? ""} aria-label={label} onKeyDown={keys} onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}>
          <option value="">{t("Sheet.noMember")}</option>
          <optgroup label={t("Sheet.colMember")}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </optgroup>
          {row.task.kind === "task" ? (
            <optgroup label={t("Plan.waitingForPeople")}>
              {DISCIPLINES.map((code) => (
                <option key={code} value={`d:${code}`}>
                  {t(`Discipline.${code}`)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {row.task.kind === "task" && !row.rollup && canPlan ? (
            <optgroup label={t("Sheet.vendorGroup")}>
              {row.task.laborSource === "Outsourced" ? <option value="v:">{t("Sheet.vendorNone")}</option> : null}
              {vendorChoices.map((name) => (
                <option key={name} value={`v:${name}`}>
                  {name}
                </option>
              ))}
              <option value="v:?">{t("Sheet.vendorOther")}</option>
            </optgroup>
          ) : null}
        </select>
      );
    }
    if (column.key === "status")
      return (
        <select ref={focusEditor} className="ed" defaultValue={editing?.initial ?? ""} aria-label={label} onKeyDown={keys} onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(STATUS_LABEL[status]!)}
            </option>
          ))}
        </select>
      );
    return (
      <input
        ref={focusEditor}
        className="ed"
        defaultValue={editing?.typed ?? editing?.initial ?? ""}
        data-typed={editing?.typed ? "1" : undefined}
        autoComplete="off"
        aria-label={label}
        inputMode={column.key === "days" || column.key === "done" ? "numeric" : undefined}
        onKeyDown={keys}
        onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}
      />
    );
  };

  const cellBody = (row: Row, column: Column) => {
    const { task } = row;
    if (column === "name") {
      const folded = headingsOnly || collapsed.has(task.id),
        sub = placeFor(row, true);
      return (
        <div className="nmw" style={{ paddingLeft: task.depth * 16 }}>
          {row.rollup && !headingsOnly ? (
            <button type="button" className="caret" tabIndex={-1} aria-expanded={!folded} aria-label={`${t(folded ? "Sheet.unfold" : "Sheet.fold")} ${task.wbs}`} onClick={() => toggle(task.id)}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={folded ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6"} />
              </svg>
            </button>
          ) : (
            <span className="sp" />
          )}
          <span className="nt">{row.fields.name}</span>
          {sub && !headingsOnly ? (
            <button type="button" className="subadd" tabIndex={-1} title={t("Sheet.addSubTitle")} onClick={() => openDraft(sub)}>
              {t("Sheet.subAdd")}
            </button>
          ) : null}
        </div>
      );
    }
    if (column === "member") {
      if (task.laborSource === "Outsourced" && task.laborSupplier) {
        // The supplier, and our member who looks after the work (task doc 3.5).
        const looksAfter = cellText(row, "member").slice(task.laborSupplier.length);
        return (
          <>
            {task.laborSupplier}
            <span className="tag">{t("Sheet.outside")}</span>
            {task.purchaseRequest ? (
              <span className="tag pr" title={t("Sheet.prTitle")}>{`${task.purchaseRequest.prNo} · ${t(task.purchaseRequest.status)}`}</span>
            ) : (
              <span className="tag nopr" title={t("Sheet.prMissingTitle")}>
                {t("Sheet.prMissing")}
              </span>
            )}
            {looksAfter}
          </>
        );
      }
      const names = cellText(row, "member");
      if (names) return names;
      return task.kind === "task" && row.fields.discipline ? <span className="ph">{`${t("Sheet.waiting")} · ${t(`Discipline.${row.fields.discipline}`)}`}</span> : "";
    }
    if (column === "status") {
      if (row.parent) return row.lateKids ? <span className="ps-chip s-late">{cellText(row, "status")}</span> : "";
      const late = isLate(row, today),
        lateDays = late ? spanDays(row.finish!, today) - 1 : 0,
        due = !late && row.status === "Not Started" && row.start !== null && row.start <= today;
      return (
        <>
          <span className={`ps-chip ${STATUS_CHIP[row.status] ?? "s-ns"}`}>{cellText(row, "status")}</span>
          {late ? (
            <span className="flag late" title={t("Sheet.lateTitle").replace("{days}", String(lateDays))}>
              +{lateDays}
            </span>
          ) : due ? (
            <span className="flag due" title={t("Sheet.dueTitle")}>
              !
            </span>
          ) : null}
        </>
      );
    }
    return cellText(row, column);
  };
  const barFor = (row: Row) => {
    const { task } = row,
      inner: React.ReactNode[] = [];
    for (const day of holidays) {
      const at = timeline.x(day);
      if (at >= 0 && at < timeline.days) inner.push(<div key={`h${day}`} className="hol" style={{ left: at * DW, width: DW }} />);
    }
    const now = timeline.x(today);
    if (now >= 0 && now < timeline.days) inner.push(<div key="today" className="today" style={{ left: now * DW, width: DW }} />);
    // A main heading's own dates are the ones promised to the customer (Master Plan, 2026-11-03). Its bar now follows
    // the rows under it (owner 2026-11-23), so the promised dates stay as a dashed frame to compare with.
    const promised = row.rollup && task.kind === "phase" && task.parentId === null && task.storedPlanStart ? task.storedPlanStart : null;
    if (promised) {
      const promisedEnd = shiftDay(promised, Math.max(1, task.planDays) - 1);
      if (promised !== row.start || promisedEnd !== row.finish)
        inner.push(
          <div
            key="promised"
            className="gb promised"
            style={{ left: timeline.x(promised) * DW, width: spanDays(promised, promisedEnd) * DW - 2 }}
            title={`${t("Sheet.legendPromised")} · ${dayDate(promised)} – ${dayDate(promisedEnd)}`}
          />,
        );
    }
    if (row.start && row.finish) {
      const left = timeline.x(row.start) * DW,
        width = spanDays(row.start, row.finish) * DW - 2,
        title = `${row.fields.name} · ${dayDate(row.start)} – ${dayDate(row.finish)}`;
      if (row.parent) inner.push(<div key="bar" className="gb head" data-id={task.id} style={{ left, width }} title={title} />);
      else if (task.isMilestone) inner.push(<div key="bar" className="gb ms" data-id={task.id} style={{ left: left + DW / 2 - 6 }} title={`${title} · ${t("Sheet.openHint")}`} />);
      else {
        const late = isLate(row, today),
          outsourced = task.laborSource === "Outsourced";
        inner.push(
          <div
            key="bar"
            className={`gb${row.percent >= 100 ? " full" : ""}${row.status === "Blocked" ? " blk" : ""}${late ? " late" : ""}${outsourced ? " out" : ""}${activeRow?.task.id === task.id ? " cur" : ""}`}
            data-id={task.id}
            style={{ left, width }}
            title={`${title} · ${row.days ?? 0} ${t("Sheet.colDays")} · ${Math.round(row.percent)}% · ${t("Sheet.openHint")}`}
          >
            <div className="dn" style={{ width: `${Math.min(100, row.percent)}%` }} />
          </div>,
        );
        let tail = left + width;
        if (late) {
          const until = task.forecastFinish && task.forecastFinish > today ? task.forecastFinish : today,
            extra = (spanDays(row.finish, until) - 1) * DW;
          if (extra > 0) {
            inner.push(<div key="ext" className="ext" style={{ left: left + width, width: extra }} />);
            tail += extra;
          }
        }
        const label = outsourced && task.laborSupplier ? task.laborSupplier : task.pics.map((pic) => pic.name).join(", ");
        if (label)
          inner.push(
            <span key="label" className="gl" style={{ left: tail + 6 }}>
              {label}
            </span>,
          );
      }
    } else if (!row.parent && task.kind !== "phase")
      inner.push(
        <span key="hint" className="gl hint" style={{ left: Math.max(0, now) * DW + 6 }}>
          {t("Sheet.drawHint")}
        </span>,
      );
    return <div className="tli">{inner}</div>;
  };

  const rowsOut: React.ReactNode[] = [];
  model.visible.forEach((row, index) => {
    rowsOut.push(...(extras.get(index) ?? []));
    const { task } = row,
      current = activeIndex === index,
      plus = placeFor(row, false);
    const addTip = t(task.kind === "phase" || row.parent ? "Sheet.addUnder" : "Sheet.addBelow");
    rowsOut.push(
      <tr key={task.id} data-id={task.id} className={`lvl${Math.min(3, task.depth + 1)}${current ? " cur-row" : ""}${drop?.id === task.id ? ` drop-${drop.where}` : ""}`}>
        <td className="gut stk" style={{ left: 0 }}>
          {plus ? (
            <button type="button" className="add" tabIndex={-1} title={addTip} aria-label={`${addTip} ${task.wbs}`} onClick={() => openDraft(plus)}>
              +
            </button>
          ) : null}
        </td>
        {COLUMNS.map((column, col) => {
          const selected = area && index >= area.r0 && index <= area.r1 && col >= area.c0 && col <= area.c1 && (area.r0 !== area.r1 || area.c0 !== area.c1),
            on = current && active?.col === col,
            typing = editing && editing.id === task.id && editing.col === col,
            frozen = sticky(col);
          const calc = column.key === "work" || (row.parent && ["done", "status"].includes(column.key)) || (row.rollup && ["start", "end", "days", "after"].includes(column.key));
          const fill =
            column.key === "done" && !row.parent && row.percent > 0
              ? { backgroundImage: `linear-gradient(90deg, var(--sh-pct) ${Math.min(100, row.percent)}%, transparent ${Math.min(100, row.percent)}%)` }
              : undefined;
          return (
            <td
              key={column.key}
              data-c={col}
              aria-selected={Boolean(selected || on)}
              title={column.key === "wbs" && canPlan ? t("Sheet.dragHint") : undefined}
              className={`c${column.mono ? " ps-mono" : ""}${column.key === "wbs" && canPlan ? " grab" : ""}${column.right ? " r" : ""}${calc ? " calc" : ""}${selected ? " insel" : ""}${on ? " act" : ""}${typing ? " editing" : ""}${frozen.className}`}
              style={frozen.style || fill ? { ...frozen.style, ...fill } : undefined}
            >
              {typing ? editor(row, col) : cellBody(row, column.key)}
            </td>
          );
        })}
        <td className="tl">{barFor(row)}</td>
      </tr>,
    );
  });
  rowsOut.push(...(extras.get(model.visible.length) ?? []));
  const footIndex = model.visible.length;
  rowsOut.push(
    <tr key="foot" data-id={FOOT} className={`foot${activeIndex === footIndex ? " cur-row" : ""}`}>
      <td className="gut stk" style={{ left: 0 }}>
        <button type="button" className="add" tabIndex={-1} title={t("Sheet.addEnd")} aria-label={t("Sheet.addEnd")} onClick={() => openDraft(placeFor(null, false))}>
          +
        </button>
      </td>
      {COLUMNS.map((column, col) => {
        const frozen = sticky(col),
          on = activeIndex === footIndex && active?.col === col;
        return (
          <td key={column.key} data-c={col} aria-selected={on} className={`c${on ? " act" : ""}${frozen.className}`} style={frozen.style}>
            {column.key === "name" ? (
              <>
                <button type="button" className="lnk" tabIndex={-1} onClick={() => openDraft(placeFor(null, false))}>
                  {t("Sheet.addTaskEnd")}
                </button>
                {canPlan ? (
                  <button type="button" className="lnk" tabIndex={-1} onClick={() => openDraft({ parentId: null, beforeId: null, kind: "phase" })}>
                    {t("Sheet.addHeadingEnd")}
                  </button>
                ) : null}
                <span className="ph"> {t("Sheet.orPaste")}</span>
              </>
            ) : null}
          </td>
        );
      })}
      <td className="tl">
        <div className="tli" />
      </td>
    </tr>,
  );

  // The status bar: what is selected, the plan in one line, the save state and the keys.
  const chosen = area ? model.visible.slice(area.r0, Math.min(area.r1, model.visible.length - 1) + 1) : [];
  const chosenWork = chosen.filter((row) => !row.parent && row.workDays).reduce((sum, row) => sum + (row.workDays ?? 0), 0);
  const headings = model.rows.filter((row) => row.task.depth === 0).length,
    leaves = model.rows.filter((row) => !row.parent).length;
  let planFirst: string | null = null,
    planLast: string | null = null;
  for (const row of model.rows) {
    if (row.start && (!planFirst || row.start < planFirst)) planFirst = row.start;
    if (row.finish && (!planLast || row.finish > planLast)) planLast = row.finish;
  }
  const removal = activeRow && !busy ? removeFor(activeRow.task) : undefined;
  const pendingSave = busy || pending.length > 0 || saving.length > 0;
  const moveTitle = (how: "up" | "down" | "in" | "out", key: string) => {
    const move = moveFor(activeRow, how);
    return { disabled: typeof move === "string", title: t(key) };
  };
  const tableWidth = LEFT_WIDTH + timeline.days * DW;
  const weeks = timeline.days / 7;

  const exportRow = (row: (typeof model.rows)[number]): CustomerScheduleRow => ({
    wbs: row.task.wbs,
    level: row.task.depth + 1,
    heading: row.task.kind === "phase",
    name: row.fields.name,
    party: row.fields.picExternal,
    member: cellText(row, "member"),
    start: row.start,
    end: row.finish,
    days: row.days,
    percent: row.task.kind === "phase" ? null : Math.round(row.percent),
    workDays: row.workDays,
    after: row.after,
  });
  /** The plan as the customer file has it: headings and tasks, sub tasks only when asked, never a member's own task. */
  const exportInput = (): CustomerScheduleInput => ({
    projectName: schedule.projectName,
    customerName: project?.customerName ?? "",
    projectNo: schedule.projectNo,
    poNumber: project?.purchaseOrderNumber ?? "",
    projectStart: project?.startDate || null,
    lead: project?.leadEngineerName ?? "",
    today,
    lang: exportLang,
    // The Plan sheet has no member column; members go on the sheet "Task list".
    withMember: false,
    holidays: schedule.holidays ?? [],
    rows: model.rows.filter((row) => row.task.kind !== "detail" && (exportSub || row.task.depth <= 1)).map(exportRow),
  });
  /** The team's master Gantt workbook with this plan in it; "Task list" carries every row and its member when asked. */
  const downloadCustomerFile = async () => {
    setExportFailed(null);
    setExportBusy(true);
    let bytes: Uint8Array;
    try {
      const response = await fetch(CUSTOMER_SCHEDULE_TEMPLATE_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(t("Sheet.exportNoTemplate"));
      bytes = fillCustomerSchedule(new Uint8Array(await response.arrayBuffer()), { ...exportInput(), taskList: exportMember ? model.rows.map(exportRow) : null });
    } catch (failure) {
      setExportBusy(false);
      // What failed (a network error, a page instead of the file) means nothing to the reader; the console keeps it.
      console.error("customer schedule export", failure);
      say(t("Sheet.exportNoTemplate"), true);
      return;
    }
    // Each file sent is numbered: one more than the customer schedules already kept in folder 08 (owner 2026-11-24).
    // When the folder cannot be read, the file goes out without a number rather than not at all.
    // The highest number already used counts too, so a withdrawn copy's number is not sent again.
    const kept = await listProjectDocuments(schedule.projectId).then(
      (documents) => {
        const copies = documents.filter((document) => document.folderCode === "08" && document.documentType === "Customer schedule");
        return Math.max(copies.length, ...copies.map((document) => Number(document.fileName.match(/ v(\d+)\.xlsx$/i)?.[1] ?? 0)));
      },
      () => null,
    );
    setExportBusy(false);
    const name = customerScheduleFileName(schedule.projectNo, kept === null ? null : kept + 1);
    downloadErpEstimateWorkbookBytes(bytes, name);
    await keepCopy(bytes, name);
  };
  /** A copy goes into the project's folder 08 Schedule, so the team can see what the customer was sent and when. */
  const keepCopy = async (bytes: Uint8Array, name: string) => {
    setExportFailed(null);
    setExportBusy(true);
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await uploadProjectDocument(schedule.projectId, {
        file: new File([copy.buffer], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        folderCode: "08",
        documentType: "Customer schedule",
        remark: `Exported from the plan on ${today}`,
      });
      say(t("Sheet.exportKept"));
      setExporting(false);
    } catch (failure) {
      setExportFailed({ reason: t(failure instanceof Error ? failure.message : "The request could not be completed."), bytes, name });
    } finally {
      setExportBusy(false);
    }
  };
  // A file still being read when the dialog closes is dropped, not shown the next time it opens.
  const importRun = useRef(0);
  const closeImport = () => {
    importRun.current += 1;
    setImporting(false);
    setImported(null);
    setImportError(null);
  };
  const readImport = async (file: File) => {
    const run = ++importRun.current;
    setImportError(null);
    setImportReading(true);
    try {
      for (const sheet of await readWorkbookSheets(file)) {
        const plan = readPlanTable(cellsToGrid(sheet.cells), today);
        if (plan?.rows.length) {
          if (run === importRun.current) setImported({ file: file.name, sheet: sheet.name, plan });
          return;
        }
      }
      if (run === importRun.current) setImportError(t("Sheet.importNoTable"));
    } catch (failure) {
      if (run === importRun.current) setImportError(t("Sheet.importFailed").replace("{reason}", failure instanceof Error ? failure.message : String(failure)));
    } finally {
      if (run === importRun.current) setImportReading(false);
    }
  };
  const planForImport = () =>
    model.rows
      .filter((row) => row.task.kind !== "detail")
      .map((row) => ({ wbs: row.task.wbs, kind: row.task.kind, name: row.fields.name, party: row.fields.picExternal, start: row.start, end: row.finish, percent: row.percent, rollup: row.rollup }));
  /** Rows the plan has (by WBS) take the file's name, PIC, dates and % DONE; the others are added under their WBS parent. */
  const openTemplates = () => {
    setTemplateOpen(true);
    setTemplateName(`${schedule.projectName}`.slice(0, 200));
    setTemplateStart(today);
    listScheduleTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  };
  const chosenTemplate = templates?.find((item) => String(item.id) === templatePick) ?? null;
  const templateRows = chosenTemplate && /^\d{4}-\d{2}-\d{2}$/.test(templateStart) ? planFromTemplate(chosenTemplate, templateStart, holidays) : [];
  /** Adds the template's rows at the end of the plan: headings with their rows under them, no people, dates from the start. */
  const applyTemplate = () => {
    if (!templateRows.length || !canPlan) return;
    const parents: number[] = [];
    for (const row of templateRows) {
      const level = Math.max(1, Math.min(row.level, parents.length + 1));
      parents.length = level - 1;
      const kind = level === 1 ? "phase" : "task";
      const fields: Fields = {
        name: row.name.slice(0, 500),
        picExternal: kind === "phase" ? "" : row.party,
        planStart: row.start,
        planDays: spanDays(row.start, row.end),
        startMode: "manual",
        predecessorId: null,
        lagDays: 0,
        extraLinks: [],
        planManDays: kind === "phase" ? 0 : row.planManDays,
        picUserIds: [],
        discipline: kind === "phase" ? null : row.discipline,
      };
      const parentSeq = parents.at(-1);
      const seq = enqueue({ type: "create", parentId: null, ...(parentSeq !== undefined ? { parentSeq } : {}), beforeId: null, kind, fields });
      setSaving((list) => [...list, { seq, parentId: null, beforeId: null, name: row.name, depth: level, atEnd: true }]);
      parents.push(seq);
    }
    say(
      t("Sheet.tplApplied")
        .replace("{count}", String(templateRows.length))
        .replace("{name}", chosenTemplate?.name ?? ""),
    );
    setTemplateOpen(false);
  };
  /** Saves this plan as a new master schedule: rows at every level, working days and hours, no people or dates. */
  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    const rows = model.rows
      .filter((row) => row.task.kind !== "detail" && row.fields.name.trim())
      .map((row) => ({
        level: row.task.depth + 1,
        name: row.fields.name,
        party: row.task.kind === "phase" ? "" : row.fields.picExternal,
        discipline: row.task.kind === "phase" ? null : row.fields.discipline,
        start: row.start,
        end: row.finish,
        workDays: row.workDays,
        planHours: row.planFromRows || row.task.kind === "phase" ? 0 : row.planHours,
      }));
    if (!rows.length) return;
    setTemplateBusy(true);
    try {
      await createScheduleTemplate({ name, ...templateFromPlan(rows, holidays) });
      say(t("Sheet.tplSaved").replace("{name}", name));
      setTemplateOpen(false);
    } catch (failure) {
      say(failure instanceof ApiClientError ? failure.message : t("Sheet.tplFailed"), true);
    } finally {
      setTemplateBusy(false);
    }
  };
  const applyImport = async () => {
    if (!imported || !canPlan) return;
    const otherProject = imported.plan.projectNo && imported.plan.projectNo !== schedule.projectNo;
    if (otherProject && !(await confirmDialog(t("Sheet.importOtherConfirm").replace("{file}", imported.plan.projectNo).replace("{plan}", schedule.projectNo)))) return;
    const { changes } = importChanges(imported.plan.rows, planForImport());
    const made = new Map<string, number>(),
      skipped: string[] = [];
    let added = 0,
      updated = 0;
    for (const { row, status } of changes) {
      if (status === "same") continue;
      const current = status === "add" ? undefined : model.rows.find((item) => item.task.wbs === row.wbs && item.task.kind !== "detail");
      if (current) {
        // A row waiting on a day request, or owned by the team overview, keeps its plan as it is.
        const held = lockedIds.has(current.task.id) || Boolean(current.task.managedByResourcePlan);
        const patch: Patch = {};
        if (!held && !lockOf(current, "name")) patch.name = row.name;
        if (!held && row.party && current.task.kind !== "phase" && !lockOf(current, "pic")) patch.picExternal = row.party;
        const datesCount = !held && !row.parent && !current.rollup && current.task.kind !== "phase";
        const moved = Boolean(row.start && row.end && (row.start !== current.start || row.end !== current.finish));
        if (datesCount && moved && !lockOf(current, "start")) {
          Object.assign(patch, { planStart: row.start, planDays: current.task.isMilestone ? 1 : spanDays(row.start!, row.end!) });
          if (current.fields.startMode === "linked") Object.assign(patch, { startMode: "manual", predecessorId: null, lagDays: 0, extraLinks: [] });
        }
        const percent = datesCount && row.percent !== null && !lockOf(current, "done") ? row.percent : undefined;
        if (apply(current, patch, percent, undefined)) updated += 1;
        else skipped.push(row.wbs);
        continue;
      }
      const parentWbs = row.wbs.split(".").slice(0, -1).join(".");
      const parentSeq = parentWbs ? made.get(parentWbs) : undefined;
      const existingParent = parentWbs && parentSeq === undefined ? model.rows.find((item) => item.task.wbs === parentWbs && item.task.kind !== "detail") : undefined;
      // Under a row of the plan only where the row menu would add one: a heading, or a task that takes sub tasks.
      const takes = existingParent ? !lockedIds.has(existingParent.task.id) && (existingParent.task.kind === "phase" || (existingParent.task.kind === "task" && canAddSub(existingParent.task))) : true;
      if (parentWbs && ((!existingParent && parentSeq === undefined) || !takes)) {
        skipped.push(row.wbs);
        continue;
      }
      const kind = parentWbs ? "task" : "phase";
      const fields: Fields = {
        name: row.name,
        picExternal: kind === "phase" ? "" : row.party,
        planStart: row.start ?? (kind === "phase" ? null : today),
        planDays: row.start && row.end ? spanDays(row.start, row.end) : 1,
        startMode: "manual",
        predecessorId: null,
        lagDays: 0,
        extraLinks: [],
        planManDays: 0,
        picUserIds: [],
        discipline: null,
      };
      const seq = enqueue({
        type: "create",
        parentId: existingParent ? existingParent.task.id : null,
        ...(parentSeq !== undefined ? { parentSeq } : {}),
        beforeId: null,
        kind,
        fields,
        ...(kind === "task" && !row.parent && row.percent ? { percent: row.percent } : {}),
      });
      made.set(row.wbs, seq);
      setSaving((list) => [...list, { seq, parentId: null, beforeId: null, name: row.name, depth: row.level, atEnd: true }]);
      added += 1;
    }
    say(
      `${t("Sheet.importDone").replace("{updated}", String(updated)).replace("{added}", String(added))}${skipped.length ? ` · ${t("Sheet.importSkipped").replace("{wbs}", skipped.slice(0, 6).join(", "))}` : ""}`,
      skipped.length > 0,
    );
    closeImport();
  };
  const menuRow = menu ? (model.byId.get(menu.id) ?? null) : null;
  const runMenu = (key: string) => {
    if (!menuRow) return;
    if (key === "above" || key === "below" || key === "sub") openDraft(menuPlaces[key] ?? null);
    else if (key === "in" || key === "out" || key === "up" || key === "down") moveRow(key);
    else if (key === "open") onOpenTask(menuRow.task.id);
    else if (key === "pr") void linkRequest(menuRow);
    else if (key === "delete") removeFor(menuRow.task)?.onRemove();
  };
  /** Task doc 3.7: which purchase request the outsourced row's supplier is bought on; empty unlinks it. */
  const linkRequest = async (row: Row) => {
    const typed = await promptDialog(t("Sheet.prAsk"), { title: t("Sheet.prLink"), value: row.task.purchaseRequest?.prNo ?? "" });
    if (typed === null) return;
    const prNo = typed.trim() || null;
    if ((row.task.purchaseRequest?.prNo ?? null) === prNo) return;
    enqueue({ type: "pr", taskId: row.task.id, prNo });
    say(prNo ? t("Sheet.prLinked").replace("{pr}", prNo) : t("Sheet.prUnlinked"));
  };
  const menuItems: { key: string; label: string; disabled?: boolean }[] = [];
  const menuPlaces: Record<string, Omit<Draft, "key" | "start" | "text"> | null> = {};
  if (menu && menuRow) {
    const { task } = menuRow;
    const parent = task.parentId === null ? null : model.byId.get(task.parentId);
    const above =
      task.kind === "detail" || (parent ? lockedIds.has(parent.task.id) || (!canPlan && !parent.task.canAddChild) : !canPlan)
        ? null
        : { parentId: task.parentId, beforeId: task.id, kind: (task.parentId === null ? "phase" : "task") as "phase" | "task" };
    const below = placeFor(menuRow, false),
      sub = placeFor(menuRow, true),
      removal = removeFor(task);
    menuPlaces.above = above;
    menuPlaces.below = below;
    menuPlaces.sub = sub;
    menuItems.push(
      { key: "above", label: t(task.kind === "phase" ? "Sheet.insertHeadingAbove" : "Sheet.insertAbove"), disabled: !above },
      { key: "below", label: t(task.kind === "phase" || menuRow.rollup ? "Sheet.addUnder" : "Sheet.addBelow"), disabled: !below },
      { key: "sub", label: t("Sheet.addSubTitle"), disabled: !sub },
      { key: "in", label: t("Sheet.indentTitle"), disabled: typeof moveFor(menuRow, "in") === "string" },
      { key: "out", label: t("Sheet.outdentTitle"), disabled: typeof moveFor(menuRow, "out") === "string" },
      { key: "up", label: t("Sheet.moveUpTitle"), disabled: typeof moveFor(menuRow, "up") === "string" },
      { key: "down", label: t("Sheet.moveDownTitle"), disabled: typeof moveFor(menuRow, "down") === "string" },
      { key: "open", label: t("Sheet.openTask") },
      { key: "delete", label: t("Plan.deleteRow"), disabled: !removal || busy },
    );
    if (task.laborSource === "Outsourced" && canPlan) menuItems.splice(menuItems.length - 1, 0, { key: "pr", label: t("Sheet.prLink") });
  }

  const importView = importing && imported ? importChanges(imported.plan.rows, planForImport()) : null;
  const importCount = (status: string) => (importView ? importView.changes.filter((item) => item.status === status).length : 0);
  const preview = exporting ? customerScheduleSheet(exportInput()) : null;
  const previewDays = exporting ? customerScheduleDays(exportInput()) : [];
  const shownDays = Math.min(previewDays.length, 70);
  // The plan's columns and the narrow blank one; PREDECESSOR is hidden in the file, as in the team's own, and here too.
  const previewLeft = 10;
  const previewHidden = preview ? preview.widths.findIndex((column) => column.hidden) : -1;
  const previewText = (value: string | number | null | undefined, style: number) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" && (style === 14 || style === 15)) {
      const iso = shiftDay("1899-12-30", value);
      return `${(exportLang === "th" ? NAMES.TH! : NAMES.EN!).day[asDate(iso).getUTCDay()]} ${shortDate(iso)}`;
    }
    if (typeof value === "number" && style === 18) return `${Math.round(value * 100)}%`;
    return String(value);
  };

  return (
    <section className="plan-sheet" data-guide="plan.sheet" aria-label={t("Sheet.label")}>
      {templateOpen ? (
        <Modal
          title="Sheet.tpl"
          subtitle="Sheet.tplSubtitle"
          size="lg"
          onClose={() => setTemplateOpen(false)}
          footer={
            <button type="button" className="btn ghost" onClick={() => setTemplateOpen(false)}>
              {t("Cancel")}
            </button>
          }
        >
          <div className="ps-tpl">
            <section>
              <h4>{t("Sheet.tplUse")}</h4>
              <div className="ps-tpl-row">
                <select value={templatePick} onChange={(event) => setTemplatePick(event.target.value)} aria-label={t("Sheet.tplPick")}>
                  <option value="">{templates === null ? t("Loading") : t("Sheet.tplPick")}</option>
                  {(templates ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.plan?.length ? ` · ${item.plan.length}` : ` · ${item.rows.length}`}
                    </option>
                  ))}
                </select>
                <label>
                  {t("Sheet.tplStart")} <input type="date" value={templateStart} onChange={(event) => setTemplateStart(event.target.value)} />
                </label>
                <button type="button" className="btn primary" disabled={!templateRows.length || !canPlan} title={canPlan ? undefined : t("Sheet.readOnly")} onClick={applyTemplate}>
                  {t("Sheet.tplApply")}
                </button>
              </div>
              {templateRows.length ? (
                <p className="ps-tpl-note">
                  {t("Sheet.tplPreview")
                    .replace("{count}", String(templateRows.length))
                    .replace("{start}", dayDate(templateRows.map((row) => row.start).sort()[0]!))
                    .replace(
                      "{end}",
                      dayDate(
                        templateRows
                          .map((row) => row.end)
                          .sort()
                          .at(-1)!,
                      ),
                    )}
                </p>
              ) : null}
            </section>
            <section>
              <h4>{t("Sheet.tplSave")}</h4>
              <div className="ps-tpl-row">
                <input value={templateName} maxLength={200} onChange={(event) => setTemplateName(event.target.value)} aria-label={t("Sheet.tplName")} placeholder={t("Sheet.tplName")} />
                <button type="button" className="btn" disabled={!templateName.trim() || templateBusy || !model.rows.length} onClick={() => void saveTemplate()}>
                  {t("Sheet.tplSaveButton")}
                </button>
              </div>
              <p className="ps-tpl-note">{t("Sheet.tplSaveNote")}</p>
            </section>
          </div>
        </Modal>
      ) : null}
      {importing ? (
        <Modal
          title="Sheet.import"
          subtitle="Sheet.importSubtitle"
          size="lg"
          onClose={closeImport}
          footer={
            <>
              {imported ? (
                <button type="button" className="btn ghost" onClick={() => setImported(null)}>
                  {t("Sheet.importAgain")}
                </button>
              ) : null}
              <button type="button" className="btn ghost" onClick={closeImport}>
                {t("Cancel")}
              </button>
              <button type="button" className="btn primary" disabled={!importView || importCount("add") + importCount("update") === 0} onClick={() => void applyImport()}>
                {t("Sheet.importApply")}
              </button>
            </>
          }
        >
          {importError ? (
            <div className="ps-xl-error" role="alert">
              <span>{importError}</span>
            </div>
          ) : null}
          {!imported ? (
            <label className="ps-im-drop">
              <b>{importReading ? t("Sheet.importReading") : t("Sheet.importDrop")}</b>
              <small>{t("Sheet.importDropHint")}</small>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void readImport(file);
                }}
              />
            </label>
          ) : (
            <>
              <div className="ps-im-sum">
                <b>{imported.file}</b>
                <span>{t("Sheet.importSheet").replace("{name}", imported.sheet)}</span>
                <span>
                  {t("Sheet.projectLine")
                    .replace("{heads}", String(imported.plan.rows.filter((row) => row.level === 1).length))
                    .replace("{tasks}", String(imported.plan.rows.filter((row) => !row.parent).length))}
                </span>
                {imported.plan.projectNo && imported.plan.projectNo !== schedule.projectNo ? (
                  <span className="warn">{t("Sheet.importOtherProject").replace("{file}", imported.plan.projectNo).replace("{plan}", schedule.projectNo)}</span>
                ) : null}
              </div>
              {imported.plan.warnings.length ? (
                <ul className="ps-im-warn">
                  {imported.plan.warnings.slice(0, 8).map((warning) => (
                    <li key={`${warning.line}${warning.key}`}>{t(warning.key).replace("{line}", String(warning.line)).replace("{name}", warning.name)}</li>
                  ))}
                </ul>
              ) : null}
              <p className="ps-im-counts">
                {t("Sheet.importCounts")
                  .replace("{update}", String(importCount("update")))
                  .replace("{add}", String(importCount("add")))
                  .replace("{same}", String(importCount("same")))
                  .replace("{kept}", String(importView?.kept ?? 0))}
              </p>
              <div className="ps-im-prev">
                <table>
                  <thead>
                    <tr>
                      <th>WBS</th>
                      <th>TASK</th>
                      <th>PIC</th>
                      <th>START</th>
                      <th>END</th>
                      <th>% DONE</th>
                      <th>{t("Sheet.importResult")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importView?.changes.map(({ row, status, was }) => (
                      <tr key={`${row.wbs}-${row.line}`} className={row.level === 1 ? "l1" : undefined}>
                        <td className="mono">{row.wbs}</td>
                        <td style={{ paddingLeft: 8 + (row.level - 1) * 14 }}>
                          {was ? <s className="was">{was}</s> : null}
                          {row.name}
                        </td>
                        <td>{row.party}</td>
                        <td className="mono">{dayDate(row.start)}</td>
                        <td className="mono">{dayDate(row.end)}</td>
                        <td className="mono">{row.parent || row.percent === null ? "" : `${row.percent}%`}</td>
                        <td>
                          <span className={`st ${status}`}>{t(status === "add" ? "Sheet.importAdd" : status === "update" ? "Sheet.importUpdate" : "Sheet.importSame")}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      ) : null}
      {exporting && preview ? (
        <Modal
          title="Sheet.export"
          subtitle="Sheet.exportSubtitle"
          size="xl"
          onClose={() => {
            setExporting(false);
            setExportFailed(null);
          }}
          footer={
            <>
              <span className="ps-xl-note">{t("Sheet.exportNote").replace("{name}", customerScheduleFileName(schedule.projectNo))}</span>
              <button type="button" className="btn ghost" onClick={() => setExporting(false)}>
                {t("Close")}
              </button>
              <button type="button" className="btn primary" disabled={exportBusy} onClick={() => void downloadCustomerFile()}>
                {exportBusy ? <span className="spinner" /> : null}
                {t("Sheet.download")}
              </button>
            </>
          }
        >
          {exportFailed ? (
            <div className="ps-xl-error" role="alert">
              <span>{t("Sheet.exportNotKept").replace("{reason}", exportFailed.reason)}</span>
              <button type="button" className="btn ghost sm" disabled={exportBusy} onClick={() => void keepCopy(exportFailed.bytes, exportFailed.name)}>
                {t("Sheet.retryCopy")}
              </button>
            </div>
          ) : null}
          {/* The master shows 43 weeks from Display Week. */}
          {previewDays.length > 43 * 7 ? <p className="ps-xl-cap">{t("Sheet.exportCapped")}</p> : null}
          <div className="ps-xl-opts">
            <label>
              {t("Sheet.exportLang")}{" "}
              <select value={exportLang} onChange={(event) => setExportLang(event.target.value === "en" ? "en" : "th")}>
                <option value="th">{t("Sheet.exportLangTh")}</option>
                <option value="en">{t("Sheet.exportLangEn")}</option>
              </select>
            </label>
            <label className="chk">
              <input type="checkbox" checked={exportMember} onChange={(event) => setExportMember(event.target.checked)} /> {t("Sheet.exportMember")}
            </label>
            <label className="chk">
              <input type="checkbox" checked={exportSub} onChange={(event) => setExportSub(event.target.checked)} /> {t("Sheet.exportSubTasks")}
            </label>
          </div>
          <div className="ps-xl-box">
            <div className="ps-xl-head">
              {preview.rows.slice(0, 3).map((line, index) => (
                <div key={index} className={index ? "" : "xt"}>
                  {String(line[0]?.value ?? "")}
                </div>
              ))}
            </div>
            <table className="ps-xl" style={{ width: 268 + (previewLeft - 2) * 50 + shownDays * 11 }}>
              <thead>
                <tr>
                  <th colSpan={previewLeft - 1} />
                  {Array.from({ length: shownDays / 7 }, (_, week) => (
                    <th key={week} colSpan={7} className="wk">
                      {`Week ${week + 1}`}
                    </th>
                  ))}
                </tr>
                <tr>
                  {preview.rows[6]!.slice(0, previewLeft).map((cell, index) =>
                    index === previewHidden ? null : (
                      <th key={index} className={index === previewLeft - 1 ? "lbl sp" : "lbl"}>
                        {String(cell.value ?? "")}
                      </th>
                    ),
                  )}
                  {previewDays.slice(0, shownDays).map((day) => (
                    <th key={day} className={`dn${day === today ? " td" : ""}`}>
                      {Number(day.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(7).map((line, index) => (
                  <tr key={index}>
                    {line.slice(0, previewLeft + shownDays).map((cell, col) =>
                      col === previewHidden ? null : (
                        <td key={col} className={`x${cell.style}${col >= previewLeft - 1 ? " g" : ""}`}>
                          {col < previewLeft ? previewText(cell.value, cell.style) : null}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
      {menu && menuRow ? (
        <div
          className="ps-menu"
          role="menu"
          aria-label={t("Sheet.menuLabel")}
          style={{ left: Math.min(menu.x, (typeof window === "undefined" ? 1200 : window.innerWidth) - 280), top: Math.min(menu.y, (typeof window === "undefined" ? 800 : window.innerHeight) - 330) }}
        >
          <div className="ps-menu-head">{`${menuRow.task.wbs} ${menuRow.fields.name}`}</div>
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={item.key === "delete" ? "danger" : undefined}
              disabled={item.disabled}
              onClick={() => {
                setMenu(null);
                runMenu(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tools">
        <div className="grp">
          <button
            type="button"
            className="btn ic"
            disabled={!steps.undo}
            title={t("Sheet.undoTitle")}
            aria-label={t("Sheet.undo")}
            onClick={() => {
              undoLast();
              focusFrame();
            }}
          >
            <Glyph d={GLYPH.undo} />
          </button>
          <button
            type="button"
            className="btn ic"
            disabled={!steps.redo}
            title={t("Sheet.redoTitle")}
            aria-label={t("Sheet.redo")}
            onClick={() => {
              redoLast();
              focusFrame();
            }}
          >
            <Glyph d={GLYPH.redo} />
          </button>
        </div>
        <div className="grp" data-guide="plan.sheetAdd">
          <button type="button" className="btn" disabled={!placeFor(activeRow, false)} title={t("Sheet.insertTitle")} onClick={() => openDraft(placeFor(activeRow, false))}>
            <Glyph d={GLYPH.plus} />
            {t("Sheet.insertRow")}
          </button>
          <button type="button" className="btn ic" aria-label={t("Sheet.outdent")} {...moveTitle("out", "Sheet.outdentTitle")} onClick={() => moveRow("out")}>
            <Glyph d={GLYPH.outdent} />
          </button>
          <button type="button" className="btn ic" aria-label={t("Sheet.indent")} {...moveTitle("in", "Sheet.indentTitle")} onClick={() => moveRow("in")}>
            <Glyph d={GLYPH.indent} />
          </button>
          <button type="button" className="btn ic" aria-label={t("Sheet.moveUp")} {...moveTitle("up", "Sheet.moveUpTitle")} onClick={() => moveRow("up")}>
            <Glyph d={GLYPH.up} />
          </button>
          <button type="button" className="btn ic" aria-label={t("Sheet.moveDown")} {...moveTitle("down", "Sheet.moveDownTitle")} onClick={() => moveRow("down")}>
            <Glyph d={GLYPH.down} />
          </button>
          <button type="button" className="btn" disabled={!removal} title={removal?.reason ?? t("Sheet.deleteSelected")} onClick={() => removal?.onRemove()}>
            <Glyph d={GLYPH.trash} />
            {t("Plan.deleteRow")}
          </button>
        </div>
        <div className="seg" role="group" aria-label={t("Sheet.viewLabel")}>
          <button type="button" className={headingsOnly ? "" : "on"} aria-pressed={!headingsOnly} onClick={() => setHeadingsOnly(false)}>
            {t("Sheet.viewAll")}
          </button>
          <button type="button" className={headingsOnly ? "on" : ""} aria-pressed={headingsOnly} onClick={() => setHeadingsOnly(true)}>
            {t("Sheet.viewHeadings")}
          </button>
        </div>
        <button type="button" className="btn" onClick={goToday}>
          <Glyph d={GLYPH.calendar} />
          {t("Sheet.goToday")}
        </button>
        <span className="ps-follow-wrap">
          <button
            type="button"
            className={`btn${followCount ? " ps-follow-on" : ""}`}
            data-guide="plan.sheetFollow"
            aria-expanded={followOpen}
            disabled={!followCount}
            onClick={() => setFollowOpen((open) => !open)}
          >
            {t("Sheet.follow")} <b className="ps-mono">{followCount}</b>
          </button>
          {followOpen ? (
            <div className="ps-follow" role="dialog" aria-label={t("Sheet.follow")}>
              {followUps.map((group) => (
                <section key={group.key}>
                  <h4>
                    {t(`Sheet.follow.${group.key}`)} <span className="ps-mono">{group.rows.length}</span>
                  </h4>
                  <ul>
                    {group.rows.slice(0, 30).map((row) => (
                      <li key={row.task.id}>
                        <button type="button" onClick={() => goToRow(row)}>
                          <span className="ps-mono">{row.task.wbs}</span> {row.fields.name}
                        </button>
                      </li>
                    ))}
                    {group.rows.length > 30 ? <li className="ps-follow-more">{t("Sheet.followMore").replace("{count}", String(group.rows.length - 30))}</li> : null}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </span>
        <button type="button" className="btn" aria-pressed={folded} title={t("Sheet.foldTitle")} onClick={toggleFold}>
          <Glyph d={folded ? GLYPH.unfold : GLYPH.fold} />
          {t(folded ? "Sheet.showColumns" : "Sheet.foldColumns")}
        </button>
        <span className="grow" />
        <button type="button" className="btn" data-guide="plan.sheetTemplate" onClick={openTemplates}>
          {t("Sheet.tpl")}
        </button>
        <button type="button" className="btn" data-guide="plan.sheetImport" disabled={!canPlan} title={canPlan ? undefined : t("Sheet.importPlanOnly")} onClick={() => setImporting(true)}>
          <Glyph d={GLYPH.upload} />
          {t("Sheet.import")}
        </button>
        <button type="button" className="btn primary" data-guide="plan.sheetExport" onClick={() => setExporting(true)}>
          <Glyph d={GLYPH.download} />
          {t("Sheet.export")}
        </button>
      </div>
      {budget.length ? (
        <div className="ps-budget" data-guide="plan.sheetHours" role="group" aria-label={t("Sheet.budgetLabel")}>
          <span className="ps-budget-lbl">{t("Sheet.budgetLabel")}</span>
          <button type="button" className="ps-budget-all" aria-pressed={disciplineFilter === null} onClick={() => setDisciplineFilter(null)}>
            {t("Sheet.budgetAll")}
          </button>
          {budget.map((item) => {
            const over = item.budget > 0 && item.plan > item.budget;
            return (
              <button
                key={item.discipline}
                type="button"
                className={`ps-budget-item${over ? " over" : ""}`}
                aria-pressed={disciplineFilter === item.discipline}
                title={over ? t("Sheet.budgetOver") : undefined}
                onClick={() => setDisciplineFilter((current) => (current === item.discipline ? null : item.discipline))}
              >
                <b>{disciplineLabel(item.discipline)}</b>
                <span className="ps-mono">
                  {t("Sheet.budgetLine")
                    .replace("{plan}", hoursText(item.plan) || "0")
                    .replace("{budget}", item.budget ? hoursText(item.budget) : "–")
                    .replace("{actual}", hoursText(item.actual) || "0")}
                </span>
                <i className="ps-budget-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, item.budget ? (item.plan / item.budget) * 100 : item.plan ? 100 : 0)}%` }} />
                  <i className="act" style={{ width: `${Math.min(100, item.budget ? (item.actual / item.budget) * 100 : 0)}%` }} />
                </i>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="legend" aria-label={t("Sheet.legendLabel")}>
        <span>
          <i className="sw task" />
          {t("Sheet.legendTask")}
        </span>
        <span>
          <i className="sw part" />
          {t("Sheet.legendDone")}
        </span>
        <span>
          <i className="sw full" />
          {t("Sheet.legendFull")}
        </span>
        <span>
          <i className="sw head" />
          {t("Sheet.legendHeading")}
        </span>
        <span>
          <i className="sw promised" />
          {t("Sheet.legendPromised")}
        </span>
        <span>
          <i className="sw hol" />
          {t("Sheet.holiday")}
        </span>
        <span>
          <i className="sw now" />
          {`${t("Sheet.today")} ${dayDate(today)}`}
        </span>
        <span>
          <i className="sw late" />
          {t("Sheet.legendLate")}
        </span>
        <span>
          <i className="sw blk" />
          {t("Sheet.stBlocked")}
        </span>
        <span>
          <i className="sw out" />
          {t("Sheet.legendOut")}
        </span>
        <span>
          <svg width="24" height="10" aria-hidden="true">
            <path d="M1 2 H8 V8 H22" className="ln" />
          </svg>
          {t("Sheet.legendLink")}
        </span>
        <span>{t("Sheet.legendNote")}</span>
      </div>
      <div ref={frame} className="ps-scroll" role="grid" tabIndex={0} aria-label={t("Sheet.label")} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
        <table className="grid" style={{ width: tableWidth, ["--dw" as string]: `${DW}px` } as React.CSSProperties}>
          <colgroup>
            <col style={{ width: GUT }} />
            {COLUMNS.map((column, col) => (
              <col key={column.key} style={{ width: width(col) }} />
            ))}
            <col style={{ width: timeline.days * DW }} />
          </colgroup>
          <thead>
            <tr className="h1">
              <th rowSpan={3} className="lh gut stk" style={{ left: 0 }} aria-label="+" />
              {COLUMNS.map((column, col) => {
                const frozen = sticky(col);
                return (
                  <th key={column.key} rowSpan={3} scope="col" className={`lh${column.right ? " r" : ""}${frozen.className}`} style={frozen.style}>
                    {column.lines ? (
                      <>
                        {column.lines[0]}
                        <br />
                        {column.lines[1]}
                      </>
                    ) : column.key === "after" ? (
                      <span data-guide="plan.sheetAfter">{t(column.label)}</span>
                    ) : (
                      t(column.label)
                    )}
                    {column.key === "name" ? (
                      <button
                        type="button"
                        className="colfold"
                        aria-pressed={folded}
                        title={t("Sheet.foldTitle")}
                        aria-label={t(folded ? "Sheet.showColumns" : "Sheet.foldColumns")}
                        onClick={toggleFold}
                      >
                        {folded ? "»" : "«"}
                      </button>
                    ) : null}
                    {column.sub ? <small>{column.sub.startsWith("Sheet.") ? t(column.sub) : column.sub}</small> : null}
                    <span className="rsz" data-col={col} title={t("Sheet.resizeHint")} aria-hidden="true" />
                  </th>
                );
              })}
              <th className="th-tl">
                <div className="tlh">
                  {Array.from({ length: weeks }, (_, week) => (
                    <div key={week} className="wkc" style={{ width: 7 * DW }}>
                      <b>{t("Sheet.week").replace("{n}", String(week + 1))}</b>
                      <span>{longDate(shiftDay(timeline.from, week * 7))}</span>
                    </div>
                  ))}
                </div>
              </th>
            </tr>
            {(["num", "dow"] as const).map((kind) => (
              <tr key={kind} className={kind === "num" ? "h2" : "h3"}>
                <th className="th-tl">
                  <div className="tlh">
                    {timeline.dates.map((day) => {
                      const weekday = asDate(day).getUTCDay();
                      return (
                        <div
                          key={day}
                          className={`dc${weekday === 1 ? " mon" : ""}${weekday === 0 || weekday === 6 ? " we" : ""}${holidays.has(day) ? " hol" : ""}${day === today ? " td" : ""}`}
                          title={holidays.has(day) ? t("Sheet.holiday") : undefined}
                        >
                          {kind === "num" ? Number(day.slice(8)) : names.letter[weekday]}
                        </div>
                      );
                    })}
                  </div>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>{rowsOut}</tbody>
        </table>
        <svg ref={links} className="links" aria-hidden="true" />
      </div>
      <div className="status">
        <span>
          {activeIndex === footIndex
            ? t("Sheet.newRowHint")
            : chosen.length
              ? `${t("Sheet.selRows").replace("{count}", String(chosen.length))}${chosenWork ? ` · ${t("Sheet.selWork").replace("{days}", String(chosenWork))}` : ""}`
              : t("Sheet.clickHint")}
        </span>
        <span>{`${t("Sheet.projectLine").replace("{heads}", String(headings)).replace("{tasks}", String(leaves))}${planFirst && planLast ? ` · ${dayDate(planFirst)} – ${dayDate(planLast)}` : ""}`}</span>
        <span className={`save${note?.error ? " error" : ""}`} role="status">
          {note ? (
            note.text
          ) : pendingSave ? (
            <>
              <span className="spinner" />
              {t("Sheet.saving")}
            </>
          ) : savedAt ? (
            t("Sheet.savedAt").replace("{time}", savedAt)
          ) : (
            t("Sheet.autoSave")
          )}
        </span>
        <span className="keys">
          <span>
            <kbd>Enter</kbd> {t("Sheet.keyDown")}
          </span>
          <span>
            <kbd>Tab</kbd> {t("Sheet.keyRight")}
          </span>
          <span>
            <kbd>F2</kbd> {t("Sheet.keyEdit")}
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>V</kbd> {t("Sheet.keyPaste")}
          </span>
          <span>
            <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd> {t("Sheet.keyIndent")}
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>D</kbd> {t("Sheet.keyFill")}
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> {t("Sheet.undo")}
          </span>
        </span>
      </div>
    </section>
  );
}
