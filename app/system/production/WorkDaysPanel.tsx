"use client";
/* My Work > My hours (owner, 2026-11-21: next step of the man-hour work). The week as a strip of days; the app drafts
   each day from the person's planned work and they confirm it with one press, or open a day to change it. Rules and
   storage: backend-node/src/work-days.ts, migration 121. Helpers: lib/work-days.ts. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon, Modal } from "../ui";
import {
  addDays,
  bangkokToday,
  choicesForDay,
  dayBody,
  dayState,
  lineForNote,
  lineFromChoice,
  lineProblems,
  linesFromRows,
  mondayOf,
  parseHours,
  pendingDates,
  sameAsDraft,
  shortReference,
  type DayLine,
  type DayState,
  type WorkChoice,
  type WorkDay,
  type WorkDaysData,
  type WorkRowKind,
} from "../../../lib/work-days";
import "./work-days.css";

const number = (value: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(value);
const dayName = (date: string, long = false) =>
  new Intl.DateTimeFormat(currentLocale(), long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`)).replace(/\s+/g, " ");
const shortDate = (date: string) => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));

const STATE_LABEL: Record<DayState, string> = {
  confirmed: "Hours.stateConfirmed",
  toConfirm: "Hours.stateToConfirm",
  empty: "Hours.stateEmpty",
  off: "Hours.stateOff",
  future: "Hours.stateFuture",
  closed: "Hours.stateClosed",
};
const KIND_LABEL: Record<WorkRowKind, string> = {
  Project: "Hours.kindProject",
  TeamTask: "Hours.kindTeamTask",
  Issue: "Hours.kindIssue",
  Inquiry: "Hours.kindInquiry",
  Estimate: "Hours.kindEstimate",
  Outlook: "Hours.kindOutlook",
  ProjectOther: "Hours.kindProjectOther",
  Other: "Hours.kindOther",
};

export function WorkDaysPanel({ notify }: { notify: (message: string) => void }) {
  const t = useT();
  const [monday, setMonday] = useState(() => mondayOf(bangkokToday()));
  const [busy, setBusy] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  // One read per week shown and per reload; loading is "the last answer is not for this read".
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; data: WorkDaysData | null; error: string } | null>(null);
  const readKey = `${monday}#${version}`;
  useEffect(() => {
    let live = true;
    apiRequest<WorkDaysData>(`/api/v1/me/work-days?from=${monday}&to=${addDays(monday, 6)}`)
      .then((value) => {
        if (live) setResult({ key: readKey, data: value, error: "" });
      })
      .catch((failure: unknown) => {
        if (live) setResult((current) => ({ key: readKey, data: current?.data ?? null, error: failure instanceof Error ? failure.message : "Hours.loadFailed" }));
      });
    return () => {
      live = false;
    };
  }, [monday, readKey]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const loading = result?.key !== readKey;
  const data = result?.data ?? null;
  const error = result?.key === readKey ? result.error : "";

  const today = data?.today ?? bangkokToday();
  const hoursPerDay = data?.hoursPerDay ?? 8;
  const days = useMemo(() => (data?.days ?? []).filter((day) => day.date >= monday && day.date <= addDays(monday, 6)), [data, monday]);
  const todayDay = days.find((day) => day.date === today);
  const todayReady = todayDay ? dayState(todayDay, hoursPerDay) === "toConfirm" : false;
  const pending = pendingDates(days, today, hoursPerDay);
  const earliestMonday = data ? mondayOf(data.editableFrom) : addDays(monday, -35);
  const openDay = openDate ? (days.find((day) => day.date === openDate) ?? null) : null;

  const confirm = async (dates: string[]) => {
    setBusy(true);
    try {
      const result = await apiRequest<{ confirmed: string[]; skipped: { date: string; reason: string }[] }>("/api/v1/me/work-days/confirm", { method: "POST", body: JSON.stringify({ dates }) });
      const empty = result.skipped.filter((item) => item.reason === "empty").length;
      const dayCount = (count: number) => `${number(count)} ${t("Hours.daysUnit")}`;
      notify(`${t("Hours.confirmedDays")} ${dayCount(result.confirmed.length)}${empty ? ` · ${t("Hours.skippedEmpty")} ${dayCount(empty)}` : ""}`);
      reload();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("Hours.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="work-days" data-guide="hours.week" aria-label={t("Hours.title")}>
      <div className="work-days-head">
        <span className="work-days-title">
          <Icon name="clock" />
          {t("Hours.title")}
        </span>
        <span className="work-days-nav">
          <button
            className="icon-btn"
            type="button"
            aria-label={t("Hours.prevWeek")}
            title={t("Hours.prevWeek")}
            disabled={loading || monday <= earliestMonday}
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <Icon name="chevronLeft" />
          </button>
          <span>
            {shortDate(monday)} – {shortDate(addDays(monday, 6))}
          </span>
          <button
            className="icon-btn"
            type="button"
            aria-label={t("Hours.nextWeek")}
            title={t("Hours.nextWeek")}
            disabled={loading || monday >= mondayOf(today)}
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <Icon name="chevronRight" />
          </button>
        </span>
        <span className="work-days-hint">{t("Hours.hint")}</span>
        <span className="work-days-actions">
          {pending.length ? (
            <button
              className="btn default sm"
              type="button"
              data-guide="hours.confirmPending"
              disabled={busy || loading}
              onClick={() => {
                void confirm(pending);
              }}
            >
              <Icon name="check" />
              {t("Hours.confirmPending")} {number(pending.length)} {t("Hours.daysUnit")}
            </button>
          ) : null}
          {todayReady && todayDay ? (
            <button
              className="btn primary sm"
              type="button"
              data-guide="hours.confirmToday"
              disabled={busy || loading}
              onClick={() => {
                void confirm([today]);
              }}
            >
              <Icon name="check" />
              {t("Hours.confirmToday")} · {number(todayDay.draftHours)} {t("Plan.mhHours")}
            </button>
          ) : null}
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
      <div className="work-days-strip" data-guide="hours.days">
        {(days.length ? days : Array.from({ length: 7 }, () => null)).map((day, index) => {
          if (!day) return <span key={index} className="work-day loading" aria-hidden="true" />;
          const state = dayState(day, hoursPerDay);
          const hours = day.confirmed ? day.confirmed.hours : day.draftHours;
          return (
            <button key={day.date} type="button" className={`work-day ${state}${day.date === today ? " today" : ""}`} title={t(STATE_LABEL[state])} onClick={() => setOpenDate(day.date)}>
              <span className="work-day-name">{dayName(day.date)}</span>
              <strong>
                {(state === "off" || state === "future" || state === "closed") && !hours ? (
                  "–"
                ) : (
                  <>
                    {number(hours)} <small>{t("Plan.mhHours")}</small>
                  </>
                )}
              </strong>
              <span className="work-day-state">
                {state === "confirmed" ? <Icon name="check" /> : null}
                {t(STATE_LABEL[state])}
              </span>
            </button>
          );
        })}
      </div>
      {openDay && data ? (
        <WorkDayDialog
          key={openDay.date}
          day={openDay}
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

export function WorkDayDialog({ day, data, onClose, onSaved }: { day: WorkDay; data: WorkDaysData; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [lines, setLines] = useState<DayLine[]>(() => linesFromRows(day.rows));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = day.editable;
  const problems = lineProblems(lines);
  const options = choicesForDay(data.choices, day, lines);
  const canSave = editable && !busy && problems.line.size === 0 && !problems.tooMany;
  const state = dayState(day, data.hoursPerDay);

  const update = (key: string, patch: Partial<DayLine>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const add = (value: string) => {
    if (!value) return;
    if (value === "other") {
      setLines((current) => [...current, lineForNote(null)]);
      return;
    }
    if (value.startsWith("project:")) {
      const project = data.projects.find((item) => item.id === Number(value.slice("project:".length)));
      if (project) setLines((current) => [...current, lineForNote(project)]);
      return;
    }
    const choice = data.choices.find((item) => item.workKey === value);
    if (choice) setLines((current) => [...current, lineFromChoice(choice)]);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/me/work-days/${day.date}`, { method: "PUT", body: JSON.stringify(dayBody(lines)) });
      onSaved();
    } catch (failure) {
      setError(failure instanceof ApiClientError && failure.code === "work_day_unknown_work" ? "Hours.unknownWork" : failure instanceof Error ? failure.message : "Hours.saveFailed");
      setBusy(false);
    }
  };
  const groups: { label: string; items: WorkChoice[] }[] = (["Project", "TeamTask", "Issue", "Inquiry", "Estimate", "Outlook"] as const)
    .map((kind) => ({ label: KIND_LABEL[kind], items: options.filter((choice) => choice.kind === kind) }))
    .filter((group) => group.items.length);

  return (
    <Modal
      title={dayName(day.date, true)}
      subtitle={
        day.confirmed
          ? `${t("Hours.stateConfirmed")} · ${new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(day.confirmed.at))}`
          : t(STATE_LABEL[state])
      }
      size="lg"
      onClose={onClose}
      footer={
        <>
          {editable && !sameAsDraft(lines, day.draft) ? (
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setLines(linesFromRows(day.draft))}>
              <Icon name="refresh" />
              {t("Hours.backToPlan")}
            </button>
          ) : null}
          <span className="work-days-total">
            {t("Hours.total")} <strong>{number(problems.total)}</strong> {t("Plan.mhHours")}
          </span>
          <button className="btn ghost" type="button" disabled={busy} onClick={onClose}>
            {t("Cancel")}
          </button>
          {editable ? (
            <button
              className="btn primary"
              type="button"
              data-guide="hours.save"
              disabled={!canSave}
              onClick={() => {
                void save();
              }}
            >
              <Icon name="check" />
              {t(busy ? "Saving…" : "Hours.confirmDay")}
            </button>
          ) : null}
        </>
      }
    >
      {error ? (
        <div className="info-strip red" role="alert">
          {t(error)}
        </div>
      ) : null}
      {!editable ? <div className="info-strip">{t(day.future ? "Hours.futureNote" : "Hours.closedNote")}</div> : null}
      {day.awayHours > 0 ? (
        <div className="info-strip amber">
          <Icon name="calendar" />
          {t("Hours.away")} {number(day.awayHours)} {t("Plan.mhHours")}
        </div>
      ) : null}
      {!day.confirmed && editable ? <p className="muted work-days-note">{t(lines.length ? "Hours.draftNote" : "Hours.emptyNote")}</p> : null}
      {lines.length ? (
        <table className="work-day-lines">
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            {editable ? <col style={{ width: 44 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th>{t("Hours.work")}</th>
              <th className="num">{t("Plan.mhHours")}</th>
              {editable ? <th aria-label={t("Hours.remove")} /> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const problem = problems.line.get(line.key);
              return (
                <tr key={line.key}>
                  <td className="wrap">
                    <span className={`work-day-kind ${line.kind}`}>
                      {t(KIND_LABEL[line.kind])}
                      {line.projectNo ? ` · ${line.projectNo}` : ""}
                    </span>
                    {line.workKey === null && editable ? (
                      <input
                        className={problem === "note" ? "invalid" : undefined}
                        type="text"
                        maxLength={200}
                        value={line.title}
                        placeholder={t("Hours.notePlaceholder")}
                        aria-label={t("Hours.notePlaceholder")}
                        onChange={(event) => update(line.key, { title: event.target.value })}
                      />
                    ) : (
                      <span className="work-day-title">
                        {line.title}
                        {shortReference(line.reference, line.projectNo) ? <small> · {shortReference(line.reference, line.projectNo)}</small> : null}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {editable ? (
                      <input
                        className={problem === "hours" ? "invalid" : undefined}
                        type="number"
                        inputMode="decimal"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={line.hours}
                        aria-label={t("Plan.mhHours")}
                        onChange={(event) => update(line.key, { hours: event.target.value })}
                      />
                    ) : (
                      number(parseHours(line.hours) ?? 0)
                    )}
                    {line.plannedHours !== null && editable && parseHours(line.hours) !== line.plannedHours ? (
                      <small className="work-day-planned">
                        {t("Hours.planned")} {number(line.plannedHours)}
                      </small>
                    ) : null}
                  </td>
                  {editable ? (
                    <td>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label={t("Hours.remove")}
                        title={t("Hours.remove")}
                        onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      >
                        <Icon name="x" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {editable ? (
        <label className="field work-days-add" data-guide="hours.add">
          <span>{t("Hours.add")}</span>
          <select value="" onChange={(event) => add(event.target.value)}>
            <option value="">{t("Hours.addPick")}</option>
            {groups.map((group) => (
              <optgroup key={group.label} label={t(group.label)}>
                {group.items.map((choice) => (
                  <option key={choice.workKey} value={choice.workKey}>
                    {[choice.projectNo, shortReference(choice.reference, choice.projectNo), choice.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </optgroup>
            ))}
            {data.projects.length ? (
              <optgroup label={t("Hours.kindProjectOther")}>
                {data.projects.map((project) => (
                  <option key={project.id} value={`project:${project.id}`}>
                    {project.projectNo} · {project.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <option value="other">{t("Hours.kindOther")}</option>
          </select>
        </label>
      ) : null}
      {problems.tooMany ? (
        <div className="info-strip red" role="alert">
          {t("Hours.tooMany")}
        </div>
      ) : null}
    </Modal>
  );
}
