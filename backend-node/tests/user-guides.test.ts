import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { GUIDE_PROGRESS_UPSERT, guideProgressInput, registerUserGuideRoutes } from "../src/routes/user-guides.js";
import type { CurrentUserService } from "../src/users.js";

type Statement = { text: string; params: Record<string, unknown> };

function harness(t: import("node:test").TestContext, options: { permitted?: boolean; roles?: string[]; department?: string; roster?: Array<Record<string, unknown>> } = {}) {
  const statements: Statement[] = [];
  const demanded: string[] = [];
  const users = {
    async required() { return { id: 7, name: "Guide Tester", role: options.roles?.[0] ?? "Engineer", roles: options.roles ?? ["Engineer"], department: options.department ?? "IoT" }; },
    async demandPermission(_request: unknown, permission: string) {
      demanded.push(permission);
      if (options.permitted === false) throw new ApiError(403, "permission_denied", `Permission '${permission}' is required.`);
    },
  } as unknown as CurrentUserService;
  const row = { guide_id: "inquiry-create", step_reached: 3, step_count: 9, started_at: new Date("2026-10-30T02:00:00Z"), completed_at: null, invite_closed_at: new Date("2026-10-30T02:00:00Z") };
  const database = {
    async query(text: string, bind?: (q: { input: (name: string, type: unknown, value: unknown) => unknown }) => void) {
      const params: Record<string, unknown> = {};
      const request = { input(name: string, _type: unknown, value: unknown) { params[name] = value; return request; } };
      bind?.(request);
      statements.push({ text, params });
      if (text.includes("FROM dbo.projects WHERE deleted_at IS NULL AND (manager_id=@actor")) return { recordset: [] };
      if (text.includes("FROM dbo.users u JOIN dbo.roles r")) return { recordset: options.roster ?? [] };
      if (text.includes("FROM dbo.user_guide_progress p")) return { recordset: [{ ...row, user_id: 11 }] };
      if (text.includes("FROM dbo.user_guide_progress WHERE user_id=@user ORDER BY")) return { recordset: [row] };
      throw new Error(`Unexpected statement: ${text}`);
    },
    async transaction(action: (tx: object) => Promise<unknown>) { return action({}); },
  } as unknown as Database;
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, text: string) {
    statements.push({ text, params: Object.fromEntries(Object.entries(this.parameters).map(([key, value]) => [key, value.value])) });
    return { recordset: [row] };
  });
  const app = Fastify();
  registerErrorHandler(app);
  registerUserGuideRoutes(app, database, users);
  return { app, statements, demanded };
}

test("a progress report names a guide and one of four events; the step is checked against the step count", () => {
  assert.deepEqual(guideProgressInput({ guideId: "inquiry-create", event: "step", step: 4, stepCount: 9 }), { guideId: "inquiry-create", event: "step", step: 4, stepCount: 9 });
  // Starting and answering the invitation are always step 0; finishing is the last step.
  assert.equal(guideProgressInput({ guideId: "pr-create", event: "start", step: 5, stepCount: 9 }).step, 0);
  assert.equal(guideProgressInput({ guideId: "pr-create", event: "invite-closed", stepCount: 9 }).step, 0);
  assert.equal(guideProgressInput({ guideId: "pr-create", event: "complete", stepCount: 9 }).step, 9);
  for (const body of [
    { guideId: "Inquiry Create", event: "step", step: 1, stepCount: 9 },
    { guideId: "x", event: "step", step: 1, stepCount: 9 },
    { guideId: "inquiry-create", event: "finish", step: 1, stepCount: 9 },
    { guideId: "inquiry-create", event: "step", step: 10, stepCount: 9 },
    { guideId: "inquiry-create", event: "step", step: 1, stepCount: 0 },
    { guideId: "inquiry-create", event: "step", step: 1.5, stepCount: 9 },
  ]) assert.throws(() => guideProgressInput(body), ApiError, JSON.stringify(body));
});

