import { zipSync } from "fflate";
import {
  THEME_XML,
  SLIDE_MASTER_XML,
  SLIDE_LAYOUTS,
  LOGO_BASE64,
  LOGO_EXT,
} from "./report-pptx-template";
import { downloadReportEvidence } from "../api-client";
import {
  W, H, MARGIN, DARK_BLUE, BLACK, BLUE_LABEL,
  cm, pt, txPara, textBox, borderRect, imgShape, photoPlaceholder,
  makeSlide, pageHeaderShapes, buildTable,
  OLE_X, OLE_Y, OLE_W, CONTENT_START_Y, CONTENT_W, CONTENT_H,
  type CellDef, type RowDef,
} from "./report-pptx";
import type { ReportRecord } from "./report-types";
import type { InspectionBody, InspectionUnit, OperationTest, ChecklistItem } from "./inspection-body-types";

function chk(v: boolean): string { return v ? "✓" : ""; }

// ── Slide: Cover (once) — exact TOMAS TECH branded layout ──────
function coverSlide(report: ReportRecord, unit: InspectionUnit, pageNum: number, logoRId: string): { xml: string; rels: string } {
  const RED = "FF0000";
  const shapes: string[] = [
    textBox(406400, 479503, 1555750, 283687,
      txPara(`Rev. ${report.revision} · ${report.reportDate}`, { sz: 12, color: RED, align: "ctr" }), RED),
    textBox(5262563, 479502, 1123950, 283687,
      txPara("Confidential", { sz: 12, color: RED, align: "ctr" }), RED),
    textBox(406400, 5819385, 5709200, pt(2.25), txPara("", {}), undefined, BLACK),
    textBox(6179800, 3687445, 271800, 2531668, txPara("", {}), undefined, BLACK),
    textBox(724584, 4624787, 5301516, 1200329,
      txPara(report.title || "Inspection Report", { sz: 13.5, color: BLACK, align: "r" }) +
      txPara(`${unit.name} Inspection Report`, { sz: 13.5, color: BLACK, align: "r" }) +
      txPara("", { sz: 12, color: BLACK, align: "r" }) +
      txPara(`Made for : ${report.customer}`, { sz: 12, color: BLACK, align: "r" }) +
      txPara("By : Tomas Tech Co., Ltd.", { sz: 12, color: BLACK, align: "r" })),
    imgShape(1917699, 7636804, 3022600, 720006, logoRId),
    textBox(952199, 8356810, 4953600, 646331,
      txPara("No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, ", { sz: 12, color: BLACK }) +
      txPara("Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.", { sz: 12, color: BLACK }) +
      txPara("Tel : +66-98-271-9741     E-mail : info@tomastc.com", { sz: 12, color: BLACK })),
    textBox(6087024, 9181401, 498561, 527403, txPara(String(pageNum), { sz: 8, color: BLACK, align: "r" })),
  ];
  const extraRels = `\n<Relationship Id="${logoRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${LOGO_EXT}"/>`;
  return makeSlide(shapes, extraRels);
}

