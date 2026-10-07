import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESTIMATE_DISCIPLINES, costTypeOfDiscipline, ratesForDiscipline } from "../lib/estimate-disciplines.ts";

const root = new URL("../", import.meta.url);
// Working copies may be CRLF; the function slices below look for "\n}\n".
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("migration 070 adds a checked discipline to both ledgers and backfills only the current revision", async () => {
  const [migration, validation, deploy] = await Promise.all([
    source("database/migrations/070_estimate_labor_discipline.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  for (const table of ["manhour_lines", "expense_lines"]) {
    assert.match(migration, new RegExp(`COL_LENGTH\\(N'dbo\\.${table}', N'discipline'\\) IS NULL\\s*ALTER TABLE dbo\\.${table} ADD discipline nvarchar\\(20\\) NULL;`));
    assert.match(migration, new RegExp(`CK_${table}_discipline CHECK \\(\\s*discipline IS NULL\\s*OR \\(discipline=N''Installation'' AND cost_type=N''Installation''\\)\\s*OR \\(discipline IN \\(N''Electrical'',N''Mechanical'',N''Software''\\) AND cost_type=N''Engineering''\\)\\);`));
  }
  // Earlier revisions are frozen by the current-revision triggers, so the backfill joins on the current one.
  assert.equal(migration.match(/INNER JOIN dbo\.estimates e ON e\.id=\w+\.estimate_id AND e\.revision=\w+\.revision/g)?.length, 2);
  assert.match(migration, /HAVING COUNT\(DISTINCT labor\.discipline\)=1/);
  assert.match(migration, /VALUES\(70,N'Estimate labor and site expense disciplines'\)/);
  assert.match(migration, /BEGIN TRANSACTION;[\s\S]*COMMIT TRANSACTION;[\s\S]*ROLLBACK TRANSACTION;/);
  assert.match(validation, /\{ version: 70, fileName: "070_estimate_labor_discipline\.sql", name: "Estimate labor and site expense disciplines" \}/);
  assert.match(deploy, /:r database\/migrations\/070_estimate_labor_discipline\.sql/);
  assert.match(deploy, /\(70, N'Estimate labor and site expense disciplines'\)/);
});

test("a discipline's rate list is its own department when the master has one, and everything otherwise", () => {
  assert.deepEqual([...ESTIMATE_DISCIPLINES], ["Electrical", "Mechanical", "Software", "Installation"]);
  assert.equal(costTypeOfDiscipline("Installation"), "Installation");
  assert.equal(costTypeOfDiscipline("Software"), "Engineering");
  const rates = [{ department: "Software" }, { department: " electrical " }, { department: "IoT Engineer Dept." }];
  assert.deepEqual(ratesForDiscipline(rates, "Software"), [{ department: "Software" }]);
  assert.deepEqual(ratesForDiscipline(rates, "Electrical"), [{ department: " electrical " }]);
  assert.deepEqual(ratesForDiscipline(rates, "Mechanical"), rates, "no Mechanical department: offer every rate rather than none");
  assert.deepEqual(ratesForDiscipline(rates, "Installation"), rates, "installation work is not tied to one department");
});

test("the labor sheet is one section per discipline, each with its own travel, hotel and per diem", async () => {
  const sheet = await source("app/system/production/EstimateLaborSheet.tsx");
  assert.match(sheet, /const sections: SectionKey\[\] = \[\.\.\.ESTIMATE_DISCIPLINES,/);
  // Lines that no rule could place stay visible in their own section until someone chooses.
  assert.match(sheet, /workspace\.manhourLines\.some\(\(line\) => !line\.discipline\) \|\| workspace\.expenseLines\.some\(\(line\) => !line\.discipline\) \? \["unassigned" as const\] : \[\]/);
  assert.match(sheet, /onAddExpense\(\{ discipline, costType: costTypeOfDiscipline\(discipline\),/);
  // A quick row saves into its section: the discipline and the cost type it implies.
  assert.match(sheet, /costType: costTypeOfDiscipline\(quickDraft\.section\), discipline: quickDraft\.section,/);
  // Department and level come from the rate master, the source the server prices from.
  assert.match(sheet, /const options = disciplineRates\(rates, draft\.section\);/);
  assert.match(sheet, /apiRequest<PagedResult<EngineeringRateOption>>\("\/api\/v1\/estimates\/engineering-rate-options\?page=1&pageSize=100"\)/);
  // Amounts in the rate list stay behind master.read, as before.
  assert.match(sheet, /const canSeeRates = bootstrap\.permissions\.includes\("master\.read"\);/);
  assert.match(sheet, /\{canSeeRates \? ` · \$\{formatMoney\(/);
  assert.match(sheet, /<ApplyLaborPackageModal [^>]*discipline=\{libraryFor\}/);
});

test("the labor and expense dialogs require a discipline and derive the cost type from it", async () => {
  const screen = await source("app/system/production/EstimateScreens.tsx");
  const manhour = screen.match(/function ManhourEditor\([\s\S]*?\n\}\n/)?.[0] ?? "";
  const expense = screen.match(/function ExpenseEditor\([\s\S]*?\n\}\n/)?.[0] ?? "";
  for (const editor of [manhour, expense]) {
    assert.match(editor, /<Field label="Discipline \*"><DisciplineSelect value=\{form\.discipline\}/);
    assert.match(editor, /const valid = Boolean\(form\.discipline && /);
    assert.match(editor, /costType: costTypeOfDiscipline\(discipline\)/);
    assert.doesNotMatch(editor, /<Field label="Cost type \*">/);
  }
  assert.match(manhour, /useEngineeringRateOptions\(!importedExcelRate\)/);
  assert.match(manhour, /disciplineRates\(rateOptions, form\.discipline\)/);
});

test("a new estimate can start from any previous estimate the person chooses", async () => {
  const [screen, client] = await Promise.all([source("app/system/production/EstimateScreens.tsx"), source("app/system/api-client.ts")]);
  const modal = screen.match(/function CreateEstimateModal\([\s\S]*?\n\}\n/)?.[0] ?? "";
  // The person searches; nothing ranks or picks for them.
  assert.match(modal, /listEstimates\(\{ page: 1, pageSize: 8, search: sourceSearch\.trim\(\) \|\| undefined \}\)/);
  assert.match(modal, /copyFrom = startFrom === "copy" && source \? \{ sourceEstimateId: source\.id, includeCostItems: ledgers\.costItems, includeManhour: ledgers\.manhour, includeExpenses: ledgers\.expenses, includeOtherCosts: ledgers\.otherCosts \}/);
  assert.match(modal, /const copyReady = startFrom === "blank" \|\| \(source !== null && anyLedger\);/);
  assert.match(client, /copyFrom\?: EstimateStartFrom;/);
});
