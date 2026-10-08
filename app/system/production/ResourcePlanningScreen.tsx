"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  FilterChips,
  Icon,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  Tabs,
  type FilterItem,
  type Tone,
} from "../ui";
import { useLanguage } from "../i18n";
import { useActivitySubView } from "../use-activity-presence";
import { ResourceTaskWorkspace } from "./ResourceTaskWorkspace";
import { EffortModal, WorkQueue } from "./WorkQueue";
import { WorkloadGantt } from "./WorkloadGantt";
import { loadWorkload, saveWorkOrder, type Workload, type WorkloadCapacity } from "../resource-workload-client";
import {
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

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  openProjectSchedule?: (id: number) => void;
  openEstimate?: (id: number) => void;
  openInquiry?: (id: number) => void;
  /** Accepted for the shell's shared props; inquiry ownership is assigned on the Inquiry screen. */
  refreshBootstrap?: () => Promise<void>;
};
type ResourceTab = "workload" | "tasks";
type WorkloadView = "table" | "gantt";
type Focus = "over" | "overdue" | "late" | "missing";
const MANAGER_ROLES = ["Admin", "Engineering Manager", "Project Manager"];
const ALL_DEPARTMENTS = "All departments";
const PAGE_SIZE = 50;
const tones: Record<Commitment["type"], Tone> = {
  Inquiry: "blue",
  Estimate: "violet",
  Project: "green",
};
const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "∞";
const percent = (n: number | null) => (n === null ? "—" : fmt(n) + "%");
const tone = (n: number | null): Tone =>
  n === null ? "slate" : n > 100 ? "red" : n >= 85 ? "amber" : "green";
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
  try { window.localStorage.setItem(key, value); } catch { /* A remembered tab is a convenience when storage is blocked. */ }
}
const byDueDate = (a: Commitment, b: Commitment) =>
  (a.end ?? "9999-12-31").localeCompare(b.end ?? "9999-12-31") || a.reference.localeCompare(b.reference);

