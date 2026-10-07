import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESTIMATE_DISCIPLINES, costTypeOfDiscipline, disciplineNamedIn, inferredDiscipline, lineDiscipline } from "../src/estimate-disciplines.js";
import { STANDARD_LABOR_PACKAGES } from "../src/standard-labor-cost-masters.js";
import { laborCategorySql } from "../src/estimate-labor-category.js";
import { ApiError } from "../src/errors.js";

const route = (name: string) => readFile(new URL(`../src/routes/${name}.ts`, import.meta.url), "utf8");

test("labor and site expense have four disciplines, and Installation is exactly the Installation cost type", () => {
  assert.deepEqual([...ESTIMATE_DISCIPLINES], ["Electrical", "Mechanical", "Software", "Installation"]);
  for (const discipline of ESTIMATE_DISCIPLINES) assert.equal(costTypeOfDiscipline(discipline), discipline === "Installation" ? "Installation" : "Engineering");
});

test("the front-end copy of the discipline list matches the API's", async () => {
  const shared = await readFile(new URL("../../lib/estimate-disciplines.ts", import.meta.url), "utf8");
  const listed = shared.match(/export const ESTIMATE_DISCIPLINES = \[([^\]]+)\] as const;/)?.[1] ?? "";
  assert.deepEqual([...listed.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]), [...ESTIMATE_DISCIPLINES]);
});

test("a line without a chosen discipline reads as the one migration 070 backfilled", () => {
  assert.equal(inferredDiscipline("Installation", "Software"), "Installation");
  assert.equal(inferredDiscipline("Engineering", " software "), "Software");
  assert.equal(inferredDiscipline("Engineering", "Electrical"), "Electrical");
  assert.equal(inferredDiscipline("Engineering", "MECHANICAL"), "Mechanical");
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept."), null);
  assert.equal(inferredDiscipline("Engineering", null), null);
});

test("an estimate written before disciplines reads as the discipline its work package names", () => {
  // Real lines: every rate is "IoT Engineer Dept.", and the package says the discipline.
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "Electrical design & in-house wiring", "Assembly + wiring (in-house)"), "Electrical");
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "Mechanical design & in-house test", "Drawing design"), "Mechanical");
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "Software development / Warehouse Control System", "Specification design"), "Software");
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "งานออกแบบระบบไฟฟ้า", ""), "Electrical");
  // The package speaks first; the activity only when the package names nothing.
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "Design & Engineering", "Software design & Application development"), "Software");
  assert.equal(inferredDiscipline("Engineering", "IoT Engineer Dept.", "Electro-mechanical design", "Mechanical drawing"), "Mechanical", "a package naming two disciplines gives way to the activity");
  assert.equal(disciplineNamedIn("Electrical & mechanical integration"), null, "two disciplines named: nobody guesses");
  assert.equal(inferredDiscipline("Engineering", "Software", "Mechanical design & in-house test"), "Software", "a department that is a discipline still wins");
  assert.equal(inferredDiscipline("Installation", "IoT Engineer Dept.", "Software development — in-house"), "Installation");
  // Every engineering package of the standard library is placed by its own name.
  for (const pkg of STANDARD_LABOR_PACKAGES.filter((entry) => entry.costType === "Engineering")) {
    assert.notEqual(inferredDiscipline("Engineering", "IoT Engineer Dept.", pkg.name), null, pkg.name);
  }
});

test("a write keeps a chosen discipline only when its cost type allows it", () => {
  assert.equal(lineDiscipline(undefined, "Engineering", "Software"), "Software", "an older client gets the inferred discipline");
  assert.equal(lineDiscipline("", "Installation"), "Installation");
  assert.equal(lineDiscipline("Mechanical", "Engineering", "Software"), "Mechanical", "the person's choice wins over the department");
  assert.equal(lineDiscipline("Installation", "Installation"), "Installation");
  for (const [value, costType] of [["Installation", "Engineering"], ["Software", "Installation"], ["Plumbing", "Engineering"], [3, "Engineering"]] as const) {
    assert.throws(() => lineDiscipline(value, costType), (error: unknown) => error instanceof ApiError && error.statusCode === 400, `${value}/${costType}`);
  }
});

