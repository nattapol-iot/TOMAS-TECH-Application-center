"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiClientError, listProjects, type BootstrapData, type ProjectSummary } from "../api-client";
import { confirmDialog } from "../dialogs";
import { localeFor, useLanguage, useT } from "../i18n";
import { Icon, type IconName } from "../ui";
import { choiceLink, textLink, useLinkedState, useScreenPlace } from "../screen-link";
import { useActivitySubView } from "../use-activity-presence";
import { downloadErpEstimateWorkbookBytes } from "../../../lib/erp-estimate-workbook";
import { buildIssueWorkbook, issueWorkbookName } from "../../../lib/issue-workbook";
import {
  applyPaste,
  batchProgress,
  blankDraftRow,
  draftErrors,
  draftPayload,
  draftRowIsBlank,
  EXCEL_STATUS,
  hoursText,
  hoursToManDays,
  ISSUE_STATE_TONE,
  OPEN_ISSUE_STATES,
  parseHours,
  type DraftField,
  type DraftRow,
  type IssueAction,
  type IssueCategory,
  type IssueState,
} from "../../../lib/issue-batches";
import { boardDays, dailyLoad, weekTotals } from "../../../lib/team-board";
import { weeklyCapacity, type Commitment } from "../../../lib/resource-planning";
import { loadTeamBoard, type TeamBoardData } from "../resource-workload-client";
import {
  addIssueImage,
  addIssueItems,
  createIssueBatch,
  issueImageBlob,
  loadIssueBatch,
  loadIssueBatches,
  removeIssueImage,
  takeIssueAction,
  updateIssueBatch,
  updateIssueItem,
  type IssueActionInput,
  type IssueBatch,
  type IssueBatchHeaderInput,
  type IssueBatchItem,
  type IssueBatchList,
  type IssueBatchTab,
  type IssueImage,
  type IssueItem,
} from "./issue-batch-client";
import "./issue-batch.css";

/*
 * Projects > Punchlist: customer issue batches in the Pegasus ERP look (this page only). One batch per customer report;
 * its issues are typed in a grid like the team's Issues Table, with screenshots pasted on the line. A Problem starts at
 * once, a Requirement typed by someone who cannot approve waits for a PM / Lead. Each issue is planned in hours and
 * closed with the hours it took and what was done; the batch closes itself when nothing in it is left. The old
 * one-at-a-time issues stay in a tab of their own.
 *
 * Pegasus rules kept here (pegasus-design DESIGN.md part 0 / E): dialogs over navigation, one primary action per
 * surface, the summary bar doubles as the filter, bubbles on the field to fix instead of red text, submit is never
 * disabled, the create grid keeps a draft, dialog width follows its content, actions on the left of a row.
 */

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  openProjectSchedule?: (projectId: number) => void;
  /** A batch to open at once: one picked in My Work, the Plan or Team overview. */
  initialBatchId?: number | null;
  /** Accepted for the shell's shared props. */
  refreshBootstrap?: () => Promise<void>;
};

const TABS: readonly IssueBatchTab[] = ["all", "open", "approval", "mine", "closed"];
const PAGE_SIZE = 50;
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => (values[key] === undefined ? match : String(values[key])));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
export const issueToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const isConflict = (error: unknown) => error instanceof ApiClientError && error.status === 409;

function useDates() {
  const { lang } = useLanguage();
  const locale = localeFor(lang);
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
    return {
      day: (iso: string | null | undefined) => (iso ? short.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—"),
      span: (start: string | null, end: string | null) => (!start ? "—" : !end || end === start ? short.format(new Date(`${start}T00:00:00Z`)) : `${short.format(new Date(`${start}T00:00:00Z`))} – ${short.format(new Date(`${end}T00:00:00Z`))}`),
    };
  }, [locale]);
}

// ── Building blocks: dialog, bubble, badge, pictures ──

let dialogSeq = 0;
const dialogStack: number[] = [];