export function ProductionResourcePlan({
  bootstrap,
  notify,
  openProjectSchedule,
  openEstimate,
  openInquiry,
}: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<ResourceTab>(() => readStored(tabStorageKey(bootstrap.user.id), ["workload", "tasks"], "workload"));
  const [view, setView] = useState<WorkloadView>(() => readStored(viewStorageKey(bootstrap.user.id), ["table", "gantt"], "table"));
  // Team Activity sees which Resource Plan tab is open (keys follow the tab ids).
  useActivitySubView(`resources-${tab}`);
  const [data, setData] = useState<Workload | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState(ALL_DEPARTMENTS),
    [focus, setFocus] = useState<Focus | null>(null),
    [showIdle, setShowIdle] = useState(false),
    [page, setPage] = useState(1);
  const [start, setStart] = useState(() => dateFromDay(dayNumber(today()) - 14)),
    [horizon, setHorizon] = useState("12");
  const [personId, setPersonId] = useState<number | null>(null),
    [unassignedOpen, setUnassignedOpen] = useState(false),
    [edit, setEdit] = useState<Commitment | null>(null),
    [capacityUser, setCapacityUser] = useState<number | null>(null);
  const canRead =
    bootstrap.permissions.includes("schedule.read") &&
    bootstrap.permissions.includes("project.read");
  const canPlan = bootstrap.permissions.includes("schedule.plan");
  // Anyone orders their own work; Admin, Engineering Managers and Project Managers may order anyone's (the API agrees).
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
  const wantsData = canRead && tab === "workload" && data === null && !error;
  useEffect(() => {
    if (!wantsData) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [wantsData, load]);
  const changeTab = (next: ResourceTab) => {
    setTab(next);
    store(tabStorageKey(bootstrap.user.id), next);
  };
  const changeView = (next: WorkloadView) => {
    setView(next);
    store(viewStorageKey(bootstrap.user.id), next);
  };
  const saveOrder = async (userId: number, keys: string[]) => {
    await saveWorkOrder(userId, keys);
    setData((current) => current && { ...current, priorities: [...current.priorities.filter((entry) => entry.userId !== userId), { userId, keys }] });
  };
  const todayIso = today();
  const weeks = useMemo(() => planningWeeks(start || todayIso, Number(horizon)), [start, horizon, todayIso]);
  const rows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase();
    return bootstrap.team
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
        return { user, items, saved, capacity, order, ordered, projection, projectedLate, ...planningLoad(items, weeks, capacity, todayIso, data.holidays) };
      })
      .filter((row) =>
        !query ||
        row.user.name.toLocaleLowerCase().includes(query) ||
        row.items.some((item) => [item.reference, item.title, item.customer].join(" ").toLocaleLowerCase().includes(query)))
      // The busiest people first, so the decisions sit at the top.
      .sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) || b.open - a.open || a.user.name.localeCompare(b.user.name));
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
  const person = personId === null ? null : rows.find((row) => row.user.id === personId) ?? null;
  const currentWeek = weeks.find((week) => week.start <= todayIso && todayIso <= week.end)?.start;
  const departments = [...new Set(bootstrap.team.map((user) => user.department))].sort();
  const open = (item: Commitment) =>
    item.type === "Project"
      ? openProjectSchedule?.(item.entityId)
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
  const shiftWindow = (direction: -1 | 1) =>
    filtered(() => setStart(dateFromDay(dayNumber(start || todayIso) + direction * Number(horizon) * 7)));
  const saved = async () => {
    await load();
    notify(t("Saved"));
  };
  const exportPlan = () => {
    const rowsOut: unknown[][] = [
      [
        "Engineer",
        "Department",
        "Type",
        "Reference",
        "Description",
        "Customer",
        "Start",
        "Finish",
        "Man-days (person share)",
        "Progress",
        "Status",
        ...weeks.map((w) => w.start + " MD"),
      ],
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
  if (!canRead)
    return (
      <EmptyState
        icon="shield"
        title={t("Permission denied")}
        message="project.read + schedule.read"
      />
    );
  return (
    <div className="workload-page">
      <PageHeader
        eyebrow="ENGINEERING RESOURCE"
        title="Workload.title"
        subtitle="Workload.subtitle"
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
          ) : null
        }
      />
      <Tabs
        active={tab}
        onChange={changeTab}
        tabs={[
          { id: "workload", label: "Workload.title" },
          { id: "tasks", label: "Workload.tabTasks" },
        ]}
      />
      {tab === "tasks" ? (
        <ResourceTaskWorkspace bootstrap={bootstrap} notify={notify} onChanged={() => setData(null)} openProjectSchedule={openProjectSchedule} />
      ) : (
        <>
          {error ? (
            <div className="callout danger" role="alert">
              {error} {t("Displayed data may be stale. Refresh before planning.")}
              <button className="btn ghost sm" type="button" onClick={() => void load()}>{t("Refresh")}</button>
            </div>
          ) : null}
          {data?.warnings.length ? (
            <div className="callout warning" role="status">
              {t("Workload.schedulesSkipped")}: {data.warnings.join(", ")}
            </div>
          ) : null}
          <div className="toolbar workload-toolbar">
            <SearchInput
              value={search}
              onChange={(value) => filtered(() => setSearch(value))}
              placeholder={t("Search engineer, inquiry, project or customer…")}
            />
            <Select
              label="Department"
              value={department}
              onChange={(value) => filtered(() => setDepartment(value))}
              options={[ALL_DEPARTMENTS, ...departments]}
            />
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
            {view === "table" ? <div className="workload-window" role="group" aria-label={t("Planning window")}>
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
            </div> : null}
          </div>
          <FilterChips label="Workload.chips" items={chipItems} active={focus} onPick={(key) => filtered(() => setFocus(key as Focus | null))} />
          <Panel
            title={view === "gantt" ? "Workload.ganttTitle" : "Workload.byWeek"}
            subtitle={view === "gantt" ? "Workload.ganttSubtitle" : "Planned man-days / available man-days · green under 85%, amber up to 100%, red above"}
            actions={
              <div className="workload-panel-actions">
                {unassigned.length ? (
                  <button type="button" className="btn ghost sm" onClick={() => setUnassignedOpen(true)}>
                    <Icon name="alertCircle" />
                    {t("Workload.unassigned").replace("{n}", String(unassigned.length))}
                  </button>
                ) : null}
                {focused.length > busy.length ? (
                  <button type="button" className="btn default sm" onClick={() => filtered(() => setShowIdle((value) => !value))}>
                    {t(showIdle ? "Hide people without work" : "Show all engineers")}
                  </button>
                ) : null}
              </div>
            }
            flush
          >
            {!data ? (
              <div className="empty">{loading ? <><span className="spinner" />{t("Loading from SQL Server…")}</> : null}</div>
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
                            {row.overdue ? <small className="workload-late">{row.overdue} {t("overdue")}</small> : null}
                            {row.projectedLate ? <small className="workload-projected">{t("WorkQueue.lateCount").replace("{n}", String(row.projectedLate))}</small> : null}
                          </td>
                          {row.weekly.map((w) => (
                            <td key={w.week.start} className="num">
                              <span
                                className={"heat-cell " + (w.manDays > 0 ? tone(w.utilisation) : "slate")}
                                title={`${fmt(w.manDays)} / ${w.available === null ? "—" : fmt(w.available)} MD`}
                              >
                                {w.manDays > 0 ? percent(w.utilisation) : "—"}
                              </span>
                              {w.manDays > 0 ? <small className="workload-days">{fmt(w.manDays)} MD</small> : null}
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="capacity-button"
                              disabled={!canPlan}
                              title={t("Weekly capacity")}
                              onClick={() => setCapacityUser(row.user.id)}
                            >
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
          <p className="workload-drawer-summary">
            {t("Workload.personSummary")
              .replace("{open}", String(person.open))
              .replace("{md}", fmt(person.committed))
              .replace("{peak}", percent(person.peak))}
          </p>
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
          <WorkList items={unassigned} today={todayIso} canPlanEffort={() => false} onOpen={open} onEffort={setEdit} />
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
      {capacityUser !== null && (
        <CapacityModal
          initialUser={capacityUser}
          team={bootstrap.team}
          capacities={data?.capacities ?? []}
          onClose={() => setCapacityUser(null)}
          onSaved={saved}
        />
      )}
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
            <Badge tone={tones[item.type]}>{t(item.type)}</Badge>
            <button type="button" className="workload-item-link" onClick={() => onOpen(item)}>
              {item.reference}
            </button>
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
    [amount, setAmount] = useState(
      String(weeklyCapacity(capacities.find((c) => c.userId === initialUser)?.daysPerWeek)),
    ),
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
                rowVersion:
                  capacities.find((c) => c.userId === user)?.rowVersion ?? null,
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
          <input
            required
            type="number"
            min="0"
            max="5"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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
