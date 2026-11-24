/*
 * The plan laid out the way the team's master Gantt workbook has it (owner 2026-11-24, PJ260210 "Gantt chart" R1), for
 * the preview in Projects > Plan > "Export Excel for the customer". The file itself is the master workbook filled by
 * lib/customer-schedule-template.ts; this keeps the shared row type, the day range and the file name.
 */

export type CustomerScheduleRow = {
  wbs: string;
  /** 1 a main heading, 2 a task, 3 and deeper its sub tasks. */
  level: number;
  heading: boolean;
  name: string;
  /** The party the customer sees (PIC). */
  party: string;
  /** Internal: the people doing it; written only when asked. */
  member: string;
  start: string | null;
  end: string | null;
  days: number | null;
  /** 0 to 100; null leaves the cell empty (a heading). */
  percent: number | null;
  workDays: number | null;
  /** The WBS it follows (ต่อจาก), for the PREDECESSOR column the team's file keeps hidden. */
  after?: string;
};

export type CustomerScheduleInput = {
  projectName: string;
  customerName: string;
  projectNo: string;
  poNumber: string;
  projectStart: string | null;
  lead: string;
  today: string;
  /** Weekday and month names, and the date format of START and END. */
  lang: "th" | "en";
  withMember: boolean;
  holidays: readonly string[];
  rows: readonly CustomerScheduleRow[];
};

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const NAMES = {
  th: { letter: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] },
  en: { letter: ["S", "M", "T", "W", "T", "F", "S"] },
};
/** Days since 1899-12-30, the serial Excel reads as a date. */
export const excelSerial = (iso: string) => dayNumber(iso) - dayNumber("1899-12-30");
export function columnName(index: number): string {
  let name = "",
    rest = index;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    rest = Math.floor((rest - 1) / 26);
  }
  return name;
}

/* Cell kinds; the preview styles each as .x<number>. */
const S = {
  title: 1,
  meta: 2,
  metaValue: 3,
  head: 4,
  week: 5,
  weekDate: 6,
  dayNo: 7,
  dayNoToday: 8,
  dayLetter: 9,
  text: 10,
  band: 11,
  indent1: 12,
  indent2: 13,
  date: 14,
  dateBand: 15,
  number: 16,
  numberBand: 17,
  percent: 18,
  day: 19,
  weekend: 20,
  bar: 21,
  barDone: 22,
  dayBand: 23,
  barHead: 24,
  today: 25,
  holiday: 26,
  metaDate: 27,
  copyright: 28,
  spacer: 29,
} as const;
type Cell = { value?: string | number | null; style: number };

/** The days the Gantt shows: from the Monday of the plan's first day to a week past its last, at least four weeks. */
export function customerScheduleDays(input: Pick<CustomerScheduleInput, "rows" | "projectStart" | "today">): string[] {
  let first: string | null = input.projectStart,
    last: string | null = null;
  for (const row of input.rows) {
    if (row.start && (!first || row.start < first)) first = row.start;
    if (row.end && (!last || row.end > last)) last = row.end;
  }
  const from = first ?? input.today,
    monday = dayNumber(from) - ((weekdayOf(from) + 6) % 7);
  const end = dayNumber(last && last > from ? last : from) + 7;
  const weeks = Math.min(104, Math.max(4, Math.ceil((end - monday + 1) / 7)));
  return Array.from({ length: weeks * 7 }, (_, index) => isoOf(monday + index));
}

/*
 * The layout of the team's own file (PJ260210 "Gantt chart" R1, the owner's master, 2026-11-24):
 *   1  [ project ] Project Schedule (A:H)                 Copyright© TOMAS TECH CORPORATION. All rights reserved. (from K)
 *   2  [ customer ]
 *   3  PJ no [ PO ]
 *   4  Project Start Date | date        Display Week | n    Week 1 | Week 2 ... (seven days each)
 *   5  Project Lead       | name                             the Monday of each week
 *   6                                                        one date per day (shown as the day number)
 *   7  WBS TASK PIC PREDECESSOR START END DAYS % DONE WORK DAYS  (blank)  M T W T F S S ...
 *   8+ the plan
 * PREDECESSOR is hidden, as in the team's file; J is a narrow blank column; the days start at K.
 */
export const CUSTOMER_SCHEDULE_COPYRIGHT = "Copyright© TOMAS TECH CORPORATION. All rights reserved.";
export type CustomerScheduleColumn = { width: number; hidden?: boolean };

