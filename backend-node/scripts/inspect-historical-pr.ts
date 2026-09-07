import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseHistoricalPr } from "../src/historical-pr.js";
const path = process.argv[2];
if (!path) throw new Error("Specify the PR workbook path.");
const result = parseHistoricalPr(await readFile(path), basename(path));
console.log(JSON.stringify({ sourceName: result.sourceName, sourceHash: result.sourceHash, projectNumber: result.projectNumber,
  documentReference: result.documentReference, lines: result.lines.length, revisions: [...new Set(result.lines.map(l => l.revision))],
  purchaseOrders: [...new Set(result.lines.map(l => l.poNumber))], totals: result.totals, warnings: result.warnings }, null, 2));
