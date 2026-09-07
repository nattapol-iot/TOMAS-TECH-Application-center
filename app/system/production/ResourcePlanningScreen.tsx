"use client";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  assignInquiryOwner,
  listInquiries,
  listEstimates,
  loadEstimateCostWorkspace,
  type BootstrapData,
  type InquirySummary,
  type PagedResult,
} from "../api-client";
import {
  Badge,
  BarChart,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  Progress,
  SearchInput,
  Select,
  TablePageSize,
  Tabs,
  type Tone,
} from "../ui";
import { useLanguage } from "../i18n";
import { loadSchedules } from "./PlanningPricingScreens";
import { ResourceTaskWorkspace } from "./ResourceTaskWorkspace";
import {
  planningBar,
  planningLoad,
  planningWeeks,
  dayNumber,
  dateFromDay,
  resourceCsv,
  type Commitment,
} from "../../../lib/resource-planning";

type Effort = {
  entityType: string;
  entityId: number;
  start: string;
  end: string;
  manDays: number;
  rowVersion: string;
};
type Capacity = { userId: number; daysPerWeek: number; rowVersion: string };
type Planning = {
  efforts: Effort[];
  capacities: Capacity[];
  holidays: string[];
};
type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  openProjectSchedule?: (id: number) => void;
  openEstimate?: (id: number) => void;
  openInquiry?: (id: number) => void;
  refreshBootstrap?: () => Promise<void>;
};
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
async function all<T>(
  fetch: (p: { page: number; pageSize: number }) => Promise<PagedResult<T>>,
) {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await fetch({ page, pageSize: 100 });
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length)
      throw new Error("Incomplete result. Refresh the resource plan.");
  }
}

