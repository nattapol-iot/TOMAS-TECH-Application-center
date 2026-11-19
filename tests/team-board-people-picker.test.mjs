import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { TEAM_BOARD_COPY } from "../app/system/production/team-board-copy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const board = read("app/system/production/TeamBoard.tsx");
const picker = read("app/system/production/SearchMultiPicker.tsx");
// Evaluate the actual option/selection expressions without mounting the full board.
function expression(source, name, args) {
  const file = ts.createSourceFile("screen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(initializer, name);
  const code = ts.transpileModule(`return (${initializer});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...args, code);
}
const optionsFor = expression(board, "personOptions", ["bootstrap", "assignable", "original", "useMemo"]);
const allChosen = expression(picker, "allChosen", ["options", "value"]);
const bootstrap = { team: [
  { id: 1, name: "Reporter", department: "IoT", nickname: "R", email: "r@example.test" },
  { id: 2, name: "Engineer", department: "IoT", nickname: "E", email: "e@example.test" },
  { id: 3, name: "Designer", department: "Mechanical", nickname: "D", email: "d@example.test" },
] };
const memo = (fn) => fn();

test("users allowed to assign others can pick every team member, regardless of work type or department", () => {
  const options = optionsFor(bootstrap, null, null, memo);
  assert.deepEqual(options.map((option) => option.id), [1, 2, 3]);
  assert.equal(allChosen(options, [1]), false);
  assert.equal(allChosen(options, [1, 2, 3]), true);
});

test("restricted users can add themselves and retain existing assignees, with an explicit permission message", () => {
  assert.deepEqual(optionsFor(bootstrap, [1], null, memo).map((option) => option.id), [1]);
  assert.deepEqual(optionsFor(bootstrap, [1], { assigneeIds: [2] }, memo).map((option) => option.id), [1, 2]);
  assert.match(board, /allChosenText=\{t\(assignable === null \? "Schedule.everyoneChosen" : "TeamBoard.assignSelfOnly"\)\}/);
  assert.match(board, /!disabled && assignable !== null \? <small[^>]*>\{t\("TeamBoard.assignSelfOnly"\)\}/);
  const copy = TEAM_BOARD_COPY["TeamBoard.assignSelfOnly"];
  for (const language of ["en", "th", "jp"]) assert.ok(copy[language]?.trim(), language);
  const api = read("backend-node/src/routes/team-board.ts");
  assert.match(api, /canAssignOthers: canAssignOthers\(\)/);
  assert.match(api, /assertMayAssign\(actor, input.assigneeIds\)/);
  assert.match(board, /const canAssignOthers = Boolean\(data\?\.canAssignOthers\)/);
  assert.match(board, /canAssignOthers \? null : \[me\]/);
});

test("everyone chosen requires a nonempty candidate list and every candidate ID, not just equal lengths", () => {
  const options = [{ id: 1 }, { id: 2 }];
  assert.equal(allChosen([], [99]), false);
  assert.equal(allChosen(options, [1, 99]), false);
  assert.equal(allChosen(options, [1, 1]), false);
  assert.equal(allChosen(options, []), false);
  assert.equal(allChosen(options, [2, 1]), true);
  assert.match(picker, /allChosen \? allChosenText : noMatchText/);
});
