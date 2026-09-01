import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [, , inputPath, outputDir] = process.argv;
if (!inputPath || !outputDir) throw new Error("Usage: inspect-xlsx.mjs <input.xlsx> <output-dir>");
await fs.mkdir(outputDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const summary = await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 20000, tableMaxRows: 12, tableMaxCols: 20, tableMaxCellChars: 120 });
console.log(summary.ndjson);
const sheets = workbook.worksheets.items;
for (let index = 0; index < sheets.length; index += 1) {
  const sheet = sheets[index];
  const used = sheet.getUsedRange(true);
  if (used) {
    const region = await workbook.inspect({ kind: "region", sheetId: sheet.name, range: used.address, maxChars: 30000, tableMaxRows: 100, tableMaxCols: 30, tableMaxCellChars: 200 });
    console.log(region.ndjson);
  }
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1, format: "png" });
  const safeName = sheet.name.replace(/[^a-z0-9ก-๙_-]+/gi, "_");
  await fs.writeFile(path.join(outputDir, `${String(index + 1).padStart(2, "0")}-${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}
