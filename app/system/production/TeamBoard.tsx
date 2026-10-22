"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClientError, listInquiries, listProjects, type BootstrapData } from "../api-client";
import { Drawer, EmptyState, Icon, Modal, SearchInput } from "../ui";
import { localeFor, useLanguage } from "../i18n";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { SearchMultiPicker, type PickerOption } from "./SearchMultiPicker";
import {
  createTeamTask,
  deleteTeamTask,
  loadTeamBoard,
  loadTeamTaskHistory,
  teamTaskInput,
  updateTeamTask,
  type BoardAway,
  type CalendarDelivery,
  type BoardVisit,
  type TeamBoardData,
  type TeamTask,
  type TeamTaskChange,
  type TeamTaskInput,
  type TeamTaskKind,
  type TeamTaskSlot,
  type TeamTaskStatus,
} from "../resource-workload-client";
import { dateFromDay, dayNumber, weeklyCapacity, workingDays, type Commitment } from "../../../lib/resource-planning";
import { boardDays, covers, dailyLoad, defaultTaskManDays, dueGroup, freestOn, loadBand, timeRange, weekTotals, withExtra, type DayLoad } from "../../../lib/team-board";
import "./team-board.css";

// The team board (owner decision 2026-10-21): everyone's work on one page, a day grid coloured by load, a list of all
// work, and work added ahead with a subject and a date, adjusted later. See lib/team-board.ts for the arithmetic.

export type TeamBoardMode = "board" | "list";
type Category = "rfq" | "est" | "prj" | "appointment" | "task" | "away";
type Attention = "late" | "unassigned" | "over";
type BoardEvent =
  | { kind: "rfq" | "est" | "prj"; key: string; item: Commitment; late: boolean }
  | { kind: "appointment" | "task" | "away"; key: string; task: TeamTask; late: boolean }
  | { kind: "visit"; key: string; visit: BoardVisit; late: false }
  | { kind: "leave"; key: string; away: BoardAway; late: false };
type ListRow = {
  key: string; category: Category; start: string | null; end: string | null; ownerIds: number[]; manDays: number | null; late: boolean;
  item?: Commitment; task?: TeamTask; visit?: BoardVisit; away?: BoardAway;
};
type Person = { user: BootstrapData["team"][number]; load: DayLoad[]; capacity: number; week: ReturnType<typeof weekTotals>; late: number; awayDays: number; away: (date: string) => boolean; userId: number };

const ALL = "";
const LIST_PAGE = 100;
const CATEGORIES: { key: Category; label: string; colour: string }[] = [
  { key: "rfq", label: "TeamBoard.typeRfq", colour: "var(--blue)" },
  { key: "est", label: "TeamBoard.typeEst", colour: "var(--green)" },
  { key: "prj", label: "TeamBoard.typePrj", colour: "var(--violet)" },
  { key: "appointment", label: "TeamBoard.typeAppointment", colour: "var(--amber)" },
  { key: "task", label: "TeamBoard.typeTask", colour: "var(--n-500)" },
  { key: "away", label: "TeamBoard.typeAway", colour: "var(--n-300)" },
];
const LIST_TYPES: Record<Category, string> = {
  rfq: "TeamBoard.listRfq", est: "TeamBoard.listEst", prj: "TeamBoard.chipPrj", appointment: "TeamBoard.listAppointment", task: "TeamBoard.kindTask", away: "TeamBoard.typeAway",
};
const categoryOf = (event: BoardEvent): Category =>
  event.kind === "visit" ? "appointment" : event.kind === "leave" ? "away" : event.kind;
const EVENT_ORDER: Record<BoardEvent["kind"], number> = { leave: 0, away: 0, visit: 1, appointment: 1, task: 2, rfq: 3, est: 3, prj: 4 };
const itemCategory = (item: Commitment): Category => (item.type === "Inquiry" ? "rfq" : item.type === "Estimate" ? "est" : "prj");
const mondayOf = (date: string) => { const day = dayNumber(date); return dateFromDay(day - ((new Date(day * 86400000).getUTCDay() + 6) % 7)); };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("");
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "∞");
const pct = (n: number | null) => (n === null ? "—" : Number.isFinite(n) ? `${Math.round(n)}%` : "∞");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Who a history entry says the task was for: a list since migration 086, one assigneeId before it. */
const peopleOf = (state: Record<string, unknown>) =>
  Array.isArray(state.assigneeIds) ? state.assigneeIds.map(Number) : state.assigneeId === null || state.assigneeId === undefined ? [] : [Number(state.assigneeId)];

/** What a task form holds; empty strings for "not chosen". */
type Draft = {
  kind: TeamTaskKind; title: string; customerId: string; assigneeIds: number[]; startDate: string; endDate: string; slot: TeamTaskSlot;
  startTime: string; endTime: string; manDays: string; status: TeamTaskStatus; inquiryId: string; projectId: string; note: string;
};
const draftOf = (task: TeamTask | null, preset: { assigneeId?: number | null; date?: string } = {}): Draft => task ? {
  kind: task.kind, title: task.title, customerId: task.customerId ? String(task.customerId) : "", assigneeIds: [...task.assigneeIds],
  startDate: task.startDate, endDate: task.endDate, slot: task.slot, startTime: task.startTime ?? "", endTime: task.endTime ?? "", manDays: String(task.manDays), status: task.status,
  inquiryId: task.inquiryId ? String(task.inquiryId) : "", projectId: task.projectId ? String(task.projectId) : "", note: task.note,
} : {
  kind: "Appointment", title: "", customerId: "", assigneeIds: preset.assigneeId ? [preset.assigneeId] : [], startDate: preset.date ?? "",
  endDate: preset.date ?? "", slot: "Day", startTime: "", endTime: "", manDays: "", status: "Planned", inquiryId: "", projectId: "", note: "",
};
const inputOf = (draft: Draft): TeamTaskInput => ({
  kind: draft.kind, title: draft.title.trim(), customerId: draft.customerId ? Number(draft.customerId) : null,
  assigneeIds: draft.assigneeIds, startDate: draft.startDate, endDate: draft.endDate || draft.startDate,
  // Times go with the Time slot only, and never with a day away.
  slot: draft.kind === "Away" ? "Day" : draft.slot,
  startTime: draft.kind !== "Away" && draft.slot === "Time" ? draft.startTime || null : null,
  endTime: draft.kind !== "Away" && draft.slot === "Time" ? draft.endTime || null : null,
  manDays: draft.kind === "Away" ? 0 : draft.manDays.trim() === "" ? null : Number(draft.manDays), status: draft.status,
  inquiryId: draft.inquiryId ? Number(draft.inquiryId) : null, projectId: draft.projectId ? Number(draft.projectId) : null, note: draft.note.trim(),
});
/** A team task as the load counts it: planned appointments and tasks only, its whole effort for each of its people. */
const taskWork = (task: TeamTask): Commitment[] => task.status !== "Planned" || task.kind === "Away" ? [] :
  (task.assigneeIds.length ? task.assigneeIds : [null]).map((ownerId) => ({
    key: `TeamTask-${task.id}-${ownerId ?? "none"}`, workKey: `TeamTask-${task.id}`, type: "Task" as const, entityId: task.id, ownerId, reference: "",
    title: task.title, customer: task.customer, start: task.startDate, end: task.endDate, manDays: task.manDays, progress: 0, status: "Planned",
    taskKind: task.kind === "Appointment" ? "Appointment" as const : "Task" as const,
  }));

