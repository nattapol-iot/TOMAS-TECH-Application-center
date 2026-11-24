/*
 * Projects > Plan, "Export Excel for the customer" (owner 2026-11-24): the team's master Gantt workbook is the file the
 * customer gets. public/templates/customer-schedule.xlsx is that workbook cleaned by
 * scripts/build-customer-schedule-template.mjs; this fills it with the plan and touches nothing else, so the look, the
 * formulas (END from START and DAYS, WORK DAYS, the Week and date headers), the conditional-format bars, the Display
 * Week scroll bar and the help comments stay the team's.
 *
 * Sheet "Plan" gets the customer's rows. Sheet "Task list" (the team's breakdown by person) is filled with every row
 * and its member when asked for, and taken out of the file otherwise.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { excelSerial, type CustomerScheduleInput, type CustomerScheduleRow } from "./customer-schedule-workbook";

export const CUSTOMER_SCHEDULE_TEMPLATE_URL = "/templates/customer-schedule.xlsx";

type Kind = "heading" | "group" | "task";
type Column = "wbs" | "name" | "pic" | "after" | "start" | "end" | "days" | "percent" | "work";
type SheetSpec = {
  path: string;
  columns: Partial<Record<Column, string>>;
  patterns: Record<Kind, number>;
  firstDay: string;
  /** The Display Week cell. */
  week: string;
};
const PLAN: SheetSpec = {
  path: "xl/worksheets/sheet1.xml",
  columns: { wbs: "A", name: "B", pic: "C", after: "D", start: "E", end: "F", days: "G", percent: "H", work: "I" },
  patterns: { heading: 8, group: 9, task: 9 },
  firstDay: "K",
  week: "H4",
};
const TASK_LIST: SheetSpec = {
  path: "xl/worksheets/sheet2.xml",
  columns: { wbs: "A", name: "B", pic: "C", start: "D", end: "E", days: "F", percent: "G", work: "H" },
  patterns: { heading: 8, group: 9, task: 10 },
  firstDay: "J",
  week: "G4",
};
const FIRST_ROW = 8;

const xmlText = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    // Element text only (never an attribute), so quotes stay as they are, as Excel writes formulas.
    .replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
const text = (ref: string, style: string, value: string) => (value ? `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>` : `<c r="${ref}"${style}/>`);
const number = (ref: string, style: string, value: number | null | undefined) => (value === null || value === undefined ? `<c r="${ref}"${style}/>` : `<c r="${ref}"${style}><v>${value}</v></c>`);
const formula = (ref: string, style: string, body: string, cached: number | null) =>
  cached === null ? `<c r="${ref}"${style} t="str"><f>${xmlText(body)}</f><v xml:space="preserve"> - </v></c>` : `<c r="${ref}"${style}><f>${xmlText(body)}</f><v>${cached}</v></c>`;

