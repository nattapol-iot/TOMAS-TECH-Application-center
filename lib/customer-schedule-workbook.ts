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
  th: { letter: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"], month: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] },
  en: { letter: ["S", "M", "T", "W", "T", "F", "S"], month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
};
/** Excel's own weekday names for START and END: Thai (LCID 041E) or English (0409), Gregorian years either way. */
const DATE_FORMAT = { th: "[$-41E]ddd dd/mm/yy", en: "[$-409]ddd dd/mm/yy" };

/** Days since 1899-12-30, the serial Excel reads as a date. */
export const excelSerial = (iso: string) => dayNumber(iso) - dayNumber("1899-12-30");
const longDate = (iso: string, lang: "th" | "en") => `${Number(iso.slice(8, 10))} ${NAMES[lang].month[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
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
} as const;
const COLORS = {
  bar: "FF0071C2",
  barDone: "FF9AA3AE",
  band: "FFE6EAF0",
  weekend: "FFF2F4F7",
  head: "FFF6F8FA",
  navy: "FF24304F",
  today: "FFFDE2E1",
  todayStrong: "FFDC2626",
  holiday: "FFFCE4E8",
  line: "FFD0D5DD",
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
  const borders = `<border><left/><right/><top/><bottom/><diagonal/></border><border>${side(COLORS.line)}<diagonal/></border><border>${side(COLORS.soft)}<diagonal/></border>`;
  const fonts = [
    `<font><sz val="10"/><name val="Tahoma"/></font>`,
    `<font><b/><sz val="14"/><name val="Tahoma"/></font>`,
    `<font><sz val="9"/><color rgb="FF667085"/><name val="Tahoma"/></font>`,
    `<font><b/><sz val="10"/><name val="Tahoma"/></font>`,
    `<font><sz val="8"/><color rgb="FF667085"/><name val="Tahoma"/></font>`,
    `<font><b/><sz val="8"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>`,
  ].join("");
  const F = { normal: 0, title: 1, meta: 2, bold: 3, small: 4, smallWhite: 5 };
  const xf = (font: number, fill: number, border: number, numFmt = 0, alignment = "") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ""} applyFont="1" applyFill="1" applyBorder="1"${alignment ? ` applyAlignment="1"><alignment ${alignment}/></xf>` : "/>"}`;
  const center = 'horizontal="center" vertical="center"',
    middle = 'vertical="center"';
  const list = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    xf(F.title, FILL.none, 0, 0, middle),
    xf(F.meta, FILL.none, 0, 0, middle),
    xf(F.bold, FILL.none, 0, 0, middle),
    xf(F.bold, FILL.head, 1, 0, `${center} wrapText="1"`),
    xf(F.bold, FILL.head, 1, 0, 'horizontal="left" vertical="center"'),
    xf(F.small, FILL.head, 1, 0, 'horizontal="left" vertical="center"'),
    xf(F.small, FILL.head, 1, 0, center),
    xf(F.smallWhite, FILL.todayStrong, 1, 0, center),
    xf(F.small, FILL.head, 1, 0, center),
    xf(F.normal, FILL.none, 1, 0, middle),
    xf(F.bold, FILL.band, 1, 0, middle),
    xf(F.normal, FILL.none, 1, 0, `${middle} indent="1"`),
    xf(F.normal, FILL.none, 1, 0, `${middle} indent="2"`),
    xf(F.normal, FILL.none, 1, 164, center),
    xf(F.bold, FILL.band, 1, 164, center),
    xf(F.normal, FILL.none, 1, 1, 'horizontal="right" vertical="center"'),
    xf(F.bold, FILL.band, 1, 1, 'horizontal="right" vertical="center"'),
    xf(F.normal, FILL.none, 1, 9, 'horizontal="right" vertical="center"'),
    xf(F.normal, FILL.none, 2),
    xf(F.normal, FILL.weekend, 2),
    xf(F.normal, FILL.bar, 2),
    xf(F.normal, FILL.barDone, 2),
    xf(F.normal, FILL.band, 2),
    xf(F.normal, FILL.navy, 2),
    xf(F.normal, FILL.today, 2),
    xf(F.normal, FILL.holiday, 2),
    xf(F.bold, FILL.none, 0, 164, 'horizontal="left" vertical="center"'),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="${escapeXml(DATE_FORMAT[lang])}"/></numFmts>` +
    `<fonts count="6">${fonts}</fonts><fills count="11">${fills}</fills><borders count="3">${borders}</borders>` +
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

export function customerScheduleSheet(input: CustomerScheduleInput): { rows: Cell[][]; merges: string[]; widths: number[]; frozen: { columns: number; rows: number } } {
  const lang = input.lang;
  const columns: { label: string; width: number }[] = [
    { label: "WBS", width: 6 },
    { label: "TASK", width: 42 },
    { label: "PIC", width: 11 },
    ...(input.withMember ? [{ label: lang === "th" ? "ผู้ทำ" : "MEMBER", width: 16 }] : []),
    { label: "START", width: 13 },
    { label: "END", width: 13 },
    { label: "DAYS", width: 6 },
    { label: "% DONE", width: 7 },
    { label: "WORK DAYS", width: 7 },
  ];
  const left = columns.length,
    days = customerScheduleDays(input),
    holidays = new Set(input.holidays);
  const rows: Cell[][] = [];
  const merges: string[] = [];
  const at = (index: number) => columnName(index + 1);
  // Title block, with the plan's facts on the right as in the team's file.
  const metaAt = left + 2;
  const block: [string, Cell | null][] = [
    [`[ ${input.projectName} ] Project Schedule`, input.projectStart ? { value: excelSerial(input.projectStart), style: S.metaDate } : null],
    [`[ ${input.customerName} ]`, { value: input.lead || "—", style: S.metaValue }],
    [`${input.projectNo}${input.poNumber ? ` [ ${input.poNumber} ]` : ""}`, { value: days.includes(input.today) ? Math.floor(days.indexOf(input.today) / 7) + 1 : 1, style: S.metaValue }],
  ];
  const metaLabels = ["Project Start Date", "Project Lead", "Display Week"];
  block.forEach(([title, value], index) => {
    const line: Cell[] = [{ value: title, style: index === 0 ? S.title : S.metaValue }];
    while (line.length < metaAt) line.push({ style: 0 });
    line.push({ value: metaLabels[index]!, style: S.meta });
    while (line.length < metaAt + 6) line.push({ style: 0 });
    if (value) line.push(value);
    rows.push(line);
    merges.push(`${at(metaAt)}${index + 1}:${at(metaAt + 5)}${index + 1}`);
  });
  rows.push([]);
  // Gantt headers: Week N and its Monday over each seven days; the plan's columns span the day-number and weekday rows.
  const weekRow: Cell[] = columns.map(() => ({ style: S.head })),
    dateRow: Cell[] = columns.map(() => ({ style: S.head })),
    numberRow: Cell[] = columns.map((column) => ({ value: column.label, style: S.head })),
    letterRow: Cell[] = columns.map(() => ({ style: S.head }));
  const headTop = rows.length + 1;
  days.forEach((day, index) => {
    const weekStart = index % 7 === 0;
    weekRow.push(weekStart ? { value: `Week ${index / 7 + 1}`, style: S.week } : { style: S.week });
    dateRow.push(weekStart ? { value: longDate(day, lang), style: S.weekDate } : { style: S.weekDate });
    numberRow.push({ value: Number(day.slice(8)), style: day === input.today ? S.dayNoToday : S.dayNo });
    letterRow.push({ value: NAMES[lang].letter[weekdayOf(day)]!, style: S.dayLetter });
    if (weekStart) {
      merges.push(`${at(left + index)}${headTop}:${at(left + index + 6)}${headTop}`);
      merges.push(`${at(left + index)}${headTop + 1}:${at(left + index + 6)}${headTop + 1}`);
    }
  });
  merges.push(`A${headTop}:${at(left - 1)}${headTop + 1}`);
  columns.forEach((_, index) => merges.push(`${at(index)}${headTop + 2}:${at(index)}${headTop + 3}`));
  rows.push(weekRow, dateRow, numberRow, letterRow);
  // The plan, one row per line, and its bar as filled day cells.
  for (const row of input.rows) {
    const band = row.heading;
    const text = (value: string) => ({ value, style: band ? S.band : S.text });
    const line: Cell[] = [
      text(row.wbs),
      { value: row.name, style: band ? S.band : row.level >= 3 ? S.indent2 : row.level === 2 ? S.indent1 : S.text },
      text(band ? "" : row.party),
      ...(input.withMember ? [text(band ? "" : row.member)] : []),
      { value: row.start ? excelSerial(row.start) : null, style: band ? S.dateBand : S.date },
      { value: row.end ? excelSerial(row.end) : null, style: band ? S.dateBand : S.date },
      { value: row.days, style: band ? S.numberBand : S.number },
      band || row.percent === null ? { style: band ? S.band : S.percent } : { value: row.percent / 100, style: S.percent },
      { value: row.workDays, style: band ? S.numberBand : S.number },
    ];
    const done = !band && (row.percent ?? 0) >= 100;
    for (const day of days) {
      const inside = row.start !== null && row.end !== null && day >= row.start && day <= row.end;
      const weekday = weekdayOf(day);
      line.push({
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
    rows.push(line);
  }
  return { rows, merges, widths: [...columns.map((column) => column.width), ...days.map(() => 2.8)], frozen: { columns: left, rows: headTop + 3 } };
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
      return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>`;
    })
    .join("");
  const cols = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const top = `${columnName(sheet.frozen.columns + 1)}${sheet.frozen.rows + 1}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="${sheet.frozen.columns}" ySplit="${sheet.frozen.rows}" topLeftCell="${top}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16"/><cols>${cols}</cols><sheetData>${content}</sheetData>` +
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
