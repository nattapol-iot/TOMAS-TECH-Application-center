import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// The engineer chosen in "Create inquiry" used to be told nothing at all: the inquiry
// route had no notification of either kind, and app.ts did not even hand it the mailer.
test("the engineer assigned an inquiry is told, in the app and by email", async () => {
  const [route, app, email] = await Promise.all([
    read("backend-node/src/routes/inquiries.ts"),
    read("backend-node/src/app.ts"),
    read("backend-node/src/email.ts"),
  ]);
  assert.match(app, /registerInquiryRoutes\(app, config, database, users, email\)/);
  assert.match(email, /async sendInquiryAssignment\(message: InquiryAssignmentEmail\)/);
  assert.match(route, /notifyUsers\(transaction, \[notice\.ownerId\], "INQUIRY_ASSIGNED"/);
  assert.match(route, /await queueAssignmentNotice\(transaction, \{/);
  // Both write paths -- the create and the later re-assignment -- go through the one builder.
  assert.equal(route.split("await queueAssignmentNotice(transaction, {").length - 1, 2);
  assert.equal(route.split("await deliverAssignmentEmail(email,").length - 1, 2);
});

// A Microsoft Graph outage must never cost the company an inquiry, so the bell row is
// written inside the transaction and the mail leaves only after it has committed.
test("the bell is written inside the transaction and the mail is sent after it commits", async () => {
  const route = await read("backend-node/src/routes/inquiries.ts");
  const bell = route.indexOf("await notifyUsers(transaction");
  const returnedFromTransaction = route.indexOf("return { payload: { id, number, rowVersion:");
  const delivery = route.indexOf("const notification = await deliverAssignmentEmail(email, created.emailMessage);");
  const reply = route.indexOf('return reply.status(201).header("Location"');
  assert.ok(bell > 0 && returnedFromTransaction > bell, "the notification row is written before the transaction returns");
  assert.ok(delivery > returnedFromTransaction, "the mail is sent after the transaction callback has returned");
  assert.ok(reply > delivery, "the response reports the delivery state");
  // Microsoft Graph is reached from exactly one place, and that place is outside every
  // transaction callback -- no handler may call it directly.
  assert.equal(route.split("email.sendInquiryAssignment").length - 1, 1);
  assert.match(route, /return message \? email\.sendInquiryAssignment\(message\)/);
});

test("assigning to yourself, or re-saving the same owner, notifies nobody", async () => {
  const route = await read("backend-node/src/routes/inquiries.ts");
  assert.match(route, /if \(notice\.ownerId === actorId\) return null;/);
  assert.match(route, /Number\(current\.estimate_owner_id\) === estimateOwnerId \? null/);
  // Handing an inquiry back to a previous owner is a new event, not a duplicate.
  assert.match(route, /inquiry:\$\{notice\.inquiryId\}:assigned:\$\{notice\.ownerId\}:\$\{notice\.version\}/);
});

test("every screen that assigns an inquiry says whether the mail went out", async () => {
  const [client, crm, core, inquiry, shell] = await Promise.all([
    read("app/system/api-client.ts"),
    read("app/system/production/CrmScreens.tsx"),
    read("app/system/production/CoreScreens.tsx"),
    read("app/system/production/InquiryScreens.tsx"),
    read("app/system/ProductionApp.tsx"),
  ]);
  assert.match(client, /export const assignmentDeliveryNote = \(notification: AssignmentNotificationResult\)/);
  for (const [name, source] of [["CrmScreens", crm], ["CoreScreens", core], ["InquiryScreens", inquiry]]) {
    assert.match(source, /assignmentDeliveryNote\(/, `${name} reports the delivery state`);
  }
  // The CRM convert dialog can only report it if the shell passes a toast down.
  assert.match(shell, /<CrmScreen refreshBootstrap=\{refreshBootstrap\} notify=\{setToast\}/);
  assert.match(crm, /props\.notify\?\.\(/);
});
