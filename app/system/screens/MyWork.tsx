"use client";

import { useEffect, useRef, useState } from "react";
import { PROJECTS, type ScheduleStatus } from "../data";
import {
  formatDate, networkDays, resolveSchedule, schedulePermission, scheduleTone, TODAY, TODAY_ISO,
  toDate, userName, type ScheduleRow,
} from "../calc";
import { addTask, patchTask, removeTask, requestDays, useScheduleStore } from "../store";
import { useSession, type Session } from "../session";
import { Badge, EmptyState, Field, Icon, Modal, Panel, PageHeader, Pill, SummaryTile, Tabs } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";
import type { Tone } from "../ui";

export const statusTone = (status: ScheduleStatus): Tone =>
  (status === "Done" ? "green" : status === "Blocked" ? "red" : status === "In Progress" ? "blue" : "slate");

/** Every leaf row across all projects that belongs to this member. */
export function myRows(tasks: Parameters<typeof resolveSchedule>[0], updates: Parameters<typeof resolveSchedule>[2], userId: string) {
  const rows: (ScheduleRow & { projectNo: string; projectName: string })[] = [];
  for (const project of PROJECTS) {
    const resolved = resolveSchedule(tasks, project.id, updates);
    for (const row of resolved) {
      if (row.hasChildren || row.status === "Cancelled") continue;
      if (row.picIds.includes(userId) || (row.origin === "Member" && row.createdBy === userId)) {
        rows.push({ ...row, projectNo: project.no, projectName: project.name });
      }
    }
  }
  return rows;
}

export default function MyWork({ go, notify }: ScreenProps) {
  const t = useT();
  const session = useSession();
  const store = useScheduleStore();
  const [tab, setTab] = useState<"today" | "log">("today");
  const [requestFor, setRequestFor] = useState<ScheduleRow | null>(null);

  const rows = myRows(store.tasks, store.updates, session.user.id);
  const open = rows.filter((row) => row.status !== "Done");
  const needsUpdate = open.filter((row) => row.isLate || row.status === "Blocked" || row.needsForecast || row.isStale);
  const dueThisWeek = open.filter((row) => {
    const days = Math.round((toDate(row.end).getTime() - TODAY.getTime()) / 86_400_000);
    return days >= 0 && days <= 7;
  });
  const waiting = store.updates.filter((entry) => entry.by === session.user.id && entry.requestDays > 0 && entry.answer === "");
  const myLog = [...store.updates].filter((entry) => entry.by === session.user.id).reverse();

  return (
    <>
      <PageHeader
        eyebrow={t("MY WORK")}
        title={t("My Work")}
        subtitle={t("Everything assigned to you, across every project. Update it here — the project schedule, the PM's view and the customer plan update with it.")}
      />

      <div className="info-strip">
        <Icon name="lock" />
        {t("You update the tasks assigned to you. Dates and scope belong to the project manager — use Request more days when you need a change.")}
      </div>

      <section className="summary-strip">
        <SummaryTile label={t("Needs update")} value={`${needsUpdate.length}`} tone={needsUpdate.length ? "amber" : "green"} strong />
        <SummaryTile label={t("Late")} value={`${open.filter((row) => row.isLate).length}`} tone={open.some((row) => row.isLate) ? "red" : "green"} />
        <SummaryTile label={t("Blocked")} value={`${open.filter((row) => row.status === "Blocked").length}`} tone={open.some((row) => row.status === "Blocked") ? "red" : "green"} />
        <SummaryTile label={t("Due this week")} value={`${dueThisWeek.length}`} />
        <SummaryTile label={t("Awaiting the PM")} value={`${waiting.length}`} note={waiting.length ? t("requests sent") : t("nothing pending")} />
      </section>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "today", label: t("My tasks"), count: open.length },
          { id: "log", label: t("My updates") },
        ]}
      />

      {tab === "today" ? (
        <>
          {needsUpdate.length ? (
            <Panel title={t("Needs your update")} subtitle={t("Late, blocked or quiet for too long — clear these first")} flush>
              <div className="panel-body">
                {needsUpdate.map((row) => (
                  <QueueRow key={row.id} row={row} session={session} notify={notify} onRequest={() => setRequestFor(row)} />
                ))}
              </div>
            </Panel>
          ) : null}

          <MyTaskGroups rows={rows} session={session} notify={notify} onRequest={setRequestFor} go={go} />

          {!rows.length ? (
            <Panel title={t("My tasks")} flush>
              <EmptyState icon="checkCircle" title={t("Nothing assigned to you yet")} message={t("When the project manager assigns you a task it appears here.")} />
            </Panel>
          ) : null}
        </>
      ) : null}

      {tab === "log" ? (
        <Panel title={t("My updates")} subtitle={t("What you reported, in order")} flush>
          <div className="panel-body feed">
            {myLog.slice(0, 40).map((entry) => {
              const row = rows.find((candidate) => candidate.id === entry.taskId);
              return (
                <div className="feed-row" key={entry.id}>
                  <span className="avatar sm">{session.user.initials}</span>
                  <div>
                    <p><strong>{row ? `${row.projectNo} · ${row.wbs} ${row.name}` : entry.taskId}</strong></p>
                    <p className="muted">
                      {entry.field === "request"
                        ? `${t("Requested")} ${entry.to}${entry.answer ? ` · ${t(entry.answer)}` : ` · ${t("waiting")}`}`
                        : `${entry.field}: ${entry.from || "—"} → ${entry.to || "—"}`}
                      {entry.comment ? ` · “${entry.comment}”` : ""}
                    </p>
                  </div>
                  <span className="muted mono" style={{ fontSize: 11 }}>{entry.at.slice(5, 16)}</span>
                </div>
              );
            })}
            {!myLog.length ? <p className="muted">{t("No update yet.")}</p> : null}
          </div>
        </Panel>
      ) : null}

      {requestFor ? <RequestDaysModal row={requestFor} onClose={() => setRequestFor(null)} notify={notify} /> : null}
    </>
  );
}

