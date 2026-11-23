"use client";
/* My Work > My week (owner decision 2026-11-23): the person's own calendar, which replaces typing the week into
   Outlook. They book time for their work here; the API writes it into their Outlook calendar and drafts each day's
   hours from it, so the day is confirmed with one press in its footing. Meetings others send them come in from Outlook
   and can be tied to a piece of work. Rules: backend-node/src/routes/work-blocks.ts; layout helpers: lib/my-week.ts. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon, Modal } from "../ui";
import { WorkDayDialog } from "./WorkDaysPanel";
import { addDays, bangkokToday, dayState, mondayOf } from "../../../lib/work-days";
import {
  LUNCH_END,
  LUNCH_START,
  STEP,
  WORK_END,
  blockBody,
  dayBooked,
  dayColumns,
  dayItems,
  dayOf,
  freeSlot,
  gridWindow,
  hoursLeft,
  isWeekend,
  laneOf,
  minutesOf,
  overlapsBlocks,
  shownDates,
  timeChoices,
  timeText,
  weekSummary,
  type BacklogItem,
  type CalendarItem,
  type WeekBlock,
  type WeekData,
  type WeekMeeting,
  type WeekTeamTask,
} from "../../../lib/my-week";
import "./my-week.css";

const number = (value: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(value);
const dayLabel = (date: string) => new Intl.DateTimeFormat(currentLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const shortDate = (date: string) => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const EMPTY: Pick<WeekData, "blocks" | "meetings" | "teamTasks" | "leave"> = { blocks: [], meetings: [], teamTasks: [], leave: [] };
const START_TIMES = timeChoices(false),
  END_TIMES = timeChoices(true);

/** The block being booked or changed: work key, or a note (and the project it counts towards) for other work. */
type Draft = { id: number | null; date: string; start: string; end: string; workKey: string; note: string; projectId: string };

const OUTLOOK_LABEL: Record<WeekData["outlookWrite"]["state"], string> = {
  ok: "MyWeek.outlookOk",
  pending: "MyWeek.outlookPending",
  denied: "MyWeek.outlookDenied",
  failed: "MyWeek.outlookFailed",
  off: "MyWeek.outlookOff",
};

