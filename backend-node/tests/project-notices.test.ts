import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { EmailService } from "../src/email.js";
import { registerErrorHandler } from "../src/errors.js";
import { deliverProjectNotices, queueProjectCreatedNotices, queueTaskAssignmentNotices } from "../src/project-notices.js";
import { canCreateWithoutEstimate } from "../src/project-scope.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
import { replacePics } from "../src/schedule-service.js";
import type { CurrentUser } from "../src/types.js";
import type { CurrentUserService } from "../src/users.js";

/* Owner decisions 2026-10-14: a project may be created without an estimate by the Application team, a
   Project Manager or an Admin; and people are told, by bell and by mail, when a project they are on
   is created and when a plan row is given to them. */

const user = (roles: string[], department: string) => ({ id: 1, name: "A", roles, role: roles[0], department }) as unknown as CurrentUser;

test("the Application team, Project Managers and Admins may create a project without an estimate", () => {
  assert.equal(canCreateWithoutEstimate(user(["Engineer"], "Application Engineer Dept.")), true);
  assert.equal(canCreateWithoutEstimate(user(["Engineer"], "application 2G")), true, "any department naming Application");
  assert.equal(canCreateWithoutEstimate(user(["Project Manager"], "IoT Engineer Dept.")), true);
  assert.equal(canCreateWithoutEstimate(user(["Engineer", "Admin"], "IoT Engineer Dept.")), true, "an additional role counts");
  assert.equal(canCreateWithoutEstimate(user(["Engineering Manager"], "IoT Engineer Dept.")), false);
  assert.equal(canCreateWithoutEstimate(user(["Engineer"], "Mechanical Engineer Dept.")), false);
});

const config = { businessTimeZone: "Asia/Bangkok", documentStorage: {} } as unknown as AppConfig;
const standaloneBody = {
  withoutEstimate: true, customerId: 3, projectName: "Line monitoring app", projectType: "Software", projectNumber: "PJ260099",
  purchaseOrderNumber: "PO-9", purchaseOrderDate: "2026-10-01", managerId: 5, leadEngineerId: 6, startDate: "2026-10-01",
  targetDelivery: "2026-12-01", site: "Factory",
};

async function post(actor: CurrentUser, payload: Record<string, unknown>) {
  let transactions = 0;
  const database = {
    async transaction() { transactions += 1; throw new Error("Unexpected transaction"); },
    async query() { return { recordset: [{ allowed: true }] }; },
  } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return actor; } } as unknown as CurrentUserService;
  const server = Fastify(); registerErrorHandler(server); registerProjectRoutes(server, config, database, users);
  const response = await server.inject({ method: "POST", url: "/api/v1/projects", payload });
  await server.close();
  return { response, transactions };
}

test("someone outside the Application team, PM and Admin is refused before anything is written", async () => {
  const { response, transactions } = await post(user(["Engineering Manager"], "IoT Engineer Dept."), standaloneBody);
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "project_without_estimate_forbidden");
  assert.equal(transactions, 0);
});

test("a project without an estimate names its customer, project name and type", async () => {
  const actor = user(["Project Manager"], "IoT Engineer Dept.");
  for (const field of ["customerId", "projectName", "projectType"]) {
    const { response, transactions } = await post(actor, { ...standaloneBody, [field]: undefined });
    assert.equal(response.statusCode, 400, field);
    assert.equal(transactions, 0, field);
  }
});

/** sql.Request mocked by statement text; unknown statements answer an empty recordset. */
function installSqlMock(t: TestContext, answer: (statement: string, params: Record<string, unknown>) => unknown[] | undefined) {
  const statements: { statement: string; params: Record<string, unknown> }[] = [];
  const bags = new WeakMap<object, Record<string, unknown>>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {}; bag[name] = rest.length > 1 ? rest[1] : rest[0]; bags.set(this, bag); return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    const params = { ...(bags.get(this) ?? {}) }; statements.push({ statement, params });
    return { recordset: answer(statement, params) ?? [], rowsAffected: [1] };
  });
  return statements;
}

const people = [
  { id: 5, name: "Manager May", email: "may@example.com" },
  { id: 6, name: "Lead Lek", email: "lek@example.com" },
  { id: 7, name: "Member Mon", email: "" },
  { id: 9, name: "Creator Chai", email: "chai@example.com" },
];
const peopleAnswer = (statement: string, params: Record<string, unknown>) => statement.includes("FROM dbo.users")
  ? people.filter((person) => String(params.ids).split(",").map(Number).includes(person.id)) : undefined;

