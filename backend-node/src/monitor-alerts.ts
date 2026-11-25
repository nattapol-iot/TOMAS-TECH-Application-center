import type { FastifyBaseLogger } from "fastify";
import sql from "mssql";
import { openBound, sealBound, type SealedSecret, type VaultKeys } from "./credential-vault.js";
import type { Database } from "./db.js";
import { ApiError } from "./errors.js";
import type { IncidentKind } from "./site-monitor.js";

/**
 * Site Monitor alert channels: a site's incidents also go to LINE (Messaging API push) and Microsoft Teams
 * (incoming webhook or a Workflows "post to a channel when a webhook request is received" URL), beside the email
 * escalation. The LINE channel access token and the Teams URL are secrets: sealed with the vault keys
 * (CREDENTIAL_VAULT_KEYS) bound to their site and channel, never logged, never returned to a screen.
 */
export type AlertChannel = "Line" | "Teams";
export const ALERT_CHANNELS: readonly AlertChannel[] = ["Line", "Teams"];

export type AlertMessage = {
  state: "open" | "escalated" | "resolved" | "test";
  kind: IncidentKind | null;
  title: string;
  siteName: string;
  location: string;
  agentName: string;
  machineName: string;
  programName: string;
  openedAt: string;
  resolvedAt: string;
  /** Escalation step (1-3) for open / escalated; the highest step reached for resolved. */
  priority: number;
};

export const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const SEND_TIMEOUT_MS = 10_000;
const LINE_TEXT_LIMIT = 5000;

/** Teams webhooks live on Microsoft hosts only; anything else would make the API call an arbitrary URL. */
const TEAMS_HOSTS = /(^|\.)(webhook\.office\.com|logic\.azure\.com|powerplatform\.com|powerautomate\.com)$/i;

export function parseAlertChannel(value: unknown): AlertChannel {
  if (value === "Line" || value === "Teams") return value;
  throw new ApiError(404, "monitor_alert_channel_unknown", "The alert channel must be Line or Teams.");
}

/** A Teams incoming webhook or Workflows URL: https on a Microsoft host, no credentials in the authority. */
export function validateTeamsWebhook(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(400, "monitor_alert_teams_url_invalid", "Paste the Teams webhook URL (https://…webhook.office.com/… or a Workflows URL).");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !TEAMS_HOSTS.test(url.hostname) || text.length > 2000) {
    throw new ApiError(400, "monitor_alert_teams_url_invalid", "Paste the Teams webhook URL (https://…webhook.office.com/… or a Workflows URL).");
  }
  return url.toString();
}

/** A LINE user (U…), group (C…) or room (R…) ID: one letter and 32 hexadecimal digits. */
export function validateLineTarget(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[UCR][0-9a-f]{32}$/.test(text)) {
    throw new ApiError(400, "monitor_alert_line_target_invalid", "The LINE ID is a user, group or room ID: U, C or R followed by 32 characters 0-9 a-f.");
  }
  return text;
}

/** A LINE channel access token: long, printable, no spaces. */
export function validateLineToken(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 20 || text.length > 500 || !/^[A-Za-z0-9+/=._-]+$/.test(text)) {
    throw new ApiError(400, "monitor_alert_line_token_invalid", "Paste the LINE channel access token (long-lived) from the LINE Developers console.");
  }
  return text;
}

/** The last characters people may see to tell which token or URL is saved. */
export function secretHint(secret: string): string {
  return secret.slice(-4);
}

const binding = (siteId: number, channel: AlertChannel) => `tmt-monitor-alert:${siteId}:${channel}`;

export function sealAlertSecret(vault: VaultKeys, siteId: number, channel: AlertChannel, secret: string): SealedSecret {
  return sealBound(vault, binding(siteId, channel), secret);
}

export function openAlertSecret(vault: VaultKeys, siteId: number, channel: AlertChannel, sealed: SealedSecret): string {
  return openBound(vault, binding(siteId, channel), sealed);
}

function headline(message: AlertMessage): string {
  const subject =
    message.kind === "ProgramStopped"
      ? `${message.programName} stopped`
      : message.kind === "TMTDeskUnhealthy"
        ? `TMTDesk on ${message.agentName} is unhealthy`
        : message.kind === "AgentOffline"
          ? `${message.agentName} is offline`
          : message.title;
  switch (message.state) {
    case "open":
      return `🔴 ${message.siteName}: ${subject}`;
    case "escalated":
      return `🟠 ${message.siteName}: ${subject} (escalated to #${message.priority})`;
    case "resolved":
      return `🟢 Resolved · ${message.siteName}: ${subject}`;
    default:
      return `✅ Test from Site Monitor · ${message.siteName}`;
  }
}

function facts(message: AlertMessage): [string, string][] {
  const rows: [string, string][] = [
    ["Site", message.siteName],
    ["Location", message.location],
    ["Program", message.kind === "ProgramStopped" ? message.programName : ""],
    ["Machine", [message.agentName, message.machineName].filter(Boolean).join(" · ")],
    ["Since", message.state === "test" ? "" : message.openedAt],
    ["Resolved", message.state === "resolved" ? message.resolvedAt : ""],
    ["Escalation", message.state === "open" || message.state === "escalated" ? `Responsible person #${message.priority}` : ""],
  ];
  return rows.filter(([, value]) => value);
}

