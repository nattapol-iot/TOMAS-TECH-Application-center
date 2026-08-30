"use client";

import { useMemo, useState } from "react";
import {
  CUSTOMERS, PROJECTS, SCHEDULE_STATUSES, SCHEDULE_TEMPLATES, USERS,
  type Project, type ScheduleStatus, type ScheduleUpdate,
} from "../data";
import {
  barPosition, formatDate, resolveSchedule, schedulePermission, scheduleSummary,
  scheduleTone, TODAY, TODAY_ISO, toDate, userName, userOf, weeksFrom,
  type ScheduleRow, type SchedulePermission,
} from "../calc";
import {
  addTask, answerRequest, applyTemplate, freezeBaseline, patchTask, removeTask, useScheduleStore,
} from "../store";
import { useSession } from "../session";
import {
  Badge, EmptyState, Field, Icon, Modal, Panel, PageHeader, Person, Pill, SummaryTile, Tabs,
} from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";
import { AddDetailRow, RequestDaysModal } from "./MyWork";

type ScheduleView = "plan" | "updates" | "baseline";
type PlanMode = "sheet" | "timeline";
type Audience = "Internal" | "Customer";

export default function ProjectSchedule({ id, initialView, go, notify }: ScreenProps & { id: string; initialView?: string }) {
  const t = useT();
  const session = useSession();
  const store = useScheduleStore();
  const project = PROJECTS.find((entry) => entry.id === id) ?? PROJECTS[0];
  const customer = CUSTOMERS.find((entry) => entry.id === project.customerId);

  const [view, setView] = useState<ScheduleView>((initialView as ScheduleView) || "plan");
  const [mode, setMode] = useState<PlanMode>("sheet");
  const [audience, setAudience] = useState<Audience>("Internal");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [requestFor, setRequestFor] = useState<ScheduleRow | null>(null);

  const rows = useMemo(
    () => resolveSchedule(store.tasks, project.id, store.updates),
    [store.version, project.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const summary = scheduleSummary(rows);
  const perm = schedulePermission(session.user, session.role, project);
  const baseline = store.baselines.filter((entry) => entry.projectId === project.id).sort((a, b) => b.rev - a.rev)[0];
  const openRequests = store.updates.filter((entry) => entry.projectId === project.id && entry.requestDays > 0 && entry.answer === "");

  // The customer plan is a filter, not a second document: customer rows plus
  // the ancestors that give them context — internal detail stays home.
  const visibleRows = useMemo(() => {
    let list = rows;
    if (audience === "Customer") {
      const keep = new Set<string>();
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const row of rows) {
        if (row.visibility !== "Customer" || row.origin === "Member") continue;
        keep.add(row.id);
        let up = row.parentId;
        while (up && byId.has(up)) { keep.add(up); up = byId.get(up)!.parentId; }
      }
      list = rows.filter((row) => keep.has(row.id));
    }
    const hidden = new Set<string>();
    for (const row of list) {
      if (collapsed.has(row.id) || (row.parentId && hidden.has(row.parentId))) {
        if (row.parentId && (hidden.has(row.parentId) || collapsed.has(row.parentId))) hidden.add(row.id);
      }
    }
    return list.filter((row) => !hidden.has(row.id));
  }, [rows, audience, collapsed]);

  const toggle = (rowId: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });

  const late = summary && summary.varianceDays > 0;

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "projects" })}>{t("Projects")}</button>
        <Icon name="chevronRight" />
        <button type="button" onClick={() => go({ name: "project", id: project.id })}>{project.no}</button>
        <Icon name="chevronRight" />
        <span>{t("Schedule")}</span>
      </div>

      <PageHeader
        eyebrow={t("PROJECT SCHEDULE")}
        title={`${project.no} — ${project.name}`}
        subtitle={`${customer?.name} · ${t("Project manager")}: ${userName(project.managerId)} · ${t("One plan for the customer and the team — members update their own rows and every view updates with them.")}`}
        meta={summary ? (
          <>
            <div><span>{t("Plan window")}</span><strong>{formatDate(summary.start)} → {formatDate(summary.end)}</strong></div>
            <div><span>{t("Work days")}</span><strong>{summary.workDays}</strong></div>
            <div><span>{t("Progress")}</span><strong>{summary.percent}% · {summary.doneCount}/{summary.taskCount} {t("done")}</strong></div>
            <div><span>{t("Baseline")}</span><strong>{baseline ? `${baseline.label} · ${formatDate(baseline.takenAt)}` : t("Not frozen yet")}</strong></div>
            <div><span>{t("vs baseline")}</span><strong className={late ? "red-text" : summary.varianceDays < 0 ? "green-text" : undefined}>
              {baseline ? `${summary.varianceDays > 0 ? "+" : ""}${summary.varianceDays} ${t("work days")}` : "—"}
            </strong></div>
          </>
        ) : undefined}
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify(t("Customer plan exported — Customer rows only, baseline dates, no internal detail"))}>
              <Icon name="download" />{t("Export customer plan")}
            </button>
            {perm.canBaseline ? (
              <button className="btn primary" type="button" onClick={() => setFreezeOpen(true)}>
                <Icon name="lock" />{baseline ? t("Re-baseline") : t("Freeze baseline")}
              </button>
            ) : null}
          </>
        }
      />

      {openRequests.length && perm.isManager && view !== "updates" ? (
        <div className="info-strip amber">
          <Icon name="alertTriangle" />
          {openRequests.length} {t("requests for more days from the team are waiting for a decision")}
          <span className="spacer" />
          <button className="link-btn" type="button" onClick={() => setView("updates")}>
            {t("Review")}<Icon name="arrowRight" />
          </button>
        </div>
      ) : null}

      {!perm.isManager && rows.length ? (
        <div className="info-strip">
          <Icon name="lock" />
          {t("Read only — the plan is maintained by")} {userName(project.managerId)}. {t("Update your own tasks in My Work.")}
          <span className="spacer" />
          <button className="link-btn" type="button" onClick={() => go({ name: "my-work" })}>
            {t("Open My Work")}<Icon name="arrowRight" />
          </button>
        </div>
      ) : null}

      {summary ? (
        <section className="summary-strip">
          <SummaryTile label={t("Tasks")} value={`${summary.taskCount}`} note={`${summary.doneCount} ${t("done")}`} />
          <SummaryTile label={t("Progress")} value={`${summary.percent}%`} tone={summary.percent >= 75 ? "green" : "blue"} />
          <SummaryTile label={t("Late")} value={`${summary.late}`} tone={summary.late ? "red" : "green"} note={summary.late ? t("Needs a forecast") : t("On plan")} />
          <SummaryTile label={t("Blocked")} value={`${summary.blocked}`} tone={summary.blocked ? "amber" : "green"} />
          <SummaryTile label={t("Plan finish")} value={formatDate(summary.end)} />
          <SummaryTile
            label={t("vs baseline")}
            value={baseline ? `${summary.varianceDays > 0 ? "+" : ""}${summary.varianceDays} d` : "—"}
            tone={!baseline ? "slate" : summary.varianceDays > 0 ? "red" : "green"}
            strong
          />
        </section>
      ) : null}

      <Tabs
        active={view}
        onChange={setView}
        tabs={[
          { id: "plan", label: t("Plan") },
          { id: "updates", label: t("Updates"), count: openRequests.length || undefined },
          { id: "baseline", label: t("Baseline") },
        ]}
      />

      {view === "plan" ? (
        rows.length ? (
          <Panel
            title={audience === "Customer" ? t("Customer plan") : t("Master plan")}
            subtitle={audience === "Customer"
              ? `${t("Showing")} ${visibleRows.length} ${t("of")} ${rows.length} ${t("rows")} · ${baseline ? baseline.label : t("Not frozen yet")}`
              : t("PLAN columns belong to the project manager — PROGRESS columns belong to the task owner")}
            actions={
              <>
                <div className="seg-control">
                  {(["sheet", "timeline"] as PlanMode[]).map((option) => (
                    <button key={option} type="button" className={mode === option ? "on" : undefined} onClick={() => setMode(option)}>
                      {option === "sheet" ? t("Sheet") : t("Timeline")}
                    </button>
                  ))}
                </div>
                <div className="seg-control">
                  {(["Internal", "Customer"] as Audience[]).map((option) => (
                    <button key={option} type="button" className={audience === option ? "on" : undefined} onClick={() => setAudience(option)}>
                      {option === "Internal" ? t("Internal view") : t("Customer view")}
                    </button>
                  ))}
                </div>
              </>
            }
            flush
          >
            {mode === "sheet" ? (
              <ScheduleSheet
                rows={visibleRows} project={project} audience={audience}
                collapsed={collapsed} onToggle={toggle}
                onRequest={setRequestFor} notify={notify}
              />
            ) : (
              <ScheduleTimeline rows={visibleRows} collapsed={collapsed} onToggle={toggle} showBaseline={!!baseline} />
            )}
          </Panel>
        ) : (
          <Panel title={t("No plan yet")} flush>
            <EmptyState
              icon="calendar"
              title={t("This project has no schedule yet")}
              message={t("Start from the team's standard phase template, or add phases one by one — the moment the PO arrives.")}
              action={perm.isManager ? (
                <button className="btn primary" type="button" onClick={() => setTemplateOpen(true)}>
                  <Icon name="layers" />{t("Apply template")}
                </button>
              ) : undefined}
            />
          </Panel>
        )
      ) : null}

      {view === "updates" ? (
        <UpdatesTab
          project={project} updates={store.updates.filter((entry) => entry.projectId === project.id)}
          rows={rows} canAnswer={perm.isManager} notify={notify}
        />
      ) : null}

      {view === "baseline" ? (
        <BaselineTab
          rows={rows} baselines={store.baselines.filter((entry) => entry.projectId === project.id)}
          canBaseline={perm.canBaseline} onFreeze={() => setFreezeOpen(true)}
        />
      ) : null}

      {freezeOpen ? (
        <FreezeModal
          project={project} rev={(baseline?.rev ?? 0) + 1} requireReason={!!baseline}
          onClose={() => setFreezeOpen(false)}
          onFreeze={(label, reason) => {
            freezeBaseline(project.id, label, reason, session);
            setFreezeOpen(false);
            notify(t("Baseline frozen — variance now measures against this promise"));
          }}
        />
      ) : null}

      {templateOpen ? (
        <TemplateModal
          project={project}
          onClose={() => setTemplateOpen(false)}
          onApply={(templateId, from) => {
            applyTemplate(project.id, templateId, from, session);
            setTemplateOpen(false);
            notify(t("Template applied — adjust the dates and assign the PIC"));
          }}
        />
      ) : null}

      {requestFor ? (
        <RequestDaysModal row={requestFor} onClose={() => setRequestFor(null)} notify={notify} />
      ) : null}
    </>
  );
}

