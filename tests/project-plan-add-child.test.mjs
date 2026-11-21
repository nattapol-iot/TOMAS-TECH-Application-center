import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript-api";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const screen = read("app/system/production/PlanningPricingScreens.tsx");
const service = read("backend-node/src/schedule-service.ts");
// Execute the real functions without loading React or the database connection.
function declaration(source, name) {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (node.name?.getText(file) === name) {
      if (ts.isFunctionDeclaration(node)) found = node.getText(file).replace(/^export /, "");
      if (ts.isVariableDeclaration(node)) found = `const ${node.getText(file)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(found, name);
  return found;
}
const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.code = code; }
}
const backend = new Function("ApiError", "sql", "hasPendingRequest", compile([
  ...["MAX_PLAN_DEPTH", "datesWouldLoop", "placeInOrder", "scheduleParentAllowed", "validateGraphAndHierarchy"].map((name) => declaration(service, name)),
  "return { placeInOrder, validateGraphAndHierarchy };",
].join("\n")));
const calculator = await import("data:text/javascript;base64," + Buffer.from(compile(
  read("backend-node/src/schedule-calculator.ts").replace('import { ApiError } from "./errors.js";', "class ApiError extends Error {}"),
)).toString("base64"));

for (const existingChildren of [0, 2]) {
  test(`add under 3.1.1 with following siblings and ${existingChildren} existing children`, async () => {
    const row = (id, parentId, depth, sortOrder, kind = "task") => ({ id, parentId, depth, sortOrder, kind,
      children: [], status: "Not Started", percentComplete: 0, actualStart: null, actualFinish: null,
      forecastFinish: null, managedByResourcePlan: false, startMode: "manual", predecessorId: null,
      lagDays: 0, planStart: "2026-10-17", planDays: 1 });
    const rows = [row(1, null, 0, 10, "phase"), row(2, null, 0, 20, "phase"), row(3, null, 0, 30, "phase"),
      row(31, 3, 1, 10), row(311, 31, 2, 10), row(312, 31, 2, 20), row(313, 31, 2, 30)];
    for (let n = 0; n < existingChildren; n++) rows.push(row(3111 + n, 311, 3, (n + 1) * 10));
    for (const parent of rows) parent.children = rows.filter((child) => child.parentId === parent.id);
    const taskById = new Map(rows.map((task) => [task.id, task]));
    let draft;
    const plusFor = new Function("rows", "taskById", "openDraft", compile(`
      const canPlan = true, filter = null, movePending = null, saving = false, draftBusy = false, activeSchedule = {};
      const pendingTaskIds = new Set(), uiText = (key) => key;
      ${declaration(screen, "MAX_PLAN_DEPTH")}
      ${declaration(screen, "canTakeSubTasks")}
      ${declaration(screen, "plusFor")}
      return plusFor;
    `))(rows, taskById, (parentId, beforeId) => { draft = { parentId, beforeId }; });
    plusFor(taskById.get(311)).onInsert();
    assert.deepEqual(draft, { parentId: 311, beforeId: null });
    const sql = { BigInt: "bigint", Request: class {
      input() {}
      async query(statement) {
        return { recordset: statement.includes("FROM dbo.schedule_tasks") ? rows.map((r) => ({
          id: r.id, parent_id: r.parentId, predecessor_id: r.predecessorId, kind: r.kind,
          start_mode: r.startMode, status: r.status, percent_done: r.percentComplete, actual_start: r.actualStart,
        })) : [{ value: false }] };
      }
    } };
    const { placeInOrder, validateGraphAndHierarchy } = backend(ApiError, sql, async () => false);
    const added = row(99, draft.parentId, 3, 0);
    await validateGraphAndHierarchy({}, 1, null, added);
    added.sortOrder = placeInOrder(taskById.get(311).children, draft.beforeId, 0).sortOrder;
    const result = calculator.resolveSchedule([...rows, added], new Set()).byId;
    assert.equal(result.get(99).wbs, `3.1.1.${existingChildren + 1}`);
    assert.equal(result.get(312).wbs, "3.1.2");
    assert.equal(result.get(313).wbs, "3.1.3");
  });
}
