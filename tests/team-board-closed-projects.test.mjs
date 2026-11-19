import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TEAM_BOARD_COPY } from "../app/system/production/team-board-copy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const board = read("app/system/production/TeamBoard.tsx");

test("team work can be logged against a closed project (SUP-2026-00017)", () => {
  const hook = board.slice(board.indexOf("function useWorkOptions"), board.indexOf("/** The fields a team task shares"));
  assert.ok(hook.length > 200, "useWorkOptions moved");
  // Closed projects are read on their own, so the 100 most recent open ones cannot crowd them out.
  assert.match(hook, /listProjects\(\{ pageSize: 100, status: "Closed" \}\)/);
  // Open projects come first; a closed one is labelled closed instead of being dropped.
  assert.match(hook, /\[\.\.\.page\.items\.filter\(\(project\) => project\.status !== "Closed"\), \.\.\.\(closed\?\.items \?\? \[\]\)\]/);
  assert.match(hook, /project\.status === "Closed" \? ` \(\$\{closedMark\}\)` : ""/);
  const copy = TEAM_BOARD_COPY["TeamBoard.projectClosed"];
  assert.ok(copy?.en && copy.th && copy.jp, "closed label in three languages");
});

test("the API accepts any existing project on team work, closed or not", () => {
  const api = read("backend-node/src/routes/team-board.ts");
  assert.match(api, /EXISTS\(SELECT 1 FROM dbo\.projects WHERE id=@project AND deleted_at IS NULL\)/);
  assert.doesNotMatch(api, /projects WHERE id=@project[^;]*Closed/);
});
