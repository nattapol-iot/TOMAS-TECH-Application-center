/*
 * Projects > Plan, import from Excel (plan-grid mockup "นำเข้าจาก Excel", owner 2026-11-23): the team's own Gantt workbook
 * read in the browser. The header row is found by its TASK and START cells, so a file with a title block, extra
 * columns or day columns still reads; WBS, PIC, END, DAYS and % DONE are optional. Rows keep the file's order and their
 * levels (from the WBS where there is one), and get the WBS the plan will give them. Nothing here touches the plan:
 * importChanges only says what an import by WBS would add or change.
 */

import { parseSheetDate, shiftDay, spanDays } from "./plan-sheet";

export type ImportCell = string | number | null | undefined;
export type ImportedRow = {
  /** 1 a main heading, 2 a task, 3 a sub task. */
  level: number;
  wbs: string;
  name: string;
  party: string;
  start: string | null;
  end: string | null;
  /** 0 to 100; null when the file has no % DONE for the row, which then keeps the plan's. */
  percent: number | null;
  /** Has rows under it in the file: its own dates and percent do not count. */
  parent: boolean;
  /** The file had no WBS for the row, so it was numbered from the row above: it matches a plan row only by name too. */
  numbered: boolean;
  /** The row number in the sheet, for messages. */
  line: number;
};
export type ImportWarning = { line: number; key: "Sheet.importNoDates" | "Sheet.importEndBeforeStart" | "Sheet.importDuplicate"; name: string };
export type ImportedPlan = { projectNo: string; rows: ImportedRow[]; warnings: ImportWarning[] };

const DAY_MS = 86_400_000;
const norm = (value: ImportCell) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** A cell as a date: an Excel day number, or text as the plan reads it (19/11/26, 2026-11-19, "Thu 19/11/26"). */
export function importDate(value: ImportCell, today: string): string | null {
  if (typeof value === "number") return value > 20_000 && value < 80_000 ? new Date((Math.floor(value) - 25_569) * DAY_MS).toISOString().slice(0, 10) : null;
  const text = String(value ?? "")
    .trim()
    .replace(/^[^\d+]+\s/, "");
  return text ? parseSheetDate(text, today) || null : null;
}

/** A % DONE cell: null when blank. A number column is a fraction (0.4) unless any of its numbers is over 1 (40). */
const percentOf = (value: ImportCell, wholeNumbers: boolean): number | null => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") return Math.max(0, Math.min(100, Math.round(wholeNumbers ? value : value * 100)));
  const parsed = Number.parseFloat(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
};
/** Lines under the table that are notes, not plan rows. */
const NOTE = /^(remarks?|notes?|prepared|approved|checked|reviewed|signature|หมายเหตุ|ผู้จัดทำ|ผู้อนุมัติ|ผู้ตรวจ|ลงชื่อ)|:\s*$|^[.\s]*\[\s*level\s*\d+\b[^\]]*\]\s*$/i;

