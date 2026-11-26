"use client";
import { confirmDialog } from "../dialogs";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ApiClientError, apiRequest, listInquiries, listProjects, type BootstrapData } from "../api-client";
import { Drawer, EmptyState, Icon, Modal, SearchInput, type Tone } from "../ui";
import { localeFor, useLanguage } from "../i18n";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { SearchMultiPicker, type PickerOption } from "./SearchMultiPicker";
import { TeamBoardGantt, type GanttPerson, type GanttWork } from "./TeamBoardGantt";
import {
  createTeamTask,
  deleteTeamTask,
  loadTeamBoard,
  loadTeamTaskHistory,
  syncOutlookCalendars,
  teamTaskInput,
  updateTeamTask,
  type BoardAway,
  type CalendarDelivery,
  type MeetingMode,
  type OutlookEvent,
  type BoardVisit,
  type TeamBoardData,
  type TeamTask,
  type TeamTaskChange,
  type TeamTaskInput,
  type TeamTaskKind,
  type TeamTaskRepeat,
  type TeamTaskScope,
  type TeamTaskSlot,
  type TeamTaskStatus,
} from "../resource-workload-client";
import { dateFromDay, dayNumber, isOpenWork, weeklyCapacity, workingDays, type Commitment } from "../../../lib/resource-planning";
import { itemManDays } from "../../../lib/capacity-plan";
import {
  MAX_REPEAT_DAYS,
  boardDays,
  covers,
  dailyLoad,
  dateRuns,
  dayWork,
  defaultTaskManDays,
  dueGroup,
  freestOn,
  isoWeekday,
  loadBand,
  monthAfter,
  outlookDates,
  outlookLoad,
  overlapDays,
  repeatDays,
  tableHtml,
  tableTsv,
  timeRange,
  weekTotals,
  withExtra,
  withOutlook,
  type DayLoad,
  type Overlap,
} from "../../../lib/team-board";
import type { GanttAlert } from "./GanttChart";
import { choiceLink, idLink, listLink, optionalChoiceLink, textLink, useLinkedState, type LinkCodec } from "../screen-link";
import { CHIP_LABEL, plannerDay, plannerTotals, type PlannerDay, type TeamWeekData, type TeamWeekDay } from "../../../lib/team-week";
import "./team-board.css";
import "./team-week.css";
import { DateInput } from "../DateInput";

// The team board (owner decision 2026-10-21): everyone's work on one page, a day grid coloured by load, a list of all
// work, and work added ahead with a subject and a date, adjusted later. See lib/team-board.ts for the arithmetic.
// Team planner (owner decision 2026-11-23): the day grid and Team week in one table, in hours, for one, two or four
// weeks; each cell shows one figure, the hours confirmed, else booked on My week, else planned (lib/team-week.ts).

/** board: Team planner, people by day; list: all the work as a list. */
export type TeamBoardMode = "board" | "list";
type Category = "rfq" | "est" | "prj" | "appointment" | "task" | "away";
/** The planner's summary bar; the list keeps the first four as its attention chips. */
type Attention = "late" | "unassigned" | "over" | "overlap" | "free" | "pending" | "leave" | "noHours";
type BoardEvent =
  | { kind: "rfq" | "est" | "prj"; key: string; item: Commitment; late: boolean }
  | { kind: "appointment" | "task" | "away"; key: string; task: TeamTask; late: boolean }
  | { kind: "visit"; key: string; visit: BoardVisit; late: false }
  | { kind: "leave"; key: string; away: BoardAway; late: false }
  | { kind: "outlook"; key: string; event: OutlookEvent; late: false };
type ListRow = {
  key: string;
  category: Category;
  start: string | null;
  end: string | null;
  ownerIds: number[];
  manDays: number | null;
  late: boolean;
  item?: Commitment;
  task?: TeamTask;
  visit?: BoardVisit;
  away?: BoardAway;
};
type Person = {
  user: BootstrapData["team"][number];
  load: DayLoad[];
  capacity: number;
  week: ReturnType<typeof weekTotals>;
  late: number;
  awayDays: number;
  away: (date: string) => boolean;
  userId: number;
  /** Days in the grid on which two or more pieces of their work fall (owner decision 2026-11-04), by date. */
  overlapOn: Map<string, Overlap>;
  /** The same over everything read (the Gantt scrolls past the grid), and the working days their load is over 100%. */
  overlaps: Overlap[];
  overDates: string[];
  /** Team planner: each day on show in hours, and the person's total against what they can give. */
  days: PlannerDay[];
  /** Their open work over the days on show, for the lines a row opens into (owner decisions 2026-11-25). */
  work: Commitment[];
  /** Of that work, plan rows with no hours: not counted, listed until someone types their hours. */
  noHours: number;
  hours: ReturnType<typeof plannerTotals>;
};

/** The teams a person last filtered the board by; a convenience, so blocked storage only forgets them. */
const teamsKey = (userId: number) => `tomas-tech-team-board-teams:${userId}`;
function readTeams(userId: number): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(teamsKey(userId)) ?? "[]");
    return Array.isArray(stored) ? stored.filter((team): team is string => typeof team === "string") : [];
  } catch {
    return [];
  }
}
const LIST_PAGE = 100;
// The board's link (screen-link.tsx): its window, teams, filters, layout and the task open in the drawer.
const WEEKS_LINK: LinkCodec<1 | 2 | 4> = { parse: (text) => (text === "1" ? 1 : text === "2" ? 2 : text === "4" ? 4 : null), format: String };
/** Width of a day column at each window, weekday and weekend, for the table's minimum width (team-board.css, team-week.css). */
const DAY_WIDTH = { 1: [150, 88], 2: [112, 64], 4: [52, 40] } as const;
/** The one-time notice that the daily grid moved into Team planner, dismissed per person. */
const noticeKey = (userId: number) => `tomas-tech-team-planner-notice:${userId}`;
const HOURS_PER_DAY = 8;
const SOURCE_LABEL: Record<PlannerDay["source"], string> = { confirmed: "TeamBoard.srcConfirmed", booked: "TeamBoard.srcBooked", plan: "TeamBoard.srcPlan" };
const SOURCE_NOTE: Record<PlannerDay["source"], string> = { confirmed: "TeamBoard.srcConfirmedNote", booked: "TeamBoard.srcBookedNote", plan: "TeamBoard.srcPlanNote" };
/** Team planner's summary bar (owner decision 2026-11-23): each figure counts people, or work waiting, and filters by it. */
const SUMMARY: readonly { key: Attention; label: string; tone: string }[] = [
  { key: "over", label: "TeamWeek.chipOver", tone: "red" },
  { key: "overlap", label: "TeamBoard.overlapTime", tone: "amber" },
  { key: "free", label: "TeamWeek.chipFree", tone: "green" },
  { key: "pending", label: "TeamWeek.chipPending", tone: "amber" },
  { key: "leave", label: "TeamWeek.chipLeave", tone: "violet" },
  // Owner decisions 2026-11-25: plan work with a member and no hours takes no time; the people who have some.
  { key: "noHours", label: "TeamBoard.sumNoHours", tone: "slate" },
  { key: "late", label: "TeamBoard.late", tone: "red" },
  { key: "unassigned", label: "TeamBoard.sumWaiting", tone: "blue" },
];
const LAYOUT_LINK = choiceLink(["grid", "gantt"] as const);
const CATEGORIES: { key: Category; label: string; colour: string }[] = [
  { key: "rfq", label: "TeamBoard.typeRfq", colour: "var(--blue)" },
  { key: "est", label: "TeamBoard.typeEst", colour: "var(--green)" },
  { key: "prj", label: "TeamBoard.typePrj", colour: "var(--violet)" },
  { key: "appointment", label: "TeamBoard.typeAppointment", colour: "var(--amber)" },
  { key: "task", label: "TeamBoard.typeTask", colour: "var(--n-500)" },
  { key: "away", label: "TeamBoard.typeAway", colour: "var(--n-300)" },
];
/** How a list row names its kind, what it is, its customer, time and status: shared by the list, the Gantt and a copy. */
const rowTypeLabel = (row: ListRow) => (row.visit ? "TeamBoard.chipVisit" : LIST_TYPES[row.category]);
const rowTitle = (row: ListRow, t: (key: string) => string) =>
  row.item
    ? row.item.hidden
      ? t("TeamBoard.hiddenWork")
      : [row.item.reference, row.item.title].filter(Boolean).join(" · ")
    : row.task
      ? row.task.title
      : row.visit
        ? row.visit.number || t("TeamBoard.chipVisit")
        : t(row.away!.kind);
const rowCustomer = (row: ListRow) => row.item?.customer || row.task?.customer || row.visit?.customer || "";
const rowTime = (row: ListRow) => (row.task ? timeRange(row.task) : (row.visit?.time ?? ""));
const rowStatus = (row: ListRow, t: (key: string) => string) =>
  row.item ? `${t(row.item.status)}${row.item.progress ? ` ${Math.round(row.item.progress)}%` : ""}` : row.visit ? t(row.visit.status) : row.task ? t("TeamBoard.statusPlanned") : "";
const rowTone = (row: ListRow): Tone =>
  row.late ? "red" : row.category === "rfq" ? "blue" : row.category === "est" ? "green" : row.category === "prj" ? "violet" : row.category === "appointment" ? "amber" : "slate";
/** Day grid or Gantt, remembered per person like the teams. */
const viewKey = (userId: number) => `tomas-tech-team-board-view:${userId}`;
function readView(userId: number): "grid" | "gantt" {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(viewKey(userId)) === "gantt" ? "gantt" : "grid";
  } catch {
    return "grid";
  }
}

const CATEGORY_LINK = optionalChoiceLink<Category>(["rfq", "est", "prj", "appointment", "task", "away"]);
const ATTENTION_LINK = optionalChoiceLink<Attention>(["late", "unassigned", "over", "overlap", "free", "pending", "leave", "noHours"]);
/** The attention chips the list keeps; the rest belong to the planner's summary bar. */
const LIST_ATTENTION: readonly Attention[] = ["late", "unassigned", "over", "overlap"];
const LIST_TYPES: Record<Category, string> = {
  rfq: "TeamBoard.listRfq",
  est: "TeamBoard.listEst",
  prj: "TeamBoard.chipPrj",
  appointment: "TeamBoard.listAppointment",
  task: "TeamBoard.kindTask",
  away: "TeamBoard.typeAway",
};
const categoryOf = (event: BoardEvent): Category => (event.kind === "visit" || event.kind === "outlook" ? "appointment" : event.kind === "leave" ? "away" : event.kind);
const EVENT_ORDER: Record<BoardEvent["kind"], number> = { leave: 0, away: 0, visit: 1, appointment: 1, outlook: 1, task: 2, rfq: 3, est: 3, prj: 4 };
const itemCategory = (item: Commitment): Category => (item.type === "Inquiry" ? "rfq" : item.type === "Estimate" ? "est" : "prj");
const mondayOf = (date: string) => {
  const day = dayNumber(date);
  return dateFromDay(day - ((new Date(day * 86400000).getUTCDay() + 6) % 7));
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "∞");
const pct = (n: number | null) => (n === null ? "—" : Number.isFinite(n) ? `${Math.round(n)}%` : "∞");
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Who a history entry says the task was for: a list since migration 086, one assigneeId before it. */
const peopleOf = (state: Record<string, unknown>) =>
  Array.isArray(state.assigneeIds) ? state.assigneeIds.map(Number) : state.assigneeId === null || state.assigneeId === undefined ? [] : [Number(state.assigneeId)];

/** What the work is for (owner decision 2026-10-28: chosen every time): a project, an RFQ, or something not in the system yet. */
type WorkType = "" | "project" | "inquiry" | "other";
/** What a task form holds; empty strings for "not chosen". */
type Draft = {
  kind: TeamTaskKind;
  title: string;
  customerId: string;
  assigneeIds: number[];
  startDate: string;
  endDate: string;
  slot: TeamTaskSlot;
  startTime: string;
  endTime: string;
  manDays: string;
  status: TeamTaskStatus;
  workType: WorkType;
  inquiryId: string;
  projectId: string;
  note: string;
  /** Where an appointment is held (owner request 2026-11-09): online with a link, or offline in a room or on site. */
  meetingMode: "" | MeetingMode;
  meetingPlace: string;
  /** "" once only; otherwise every working day or the weekdays chosen (Monday 1 … Sunday 7), until a day. */
  repeat: "" | TeamTaskRepeat["rule"];
  weekdays: number[];
  until: string;
};
const draftOf = (task: TeamTask | null, preset: { assigneeId?: number | null; date?: string } = {}): Draft =>
  task
    ? {
        kind: task.kind,
        title: task.title,
        customerId: task.customerId ? String(task.customerId) : "",
        assigneeIds: [...task.assigneeIds],
        startDate: task.startDate,
        endDate: task.endDate,
        slot: task.slot,
        startTime: task.startTime ?? "",
        endTime: task.endTime ?? "",
        manDays: String(task.manDays),
        status: task.status,
        workType: task.projectId ? "project" : task.inquiryId ? "inquiry" : "other",
        inquiryId: task.inquiryId ? String(task.inquiryId) : "",
        projectId: task.projectId ? String(task.projectId) : "",
        note: task.note,
        meetingMode: task.meetingMode ?? "",
        meetingPlace: task.meetingPlace ?? "",
        repeat: task.repeat?.rule ?? "",
        weekdays: task.repeat ? [...task.repeat.weekdays] : [isoWeekday(task.startDate)],
        until: task.repeat?.until ?? "",
      }
    : {
        kind: "Appointment",
        title: "",
        customerId: "",
        assigneeIds: preset.assigneeId ? [preset.assigneeId] : [],
        startDate: preset.date ?? "",
        endDate: preset.date ?? "",
        slot: "Day",
        startTime: "",
        endTime: "",
        manDays: "",
        status: "Planned",
        workType: "",
        inquiryId: "",
        projectId: "",
        note: "",
        meetingMode: "",
        meetingPlace: "",
        repeat: "",
        weekdays: [],
        until: "",
      };
const WORKING_WEEK = [1, 2, 3, 4, 5];
/** What the form asks to save; `repeating` is false where the repeat is not this save's to change (one day of a series). */
const inputOf = (draft: Draft, repeating = true): TeamTaskInput => {
  const repeat: TeamTaskRepeat | null =
    repeating && draft.repeat ? { rule: draft.repeat, weekdays: draft.repeat === "Weekdays" ? WORKING_WEEK : [...draft.weekdays].sort((a, b) => a - b), until: draft.until } : null;
  // Where it is held goes with an appointment only.
  const meeting = draft.kind === "Appointment" && draft.meetingMode ? draft.meetingMode : null;
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    customerId: draft.customerId ? Number(draft.customerId) : null,
    // A repeating task takes one day each time.
    assigneeIds: draft.assigneeIds,
    startDate: draft.startDate,
    endDate: repeat ? draft.startDate : draft.endDate || draft.startDate,
    // Times go with the Time slot only, and never with a day away.
    slot: draft.kind === "Away" ? "Day" : draft.slot,
    startTime: draft.kind !== "Away" && draft.slot === "Time" ? draft.startTime || null : null,
    endTime: draft.kind !== "Away" && draft.slot === "Time" ? draft.endTime || null : null,
    manDays: draft.kind === "Away" ? 0 : draft.manDays.trim() === "" ? null : Number(draft.manDays),
    status: draft.status,
    // One link, the kind chosen; a day away is for no work.
    inquiryId: draft.kind !== "Away" && draft.workType === "inquiry" && draft.inquiryId ? Number(draft.inquiryId) : null,
    projectId: draft.kind !== "Away" && draft.workType === "project" && draft.projectId ? Number(draft.projectId) : null,
    note: draft.note.trim(),
    meetingMode: meeting,
    meetingPlace: meeting ? draft.meetingPlace.trim() : "",
    repeat,
  };
};
/** A weekday's short name (Monday 1 … Sunday 7): 9 November 2026 was a Monday. */
const weekdayName = (lang: Parameters<typeof localeFor>[0], day: number) =>
  new Intl.DateTimeFormat(localeFor(lang), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 8 + day)));
/** "Online meeting · <link>" or "Offline · Room 2"; empty when it does not say. */
const meetingText = (task: Pick<TeamTask, "meetingMode" | "meetingPlace">, t: (key: string) => string) =>
  task.meetingMode ? [t(task.meetingMode === "Online" ? "TeamBoard.meetingOnline" : "TeamBoard.meetingOffline"), task.meetingPlace].filter(Boolean).join(" · ") : "";
/** A link that opens: http or https only. */
const meetingUrl = (place: string) => (/^https?:\/\/\S+$/i.test(place.trim()) ? place.trim() : "");
/** "Every working day" or "Weekly (Mon, Thu)". */
const repeatRuleText = (repeat: Pick<TeamTaskRepeat, "rule" | "weekdays">, t: (key: string) => string, lang: Parameters<typeof localeFor>[0]) =>
  repeat.rule === "Weekdays" ? t("TeamBoard.repeatWeekdays") : `${t("TeamBoard.repeatWeekly")} (${repeat.weekdays.map((day) => weekdayName(lang, day)).join(", ")})`;
