import { strFromU8, unzipSync } from "fflate";

export type SpreadsheetRow = Record<string, string | number>;
export type WorkbookCell = { value: string | number; formula?: string; error?: boolean; missingCache?: boolean };
export type WorkbookSheet = { name: string; cells: Record<string, WorkbookCell> };

const columnIndex = (reference: string) => {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const uniqueHeaders = (values: (string | number)[]) => {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value).trim() || `Column ${index + 1}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
};

const rowsToRecords = (rows: (string | number)[][]): SpreadsheetRow[] => {
  const first = rows.findIndex((row) => row.some((value) => String(value).trim()));
  if (first < 0) return [];
  const headers = uniqueHeaders(rows[first]);
  return rows.slice(first + 1)
    .filter((row) => row.some((value) => String(value).trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
};

const parseDelimited = (text: string, delimiter: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim()); rows.push(row); row = []; value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rowsToRecords(rows);
};

const xml = (bytes: Uint8Array) => new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
const textOf = (node: Element | null) => node?.textContent ?? "";

/** Read cached values only. Never execute formulas, macros, links or workbook instructions. */
export async function readWorkbookSheets(file: File): Promise<WorkbookSheet[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 20 MB");
  let expanded = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => {
    expanded += entry.originalSize;
    if (expanded > 80 * 1024 * 1024) throw new Error("ข้อมูล Excel ที่คลายแล้วมีขนาดใหญ่เกินไป");
    return /^(xl\/workbook.xml|xl\/_rels\/workbook.xml.rels|xl\/sharedStrings.xml|xl\/worksheets\/[^/]+\.xml)$/.test(entry.name);
  }});
  if (!archive["xl/workbook.xml"] || !archive["xl/_rels/workbook.xml.rels"]) throw new Error("ไม่พบ Workbook ในไฟล์ Excel");
  const shared = archive["xl/sharedStrings.xml"] ? [...xml(archive["xl/sharedStrings.xml"]).querySelectorAll("si")].map(e => [...e.querySelectorAll("t")].map(t => t.textContent ?? "").join("")) : [];
  const rels = [...xml(archive["xl/_rels/workbook.xml.rels"]).querySelectorAll("Relationship")];
  return [...xml(archive["xl/workbook.xml"]).querySelectorAll("sheet")].map(s => {
    const rel = rels.find(r => r.getAttribute("Id") === s.getAttribute("r:id"));
    const target = rel?.getAttribute("Target")?.replace(/^\//, "") ?? "";
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    const cells: WorkbookSheet["cells"] = {};
    if (archive[path]) for (const c of xml(archive[path]).querySelectorAll("sheetData > row > c")) {
      const raw = c.querySelector("v")?.textContent ?? "";
      const type = c.getAttribute("t");
      const formula = c.querySelector("f")?.textContent ?? undefined;
      const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? [...c.querySelectorAll("is t")].map(t => t.textContent ?? "").join("") : raw !== "" && type !== "e" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      cells[c.getAttribute("r") ?? ""] = { value, formula, error: type === "e", missingCache: Boolean(formula && raw === "") };
    }
    return { name: s.getAttribute("name") ?? "", cells };
  });
}

const parseXlsx = (bytes: Uint8Array): SpreadsheetRow[] => {
  const archive = unzipSync(bytes);
  const workbookBytes = archive["xl/workbook.xml"];
  const relationshipBytes = archive["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !relationshipBytes) throw new Error("ไฟล์ Excel ไม่มี Workbook ที่อ่านได้");

  const workbook = xml(workbookBytes);
  const relationships = xml(relationshipBytes);
  const firstSheet = workbook.querySelector("sheet");
  const relationshipId = firstSheet?.getAttribute("r:id")
    ?? firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relationship = [...relationships.querySelectorAll("Relationship")].find((entry) => entry.getAttribute("Id") === relationshipId);
  const target = relationship?.getAttribute("Target")?.replace(/^\//, "");
  const sheetPath = target?.startsWith("xl/") ? target : `xl/${target ?? "worksheets/sheet1.xml"}`;
  const sheetBytes = archive[sheetPath];
  if (!sheetBytes) throw new Error("ไม่พบชีตแรกในไฟล์ Excel");

  const sharedBytes = archive["xl/sharedStrings.xml"];
  const shared = sharedBytes
    ? [...xml(sharedBytes).querySelectorAll("si")].map((entry) => [...entry.querySelectorAll("t")].map((part) => part.textContent ?? "").join(""))
    : [];
  const sheet = xml(sheetBytes);
  const rows = [...sheet.querySelectorAll("sheetData > row")].map((row) => {
    const values: (string | number)[] = [];
    [...row.querySelectorAll(":scope > c")].forEach((cell) => {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = textOf(cell.querySelector("v"));
      const value = type === "s" ? shared[Number(raw)] ?? ""
        : type === "inlineStr" ? [...cell.querySelectorAll("is t")].map((part) => part.textContent ?? "").join("")
          : type === "b" ? (raw === "1" ? "TRUE" : "FALSE")
            : raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      values[index] = value;
    });
    return values;
  });
  return rowsToRecords(rows);
};

export async function readSpreadsheet(file: File): Promise<SpreadsheetRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "tsv") {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    return parseDelimited(text, extension === "tsv" ? "\t" : ",");
  }
  if (extension !== "xlsx") throw new Error("รองรับไฟล์ .xlsx, .csv และ .tsv เท่านั้น");
  return parseXlsx(new Uint8Array(await file.arrayBuffer()));
}
