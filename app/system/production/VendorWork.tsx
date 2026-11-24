/*
 * My Work > Outsourced work (task doc 3.6, owner 2026-11-23): the member who looks after an outsourced plan row, or the
 * project's manager or lead engineer, records how many of the supplier's people worked on it each day. Hours are
 * people x 8 unless typed; they show as the row's Actual h on the Plan Sheet. Hours only, never money.
 * API: backend-node/src/routes/vendor-hours.ts.
 */
import { useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon } from "../ui";
import "./vendor-work.css";

type VendorDay = { date: string; people: number; hours: number; note: string | null };
type VendorRow = {
  taskId: number;
  name: string;
  supplier: string;
  projectId: number;
  projectNo: string;
  projectName: string;
  planStart: string | null;
  planDays: number;
  planHours: number;
  hoursToDate: number;
  percentComplete: number;
  status: string;
  days: VendorDay[];
};
type VendorWeek = { today: string; from: string; to: string; editableFrom: string; hoursPerPerson: number; rows: VendorRow[] };

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const hours = (value: number) => String(Math.round(value * 10) / 10);

export function VendorWork({ notify }: { notify: (message: string) => void }) {
  const t = useT();
  const [from, setFrom] = useState<string | null>(null);
  const [week, setWeek] = useState<VendorWeek | null>(null);
  const [error, setError] = useState("");
  // Bumped after a save, so the week is read again.
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let current = true;
    apiRequest<VendorWeek>(`/api/v1/me/vendor-work${from ? `?from=${from}` : ""}`)
      .then((next) => {
        if (!current) return;
        setWeek(next);
        setError("");
      })
      .catch((failure: unknown) => {
        if (current) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      current = false;
    };
  }, [from, reads]);

  const save = async (row: VendorRow, date: string, box: HTMLInputElement) => {
    if (!week) return;
    const text = box.value;
    const people = text.trim() === "" ? 0 : Number(text.replace(",", "."));
    const before = row.days.find((day) => day.date === date)?.people ?? 0;
    // What was not saved goes back to what is stored, so the box never shows a number nobody has.
    const restore = () => (box.value = before ? String(before) : "");
    if (people === before) return;
    if (!Number.isFinite(people) || people < 0 || people > 200 || (people > 0 && people < 0.1)) {
      restore();
      return notify(t("Vendor.bad"));
    }
    try {
      await apiRequest(`/api/v1/me/vendor-work/${row.taskId}/${date}`, { method: "PUT", body: JSON.stringify({ people: Math.round(people * 10) / 10 }) });
      notify(`${row.projectNo} · ${row.name} · ${t("Vendor.saved")}`);
      setReads((count) => count + 1);
    } catch (failure) {
      restore();
      notify(failure instanceof ApiClientError ? failure.message : t("Vendor.bad"));
    }
  };

  if (error)
    return (
      <div className="vendor-work error" role="alert">
        {error}
      </div>
    );
  if (!week) return <div className="vendor-work loading" aria-busy="true" />;
  const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(currentLocale(), { weekday: "short", timeZone: "UTC" });
  const dates = Array.from({ length: 7 }, (_, index) => shift(week.from, index));
  return (
    <section className="vendor-work" data-guide="work.vendor" aria-label={t("Vendor.tab")}>
      <p className="vendor-intro">{t("Vendor.intro")}</p>
      <div className="vendor-nav">
        <button type="button" className="btn ghost sm" onClick={() => setFrom(shift(week.from, -7))} aria-label={t("Vendor.prev")}>
          <Icon name="chevronLeft" />
        </button>
        <span className="vendor-range">
          {week.from} – {week.to}
        </span>
        <button type="button" className="btn ghost sm" onClick={() => setFrom(shift(week.from, 7))} aria-label={t("Vendor.next")}>
          <Icon name="chevronRight" />
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setFrom(null)}>
          {t("Vendor.thisWeek")}
        </button>
      </div>
      {week.rows.length ? (
        <div className="vendor-scroll">
          <table className="vendor-grid">
            <thead>
              <tr>
                <th scope="col">{t("Vendor.colWork")}</th>
                <th scope="col">{t("Vendor.colSupplier")}</th>
                {dates.map((date) => (
                  <th key={date} scope="col" className={`day${date === week.today ? " today" : ""}`}>
                    <small>{weekday(date)}</small> {Number(date.slice(8))}/{Number(date.slice(5, 7))}
                  </th>
                ))}
                <th scope="col" className="num">
                  {t("Vendor.colWeek")}
                </th>
                <th scope="col" className="num">
                  {t("Vendor.colHours")}
                </th>
              </tr>
            </thead>
            <tbody>
              {week.rows.map((row) => {
                const weekHours = row.days.reduce((sum, day) => sum + day.hours, 0);
                return (
                  <tr key={row.taskId}>
                    <th scope="row">
                      <span className="vendor-project">{row.projectNo}</span> {row.name}
                    </th>
                    <td className="vendor-supplier">{row.supplier}</td>
                    {dates.map((date) => {
                      const day = row.days.find((item) => item.date === date);
                      const open = date <= week.today && date >= week.editableFrom;
                      return (
                        <td key={date} className={`day${date === week.today ? " today" : ""}`}>
                          <input
                            key={`${row.taskId}-${date}-${day?.people ?? 0}`}
                            className="vendor-people"
                            inputMode="decimal"
                            defaultValue={day ? String(day.people) : ""}
                            disabled={!open}
                            title={day ? t("Vendor.hoursTitle").replace("{people}", String(day.people)).replace("{hours}", hours(day.hours)) : open ? t("Vendor.people") : t("Vendor.closed")}
                            aria-label={`${row.projectNo} ${row.name} ${date} ${t("Vendor.people")}`}
                            onBlur={(event) => void save(row, date, event.currentTarget)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="num">{hours(weekHours)}</td>
                    <td className="num">
                      {hours(row.hoursToDate)} / {row.planHours ? hours(row.planHours) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="vendor-empty">{t("Vendor.empty")}</p>
      )}
    </section>
  );
}