/** A Pegasus dialog (D.8) in a .pg layer of its own over the app. Escape closes the top one unless it is saving. */
function PgDialog({ size = "", title, description, onClose, children, footer, busy = false }: {
  size?: "" | "lg" | "xl2" | "x6" | "wide" | "line"; title: ReactNode; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean;
}) {
  const t = useT();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });
  useEffect(() => { latest.current = { onClose, busy }; });
  useEffect(() => {
    const id = ++dialogSeq;
    dialogStack.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dialogStack[dialogStack.length - 1] !== id || latest.current.busy) return;
      if (document.querySelector(".swal2-container")) return;
      event.preventDefault();
      latest.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current;
    first?.focus({ preventScroll: true });
    return () => { window.removeEventListener("keydown", onKey); dialogStack.splice(dialogStack.indexOf(id), 1); };
  }, []);
  return createPortal(<div className="pg pg-layer">
    <div className="pg-scrim" />
    <div ref={box} className={`dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="d-head"><h2 id={titleId}>{title}</h2>{description ? <div className="d-desc">{description}</div> : null}</div>
      <button type="button" className="x-close" aria-label={t("Issues.close")} onClick={() => { if (!busy) onClose(); }}><Icon name="x" className="pg-icon" /></button>
      <div className="d-body">{children}</div>
      {footer ? <div className="d-foot">{footer}</div> : null}
    </div>
  </div>, document.body);
}

/** An error bubble under the field to fix (Pegasus 0.5): the field shakes and takes the focus. */
function useBubble() {
  const [bubble, setBubble] = useState<{ top: number; left: number; text: string } | null>(null);
  useEffect(() => {
    if (!bubble) return;
    // It stays until the person types or clicks somewhere, or for six seconds.
    const timer = window.setTimeout(() => setBubble(null), 6000);
    const hide = () => setBubble(null);
    window.addEventListener("keydown", hide);
    window.addEventListener("pointerdown", hide);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", hide); window.removeEventListener("pointerdown", hide); };
  }, [bubble]);
  const show = useCallback((element: HTMLElement | null | undefined, text: string) => {
    if (!element) return;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    element.focus({ preventScroll: true });
    element.classList.remove("is-shaking");
    void element.offsetWidth;
    element.classList.add("is-shaking");
    window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setBubble({ top: rect.bottom + 10, left: Math.max(8, Math.min(rect.left, window.innerWidth - 330)), text });
    }, 30);
  }, []);
  const node = bubble ? createPortal(<div className="pg"><div className="bubble" role="alert" style={{ top: bubble.top, left: bubble.left }}>
    <span className="arrow" /><div className="box"><Icon name="alertCircle" className="pg-icon" />{bubble.text}</div>
  </div></div>, document.body) : null;
  return { node, show };
}

export function IssueStateBadge({ state }: { state: IssueState }) {
  const t = useT();
  return <span className={`pg-badge b-${ISSUE_STATE_TONE[state]}`}>{t(`Issues.state.${state}`)}</span>;
}

function CategoryBadge({ category }: { category: IssueCategory }) {
  const t = useT();
  return <span className={`pg-badge ${category === "Problem" ? "b-danger" : "b-soft"}`}>{t(`Issues.cat.${category}`)}</span>;
}

const imageUrls = new Map<string, Promise<string>>();
const imageUrl = (itemId: number, imageId: number) => {
  const key = `${itemId}:${imageId}`;
  let url = imageUrls.get(key);
  if (!url) {
    url = issueImageBlob(itemId, imageId).then((blob) => URL.createObjectURL(blob));
    url.catch(() => imageUrls.delete(key));
    imageUrls.set(key, url);
  }
  return url;
};

function SavedThumb({ itemId, image, onOpen, onRemove }: { itemId: number; image: IssueImage; onOpen: (src: string) => void; onRemove?: () => void }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    imageUrl(itemId, image.id).then((url) => { if (live) setSrc(url); }).catch(() => undefined);
    return () => { live = false; };
  }, [itemId, image.id]);
  return <span className="thumb" title={image.fileName}>
    {/* eslint-disable-next-line @next/next/no-img-element -- an authorised blob URL cannot go through an image optimizer */}
    {src ? <img src={src} alt={image.fileName} /> : null}
    <button type="button" className="open" aria-label={`${t("Issues.viewPicture")} ${image.fileName}`} onClick={() => { if (src) onOpen(src); }} />
    {onRemove ? <button type="button" className="drop" aria-label={t("Issues.removePicture")} onClick={onRemove}><Icon name="x" className="pg-icon" /></button> : null}
  </span>;
}

function DraftThumb({ file, onOpen, onRemove }: { file: File; onOpen: (src: string) => void; onRemove: () => void }) {
  const t = useT();
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return <span className="thumb" title={file.name}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview cannot go through an image optimizer */}
    <img src={src} alt={file.name} />
    <button type="button" className="open" aria-label={`${t("Issues.viewPicture")} ${file.name}`} onClick={() => onOpen(src)} />
    <button type="button" className="drop" aria-label={t("Issues.removePicture")} onClick={onRemove}><Icon name="x" className="pg-icon" /></button>
  </span>;
}

function PictureViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(<div className="pg pg-layer" style={{ zIndex: 130 }}>
    <div className="pg-scrim" />
    <div className="viewer" role="dialog" aria-modal="true" aria-label={t("Issues.picture")}>
      <button type="button" className="x-close" aria-label={t("Issues.close")} onClick={onClose}><Icon name="x" className="pg-icon" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL cannot go through an image optimizer */}
      <img src={src} alt={t("Issues.picture")} />
    </div>
  </div>, document.body);
}

const imageFiles = (list: FileList | readonly File[] | null | undefined) => [...(list ?? [])].filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|heic|heif)$/i.test(file.name));

// ── Project picker: a project of this system (closed ones too), or one it does not have ──

type ProjectChoice = { id: number; label: string; customer: string; closed: boolean };

function ProjectPicker({ value, onPick, invalid }: { value: ProjectChoice | null; onPick: (project: ProjectChoice | null) => void; invalid?: boolean }) {
  const t = useT();
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<ProjectChoice[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = window.setTimeout(() => {
      listProjects({ search: (query ?? "").trim() || undefined, pageSize: 20 })
        .then((result) => { if (live) setOptions(result.items.map((project: ProjectSummary) => ({ id: project.id, label: `${project.number} · ${project.name}`, customer: project.customerName, closed: project.status === "Closed" }))); })
        .catch(() => { if (live) setOptions([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [open, query]);
  const pick = (project: ProjectChoice) => { onPick(project); setQuery(null); setOpen(false); };
  return <div className="combo">
    <input className={`inp${invalid ? " invalid" : ""}`} data-field="projectId" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
      value={query ?? value?.label ?? ""} placeholder={t("Issues.projectSearch")}
      onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); if (!event.target.value) onPick(null); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, options.length - 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
        else if (event.key === "Enter" && open && options[active]) { event.preventDefault(); pick(options[active]!); }
      }} />
    {open && options.length ? <div className="combo-list" id={listId} role="listbox">
      {options.map((option, index) => <button key={option.id} type="button" role="option" aria-selected={index === active} className="opt"
        onMouseDown={(event) => event.preventDefault()} onClick={() => pick(option)}>
        <span>{option.label}</span><small>{option.customer}{option.closed ? ` · ${t("Issues.projectClosed")}` : ""}</small>
      </button>)}
    </div> : null}
  </div>;
}

type HeaderDraft = IssueBatchHeaderInput & { external: boolean; project: ProjectChoice | null };
const headerOf = (batch: IssueBatch | null, today: string): HeaderDraft => batch ? {
  external: batch.projectId === null, project: batch.projectId ? { id: batch.projectId, label: `${batch.projectNo} · ${batch.projectName}`, customer: batch.customerName, closed: batch.projectClosed } : null,
  projectId: batch.projectId, externalProject: batch.externalProject, customerName: batch.projectId ? "" : batch.customerName,
  reportedOn: batch.reportedOn, reportedBy: batch.reportedBy, note: batch.note,
} : { external: false, project: null, projectId: null, externalProject: "", customerName: "", reportedOn: today, reportedBy: "", note: "" };
const headerInput = (header: HeaderDraft): IssueBatchHeaderInput => ({
  projectId: header.external ? null : header.project?.id ?? null,
  externalProject: header.external ? header.externalProject.trim() : "",
  customerName: header.external ? header.customerName.trim() : "",
  reportedOn: header.reportedOn, reportedBy: header.reportedBy.trim(), note: header.note.trim(),
});
/** The header field to fix first, as [data-field, dictionary key]. */
const headerError = (header: HeaderDraft): [string, string] | null =>
  !header.external && !header.project ? ["projectId", "Issues.errProject"]
    : header.external && !header.externalProject.trim() ? ["externalProject", "Issues.errExternal"]
      : !header.reportedOn ? ["reportedOn", "Issues.errReportedOn"] : null;

function HeaderFields({ header, onChange, wide }: { header: HeaderDraft; onChange: (next: HeaderDraft) => void; wide?: boolean }) {
  const t = useT();
  const set = (patch: Partial<HeaderDraft>) => onChange({ ...header, ...patch });
  return <div className={`fgrid${wide ? " four" : ""}`}>
    <div className={`pg-field${wide ? "" : " pg-full"}`}>
      <span className="lbl">{t("Issues.project")}<span className="req">*</span></span>
      <div role="radiogroup" aria-label={t("Issues.project")} className="sradio" style={{ width: "fit-content" }}>
        <button type="button" role="radio" aria-checked={!header.external} onClick={() => set({ external: false })}>{t("Issues.projectInApp")}</button>
        <button type="button" role="radio" aria-checked={header.external} onClick={() => set({ external: true })}>{t("Issues.projectOutside")}</button>
      </div>
    </div>
    {header.external ? <>
      <label className="pg-field"><span className="lbl">{t("Issues.externalProject")}<span className="req">*</span></span>
        <input className="inp" data-field="externalProject" maxLength={200} value={header.externalProject} placeholder={t("Issues.externalHint")} onChange={(event) => set({ externalProject: event.target.value })} /></label>
      <label className="pg-field"><span className="lbl">{t("Issues.customer")}</span>
        <input className="inp" data-field="customerName" maxLength={200} value={header.customerName} onChange={(event) => set({ customerName: event.target.value })} /></label>
    </> : <div className="pg-field"><span className="lbl">{t("Issues.projectPick")}<span className="req">*</span></span>
      <ProjectPicker value={header.project} onPick={(project) => set({ project })} />
      {header.project?.closed ? <span className="hint">{t("Issues.closedProjectNote")}</span> : null}
    </div>}
    <label className="pg-field"><span className="lbl">{t("Issues.reportedOn")}<span className="req">*</span></span>
      <input className="inp" type="date" data-field="reportedOn" value={header.reportedOn} onChange={(event) => set({ reportedOn: event.target.value })} /></label>
    <label className="pg-field"><span className="lbl">{t("Issues.reportedBy")}</span>
      <input className="inp" data-field="reportedBy" maxLength={200} value={header.reportedBy} placeholder={t("Issues.reportedByHint")} onChange={(event) => set({ reportedBy: event.target.value })} /></label>
    <label className={`pg-field${wide ? "" : " pg-full"}`}><span className="lbl">{t("Issues.note")}</span>
      <input className="inp" data-field="note" maxLength={2000} value={header.note} onChange={(event) => set({ note: event.target.value })} /></label>
  </div>;
}

// ── The issue grid: a new batch, or issues added to one ──

type StoredDraft = { header: HeaderDraft; rows: DraftRow[] };
const draftKey = (userId: number) => `tomas-tech-issue-draft:${userId}`;
let rowSeq = 0;
const newRowKey = () => `r${Date.now().toString(36)}${(rowSeq++).toString(36)}`;
const freshRows = (count = 3) => Array.from({ length: count }, () => blankDraftRow(newRowKey()));

function readDraft(userId: number): StoredDraft | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(draftKey(userId)) ?? "null") as StoredDraft | null;
    return stored && Array.isArray(stored.rows) && stored.header ? stored : null;
  } catch { return null; }
}

/** One person's week as the side panel shows it: planned hours already, hours this batch adds, and what they have. */
type WeekLoad = { userId: number; name: string; weekStart: string; existing: number; added: number; capacity: number };

/** Weeks the panel looks at: this one and the five after it (the board is read for six weeks). */
const LOAD_WEEKS = 6;

function weekLoads(rows: readonly DraftRow[], board: TeamBoardData, team: readonly { id: number; name: string }[], today: string): WeekLoad[] {
  const people = [...new Set(rows.filter((row) => row.assigneeId !== null && !draftRowIsBlank(row)).map((row) => row.assigneeId!))];
  const firstMonday = mondayOf(today);
  const days = boardDays(firstMonday, LOAD_WEEKS, board.holidays, today);
  return people.map((userId) => {
    const capacity = weeklyCapacity(board.capacities.find((entry) => entry.userId === userId)?.daysPerWeek);
    const drafts: Commitment[] = rows.filter((row) => row.assigneeId === userId && row.planStart).flatMap((row) => {
      const hours = parseHours(row.planHours);
      return hours && !Number.isNaN(hours) ? [{ key: `draft-${row.key}`, workKey: `draft-${row.key}`, type: "Issue" as const, entityId: 0, ownerId: userId, reference: "", title: "", customer: "",
        start: row.planStart, end: row.planEnd || row.planStart, manDays: hours / 8, progress: 0, status: "Not Started" }] : [];
    });
    const before = dailyLoad(board.items.filter((item) => item.ownerId === userId), days, capacity, board.holidays);
    const adding = dailyLoad(drafts, days, capacity, board.holidays);
    // The week this batch adds to first (a plan typed over a weekend lands on the working days after it); this week
    // when it adds nothing in the six weeks shown.
    const weeks = Array.from({ length: LOAD_WEEKS }, (_, index) => addDays(firstMonday, index * 7));
    const weekStart = weeks.find((start) => weekTotals(adding, start, addDays(start, 6)).manDays > 0) ?? firstMonday;
    const weekEnd = addDays(weekStart, 6);
    const have = weekTotals(before, weekStart, weekEnd), add = weekTotals(adding, weekStart, weekEnd);
    return { userId, name: team.find((person) => person.id === userId)?.name ?? `#${userId}`, weekStart, existing: have.manDays * 8, added: add.manDays * 8, capacity: have.available * 8 };
  });
}