/* --------------------------------------------------------------------------
   One urgent row: report in one click, nothing to save
   -------------------------------------------------------------------------- */

function QueueRow({ row, session, notify, onRequest }: {
  row: ScheduleRow & { projectNo?: string };
  session: Session;
  notify: (message: string) => void;
  onRequest: () => void;
}) {
  const t = useT();
  const reason = row.status === "Blocked" ? t("Blocked") : row.isLate ? t("Late") : row.needsForecast ? t("Needs a forecast") : t("No update for 5 days");
  return (
    <div className={`queue-row ${row.status === "Blocked" || row.isLate ? "hot" : ""}`}>
      <div className="queue-head">
        <Badge tone={scheduleTone(row)}>{reason}</Badge>
        <strong>{row.projectNo ? `${row.projectNo} · ` : ""}{row.wbs} {row.name}</strong>
        <span className="muted">{formatDate(row.planStart)} → {formatDate(row.planEndDate)}</span>
      </div>
      <QuickControls row={row} session={session} notify={notify} onRequest={onRequest} />
      {row.needsForecast ? (
        <p className="queue-nag"><Icon name="alertTriangle" />{t("This was due")} {formatDate(row.planEndDate)} — {t("set the forecast date so the plan tells the truth.")}</p>
      ) : null}
    </div>
  );
}