// ── Slide: Project info (once) ──────────────────────────────────
function infoSlide(report: ReportRecord, pageNum: number): { xml: string; rels: string } {
  const b12 = (t: string) => txPara(t, { sz: 12, color: BLUE_LABEL });
  const shapes: string[] = [
    ...pageHeaderShapes("INSPECTION REPORT", pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
    textBox(406398, 752476, 6117061, 263447, b12(`Customer : ${report.customer}`)),
    textBox(406389, 1015922, 6117061, 263447, b12(`Project / Reference : ${report.sourceReference}`)),
    textBox(406386, 1279368, 6117061, 263447, b12(`Project / Site : ${report.sourceTitle}`)),
    textBox(406386, 1542814, 6117061, 263447, b12(`Report No. : ${report.number} · Rev.${report.revision}`)),
    textBox(406386, 1806260, 6117061, 263447, b12(`Report Date : ${report.reportDate}`)),
    textBox(406386, 2069706, 6117061, 263447, b12(`Status : ${report.status}`)),
  ];
  return makeSlide(shapes);
}

// ── Slide: Unit info ─────────────────────────────────────────────
// Fully generic: identifier/location + any free-form attributes the
// department defined (no hardcoded electrical fields).
function unitInfoSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  const b12 = (t: string) => txPara(t, { sz: 12, color: BLUE_LABEL });
  const shapes: string[] = [
    ...pageHeaderShapes("INSPECTION REPORT", pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
    textBox(406398, 752476, 6117061, 263447, b12(`Unit : ${unit.name}`)),
    textBox(406389, 1015922, 6117061, 263447, b12(`Identifier : ${unit.identifier}`)),
    textBox(406386, 1279368, 6117061, 263447, b12(`Location : ${unit.location}`)),
  ];
  unit.attributes.filter(a => a.label.trim()).forEach((attr, i) => {
    shapes.push(textBox(406386, 1806260 + i * 263447, 6117061, 263447, b12(`${attr.label} : ${attr.value}`)));
  });
  return makeSlide(shapes);
}

// ── Slide(s): Measurements — fully dynamic sections, any domain ──
// Replaces the old fixed Utility/PLC/Transformer/SMPS tables with
// however many named measurement sections the department defined.
function measurementSlides(unit: InspectionUnit, pageAt: () => number): Array<{ xml: string; rels: string }> {
  const slides: Array<{ xml: string; rels: string }> = [];
  let shapes: string[] = [...pageHeaderShapes("INSPECTION REPORT", pageAt())];
  let y = CONTENT_START_Y;
  const colW = [1600000, 700000, 850000, 850000, 850000, 700000, 555525];

  for (const sec of unit.measurementSections) {
    const rows: RowDef[] = [
      { cells: [{ text: sec.title, bold: true, bg: DARK_BLUE, span: 7 }], h: cm(0.6) },
      { cells: [{ text: "Parameter", bold: true }, { text: "Unit", bold: true, align: "ctr" }, { text: "Spec", bold: true, align: "ctr" }, { text: "Actual", bold: true, align: "ctr" }, { text: "Judgement", bold: true, align: "ctr" }, { text: "Rank", bold: true, align: "ctr" }, { text: "Remarks", bold: true }], h: cm(0.6) },
      ...sec.rows.map(row => ({
        cells: [
          { text: row.parameter }, { text: row.unit, align: "ctr" }, { text: row.specValue, align: "ctr" }, { text: row.actualValue, align: "ctr" },
          { text: row.judgement, align: "ctr" }, { text: row.rank, align: "ctr" }, { text: row.remarks },
        ] as CellDef[], h: cm(0.6),
      })),
    ];
    const sectionH = cm(0.6) * (rows.length) + cm(0.3);
    if (y + sectionH > H - cm(3)) {
      slides.push(makeSlide(shapes));
      shapes = [...pageHeaderShapes("INSPECTION REPORT", pageAt())];
      y = CONTENT_START_Y;
    }
    shapes.push(buildTable(OLE_X, y, colW, rows));
    y += sectionH;
  }
  slides.push(makeSlide(shapes));
  return slides;
}

// ── Photo grid slide (3-column, up to 9 photo entries) ───────────
// Reused for both operation-test photos and checklist-item photos —
// flattening every item+photo pair into one list naturally supports
// any number of photos per item, spread across as many slides as needed.
function photoGridSlide(
  pageNum: number,
  headerTitle: string,
  batch: { label: string; rId: string | null; mediaName: string | null }[],
): { xml: string; rels: string } {
  const COLS = 3;
  const GAP_H = cm(0.2);
  const GAP_V = cm(0.3);
  const LABEL_H = cm(0.6);
  const PW = Math.floor((CONTENT_W - GAP_H * (COLS - 1)) / COLS);
  const ROWS = Math.ceil(Math.min(batch.length, 9) / COLS);
  const PH = Math.floor((CONTENT_H - GAP_V * (ROWS - 1) - LABEL_H * ROWS) / ROWS);

  const shapes: string[] = [
    ...pageHeaderShapes(headerTitle, pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
  ];
  let extraRels = "";
  for (let i = 0; i < Math.min(batch.length, 9); i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const px = MARGIN + col * (PW + GAP_H);
    const py = CONTENT_START_Y + row * (PH + LABEL_H + GAP_V);
    const item = batch[i];
    shapes.push(textBox(px, py, PW, LABEL_H, txPara(item.label, { sz: 8, color: BLACK })));
    if (item.rId) {
      shapes.push(imgShape(px, py + LABEL_H, PW, PH, item.rId));
      extraRels += `\n<Relationship Id="${item.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${item.mediaName}"/>`;
    } else {
      shapes.push(...photoPlaceholder(px, py + LABEL_H, PW, PH, ""));
    }
  }
  return makeSlide(shapes, extraRels);
}

// ── Operation test table slide ────────────────────────────────
function opTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  const colW = [2700000, 468000, 378000, 360000, 360000, 360000, 360000, 1119525];
  const rows: RowDef[] = [
    { cells: [
      { text: "Test Name", bold: true, bg: DARK_BLUE },
      { text: "Judgement", bold: true, bg: DARK_BLUE, span: 2, align: "ctr" },
      { text: "Rank", bold: true, bg: DARK_BLUE, span: 4, align: "ctr" },
      { text: "Remarks", bold: true, bg: DARK_BLUE },
    ], h: cm(0.7) },
    { cells: [
      { text: "", bg: "D6E4F7" }, { text: "OK", bold: true, bg: "D6E4F7", align: "ctr" }, { text: "NG", bold: true, bg: "D6E4F7", align: "ctr" },
      { text: "A", bold: true, bg: "D6E4F7", align: "ctr" }, { text: "B", bold: true, bg: "D6E4F7", align: "ctr" }, { text: "C", bold: true, bg: "D6E4F7", align: "ctr" }, { text: "D", bold: true, bg: "D6E4F7", align: "ctr" },
      { text: "", bg: "D6E4F7" },
    ], h: cm(0.65) },
    ...unit.operationTests.map(t => ({
      cells: [
        { text: t.name }, { text: chk(t.status === "OK"), align: "ctr" }, { text: chk(t.status === "NG"), align: "ctr" },
        { text: chk(t.rank === "A"), align: "ctr" }, { text: chk(t.rank === "B"), align: "ctr" }, { text: chk(t.rank === "C"), align: "ctr" }, { text: chk(t.rank === "D"), align: "ctr" },
        { text: t.remarks },
      ] as CellDef[], h: cm(0.85),
    })),
  ];
  return makeSlide([...pageHeaderShapes("INSPECTION REPORT", pageNum), buildTable(OLE_X, OLE_Y, colW, rows)]);
}

// ── Checklist table slide ────────────────────────────────────
function checklistTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  const colW = [1908000, 432000, 432000, 432000, 360000, 342000, 342000, 342000, 342000, 1173525];
  const hdr: CellDef[] = [
    { text: "Component", bold: true, bg: DARK_BLUE }, { text: "Normal", bold: true, bg: DARK_BLUE, align: "ctr" }, { text: "Abnormal", bold: true, bg: DARK_BLUE, align: "ctr" },
    { text: "OK", bold: true, bg: DARK_BLUE, align: "ctr" }, { text: "NG", bold: true, bg: DARK_BLUE, align: "ctr" },
    { text: "A", bold: true, bg: DARK_BLUE, align: "ctr" }, { text: "B", bold: true, bg: DARK_BLUE, align: "ctr" }, { text: "C", bold: true, bg: DARK_BLUE, align: "ctr" }, { text: "D", bold: true, bg: DARK_BLUE, align: "ctr" },
    { text: "Remarks", bold: true, bg: DARK_BLUE },
  ];
  const rows: RowDef[] = [
    { cells: hdr, h: cm(0.7) },
    ...unit.checklistItems.map(item => ({
      cells: [
        { text: item.name }, { text: chk(item.condition === "Normal"), align: "ctr" }, { text: chk(item.condition === "Abnormal"), align: "ctr" },
        { text: chk(item.judgement === "OK"), align: "ctr" }, { text: chk(item.judgement === "NG"), align: "ctr" },
        { text: chk(item.rank === "A"), align: "ctr" }, { text: chk(item.rank === "B"), align: "ctr" }, { text: chk(item.rank === "C"), align: "ctr" }, { text: chk(item.rank === "D"), align: "ctr" },
        { text: item.remarks },
      ] as CellDef[], h: cm(0.85),
    })),
  ];
  return makeSlide([...pageHeaderShapes("INSPECTION REPORT", pageNum), buildTable(OLE_X, OLE_Y, colW, rows)]);
}

