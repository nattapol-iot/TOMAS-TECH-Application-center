import type { AppConfig } from "./config.js";
import { calendarEvent, calendarMime, calendarSequence, type CalendarTask } from "./team-calendar.js";

export type EmailRecipient = { name: string; email: string };
export type EmailDeliveryResult = {
  status: "sent" | "disabled" | "failed";
  recipients: string[];
};

export type EstimateAssignmentEmail = {
  estimateId: number;
  estimateNumber: string;
  projectName: string;
  section: string;
  dueDate: string;
  assignedBy: string;
  recipients: EmailRecipient[];
};

export type InquiryAssignmentEmail = {
  inquiryId: number;
  inquiryNumber: string;
  projectName: string;
  customerName: string;
  dueDate: string;
  priority: string;
  assignedBy: string;
  recipients: EmailRecipient[];
};

export type SupportTicketEmail = {
  ticketId: number;
  ticketNumber: string;
  subject: string;
  summary: string;
  actorName: string;
  recipients: EmailRecipient[];
};

/** A Site Monitor incident, opened (escalation step 1-3) or resolved. Times are already formatted. */
export type SiteMonitorEmail = {
  state: "open" | "resolved";
  kind: "ProgramStopped" | "AgentOffline";
  siteName: string;
  location: string;
  agentName: string;
  machineName: string;
  programName: string;
  openedAt: string;
  resolvedAt: string;
  /** The escalation step this email belongs to (1 = first responsible person). */
  priority: number;
  recentLogs: { at: string; level: string; message: string }[];
  recipients: EmailRecipient[];
};

/** One person on a new project: their role on it and the plan rows they were given at creation. */
export type ProjectCreatedEmail = {
  projectId: number;
  projectNumber: string;
  projectName: string;
  customerName: string;
  managerName: string;
  leadEngineerName: string;
  startDate: string;
  targetDelivery: string;
  createdBy: string;
  /** "Project Manager", "Lead Engineer" or "Member". */
  role: string;
  tasks: { name: string; start: string; finish: string }[];
  recipients: EmailRecipient[];
};

/** Someone became a PIC of a project plan row (Project Plan, team plan or an approved Resource Plan task). */
export type ProjectTaskAssignmentEmail = {
  projectId: number;
  projectNumber: string;
  projectName: string;
  taskId: number;
  taskName: string;
  start: string;
  finish: string;
  assignedBy: string;
  recipients: EmailRecipient[];
};

/** A team-board appointment or task for one person's Outlook calendar (team-calendar.ts): a request, or its cancellation. */
export type TeamTaskCalendarEmail = {
  method: "REQUEST" | "CANCEL";
  task: CalendarTask;
  /** Everyone on a request (each sees who else is coming), or the people a cancellation is for. */
  recipients: EmailRecipient[];
  /** Whoever added or changed the task. */
  sentBy: string;
};

type FetchLike = typeof fetch;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function normalizedRecipients(recipients: EmailRecipient[]): EmailRecipient[] {
  const unique = new Map<string, EmailRecipient>();
  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (email && !unique.has(email)) unique.set(email, { name: recipient.name.trim() || email, email });
  }
  return [...unique.values()];
}