test("the ERP labor rule reads the discipline first and keeps the department fallback", () => {
  const rule = laborCategorySql("line");
  assert.match(rule, /COALESCE\(line\.discipline, CASE LOWER\(LTRIM\(RTRIM\(line\.department\)\)\)/);
  assert.match(rule, /WHEN N'Software' THEN N'Software' WHEN N'Electrical' THEN N'Service' WHEN N'Mechanical' THEN N'Service'/);
  assert.match(rule, /cost_type=N'Installation' THEN N'Installation'/);
  assert.match(rule, /provider=N'Internal'/, "supplier man-hour stays for a person to classify, as the confirmed rule says");
});

test("every route that writes a labor or expense line writes its discipline", async () => {
  const [write, read, estimates, copy, labor, excel] = await Promise.all([route("estimate-workspace-write"), route("estimate-workspace-read"),
    route("estimates"), route("estimate-copy"), route("labor-packages"), route("estimate-excel-import")]);
  assert.match(write, /discipline: lineDiscipline\(body\.discipline, costType, department, packageName, activity\)/);
  assert.match(write, /discipline: lineDiscipline\(body\.discipline, costType, null, packageName, description\)/);
  assert.match(write, /INSERT INTO dbo\.manhour_lines\(estimate_id,revision,package,activity,department,level,cost_type,discipline,/);
  assert.match(write, /cost_type=@cost_type,discipline=@discipline,provider=@provider/);
  assert.match(write, /INSERT INTO dbo\.expense_lines\(estimate_id,revision,package,expense_type,description,cost_type,discipline,/);
  assert.match(write, /cost_type=@cost_type,discipline=@discipline,\s*supplier_id=@supplier/);
  assert.match(read, /l\.cost_type,l\.discipline,l\.provider/);
  assert.match(read, /l\.cost_type,l\.discipline,l\.supplier_id/);
  assert.match(read, /N'labor_discipline_missing'[\s\S]*l\.discipline IS NULL/);
  assert.match(read, /N'expense_discipline_missing'[\s\S]*l\.discipline IS NULL/);
  // Older lines show the discipline their names give, without a write, and lose the warning.
  assert.match(read, /\.\.\.shownDiscipline\(row, row\.package, row\.activity\)/);
  assert.match(read, /\.\.\.shownDiscipline\(row, row\.package, row\.description\)/);
  assert.match(read, /issue\.code === "labor_discipline_missing" \|\| issue\.code === "expense_discipline_missing"\) && placed\.has/);
  // A new revision carries the discipline of every line it copies.
  assert.match(estimates, /INSERT\(estimate_id,revision,package,activity,department,level,cost_type,discipline,provider,[\s\S]*source\.cost_type,source\.discipline,source\.provider/);
  assert.match(estimates, /INSERT\(estimate_id,revision,package,expense_type,description,cost_type,discipline,supplier_id,[\s\S]*source\.cost_type,source\.discipline,source\.supplier_id/);
  assert.match(copy, /row\.discipline \?\? inferredDiscipline\(row\.cost_type, row\.department, row\.package, row\.activity\)/);
  assert.match(copy, /row\.discipline \?\? inferredDiscipline\(row\.cost_type, null, row\.package, row\.description\)/);
  assert.match(copy, /INSERT INTO dbo\.expense_lines\(estimate_id,revision,package,expense_type,description,cost_type,discipline,/);
  assert.match(labor, /insert\.input\("discipline", sql\.NVarChar\(20\), disciplineOf\(line\.cost_type, line\.department, targetPackage, pkg\.name, activity\)\)/);
  assert.match(excel, /cmd\.input\("discipline", sql\.NVarChar\(20\), inferredDiscipline\(l\.costType, l\.department, l\.module, l\.description\)\)/);
});

test("submitting keeps a labor category a person chose on the ERP sheet", async () => {
  const estimates = await route("estimates");
  const update = estimates.match(/UPDATE mapping SET erp_category=\$\{laborCategorySql\('line'\)\}[\s\S]*?=0;/)?.[0] ?? "";
  assert.doesNotMatch(update, /INSERT/, "the match stays inside the one UPDATE statement");
  assert.match(update, /COALESCE\(mapping\.manual_override,0\)=0/);
});

test("a new estimate can start from a previous one in the same transaction", async () => {
  const [estimates, copy] = await Promise.all([route("estimates"), route("estimate-copy")]);
  assert.match(copy, /export async function copyEstimateLines\(transaction: TransactionType,/);
  assert.match(copy, /return copyEstimateLines\(transaction, \{ actor, targetId, estimate, sourceId, ownerId, sections, include, today \}\);/);
  const create = estimates.match(/app\.post\("\/api\/v1\/estimates", [\s\S]*?\n {2}\}\);/)?.[0] ?? "";
  assert.match(create, /if \(copyFrom\) await users\.demandPermission\(request, "estimate\.read"\);/);
  // Lock the R00 just inserted, then fill it, before the transaction commits.
  assert.match(create, /const estimate = await lockEditableEstimate\(transaction, id, row\.row_version\);\s*const copied = await copyEstimateLines\(transaction, \{ actor, targetId: id, estimate, sourceId: copySourceId, ownerId,\s*sections: ESTIMATE_SECTION_CODES, include: copyLedgersFrom\(copyFrom\), today \}\);/);
  assert.ok(create.indexOf("copyEstimateLines") < create.lastIndexOf("});"), "the copy runs inside database.transaction");
});