/** The percent strip + status + start/finish today. Saves on every click. */
function QuickControls({ row, session, notify, onRequest }: {
  row: ScheduleRow;
  session: Session;
  notify: (message: string) => void;
  onRequest: () => void;
}) {
  const t = useT();
  return (
    <div className="quick-controls">
      <div className="pct-strip" role="group" aria-label={t("Percent done")}>
        {[0, 25, 50, 75, 100].map((value) => (
          <button
            key={value} type="button"
            className={row.percentDone === value ? "on" : undefined}
            onClick={() => patchTask(row.id, {
              percentDone: value,
              ...(value === 100 ? { status: "Done" as ScheduleStatus, actualEnd: row.actualEnd || TODAY_ISO } : {}),
              ...(value > 0 && value < 100 && row.status === "Not Started" ? { status: "In Progress" as ScheduleStatus, actualStart: row.actualStart || TODAY_ISO } : {}),
            }, session)}
          >
            {value}
          </button>
        ))}
      </div>
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
        {(["Not Started", "In Progress", "Blocked", "Done"] as ScheduleStatus[]).map((status) => (
          <option key={status} value={status}>{t(status)}</option>
        ))}
      </select>
      {!row.actualStart ? (
        <button className="btn default sm" type="button" onClick={() => { patchTask(row.id, { actualStart: TODAY_ISO, status: "In Progress" }, session); notify(t("Started — actual start is today")); }}>
          <Icon name="play" />{t("Start today")}
        </button>
      ) : null}
      {row.status !== "Done" ? (
        <button className="btn default sm" type="button" onClick={() => { patchTask(row.id, { actualEnd: TODAY_ISO, percentDone: 100, status: "Done" }, session); notify(t("Done — well done")); }}>
          <Icon name="checkCircle" />{t("Finish today")}
        </button>
      ) : null}
      {row.needsForecast || row.isLate ? (
        <label className="forecast-inline">
          <span>{t("Forecast")}</span>
          <input type="date" value={row.forecastEnd} className={row.needsForecast ? "needs-input" : undefined} onChange={(event) => patchTask(row.id, { forecastEnd: event.target.value }, session)} />
        </label>
      ) : null}
      <input
        className="note-inline" placeholder={row.status === "Blocked" ? t("What is blocking it? (required)") : t("Note…")}
        defaultValue={row.status === "Blocked" ? row.blockedReason : row.note}
        onBlur={(event) => {
          const value = event.target.value;
          if (row.status === "Blocked") patchTask(row.id, { blockedReason: value, note: value }, session);
          else if (value !== row.note) patchTask(row.id, { note: value }, session);
        }}
      />
      <button className="row-action" type="button" title={t("Request more days")} onClick={onRequest}>
        <Icon name="clock" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   My tasks, grouped project → phase, with "add my task" under each of mine
   -------------------------------------------------------------------------- */

function MyTaskGroups({ rows, session, notify, onRequest, go }: {
  rows: (ScheduleRow & { projectNo: string; projectName: string })[];
  session: Session;
  notify: (message: string) => void;
  onRequest: (row: ScheduleRow) => void;
  go: ScreenProps["go"];
}) {
  const t = useT();
  const store = useScheduleStore();
  const projects = [...new Set(rows.map((row) => row.projectNo))];

  return (
    <>
      {projects.map((projectNo) => {
        const project = PROJECTS.find((entry) => entry.no === projectNo)!;
        const resolved = resolveSchedule(store.tasks, project.id, store.updates);
        const mine = rows.filter((row) => row.projectNo === projectNo);
        const phaseOf = (row: ScheduleRow) => {
          let up = resolved.find((candidate) => candidate.id === row.parentId);
          while (up && up.depth > 1) up = resolved.find((candidate) => candidate.id === up!.parentId);
          return up;
        };
        const phases = [...new Set(mine.map((row) => phaseOf(row)?.id ?? ""))];

        return (
          <Panel
            key={projectNo}
            title={`${projectNo} — ${project.name}`}
            subtitle={`${mine.filter((row) => row.status === "Done").length}/${mine.length} ${t("done")} · ${t("Project manager")}: ${userName(project.managerId)}`}
            actions={
              <button className="btn default sm" type="button" onClick={() => go({ name: "schedule", id: project.id })}>
                <Icon name="calendar" />{t("Whole plan")}
              </button>
            }
            flush
          >
            <div className="panel-body">
              {phases.map((phaseId) => {
                const phase = resolved.find((candidate) => candidate.id === phaseId);
                const inPhase = mine.filter((row) => (phaseOf(row)?.id ?? "") === phaseId);
                // A member's own detail rows render under the task they break down.
                const topLevel = inPhase.filter((row) => row.kind !== "detail" || !inPhase.some((parent) => parent.id === row.parentId));
                return (
                  <div className="phase-group" key={phaseId || "none"}>
                    {phase ? (
                      <p className="phase-label">
                        <span className="mono muted">{phase.wbs}</span> {phase.name}
                        <Badge tone={scheduleTone(phase)}>{phase.percentDone}%</Badge>
                      </p>
                    ) : null}
                    {topLevel.map((row) => (
                      <MyTaskRow key={row.id} row={row} all={resolved} session={session} notify={notify} onRequest={() => onRequest(row)} />
                    ))}
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </>
  );
}

function MyTaskRow({ row, all, session, notify, onRequest }: {
  row: ScheduleRow;
  all: ScheduleRow[];
  session: Session;
  notify: (message: string) => void;
  onRequest: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const details = all.filter((candidate) => candidate.parentId === row.id);
  const project = PROJECTS.find((entry) => entry.id === row.projectId)!;
  const perm = schedulePermission(session.user, session.role, project, row);

  return (
    <div className={`my-task ${row.isLate ? "late" : ""}`}>
      <div className="my-task-head">
        <span className="mono muted">{row.wbs}</span>
        <strong>{row.name}</strong>
        {row.origin === "Member" ? <Pill tone="blue">{t("own")}</Pill> : null}
        {row.milestone ? <Pill tone="violet">◆ {t("Milestone")}</Pill> : null}
        <span className="muted">{formatDate(row.planStart)} → {formatDate(row.planEndDate)} · {networkDays(row.planStart, row.planEndDate)} {t("work days")}</span>
        {row.openRequests ? <Pill tone="amber">{t("Requested more days")}</Pill> : null}
      </div>

      {details.length ? (
        <p className="muted" style={{ margin: "2px 0 4px" }}>
          {t("Progress comes from your")} {details.length} {t("work details below")} — <strong>{row.percentDone}%</strong>
        </p>
      ) : (
        <QuickControls row={row} session={session} notify={notify} onRequest={onRequest} />
      )}

      {details.map((detail) => (
        <div className="my-detail" key={detail.id}>
          <span className="mono muted">{detail.wbs}</span>
          <span className="my-detail-name">{detail.name}</span>
          <QuickControls row={detail} session={session} notify={notify} onRequest={onRequest} />
          {perm.canAddDetail && !detail.hasChildren && detail.createdBy === session.user.id ? (
            <button className="row-action" type="button" title={t("Delete")} onClick={() => removeTask(detail.id, session)}>
              <Icon name="trash" />
            </button>
          ) : null}
        </div>
      ))}

      {perm.canAddDetail ? (
        adding ? (
          <AddDetailRow parent={row} onDone={() => setAdding(false)} />
        ) : (
          <button className="link-btn" type="button" onClick={() => setAdding(true)}>
            <Icon name="plus" />{t("Add my task")}
          </button>
        )
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Shared with the schedule workspace
   -------------------------------------------------------------------------- */

/** Sheet 2's "Work detail ( Please input your task )" — the member's own row. */
export function AddDetailRow({ parent, onDone }: { parent: ScheduleRow; onDone: () => void }) {
  const t = useT();
  const session = useSession();
  const [name, setName] = useState("");
  const [days, setDays] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const save = (again: boolean) => {
    if (!name.trim()) { onDone(); return; }
    addTask({
      projectId: parent.projectId, parentId: parent.id, order: 1000 + Math.floor(days), kind: "detail",
      name: name.trim(), milestone: false, origin: "Member", createdBy: session.user.id,
      visibility: "Internal",
      planStart: parent.actualStart || parent.planStart, planDays: Math.max(1, days),
      startMode: "manual", predecessorId: "", lagDays: 0,
      picIds: [session.user.id], picExternal: "", planManDays: 0,
      baselineStart: "", baselineEnd: "", baselineDays: 0, baselineRev: 0,
      actualStart: "", actualEnd: "", forecastEnd: "", percentDone: 0, status: "Not Started",
      blockedReason: "", note: "", actualManDays: 0, updatedBy: session.user.id, updatedAt: TODAY_ISO,
    }, session);
    setName("");
    setDays(1);
    if (!again) onDone();
    else inputRef.current?.focus();
  };

  return (
    <div className="add-detail">
      <Icon name="plus" />
      <input
        ref={inputRef} value={name} placeholder={t("What will you do inside this task?")}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(true); } if (event.key === "Escape") onDone(); }}
      />
      <label className="muted">
        {t("Days")}
        <input className="num" type="number" min="1" style={{ width: 56 }} value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value)))} />
      </label>
      <button className="btn primary sm" type="button" onClick={() => save(false)}><Icon name="check" />{t("Add")}</button>
      <button className="btn default sm" type="button" onClick={onDone}>{t("Cancel")}</button>
      <span className="muted">{t("Enter adds the next one — your rows stay internal.")}</span>
    </div>
  );
}

/** Ask the PM for more days. Changes no date until it is accepted. */
export function RequestDaysModal({ row, onClose, notify }: {
  row: ScheduleRow; onClose: () => void; notify: (message: string) => void;
}) {
  const t = useT();
  const session = useSession();
  const [days, setDays] = useState(2);
  const [comment, setComment] = useState("");
  return (
    <Modal
      title={t("Request more days")}
      subtitle={`${row.wbs} ${row.name} · ${t("plan")} ${formatDate(row.planStart)} → ${formatDate(row.planEndDate)}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted">{t("The dates change only when the PM accepts.")}</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button
            className="btn primary" type="button" disabled={!comment.trim()}
            onClick={() => {
              requestDays(row.id, days, comment.trim(), session);
              onClose();
              notify(t("Request sent to the project manager"));
            }}
          >
            <Icon name="send" />{t("Send request")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Extra days needed")}>
          <input className="num" type="number" min="1" value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value)))} />
        </Field>
        <Field label={t("Why? (required — the PM decides with this)")} span={3}>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("e.g. rack anchor rework — re-drilling takes 3 days")} />
        </Field>
      </div>
    </Modal>
  );
}