// ── Summary slide ────────────────────────────────────────────
function summarySlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  const items = unit.summaryItems.filter(s => s.trim());
  const rows: RowDef[] = [
    { cells: [{ text: "SUMMARY", bold: true, bg: DARK_BLUE }], h: cm(0.7) },
    ...(items.length > 0 ? items : [""]).map((s, i) => ({
      cells: [{ text: items.length > 0 ? `${i + 1}. ${s}` : "" } as CellDef], h: cm(0.65),
    })),
  ];
  return makeSlide([...pageHeaderShapes("INSPECTION REPORT", pageNum), buildTable(OLE_X, OLE_Y, [OLE_W], rows)]);
}

// ── Sign-off slide (once) ────────────────────────────────────
function signOffSlide(report: ReportRecord, pageNum: number): { xml: string; rels: string } {
  const ack = report.customerAcknowledgment;
  const sigFor = (stage: string) => report.signatures.find(s => s.stage === stage)?.occurredAt ?? "";
  const shapes: string[] = [
    textBox(406400, 479503, 6117063, 345687, txPara("Sign Off", { sz: 14, bold: true, color: BLACK, align: "ctr" }), BLACK, undefined, "ctr"),
    textBox(406400, 1025912, 6117062, 1785104,
      txPara("With all these documents, this is part of the report and it is all the information of the project.", { sz: 11, color: BLACK }) +
      txPara("", { sz: 11, color: BLACK }) +
      txPara(`Customer : ${report.customer}`, { sz: 11, bold: true, color: BLACK }) +
      txPara("Sign :  ___________________________", { sz: 11, color: BLACK })),
    textBox(406399, 2803528, 3946525, 261610, txPara(`Name :  ${ack?.name ?? ""}`, { sz: 11, color: BLUE_LABEL })),
    textBox(406400, 3372967, 3139688, 261610, txPara(`Title :  ${ack?.title ?? ""}`, { sz: 11, color: BLUE_LABEL })),
    textBox(406400, 3948405, 1651000, 261610, txPara(`Date : ${ack?.date ?? ""}`, { sz: 11, color: BLUE_LABEL })),
    textBox(370469, 4632238, 3139688, 1107996,
      txPara("TOMAS TECH CO., LTD.", { sz: 11, bold: true, color: BLACK }) +
      txPara("Prepared by", { sz: 11, bold: true, color: BLACK }) +
      txPara("Sign :  ___________________________", { sz: 11, color: BLACK })),
    textBox(370469, 5786758, 3139688, 261610, txPara(`Name : ${report.preparedBy?.name ?? ""}`, { sz: 11, color: BLUE_LABEL })),
    textBox(370469, 6356197, 3139688, 261610, txPara(`Date : ${sigFor("PREPARE")}`, { sz: 11, color: BLUE_LABEL })),
    textBox(3383774, 4803439, 3139688, 938719,
      txPara("Approved", { sz: 11, bold: true, color: BLACK }) +
      txPara("Sign :  ___________________________", { sz: 11, color: BLACK })),
    textBox(3383774, 5786758, 3139688, 261610, txPara(`Name : ${report.approver?.name ?? ""}`, { sz: 11, color: BLUE_LABEL })),
    textBox(3383774, 6356197, 3139688, 261610, txPara(`Date : ${sigFor("APPROVE")}`, { sz: 11, color: BLUE_LABEL })),
    textBox(471487, 9050592, 6117062, 261610, txPara("## END OF BLUEPRINT ##", { sz: 11, bold: true, color: BLACK, align: "ctr" })),
    textBox(6210299, 9181401, 328613, 527403, txPara(String(pageNum), { sz: 8, color: BLACK, align: "r" })),
  ];
  return makeSlide(shapes);
}