/** Replaces one cell, keeping its style. */
function setCell(xml: string, ref: string, make: (style: string) => string): string {
  const pattern = new RegExp(`<c r="${ref}"( s="\\d+")?[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const match = xml.match(pattern);
  if (!match) throw new Error(`The template has no cell ${ref}.`);
  return xml.replace(pattern, make(match[1] ?? ""));
}

/** Monday of the week the template's formulas start from: C4-WEEKDAY(C4,1)+2. */
const firstMonday = (serial: number) => serial - (((serial - 1) % 7) + 1) + 2;

type Pattern = { open: string; cells: [string, string][] };
function patternRow(xml: string, row: number): Pattern {
  const match = xml.match(new RegExp(`<row r="${row}"([^>]*)>([\\s\\S]*?)</row>`));
  if (!match) throw new Error(`The template has no pattern row ${row}.`);
  const cells = [...match[2]!.matchAll(/<c r="([A-Z]+)\d+"( s="\d+")?/g)].map((cell): [string, string] => [cell[1]!, cell[2] ?? ""]);
  return { open: match[1]!, cells };
}

function rowXml(spec: SheetSpec, pattern: Pattern, at: number, row: CustomerScheduleRow, kind: Kind, pic: string): string {
  const col = spec.columns;
  // The team's "Task list" leaves a group's figures blank: its rows below carry them.
  const blank = kind === "group" && spec === TASK_LIST;
  const start = row.start && !blank ? excelSerial(row.start) : null,
    end = row.end && !blank ? excelSerial(row.end) : null;
  const cells = pattern.cells.map(([column, style]) => {
    const ref = `${column}${at}`;
    switch (column) {
      case col.wbs:
        return text(ref, style, row.wbs);
      case col.name:
        return text(ref, style, row.name);
      case col.pic:
        return text(ref, style, kind === "heading" ? "" : pic);
      case col.after:
        return text(ref, style, kind === "heading" ? "" : (row.after ?? ""));
      case col.start:
        return number(ref, style, start);
      case col.end:
        if (blank) return `<c r="${ref}"${style}/>`;
        // A task's END is the template's own formula from START and DAYS; a heading spans its rows.
        return kind === "heading"
          ? number(ref, style, end)
          : formula(ref, style, `IF(ISBLANK(${col.start}${at})," - ",IF(${col.days}${at}=0,${col.start}${at},${col.start}${at}+${col.days}${at}-1))`, end);
      case col.days:
        return number(ref, style, kind === "heading" || start === null ? null : row.days);
      case col.percent:
        return number(ref, style, kind === "heading" || blank || row.percent === null ? null : row.percent / 100);
      case col.work:
        if (blank) return `<c r="${ref}"${style}/>`;
        return formula(ref, style, `IF(OR(${col.end}${at}=0,${col.start}${at}=0)," - ",NETWORKDAYS(${col.start}${at},${col.end}${at}))`, start === null || end === null ? null : row.workDays);
      default:
        return `<c r="${ref}"${style}/>`;
    }
  });
  return `<row r="${at}"${pattern.open.replace(/ r="\d+"/, "")}>${cells.join("")}</row>`;
}

/** Stretches each range that starts on the plan rows (or the date rows above them) down to the last row. */
const stretch = (sqref: string, last: number) =>
  sqref.replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, (all, from, top, to, bottom) => (Number(top) <= FIRST_ROW && Number(bottom) >= FIRST_ROW ? `${from}${top}:${to}${last}` : all));

function fillSheet(xml: string, spec: SheetSpec, input: CustomerScheduleInput, rows: readonly CustomerScheduleRow[], member: boolean, projectStart: number): string {
  // The title block: the same three lines as the team writes them.
  xml = setCell(xml, "A1", (style) => text("A1", style, `[ ${input.projectName} ] Project Schedule`));
  xml = setCell(xml, "A2", (style) => text("A2", style, ` [ ${input.customerName} ]`));
  xml = setCell(xml, "A3", (style) => text("A3", style, `${input.projectNo}${input.poNumber ? ` [ ${input.poNumber} ]` : ""}`));
  if (spec === PLAN) {
    xml = setCell(xml, "C4", (style) => number("C4", style, projectStart));
    xml = setCell(xml, "C5", (style) => text("C5", style, input.lead || "—"));
  } else {
    xml = setCell(xml, "C4", (style) => formula("C4", style, "Plan!C4", projectStart));
    xml = setCell(xml, "C5", (style) => `<c r="C5"${style} t="str"><f>Plan!C5</f><v>${xmlText(input.lead || "—")}</v></c>`);
  }
  xml = setCell(xml, spec.week, (style) => number(spec.week, style, 1));
  // The dates the header formulas will show, already worked out for a viewer that does not recalculate.
  const shift = firstMonday(projectStart) - Number(xml.match(new RegExp(`<c r="${spec.firstDay}6"[^>]*>(?:<f>[^<]*</f>)?<v>(\\d+)</v>`))?.[1] ?? firstMonday(projectStart));
  if (shift)
    xml = xml.replace(/<row r="([56])"[^>]*>[\s\S]*?<\/row>/g, (row) =>
      row.replace(/(<c r="([A-Z]+)[56]"[^>]*>(?:<f[^>]*>[^<]*<\/f>|<f[^>]*\/>)?<v>)(\d+)(<\/v>)/g, (all, head, column: string, value, tail) =>
        column.length > spec.firstDay.length || (column.length === spec.firstDay.length && column >= spec.firstDay) ? `${head}${Number(value) + shift}${tail}` : all,
      ),
    );

  const patterns = { heading: patternRow(xml, spec.patterns.heading), group: patternRow(xml, spec.patterns.group), task: patternRow(xml, spec.patterns.task) };
  const body = rows.map((row, index) => {
    const next = rows[index + 1];
    const kind: Kind = row.heading ? "heading" : next && next.level > row.level ? "group" : "task";
    const pic = member && kind === "task" ? row.member || row.party : row.party;
    return rowXml(spec, patterns[kind], FIRST_ROW + index, row, kind, pic);
  });
  const last = Math.max(FIRST_ROW, FIRST_ROW + rows.length - 1);
  const start = xml.indexOf("<sheetData>") + "<sheetData>".length,
    end = xml.indexOf("</sheetData>");
  const kept = [...xml.slice(start, end).matchAll(/<row r="(\d+)"[\s\S]*?<\/row>/g)].filter((match) => Number(match[1]) < FIRST_ROW).map((match) => match[0]);
  xml = xml.slice(0, start) + kept.join("") + body.join("") + xml.slice(end);
  return xml
    .replace(/<dimension ref="A1:([A-Z]+)\d+"\/>/, (_, column) => `<dimension ref="A1:${column}${last}"/>`)
    .replace(/(<conditionalFormatting[^>]*sqref=")([^"]+)"/g, (_, head, sqref) => `${head}${stretch(sqref, last)}"`)
    .replace(/<xm:sqref>([^<]+)<\/xm:sqref>/g, (_, sqref) => `<xm:sqref>${stretch(sqref, last)}</xm:sqref>`);
}

/** The sheet "Task list" and everything only it uses. */
function dropTaskList(files: Record<string, Uint8Array>) {
  const read = (name: string) => strFromU8(files[name]!);
  const relations = read("xl/worksheets/_rels/sheet2.xml.rels");
  const parts = ["xl/worksheets/sheet2.xml", ...[...relations.matchAll(/Target="\.\.\/([^"]+)"/g)].map((match) => `xl/${match[1]}`)];
  for (const name of [...parts, "xl/worksheets/_rels/sheet2.xml.rels"]) delete files[name];
  files["[Content_Types].xml"] = strToU8(read("[Content_Types].xml").replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, (all, name) => (parts.includes(name) ? "" : all)));
  const workbookRels = read("xl/_rels/workbook.xml.rels");
  const id = workbookRels.match(/<Relationship Id="([^"]+)"[^>]*Target="worksheets\/sheet2\.xml"/)?.[1];
  files["xl/_rels/workbook.xml.rels"] = strToU8(workbookRels.replace(/<Relationship [^>]*Target="worksheets\/sheet2\.xml"[^>]*\/>/, ""));
  files["xl/workbook.xml"] = strToU8(
    read("xl/workbook.xml")
      .replace(new RegExp(`<sheet [^>]*r:id="${id}"/>`), "")
      .replace(/<definedName [^>]*localSheetId="1"[^>]*>[^<]*<\/definedName>/g, ""),
  );
}

