// Outlook invitations for team-board work (owner decision 2026-10-22): an appointment or a task with people on it
// reaches their calendars as one meeting request from the system mailbox, listing everyone on it. A change sends the
// same event again (same UID, higher SEQUENCE); someone taken off it, a cancellation or a removal cancels it for them.
// Days away are never sent.

/** The parts of a team task its calendar entry is made from. */
export type CalendarTask = {
  id: number;
  kind: "Appointment" | "Task";
  title: string;
  customer: string;
  note: string;
  startDate: string;
  endDate: string;
  slot: "Day" | "AM" | "PM";
  startTime: string | null;
};

/**
 * The working day a morning or an afternoon stands for when no time was given (Bangkok time). A day's task without a
 * time is an all-day entry, and so is anything spanning several days.
 */
export const WORKING_HOURS = { start: "08:30", noon: "12:00", afternoon: "13:00", end: "17:30" } as const;
/** Bangkok has no daylight saving: local times convert to UTC with one fixed offset. */
const BANGKOK_OFFSET_MINUTES = 7 * 60;
const UID_DOMAIN = "iot-team-center";

/** A whole number that grows with every change, so Outlook applies the newest copy (seconds since 2026-01-01 UTC). */
export const calendarSequence = (now = Date.now()) => Math.max(0, Math.floor((now - Date.UTC(2026, 0, 1)) / 1000));
export const calendarUid = (taskId: number) => `team-task-${taskId}@${UID_DOMAIN}`;

const pad = (value: number) => String(value).padStart(2, "0");
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const compactDate = (date: string) => date.replaceAll("-", "");
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** A Bangkok wall-clock time on a date, as an iCalendar UTC timestamp. */
function utcStamp(date: string, minutes: number) {
  const at = new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - BANGKOK_OFFSET_MINUTES) * 60_000);
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}00Z`;
}
const stampOf = (moment: Date) => moment.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** When the entry starts and ends: an all-day span, or a block of the working day. */
export function eventTimes(task: Pick<CalendarTask, "startDate" | "endDate" | "slot" | "startTime">) {
  if (task.endDate > task.startDate || (task.slot === "Day" && !task.startTime))
    return { allDay: true as const, start: compactDate(task.startDate), end: compactDate(nextDay(task.endDate)) };
  const from = minutesOf(task.startTime ?? (task.slot === "PM" ? WORKING_HOURS.afternoon : WORKING_HOURS.start));
  let until = minutesOf(task.slot === "AM" ? WORKING_HOURS.noon : WORKING_HOURS.end);
  // A time at or after the slot's end still gets an hour.
  if (until <= from) until = from + 60;
  return { allDay: false as const, start: utcStamp(task.startDate, from), end: utcStamp(task.startDate, until) };
}

/** iCalendar TEXT: backslash, semicolon, comma and line breaks escaped. */
export const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets without splitting a UTF-8 character (RFC 5545 3.1). */
export function foldLine(line: string) {
  const parts: string[] = [];
  let current = "", size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character);
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) { parts.push(current); current = ""; size = 0; }
    current += character; size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** A meeting request (REQUEST) for everyone on it, or its cancellation (CANCEL) for the people it no longer includes. */
export function calendarEvent(task: CalendarTask, options: {
  method: "REQUEST" | "CANCEL"; organizer: string; attendees: { name: string; email: string }[]; sequence: number; link: string; now?: Date;
}) {
  const times = eventTimes(task);
  const busy = task.kind === "Appointment";
  const description = [task.customer, task.note, options.link].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//TOMAS TECH//Engineering Center Team Board//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method}`,
    "BEGIN:VEVENT",
    `UID:${calendarUid(task.id)}`,
    `SEQUENCE:${options.sequence}`,
    `DTSTAMP:${stampOf(options.now ?? new Date())}`,
    times.allDay ? `DTSTART;VALUE=DATE:${times.start}` : `DTSTART:${times.start}`,
    times.allDay ? `DTEND;VALUE=DATE:${times.end}` : `DTEND:${times.end}`,
    `SUMMARY:${icsText(task.customer ? `${task.title} · ${task.customer}` : task.title)}`,
    ...(task.customer ? [`LOCATION:${icsText(task.customer)}`] : []),
    `DESCRIPTION:${icsText(description)}`,
    `ORGANIZER;CN=Engineering Center:mailto:${options.organizer}`,
    // No replies: the organizer is the system mailbox, which nobody reads.
    ...options.attendees.map((attendee) =>
      `ATTENDEE;CN="${attendee.name.replace(/["\r\n]/g, "")}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendee.email}`),
    `STATUS:${options.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    // An appointment blocks the time; a task shows as free so a day of desk work does not refuse meetings.
    `TRANSP:${busy ? "OPAQUE" : "TRANSPARENT"}`,
    `X-MICROSOFT-CDO-BUSYSTATUS:${options.method === "CANCEL" ? "FREE" : busy ? "BUSY" : "FREE"}`,
    ...(times.allDay ? ["X-MICROSOFT-CDO-ALLDAYEVENT:TRUE"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** A header value in RFC 2047 form when it is not plain ASCII. */
const header = (value: string) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`);
const base64Lines = (value: string) => (Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g) ?? [""]).join("\r\n");

