"use client";
/* Team overview > Team week (owner decision 2026-11-23, part 2 of the My week design): everyone's Monday to Friday in
   hours, from what they booked on My week, their Outlook meetings, team tasks and time away, with the hours they have
   confirmed. The allocation queue sits beside it, so the head sees who is free and names people in one place.
   Counting: backend-node/src/team-week.ts; helpers: lib/team-week.ts. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { FilterChips, Icon, SearchInput, type FilterItem } from "../ui";
import { addDays, bangkokToday, mondayOf } from "../../../lib/work-days";
import { CHIP_LABEL, available, byLoad, rowFlags, type TeamWeekData, type TeamWeekFocus, type TeamWeekRow } from "../../../lib/team-week";
import "../segment-filters.css";
import "./team-week.css";

const number = (value: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1 }).format(value);
const dayLabel = (date: string) => new Intl.DateTimeFormat(currentLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
/** Saturday or Sunday: a narrower, shaded column. */
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
const shortDate = (date: string) => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const ALL = "all";
const SHOWN_CHIPS = 3;

export function TeamWeek({ bootstrap, queue, revision = 0 }: { bootstrap: BootstrapData; queue?: ReactNode; revision?: number }) {
  const t = useT();
  const [monday, setMonday] = useState(() => mondayOf(bangkokToday()));
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; data: TeamWeekData | null; error: string } | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [focus, setFocus] = useState<TeamWeekFocus | null>(null);
  // A team task added beside the title reads the week again.
  const readKey = `${monday}#${version}#${revision}`;
  useEffect(() => {
    let live = true;
    apiRequest<TeamWeekData>(`/api/v1/team-week?from=${monday}&to=${addDays(monday, 6)}`)
      .then((value) => {
        if (live) setResult({ key: readKey, data: value, error: "" });
      })
      .catch((failure: unknown) => {
        if (live) setResult((current) => ({ key: readKey, data: current?.data ?? null, error: failure instanceof Error ? failure.message : "TeamWeek.loadFailed" }));
      });
    return () => {
      live = false;
    };
  }, [monday, readKey]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const loading = result?.key !== readKey;
  const data = result?.data && result.data.from === monday ? result.data : null;
  const error = result?.key === readKey ? result.error : "";
  const today = data?.today ?? bangkokToday();
  const hoursPerDay = data?.hoursPerDay ?? 8;
  // Monday to Sunday (owner 2026-11-23): site work falls on weekends too.
  const dates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const departments = useMemo(() => [...new Set(bootstrap.team.map((user) => user.department).filter(Boolean))].sort(), [bootstrap.team]);

  const people = useMemo(() => {
    if (!data) return [];
    const rows = new Map(data.rows.map((row) => [row.userId, row]));
    return bootstrap.team.flatMap((user) => {
      const row = rows.get(user.id);
      return row ? [{ user, name: user.name, row, flags: rowFlags(row, hoursPerDay) }] : [];
    });
  }, [bootstrap.team, data, hoursPerDay]);
  const query = search.trim().toLocaleLowerCase();
  const inScope = people.filter((person) => (department === ALL || person.user.department === department) && (!query || person.name.toLocaleLowerCase().includes(query)));
  const shown = inScope.filter((person) => !focus || person.flags[focus]).sort(byLoad);
  const chips: FilterItem[] = [
    { key: "over", label: "TeamWeek.chipOver", value: inScope.filter((person) => person.flags.over).length, tone: "red" },
    { key: "free", label: "TeamWeek.chipFree", value: inScope.filter((person) => person.flags.free).length, tone: "slate" },
    { key: "pending", label: "TeamWeek.chipPending", value: inScope.filter((person) => person.flags.pending).length, tone: "amber" },
    { key: "leave", label: "TeamWeek.chipLeave", value: inScope.filter((person) => person.flags.leave).length, tone: "violet" },
  ];
  const thisWeek = today >= monday && today <= addDays(monday, 6);

  return (
    <div className="teamweek">
      <div className="teamweek-toolbar">
        <span className="teamweek-nav">
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
        <SearchInput value={search} onChange={setSearch} placeholder={t("TeamWeek.search")} />
        <label className="select-field teamweek-department">
          <span className="sr-only">{t("Department")}</span>
          <select value={department} aria-label={t("Department")} onChange={(event) => setDepartment(event.target.value)}>
            <option value={ALL}>{t("TeamWeek.allDepartments")}</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" />
        </label>
        <button className="btn default sm" type="button" disabled={loading} onClick={reload}>
          <Icon name="refresh" />
          {t("Refresh")}
        </button>
      </div>
      <div data-guide="teamweek.chips">
        <FilterChips label="TeamWeek.chips" items={chips} active={focus} onPick={(key) => setFocus(key as TeamWeekFocus | null)} />
      </div>
      {error ? (
        <div className="info-strip red" role="alert">
          {t(error)}{" "}
          <button className="btn ghost sm" type="button" onClick={reload}>
            {t("Retry")}
          </button>
        </div>
      ) : null}
      <div className="teamweek-body">
        <section className="teamweek-table-wrap" aria-label={t("TeamWeek.tab")} aria-busy={loading} data-guide="teamweek.table">
          <table className="teamweek-table">
            <thead>
              <tr>
                <th scope="col">{t("TeamWeek.person")}</th>
                {dates.map((date) => (
                  <th key={date} scope="col" className={[date === today ? "today" : "", isWeekend(date) ? "weekend" : ""].filter(Boolean).join(" ") || undefined}>
                    {dayLabel(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => (
                <PersonRow key={person.user.id} name={person.name} department={person.user.department} row={person.row} today={today} hoursPerDay={hoursPerDay} />
              ))}
            </tbody>
          </table>
          {data && !shown.length ? <p className="muted teamweek-empty">{t("TeamWeek.empty")}</p> : null}
        </section>
        {queue ? <aside className="teamweek-queue">{queue}</aside> : null}
      </div>
    </div>
  );
}

function PersonRow({ name, department, row, today, hoursPerDay }: { name: string; department: string; row: TeamWeekRow; today: string; hoursPerDay: number }) {
  const t = useT();
  const room = available(row);
  const over = row.total - room;
  return (
    <tr>
      <th scope="row">
        <span className="teamweek-name">{name}</span>
        <span className="muted teamweek-dept">{department}</span>
        <span className="teamweek-bar" aria-hidden="true">
          <span className={over > 0 ? "over" : room - row.total >= hoursPerDay ? "light" : ""} style={{ width: `${room ? Math.min(100, (row.total / room) * 100) : 0}%` }} />
        </span>
        <span className={over > 0 ? "teamweek-sum over" : "teamweek-sum"}>
          {number(row.total)} / {number(room)} {t("Plan.mhHours")}
          {over > 0 ? ` · ${t("TeamWeek.over")} ${number(over)}` : room - row.total > 0 ? ` · ${t("TeamWeek.free")} ${number(room - row.total)}` : ""}
        </span>
      </th>
      {row.days.map((day) => {
        const past = day.working && day.date <= today;
        const pending = past && day.confirmed === null && day.away < hoursPerDay;
        const extra = day.chips.length - SHOWN_CHIPS;
        return (
          <td key={day.date} className={`${day.date === today ? "today" : ""}${day.working ? "" : " off"}`}>
            <span className="teamweek-day-head">
              <strong className={day.total + day.away > hoursPerDay ? "over" : day.total === 0 ? "muted" : undefined}>
                {number(day.total)} {t("Plan.mhHours")}
              </strong>
              {day.confirmed !== null ? (
                <span className="teamweek-ok" title={t("TeamWeek.confirmed")}>
                  <Icon name="check" />
                </span>
              ) : null}
              {pending ? <span className="teamweek-pending">{t("TeamWeek.unconfirmed")}</span> : null}
            </span>
            {day.chips.slice(0, SHOWN_CHIPS).map((chip) => (
              <span key={`${chip.kind}-${chip.label}`} className={`teamweek-chip ${chip.kind}`}>
                <span>{CHIP_LABEL[chip.label] ? t(CHIP_LABEL[chip.label]!) : chip.label}</span>
                <span>{number(chip.hours)}</span>
              </span>
            ))}
            {extra > 0 ? (
              <span className="muted teamweek-more">
                +{extra} {t("TeamWeek.more")}
              </span>
            ) : null}
            {day.working && day.free > 0 ? (
              <span className="teamweek-chip free">
                <span>{t("TeamWeek.free")}</span>
                <span>{number(day.free)}</span>
              </span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}
