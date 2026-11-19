/*
 * Customer issue batches on Projects > Punchlist (backend-node/src/issue-batches.ts holds the server's rules): what the
 * screen needs without React, so it can be tested on its own. A batch is one customer report whose issues are typed in a
 * grid like the team's Issues Table; hours are the unit, 8 of them to a man-day.
 */

export type IssueCategory = "Problem" | "Requirement";
export type IssueState = "Approval" | "Open" | "Doing" | "Done" | "Cancelled" | "Rejected";
export type IssueAction = "approve" | "reject" | "start" | "close" | "cancel" | "reopen";

export const HOURS_PER_MAN_DAY = 8;
export const MAX_ISSUE_HOURS = 9999;
export const OPEN_ISSUE_STATES: readonly IssueState[] = ["Approval", "Open", "Doing"];
export const ISSUE_STATES: readonly IssueState[] = ["Approval", "Open", "Doing", "Done", "Cancelled", "Rejected"];

/**
 * Pegasus status tones (pegasus-design DESIGN.md B.1): not started = outline, working = soft blue, waiting for a manager
 * = amber, done = emerald, turned down = red, dropped = slate.
 */
export type IssueTone = "outline" | "soft" | "warning" | "success" | "danger" | "neutral";
export const ISSUE_STATE_TONE: Record<IssueState, IssueTone> = {
  Approval: "warning", Open: "outline", Doing: "soft", Done: "success", Cancelled: "neutral", Rejected: "danger",
};

/** Hours as man-days (8 h = 1 MD), to two decimals. */
export const hoursToManDays = (hours: number) => Math.round((hours / HOURS_PER_MAN_DAY) * 100) / 100;
/** A figure with at most one decimal, as the screen shows hours. */
export const hoursText = (hours: number | null | undefined) =>
  hours === null || hours === undefined ? "—" : (Math.round(hours * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

/** One line of the create grid, as typed. Hours stay text until saved so a half-typed "1." is not lost. */
export type DraftRow = {
  key: string;
  category: IssueCategory;
  functionName: string;
  description: string;
  assigneeId: number | null;
  planStart: string;
  planEnd: string;
  planHours: string;
};
export type DraftField = "category" | "functionName" | "description" | "assigneeId" | "planStart" | "planEnd" | "planHours";

export const blankDraftRow = (key: string, from?: Partial<DraftRow>): DraftRow => ({
  key, category: "Problem", functionName: "", description: "", assigneeId: null, planStart: "", planEnd: "", planHours: "", ...from,
});

/** Nothing typed on the line (its category alone does not count): it is left out when the batch is saved. */
export const draftRowIsBlank = (row: DraftRow, images = 0) =>
  !row.functionName.trim() && !row.description.trim() && row.assigneeId === null && !row.planStart && !row.planEnd && !row.planHours.trim() && images === 0;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseHours(text: string): number | null {
  const value = text.trim().replace(/,/g, "");
  if (!value) return null;
  const hours = Number(value);
  return Number.isFinite(hours) ? hours : Number.NaN;
}

/** The first thing to fix on each line, as a dictionary key; blank lines are skipped. */
export type DraftError = { row: number; field: DraftField; message: string };
export function draftErrors(rows: readonly DraftRow[], imagesOf: (key: string) => number = () => 0): DraftError[] {
  const errors: DraftError[] = [];
  rows.forEach((row, index) => {
    if (draftRowIsBlank(row, imagesOf(row.key))) return;
    const hours = parseHours(row.planHours);
    if (!row.description.trim()) errors.push({ row: index, field: "description", message: "Issues.errDescription" });
    else if (row.planStart && !validDate(row.planStart)) errors.push({ row: index, field: "planStart", message: "Issues.errDate" });
    else if (row.planEnd && !validDate(row.planEnd)) errors.push({ row: index, field: "planEnd", message: "Issues.errDate" });
    else if (row.planEnd && !row.planStart) errors.push({ row: index, field: "planStart", message: "Issues.errStartFirst" });
    else if (row.planStart && row.planEnd && row.planEnd < row.planStart) errors.push({ row: index, field: "planEnd", message: "Issues.errEndBeforeStart" });
    else if (hours !== null && (Number.isNaN(hours) || hours < 0 || hours > MAX_ISSUE_HOURS)) errors.push({ row: index, field: "planHours", message: "Issues.errHours" });
  });
  return errors;
}

export type IssueItemPayload = {
  category: IssueCategory; functionName: string; description: string; assigneeId: number | null;
  planStart: string | null; planEnd: string | null; planHours: number | null;
};

/** The lines worth saving, in order, as the API takes them; `keys` says which draft line each one came from. */
export function draftPayload(rows: readonly DraftRow[], imagesOf: (key: string) => number = () => 0): { items: IssueItemPayload[]; keys: string[] } {
  const kept = rows.filter((row) => !draftRowIsBlank(row, imagesOf(row.key)));
  return {
    keys: kept.map((row) => row.key),
    items: kept.map((row) => ({
      category: row.category, functionName: row.functionName.trim(), description: row.description.trim(), assigneeId: row.assigneeId,
      planStart: row.planStart || null, planEnd: row.planEnd || row.planStart || null, planHours: parseHours(row.planHours),
    })),
  };
}

/** The editable columns of the grid in screen order, which pasted cells fill from the one in focus. */
export const PASTE_COLUMNS: readonly DraftField[] = ["category", "functionName", "description", "assigneeId", "planStart", "planEnd", "planHours"];

/** Tab-separated text as Excel copies it: rows on line breaks, quoted cells may hold tabs, line breaks and "". */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, at = 0;
  const source = text.replace(/\r\n?/g, "\n");
  while (at < source.length) {
    const char = source[at]!;
    if (quoted) {
      if (char === '"' && source[at + 1] === '"') { cell += '"'; at += 2; continue; }
      if (char === '"') { quoted = false; at++; continue; }
      cell += char; at++; continue;
    }
    if (char === '"' && cell === "") { quoted = true; at++; continue; }
    if (char === "\t") { row.push(cell); cell = ""; at++; continue; }
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; at++; continue; }
    cell += char; at++;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
/** A date as people type it in Excel: 2026-11-20, 20/11/2026 (day first, Buddhist years allowed) or 20-Nov-26. */
export function parseLooseDate(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(value))) [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{2,4})$/.exec(value))) {
    const index = MONTHS.indexOf(match[2]!.toLowerCase());
    if (index < 0) return null;
    [day, month, year] = [Number(match[1]), index + 1, Number(match[3])];
  } else return null;
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return validDate(iso) ? iso : null;
}