/**
 * The whole message as MIME: a text and an HTML body, and the iCalendar part Outlook turns into a meeting request.
 * Microsoft Graph sendMail takes it base64-encoded with Content-Type text/plain.
 */
export function calendarMime(message: {
  from: string; to: { name: string; email: string }[]; subject: string; text: string; html: string; ics: string; method: "REQUEST" | "CANCEL"; boundary: string;
}) {
  const part = (type: string, body: string) => [`--${message.boundary}`, `Content-Type: ${type}`, "Content-Transfer-Encoding: base64", "", base64Lines(body)].join("\r\n");
  return [
    `From: Engineering Center <${message.from}>`,
    `To: ${message.to.map((person) => `${header(person.name.replace(/[<>",]/g, ""))} <${person.email}>`).join(", ")}`,
    `Subject: ${header(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${message.boundary}"`,
    "",
    part("text/plain; charset=UTF-8", message.text),
    part("text/html; charset=UTF-8", message.html),
    part(`text/calendar; charset=UTF-8; method=${message.method}`, message.ics),
    `--${message.boundary}--`,
    "",
  ].join("\r\n");
}

/** The people whose calendars a task, in this state, belongs in. */
export const invitedPeople = (task: { kind: string; assigneeIds: readonly number[]; status: string }) =>
  task.kind !== "Away" && task.status !== "Cancelled" ? [...task.assigneeIds] : [];

/** The fields that change what the calendar entry says; a status change to Done alone sends nothing. */
const CALENDAR_FIELDS = ["kind", "title", "customer", "note", "startDate", "endDate", "slot", "startTime"] as const;

/** A task as the calendar compares it; a day away is a state too, never sent. */
export type CalendarState = Omit<Pick<CalendarTask, (typeof CALENDAR_FIELDS)[number]>, "kind"> & { kind: CalendarTask["kind"] | "Away"; assigneeIds: number[]; status: string };

/**
 * What to send when a task goes from `before` (null: new) to `after` (null: removed): a cancellation for the people
 * it no longer includes, and a request for everyone still on it when anyone joined or left (their copy lists who is
 * coming) or what it says changed.
 */
export function calendarActions(before: CalendarState | null, after: CalendarState | null) {
  const had = before ? invitedPeople(before) : [], has = after ? invitedPeople(after) : [];
  const cancel = had.filter((id) => !has.includes(id));
  const joined = has.some((id) => !had.includes(id));
  const changed = CALENDAR_FIELDS.some((field) => (before?.[field] ?? null) !== (after?.[field] ?? null));
  return { cancel, request: has.length && (joined || cancel.length > 0 || changed) ? has : [] };
}
