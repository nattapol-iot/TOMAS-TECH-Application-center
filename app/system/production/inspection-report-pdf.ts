import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import { LOGO_BASE64, LOGO_EXT } from "./report-pptx-template";
import { downloadReportEvidence } from "../api-client";
import { W as W_EMU, H as H_EMU } from "./report-pptx";
import type { ReportRecord } from "./report-types";
import type { InspectionBody, InspectionUnit } from "./inspection-body-types";

// EMU -> PDF points, same coordinate system already proven correct in the
// PPTX exporter (inspection-report-pptx.ts / report-pptx.ts), so both
// exports describe the same document from the same numbers.
const EMU_PER_PT = 12700;
function pt(emu: number): number { return emu / EMU_PER_PT; }
const PAGE_W = pt(W_EMU); // 540pt
const PAGE_H = pt(H_EMU); // 780pt

const BLACK = rgb(0, 0, 0);
const RED = rgb(1, 0, 0);
const NAVY = rgb(0x1b / 255, 0x3a / 255, 0x6b / 255);
const BLUE_LABEL = rgb(0x2c / 255, 0x11 / 255, 0xf7 / 255);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.8, 0.8, 0.8);
const GRAY_TEXT = rgb(0.53, 0.53, 0.53);

type Align = "l" | "r" | "ctr";

function chk(v: boolean): string { return v ? "X" : ""; }

class DocBuilder {
  doc!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  logo?: { image: Awaited<ReturnType<PDFDocument["embedPng"]>>; width: number; height: number };
  pages: PDFPage[] = [];

  async init() {
    this.doc = await PDFDocument.create();
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0));
    const image = LOGO_EXT === "png" ? await this.doc.embedPng(logoBytes) : await this.doc.embedJpg(logoBytes);
    this.logo = { image, width: image.width, height: image.height };
  }

  addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(page);
    return page;
  }

  // topEmu/cyEmu describe a top-down box; convert to pdf-lib's bottom-up y.
  boxBottomY(topEmu: number, cyEmu: number): number {
    return PAGE_H - pt(topEmu) - pt(cyEmu);
  }

  text(page: PDFPage, str: string, xEmu: number, yEmu: number, cxEmu: number, opts: { size: number; bold?: boolean; color?: RGB; align?: Align } = { size: 10 }) {
    if (!str) return;
    const font = opts.bold ? this.bold : this.regular;
    const size = opts.size;
    const width = font.widthOfTextAtSize(str, size);
    const boxW = pt(cxEmu);
    let x = pt(xEmu);
    if (opts.align === "ctr") x += (boxW - width) / 2;
    else if (opts.align === "r") x += boxW - width;
    const y = PAGE_H - pt(yEmu) - size;
    page.drawText(str, { x, y, size, font, color: opts.color ?? BLACK });
  }

  rect(page: PDFPage, xEmu: number, topEmu: number, cxEmu: number, cyEmu: number, opts: { border?: RGB; fill?: RGB; lineWidth?: number } = {}) {
    page.drawRectangle({
      x: pt(xEmu), y: this.boxBottomY(topEmu, cyEmu), width: pt(cxEmu), height: pt(cyEmu),
      borderColor: opts.border, borderWidth: opts.border ? (opts.lineWidth ?? 1) : undefined,
      color: opts.fill,
    });
  }

  async image(page: PDFPage, bytes: Uint8Array, mime: string, xEmu: number, topEmu: number, cxEmu: number, cyEmu: number) {
    const img = mime === "image/png" ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    page.drawImage(img, { x: pt(xEmu), y: this.boxBottomY(topEmu, cyEmu), width: pt(cxEmu), height: pt(cyEmu) });
  }
}

