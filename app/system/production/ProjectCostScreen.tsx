"use client";
/* Projects > Cost (owner request 2026-11-21, for Leaders and above): one row per project with what its Estimate cost
   gave and what the work has taken - Hardware and Outsource against the purchase requests (THB), People against the
   plan in hours of work (owner 2026-11-23: no money for people), in all and by labor discipline (Electrical,
   Mechanical, Software, Installation). Read-only.
   The project number opens the breakdown in a dialog, so the list stays in place.
   Pegasus look (pegasus-design DESIGN.md 0.2 dialogs over navigation, 0.3 lists, C.2 summary bar, C.4 meter,
   D.5 badge, D.7 data table) through the app's own components under .pg-skin. The API side is
   backend-node/src/project-cost.ts; the shapes and the sums are in project-cost-model.ts. */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { useT } from "../i18n";
import { Badge, EmptyState, FilterChips, Icon, Modal, Pagination, Panel, SearchInput, TablePageSize, toneOf, type FilterItem, type Tone } from "../ui";
import { flagLink, numberLink, optionalChoiceLink, placeId, textLink, useLinkedState, useScreenPlace } from "../screen-link";
import {
  BUDGET_STATES,
  DEFAULT_COST_SORT,
  LABOR_DISCIPLINES,
  budgetLeft,
  budgetShare,
  budgetState,
  costTotals,
  laborOf,
  laborState,
  matchesCostSearch,
  nextCostSort,
  projectBudgetStates,
  shortAmount,
  sortCostItems,
  stateCounts,
  type BudgetState,
  type CostSort,
  type CostSortKey,
  type LaborDiscipline,
  type LaborFigures,
  type ProjectCostDetail,
  type ProjectCostItem,
  type ProjectCostOverview,
  type PurchaseCost,
} from "../../../backend-node/src/project-cost-model";
import "./pegasus-skin.css";
import "./project-cost.css";

type Props = { bootstrap: BootstrapData; openProjectSchedule?: (id: number) => void };

const STATE_TONE: Record<BudgetState, Tone> = { over: "red", near: "amber", within: "green", none: "slate" };
const STATE_LINK = optionalChoiceLink(BUDGET_STATES);
const DISCIPLINE_LINK = optionalChoiceLink(LABOR_DISCIPLINES);
/* Numbers read the same in every language: right-aligned, tabular, en-US grouping (DESIGN.md E.1). */
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const days = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const DASH = "–";
const money = (value: number | null) => (value === null ? DASH : whole.format(value));
/* People are counted in hours of work (owner 2026-11-23): the API's man-days read as hours, 8 hours a man-day. */
const HOURS_PER_MAN_DAY = 8;
const hours = (manDays: number | null) => (manDays === null ? DASH : days.format(manDays * HOURS_PER_MAN_DAY));
const toError = (error: unknown) => (error instanceof Error ? error.message : "The request could not be completed.");

