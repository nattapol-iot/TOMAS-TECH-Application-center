import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../src/config.js";
import { EmailService } from "../src/email.js";

const graphConfig: AppConfig["email"] = {
  mode: "MicrosoftGraph",
  tenantId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  clientSecret: "test-secret",
  senderUser: "iot-team-center@example.com",
  applicationBaseUrl: "https://iot.example.com",
};

test("disabled assignment email reports recipients without making a network request", async () => {
  let calls = 0;
  const service = new EmailService({ mode: "Disabled" }, (async () => { calls += 1; return new Response(); }) as typeof fetch);
  const result = await service.sendEstimateAssignment({
    estimateId: 1, estimateNumber: "EST-1", projectName: "Robot", section: "01 Hardware", dueDate: "2026-09-30",
    assignedBy: "Manager", recipients: [{ name: "Engineer", email: "Engineer@Example.com" }],
  });
  assert.deepEqual(result, { status: "disabled", recipients: ["engineer@example.com"] });
  assert.equal(calls, 0);
});

test("Microsoft Graph assignment email deduplicates recipients, escapes HTML and reuses the access token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token-1", expires_in: 3600 });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const service = new EmailService(graphConfig, fetcher);
  const message = {
    estimateId: 7, estimateNumber: "EST-7", projectName: "Cell <A>", section: "01 Hardware", dueDate: "2026-09-30",
    assignedBy: "Manager & Lead", recipients: [
      { name: "Engineer One", email: "one@example.com" },
      { name: "Duplicate", email: " ONE@example.com " },
      { name: "Engineer Two", email: "two@example.com" },
    ],
  };
  assert.equal((await service.sendEstimateAssignment(message)).status, "sent");
  assert.equal((await service.sendEstimateAssignment({ ...message, estimateId: 8 })).status, "sent");
  assert.equal(calls.filter((call) => call.url.includes("/oauth2/v2.0/token")).length, 1);
  assert.equal(calls.filter((call) => call.url.includes("/sendMail")).length, 2);
  const sent = JSON.parse(String(calls.find((call) => call.url.includes("/sendMail"))!.init!.body)) as { message: { body: { content: string }; toRecipients: unknown[] } };
  assert.equal(sent.message.toRecipients.length, 2);
  assert.match(sent.message.body.content, /Cell &lt;A&gt;/);
  assert.match(sent.message.body.content, /Manager &amp; Lead/);
  assert.doesNotMatch(sent.message.body.content, /Cell <A>/);
});

test("Microsoft Graph failure does not throw after the assignment has been committed", async () => {
  const fetcher = (async (input: Parameters<typeof fetch>[0]) => String(input).includes("/oauth2/v2.0/token")
    ? Response.json({ access_token: "token-1", expires_in: 3600 })
    : new Response("blocked", { status: 403 })) as typeof fetch;
  const service = new EmailService(graphConfig, fetcher);
  const result = await service.sendEstimateAssignment({
    estimateId: 1, estimateNumber: "EST-1", projectName: "Robot", section: "01 Hardware", dueDate: "2026-09-30",
    assignedBy: "Manager", recipients: [{ name: "Engineer", email: "engineer@example.com" }],
  });
  assert.deepEqual(result, { status: "failed", recipients: ["engineer@example.com"] });
});

test("an inquiry assignment names the inquiry, escapes the project and reports a disabled mailer", async () => {
  let calls = 0;
  const offline = new EmailService({ mode: "Disabled" }, (async () => { calls += 1; return new Response(); }) as typeof fetch);
  const message = {
    inquiryId: 12, inquiryNumber: "INQ-2609-0012", projectName: "Line <B> retrofit", customerName: "JVCKENWOOD",
    dueDate: "2026-10-06", priority: "Normal", assignedBy: "Sales & CRM",
    recipients: [{ name: "Chalermchai", email: "Chalermchai@Example.com" }],
  };
  assert.deepEqual(await offline.sendInquiryAssignment(message), { status: "disabled", recipients: ["chalermchai@example.com"] });
  assert.equal(calls, 0);

  const sent: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    sent.push({ url: String(input), ...(init ? { init } : {}) });
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token-1", expires_in: 3600 });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  assert.equal((await new EmailService(graphConfig, fetcher).sendInquiryAssignment(message)).status, "sent");
  const payload = JSON.parse(String(sent.find((call) => call.url.includes("/sendMail"))!.init!.body)) as { message: { subject: string; body: { content: string } } };
  assert.match(payload.message.subject, /INQ-2609-0012/);
  assert.match(payload.message.body.content, /Line &lt;B&gt; retrofit/);
  assert.doesNotMatch(payload.message.body.content, /Line <B> retrofit/);
  assert.match(payload.message.body.content, /JVCKENWOOD/);
});

test("an inquiry assignment survives a Microsoft Graph outage", async () => {
  const fetcher = (async (input: Parameters<typeof fetch>[0]) => String(input).includes("/oauth2/v2.0/token")
    ? Response.json({ access_token: "token-1", expires_in: 3600 })
    : new Response("blocked", { status: 403 })) as typeof fetch;
  const result = await new EmailService(graphConfig, fetcher).sendInquiryAssignment({
    inquiryId: 1, inquiryNumber: "INQ-1", projectName: "Robot", customerName: "Customer",
    dueDate: "2026-10-06", priority: "High", assignedBy: "Manager",
    recipients: [{ name: "Engineer", email: "engineer@example.com" }],
  });
  assert.deepEqual(result, { status: "failed", recipients: ["engineer@example.com"] });
});