// ── Cover page — exact same layout/coordinates as coverSlide() in inspection-report-pptx.ts
function drawCover(b: DocBuilder, report: ReportRecord, unit: InspectionUnit) {
  const page = b.addPage();
  b.rect(page, 406400, 479503, 1555750, 283687, { border: RED, lineWidth: 1 });
  b.text(page, `Rev. ${report.revision} · ${report.reportDate}`, 406400, 479503 + 90000, 1555750, { size: 12, color: RED, align: "ctr" });
  b.rect(page, 5262563, 479502, 1123950, 283687, { border: RED, lineWidth: 1 });
  b.text(page, "Confidential", 5262563, 479502 + 90000, 1123950, { size: 12, color: RED, align: "ctr" });

  b.rect(page, 406400, 5819385, 5709200, 28575, { fill: BLACK });
  b.rect(page, 6179800, 3687445, 271800, 2531668, { fill: BLACK });

  let y = 4624787;
  b.text(page, report.title || "Inspection Report", 724584, y, 5301516, { size: 13.5, align: "r" }); y += 220000;
  b.text(page, `${unit.name} Inspection Report`, 724584, y, 5301516, { size: 13.5, align: "r" }); y += 350000;
  b.text(page, `Made for : ${report.customer}`, 724584, y, 5301516, { size: 12, align: "r" }); y += 190000;
  b.text(page, "By : Tomas Tech Co., Ltd.", 724584, y, 5301516, { size: 12, align: "r" });

  if (b.logo) {
    const cx = 3022600, cy = 720006;
    page.drawImage(b.logo.image, { x: pt(1917699), y: b.boxBottomY(7636804, cy), width: pt(cx), height: pt(cy) });
  }
  b.text(page, "No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd,", 952199, 8356810, 4953600, { size: 12 });
  b.text(page, "Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.", 952199, 8356810 + 190000, 4953600, { size: 12 });
  b.text(page, "Tel : +66-98-271-9741     E-mail : info@tomastc.com", 952199, 8356810 + 380000, 4953600, { size: 12 });
  b.text(page, String(b.pages.length), 6087024, 9181401, 498561, { size: 8, align: "r" });
}

function pageHeader(b: DocBuilder, page: PDFPage, title: string) {
  b.text(page, title, 406400, 479503, 6117063, { size: 12, align: "ctr" });
  b.text(page, String(b.pages.length), 6093618, 9181401, 435769, { size: 8, align: "r" });
}

function drawInfoPage(b: DocBuilder, report: ReportRecord) {
  const page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  b.rect(page, 406399, 742950, 6117062, 8591553, { border: BLACK, lineWidth: 0.5 });
  const lines = [
    `Customer : ${report.customer}`,
    `Project / Reference : ${report.sourceReference}`,
    `Project / Site : ${report.sourceTitle}`,
    `Report No. : ${report.number} · Rev.${report.revision}`,
    `Report Date : ${report.reportDate}`,
    `Status : ${report.status}`,
  ];
  lines.forEach((line, i) => b.text(page, line, 406398, 752476 + i * 263447, 6117061, { size: 12, color: BLUE_LABEL }));
}

function drawUnitInfoPage(b: DocBuilder, unit: InspectionUnit) {
  const page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  b.rect(page, 406399, 742950, 6117062, 8591553, { border: BLACK, lineWidth: 0.5 });
  const lines = [`Unit : ${unit.name}`, `Identifier : ${unit.identifier}`, `Location : ${unit.location}`];
  for (const attr of unit.attributes) if (attr.label.trim()) lines.push(`${attr.label} : ${attr.value}`);
  lines.forEach((line, i) => b.text(page, line, 406398, 752476 + i * 263447, 6117061, { size: 12, color: BLUE_LABEL }));
}

// ── Generic grid table drawer (borders + header row + data rows) ──
function drawTable(b: DocBuilder, page: PDFPage, xEmu: number, topEmu: number, colWidths: number[], rows: { cells: string[]; header?: boolean }[], rowHeightEmu = 228600) {
  const totalW = colWidths.reduce((a, c) => a + c, 0);
  let y = topEmu;
  for (const row of rows) {
    let x = xEmu;
    b.rect(page, xEmu, y, totalW, rowHeightEmu, { border: BLACK, lineWidth: 0.5, fill: row.header ? NAVY : undefined });
    for (let c = 0; c < row.cells.length; c++) {
      const w = colWidths[c] ?? colWidths[colWidths.length - 1];
      b.rect(page, x, y, w, rowHeightEmu, { border: BLACK, lineWidth: 0.5 });
      b.text(page, row.cells[c], x + 15000, y + 50000, w - 30000, { size: 7, bold: row.header, color: row.header ? WHITE : BLACK, align: "ctr" });
      x += w;
    }
    y += rowHeightEmu;
  }
  return y;
}