/** A team task as the load counts it: planned appointments and tasks only, its whole effort for each of its people. */
const taskWork = (task: TeamTask): Commitment[] =>
  task.status !== "Planned" || task.kind === "Away"
    ? []
    : (task.assigneeIds.length ? task.assigneeIds : [null]).map((ownerId) => ({
        key: `TeamTask-${task.id}-${ownerId ?? "none"}`,
        workKey: `TeamTask-${task.id}`,
        type: "Task" as const,
        entityId: task.id,
        ownerId,
        reference: "",
        title: task.title,
        customer: task.customer,
        start: task.startDate,
        end: task.endDate,
        manDays: task.manDays,
        progress: 0,
        status: "Planned",
        taskKind: task.kind === "Appointment" ? ("Appointment" as const) : ("Task" as const),
        // A day of a repeat loads the day but overlaps nothing.
        ...(task.seriesId !== null ? { repeat: true } : {}),
      }));

export function TeamBoard({
  bootstrap,
  notify,
  mode,
  onMode,
  today,
  openItem,
  onChanged,
  actionsSlot,
  queue = null,
  queueCount = 0,
  fromOldBoard = false,
}: {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  mode: TeamBoardMode;
  onMode: (mode: TeamBoardMode) => void;
  today: string;
  /** Opens an inquiry, estimate or project the reader may see. */
  openItem: (item: Commitment) => void;
  /** A team task was added, changed or removed: the weekly workload reads again. */
  onChanged?: () => void;
  /**
   * The page header's action area (2026-11-10 mockup: copy, refresh, Outlook and Add sit beside the title). Left out,
   * the board shows its actions above itself; null while the header has not mounted yet.
   */
  actionsSlot?: HTMLElement | null;
  /** Team planner's side column: the allocation queue (plan rows waiting for people), and how many rows wait in it. */
  queue?: ReactNode;
  queueCount?: number;
  /** Opened from an old daily-grid link (#/resources/board): two weeks, as the grid showed. */
  fromOldBoard?: boolean;
}) {
  const { t, lang } = useLanguage();
  const uid = useId();
  const [start, setStart] = useLinkedState("from", mondayOf(today), textLink, { remember: false });
  // One week first (owner decision 2026-11-23); two or four as the daily grid showed, remembered per person.
  const [weeks, setWeeks] = useLinkedState<1 | 2 | 4>("weeks", 1, WEEKS_LINK);
  const [notice, setNotice] = useState(() => {
    try {
      return mode === "board" && window.localStorage.getItem(noticeKey(bootstrap.user.id)) !== "1";
    } catch {
      return mode === "board";
    }
  });
  const dismissNotice = () => {
    setNotice(false);
    try {
      window.localStorage.setItem(noticeKey(bootstrap.user.id), "1");
    } catch {
      /* A notice seen again is all a blocked storage costs. */
    }
  };
  useEffect(() => {
    if (fromOldBoard && weeks === 1) setWeeks(2);
    // oxlint-disable-next-line react/exhaustive-deps -- once, when an old daily-grid link opens the planner.
  }, []);
  const [data, setData] = useState<TeamBoardData | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [chosenTeams, setChosenTeams] = useLinkedState("teams", [], listLink, {
    legacy: () => {
      const teams = readTeams(bootstrap.user.id);
      return teams.length ? teams : null;
    },
  });
  const [search, setSearch] = useLinkedState("q", "", textLink, { remember: false });
  const [category, setCategory] = useLinkedState<Category | null>("kind", null, CATEGORY_LINK),
    [attention, setAttention] = useLinkedState<Attention | null>("attention", null, ATTENTION_LINK);
  const [personId, setPersonId] = useLinkedState("person", null, idLink, { remember: false }),
    [listShown, setListShown] = useState(LIST_PAGE);
  // A new task: blank for a person and day, or a copy of one to change and save as new.
  const [adding, setAdding] = useState<{ assigneeId: number | null; date: string; copy?: TeamTask; draft?: Draft } | null>(null);
  // A person's day opened from the grid: everything taking their time that day (owner request 2026-11-06).
  const [dayOpen, setDayOpen] = useState<{ userId: number | null; date: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [boardView, pickView] = useLinkedState<"grid" | "gantt">("layout", "grid", LAYOUT_LINK, { legacy: () => readView(bootstrap.user.id) });
  // The task open in the drawer is on the link by its id, so the link opens it once the board has read it.
  const [editingId, setEditingId] = useLinkedState("task", null, idLink, { remember: false });
  // The window the grid shows, read with four months after it so the list sees what is coming.
  const range = useMemo(() => ({ from: start, to: dateFromDay(dayNumber(start) + Math.max(weeks * 7, 120) - 1) }), [start, weeks]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadTeamBoard(range.from, range.to));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  // The sticky filter bar's height, as a CSS variable, so the grid's own scroll box fits below it (team-board.css).
  const boardRef = useRef<HTMLDivElement>(null),
    toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = boardRef.current,
      bar = toolbarRef.current;
    if (!host || !bar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => host.style.setProperty("--board-toolbar-h", `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const me = bootstrap.user.id;
  const editing = editingId === null ? null : (data?.tasks.find((task) => task.id === editingId) ?? null);
  const setEditing = (task: TeamTask | null) => setEditingId(task?.id ?? null);
  // Owner decision 2026-10-28: Admins, Leaders and managers add work for anyone; everyone else on their own row.
  const canAssignOthers = Boolean(data?.canAssignOthers);
  const assignable = useMemo(() => (canAssignOthers ? null : [me]), [canAssignOthers, me]);
  const canChange = (task: TeamTask) => task.createdBy === me || task.assigneeIds.includes(me) || Boolean(data?.canChangeAll);
  const nameOf = useMemo(() => new Map(bootstrap.team.map((user) => [user.id, user.name])), [bootstrap.team]);
  const holidays = useMemo(() => data?.holidays ?? [], [data]);
  const days = useMemo(() => boardDays(start, weeks, holidays, today), [start, weeks, holidays, today]);
  // "This week" beside a name: the week holding today, or the first week shown.
  const week = useMemo(() => {
    const first = days.some((day) => day.today) ? mondayOf(today) : start;
    return { from: first, to: dateFromDay(dayNumber(first) + 4) };
  }, [days, start, today]);

  // Team planner: the days on show as Team week counts them (hours booked on My week and confirmed); the plan is the board's.
  const gridFrom = days[0]?.date ?? start,
    gridTo = days.at(-1)?.date ?? start;
  const [booked, setBooked] = useState<{ key: string; data: TeamWeekData | null } | null>(null);
  const bookedFor = useRef("");
  const loadBooked = useCallback(async () => {
    if (mode !== "board") return;
    const key = `${gridFrom}|${gridTo}`;
    bookedFor.current = key;
    let value: TeamWeekData | null = null;
    try {
      value = await apiRequest<TeamWeekData>(`/api/v1/team-week?from=${gridFrom}&to=${gridTo}`);
    } catch {
      // The plan still shows; a notice says the booked and confirmed hours are missing.
    }
    if (bookedFor.current === key) setBooked({ key, data: value });
  }, [mode, gridFrom, gridTo]);
  useEffect(() => {
    const timer = setTimeout(() => void loadBooked(), 0);
    return () => clearTimeout(timer);
  }, [loadBooked]);
  const bookedNow = booked?.key === `${gridFrom}|${gridTo}` ? booked : null;
  const weekDays = useMemo(() => {
    const map = new Map<string, TeamWeekDay>();
    for (const row of bookedNow?.data?.rows ?? []) for (const day of row.days) map.set(`${row.userId}|${day.date}`, day);
    return map;
  }, [bookedNow]);
  const refresh = () => {
    void load();
    void loadBooked();
  };

  const awayOf = useMemo(() => {
    const spans = new Map<number, { start: string | null; end: string | null }[]>();
    const add = (userId: number | null, from: string | null, to: string | null) => {
      if (userId) spans.set(userId, [...(spans.get(userId) ?? []), { start: from, end: to }]);
    };
    for (const entry of data?.away ?? []) add(entry.userId, entry.start, entry.end);
    for (const task of data?.tasks ?? []) if (task.kind === "Away" && task.status !== "Cancelled") for (const userId of task.assigneeIds) add(userId, task.startDate, task.endDate);
    return (userId: number, date: string) => (spans.get(userId) ?? []).some((span) => covers(span.start, span.end, date));
  }, [data]);

  const people: Person[] = useMemo(() => {
    if (!data) return [];
    const capacities = new Map(data.capacities.map((entry) => [entry.userId, entry.daysPerWeek]));
    // Outlook meetings count by their hours (owner decision 2026-10-28), at most a day's worth per day.
    const outlookMd = outlookLoad(data.outlook ?? []);
    // A past day of a repeat is history, not late.
    const lateTasks = (userId: number) =>
      data.tasks.filter((task) => task.assigneeIds.includes(userId) && task.status === "Planned" && task.kind !== "Away" && task.seriesId === null && task.endDate < today).length;
    // Everything read, for the Gantt, which scrolls past the grid's weeks.
    const readDays = boardDays(range.from, Math.ceil((dayNumber(range.to) - dayNumber(range.from) + 1) / 7), data.holidays, today).filter((day) => day.date <= range.to);
    return bootstrap.team
      .map((user) => {
        const items = data.items.filter((item) => item.ownerId === user.id);
        const capacity = weeklyCapacity(capacities.get(user.id));
        const outlookOf = (date: string) => outlookMd.get(`${user.id}|${date}`) ?? 0;
        const load = withOutlook(dailyLoad(items, days, capacity, data.holidays), (date) => outlookMd.get(`${user.id}|${date}`) ?? 0);
        const away = (date: string) => awayOf(user.id, date);
        const overlaps = overlapDays(items, range.from, range.to, data.holidays);
        const shown = new Set(days.map((day) => day.date));
        const plannerDays = days.map((day, index) =>
          plannerDay({
            date: day.date,
            today,
            planManDays: load[index]?.manDays ?? 0,
            availableManDays: load[index]?.available ?? 0,
            awayAllDay: away(day.date),
            week: weekDays.get(`${user.id}|${day.date}`) ?? null,
          }),
        );
        const first = days[0]?.date ?? range.from,
          last = days.at(-1)?.date ?? range.to;
        const work = items.filter((item) => isOpenWork(item) && item.type !== "Task" && item.start !== null && item.start <= last && (item.end ?? item.start) >= first);
        return {
          days: plannerDays,
          work,
          noHours: work.filter((item) => item.type === "Project" && !item.outsourced && !item.byDay && !(item.manDays !== null && item.manDays > 0)).length,
          hours: plannerTotals(plannerDays),
          overlaps,
          overlapOn: new Map(overlaps.filter((day) => shown.has(day.date)).map((day) => [day.date, day])),
          overDates: withOutlook(dailyLoad(items, readDays, capacity, data.holidays), outlookOf)
            .filter((day) => day.available > 0 && (day.utilisation ?? 0) > 100)
            .map((day) => day.date),
          user,
          userId: user.id,
          load,
          capacity,
          week: weekTotals(load, week.from, week.to),
          away,
          late: items.filter((item) => item.type !== "Task" && item.end && item.end < today).length + lateTasks(user.id),
          awayDays: days.filter((day) => day.date >= week.from && day.date <= week.to && !day.holiday && !day.weekend && away(day.date)).length,
        };
      })
      .sort((a, b) => a.user.department.localeCompare(b.user.department) || a.user.name.localeCompare(b.user.name));
  }, [bootstrap.team, data, days, week, today, awayOf, range, weekDays]);
  const personById = useMemo(() => new Map(people.map((person) => [person.userId, person])), [people]);

  // What falls on each person's day, keyed "userId|date"; 0 is the unassigned row.
  const events = useMemo(() => {
    const map = new Map<string, BoardEvent[]>();
    if (!data) return map;
    const add = (userId: number | null, date: string, event: BoardEvent) => {
      const key = `${userId ?? 0}|${date}`;
      map.set(key, [...(map.get(key) ?? []), event]);
    };
    const shown = new Set(days.map((day) => day.date));
    for (const item of data.items)
      if (item.type !== "Task" && item.end && shown.has(item.end)) add(item.ownerId, item.end, { kind: itemCategory(item) as "rfq" | "est" | "prj", key: item.key, item, late: item.end < today });
    for (const task of data.tasks) {
      if (task.status === "Cancelled") continue;
      const kind = task.kind === "Away" ? "away" : task.kind === "Appointment" ? "appointment" : "task";
      for (const day of days)
        if (covers(task.startDate, task.endDate, day.date))
          for (const userId of task.assigneeIds.length ? task.assigneeIds : [null])
            add(userId, day.date, { kind, key: `task-${task.id}`, task, late: task.status === "Planned" && task.kind !== "Away" && task.seriesId === null && task.endDate < today });
    }
    for (const visit of data.visits)
      for (const day of days)
        if (covers(visit.start, visit.end, day.date)) for (const engineerId of visit.engineerIds) add(engineerId, day.date, { kind: "visit", key: `visit-${visit.id}`, visit, late: false });
    for (const entry of data.away)
      for (const day of days) if (covers(entry.start, entry.end, day.date)) add(entry.userId, day.date, { kind: "leave", key: `away-${entry.id}`, away: entry, late: false });
    for (const event of data.outlook ?? []) for (const date of outlookDates(event)) if (shown.has(date)) add(event.userId, date, { kind: "outlook", key: `outlook-${event.id}`, event, late: false });
    for (const list of map.values()) list.sort((a, b) => EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind]);
    return map;
  }, [data, days, today]);

  // Every row the list can show, before its filters.
  const allRows: ListRow[] = useMemo(() => {
    if (!data) return [];
    const rows: ListRow[] = [];
    for (const item of data.items)
      if (item.type !== "Task")
        rows.push({
          key: item.key,
          category: itemCategory(item),
          start: item.start,
          end: item.end,
          ownerIds: item.ownerId ? [item.ownerId] : [],
          manDays: item.manDays,
          late: Boolean(item.end && item.end < today),
          item,
        });
    // A repeat is one row: its next day from today on (its last, once every day has passed).
    const nextOfSeries = new Map<number, TeamTask>();
    for (const task of data.tasks)
      if (task.seriesId !== null && task.status === "Planned") {
        const kept = nextOfSeries.get(task.seriesId);
        if (!kept || (task.startDate >= today ? kept.startDate < today || task.startDate < kept.startDate : kept.startDate < today && task.startDate > kept.startDate))
          nextOfSeries.set(task.seriesId, task);
      }
    for (const task of data.tasks)
      if (task.status === "Planned" && (task.seriesId === null || nextOfSeries.get(task.seriesId) === task))
        rows.push({
          key: `task-${task.id}`,
          category: task.kind === "Away" ? "away" : task.kind === "Appointment" ? "appointment" : "task",
          start: task.startDate,
          end: task.endDate,
          ownerIds: task.assigneeIds,
          manDays: task.kind === "Away" ? null : task.manDays,
          late: task.kind !== "Away" && task.seriesId === null && task.endDate < today,
          task,
        });
    for (const visit of data.visits)
      rows.push({ key: `visit-${visit.id}`, category: "appointment", start: visit.start, end: visit.end, ownerIds: visit.engineerIds, manDays: null, late: false, visit });
    for (const entry of data.away) rows.push({ key: `away-${entry.id}`, category: "away", start: entry.start, end: entry.end, ownerIds: [entry.userId], manDays: null, late: false, away: entry });
    return rows;
  }, [data, today]);

  const departments = useMemo(() => [...new Set(bootstrap.team.map((user) => user.department).filter(Boolean))].sort(), [bootstrap.team]);
  const teamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of bootstrap.team) if (user.department) counts.set(user.department, (counts.get(user.department) ?? 0) + 1);
    return counts;
  }, [bootstrap.team]);
  // Several teams at once; none chosen is everyone. A remembered team that no longer exists is left out.
  const teams = chosenTeams.filter((team) => departments.includes(team));
  const pickTeams = (next: string[]) => {
    setChosenTeams(next);
    setListShown(LIST_PAGE);
  };
  const query = search.trim().toLocaleLowerCase();
  const inDepartment = (userId: number) => !teams.length || teams.includes(bootstrap.team.find((user) => user.id === userId)?.department ?? "");
  const rowText = (row: ListRow) =>
    [row.item?.reference, row.item?.title, row.item?.customer, row.task?.title, row.task?.customer, row.visit?.number, row.visit?.customer, ...row.ownerIds.map((id) => nameOf.get(id) ?? "")]
      .join(" ")
      .toLocaleLowerCase();
  // The department, search and person filters; the chips count within them.
  const scopedRows = allRows.filter(
    (row) =>
      (!teams.length || row.ownerIds.some(inDepartment) || (!row.ownerIds.length && row.task !== undefined)) &&
      (personId === null || row.ownerIds.includes(personId)) &&
      (!query || rowText(row).includes(query)),
  );
  const overPeople = people.filter((person) => (person.week.utilisation ?? 0) > 100 && inDepartment(person.userId));
  const overlapPeople = people.filter((person) => person.overlapOn.size > 0 && inDepartment(person.userId));
  const unassignedTasks = (data?.tasks ?? []).filter((task) => !task.assigneeIds.length && task.status === "Planned");
  const counts = {
    all: scopedRows.length,
    ...(Object.fromEntries(CATEGORIES.map(({ key }) => [key, scopedRows.filter((row) => row.category === key).length])) as Record<Category, number>),
    late: scopedRows.filter((row) => row.late).length,
    unassigned: scopedRows.filter((row) => row.task && !row.ownerIds.length).length,
    over: overPeople.length,
    overlap: overlapPeople.length,
  };
  const pickCategory = (next: Category | null) => {
    setCategory(next);
    setListShown(LIST_PAGE);
  };
  const sideRef = useRef<HTMLElement>(null);
  const pickAttention = (next: Attention | null) => {
    setAttention(next);
    setListShown(LIST_PAGE);
    // Waiting for people: the planner's side column holds them.
    if (next === "unassigned" && mode === "board") {
      setDayOpen(null);
      sideRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };
  // The list keeps its four attention chips; the planner's other filters do nothing there.
  const listAttention = attention !== null && LIST_ATTENTION.includes(attention) ? attention : null;

  // The list: filtered rows, soonest due first, grouped by when they are due. The planner's Gantt filters people instead.
  const rowAttention = mode === "list" ? listAttention : null;
  const listRows = scopedRows
    .filter(
      (row) =>
        (!category || row.category === category) &&
        (rowAttention !== "late" || row.late) &&
        (rowAttention !== "unassigned" || (row.task !== undefined && !row.ownerIds.length)) &&
        (rowAttention !== "over" || row.ownerIds.some((id) => overPeople.some((person) => person.userId === id))) &&
        (rowAttention !== "overlap" || row.ownerIds.some((id) => overlapPeople.some((person) => person.userId === id))),
    )
    .sort((a, b) => (a.end ?? a.start ?? "9999").localeCompare(b.end ?? b.start ?? "9999") || a.key.localeCompare(b.key));

  // Team planner's filters over the days on show (owner decision 2026-11-23): one summary bar, each figure a filter.
  const plannerMatch = (person: Person, key: Exclude<Attention, "unassigned">) =>
    key === "overlap" ? person.overlapOn.size > 0 : key === "late" ? person.late > 0 : key === "noHours" ? person.noHours > 0 : person.hours.flags[key];
  // A person's row opens into one line per piece of their work, in hours a day (owner decisions 2026-11-25).
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  const toggleOpened = (userId: number) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  const plannerCount = (key: Exclude<Attention, "unassigned">) => people.filter((person) => inDepartment(person.userId) && plannerMatch(person, key)).length;
  // The grid's people: the team filter, a search on name or team, and the summary bar's filter; the busiest first in a team.
  const byLoad = (a: Person, b: Person) => b.hours.total / Math.max(1, b.hours.capacity) - a.hours.total / Math.max(1, a.hours.capacity) || a.user.name.localeCompare(b.user.name);
  const gridPeople = people.filter(
    (person) =>
      inDepartment(person.userId) &&
      (personId === null || person.userId === personId) &&
      (!query || [person.user.name, person.user.nickname, person.user.department].join(" ").toLocaleLowerCase().includes(query)) &&
      (attention === null || attention === "unassigned" || plannerMatch(person, attention)),
  );
  // The Gantt keeps a row for team tasks nobody has taken yet; the planner's grid lists them beside the table.
  const showUnassigned = (attention === null || attention === "unassigned") && personId === null && unassignedTasks.length > 0;
  // Teams folded on the grid (a convenience, not remembered).
  const [folded, setFolded] = useState<string[]>([]);
  // A day opened from the grid shows in the side column: bring it into sight when the column sits under the table.
  useEffect(() => {
    if (dayOpen) sideRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [dayOpen]);

  // Saved changes update the board in place: no full reload after each edit.
  const applyTask = (task: TeamTask | null, removedId?: number) => {
    onChanged?.();
    // A team task counts in the hours booked: the planner reads them again.
    void loadBooked();
    setData((current) => {
      if (!current) return current;
      const id = task?.id ?? removedId!;
      const tasks = current.tasks.filter((entry) => entry.id !== id);
      const items = current.items.filter((item) => item.workKey !== `TeamTask-${id}`);
      if (task) {
        tasks.push(task);
        items.push(...taskWork(task));
      }
      return { ...current, tasks, items };
    });
  };
  const customerName = (id: number | null) => (id === null ? "" : (bootstrap.customers.find((customer) => customer.id === id)?.name ?? ""));
  const savedTask = (base: TeamTask | null, input: TeamTaskInput, saved: { id: number; rowVersion: string; manDays: number }): TeamTask => ({
    ...input,
    id: saved.id,
    rowVersion: saved.rowVersion,
    manDays: saved.manDays,
    customer: customerName(input.customerId),
    inquiryNo: input.inquiryId === base?.inquiryId ? (base?.inquiryNo ?? "") : "",
    projectNo: input.projectId === base?.projectId ? (base?.projectNo ?? "") : "",
    createdBy: base?.createdBy ?? me,
    createdByName: base?.createdByName ?? bootstrap.user.name,
    createdAt: base?.createdAt ?? new Date().toISOString(),
    // A day changed on its own stays in its repeat.
    seriesId: base?.seriesId ?? null,
    repeat: base?.repeat ?? null,
  });
  const conflict = async (failure: unknown) => {
    if (failure instanceof ApiClientError && (failure.status === 409 || failure.status === 404)) {
      notify(t("TeamBoard.conflict"));
      await load();
      return true;
    }
    return false;
  };
  // One toast for the save and what reached the person's Outlook.
  const outlook = (calendar: CalendarDelivery) => (calendar === "sent" ? ` ${t("TeamBoard.outlookSent")}` : calendar === "failed" ? ` ${t("TeamBoard.outlookFailed")}` : "");
  const create = async (input: TeamTaskInput) => {
    const saved = await createTeamTask(input);
    // A repeat is a task on each of its days: the board reads them.
    if (input.repeat) {
      onChanged?.();
      await Promise.all([load(), loadBooked()]);
      notify(`${fill(t("TeamBoard.addedRepeat"), { n: saved.count ?? 0 })}${outlook(saved.calendar)}`);
      return;
    }
    applyTask(savedTask(null, input, saved));
    notify(`${t("TeamBoard.added")}${outlook(saved.calendar)}`);
  };
  const update = async (task: TeamTask, input: TeamTaskInput, message = "Saved", scope: TeamTaskScope = "this") => {
    try {
      const saved = await updateTeamTask(task.id, input, task.rowVersion, scope);
      // A task made to repeat, or the days of a repeat from this one on replaced: the board reads again.
      if (saved.replaced) {
        onChanged?.();
        await Promise.all([load(), loadBooked()]);
        notify(`${saved.count ? fill(t("TeamBoard.addedRepeat"), { n: saved.count }) : t(message)}${outlook(saved.calendar)}`);
        return null;
      }
      const next = savedTask(task, input, saved);
      applyTask(next);
      notify(`${t(message)}${outlook(saved.calendar)}`);
      return next;
    } catch (failure) {
      if (await conflict(failure)) return null;
      throw failure;
    }
  };
  const remove = async (task: TeamTask, scope: TeamTaskScope = "this") => {
    try {
      const removed = await deleteTeamTask(task.id, task.rowVersion, scope);
      // This day of a repeat and every one after it: the board reads again.
      if (scope === "following" && task.seriesId !== null) {
        onChanged?.();
        await Promise.all([load(), loadBooked()]);
      } else applyTask(null, task.id);
      notify(`${t("TeamBoard.deleted")}${outlook(removed.calendar)}`);
    } catch (failure) {
      if (!(await conflict(failure))) throw failure;
    }
  };

  // A day's header: the weekday on top, the date under it. The narrow weekday ("ส", "อา") and the day alone fit the slim
  // weekend columns of four weeks.
  const weekdayOf = (date: string, narrow = false) => new Intl.DateTimeFormat(localeFor(lang), { weekday: narrow ? "narrow" : "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const dayOnly = (date: string) => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const yearDate = (date: string) => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const longDate = (date: string) => new Intl.DateTimeFormat(localeFor(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const shortDate = (date: string | null) => (date ? new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "—");
  const lateDays = (end: string) => workingDays(dateFromDay(dayNumber(end) + 1), today, holidays).length || 1;
  const eventLabel = (event: BoardEvent) => {
    switch (event.kind) {
      case "rfq":
      case "est":
      case "prj": {
        const prefix = t(event.kind === "rfq" ? "TeamBoard.chipRfq" : event.kind === "est" ? "TeamBoard.chipEst" : "TeamBoard.chipPrj");
        if (event.item.hidden) return prefix;
        const what = event.kind === "prj" ? event.item.title : event.item.customer || event.item.title;
        return event.late ? `${t("TeamBoard.late")} · ${what}` : `${prefix} · ${what}`;
      }
      // ↻ marks a day of a repeat.
      case "appointment":
        return `${event.task.seriesId !== null ? "↻ " : ""}${t("TeamBoard.chipAppointment")}${timeRange(event.task) ? ` ${timeRange(event.task)}` : ""} · ${event.task.title}`;
      case "task":
        return `${event.task.seriesId !== null ? "↻ " : ""}${timeRange(event.task) ? `${timeRange(event.task)} ${event.task.title}` : event.task.title}`;
      case "away":
        return event.task.title;
      case "visit":
        return `${t("TeamBoard.chipVisit")}${event.visit.time ? ` ${event.visit.time}` : ""}${event.visit.customer ? ` · ${event.visit.customer}` : ""}`;
      case "leave":
        return t(event.away.kind);
      case "outlook":
        return `Outlook${outlookTime(event.event) ? ` ${outlookTime(event.event)}` : ""} · ${event.event.subject ?? t("TeamBoard.outlookBusy")}`;
    }
  };
  const eventTitle = (event: BoardEvent) => {
    if (event.kind === "rfq" || event.kind === "est" || event.kind === "prj")
      return event.item.hidden ? t("TeamBoard.hiddenWork") : [event.item.reference, event.item.title, event.item.customer].filter(Boolean).join(" · ");
    if (event.kind === "visit") return [event.visit.number, event.visit.customer].filter(Boolean).join(" · ") || t("TeamBoard.chipVisit");
    if (event.kind === "leave") return t(event.away.kind);
    if (event.kind === "outlook")
      return [`Outlook · ${event.event.subject ?? t("TeamBoard.outlookBusy")}`, outlookTime(event.event) || t("TeamBoard.slotDay"), event.event.location].filter(Boolean).join(" · ");
    return "task" in event ? [event.task.title, event.task.customer, meetingText(event.task, t), event.task.repeat ? repeatRuleText(event.task.repeat, t, lang) : ""].filter(Boolean).join(" · ") : "";
  };
  const openEvent = (event: BoardEvent) => {
    if (event.kind === "appointment" || event.kind === "task" || event.kind === "away") setEditing(event.task);
    else if ((event.kind === "rfq" || event.kind === "est" || event.kind === "prj") && !event.item.hidden) openItem(event.item);
  };
  const clickable = (event: BoardEvent) =>
    event.kind === "appointment" || event.kind === "task" || event.kind === "away" || ((event.kind === "rfq" || event.kind === "est" || event.kind === "prj") && !event.item.hidden);

  /** What overlaps on a day, named the way the list names the work. */
  const overlapText = (overlap: Overlap) =>
    fill(t("TeamBoard.overlapOn"), {
      work: overlap.work.map((item) => (item.hidden ? t("TeamBoard.hiddenWork") : [item.reference, item.title].filter(Boolean).join(" "))).join(" · "),
    });
  /** A chip's time, shown first (2026-11-10 mockup): when it starts; the whole range is in the tooltip. */
  const eventTime = (event: BoardEvent) =>
    event.kind === "appointment" || event.kind === "task"
      ? event.task.slot === "Time" && event.task.startTime
        ? event.task.startTime
        : ""
      : event.kind === "visit"
        ? event.visit.time || ""
        : event.kind === "outlook"
          ? event.event.allDay
            ? ""
            : event.event.start.slice(11, 16)
          : "";
  /** A chip's words after its time; its kind is the stripe on its left, its full text the tooltip. */
  const chipText = (event: BoardEvent) => {
    switch (event.kind) {
      case "rfq":
      case "est":
      case "prj": {
        // Work the reader cannot open shows its kind only.
        if (event.item.hidden) return t(event.kind === "rfq" ? "TeamBoard.chipRfq" : event.kind === "est" ? "TeamBoard.chipEst" : "TeamBoard.chipPrj");
        const what = event.kind === "prj" ? event.item.title : [event.item.reference, event.item.customer || event.item.title].filter(Boolean).join(" ");
        return event.late ? `${t("TeamBoard.late")} · ${what}` : what;
      }
      // ↻ marks a day of a repeat.
      case "appointment":
      case "task":
        return `${event.task.seriesId !== null ? "↻ " : ""}${event.task.title}`;
      case "away":
        return event.task.title;
      case "visit":
        return [t("TeamBoard.chipVisit"), event.visit.customer].filter(Boolean).join(" · ");
      case "leave":
        return t(event.away.kind);
      case "outlook":
        return `Outlook · ${event.event.subject ?? t("TeamBoard.outlookBusy")}`;
    }
  };
  /** Whether a chip is one of the pieces of work overlapping on its day. */
  const overlapping = (event: BoardEvent, overlap?: Overlap) =>
    Boolean(overlap) &&
    ("item" in event ? overlap!.work.some((work) => work.key === event.item.key) : "task" in event ? overlap!.work.some((work) => work.workKey === `TeamTask-${event.task.id}`) : false);
  const chipOf = (event: BoardEvent, overlap?: Overlap) => {
    const time = eventTime(event);
    const className = `board-chip ${event.kind}${event.late ? " late" : ""}${"task" in event && event.task.status === "Done" ? " done" : ""}`;
    const body = (
      <>
        {time ? <span className="board-chip-time">{time}</span> : null}
        <span className="board-chip-label">{chipText(event)}</span>
        {overlapping(event, overlap) ? (
          <span className="board-chip-warn" role="img" aria-label={t("TeamBoard.overlapTime")}>
            <Icon name="alertTriangle" />
          </span>
        ) : null}
      </>
    );
    return clickable(event) ? (
      <button key={event.key} type="button" className={className} title={eventTitle(event)} onClick={() => openEvent(event)}>
        {body}
      </button>
    ) : (
      <span key={event.key} className={className} title={eventTitle(event)}>
        {body}
      </span>
    );
  };
  /** Where a cell's figure comes from: a tick for confirmed hours, a dot for hours booked on My week, a ring for the plan. */
  const sourceMark = (source: PlannerDay["source"]) => (source === "confirmed" ? <Icon name="check" className="board-src confirmed" /> : <i className={`board-src ${source}`} aria-hidden="true" />);
  /** One line per piece of a person's work over the days on show: its hours each day, or "?" while it has no hours. */
  const workLines = (person: Person) =>
    person.work.map((item) => {
      const noHours = item.type === "Project" && !item.outsourced && !item.byDay && !(item.manDays !== null && item.manDays > 0);
      const total = days.reduce((sum, day) => sum + itemManDays(item, day.date, data?.holidays ?? []) * HOURS_PER_DAY, 0);
      const end = item.end ?? item.start;
      return (
        <tr key={`${person.userId}:${item.key}`} className={`board-work-line${noHours ? " no-hours" : ""}`}>
          <th scope="row" className="board-who">
            <span className="board-work-name">
              <strong>{item.hidden ? t("TeamBoard.hiddenWork") : [item.reference, item.title].filter(Boolean).join(" · ")}</strong>
              <small>
                {[
                  item.start === end ? shortDate(item.start) : `${shortDate(item.start)} – ${shortDate(end)}`,
                  item.outsourced
                    ? t("TeamBoard.outsourced")
                    : noHours
                      ? t("TeamBoard.dayNoHours")
                      : item.manDays !== null && item.manDays > 0
                        ? fill(t("TeamBoard.workHours"), { n: fmt(item.manDays * HOURS_PER_DAY) })
                        : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </th>
          <td className="board-week">{noHours || item.outsourced ? <span className="board-work-none">{t("TeamBoard.notCounted")}</span> : fill(t("TeamBoard.dayHours"), { n: fmt(total) })}</td>
          {days.map((day) => {
            const hours = itemManDays(item, day.date, data?.holidays ?? []) * HOURS_PER_DAY;
            const inside = item.start !== null && day.date >= item.start && day.date <= (end ?? item.start) && !day.weekend && !day.holiday;
            return (
              <td key={day.date} className={`board-work-cell${day.weekend ? " weekend" : ""}${day.holiday ? " holiday" : ""}`}>
                {hours > 0 ? fmt(hours) : noHours && inside ? <span className="board-work-none">?</span> : null}
              </td>
            );
          })}
        </tr>
      );
    });
  const cell = (person: Person, day: (typeof days)[number], index: number) => {
    const userId = person.userId,
      name = person.user.name;
    const overlap = person.overlapOn.get(day.date);
    const figure = person.days[index]!;
    const all = events.get(`${userId}|${day.date}`) ?? [];
    const shown = category ? all.filter((event) => categoryOf(event) === category) : all;
    // Away all day is hatched; half a day only takes its hours off what the day offers.
    const away = figure.away >= HOURS_PER_DAY || (figure.capacity === 0 && person.away(day.date));
    // More than the day offers: the cell turns red and its figure carries a warning.
    const over = figure.over;
    // Prefixed: a bare "empty" is the app-wide EmptyState box and would turn the cell into a flex column.
    const tone = `tone-${away ? "away" : day.holiday ? "holiday" : day.weekend ? "weekend" : over ? "over" : "blank"}`;
    const hours = fill(t("TeamBoard.dayHours"), { n: fmt(figure.hours) });
    const showFigure = figure.hours > 0 || (figure.source === "confirmed" && !day.weekend && !day.holiday);
    // The day open in the side column is outlined on the grid.
    const picked = dayOpen?.userId === userId && dayOpen.date === day.date;
    return (
      <td
        key={day.date}
        className={`board-cell ${tone}${day.today ? " today" : ""}${day.weekStart ? " week-start" : ""}${overlap ? " overlap" : ""}${figure.pending ? " pending" : ""}${picked ? " picked" : ""}`}
        title={[...(overlap ? [overlapText(overlap)] : []), ...(figure.pending ? [t("TeamWeek.unconfirmed")] : []), ...shown.map((event) => eventLabel(event))].join("\n") || undefined}
      >
        {overlap ? (
          <button
            type="button"
            className="board-overlap"
            data-guide="team.dayWork"
            onClick={() => setDayOpen({ userId, date: day.date })}
            aria-label={`${overlapText(overlap)} · ${t("TeamBoard.dayWorkOpen")}`}
            title={`${overlapText(overlap)} · ${t("TeamBoard.dayWorkOpen")}`}
          />
        ) : null}
        {showFigure ? (
          <button
            type="button"
            className={`board-md${over ? " over" : ""}`}
            data-guide="team.dayWork"
            onClick={() => setDayOpen({ userId, date: day.date })}
            title={t("TeamBoard.dayWorkOpen")}
            aria-label={[hours, t(SOURCE_LABEL[figure.source]), figure.pending ? t("TeamWeek.unconfirmed") : "", over ? t("TeamBoard.legendOver") : "", t("TeamBoard.dayWorkOpen")]
              .filter(Boolean)
              .join(" · ")}
          >
            {weeks === 4 ? fmt(figure.hours) : hours}
            {sourceMark(figure.source)}
            {over && weeks !== 4 ? <Icon name="alertTriangle" /> : null}
          </button>
        ) : null}
        {shown.slice(0, 2).map((event) => chipOf(event, overlap))}
        {shown.length > 2 ? (
          <button type="button" className="board-more" onClick={() => setDayOpen({ userId, date: day.date })} title={t("TeamBoard.dayWorkOpen")}>
            {fill(t("TeamBoard.moreInCell"), { n: shown.length - 2 })}
          </button>
        ) : null}
        {/* Last, so the keyboard reaches the day's work first; it covers the empty part of the cell. */}
        {canAssignOthers || userId === me ? (
          <button
            type="button"
            className="board-cell-add"
            onClick={() => setAdding({ assigneeId: userId, date: day.date })}
            aria-label={fill(t("TeamBoard.addFor"), { name, date: longDate(day.date) })}
          >
            <Icon name="plus" />
          </button>
        ) : null}
      </td>
    );
  };
  /** A person's hours over the days on show, beside their name: against what they can give, a flag when over or with room, and a bar. */
  const rangeLoad = (person: Person) => {
    const { total, capacity, flags, pendingDays } = person.hours;
    const use = capacity > 0 ? (total / capacity) * 100 : total > 0 ? Infinity : null;
    const flag = flags.over ? (
      <span className="board-week-flag over">
        <Icon name="alertTriangle" />
        {total > capacity ? fill(t("TeamBoard.hoursOver"), { n: fmt(total - capacity) }) : t("TeamBoard.dayOverShort")}
      </span>
    ) : flags.free ? (
      <span className="board-week-flag free">{fill(t("TeamBoard.hoursFree"), { n: fmt(capacity - total) })}</span>
    ) : null;
    // Green up to 60%, blue to 90%, amber to 100%, red over it or with a day over; the figures above say the same in words.
    const tone = use === null ? "slate" : flags.over ? "red" : use > 90 ? "amber" : use > 60 ? "blue" : "green";
    return (
      <>
        <span className="board-week-figures">
          <b>{fill(t("TeamBoard.hoursOf"), { planned: fmt(total), available: fmt(capacity) })}</b>
          {flag}
        </span>
        <span className="progress board-week-bar" role="img" aria-label={pct(use)}>
          <b className={tone} style={{ width: `${use === null ? 0 : Math.min(100, Math.max(0, use))}%` }} />
        </span>
        {pendingDays ? <small className="board-week-pending">{fill(t("TeamBoard.pendingDays"), { n: pendingDays })}</small> : null}
      </>
    );
  };

  /**
   * A person's day (owner request 2026-11-06), in the planner's side column (2026-11-23): the day's figure and where it
   * comes from, what they booked on My week, then every piece of work taking their time that day, including plan, RFQ
   * and estimate work that only shows on the grid on the day it falls due, then their site visits, leave and Outlook
   * meetings. Each opens its work, as a chip does.
   */
  const dayPanel = (open: { userId: number; date: string }) => {
    const person = personById.get(open.userId) ?? null;
    const index = days.findIndex((day) => day.date === open.date);
    const figure = person && index >= 0 ? (person.days[index] ?? null) : null;
    const bookedDay = weekDays.get(`${open.userId}|${open.date}`) ?? null;
    const pieces = dayWork(
      (data?.items ?? []).filter((item) => item.ownerId === open.userId),
      open.date,
      holidays,
    );
    // A day of a repeat (a daily meeting) loads the day but overlaps nothing, as on the grid.
    const overlapping = pieces.filter((piece) => !piece.rows.every((row) => row.item.repeat));
    const overlaps = (piece: (typeof pieces)[number]) => overlapping.length > 1 && overlapping.includes(piece);
    const others = (events.get(`${open.userId}|${open.date}`) ?? []).filter((event) => event.kind === "visit" || event.kind === "leave" || event.kind === "outlook" || event.kind === "away");
    const typeOf = (item: Commitment) => (item.type === "Task" ? (item.taskKind === "Appointment" ? "appointment" : "task") : itemCategory(item));
    const opener = (item: Commitment) => {
      if (item.type === "Task") {
        const task = data?.tasks.find((entry) => entry.id === item.entityId);
        return task ? () => setEditing(task) : null;
      }
      return item.hidden ? null : () => openItem(item);
    };
    const mayAdd = canAssignOthers || open.userId === me;
    return (
      <section className="panel planner-day" aria-labelledby={`${uid}-day`}>
        <div className="planner-side-head">
          <div>
            <h2 id={`${uid}-day`}>{person?.user.name ?? ""}</h2>
            <p>{longDate(open.date)}</p>
          </div>
          <button type="button" className="icon-btn" aria-label={t("TeamBoard.dayClose")} title={t("TeamBoard.dayClose")} onClick={() => setDayOpen(null)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="planner-side-body">
          {figure ? (
            <>
              <div className={`planner-day-figure${figure.over ? " over" : ""}`}>
                <strong>{fmt(figure.hours)}</strong>
                <span>{fill(t("TeamBoard.ofHours"), { n: fmt(figure.capacity) })}</span>
                <span className="planner-day-source">
                  {sourceMark(figure.source)}
                  {t(SOURCE_LABEL[figure.source])}
                </span>
              </div>
              <p className="muted small planner-day-note">{t(SOURCE_NOTE[figure.source])}</p>
              {figure.pending ? (
                <div className="callout warning" role="status">
                  {t("TeamBoard.dayPending")}
                </div>
              ) : null}
            </>
          ) : null}
          {bookedDay && bookedDay.booked > 0 ? (
            <>
              <h3 className="board-day-head">{t("TeamBoard.dayBooked")}</h3>
              <ul className="planner-day-booked">
                {bookedDay.chips.map((chip) => (
                  <li key={`${chip.kind}-${chip.label}`}>
                    <span>{CHIP_LABEL[chip.label] ? t(CHIP_LABEL[chip.label]!) : chip.label}</span>
                    <b>{fill(t("TeamBoard.dayHours"), { n: fmt(chip.hours) })}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {overlapping.length > 1 ? (
            <div className="callout warning board-day-warning" role="status">
              {fill(t("TeamBoard.dayOverlap"), { n: overlapping.length })}
            </div>
          ) : null}
          {pieces.length ? (
            <>
              <h3 className="board-day-head">{t("TeamBoard.dayWork")}</h3>
              <ul className="board-day-list">
                {pieces.map((piece) => (
                  <li key={piece.piece} className={`board-day-piece${overlaps(piece) ? " overlap" : ""}`}>
                    {piece.rows.map(({ item, perDay, noHours }) => {
                      const kind = typeOf(item),
                        action = opener(item);
                      const body = (
                        <>
                          <span className={`board-type ${kind}`}>{t(LIST_TYPES[kind])}</span>
                          <strong>{item.hidden ? t("TeamBoard.hiddenWork") : [item.reference, item.title].filter(Boolean).join(" · ")}</strong>
                          <small>
                            {[
                              item.customer,
                              item.start === (item.end ?? item.start) ? shortDate(item.start) : `${shortDate(item.start)} – ${shortDate(item.end)}`,
                              perDay !== null ? fill(t("TeamBoard.dayPerDay"), { n: fmt(perDay) }) : t(noHours ? "TeamBoard.dayNoHours" : "TeamBoard.dayNoEffort"),
                              item.end && item.end < today ? t("TeamBoard.late") : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </>
                      );
                      return action ? (
                        <button key={item.key} type="button" className="board-day-item" onClick={action}>
                          {body}
                        </button>
                      ) : (
                        <div key={item.key} className="board-day-item">
                          {body}
                        </div>
                      );
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {others.length ? (
            <>
              <h3 className="board-day-head">{t("TeamBoard.dayOther")}</h3>
              <ul className="board-day-list">
                {others.map((event) => (
                  <li key={event.key} className="board-day-piece">
                    {clickable(event) ? (
                      <button type="button" className="board-day-item" onClick={() => openEvent(event)}>
                        <strong>{eventLabel(event)}</strong>
                        <small>{eventTitle(event)}</small>
                      </button>
                    ) : (
                      <div className="board-day-item">
                        <strong>{eventLabel(event)}</strong>
                        <small>{eventTitle(event)}</small>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {!pieces.length && !others.length && !(bookedDay && bookedDay.booked > 0) ? <EmptyState icon="calendar" title="TeamBoard.dayEmpty" message="TeamBoard.dayEmptyHint" /> : null}
        </div>
        {mayAdd ? (
          <div className="planner-side-foot">
            <button type="button" className="btn primary sm" onClick={() => setAdding({ assigneeId: open.userId, date: open.date })}>
              <Icon name="plus" />
              {t("TeamBoard.dayAdd")}
            </button>
          </div>
        ) : null}
      </section>
    );
  };
  // Beside the table when no day is open: the plan rows waiting for people (the page's queue) and team tasks nobody has taken.
  const waitingTasks = [...unassignedTasks].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
  const sideQueue = (
    <>
      {queue}
      {waitingTasks.length ? (
        <section className="panel planner-waiting" aria-labelledby={`${uid}-waiting`}>
          <div className="planner-side-head">
            <div>
              <h2 id={`${uid}-waiting`}>{fill(t("TeamBoard.waitingTasks"), { n: waitingTasks.length })}</h2>
              <p>{t("TeamBoard.unassignedHint")}</p>
            </div>
          </div>
          <ul className="board-day-list planner-side-body">
            {waitingTasks.map((task) => (
              <li key={task.id} className="board-day-piece">
                <button type="button" className="board-day-item" onClick={() => setEditing(task)}>
                  <span className={`board-type ${task.kind === "Appointment" ? "appointment" : "task"}`}>{t(task.kind === "Appointment" ? "TeamBoard.listAppointment" : "TeamBoard.kindTask")}</span>
                  <strong>{task.title}</strong>
                  <small>
                    {[
                      task.customer,
                      task.startDate === task.endDate ? shortDate(task.startDate) : `${shortDate(task.startDate)} – ${shortDate(task.endDate)}`,
                      timeRange(task),
                      task.endDate < today ? t("TeamBoard.late") : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!queue && !waitingTasks.length ? <p className="muted planner-side-empty">{t("TeamBoard.waitingNone")}</p> : null}
    </>
  );

  // Under a person's bars: the days their work overlaps (amber) and the days it is more than they have (red).
  const personAlerts = (person: Person): GanttAlert[] => [
    ...dateRuns(
      person.overlaps.map((day) => day.date),
      holidays,
    ).map((run) => ({
      key: `overlap-${run.start}`,
      ...run,
      tone: "amber" as const,
      title: person.overlaps
        .filter((day) => day.date >= run.start && day.date <= run.finish)
        .map((day) => `${shortDate(day.date)} · ${overlapText(day)}`)
        .join("\n"),
    })),
    ...dateRuns(person.overDates, holidays).map((run) => ({
      key: `over-${run.start}`,
      ...run,
      tone: "red" as const,
      title: `${t("TeamBoard.legendOver")} · ${shortDate(run.start)}${run.finish !== run.start ? ` – ${shortDate(run.finish)}` : ""}`,
    })),
  ];
  // The Gantt: the same people and the same filtered work as the grid and the list.
  const ganttWork = (row: ListRow): GanttWork => ({
    key: row.key,
    label: (
      <>
        <span className={`board-type ${row.visit ? "visit" : row.category}`}>{t(rowTypeLabel(row))}</span> {rowTitle(row, t)}
      </>
    ),
    meta: [rowCustomer(row), rowTime(row)].filter(Boolean).join(" · "),
    title: `${rowTitle(row, t)} · ${row.start ?? "—"} → ${row.end ?? row.start ?? "—"}`,
    // A repeat is one row in the list: its bar runs until its last day.
    start: row.start,
    end: row.task?.repeat?.until ?? row.end ?? row.start,
    tone: rowTone(row),
    ...(row.task ? { onOpen: () => setEditing(row.task!) } : row.item && !row.item.hidden ? { onOpen: () => openItem(row.item!) } : {}),
  });
  const ganttPeople: GanttPerson[] = [
    ...(showUnassigned ? [{ key: "none", name: t("TeamBoard.unassignedRow"), meta: t("TeamBoard.unassigned"), work: listRows.filter((row) => row.task && !row.ownerIds.length).map(ganttWork) }] : []),
    ...gridPeople.map((person) => ({
      key: String(person.userId),
      name: person.user.name,
      meta: [
        person.user.department,
        fill(t("TeamBoard.hoursOf"), { planned: fmt(person.hours.total), available: fmt(person.hours.capacity) }),
        ...(person.overlaps.length ? [fill(t("TeamBoard.overlapDays"), { n: person.overlaps.length })] : []),
      ].join(" · "),
      work: listRows.filter((row) => row.ownerIds.includes(person.userId)).map(ganttWork),
      alerts: personAlerts(person),
    })),
  ];

  /** Copies what is on screen: the day grid as a grid, otherwise the filtered work as a list. Excel and chats take the text; Outlook and Teams the table. */
  const copyTable = async () => {
    if (!data) return;
    const rows: unknown[][] =
      mode === "board" && boardView === "grid"
        ? [
            [t("TeamBoard.person"), t("TeamBoard.team"), ...days.map((day) => longDate(day.date))],
            ...gridPeople.map((person) => [
              person.user.name,
              person.user.department,
              ...days.map((day, index) => {
                const figure = person.days[index];
                const shown = (events.get(`${person.userId}|${day.date}`) ?? []).filter((event) => !category || categoryOf(event) === category);
                return [day.holiday ? t("TeamBoard.holiday") : figure && figure.hours ? fill(t("TeamBoard.dayHours"), { n: fmt(figure.hours) }) : "", ...shown.map(eventLabel)]
                  .filter(Boolean)
                  .join(" · ");
              }),
            ]),
          ]
        : [
            [
              t("TeamBoard.kind"),
              t("TeamBoard.colWork"),
              t("TeamBoard.colCustomer"),
              t("TeamBoard.assignee"),
              t("TeamBoard.colStart"),
              t("TeamBoard.colDue"),
              t("TeamBoard.colTime"),
              t("TeamBoard.colEffort"),
              t("TeamBoard.status"),
            ],
            ...listRows.map((row) => [
              t(rowTypeLabel(row)),
              rowTitle(row, t),
              rowCustomer(row),
              row.ownerIds.map((id) => nameOf.get(id) ?? `#${id}`).join(", ") || t("TeamBoard.unassigned"),
              row.start ?? "",
              row.end ?? "",
              rowTime(row),
              row.manDays ?? "",
              rowStatus(row, t),
            ]),
          ];
    try {
      const text = tableTsv(rows);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write)
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([tableHtml(rows)], { type: "text/html" }) })]);
      else await navigator.clipboard.writeText(text);
      notify(fill(t("TeamBoard.copied"), { n: rows.length - 1 }));
    } catch {
      notify(t("TeamBoard.copyFailed"));
    }
  };
  // How the last read of everyone's Outlook went, in words.
  const outlookSync = data?.outlookSync;
  const syncedAt = outlookSync?.syncedAt ? new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "short", timeStyle: "short" }).format(new Date(outlookSync.syncedAt)) : "";
  const outlookStatusText = !outlookSync
    ? ""
    : outlookSync.state === "denied"
      ? t("TeamBoard.outlookDenied")
      : outlookSync.state === "error"
        ? `${t("TeamBoard.outlookError")} ${outlookSync.message}`
        : outlookSync.state === "partial"
          ? fill(t("TeamBoard.outlookPartial"), { n: outlookSync.failed, when: syncedAt })
          : outlookSync.state === "running"
            ? t("TeamBoard.outlookSyncing")
            : syncedAt
              ? fill(t("TeamBoard.outlookSynced"), { when: syncedAt })
              : t("TeamBoard.outlookNever");
  const syncOutlook = async () => {
    setSyncing(true);
    try {
      const result = await syncOutlookCalendars();
      notify(
        result.state === "ok"
          ? fill(t("TeamBoard.outlookDone"), { n: result.people })
          : result.state === "denied"
            ? t("TeamBoard.outlookDenied")
            : result.state === "partial"
              ? fill(t("TeamBoard.outlookPartial"), { n: result.failed, when: "" })
              : `${t("TeamBoard.outlookError")} ${result.message}`,
      );
      await Promise.all([load(), loadBooked()]);
    } catch (failure) {
      notify(errorText(failure));
    } finally {
      setSyncing(false);
    }
  };
  /** A task to save again as a new one: everything filled in, to change the date or the people. */
  const copyTask = (task: TeamTask) => {
    setEditing(null);
    setAdding({ assigneeId: null, date: task.startDate, copy: task });
  };

  const groups = new Map<string, Person[]>();
  for (const person of gridPeople) groups.set(person.user.department || "—", [...(groups.get(person.user.department || "—") ?? []), person]);
  for (const members of groups.values()) members.sort(byLoad);
  const toggleFold = (group: string) => setFolded(folded.includes(group) ? folded.filter((name) => name !== group) : [...folded, group]);
  const personName = personId === null ? "" : (nameOf.get(personId) ?? "");
  const chip = (key: string, label: string, value: number, active: boolean, onPick: () => void, tone = "", colour?: string) => (
    <button key={key} type="button" className={`board-filter ${tone}${active ? " on" : ""}`} aria-pressed={active} onClick={onPick}>
      {colour ? <i style={{ background: colour }} aria-hidden="true" /> : null}
      {t(label)} <b>{value}</b>
    </button>
  );

  // Outlook and Add beside the page title when the page gives them a place, copy and refresh under More (2026-11-23).
  const closeMenu = (event: { currentTarget: HTMLElement }) => event.currentTarget.closest("details")?.removeAttribute("open");
  const actions = (
    <>
      <details className="team-more board-more-actions">
        <summary className="btn default">
          <Icon name="more" />
          {t("TeamBoard.moreActions")}
          <Icon name="chevronDown" />
        </summary>
        <div className="team-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={!data}
            onClick={(event) => {
              closeMenu(event);
              void copyTable();
            }}
            title={t("TeamBoard.copyTableHint")}
          >
            <Icon name="copy" />
            {t("TeamBoard.copyTable")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={(event) => {
              closeMenu(event);
              refresh();
            }}
          >
            <Icon name="refresh" />
            {t("Refresh")}
          </button>
        </div>
      </details>
      {data?.outlookSync && data.outlookSync.state !== "disabled" ? (
        <button type="button" className="btn default" disabled={syncing || data.outlookSync.state === "running"} onClick={() => void syncOutlook()} title={outlookStatusText}>
          <Icon name="calendar" />
          {syncing || data.outlookSync.state === "running" ? t("TeamBoard.outlookSyncing") : t("TeamBoard.outlookSync")}
        </button>
      ) : null}
      <button type="button" className="btn primary" data-guide="team.add" onClick={() => setAdding({ assigneeId: canAssignOthers ? null : me, date: today })}>
        <Icon name="plus" />
        {t("TeamBoard.add")}
      </button>
    </>
  );
  // The one person the board shows, from a name on the grid or a link; it clears with its ×.
  const personChip = (
    <button type="button" className="board-filter on" onClick={() => setPersonId(null)}>
      {fill(t("TeamBoard.personFilter"), { name: personName })} <Icon name="x" />
      <span className="sr-only">{t("TeamBoard.clearPerson")}</span>
    </button>
  );
  const searchBox = (
    <SearchInput
      value={search}
      onChange={(value) => {
        setSearch(value);
        setListShown(LIST_PAGE);
      }}
      placeholder={mode === "board" ? "TeamBoard.searchPeople" : "TeamBoard.searchWork"}
    />
  );

  return (
    <div className="team-board" ref={boardRef}>
      {actionsSlot === undefined ? <div className="board-actions-row">{actions}</div> : actionsSlot ? createPortal(actions, actionsSlot) : null}

      {/* Once per person: the daily grid moved here (owner decision 2026-11-23). */}
      {mode === "board" && notice ? (
        <div className="planner-notice" role="status">
          <Icon name="alertCircle" />
          <span>{t("TeamBoard.plannerNotice")}</span>
          {weeks === 1 ? (
            <button
              type="button"
              className="btn default sm"
              onClick={() => {
                setWeeks(2);
                dismissNotice();
              }}
            >
              {t("TeamBoard.plannerNoticeTwo")}
            </button>
          ) : null}
          <button type="button" className="btn ghost sm" onClick={dismissNotice}>
            {t("TeamBoard.plannerNoticeOk")}
          </button>
        </div>
      ) : null}

      {/* Stays at the top of the page while the board scrolls (2026-11-10 mockup). Team planner keeps it to one row (owner,
          2026-11-23): the period and how much of it, the view, then the teams, the kind of work and the search. */}
      <div className={`board-toolbar board-sticky${mode === "board" ? " planner-toolbar" : ""}`} ref={toolbarRef}>
        {mode === "board" ? (
          <>
            {boardView === "grid" ? (
              <div className="board-window" role="group" aria-label={t("TeamBoard.window")}>
                <button type="button" className="icon-btn" aria-label={t("Previous period")} title={t("Previous period")} onClick={() => setStart(dateFromDay(dayNumber(start) - weeks * 7))}>
                  <Icon name="chevronLeft" />
                </button>
                <span className="board-range">
                  {shortDate(days[0]?.date ?? start)} – {yearDate(days.at(-1)?.date ?? start)}
                </span>
                <button type="button" className="icon-btn" aria-label={t("Next period")} title={t("Next period")} onClick={() => setStart(dateFromDay(dayNumber(start) + weeks * 7))}>
                  <Icon name="chevronRight" />
                </button>
                <button type="button" className="btn default sm" onClick={() => setStart(mondayOf(today))}>
                  {t("Today")}
                </button>
                <div className="seg-control board-seg" data-guide="team.range">
                  {([1, 2, 4] as const).map((count) => (
                    <button key={count} type="button" className={weeks === count ? "on" : undefined} aria-pressed={weeks === count} onClick={() => setWeeks(count)}>
                      {t(count === 1 ? "TeamBoard.oneWeek" : count === 2 ? "TeamBoard.twoWeeks" : "TeamBoard.fourWeeks")}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="seg-control board-seg" role="group" aria-label={t("TeamBoard.view")}>
              <button type="button" className={boardView === "grid" ? "on" : undefined} aria-pressed={boardView === "grid"} onClick={() => pickView("grid")}>
                {t("TeamBoard.viewGrid")}
              </button>
              <button type="button" className={boardView === "gantt" ? "on" : undefined} aria-pressed={boardView === "gantt"} onClick={() => pickView("gantt")}>
                {t("TeamBoard.viewGantt")}
              </button>
            </div>
            <div className="planner-toolbar-end">
              {personId !== null ? personChip : null}
              <TeamFilter departments={departments} counts={teamCounts} value={teams} onChange={pickTeams} />
              <KindPick value={category} onChange={pickCategory} />
              {searchBox}
            </div>
          </>
        ) : (
          <>
            {/* The list: the teams and the search on one row, the chips on their own. */}
            <TeamFilter departments={departments} counts={teamCounts} value={teams} onChange={pickTeams} />
            {searchBox}
            <div className="board-filters own-row" role="group" aria-label={t("TeamBoard.chips")} data-guide="team.filters">
              {chip("all", "TeamBoard.all", counts.all, category === null && listAttention === null, () => {
                pickCategory(null);
                pickAttention(null);
              })}
              {CATEGORIES.map(({ key, label, colour }) => chip(key, label, counts[key], category === key, () => pickCategory(category === key ? null : key), "", colour))}
              <span className="board-sep" aria-hidden="true" />
              {chip("late", "TeamBoard.late", counts.late, listAttention === "late", () => pickAttention(listAttention === "late" ? null : "late"), "red")}
              {chip("unassigned", "TeamBoard.unassigned", counts.unassigned, listAttention === "unassigned", () => pickAttention(listAttention === "unassigned" ? null : "unassigned"), "amber")}
              {chip("over", "TeamBoard.over", counts.over, listAttention === "over", () => pickAttention(listAttention === "over" ? null : "over"), "amber")}
              {chip("overlap", "TeamBoard.overlap", counts.overlap, listAttention === "overlap", () => pickAttention(listAttention === "overlap" ? null : "overlap"), "amber")}
              {personId !== null ? personChip : null}
            </div>
          </>
        )}
      </div>

      {/* Team planner's summary bar (owner decision 2026-11-23): each figure is the filter it counts. */}
      {data && mode === "board" ? (
        <div className="board-sum planner-sum" role="group" aria-label={t("TeamBoard.sumLabel")} data-guide="teamweek.chips">
          {SUMMARY.map(({ key, label, tone }) => {
            const value = key === "unassigned" ? queueCount + unassignedTasks.length : plannerCount(key);
            const on = attention === key;
            return (
              <button key={key} type="button" className={`board-sum-item planner-sum-item${on ? " on" : ""}`} aria-pressed={on} onClick={() => pickAttention(on ? null : key)}>
                <span className="board-sum-label">
                  <i className={tone} aria-hidden="true" />
                  {t(label)}
                </span>
                <span className={`board-sum-value${value ? ` ${tone}` : " none"}`}>
                  {value}
                  <small>{t(key === "unassigned" ? "TeamBoard.sumWorkUnit" : "TeamBoard.sumPeopleUnit")}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div className="callout danger" role="alert">
          {error}{" "}
          <button type="button" className="btn ghost sm" onClick={refresh}>
            {t("Refresh")}
          </button>
        </div>
      ) : null}
      {mode === "board" && bookedNow && !bookedNow.data ? (
        <div className="callout warning" role="status">
          {t("TeamBoard.bookedFailed")}
        </div>
      ) : null}
      {data?.warnings.length ? (
        <div className="callout warning" role="status">
          {t("Workload.schedulesSkipped")}: {data.warnings.join(", ")}
        </div>
      ) : null}
      {data?.outlookSync && ["denied", "error", "partial"].includes(data.outlookSync.state) ? (
        <div className="callout warning" role="status">
          {outlookStatusText}
        </div>
      ) : null}

      {!data ? (
        <div className="panel">
          <div className="empty">
            {loading ? (
              <>
                <span className="spinner" />
                {t("Loading from SQL Server…")}
              </>
            ) : null}
          </div>
        </div>
      ) : mode === "board" ? (
        <div className="planner-body">
          <div className="planner-main">
            {boardView === "gantt" ? (
              <section className="panel board-panel">
                <TeamBoardGantt people={ganttPeople} today={today} />
              </section>
            ) : (
              <section className="panel board-panel" aria-labelledby={`${uid}-board`} data-guide="teamweek.table">
                <div className="panel-head board-panel-head">
                  <div>
                    <h2 id={`${uid}-board`}>{t("TeamBoard.person")}</h2>
                    <p>{t("TeamBoard.plannerSub")}</p>
                  </div>
                  <div className="panel-actions board-panel-legend">
                    {(["confirmed", "booked", "plan"] as const).map((source) => (
                      <span key={source}>
                        {sourceMark(source)}
                        {t(SOURCE_LABEL[source])}
                      </span>
                    ))}
                    <span>
                      <i className="pending" aria-hidden="true" />
                      {t("TeamWeek.unconfirmed")}
                    </span>
                    <span>
                      <i className="over" aria-hidden="true" />
                      {t("TeamBoard.legendDayOver")}
                    </span>
                  </div>
                </div>
                <div className="board-scroll">
                  <table className={`board-grid weeks-${weeks}`} style={{ minWidth: 350 + days.reduce((sum, day) => sum + DAY_WIDTH[weeks][day.weekend ? 1 : 0], 0) }}>
                    <colgroup>
                      <col className="board-who-col" />
                      <col className="board-week-col" />
                      {days.map((day) => (
                        <col key={day.date} className={day.weekend ? "weekend" : undefined} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className="board-who">
                          {t("TeamBoard.colMember")}
                        </th>
                        <th scope="col" className="board-week">
                          {t("TeamBoard.colLoad")}
                        </th>
                        {days.map((day) => (
                          <th
                            key={day.date}
                            scope="col"
                            className={`board-day${day.today ? " today" : ""}${day.holiday ? " holiday" : ""}${day.weekend ? " weekend" : ""}${day.weekStart ? " week-start" : ""}`}
                          >
                            <b>
                              {weekdayOf(day.date, weeks === 4 && day.weekend)}
                              {day.today ? <em>{t("TeamBoard.today")}</em> : day.holiday ? <em>{t("TeamBoard.holiday")}</em> : null}
                            </b>
                            <span>{weeks === 4 && day.weekend ? dayOnly(day.date) : shortDate(day.date)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...groups].map(([group, members]) => (
                        <GroupRows key={group} label={`${group} · ${members.length}`} span={days.length + 2} pinned open={!folded.includes(group)} onToggle={() => toggleFold(group)}>
                          {members.map((person) => (
                            <Fragment key={person.userId}>
                              <tr className={opened.has(person.userId) ? "board-row-open" : undefined}>
                                <th scope="row" className="board-who">
                                  {person.work.length ? (
                                    <button
                                      type="button"
                                      className={`board-row-toggle${opened.has(person.userId) ? " open" : ""}`}
                                      aria-expanded={opened.has(person.userId)}
                                      aria-label={fill(t(opened.has(person.userId) ? "TeamBoard.workClose" : "TeamBoard.workOpen"), { name: person.user.name })}
                                      title={fill(t(opened.has(person.userId) ? "TeamBoard.workClose" : "TeamBoard.workOpen"), { name: person.user.name })}
                                      data-guide="teamweek.workOpen"
                                      onClick={() => toggleOpened(person.userId)}
                                    >
                                      <Icon name="chevronRight" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="board-person"
                                    onClick={() => {
                                      setPersonId(person.userId);
                                      onMode("list");
                                    }}
                                  >
                                    <span className="board-avatar" aria-hidden="true">
                                      {initials(person.user.name)}
                                    </span>
                                    <span>
                                      <strong>{person.user.name}</strong>
                                      <small className="board-person-meta">{[person.user.department, person.user.role].filter(Boolean).join(" · ")}</small>
                                      {person.awayDays ? <small>{fill(t("TeamBoard.awayDays"), { n: person.awayDays })}</small> : null}
                                      {person.overlapOn.size ? <small className="board-overlap-note">{fill(t("TeamBoard.overlapDays"), { n: person.overlapOn.size })}</small> : null}
                                    </span>
                                  </button>
                                </th>
                                <td className="board-week">{rangeLoad(person)}</td>
                                {days.map((day, index) => cell(person, day, index))}
                              </tr>
                              {opened.has(person.userId) ? workLines(person) : null}
                            </Fragment>
                          ))}
                        </GroupRows>
                      ))}
                      {!gridPeople.length ? (
                        <tr>
                          <td colSpan={days.length + 2}>
                            <EmptyState icon="users" title="Nobody matches the filter" message="Clear the department or search filter to see the team again." />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="board-legend">
                  <span>{fill(t("TeamBoard.shownPeople"), { n: gridPeople.length })}</span>
                  <span>
                    <i className="overlap" />
                    {t("TeamBoard.legendOverlap")}
                  </span>
                  <span>
                    <i className="away" />
                    {t("TeamBoard.legendAway")}
                  </span>
                  <span>
                    <i className="outlook" />
                    {t("TeamBoard.legendOutlook")}
                  </span>
                  <span className="muted">{t("TeamBoard.legendHint")}</span>
                </div>
              </section>
            )}
          </div>
          {/* Beside the table: the day opened from the grid, otherwise the work waiting for people. */}
          <aside className={`planner-side${attention === "unassigned" ? " on" : ""}`} ref={sideRef} aria-label={t("TeamBoard.sideLabel")}>
            {dayOpen && dayOpen.userId !== null ? dayPanel({ userId: dayOpen.userId, date: dayOpen.date }) : sideQueue}
          </aside>
        </div>
      ) : (
        <WorkList
          rows={listRows}
          shown={listShown}
          onMore={() => setListShown((n) => n + LIST_PAGE)}
          today={today}
          bootstrap={bootstrap}
          nameOf={nameOf}
          shortDate={shortDate}
          lateDays={lateDays}
          canChange={canChange}
          assignable={assignable}
          onUpdate={update}
          onEdit={setEditing}
          onCopy={copyTask}
          openItem={openItem}
          onExpand={(draft) => setAdding({ assigneeId: null, date: draft.startDate || today, draft })}
        />
      )}
      <p className="workload-method">{t(mode === "board" ? "TeamBoard.plannerMethod" : "TeamBoard.method")}</p>

      {adding ? (
        <AddTaskModal
          preset={adding}
          copyFrom={adding.copy ?? null}
          initial={adding.draft ?? null}
          assignable={assignable}
          bootstrap={bootstrap}
          people={people}
          personById={personById}
          days={days}
          holidays={holidays}
          longDate={longDate}
          onClose={() => setAdding(null)}
          onSave={async (input) => {
            await create(input);
            setAdding(null);
          }}
        />
      ) : null}
      {editing ? (
        <TaskDrawer
          task={editing}
          bootstrap={bootstrap}
          people={people}
          personById={personById}
          days={days}
          holidays={holidays}
          longDate={longDate}
          canChange={canChange(editing)}
          assignable={assignable}
          onClose={() => setEditing(null)}
          // Saved, or someone else's change won and the board was reloaded: either way this copy is done.
          onSave={async (input, scope) => {
            await update(editing, input, "Saved", scope);
            setEditing(null);
          }}
          onDelete={async (scope) => {
            await remove(editing, scope);
            setEditing(null);
          }}
          onCopy={() => copyTask(editing)}
        />
      ) : null}
    </div>
  );
}

/** Closes a menu built on <details> when the pointer goes down outside it or Escape is pressed. */
function useDismiss(menu: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !element.contains(event.target as Node)) element.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
}

/**
 * The teams with each one's head count, in a menu (owner, 2026-11-23: the team names are long and a row of them
 * crowded the toolbar). Several can be ticked at once; none ticked, or "All teams", is everyone.
 */
function TeamFilter({ departments, counts, value, onChange }: { departments: string[]; counts: Map<string, number>; value: string[]; onChange: (teams: string[]) => void }) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(menu);
  const everyone = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const toggle = (team: string) => onChange(value.includes(team) ? value.filter((name) => name !== team) : departments.filter((name) => name === team || value.includes(name)));
  const shown = !value.length ? t("TeamBoard.allTeams") : value.length === 1 ? value[0]! : fill(t("TeamBoard.teamsPicked"), { n: value.length });
  return (
    <details className={`board-pick${value.length ? " on" : ""}`} ref={menu}>
      <summary className="btn default sm" title={value.join(", ") || undefined}>
        <span className="board-pick-name">{t("TeamBoard.team")}</span>
        <span className="board-pick-value">{shown}</span>
        <Icon name="chevronDown" />
      </summary>
      <div className="board-pick-menu" role="group" aria-label={t("TeamBoard.team")}>
        <label className="board-pick-option">
          <input type="checkbox" checked={!value.length} onChange={() => onChange([])} />
          <span>{t("TeamBoard.allTeams")}</span>
          <span className="cnt">{everyone}</span>
        </label>
        {departments.map((name) => (
          <label key={name} className="board-pick-option">
            <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} />
            <span>{name}</span>
            <span className="cnt">{counts.get(name) ?? 0}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

/** Team planner: the kind of work its cells show, all or one, in a menu; the list keeps its chips with their counts. */
function KindPick({ value, onChange }: { value: Category | null; onChange: (next: Category | null) => void }) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(menu);
  const pick = (next: Category | null) => {
    onChange(next);
    if (menu.current) menu.current.open = false;
  };
  const current = CATEGORIES.find((entry) => entry.key === value);
  return (
    <details className={`board-pick${value ? " on" : ""}`} ref={menu} data-guide="team.filters">
      <summary className="btn default sm">
        <span className="board-pick-name">{t("TeamBoard.kindPick")}</span>
        <span className="board-pick-value">{t(current ? current.label : "TeamBoard.all")}</span>
        <Icon name="chevronDown" />
      </summary>
      <div className="board-pick-menu" role="menu" aria-label={t("TeamBoard.kindPick")}>
        {[null, ...CATEGORIES.map((entry) => entry.key)].map((key) => {
          const entry = CATEGORIES.find((item) => item.key === key);
          return (
            <button key={key ?? "all"} type="button" role="menuitemradio" aria-checked={value === key} className="board-pick-option" onClick={() => pick(key)}>
              <i style={{ background: entry?.colour ?? "transparent" }} aria-hidden="true" />
              <span>{t(entry ? entry.label : "TeamBoard.all")}</span>
              {value === key ? <Icon name="check" /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

/**
 * A band naming the rows under it. `pinned` (the day grid): the name sits over the two pinned columns and stays in sight;
 * with `onToggle` the name folds the team's rows away and back (Team planner, 2026-11-23).
 */
function GroupRows({ label, span, pinned = false, open = true, onToggle, children }: { label: string; span: number; pinned?: boolean; open?: boolean; onToggle?: () => void; children: ReactNode }) {
  return (
    <>
      {pinned ? (
        <tr className="board-group">
          <th colSpan={2} scope="colgroup">
            {onToggle ? (
              <button type="button" className={`board-group-toggle${open ? " open" : ""}`} aria-expanded={open} onClick={onToggle}>
                <Icon name="chevronRight" />
                {label}
              </button>
            ) : (
              label
            )}
          </th>
          <td colSpan={span - 2} />
        </tr>
      ) : (
        <tr className="board-group">
          <th colSpan={span} scope="colgroup">
            {label}
          </th>
        </tr>
      )}
      {open ? children : null}
    </>
  );
}

const useSearchCopy = () => {
  const { t } = useLanguage();
  return { noMatchText: t("CRM.noMatch"), clearLabel: t("CRM.clearChoice"), showLabel: t("CRM.showList"), moreText: t("CRM.listCut") };
};
const peopleOptions = (team: BootstrapData["team"]): SearchSelectOption[] =>
  team.map((user) => ({ value: String(user.id), label: user.name, detail: user.department, searchText: `${user.nickname} ${user.email}` }));
const customerOptions = (customers: BootstrapData["customers"]): SearchSelectOption[] =>
  customers.map((customer) => ({ value: String(customer.id), label: customer.name, detail: customer.code, searchText: `${customer.nameTh} ${customer.nameEn} ${customer.nameJa}` }));

type FormContext = {
  bootstrap: BootstrapData;
  people: Person[];
  personById: Map<number, Person>;
  days: { date: string }[];
  holidays: readonly string[];
  longDate: (date: string) => string;
  /** Who this reader may put on a task: null for anyone (Admin, Leader, a manager), otherwise themselves. */
  assignable: number[] | null;
};
/** An Outlook event's time on the board ("09:00–10:30"); empty for an all-day one. */
const outlookTime = (event: OutlookEvent) => (event.allDay ? "" : `${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`);

/**
 * The projects and RFQs work can be for, read once a form opens; each lists only what the reader may open.
 * Closed projects are read on their own and listed after the open ones, marked closed, so support work for a
 * finished customer project can still be logged (SUP-2026-00017) without recent open projects crowding them out.
 */
function useWorkOptions(bootstrap: BootstrapData, enabled: boolean) {
  const { t } = useLanguage();
  const closedMark = t("TeamBoard.projectClosed");
  const canInquiries = bootstrap.permissions.includes("inquiry.read"),
    canProjects = bootstrap.permissions.includes("project.read");
  const [inquiries, setInquiries] = useState<(SearchSelectOption & { customerId: number })[]>([]);
  const [projects, setProjects] = useState<(SearchSelectOption & { customerId: number })[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      if (canInquiries)
        void listInquiries({ pageSize: 100 }).then(
          (page) =>
            setInquiries(
              page.items
                .filter((inquiry) => inquiry.status !== "Cancelled")
                .map((inquiry) => ({ value: String(inquiry.id), label: `${inquiry.number} · ${inquiry.projectName}`, detail: inquiry.customerName, customerId: inquiry.customerId })),
            ),
          () => undefined,
        );
      if (canProjects)
        void Promise.all([listProjects({ pageSize: 100 }), listProjects({ pageSize: 100, status: "Closed" }).catch(() => null)]).then(
          ([page, closed]) =>
            setProjects(
              [...page.items.filter((project) => project.status !== "Closed"), ...(closed?.items ?? [])].map((project) => ({
                value: String(project.id),
                label: `${project.number} · ${project.name}${project.status === "Closed" ? ` (${closedMark})` : ""}`,
                detail: project.customerName,
                customerId: project.customerId ?? 0,
              })),
            ),
          () => undefined,
        );
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled, canInquiries, canProjects, closedMark]);
  return { inquiries, projects, canInquiries, canProjects };
}

/** The fields a team task shares between adding and changing it, with the chosen person's load on its first day. */
function TaskFields({
  draft,
  set,
  context,
  disabled = false,
  focusSubject = false,
  original = null,
  repeating = false,
}: {
  draft: Draft;
  set: (draft: Draft) => void;
  context: FormContext;
  disabled?: boolean;
  focusSubject?: boolean;
  /** The task as saved, when changing one: its own share is already in the load and is not counted twice. */
  original?: TeamTask | null;
  /** Whether this save sets the repeat: a new task, a task that happens once, or a repeat from this day on. */
  repeating?: boolean;
}) {
  const { t, lang } = useLanguage();
  const copy = useSearchCopy();
  const { bootstrap, people, personById, days, holidays, longDate, assignable } = context;
  const work = useWorkOptions(bootstrap, draft.kind !== "Away");
  // A linked RFQ or project the lists do not hold still shows by its number.
  const withCurrent = (options: SearchSelectOption[], id: number | null | undefined, number: string | undefined) =>
    !id || options.some((option) => option.value === String(id)) ? options : [{ value: String(id), label: number || `#${id}` }, ...options];
  // Picking the work fills the customer when none is chosen yet.
  const pickWork = (field: "projectId" | "inquiryId", value: string, options: { value: string; customerId: number }[]) => {
    const customer = options.find((option) => option.value === value)?.customerId;
    set({ ...draft, [field]: value, customerId: draft.customerId || (customer ? String(customer) : "") });
  };
  // Someone on the phone types the subject first; after the dialog has put focus on its close button.
  const subject = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusSubject) return;
    const timer = setTimeout(() => subject.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [focusSubject]);
  // Someone who may not assign others sees only themselves, and anyone already on the task.
  const personOptions = useMemo<PickerOption[]>(
    () =>
      bootstrap.team
        .filter((user) => assignable === null || assignable.includes(user.id) || Boolean(original?.assigneeIds.includes(user.id)))
        .map((user) => ({ id: user.id, label: user.name, detail: user.department, searchText: `${user.nickname} ${user.email}` })),
    [bootstrap.team, assignable, original],
  );
  const customers = useMemo(() => customerOptions(bootstrap.customers), [bootstrap.customers]);
  const auto = defaultTaskManDays(draft.startDate, draft.endDate || draft.startDate, draft.slot, holidays, draft.startTime, draft.endTime);
  const manDays = draft.manDays.trim() === "" ? auto : Number(draft.manDays) || 0;
  const span = draft.startDate ? workingDays(draft.startDate, draft.endDate || draft.startDate, holidays).length || 1 : 1;
  // Each person chosen, with their load on the first day before and after this task (each spends its man-days).
  const ownShare = (userId: number) =>
    original && original.status === "Planned" && original.kind !== "Away" && original.assigneeIds.includes(userId) && covers(original.startDate, original.endDate, draft.startDate)
      ? original.manDays / (workingDays(original.startDate, original.endDate, holidays).length || 1)
      : 0;
  const loads = draft.assigneeIds
    .map((id) => personById.get(id))
    .filter((person): person is Person => Boolean(person))
    .map((person) => {
      const saved = person.load.find((entry) => entry.date === draft.startDate);
      // Without this task as saved: the load it would have otherwise.
      const day = saved && { ...saved, manDays: Math.max(0, saved.manDays - ownShare(person.userId)) };
      return { person, now: withExtra(day, 0), after: withExtra(day, manDays / span), away: person.away(draft.startDate), off: saved?.available === 0 };
    });
  const shown = days.some((entry) => entry.date === draft.startDate);
  const worst = loads.filter((load) => !load.away && !load.off && load.after !== null && load.after > 100).sort((a, b) => (b.after ?? 0) - (a.after ?? 0))[0];
  const highest = Math.max(0, ...loads.filter((load) => !load.away && !load.off).map((load) => load.after ?? 0));
  // Their own team first; someone from another team only if they do planned work at all (not, say, a salesperson).
  const freer =
    worst && assignable === null
      ? freestOn(
          people.filter((entry) => !draft.assigneeIds.includes(entry.userId) && (entry.user.department === worst.person.user.department || entry.load.some((load) => load.manDays > 0))),
          draft.startDate,
          3,
          (entry) => entry.user.department === worst.person.user.department,
        )
      : [];
  const swap = (from: number, to: number) => set({ ...draft, assigneeIds: draft.assigneeIds.map((id) => (id === from ? to : id)) });
  const kinds: { kind: TeamTaskKind; label: string }[] = [
    { kind: "Appointment", label: "TeamBoard.kindAppointment" },
    { kind: "Task", label: "TeamBoard.kindTask" },
    { kind: "Away", label: "TeamBoard.kindAway" },
  ];
  const slots: { slot: TeamTaskSlot; label: string }[] = [
    { slot: "Day", label: "TeamBoard.slotDay" },
    { slot: "AM", label: "TeamBoard.slotAm" },
    { slot: "PM", label: "TeamBoard.slotPm" },
    { slot: "Time", label: "TeamBoard.slotTime" },
  ];
  return (
    <div className="board-form">
      <div className="chip-select" role="group" aria-label={t("TeamBoard.kind")} data-guide="team.kind">
        {kinds.map(({ kind, label }) => (
          <button key={kind} type="button" disabled={disabled} className={draft.kind === kind ? "chip on" : "chip"} aria-pressed={draft.kind === kind} onClick={() => set({ ...draft, kind })}>
            {t(label)}
          </button>
        ))}
      </div>
      <label className="field" data-guide="team.subject">
        <span>
          {t("TeamBoard.subject")} <b className="board-req">*</b>
        </span>
        <input
          ref={subject}
          required
          maxLength={300}
          disabled={disabled}
          value={draft.title}
          placeholder={t("TeamBoard.subjectPlaceholder")}
          onChange={(event) => set({ ...draft, title: event.target.value })}
        />
      </label>
      {draft.kind !== "Away" ? (
        <div className="field board-work-for">
          <span>
            {t("TeamBoard.workFor")} <b className="board-req">*</b>
          </span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.workFor")}>
            {(
              [
                ["project", "TeamBoard.workProject", work.canProjects],
                ["inquiry", "TeamBoard.workInquiry", work.canInquiries],
                ["other", "TeamBoard.workOther", true],
              ] as const
            ).map(([type, label, allowed]) => (
              <button
                key={type}
                type="button"
                disabled={disabled || !allowed}
                className={draft.workType === type ? "chip on" : "chip"}
                aria-pressed={draft.workType === type}
                onClick={() => set({ ...draft, workType: type })}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {draft.workType === "project" ? (
            <SearchSelect
              value={draft.projectId}
              options={withCurrent(work.projects, original?.projectId, original?.projectNo)}
              onChange={(value) => pickWork("projectId", value, work.projects)}
              label={t("TeamBoard.linkProject")}
              placeholder={t("TeamBoard.searchProject")}
              disabled={disabled}
              {...copy}
            />
          ) : draft.workType === "inquiry" ? (
            <SearchSelect
              value={draft.inquiryId}
              options={withCurrent(work.inquiries, original?.inquiryId, original?.inquiryNo)}
              onChange={(value) => pickWork("inquiryId", value, work.inquiries)}
              label={t("TeamBoard.linkRfq")}
              placeholder={t("TeamBoard.searchRfq")}
              disabled={disabled}
              {...copy}
            />
          ) : draft.workType === "other" ? (
            <small className="muted">{t("TeamBoard.workOtherHint")}</small>
          ) : null}
        </div>
      ) : null}
      {draft.kind !== "Away" ? (
        <label className="field">
          <span>
            {t("TeamBoard.detail")} <b className="board-req">*</b>
          </span>
          <textarea rows={3} maxLength={2000} disabled={disabled} value={draft.note} placeholder={t("TeamBoard.detailPlaceholder")} onChange={(event) => set({ ...draft, note: event.target.value })} />
        </label>
      ) : null}
      <div className="field">
        <span>{t("TeamBoard.customer")}</span>
        <SearchSelect
          value={draft.customerId}
          options={customers}
          onChange={(value) => set({ ...draft, customerId: value })}
          label={t("TeamBoard.customer")}
          placeholder={t("CRM.searchCustomer")}
          disabled={disabled}
          {...copy}
        />
      </div>
      <div className="field board-people" data-guide="team.people">
        <span>
          {t("TeamBoard.people")}
          {draft.kind === "Away" ? <b className="board-req"> *</b> : null}
        </span>
        {disabled ? (
          <span className="board-people-names">{loads.map((load) => load.person.user.name).join(", ") || t("TeamBoard.unassigned")}</span>
        ) : (
          <SearchMultiPicker
            options={personOptions}
            value={draft.assigneeIds}
            onChange={(assigneeIds) => set({ ...draft, assigneeIds })}
            label={t("TeamBoard.people")}
            placeholder={t("Schedule.searchPeople")}
            removeLabel={t("Schedule.removePic")}
            noMatchText={t("Schedule.noPersonMatch")}
            allChosenText={t(assignable === null ? "Schedule.everyoneChosen" : "TeamBoard.assignSelfOnly")}
          />
        )}
        {!disabled && assignable !== null ? <small className="muted">{t("TeamBoard.assignSelfOnly")}</small> : null}
      </div>
      <div className="board-form-row">
        <label className="field" data-guide="team.date">
          <span>
            {t("TeamBoard.startDate")} <b className="board-req">*</b>
          </span>
          <DateInput
            required
            disabled={disabled}
            value={draft.startDate}
            onChange={(event) => set({ ...draft, startDate: event.target.value, endDate: !draft.endDate || draft.endDate < event.target.value ? event.target.value : draft.endDate })}
          />
        </label>
        {/* A repeating task takes one day each time; it ends with its repeat. */}
        {repeating && draft.repeat ? null : (
          <label className="field">
            <span>{t("TeamBoard.endDate")}</span>
            <DateInput disabled={disabled} min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => set({ ...draft, endDate: event.target.value })} />
          </label>
        )}
      </div>
      {draft.kind !== "Away" ? (
        <div className="field">
          <span>{t("TeamBoard.timeOfDay")}</span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.timeOfDay")}>
            {slots.map(({ slot, label }) => (
              <button key={slot} type="button" disabled={disabled} className={draft.slot === slot ? "chip on" : "chip"} aria-pressed={draft.slot === slot} onClick={() => set({ ...draft, slot })}>
                {t(label)}
              </button>
            ))}
          </div>
          {draft.slot === "Time" ? (
            <div className="board-time-range">
              <label className="field">
                <span>
                  {t("TeamBoard.timeFrom")} <b className="board-req">*</b>
                </span>
                <input type="time" required disabled={disabled} value={draft.startTime} onChange={(event) => set({ ...draft, startTime: event.target.value })} />
              </label>
              <label className="field">
                <span>
                  {t("TeamBoard.timeUntil")} <b className="board-req">*</b>
                </span>
                <input type="time" required disabled={disabled} value={draft.endTime} onChange={(event) => set({ ...draft, endTime: event.target.value })} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      {draft.kind === "Appointment" ? (
        <div className="field board-meeting" data-guide="team.meeting">
          <span>{t("TeamBoard.meeting")}</span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.meeting")}>
            {(
              [
                ["", "TeamBoard.meetingNone"],
                ["Online", "TeamBoard.meetingOnline"],
                ["Offline", "TeamBoard.meetingOffline"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode || "none"}
                type="button"
                disabled={disabled}
                className={draft.meetingMode === mode ? "chip on" : "chip"}
                aria-pressed={draft.meetingMode === mode}
                onClick={() => set({ ...draft, meetingMode: mode })}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {draft.meetingMode ? (
            <label className="field">
              <span>{t(draft.meetingMode === "Online" ? "TeamBoard.meetingLink" : "TeamBoard.meetingPlace")}</span>
              <input
                maxLength={500}
                disabled={disabled}
                value={draft.meetingPlace}
                inputMode={draft.meetingMode === "Online" ? "url" : undefined}
                placeholder={t(draft.meetingMode === "Online" ? "TeamBoard.meetingLinkPlaceholder" : "TeamBoard.meetingPlacePlaceholder")}
                onChange={(event) => set({ ...draft, meetingPlace: event.target.value })}
              />
            </label>
          ) : null}
          {draft.meetingMode === "Online" && meetingUrl(draft.meetingPlace) ? (
            <a className="board-meeting-join" href={meetingUrl(draft.meetingPlace)} target="_blank" rel="noopener noreferrer">
              <Icon name="externalLink" />
              {t("TeamBoard.meetingJoin")}
            </a>
          ) : null}
        </div>
      ) : null}
      {repeating ? <RepeatFields draft={draft} set={set} disabled={disabled} holidays={context.holidays} longDate={context.longDate} lang={lang} /> : null}
      {draft.kind !== "Away" && loads.length ? (
        <p className="muted small board-outlook">
          <Icon name="calendar" />
          {t(repeating && draft.repeat ? "TeamBoard.outlookRepeatHint" : "TeamBoard.outlookHint")}
        </p>
      ) : null}
      {draft.kind === "Away" ? (
        !draft.assigneeIds.length ? (
          <p className="callout warning" role="status">
            {t("TeamBoard.awayNeedsPerson")}
          </p>
        ) : null
      ) : !loads.length ? (
        <p className="muted small">{t("TeamBoard.noAssigneeHint")}</p>
      ) : !shown ? (
        <p className="muted small">{t("TeamBoard.loadOutside")}</p>
      ) : (
        <div className={`callout ${highest > 100 ? "danger" : highest >= 85 ? "warning" : "info"}`} role="status">
          <span>{fill(t("TeamBoard.loadThatDay"), { date: longDate(draft.startDate) })}</span>
          <ul className="board-loads">
            {loads.map(({ person, now, after, away, off }) => (
              <li key={person.userId} className={away ? "away" : off ? "none" : loadBand(after)}>
                <strong>{person.user.name}</strong> {away ? t("TeamBoard.awayShort") : off ? t("TeamBoard.holiday") : `${pct(now ?? 0)} → ${pct(after)}`}
              </li>
            ))}
          </ul>
          {worst && freer.length ? (
            <div className="board-freer">
              {fill(t("TeamBoard.swapFor"), { name: worst.person.user.name })}
              {freer.map(({ person: other, utilisation }) => (
                <button key={other.userId} type="button" className="board-free" disabled={disabled} onClick={() => swap(worst.person.userId, other.userId)}>
                  <span className="board-avatar small" aria-hidden="true">
                    {initials(other.user.name)}
                  </span>
                  {other.user.name} {pct(utilisation)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {draft.kind !== "Away" ? (
        <details className="board-more-fields" open={draft.manDays !== ""}>
          <summary>{t("TeamBoard.moreEffort")}</summary>
          <div className="board-form-row">
            <label className="field">
              <span>{t("TeamBoard.manDays")}</span>
              <input
                type="number"
                min="0"
                max="999"
                step="0.5"
                disabled={disabled}
                value={draft.manDays}
                placeholder={fill(t("TeamBoard.manDaysAuto"), { n: fmt(auto) })}
                onChange={(event) => set({ ...draft, manDays: event.target.value })}
              />
            </label>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * How often a task repeats (owner request 2026-11-09): once, every working day, or on the weekdays chosen, until a day
 * at most a year on. Says how many days that makes, company holidays left out.
 */
function RepeatFields({
  draft,
  set,
  disabled,
  holidays,
  longDate,
  lang,
}: {
  draft: Draft;
  set: (draft: Draft) => void;
  disabled: boolean;
  holidays: readonly string[];
  longDate: (date: string) => string;
  lang: Parameters<typeof localeFor>[0];
}) {
  const { t } = useLanguage();
  const choose = (repeat: Draft["repeat"]) =>
    set({
      ...draft,
      repeat,
      weekdays: draft.weekdays.length ? draft.weekdays : [draft.startDate ? isoWeekday(draft.startDate) : 1],
      until: draft.until || (draft.startDate ? monthAfter(draft.startDate) : ""),
    });
  const toggle = (day: number) => set({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((entry) => entry !== day) : [...draft.weekdays, day] });
  const dates = draft.repeat ? repeatDays(draft.startDate, draft.repeat === "Weekdays" ? WORKING_WEEK : draft.weekdays, draft.until, holidays) : [];
  const latest = draft.startDate ? dateFromDay(dayNumber(draft.startDate) + MAX_REPEAT_DAYS) : undefined;
  return (
    <div className="field board-repeat" data-guide="team.repeat">
      <span>{t("TeamBoard.repeat")}</span>
      <div className="chip-select" role="group" aria-label={t("TeamBoard.repeat")}>
        {(
          [
            ["", "TeamBoard.repeatNone"],
            ["Weekdays", "TeamBoard.repeatWeekdays"],
            ["Weekly", "TeamBoard.repeatWeekly"],
          ] as const
        ).map(([repeat, label]) => (
          <button
            key={repeat || "none"}
            type="button"
            disabled={disabled}
            className={draft.repeat === repeat ? "chip on" : "chip"}
            aria-pressed={draft.repeat === repeat}
            onClick={() => choose(repeat)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {draft.repeat === "Weekly" ? (
        <div className="chip-select board-weekdays" role="group" aria-label={t("TeamBoard.repeatOn")}>
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <button key={day} type="button" disabled={disabled} className={draft.weekdays.includes(day) ? "chip on" : "chip"} aria-pressed={draft.weekdays.includes(day)} onClick={() => toggle(day)}>
              {weekdayName(lang, day)}
            </button>
          ))}
        </div>
      ) : null}
      {draft.repeat ? (
        <div className="board-repeat-until">
          <label className="field">
            <span>
              {t("TeamBoard.repeatUntil")} <b className="board-req">*</b>
            </span>
            <DateInput required disabled={disabled} min={draft.startDate || undefined} max={latest} value={draft.until} onChange={(event) => set({ ...draft, until: event.target.value })} />
          </label>
          <small className={dates.length ? "muted" : "red-text"}>
            {dates.length ? fill(t("TeamBoard.repeatCount"), { n: dates.length, first: longDate(dates[0]!), last: longDate(dates.at(-1)!) }) : t("TeamBoard.repeatNoMatch")}
          </small>
        </div>
      ) : null}
    </div>
  );
}

/** What stops a save; `repeating` checks the repeat too. */
const draftProblem = (draft: Draft, repeating = true) => {
  if (!draft.title.trim() || !draft.startDate) return "";
  if (repeating && draft.repeat) {
    if (!draft.until) return "TeamBoard.repeatUntilNeeded";
    if (draft.until < draft.startDate) return "TeamBoard.repeatUntilBefore";
    if (dayNumber(draft.until) - dayNumber(draft.startDate) > MAX_REPEAT_DAYS) return "TeamBoard.repeatTooLong";
    if (draft.repeat === "Weekly" && !draft.weekdays.length) return "TeamBoard.repeatNoDays";
  } else if (draft.endDate && draft.endDate < draft.startDate) return "TeamBoard.endBeforeStart";
  if (draft.kind === "Away") return draft.assigneeIds.length ? "" : "TeamBoard.awayNeedsPerson";
  if (draft.slot !== "Time") return "";
  if (!draft.startTime || !draft.endTime) return "TeamBoard.timeNeeded";
  const last = repeating && draft.repeat ? draft.startDate : draft.endDate || draft.startDate;
  return last === draft.startDate && draft.endTime <= draft.startTime ? "TeamBoard.timeOrder" : "";
};
/** Required fields still empty: the work it is for and its brief detail (a day away needs neither). */
const draftMissing = (draft: Draft): string[] =>
  draft.kind === "Away"
    ? draft.assigneeIds.length
      ? []
      : ["TeamBoard.people"]
    : [
        !draft.workType || (draft.workType === "project" && !draft.projectId) || (draft.workType === "inquiry" && !draft.inquiryId) ? "TeamBoard.workFor" : "",
        draft.note.trim() ? "" : "TeamBoard.detail",
      ].filter(Boolean);
const draftReady = (draft: Draft, repeating = true) =>
  Boolean(draft.title.trim() && draft.startDate) &&
  !draftProblem(draft, repeating) &&
  !draftMissing(draft).length &&
  // A repeat that falls on no day saves nothing.
  !(repeating && draft.repeat && !repeatDays(draft.startDate, draft.repeat === "Weekdays" ? WORKING_WEEK : draft.weekdays, draft.until).length);
/** "Still needed: …" under a form whose button is off for a required field. */
function MissingLine({ draft }: { draft: Draft }) {
  const { t } = useLanguage();
  const missing = [...(draft.title.trim() ? [] : ["TeamBoard.subject"]), ...draftMissing(draft)];
  return missing.length ? (
    <p className="muted small board-missing">
      {t("TeamBoard.stillNeeded")} {missing.map((key) => t(key)).join(", ")}
    </p>
  ) : null;
}

function AddTaskModal({
  preset,
  copyFrom = null,
  initial = null,
  onClose,
  onSave,
  ...context
}: FormContext & {
  preset: { assigneeId: number | null; date: string };
  onClose: () => void;
  onSave: (input: TeamTaskInput) => Promise<void>;
  /** What the work list's quick row already holds, finished here. */
  initial?: Draft | null;
  /** A saved task this one starts from: every field filled in, saved as a new, planned task. */
  copyFrom?: TeamTask | null;
}) {
  const { t } = useLanguage();
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => {
    // A copy happens once unless it is set to repeat.
    const start = copyFrom ? { ...draftOf(copyFrom), status: "Planned" as const, repeat: "" as const } : (initial ?? draftOf(null, preset));
    // Someone who may not assign others adds the work for themselves.
    const { assignable } = context;
    if (!assignable) return start;
    const kept = start.assigneeIds.filter((id) => assignable.includes(id));
    return { ...start, assigneeIds: kept.length || start.assigneeIds.length ? (kept.length ? kept : assignable) : start.assigneeIds };
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    if (!draftReady(draft) || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(inputOf(draft));
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };
  const problem = draftProblem(draft);
  return (
    <Modal
      title={copyFrom ? "TeamBoard.copyTask" : "TeamBoard.addTitle"}
      subtitle={copyFrom ? "TeamBoard.copyHint" : "TeamBoard.addHint"}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn default" disabled={busy} onClick={onClose}>
            {t("Cancel")}
          </button>
          <button type="submit" form={formId} className="btn primary" data-guide="team.save" disabled={busy || !draftReady(draft)}>
            <Icon name="plus" />
            {t("TeamBoard.addButton")}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error ? (
          <div className="callout danger" role="alert">
            {error}
          </div>
        ) : null}
        {problem && problem !== "TeamBoard.awayNeedsPerson" ? (
          <div className="callout warning" role="status">
            {t(problem)}
          </div>
        ) : null}
        <TaskFields draft={draft} set={setDraft} context={context} focusSubject repeating />
        <MissingLine draft={draft} />
      </form>
    </Modal>
  );
}

function TaskDrawer({
  task,
  canChange,
  onClose,
  onSave,
  onDelete,
  onCopy,
  ...context
}: FormContext & {
  task: TeamTask;
  canChange: boolean;
  onClose: () => void;
  /** A day of a repeat saves on its own ("this") or with every day after it ("following"). */
  onSave: (input: TeamTaskInput, scope: TeamTaskScope) => Promise<void>;
  onDelete: (scope: TeamTaskScope) => Promise<void>;
  /** Starts a new task from this one; anyone on the board may. */
  onCopy: () => void;
}) {
  const { t, lang } = useLanguage();
  const formId = useId();
  const [draft, setDraft] = useState(() => draftOf(task));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // A day of a repeat: change this day only (the default), or this day and every one after it.
  const series = task.seriesId !== null;
  const [scope, setScope] = useState<TeamTaskScope>("this");
  // The repeat is this save's to set on a task that happens once, or on a repeat from this day on.
  const repeating = canChange && (!series || scope === "following");
  const [history, setHistory] = useState<TeamTaskChange[] | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => void loadTeamTaskHistory(task.id).then(setHistory, () => setHistory([])), 0);
    return () => clearTimeout(timer);
  }, [task.id]);
  const save = async (next: Draft) => {
    if (!draftReady(next, repeating) || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(inputOf(next, repeating), series ? scope : "this");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = series
    ? fill(t(scope === "following" ? "TeamBoard.confirmDeleteFollowing" : "TeamBoard.confirmDeleteDay"), { date: context.longDate(task.startDate) })
    : t("TeamBoard.confirmDelete");
  const statuses: { status: TeamTaskStatus; label: string }[] = [
    { status: "Planned", label: "TeamBoard.statusPlanned" },
    { status: "Done", label: "TeamBoard.statusDone" },
    { status: "Cancelled", label: "TeamBoard.statusCancelled" },
  ];
  const when = (value: string) => new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const changed = (change: TeamTaskChange) => {
    // The repeat this day belongs to: made, or ended from a day on.
    if (change.series)
      return change.action === "Created"
        ? t("TeamBoard.historySeriesCreated")
        : fill(t("TeamBoard.historySeriesEnded"), { date: typeof change.after?.from === "string" ? context.longDate(change.after.from) : "" });
    if (change.action === "Created") return t("TeamBoard.historyCreated");
    if (change.action === "Deleted") return t("TeamBoard.historyDeleted");
    const before = change.before ?? {},
      after = change.after ?? {};
    const fields = [
      before.startDate !== after.startDate || before.endDate !== after.endDate ? t("TeamBoard.fieldDate") : "",
      JSON.stringify(peopleOf(before)) !== JSON.stringify(peopleOf(after)) ? t("TeamBoard.fieldAssignee") : "",
      before.status !== after.status ? t("TeamBoard.fieldStatus") : "",
      before.title !== after.title ? t("TeamBoard.fieldTitle") : "",
    ].filter(Boolean);
    return fill(t("TeamBoard.historyUpdated"), { fields: ` ${(fields.length ? fields : [t("TeamBoard.fieldOther")]).join(", ")}` });
  };
  const kindLabel = task.kind === "Appointment" ? "TeamBoard.kindAppointment" : task.kind === "Away" ? "TeamBoard.kindAway" : "TeamBoard.kindTask";
  return (
    <Drawer
      title={task.title}
      subtitle={`${t(kindLabel)} · ${fill(t("TeamBoard.addedBy"), { name: task.createdByName, when: when(task.createdAt) })}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          {canChange ? (
            <button
              type="button"
              className="btn ghost board-delete"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog(confirmDelete, { danger: true })) void onDelete(series ? scope : "this").catch((failure) => setError(errorText(failure)));
              }}
            >
              <Icon name="trash" />
              {t("TeamBoard.delete")}
            </button>
          ) : null}
          <button type="button" className="btn ghost" disabled={busy} onClick={onCopy}>
            <Icon name="copy" />
            {t("TeamBoard.copyTask")}
          </button>
          <span className="board-spacer" />
          {canChange ? (
            <>
              <button type="button" className="btn default" disabled={busy} onClick={onClose}>
                {t("Cancel")}
              </button>
              <button type="submit" form={formId} className="btn primary" disabled={busy || !draftReady(draft, repeating)}>
                {t("Save")}
              </button>
            </>
          ) : (
            <button type="button" className="btn default" onClick={onClose}>
              {t("Close")}
            </button>
          )}
        </>
      }
    >
      <form
        id={formId}
        className="board-drawer"
        onSubmit={(event) => {
          event.preventDefault();
          void save(draft);
        }}
      >
        {error ? (
          <div className="callout danger" role="alert">
            {error}
          </div>
        ) : null}
        {!canChange ? (
          <div className="callout info" role="status">
            {t("TeamBoard.readOnly")}
          </div>
        ) : null}
        {series && task.repeat ? (
          <div className="board-series" data-guide="team.scope">
            <span className="board-series-rule">
              <Icon name="refresh" />
              {fill(t("TeamBoard.repeatSummary"), { rule: repeatRuleText(task.repeat, t, lang), until: context.longDate(task.repeat.until) })}
            </span>
            {canChange ? (
              <>
                <div className="chip-select" role="group" aria-label={t("TeamBoard.applyTo")}>
                  {(
                    [
                      ["this", "TeamBoard.scopeThis"],
                      ["following", "TeamBoard.scopeFollowing"],
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" disabled={busy} className={scope === value ? "chip on" : "chip"} aria-pressed={scope === value} onClick={() => setScope(value)}>
                      {t(label)}
                    </button>
                  ))}
                </div>
                <small className="muted">{fill(t(scope === "following" ? "TeamBoard.scopeFollowingHint" : "TeamBoard.scopeThisHint"), { date: context.longDate(task.startDate) })}</small>
              </>
            ) : null}
          </div>
        ) : null}
        {draftProblem(draft, repeating) && draftProblem(draft, repeating) !== "TeamBoard.awayNeedsPerson" ? (
          <div className="callout warning" role="status">
            {t(draftProblem(draft, repeating))}
          </div>
        ) : null}
        <TaskFields draft={draft} set={setDraft} context={context} disabled={!canChange || busy} original={task} repeating={repeating} />
        {canChange ? <MissingLine draft={draft} /> : null}
        <div className="field">
          <span>{t("TeamBoard.status")}</span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.status")}>
            {statuses.map(({ status, label }) => (
              <button
                key={status}
                type="button"
                disabled={!canChange || busy}
                className={draft.status === status ? "chip on" : "chip"}
                aria-pressed={draft.status === status}
                onClick={() => setDraft({ ...draft, status })}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        <section className="board-box">
          <h3>{t("TeamBoard.history")}</h3>
          {history === null ? (
            <span className="spinner" />
          ) : (
            <ul className="board-history">
              {history.map((change) => (
                <li key={`${change.at}-${change.action}-${change.actor}`}>
                  <span className="board-avatar small" aria-hidden="true">
                    {initials(change.actor)}
                  </span>
                  <span>
                    <b>{change.actor}</b> {changed(change)} <span className="muted">· {when(change.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </form>
    </Drawer>
  );
}

/** The list of all work: one quick-add row on top, then everything grouped by when it is due. */
function WorkList({
  rows,
  shown,
  onMore,
  today,
  bootstrap,
  nameOf,
  shortDate,
  lateDays,
  canChange,
  assignable,
  onExpand,
  onUpdate,
  onEdit,
  onCopy,
  openItem,
}: {
  rows: ListRow[];
  shown: number;
  onMore: () => void;
  today: string;
  bootstrap: BootstrapData;
  nameOf: Map<number, string>;
  shortDate: (date: string | null) => string;
  lateDays: (end: string) => number;
  canChange: (task: TeamTask) => boolean;
  /** Who this reader may put on a task; null for anyone. */
  assignable: number[] | null;
  /** The quick row's subject, person and dates, finished in the full form (the work and its detail are required). */
  onExpand: (draft: Draft) => void;
  onUpdate: (task: TeamTask, input: TeamTaskInput, message?: string) => Promise<TeamTask | null>;
  onEdit: (task: TeamTask) => void;
  onCopy: (task: TeamTask) => void;
  openItem: (item: Commitment) => void;
}) {
  const { t, lang } = useLanguage();
  const copy = useSearchCopy();
  // A repeat is one row standing for all its days: it is changed in its drawer, not cell by cell.
  const editable = (task: TeamTask) => canChange(task) && task.seriesId === null;
  const people = useMemo(() => peopleOptions(bootstrap.team), [bootstrap.team]);
  // Someone who may not assign others picks only themselves (or keeps whoever is already on the task).
  const choosable = (current: readonly number[] = []) =>
    assignable === null ? people : people.filter((option) => assignable.includes(Number(option.value)) || current.includes(Number(option.value)));
  const blank = (): Draft => ({ ...draftOf(null, { date: today }), kind: "Task", assigneeIds: assignable ?? [] });
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState("");
  const quickReady = Boolean(draft.title.trim() && draft.startDate) && !draftProblem(draft);
  const add = () => {
    if (!quickReady) return;
    onExpand(draft);
    setDraft({ ...blank(), kind: draft.kind, assigneeIds: draft.assigneeIds, startDate: draft.startDate, endDate: draft.startDate });
  };
  const change = async (task: TeamTask, patch: Partial<TeamTaskInput>, message?: string) => {
    try {
      await onUpdate(task, { ...teamTaskInput(task), ...patch }, message);
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  const visible = rows.slice(0, shown);
  const groupLabel: Record<ReturnType<typeof dueGroup>, string> = {
    late: "TeamBoard.late",
    thisWeek: "TeamBoard.groupThisWeek",
    nextWeek: "TeamBoard.groupNextWeek",
    later: "TeamBoard.groupLater",
    none: "TeamBoard.groupNone",
  };
  const order: ReturnType<typeof dueGroup>[] = ["late", "thisWeek", "nextWeek", "later", "none"];
  const grouped = order.map((group) => ({ group, rows: visible.filter((row) => (row.late ? "late" : dueGroup(row.end ?? row.start, today)) === group) })).filter((entry) => entry.rows.length);
  // Short names: the column is narrow, and the chips above already say "due".
  const typeLabel = rowTypeLabel;
  const owners = (row: ListRow) => row.ownerIds.map((id) => nameOf.get(id) ?? `#${id}`).join(", ");
  return (
    <section className="panel board-list">
      {error ? (
        <div className="callout danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="board-list-scroll">
        <table className="board-table">
          <colgroup>
            <col style={{ width: 112 }} />
            <col />
            <col style={{ width: 200 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{t("TeamBoard.kind")}</th>
              <th scope="col">{t("TeamBoard.colWork")}</th>
              <th scope="col">{t("TeamBoard.assignee")}</th>
              <th scope="col">{t("TeamBoard.colStart")}</th>
              <th scope="col">{t("TeamBoard.colDue")}</th>
              <th scope="col" className="num">
                {t("TeamBoard.colEffort")}
              </th>
              <th scope="col">{t("TeamBoard.status")}</th>
              <th scope="col">
                <span className="sr-only">{t("TeamBoard.open")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="board-add-row">
              <td>
                <select aria-label={t("TeamBoard.kind")} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as TeamTaskKind })}>
                  <option value="Task">{t("TeamBoard.kindTask")}</option>
                  <option value="Appointment">{t("TeamBoard.kindAppointment")}</option>
                  <option value="Away">{t("TeamBoard.kindAway")}</option>
                </select>
              </td>
              <td>
                <input
                  aria-label={t("TeamBoard.subject")}
                  maxLength={300}
                  value={draft.title}
                  placeholder={t("TeamBoard.subjectPlaceholder")}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add();
                    }
                  }}
                />
              </td>
              <td>
                <SearchSelect
                  value={draft.assigneeIds[0] ? String(draft.assigneeIds[0]) : ""}
                  options={choosable()}
                  onChange={(value) => setDraft({ ...draft, assigneeIds: value ? [Number(value)] : [] })}
                  label={t("TeamBoard.assignee")}
                  placeholder={t("CRM.searchPerson")}
                  {...copy}
                />
              </td>
              <td>
                <DateInput
                  aria-label={t("TeamBoard.startDate")}
                  value={draft.startDate}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value, endDate: draft.endDate < event.target.value ? event.target.value : draft.endDate })}
                />
              </td>
              <td>
                <DateInput aria-label={t("TeamBoard.endDate")} min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
              </td>
              <td>
                <input
                  type="number"
                  className="num"
                  aria-label={t("TeamBoard.manDays")}
                  min="0"
                  max="999"
                  step="0.5"
                  disabled={draft.kind === "Away"}
                  value={draft.manDays}
                  placeholder={fmt(defaultTaskManDays(draft.startDate, draft.endDate || draft.startDate, draft.slot === "Time" ? "Day" : draft.slot))}
                  onChange={(event) => setDraft({ ...draft, manDays: event.target.value })}
                />
              </td>
              <td>
                <span className="muted small">{t("TeamBoard.statusPlanned")}</span>
              </td>
              <td>
                <button type="button" className="btn primary sm" disabled={!quickReady} onClick={add}>
                  {t("TeamBoard.addButton")}…
                </button>
              </td>
            </tr>
            <tr className="board-add-hint">
              <td colSpan={8}>{draftProblem(draft) ? <span className="red-text">{t(draftProblem(draft))}</span> : <span className="muted small">{t("TeamBoard.quickAddHint")}</span>}</td>
            </tr>
            {grouped.map(({ group, rows: members }) => (
              <GroupRows key={group} label={`${t(groupLabel[group])} · ${members.length}`} span={8}>
                {members.map((row) => (
                  <tr key={row.key} className={row.late ? "late" : undefined}>
                    <td>
                      <span className={`board-type ${row.visit ? "visit" : row.category}`}>{t(typeLabel(row))}</span>
                    </td>
                    <td>
                      {row.task && editable(row.task) ? (
                        <InlineText value={row.task.title} label={t("TeamBoard.subject")} onCommit={(title) => void change(row.task!, { title })} />
                      ) : (
                        <span className="board-work">
                          <strong>{rowTitle(row, t)}</strong>
                          <small>{rowCustomer(row)}</small>
                        </span>
                      )}
                      {row.task?.repeat ? (
                        <small className="board-repeat-note">
                          <Icon name="refresh" />
                          {fill(t("TeamBoard.repeatSummary"), { rule: repeatRuleText(row.task.repeat, t, lang), until: shortDate(row.task.repeat.until) })}
                        </small>
                      ) : null}
                      {row.task && (row.task.inquiryNo || row.task.projectNo) ? <small className="board-links">{[row.task.inquiryNo, row.task.projectNo].filter(Boolean).join(" · ")}</small> : null}
                    </td>
                    <td>
                      {row.task && editable(row.task) && row.task.kind !== "Away" && row.task.assigneeIds.length <= 1 ? (
                        <SearchSelect
                          value={row.task.assigneeIds[0] ? String(row.task.assigneeIds[0]) : ""}
                          options={choosable(row.task.assigneeIds)}
                          label={t("TeamBoard.assignee")}
                          placeholder={t("TeamBoard.unassigned")}
                          onChange={(value) => void change(row.task!, { assigneeIds: value ? [Number(value)] : [] })}
                          {...copy}
                        />
                      ) : (
                        <span className={row.ownerIds.length ? "" : "board-need"}>{owners(row) || t("TeamBoard.unassigned")}</span>
                      )}
                    </td>
                    <td>
                      {row.task && editable(row.task) ? (
                        <>
                          <DateInput
                            className="board-inline"
                            aria-label={t("TeamBoard.startDate")}
                            value={row.task.startDate}
                            onChange={(event) => {
                              const startDate = event.target.value;
                              if (startDate) void change(row.task!, { startDate, endDate: row.task!.endDate < startDate ? startDate : row.task!.endDate });
                            }}
                          />
                          {timeRange(row.task) ? <small className="board-time">{timeRange(row.task)}</small> : null}
                        </>
                      ) : (
                        <>
                          {shortDate(row.start)}
                          {row.task && timeRange(row.task) ? <small className="board-time">{timeRange(row.task)}</small> : null}
                        </>
                      )}
                    </td>
                    <td>
                      {row.late && row.end ? (
                        <span className="red-text">
                          {shortDate(row.end)} · {fill(t("TeamBoard.lateDays"), { n: lateDays(row.end) })}
                        </span>
                      ) : (
                        shortDate(row.end)
                      )}
                    </td>
                    <td className="num">
                      {row.task && editable(row.task) && row.task.kind !== "Away" ? (
                        <InlineNumber value={row.task.manDays} label={t("TeamBoard.manDays")} onCommit={(manDays) => void change(row.task!, { manDays })} />
                      ) : row.manDays === null ? (
                        "—"
                      ) : (
                        fmt(row.manDays)
                      )}
                    </td>
                    <td>{rowStatus(row, t)}</td>
                    <td className="board-actions">
                      {row.task ? (
                        <>
                          {canChange(row.task) && row.task.kind !== "Away" ? (
                            <button type="button" className="btn default sm" onClick={() => void change(row.task!, { status: "Done" }, "TeamBoard.markedDone")}>
                              {t("TeamBoard.markDone")}
                            </button>
                          ) : null}
                          <button type="button" className="icon-btn" aria-label={t("TeamBoard.open")} title={t("TeamBoard.open")} onClick={() => onEdit(row.task!)}>
                            <Icon name="edit" />
                          </button>
                          <button type="button" className="icon-btn" aria-label={t("TeamBoard.copyTask")} title={t("TeamBoard.copyTask")} onClick={() => onCopy(row.task!)}>
                            <Icon name="copy" />
                          </button>
                        </>
                      ) : row.item && !row.item.hidden ? (
                        <button type="button" className="btn ghost sm" onClick={() => openItem(row.item!)}>
                          {t("TeamBoard.open")}
                          <Icon name="externalLink" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <EmptyState icon="checkCircle" title="TeamBoard.noWork" message="TeamBoard.noWorkHint" /> : null}
      <div className="board-list-foot">
        <span className="muted small">{fill(t("TeamBoard.shown"), { shown: Math.min(shown, rows.length), total: rows.length })}</span>
        {rows.length > shown ? (
          <button type="button" className="btn ghost sm" onClick={onMore}>
            {t("TeamBoard.showMore")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** A text cell that saves when it loses focus or on Enter, and only if it changed. */
function InlineText({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // A saved change from elsewhere replaces what the cell shows (derived at render, not in an effect).
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  const commit = () => {
    const next = text.trim();
    if (next && next !== value) onCommit(next);
    else setText(value);
  };
  return (
    <input
      className="board-inline"
      aria-label={label}
      maxLength={300}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") setText(value);
      }}
    />
  );
}

function InlineNumber({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = () => {
    const next = Number(text);
    if (text.trim() !== "" && Number.isFinite(next) && next >= 0 && next <= 999 && next !== value) onCommit(next);
    else setText(String(value));
  };
  return (
    <input
      className="board-inline num"
      type="number"
      min="0"
      max="999"
      step="0.5"
      aria-label={label}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
