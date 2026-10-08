import type { AppConfig } from "./config.js";

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