// Fully dynamic: renders however many measurement sections the department
// defined, each with its own free-form parameter/unit rows. No hardcoded
// electrical fields -- paginates automatically if content overflows a page.
function drawMeasurementPages(b: DocBuilder, unit: InspectionUnit) {
  let page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  let y = 742950;
  const colW = [1600000, 700000, 850000, 850000, 850000, 700000, 555525];
  for (const sec of unit.measurementSections) {
    if (y > H_EMU - 1800000) {
      page = b.addPage();
      pageHeader(b, page, "INSPECTION REPORT");
      y = 742950;
    }
    b.text(page, sec.title, 406400, y, 3000000, { size: 10, bold: true }); y += 220000;
    y = drawTable(b, page, 414338, y, colW, [
      { cells: ["Parameter", "Unit", "Spec", "Actual", "Judgement", "Rank", "Remarks"], header: true },
      ...sec.rows.map(row => ({ cells: [row.parameter, row.unit, row.specValue, row.actualValue, row.judgement, row.rank, row.remarks] })),
    ]);
    y += 100000;
  }
}

async function drawPhotoPages(b: DocBuilder, reportId: number, headerTitle: string, entries: { name: string; photoIds: number[] }[]) {
  const flat: { label: string; photoId: number | null }[] = [];
  for (const e of entries) {
    if (e.photoIds.length === 0) { flat.push({ label: e.name, photoId: null }); continue; }
    for (const id of e.photoIds) flat.push({ label: e.name, photoId: id });
  }
  const COLS = 3, GAP = 72000, LABEL_H = 216000, START_Y = 742950, TOTAL_W = 6117062, TOTAL_H = 8591553;
  for (let i = 0; i < flat.length; i += 9) {
    const batch = flat.slice(i, i + 9);
    const page = b.addPage();
    pageHeader(b, page, headerTitle);
    b.rect(page, 406399, START_Y, TOTAL_W, TOTAL_H, { border: BLACK, lineWidth: 0.5 });
    const rows = Math.ceil(batch.length / COLS);
    const pw = Math.floor((TOTAL_W - GAP * (COLS - 1)) / COLS);
    const ph = Math.floor((TOTAL_H - GAP * (rows - 1) - LABEL_H * rows) / rows);
    for (let idx = 0; idx < batch.length; idx++) {
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const px = 406400 + col * (pw + GAP), py = START_Y + row * (ph + LABEL_H + GAP);
      b.text(page, batch[idx].label, px, py, pw, { size: 8 });
      if (batch[idx].photoId) {
        try {
          const blob = await downloadReportEvidence(reportId, batch[idx].photoId!);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await b.image(page, bytes, blob.type || "image/jpeg", px, py + LABEL_H, pw, ph);
        } catch { b.rect(page, px, py + LABEL_H, pw, ph, { border: GRAY, lineWidth: 0.5 }); b.text(page, "[No Photo]", px, py + LABEL_H + ph / 2, pw, { size: 9, color: GRAY_TEXT, align: "ctr" }); }
      } else {
        b.rect(page, px, py + LABEL_H, pw, ph, { border: GRAY, lineWidth: 0.5 });
        b.text(page, "[No Photo]", px, py + LABEL_H + ph / 2, pw, { size: 9, color: GRAY_TEXT, align: "ctr" });
      }
    }
  }
}

function drawOpTablePage(b: DocBuilder, unit: InspectionUnit) {
  const page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  const colW = [2200000, 468000, 378000, 360000, 360000, 360000, 360000, 1620000];
  const rows = [
    { cells: ["Test Name", "OK", "NG", "A", "B", "C", "D", "Remarks"], header: true },
    ...unit.operationTests.map(t => ({ cells: [t.name, chk(t.status === "OK"), chk(t.status === "NG"), chk(t.rank === "A"), chk(t.rank === "B"), chk(t.rank === "C"), chk(t.rank === "D"), t.remarks] })),
  ];
  drawTable(b, page, 414338, 762000, colW, rows);
}

function drawChecklistTablePage(b: DocBuilder, unit: InspectionUnit) {
  const page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  const colW = [1600000, 432000, 432000, 432000, 360000, 342000, 342000, 342000, 342000, 1500000];
  const rows = [
    { cells: ["Component", "Normal", "Abnormal", "OK", "NG", "A", "B", "C", "D", "Remarks"], header: true },
    ...unit.checklistItems.map(item => ({ cells: [item.name, chk(item.condition === "Normal"), chk(item.condition === "Abnormal"), chk(item.judgement === "OK"), chk(item.judgement === "NG"), chk(item.rank === "A"), chk(item.rank === "B"), chk(item.rank === "C"), chk(item.rank === "D"), item.remarks] })),
  ];
  drawTable(b, page, 414338, 762000, colW, rows);
}