export function MyWeek({ notify }: { notify: (message: string) => void }) {
  const t = useT();
  const [monday, setMonday] = useState(() => mondayOf(bangkokToday()));
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; data: WeekData | null; error: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [meeting, setMeeting] = useState<WeekMeeting | null>(null);
  const [task, setTask] = useState<WeekTeamTask | "leave" | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readKey = `${monday}#${version}`;
  useEffect(() => {
    let live = true;
    apiRequest<WeekData>(`/api/v1/me/week?from=${monday}&to=${addDays(monday, 6)}`)
      .then((value) => {
        if (live) setResult({ key: readKey, data: value, error: "" });
      })
      .catch((failure: unknown) => {
        if (live) setResult((current) => ({ key: readKey, data: current?.data ?? null, error: failure instanceof Error ? failure.message : "MyWeek.loadFailed" }));
      });
    return () => {
      live = false;
    };
  }, [monday, readKey]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const loading = result?.key !== readKey;
  // The last week read stays on screen while the next one loads; only this week's data is laid out.
  const data = result?.data && result.data.days[0]?.date === monday ? result.data : null;
  const error = result?.key === readKey ? result.error : "";
  const today = data?.today ?? bangkokToday();
  // Monday to Sunday (owner 2026-11-23); the weekend narrower and shaded.
  const dates = useMemo(() => shownDates(monday), [monday]);
  const days = useMemo(() => dates.map((date) => ({ date, ...dayItems(date, data ?? EMPTY) })), [dates, data]);
  const span = gridWindow(days.flatMap((day) => day.timed));
  const rowOf = (minutes: number) => Math.round((Math.min(Math.max(minutes, span.start), span.end) - span.start) / STEP) + 1;
  const rows = (span.end - span.start) / STEP;
  const summary = data ? weekSummary(data, dates) : null;
  const backlog = data?.backlog ?? [];
  const hasAllDay = days.some((day) => day.allDay.length);
  const thisWeek = today >= monday && today <= addDays(monday, 6);

  const openNew = (date: string, minute?: number, workKey?: string) => {
    const work = workKey ?? backlog[0]?.workKey ?? "";
    if (minute !== undefined) {
      setDraft({ id: null, date, start: timeText(minute), end: timeText(Math.min(minute + 60, 24 * 60)), workKey: work, note: "", projectId: "" });
      return;
    }
    // The first free hour from that day on; a full week starts after working hours on the day asked for.
    const free = days
      .filter((day) => day.date >= date)
      .map((day) => ({ date: day.date, slot: freeSlot(day.timed) }))
      .find((day) => day.slot !== null);
    const slot = free?.slot ?? { start: WORK_END, end: WORK_END + 60 };
    setDraft({ id: null, date: free?.date ?? date, start: timeText(slot.start), end: timeText(slot.end), workKey: work, note: "", projectId: "" });
  };
  const openBlock = (block: WeekBlock) =>
    setDraft({
      id: block.id,
      date: block.date,
      start: block.start,
      end: block.end,
      workKey: block.workKey ?? "",
      note: block.workKey ? "" : block.title,
      projectId: block.projectId && !block.workKey ? String(block.projectId) : "",
    });
  const openItem = (item: CalendarItem) => {
    if (item.block) openBlock(item.block);
    else if (item.meeting) setMeeting(item.meeting);
    else setTask(item.task ?? "leave");
  };
  const bookDate = thisWeek ? today : monday;

  const confirm = async (date: string) => {
    setBusy(true);
    try {
      await apiRequest("/api/v1/me/work-days/confirm", { method: "POST", body: JSON.stringify({ dates: [date] }) });
      notify(t("Hours.saved"));
      reload();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("Hours.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const outlook = data?.outlookWrite;
  return (
    <section className="myweek" aria-label={t("MyWeek.tab")}>
      <div className="myweek-toolbar">
        <span className="myweek-nav">
          <button className="icon-btn" type="button" aria-label={t("Hours.prevWeek")} title={t("Hours.prevWeek")} onClick={() => setMonday(addDays(monday, -7))}>
            <Icon name="chevronLeft" />
          </button>
          <strong>
            {shortDate(monday)} – {shortDate(addDays(monday, 6))}
          </strong>
          <button className="icon-btn" type="button" aria-label={t("Hours.nextWeek")} title={t("Hours.nextWeek")} onClick={() => setMonday(addDays(monday, 7))}>
            <Icon name="chevronRight" />
          </button>
        </span>
        {!thisWeek ? (
          <button className="btn default sm" type="button" onClick={() => setMonday(mondayOf(today))}>
            {t("MyWeek.thisWeek")}
          </button>
        ) : null}
        {outlook ? (
          <span className={`myweek-outlook ${outlook.state}`} title={t("MyWeek.outlookHint")} data-guide="myweek.outlook">
            <Icon name={outlook.state === "ok" ? "check" : outlook.state === "pending" ? "refresh" : "alertTriangle"} />
            {t(OUTLOOK_LABEL[outlook.state])}
            {outlook.waiting && outlook.state !== "off" ? ` · ${number(outlook.waiting)}` : ""}
          </span>
        ) : null}
        <span className="myweek-actions">
          <a className="btn default sm" href="#/resources">
            <Icon name="calendar" />
            {t("MyWeek.appointment")}
          </a>
          <button className="btn primary sm" type="button" data-guide="myweek.book" disabled={!data} onClick={() => openNew(bookDate)}>
            <Icon name="plus" />
            {t("MyWeek.book")}
          </button>
        </span>
      </div>

      {error ? (
        <div className="info-strip red" role="alert">
          {t(error)}{" "}
          <button className="btn ghost sm" type="button" onClick={reload}>
            {t("Retry")}
          </button>
        </div>
      ) : null}

      {summary ? (
        <div className="myweek-summary" data-guide="myweek.week">
          <div className="myweek-bar-wrap">
            <span className="myweek-bar-label">
              {t("MyWeek.capacity")} {number(summary.capacity)} {t("Plan.mhHours")}
            </span>
            <span className="myweek-bar" aria-hidden="true">
              <span className="booked" style={{ width: `${summary.capacity ? Math.min(100, (summary.booked / summary.capacity) * 100) : 0}%` }} />
              <span className="away" style={{ width: `${summary.capacity ? Math.min(100, (summary.away / summary.capacity) * 100) : 0}%` }} />
            </span>
          </div>
          <span className="myweek-figure booked">
            {t("MyWeek.booked")} <strong>{number(summary.booked)}</strong>
          </span>
          <span className="myweek-figure away">
            {t("MyWeek.awayShort")} <strong>{number(summary.away)}</strong>
          </span>
          <span className="myweek-figure free">
            {t("MyWeek.free")} <strong>{number(summary.free)}</strong>
          </span>
          <span className="myweek-figure done">
            <Icon name="check" />
            {t("Hours.stateConfirmed")} <strong>{number(summary.confirmed)}</strong> {t("Plan.mhHours")}
          </span>
        </div>
      ) : null}

      <div className="myweek-body">
        <aside className="myweek-backlog" aria-label={t("MyWeek.backlog")} data-guide="myweek.backlog">
          <header>
            <h3>{t("MyWeek.backlog")}</h3>
            <span className="muted">{t("MyWeek.backlogHint")}</span>
          </header>
          {data && !backlog.length ? <p className="muted myweek-empty">{t("MyWeek.backlogEmpty")}</p> : null}
          <ul>
            {backlog.map((item) => (
              <BacklogRow key={item.workKey} item={item} onBook={() => openNew(bookDate, undefined, item.workKey)} />
            ))}
          </ul>
        </aside>

        <div className="myweek-calendar" data-guide="myweek.calendar" aria-busy={loading}>
          <div className="myweek-scroll">
            <div className="myweek-grid" style={{ gridTemplateColumns: dayColumns(dates) }}>
              <span className="myweek-corner" />
              {dates.map((date) => (
                <div key={date} className={`myweek-dayhead${date === today ? " today" : ""}${isWeekend(date) ? " weekend" : ""}`}>
                  <strong>{dayLabel(date)}</strong>
                  <span className="muted">
                    {number(data ? dayBooked(date, data) : 0)} {t("Plan.mhHours")}
                  </span>
                </div>
              ))}

              {hasAllDay ? (
                <>
                  <span className="myweek-alldaylabel">{t("MyWeek.allDay")}</span>
                  {days.map((day) => (
                    <div key={day.date} className="myweek-allday">
                      {day.allDay.map((item) => (
                        <button key={item.key} type="button" className={`myweek-chip ${item.type}`} onClick={() => openItem(item)}>
                          {itemTitle(item, t)}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              ) : null}

              <div className="myweek-times" style={{ gridTemplateRows: `repeat(${rows}, var(--myweek-row))` }}>
                {Array.from({ length: rows / 4 }, (_, index) => (
                  <span key={index} style={{ gridRow: `${index * 4 + 1} / span 4` }}>
                    {timeText(span.start + index * 60)}
                  </span>
                ))}
              </div>
              {days.map((day) => {
                const { lanes, count } = laneOf(day.timed);
                return (
                  <div
                    key={day.date}
                    className={`myweek-day${day.date === today ? " today" : ""}${isWeekend(day.date) ? " weekend" : ""}`}
                    style={{ gridTemplateRows: `repeat(${rows}, var(--myweek-row))`, gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
                  >
                    {LUNCH_START >= span.start && LUNCH_END <= span.end ? (
                      <span className="myweek-lunch" style={{ gridRow: `${rowOf(LUNCH_START)} / ${rowOf(LUNCH_END)}` }}>
                        {t("MyWeek.lunch")}
                      </span>
                    ) : null}
                    {Array.from({ length: rows / 2 }, (_, index) => span.start + index * 30)
                      .filter((minute) => minute < LUNCH_START || minute >= LUNCH_END)
                      .map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          className="myweek-slot"
                          style={{ gridRow: `${rowOf(minute)} / span 2` }}
                          aria-label={`${t("MyWeek.bookHere")} ${dayLabel(day.date)} ${timeText(minute)}`}
                          disabled={!data}
                          onClick={() => openNew(day.date, minute)}
                        />
                      ))}
                    {day.timed.map((item, index) =>
                      rowOf(item.end) > rowOf(item.start) ? (
                        <button
                          key={item.key}
                          type="button"
                          className={`myweek-item ${itemClass(item)}`}
                          style={{ gridRow: `${rowOf(item.start)} / ${rowOf(item.end)}`, gridColumn: `${lanes[index]! + 1}` }}
                          onClick={() => openItem(item)}
                        >
                          <strong>{itemTitle(item, t)}</strong>
                          <span className="myweek-item-time">
                            {timeText(item.start)}–{timeText(item.end)}
                            {item.block && item.block.outlookState !== "Synced" && item.block.outlookState !== "Off" ? (
                              <span title={t(item.block.outlookState === "Denied" ? "MyWeek.outlookDenied" : "MyWeek.outlookPending")}>
                                <Icon name="alertCircle" />
                              </span>
                            ) : null}
                          </span>
                          <small>{itemSub(item, t, backlog)}</small>
                        </button>
                      ) : null,
                    )}
                  </div>
                );
              })}

              <span className="myweek-corner" />
              {dates.map((date) => (
                <DayFoot
                  key={date}
                  data={data}
                  date={date}
                  busy={busy}
                  onConfirm={() => {
                    void confirm(date);
                  }}
                  onOpen={() => setOpenDate(date)}
                />
              ))}
            </div>
          </div>
          <div className="myweek-legend">
            <span className="block">{t("Hours.kindProject")}</span>
            <span className="meeting">{t("Hours.kindOutlook")}</span>
            <span className="task">{t("Hours.kindTeamTask")}</span>
            <span className="leave">{t("Hours.away")}</span>
            <span className="muted">{t("MyWeek.outlookHint")}</span>
          </div>
        </div>
      </div>

      {draft && data ? (
        <BlockEditor
          draft={draft}
          data={data}
          onClose={() => setDraft(null)}
          onSaved={(message) => {
            setDraft(null);
            notify(message);
            reload();
          }}
        />
      ) : null}
      {meeting && data ? (
        <MeetingDialog
          meeting={meeting}
          data={data}
          onClose={() => setMeeting(null)}
          onSaved={() => {
            setMeeting(null);
            notify(t("MyWeek.tiedSaved"));
            reload();
          }}
        />
      ) : null}
      {task ? <TeamTaskDialog task={task} onClose={() => setTask(null)} /> : null}
      {openDate && data && dayOf(data, openDate) ? (
        <WorkDayDialog
          key={openDate}
          day={dayOf(data, openDate)!}
          data={data}
          onClose={() => setOpenDate(null)}
          onSaved={() => {
            setOpenDate(null);
            notify(t("Hours.saved"));
            reload();
          }}
        />
      ) : null}
    </section>
  );
}

function itemClass(item: CalendarItem): string {
  if (item.block) return `block${item.block.workKey ? "" : " other"}`;
  if (item.meeting) return `meeting${item.meeting.linkedWorkKey ? " linked" : ""}`;
  return item.type;
}

function itemTitle(item: CalendarItem, t: (key: string) => string): string {
  if (item.block) return item.block.title;
  if (item.meeting) return item.meeting.private ? t("MyWeek.privateMeeting") : item.meeting.subject || t("Hours.kindOutlook");
  if (item.task) return item.task.title;
  return t("Hours.away");
}

function itemSub(item: CalendarItem, t: (key: string) => string, backlog: readonly BacklogItem[]): string {
  if (item.block) return item.block.projectNo ?? item.block.reference;
  if (item.meeting) {
    const linked = item.meeting.linkedWorkKey ? backlog.find((entry) => entry.workKey === item.meeting!.linkedWorkKey) : undefined;
    return linked ? (linked.projectNo ?? linked.reference) : item.meeting.linkedWorkKey ? t("Hours.kindOutlook") : t("MyWeek.untied");
  }
  return item.task ? t("MyWeek.teamTask") : "";
}

function BacklogRow({ item, onBook }: { item: BacklogItem; onBook: () => void }) {
  const t = useT();
  const left = hoursLeft(item);
  const used = item.budgetHours ? Math.min(100, (item.confirmedHours / item.budgetHours) * 100) : 0;
  return (
    <li className="myweek-work">
      <span className="myweek-work-ref">
        <strong>{item.projectNo ?? item.reference}</strong>
        {item.end ? (
          <span className="muted">
            {t("MyWeek.dueLabel")} {shortDate(item.end)}
          </span>
        ) : null}
      </span>
      <span className="myweek-work-title">{item.title}</span>
      {item.customer ? <span className="muted myweek-work-customer">{item.customer}</span> : null}
      <span className="myweek-work-bar" aria-hidden="true">
        <span style={{ width: `${used}%` }} />
      </span>
      <span className="myweek-work-hours">
        <span>{left === null ? t("MyWeek.noBudget") : `${t("MyWeek.hoursLeft")} ${number(left)} / ${number(item.budgetHours!)} ${t("Plan.mhHours")}`}</span>
        <span className={item.bookedHours ? "" : "muted"}>{item.bookedHours ? `${t("MyWeek.bookedThisWeek")} ${number(item.bookedHours)}` : t("MyWeek.notBooked")}</span>
      </span>
      <button className="btn default sm" type="button" data-guide="myweek.bookWork" onClick={onBook}>
        <Icon name="plus" />
        {t("MyWeek.book")}
      </button>
    </li>
  );
}

/** A day's footing: its hours confirmed, or the press that confirms them. The guides use the first day that has each button. */
function DayFoot({ data, date, busy, onConfirm, onOpen }: { data: WeekData | null; date: string; busy: boolean; onConfirm: () => void; onOpen: () => void }) {
  const t = useT();
  const day = data ? dayOf(data, date) : undefined;
  if (!day || !data) return <div className="myweek-foot" />;
  const state = dayState(day, data.hoursPerDay);
  return (
    <div className={`myweek-foot ${state}`}>
      {state === "confirmed" && day.confirmed ? (
        <span className="myweek-done">
          <Icon name="check" />
          {number(day.confirmed.hours)} {t("Plan.mhHours")}
        </span>
      ) : null}
      {state === "toConfirm" ? (
        <button className="btn primary sm" type="button" data-guide="myweek.confirm" disabled={busy} onClick={onConfirm}>
          <Icon name="check" />
          {t("MyWeek.confirmDay")} {number(day.draftHours)} {t("Plan.mhHours")}
        </button>
      ) : null}
      {state === "empty" ? (
        <button className="btn default sm myweek-edit-hours" type="button" data-guide="myweek.editHours" onClick={onOpen}>
          {t("MyWeek.fillDay")}
        </button>
      ) : null}
      {state === "future" ? (
        <span className="muted">
          {t("Hours.stateFuture")} {number(day.draftHours)} {t("Plan.mhHours")}
        </span>
      ) : null}
      {state === "closed" ? <span className="muted">{t("Hours.stateClosed")}</span> : null}
      {state === "confirmed" || state === "toConfirm" ? (
        <button className="btn ghost sm myweek-edit-hours" type="button" data-guide="myweek.editHours" onClick={onOpen}>
          {t("MyWeek.editHours")}
        </button>
      ) : null}
    </div>
  );
}

function BlockEditor({ draft: initial, data, onClose, onSaved }: { draft: Draft; data: WeekData; onClose: () => void; onSaved: (message: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = minutesOf(draft.start),
    end = minutesOf(draft.end);
  const badSpan = end <= start || end - start > 12 * 60;
  const overlap = !badSpan && overlapsBlocks(data.blocks, draft.date, start, end, draft.id ?? undefined);
  const other = draft.workKey === "";
  const canSave = !busy && !badSpan && !overlap && Boolean(draft.date) && (!other || draft.note.trim().length > 0);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const editing = draft.id !== null;
  const block = editing ? data.blocks.find((entry) => entry.id === draft.id) : undefined;
  // The work of a block booked before stays a choice even when it has left the person's open work.
  const keepWork = block?.workKey && !data.backlog.some((item) => item.workKey === block.workKey) ? block : null;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const reply = await apiRequest<{ outlookState: string }>(editing ? `/api/v1/me/work-blocks/${draft.id}` : "/api/v1/me/work-blocks", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(blockBody(draft)),
      });
      onSaved(reply?.outlookState === "Denied" ? `${t("MyWeek.saved")} · ${t("MyWeek.outlookDenied")}` : t("MyWeek.saved"));
    } catch (failure) {
      setError(failure instanceof ApiClientError && failure.code === "work_block_overlap" ? "MyWeek.overlap" : failure instanceof Error ? failure.message : "MyWeek.saveFailed");
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/me/work-blocks/${draft.id}`, { method: "DELETE" });
      onSaved(t("MyWeek.removed"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "MyWeek.saveFailed");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t(editing ? "MyWeek.editorEdit" : "MyWeek.book")}
      subtitle={t("MyWeek.outlookHint")}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <button className="btn danger" type="button" disabled={busy} onClick={() => void remove()}>
              <Icon name="trash" />
              {t("MyWeek.removeBlock")}
            </button>
          ) : null}
          <span className="myweek-editor-length">
            {t("MyWeek.length")} <strong>{badSpan ? "–" : number((end - start) / 60)}</strong> {t("Plan.mhHours")}
          </span>
          <button className="btn ghost" type="button" disabled={busy} onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" type="button" data-guide="myweek.save" disabled={!canSave} onClick={() => void save()}>
            <Icon name="check" />
            {t(busy ? "Saving…" : "Save")}
          </button>
        </>
      }
    >
      {error ? (
        <div className="info-strip red" role="alert">
          {t(error)}
        </div>
      ) : null}
      <div className="myweek-editor">
        <label className="field span-2" data-guide="myweek.work">
          <span>{t("Hours.work")}</span>
          <select
            value={other ? `other:${draft.projectId}` : draft.workKey}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("other:")) set({ workKey: "", projectId: value.slice("other:".length) });
              else set({ workKey: value, note: "", projectId: "" });
            }}
          >
            {!draft.workKey && !other ? <option value="">{t("MyWeek.pickWork")}</option> : null}
            {data.backlog.length ? (
              <optgroup label={t("MyWeek.backlog")}>
                {data.backlog.map((item) => (
                  <option key={item.workKey} value={item.workKey}>
                    {[item.projectNo, item.projectNo && item.reference.startsWith(item.projectNo) ? item.reference.slice(item.projectNo.length + 3) : item.reference, item.title]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {keepWork ? <option value={keepWork.workKey!}>{[keepWork.projectNo, keepWork.title].filter(Boolean).join(" · ")}</option> : null}
            {data.projects.length ? (
              <optgroup label={t("Hours.kindProjectOther")}>
                {data.projects.map((project) => (
                  <option key={project.id} value={`other:${project.id}`}>
                    {project.projectNo} · {project.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <option value="other:">{t("Hours.kindOther")}</option>
          </select>
        </label>
        {other ? (
          <label className="field span-2">
            <span>{t("MyWeek.notePlaceholder")}</span>
            <input type="text" maxLength={200} value={draft.note} placeholder={t("MyWeek.notePlaceholder")} onChange={(event) => set({ note: event.target.value })} />
          </label>
        ) : null}
        <label className="field">
          <span>{t("Date")}</span>
          <input type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} />
        </label>
        <span className="myweek-editor-times" data-guide="myweek.time">
          <label className="field">
            <span>{t("MyWeek.from")}</span>
            <select value={draft.start} onChange={(event) => set({ start: event.target.value })}>
              {START_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("MyWeek.until")}</span>
            <select value={draft.end} onChange={(event) => set({ end: event.target.value })}>
              {END_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
        </span>
      </div>
      {badSpan ? <div className="info-strip amber">{t("MyWeek.badSpan")}</div> : null}
      {overlap ? <div className="info-strip amber">{t("MyWeek.overlap")}</div> : null}
      {block && block.outlookState !== "Synced" ? (
        <div className="info-strip">
          <Icon name="alertCircle" />
          {t(block.outlookState === "Denied" ? "MyWeek.outlookDenied" : block.outlookState === "Off" ? "MyWeek.outlookOff" : "MyWeek.outlookPending")}
        </div>
      ) : null}
    </Modal>
  );
}

function MeetingDialog({ meeting, data, onClose, onSaved }: { meeting: WeekMeeting; data: WeekData; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [workKey, setWorkKey] = useState(meeting.linkedWorkKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const when = meeting.allDay
    ? `${dayLabel(meeting.start.slice(0, 10))} · ${t("MyWeek.allDay")}`
    : `${dayLabel(meeting.start.slice(0, 10))} ${meeting.start.slice(11, 16)}–${meeting.end.slice(11, 16)}`;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/v1/me/outlook-links", { method: "PUT", body: JSON.stringify({ outlookId: meeting.id, workKey: workKey || null }) });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "MyWeek.saveFailed");
      setBusy(false);
    }
  };
  return (
    <Modal
      title={meeting.private ? t("MyWeek.privateMeeting") : meeting.subject || t("Hours.kindOutlook")}
      subtitle={t("Hours.kindOutlook")}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="myweek-spacer" />
          <button className="btn ghost" type="button" disabled={busy} onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn primary" type="button" data-guide="myweek.tieSave" disabled={busy || workKey === (meeting.linkedWorkKey ?? "")} onClick={() => void save()}>
            <Icon name="check" />
            {t(busy ? "Saving…" : "Save")}
          </button>
        </>
      }
    >
      {error ? (
        <div className="info-strip red" role="alert">
          {t(error)}
        </div>
      ) : null}
      <dl className="myweek-facts">
        <dt>{t("MyWeek.when")}</dt>
        <dd>{when}</dd>
        {meeting.location ? (
          <>
            <dt>{t("MyWeek.where")}</dt>
            <dd>{meeting.location}</dd>
          </>
        ) : null}
      </dl>
      <label className="field" data-guide="myweek.tie">
        <span>{t("MyWeek.tieTo")}</span>
        <select value={workKey} onChange={(event) => setWorkKey(event.target.value)}>
          <option value="">{t("MyWeek.notTied")}</option>
          {data.backlog.map((item) => (
            <option key={item.workKey} value={item.workKey}>
              {[item.projectNo ?? item.reference, item.title].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{t("MyWeek.tieHint")}</p>
    </Modal>
  );
}

function TeamTaskDialog({ task, onClose }: { task: WeekTeamTask | "leave"; onClose: () => void }) {
  const t = useT();
  const title = task === "leave" ? t("Hours.away") : task.title;
  const when =
    task === "leave"
      ? ""
      : `${dayLabel(task.start)}${task.end !== task.start ? ` – ${dayLabel(task.end)}` : ""}${task.slot === "Time" && task.startTime && task.endTime ? ` ${task.startTime}–${task.endTime}` : ""}`;
  return (
    <Modal
      title={title}
      subtitle={t("MyWeek.teamTask")}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="myweek-spacer" />
          <button className="btn ghost" type="button" onClick={onClose}>
            {t("Close")}
          </button>
          <a className="btn primary" href="#/resources" onClick={onClose}>
            {t("MyWeek.openTeam")}
          </a>
        </>
      }
    >
      {when ? (
        <dl className="myweek-facts">
          <dt>{t("MyWeek.when")}</dt>
          <dd>{task !== "leave" && task.projectNo ? `${when} · ${task.projectNo}` : when}</dd>
        </dl>
      ) : null}
      <p className="muted">{t("MyWeek.teamTaskHint")}</p>
    </Modal>
  );
}
