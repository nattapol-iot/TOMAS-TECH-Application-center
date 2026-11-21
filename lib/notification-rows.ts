/*
 * Rows of the top-bar bell.
 *
 * Every support event (take, reply, status change, file) writes its own notification, and the stored
 * text is generic on purpose. A support member who took, answered and resolved a ticket in one go left
 * the reporter three rows that read the same, which the team reported as duplicates (2026-11-21).
 * Notifications of one ticket with the same read state now fold into one row at the place of the newest,
 * and the row says which ticket and what happened, from the event details the API adds (`support`).
 */

export type SupportNotice = {
  ticketNo: string;
  /** Null when the reader can no longer open the ticket. */
  subject: string | null;
  /** support_events.kind: Created, Assigned, Comment, Attachment, StatusChanged, Recognition, RecognitionAdjusted. */
  event: string | null;
  /** The status a StatusChanged event moved the ticket to. */
  status: string | null;
  actorName: string | null;
};

export type NoticeItem = {
  id: number;
  kind: string;
  title: string;
  detail: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: string;
  support?: SupportNotice | null;
};

export type NoticeRow<T extends NoticeItem> = {
  key: string;
  /** The newest notification of the row: it decides the place, the time and where a click goes. */
  item: T;
  /** Newest first, as the API sends them. */
  items: T[];
  ids: number[];
  isRead: boolean;
};

export function noticeRows<T extends NoticeItem>(items: readonly T[]): NoticeRow<T>[] {
  const rows: NoticeRow<T>[] = [];
  const byKey = new Map<string, NoticeRow<T>>();
  for (const item of items) {
    const key = item.entityType === "SupportTicket" && item.entityId
      ? `support:${item.entityId}:${item.isRead ? "read" : "unread"}`
      : `id:${item.id}`;
    const row = byKey.get(key);
    if (row) {
      row.items.push(item);
      row.ids.push(item.id);
      continue;
    }
    const created: NoticeRow<T> = { key, item, items: [item], ids: [item.id], isRead: item.isRead };
    byKey.set(key, created);
    rows.push(created);
  }
  return rows;
}

/** Dictionary keys of support-copy.ts the bell uses for each event. */
const EVENT_LABEL: Record<string, string> = {
  Created: "New ticket",
  Assigned: "Assigned",
  Comment: "New message",
  Attachment: "Attachment",
  Recognition: "Recognition",
  RecognitionAdjusted: "RecognitionAdjusted",
};

function eventText(notice: SupportNotice | null | undefined, label: (key: string) => string): string {
  if (notice?.event === "StatusChanged" && notice.status) return `${label("Status")}: ${label(notice.status)}`;
  const key = notice?.event ? EVENT_LABEL[notice.event] ?? notice.event : "Support update";
  return label(key);
}

/** Title and detail lines of a support row; `label` is the support dictionary in the reader's language. */
export function supportRowText<T extends NoticeItem>(row: NoticeRow<T>, label: (key: string) => string): { title: string; detail: string } {
  const notice = row.item.support;
  const title = notice?.ticketNo
    ? notice.subject ? `${notice.ticketNo} · ${notice.subject}` : notice.ticketNo
    : label(row.item.kind === "SUPPORT_RECOGNITION" ? "Support recognition" : "Support update");
  // Oldest first, so the line reads in the order things happened; repeats of one step count up.
  const steps: { text: string; count: number }[] = [];
  const actors: string[] = [];
  for (const item of [...row.items].reverse()) {
    const text = eventText(item.support, label);
    const last = steps[steps.length - 1];
    if (last?.text === text) last.count += 1;
    else steps.push({ text, count: 1 });
    const actor = item.support?.actorName;
    if (actor && !actors.includes(actor)) actors.push(actor);
  }
  if (!row.items.some((item) => item.support?.event)) return { title, detail: label("View ticket") };
  const what = steps.map((step) => (step.count > 1 ? `${step.text} ×${step.count}` : step.text)).join(" · ");
  return { title, detail: actors.length ? `${actors.join(", ")}: ${what}` : what };
}