function drawSummaryPage(b: DocBuilder, unit: InspectionUnit) {
  const page = b.addPage();
  pageHeader(b, page, "INSPECTION REPORT");
  const items = unit.summaryItems.filter(s => s.trim());
  const rows = [{ cells: ["SUMMARY"], header: true }, ...(items.length ? items : [""]).map((s, i) => ({ cells: [items.length ? `${i + 1}. ${s}` : ""] }))];
  drawTable(b, page, 414338, 762000, [6105525], rows);
}

function drawSignOffPage(b: DocBuilder, report: ReportRecord) {
  const page = b.addPage();
  const ack = report.customerAcknowledgment;
  const sigFor = (stage: string) => report.signatures.find(s => s.stage === stage)?.occurredAt ?? "";
  b.rect(page, 406400, 479503, 6117063, 345687, { border: BLACK, lineWidth: 0.5 });
  b.text(page, "Sign Off", 406400, 479503 + 60000, 6117063, { size: 14, bold: true, align: "ctr" });
  b.text(page, "With all these documents, this is part of the report and it is all the information of the project.", 406400, 1025912, 6117062, { size: 11 });
  b.text(page, `Customer : ${report.customer}`, 406400, 1230000, 6117062, { size: 11, bold: true });
  b.text(page, "Sign :  ___________________________", 406400, 1420000, 6117062, { size: 11 });
  b.text(page, `Name :  ${ack?.name ?? ""}`, 406399, 2803528, 3946525, { size: 11, color: BLUE_LABEL });
  b.text(page, `Title :  ${ack?.title ?? ""}`, 406400, 3372967, 3139688, { size: 11, color: BLUE_LABEL });
  b.text(page, `Date : ${ack?.date ?? ""}`, 406400, 3948405, 1651000, { size: 11, color: BLUE_LABEL });

  b.text(page, "TOMAS TECH CO., LTD.", 370469, 4632238, 3139688, { size: 11, bold: true });
  b.text(page, "Prepared by", 370469, 4820000, 3139688, { size: 11, bold: true });
  b.text(page, "Sign :  ___________________________", 370469, 5010000, 3139688, { size: 11 });
  b.text(page, `Name : ${report.preparedBy?.name ?? ""}`, 370469, 5786758, 3139688, { size: 11, color: BLUE_LABEL });
  b.text(page, `Date : ${sigFor("PREPARE")}`, 370469, 6356197, 3139688, { size: 11, color: BLUE_LABEL });

  b.text(page, "Approved", 3383774, 4803439, 3139688, { size: 11, bold: true });
  b.text(page, "Sign :  ___________________________", 3383774, 4993439, 3139688, { size: 11 });
  b.text(page, `Name : ${report.approver?.name ?? ""}`, 3383774, 5786758, 3139688, { size: 11, color: BLUE_LABEL });
  b.text(page, `Date : ${sigFor("APPROVE")}`, 3383774, 6356197, 3139688, { size: 11, color: BLUE_LABEL });

  b.text(page, "## END OF BLUEPRINT ##", 471487, 9050592, 6117062, { size: 11, bold: true, align: "ctr" });
  b.text(page, String(b.pages.length), 6210299, 9181401, 328613, { size: 8, align: "r" });
}

export async function generateInspectionPdf(report: ReportRecord, body: InspectionBody): Promise<Uint8Array> {
  const b = new DocBuilder();
  await b.init();

  const firstUnit = body.units[0];
  drawCover(b, report, firstUnit ?? ({ name: "" } as InspectionUnit));
  drawInfoPage(b, report);

  for (const unit of body.units) {
    drawUnitInfoPage(b, unit);
    if (unit.measurementSections.length) drawMeasurementPages(b, unit);

    const opEntries = unit.operationTests.map(t => ({ name: t.name, photoIds: t.photoIds ?? [] }));
    if (opEntries.length) await drawPhotoPages(b, report.id, "OPERATION TEST PHOTOS", opEntries);
    if (unit.operationTests.length) drawOpTablePage(b, unit);

    const checklistEntries = unit.checklistItems.map(c => ({ name: c.name, photoIds: c.photoIds ?? [] }));
    if (checklistEntries.length) await drawPhotoPages(b, report.id, "CHECKLIST PHOTOS", checklistEntries);
    if (unit.checklistItems.length) drawChecklistTablePage(b, unit);

    drawSummaryPage(b, unit);
  }

  drawSignOffPage(b, report);

  return b.doc.save();
}
