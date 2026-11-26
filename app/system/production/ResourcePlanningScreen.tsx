"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { choiceLink, flagLink, idLink, optionalChoiceLink, textLink, useLinkedState, useScreenPlace } from "../screen-link";
import { apiRequest, type BootstrapData } from "../api-client";
import { Badge, Drawer, EmptyState, Field, FilterChips, Icon, Modal, PageHeader, Pagination, Panel, SearchInput, Select, Tabs, type FilterItem, type Tone } from "../ui";
import { useLanguage } from "../i18n";
import { useActivitySubView } from "../use-activity-presence";
import { ResourceTaskWorkspace } from "./ResourceTaskWorkspace";
import { EffortModal, WorkQueue } from "./WorkQueue";
import { WorkloadGantt } from "./WorkloadGantt";
import { TeamBoard } from "./TeamBoard";
import { assignPlanRow, loadWorkload, saveWorkOrder, type Workload, type WorkloadCapacity } from "../resource-workload-client";
import { disciplineOfDepartment } from "../../../backend-node/src/project-cost-model";
import { PLAN_DISCIPLINES, disciplineLabel, isPlanDiscipline } from "../../../lib/plan-discipline";
import {
  awayByDate,
  confirmedManDays,
  isOpenWork,
  orderWork,
  planningLoad,
  planningWeeks,
  projectWork,
  dayNumber,
  dateFromDay,
  resourceCsv,
  weeklyCapacity,
  type Commitment,
} from "../../../lib/resource-planning";
import "./workload.css";
import "./allocation.css";
import "./team-week.css";

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  openProjectSchedule?: (id: number) => void;
  openEstimate?: (id: number) => void;
  openInquiry?: (id: number) => void;
  /** Opens a customer issue's batch on Projects > Punchlist. */
  openIssueBatch?: (batchId: number) => void;
  /** Accepted for the shell's shared props; inquiry ownership is assigned on the Inquiry screen. */
  refreshBootstrap?: () => Promise<void>;
};
// The team board and its list come first (owner decision 2026-10-21); the weekly workload and Tasks need schedule access.
// Team planner (owner decision 2026-11-23) opens first: the daily grid and Team week in one table, in hours, with the
// allocation queue beside it. "board" was the daily grid's tab: its links open Team planner.
type ResourceTab = "week" | "board" | "list" | "workload" | "tasks";
const BOARD_TABS: readonly ResourceTab[] = ["week", "list"];
const PLAN_TABS: readonly ResourceTab[] = ["workload", "tasks"];
type WorkloadView = "table" | "gantt";
type Focus = "over" | "overdue" | "late" | "missing";
// Team overview's link: "#/resources/<tab>?…" with the tab's filters (screen-link.tsx); codecs are made once.
const RESOURCE_TABS: readonly ResourceTab[] = ["week", "board", "list", "workload", "tasks"];
/**
 * Team overview shows two tabs, Team planner and Allocation (owner decision 2026-11-23, "lean it again"); its other
 * views stay one click away under More views. needs: the right each view asks for.
 */
const MORE_VIEWS: readonly { id: ResourceTab; label: string; needs: "board" | "read" }[] = [
  { id: "list", label: "TeamBoard.tabList", needs: "board" },
  { id: "tasks", label: "Workload.tabTasks", needs: "read" },
];
const WORKLOAD_VIEW_LINK = choiceLink<WorkloadView>(["table", "gantt"]);
const WORKLOAD_FOCUS_LINK = optionalChoiceLink<Focus>(["over", "overdue", "late", "missing"]);
const WORKLOAD_WEEKS_LINK = choiceLink<string>(["8", "12", "16", "24"]);
const MANAGER_ROLES = ["Admin", "Engineering Manager", "Project Manager", "Leader"];
const ALL_DEPARTMENTS = "All departments";
const PAGE_SIZE = 50;
const tones: Record<Commitment["type"], Tone> = {
  Inquiry: "blue",
  Estimate: "violet",
  Project: "green",
  Task: "slate",
  Issue: "amber",
};
const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "∞");
const percent = (n: number | null) => (n === null ? "—" : fmt(n) + "%");
const tone = (n: number | null): Tone => (n === null ? "slate" : n > 100 ? "red" : n >= 85 ? "amber" : "green");
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const errorText = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    ? "Request timed out. A save may already have completed. Close the dialog and Refresh before retrying."
    : e instanceof Error
      ? e.message
      : String(e);