/** A Microsoft Graph read that did not succeed; status 403 is a permission the app has not been granted. */
export class GraphReadError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export class EmailService {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: AppConfig["email"],
    private readonly fetcher: FetchLike = fetch,
    private readonly reportError: (error: unknown) => void = () => {},
  ) {}

  async sendEstimateAssignment(message: EstimateAssignmentEmail): Promise<EmailDeliveryResult> {
    return this.sendMail(message.recipients, `[Engineering Center] Assigned: ${message.estimateNumber} · ${message.section}`, (appUrl) =>
      `<p>คุณได้รับมอบหมายงาน Estimate Cost / You have been assigned an Estimate Cost section.</p>`
      + `<table><tr><td><strong>Estimate</strong></td><td>${escapeHtml(message.estimateNumber)}</td></tr>`
      + `<tr><td><strong>Project</strong></td><td>${escapeHtml(message.projectName)}</td></tr>`
      + `<tr><td><strong>Section</strong></td><td>${escapeHtml(message.section)}</td></tr>`
      + `<tr><td><strong>Due date</strong></td><td>${escapeHtml(message.dueDate)}</td></tr>`
      + `<tr><td><strong>Assigned by</strong></td><td>${escapeHtml(message.assignedBy)}</td></tr></table>`
      + `<p><a href="${escapeHtml(appUrl)}#estimate/${message.estimateId}">เปิด Estimate Cost ${escapeHtml(message.estimateNumber)} / Open this estimate</a></p>`);
  }

  // The engineer picked in "Create inquiry" (from a CRM opportunity or directly) and on a
  // later reassignment. inquiries.ts writes the matching in-app notification inside the
  // transaction, so the bell still tells the engineer even when mail is off or Graph fails.
  async sendInquiryAssignment(message: InquiryAssignmentEmail): Promise<EmailDeliveryResult> {
    return this.sendMail(message.recipients, `[Engineering Center] Inquiry ${message.inquiryNumber}: ${message.projectName}`, (appUrl) =>
      `<p>คุณได้รับมอบหมาย Inquiry ใหม่ / A new inquiry has been assigned to you.</p>`
      + `<table><tr><td><strong>Inquiry</strong></td><td>${escapeHtml(message.inquiryNumber)}</td></tr>`
      + `<tr><td><strong>Customer</strong></td><td>${escapeHtml(message.customerName)}</td></tr>`
      + `<tr><td><strong>Project</strong></td><td>${escapeHtml(message.projectName)}</td></tr>`
      + `<tr><td><strong>Due date</strong></td><td>${escapeHtml(message.dueDate)}</td></tr>`
      + `<tr><td><strong>Priority</strong></td><td>${escapeHtml(message.priority)}</td></tr>`
      + `<tr><td><strong>Assigned by</strong></td><td>${escapeHtml(message.assignedBy)}</td></tr></table>`
      + `<p><a href="${escapeHtml(appUrl)}#inquiry/${message.inquiryId}">เปิด Inquiry ${escapeHtml(message.inquiryNumber)} / Open this inquiry</a></p>`);
  }

  // Sent once per person after a project is created: its manager, lead engineer and everyone on the
  // team plan, never the person who created it. projects.ts writes the matching bell row in the
  // creation transaction, so the bell still tells them when mail is off or Graph fails.
  async sendProjectCreated(message: ProjectCreatedEmail): Promise<EmailDeliveryResult> {
    const tasks = message.tasks.length === 0 ? "" :
      `<p><strong>งานของคุณในแผน / Your rows in the plan</strong></p><table>${message.tasks.map((task) =>
        `<tr><td>${escapeHtml(task.name)}</td><td>${escapeHtml(task.start)} – ${escapeHtml(task.finish)}</td></tr>`).join("")}</table>`;
    return this.sendMail(message.recipients, `[Engineering Center] Project ${message.projectNumber}: ${message.projectName}`, (appUrl) =>
      `<p>มี Project ใหม่ที่คุณอยู่ในทีม / A new project has been created with you on the team.</p>`
      + `<table><tr><td><strong>Project</strong></td><td>${escapeHtml(message.projectNumber)} · ${escapeHtml(message.projectName)}</td></tr>`
      + `<tr><td><strong>Customer</strong></td><td>${escapeHtml(message.customerName)}</td></tr>`
      + `<tr><td><strong>Your role</strong></td><td>${escapeHtml(message.role)}</td></tr>`
      + `<tr><td><strong>Project manager</strong></td><td>${escapeHtml(message.managerName)}</td></tr>`
      + `<tr><td><strong>Lead engineer</strong></td><td>${escapeHtml(message.leadEngineerName)}</td></tr>`
      + `<tr><td><strong>Start – target delivery</strong></td><td>${escapeHtml(message.startDate)} – ${escapeHtml(message.targetDelivery)}</td></tr>`
      + `<tr><td><strong>Created by</strong></td><td>${escapeHtml(message.createdBy)}</td></tr></table>`
      + tasks
      + `<p><a href="${escapeHtml(appUrl)}#project/${message.projectId}">เปิดแผนงาน Project ${escapeHtml(message.projectNumber)} / Open the project plan</a></p>`);
  }

  // A plan row given to someone other than the person assigning it. project-notices.ts writes the
  // bell row in the same transaction as the assignment and hands this message back to send after commit.
  async sendProjectTaskAssignment(message: ProjectTaskAssignmentEmail): Promise<EmailDeliveryResult> {
    return this.sendMail(message.recipients, `[Engineering Center] Assigned: ${message.projectNumber} · ${message.taskName}`, (appUrl) =>
      `<p>คุณได้รับมอบหมายงานใน Project / You have been assigned a project task.</p>`
      + `<table><tr><td><strong>Project</strong></td><td>${escapeHtml(message.projectNumber)} · ${escapeHtml(message.projectName)}</td></tr>`
      + `<tr><td><strong>Task</strong></td><td>${escapeHtml(message.taskName)}</td></tr>`
      + `<tr><td><strong>Plan</strong></td><td>${escapeHtml(message.start)} – ${escapeHtml(message.finish)}</td></tr>`
      + `<tr><td><strong>Assigned by</strong></td><td>${escapeHtml(message.assignedBy)}</td></tr></table>`
      + `<p><a href="${escapeHtml(appUrl)}#project/${message.projectId}/task/${message.taskId}">เปิดงานนี้ใน Project ${escapeHtml(message.projectNumber)} / Open this task</a></p>`);
  }

  /**
   * A meeting request (or its cancellation) in MIME, so Outlook files it in the person's calendar and later copies
   * replace it (same UID). Sent as the system mailbox, which is also the organizer; no replies are asked for.
   */
  async sendTeamTaskCalendar(message: TeamTaskCalendarEmail): Promise<EmailDeliveryResult> {
    const recipients = normalizedRecipients(message.recipients);
    const addresses = recipients.map((recipient) => recipient.email);
    if (!recipients.length) return { status: "sent", recipients: [] };
    if (this.config.mode === "Disabled") return { status: "disabled", recipients: addresses };
    try {
      const appUrl = `${this.config.applicationBaseUrl!.replace(/\/$/, "")}/`;
      const link = `${appUrl}#/resources`;
      const { task } = message;
      const when = task.endDate === task.startDate ? task.startDate : `${task.startDate} – ${task.endDate}`;
      const cancelled = message.method === "CANCEL";
      const subject = `${cancelled ? "[Engineering Center] Cancelled: " : "[Engineering Center] "}${task.title}`;
      const rows: [string, string][] = [["Date", `${when}${task.slot === "Time" && task.startTime ? ` ${task.startTime}–${task.endTime}` : ""}`], ["Customer", task.customer], ["Note", task.note], ["Sent by", message.sentBy]];
      const html = `<p>${cancelled ? "ยกเลิกนัดนี้แล้ว / This has been cancelled." : "นัดจากหน้าภาพรวมงานทีม / From the Team overview."}</p>`
        + `<p><strong>${escapeHtml(task.title)}</strong></p><table>`
        + rows.filter(([, value]) => value).map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${escapeHtml(value)}</td></tr>`).join("")
        + `</table><p><a href="${escapeHtml(link)}">เปิดภาพรวมงานทีม / Open the Team overview</a></p>`;
      const text = [task.title, ...rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`), link].join("\n");
      const ics = calendarEvent(task, { method: message.method, organizer: this.config.senderUser!, attendees: recipients, sequence: calendarSequence(), link });
      const mime = calendarMime({ from: this.config.senderUser!, to: recipients, subject, text, html, ics, method: message.method, boundary: `team-task-${task.id}-${Date.now()}` });
      const accessToken = await this.accessToken();
      // Graph takes a whole MIME message base64-encoded with Content-Type text/plain.
      const response = await this.fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderUser!)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "text/plain" },
        signal: AbortSignal.timeout(10_000),
        body: Buffer.from(mime, "utf8").toString("base64"),
      });
      if (!response.ok) throw new Error(`Microsoft Graph sendMail (calendar) returned HTTP ${response.status}.`);
      return { status: "sent", recipients: addresses };
    } catch (error) {
      this.reportError(error);
      return { status: "failed", recipients: addresses };
    }
  }

  // Fires for a ticket being created, commented on, (re)assigned, or changing status --
  // support.ts computes the same audience the in-app notification goes to and passes it
  // here, so email recipients are always the same set (never a second, drifting rule).
  async sendSupportTicketUpdate(message: SupportTicketEmail): Promise<EmailDeliveryResult> {
    return this.sendMail(message.recipients, `[Engineering Center] Support ${message.ticketNumber}: ${message.summary}`, (appUrl) =>
      `<p>${escapeHtml(message.summary)}</p>`
      + `<table><tr><td><strong>Ticket</strong></td><td>${escapeHtml(message.ticketNumber)}</td></tr>`
      + `<tr><td><strong>Subject</strong></td><td>${escapeHtml(message.subject)}</td></tr>`
      + `<tr><td><strong>By</strong></td><td>${escapeHtml(message.actorName)}</td></tr></table>`
      + `<p><a href="${escapeHtml(appUrl)}#support/${message.ticketId}">เปิด Support Center ${escapeHtml(message.ticketNumber)} / Open this ticket</a></p>`);
  }

  // Sent by the Site Monitor sweeper (site-monitor.ts): escalation step 1 → 2 → 3 while an incident
  // stays open and unacknowledged, then once more to everyone already told when it is resolved.
  async sendSiteMonitorIncident(message: SiteMonitorEmail): Promise<EmailDeliveryResult> {
    const what = message.kind === "ProgramStopped"
      ? `${message.programName} stopped`
      : `${message.agentName} is offline`;
    const subject = message.state === "open"
      ? `[Site Monitor] ${message.siteName}: ${what}`
      : `[Site Monitor] Resolved · ${message.siteName}: ${what}`;
    const heading = message.state === "open"
      ? (message.kind === "ProgramStopped"
        ? "โปรแกรมหยุดทำงานโดยไม่คาดคิด / A monitored program stopped unexpectedly."
        : "เครื่องที่เฝ้าระวังหยุดส่งข้อมูล / A monitored machine stopped reporting.")
      : "ปัญหาได้รับการแก้ไขแล้ว / The problem has been resolved.";
    const row = (label: string, value: string) => value ? `<tr><td><strong>${label}</strong></td><td>${escapeHtml(value)}</td></tr>` : "";
    const logs = message.recentLogs.length === 0 ? "" :
      `<p><strong>Log ล่าสุด / Recent log</strong></p><table>${message.recentLogs.map((log) =>
        `<tr><td>${escapeHtml(log.at)}</td><td>${escapeHtml(log.level)}</td><td>${escapeHtml(log.message)}</td></tr>`).join("")}</table>`;
    return this.sendMail(message.recipients, subject, (appUrl) =>
      `<p>${heading}</p>`
      + `<table>${row("Site", message.siteName)}${row("Location", message.location)}`
      + `${row("Program", message.kind === "ProgramStopped" ? message.programName : "")}`
      + `${row("Agent", message.agentName)}${row("Machine", message.machineName)}`
      + `${row("Since", message.openedAt)}${row("Resolved", message.state === "resolved" ? message.resolvedAt : "")}`
      + `${message.state === "open" ? row("Escalation", `ผู้ดูแลลำดับที่ ${message.priority} / Responsible person #${message.priority}`) : ""}</table>`
      + logs
      + `<p><a href="${escapeHtml(appUrl)}#/site-monitor">เปิด Site Monitor / Open Site Monitor</a></p>`);
  }

  /** Whether Microsoft Graph is set up at all (Email__Mode=MicrosoftGraph). */
  get graphEnabled(): boolean { return this.config.mode !== "Disabled"; }

  /**
   * A Graph GET with the app's own token: the team board reads Outlook calendars with it (application permission
   * Calendars.Read). A path is under https://graph.microsoft.com/v1.0; a full URL (an @odata.nextLink) is used as is.
   */
  async graphGet<T>(pathOrUrl: string, headers: Record<string, string> = {}): Promise<T> {
    if (!this.graphEnabled) throw new GraphReadError(0, "graph_disabled", "Microsoft Graph is not configured.");
    const accessToken = await this.accessToken();
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
    const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${accessToken}`, ...headers }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      throw new GraphReadError(response.status, body?.error?.code ?? "graph_error", body?.error?.message ?? `Microsoft Graph returned HTTP ${response.status}.`);
    }
    return await response.json() as T;
  }

  private async sendMail(rawRecipients: EmailRecipient[], subject: string, htmlBody: (appUrl: string) => string): Promise<EmailDeliveryResult> {
    const recipients = normalizedRecipients(rawRecipients);
    if (this.config.mode === "Disabled") return { status: "disabled", recipients: recipients.map((recipient) => recipient.email) };
    if (recipients.length === 0) return { status: "sent", recipients: [] };
    try {
      const accessToken = await this.accessToken();
      const appUrl = `${this.config.applicationBaseUrl!.replace(/\/$/, "")}/`;
      const response = await this.fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderUser!)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: htmlBody(appUrl) },
            toRecipients: recipients.map((recipient) => ({ emailAddress: { address: recipient.email, name: recipient.name } })),
          },
        }),
      });
      if (!response.ok) throw new Error(`Microsoft Graph sendMail returned HTTP ${response.status}.`);
      return { status: "sent", recipients: recipients.map((recipient) => recipient.email) };
    } catch (error) {
      this.reportError(error);
      return { status: "failed", recipients: recipients.map((recipient) => recipient.email) };
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const body = new URLSearchParams({
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const response = await this.fetcher(`https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId!)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Microsoft identity token endpoint returned HTTP ${response.status}.`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Microsoft identity token response did not contain an access token.");
    this.token = { value: payload.access_token, expiresAt: Date.now() + Math.max(payload.expires_in ?? 300, 60) * 1_000 };
    return this.token.value;
  }
}