test("the upsert restarts a run at step 0, only moves the step forward, keeps the first finish and closes the invitation", () => {
  const text = GUIDE_PROGRESS_UPSERT.replace(/\s+/g, " ");
  assert.match(text, /UPDATE dbo\.user_guide_progress WITH \(UPDLOCK, SERIALIZABLE\)/);
  assert.match(text, /step_reached=CASE WHEN @event=N'start' THEN 0 WHEN @event=N'complete' THEN @count WHEN @event=N'step' AND @step>step_reached/);
  assert.match(text, /completed_at=CASE WHEN @event=N'complete' THEN COALESCE\(completed_at, SYSUTCDATETIME\(\)\) ELSE completed_at END/);
  assert.match(text, /invite_closed_at=COALESCE\(invite_closed_at, SYSUTCDATETIME\(\)\)/);
  // Saying "not now" to the invitation is not a start.
  assert.match(text, /CASE WHEN @event=N'invite-closed' THEN NULL ELSE SYSUTCDATETIME\(\) END/);
});

test("a person reads and writes only their own progress, with no extra permission", async (t) => {
  const { app, statements, demanded } = harness(t);
  try {
    const read = await app.inject({ method: "GET", url: "/api/v1/guides/progress" });
    assert.equal(read.statusCode, 200);
    assert.deepEqual(read.json(), { items: [{ guideId: "inquiry-create", stepReached: 3, stepCount: 9, startedAt: "2026-10-30T02:00:00.000Z", completedAt: null, inviteClosedAt: "2026-10-30T02:00:00.000Z" }] });
    const write = await app.inject({ method: "POST", url: "/api/v1/guides/progress", payload: { guideId: "inquiry-create", event: "step", step: 3, stepCount: 9 } });
    assert.equal(write.statusCode, 200);
    assert.equal(write.json().stepReached, 3);
    const upsert = statements.find((statement) => statement.text === GUIDE_PROGRESS_UPSERT);
    assert.deepEqual(upsert?.params, { user: 7, guide: "inquiry-create", event: "step", step: 3, count: 9 });
    assert.deepEqual(demanded, []);
    const refused = await app.inject({ method: "POST", url: "/api/v1/guides/progress", payload: { guideId: "inquiry-create", event: "step", step: 12, stepCount: 9 } });
    assert.equal(refused.statusCode, 400);
  } finally { await app.close(); }
});

test("team progress needs performance.manage and covers only the head's Team Activity roster", async (t) => {
  const denied = harness(t, { permitted: false });
  try {
    const response = await denied.app.inject({ method: "GET", url: "/api/v1/guides/team" });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(denied.demanded, ["performance.manage"]);
    assert.equal(denied.statements.length, 0);
  } finally { await denied.app.close(); }

  const head = harness(t, { roles: ["Engineering Manager"], department: "IoT", roster: [
    { id: 7, name: "Guide Tester", department: "IoT", role: "Engineering Manager", entra_object_id: "a", start_work_date: null },
    { id: 11, name: "Team Member", department: "IoT", role: "Engineer", entra_object_id: "b", start_work_date: null },
  ] });
  try {
    const response = await head.app.inject({ method: "GET", url: "/api/v1/guides/team" });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(body.members, [{ id: 7, name: "Guide Tester", department: "IoT", role: "Engineering Manager" }, { id: 11, name: "Team Member", department: "IoT", role: "Engineer" }]);
    assert.deepEqual(body.progress, [{ userId: 11, guideId: "inquiry-create", stepReached: 3, stepCount: 9, startedAt: "2026-10-30T02:00:00.000Z", completedAt: null, inviteClosedAt: "2026-10-30T02:00:00.000Z" }]);
    const roster = head.statements.find((statement) => statement.text.includes("FROM dbo.users u JOIN dbo.roles r"));
    assert.equal(roster?.params.department, "IoT");
    const progress = head.statements.find((statement) => statement.text.includes("FROM dbo.user_guide_progress p"));
    assert.equal(progress?.params.ids, "[7,11]");
  } finally { await head.app.close(); }
});