const tabStorageKey = (userId: number) => `tomas-tech-resource-plan-tab:${userId}`;
const viewStorageKey = (userId: number) => `tomas-tech-workload-view:${userId}`;
// The tab and view a person last used, so a lead who works in Tasks or the Gantt lands there.
function readStored<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    return choices.find((choice) => choice === value) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* A remembered tab is a convenience when storage is blocked. */
  }
}
const byDueDate = (a: Commitment, b: Commitment) => (a.end ?? "9999-12-31").localeCompare(b.end ?? "9999-12-31") || a.reference.localeCompare(b.reference);

export function ProductionResourcePlan({ bootstrap, notify, openProjectSchedule, openEstimate, openInquiry, openIssueBatch }: Props) {
  const { t } = useLanguage();
  const canRead = bootstrap.permissions.includes("schedule.read") && bootstrap.permissions.includes("project.read");
  const canBoard = bootstrap.permissions.includes("team.board");
  const allowedTabs = [...(canBoard ? BOARD_TABS : []), ...(canRead ? PLAN_TABS : [])];
  // The tab is the link's place; without one, the tab last used here.
  const [opened, place] = useScreenPlace();
  const [storedTab, setTab] = useState<ResourceTab>(() => RESOURCE_TABS.find((tab) => tab === opened[0]) ?? readStored(tabStorageKey(bootstrap.user.id), RESOURCE_TABS, "week"));
  // The daily grid now lives in Team planner; a remembered tab the person may no longer open falls back to the first one they may.
  const wanted: ResourceTab = storedTab === "board" ? "week" : storedTab;
  const tab: ResourceTab = allowedTabs.includes(wanted) ? wanted : (allowedTabs[0] ?? "week");
  const [view, setView] = useLinkedState<WorkloadView>("display", "table", WORKLOAD_VIEW_LINK, {
    legacy: () => readStored<WorkloadView>(viewStorageKey(bootstrap.user.id), ["table", "gantt"], "table"),
  });
  // Team Activity sees which Resource Plan tab is open (keys follow the tab ids).
  useActivitySubView(`resources-${tab}`);
  const [data, setData] = useState<Workload | null>(null);
  // Where the team board puts its actions: beside the page title (2026-11-10 mockup). Set by the element's ref.
  const [boardActions, setBoardActions] = useState<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  // The weekly workload's filters ("w…", apart from the board's) are on the link; the person whose drawer is open too, not remembered.
  const [search, setSearch] = useLinkedState("wq", "", textLink, { remember: false }),
    [department, setDepartment] = useLinkedState("wdept", ALL_DEPARTMENTS, textLink),
    [focus, setFocus] = useLinkedState<Focus | null>("wattention", null, WORKLOAD_FOCUS_LINK),
    [showIdle, setShowIdle] = useLinkedState("widle", false, flagLink),
    [page, setPage] = useState(1);
  const [start, setStart] = useLinkedState("wfrom", dateFromDay(dayNumber(today()) - 14), textLink, { remember: false }),
    [horizon, setHorizon] = useLinkedState("wweeks", "12", WORKLOAD_WEEKS_LINK);
  const [personId, setPersonId] = useLinkedState("wperson", null, idLink, { remember: false }),
    [unassignedOpen, setUnassignedOpen] = useState(false),
    [edit, setEdit] = useState<Commitment | null>(null),
    [capacityUser, setCapacityUser] = useState<number | null>(null),
    [queueDiscipline, setQueueDiscipline] = useState<string>("all"),
    [assigning, setAssigning] = useState<Commitment | null>(null);
  const canPlan = bootstrap.permissions.includes("schedule.plan");
  // Anyone orders their own work; Admin, Engineering Managers, Project Managers and Leaders may order anyone's (the API agrees).
  const manages = (bootstrap.user.roles ?? [bootstrap.user.role]).some((role) => MANAGER_ROLES.includes(role));
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setData(await loadWorkload());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [canRead]);
  // The workload is read when its tab is first shown; a failed read waits for Refresh.
  // The queue beside Team planner reads the same workload.
  const wantsData = canRead && (tab === "workload" || tab === "week") && data === null && !error;
  useEffect(() => {
    if (!wantsData) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [wantsData, load]);
  const changeTab = (next: ResourceTab) => {
    setTab(next);
    store(tabStorageKey(bootstrap.user.id), next);
    place([next]);
  };
  const changeView = (next: WorkloadView) => setView(next);
  // The address names the tab on show, so the page's link opens on it.
  useEffect(() => {
    place([tab], "replace");
  }, [tab, place]);
  const saveOrder = async (userId: number, keys: string[]) => {
    await saveWorkOrder(userId, keys);
    setData((current) => current && { ...current, priorities: [...current.priorities.filter((entry) => entry.userId !== userId), { userId, keys }] });
  };
  const todayIso = today();
  const weeks = useMemo(() => planningWeeks(start || todayIso, Number(horizon)), [start, horizon, todayIso]);
  const rows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase();
    return (
      bootstrap.team
        .filter((user) => department === ALL_DEPARTMENTS || user.department === department)
        .map((user) => {
          const items = data.items.filter((item) => item.ownerId === user.id);
          const saved = data.capacities.find((c) => c.userId === user.id)?.daysPerWeek ?? null;
          const capacity = weeklyCapacity(saved);
          // Their work in their own order, and when each item would be done if worked in that order.
          const order = data.priorities.find((entry) => entry.userId === user.id)?.keys ?? [];
          const ordered = orderWork(items, order);
          const projection = projectWork(ordered, capacity, todayIso, data.holidays);
          const projectedLate = ordered.filter((item) => (projection.get(item.key)?.lateDays ?? 0) > 0).length;
          // Allocation (owner, 2026-11-22): days away come off the capacity, and the hours confirmed stand beside the plan.
          const away = awayByDate(data.away ?? [], user.id, data.holidays);
          const actual = weeks.map((week) => (week.start <= todayIso ? confirmedManDays(data.actuals ?? [], user.id, week.start, week.end) : null));
          return { user, items, saved, capacity, order, ordered, projection, projectedLate, actual, ...planningLoad(items, weeks, capacity, todayIso, data.holidays, away) };
        })
        .filter(
          (row) => !query || row.user.name.toLocaleLowerCase().includes(query) || row.items.some((item) => [item.reference, item.title, item.customer].join(" ").toLocaleLowerCase().includes(query)),
        )
        // The busiest people first, so the decisions sit at the top.
        .sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) || b.open - a.open || a.user.name.localeCompare(b.user.name))
    );
  }, [bootstrap.team, data, department, search, weeks, todayIso]);
  type Row = (typeof rows)[number];
  const matches: Record<Focus, (row: Row) => boolean> = {
    over: (row) => (row.peak ?? 0) > 100,
    overdue: (row) => row.overdue > 0,
    late: (row) => row.projectedLate > 0,
    missing: (row) => row.unknown > 0,
  };
  const chipItems: FilterItem[] = [
    { key: "over", label: "Workload.overCapacity", value: rows.filter(matches.over).length, tone: "red" },
    { key: "overdue", label: "Workload.overdue", value: rows.filter(matches.overdue).length, tone: "amber" },
    { key: "late", label: "Workload.projectedLate", value: rows.filter(matches.late).length, tone: "violet" },
    { key: "missing", label: "Workload.missingEffort", value: rows.filter(matches.missing).length, tone: "slate" },
  ];
  const focused = focus ? rows.filter(matches[focus]) : rows;
  const busy = focused.filter((row) => row.items.length > 0);
  const shown = showIdle ? focused : busy;
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE)),
    currentPage = Math.min(page, pageCount),
    visible = shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const unassigned = (data?.items ?? []).filter((item) => item.ownerId === null);
  // Plan rows waiting for the head to name their people (owner, 2026-11-22); the rest stays in the drawer as before.
  const waiting = unassigned.filter((item) => item.type === "Project" && item.taskId !== undefined && isOpenWork(item));
  const otherUnassigned = unassigned.filter((item) => !waiting.includes(item));
  const waitingShown = waiting
    .filter((item) => queueDiscipline === "all" || (queueDiscipline === "none" ? !isPlanDiscipline(item.discipline) : item.discipline === queueDiscipline))
    .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999") || a.reference.localeCompare(b.reference));
  // The project's manager, an Engineering Manager or an Admin names people; the API checks the project.
  const canAssign = canPlan && manages;
  const person = personId === null ? null : (rows.find((row) => row.user.id === personId) ?? null);
  const currentWeek = weeks.find((week) => week.start <= todayIso && todayIso <= week.end)?.start;
  const departments = [...new Set(bootstrap.team.map((user) => user.department))].sort();
  // A team task opens on the board, not here.
  const open = (item: Commitment) =>
    item.type === "Task" || item.hidden
      ? undefined
      : item.type === "Project"
        ? openProjectSchedule?.(item.entityId)
        : item.type === "Issue"
          ? openIssueBatch?.(item.entityId)
          : item.type === "Estimate"
            ? openEstimate?.(item.entityId)
            : openInquiry?.(item.entityId);
  // Whole-inquiry and estimate effort is planned here; tasks and plan rows carry their own effort.
  // Whole inquiries and estimates are planned by planners with write access; an estimate section also by its own
  // engineers (the API checks the section). Plan tasks and Resource Plan tasks carry their effort in their own plan.
  const canPlanEffort = (item: Commitment) =>
    item.effort !== undefined &&
    ((item.effort.kind === "EstimateSection" && item.ownerId === bootstrap.user.id) ||
      (canPlan && bootstrap.permissions.includes(item.effort.kind === "Inquiry" ? "inquiry.write" : "estimate.write")));
  const filtered = (apply: () => void) => {
    apply();
    setPage(1);
  };
  const shiftWindow = (direction: -1 | 1) => filtered(() => setStart(dateFromDay(dayNumber(start || todayIso) + direction * Number(horizon) * 7)));
  const saved = async () => {
    await load();
    notify(t("Saved"));
  };
  const exportPlan = () => {
    const rowsOut: unknown[][] = [
      ["Engineer", "Department", "Type", "Reference", "Description", "Customer", "Start", "Finish", "Man-days (person share)", "Progress", "Status", ...weeks.map((w) => w.start + " MD")],
    ];
    for (const row of rows)
      for (const item of row.items)
        rowsOut.push([
          row.user.name,
          row.user.department,
          item.type,
          item.reference,
          item.title,
          item.customer,
          item.start,
          item.end,
          item.manDays ?? "Not planned",
          item.progress,
          item.status,
          ...planningLoad([item], weeks, row.capacity, todayIso, data?.holidays ?? []).weekly.map((w) => w.manDays),
        ]);
    const blob = new Blob([resourceCsv(rowsOut)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "resource-plan-" + todayIso + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Allocation (owner, 2026-11-22): rows a PM added with a discipline and no PIC, for the head to name the people.
  const queuePanel = waiting.length ? (
    <Panel title="Alloc.queueTitle" subtitle="Alloc.queueSubtitle" guide="alloc.queue" flush>
      <div className="alloc-queue-filter" role="group" aria-label={t("Plan.discipline")}>
        {(["all", ...PLAN_DISCIPLINES, "none"] as const).map((key) => {
          const count = key === "all" ? waiting.length : waiting.filter((item) => (key === "none" ? !isPlanDiscipline(item.discipline) : item.discipline === key)).length;
          if (key !== "all" && !count) return null;
          return (
            <button key={key} type="button" className={queueDiscipline === key ? "chip on" : "chip"} aria-pressed={queueDiscipline === key} onClick={() => setQueueDiscipline(key)}>
              {t(key === "all" ? "Alloc.all" : key === "none" ? "Alloc.noDiscipline" : disciplineLabel(key))}
              <em>{count}</em>
            </button>
          );
        })}
      </div>
      <ul className="alloc-queue">
        {waitingShown.map((item) => (
          <li key={item.key}>
            <div className="alloc-queue-main">
              <button type="button" className="workload-item-link" onClick={() => open(item)}>
                {item.reference}
              </button>
              <strong>{item.title}</strong>
              <small>
                {item.customer ? `${item.customer} · ` : ""}
                {item.start ?? "—"} → {item.end ?? "—"} · {item.manDays === null ? t("Workload.missingEffort") : `${fmt(item.manDays)} MD`}
              </small>
            </div>
            <Badge tone={isPlanDiscipline(item.discipline) ? "blue" : "slate"}>{t(isPlanDiscipline(item.discipline) ? disciplineLabel(item.discipline) : "Alloc.noDiscipline")}</Badge>
            {canAssign ? (
              <button type="button" className="btn primary sm" data-guide="alloc.assign" onClick={() => setAssigning(item)}>
                <Icon name="users" />
                {t("Alloc.assign")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  ) : null;
  if (!allowedTabs.length) return <EmptyState icon="shield" title={t("Permission denied")} message="team.board" />;
  const onBoard = tab === "list";
  const moreViews = MORE_VIEWS.filter((view) => (view.needs === "board" ? canBoard : canRead));
  const moreActive = moreViews.find((view) => view.id === tab);
  return (
    <div className="workload-page">
      <PageHeader
        title="Team overview"
        subtitle={tab === "week" ? "TeamWeek.subtitle" : onBoard ? "TeamBoard.subtitle" : "Workload.subtitle"}
        actions={
          tab === "workload" ? (
            <>
              <button className="btn default" type="button" disabled={!data} onClick={exportPlan}>
                <Icon name="download" />
                {t("Export plan")} CSV
              </button>
              <button className="btn default" type="button" disabled={loading} onClick={() => void load()}>
                <Icon name="refresh" />
                {t("Refresh")}
              </button>
            </>
          ) : onBoard || tab === "week" ? (
            <div className="board-page-actions" ref={setBoardActions} />
          ) : null
        }
      />
      <div className="team-tabs-row">
        <Tabs
          active={tab}
          onChange={changeTab}
          link={null}
          tabs={[...(canBoard ? [{ id: "week" as const, label: "TeamWeek.tab" }] : []), ...(canRead ? [{ id: "workload" as const, label: "TeamBoard.tabWeekly" }] : [])]}
        />
        {moreViews.length ? (
          <details className={moreActive ? "team-more on" : "team-more"} data-guide="team.more">
            <summary className="btn default sm">
              <Icon name="more" />
              {t(moreActive ? moreActive.label : "TeamOverview.moreViews")}
              <Icon name="chevronDown" />
            </summary>
            <div className="team-more-menu" role="menu">
              {moreViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  role="menuitem"
                  aria-current={view.id === tab ? "true" : undefined}
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    changeTab(view.id);
                  }}
                >
                  {t(view.label)}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {tab === "week" ? (
        // Team planner: the board's grid in hours, the allocation queue beside it; an old daily-grid link opens two weeks.
        <TeamBoard
          bootstrap={bootstrap}
          notify={notify}
          mode="board"
          onMode={changeTab}
          today={todayIso}
          openItem={open}
          onChanged={() => setData(null)}
          actionsSlot={boardActions}
          queue={canRead ? queuePanel : null}
          queueCount={canRead ? waiting.length : 0}
          fromOldBoard={opened[0] === "board"}
        />
      ) : onBoard ? (
        <TeamBoard bootstrap={bootstrap} notify={notify} mode={tab} onMode={changeTab} today={todayIso} openItem={open} onChanged={() => setData(null)} actionsSlot={boardActions} />
      ) : tab === "tasks" ? (
        <ResourceTaskWorkspace bootstrap={bootstrap} notify={notify} linked onChanged={() => setData(null)} openProjectSchedule={openProjectSchedule} />
      ) : (
        <>
          {error ? (
            <div className="callout danger" role="alert">
              {error} {t("Displayed data may be stale. Refresh before planning.")}
              <button className="btn ghost sm" type="button" onClick={() => void load()}>
                {t("Refresh")}
              </button>
            </div>
          ) : null}
          {data?.warnings.length ? (
            <div className="callout warning" role="status">
              {t("Workload.schedulesSkipped")}: {data.warnings.join(", ")}
            </div>
          ) : null}
          <div className="toolbar workload-toolbar">
            <SearchInput value={search} onChange={(value) => filtered(() => setSearch(value))} placeholder={t("Search engineer, inquiry, project or customer…")} />
            <Select label="Department" value={department} onChange={(value) => filtered(() => setDepartment(value))} options={[ALL_DEPARTMENTS, ...departments]} />
            <div className="chip-select" role="group" aria-label={t("Workload.view")}>
              <button type="button" className={view === "table" ? "chip on" : "chip"} aria-pressed={view === "table"} onClick={() => changeView("table")}>
                <Icon name="table" />
                {t("Workload.viewTable")}
              </button>
              <button type="button" className={view === "gantt" ? "chip on" : "chip"} aria-pressed={view === "gantt"} onClick={() => changeView("gantt")}>
                <Icon name="calendar" />
                {t("Workload.viewGantt")}
              </button>
            </div>
            {view === "table" ? (
              <div className="workload-window" role="group" aria-label={t("Planning window")}>
                <button type="button" className="icon-btn" onClick={() => shiftWindow(-1)} title={t("Previous period")} aria-label={t("Previous period")}>
                  <Icon name="chevronLeft" />
                </button>
                <button type="button" className="btn default sm" onClick={() => filtered(() => setStart(dateFromDay(dayNumber(todayIso) - 14)))}>
                  {t("Today")}
                </button>
                <button type="button" className="icon-btn" onClick={() => shiftWindow(1)} title={t("Next period")} aria-label={t("Next period")}>
                  <Icon name="chevronRight" />
                </button>
                <Select label="Weeks" value={horizon} onChange={(value) => filtered(() => setHorizon(value))} options={["8", "12", "16", "24"]} />
                <span className="muted">{t("weeks")}</span>
              </div>
            ) : null}
          </div>
          <FilterChips label="Workload.chips" items={chipItems} active={focus} onPick={(key) => filtered(() => setFocus(key as Focus | null))} />
          {queuePanel}
          <Panel
            title={view === "gantt" ? "Workload.ganttTitle" : "Workload.byWeek"}
            subtitle={view === "gantt" ? "Workload.ganttSubtitle" : "Planned man-days / available man-days · green under 85%, amber up to 100%, red above"}
            actions={
              <div className="workload-panel-actions">
                {otherUnassigned.length ? (
                  <button type="button" className="btn ghost sm" onClick={() => setUnassignedOpen(true)}>
                    <Icon name="alertCircle" />
                    {t("Workload.unassigned").replace("{n}", String(otherUnassigned.length))}
                  </button>
                ) : null}
                {focused.length > busy.length ? (
                  <button type="button" className="btn default sm" onClick={() => filtered(() => setShowIdle(!showIdle))}>
                    {t(showIdle ? "Hide people without work" : "Show all engineers")}
                  </button>
                ) : null}
              </div>
            }
            flush
          >
            {!data ? (
              <div className="empty">
                {loading ? (
                  <>
                    <span className="spinner" />
                    {t("Loading from SQL Server…")}
                  </>
                ) : null}
              </div>
            ) : !rows.length ? (
              <EmptyState icon="users" title="Nobody matches the filter" message="Clear the department or search filter to see the team again." />
            ) : view === "gantt" ? (
              <WorkloadGantt people={shown} today={todayIso} onPerson={setPersonId} onOpen={open} />
            ) : (
              <>
                <div className="table-wrap workload-heat-wrap">
                  <table className="heat workload-heat">
                    <thead>
                      <tr>
                        <th>{t("Workload.person")}</th>
                        <th className="num">{t("Workload.open")}</th>
                        {weeks.map((week) => (
                          <th key={week.start} className={`num${week.start === currentWeek ? " current" : ""}`} title={`${week.start} – ${week.end}`}>
                            {week.start.slice(5).replace("-", "/")}
                          </th>
                        ))}
                        <th>{t("Workload.capacity")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.user.id}>
                          <td>
                            <button type="button" className="workload-person" onClick={() => setPersonId(row.user.id)}>
                              <span className="workload-avatar">{initials(row.user.name)}</span>
                              <span>
                                <strong>{row.user.name}</strong>
                                <small>{row.user.department}</small>
                              </span>
                            </button>
                          </td>
                          <td className="num">
                            <strong>{row.open}</strong>
                            {row.overdue ? (
                              <small className="workload-late">
                                {row.overdue} {t("overdue")}
                              </small>
                            ) : null}
                            {row.projectedLate ? <small className="workload-projected">{t("WorkQueue.lateCount").replace("{n}", String(row.projectedLate))}</small> : null}
                          </td>
                          {row.weekly.map((w, index) => (
                            <td key={w.week.start} className="num">
                              <span className={"heat-cell " + (w.manDays > 0 ? tone(w.utilisation) : "slate")} title={`${fmt(w.manDays)} / ${w.available === null ? "—" : fmt(w.available)} MD`}>
                                {w.manDays > 0 ? percent(w.utilisation) : "—"}
                              </span>
                              {w.manDays > 0 ? <small className="workload-days">{fmt(w.manDays)} MD</small> : null}
                              {(row.actual[index] ?? 0) > 0 ? <small className="workload-actual">{t("Alloc.actual").replace("{md}", fmt(row.actual[index] ?? 0))}</small> : null}
                              {w.awayDays > 0 ? <small className="workload-away">{t("Alloc.away").replace("{days}", fmt(w.awayDays))}</small> : null}
                            </td>
                          ))}
                          <td>
                            <button type="button" className="capacity-button" disabled={!canPlan} title={t("Weekly capacity")} onClick={() => setCapacityUser(row.user.id)}>
                              {fmt(row.capacity)} MD
                              {row.saved === null ? <small>{t("Workload.defaultCapacity")}</small> : null}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!visible.length ? (
                        <tr>
                          <td colSpan={weeks.length + 3}>
                            <div className="workload-empty">
                              <Icon name="users" />
                              <span>{t("No planned workload in this period")}</span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={currentPage}
                  pageCount={pageCount}
                  from={shown.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
                  to={Math.min(currentPage * PAGE_SIZE, shown.length)}
                  total={shown.length}
                  onPage={setPage}
                />
              </>
            )}
          </Panel>
          <p className="workload-method">{t("Workload.method")}</p>
        </>
      )}
      {person ? (
        <Drawer title={person.user.name} subtitle={person.user.department} onClose={() => setPersonId(null)} width={620}>
          <p className="workload-drawer-summary">{t("Workload.personSummary").replace("{open}", String(person.open)).replace("{md}", fmt(person.committed)).replace("{peak}", percent(person.peak))}</p>
          <div className="workload-drawer-capacity">
            <span>
              {t("Weekly capacity")}: <strong>{fmt(person.capacity)} MD</strong>
              {person.saved === null ? <small> ({t("Workload.defaultCapacity")})</small> : null}
            </span>
            {canPlan ? (
              <button type="button" className="btn ghost sm" onClick={() => setCapacityUser(person.user.id)}>
                <Icon name="edit" />
                {t("Workload.changeCapacity")}
              </button>
            ) : null}
          </div>
          <WorkQueue
            items={person.items}
            order={person.order}
            capacity={person.capacity}
            today={todayIso}
            holidays={data?.holidays ?? []}
            editable={person.user.id === bootstrap.user.id || manages}
            canRequestDays={person.user.id === bootstrap.user.id && bootstrap.permissions.includes("schedule.progress")}
            canPlanEffort={canPlanEffort}
            onOpen={open}
            canOpen={(item) => item.type !== "Task"}
            onEffort={setEdit}
            onSaveOrder={(keys) => saveOrder(person.user.id, keys)}
            onRequested={() => {
              notify(t("WorkQueue.requestSent"));
              void load();
            }}
          />
        </Drawer>
      ) : null}
      {unassignedOpen ? (
        <Drawer title="Workload.unassignedTitle" subtitle="Workload.unassignedHint" onClose={() => setUnassignedOpen(false)} width={620}>
          <WorkList items={otherUnassigned} today={todayIso} canPlanEffort={() => false} onOpen={open} onEffort={setEdit} />
        </Drawer>
      ) : null}
      {edit?.effort ? (
        <EffortModal
          item={{ ...edit, effort: edit.effort }}
          current={data?.efforts.find((e) => e.entityType === edit.effort!.kind && e.entityId === edit.effort!.id)}
          onClose={() => setEdit(null)}
          onSaved={saved}
        />
      ) : null}
      {assigning && data ? (
        <AssignPlanRowModal
          item={assigning}
          team={bootstrap.team}
          data={data}
          today={todayIso}
          onClose={() => setAssigning(null)}
          onAssigned={async (names) => {
            setAssigning(null);
            notify(t("Alloc.assigned").replace("{n}", names));
            await load();
          }}
        />
      ) : null}
      {capacityUser !== null && <CapacityModal initialUser={capacityUser} team={bootstrap.team} capacities={data?.capacities ?? []} onClose={() => setCapacityUser(null)} onSaved={saved} />}
    </div>
  );
}

/** One person's open work, soonest due first: where it comes from, its dates, its effort and the way to it. */
function WorkList({
  items,
  today,
  canPlanEffort,
  onOpen,
  onEffort,
}: {
  items: Commitment[];
  today: string;
  canPlanEffort: (item: Commitment) => boolean;
  onOpen: (item: Commitment) => void;
  onEffort: (item: Commitment) => void;
}) {
  const { t } = useLanguage();
  if (!items.length) return <EmptyState icon="checkCircle" title="Workload.noOpenWork" message="Workload.noOpenWorkHint" />;
  return (
    <ul className="workload-items">
      {[...items].sort(byDueDate).map((item) => (
        <li key={item.key}>
          <div className="workload-item-head">
            <Badge tone={tones[item.type]}>
              {t(item.type === "Task" ? (item.taskKind === "Appointment" ? "TeamBoard.kindAppointment" : "TeamBoard.kindTask") : item.type === "Issue" ? "Issues.typeLabel" : item.type)}
            </Badge>
            {item.type === "Task" ? null : (
              <button type="button" className="workload-item-link" onClick={() => onOpen(item)}>
                {item.reference}
              </button>
            )}
            {item.end && item.end < today ? <Badge tone="red">{t("overdue")}</Badge> : null}
            {item.tentative ? <Badge tone="amber">{t("Workload.awaitingApproval")}</Badge> : null}
          </div>
          <strong>{item.title}</strong>
          <small>
            {item.customer ? `${item.customer} · ` : ""}
            {item.start ?? "—"} → {item.end ?? "—"} · {fmt(item.progress)}% · {t(item.status)}
          </small>
          <div className="workload-item-effort">
            {item.manDays === null ? <Badge tone="amber">{t("Workload.missingEffort")}</Badge> : <span>{fmt(item.manDays)} MD</span>}
            {canPlanEffort(item) ? (
              <button type="button" className="btn ghost sm" onClick={() => onEffort(item)}>
                <Icon name="edit" />
                {t("Plan effort")}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Names the people of a plan row waiting in the Allocation queue (owner, 2026-11-22). Everyone in the team is offered,
 * the row's discipline first (department as Projects > Cost reads it; Installation takes anyone), then the freest:
 * capacity less leave less planned work over the weeks the row runs. Anyone picked who is not on the project joins it.
 */
function AssignPlanRowModal({
  item,
  team,
  data,
  today,
  onClose,
  onAssigned,
}: {
  item: Commitment;
  team: BootstrapData["team"];
  data: Workload;
  today: string;
  onClose: () => void;
  onAssigned: (names: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wanted = isPlanDiscipline(item.discipline) ? item.discipline : null;
  const candidates = useMemo(() => {
    const start = item.start ?? today,
      end = item.end ?? start;
    const span = planningWeeks(start, Math.min(26, Math.max(1, Math.ceil((dayNumber(end) - dayNumber(start) + 1) / 7) + 1))).filter((week) => week.start <= end);
    return team
      .map((user) => {
        const capacity = weeklyCapacity(data.capacities.find((entry) => entry.userId === user.id)?.daysPerWeek ?? null);
        const load = planningLoad(
          data.items.filter((work) => work.ownerId === user.id),
          span,
          capacity,
          today,
          data.holidays,
          awayByDate(data.away ?? [], user.id, data.holidays),
        );
        const free = load.weekly.reduce((sum, week) => sum + (week.available ?? 0) - week.manDays, 0);
        const matches = !wanted || wanted === "Installation" || disciplineOfDepartment(user.department) === wanted;
        return { user, free, matches };
      })
      .sort((a, b) => Number(b.matches) - Number(a.matches) || b.free - a.free || a.user.name.localeCompare(b.user.name));
  }, [team, data, item.start, item.end, today, wanted]);
  const toggle = (id: number) => setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const submit = async () => {
    if (!picked.length || item.taskId === undefined) return;
    setBusy(true);
    setError("");
    try {
      await assignPlanRow(item.taskId, picked);
      await onAssigned(
        team
          .filter((user) => picked.includes(user.id))
          .map((user) => user.name)
          .join(", "),
      );
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };
  const group = (matches: boolean) => candidates.filter((candidate) => candidate.matches === matches);
  const row = ({ user, free }: (typeof candidates)[number]) => (
    <li key={user.id}>
      <label className="alloc-candidate">
        <input type="checkbox" checked={picked.includes(user.id)} disabled={busy} onChange={() => toggle(user.id)} />
        <span className="alloc-candidate-name">
          <strong>{user.name}</strong>
          <small>{user.department}</small>
        </span>
        <Badge tone={free < 0 ? "red" : item.manDays !== null && free < item.manDays ? "amber" : "green"}>{t(free < 0 ? "Alloc.over" : "Alloc.free").replace("{md}", fmt(Math.abs(free)))}</Badge>
      </label>
    </li>
  );
  return (
    <Modal
      title="Alloc.assignTitle"
      subtitle={`${item.reference} · ${item.title}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn primary" data-guide="alloc.assignSave" disabled={busy || !picked.length} onClick={() => void submit()}>
            <Icon name="check" />
            {busy ? t("Saving…") : `${t("Alloc.assign")}${picked.length ? ` (${picked.length})` : ""}`}
          </button>
        </>
      }
    >
      {error ? (
        <div className="callout danger" role="alert">
          {t(error)}
        </div>
      ) : null}
      <p className="alloc-assign-facts">
        <Badge tone={wanted ? "blue" : "slate"}>{t(wanted ? disciplineLabel(wanted) : "Alloc.noDiscipline")}</Badge>
        <span>
          {item.start ?? "—"} → {item.end ?? "—"} · {item.manDays === null ? t("Workload.missingEffort") : `${fmt(item.manDays)} MD`}
        </span>
      </p>
      <p className="muted alloc-assign-hint">
        {t("Alloc.freeHead")} · {t("Alloc.joinsProject")}
      </p>
      {wanted && wanted !== "Installation" ? (
        <>
          <h4 className="alloc-group">{t("Alloc.matching")}</h4>
          <ul className="alloc-candidates">{group(true).map(row)}</ul>
          <h4 className="alloc-group">{t("Alloc.otherPeople")}</h4>
          <ul className="alloc-candidates">{group(false).map(row)}</ul>
        </>
      ) : (
        <ul className="alloc-candidates">{candidates.map(row)}</ul>
      )}
    </Modal>
  );
}

function CapacityModal({
  initialUser,
  team,
  capacities,
  onClose,
  onSaved,
}: {
  initialUser: number;
  team: BootstrapData["team"];
  capacities: WorkloadCapacity[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage(),
    [user, setUser] = useState(initialUser),
    [amount, setAmount] = useState(String(weeklyCapacity(capacities.find((c) => c.userId === initialUser)?.daysPerWeek))),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={t("Weekly capacity")} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await apiRequest("/api/v1/resource-planning/capacity/" + user, {
              method: "PUT",
              body: JSON.stringify({
                daysPerWeek: Number(amount),
                rowVersion: capacities.find((c) => c.userId === user)?.rowVersion ?? null,
              }),
            });
            await onSaved();
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{t("Workload.capacityHint")}</p>
        <Field label={t("Engineer")}>
          <select
            value={user}
            onChange={(e) => {
              const id = Number(e.target.value);
              setUser(id);
              setAmount(String(weeklyCapacity(capacities.find((c) => c.userId === id)?.daysPerWeek)));
            }}
          >
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Working days per week (Monday–Friday)")}>
          <input required type="number" min="0" max="5" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="red-text">
            {error}
          </p>
        )}
        <button className="btn primary" disabled={busy}>
          {t("Save")}
        </button>
      </form>
    </Modal>
  );
}