test("a new project tells its manager, lead and team plan members, never the person who created it", async (t) => {
  const statements = installSqlMock(t, peopleAnswer);
  const notices = await queueProjectCreatedNotices({} as Transaction, { id: 9, name: "Creator Chai" }, {
    projectId: 41, projectNumber: "PJ260099", projectName: "Line monitoring app", customerName: "Acme",
    managerId: 5, leadEngineerId: 6, startDate: "2026-10-01", targetDelivery: "2026-12-01",
    team: [{ userId: 7, task: "Dashboard", start: "2026-10-05", finish: "2026-10-20" }, { userId: 9, task: "Review", start: "2026-11-01", finish: "2026-11-02" }],
  });
  const bells = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.notifications"));
  assert.deepEqual(bells.map((entry) => entry.params.user).sort(), [5, 6, 7], "the creator gets no bell");
  assert.ok(bells.every((entry) => entry.params.type === "Project" && entry.params.entity === 41));
  // Member Mon has no mail address: the bell only. One mail each for the others, with their role.
  assert.deepEqual(notices.map((notice) => notice.kind === "created" ? [notice.message.recipients[0]!.email, notice.message.role] : []).sort(),
    [["lek@example.com", "Lead Engineer"], ["may@example.com", "Project Manager"]]);
});

test("a plan row given to someone else tells them once; giving it to yourself tells nobody", async (t) => {
  const statements = installSqlMock(t, (statement, params) => statement.includes("FROM dbo.schedule_tasks t JOIN dbo.projects p")
    ? [{ name: "Panel wiring", plan_start: "2026-10-12", plan_days: 3, project_id: 41, project_no: "PJ260099", project_name: "Line app" }]
    : peopleAnswer(statement, params));
  const notices = await queueTaskAssignmentNotices({} as Transaction, { id: 9, name: "Creator Chai" }, [
    { taskId: 70, userIds: [6, 9] }, { taskId: 71, userIds: [9] }, { taskId: 72, userIds: [] },
  ]);
  assert.equal(statements.filter((entry) => entry.statement.includes("FROM dbo.schedule_tasks t JOIN dbo.projects p")).length, 1, "rows with nobody new are not read");
  const bells = statements.filter((entry) => entry.statement.includes("INSERT INTO dbo.notifications"));
  assert.deepEqual(bells.map((entry) => entry.params.user), [6]);
  assert.equal(bells[0]!.params.kind, "PROJECT_TASK_ASSIGNED");
  assert.equal(notices.length, 1);
  const message = notices[0]!.kind === "task" ? notices[0]!.message : null;
  assert.deepEqual(message && { task: message.taskId, start: message.start, finish: message.finish, to: message.recipients.map((r) => r.email) },
    { task: 70, start: "2026-10-12", finish: "2026-10-14", to: ["lek@example.com"] });
});

test("replacePics returns only the people who were not PICs before", async (t) => {
  installSqlMock(t, (statement) => statement.startsWith("SELECT user_id FROM dbo.schedule_task_pics") ? [{ user_id: 6 }] : undefined);
  assert.deepEqual(await replacePics({} as Transaction, 70, [6, 7, 7]), [7]);
});

test("mail goes after the commit; without a mail service the bell rows stand alone", async () => {
  const graph: AppConfig["email"] = { mode: "MicrosoftGraph", tenantId: "t", clientId: "c", clientSecret: "s", senderUser: "app@example.com", applicationBaseUrl: "https://iot.example.com" };
  const bodies: string[] = [];
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
    bodies.push(String(init?.body)); return new Response(null, { status: 202 });
  }) as typeof fetch;
  const task = { kind: "task" as const, message: { projectId: 41, projectNumber: "PJ260099", projectName: "Line <app>", taskId: 70, taskName: "Panel wiring",
    start: "2026-10-12", finish: "2026-10-14", assignedBy: "Chai", recipients: [{ name: "Lek", email: "lek@example.com" }] } };
  assert.deepEqual(await deliverProjectNotices(undefined, [task]), { status: "disabled", recipients: [] });
  assert.deepEqual(await deliverProjectNotices(new EmailService(graph, fetcher), []), { status: "not_required", recipients: [] });
  assert.deepEqual(await deliverProjectNotices(new EmailService(graph, fetcher), [task]), { status: "sent", recipients: ["lek@example.com"] });
  const mail = JSON.parse(bodies[0]!) as { message: { subject: string; body: { content: string } } };
  assert.equal(mail.message.subject, "[Engineering Center] Assigned: PJ260099 · Panel wiring");
  assert.match(mail.message.body.content, /href="https:\/\/iot\.example\.com\/#project\/41\/task\/70"/);
  assert.match(mail.message.body.content, /Line &lt;app&gt;/);

  // Graph down: the first failure stops the rest instead of every mail waiting out its timeout.
  let sends = 0;
  const failing = (async (input: Parameters<typeof fetch>[0]) => {
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
    sends += 1; return new Response(null, { status: 503 });
  }) as typeof fetch;
  const result = await deliverProjectNotices(new EmailService(graph, failing), [task, { ...task, message: { ...task.message, taskId: 71 } }]);
  assert.equal(result.status, "failed");
  assert.equal(sends, 1);
});