/* ==========================================================================
   The sheet — the Excel plan, with the PM/owner split visible in the header
   ========================================================================== */

function ScheduleSheet({ rows, project, audience, collapsed, onToggle, onRequest, notify }: {
  rows: ScheduleRow[];
  project: Project;
  audience: Audience;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onRequest: (row: ScheduleRow) => void;
  notify: (message: string) => void;
}) {
  const t = useT();
  const session = useSession();
  const store = useScheduleStore();
  const customerView = audience === "Customer";
  const allRows = useMemo(
    () => resolveSchedule(store.tasks, project.id, store.updates),
    [store.version, project.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const wbsOf = new Map(allRows.map((row) => [row.id, row.wbs]));
  const [addingUnder, setAddingUnder] = useState("");

  const perms = new Map<string, SchedulePermission>(
    rows.map((row) => [row.id, schedulePermission(session.user, session.role, project, row)]));

  const addTaskUnder = (phase: ScheduleRow) => {
    const siblings = allRows.filter((row) => row.parentId === phase.id);
    const start = siblings.length ? siblings[siblings.length - 1].planEndDate : TODAY_ISO;
    addTask({
        projectId: project.id, parentId: phase.id,
        order: (siblings.length + 1) * 10 + 1000, kind: "task", name: "",
        milestone: false, origin: "PM", createdBy: session.user.id, visibility: "Customer",
        planStart: start, planDays: 5, startMode: "manual", predecessorId: "", lagDays: 0,
        picIds: [], picExternal: "", planManDays: 0,
        baselineStart: "", baselineEnd: "", baselineDays: 0, baselineRev: 0,
        actualStart: "", actualEnd: "", forecastEnd: "", percentDone: 0, status: "Not Started",
        blockedReason: "", note: "", actualManDays: 0, updatedBy: session.user.id, updatedAt: TODAY_ISO,
      }, session);
  };

  const addPhase = () => {
    const phases = allRows.filter((row) => row.depth === 1);
    addTask({
        projectId: project.id, parentId: "", order: (phases.length + 1) * 10 + 1000, kind: "phase",
        name: "", milestone: false, origin: "PM", createdBy: session.user.id, visibility: "Customer",
        planStart: "", planDays: 1, startMode: "manual", predecessorId: "", lagDays: 0,
        picIds: [], picExternal: "", planManDays: 0,
        baselineStart: "", baselineEnd: "", baselineDays: 0, baselineRev: 0,
        actualStart: "", actualEnd: "", forecastEnd: "", percentDone: 0, status: "Not Started",
        blockedReason: "", note: "", actualManDays: 0, updatedBy: session.user.id, updatedAt: TODAY_ISO,
      }, session);
  };

  const managing = schedulePermission(session.user, session.role, project).isManager && !customerView;

  return (
    <div className="table-wrap tall">
      <table className="sheet schedule-sheet" style={{ minWidth: customerView ? 980 : 1560 }}>
        {/* table-layout is fixed, so the widths must live on a colgroup — the
            band header row would otherwise define only two columns. */}
        <colgroup>
          <col style={{ width: 58 }} />
          <col style={{ width: 300 }} />
          <col style={{ width: 140 }} />
          {!customerView ? <col style={{ width: 72 }} /> : null}
          <col style={{ width: 112 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 52 }} />
          {!customerView ? (
            <>
              <col style={{ width: 70 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 68 }} />
            </>
          ) : (
            <col style={{ width: 70 }} />
          )}
        </colgroup>
        <thead>
          <tr className="band-head">
            <th colSpan={customerView ? 7 : 8} className="band-plan">{t("PLAN — project manager")}</th>
            {customerView ? <th className="band-plan" /> : <th colSpan={7} className="band-progress">{t("PROGRESS — task owner")}</th>}
          </tr>
          <tr>
            <th style={{ width: 58 }}>WBS</th>
            <th style={{ width: 300 }}>{t("Task")}</th>
            <th style={{ width: 140 }}>PIC</th>
            {!customerView ? <th style={{ width: 72 }}>{t("Pred.")}</th> : null}
            <th style={{ width: 112 }}>{t("Start")}</th>
            <th style={{ width: 112 }}>{t("End")}</th>
            <th style={{ width: 56 }} className="num">{t("Days")}</th>
            <th style={{ width: 52 }} className="num">WD</th>
            {!customerView ? (
              <>
                <th style={{ width: 70 }} className="num lane-split">% {t("done")}</th>
                <th style={{ width: 120 }}>{t("Status")}</th>
                <th style={{ width: 112 }}>{t("Actual start")}</th>
                <th style={{ width: 112 }}>{t("Actual end")}</th>
                <th style={{ width: 112 }}>{t("Forecast")}</th>
                <th style={{ width: 96 }}>{t("Updated")}</th>
                <th style={{ width: 68 }} aria-label="Actions" />
              </>
            ) : (
              <th style={{ width: 70 }} className="num">% {t("done")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const perm = perms.get(row.id)!;
            const isPhase = row.depth === 1;
            const rowClass = [
              isPhase ? "phase-row" : "",
              row.kind === "detail" ? "detail-row" : "",
              row.isLate ? "row-late" : row.status === "Done" ? "row-ok" : "",
            ].filter(Boolean).join(" ");
            const indent = { paddingLeft: 6 + (row.depth - 1) * 18 };
            const predWbs = row.predecessorId ? wbsOf.get(row.predecessorId) ?? "?" : "";

            return [
              <tr key={row.id} className={rowClass || undefined}>
                <td><span className="mono muted">{row.wbs}</span></td>
                <td>
                  <div className="wbs-cell" style={indent}>
                    {row.hasChildren ? (
                      <button className="row-action" type="button" onClick={() => onToggle(row.id)} aria-label={collapsed.has(row.id) ? t("Expand") : t("Collapse")}>
                        <Icon name={collapsed.has(row.id) ? "chevronRight" : "chevronDown"} />
                      </button>
                    ) : <span className="wbs-gap" />}
                    {row.milestone ? <span className="milestone-mark" title={t("Milestone")}>◆</span> : null}
                    {perm.canEditIdentity ? (
                      <input
                        value={row.name} placeholder={isPhase ? t("Phase name") : t("Task name")}
                        onChange={(event) => patchTask(row.id, { name: event.target.value }, session)}
                      />
                    ) : (
                      <span className="cell-text">{row.name}{row.origin === "Member" ? <Pill tone="blue">{t("own")}</Pill> : null}</span>
                    )}
                  </div>
                </td>
                <td>
                  {isPhase ? <span className="cell-text muted">—</span> : (
                    <div className="pic-cell">
                      {customerView
                        ? <span className="cell-text">{row.picIds.length ? "Tomas" : ""}{row.picIds.length && row.picExternal ? " / " : ""}{row.picExternal}</span>
                        : (
                          <>
                            {row.picIds.map((picId) => {
                              const member = userOf(picId);
                              return <span className="avatar sm" key={picId} title={member?.name}>{member?.initials}</span>;
                            })}
                            {row.picExternal ? <Pill>{row.picExternal}</Pill> : null}
                            {perm.canEditIdentity ? (
                              <PicPicker row={row} project={project} onChange={(picIds) => patchTask(row.id, { picIds }, session)} />
                            ) : null}
                          </>
                        )}
                    </div>
                  )}
                </td>
                {!customerView ? (
                  <td>
                    {isPhase || row.kind === "detail" ? <span className="cell-text muted">—</span>
                      : perm.canEditPlan ? (
                        <select
                          value={row.predecessorId}
                          onChange={(event) => patchTask(row.id, {
                            predecessorId: event.target.value,
                            startMode: event.target.value ? "linked" : "manual",
                          }, session)}
                        >
                          <option value="">—</option>
                          {allRows.filter((other) => other.id !== row.id && !other.hasChildren && other.kind !== "detail").map((other) => (
                            <option key={other.id} value={other.id}>{other.wbs}</option>
                          ))}
                        </select>
                      ) : <span className="cell-text mono">{predWbs || "—"}{row.pinned ? " 📌" : ""}</span>}
                  </td>
                ) : null}
                <td>
                  {isPhase || (row.startMode === "linked" && row.predecessorId)
                    ? <span className="cell-text computed" title={isPhase ? t("Rolled up from the tasks below") : `${t("Follows")} ${predWbs}`}>{formatDate(customerView && row.baselineStart ? row.baselineStart : row.planStart)}</span>
                    : perm.canEditPlan
                      ? <input type="date" value={row.planStart} onChange={(event) => patchTask(row.id, { planStart: event.target.value }, session)} />
                      : <span className="cell-text">{formatDate(customerView && row.baselineStart ? row.baselineStart : row.planStart)}</span>}
                </td>
                <td>
                  <span className={`cell-text ${isPhase ? "computed" : ""} ${row.isLate ? "red-text" : ""}`}>
                    {formatDate(customerView && row.baselineEnd ? row.baselineEnd : row.planEndDate)}
                  </span>
                </td>
                <td className="num">
                  {isPhase ? <span className="cell-text computed num">{row.days}</span>
                    : perm.canEditPlan
                      ? <input className="num" type="number" min="1" value={row.planDays} onChange={(event) => patchTask(row.id, { planDays: Math.max(1, Number(event.target.value)) }, session)} />
                      : <span className="cell-text num">{row.planDays}</span>}
                </td>
                <td className="num"><span className="cell-text computed num">{row.workDays}</span></td>

                {!customerView ? (
                  <>
                    <td className="num lane-split">
                      {row.hasChildren
                        ? <span className="cell-text computed num" title={`${row.doneLeaves}/${row.totalLeaves} ${t("done")}`}>{row.percentDone}%</span>
                        : perm.canEditProgress
                          ? <input className="num" type="number" min="0" max="100" step="5" value={row.percentDone} onChange={(event) => patchTask(row.id, { percentDone: Math.min(100, Math.max(0, Number(event.target.value))) }, session)} />
                          : <span className="cell-text num">{row.percentDone}%</span>}
                    </td>
                    <td>
                      {row.hasChildren ? <Badge tone={scheduleTone(row)}>{t(row.status)}</Badge>
                        : perm.canEditProgress ? (
                          <select
                            value={row.status}
                            onChange={(event) => {
                              const status = event.target.value as ScheduleStatus;
                              patchTask(row.id, {
                                status,
                                ...(status === "Done" ? { percentDone: 100, actualEnd: row.actualEnd || TODAY_ISO } : {}),
                                ...(status === "In Progress" && !row.actualStart ? { actualStart: TODAY_ISO } : {}),
                              }, session);
                              if (status === "Blocked") notify(t("Say what is blocking it in the note, so the PM can help"));
                            }}
                          >
                            {SCHEDULE_STATUSES.filter((status) => status !== "Cancelled" || perm.canEditPlan).map((status) => (
                              <option key={status} value={status}>{t(status)}</option>
                            ))}
                          </select>
                        ) : <Badge tone={scheduleTone(row)}>{t(row.status)}</Badge>}
                    </td>
                    <td>
                      {row.hasChildren ? <span className="cell-text computed">{row.actualStart ? formatDate(row.actualStart) : "—"}</span>
                        : perm.canEditProgress
                          ? <input type="date" value={row.actualStart} onChange={(event) => patchTask(row.id, { actualStart: event.target.value }, session)} />
                          : <span className="cell-text">{row.actualStart ? formatDate(row.actualStart) : "—"}</span>}
                    </td>
                    <td>
                      {row.hasChildren ? <span className="cell-text computed">{row.actualEnd ? formatDate(row.actualEnd) : "—"}</span>
                        : perm.canEditProgress
                          ? <input type="date" value={row.actualEnd} onChange={(event) => patchTask(row.id, { actualEnd: event.target.value, ...(event.target.value ? { percentDone: 100, status: "Done" as ScheduleStatus } : {}) }, session)} />
                          : <span className="cell-text">{row.actualEnd ? formatDate(row.actualEnd) : "—"}</span>}
                    </td>
                    <td>
                      {row.hasChildren ? <span className="cell-text muted">—</span>
                        : perm.canEditProgress ? (
                          <input
                            type="date" value={row.forecastEnd} className={row.needsForecast ? "needs-input" : undefined}
                            title={row.needsForecast ? t("This is past its plan date — when will it finish?") : undefined}
                            onChange={(event) => patchTask(row.id, { forecastEnd: event.target.value }, session)}
                          />
                        ) : <span className="cell-text">{row.forecastEnd ? formatDate(row.forecastEnd) : "—"}</span>}
                    </td>
                    <td>
                      <span className={`cell-text muted ${row.isStale ? "amber-text" : ""}`} title={row.isStale ? t("No update for more than 5 work days") : undefined}>
                        {formatDate(row.updatedAt)}
                      </span>
                    </td>
                    <td>
                      <div className="row tight" style={{ justifyContent: "flex-end" }}>
                        {row.openRequests ? <span className="req-chip" title={t("Waiting for the PM")}>+{row.openRequests}</span> : null}
                        {!row.hasChildren && perm.canEditProgress && !perm.canEditPlan ? (
                          <button className="row-action" type="button" title={t("Request more days")} onClick={() => onRequest(row)}>
                            <Icon name="clock" />
                          </button>
                        ) : null}
                        {perm.canAddDetail ? (
                          <button className="row-action" type="button" title={t("Add work detail")} onClick={() => setAddingUnder(addingUnder === row.id ? "" : row.id)}>
                            <Icon name="plus" />
                          </button>
                        ) : null}
                        {perm.canDelete && !row.hasChildren ? (
                          <button className="row-action" type="button" title={t("Delete")} onClick={() => removeTask(row.id, session)}>
                            <Icon name="trash" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </>
                ) : (
                  <td className="num"><span className="cell-text num">{row.percentDone}%</span></td>
                )}
              </tr>,
              addingUnder === row.id && !customerView ? (
                <tr key={`${row.id}-add`} className="detail-row">
                  <td /><td colSpan={customerView ? 7 : 14}>
                    <AddDetailRow parent={row} onDone={() => setAddingUnder("")} />
                  </td>
                </tr>
              ) : null,
              isPhase && managing && !collapsed.has(row.id) ? (
                <tr key={`${row.id}-addtask`} className="add-line">
                  <td /><td colSpan={13}>
                    <button className="link-btn" type="button" onClick={() => addTaskUnder(row)}>
                      <Icon name="plus" />{t("Add task to")} {row.name || row.wbs}
                    </button>
                  </td><td />
                </tr>
              ) : null,
            ];
          })}
          {managing ? (
            <tr className="add-line">
              <td /><td colSpan={14}>
                <button className="link-btn" type="button" onClick={addPhase}>
                  <Icon name="layers" />{t("Add phase")}
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PicPicker({ row, project, onChange }: {
  row: ScheduleRow; project: Project; onChange: (picIds: string[]) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const candidates = USERS.filter((user) => project.members.includes(user.id) || user.id === project.leadEngineerId);
  return (
    <span className="pic-picker">
      <button className="row-action" type="button" title={t("Assign PIC")} onClick={() => setOpen(!open)}>
        <Icon name="user" />
      </button>
      {open ? (
        <span className="pic-pop">
          {candidates.map((user) => (
            <label key={user.id}>
              <input
                type="checkbox" checked={row.picIds.includes(user.id)}
                onChange={(event) => onChange(event.target.checked
                  ? [...row.picIds, user.id]
                  : row.picIds.filter((picId) => picId !== user.id))}
              />
              <span>{user.name}</span>
            </label>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/* ==========================================================================
   The timeline — baseline strip under the live bar, slip tail in red
   ========================================================================== */

function ScheduleTimeline({ rows, collapsed, onToggle, showBaseline }: {
  rows: ScheduleRow[]; collapsed: Set<string>; onToggle: (id: string) => void; showBaseline: boolean;
}) {
  const t = useT();
  const first = rows.map((row) => row.start).filter(Boolean).sort()[0] ?? TODAY_ISO;
  const last = rows.map((row) => row.end).filter(Boolean).sort().slice(-1)[0] ?? TODAY_ISO;
  const weekCount = Math.min(30, Math.max(8, Math.ceil((toDate(last).getTime() - toDate(first).getTime()) / 604_800_000) + 2));
  const weeks = weeksFrom(toDate(first), weekCount);
  const gridStart = weeks[0].start.getTime();
  const gridSpan = weeks[weeks.length - 1].end.getTime() + 86_400_000 - gridStart;
  const todayLeft = ((TODAY.getTime() - gridStart) / gridSpan) * 100;

  return (
    <div className="gantt-wrap">
      <div className="gantt schedule-gantt" style={{ ["--weeks" as string]: weeks.length }}>
        <div className="gantt-head">
          <div className="gantt-side">{t("Task")}</div>
          <div className="gantt-weeks">
            {weeks.map((week) => (
              <span key={week.label} className={week.isCurrent ? "current" : undefined}>
                <b>{week.label}</b>
                <em>{week.month}</em>
              </span>
            ))}
          </div>
        </div>

        {rows.map((row) => {
          const position = barPosition({ start: row.start, end: row.end } as never, weeks)
            ?? barPosition({ start: row.planStart, end: row.planEndDate } as never, weeks);
          const basePosition = showBaseline && row.baselineStart
            ? barPosition({ start: row.baselineStart, end: row.baselineEnd } as never, weeks)
            : null;
          const slip = row.varianceDays > 0 && row.baselineEnd
            ? barPosition({ start: row.baselineEnd, end: row.end } as never, weeks)
            : null;
          const isPhase = row.depth === 1;
          return (
            <div className={`gantt-row ${isPhase ? "phase" : ""}`} key={row.id}>
              <div className="gantt-side" style={{ paddingLeft: 12 + (row.depth - 1) * 14 }}>
                {row.hasChildren ? (
                  <button className="row-action" type="button" onClick={() => onToggle(row.id)}>
                    <Icon name={collapsed.has(row.id) ? "chevronRight" : "chevronDown"} />
                  </button>
                ) : null}
                <span className="mono muted" style={{ fontSize: 10 }}>{row.wbs}</span>
                <div>
                  <strong>{row.milestone ? "◆ " : ""}{row.name}</strong>
                  <small>
                    {row.picIds.map((picId) => userOf(picId)?.initials).filter(Boolean).join(" ")}
                    {row.picExternal ? ` · ${row.picExternal}` : ""}
                    {row.isLate ? ` · ${t("late")}` : ""}
                  </small>
                </div>
                <Badge tone={scheduleTone(row)}>{row.percentDone}%</Badge>
              </div>
              <div className="gantt-track">
                <span className="gantt-today" style={{ left: `${Math.min(99.5, Math.max(0, todayLeft))}%` }} />
                <div className="gantt-line">
                  {basePosition ? (
                    <span className="gantt-baseline" style={{ left: `${basePosition.left}%`, width: `${basePosition.width}%` }} title={`${t("Baseline")}: ${formatDate(row.baselineStart)} → ${formatDate(row.baselineEnd)}`} />
                  ) : null}
                  {position ? (
                    row.milestone && !row.hasChildren ? (
                      <span className={`gantt-diamond ${row.status === "Done" ? "done" : ""}`} style={{ left: `${position.left}%` }} title={row.name} />
                    ) : (
                      <span
                        className={`gantt-bar ${isPhase ? "summary" : row.kind === "detail" ? "sky" : row.status === "Done" ? "green" : "blue"} ${row.isLate ? "late" : ""}`}
                        style={{ left: `${position.left}%`, width: `${position.width}%` }}
                        title={`${row.name} · ${formatDate(row.start)} → ${formatDate(row.end)} · ${row.percentDone}%`}
                      >
                        <i style={{ width: `${row.percentDone}%` }} />
                        <span>{row.name}</span>
                      </span>
                    )
                  ) : null}
                  {slip ? (
                    <span className="gantt-slip" style={{ left: `${slip.left}%`, width: `${slip.width}%` }} title={`+${row.varianceDays} ${t("work days vs baseline")}`} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   Updates — the request queue first, then who moved what
   ========================================================================== */

function UpdatesTab({ project, updates, rows, canAnswer, notify }: {
  project: Project;
  updates: ScheduleUpdate[];
  rows: ScheduleRow[];
  canAnswer: boolean;
  notify: (message: string) => void;
}) {
  const t = useT();
  const session = useSession();
  const wbsOf = new Map(rows.map((row) => [row.id, row]));
  const open = updates.filter((entry) => entry.requestDays > 0 && entry.answer === "");
  const feed = [...updates].reverse();
  const stale = rows.filter((row) => row.isStale);

  return (
    <section className="grid-main">
      <div className="stack">
        <Panel title={t("Requests for more days")} subtitle={`${open.length} ${t("waiting for a decision")}`} flush>
          <div className="panel-body">
            {open.length ? open.map((request) => {
              const row = wbsOf.get(request.taskId);
              return (
                <div className="request-row" key={request.id}>
                  <div className="request-head">
                    <Person initials={userOf(request.by)?.initials ?? "—"} name={userName(request.by)} />
                    <strong>{row ? `${row.wbs} ${row.name}` : request.taskId}</strong>
                    <Pill tone="amber">{request.to}</Pill>
                  </div>
                  <p className="muted">{request.comment}</p>
                  {row ? (
                    <p className="request-impact">
                      <Icon name="alertTriangle" />
                      {t("Accepting moves this task's end to")} {formatDate(resolveEndAfter(row, request.requestDays))}
                      {row.baselineEnd ? ` · ${t("vs baseline")} ${formatDate(row.baselineEnd)}` : ""}
                    </p>
                  ) : null}
                  {canAnswer ? (
                    <div className="row tight">
                      <button className="btn primary sm" type="button" onClick={() => { answerRequest(request.id, "Accepted", "", session); notify(t("Accepted — the plan has the extra days")); }}>
                        <Icon name="check" />{t("Accept")}
                      </button>
                      <button className="btn default sm" type="button" onClick={() => { answerRequest(request.id, "Rejected", "", session); notify(t("Rejected — the owner keeps the original dates")); }}>
                        <Icon name="x" />{t("Reject")}
                      </button>
                    </div>
                  ) : <p className="muted">{t("Waiting for")} {userName(project.managerId)}</p>}
                </div>
              );
            }) : <p className="muted">{t("No open request — nobody is waiting on the PM.")}</p>}
          </div>
        </Panel>

        {stale.length ? (
          <Panel title={t("Not updated for 5 work days")} subtitle={`${stale.length} ${t("rows")}`} flush>
            <div className="panel-body">
              {stale.map((row) => (
                <div className="file-row" key={row.id}>
                  <span className="file-icon"><Icon name="clock" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{row.wbs} {row.name}</strong>
                    <small>{row.picIds.map((picId) => userName(picId)).join(", ") || row.picExternal} · {t("last update")} {formatDate(row.updatedAt)}</small>
                  </div>
                  <Badge tone="amber">{row.percentDone}%</Badge>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>

      <Panel title={t("Update feed")} subtitle={t("Every change, from every member, in one place — the Monday meeting agenda")} flush>
        <div className="panel-body feed">
          {feed.slice(0, 30).map((entry) => {
            const row = wbsOf.get(entry.taskId);
            return (
              <div className="feed-row" key={entry.id}>
                <span className="avatar sm">{userOf(entry.by)?.initials ?? "—"}</span>
                <div>
                  <p>
                    <strong>{userName(entry.by)}</strong>
                    {" · "}{row ? `${row.wbs} ${row.name}` : entry.field === "baseline" ? t("Baseline") : t("Plan")}
                  </p>
                  <p className="muted">
                    {entry.field === "request"
                      ? `${t("Requested")} ${entry.to}${entry.answer ? ` · ${t(entry.answer)}` : ` · ${t("waiting")}`}`
                      : entry.field === "baseline" ? `${entry.from} → ${entry.to}`
                        : entry.field === "created" ? `${t("Added")} ${entry.to}`
                          : `${t(fieldLabel(entry.field))}: ${entry.from || "—"} → ${entry.to || "—"}`}
                    {entry.comment ? ` · “${entry.comment}”` : ""}
                  </p>
                </div>
                <span className="muted mono" style={{ fontSize: 11 }}>{entry.at.slice(5, 16)}</span>
              </div>
            );
          })}
          {!feed.length ? <p className="muted">{t("No update yet.")}</p> : null}
        </div>
      </Panel>
    </section>
  );
}

const fieldLabel = (field: ScheduleUpdate["field"]) =>
  (field === "percentDone" ? "% done"
    : field === "actualStart" ? "Actual start"
      : field === "actualEnd" ? "Actual end"
        : field === "forecastEnd" ? "Forecast"
          : field === "status" ? "Status"
            : field === "note" ? "Note" : "Plan");

const resolveEndAfter = (row: ScheduleRow, extraDays: number) => {
  const end = new Date(toDate(row.planEndDate).getTime() + extraDays * 86_400_000);
  return `${end.getFullYear()}-${`${end.getMonth() + 1}`.padStart(2, "0")}-${`${end.getDate()}`.padStart(2, "0")}`;
};

/* ==========================================================================
   Baseline — the promise, and everything that drifted from it
   ========================================================================== */

function BaselineTab({ rows, baselines, canBaseline, onFreeze }: {
  rows: ScheduleRow[];
  baselines: { id: string; rev: number; label: string; takenAt: string; takenBy: string; reason: string; promisedFinish: string }[];
  canBaseline: boolean;
  onFreeze: () => void;
}) {
  const t = useT();
  const tracked = rows.filter((row) => row.baselineEnd && row.kind !== "phase");
  const slipped = [...tracked].sort((a, b) => b.varianceDays - a.varianceDays);
  const newRows = rows.filter((row) => !row.hasChildren && !row.baselineEnd && row.kind !== "detail");

  if (!baselines.length) {
    return (
      <Panel title={t("Baseline")} flush>
        <EmptyState
          icon="lock"
          title={t("No baseline frozen yet")}
          message={t("Freeze the plan when the customer agrees to it — from then on every slip is measured, not forgotten.")}
          action={canBaseline ? (
            <button className="btn primary" type="button" onClick={onFreeze}><Icon name="lock" />{t("Freeze baseline")}</button>
          ) : undefined}
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel title={t("Baseline revisions")} flush>
        <div className="panel-body">
          {[...baselines].sort((a, b) => b.rev - a.rev).map((entry) => (
            <div className="file-row" key={entry.id}>
              <span className="file-icon"><Icon name="lock" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{entry.label}</strong>
                <small>{t("frozen")} {formatDate(entry.takenAt)} · {userName(entry.takenBy)} · {t("promised finish")} {formatDate(entry.promisedFinish)}{entry.reason ? ` · ${entry.reason}` : ""}</small>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title={t("Variance against the baseline")}
        subtitle={t("Signed work days — the rows dragging the delivery date are on top")}
        flush
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th><th>{t("Task")}</th>
                <th>{t("Baseline end")}</th><th>{t("Current end")}</th>
                <th className="num">{t("Slip (work days)")}</th>
                <th className="num">% {t("done")}</th>
                <th className="num">{t("Expected")} %</th>
                <th className="num">{t("Drift")}</th>
              </tr>
            </thead>
            <tbody>
              {slipped.map((row) => (
                <tr key={row.id} className={row.varianceDays > 0 ? "row-late" : row.varianceDays < 0 ? "row-ok" : undefined}>
                  <td className="mono">{row.wbs}</td>
                  <td><strong>{row.name}</strong></td>
                  <td>{formatDate(row.baselineEnd)}</td>
                  <td className={row.varianceDays > 0 ? "red-text" : undefined}>{formatDate(row.end)}</td>
                  <td className="num"><strong className={row.varianceDays > 0 ? "red-text" : row.varianceDays < 0 ? "green-text" : undefined}>
                    {row.varianceDays > 0 ? "+" : ""}{row.varianceDays}
                  </strong></td>
                  <td className="num">{row.percentDone}%</td>
                  <td className="num muted">{row.expectedPercent}%</td>
                  <td className="num"><Badge tone={row.drift < -15 ? "red" : row.drift < -5 ? "amber" : "green"}>{row.drift > 0 ? "+" : ""}{row.drift}</Badge></td>
                </tr>
              ))}
              {newRows.length ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {newRows.length} {t("row(s) added after the baseline — they carry no promise yet")}: {newRows.map((row) => row.wbs).join(", ")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Modals
   ========================================================================== */

function FreezeModal({ project, rev, requireReason, onClose, onFreeze }: {
  project: Project; rev: number; requireReason: boolean;
  onClose: () => void; onFreeze: (label: string, reason: string) => void;
}) {
  const t = useT();
  const [label, setLabel] = useState(`Rev ${rev}${project.poNo ? ` — PO ${project.poNo}` : ""}`);
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={requireReason ? t("Re-baseline") : t("Freeze baseline")}
      subtitle={t("The plan as it stands becomes the promise. Every later change is measured against it — slip cannot disappear.")}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button
            className="btn primary" type="button" disabled={requireReason && !reason.trim()}
            onClick={() => onFreeze(label, reason)}
          >
            <Icon name="lock" />{t("Freeze")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Label")} span={4}><input value={label} onChange={(event) => setLabel(event.target.value)} /></Field>
        <Field label={requireReason ? t("Reason (required — why does the promise change?)") : t("Reason (optional)")} span={4}>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requireReason ? t("e.g. customer added rack storage scope") : ""} />
        </Field>
      </div>
    </Modal>
  );
}

function TemplateModal({ project, onClose, onApply }: {
  project: Project; onClose: () => void; onApply: (templateId: string, from: string) => void;
}) {
  const t = useT();
  const fit = SCHEDULE_TEMPLATES.find((entry) => entry.projectType === project.projectType) ?? SCHEDULE_TEMPLATES[0];
  const [templateId, setTemplateId] = useState(fit.id);
  const [from, setFrom] = useState(project.startDate || TODAY_ISO);
  const template = SCHEDULE_TEMPLATES.find((entry) => entry.id === templateId) ?? SCHEDULE_TEMPLATES[0];
  return (
    <Modal
      title={t("Apply template")}
      subtitle={t("The team's standard phase structure, ready the day the PO lands — adjust dates and assign owners after.")}
      onClose={onClose}
      footer={
        <>
          <span className="muted">{template.rows.length} {t("rows")}</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" onClick={() => onApply(templateId, from)}><Icon name="check" />{t("Apply template")}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Template")} span={3}>
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {SCHEDULE_TEMPLATES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </Field>
        <Field label={t("Start from")}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
      </div>
      <ul className="check-list" style={{ marginTop: 12 }}>
        {template.rows.filter((row) => !row.path.includes(".")).map((row) => (
          <li className="check-item pass" key={row.path}>
            <Icon name="checkCircle" />
            <div><strong>{row.path}. {row.name}</strong></div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