export function ProductionResourcePlan({
  bootstrap,
  notify,
  openProjectSchedule,
  openEstimate,
  openInquiry,
  refreshBootstrap,
}: Props) {
  const { t } = useLanguage();
  const [state, setState] = useState<{
    items: Commitment[];
    inquiries: InquirySummary[];
    planning: Planning;
    warnings: string[];
  }>({
    items: [],
    inquiries: [],
    planning: { efforts: [], capacities: [], holidays: [] },
    warnings: [],
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tab, setTab] = useState("tasks"),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("All departments"),
    [type, setType] = useState("All work");
  const [start, setStart] = useState(() =>
      dateFromDay(dayNumber(today()) - 14),
    ),
    [horizon, setHorizon] = useState("12");
  const [sort, setSort] = useState("Name"),
    [focus, setFocus] = useState("All"),
    [showEmptyTimelineRows, setShowEmptyTimelineRows] = useState(false),
    [showIdleWorkloadRows, setShowIdleWorkloadRows] = useState(false),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(50);
  const [edit, setEdit] = useState<Commitment | null>(null),
    [capacityUser, setCapacityUser] = useState<number | null>(null),
    [assign, setAssign] = useState(false);
  const canRead =
    bootstrap.permissions.includes("schedule.read") &&
    bootstrap.permissions.includes("project.read");
  const canPlan = bootstrap.permissions.includes("schedule.plan");
  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const warnings: string[] = [],
      items: Commitment[] = [];
    try {
      const planning = await apiRequest<Planning>("/api/v1/resource-planning");
      const [inquiries, estimates, scheduleData] = await Promise.all([
        bootstrap.permissions.includes("inquiry.read")
          ? all(listInquiries)
          : Promise.resolve([]),
        bootstrap.permissions.includes("estimate.read")
          ? all(listEstimates)
          : Promise.resolve([]),
        loadSchedules(),
      ]);
      const effort = (type: string, id: number) =>
        planning.efforts.find(
          (e) => e.entityType === type && e.entityId === id,
        );
      const taskPlanning = bootstrap.permissions.includes("inquiry.read")
        ? await apiRequest<{ taskInquiryIds: number[]; items: Commitment[] }>("/api/v1/resource-tasks/commitments")
        : { taskInquiryIds: [], items: [] };
      items.push(...taskPlanning.items);
      for (const i of inquiries) {
        if (taskPlanning.taskInquiryIds.includes(i.id)) continue;
        const e = effort("Inquiry", i.id);
        items.push({
          key: "Inquiry-" + i.id,
          type: "Inquiry",
          entityId: i.id,
          ownerId: i.estimateOwnerId,
          reference: i.number,
          title: i.projectName,
          customer: i.customerName,
          start: e?.start ?? i.inquiryDate,
          end: e?.end ?? i.dueDate,
          manDays: e?.manDays ?? null,
          progress: i.progress,
          status: i.status,
        });
      }
      // Bounded concurrency; no artificial limit truncates a large portfolio.
      for (let offset = 0; offset < estimates.length; offset += 4) {
        await Promise.all(
          estimates.slice(offset, offset + 4).map(async (i) => {
            let owners = [i.ownerId];
            try {
              const workspace = await loadEstimateCostWorkspace(i.id);
              const assigned = workspace.assignments.flatMap((a) => [
                a.ownerId,
                ...(a.supportId ? [a.supportId] : []),
              ]);
              if (assigned.length) owners = [...new Set(assigned)];
            } catch {
              warnings.push(
                i.number +
                  ": " +
                  t("Assignment details unavailable; estimate owner shown."),
              );
            }
            const e = effort("Estimate", i.id);
            for (const ownerId of owners)
              items.push({
                key: "Estimate-" + i.id + "-" + ownerId,
                type: "Estimate",
                entityId: i.id,
                ownerId,
                reference: i.number,
                title: i.projectName,
                customer: i.customerName,
                start: e?.start ?? i.createdDate,
                end: e?.end ?? i.dueDate,
                manDays: e ? e.manDays / owners.length : null,
                progress: i.progress,
                status: i.status,
              });
          }),
        );
      }
      for (const s of scheduleData.schedules) {
        type Task = (typeof s.tasks)[number];
        const leaves = (tasks: Task[]): Task[] =>
          tasks.flatMap((task) =>
            task.children.length
              ? leaves(task.children)
              : task.kind === "phase"
                ? []
                : [task],
          );
        for (const task of leaves(s.tasks)) {
          const pics = task.pics.length ? task.pics.map((p) => p.id) : [null];
          for (const ownerId of pics)
            items.push({
              key: "Project-" + task.id + "-" + ownerId,
              type: "Project",
              entityId: s.projectId,
              ownerId,
              reference: s.projectNo + " · " + task.wbs,
              title: task.name,
              customer:
                scheduleData.projects.find((p) => p.id === s.projectId)
                  ?.customerName ?? "",
              start: task.planStart,
              end: task.planFinish,
              manDays: Number(task.planManDays) / pics.length,
              progress: task.percentComplete,
              status: task.status,
            });
        }
      }
      if (scheduleData.skippedSchedules)
        warnings.push(
          t("Schedules unavailable") + ": " + scheduleData.skippedSchedules,
        );
      setState({ items, inquiries, planning, warnings });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [bootstrap.permissions, canRead, t]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const weeks = useMemo(
    () => planningWeeks(start || today(), Number(horizon)),
    [start, horizon],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return bootstrap.team
      .filter(
        (u) => department === "All departments" || u.department === department,
      )
      .map((user) => {
        const items = state.items
          .filter(
            (i) =>
              i.ownerId === user.id && (type === "All work" || i.type === type),
          )
          .filter(
            (i) =>
              !query ||
              user.name.toLocaleLowerCase().includes(query) ||
              [i.reference, i.title, i.customer]
                .join(" ")
                .toLocaleLowerCase()
                .includes(query),
          );
        const capacity =
          state.planning.capacities.find((c) => c.userId === user.id)
            ?.daysPerWeek ?? null;
        return {
          user,
          items,
          capacity,
          ...planningLoad(
            items,
            weeks,
            capacity,
            today(),
            state.planning.holidays,
          ),
        };
      })
      .filter(
        (row) =>
          !query ||
          row.items.length ||
          row.user.name.toLocaleLowerCase().includes(query),
      )
      .filter((row) =>
        focus === "All" || focus === "Over capacity"
          ? focus === "All" || (row.peak ?? 0) > 100
          : focus === "Overdue"
            ? row.overdue > 0
            : row.unknown > 0,
      )
      .sort((a, b) =>
        sort === "Peak load"
          ? (b.peak ?? -1) - (a.peak ?? -1) ||
            a.user.name.localeCompare(b.user.name)
          : sort === "Committed man-days"
            ? b.committed - a.committed
            : a.user.name.localeCompare(b.user.name),
      );
  }, [bootstrap.team, state, department, search, type, weeks, sort, focus]);
  const itemRows = rows.flatMap((r) => r.items.map((i) => ({ r, i })));
  const rowHasWorkInWindow = (row: (typeof rows)[number]) =>
    row.items.some((item) => planningBar(item, weeks));
  const emptyTimelineRows = rows.filter((row) => !rowHasWorkInWindow(row)).length;
  const timelineRows = showEmptyTimelineRows
    ? rows
    : rows.filter(rowHasWorkInWindow);
  const rowHasWorkloadActivity = (row: (typeof rows)[number]) =>
    row.items.length > 0 ||
    row.committed > 0 ||
    row.unknown > 0 ||
    row.overdue > 0 ||
    (row.peak ?? 0) > 0;
  const activeWorkloadRows = rows.filter(rowHasWorkloadActivity);
  const workloadRows = showIdleWorkloadRows ? rows : activeWorkloadRows;
  const hiddenWorkloadRows = rows.length - activeWorkloadRows.length;
  const decisionRows = rows.filter(
    (row) =>
      rowHasWorkloadActivity(row) &&
      ((row.peak ?? 0) > 100 ||
        row.overdue > 0 ||
        row.unknown > 0 ||
        row.capacity === null),
  );
  const departmentLoad = [...new Set(rows.map((row) => row.user.department))]
    .map((department) => ({
      label: department,
      value: rows
        .filter((row) => row.user.department === department)
        .reduce((sum, row) => sum + row.committed, 0),
    }))
    .filter((department) => department.value > 0);
  const pagedRows =
    tab === "gantt" ? timelineRows : tab === "workload" ? workloadRows : rows;
  const totalRows = tab === "items" ? itemRows.length : pagedRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize)),
    currentPage = Math.min(page, pageCount),
    visible = pagedRows.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );
  const visibleItems = itemRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const unique = [
    ...new Map(
      rows
        .flatMap((r) => r.items)
        .map((i) => [
          i.type +
            "-" +
            i.entityId +
            "-" +
            (i.type === "Project" ? i.reference : ""),
          i,
        ]),
    ).values(),
  ];
  const open = (item: Commitment) =>
    item.type === "Project"
      ? openProjectSchedule?.(item.entityId)
      : item.type === "Estimate"
        ? openEstimate?.(item.entityId)
        : openInquiry?.(item.entityId);
  const shiftWindow = (direction: -1 | 1) => {
    setStart(
      dateFromDay(
        dayNumber(start || today()) + direction * Number(horizon) * 7,
      ),
    );
    setPage(1);
  };
  const showToday = () => {
    setStart(dateFromDay(dayNumber(today()) - 14));
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setDepartment("All departments");
    setType("All work");
    setSort("Name");
    setFocus("All");
    setPage(1);
  };
  const hasFilters =
    !!search ||
    department !== "All departments" ||
    type !== "All work" ||
    sort !== "Name" ||
    focus !== "All";
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
          ...planningLoad(
            [item],
            weeks,
            row.capacity,
            today(),
            state.planning.holidays,
          ).weekly.map((w) => w.manDays),
        ]);
    const blob = new Blob([resourceCsv(rowsOut)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "resource-plan-" + today() + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const pageControls = (
    <Pagination
      page={currentPage}
      pageCount={pageCount}
      from={totalRows ? (currentPage - 1) * pageSize + 1 : 0}
      to={Math.min(currentPage * pageSize, totalRows)}
      total={totalRows}
      onPage={setPage}
    />
  );
  if (!canRead)
    return (
      <EmptyState
        icon="shield"
        title={t("Permission denied")}
        message="project.read + schedule.read"
      />
    );
  return (
    <div className="resource-plan-page">
      <PageHeader
        eyebrow={t("ENGINEERING RESOURCE")}
        title="Resource Plan · Tasks & Workload"
        subtitle={t(
          "ดูภาระงานก่อนมอบหมาย · อนุมัติแผน · สมาชิกตอบรับและติดตามผล",
        )}
        actions={
          <>
            <button
              className="btn default"
              disabled={loading || !!error}
              onClick={exportPlan}
            >
              <Icon name="download" />
              {t("Export plan")} CSV
            </button>
            <button
              className="btn default"
              disabled={loading}
              onClick={() => void load()}
            >
              <Icon name="refresh" />
              {t("Refresh")}
            </button>
            {canPlan && (
              <button
                className="btn default"
                onClick={() => setCapacityUser(bootstrap.user.id)}
                disabled={loading || !!error}
              >
                {t("Weekly capacity")}
              </button>
            )}
            {bootstrap.permissions.includes("inquiry.write") && (
              <button
                className="btn primary"
                disabled={loading || !!error}
                onClick={() => setAssign(true)}
              >
                <Icon name="inbox" />
                {t("Inquiry owner")}
              </button>
            )}
          </>
        }
      />
      {error && (
        <div className="callout danger" role="alert">
          {error} <LocalizedText text={"·"} /> {t("Displayed data may be stale. Refresh before planning.")}
        </div>
      )}
      {state.warnings.length > 0 && (
        <div className="callout warning" role="status">
          {state.warnings.join(" · ")}
        </div>
      )}
      <Tabs
        active={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
        tabs={[
          { id: "tasks", label: "Tasks · อนุมัติและตอบรับ" },
          {
            id: "gantt",
            label: t("Assignment timeline"),
            count: unique.length,
          },
          { id: "workload", label: t("Workload") },
          { id: "items", label: t("Work items") },
        ]}
      />
      <div className="kpi-grid four">
        <KpiCard
          label={t("Engineers on the plan")}
          value={rows.length}
          note={unique.length + " " + t("work items")}
          tone="blue"
          icon="users"
        />
        <KpiCard
          label={t("Committed man-days")}
          value={fmt(rows.reduce((s, r) => s + r.committed, 0))}
          note={t("Within selected horizon")}
          tone="slate"
          icon="clock"
        />
        <KpiCard
          label={t("Over capacity")}
          value={rows.filter((r) => (r.peak ?? 0) > 100).length}
          note={t("Peak week above 100%")}
          tone="red"
          icon="alertTriangle"
          onClick={() => {
            setTab("workload");
            setFocus("Over capacity");
            setPage(1);
          }}
        />
        <KpiCard
          label={t("Overdue work")}
          value={rows.reduce((s, r) => s + r.overdue, 0)}
          note={t("Past the committed end date")}
          tone="amber"
          icon="calendar"
          onClick={() => {
            setTab("workload");
            setFocus("Overdue");
            setPage(1);
          }}
        />
      </div>
      {tab !== "tasks" && <><div className="toolbar resource-plan-toolbar" aria-label={t("Resource plan filters")}>
        <div className="resource-filter-row primary">
          <div className="resource-filter resource-search-filter">
            <span className="resource-filter-label">{t("Search")}</span>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t("Search engineer, inquiry, project or customer…")}
            />
          </div>
          <div className="resource-filter">
            <span className="resource-filter-label">{t("Department")}</span>
            <Select
              label="Department"
              value={department}
              onChange={(v) => {
                setDepartment(v);
                setPage(1);
              }}
              options={[
                "All departments",
                ...[...new Set(bootstrap.team.map((u) => u.department))].sort(),
              ]}
            />
          </div>
          <div className="resource-filter">
            <span className="resource-filter-label">{t("Work type")}</span>
            <Select
              label="Work type"
              value={type}
              onChange={(v) => {
                setType(v);
                setPage(1);
              }}
              options={["All work", "Inquiry", "Estimate", "Project"]}
            />
          </div>
          <div className="resource-window-filter">
            <span className="resource-filter-label">{t("Planning window")}</span>
            <div className="resource-window-controls">
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftWindow(-1)}
                title={t("Previous period")}
                aria-label={t("Previous period")}
              >
                <Icon name="chevronLeft" />
              </button>
              <label className="resource-date-input">
                <span className="sr-only">{t("Start date")}</span>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <div className="resource-weeks-select">
                <Select
                  label="Weeks"
                  value={horizon}
                  onChange={(value) => {
                    setHorizon(value);
                    setPage(1);
                  }}
                  options={["8", "12", "16", "24"]}
                />
                <span>{t("weeks")}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftWindow(1)}
                title={t("Next period")}
                aria-label={t("Next period")}
              >
                <Icon name="chevronRight" />
              </button>
              <button type="button" className="btn default sm" onClick={showToday}>
                <Icon name="calendar" />
                {t("Today")}
              </button>
            </div>
          </div>
        </div>
        <div className="resource-filter-row secondary">
          <div className="resource-page-size">
            <TablePageSize
              value={pageSize}
              onChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </div>
          <div className="resource-filter compact">
            <span className="resource-filter-label">{t("Sort by")}</span>
            <Select
              label="Sort"
              value={sort}
              onChange={setSort}
              options={["Name", "Peak load", "Committed man-days"]}
            />
          </div>
          <div className="resource-filter compact">
            <span className="resource-filter-label">{t("Focus")}</span>
            <Select
              label="Focus"
              value={focus}
              onChange={(v) => {
                setFocus(v);
                setPage(1);
              }}
              options={["All", "Over capacity", "Overdue", "Missing effort"]}
            />
          </div>
          {hasFilters && (
            <button type="button" className="btn ghost sm resource-clear" onClick={clearFilters}>
              <Icon name="x" />
              {t("Clear filters")}
            </button>
          )}
          <span className="resource-legend" aria-label={t("Work type legend")}>
            <span>{t("Legend")}</span>
            {Object.entries(tones).map(([label, color]) => (
              <Badge key={label} tone={color}>
                {t(label)}
              </Badge>
            ))}
          </span>
        </div>
      </div>
      <details className="resource-method">
        <summary>
          <Icon name="alertCircle" />
          {t("How workload is calculated")}
        </summary>
        <p>
          {t(
            "Capacity uses saved working days/week, Monday–Friday, excluding company holidays. Personal leave is not deducted.",
          )}{" "}
          {t("Unplanned effort and capacity are shown as —, not zero.")}{" "}
          {t(
            "Incomplete plans are excluded from totals; utilisation is a lower bound until effort is complete.",
          )}{" "}
          {t(
            "Estimate effort is shared equally among its assigned owners/support; Project effort is split across PICs.",
          )}
        </p>
      </details></>}
      {loading ? (
        <div role="status" className="callout info">
          {t("Loading from SQL Server…")}
        </div>
      ) : null}
      {tab === "tasks" ? <ResourceTaskWorkspace bootstrap={bootstrap} notify={notify} onChanged={() => { void load(); }} openProjectSchedule={openProjectSchedule} /> : !rows.length ? (
        <EmptyState
          icon="users"
          title={t("Nobody matches the filter")}
          message={t(
            "Clear the department or search filter to see the team again.",
          )}
        />
      ) : (
        <>
          {tab === "gantt" && (
            <Panel
              title={t("Assignment timeline")}
              subtitle={t(
                "Each bar is one commitment; the shaded part is progress",
              )}
              actions={
                emptyTimelineRows ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      setShowEmptyTimelineRows((value) => !value);
                      setPage(1);
                    }}
                  >
                    <Icon name="eye" />
                    {showEmptyTimelineRows
                      ? t("Hide people without work")
                      : `${t("Show all engineers")} (${rows.length})`}
                  </button>
                ) : null
              }
              flush
            >
              {!timelineRows.length ? (
                <EmptyState
                  icon="calendar"
                  title={t("No scheduled work in this period")}
                  message={t("Move the planning window or show all engineers.")}
                  action={
                    <button
                      type="button"
                      className="btn default"
                      onClick={() => setShowEmptyTimelineRows(true)}
                    >
                      {t("Show all engineers")}
                    </button>
                  }
                />
              ) : (
              <div className="gantt-wrap" aria-label={t("Assignment timeline table")}>
                <div
                  className="gantt"
                  style={{
                    ["--weeks" as string]: weeks.length,
                    ["--timeline-width" as string]: `${weeks.length * 74}px`,
                  }}
                >
                  <div className="gantt-head">
                    <div className="gantt-side">{t("Engineer")}</div>
                    <div className="gantt-weeks">
                      {weeks.map((w) => (
                        <span
                          key={w.start}
                          className={
                            w.start <= today() && w.end >= today()
                              ? "current"
                              : ""
                          }
                        >
                          <b>{w.start.slice(5)}</b>
                          <em>{w.start.slice(0, 4)}</em>
                        </span>
                      ))}
                    </div>
                  </div>
                  {visible.map((row) => (
                    <div className="gantt-row" key={row.user.id}>
                      <div className="gantt-side">
                        <span className="avatar sm">
                          {initials(row.user.name)}
                        </span>
                        <div>
                          <strong>{row.user.name}</strong>
                          <small>
                            {row.user.department} <LocalizedText text={"·"} /> {row.items.length} <LocalizedText text={"·"} />{" "}
                            {fmt(row.committed)} <LocalizedText text={"MD"} /> </small>
                        </div>
                        <Badge tone={tone(row.peak)}>{percent(row.peak)}</Badge>
                      </div>
                      <div className="gantt-track">
                        {today() >= weeks[0].start &&
                          today() <= weeks.at(-1)!.end && (
                            <span
                              className="gantt-today"
                              style={{
                                left:
                                  ((dayNumber(today()) -
                                    dayNumber(weeks[0].start)) /
                                    (weeks.length * 7)) *
                                    100 +
                                  "%",
                              }}
                            />
                          )}
                        {row.items
                          .filter((i) => planningBar(i, weeks))
                          .map((i) => {
                            const pos = planningBar(i, weeks)!;
                            return (
                              <div className="gantt-line" key={i.key}>
                                <button
                                  type="button"
                                  className={
                                    "gantt-bar " +
                                    tones[i.type] +
                                    (i.end &&
                                    i.end < today() &&
                                    i.progress < 100
                                      ? " late"
                                      : "")
                                  }
                                  style={{
                                    left: pos.left + "%",
                                    width: pos.width + "%",
                                  }}
                                  onClick={() => open(i)}
                                  title={[
                                    i.reference,
                                    i.title,
                                    i.start + " → " + i.end,
                                    (i.manDays === null
                                      ? "—"
                                      : fmt(i.manDays)) + " MD",
                                    i.status,
                                  ].join("\n")}
                                >
                                  <i
                                    style={{
                                      width:
                                        Math.max(0, Math.min(100, i.progress)) +
                                        "%",
                                    }}
                                  />
                                  <span>
                                    {i.reference} <LocalizedText text={"·"} /> {i.title}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        {!row.items.some((i) => planningBar(i, weeks)) && (
                          <div className="gantt-line">
                            <span className="gantt-empty">
                              {t("No scheduled work in this horizon")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
              {pageControls}
            </Panel>
          )}
          {tab === "workload" && (
            <>
              <Panel
                title={t("Weekly load")}
                subtitle={t(
                  "Planned man-days / available man-days · green under 85%, amber up to 100%, red above",
                )}
                actions={
                  <div className="workload-view-actions">
                    <span>
                      {workloadRows.length} <LocalizedText text={"of"} /> {rows.length} {t("engineers")}
                    </span>
                    {hiddenWorkloadRows > 0 && (
                      <button
                        type="button"
                        className="btn default sm"
                        onClick={() => {
                          setShowIdleWorkloadRows((shown) => !shown);
                          setPage(1);
                        }}
                      >
                        {t(
                          showIdleWorkloadRows
                            ? "Hide people without work"
                            : "Show all engineers",
                        )}
                      </button>
                    )}
                  </div>
                }
                flush
              >
                <div className="table-wrap workload-heat-wrap">
                  <table className="heat workload-heat">
                    <thead>
                      <tr>
                        <th>{t("Engineer")}</th>
                        {weeks.map((w) => (
                          <th key={w.start} className="num" title={w.start}>
                            {w.start.slice(5).replace("-", "/")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.user.id}>
                          <td>
                            <div className="workload-person">
                              <span className="workload-avatar">
                                {initials(row.user.name)}
                              </span>
                              <span>
                                <strong>{row.user.name}</strong>
                                <small>{row.user.department}</small>
                              </span>
                            </div>
                          </td>
                          {row.weekly.map((w) => (
                            <td key={w.week.start} className="num">
                              <span
                                className={
                                  "heat-cell " +
                                  (w.manDays > 0 ? tone(w.utilisation) : "slate")
                                }
                                title={
                                  fmt(w.manDays) +
                                  " / " +
                                  (w.available === null
                                    ? "—"
                                    : fmt(w.available)) +
                                  " MD"
                                }
                              >
                                {w.manDays > 0 ? percent(w.utilisation) : "—"}
                              </span>
                              {w.manDays > 0 && (
                                <small className="workload-days">
                                  {fmt(w.manDays)} <LocalizedText text={"MD"} /> </small>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!visible.length && (
                        <tr>
                          <td colSpan={weeks.length + 1}>
                            <div className="workload-empty">
                              <Icon name="users" />
                              <span>{t("No planned workload in this period")}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pageControls}
              </Panel>
              <div className="workload-overview-grid">
                <Panel
                  title={t("Engineer workload")}
                  subtitle={t("Work, load and due dates at a glance")}
                  flush
                >
                  <div className="table-wrap">
                    <table className="workload-summary-table">
                      <thead>
                        <tr>
                          {[
                            "Engineer",
                            "Work / effort",
                            "Committed",
                            "Load",
                            "Due / risk",
                            "Weekly capacity",
                          ].map((h) => (
                            <th key={h}>{t(h)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.user.id}>
                            <td>
                              <div className="workload-person workload-person-summary">
                                <span className="workload-avatar">
                                  {initials(r.user.name)}
                                </span>
                                <span>
                                  <strong>{r.user.name}</strong>
                                  <small>
                                    {r.user.department} <LocalizedText text={"·"} /> {r.user.level}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="workload-work-count">
                                <strong>{r.open}</strong>
                                <span>{t("open items")}</span>
                                {r.unknown > 0 && (
                                  <Badge tone="amber">
                                    {r.unknown} {t("missing effort")}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="workload-committed">
                              <strong>{fmt(r.committed)}</strong>
                              <span><LocalizedText text={"MD"} /></span>
                            </td>
                            <td>
                              <div className="workload-load">
                                <div>
                                  <span>{t("Average")}</span>
                                  <strong>{percent(r.average)}</strong>
                                </div>
                                <Progress
                                  value={Math.min(r.average ?? 0, 100)}
                                  tone={tone(r.average)}
                                />
                                <div>
                                  <span>{t("Peak")}</span>
                                  <Badge tone={tone(r.peak)}>
                                    {percent(r.peak)}
                                  </Badge>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="workload-due">
                                {r.nextDue ? (
                                  <button
                                    className="workload-due-link"
                                    onClick={() => open(r.nextDue!)}
                                  >
                                    <strong>{r.nextDue.end}</strong>
                                    <span>{r.nextDue.reference}</span>
                                  </button>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                                {r.overdue > 0 && (
                                  <Badge tone="red">
                                    {r.overdue} {t("overdue")}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td>
                              <button
                                className={
                                  "capacity-button" +
                                  (r.capacity === null ? " missing" : "")
                                }
                                disabled={!canPlan}
                                onClick={() => setCapacityUser(r.user.id)}
                              >
                                {r.capacity === null
                                  ? t("Set capacity")
                                  : fmt(r.capacity) + " MD"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <div className="stack workload-side-stack">
                  <Panel
                    title={t("Needs a decision")}
                    subtitle={t("Only people with work that needs planning input")}
                  >
                    {decisionRows.length ? (
                      <ul className="workload-decision-list">
                        {decisionRows.map((r) => (
                          <li key={r.user.id}>
                            <span className="workload-alert-icon">
                              <Icon name="alertTriangle" />
                            </span>
                            <div>
                              <strong>{r.user.name}</strong>
                              <div className="workload-issue-tags">
                                {(r.peak ?? 0) > 100 && (
                                  <Badge tone="red">
                                    {t("Peak")} {percent(r.peak)}
                                  </Badge>
                                )}
                                {r.overdue > 0 && (
                                  <Badge tone="red">
                                    {r.overdue} {t("overdue")}
                                  </Badge>
                                )}
                                {r.unknown > 0 && (
                                  <Badge tone="amber">
                                    {r.unknown} {t("missing effort")}
                                  </Badge>
                                )}
                                {r.capacity === null && (
                                  <button
                                    type="button"
                                    className="badge amber workload-capacity-link"
                                    disabled={!canPlan}
                                    onClick={() => setCapacityUser(r.user.id)}
                                  >
                                    {t("Set weekly capacity")}
                                  </button>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="workload-all-clear">
                        <Icon name="checkCircle" />
                        <span>{t("No planning decisions needed")}</span>
                      </div>
                    )}
                  </Panel>
                  <Panel title={t("Load by department")}>
                    {departmentLoad.length ? (
                      <BarChart unit=" MD" data={departmentLoad} height={150} />
                    ) : (
                      <div className="workload-empty compact">
                        <Icon name="chart" />
                        <span>{t("No committed workload in this period")}</span>
                      </div>
                    )}
                  </Panel>
                </div>
              </div>
            </>
          )}
          {tab === "items" && (
            <Panel
              title={t("Work items")}
              subtitle={t(
                "Open the source to change owners or project dates; plan pre-sales effort here.",
              )}
              flush
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Engineer",
                        "Type",
                        "Reference",
                        "Description",
                        "Start date",
                        "Due date",
                        "Man-days",
                        "Status",
                        "Actions",
                      ].map((h) => (
                        <th key={h}>{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(({ r, i }) => (
                      <tr key={i.key}>
                        <td>{r.user.name}</td>
                        <td>
                          <Badge tone={tones[i.type]}>{t(i.type)}</Badge>
                        </td>
                        <td>
                          <button className="btn ghost" onClick={() => open(i)}>
                            {i.reference}
                          </button>
                        </td>
                        <td>{i.title}</td>
                        <td>{i.start ?? "—"}</td>
                        <td>{i.end ?? "—"}</td>
                        <td>{i.manDays === null ? "—" : fmt(i.manDays)}</td>
                        <td>{t(i.status)}</td>
                        <td>
                          {i.type !== "Project" && !i.key.startsWith("InquiryTask-") &&
                            canPlan &&
                            bootstrap.permissions.includes(
                              i.type === "Inquiry"
                                ? "inquiry.write"
                                : "estimate.write",
                            ) && (
                              <button
                                className="btn default"
                                onClick={() => setEdit(i)}
                              >
                                {t("Plan effort")}
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageControls}
            </Panel>
          )}
        </>
      )}
      {state.items.some((i) => i.ownerId === null) && (
        <Panel title={t("Unassigned")}>
          <ul>
            {state.items
              .filter((i) => i.ownerId === null)
              .map((i) => (
                <li key={i.key}>
                  <button className="btn ghost" onClick={() => open(i)}>
                    {i.reference} <LocalizedText text={"·"} /> {i.title}
                  </button>
                </li>
              ))}
          </ul>
        </Panel>
      )}
      {edit && (
        <EffortModal
          item={edit}
          current={state.planning.efforts.find(
            (e) => e.entityType === edit.type && e.entityId === edit.entityId,
          )}
          onClose={() => setEdit(null)}
          onSaved={saved}
        />
      )}
      {capacityUser !== null && (
        <CapacityModal
          initialUser={capacityUser}
          team={bootstrap.team}
          capacities={state.planning.capacities}
          onClose={() => setCapacityUser(null)}
          onSaved={saved}
        />
      )}
      {assign && (
        <AssignModal
          inquiries={state.inquiries}
          team={bootstrap.team}
          onClose={() => setAssign(false)}
          onSaved={async () => {
            await saved();
            await refreshBootstrap?.();
          }}
        />
      )}
    </div>
  );
}

function EffortModal({
  item,
  current,
  onClose,
  onSaved,
}: {
  item: Commitment;
  current?: Effort;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage(),
    [start, setStart] = useState(current?.start ?? item.start ?? today()),
    [end, setEnd] = useState(current?.end ?? item.end ?? today()),
    [amount, setAmount] = useState(current ? String(current.manDays) : ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={t("Plan effort") + " · " + item.reference} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await apiRequest(
              "/api/v1/resource-planning/" + item.type + "/" + item.entityId,
              {
                method: "PUT",
                body: JSON.stringify({
                  start,
                  end,
                  manDays: Number(amount),
                  rowVersion: current?.rowVersion ?? null,
                }),
              },
            );
            await onSaved();
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {t(
            "Total estimating effort, not project delivery effort. Shared equally between estimate assignees.",
          )}
        </p>
        <Field label={t("Start date")}>
          <input
            required
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label={t("Due date")}>
          <input
            required
            type="date"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Field label={t("Man-days")}>
          <input
            required
            type="number"
            min="0"
            max="100000"
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
function CapacityModal({
  initialUser,
  team,
  capacities,
  onClose,
  onSaved,
}: {
  initialUser: number;
  team: BootstrapData["team"];
  capacities: Capacity[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage(),
    [user, setUser] = useState(initialUser),
    [amount, setAmount] = useState(
      String(
        capacities.find((c) => c.userId === initialUser)?.daysPerWeek ?? 5,
      ),
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
        <Field label={t("Engineer")}>
          <select
            value={user}
            onChange={(e) => {
              const id = Number(e.target.value);
              setUser(id);
              setAmount(
                String(
                  capacities.find((c) => c.userId === id)?.daysPerWeek ?? 5,
                ),
              );
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
function AssignModal({
  inquiries,
  team,
  onClose,
  onSaved,
}: {
  inquiries: InquirySummary[];
  team: BootstrapData["team"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage(),
    [id, setId] = useState(""),
    [owner, setOwner] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={t("Assign an inquiry")} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const item = inquiries.find((i) => i.id === Number(id));
            if (!item) throw new Error("Select an inquiry.");
            await assignInquiryOwner(item.id, Number(owner), item.rowVersion);
            await onSaved();
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("Inquiry")}>
          <select
            required
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setOwner(
                String(
                  inquiries.find((i) => i.id === Number(e.target.value))
                    ?.estimateOwnerId ?? "",
                ),
              );
            }}
          >
            <option value="">—</option>
            {inquiries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} <LocalizedText text={"·"} /> {i.projectName}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Estimate Owner")}>
          <select
            required
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">—</option>
            {team
              .filter((u) =>
                ["Engineer", "Engineering Manager", "Admin"].includes(u.role),
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
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