/** A thin bar of the used share with an optional marker on the same scale (C.4); red once over, amber when near. */
function Meter({
  budget,
  used,
  marker,
  label,
  plain,
}: {
  budget: number | null;
  used: number | null;
  marker?: number | null | undefined;
  label: string;
  /** A share that is not a budget: always the primary colour. */ plain?: boolean;
}) {
  const share = budgetShare(budget, used),
    state = plain ? "within" : budgetState(budget, used);
  if (share === null) return <span className="pc-meter none" aria-hidden="true" />;
  const mark = marker === undefined ? null : budgetShare(budget, marker);
  return (
    <span className={`pc-meter ${state}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)} aria-label={label}>
      <i style={{ width: `${share}%` }} />
      {mark !== null ? <b style={{ left: `${mark}%` }} /> : null}
    </span>
  );
}

/** "used / budget" over its bar, with what is left (or how far over) underneath: one group of a project in one cell. */
function UseCell({
  budget,
  used,
  marker,
  label,
  format,
  unit,
  notes = [],
}: {
  budget: number | null;
  used: number | null;
  marker?: number | null | undefined;
  label: string;
  format: (value: number | null) => string;
  unit?: string;
  notes?: ReactNode[];
}) {
  const t = useT();
  const left = budgetLeft(budget, used),
    state = budgetState(budget, used),
    share = budget !== null && used !== null && budget > 0 ? Math.round((used / budget) * 100) : null;
  if (budget === null && used === null) return <span className="pc-none">{DASH}</span>;
  const parts: ReactNode[] = [
    share !== null ? `${share}% ${t("Cost.ofBudget")}` : null,
    left !== null && budget !== null && budget > 0 ? (
      <span className={left < 0 ? "pc-over" : undefined}>
        {t(left < 0 ? "Cost.over" : "Cost.left")} {format(Math.abs(left))}
      </span>
    ) : null,
    ...notes,
  ].filter((part) => part !== null && part !== false && part !== undefined);
  return (
    <div className={`pc-use ${state}`}>
      <div className="pc-use-figures">
        <strong>{format(used)}</strong>
        <span>
          / {budget === null ? t("Cost.noBudget") : format(budget)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <Meter budget={budget} used={used} marker={marker} label={label} />
      {parts.length ? (
        <small>
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index ? " · " : null}
              {part}
            </Fragment>
          ))}
        </small>
      ) : null}
    </div>
  );
}

function SortHeader({
  column,
  label,
  sort,
  onSort,
  className,
  suffix,
}: {
  column: CostSortKey;
  label: string;
  sort: CostSort;
  onSort: (key: CostSortKey) => void;
  className?: string;
  suffix?: string | undefined;
}) {
  const t = useT();
  const active = sort.key === column;
  return (
    <th className={className} aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}>
      <button type="button" className={`th-sort${active ? " active" : ""}`} title={t("Cost.sortBy")} onClick={() => onSort(column)}>
        {t(label)}
        {suffix ? ` · ${suffix}` : null}
        <Icon name="chevronDown" className={active ? (sort.descending ? "desc" : "asc") : "idle"} />
      </button>
    </th>
  );
}

/** One cell of the totals bar (C.2): label with a hint on the right, the headline figure short with the exact value on hover. */
function TotalCell({
  label,
  hint,
  value,
  exactValue,
  sub,
  tone,
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  exactValue?: string | undefined;
  sub?: ReactNode;
  tone?: BudgetState | undefined;
}) {
  return (
    <div className={`pc-total${tone ? ` ${tone}` : ""}`}>
      <div className="pc-total-top">
        <dt>{label}</dt>
        {hint ? <dd className="pc-total-hint">{hint}</dd> : null}
      </div>
      <dd className="pc-total-value" title={exactValue}>
        {value}
      </dd>
      {sub ? <dd className="pc-total-sub">{sub}</dd> : null}
    </div>
  );
}

const shortMoney = (value: number | null) => (value === null ? DASH : shortAmount(value));
const sharePercent = (budget: number | null, used: number | null) => (budget !== null && used !== null && budget > 0 ? `${Math.round((used / budget) * 100)}%` : undefined);

/** Totals of the rows on show for what is bought: requested / budget, with what is ordered. People have their own bar below (LaborBar). */
function TotalsBar({ items, guide, single }: { items: ProjectCostItem[]; guide?: string; /** One project's own bar: no count of projects. */ single?: boolean }) {
  const t = useT();
  const totals = useMemo(() => costTotals(items), [items]);
  const bought = (label: string, group: PurchaseCost) => (
    <TotalCell
      label={t(label)}
      hint={sharePercent(group.budget, group.requested)}
      tone={budgetState(group.budget, group.requested)}
      value={`${shortMoney(group.requested)} / ${shortMoney(group.budget)}`}
      exactValue={`${t("Cost.requested")} ${group.requested === null ? DASH : exact.format(group.requested)} / ${t("Cost.budget")} ${group.budget === null ? DASH : exact.format(group.budget)}`}
      sub={
        <>
          {t("Cost.ordered")} {money(group.ordered)}
        </>
      }
    />
  );
  return (
    <dl className="pc-totals" aria-label={t("Cost.totals")} data-guide={guide}>
      {single ? null : <TotalCell label={t("Cost.projects")} value={whole.format(totals.projects)} />}
      {bought("Cost.hardware", totals.hardware)}
      {bought("Cost.outsource", totals.outsource)}
    </dl>
  );
}

/**
 * People by labor discipline (owner 2026-11-21): one cell for all labor and one per discipline, each planned / budget
 * hours with what the plan puts on or before today. Money shows only if the route ever sends it again (laborMoney).
 * On the list a cell is also the switch for the table's People columns; pressed again it returns to all labor.
 */
function LaborBar({
  items,
  access,
  active,
  onPick,
  guide,
}: {
  items: ProjectCostItem[];
  access: ProjectCostOverview["access"];
  active?: LaborDiscipline | null;
  onPick?: ((discipline: LaborDiscipline | null) => void) | undefined;
  guide?: string;
}) {
  const t = useT();
  const totals = useMemo(() => costTotals(items), [items]);
  const cells: { key: LaborDiscipline | null; label: string; figures: LaborFigures }[] = [
    { key: null, label: t("Cost.allLabor"), figures: totals.labor },
    ...totals.disciplines.map((entry) => ({ key: entry.discipline, label: t(`Cost.discipline.${entry.discipline}`), figures: entry })),
  ];
  return (
    <div className="pc-labor" role="group" aria-label={t("Cost.laborBy")} data-guide={guide}>
      {cells.map(({ key, label, figures }) => {
        const state = laborState(figures),
          percent = sharePercent(figures.budgetManDays, figures.plannedManDays);
        const body = (
          <>
            <span className="pc-total-top">
              <span className="pc-labor-label">{label}</span>
              {percent ? <span className="pc-total-hint">{percent}</span> : null}
            </span>
            <span className="pc-total-value">
              {hours(figures.plannedManDays)} / {hours(figures.budgetManDays)} <small>{t("Cost.hoursUnit")}</small>
            </span>
            <span className="pc-total-sub" title={t("Cost.toDateHint")}>
              {t("Cost.toDate")} {hours(figures.toDateManDays)}
            </span>
            <span className="pc-total-sub pc-actual" title={`${t("Cost.actualHint")} ${t("Cost.forecastHint")}`}>
              {t("Cost.actual")} {hours(figures.actualManDays)} · {t("Cost.forecast")} {hours(figures.forecastManDays)}
            </span>
            {access.laborMoney ? (
              <span
                className="pc-total-sub"
                title={`${t("Cost.planned")} ${figures.plannedCost === null ? DASH : exact.format(figures.plannedCost)} / ${t("Cost.budget")} ${figures.budgetCost === null ? DASH : exact.format(figures.budgetCost)}`}
              >
                {t("Cost.cost")} {shortMoney(figures.plannedCost)} / {shortMoney(figures.budgetCost)}
              </span>
            ) : null}
          </>
        );
        return onPick ? (
          <button key={key ?? "all"} type="button" className={`pc-total pc-labor-cell ${state}`} aria-pressed={(active ?? null) === key} onClick={() => onPick((active ?? null) === key ? null : key)}>
            {body}
          </button>
        ) : (
          <div key={key ?? "all"} className={`pc-total pc-labor-cell ${state}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectCostScreen({ bootstrap, openProjectSchedule }: Props) {
  const t = useT();
  const [data, setData] = useState<ProjectCostOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The filters are on the screen's link under their own names, so the Overview tab's filters are not changed by these.
  const [search, setSearch] = useLinkedState("costq", "", textLink, { remember: false });
  const [state, setState] = useLinkedState<BudgetState | null>("coststate", null, STATE_LINK);
  const [includeClosed, setIncludeClosed] = useLinkedState("costclosed", false, flagLink);
  const [pageSize, setPageSize] = useLinkedState("costrows", 25, numberLink);
  // The labor discipline the People columns show; null is all labor.
  const [discipline, setDiscipline] = useLinkedState<LaborDiscipline | null>("costlabor", null, DISCIPLINE_LINK);
  const [sort, setSort] = useState<CostSort>(DEFAULT_COST_SORT);
  const [page, setPage] = useState(1);
  const [opened, place] = useScreenPlace();
  const [detailId, setDetailId] = useState<number | null>(() => (opened[0] === "cost" ? placeId(opened, 1) : null));
  // Only the newest request may land: toggling "Show closed" twice must not show the older answer.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError("");
    try {
      const answer = await apiRequest<ProjectCostOverview>(`/api/v1/projects/cost-overview${includeClosed ? "?includeClosed=1" : ""}`);
      if (request === latest.current) setData(answer);
    } catch (failure) {
      if (request === latest.current) setError(toError(failure));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [includeClosed]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const searched = useMemo(() => items.filter((item) => matchesCostSearch(item, search)), [items, search]);
  const counts = useMemo(() => stateCounts(searched, discipline), [searched, discipline]);
  const shown = useMemo(
    () => sortCostItems(state === null ? searched : searched.filter((item) => projectBudgetStates(item, discipline).worst === state), sort, discipline),
    [searched, state, sort, discipline],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize)),
    currentPage = Math.min(page, pageCount);
  const paged = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chips: FilterItem[] = BUDGET_STATES.map((key) => ({ key, label: `Cost.state.${key}`, value: counts[key], tone: STATE_TONE[key] }));
  const filtered = search.trim() !== "" || state !== null;
  const open = (id: number | null) => {
    setDetailId(id);
    place(id === null ? ["cost"] : ["cost", id]);
  };
  const access = data?.access ?? { budget: false, purchases: false, laborMoney: false };
  const changeSort = (key: CostSortKey) => {
    setSort(nextCostSort(sort, key));
    setPage(1);
  };

  return (
    <div className="pg-skin pc">
      <header className="page-header">
        <div>
          <h1>{t("Cost.title")}</h1>
          <p className="page-sub">{t("Cost.subtitle")}</p>
        </div>
        <div className="page-actions">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(event) => {
                setIncludeClosed(event.target.checked);
                setPage(1);
              }}
            />
            <span>{t("Cost.showClosed")}</span>
          </label>
          <button
            className="btn default"
            type="button"
            disabled={loading}
            onClick={() => {
              void load();
            }}
          >
            <Icon name="refresh" />
            {t("Refresh")}
          </button>
        </div>
      </header>
      {error ? (
        <div className="callout danger" role="alert">
          <Icon name="alertTriangle" />
          <span>
            <strong>{t("Could not load")}</strong> {error}
          </span>
          <button
            className="btn ghost sm"
            type="button"
            onClick={() => {
              void load();
            }}
          >
            <Icon name="refresh" />
            {t("Try again")}
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          <TotalsBar items={shown} guide="cost.totals" />
          <LaborBar
            items={shown}
            access={access}
            active={discipline}
            onPick={(key) => {
              setDiscipline(key);
              setPage(1);
            }}
            guide="cost.labor"
          />
        </>
      ) : loading ? (
        <div className="pc-skeleton pc-skeleton-bar" aria-hidden="true" />
      ) : null}
      <div className="toolbar pc-toolbar">
        <div data-guide="cost.filter">
          <FilterChips
            items={chips}
            active={state}
            onPick={(key) => {
              setState(key as BudgetState | null);
              setPage(1);
            }}
            label="Cost.stateFilter"
          />
        </div>
        <span className="pc-spacer" />
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Cost.search"
          guide="cost.search"
        />
      </div>
      <Panel flush guide="cost.table">
        {!data ? (
          loading ? (
            <div className="pc-skeleton pc-skeleton-table" role="status" aria-label={t("Cost.loading")} />
          ) : null
        ) : !items.length ? (
          <EmptyState icon="folder" title="Cost.empty" message="Cost.emptyHint" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <SortHeader column="number" label="Cost.colProject" sort={sort} onSort={changeSort} />
                    <SortHeader column="state" label="Cost.colStatus" sort={sort} onSort={changeSort} />
                    <th>{t("Cost.colManager")}</th>
                    <SortHeader column="hardware" label="Cost.colHardware" sort={sort} onSort={changeSort} className="pc-col-use" />
                    <SortHeader column="outsource" label="Cost.colOutsource" sort={sort} onSort={changeSort} className="pc-col-use" />
                    <SortHeader column="labor" label="Cost.colPeople" sort={sort} onSort={changeSort} className="pc-col-use" suffix={discipline ? t(`Cost.discipline.${discipline}`) : undefined} />
                    {access.laborMoney ? (
                      <th className="num">
                        {t("Cost.colPeopleCost")}
                        {discipline ? ` · ${t(`Cost.discipline.${discipline}`)}` : null}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const states = projectBudgetStates(item, discipline),
                      people = laborOf(item.labor, discipline);
                    return (
                      <tr key={item.id}>
                        <td className="pc-project">
                          <button type="button" className="pg-doclink" data-guide="cost.open" onClick={() => open(item.id)}>
                            {item.number}
                          </button>
                          <small title={item.name}>{item.name}</small>
                          <small>{item.customerName}</small>
                        </td>
                        <td>
                          <Badge tone={toneOf(item.status)}>{item.status}</Badge>
                          {states.worst === "over" || states.worst === "near" ? (
                            <span className="pc-state">
                              <Badge tone={STATE_TONE[states.worst]}>{`Cost.state.${states.worst}`}</Badge>
                            </span>
                          ) : null}
                        </td>
                        <td>{item.managerName}</td>
                        <td className="pc-col-use">
                          <UseCell
                            budget={item.hardware.budget}
                            used={item.hardware.requested}
                            label={t("Cost.hardware")}
                            format={money}
                            notes={[
                              item.hardware.ordered ? (
                                <>
                                  {t("Cost.ordered")} {money(item.hardware.ordered)}
                                </>
                              ) : null,
                            ]}
                          />
                        </td>
                        <td className="pc-col-use">
                          <UseCell
                            budget={item.outsource.budget}
                            used={item.outsource.requested}
                            label={t("Cost.outsource")}
                            format={money}
                            notes={[
                              item.outsource.ordered ? (
                                <>
                                  {t("Cost.ordered")} {money(item.outsource.ordered)}
                                </>
                              ) : null,
                            ]}
                          />
                        </td>
                        <td className="pc-col-use">
                          <UseCell
                            budget={people.budgetManDays}
                            used={people.plannedManDays}
                            marker={people.toDateManDays}
                            label={t("Cost.people")}
                            format={hours}
                            notes={[
                              people.toDateManDays !== null ? (
                                <span title={t("Cost.toDateHint")}>
                                  {t("Cost.toDate")} {hours(people.toDateManDays)}
                                </span>
                              ) : null,
                              <span key="actual" className="pc-actual" title={`${t("Cost.actualHint")} ${t("Cost.forecastHint")}`}>
                                {t("Cost.actual")} {hours(people.actualManDays)} · {t("Cost.forecast")} {hours(people.forecastManDays)}
                              </span>,
                              discipline === null && item.labor.unplannedRows ? (
                                <span className="pc-warn" title={t("Cost.unplanned")}>
                                  <Icon name="alertTriangle" />
                                  {whole.format(item.labor.unplannedRows)}
                                </span>
                              ) : null,
                            ]}
                          />
                        </td>
                        {access.laborMoney ? (
                          <td className="num">
                            {money(people.plannedCost)}
                            {people.budgetCost !== null ? <small>/ {money(people.budgetCost)}</small> : null}
                            {people.toDateCost !== null ? (
                              <small title={t("Cost.toDateHint")}>
                                {t("Cost.toDate")} {money(people.toDateCost)}
                              </small>
                            ) : null}
                            {people.actualCost !== null ? (
                              <small className="pc-actual" title={t("Cost.actualHint")}>
                                {t("Cost.actual")} {money(people.actualCost)}
                              </small>
                            ) : null}
                            {people.forecastCost !== null ? (
                              <small className="pc-actual" title={t("Cost.forecastHint")}>
                                {t("Cost.forecast")} {money(people.forecastCost)}
                              </small>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {!paged.length ? (
                    <tr>
                      <td colSpan={access.laborMoney ? 7 : 6} className="pc-nomatch">
                        {t("Cost.noMatch")}
                        {filtered ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="pg-doclink"
                              onClick={() => {
                                setSearch("");
                                setState(null);
                                setPage(1);
                              }}
                            >
                              {t("Cost.clearFilters")}
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="pc-foot">
              <TablePageSize
                value={pageSize}
                onChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
              />
              {shown.length > pageSize ? (
                <Pagination
                  page={currentPage}
                  pageCount={pageCount}
                  from={(currentPage - 1) * pageSize + 1}
                  to={Math.min(currentPage * pageSize, shown.length)}
                  total={shown.length}
                  onPage={setPage}
                />
              ) : null}
            </div>
          </>
        )}
      </Panel>
      {detailId !== null ? (
        <ProjectCostDialog
          projectId={detailId}
          canOpenPlan={Boolean(openProjectSchedule) && bootstrap.permissions.includes("schedule.read")}
          onOpenPlan={() => openProjectSchedule?.(detailId)}
          onClose={() => open(null)}
        />
      ) : null}
    </div>
  );
}

/** One project's cost detail: fetched once per project, and fetched again on Retry. */
function useProjectCostDetail(projectId: number) {
  const [detail, setDetail] = useState<ProjectCostDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<ProjectCostDetail>(`/api/v1/projects/${projectId}/cost`)
      .then((answer) => {
        if (!cancelled) {
          setDetail(answer);
          setError("");
        }
      })
      .catch((failure) => {
        if (!cancelled) setError(toError(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);
  return { detail, error, setError, retry: () => setAttempt((value) => value + 1) };
}

/** One project's breakdown: bought cost by Module with its purchase requests, labor by discipline (budget against plan) and by the plan's top rows. */
function ProjectCostDialog({ projectId, canOpenPlan, onOpenPlan, onClose }: { projectId: number; canOpenPlan: boolean; onOpenPlan: () => void; onClose: () => void }) {
  const t = useT();
  const cost = useProjectCostDetail(projectId);
  const project = cost.detail?.project;
  return (
    <Modal
      title={project ? `${project.number} · ${project.name}` : "Cost.title"}
      subtitle={project ? project.customerName : "Cost.loading"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>
            {t("Close")}
          </button>
          {canOpenPlan ? (
            <button className="btn primary" type="button" data-guide="cost.openPlan" onClick={onOpenPlan}>
              <Icon name="calendar" />
              {t("Cost.openPlan")}
            </button>
          ) : null}
        </>
      }
    >
      <ProjectCostBody {...cost} />
    </Modal>
  );
}

/** Task doc 5.2: the same breakdown on the project page's Cost tab. */
export function ProjectCostPanel({ projectId }: { projectId: number }) {
  return (
    <div className="pc-panel">
      <ProjectCostPage {...useProjectCostDetail(projectId)} />
    </div>
  );
}

type CostView = "overview" | "tasks" | "people" | "bought";
const COST_VIEWS: CostView[] = ["overview", "tasks", "people", "bought"];

/**
 * Task doc 6.1: the project page's Cost tab. A row of views, four figures that each open their view, the team's man-days
 * over time beside the split by discipline, and tables by task and by person. What was bought keeps the breakdown the
 * cost list's dialog shows. Money appears only where the viewer's access allows it (project-cost-model.ts).
 */
function ProjectCostPage(cost: ReturnType<typeof useProjectCostDetail>) {
  const t = useT();
  const [view, setView] = useState<CostView>("overview");
  const detail = cost.detail;
  if (!detail) return <ProjectCostBody {...cost} />;
  const { project, access, hoursPerManDay } = detail;
  const labor = project.labor;
  const days = (value: number | null) => (value === null ? DASH : `${Math.round(value * 10) / 10}`);
  const bought = (item: PurchaseCost) => (item.requested === null ? DASH : `${shortAmount(item.requested)}${item.budget ? ` / ${shortAmount(item.budget)}` : ""}`);
  const over = (used: number | null, budget: number | null) => used !== null && budget !== null && budget > 0 && used > budget;
  const cells: { key: string; label: string; value: string; note: string; to: CostView; tone?: string }[] = [
    {
      key: "hardware",
      label: "Cost.hardware",
      value: access.purchases ? bought(project.hardware) : DASH,
      note: t(access.budget ? "Cost.cellRequestedOfBudget" : "Cost.requested"),
      to: "bought",
      ...(over(project.hardware.requested, project.hardware.budget) ? { tone: "red" } : {}),
    },
    {
      key: "outsource",
      label: "Cost.outsource",
      value: access.purchases ? bought(project.outsource) : DASH,
      note: t(access.budget ? "Cost.cellRequestedOfBudget" : "Cost.requested"),
      to: "bought",
      ...(over(project.outsource.requested, project.outsource.budget) ? { tone: "red" } : {}),
    },
    {
      key: "actual",
      label: "Cost.cellActual",
      value: `${days(labor.actualManDays)} / ${days(labor.budgetManDays)}`,
      note: t("Cost.cellManDays"),
      to: "people",
      ...(over(labor.actualManDays, labor.budgetManDays) ? { tone: "red" } : {}),
    },
    {
      key: "forecast",
      label: "Cost.cellForecast",
      value: `${days(labor.forecastManDays)} / ${days(labor.budgetManDays)}`,
      note: t("Cost.cellManDays"),
      to: "overview",
      ...(over(labor.forecastManDays, labor.budgetManDays) ? { tone: "amber" } : {}),
    },
  ];
  return (
    <div className="pc-page">
      <div className="pc-page-views" role="group" aria-label={t("Cost.views")} data-guide="cost.views">
        {COST_VIEWS.map((value) => (
          <button key={value} type="button" aria-pressed={view === value} className={view === value ? "on" : undefined} onClick={() => setView(value)}>
            {t(`Cost.view.${value}`)}
          </button>
        ))}
      </div>
      <div className="pc-page-cells" data-guide="cost.cells">
        {cells.map((cell) => (
          <button key={cell.key} type="button" className={`pc-page-cell${cell.tone ? ` tone-${cell.tone}` : ""}${view === cell.to ? " on" : ""}`} onClick={() => setView(cell.to)}>
            <span className="muted">{t(cell.label)}</span>
            <strong className="mono">{cell.value}</strong>
            <small className="muted">{cell.note}</small>
          </button>
        ))}
      </div>
      {view === "overview" ? (
        <div className="pc-page-overview">
          <section className="pc-page-box">
            <h3>{t("Cost.curveTitle")}</h3>
            <HoursCurve curve={detail.curve ?? []} today={detail.today} budget={labor.budgetManDays} forecast={labor.forecastManDays} />
          </section>
          <section className="pc-page-box">
            <h3>{t("Cost.byDiscipline")}</h3>
            {labor.disciplines.length ? (
              <table className="pc-page-table">
                <thead>
                  <tr>
                    <th />
                    <th className="num">{t("Cost.budget")}</th>
                    <th className="num">{t("Cost.planned")}</th>
                    <th className="num">{t("Cost.actual")}</th>
                    <th className="num">{t("Cost.forecast")}</th>
                  </tr>
                </thead>
                <tbody>
                  {labor.disciplines.map((row) => (
                    <tr key={row.discipline} className={over(row.forecastManDays, row.budgetManDays) ? "over" : undefined}>
                      <td>{t(`Cost.discipline.${row.discipline}`)}</td>
                      <td className="num mono">{days(row.budgetManDays)}</td>
                      <td className="num mono">{days(row.plannedManDays)}</td>
                      <td className="num mono">{days(row.actualManDays)}</td>
                      <td className="num mono">{days(row.forecastManDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="pc-empty">{t("Cost.noPlan")}</p>
            )}
            <p className="muted pc-page-unit">{t("Cost.inManDays").replace("{hours}", String(hoursPerManDay))}</p>
          </section>
        </div>
      ) : null}
      {view === "tasks" ? (
        detail.plan.length ? (
          <table className="pc-page-table">
            <thead>
              <tr>
                <th>{t("Cost.colPlanRow")}</th>
                <th>{t("Cost.colPeriod")}</th>
                <th className="num">%</th>
                <th className="num">{t("Cost.planned")}</th>
                <th className="num">{t("Cost.toDate")}</th>
                <th className="num">{t("Cost.outsourcedMd")}</th>
                {access.laborMoney ? <th className="num">{t("Cost.colPlannedCost")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.plan.map((row) => (
                <tr key={row.id}>
                  <td className="wrap">{row.name}</td>
                  <td className="mono">{row.planStart && row.planFinish ? `${row.planStart} – ${row.planFinish}` : DASH}</td>
                  <td className="num mono">{Math.round(row.percentComplete)}%</td>
                  <td className="num mono">{days(row.plannedManDays)}</td>
                  <td className="num mono">{days(row.toDateManDays)}</td>
                  <td className="num mono">{row.outsourcedManDays ? days(row.outsourcedManDays) : DASH}</td>
                  {access.laborMoney ? <td className="num mono">{row.plannedCost === null ? DASH : shortAmount(row.plannedCost)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pc-empty">{t("Cost.noPlan")}</p>
        )
      ) : null}
      {view === "people" ? (
        (detail.people ?? []).length ? (
          <table className="pc-page-table">
            <thead>
              <tr>
                <th>{t("Cost.person")}</th>
                <th>{t("Cost.colDiscipline")}</th>
                <th className="num">{t("Cost.hours")}</th>
                <th className="num">{t("Cost.manDays")}</th>
                <th className="num">{t("Cost.daysConfirmed")}</th>
                <th>{t("Cost.lastDay")}</th>
              </tr>
            </thead>
            <tbody>
              {(detail.people ?? []).map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{t(`Cost.discipline.${person.discipline}`)}</td>
                  <td className="num mono">{Math.round(person.hours * 10) / 10}</td>
                  <td className="num mono">{days(person.hours / hoursPerManDay)}</td>
                  <td className="num mono">{person.days}</td>
                  <td className="mono">{person.lastDay ?? DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pc-empty">{t("Cost.noHours")}</p>
        )
      ) : null}
      {view === "bought" ? <ProjectCostBody {...cost} /> : null}
    </div>
  );
}

/** Man-days added up week by week: planned, confirmed (up to today), the budget and the forecast at completion. */
function HoursCurve({ curve, today, budget, forecast }: { curve: NonNullable<ProjectCostDetail["curve"]>; today: string; budget: number | null; forecast: number | null }) {
  const t = useT();
  if (!curve.length) return <p className="pc-empty">{t("Cost.noCurve")}</p>;
  const width = 560,
    height = 200,
    left = 36,
    bottom = 22;
  const top = Math.max(1, budget ?? 0, forecast ?? 0, ...curve.map((point) => Math.max(point.plannedManDays, point.actualManDays)));
  const x = (index: number) => left + (curve.length === 1 ? 0 : (index / (curve.length - 1)) * (width - left - 8));
  const y = (value: number) => height - bottom - (value / top) * (height - bottom - 8);
  const line = (points: [number, number][]) => points.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const planned = line(curve.map((point, index) => [x(index), y(point.plannedManDays)]));
  let doneUpTo = -1;
  curve.forEach((point, index) => {
    if (point.week <= today) doneUpTo = index;
  });
  const actual = doneUpTo >= 0 ? line(curve.slice(0, doneUpTo + 1).map((point, index) => [x(index), y(point.actualManDays)])) : "";
  const last = curve.length - 1;
  return (
    <figure className="pc-curve">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Cost.curveTitle")}>
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line x1={left} x2={width - 8} y1={y(top * share)} y2={y(top * share)} className="grid" />
            <text x={left - 4} y={y(top * share) + 4} textAnchor="end">
              {Math.round(top * share)}
            </text>
          </g>
        ))}
        {budget ? <line x1={left} x2={width - 8} y1={y(budget)} y2={y(budget)} className="budget" /> : null}
        <path d={planned} className="planned" />
        {actual ? <path d={actual} className="actual" /> : null}
        {forecast !== null ? <circle cx={x(last)} cy={y(forecast)} r={4} className="forecast" /> : null}
        {/* One week alone draws no line: its points show as dots. */}
        {curve.length === 1 ? <circle cx={x(0)} cy={y(curve[0]!.plannedManDays)} r={3} className="planned-dot" /> : null}
        {curve.length === 1 && doneUpTo === 0 ? <circle cx={x(0)} cy={y(curve[0]!.actualManDays)} r={3} className="actual-dot" /> : null}
        <text x={left} y={height - 4}>
          {curve[0]!.week}
        </text>
        <text x={width - 8} y={height - 4} textAnchor="end">
          {curve[last]!.week}
        </text>
      </svg>
      <figcaption className="pc-curve-key">
        <span className="planned">{t("Cost.planned")}</span>
        <span className="actual">{t("Cost.actual")}</span>
        {budget ? <span className="budget">{t("Cost.budget")}</span> : null}
        {forecast !== null ? <span className="forecast">{t("Cost.forecast")}</span> : null}
      </figcaption>
    </figure>
  );
}

function ProjectCostBody({ detail, error, setError, retry }: ReturnType<typeof useProjectCostDetail>) {
  const t = useT();
  const project = detail?.project,
    access = detail?.access;
  const moduleTotal = (pick: (row: ProjectCostDetail["modules"][number]) => number | null) => {
    const values = (detail?.modules ?? []).map(pick).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const span = (start: string | null, finish: string | null) => (start && finish ? `${start} – ${finish}` : DASH);
  return (
    <>
      {error ? (
        <div className="callout danger" role="alert">
          <Icon name="alertTriangle" />
          <span>
            <strong>{t("Could not load")}</strong> {error}
          </span>
          <button
            className="btn ghost sm"
            type="button"
            onClick={() => {
              setError("");
              retry();
            }}
          >
            <Icon name="refresh" />
            {t("Try again")}
          </button>
        </div>
      ) : null}
      {!detail || !project || !access ? (
        error ? null : (
          <div className="pc-skeleton pc-skeleton-table" role="status" aria-label={t("Cost.loading")} />
        )
      ) : (
        <>
          <TotalsDetail detail={detail} />
          <section className="pc-section" data-guide="cost.hardware">
            <h3>{t("Cost.detailHardware")}</h3>
            <p>{t("Cost.detailHardwareHint")}</p>
            {detail.modules.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Cost.colModule")}</th>
                      <th className="num">{t("Cost.budget")}</th>
                      <th className="num">{t("Cost.requested")}</th>
                      <th className="pc-col-bar" />
                      <th className="num">{t("Cost.approved")}</th>
                      <th className="num">{t("Cost.ordered")}</th>
                      <th className="num">{t("Cost.left")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.modules.map((row) => {
                      const left = budgetLeft(row.budget, row.requested);
                      return (
                        <tr key={row.module}>
                          <td>{row.module}</td>
                          <td className="num">{money(row.budget)}</td>
                          <td className="num">{money(row.requested)}</td>
                          <td className="pc-col-bar">
                            <Meter budget={row.budget} used={row.requested} label={row.module} />
                          </td>
                          <td className="num">{money(row.approved)}</td>
                          <td className="num">{money(row.ordered)}</td>
                          <td className={`num${left !== null && left < 0 ? " pc-over" : ""}`}>{money(left)}</td>
                        </tr>
                      );
                    })}
                    <tr className="pc-sum">
                      <td>{t("Cost.total")}</td>
                      <td className="num">{money(moduleTotal((row) => row.budget))}</td>
                      <td className="num">{money(moduleTotal((row) => row.requested))}</td>
                      <td className="pc-col-bar" />
                      <td className="num">{money(moduleTotal((row) => row.approved))}</td>
                      <td className="num">{money(moduleTotal((row) => row.ordered))}</td>
                      <td className="num">
                        {money(
                          budgetLeft(
                            moduleTotal((row) => row.budget),
                            moduleTotal((row) => row.requested),
                          ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pc-empty">{t("Cost.noModules")}</p>
            )}
            {access.purchases ? (
              <>
                <h4>{t("Cost.detailRequests")}</h4>
                {detail.requests.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Cost.colRequestNo")}</th>
                          <th>{t("Cost.colStatus")}</th>
                          <th>{t("Cost.colUnit")}</th>
                          <th>{t("Cost.colNeedBy")}</th>
                          <th className="num">{t("Cost.colLines")}</th>
                          <th className="num">{t("Cost.colAmount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.requests.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{row.number}</strong>
                            </td>
                            <td>
                              <Badge tone={toneOf(row.status)}>{row.status}</Badge>
                            </td>
                            <td>{row.unit ?? DASH}</td>
                            <td>{row.requiredDate ?? DASH}</td>
                            <td className="num">{whole.format(row.lines)}</td>
                            <td className="num">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="pc-empty">{t("Cost.noRequests")}</p>
                )}
              </>
            ) : null}
          </section>
          <section className="pc-section" data-guide="cost.people">
            <h3>{t("Cost.detailPeople")}</h3>
            <p>
              {t("Cost.disciplineRule")}
              {project.labor.source === "manual" ? ` ${t("Cost.manualBudget")}: ${hours(project.labor.budgetManDays)} ${t("Cost.hoursUnit")}.` : ""}
              {project.labor.dailyRate !== null ? ` ${t("Cost.dailyRate")}: ${money(project.labor.dailyRate)}.` : ""}
            </p>
            {project.labor.disciplines.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Cost.colDiscipline")}</th>
                      <th className="num">{t("Cost.colBudgetMd")}</th>
                      <th className="num">{t("Cost.colPlanned")}</th>
                      <th className="pc-col-bar" />
                      <th className="num">{t("Cost.colToDate")}</th>
                      <th className="num" title={t("Cost.actualHint")}>
                        {t("Cost.colActual")}
                      </th>
                      <th className="num" title={t("Cost.forecastHint")}>
                        {t("Cost.colForecast")}
                      </th>
                      <th className="num">{t("Cost.colLeftMd")}</th>
                      {access.laborMoney ? (
                        <>
                          <th className="num">{t("Cost.colBudgetCost")}</th>
                          <th className="num">{t("Cost.colPlannedCost")}</th>
                          <th className="num">{t("Cost.colToDateCost")}</th>
                          <th className="num">{t("Cost.colActualCost")}</th>
                          <th className="num">{t("Cost.colForecastCost")}</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...project.labor.disciplines.map((row) => ({ key: row.discipline as string, label: t(`Cost.discipline.${row.discipline}`), figures: row as LaborFigures, sum: false })),
                      { key: "total", label: t("Cost.total"), figures: project.labor as LaborFigures, sum: true },
                    ].map(({ key, label, figures, sum }) => {
                      const left = budgetLeft(figures.budgetManDays, figures.plannedManDays);
                      return (
                        <tr key={key} className={sum ? "pc-sum" : undefined}>
                          <td>{label}</td>
                          <td className="num">{hours(figures.budgetManDays)}</td>
                          <td className="num">{hours(figures.plannedManDays)}</td>
                          <td className="pc-col-bar">{sum ? null : <Meter budget={figures.budgetManDays} used={figures.plannedManDays} marker={figures.toDateManDays} label={label} />}</td>
                          <td className="num">{hours(figures.toDateManDays)}</td>
                          <td className="num pc-actual">{hours(figures.actualManDays)}</td>
                          <td
                            className={`num${laborState(figures) === "over" && figures.forecastManDays !== null && figures.budgetManDays !== null && figures.forecastManDays > figures.budgetManDays ? " pc-over" : ""}`}
                          >
                            {hours(figures.forecastManDays)}
                          </td>
                          <td className={`num${left !== null && left < 0 ? " pc-over" : ""}`}>{hours(left)}</td>
                          {access.laborMoney ? (
                            <>
                              <td className="num">{money(figures.budgetCost)}</td>
                              <td className="num">{money(figures.plannedCost)}</td>
                              <td className="num">{money(figures.toDateCost)}</td>
                              <td className="num">{money(figures.actualCost)}</td>
                              <td className="num">{money(figures.forecastCost)}</td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pc-empty">{t("Cost.noDisciplines")}</p>
            )}
            <h4>{t("Cost.detailPlan")}</h4>
            <p>
              {t("Cost.detailPlanHint")} {t("Cost.toDateHint")}
            </p>
            {detail.plan.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Cost.colPlanRow")}</th>
                      <th>{t("Cost.colPeriod")}</th>
                      <th className="num">{t("Cost.colProgress")}</th>
                      <th className="num">{t("Cost.colPlanned")}</th>
                      <th className="num">{t("Cost.colToDate")}</th>
                      <th className="pc-col-bar" />
                      <th className="num">{t("Cost.outsourcedMd")}</th>
                      {access.laborMoney ? <th className="num">{t("Cost.colCost")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.plan.map((row) => (
                      <tr key={row.id}>
                        <td className="wrap">{row.name}</td>
                        <td>{span(row.planStart, row.planFinish)}</td>
                        <td className="num">{Math.round(row.percentComplete)}%</td>
                        <td className="num">{hours(row.plannedManDays)}</td>
                        <td className="num">{hours(row.toDateManDays)}</td>
                        <td className="pc-col-bar">
                          <Meter budget={row.plannedManDays} used={row.toDateManDays} label={row.name} plain />
                        </td>
                        <td className="num">{row.outsourcedManDays ? hours(row.outsourcedManDays) : DASH}</td>
                        {access.laborMoney ? <td className="num">{money(row.plannedCost)}</td> : null}
                      </tr>
                    ))}
                    <tr className="pc-sum">
                      <td>{t("Cost.total")}</td>
                      <td />
                      <td />
                      <td className="num">{hours(project.labor.plannedManDays)}</td>
                      <td className="num">{hours(project.labor.toDateManDays)}</td>
                      <td className="pc-col-bar" />
                      <td className="num">{project.labor.outsourcedManDays ? hours(project.labor.outsourcedManDays) : DASH}</td>
                      {access.laborMoney ? <td className="num">{money(project.labor.plannedCost)}</td> : null}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pc-empty">{t("Cost.noPlan")}</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

/** The project's own totals on top of its dialog: the same two bars as the list, plus the estimate's whole cost. */
function TotalsDetail({ detail }: { detail: ProjectCostDetail }) {
  const t = useT();
  const { project, access } = detail;
  return (
    <>
      <TotalsBar items={[project]} single />
      <LaborBar items={[project]} access={access} />
      <p className="pc-detail-meta">
        {project.estimateNo ? (
          <span>
            {t("Cost.estimate")} <strong>{project.estimateNo}</strong>
          </span>
        ) : (
          <span>{t("Cost.noEstimate")}</span>
        )}
        {project.estimateTotal !== null ? (
          <span title={t("Cost.estimateTotalHint")}>
            {t("Cost.estimateTotal")} <strong>{exact.format(project.estimateTotal)}</strong>
          </span>
        ) : null}
        {project.requests !== null ? (
          <span>
            <strong>{whole.format(project.requests)}</strong> {t("Cost.requestCount")}
          </span>
        ) : null}
        {project.labor.unplannedRows ? (
          <span className="pc-warn">
            <Icon name="alertTriangle" />
            {whole.format(project.labor.unplannedRows)} {t("Cost.unplanned")}
          </span>
        ) : null}
      </p>
    </>
  );
}