/** The plain text LINE shows; Thai names pass through unchanged. */
export function alertText(message: AlertMessage, link: string | null): string {
  const lines = [headline(message), ...facts(message).map(([label, value]) => `${label}: ${value}`)];
  if (message.state === "test") lines.push("LINE alerts for this site are working.");
  if (link) lines.push(link);
  return lines.join("\n").slice(0, LINE_TEXT_LIMIT);
}

export function linePushBody(to: string, message: AlertMessage, link: string | null) {
  return { to, messages: [{ type: "text", text: alertText(message, link) }] };
}

/** An Adaptive Card wrapped as a message: legacy incoming webhooks and Workflows both accept this shape. */
export function teamsCardBody(message: AlertMessage, link: string | null) {
  const colour = message.state === "resolved" || message.state === "test" ? "Good" : message.state === "escalated" ? "Warning" : "Attention";
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: headline(message), weight: "Bolder", size: "Medium", color: colour, wrap: true },
            { type: "FactSet", facts: facts(message).map(([title, value]) => ({ title, value })) },
            ...(message.state === "test" ? [{ type: "TextBlock", text: "Teams alerts for this site are working.", wrap: true }] : []),
          ],
          ...(link ? { actions: [{ type: "Action.OpenUrl", title: "Open Site Monitor", url: link }] } : {}),
        },
      },
    ],
  };
}

type ChannelRow = {
  channel: AlertChannel;
  target: string;
  secret_cipher: Buffer;
  secret_iv: Buffer;
  secret_tag: Buffer;
  key_id: number;
};

/** Sends Site Monitor alerts to the channels a site configured. Never throws from notifySite. */
export class MonitorAlertSender {
  constructor(
    private readonly database: Database,
    private readonly vault: VaultKeys | undefined,
    private readonly fetcher: typeof fetch,
    private readonly log: FastifyBaseLogger,
    private readonly applicationBaseUrl: string | undefined,
  ) {}

  get configured(): boolean {
    return this.vault !== undefined;
  }

  /** The Site Monitor page on the private address, for the button on the card; null when not configured. */
  link(): string | null {
    return this.applicationBaseUrl ? `${this.applicationBaseUrl.replace(/\/$/, "")}/#/site-monitor` : null;
  }

  /** Sends one message to one channel; throws an ApiError carrying the provider's status (never the secret). */
  async send(channel: AlertChannel, secret: string, target: string, message: AlertMessage): Promise<void> {
    const link = this.link();
    const request: RequestInit =
      channel === "Line"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify(linePushBody(target, message, link)),
          }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teamsCardBody(message, link)) };
    let response: Response;
    try {
      response = await this.fetcher(channel === "Line" ? LINE_PUSH_URL : secret, { ...request, redirect: "error", signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "could not connect";
      throw new ApiError(502, "monitor_alert_send_failed", `${channel === "Line" ? "LINE" : "Teams"} ${reason}.`);
    }
    if (!response.ok) {
      // LINE answers {"message": "..."}; the text never contains the token. Teams answers plain text.
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      throw new ApiError(502, "monitor_alert_send_failed", `${channel === "Line" ? "LINE" : "Teams"} answered HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  }

  async notifySite(siteId: number, message: AlertMessage): Promise<void> {
    if (!this.vault) return;
    const vault = this.vault;
    const rows = await this.database.query<ChannelRow>(
      `SELECT channel, target, secret_cipher, secret_iv, secret_tag, key_id
       FROM dbo.monitor_site_alert_channels WHERE site_id = @site AND is_enabled = 1;`,
      (request) => request.input("site", sql.BigInt, siteId),
    );
    for (const row of rows.recordset) {
      let error: string | null = null;
      try {
        const secret = openAlertSecret(vault, siteId, row.channel, { cipher: row.secret_cipher, iv: row.secret_iv, tag: row.secret_tag, keyId: Number(row.key_id) });
        await this.send(row.channel, secret, row.target, message);
      } catch (reason) {
        error = reason instanceof Error ? reason.message.slice(0, 300) : "Sending failed.";
        this.log.warn({ siteId, channel: row.channel, state: message.state, error }, "Site Monitor alert not delivered");
      }
      await this.database
        .query(
          `UPDATE dbo.monitor_site_alert_channels
           SET last_sent_at = CASE WHEN @error IS NULL THEN SYSUTCDATETIME() ELSE last_sent_at END, last_error = @error
           WHERE site_id = @site AND channel = @channel;`,
          (request) => {
            request.input("site", sql.BigInt, siteId);
            request.input("channel", sql.NVarChar(10), row.channel);
            request.input("error", sql.NVarChar(300), error);
          },
        )
        .catch(() => undefined);
    }
  }
}
