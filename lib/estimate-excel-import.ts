import type { WorkbookSheet } from "./import-spreadsheet";

export type EstimateImportLine = {
  kind: "cost" | "manhour" | "reference";
  categoryCode: string; module: string; itemCode: string; description: string;
  quantity: number; unit: string; unitCost: number; brand: string; model: string;
  supplierName: string; supplierId?: number; source: string; remark: string;
  department?: string; costType?: "Engineering" | "Installation";
};
export type EstimateImportPreview = {
  format: "tomas"; project: string; customer: string; sourceRevision: string;
  sourceDate: string; sourceTotal: number; total: number; lines: EstimateImportLine[];
  excluded: string[]; warnings: string[]; errors: string[];
};
const text = (s: WorkbookSheet, ref: string) => String(s.cells[ref]?.value ?? "").trim();
const numeric = (s: WorkbookSheet, ref: string) => {
  const c = s.cells[ref];
  if (!c || c.error || c.missingCache || String(c.value).trim() === "") return null;
  const n = Number(c.value); return Number.isFinite(n) ? n : null;
};
const reference = (formula?: string) => formula?.replace(/^=/, "").match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/i);
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const validName = (s: string) => Boolean(s && s !== "-" && s !== "0");

/** Summary defines scope; only expand detail totals actually referenced by active Summary rows. */
export function parseEstimateWorkbook(sheets: WorkbookSheet[], filename: string): EstimateImportPreview | null {
  const summary = sheets.find(s => /summary[ _]*cost/i.test(s.name));
  if (!summary) return null;
  const result: EstimateImportPreview = { format: "tomas", project: text(summary, "E2"), customer: text(summary, "E3"), sourceRevision: filename.match(/[_ -](R\d+)\.[^.]+$/i)?.[1] ?? "", sourceDate: "", sourceTotal: 0, total: 0, lines: [], excluded: [], warnings: [], errors: [] };
  const date = numeric(summary, "L3");
  if (date && date > 1 && date < 100000) result.sourceDate = new Date(Date.UTC(1899, 11, 30) + date * 86400000).toISOString().slice(0, 10);
  const totalCell = Object.entries(summary.cells).find(([ref, c]) => /^L\d+$/.test(ref) && /^=?SUM\(\$?L9:\$?L\d+\)$/i.test(c.formula ?? ""));
  if (!totalCell) { result.errors.push("ไม่พบยอดรวมต้นทุน SUM(L9:L...) ใน Summary"); return result; }
  const end = Number(totalCell[0].slice(1));
  result.sourceTotal = numeric(summary, totalCell[0]) ?? NaN;
  if (!Number.isFinite(result.sourceTotal)) result.errors.push("ยอดรวมไม่มีค่าที่คำนวณไว้ กรุณาเปิด Excel คำนวณและบันทึกไฟล์ใหม่");
  let group = "Cost";
  const add = (s: WorkbookSheet, r: number, multiplier: number, summaryRow: number, kind: EstimateImportLine["kind"], category: string, module: string, fixed = false) => {
    const q = fixed ? 1 : numeric(s, `K${r}`);
    const p = fixed ? numeric(s, `L${r}`) : numeric(s, `J${r}`);
    const amount = numeric(s, `L${r}`);
    if (kind !== "reference" && (q === null || p === null || amount === null || q <= 0 || p < 0 || Math.abs(q * p - amount) > .011)) {
      result.errors.push(`${s.name}!L${r}: จำนวน × ราคาไม่ตรงยอด หรือสูตรยังไม่ได้คำนวณ`); return;
    }
    const desc = text(s, `E${r}`) || text(s, `D${r}`);
    const model = validName(text(s, `D${r}`)) && s !== summary ? text(s, `D${r}`) : "";
    const supplier = text(s, `F${r}`);
    const unit = text(s, `M${r}`) || (kind === "manhour" ? "Day" : "Lot");
    result.lines.push({ kind, categoryCode: category, module, itemCode: model || `XL-${s.name.slice(0, 3)}-${r}`, description: desc,
      quantity: kind === "reference" ? multiplier : (q ?? 1) * multiplier, unit, unitCost: kind === "reference" ? 0 : p ?? 0,
      brand: validName(text(s, `G${r}`)) ? text(s, `G${r}`) : "", model, supplierName: validName(supplier) ? supplier : "",
      source: `${s.name}!${r}`, remark: [`Summary row ${summaryRow}`, text(s, `N${r}`), fixed ? "Fixed amount retained from source total" : "", !text(s, `M${r}`) ? "Unit not stated; Lot retains quoted quantity" : "", multiplier !== 1 && kind !== "reference" ? `Detail quantity multiplied by ${multiplier} per Summary` : ""].filter(Boolean).join("; "),
      ...(kind === "manhour" ? { department: /mechan/i.test(group) ? "Mechanical" : /software|program/i.test(group) ? "Software" : "Electrical", costType: /install|test|commis|wiring/i.test(desc) ? "Installation" as const : "Engineering" as const } : {}),
    });
  };
  for (let r = 9; r < end; r++) {
    if (validName(text(summary, `D${r}`))) group = text(summary, `D${r}`).replace(/\s+/g, " ");
    const desc = text(summary, `E${r}`); const qty = numeric(summary, `K${r}`); const amount = numeric(summary, `L${r}`);
    if (!validName(desc)) { if (amount) result.errors.push(`Summary row ${r}: มียอดแต่ไม่มีรายละเอียด`); continue; }
    if (!summary.cells[`J${r}`] && !summary.cells[`K${r}`] && !summary.cells[`L${r}`]) { result.excluded.push(`${desc} — แถวข้อความ ไม่มีจำนวนหรือราคา`); continue; }
    if (qty === 0) { result.excluded.push(`${desc} — จำนวน 0`); continue; }
    if (amount === null) { result.errors.push(`Summary row ${r}: สูตรไม่พร้อม กรุณาคำนวณและบันทึก Excel ใหม่`); continue; }
    if (amount === 0) {
      const eRef = reference(summary.cells[`E${r}`]?.formula);
      const detail = eRef && sheets.find(s => s.name === eRef[1]);
      const start = eRef ? Number(eRef[3]) : 0;
      const supplied = detail && Array.from({ length: 24 }, (_, n) => start + n).find(row => /customer\s*provid|customer\s*suppl|ลูกค้า.*จัดหา/i.test(text(detail, `N${row}`)) && validName(text(detail, `E${row}`)));
      if (detail && supplied && qty && qty > 0) add(detail, supplied, qty, r, "reference", "01", "Customer supplied");
      else result.excluded.push(`${desc} — ยอด 0 (ไม่นำเข้าต้นทุน)`);
      continue;
    }
    if (!qty || qty < 0) { result.errors.push(`Summary row ${r}: จำนวนไม่ถูกต้อง`); continue; }
    const labor = /lab[oa]?u?re?|software development/i.test(group) && !/transport|packing|safety|sefety/i.test(desc);
    const outsourced = labor && validName(text(summary, `F${r}`)) && !/TOMAS/i.test(text(summary, `F${r}`));
    const category = outsourced ? "07" : labor ? "06" : /transport|packing/i.test(desc) ? "08" : /mechan/i.test(group) ? "04" : /elect/i.test(group) ? "03" : /safety|sefety/i.test(desc) ? "10" : "01";
    const jRef = reference(summary.cells[`J${r}`]?.formula);
    const detail = jRef && sheets.find(s => s.name === jRef[1]);
    const detailTotal = detail && jRef ? detail.cells[`${jRef[2]}${jRef[3]}`] : undefined;
    const range = detailTotal?.formula?.replace(/^=/, "").match(/^\(*SUM\(\$?L(\d+):\$?L(\d+)\)\)*$/i);
    const before = result.lines.length;
    if (!labor && detail && range) {
      for (let d = Number(range[1]); d <= Number(range[2]); d++) {
        const total = numeric(detail, `L${d}`);
        if (detail.cells[`L${d}`]?.error || detail.cells[`L${d}`]?.missingCache) { result.errors.push(`${detail.name}!L${d}: สูตรไม่พร้อม`); continue; }
        if (total && total > 0) add(detail, d, qty, r, "cost", category, desc, !numeric(detail, `K${d}`) || !numeric(detail, `J${d}`));
        else if (total && total < 0) result.errors.push(`${detail.name}!L${d}: ต้นทุนติดลบ`);
      }
    } else add(summary, r, 1, r, labor && !outsourced ? "manhour" : "cost", category, labor ? group : desc);
    const subtotal = result.lines.slice(before).reduce((n, l) => n + l.quantity * l.unitCost, 0);
    if (Math.abs(subtotal - amount) > .011) result.errors.push(`Summary row ${r}: รายละเอียดรวม ${money(subtotal)} แต่ Summary ${amount}`);
  }
  result.total = money(result.lines.reduce((n, l) => n + l.quantity * l.unitCost, 0));
  if (Math.abs(result.total - result.sourceTotal) > .011) result.errors.push("ยอดนำเข้าไม่ตรงกับยอดรวมต้นทุนใน Summary");
  if (result.lines.length > 1000) result.errors.push("รองรับไม่เกิน 1,000 รายการต่อครั้ง");
  result.warnings.push("อัตราค่าแรงใช้ตาม Excel และรอทบทวนก่อนอนุมัติ ไม่เปลี่ยน Rate Master");
  for (const [ref, c] of Object.entries(summary.cells)) if (/^D\d+$/.test(ref) && Number(ref.slice(1)) >= end && typeof c.value === "string" && /remark|include|incoude/i.test(c.value)) result.warnings.push(c.value);
  if (Object.values(summary.cells).some(c => /profit|overhead/i.test(String(c.value)))) result.warnings.push("กำไรและ Overhead หลังยอดรวมต้นทุนไม่ถูกบวกเป็นต้นทุนซ้ำ");
  return result;
}