function IssueGridDialog({ bootstrap, batch, onClose, onSaved }: {
  bootstrap: BootstrapData; batch: IssueBatch | null;
  onClose: () => void; onSaved: (batch: IssueBatch, message: string) => void;
}) {
  const t = useT();
  const dates = useDates();
  const today = issueToday();
  const adding = batch !== null;
  const userId = bootstrap.user.id;
  const team = bootstrap.team;
  const [initial] = useState(() => (adding ? null : readDraft(userId)));
  const [header, setHeader] = useState<HeaderDraft>(() => initial?.header ?? headerOf(null, today));
  const [rows, setRows] = useState<DraftRow[]>(() => (initial?.rows.length ? initial.rows : freshRows()));
  const [pictures, setPictures] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [board, setBoard] = useState<TeamBoardData | "off" | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const filePick = useRef<HTMLInputElement>(null);
  const pickFor = useRef<string | null>(null);
  const bubble = useBubble();
  const imagesOf = useCallback((key: string) => pictures[key]?.length ?? 0, [pictures]);

  // The draft of a new batch outlives a closed dialog or a lost tab (Pegasus 0.6); pictures cannot be kept.
  useEffect(() => {
    if (adding) return;
    const timer = window.setTimeout(() => {
      try {
        if (rows.every((row) => draftRowIsBlank(row)) && !header.project && !header.externalProject && !header.reportedBy && !header.note) window.localStorage.removeItem(draftKey(userId));
        else window.localStorage.setItem(draftKey(userId), JSON.stringify({ header, rows } satisfies StoredDraft));
      } catch { /* storage full or blocked: the draft is only a convenience */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [adding, header, rows, userId]);

  useEffect(() => {
    let live = true;
    const from = mondayOf(today);
    loadTeamBoard(from, addDays(from, 41)).then((data) => { if (live) setBoard(data); }).catch(() => { if (live) setBoard("off"); });
    return () => { live = false; };
  }, [today]);

  const update = (index: number, patch: Partial<DraftRow>) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const addRows = (count = 1) => setRows((current) => [...current, ...freshRows(count)]);
  const removeRow = (index: number) => {
    const key = rows[index]?.key;
    setRows((current) => (current.length > 1 ? current.filter((_, at) => at !== index) : freshRows(1)));
    if (key) setPictures((current) => { const next = { ...current }; delete next[key]; return next; });
  };
  const addPictures = (key: string, files: File[]) => {
    if (files.length) setPictures((current) => ({ ...current, [key]: [...(current[key] ?? []), ...files].slice(0, 10) }));
  };
  const onPaste = (index: number, field: DraftField) => (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const files = imageFiles(event.clipboardData.files);
    if (files.length) { event.preventDefault(); addPictures(rows[index]!.key, files); return; }
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\n$/, ""))) return;
    event.preventDefault();
    setRows((current) => applyPaste(current, { row: index, field }, text, team, newRowKey));
  };
  const cell = (index: number, field: DraftField) => ({ "data-cell": `${index}:${field}`, onPaste: onPaste(index, field) });

  const kept = rows.filter((row) => !draftRowIsBlank(row, imagesOf(row.key)));
  const totalHours = kept.reduce((sum, row) => { const hours = parseHours(row.planHours); return sum + (hours && !Number.isNaN(hours) ? hours : 0); }, 0);
  const loads = board && board !== "off" ? weekLoads(rows, board, team, today) : [];

  const save = async () => {
    if (busy) return;
    const top = adding ? null : headerError(header);
    if (top) { bubble.show(grid.current?.closest(".dialog")?.querySelector<HTMLElement>(`[data-field="${top[0]}"]`), t(top[1])); return; }
    const problems = draftErrors(rows, imagesOf);
    if (problems.length) { const first = problems[0]!; bubble.show(grid.current?.querySelector<HTMLElement>(`[data-cell="${first.row}:${first.field}"]`), t(first.message)); return; }
    const { items, keys } = draftPayload(rows, imagesOf);
    if (!items.length) { bubble.show(grid.current?.querySelector<HTMLElement>(`[data-cell="0:description"]`), t("Issues.errNoIssues")); return; }
    setBusy(t("Issues.saving"));
    try {
      let saved = adding ? await addIssueItems(batch.id, items) : await createIssueBatch(headerInput(header), items);
      if (!adding) { try { window.localStorage.removeItem(draftKey(userId)); } catch { /* ignore */ } }
      // The new lines are the batch's last ones, in the order typed; their pictures go up one by one.
      const created = saved.items.slice(saved.items.length - items.length);
      const uploads = keys.flatMap((key, index) => (pictures[key] ?? []).map((file) => ({ item: created[index]!, file })));
      let failed = 0;
      for (const [index, upload] of uploads.entries()) {
        setBusy(fill(t("Issues.uploading"), { n: index + 1, total: uploads.length }));
        try { await addIssueImage(upload.item.id, upload.file); } catch { failed++; }
      }
      if (uploads.length) saved = await loadIssueBatch(saved.id);
      const message = fill(t(adding ? "Issues.added" : "Issues.created"), { no: saved.batchNo, n: items.length })
        + (failed ? ` · ${fill(t("Issues.picturesFailed"), { n: failed })}` : "");
      onSaved(saved, message);
    } catch (error) {
      setBusy("");
      bubble.show(grid.current?.closest(".dialog")?.querySelector<HTMLElement>(".d-foot .btn-primary"), errorText(error));
    }
  };

  const close = async () => {
    if (busy) return;
    if (adding && kept.length && !(await confirmDialog(t("Issues.discardAdd")))) return;
    onClose();
  };
  const clearDraft = async () => {
    if (!(await confirmDialog(t("Issues.clearDraftConfirm"), { danger: true }))) return;
    setHeader(headerOf(null, today)); setRows(freshRows()); setPictures({});
    try { window.localStorage.removeItem(draftKey(userId)); } catch { /* ignore */ }
  };

  return <PgDialog size="line" busy={Boolean(busy)} onClose={() => void close()}
    title={adding ? <>{t("Issues.addTitle")} <span className="pg-badge b-outline">{batch.batchNo}</span></> : t("Issues.createTitle")}
    description={t("Issues.gridHint")}
    footer={<>
      <div className="nb-stats"><span><b>{kept.length}</b> {t("Issues.lines")}</span><span><b>{hoursText(totalHours)}</b> {t("Issues.hours")} ({hoursText(hoursToManDays(totalHours))} {t("Issues.manDays")})</span>
        {!adding && initial ? <button type="button" className="linkbtn" onClick={() => void clearDraft()}>{t("Issues.clearDraft")}</button> : null}</div>
      <span className="pg-spacer" />
      {busy ? <span className="hint" role="status">{busy}</span> : null}
      <button type="button" className="pg-btn btn-outline" onClick={() => void close()}>{t("Issues.cancel")}</button>
      <button type="button" className="pg-btn btn-primary" data-guide="issues.save" aria-busy={Boolean(busy)} onClick={() => void save()}><Icon name="check" className="pg-icon" />{t(adding ? "Issues.saveAdd" : "Issues.saveBatch")}</button>
    </>}>
    {!adding ? <div data-guide="issues.header"><HeaderFields header={header} onChange={setHeader} wide /></div> : <div className="meta"><span>{t("Issues.project")} <b>{batch.projectId ? `${batch.projectNo} · ${batch.projectName}` : batch.externalProject}</b></span><span>{t("Issues.reportedOn")} <b>{dates.day(batch.reportedOn)}</b></span></div>}
    <div className="nb-main">
      <div className="ge-scroll" ref={grid} data-guide="issues.grid">
        <div className="ge-frame">
          <table className="ge">
            <thead><tr>
              <th aria-label={t("Issues.rowActions")} /><th className="rn">#</th><th>{t("Issues.category")}</th><th>{t("Issues.function")}</th>
              <th>{t("Issues.description")}<span className="req">*</span></th><th>{t("Issues.pictures")}</th><th>{t("Issues.pic")}</th>
              <th>{t("Issues.planStart")}</th><th>{t("Issues.planEnd")}</th><th>{t("Issues.planHours")}</th>
            </tr></thead>
            <tbody>
              {rows.map((row, index) => <tr key={row.key}>
                <td className="row-acts"><button type="button" className="pg-icon-btn danger" aria-label={fill(t("Issues.removeLine"), { n: index + 1 })} onClick={() => removeRow(index)}><Icon name="trash" className="pg-icon" /></button></td>
                <td className="rn">{index + 1}</td>
                <td><select className="cellc" aria-label={t("Issues.category")} value={row.category} {...cell(index, "category")} onChange={(event) => update(index, { category: event.target.value as IssueCategory })}>
                  <option value="Problem">{t("Issues.cat.Problem")}</option><option value="Requirement">{t("Issues.cat.Requirement")}</option>
                </select></td>
                <td><input className="cellc fn" aria-label={t("Issues.function")} maxLength={200} value={row.functionName} placeholder={t("Issues.functionHint")} {...cell(index, "functionName")} onChange={(event) => update(index, { functionName: event.target.value })} /></td>
                <td><textarea className="cellc" rows={1} aria-label={t("Issues.description")} maxLength={4000} value={row.description} placeholder={t("Issues.descriptionHint")} {...cell(index, "description")} onChange={(event) => update(index, { description: event.target.value })} /></td>
                <td><div className="imgcell">
                  {(pictures[row.key] ?? []).map((file, at) => <DraftThumb key={`${file.name}-${at}`} file={file} onOpen={setViewing}
                    onRemove={() => setPictures((current) => ({ ...current, [row.key]: (current[row.key] ?? []).filter((_, i) => i !== at) }))} />)}
                  <button type="button" className="pg-icon-btn" aria-label={t("Issues.addPicture")} title={t("Issues.addPictureHint")} onClick={() => { pickFor.current = row.key; filePick.current?.click(); }}><Icon name="paperclip" className="pg-icon" /></button>
                </div></td>
                <td><select className="cellc" aria-label={t("Issues.pic")} value={row.assigneeId ?? ""} {...cell(index, "assigneeId")} onChange={(event) => update(index, { assigneeId: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">{t("Issues.noPic")}</option>
                  {team.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select></td>
                <td><input className="cellc" type="date" aria-label={t("Issues.planStart")} value={row.planStart} {...cell(index, "planStart")} onChange={(event) => update(index, { planStart: event.target.value, planEnd: row.planEnd && row.planEnd < event.target.value ? event.target.value : row.planEnd })} /></td>
                <td><input className="cellc" type="date" aria-label={t("Issues.planEnd")} value={row.planEnd} min={row.planStart || undefined} {...cell(index, "planEnd")} onChange={(event) => update(index, { planEnd: event.target.value })} /></td>
                <td><input className="cellc n" inputMode="decimal" aria-label={t("Issues.planHours")} value={row.planHours} placeholder="0" {...cell(index, "planHours")} onChange={(event) => update(index, { planHours: event.target.value })} /></td>
              </tr>)}
            </tbody>
          </table>
          <button type="button" className="addline" onClick={() => addRows(1)}><Icon name="plus" className="pg-icon" />{t("Issues.addLine")}</button>
        </div>
      </div>
      <aside className="side" aria-label={t("Issues.loadTitle")} data-guide="issues.load">
        <h3>{t("Issues.loadTitle")}</h3>
        {board === null ? <span className="hint">{t("Issues.loadLoading")}</span> : board === "off" ? <span className="hint">{t("Issues.loadOff")}</span>
          : !loads.length ? <span className="hint">{t("Issues.loadEmpty")}</span>
            : <div className="load-list">{loads.map((load) => {
              const total = load.existing + load.added, over = load.capacity > 0 && total > load.capacity + 0.01;
              const scale = Math.max(load.capacity, total, 1);
              return <div className="load-row" key={load.userId}>
                <div className="top"><b>{load.name}</b><span className={over ? "bad-text tnum" : "tnum"}>{hoursText(total)} / {hoursText(load.capacity)} {t("Issues.hoursShort")}</span></div>
                <span className="meter pg-stack" role="img" aria-label={fill(t("Issues.loadAria"), { name: load.name, have: hoursText(load.existing), add: hoursText(load.added), cap: hoursText(load.capacity) })}>
                  <i className="base" style={{ width: `${(load.existing / scale) * 100}%` }} /><i className={over ? "pg-over" : ""} style={{ width: `${(load.added / scale) * 100}%` }} />
                </span>
                <span className="hint">{fill(t("Issues.loadWeek"), { week: dates.day(load.weekStart), have: hoursText(load.existing), add: hoursText(load.added) })}{over ? ` · ${fill(t("Issues.loadOver"), { n: hoursText(total - load.capacity) })}` : ""}</span>
              </div>;
            })}</div>}
        <span className="hint">{t("Issues.loadNote")}</span>
      </aside>
    </div>
    <input ref={filePick} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(event) => { if (pickFor.current) addPictures(pickFor.current, imageFiles(event.target.files)); event.target.value = ""; }} />
    {viewing ? <PictureViewer src={viewing} onClose={() => setViewing(null)} /> : null}
    {bubble.node}
  </PgDialog>;
}

// ── One issue: edit, and the dialogs its actions need ──

function ItemEditDialog({ item, team, onClose, onSaved }: {
  item: IssueBatchItem; team: BootstrapData["team"]; onClose: () => void; onSaved: (batch: IssueBatch, message: string) => void;
}) {
  const t = useT();
  const [row, setRow] = useState<DraftRow>(() => blankDraftRow("edit", {
    category: item.category, functionName: item.functionName, description: item.description, assigneeId: item.assigneeId,
    planStart: item.planStart ?? "", planEnd: item.planEnd ?? "", planHours: item.planHours === null ? "" : String(item.planHours),
  }));
  const [images, setImages] = useState<IssueImage[]>(item.images);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const form = useRef<HTMLDivElement>(null);
  const filePick = useRef<HTMLInputElement>(null);
  const bubble = useBubble();
  const set = (patch: Partial<DraftRow>) => setRow((current) => ({ ...current, ...patch }));
  const upload = async (files: File[]) => {
    for (const file of files) {
      try { const image = await addIssueImage(item.id, file); setImages((current) => [...current, image]); }
      catch (error) { bubble.show(form.current?.querySelector<HTMLElement>("[data-field='pictures']"), errorText(error)); }
    }
  };
  const remove = async (image: IssueImage) => {
    try { await removeIssueImage(item.id, image.id); setImages((current) => current.filter((entry) => entry.id !== image.id)); }
    catch (error) { bubble.show(form.current?.querySelector<HTMLElement>("[data-field='pictures']"), errorText(error)); }
  };
  const save = async () => {
    if (busy) return;
    const problems = draftErrors([{ ...row, description: row.description || " " }]).filter((error) => error.field !== "description");
    if (!row.description.trim()) { bubble.show(form.current?.querySelector<HTMLElement>("[data-field='description']"), t("Issues.errDescription")); return; }
    if (problems.length) { bubble.show(form.current?.querySelector<HTMLElement>(`[data-field='${problems[0]!.field}']`), t(problems[0]!.message)); return; }
    setBusy(true);
    try {
      const saved = await updateIssueItem(item, draftPayload([row]).items[0]!);
      const after = saved.items.find((entry) => entry.id === item.id);
      onSaved(saved, after && after.state === "Approval" && item.state !== "Approval" ? t("Issues.savedWaiting") : t("Issues.saved"));
    } catch (error) {
      setBusy(false);
      bubble.show(form.current?.closest(".dialog")?.querySelector<HTMLElement>(".d-foot .btn-primary"), errorText(error));
    }
  };
  return <PgDialog size="xl2" busy={busy} onClose={onClose} title={<>{t("Issues.editTitle")} <span className="pg-badge b-outline">#{item.lineNo}</span></>}
    footer={<><button type="button" className="pg-btn btn-outline" onClick={onClose}>{t("Issues.cancel")}</button>
      <button type="button" className="pg-btn btn-primary" aria-busy={busy} onClick={() => void save()}>{t("Issues.save")}</button></>}>
    <div className="fgrid" ref={form}>
      <div className="pg-field"><span className="lbl">{t("Issues.category")}</span>
        <div role="radiogroup" aria-label={t("Issues.category")} className="sradio" style={{ width: "fit-content" }}>
          {(["Problem", "Requirement"] as const).map((category) => <button key={category} type="button" role="radio" aria-checked={row.category === category} onClick={() => set({ category })}>{t(`Issues.cat.${category}`)}</button>)}
        </div></div>
      <label className="pg-field"><span className="lbl">{t("Issues.function")}</span><input className="inp" data-field="functionName" maxLength={200} value={row.functionName} onChange={(event) => set({ functionName: event.target.value })} /></label>
      <label className="pg-field pg-full"><span className="lbl">{t("Issues.description")}<span className="req">*</span></span>
        <textarea className="inp" data-field="description" data-autofocus maxLength={4000} rows={4} value={row.description} onChange={(event) => set({ description: event.target.value })} /></label>
      <label className="pg-field"><span className="lbl">{t("Issues.pic")}</span>
        <select className="inp" data-field="assigneeId" value={row.assigneeId ?? ""} onChange={(event) => set({ assigneeId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t("Issues.noPic")}</option>{team.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
      <label className="pg-field"><span className="lbl">{t("Issues.planHours")}</span><input className="inp" data-field="planHours" inputMode="decimal" value={row.planHours} onChange={(event) => set({ planHours: event.target.value })} /></label>
      <label className="pg-field"><span className="lbl">{t("Issues.planStart")}</span><input className="inp" type="date" data-field="planStart" value={row.planStart} onChange={(event) => set({ planStart: event.target.value })} /></label>
      <label className="pg-field"><span className="lbl">{t("Issues.planEnd")}</span><input className="inp" type="date" data-field="planEnd" min={row.planStart || undefined} value={row.planEnd} onChange={(event) => set({ planEnd: event.target.value })} /></label>
      <div className="pg-field pg-full"><span className="lbl">{t("Issues.pictures")}</span>
        <div className="imgcell" data-field="pictures" tabIndex={-1} style={{ padding: 0 }}>
          {images.map((image) => <SavedThumb key={image.id} itemId={item.id} image={image} onOpen={setViewing} onRemove={() => void remove(image)} />)}
          <button type="button" className="pg-btn btn-outline btn-sm" onClick={() => filePick.current?.click()}><Icon name="paperclip" className="pg-icon" />{t("Issues.addPicture")}</button>
        </div></div>
    </div>
    {item.category === "Problem" && row.category === "Requirement" ? <p className="d-desc">{t("Issues.toRequirementNote")}</p> : null}
    <input ref={filePick} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(event) => { void upload(imageFiles(event.target.files)); event.target.value = ""; }} />
    {viewing ? <PictureViewer src={viewing} onClose={() => setViewing(null)} /> : null}
    {bubble.node}
  </PgDialog>;
}

/** Close, reject or cancel an issue: what the action needs, with the bubble on the field left empty. */
export function IssueActionDialog({ item, action, onClose, onDone }: {
  item: Pick<IssueItem, "id" | "rowVersion" | "lineNo" | "description" | "planHours" | "startedOn">; action: "close" | "reject" | "cancel";
  onClose: () => void; onDone: (batch: IssueBatch) => void;
}) {
  const t = useT();
  const today = issueToday();
  const [doneOn, setDoneOn] = useState(today);
  const [hours, setHours] = useState(item.planHours === null ? "" : String(item.planHours));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const bubble = useBubble();
  const at = (field: string) => form.current?.querySelector<HTMLElement>(`[data-field='${field}']`);
  const submit = async () => {
    if (busy) return;
    const input: IssueActionInput = {};
    if (action === "close") {
      const actual = parseHours(hours);
      if (!doneOn) return bubble.show(at("doneOn"), t("Issues.errDoneOn"));
      if (doneOn > today) return bubble.show(at("doneOn"), t("Issues.errFuture"));
      if (item.startedOn && doneOn < item.startedOn) return bubble.show(at("doneOn"), t("Issues.errBeforeStart"));
      if (actual === null || Number.isNaN(actual) || actual < 0 || actual > 9999) return bubble.show(at("actualHours"), t("Issues.errActualHours"));
      if (!text.trim()) return bubble.show(at("text"), t("Issues.errFix"));
      Object.assign(input, { doneOn, actualHours: actual, fixNote: text.trim() });
    } else {
      if (!text.trim()) return bubble.show(at("text"), t("Issues.errReason"));
      input.reason = text.trim();
    }
    setBusy(true);
    try { onDone(await takeIssueAction(item, action, input)); }
    catch (error) {
      setBusy(false);
      bubble.show(form.current?.closest(".dialog")?.querySelector<HTMLElement>(".d-foot .btn-primary, .d-foot .btn-destructive"), errorText(error));
    }
  };
  const danger = action !== "close";
  return <PgDialog size="lg" busy={busy} onClose={onClose} title={`${t(`Issues.act.${action}`)} #${item.lineNo}`} description={item.description.length > 160 ? `${item.description.slice(0, 159)}…` : item.description}
    footer={<><button type="button" className="pg-btn btn-outline" onClick={onClose}>{t("Issues.cancel")}</button>
      <button type="button" className={`pg-btn ${danger ? "btn-destructive" : "btn-primary"}`} aria-busy={busy} onClick={() => void submit()}>{t(`Issues.act.${action}`)}</button></>}>
    <div className="fgrid" ref={form}>
      {action === "close" ? <>
        <label className="pg-field"><span className="lbl">{t("Issues.actualEnd")}<span className="req">*</span></span>
          <input className="inp" type="date" data-field="doneOn" max={today} min={item.startedOn ?? undefined} value={doneOn} onChange={(event) => setDoneOn(event.target.value)} /></label>
        <label className="pg-field"><span className="lbl">{t("Issues.actualHours")}<span className="req">*</span></span>
          <input className="inp" data-field="actualHours" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} />
          <span className="hint">{fill(t("Issues.planWas"), { n: hoursText(item.planHours) })}</span></label>
      </> : null}
      <label className="pg-field pg-full"><span className="lbl">{t(action === "close" ? "Issues.fixNote" : "Issues.reason")}<span className="req">*</span></span>
        <textarea className="inp" data-field="text" data-autofocus rows={4} maxLength={action === "close" ? 4000 : 2000} value={text} onChange={(event) => setText(event.target.value)} /></label>
    </div>
    {bubble.node}
  </PgDialog>;
}

const ACTION_ICON: Record<IssueAction, IconName> = { approve: "check", reject: "x", start: "play", close: "checkCircle", cancel: "minus", reopen: "refresh" };

// ── A batch: its issues and what can be done with them ──

function BatchDialog({ batchId, bootstrap, notify, onClose, onChanged, onExport, openProjectSchedule }: {
  batchId: number; bootstrap: BootstrapData; notify: (message: string) => void; onClose: () => void; onChanged: () => void;
  onExport: (batches: IssueBatch[]) => void; openProjectSchedule?: (projectId: number) => void;
}) {
  const t = useT();
  const dates = useDates();
  const [batch, setBatch] = useState<IssueBatch | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<IssueBatchItem | null>(null);
  const [acting, setActing] = useState<{ item: IssueBatchItem; action: "close" | "reject" | "cancel" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [header, setHeader] = useState<HeaderDraft | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const bubble = useBubble();
  const headerBox = useRef<HTMLDivElement>(null);
  const reload = useCallback(async () => {
    try { setBatch(await loadIssueBatch(batchId)); setError(""); } catch (failure) { setError(errorText(failure)); }
  }, [batchId]);
  useEffect(() => { const timer = window.setTimeout(() => void reload(), 0); return () => window.clearTimeout(timer); }, [reload]);
  const changed = (next: IssueBatch, message: string) => { setBatch(next); notify(`${next.batchNo} · ${message}`); onChanged(); };
  const act = async (item: IssueBatchItem, action: IssueAction) => {
    if (action === "close" || action === "reject" || action === "cancel") { setActing({ item, action }); return; }
    if (action === "reopen" && !(await confirmDialog(t("Issues.confirmReopen")))) return;
    setBusy(true);
    try { changed(await takeIssueAction(item, action, action === "start" ? { startedOn: issueToday() } : {}), `#${item.lineNo} ${t(`Issues.done.${action}`)}`); }
    catch (failure) {
      if (isConflict(failure)) { notify(t("Issues.changedReloaded")); await reload(); }
      else notify(errorText(failure));
    } finally { setBusy(false); }
  };
  const saveHeader = async () => {
    if (!batch || !header) return;
    const problem = headerError(header);
    if (problem) { bubble.show(headerBox.current?.querySelector<HTMLElement>(`[data-field="${problem[0]}"]`), t(problem[1])); return; }
    setBusy(true);
    try { changed(await updateIssueBatch(batch.id, batch.rowVersion, headerInput(header)), t("Issues.saved")); setHeader(null); }
    catch (failure) { bubble.show(headerBox.current?.closest(".dialog")?.querySelector<HTMLElement>(".d-foot .btn-primary"), errorText(failure)); }
    finally { setBusy(false); }
  };
  const open = batch?.items.filter((item) => OPEN_ISSUE_STATES.includes(item.state)).length ?? 0;
  const planHours = batch?.items.filter((item) => item.state !== "Cancelled" && item.state !== "Rejected").reduce((sum, item) => sum + (item.planHours ?? 0), 0) ?? 0;
  const actualHours = batch?.items.reduce((sum, item) => sum + (item.actualHours ?? 0), 0) ?? 0;
  return <PgDialog size="wide" busy={busy} onClose={onClose}
    title={batch ? <>{batch.batchNo} {batch.closedAt ? <span className="pg-badge b-success">{t("Issues.batchClosed")}</span> : <span className="pg-badge b-soft">{fill(t("Issues.batchOpen"), { n: open })}</span>}</> : t("Issues.loading")}
    description={batch ? <div className="meta">
      <span>{t("Issues.project")} {batch.projectId ? <button type="button" className="doclink" onClick={() => openProjectSchedule?.(batch.projectId!)} disabled={!openProjectSchedule}>{batch.projectNo} · {batch.projectName}</button> : <b>{batch.externalProject}</b>}{batch.projectClosed ? ` (${t("Issues.projectClosed")})` : ""}</span>
      {batch.customerName ? <span>{t("Issues.customer")} <b>{batch.customerName}</b></span> : null}
      <span>{t("Issues.reportedOn")} <b>{dates.day(batch.reportedOn)}</b>{batch.reportedBy ? ` · ${batch.reportedBy}` : ""}</span>
      <span>{t("Issues.createdBy")} <b>{batch.createdByName}</b></span>
      <span>{t("Issues.hours")} <b className="tnum">{hoursText(planHours)}</b> {t("Issues.plan")} · <b className="tnum">{hoursText(actualHours)}</b> {t("Issues.actual")}</span>
    </div> : null}
    footer={batch ? <>
      {batch.mayEdit && !header ? <button type="button" className="pg-btn btn-outline" onClick={() => setHeader(headerOf(batch, issueToday()))}><Icon name="edit" className="pg-icon" />{t("Issues.editBatch")}</button> : null}
      {batch.mayAdd && !header ? <button type="button" className="pg-btn btn-outline" onClick={() => setAdding(true)}><Icon name="plus" className="pg-icon" />{t("Issues.addIssues")}</button> : null}
      <button type="button" className="pg-btn btn-outline" onClick={() => onExport([batch])}><Icon name="download" className="pg-icon" />{t("Issues.export")}</button>
      <span className="pg-spacer" />
      {header ? <><button type="button" className="pg-btn btn-outline" onClick={() => setHeader(null)}>{t("Issues.cancel")}</button>
        <button type="button" className="pg-btn btn-primary" aria-busy={busy} onClick={() => void saveHeader()}>{t("Issues.save")}</button></>
        : <button type="button" className="pg-btn btn-primary" onClick={onClose}>{t("Issues.close")}</button>}
    </> : null}>
    {error ? <div className="error-line" role="alert">{error}<button type="button" className="pg-btn btn-outline btn-sm" onClick={() => void reload()}>{t("Issues.retry")}</button></div> : null}
    {header ? <div ref={headerBox}><HeaderFields header={header} onChange={setHeader} /></div> : null}
    {batch?.note && !header ? <div className="recap">{batch.note}</div> : null}
    {batch ? <div className="emb"><table className="dt">
      <thead><tr><th className="acts-col">{t("Issues.actions")}</th><th>#</th><th>{t("Issues.category")}</th><th>{t("Issues.function")} / {t("Issues.description")}</th><th>{t("Issues.pictures")}</th><th>{t("Issues.pic")}</th><th>{t("Issues.plan")}</th><th>{t("Issues.actual")}</th><th>{t("Issues.status")}</th></tr></thead>
      <tbody>{batch.items.map((item) => <tr key={item.id} className={item.state === "Cancelled" || item.state === "Rejected" ? "dim" : ""}>
        <td className="acts-col"><div className="acts" data-guide="issues.itemActions">
          {/* The step forward is a labelled button; turning it down or dropping it is an icon with its name on hover. */}
          {item.actions.map((action) => action === "reject" || action === "cancel"
            ? <button key={action} type="button" className="pg-icon-btn danger" aria-label={`${t(`Issues.act.${action}`)} #${item.lineNo}`} title={t(`Issues.act.${action}`)} onClick={() => void act(item, action)} aria-busy={busy}>
              <Icon name={ACTION_ICON[action]} className="pg-icon" /></button>
            : <button key={action} type="button" className={`pg-btn btn-sm ${action === "approve" || action === "close" ? "btn-primary" : "btn-outline"}`} onClick={() => void act(item, action)} aria-busy={busy}>
              <Icon name={ACTION_ICON[action]} className="pg-icon" />{t(`Issues.act.${action}`)}</button>)}
          {item.mayEdit ? <button type="button" className="pg-icon-btn" aria-label={fill(t("Issues.editLine"), { n: item.lineNo })} onClick={() => setEditing(item)}><Icon name="edit" className="pg-icon" /></button> : null}
        </div></td>
        <td className="tnum">{item.lineNo}</td>
        <td><CategoryBadge category={item.category} /></td>
        <td className="desc">{item.functionName ? <b>{item.functionName}</b> : null}{item.description}
          {item.state === "Done" && item.fixNote ? <div className="hint ok-text">{t("Issues.fixNote")}: {item.fixNote}</div> : null}
          {(item.state === "Cancelled" || item.state === "Rejected") && item.reason ? <div className="hint bad-text">{t("Issues.reason")}: {item.reason}</div> : null}
          {item.state === "Approval" ? <div className="hint warn-text">{t("Issues.waitingNote")}</div> : null}</td>
        <td><div className="imgcell" style={{ padding: 0 }}>{item.images.map((image) => <SavedThumb key={image.id} itemId={item.id} image={image} onOpen={setViewing} />)}</div></td>
        <td>{item.assigneeName || <span className="hint">{t("Issues.noPic")}</span>}</td>
        <td className="tnum" style={{ whiteSpace: "nowrap" }}>{dates.span(item.planStart, item.planEnd)}<div className="hint">{item.planHours === null ? "—" : `${hoursText(item.planHours)} ${t("Issues.hoursShort")}`}</div></td>
        <td className="tnum" style={{ whiteSpace: "nowrap" }}>{item.doneOn ? dates.span(item.startedOn, item.doneOn) : item.startedOn ? `${t("Issues.startedOn")} ${dates.day(item.startedOn)}` : "—"}
          <div className="hint">{item.actualHours === null ? "" : `${hoursText(item.actualHours)} ${t("Issues.hoursShort")}`}</div></td>
        <td><IssueStateBadge state={item.state} /></td>
      </tr>)}</tbody>
    </table></div> : null}
    {editing ? <ItemEditDialog item={editing} team={bootstrap.team} onClose={() => setEditing(null)} onSaved={(next, message) => { setEditing(null); changed(next, `#${editing.lineNo} ${message}`); }} /> : null}
    {acting ? <IssueActionDialog item={acting.item} action={acting.action} onClose={() => setActing(null)}
      onDone={(next) => { const done = acting; setActing(null); changed(next, `#${done.item.lineNo} ${t(`Issues.done.${done.action}`)}`); }} /> : null}
    {adding && batch ? <IssueGridDialog bootstrap={bootstrap} batch={batch} onClose={() => setAdding(false)} onSaved={(next, message) => { setAdding(false); changed(next, message); }} /> : null}
    {viewing ? <PictureViewer src={viewing} onClose={() => setViewing(null)} /> : null}
    {bubble.node}
  </PgDialog>;
}

// ── Export in the Issues Table layout ──

function ExportDialog({ batches, onClose }: { batches: IssueBatch[]; onClose: () => void }) {
  const t = useT();
  const dates = useDates();
  const today = issueToday();
  const sorted = [...batches].sort((a, b) => a.reportedOn.localeCompare(b.reportedOn) || a.id - b.id);
  const first = sorted[0]!;
  const project = first.projectId ? { no: first.projectNo, name: first.projectName } : { no: "", name: first.externalProject };
  const rows = sorted.flatMap((batch) => batch.items.map((item) => ({
    issuedOn: batch.reportedOn, category: item.category, functionName: item.functionName, pictures: item.images.length, description: item.description,
    solution: item.state === "Done" ? item.fixNote : item.reason, inCharge: item.assigneeName, planStart: item.planStart, planEnd: item.planEnd,
    actualStart: item.startedOn, actualEnd: item.doneOn, status: EXCEL_STATUS[item.state],
  })));
  const file = issueWorkbookName(project.no || project.name, today);
  const download = () => {
    downloadErpEstimateWorkbookBytes(buildIssueWorkbook({
      projectNo: project.no, projectName: project.name, customer: first.customerName, updatedOn: today,
      picturesLabel: (count) => fill(t("Issues.picturesCount"), { n: count }), rows,
    }), file);
    onClose();
  };
  return <PgDialog size="x6" onClose={onClose} title={t("Issues.export")} description={`${file} · ${fill(t("Issues.exportSummary"), { batches: sorted.length, n: rows.length })}`}
    footer={<><button type="button" className="pg-btn btn-outline" onClick={onClose}>{t("Issues.cancel")}</button>
      <button type="button" className="pg-btn btn-primary" data-autofocus onClick={download}><Icon name="download" className="pg-icon" />{t("Issues.download")}</button></>}>
    <div className="sheetx"><table>
      <thead><tr>{["No.", "Issuing Date", "Issue Category", "Function/Root", "Picture/Screen shot", "Description ENG", "Solve problems ENG", "In charge", "Plan Start", "Plan End", "Actual Start", "Actual End", "Status"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>
        <td className="c">{index + 1}</td><td className="c">{dates.day(row.issuedOn)}</td><td className="c">{row.category}</td><td>{row.functionName}</td>
        <td className="c">{row.pictures ? fill(t("Issues.picturesCount"), { n: row.pictures }) : ""}</td><td>{row.description}</td><td>{row.solution}</td><td className="c">{row.inCharge}</td>
        <td className="c">{dates.day(row.planStart)}</td><td className="c">{dates.day(row.planEnd)}</td><td className="c">{dates.day(row.actualStart)}</td><td className="c">{dates.day(row.actualEnd)}</td><td className="c">{row.status}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="hint">{t("Issues.exportNote")}</p>
  </PgDialog>;
}

// ── The page ──

const BATCH_TAB_LINK = choiceLink<IssueBatchTab>(TABS);

export function IssueBatchScreen({ bootstrap, notify, openProjectSchedule, initialBatchId = null }: Props) {
  const t = useT();
  const dates = useDates();
  const [opened, place] = useScreenPlace();
  useActivitySubView("projects-punchlist");
  const [tab, setTab] = useLinkedState<IssueBatchTab>("issuetab", "open", BATCH_TAB_LINK);
  const [search, setSearch] = useLinkedState("issueq", "", textLink, { remember: false });
  const [page, setPage] = useState(1);
  const [list, setList] = useState<IssueBatchList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  // A batch opened from a link (#/projects/punchlist/<id>), from My Work, the Plan or Team overview.
  const [openId, setOpenId] = useState<number | null>(() => initialBatchId ?? (opened[0] === "punchlist" && /^[1-9]\d{0,15}$/.test(opened[1] ?? "") ? Number(opened[1]) : null));
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<IssueBatch[] | null>(null);
  const requestId = useRef(0);
  const canRead = bootstrap.permissions.includes("schedule.read");

  const load = useCallback(async () => {
    if (!canRead) return;
    const current = ++requestId.current;
    setLoading(true);
    try {
      const data = await loadIssueBatches({ tab, search, projectId: null, page, pageSize: PAGE_SIZE });
      if (current === requestId.current) { setList(data); setError(""); }
    } catch (failure) { if (current === requestId.current) setError(errorText(failure)); }
    finally { if (current === requestId.current) setLoading(false); }
  }, [canRead, tab, search, page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer); }, [load]);

  const openBatch = (id: number | null) => { setOpenId(id); place(id ? ["punchlist", id] : ["punchlist"]); };
  const pickTab = (next: IssueBatchTab) => { setTab(next); setPage(1); setSelected(new Set()); };
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const exportSelected = async (ids: number[]) => {
    const rows = list?.items.filter((batch) => ids.includes(batch.id)) ?? [];
    const keys = new Set(rows.map((batch) => (batch.projectId ? `p${batch.projectId}` : `x${batch.externalProject.trim().toLowerCase()}`)));
    if (keys.size > 1) { notify(t("Issues.exportOneProject")); return; }
    try { setExporting(await Promise.all(ids.map((id) => loadIssueBatch(id)))); }
    catch (failure) { notify(errorText(failure)); }
  };

  if (!canRead) return <div className="pg pg-page"><div className="pg-empty">{t("Issues.noAccess")}</div></div>;
  const tabs = list?.tabs;
  const pageCount = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const allOnPage = list?.items.length ? list.items.every((batch) => selected.has(batch.id)) : false;
  return <div className="pg pg-page" data-guide="issues.page">
    <div className="pg-head">
      <div><h2>{t("Issues.title")}</h2><p>{t("Issues.subtitle")}</p></div>
      <div className="pg-head-actions">
        {list?.canWrite ? <button type="button" className="pg-btn btn-primary" data-guide="issues.create" onClick={() => setCreating(true)}><Icon name="plus" className="pg-icon" />{t("Issues.create")}</button> : null}
      </div>
    </div>
    <div className="summary" role="group" aria-label={t("Issues.filterBy")} data-guide="issues.summary">
      {TABS.map((key) => <button key={key} type="button" className="cell" aria-pressed={tab === key} onClick={() => pickTab(key)}>
        <span className="pg-label">{t(`Issues.tab.${key}`)}</span>
        <span className={`value${key === "approval" && tabs?.approval ? " pg-warn" : ""}`}>{tabs ? tabs[key] : "—"}</span>
        <span className="sub">{t(`Issues.tabSub.${key}`)}</span>
      </button>)}
    </div>
    <div className="gcard">
      <div className="pg-toolbar">
        <label className="search"><Icon name="search" className="pg-icon" /><span className="sr-only">{t("Issues.search")}</span>
          <input type="search" value={search} placeholder={t("Issues.search")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <span className="pg-spacer" />
        <button type="button" className="pg-icon-btn" aria-label={t("Issues.refresh")} title={t("Issues.refresh")} onClick={() => void load()}><Icon name="refresh" className="pg-icon" /></button>
      </div>
      {error ? <div className="error-line" role="alert">{error}<button type="button" className="pg-btn btn-outline btn-sm" onClick={() => void load()}>{t("Issues.retry")}</button></div> : null}
      {loading && !list ? <div className="pg-empty">{t("Issues.loading")}</div> : list && !list.items.length ? <div className="pg-empty">{search ? t("Issues.noMatch") : t(`Issues.empty.${tab}`)}</div> : list ? <div className="dt-scroll"><table className="dt">
        <thead><tr>
          <th className="cb"><input type="checkbox" className="cbx" aria-label={t("Issues.selectPage")} checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(list.items.map((batch) => batch.id)))} /></th>
          <th className="acts-col">{t("Issues.actions")}</th><th>{t("Issues.batchNo")}</th><th>{t("Issues.project")}</th><th>{t("Issues.reportedOn")}</th>
          <th>{t("Issues.progress")}</th><th className="r">{t("Issues.hoursPlanActual")}</th><th>{t("Issues.status")}</th>
        </tr></thead>
        <tbody>{list.items.map((batch) => {
          const progress = batchProgress(batch);
          return <tr key={batch.id} className={selected.has(batch.id) ? "sel" : ""}>
            <td className="cb"><input type="checkbox" className="cbx" aria-label={fill(t("Issues.selectBatch"), { no: batch.batchNo })} checked={selected.has(batch.id)} onChange={() => toggle(batch.id)} /></td>
            <td className="acts-col"><div className="acts">
              <button type="button" className="pg-icon-btn" aria-label={fill(t("Issues.openBatch"), { no: batch.batchNo })} title={t("Issues.open")} onClick={() => openBatch(batch.id)}><Icon name="eye" className="pg-icon" /></button>
              <button type="button" className="pg-icon-btn" aria-label={fill(t("Issues.exportBatch"), { no: batch.batchNo })} title={t("Issues.export")} onClick={() => void exportSelected([batch.id])}><Icon name="download" className="pg-icon" /></button>
            </div></td>
            <td><button type="button" className="doclink" data-guide="issues.batch" onClick={() => openBatch(batch.id)}>{batch.batchNo}</button></td>
            <td className="pj"><b>{batch.projectId ? `${batch.projectNo} · ${batch.projectName}` : batch.externalProject}</b>
              <span>{[batch.customerName, batch.projectId ? (batch.projectClosed ? t("Issues.projectClosed") : "") : t("Issues.projectOutsideShort")].filter(Boolean).join(" · ")}</span></td>
            <td className="pj"><b className="tnum">{dates.day(batch.reportedOn)}</b><span>{batch.reportedBy || batch.createdByName}</span></td>
            <td><div className="prog"><span className="meter"><i className={progress.percent === 100 ? "ok" : ""} style={{ width: `${progress.percent}%` }} /></span><span className="tnum hint">{progress.finished}/{progress.total}</span></div></td>
            <td className="r tnum">{hoursText(batch.planHours)} / {hoursText(batch.actualHours)}</td>
            <td><div className="acts">
              {batch.closedAt ? <span className="pg-badge b-success">{t("Issues.batchClosed")}</span> : null}
              {batch.approvalCount ? <span className="pg-badge b-warning">{fill(t("Issues.waitingCount"), { n: batch.approvalCount })}</span> : null}
              {batch.doingCount ? <span className="pg-badge b-soft">{fill(t("Issues.doingCount"), { n: batch.doingCount })}</span> : null}
              {batch.openCount ? <span className="pg-badge b-outline">{fill(t("Issues.openCount"), { n: batch.openCount })}</span> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : null}
      {list && list.total > list.pageSize ? <div className="pg-pager"><span className="tnum">{fill(t("Issues.pageOf"), { from: (list.page - 1) * list.pageSize + 1, to: Math.min(list.page * list.pageSize, list.total), total: list.total })}</span>
        <div><button type="button" className="pg-btn btn-outline btn-sm" onClick={() => setPage(Math.max(1, page - 1))} aria-disabled={page <= 1}>{t("Issues.prev")}</button>
          <button type="button" className="pg-btn btn-outline btn-sm" onClick={() => setPage(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount}>{t("Issues.next")}</button></div></div> : null}
    </div>
    {selected.size ? <div className="selbar"><div>
      <span className="n">{fill(t("Issues.selected"), { n: selected.size })}</span><span className="sep" />
      <button type="button" className="pg-btn btn-primary btn-sm" onClick={() => void exportSelected([...selected])}><Icon name="download" className="pg-icon" />{t("Issues.export")}</button>
      <button type="button" className="pg-icon-btn" aria-label={t("Issues.clearSelection")} onClick={() => setSelected(new Set())}><Icon name="x" className="pg-icon" /></button>
    </div></div> : null}
    {creating ? <IssueGridDialog bootstrap={bootstrap} batch={null} onClose={() => setCreating(false)} onSaved={(batch, message) => { setCreating(false); notify(message); void load(); openBatch(batch.id); }} /> : null}
    {openId ? <BatchDialog key={openId} batchId={openId} bootstrap={bootstrap} notify={notify} onClose={() => openBatch(null)} onChanged={() => void load()}
      onExport={(batches) => setExporting(batches)} openProjectSchedule={openProjectSchedule} /> : null}
    {exporting ? <ExportDialog batches={exporting} onClose={() => setExporting(null)} /> : null}
  </div>;
}
