import { strFromU8, unzipSync } from "fflate";

export const SALES_MATERIAL_SOURCE_URL = "https://tomastech275-my.sharepoint.com/:x:/g/personal/wannasiwaporn_k_tomastc_com/IQD0rmC2ug28RpxCUE16_yYHAf4VrsdREIY7krB-PJJJkEM";
const RELATIONSHIP_ID = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type SalesMaterial = { row: number; title: string; language: string; format: string; filename: string; url: string | null };
export type SalesMaterialGroup = { id: string; title: string; materials: SalesMaterial[] };
export type SalesMaterialCatalog = { sourceUrl: string; sourceFile: string; groups: SalesMaterialGroup[]; updatedAt?: string; updatedBy?: string };

const xml = (bytes: Uint8Array) => new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
const column = (reference: string) => reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";

function companyUrl(target: string): string | null {
  if (!target) return null;
  const url = new URL(target, SALES_MATERIAL_SOURCE_URL);
  if (url.protocol !== "https:" || url.hostname !== "tomastech275-my.sharepoint.com") {
    throw new Error(`พบลิงก์ภายนอก SharePoint ของบริษัท: ${url.hostname}`);
  }
  return url.href;
}

export async function parseSalesMaterialWorkbook(file: File): Promise<SalesMaterialCatalog> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("กรุณาเลือกไฟล์รายการต้นฉบับ .xlsx");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const sheetBytes = archive["xl/worksheets/sheet1.xml"];
  const relationsBytes = archive["xl/worksheets/_rels/sheet1.xml.rels"];
  if (!sheetBytes || !relationsBytes) throw new Error("ไม่พบ Sheet1 หรือลิงก์เอกสารในไฟล์ Excel");
  const sharedBytes = archive["xl/sharedStrings.xml"];
  const shared = sharedBytes ? [...xml(sharedBytes).querySelectorAll("si")].map(node => [...node.querySelectorAll("t")].map(part => part.textContent ?? "").join("")) : [];
  const relations = new Map([...xml(relationsBytes).querySelectorAll("Relationship")].map(node => [node.getAttribute("Id") ?? "", node.getAttribute("Target") ?? ""]));
  const sheet = xml(sheetBytes);
  const links = new Map([...sheet.querySelectorAll("hyperlink")].map(node => {
    const id = node.getAttributeNS(RELATIONSHIP_ID, "id") ?? node.getAttribute("r:id") ?? "";
    return [node.getAttribute("ref") ?? "", relations.get(id) ?? ""];
  }));
  const groups: SalesMaterialGroup[] = [];
  for (const row of sheet.querySelectorAll("sheetData > row")) {
    const cells: Record<string, string> = {};
    for (const cell of row.querySelectorAll(":scope > c")) {
      const raw = cell.querySelector("v")?.textContent ?? "";
      cells[column(cell.getAttribute("r") ?? "A1")] = cell.getAttribute("t") === "s"
        ? (shared[Number(raw)] ?? "").trim()
        : (cell.getAttribute("t") === "inlineStr" ? cell.querySelector("is")?.textContent ?? "" : raw).trim();
    }
    const heading = /^(\d{4})\.(.+)$/.exec(cells.A ?? "");
    if (heading) {
      groups.push({ id: heading[1]!, title: heading[2]!.replaceAll("_", " ").trim(), materials: [] });
      continue;
    }
    if (!groups.length || !/^\d+$/.test(cells.A ?? "") || !cells.C) continue;
    const rowNumber = Number(row.getAttribute("r"));
    const target = links.get(`E${rowNumber}`) ?? links.get(`C${rowNumber}`) ?? "";
    groups.at(-1)!.materials.push({
      row: rowNumber,
      title: cells.C,
      language: ({ SPANISH: "ES", SP: "ES" } as Record<string, string>)[cells.B ?? ""] ?? cells.B ?? "—",
      format: cells.D || (cells.C.toLowerCase().endsWith(".mp4") ? "VIDEO" : "—"),
      filename: cells.E || cells.C,
      url: companyUrl(target),
    });
  }
  const materials = groups.flatMap(group => group.materials);
  if (!groups.length || !materials.length) throw new Error("ไม่พบรายการสื่อขายในไฟล์ที่เลือก");
  if (new Set(materials.map(item => item.row)).size !== materials.length) throw new Error("พบเลขแถวเอกสารซ้ำในไฟล์ต้นฉบับ");
  return { sourceUrl: SALES_MATERIAL_SOURCE_URL, sourceFile: file.name, groups };
}

export function catalogChanges(previous: SalesMaterialCatalog, next: SalesMaterialCatalog) {
  const key = (item: SalesMaterial) => `${item.row}|${item.url ?? ""}|${item.title}|${item.language}|${item.format}|${item.filename}`;
  const before = new Set(previous.groups.flatMap(group => group.materials).map(key));
  const after = new Set(next.groups.flatMap(group => group.materials).map(key));
  return {
    added: [...after].filter(value => !before.has(value)).length,
    removed: [...before].filter(value => !after.has(value)).length,
    total: after.size,
  };
}