export type CustomerScheduleExport = CustomerScheduleInput & {
  /** Every row of the plan with its member, for the sheet "Task list"; null leaves that sheet out. */
  taskList: readonly CustomerScheduleRow[] | null;
};

/** The customer's workbook: the team's master Gantt file with this plan in it. */
export function fillCustomerSchedule(template: Uint8Array, input: CustomerScheduleExport): Uint8Array {
  const files = unzipSync(template);
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new Error(`The template has no ${name}.`);
    return strFromU8(file);
  };
  const firstStart = input.rows.reduce<string | null>((first, row) => (row.start && (!first || row.start < first) ? row.start : first), null);
  const projectStart = excelSerial(input.projectStart || firstStart || input.today);
  files[PLAN.path] = strToU8(fillSheet(read(PLAN.path), PLAN, input, input.rows, false, projectStart));
  if (input.taskList) files[TASK_LIST.path] = strToU8(fillSheet(read(TASK_LIST.path), TASK_LIST, input, input.taskList, true, projectStart));
  else dropTaskList(files);
  // Print area: the title block to the last row.
  const lastPlan = Math.max(FIRST_ROW, FIRST_ROW + input.rows.length - 1),
    lastTasks = Math.max(FIRST_ROW, FIRST_ROW + (input.taskList?.length ?? 0) - 1);
  files["xl/workbook.xml"] = strToU8(
    read("xl/workbook.xml")
      .replace(/(<definedName name="_xlnm\.Print_Area" localSheetId="0">[^<]*\$)\d+(<)/, `$1${lastPlan}$2`)
      .replace(/(<definedName name="_xlnm\.Print_Area" localSheetId="1">[^<]*\$)\d+(<)/, `$1${lastTasks}$2`),
  );
  // START and END show Thai or English weekday names whatever the reader's Windows language is.
  files["xl/styles.xml"] = strToU8(read("xl/styles.xml").replace(/(<numFmt numFmtId="(?:188|191)" formatCode=")/g, `$1${input.lang === "th" ? "[$-41E]" : "[$-409]"}`));
  return zipSync(files, { level: 6 });
}
