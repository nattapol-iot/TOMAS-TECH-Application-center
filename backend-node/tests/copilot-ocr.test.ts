import assert from "node:assert/strict";
import test from "node:test";
import { businessCardFromScan } from "../src/copilot-ocr/business-card.js";
import { CopilotOcrError, createCopilotOcr } from "../src/copilot-ocr/client.js";
import { quotationFromScan } from "../src/copilot-ocr/quotation.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const file = { name: "card.jpg", type: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) };

function vault(tokens: string[]) {
  const dropped: string[] = [];
  return {
    dropped,
    source: {
      accessToken: async () => tokens.shift() ?? null,
      dropAccess: (subject: string) => {
        dropped.push(subject);
      },
    },
  };
}

test("a scan still queued after the first wait is polled until done, with the person's token on every call", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const replies = [
    json(202, { job_id: "job 1", state: "queued" }),
    json(202, { job_id: "job 1", state: "running" }),
    json(200, { job_id: "job 1", state: "done", document: { kind: "namecard", data: { emails: ["a@b.test"] }, web_url: "https://copilot/doc" } }),
  ];
  const { source } = vault(["token-a"]);
  const ocr = createCopilotOcr("https://copilot.test/api/v1/ocr", { ...source, accessToken: async () => "token-a" }, async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return replies.shift()!;
  });
  const document = await ocr.scan("subject-1", { kind: "namecard", files: [file] });
  assert.deepEqual(document, { kind: "namecard", data: { emails: ["a@b.test"] }, custom: null, customError: null, webUrl: "https://copilot/doc" });
  assert.equal(calls[0]!.url, "https://copilot.test/api/v1/ocr/scans");
  assert.equal(calls[1]!.url, "https://copilot.test/api/v1/ocr/scans/job%201?wait=110");
  assert.ok(calls.every((call) => call.auth === "Bearer token-a"));
});

test("a stale token is dropped and one fresh token is tried; a missing token means sign in again", async () => {
  const { source, dropped } = vault(["old", "new"]);
  const seen: string[] = [];
  const ocr = createCopilotOcr("https://copilot.test/ocr", source, async (_url, init) => {
    const auth = new Headers(init?.headers).get("authorization")!;
    seen.push(auth);
    return auth === "Bearer old" ? json(401, {}) : json(200, { job_id: "j", state: "done", document: { kind: "namecard", data: {} } });
  });
  await ocr.scan("subject-2", { kind: "namecard", files: [file] });
  assert.deepEqual(seen, ["Bearer old", "Bearer new"]);
  assert.deepEqual(dropped, ["subject-2"]);

  const signedOut = createCopilotOcr("https://copilot.test/ocr", vault([]).source, async () => json(200, {}));
  await assert.rejects(signedOut.scan("nobody", { kind: "namecard", files: [file] }), (error: unknown) => error instanceof CopilotOcrError && error.reason === "signed_out");
});

test("a scan copilot could not read, or one still queued at the deadline, is an error and not an empty result", async () => {
  const failed = createCopilotOcr("https://copilot.test/ocr", vault(["t"]).source, async () => json(200, { job_id: "j", state: "error", error: "blank page" }));
  await assert.rejects(failed.scan("s", { kind: "quotation", files: [file] }), (error: unknown) => error instanceof CopilotOcrError && error.reason === "unreadable" && error.message === "blank page");

  let clock = 0;
  const slow = createCopilotOcr(
    "https://copilot.test/ocr",
    { accessToken: async () => "t", dropAccess: () => undefined },
    async () => {
      clock += 100_000;
      return json(202, { job_id: "j", state: "queued" });
    },
    () => clock,
  );
  await assert.rejects(slow.scan("s", { kind: "quotation", files: [file] }), (error: unknown) => error instanceof CopilotOcrError && error.reason === "timeout");
});

test("a name card keeps every printed script once, prefers a mobile number and links back to the copilot scan", () => {
  const card = businessCardFromScan({
    kind: "namecard",
    webUrl: "https://copilot/namecard?doc=9",
    data: {
      company: { th: "บริษัท โทมัส เทค จำกัด", en: "TOMAS TECH CO., LTD.", ja: null },
      name: { en: "Somchai Jaidee", th: "", ja: "" },
      title: { en: "Sales Engineer" },
      department: { th: "ฝ่ายขาย" },
      emails: ["somchai@tomastc.test"],
      urls: ["https://tomastc.test"],
      phones: [
        { kind: "tel", number: "02-000-0000" },
        { kind: "mobile", number: "081-234-5678" },
      ],
      addresses: [{ label: null, raw: { en: null, th: "88/8 ถนนพระราม 9 กรุงเทพ" } }],
    },
  });
  assert.deepEqual(card, {
    companyName: "บริษัท โทมัส เทค จำกัด",
    contactName: "Somchai Jaidee",
    companyNames: [
      { language: "th", value: "บริษัท โทมัส เทค จำกัด" },
      { language: "en", value: "TOMAS TECH CO., LTD." },
    ],
    contactNames: [{ language: "en", value: "Somchai Jaidee" }],
    email: "somchai@tomastc.test",
    phone: "081-234-5678",
    website: "https://tomastc.test",
    position: "Sales Engineer",
    department: "ฝ่ายขาย",
    address: "88/8 ถนนพระราม 9 กรุงเทพ",
    documentUrl: "https://copilot/namecard?doc=9",
  });
});

test("a quotation fills the form shape, derives the validity date from a printed period and drops empty rows", () => {
  const parsed = quotationFromScan({
    kind: "quotation",
    data: {},
    custom: {
      supplier_name: "ACME TRADING CO., LTD.",
      supplier_tax_id: "0105-5560-12345",
      quotation_number: "QT-2611-004",
      issue_date: "2026-11-20",
      valid_until: null,
      validity_days: 30,
      currency: "usd",
      total_amount: 1284,
      lines: [
        { item_code: "CT-2", description: "Cable tray 2m", qty: 4, unit: "pcs", unit_price: 300, line_total: 1200, brand: null },
        { description: null, item_code: null, qty: null },
      ],
    },
  });
  assert.equal(parsed.validUntil, "2026-12-20");
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.supplierTaxId, "0105556012345");
  assert.deepEqual(parsed.lines, [
    { lineNo: 1, itemCode: "CT-2", description: "Cable tray 2m", brand: "", model: "", qty: 4, unit: "pcs", unitPrice: 300, lineTotal: 1200, currency: "USD", remark: "" },
  ]);
  assert.deepEqual(parsed.confidence, { supplierName: "high", supplierTaxId: "high", quotationNumber: "high", receivedDate: "high", validUntil: "high", totalAmount: "high" });
  assert.equal(quotationFromScan({ kind: "quotation", data: {}, custom: { currency: "GBP" } }).currency, "THB");
});
