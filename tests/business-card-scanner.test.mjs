import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../lib/business-card.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "business-card.ts",
}).outputText;
const parser = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("extracts the reusable customer and contact fields from an English business card", () => {
  const result = parser.parseBusinessCard(`
TOMAS TECH CO., LTD.
Mr. Nattapol Poeam
Sales Engineering Manager
Industrial Automation Department
Email: nattapol.p@tomas-tech.co.th
Mobile: +66 81 234 5678
Address: 88/8 Moo 5, Bang Phli, Samut Prakan 10540
www.tomas-tech.co.th
`, 91.7);
  assert.equal(result.companyName, "TOMAS TECH CO., LTD.");
  assert.equal(result.contactName, "Nattapol Poeam");
  assert.equal(result.email, "nattapol.p@tomas-tech.co.th");
  assert.equal(result.phone, "+66 81 234 5678");
  assert.equal(result.position, "Sales Engineering Manager");
  assert.equal(result.department, "Industrial Automation Department");
  assert.match(result.address, /Bang Phli/);
  assert.equal(result.confidence, 92);
  assert.equal(parser.countBusinessCardFields(result), 7);
});

test("extracts Thai names, roles, phone and address without treating the postal code as a phone", () => {
  const result = parser.parseBusinessCard(`
บริษัท โทมัส เทค จำกัด
คุณสมชาย ใจดี
ผู้จัดการฝ่ายขาย
ฝ่ายวิศวกรรม
โทรศัพท์ 02-123-4567
อีเมล somchai@example.co.th
ที่อยู่: 99 ถนนสุขุมวิท เขตวัฒนา กรุงเทพฯ 10110
`, 84);
  assert.equal(result.companyName, "โทมัส เทค จำกัด");
  assert.equal(result.contactName, "สมชาย ใจดี");
  assert.equal(result.email, "somchai@example.co.th");
  assert.equal(result.phone, "02-123-4567");
  assert.equal(result.position, "ผู้จัดการฝ่ายขาย");
  assert.equal(result.department, "วิศวกรรม");
  assert.match(result.address, /10110/);
});

test("keeps low-information OCR honest instead of inventing structured values", () => {
  const result = parser.parseBusinessCard("blur\n---\n12345", 12);
  assert.equal(result.companyName, "");
  assert.equal(result.contactName, "");
  assert.equal(result.email, "");
  assert.equal(result.phone, "");
  assert.equal(parser.countBusinessCardFields(result), 0);
});

test("scanner offers distinct import and rear-camera controls and uses local OCR assets", async () => {
  const scanner = await readFile(new URL("../app/system/production/BusinessCardScanner.tsx", import.meta.url), "utf8");
  const customerForm = await readFile(new URL("../app/system/production/InquiryCustomerFields.tsx", import.meta.url), "utf8");
  const customerMaster = await readFile(new URL("../app/system/production/AdminAnalyticsScreens.tsx", import.meta.url), "utf8");
  const assetScript = await readFile(new URL("../scripts/prepare-ocr-assets.mjs", import.meta.url), "utf8");
  assert.match(scanner, /data-business-card-source="import"[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp/);
  assert.match(scanner, /data-business-card-source="camera"[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(scanner, /createWorker\(\["tha", "eng", "jpn"\]/);
  assert.match(scanner, /workerPath: `\$\{origin\}\/ocr\/worker\.min\.js`/);
  assert.match(scanner, /gzip: false/);
  assert.match(customerForm, /<BusinessCardScanner disabled=\{busy\} onApply=\{applyBusinessCard\}/);
  assert.match(customerMaster, /!customer \? <BusinessCardScanner disabled=\{busy\} onApply=\{applyBusinessCard\}/);
  assert.match(assetScript, /"eng\.traineddata"/);
  assert.match(assetScript, /"tha\.traineddata"/);
});