export const categoryFromText = (text: string): IssueCategory | null =>
  /req|ความต้องการ|ขอเพิ่ม|เพิ่มเติม/i.test(text) ? "Requirement" : /prob|bug|error|issue|ปัญหา/i.test(text) ? "Problem" : null;

/** A person typed or pasted by name: an exact match first, then the only one whose name starts with or holds it. */
export function personFromText(text: string, people: readonly { id: number; name: string }[]): number | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  const exact = people.filter((person) => person.name.toLowerCase() === value);
  if (exact.length === 1) return exact[0]!.id;
  const starts = people.filter((person) => person.name.toLowerCase().startsWith(value));
  if (starts.length === 1) return starts[0]!.id;
  const holds = people.filter((person) => person.name.toLowerCase().includes(value));
  return holds.length === 1 ? holds[0]!.id : null;
}

/**
 * Cells pasted from Excel onto the grid, starting at a line and a column: each pasted row fills the line it lands on
 * (and new lines below), each cell the next editable column. Text that is not a category, date or known person is left
 * out of that cell rather than guessed.
 */
export function applyPaste(rows: readonly DraftRow[], at: { row: number; field: DraftField }, text: string, people: readonly { id: number; name: string }[], newKey: () => string): DraftRow[] {
  const grid = parseTsv(text).filter((cells) => cells.some((cell) => cell.trim()));
  const first = PASTE_COLUMNS.indexOf(at.field);
  if (!grid.length || first < 0) return [...rows];
  const next = [...rows];
  grid.forEach((cells, offset) => {
    const index = at.row + offset;
    const row = { ...(next[index] ?? blankDraftRow(newKey())) };
    cells.forEach((raw, column) => {
      const field = PASTE_COLUMNS[first + column];
      const value = raw.trim();
      if (!field || !value) return;
      if (field === "category") { const category = categoryFromText(value); if (category) row.category = category; }
      else if (field === "assigneeId") { const id = personFromText(value, people); if (id !== null) row.assigneeId = id; }
      else if (field === "planStart" || field === "planEnd") { const date = parseLooseDate(value); if (date) row[field] = date; }
      else if (field === "planHours") { const hours = parseHours(value); if (hours !== null && !Number.isNaN(hours)) row.planHours = String(hours); }
      else row[field] = value;
    });
    next[index] = row;
  });
  return next;
}

/** Progress of a batch for its meter: finished issues (done, cancelled, rejected) out of all. */
export function batchProgress(counts: { itemCount: number; doneCount: number; droppedCount: number }) {
  const finished = counts.doneCount + counts.droppedCount;
  return { finished, total: counts.itemCount, percent: counts.itemCount ? Math.round((finished / counts.itemCount) * 100) : 0 };
}

/** The status the team's Issues Table shows for an issue. */
export const EXCEL_STATUS: Record<IssueState, string> = {
  Approval: "Waiting approval", Open: "Open", Doing: "In progress", Done: "100%", Cancelled: "Cancelled", Rejected: "Rejected",
};