export function customerScheduleSheet(input: CustomerScheduleInput): { rows: Cell[][]; merges: string[]; widths: CustomerScheduleColumn[]; frozen: { columns: number; rows: number } } {
  const lang = input.lang;
  const columns: { label: string; width: number; hidden?: boolean }[] = [
    { label: "WBS", width: 6.89 },
    { label: "TASK", width: 57.55 },
    { label: "PIC", width: 14 },
    ...(input.withMember ? [{ label: lang === "th" ? "ผู้ทำ" : "MEMBER", width: 16 }] : []),
    { label: "PREDECESSOR", width: 6.89, hidden: true },
    { label: "START", width: 14.11 },
    { label: "END", width: 14.44 },
    { label: "DAYS", width: 6 },
    { label: "% DONE", width: 6.66 },
    { label: "WORK DAYS", width: 8 },
  ];
  const col = (label: string) => columns.findIndex((column) => column.label === label);
  // The plan's columns, a narrow blank one, then the days.
  const left = columns.length + 1,
    days = customerScheduleDays(input),
    holidays = new Set(input.holidays);
  const rows: Cell[][] = [];
  const merges: string[] = [];
  const at = (index: number) => columnName(index + 1);
  const line = (cells: [number, Cell][]) => {
    const out: Cell[] = [];
    for (const [index, cell] of cells) {
      while (out.length < index) out.push({ style: 0 });
      out[index] = cell;
    }
    return out;
  };
  const doneAt = col("% DONE"),
    displayWeek = days.includes(input.today) ? Math.floor(days.indexOf(input.today) / 7) + 1 : 1;
  rows.push(
    line([
      [0, { value: `[ ${input.projectName} ] Project Schedule`, style: S.title }],
      [left, { value: CUSTOMER_SCHEDULE_COPYRIGHT, style: S.copyright }],
    ]),
  );
  merges.push(`A1:${at(doneAt)}1`, `${at(left)}1:${at(left + 20)}1`);
  rows.push(line([[0, { value: ` [ ${input.customerName} ]`, style: S.metaValue }]]));
  rows.push(line([[0, { value: `${input.projectNo}${input.poNumber ? ` [ ${input.poNumber} ]` : ""}`, style: S.metaValue }]]));
  // Rows 4 to 7: the plan's facts on the left, the calendar over the days.
  const weekRow = line([
      [1, { value: "Project Start Date ", style: S.meta }],
      [2, input.projectStart ? { value: excelSerial(input.projectStart), style: S.metaDate } : { style: S.metaDate }],
      [3, { style: S.metaDate }],
      [4, { style: S.metaDate }],
      [col("DAYS"), { value: "Display Week ", style: S.meta }],
      [doneAt, { value: displayWeek, style: S.metaValue }],
    ]),
    mondayRow = line([
      [1, { value: "Project Lead ", style: S.meta }],
      [2, { value: input.lead || "—", style: S.metaDate }],
      [3, { style: S.metaDate }],
      [4, { style: S.metaDate }],
    ]),
    dateRow: Cell[] = [],
    headRow = line(columns.map((column, index): [number, Cell] => [index, { value: column.label, style: S.head }]));
  merges.push("C4:E4", "C5:E5");
  while (weekRow.length < left) weekRow.push({ style: 0 });
  while (mondayRow.length < left) mondayRow.push({ style: 0 });
  while (dateRow.length < left) dateRow.push({ style: 0 });
  while (headRow.length < left) headRow.push({ style: S.dayLetter });
  days.forEach((day, index) => {
    const weekStart = index % 7 === 0;
    weekRow.push(weekStart ? { value: `Week ${index / 7 + 1}`, style: S.week } : { style: S.week });
    mondayRow.push(weekStart ? { value: excelSerial(day), style: S.weekDate } : { style: S.weekDate });
    dateRow.push({ value: excelSerial(day), style: day === input.today ? S.dayNoToday : S.dayNo });
    headRow.push({ value: NAMES[lang].letter[weekdayOf(day)]!, style: S.dayLetter });
    if (weekStart) merges.push(`${at(left + index)}4:${at(left + index + 6)}4`, `${at(left + index)}5:${at(left + index + 6)}5`);
  });
  rows.push(weekRow, mondayRow, dateRow, headRow);
  // The plan, one row per line, and its bar as filled day cells.
  for (const row of input.rows) {
    const band = row.heading;
    const text = (value: string) => ({ value, style: band ? S.band : S.text });
    const cells: Cell[] = [
      text(row.wbs),
      { value: row.name, style: band ? S.band : row.level >= 3 ? S.indent2 : row.level === 2 ? S.indent1 : S.text },
      text(band ? "" : row.party),
      ...(input.withMember ? [text(band ? "" : row.member)] : []),
      text(band ? "" : (row.after ?? "")),
      { value: row.start ? excelSerial(row.start) : null, style: band ? S.dateBand : S.date },
      { value: row.end ? excelSerial(row.end) : null, style: band ? S.dateBand : S.date },
      { value: row.days, style: band ? S.numberBand : S.number },
      band || row.percent === null ? { style: band ? S.band : S.percent } : { value: row.percent / 100, style: S.percent },
      { value: row.workDays, style: band ? S.numberBand : S.number },
      { style: S.spacer },
    ];
    const done = !band && (row.percent ?? 0) >= 100;
    for (const day of days) {
      const inside = row.start !== null && row.end !== null && day >= row.start && day <= row.end;
      const weekday = weekdayOf(day);
      cells.push({
        style: inside
          ? band
            ? S.barHead
            : done
              ? S.barDone
              : S.bar
          : day === input.today
            ? S.today
            : holidays.has(day)
              ? S.holiday
              : band
                ? S.dayBand
                : weekday === 0 || weekday === 6
                  ? S.weekend
                  : S.day,
      });
    }
    rows.push(cells);
  }
  return {
    rows,
    merges,
    widths: [...columns.map(({ width, hidden }) => ({ width, ...(hidden ? { hidden } : {}) })), { width: 1.89 }, ...days.map(() => ({ width: 2.44 }))],
    frozen: { columns: 0, rows: 7 },
  };
}

/** The file's name; `version` is the how-many-th file sent to the customer, kept in folder 08 (owner 2026-11-24). */
export const customerScheduleFileName = (projectNo: string, version?: number | null) =>
  `${projectNo.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Project"} Project Schedule${version ? ` v${version}` : ""}.xlsx`;
