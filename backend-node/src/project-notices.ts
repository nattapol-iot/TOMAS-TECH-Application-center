import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { EmailDeliveryResult, EmailService, ProjectCreatedEmail, ProjectTaskAssignmentEmail } from "./email.js";
import { notifyUsers } from "./site-visit-common.js";

/*
 * Telling people about project work. The bell row is written inside the caller's transaction, so
 * it exists exactly when the project or the assignment does; the mail is built there too but sent
 * only after the commit, so a Microsoft Graph outage never rolls work back. Nobody is told about
 * something they did themselves.
 */

/** A plan row and the people who became its PIC in this request (replacePics returns them). */
export type NewPics = { taskId: number; userIds: number[] };

export type ProjectNotice =
  | { kind: "created"; message: ProjectCreatedEmail }
  | { kind: "task"; message: ProjectTaskAssignmentEmail };

/** What the person who did it is told about the mail: the same shape the inquiry assignment returns. */
export type ProjectNoticeDelivery = { status: EmailDeliveryResult["status"] | "not_required"; recipients: string[] };

type Person = { id: number; name: string; email: string };

async function activePeople(transaction: TransactionType, ids: number[]): Promise<Map<number, Person>> {
  const wanted = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!wanted.length) return new Map();
  const request = new sql.Request(transaction); request.input("ids", sql.NVarChar(sql.MAX), wanted.join(","));
  const rows = (await request.query<{ id: number | string; name: string; email: string | null }>(`
    SELECT id,name,email FROM dbo.users
    WHERE id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',')) AND is_active=1 AND deleted_at IS NULL;`)).recordset;
  return new Map(rows.map((row) => [Number(row.id), { id: Number(row.id), name: row.name, email: (row.email ?? "").trim() }]));
}

const shiftDays = (iso: string, days: number) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const isoDate = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export type CreatedProject = {
  projectId: number; projectNumber: string; projectName: string; customerName: string;
  managerId: number; leadEngineerId: number; startDate: string; targetDelivery: string;
  team: { userId: number; task: string; start: string; finish: string }[];
};

/** Bell rows and one mail per person for a new project: manager, lead engineer and the team plan. */
export async function queueProjectCreatedNotices(transaction: TransactionType, actor: { id: number; name: string },
  project: CreatedProject): Promise<ProjectNotice[]> {
  const roles = new Map<number, string>();
  for (const row of project.team) roles.set(row.userId, "Member");
  roles.set(project.leadEngineerId, "Lead Engineer");
  roles.set(project.managerId, "Project Manager");
  roles.delete(actor.id);
  if (!roles.size) return [];
  const people = await activePeople(transaction, [...roles.keys(), project.managerId, project.leadEngineerId]);
  const recipients = [...roles.keys()].filter((id) => people.has(id));
  await notifyUsers(transaction, recipients, "PROJECT_CREATED", `Project ${project.projectNumber} · ${project.projectName}`.slice(0, 300),
    `${actor.name} created this project · ${project.startDate} – ${project.targetDelivery}`, "Project", project.projectId,
    `project:${project.projectId}:created`);
  return recipients.filter((id) => people.get(id)!.email).map((id) => ({
    kind: "created" as const,
    message: {
      projectId: project.projectId, projectNumber: project.projectNumber, projectName: project.projectName, customerName: project.customerName,
      managerName: people.get(project.managerId)?.name ?? "", leadEngineerName: people.get(project.leadEngineerId)?.name ?? "",
      startDate: project.startDate, targetDelivery: project.targetDelivery, createdBy: actor.name, role: roles.get(id)!,
      tasks: project.team.filter((row) => row.userId === id).map(({ task, start, finish }) => ({ name: task, start, finish })),
      recipients: [{ name: people.get(id)!.name, email: people.get(id)!.email }],
    },
  }));
}

/** Bell rows and a mail per plan row for everyone who just became its PIC, except the person assigning. */
export async function queueTaskAssignmentNotices(transaction: TransactionType, actor: { id: number; name: string },
  assignments: NewPics[]): Promise<ProjectNotice[]> {
  const notices: ProjectNotice[] = [];
  const stamp = Date.now();
  for (const assignment of assignments) {
    const userIds = [...new Set(assignment.userIds)].filter((id) => id !== actor.id);
    if (!userIds.length) continue;
    const request = new sql.Request(transaction); request.input("task", sql.BigInt, assignment.taskId);
    const task = (await request.query<{ name: string; plan_start: Date | string | null; plan_days: number | null; project_id: number | string; project_no: string; project_name: string }>(`
      SELECT t.name,t.plan_start,t.plan_days,p.id project_id,p.project_no,p.name project_name
      FROM dbo.schedule_tasks t JOIN dbo.projects p ON p.id=t.project_id
      WHERE t.id=@task AND t.deleted_at IS NULL AND p.deleted_at IS NULL;`)).recordset[0];
    if (!task) continue;
    const people = await activePeople(transaction, userIds);
    const recipients = userIds.filter((id) => people.has(id));
    if (!recipients.length) continue;
    const start = isoDate(task.plan_start);
    const finish = start && task.plan_days ? shiftDays(start, Number(task.plan_days) - 1) : null;
    const projectId = Number(task.project_id);
    await notifyUsers(transaction, recipients, "PROJECT_TASK_ASSIGNED", `${task.project_no} · ${task.name}`.slice(0, 300),
      `${actor.name} assigned you this task${start ? ` · ${start} – ${finish ?? start}` : ""}`, "Project", projectId,
      `project-task:${assignment.taskId}:assigned:${stamp}`);
    const mailable = recipients.filter((id) => people.get(id)!.email);
    if (!mailable.length) continue;
    notices.push({
      kind: "task",
      message: {
        projectId, projectNumber: task.project_no, projectName: task.project_name, taskId: assignment.taskId, taskName: task.name,
        start: start ?? "—", finish: finish ?? start ?? "—", assignedBy: actor.name,
        recipients: mailable.map((id) => ({ name: people.get(id)!.name, email: people.get(id)!.email })),
      },
    });
  }
  return notices;
}

/**
 * Sends after the commit, one mail at a time. The first failure stops the rest: when Graph is down
 * every mail would wait out its own timeout, and the bell rows already tell everyone.
 */
export async function deliverProjectNotices(email: EmailService | undefined, notices: ProjectNotice[]): Promise<ProjectNoticeDelivery> {
  if (!notices.length) return { status: "not_required", recipients: [] };
  // A route registered without a mail service (a test harness) keeps the bell rows only.
  if (!email) return { status: "disabled", recipients: [] };
  const results: EmailDeliveryResult[] = [];
  for (const notice of notices) {
    const result = notice.kind === "created" ? await email.sendProjectCreated(notice.message) : await email.sendProjectTaskAssignment(notice.message);
    results.push(result);
    if (result.status === "failed") break;
  }
  const recipients = [...new Set(results.flatMap((result) => result.recipients))];
  const status = results.some((result) => result.status === "failed") ? "failed"
    : results.every((result) => result.status === "disabled") ? "disabled" : "sent";
  return { status, recipients };
}
