import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the workbook path.");

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
console.log((await workbook.inspect({
  kind: "workbook,sheet",
  include: "id,name",
  maxChars: 10_000,
})).ndjson);

const sheet = workbook.worksheets.getItem("Overall Project Plan");
const used = sheet.getUsedRange(true);
console.log(JSON.stringify({ usedRange: used.address, rowCount: used.rowCount, columnCount: used.columnCount }));

for (const range of ["A1:V25", "A180:V250", "A725:J790", "A1080:V1140"]) {
  console.log(`RANGE ${range}`);
  console.log((await workbook.inspect({
    kind: "table",
    sheetId: "Overall Project Plan",
    range,
    include: "values,formulas",
    tableMaxRows: 100,
    tableMaxCols: 22,
    tableMaxCellChars: 240,
    maxChars: 50_000,
  })).ndjson);
}