// ══════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ══════════════════════════════════════════════════════════════
export async function generateInspectionPptx(report: ReportRecord, body: InspectionBody): Promise<Uint8Array> {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {};
  const LOGO_RID = "rId2";
  files[`ppt/media/logo.${LOGO_EXT}`] = Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0));

  const slideData: Array<{ xml: string; rels: string }> = [];
  const page = () => slideData.length + 1;
  let photoCounter = 0;

  async function fetchPhotoRel(photoId: number): Promise<{ rId: string; mediaName: string } | null> {
    try {
      const blob = await downloadReportEvidence(report.id, photoId);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const mediaName = `photo_${photoCounter}.${ext}`;
      const rId = `rId${100 + photoCounter}`;
      photoCounter++;
      files[`ppt/media/${mediaName}`] = bytes;
      return { rId, mediaName };
    } catch { return null; }
  }

  async function pushPhotoGridSlides(headerTitle: string, entries: { name: string; photoIds: number[] }[]) {
    // Flatten item+photo pairs so any number of photos per item is supported —
    // items with zero photos still get one placeholder slot.
    const flat: { label: string; photoId: number | null }[] = [];
    for (const entry of entries) {
      if (entry.photoIds.length === 0) { flat.push({ label: entry.name, photoId: null }); continue; }
      for (const id of entry.photoIds) flat.push({ label: entry.name, photoId: id });
    }
    for (let i = 0; i < flat.length; i += 9) {
      const batch = flat.slice(i, i + 9);
      const resolved = await Promise.all(batch.map(async b => {
        const rel = b.photoId ? await fetchPhotoRel(b.photoId) : null;
        return { label: b.label, rId: rel?.rId ?? null, mediaName: rel?.mediaName ?? null };
      }));
      slideData.push(photoGridSlide(page(), headerTitle, resolved));
    }
  }

  const firstUnit = body.units[0];
  slideData.push(coverSlide(report, firstUnit ?? { name: "" } as InspectionUnit, page(), LOGO_RID));
  slideData.push(infoSlide(report, page()));

  for (const unit of body.units) {
    slideData.push(unitInfoSlide(unit, page()));
    if (unit.measurementSections.length) slideData.push(...measurementSlides(unit, page));

    const opEntries: { name: string; photoIds: number[] }[] = unit.operationTests.map((t: OperationTest) => ({ name: t.name, photoIds: t.photoIds ?? [] }));
    if (opEntries.length) await pushPhotoGridSlides("OPERATION TEST PHOTOS", opEntries);
    if (unit.operationTests.length) slideData.push(opTableSlide(unit, page()));

    const checklistEntries: { name: string; photoIds: number[] }[] = unit.checklistItems.map((c: ChecklistItem) => ({ name: c.name, photoIds: c.photoIds ?? [] }));
    if (checklistEntries.length) await pushPhotoGridSlides("CHECKLIST PHOTOS", checklistEntries);
    if (unit.checklistItems.length) slideData.push(checklistTableSlide(unit, page()));

    slideData.push(summarySlide(unit, page()));
  }

  slideData.push(signOffSlide(report, page()));

  // ── ZIP envelope (Content_Types, presentation.xml, master/layout/theme) ──
  const photoExts = new Set<string>();
  for (const key of Object.keys(files)) {
    if (key.startsWith("ppt/media/") && !key.includes("logo.")) photoExts.add(key.split(".").pop() ?? "jpg");
  }
  const photoTypeDefaults = [...photoExts].map(ext => `<Default Extension="${ext}" ContentType="image/${ext === "jpg" ? "jpeg" : ext}"/>`).join("\n  ");
  const slideOverrides = slideData.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n  ");
  const layoutOverrides = Array.from({ length: 11 }, (_, i) => `<Override PartName="/ppt/slideLayouts/slideLayout${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`).join("\n  ");

  files["[Content_Types].xml"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${LOGO_EXT}" ContentType="image/${(LOGO_EXT as string) === "jpg" ? "jpeg" : LOGO_EXT}"/>
  ${photoTypeDefaults}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  ${layoutOverrides}
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`);

  files["_rels/.rels"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const NSP2 = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const NSA2 = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const NSR2 = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const slideRefs = slideData.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("");

  files["ppt/presentation.xml"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NSP2} ${NSA2} ${NSR2} saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideRefs}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}" type="A4"/>
  <p:notesSz cx="${W}" cy="${H}"/>
</p:presentation>`);

  const slideRelEntries = slideData.map((_, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n  ");
  files["ppt/_rels/presentation.xml.rels"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  ${slideRelEntries}
</Relationships>`);

  files["ppt/theme/theme1.xml"] = enc(THEME_XML);
  files["ppt/slideMasters/slideMaster1.xml"] = enc(SLIDE_MASTER_XML);
  const LAYOUT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
  const THEME_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
  const layoutRels = Array.from({ length: 11 }, (_, i) => `<Relationship Id="rId${i + 1}" Type="${LAYOUT_NS}" Target="../slideLayouts/slideLayout${i + 1}.xml"/>`).join("\n  ");
  files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${layoutRels}
  <Relationship Id="rId12" Type="${THEME_NS}" Target="../theme/theme1.xml"/>
</Relationships>`);

  for (let i = 0; i < SLIDE_LAYOUTS.length; i++) files[`ppt/slideLayouts/slideLayout${i + 1}.xml`] = enc(SLIDE_LAYOUTS[i]);
  for (let i = 1; i <= 11; i++) {
    files[`ppt/slideLayouts/_rels/slideLayout${i}.xml.rels`] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
  }

  slideData.forEach(({ xml, rels }, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = enc(rels);
  });

  return zipSync(files, { level: 6 });
}
