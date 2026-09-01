import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [, , inputPath, outputPath] = process.argv;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("001_EE");
const rows = sheet.getRange("B9:X91").values;
const quoteDates = {
  "2604-TMT-131": "2026-04-24",
  "SQL26050116": "2026-05-06",
  "QIN26050071": "2026-05-06",
  "QCA26050094": "2026-05-06",
  "QT0247170": "2026-05-07",
  "QT0247171": "2026-05-07",
  "2605-TMT-132": "2026-05-08",
  "FA112C3C15": "2026-05-08",
  "NTW-TMT6906-001": "2026-06-12",
  "OF-188978 Page : 1": "2026-06-12",
  "QT26-08419": "2026-06-02",
  "QCA26060377": "2026-06-12",
  "QCA26060384": "2026-06-15",
  "FA112E563G": "2026-07-22",
  "FA112E8CF5": "2026-08-01",
  "2608-TMT-139": "2026-08-25",
};
const pdfByQuote = {
  "2604-TMT-131": "Quote 2604-TMT-131_1.pdf",
  "SQL26050116": "SQL26050116 บริษัท โทมัส เทค จำกัดRev.2.pdf",
  "QIN26050071": "QIN26050071.pdf",
  "QCA26050094": "QCA26050094.pdf",
  "QT0247170": "qt247170a.pdf",
  "QT0247171": "qt247170a.pdf",
  "2605-TMT-132": "Quote 2605-TMT-132.pdf",
  "FA112C3C15": "qt_FA112C3C15.pdf",
  "NTW-TMT6906-001": "TMT.6906-001.pdf",
  "OF-188978 Page : 1": "tomas-12-06-69-OF-188978.pdf",
  "QT26-08419": "QT26-08419.pdf",
  "QCA26060377": "QCA26060377.pdf",
  "QCA26060384": "QCA26060384-1.pdf",
  "FA112E563G": "qt_FA112E563G.pdf",
  "FA112E8CF5": "qt_FA112E8CF5.pdf",
  "2608-TMT-139": "Quote 2608-TMT-139.pdf",
};
const number = (value) => Number(value ?? 0);
const text = (value) => String(value ?? "").trim();
const normalizeUnit = (value) => {
  const unit = text(value).replace(/\.$/, "").toLocaleLowerCase();
  if (["pcs", "pc", "piece", "pieces"].includes(unit)) return "Pcs";
  if (["m", "meter", "metre"].includes(unit)) return "Meter";
  if (["set", "sets"].includes(unit)) return "Set";
  if (["pack", "packs"].includes(unit)) return "Pack";
  return text(value) || "Pcs";
};
const items = rows.flatMap((row) => {
  const lineNumber = number(row[1]);
  const quantity = number(row[8]);
  const itemCode = text(row[3]);
  const description = text(row[4]);
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > 76 || !itemCode || !description || quantity <= 0) return [];
  const quoteNumber = text(row[14]);
  const quoteUnitPrice = number(row[15]);
  const actualLineCost = number(row[18]) || number(row[16]);
  return [{
    sourceKey: `PJ260068|${text(row[19])}|${lineNumber}`,
    projectNumber: "PJ260068",
    projectName: "Belt Conveyor B-G-Line",
    customerName: "MITSUBISHI ELECTRIC CONSUMER PRODUCTS (THAILAND) CO., LTD.",
    lineNumber,
    itemCode,
    description,
    brand: text(row[11]),
    supplierName: text(row[12]),
    quantity,
    unit: normalizeUnit(row[10]),
    quoteUnitPrice,
    actualUnitCost: actualLineCost / quantity,
    actualLineCost,
    leadTimeDays: number(text(row[13]).match(/\d+/)?.[0]),
    quotationNumber: quoteNumber,
    quotationDate: quoteDates[quoteNumber] ?? null,
    purchaseOrderNumber: text(row[19]),
    purchaseOrderStatus: text(row[20]),
    remark: text(row[21]),
    sourceWorkbook: "PR-[EE]-[PJ260068]-20260425-001.xlsx",
    sourceQuotationFile: pdfByQuote[quoteNumber] ?? null,
  }];
});
if (items.length !== 76) {
  const imported = new Set(items.map((item) => item.lineNumber));
  throw new Error(`Expected 76 purchased rows, found ${items.length}; missing ${Array.from({ length: 76 }, (_, index) => index + 1).filter((line) => !imported.has(line)).join(", ")}`);
}
await fs.writeFile(outputPath, JSON.stringify(items, null, 2), "utf8");
console.log(JSON.stringify({ rows: items.length, actualCost: items.reduce((sum, item) => sum + item.actualLineCost, 0), suppliers: new Set(items.map((item) => item.supplierName)).size, quotations: new Set(items.map((item) => item.quotationNumber).filter(Boolean)).size }));
