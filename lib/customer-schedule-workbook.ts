import { strToU8, zipSync } from "fflate";

/*
 * The plan as the Gantt workbook the team sends customers (owner 2026-11-23, plan-grid mockup "ส่งออก Excel แบบส่งลูกค้า"):
 * "[ project ] Project Schedule", "[ customer ]", "PJ no [ PO ]" on top; WBS, TASK, PIC, START, END, DAYS, % DONE and
 * WORK DAYS; then one narrow column per day from the plan's first Monday, with Week / date / day-number / weekday
 * headers, and the plan drawn as filled cells. Headings sit on a gray band. Nothing internal goes out unless asked:
 * no status, hours, reasons or forecasts; the member column and sub tasks are options. Dates are real Excel dates and
 * figures are numbers, so the customer can keep working on the file. Built by hand like schedule-workbook.ts.
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
/** Excel's own weekday names for START and END: Thai (LCID 041E) or English (0409), Gregorian years either way. */
const DATE_FORMAT = { th: "[$-41E]ddd dd/mm/yy", en: "[$-409]ddd dd/mm/yy" };

/** Days since 1899-12-30, the serial Excel reads as a date. */
export const excelSerial = (iso: string) => dayNumber(iso) - dayNumber("1899-12-30");
const xmlSafe = (value: string) =>
  Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 0x20 || char === "\t" || char === "\n" || char === "\r")
    .join("");
const escapeXml = (value: string) => xmlSafe(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
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

/* Cell styles, in cellXfs order. */
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
/* The team's file (PJ260210 "Gantt chart" R1): blue 0070C0 bars, gray when done, a navy heading bar. */
const COLORS = {
  bar: "FF0070C0",
  barDone: "FF808080",
  band: "FFD9E1F2",
  weekend: "FFF2F2F2",
  head: "FFF2F2F2",
  navy: "FF1F3864",
  today: "FFFDE2E1",
  todayStrong: "FFC00000",
  holiday: "FFFCE4E8",
  line: "FFBFBFBF",
  soft: "FFE4E7EC",
};

function stylesXml(lang: "th" | "en"): string {
  const fills = ["none", "gray125", COLORS.head, COLORS.band, COLORS.weekend, COLORS.bar, COLORS.barDone, COLORS.navy, COLORS.today, COLORS.todayStrong, COLORS.holiday]
    .map((fill) =>
      fill === "none" || fill === "gray125"
        ? `<fill><patternFill patternType="${fill}"/></fill>`
        : `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/><bgColor indexed="64"/></patternFill></fill>`,
    )
    .join("");
  const FILL = { none: 0, head: 2, band: 3, weekend: 4, bar: 5, barDone: 6, navy: 7, today: 8, todayStrong: 9, holiday: 10 };
  const side = (color: string) =>
    `<left style="thin"><color rgb="${color}"/></left><right style="thin"><color rgb="${color}"/></right><top style="thin"><color rgb="${color}"/></top><bottom style="thin"><color rgb="${color}"/></bottom>`;
  const borders =
    `<border><left/><right/><top/><bottom/><diagonal/></border><border>${side(COLORS.line)}<diagonal/></border><border>${side(COLORS.soft)}<diagonal/></border>` +
    `<border><left/><right/><top/><bottom style="medium"><color rgb="FF000000"/></bottom><diagonal/></border>`;
  const fonts = [
    `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="18"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="9"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><i/><sz val="9"/><color rgb="FF7F7F7F"/><name val="Calibri"/><family val="2"/></font>`,
  ].join("");
  const F = { normal: 0, title: 1, meta: 2, bold: 3, small: 4, smallWhite: 5, note: 6 };
  const xf = (font: number, fill: number, border: number, numFmt = 0, alignment = "") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ""} applyFont="1" applyFill="1" applyBorder="1"${alignment ? ` applyAlignment="1"><alignment ${alignment}/></xf>` : "/>"}`;
  const center = 'horizontal="center" vertical="center"',
    middle = 'vertical="center"';
  const list = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    xf(F.title, FILL.none, 0, 0, middle),
    xf(F.meta, FILL.none, 0, 0, 'horizontal="right" vertical="center"'),
    xf(F.bold, FILL.none, 0, 0, 'horizontal="left" vertical="center"'),
    xf(F.bold, FILL.none, 3, 0, `${center} wrapText="1"`),
    xf(F.bold, FILL.head, 1, 0, 'horizontal="left" vertical="center"'),
    xf(F.small, FILL.head, 1, 165, 'horizontal="left" vertical="center"'),
    xf(F.small, FILL.none, 2, 166, center),
    xf(F.smallWhite, FILL.todayStrong, 2, 166, center),
    xf(F.small, FILL.none, 3, 0, center),
    xf(F.normal, FILL.none, 1, 0, middle),
    xf(F.bold, FILL.band, 1, 0, middle),
    xf(F.normal, FILL.none, 1, 0, `${middle} indent="1"`),
    xf(F.normal, FILL.none, 1, 0, `${middle} indent="2"`),
    xf(F.normal, FILL.none, 1, 164, center),
    xf(F.bold, FILL.band, 1, 164, center),
    xf(F.normal, FILL.none, 1, 1, center),
    xf(F.bold, FILL.band, 1, 1, center),
    xf(F.normal, FILL.none, 1, 9, center),
    xf(F.normal, FILL.none, 2),
    xf(F.normal, FILL.weekend, 2),
    xf(F.normal, FILL.bar, 2),
    xf(F.normal, FILL.barDone, 2),
    xf(F.normal, FILL.band, 2),
    xf(F.normal, FILL.navy, 2),
    xf(F.normal, FILL.today, 2),
    xf(F.normal, FILL.holiday, 2),
    xf(F.bold, FILL.none, 1, 165, center),
    xf(F.note, FILL.none, 0, 0, 'horizontal="right" vertical="center"'),
    xf(F.normal, FILL.none, 0),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3"><numFmt numFmtId="164" formatCode="${escapeXml(DATE_FORMAT[lang])}"/><numFmt numFmtId="165" formatCode="d\\ mmm\\ yyyy"/><numFmt numFmtId="166" formatCode="d"/></numFmts>` +
    `<fonts count="7">${fonts}</fonts><fills count="11">${fills}</fills><borders count="4">${borders}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${list.length}">${list.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  );
}

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

function worksheetXml(sheet: ReturnType<typeof customerScheduleSheet>): string {
  const content = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          if (cell.value === undefined || cell.value === null || cell.value === "") return cell.style ? `<c r="${ref}" s="${cell.style}"/>` : "";
          return typeof cell.value === "number"
            ? `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`
            : `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
        })
        .join("");
      const height = rowIndex === 0 ? ' ht="28" customHeight="1"' : rowIndex === 6 ? ' ht="34.8" customHeight="1"' : rowIndex >= 7 ? ' ht="18.6" customHeight="1"' : "";
      return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    })
    .join("");
  const cols = sheet.widths.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}"${column.hidden ? ' hidden="1"' : ""} customWidth="1"/>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="70" zoomScaleNormal="70"><pane ySplit="${sheet.frozen.rows}" topLeftCell="A${sheet.frozen.rows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${content}</sheetData>` +
    `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` +
    `<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
  );
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Project Schedule" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildCustomerScheduleWorkbook(input: CustomerScheduleInput): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(stylesXml(input.lang)),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(customerScheduleSheet(input))),
  });
}

/** "PJ260210 Project Schedule.xlsx", the name the team's file already has; characters Windows refuses become "-". */
export const customerScheduleFileName = (projectNo: string) => `${projectNo.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Project"} Project Schedule.xlsx`;
