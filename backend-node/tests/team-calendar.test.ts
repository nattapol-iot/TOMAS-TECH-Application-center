import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../src/config.js";
import { EmailService } from "../src/email.js";
import { calendarActions, calendarEvent, calendarMime, calendarUid, eventTimes, foldLine, icsText, type CalendarState, type CalendarTask } from "../src/team-calendar.js";

/** Long lines arrive folded (CRLF and a space); reading them joins them again. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

const task: CalendarTask = {
  id: 31, kind: "Appointment", title: "Site survey, Line 2", customer: "ACME; Rayong", note: "Bring the PLC laptop", startDate: "2026-10-22", endDate: "2026-10-22",
  slot: "AM", startTime: null,
};

test("an entry is all day for a whole day or several days, otherwise a block of the Bangkok working day in UTC", () => {
  assert.deepEqual(eventTimes({ ...task, slot: "Day" }), { allDay: true, start: "20261022", end: "20261023" });
  assert.deepEqual(eventTimes({ ...task, endDate: "2026-10-24", startTime: "09:00" }), { allDay: true, start: "20261022", end: "20261025" });
  // 08:30-12:00 and 13:00-17:30 Bangkok are 01:30-05:00 and 06:00-10:30 UTC.
  assert.deepEqual(eventTimes(task), { allDay: false, start: "20261022T013000Z", end: "20261022T050000Z" });
  assert.deepEqual(eventTimes({ ...task, slot: "PM" }), { allDay: false, start: "20261022T060000Z", end: "20261022T103000Z" });
  assert.deepEqual(eventTimes({ ...task, slot: "PM", startTime: "13:30" }), { allDay: false, start: "20261022T063000Z", end: "20261022T103000Z" });
  assert.deepEqual(eventTimes({ ...task, slot: "Day", startTime: "10:00" }), { allDay: false, start: "20261022T030000Z", end: "20261022T103000Z" });
  // A time at or after the slot's end still gets an hour; one just after midnight Bangkok is the previous UTC day.
  assert.deepEqual(eventTimes({ ...task, startTime: "12:30" }), { allDay: false, start: "20261022T053000Z", end: "20261022T063000Z" });
  assert.deepEqual(eventTimes({ ...task, slot: "Day", startTime: "00:30" }).start, "20261021T173000Z");
});

test("a request and its cancellation are the same event, escaped and folded as RFC 5545 asks", () => {
  const options = { organizer: "iot-team-center@example.com", attendees: [{ name: "Napa K.", email: "napa@example.com" }, { name: "Wichai S.", email: "wichai@example.com" }], sequence: 7, link: "https://iot.example.com/#/resources", now: new Date("2026-10-21T10:00:00Z") };
  const request = unfold(calendarEvent(task, { ...options, method: "REQUEST" }));
  for (const line of [
    "METHOD:REQUEST", `UID:${calendarUid(31)}`, "SEQUENCE:7", "DTSTAMP:20261021T100000Z", "DTSTART:20261022T013000Z", "DTEND:20261022T050000Z",
    "SUMMARY:Site survey\\, Line 2 · ACME\\; Rayong", "LOCATION:ACME\\; Rayong", "ORGANIZER;CN=Engineering Center:mailto:iot-team-center@example.com",
    "STATUS:CONFIRMED", "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
  ]) assert.ok(request.includes(`\r\n${line}\r\n`), line);
  // Everyone on it is listed, so each copy shows who else is coming.
  assert.match(request, /ATTENDEE;CN="Napa K\.";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:napa@example\.com\r\nATTENDEE;CN="Wichai S\.";[^\r\n]*:mailto:wichai@example\.com/);
  assert.match(request, /DESCRIPTION:ACME\\; Rayong\\nBring the PLC laptop\\nhttps:\/\/iot\.example\.com\/#\/resources/);
  assert.ok(request.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"));
  const cancel = unfold(calendarEvent(task, { ...options, method: "CANCEL", sequence: 8 }));
  for (const line of ["METHOD:CANCEL", `UID:${calendarUid(31)}`, "SEQUENCE:8", "STATUS:CANCELLED", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"]) assert.ok(cancel.includes(`\r\n${line}\r\n`), line);
  // A task shows as free; an all-day one says so for Outlook.
  const allDay = unfold(calendarEvent({ ...task, kind: "Task", slot: "Day" }, { ...options, method: "REQUEST" }));
  assert.ok(allDay.includes("\r\nDTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261023\r\n"));
  assert.ok(allDay.includes("\r\nTRANSP:TRANSPARENT\r\n") && allDay.includes("\r\nX-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n"));
  assert.equal(icsText("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
  // Thai is three bytes a character: a long line folds without splitting one.
  const folded = foldLine(`SUMMARY:${"นัดลูกค้าดูหน้างาน".repeat(4)}`);
  for (const part of folded.split("\r\n")) assert.ok(Buffer.byteLength(part) <= 75, part);
  assert.equal(folded.split("\r\n").map((part, index) => (index ? part.slice(1) : part)).join(""), `SUMMARY:${"นัดลูกค้าดูหน้างาน".repeat(4)}`);
});

test("only a change to what the entry says, or to who is on it, is sent", () => {
  const state: CalendarState = { kind: "Appointment", title: "Survey", customer: "4", note: "", startDate: "2026-10-22", endDate: "2026-10-22", slot: "AM", startTime: null, assigneeIds: [9], status: "Planned" };
  const none = { cancel: [], request: [] };
  assert.deepEqual(calendarActions(null, state), { cancel: [], request: [9] });
  assert.deepEqual(calendarActions(null, { ...state, assigneeIds: [] }), none);
  assert.deepEqual(calendarActions(null, { ...state, kind: "Away" }), none);
  assert.deepEqual(calendarActions(state, { ...state, startDate: "2026-10-23", endDate: "2026-10-23" }), { cancel: [], request: [9] });
  assert.deepEqual(calendarActions(state, { ...state, assigneeIds: [7] }), { cancel: [9], request: [7] });
  assert.deepEqual(calendarActions(state, { ...state, assigneeIds: [] }), { cancel: [9], request: [] });
  // Someone joins or leaves: the people still on it get it again, listing who is coming now.
  assert.deepEqual(calendarActions(state, { ...state, assigneeIds: [9, 7] }), { cancel: [], request: [9, 7] });
  assert.deepEqual(calendarActions({ ...state, assigneeIds: [9, 7] }, state), { cancel: [7], request: [9] });
  assert.deepEqual(calendarActions(state, { ...state, status: "Cancelled" }), { cancel: [9], request: [] });
  assert.deepEqual(calendarActions({ ...state, status: "Cancelled" }, state), { cancel: [], request: [9] });
  // Done keeps the entry; nothing else changed, nothing is sent.
  assert.deepEqual(calendarActions(state, { ...state, status: "Done" }), none);
  assert.deepEqual(calendarActions({ ...state, assigneeIds: [9, 7] }, null), { cancel: [9, 7], request: [] });
});

test("the message is MIME with the calendar part Outlook reads as a meeting request", () => {
  const mime = calendarMime({ from: "iot-team-center@example.com", to: [{ name: "นภา", email: "napa@example.com" }, { name: "Wichai S.", email: "wichai@example.com" }], subject: "[Engineering Center] นัดดูหน้างาน",
    text: "plain", html: "<p>html</p>", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", method: "REQUEST", boundary: "b-1" });
  assert.match(mime, /^From: Engineering Center <iot-team-center@example\.com>\r\n/);
  assert.match(mime, /\r\nTo: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <napa@example\.com>, Wichai S\. <wichai@example\.com>\r\n/);
  assert.match(mime, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="b-1"/);
  assert.match(mime, /--b-1\r\nContent-Type: text\/calendar; charset=UTF-8; method=REQUEST\r\nContent-Transfer-Encoding: base64\r\n\r\nQkVHSU46VkNBTEVOREFSDQpFTkQ6VkNBTEVOREFSDQo=/);
  assert.ok(mime.endsWith("--b-1--\r\n"));
  const subject = /\r\nSubject: =\?UTF-8\?B\?([^?]+)\?=/.exec(mime)![1]!;
  assert.equal(Buffer.from(subject, "base64").toString("utf8"), "[Engineering Center] นัดดูหน้างาน");
});

const graphConfig: AppConfig["email"] = {
  mode: "MicrosoftGraph", tenantId: "11111111-1111-4111-8111-111111111111", clientId: "22222222-2222-4222-8222-222222222222",
  clientSecret: "test-secret", senderUser: "iot-team-center@example.com", applicationBaseUrl: "https://iot.example.com",
};

test("the invitation goes through Graph sendMail as base64 MIME, and a disabled mailbox sends nothing", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token-1", expires_in: 3600 });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const message = { method: "REQUEST" as const, task, recipients: [{ name: "Napa K.", email: " Napa@Example.com " }, { name: "Wichai S.", email: "wichai@example.com" }], sentBy: "Kamon <Sales>" };
  assert.deepEqual(await new EmailService(graphConfig, fetcher).sendTeamTaskCalendar(message), { status: "sent", recipients: ["napa@example.com", "wichai@example.com"] });
  // One message for everyone on it.
  assert.equal(calls.filter((call) => call.url.includes("/sendMail")).length, 1);
  const send = calls.find((call) => call.url.endsWith("/users/iot-team-center%40example.com/sendMail"))!;
  assert.equal((send.init!.headers as Record<string, string>)["Content-Type"], "text/plain");
  const mime = Buffer.from(String(send.init!.body), "base64").toString("utf8");
  assert.match(mime, /Content-Type: text\/calendar; charset=UTF-8; method=REQUEST/);
  const calendarPart = /method=REQUEST\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(mime)![1]!;
  const ics = unfold(Buffer.from(calendarPart.replace(/\r\n/g, ""), "base64").toString("utf8"));
  assert.match(ics, /\r\nATTENDEE;CN="Napa K\.";[^\r\n]*:mailto:napa@example\.com\r\n/);
  assert.match(ics, /\r\nORGANIZER;CN=Engineering Center:mailto:iot-team-center@example\.com\r\n/);
  const htmlPart = /text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(mime)![1]!;
  assert.match(Buffer.from(htmlPart.replace(/\r\n/g, ""), "base64").toString("utf8"), /Kamon &lt;Sales&gt;/);
  let disabledCalls = 0;
  const disabled = new EmailService({ mode: "Disabled" }, (async () => { disabledCalls += 1; return new Response(); }) as typeof fetch);
  assert.deepEqual(await disabled.sendTeamTaskCalendar(message), { status: "disabled", recipients: ["napa@example.com", "wichai@example.com"] });
  assert.equal(disabledCalls, 0);
});