export function TeamBoard({ bootstrap, notify, mode, onMode, today, openItem, onChanged }: {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  mode: TeamBoardMode;
  onMode: (mode: TeamBoardMode) => void;
  today: string;
  /** Opens an inquiry, estimate or project the reader may see. */
  openItem: (item: Commitment) => void;
  /** A team task was added, changed or removed: the weekly workload reads again. */
  onChanged?: () => void;
}) {
  const { t, lang } = useLanguage();
  const [start, setStart] = useState(() => mondayOf(today));
  const [weeks, setWeeks] = useState<2 | 4>(2);
  const [data, setData] = useState<TeamBoardData | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [department, setDepartment] = useState(ALL), [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null), [attention, setAttention] = useState<Attention | null>(null);
  const [personId, setPersonId] = useState<number | null>(null), [listShown, setListShown] = useState(LIST_PAGE);
  const [adding, setAdding] = useState<{ assigneeId: number | null; date: string } | null>(null);
  const [editing, setEditing] = useState<TeamTask | null>(null);
  // The window the grid shows, read with four months after it so the list sees what is coming.
  const range = useMemo(() => ({ from: start, to: dateFromDay(dayNumber(start) + Math.max(weeks * 7, 120) - 1) }), [start, weeks]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadTeamBoard(range.from, range.to)); }
    catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const me = bootstrap.user.id;
  const canChange = (task: TeamTask) => task.createdBy === me || task.assigneeIds.includes(me) || Boolean(data?.canChangeAll);
  const nameOf = useMemo(() => new Map(bootstrap.team.map((user) => [user.id, user.name])), [bootstrap.team]);
  const holidays = useMemo(() => data?.holidays ?? [], [data]);
  const days = useMemo(() => boardDays(start, weeks, holidays, today), [start, weeks, holidays, today]);
  // "This week" beside a name: the week holding today, or the first week shown.
  const week = useMemo(() => { const first = days.some((day) => day.today) ? mondayOf(today) : start; return { from: first, to: dateFromDay(dayNumber(first) + 4) }; }, [days, start, today]);

  const awayOf = useMemo(() => {
    const spans = new Map<number, { start: string | null; end: string | null }[]>();
    const add = (userId: number | null, from: string | null, to: string | null) => { if (userId) spans.set(userId, [...(spans.get(userId) ?? []), { start: from, end: to }]); };
    for (const entry of data?.away ?? []) add(entry.userId, entry.start, entry.end);
    for (const task of data?.tasks ?? []) if (task.kind === "Away" && task.status !== "Cancelled") for (const userId of task.assigneeIds) add(userId, task.startDate, task.endDate);
    return (userId: number, date: string) => (spans.get(userId) ?? []).some((span) => covers(span.start, span.end, date));
  }, [data]);

  const people: Person[] = useMemo(() => {
    if (!data) return [];
    const capacities = new Map(data.capacities.map((entry) => [entry.userId, entry.daysPerWeek]));
    const lateTasks = (userId: number) => data.tasks.filter((task) => task.assigneeIds.includes(userId) && task.status === "Planned" && task.kind !== "Away" && task.endDate < today).length;
    return bootstrap.team.map((user) => {
      const items = data.items.filter((item) => item.ownerId === user.id);
      const capacity = weeklyCapacity(capacities.get(user.id));
      const load = dailyLoad(items, days, capacity, data.holidays);
      const away = (date: string) => awayOf(user.id, date);
      return {
        user, userId: user.id, load, capacity, week: weekTotals(load, week.from, week.to), away,
        late: items.filter((item) => item.type !== "Task" && item.end && item.end < today).length + lateTasks(user.id),
        awayDays: days.filter((day) => day.date >= week.from && day.date <= week.to && !day.holiday && away(day.date)).length,
      };
    }).sort((a, b) => a.user.department.localeCompare(b.user.department) || a.user.name.localeCompare(b.user.name));
  }, [bootstrap.team, data, days, week, today, awayOf]);
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
      if (item.type !== "Task" && item.end && shown.has(item.end))
        add(item.ownerId, item.end, { kind: itemCategory(item) as "rfq" | "est" | "prj", key: item.key, item, late: item.end < today });
    for (const task of data.tasks) {
      if (task.status === "Cancelled") continue;
      const kind = task.kind === "Away" ? "away" : task.kind === "Appointment" ? "appointment" : "task";
      for (const day of days) if (covers(task.startDate, task.endDate, day.date))
        for (const userId of task.assigneeIds.length ? task.assigneeIds : [null])
          add(userId, day.date, { kind, key: `task-${task.id}`, task, late: task.status === "Planned" && task.kind !== "Away" && task.endDate < today });
    }
    for (const visit of data.visits) for (const day of days) if (covers(visit.start, visit.end, day.date))
      for (const engineerId of visit.engineerIds) add(engineerId, day.date, { kind: "visit", key: `visit-${visit.id}`, visit, late: false });
    for (const entry of data.away) for (const day of days) if (covers(entry.start, entry.end, day.date))
      add(entry.userId, day.date, { kind: "leave", key: `away-${entry.id}`, away: entry, late: false });
    for (const list of map.values()) list.sort((a, b) => EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind]);
    return map;
  }, [data, days, today]);

  // Every row the list can show, before its filters.
  const allRows: ListRow[] = useMemo(() => {
    if (!data) return [];
    const rows: ListRow[] = [];
    for (const item of data.items) if (item.type !== "Task")
      rows.push({ key: item.key, category: itemCategory(item), start: item.start, end: item.end, ownerIds: item.ownerId ? [item.ownerId] : [], manDays: item.manDays, late: Boolean(item.end && item.end < today), item });
    for (const task of data.tasks) if (task.status === "Planned")
      rows.push({ key: `task-${task.id}`, category: task.kind === "Away" ? "away" : task.kind === "Appointment" ? "appointment" : "task", start: task.startDate, end: task.endDate,
        ownerIds: task.assigneeIds, manDays: task.kind === "Away" ? null : task.manDays, late: task.kind !== "Away" && task.endDate < today, task });
    for (const visit of data.visits)
      rows.push({ key: `visit-${visit.id}`, category: "appointment", start: visit.start, end: visit.end, ownerIds: visit.engineerIds, manDays: null, late: false, visit });
    for (const entry of data.away)
      rows.push({ key: `away-${entry.id}`, category: "away", start: entry.start, end: entry.end, ownerIds: [entry.userId], manDays: null, late: false, away: entry });
    return rows;
  }, [data, today]);

  const departments = useMemo(() => [...new Set(bootstrap.team.map((user) => user.department).filter(Boolean))].sort(), [bootstrap.team]);
  const query = search.trim().toLocaleLowerCase();
  const inDepartment = (userId: number) => department === ALL || bootstrap.team.find((user) => user.id === userId)?.department === department;
  const rowText = (row: ListRow) => [
    row.item?.reference, row.item?.title, row.item?.customer, row.task?.title, row.task?.customer, row.visit?.number, row.visit?.customer,
    ...row.ownerIds.map((id) => nameOf.get(id) ?? ""),
  ].join(" ").toLocaleLowerCase();
  // The department, search and person filters; the chips count within them.
  const scopedRows = allRows.filter((row) =>
    (department === ALL || row.ownerIds.some(inDepartment) || (!row.ownerIds.length && row.task !== undefined))
    && (personId === null || row.ownerIds.includes(personId))
    && (!query || rowText(row).includes(query)));
  const overPeople = people.filter((person) => (person.week.utilisation ?? 0) > 100 && inDepartment(person.userId));
  const unassignedTasks = (data?.tasks ?? []).filter((task) => !task.assigneeIds.length && task.status === "Planned");
  const counts = {
    all: scopedRows.length,
    ...(Object.fromEntries(CATEGORIES.map(({ key }) => [key, scopedRows.filter((row) => row.category === key).length])) as Record<Category, number>),
    late: scopedRows.filter((row) => row.late).length,
    unassigned: scopedRows.filter((row) => row.task && !row.ownerIds.length).length,
    over: overPeople.length,
  };
  const pickCategory = (next: Category | null) => { setCategory(next); setListShown(LIST_PAGE); };
  const pickAttention = (next: Attention | null) => { setAttention(next); setListShown(LIST_PAGE); };

  // The list: filtered rows, soonest due first, grouped by when they are due.
  const listRows = scopedRows
    .filter((row) => (!category || row.category === category)
      && (attention !== "late" || row.late)
      && (attention !== "unassigned" || (row.task !== undefined && !row.ownerIds.length))
      && (attention !== "over" || row.ownerIds.some((id) => overPeople.some((person) => person.userId === id))))
    .sort((a, b) => (a.end ?? a.start ?? "9999").localeCompare(b.end ?? b.start ?? "9999") || a.key.localeCompare(b.key));

  // The grid's people: the team filter, a search on name or team, and the attention chips.
  const gridPeople = people.filter((person) =>
    inDepartment(person.userId)
    && (personId === null || person.userId === personId)
    && (!query || [person.user.name, person.user.nickname, person.user.department].join(" ").toLocaleLowerCase().includes(query))
    && (attention !== "over" || (person.week.utilisation ?? 0) > 100)
    && (attention !== "late" || person.late > 0));
  const showPeople = attention !== "unassigned";
  const showUnassigned = (attention === null || attention === "unassigned") && personId === null && (unassignedTasks.length > 0 || attention === "unassigned");

  // Saved changes update the board in place: no full reload after each edit.
  const applyTask = (task: TeamTask | null, removedId?: number) => { onChanged?.(); setData((current) => {
    if (!current) return current;
    const id = task?.id ?? removedId!;
    const tasks = current.tasks.filter((entry) => entry.id !== id);
    const items = current.items.filter((item) => item.workKey !== `TeamTask-${id}`);
    if (task) { tasks.push(task); items.push(...taskWork(task)); }
    return { ...current, tasks, items };
  }); };
  const customerName = (id: number | null) => (id === null ? "" : bootstrap.customers.find((customer) => customer.id === id)?.name ?? "");
  const savedTask = (base: TeamTask | null, input: TeamTaskInput, saved: { id: number; rowVersion: string; manDays: number }): TeamTask => ({
    ...input, id: saved.id, rowVersion: saved.rowVersion, manDays: saved.manDays, customer: customerName(input.customerId),
    inquiryNo: input.inquiryId === base?.inquiryId ? base?.inquiryNo ?? "" : "", projectNo: input.projectId === base?.projectId ? base?.projectNo ?? "" : "",
    createdBy: base?.createdBy ?? me, createdByName: base?.createdByName ?? bootstrap.user.name, createdAt: base?.createdAt ?? new Date().toISOString(),
  });
  const conflict = async (failure: unknown) => {
    if (failure instanceof ApiClientError && (failure.status === 409 || failure.status === 404)) { notify(t("TeamBoard.conflict")); await load(); return true; }
    return false;
  };
  // One toast for the save and what reached the person's Outlook.
  const outlook = (calendar: CalendarDelivery) => calendar === "sent" ? ` ${t("TeamBoard.outlookSent")}` : calendar === "failed" ? ` ${t("TeamBoard.outlookFailed")}` : "";
  const create = async (input: TeamTaskInput) => {
    const saved = await createTeamTask(input);
    applyTask(savedTask(null, input, saved));
    notify(`${t("TeamBoard.added")}${outlook(saved.calendar)}`);
  };
  const update = async (task: TeamTask, input: TeamTaskInput, message = "Saved") => {
    try {
      const saved = await updateTeamTask(task.id, input, task.rowVersion);
      const next = savedTask(task, input, saved);
      applyTask(next);
      notify(`${t(message)}${outlook(saved.calendar)}`);
      return next;
    } catch (failure) {
      if (await conflict(failure)) return null;
      throw failure;
    }
  };
  const remove = async (task: TeamTask) => {
    try { const removed = await deleteTeamTask(task.id, task.rowVersion); applyTask(null, task.id); notify(`${t("TeamBoard.deleted")}${outlook(removed.calendar)}`); }
    catch (failure) { if (!(await conflict(failure))) throw failure; }
  };

  const dayLabel = (date: string) => new Intl.DateTimeFormat(localeFor(lang), { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const longDate = (date: string) => new Intl.DateTimeFormat(localeFor(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const shortDate = (date: string | null) => (date ? new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "—");
  const lateDays = (end: string) => workingDays(dateFromDay(dayNumber(end) + 1), today, holidays).length || 1;
  const eventLabel = (event: BoardEvent) => {
    switch (event.kind) {
      case "rfq": case "est": case "prj": {
        const prefix = t(event.kind === "rfq" ? "TeamBoard.chipRfq" : event.kind === "est" ? "TeamBoard.chipEst" : "TeamBoard.chipPrj");
        if (event.item.hidden) return prefix;
        const what = event.kind === "prj" ? event.item.title : event.item.customer || event.item.title;
        return event.late ? `${t("TeamBoard.late")} · ${what}` : `${prefix} · ${what}`;
      }
      case "appointment": return `${t("TeamBoard.chipAppointment")}${timeRange(event.task) ? ` ${timeRange(event.task)}` : ""} · ${event.task.title}`;
      case "task": return timeRange(event.task) ? `${timeRange(event.task)} ${event.task.title}` : event.task.title;
      case "away": return event.task.title;
      case "visit": return `${t("TeamBoard.chipVisit")}${event.visit.time ? ` ${event.visit.time}` : ""}${event.visit.customer ? ` · ${event.visit.customer}` : ""}`;
      case "leave": return t(event.away.kind);
    }
  };
  const eventTitle = (event: BoardEvent) => {
    if (event.kind === "rfq" || event.kind === "est" || event.kind === "prj")
      return event.item.hidden ? t("TeamBoard.hiddenWork") : [event.item.reference, event.item.title, event.item.customer].filter(Boolean).join(" · ");
    if (event.kind === "visit") return [event.visit.number, event.visit.customer].filter(Boolean).join(" · ") || t("TeamBoard.chipVisit");
    if (event.kind === "leave") return t(event.away.kind);
    return "task" in event ? [event.task.title, event.task.customer].filter(Boolean).join(" · ") : "";
  };
  const openEvent = (event: BoardEvent) => {
    if (event.kind === "appointment" || event.kind === "task" || event.kind === "away") setEditing(event.task);
    else if ((event.kind === "rfq" || event.kind === "est" || event.kind === "prj") && !event.item.hidden) openItem(event.item);
  };
  const clickable = (event: BoardEvent) => event.kind === "appointment" || event.kind === "task" || event.kind === "away"
    || ((event.kind === "rfq" || event.kind === "est" || event.kind === "prj") && !event.item.hidden);

  const cell = (userId: number | null, day: (typeof days)[number], load: DayLoad | null, away: boolean, name: string) => {
    const all = (events.get(`${userId ?? 0}|${day.date}`) ?? []).filter((event) => userId !== null || event.kind === "appointment" || event.kind === "task");
    const shown = category ? all.filter((event) => categoryOf(event) === category) : all;
    const band = load ? loadBand(load.utilisation) : "none";
    // Prefixed: a bare "empty" is the app-wide EmptyState box and would turn the cell into a flex column.
    const tone = `tone-${away ? "away" : day.holiday ? "holiday" : load && load.manDays > 0 ? band : "blank"}`;
    return (
      <td key={day.date} className={`board-cell ${tone}${day.today ? " today" : ""}${day.weekStart ? " week-start" : ""}`}
        title={shown.map((event) => eventLabel(event)).join("\n") || undefined}>
        <button type="button" className="board-cell-add" onClick={() => setAdding({ assigneeId: userId, date: day.date })}
          aria-label={fill(t("TeamBoard.addFor"), { name, date: longDate(day.date) })}>
          <Icon name="plus" />
        </button>
        {load && !day.holiday && load.manDays ? <span className="board-pct">{pct(load.utilisation)}</span> : null}
        {shown.slice(0, 2).map((event) => clickable(event)
          ? <button key={event.key} type="button" className={`board-chip ${event.kind}${event.late ? " late" : ""}${"task" in event && event.task.status === "Done" ? " done" : ""}`}
            title={eventTitle(event)} onClick={() => openEvent(event)}>{eventLabel(event)}</button>
          : <span key={event.key} className={`board-chip ${event.kind}`} title={eventTitle(event)}>{eventLabel(event)}</span>)}
        {shown.length > 2 ? <span className="board-more">{fill(t("TeamBoard.moreInCell"), { n: shown.length - 2 })}</span> : null}
      </td>
    );
  };

  const groups = new Map<string, Person[]>();
  for (const person of gridPeople) groups.set(person.user.department || "—", [...(groups.get(person.user.department || "—") ?? []), person]);
  const personName = personId === null ? "" : nameOf.get(personId) ?? "";
  const chip = (key: string, label: string, value: number, active: boolean, onPick: () => void, tone = "", colour?: string) => (
    <button key={key} type="button" className={`board-filter ${tone}${active ? " on" : ""}`} aria-pressed={active} onClick={onPick}>
      {colour ? <i style={{ background: colour }} aria-hidden="true" /> : null}{t(label)} <b>{value}</b>
    </button>
  );

  return (
    <div className="team-board">
      <div className="board-toolbar">
        <SearchInput value={search} onChange={(value) => { setSearch(value); setListShown(LIST_PAGE); }} placeholder={mode === "board" ? "TeamBoard.searchPeople" : "TeamBoard.searchWork"} />
        <label className="select-field">
          <span className="sr-only">{t("TeamBoard.team")}</span>
          <select value={department} aria-label={t("TeamBoard.team")} onChange={(event) => { setDepartment(event.target.value); setListShown(LIST_PAGE); }}>
            <option value={ALL}>{t("TeamBoard.allTeams")}</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <Icon name="chevronDown" />
        </label>
        {mode === "board" ? (
          <div className="board-window" role="group" aria-label={t("TeamBoard.window")}>
            <button type="button" className="icon-btn" aria-label={t("Previous period")} title={t("Previous period")} onClick={() => setStart(dateFromDay(dayNumber(start) - weeks * 7))}><Icon name="chevronLeft" /></button>
            <button type="button" className="btn default sm" onClick={() => setStart(mondayOf(today))}>{t("Today")}</button>
            <button type="button" className="icon-btn" aria-label={t("Next period")} title={t("Next period")} onClick={() => setStart(dateFromDay(dayNumber(start) + weeks * 7))}><Icon name="chevronRight" /></button>
            <span className="board-range">{shortDate(days[0]?.date ?? start)} – {shortDate(days.at(-1)?.date ?? start)}</span>
            <div className="chip-select">
              <button type="button" className={weeks === 2 ? "chip on" : "chip"} aria-pressed={weeks === 2} onClick={() => setWeeks(2)}>{t("TeamBoard.twoWeeks")}</button>
              <button type="button" className={weeks === 4 ? "chip on" : "chip"} aria-pressed={weeks === 4} onClick={() => setWeeks(4)}>{t("TeamBoard.fourWeeks")}</button>
            </div>
          </div>
        ) : null}
        <button type="button" className="btn default" disabled={loading} onClick={() => void load()}><Icon name="refresh" />{t("Refresh")}</button>
        <button type="button" className="btn primary" onClick={() => setAdding({ assigneeId: null, date: today })}><Icon name="plus" />{t("TeamBoard.add")}</button>
      </div>

      <div className="board-filters" role="group" aria-label={t("TeamBoard.chips")}>
        {chip("all", "TeamBoard.all", counts.all, category === null && attention === null, () => { pickCategory(null); pickAttention(null); })}
        {CATEGORIES.map(({ key, label, colour }) => chip(key, label, counts[key], category === key, () => pickCategory(category === key ? null : key), "", colour))}
        <span className="board-sep" aria-hidden="true" />
        {chip("late", "TeamBoard.late", counts.late, attention === "late", () => pickAttention(attention === "late" ? null : "late"), "red")}
        {chip("unassigned", "TeamBoard.unassigned", counts.unassigned, attention === "unassigned", () => pickAttention(attention === "unassigned" ? null : "unassigned"), "amber")}
        {chip("over", "TeamBoard.over", counts.over, attention === "over", () => pickAttention(attention === "over" ? null : "over"), "amber")}
        {personId !== null ? (
          <button type="button" className="board-filter on" onClick={() => setPersonId(null)}>
            {fill(t("TeamBoard.personFilter"), { name: personName })} <Icon name="x" /><span className="sr-only">{t("TeamBoard.clearPerson")}</span>
          </button>
        ) : null}
      </div>

      {error ? <div className="callout danger" role="alert">{error} <button type="button" className="btn ghost sm" onClick={() => void load()}>{t("Refresh")}</button></div> : null}
      {data?.warnings.length ? <div className="callout warning" role="status">{t("Workload.schedulesSkipped")}: {data.warnings.join(", ")}</div> : null}

      {!data ? (
        <div className="panel"><div className="empty">{loading ? <><span className="spinner" />{t("Loading from SQL Server…")}</> : null}</div></div>
      ) : mode === "board" ? (
        <section className="panel board-panel">
          <div className="board-scroll">
            <table className="board-grid" style={{ minWidth: 220 + days.length * (weeks === 2 ? 96 : 64) }}>
              <colgroup><col className="board-who-col" />{days.map((day) => <col key={day.date} />)}</colgroup>
              <thead>
                <tr>
                  <th scope="col" className="board-who">{t("TeamBoard.person")}</th>
                  {days.map((day) => (
                    <th key={day.date} scope="col" className={`${day.today ? "today" : ""}${day.holiday ? " holiday" : ""}${day.weekStart ? " week-start" : ""}`}>
                      {dayLabel(day.date)}{day.today ? <small>{t("TeamBoard.today")}</small> : day.holiday ? <small>{t("TeamBoard.holiday")}</small> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {showUnassigned ? (
                  <>
                    <tr className="board-group"><th colSpan={days.length + 1} scope="colgroup">{t("TeamBoard.unassigned")} · {unassignedTasks.length}</th></tr>
                    <tr className="board-unassigned">
                      <th scope="row" className="board-who">
                        <span className="board-person"><span className="board-avatar warn" aria-hidden="true">?</span>
                          <span><strong>{t("TeamBoard.unassignedRow")}</strong><small>{t("TeamBoard.unassignedHint")}</small></span></span>
                      </th>
                      {days.map((day) => cell(null, day, null, false, t("TeamBoard.unassigned")))}
                    </tr>
                  </>
                ) : null}
                {showPeople ? [...groups].map(([group, members]) => (
                  <GroupRows key={group} label={`${group} · ${members.length}`} span={days.length + 1}>
                    {members.map((person) => (
                      <tr key={person.userId}>
                        <th scope="row" className="board-who">
                          <button type="button" className="board-person" onClick={() => { setPersonId(person.userId); onMode("list"); }}>
                            <span className="board-avatar" aria-hidden="true">{initials(person.user.name)}</span>
                            <span>
                              <strong>{person.user.name}</strong>
                              <span className={`board-load ${loadBand(person.week.utilisation)}`}>
                                {fmt(person.week.manDays)} / {fmt(person.week.available)} MD
                                {(person.week.utilisation ?? 0) > 100 ? ` · ${t("TeamBoard.overShort")}` : (person.week.utilisation ?? 0) < 50 ? ` · ${t("TeamBoard.roomShort")}` : ""}
                              </span>
                              {person.awayDays ? <small>{fill(t("TeamBoard.awayDays"), { n: person.awayDays })}</small> : null}
                            </span>
                          </button>
                        </th>
                        {days.map((day, index) => cell(person.userId, day, person.load[index] ?? null, person.away(day.date), person.user.name))}
                      </tr>
                    ))}
                  </GroupRows>
                )) : null}
                {showPeople && !gridPeople.length ? (
                  <tr><td colSpan={days.length + 1}><EmptyState icon="users" title="Nobody matches the filter" message="Clear the department or search filter to see the team again." /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="board-legend">
            <span><i className="ok" />{t("TeamBoard.legendOk")}</span>
            <span><i className="full" />{t("TeamBoard.legendFull")}</span>
            <span><i className="over" />{t("TeamBoard.legendOver")}</span>
            <span><i className="away" />{t("TeamBoard.legendAway")}</span>
            <span className="muted">{t("TeamBoard.legendHint")}</span>
          </div>
        </section>
      ) : (
        <WorkList
          rows={listRows} shown={listShown} onMore={() => setListShown((n) => n + LIST_PAGE)} today={today} bootstrap={bootstrap} nameOf={nameOf}
          shortDate={shortDate} lateDays={lateDays} canChange={canChange} onCreate={create} onUpdate={update} onEdit={setEditing} openItem={openItem}
        />
      )}
      <p className="workload-method">{t("TeamBoard.method")}</p>

      {adding ? (
        <AddTaskModal
          preset={adding} bootstrap={bootstrap} people={people} personById={personById} days={days} holidays={holidays} longDate={longDate}
          onClose={() => setAdding(null)} onSave={async (input) => { await create(input); setAdding(null); }}
        />
      ) : null}
      {editing ? (
        <TaskDrawer
          task={editing} bootstrap={bootstrap} people={people} personById={personById} days={days} holidays={holidays} longDate={longDate}
          canChange={canChange(editing)} onClose={() => setEditing(null)}
          // Saved, or someone else's change won and the board was reloaded: either way this copy is done.
          onSave={async (input) => { await update(editing, input); setEditing(null); }}
          onDelete={async () => { await remove(editing); setEditing(null); }}
        />
      ) : null}
    </div>
  );
}

function GroupRows({ label, span, children }: { label: string; span: number; children: ReactNode }) {
  return <>
    <tr className="board-group"><th colSpan={span} scope="colgroup">{label}</th></tr>
    {children}
  </>;
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
  bootstrap: BootstrapData; people: Person[]; personById: Map<number, Person>; days: { date: string }[]; holidays: readonly string[];
  longDate: (date: string) => string;
};

/** The fields a team task shares between adding and changing it, with the chosen person's load on its first day. */
function TaskFields({ draft, set, context, disabled = false, focusSubject = false, original = null }: {
  draft: Draft; set: (draft: Draft) => void; context: FormContext; disabled?: boolean; focusSubject?: boolean;
  /** The task as saved, when changing one: its own share is already in the load and is not counted twice. */
  original?: TeamTask | null;
}) {
  const { t } = useLanguage();
  const copy = useSearchCopy();
  const { bootstrap, people, personById, days, holidays, longDate } = context;
  // Someone on the phone types the subject first; after the dialog has put focus on its close button.
  const subject = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusSubject) return;
    const timer = setTimeout(() => subject.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [focusSubject]);
  const personOptions = useMemo<PickerOption[]>(() => bootstrap.team.map((user) => ({ id: user.id, label: user.name, detail: user.department, searchText: `${user.nickname} ${user.email}` })), [bootstrap.team]);
  const customers = useMemo(() => customerOptions(bootstrap.customers), [bootstrap.customers]);
  const auto = defaultTaskManDays(draft.startDate, draft.endDate || draft.startDate, draft.slot, holidays, draft.startTime, draft.endTime);
  const manDays = draft.manDays.trim() === "" ? auto : Number(draft.manDays) || 0;
  const span = draft.startDate ? workingDays(draft.startDate, draft.endDate || draft.startDate, holidays).length || 1 : 1;
  // Each person chosen, with their load on the first day before and after this task (each spends its man-days).
  const ownShare = (userId: number) => original && original.status === "Planned" && original.kind !== "Away" && original.assigneeIds.includes(userId)
    && covers(original.startDate, original.endDate, draft.startDate)
    ? original.manDays / (workingDays(original.startDate, original.endDate, holidays).length || 1) : 0;
  const loads = draft.assigneeIds.map((id) => personById.get(id)).filter((person): person is Person => Boolean(person)).map((person) => {
    const saved = person.load.find((entry) => entry.date === draft.startDate);
    // Without this task as saved: the load it would have otherwise.
    const day = saved && { ...saved, manDays: Math.max(0, saved.manDays - ownShare(person.userId)) };
    return { person, now: withExtra(day, 0), after: withExtra(day, manDays / span), away: person.away(draft.startDate) };
  });
  const shown = days.some((entry) => entry.date === draft.startDate);
  const worst = loads.filter((load) => !load.away && load.after !== null && load.after > 100).sort((a, b) => (b.after ?? 0) - (a.after ?? 0))[0];
  const highest = Math.max(0, ...loads.filter((load) => !load.away).map((load) => load.after ?? 0));
  // Their own team first; someone from another team only if they do planned work at all (not, say, a salesperson).
  const freer = worst
    ? freestOn(people.filter((entry) => !draft.assigneeIds.includes(entry.userId)
      && (entry.user.department === worst.person.user.department || entry.load.some((load) => load.manDays > 0))),
    draft.startDate, 3, (entry) => entry.user.department === worst.person.user.department) : [];
  const swap = (from: number, to: number) => set({ ...draft, assigneeIds: draft.assigneeIds.map((id) => (id === from ? to : id)) });
  const kinds: { kind: TeamTaskKind; label: string }[] = [
    { kind: "Appointment", label: "TeamBoard.kindAppointment" }, { kind: "Task", label: "TeamBoard.kindTask" }, { kind: "Away", label: "TeamBoard.kindAway" },
  ];
  const slots: { slot: TeamTaskSlot; label: string }[] = [
    { slot: "Day", label: "TeamBoard.slotDay" }, { slot: "AM", label: "TeamBoard.slotAm" }, { slot: "PM", label: "TeamBoard.slotPm" }, { slot: "Time", label: "TeamBoard.slotTime" },
  ];
  return (
    <div className="board-form">
      <div className="chip-select" role="group" aria-label={t("TeamBoard.kind")}>
        {kinds.map(({ kind, label }) => (
          <button key={kind} type="button" disabled={disabled} className={draft.kind === kind ? "chip on" : "chip"} aria-pressed={draft.kind === kind} onClick={() => set({ ...draft, kind })}>{t(label)}</button>
        ))}
      </div>
      <label className="field">
        <span>{t("TeamBoard.subject")} <b className="board-req">*</b></span>
        <input ref={subject} required maxLength={300} disabled={disabled} value={draft.title} placeholder={t("TeamBoard.subjectPlaceholder")} onChange={(event) => set({ ...draft, title: event.target.value })} />
      </label>
      <div className="field">
        <span>{t("TeamBoard.customer")}</span>
        <SearchSelect value={draft.customerId} options={customers} onChange={(value) => set({ ...draft, customerId: value })} label={t("TeamBoard.customer")}
          placeholder={t("CRM.searchCustomer")} disabled={disabled} {...copy} />
      </div>
      <div className="field board-people">
        <span>{t("TeamBoard.people")}{draft.kind === "Away" ? <b className="board-req"> *</b> : null}</span>
        {disabled ? (
          <span className="board-people-names">{loads.map((load) => load.person.user.name).join(", ") || t("TeamBoard.unassigned")}</span>
        ) : (
          <SearchMultiPicker options={personOptions} value={draft.assigneeIds} onChange={(assigneeIds) => set({ ...draft, assigneeIds })} label={t("TeamBoard.people")}
            placeholder={t("Schedule.searchPeople")} removeLabel={t("Schedule.removePic")} noMatchText={t("Schedule.noPersonMatch")} allChosenText={t("Schedule.everyoneChosen")} />
        )}
      </div>
      <div className="board-form-row">
        <label className="field">
          <span>{t("TeamBoard.startDate")} <b className="board-req">*</b></span>
          <input type="date" required disabled={disabled} value={draft.startDate}
            onChange={(event) => set({ ...draft, startDate: event.target.value, endDate: !draft.endDate || draft.endDate < event.target.value ? event.target.value : draft.endDate })} />
        </label>
        <label className="field">
          <span>{t("TeamBoard.endDate")}</span>
          <input type="date" disabled={disabled} min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => set({ ...draft, endDate: event.target.value })} />
        </label>
      </div>
      {draft.kind !== "Away" ? (
        <div className="field">
          <span>{t("TeamBoard.timeOfDay")}</span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.timeOfDay")}>
            {slots.map(({ slot, label }) => (
              <button key={slot} type="button" disabled={disabled} className={draft.slot === slot ? "chip on" : "chip"} aria-pressed={draft.slot === slot} onClick={() => set({ ...draft, slot })}>{t(label)}</button>
            ))}
          </div>
          {draft.slot === "Time" ? (
            <div className="board-time-range">
              <label className="field">
                <span>{t("TeamBoard.timeFrom")} <b className="board-req">*</b></span>
                <input type="time" required disabled={disabled} value={draft.startTime} onChange={(event) => set({ ...draft, startTime: event.target.value })} />
              </label>
              <label className="field">
                <span>{t("TeamBoard.timeUntil")} <b className="board-req">*</b></span>
                <input type="time" required disabled={disabled} value={draft.endTime} onChange={(event) => set({ ...draft, endTime: event.target.value })} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      {draft.kind !== "Away" && loads.length ? <p className="muted small board-outlook"><Icon name="calendar" />{t("TeamBoard.outlookHint")}</p> : null}
      {draft.kind === "Away" ? (
        !draft.assigneeIds.length ? <p className="callout warning" role="status">{t("TeamBoard.awayNeedsPerson")}</p> : null
      ) : !loads.length ? (
        <p className="muted small">{t("TeamBoard.noAssigneeHint")}</p>
      ) : !shown ? (
        <p className="muted small">{t("TeamBoard.loadOutside")}</p>
      ) : (
        <div className={`callout ${highest > 100 ? "danger" : highest >= 85 ? "warning" : "info"}`} role="status">
          <span>{fill(t("TeamBoard.loadThatDay"), { date: longDate(draft.startDate) })}</span>
          <ul className="board-loads">
            {loads.map(({ person, now, after, away }) => (
              <li key={person.userId} className={away ? "away" : loadBand(after)}>
                <strong>{person.user.name}</strong> {away ? t("TeamBoard.awayShort") : `${pct(now ?? 0)} → ${pct(after)}`}
              </li>
            ))}
          </ul>
          {worst && freer.length ? (
            <div className="board-freer">
              {fill(t("TeamBoard.swapFor"), { name: worst.person.user.name })}
              {freer.map(({ person: other, utilisation }) => (
                <button key={other.userId} type="button" className="board-free" disabled={disabled} onClick={() => swap(worst.person.userId, other.userId)}>
                  <span className="board-avatar small" aria-hidden="true">{initials(other.user.name)}</span>{other.user.name} {pct(utilisation)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {draft.kind !== "Away" ? (
        <details className="board-more-fields" open={draft.note !== "" || draft.manDays !== ""}>
          <summary>{t("TeamBoard.more")}</summary>
          <div className="board-form-row">
            <label className="field">
              <span>{t("TeamBoard.manDays")}</span>
              <input type="number" min="0" max="999" step="0.5" disabled={disabled} value={draft.manDays} placeholder={fill(t("TeamBoard.manDaysAuto"), { n: fmt(auto) })}
                onChange={(event) => set({ ...draft, manDays: event.target.value })} />
            </label>
            <label className="field">
              <span>{t("TeamBoard.note")}</span>
              <textarea rows={2} maxLength={2000} disabled={disabled} value={draft.note} onChange={(event) => set({ ...draft, note: event.target.value })} />
            </label>
          </div>
        </details>
      ) : null}
    </div>
  );
}

const draftProblem = (draft: Draft) => {
  if (!draft.title.trim() || !draft.startDate) return "";
  if (draft.endDate && draft.endDate < draft.startDate) return "TeamBoard.endBeforeStart";
  if (draft.kind === "Away") return draft.assigneeIds.length ? "" : "TeamBoard.awayNeedsPerson";
  if (draft.slot !== "Time") return "";
  if (!draft.startTime || !draft.endTime) return "TeamBoard.timeNeeded";
  return (draft.endDate || draft.startDate) === draft.startDate && draft.endTime <= draft.startTime ? "TeamBoard.timeOrder" : "";
};
const draftReady = (draft: Draft) => Boolean(draft.title.trim() && draft.startDate) && !draftProblem(draft);

function AddTaskModal({ preset, onClose, onSave, ...context }: FormContext & {
  preset: { assigneeId: number | null; date: string }; onClose: () => void; onSave: (input: TeamTaskInput) => Promise<void>;
}) {
  const { t } = useLanguage();
  const formId = useId();
  const [draft, setDraft] = useState(() => draftOf(null, preset));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async () => {
    if (!draftReady(draft) || busy) return;
    setBusy(true); setError("");
    try { await onSave(inputOf(draft)); }
    catch (failure) { setError(errorText(failure)); setBusy(false); }
  };
  const problem = draftProblem(draft);
  return (
    <Modal title="TeamBoard.addTitle" subtitle="TeamBoard.addHint" onClose={onClose} size="md" footer={<>
      <button type="button" className="btn default" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
      <button type="submit" form={formId} className="btn primary" disabled={busy || !draftReady(draft)}><Icon name="plus" />{t("TeamBoard.addButton")}</button>
    </>}>
      <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <div className="callout danger" role="alert">{error}</div> : null}
        {problem && problem !== "TeamBoard.awayNeedsPerson" ? <div className="callout warning" role="status">{t(problem)}</div> : null}
        <TaskFields draft={draft} set={setDraft} context={context} focusSubject />
      </form>
    </Modal>
  );
}

function TaskDrawer({ task, canChange, onClose, onSave, onDelete, ...context }: FormContext & {
  task: TeamTask; canChange: boolean; onClose: () => void; onSave: (input: TeamTaskInput) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const { t, lang } = useLanguage();
  const copy = useSearchCopy();
  const formId = useId();
  const { bootstrap } = context;
  const [draft, setDraft] = useState(() => draftOf(task));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [history, setHistory] = useState<TeamTaskChange[] | null>(null);
  const [inquiries, setInquiries] = useState<SearchSelectOption[]>([]), [projects, setProjects] = useState<SearchSelectOption[]>([]);
  const canInquiries = bootstrap.permissions.includes("inquiry.read"), canProjects = bootstrap.permissions.includes("project.read");
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTeamTaskHistory(task.id).then(setHistory, () => setHistory([]));
      // The link lists: this customer's RFQs and the projects the reader may open, read once the drawer is open.
      if (canInquiries) void listInquiries({ pageSize: 100, ...(task.customerId ? { customerId: task.customerId } : {}) })
        .then((page) => setInquiries(page.items.map((inquiry) => ({ value: String(inquiry.id), label: `${inquiry.number} · ${inquiry.projectName}`, detail: inquiry.customerName }))), () => undefined);
      if (canProjects) void listProjects({ pageSize: 100 })
        .then((page) => setProjects(page.items.map((project) => ({ value: String(project.id), label: `${project.number} · ${project.name}`, detail: project.customerName }))), () => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [task.id, task.customerId, canInquiries, canProjects]);
  // A linked RFQ or project the lists do not hold still shows by its number.
  const withCurrent = (options: SearchSelectOption[], id: number | null, number: string) =>
    id === null || options.some((option) => option.value === String(id)) ? options : [{ value: String(id), label: number || `#${id}` }, ...options];
  const save = async (next: Draft) => {
    if (!draftReady(next) || busy) return;
    setBusy(true); setError("");
    try { await onSave(inputOf(next)); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const statuses: { status: TeamTaskStatus; label: string }[] = [
    { status: "Planned", label: "TeamBoard.statusPlanned" }, { status: "Done", label: "TeamBoard.statusDone" }, { status: "Cancelled", label: "TeamBoard.statusCancelled" },
  ];
  const when = (value: string) => new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const changed = (change: TeamTaskChange) => {
    if (change.action === "Created") return t("TeamBoard.historyCreated");
    if (change.action === "Deleted") return t("TeamBoard.historyDeleted");
    const before = change.before ?? {}, after = change.after ?? {};
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
    <Drawer title={task.title} subtitle={`${t(kindLabel)} · ${fill(t("TeamBoard.addedBy"), { name: task.createdByName, when: when(task.createdAt) })}`} onClose={onClose} width={560} footer={canChange ? <>
      <button type="button" className="btn ghost board-delete" disabled={busy} onClick={() => { if (window.confirm(t("TeamBoard.confirmDelete"))) void onDelete().catch((failure) => setError(errorText(failure))); }}>
        <Icon name="trash" />{t("TeamBoard.delete")}
      </button>
      <span className="board-spacer" />
      <button type="button" className="btn default" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
      <button type="submit" form={formId} className="btn primary" disabled={busy || !draftReady(draft)}>{t("Save")}</button>
    </> : undefined}>
      <form id={formId} className="board-drawer" onSubmit={(event) => { event.preventDefault(); void save(draft); }}>
        {error ? <div className="callout danger" role="alert">{error}</div> : null}
        {!canChange ? <div className="callout info" role="status">{t("TeamBoard.readOnly")}</div> : null}
        {draftProblem(draft) && draftProblem(draft) !== "TeamBoard.awayNeedsPerson" ? <div className="callout warning" role="status">{t(draftProblem(draft))}</div> : null}
        <TaskFields draft={draft} set={setDraft} context={context} disabled={!canChange || busy} original={task} />
        <div className="field">
          <span>{t("TeamBoard.status")}</span>
          <div className="chip-select" role="group" aria-label={t("TeamBoard.status")}>
            {statuses.map(({ status, label }) => (
              <button key={status} type="button" disabled={!canChange || busy} className={draft.status === status ? "chip on" : "chip"} aria-pressed={draft.status === status}
                onClick={() => setDraft({ ...draft, status })}>{t(label)}</button>
            ))}
          </div>
        </div>
        {task.kind !== "Away" ? (
          <section className="board-box">
            <h3>{t("TeamBoard.links")}</h3>
            <p className="muted small">{t("TeamBoard.linkHint")}</p>
            <div className="board-form-row">
              {canInquiries ? (
                <div className="field">
                  <span>{t("TeamBoard.linkRfq")}</span>
                  <SearchSelect value={draft.inquiryId} options={withCurrent(inquiries, task.inquiryId, task.inquiryNo)} onChange={(value) => setDraft({ ...draft, inquiryId: value })}
                    label={t("TeamBoard.linkRfq")} placeholder={t("TeamBoard.searchRfq")} disabled={!canChange || busy} {...copy} />
                </div>
              ) : null}
              {canProjects ? (
                <div className="field">
                  <span>{t("TeamBoard.linkProject")}</span>
                  <SearchSelect value={draft.projectId} options={withCurrent(projects, task.projectId, task.projectNo)} onChange={(value) => setDraft({ ...draft, projectId: value })}
                    label={t("TeamBoard.linkProject")} placeholder={t("TeamBoard.searchProject")} disabled={!canChange || busy} {...copy} />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
        <section className="board-box">
          <h3>{t("TeamBoard.history")}</h3>
          {history === null ? <span className="spinner" /> : (
            <ul className="board-history">
              {history.map((change) => (
                <li key={`${change.at}-${change.action}-${change.actor}`}>
                  <span className="board-avatar small" aria-hidden="true">{initials(change.actor)}</span>
                  <span><b>{change.actor}</b> {changed(change)} <span className="muted">· {when(change.at)}</span></span>
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
function WorkList({ rows, shown, onMore, today, bootstrap, nameOf, shortDate, lateDays, canChange, onCreate, onUpdate, onEdit, openItem }: {
  rows: ListRow[]; shown: number; onMore: () => void; today: string; bootstrap: BootstrapData; nameOf: Map<number, string>;
  shortDate: (date: string | null) => string; lateDays: (end: string) => number; canChange: (task: TeamTask) => boolean;
  onCreate: (input: TeamTaskInput) => Promise<void>; onUpdate: (task: TeamTask, input: TeamTaskInput, message?: string) => Promise<TeamTask | null>;
  onEdit: (task: TeamTask) => void; openItem: (item: Commitment) => void;
}) {
  const { t } = useLanguage();
  const copy = useSearchCopy();
  const people = useMemo(() => peopleOptions(bootstrap.team), [bootstrap.team]);
  const blank = (): Draft => ({ ...draftOf(null, { date: today }), kind: "Task" });
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const add = async () => {
    if (!draftReady(draft) || busy) return;
    setBusy(true); setError("");
    try { await onCreate(inputOf(draft)); setDraft({ ...blank(), kind: draft.kind, assigneeIds: draft.assigneeIds, startDate: draft.startDate, endDate: draft.startDate }); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const change = async (task: TeamTask, patch: Partial<TeamTaskInput>, message?: string) => {
    try { await onUpdate(task, { ...teamTaskInput(task), ...patch }, message); }
    catch (failure) { setError(errorText(failure)); }
  };
  const visible = rows.slice(0, shown);
  const groupLabel: Record<ReturnType<typeof dueGroup>, string> = {
    late: "TeamBoard.late", thisWeek: "TeamBoard.groupThisWeek", nextWeek: "TeamBoard.groupNextWeek", later: "TeamBoard.groupLater", none: "TeamBoard.groupNone",
  };
  const order: ReturnType<typeof dueGroup>[] = ["late", "thisWeek", "nextWeek", "later", "none"];
  const grouped = order.map((group) => ({ group, rows: visible.filter((row) => (row.late ? "late" : dueGroup(row.end ?? row.start, today)) === group) })).filter((entry) => entry.rows.length);
  // Short names: the column is narrow, and the chips above already say "due".
  const typeLabel = (row: ListRow) => row.visit ? "TeamBoard.chipVisit" : LIST_TYPES[row.category];
  const owners = (row: ListRow) => row.ownerIds.map((id) => nameOf.get(id) ?? `#${id}`).join(", ");
  return (
    <section className="panel board-list">
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      <div className="board-list-scroll">
        <table className="board-table">
          <colgroup><col style={{ width: 112 }} /><col /><col style={{ width: 200 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /><col style={{ width: 96 }} /></colgroup>
          <thead><tr>
            <th scope="col">{t("TeamBoard.kind")}</th><th scope="col">{t("TeamBoard.colWork")}</th><th scope="col">{t("TeamBoard.assignee")}</th>
            <th scope="col">{t("TeamBoard.colStart")}</th><th scope="col">{t("TeamBoard.colDue")}</th><th scope="col" className="num">{t("TeamBoard.colEffort")}</th>
            <th scope="col">{t("TeamBoard.status")}</th><th scope="col"><span className="sr-only">{t("TeamBoard.open")}</span></th>
          </tr></thead>
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
                <input aria-label={t("TeamBoard.subject")} maxLength={300} value={draft.title} placeholder={t("TeamBoard.subjectPlaceholder")}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} />
              </td>
              <td>
                <SearchSelect value={draft.assigneeIds[0] ? String(draft.assigneeIds[0]) : ""} options={people} onChange={(value) => setDraft({ ...draft, assigneeIds: value ? [Number(value)] : [] })} label={t("TeamBoard.assignee")}
                  placeholder={t("CRM.searchPerson")} {...copy} />
              </td>
              <td><input type="date" aria-label={t("TeamBoard.startDate")} value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value, endDate: draft.endDate < event.target.value ? event.target.value : draft.endDate })} /></td>
              <td><input type="date" aria-label={t("TeamBoard.endDate")} min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></td>
              <td><input type="number" className="num" aria-label={t("TeamBoard.manDays")} min="0" max="999" step="0.5" disabled={draft.kind === "Away"} value={draft.manDays}
                placeholder={fmt(defaultTaskManDays(draft.startDate, draft.endDate || draft.startDate, draft.slot === "Time" ? "Day" : draft.slot))} onChange={(event) => setDraft({ ...draft, manDays: event.target.value })} /></td>
              <td><span className="muted small">{t("TeamBoard.statusPlanned")}</span></td>
              <td><button type="button" className="btn primary sm" disabled={busy || !draftReady(draft)} onClick={() => void add()}>{t("TeamBoard.addButton")}</button></td>
            </tr>
            <tr className="board-add-hint"><td colSpan={8}>{draftProblem(draft) ? <span className="red-text">{t(draftProblem(draft))}</span> : <span className="muted small">{t("TeamBoard.quickAddHint")}</span>}</td></tr>
            {grouped.map(({ group, rows: members }) => (
              <GroupRows key={group} label={`${t(groupLabel[group])} · ${members.length}`} span={8}>
                {members.map((row) => (
                  <tr key={row.key} className={row.late ? "late" : undefined}>
                    <td><span className={`board-type ${row.visit ? "visit" : row.category}`}>{t(typeLabel(row))}</span></td>
                    <td>
                      {row.task && canChange(row.task) ? (
                        <InlineText value={row.task.title} label={t("TeamBoard.subject")} onCommit={(title) => void change(row.task!, { title })} />
                      ) : (
                        <span className="board-work">
                          <strong>{row.item ? (row.item.hidden ? t("TeamBoard.hiddenWork") : [row.item.reference, row.item.title].filter(Boolean).join(" · "))
                            : row.task ? row.task.title : row.visit ? row.visit.number || t("TeamBoard.chipVisit") : t(row.away!.kind)}</strong>
                          <small>{row.item?.customer || row.task?.customer || row.visit?.customer || ""}</small>
                        </span>
                      )}
                      {row.task && (row.task.inquiryNo || row.task.projectNo) ? <small className="board-links">{[row.task.inquiryNo, row.task.projectNo].filter(Boolean).join(" · ")}</small> : null}
                    </td>
                    <td>
                      {row.task && canChange(row.task) && row.task.kind !== "Away" && row.task.assigneeIds.length <= 1 ? (
                        <SearchSelect value={row.task.assigneeIds[0] ? String(row.task.assigneeIds[0]) : ""} options={people} label={t("TeamBoard.assignee")}
                          placeholder={t("TeamBoard.unassigned")} onChange={(value) => void change(row.task!, { assigneeIds: value ? [Number(value)] : [] })} {...copy} />
                      ) : <span className={row.ownerIds.length ? "" : "board-need"}>{owners(row) || t("TeamBoard.unassigned")}</span>}
                    </td>
                    <td>
                      {row.task && canChange(row.task) ? (
                        <><input type="date" className="board-inline" aria-label={t("TeamBoard.startDate")} value={row.task.startDate}
                          onChange={(event) => { const startDate = event.target.value; if (startDate) void change(row.task!, { startDate, endDate: row.task!.endDate < startDate ? startDate : row.task!.endDate }); }} />
                        {timeRange(row.task) ? <small className="board-time">{timeRange(row.task)}</small> : null}</>
                      ) : <>{shortDate(row.start)}{row.task && timeRange(row.task) ? <small className="board-time">{timeRange(row.task)}</small> : null}</>}
                    </td>
                    <td>{row.late && row.end ? <span className="red-text">{shortDate(row.end)} · {fill(t("TeamBoard.lateDays"), { n: lateDays(row.end) })}</span> : shortDate(row.end)}</td>
                    <td className="num">
                      {row.task && canChange(row.task) && row.task.kind !== "Away" ? (
                        <InlineNumber value={row.task.manDays} label={t("TeamBoard.manDays")} onCommit={(manDays) => void change(row.task!, { manDays })} />
                      ) : row.manDays === null ? "—" : fmt(row.manDays)}
                    </td>
                    <td>{row.item ? `${t(row.item.status)}${row.item.progress ? ` ${Math.round(row.item.progress)}%` : ""}` : row.visit ? t(row.visit.status) : row.task ? t("TeamBoard.statusPlanned") : ""}</td>
                    <td className="board-actions">
                      {row.task ? <>
                        {canChange(row.task) && row.task.kind !== "Away" ? <button type="button" className="btn default sm" onClick={() => void change(row.task!, { status: "Done" }, "TeamBoard.markedDone")}>{t("TeamBoard.markDone")}</button> : null}
                        <button type="button" className="icon-btn" aria-label={t("TeamBoard.open")} title={t("TeamBoard.open")} onClick={() => onEdit(row.task!)}><Icon name="edit" /></button>
                      </> : row.item && !row.item.hidden ? (
                        <button type="button" className="btn ghost sm" onClick={() => openItem(row.item!)}>{t("TeamBoard.open")}<Icon name="externalLink" /></button>
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
        {rows.length > shown ? <button type="button" className="btn ghost sm" onClick={onMore}>{t("TeamBoard.showMore")}</button> : null}
      </div>
    </section>
  );
}

/** A text cell that saves when it loses focus or on Enter, and only if it changed. */
function InlineText({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // A saved change from elsewhere replaces what the cell shows (derived at render, not in an effect).
  if (seen !== value) { setSeen(value); setText(value); }
  const commit = () => { const next = text.trim(); if (next && next !== value) onCommit(next); else setText(value); };
  return <input className="board-inline" aria-label={label} maxLength={300} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") setText(value); }} />;
}

function InlineNumber({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(String(value)); }
  const commit = () => { const next = Number(text); if (text.trim() !== "" && Number.isFinite(next) && next >= 0 && next <= 999 && next !== value) onCommit(next); else setText(String(value)); };
  return <input className="board-inline num" type="number" min="0" max="999" step="0.5" aria-label={label} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