/** The plan table in a sheet's rows, or null when no row has both TASK and START. */
export function readPlanTable(grid: readonly (readonly ImportCell[])[], today: string): ImportedPlan | null {
  let head = -1;
  for (let row = 0; row < Math.min(grid.length, 60); row++) {
    const cells = (grid[row] ?? []).map(norm);
    if (cells.some((cell) => cell === "TASK" || cell === "TASK NAME") && cells.some((cell) => cell.startsWith("START"))) {
      head = row;
      break;
    }
  }
  if (head < 0) return null;
  const header = (grid[head] ?? []).map(norm),
    find = (test: (cell: string) => boolean) => header.findIndex(test);
  const at = {
    wbs: find((cell) => cell === "WBS" || cell === "NO." || cell === "NO"),
    task: find((cell) => cell.startsWith("TASK")),
    pic: find((cell) => cell.startsWith("PIC") || cell === "RESPONSIBLE"),
    start: find((cell) => cell.startsWith("START")),
    end: find((cell) => cell === "END" || cell.startsWith("END") || cell.startsWith("FINISH")),
    days: find((cell) => cell === "DAYS" || cell === "DURATION"),
    percent: find((cell) => cell.includes("%") || cell === "DONE"),
  };
  const get = (row: number, key: keyof typeof at) => (at[key] >= 0 ? grid[row]?.[at[key]] : undefined);
  let projectNo = "";
  for (let row = 0; row < head && !projectNo; row++) for (const cell of grid[row] ?? []) projectNo ||= String(cell ?? "").match(/PJ\d{6}/)?.[0] ?? "";
  const rows: ImportedRow[] = [],
    warnings: ImportWarning[] = [];
  let wholeNumbers = false;
  for (let row = head + 1; row < grid.length; row++) {
    const value = get(row, "percent");
    if (typeof value === "number" && value > 1) wholeNumbers = true;
  }
  let blank = 0;
  for (let row = head + 1; row < grid.length; row++) {
    const name = String(get(row, "task") ?? "").trim();
    if (!name) {
      if (++blank >= 8) break;
      continue;
    }
    blank = 0;
    if (NOTE.test(name)) continue;
    const wbs = String(get(row, "wbs") ?? "")
        .trim()
        .replace(/\.$/, ""),
      party = String(get(row, "pic") ?? "").trim(),
      daysCell = get(row, "days");
    const level = /^\d+(\.\d+)*$/.test(wbs) ? wbs.split(".").length : !party && (daysCell === undefined || daysCell === null || daysCell === "") ? 1 : 2;
    const start = importDate(get(row, "start"), today);
    let end = importDate(get(row, "end"), today);
    const days = Number.parseInt(String(daysCell ?? ""), 10);
    if (start && !end && days > 0) end = shiftDay(start, days - 1);
    if (start && end && end < start) {
      warnings.push({ line: row + 1, key: "Sheet.importEndBeforeStart", name });
      end = start;
    }
    rows.push({
      level,
      wbs: /^\d+(\.\d+)*$/.test(wbs) ? wbs : "",
      name: name.slice(0, 500),
      party: party.slice(0, 300),
      start,
      end,
      percent: percentOf(get(row, "percent"), wholeNumbers),
      parent: false,
      numbered: false,
      line: row + 1,
    });
  }
  // The file's own WBS is kept, because rows are matched to the plan by it; a row without one is numbered on from the
  // row above, one level under it at most.
  let counters: number[] = [];
  rows.forEach((item, index) => {
    if (item.wbs) {
      counters = item.wbs.split(".").map(Number);
      item.level = counters.length;
      return;
    }
    item.level = index === 0 ? 1 : Math.min(item.level, rows[index - 1]!.level + 1);
    const next = counters.slice(0, item.level);
    while (next.length < item.level) next.push(0);
    next[item.level - 1] = (next[item.level - 1] ?? 0) + 1;
    counters = next;
    item.wbs = counters.join(".");
    item.numbered = true;
  });
  // Two rows with one WBS would both land on one plan row: the later ones are left out and named.
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const item = rows[index]!;
    if (!seen.has(item.wbs)) {
      seen.add(item.wbs);
      continue;
    }
    warnings.push({ line: item.line, key: "Sheet.importDuplicate", name: `${item.wbs} ${item.name}` });
    rows.splice(index--, 1);
  }
  rows.forEach((item, index) => {
    item.parent = index + 1 < rows.length && rows[index + 1]!.level > item.level;
    if (!item.parent && item.level > 1 && (!item.start || !item.end)) warnings.push({ line: item.line, key: "Sheet.importNoDates", name: item.name });
  });
  return { projectNo, rows, warnings };
}

/** A worksheet's cells by reference ("B7") as rows of values. */
export function cellsToGrid(cells: Record<string, { value: string | number }>): ImportCell[][] {
  const grid: ImportCell[][] = [];
  for (const [reference, cell] of Object.entries(cells)) {
    const match = reference.match(/^([A-Z]+)(\d+)$/i);
    if (!match) continue;
    const column = [...match[1]!.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1,
      row = Number(match[2]) - 1;
    (grid[row] ??= [])[column] = cell.value;
  }
  return Array.from(grid, (row) => row ?? []);
}

export type PlanRowForImport = { wbs: string; kind: string; name: string; party: string; start: string | null; end: string | null; percent: number; rollup: boolean };
export type ImportChange = { row: ImportedRow; status: "add" | "update" | "same"; /** The plan's name for the row now, when the file renames it. */ was?: string };

/** What an import by WBS does: a row whose WBS the plan has is changed to the file's, any other row is added. */
export function importChanges(rows: readonly ImportedRow[], plan: readonly PlanRowForImport[]): { changes: ImportChange[]; kept: number } {
  const byWbs = new Map(plan.map((row) => [row.wbs, row] as const));
  const changes = rows.map((row): ImportChange => {
    const current = byWbs.get(row.wbs);
    // A row numbered by its place in the file is the plan's row only when it has the same name.
    if (!current || (row.numbered && current.name !== row.name)) return { row, status: "add" };
    const datesCount = !row.parent && !current.rollup && current.kind !== "phase";
    const same =
      current.name === row.name &&
      (!row.party || current.kind === "phase" || current.party === row.party) &&
      (!datesCount || (current.start === row.start && current.end === row.end && (row.percent === null || Math.round(current.percent) === row.percent)));
    return { row, status: same ? "same" : "update", ...(current.name !== row.name ? { was: current.name } : {}) };
  });
  const inFile = new Set(changes.filter((item) => item.status !== "add").map((item) => item.row.wbs));
  return { changes, kept: plan.filter((row) => !inFile.has(row.wbs)).length };
}

/** Calendar days from start to end, as the plan stores a row's length. */
export const importDays = (row: Pick<ImportedRow, "start" | "end">) => (row.start && row.end ? spanDays(row.start, row.end) : 1);
