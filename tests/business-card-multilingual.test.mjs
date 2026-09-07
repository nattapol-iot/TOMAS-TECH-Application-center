import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/business-card.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseBusinessCard } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const names = (candidates) => Object.fromEntries(candidates.map(({ language, value }) => [language, value]));

test("keeps printed Thai, English and Japanese company/contact names without translating", () => {
  const result = parseBusinessCard(`บริษัท คิริว ประเทศไทย จำกัด
KIRIU (THAILAND) CO., LTD.
キリウ株式会社
คุณสมชาย ใจดี
Mr. Somchai Jaidee
氏名：山田 太郎
Sales Manager
営業部
Email: somchai@example.com
ที่อยู่: 88/8 หมู่ 5 ชลบุรี 20000`);
  assert.deepEqual(names(result.companyNames), {
    th: "คิริว ประเทศไทย จำกัด", en: "KIRIU (THAILAND) CO., LTD.", ja: "キリウ株式会社",
  });
  assert.deepEqual(names(result.contactNames), { th: "สมชาย ใจดี", en: "Somchai Jaidee", ja: "山田 太郎" });
  assert.equal(result.companyName, "คิริว ประเทศไทย จำกัด");
  assert.equal(result.email, "somchai@example.com");
});

test("extracts spaced and labeled unspaced Japanese names and Japanese addresses", () => {
  for (const printed of ["山田 太郎", "氏名：山田太郎", "お名前：山田太郎 様"]) {
    const result = parseBusinessCard(`株式会社トーマス\n${printed}\n技術部\n課長\n住所：東京都港区芝公園1-2-3\n電話 03-1234-5678`);
    assert.equal(result.companyName, "株式会社トーマス");
    assert.equal(result.contactName, printed.startsWith("山田 ") ? "山田 太郎" : "山田太郎");
    assert.equal(result.department, "技術部");
    assert.equal(result.position, "課長");
    assert.equal(result.address, "東京都港区芝公園1-2-3");
    assert.equal(result.phone, "03-1234-5678");
  }
});

test("never fills a contact name from additional positions, departments or certification text", () => {
  const result = parseBusinessCard(`有限会社トーマス\nSales Manager\nSenior Engineer\n代表取締役\n営業部\n品質保証部\nTUV NORD CERT GmbH\nIATF 16949`);
  assert.equal(result.contactName, "");
  assert.deepEqual(result.contactNames, []);
  assert.equal(result.address, "");
});

test("certification numbers and English rd/st substrings do not become addresses", () => {
  const result = parseBusinessCard(`KIRIU\nMr. Richard West\nTUVNORD\nTUV NORD CERT GmbH\nIATF 16949\nISO 9001\n88/8 Industrial Road, Bangkok 10110`);
  assert.equal(result.contactName, "Richard West");
  assert.equal(result.address, "88/8 Industrial Road, Bangkok 10110");
  assert.equal(parseBusinessCard("KIRIU\nTUVNORD\nTUV NORD CERT GmbH\nIATF 16949").address, "");
});

test("picks legal company names over logo text and deduplicates each language", () => {
  const result = parseBusinessCard(`KIRIU\nKIRIU (THAILAND) CO., LTD.\nKIRIU (THAILAND) CO., LTD.\nName: Ekachai Rotsung\nชื่อ: เอกชัย รอดสูง\nCompany name: KIRIU (THAILAND) CO., LTD.`);
  assert.deepEqual(names(result.companyNames), { en: "KIRIU (THAILAND) CO., LTD." });
  assert.deepEqual(names(result.contactNames), { en: "Ekachai Rotsung", th: "เอกชัย รอดสูง" });
});

test("single-language cards do not invent alternatives in other languages", () => {
  const result = parseBusinessCard("TOMAS TECH CO., LTD.\nMr. Nattapol Poeam\nSales Engineer");
  assert.deepEqual(result.companyNames, [{ language: "en", value: "TOMAS TECH CO., LTD." }]);
  assert.deepEqual(result.contactNames, [{ language: "en", value: "Nattapol Poeam" }]);
});

test("uppercase English personal names do not become extra companies on a Japanese card", () => {
  const result = parseBusinessCard("株式会社サンプル\nTARO YAMADA\n氏名：山田太郎\n代表取締役");
  assert.deepEqual(result.companyNames, [{ language: "ja", value: "株式会社サンプル" }]);
  assert.deepEqual(names(result.contactNames), { en: "TARO YAMADA", ja: "山田太郎" });
});

test("handles the decomposed Thai Sara Am emitted by OCR in a legal company name", () => {
  const result = parseBusinessCard("บริษัท ตัวอย่าง จ\u0e4d\u0e32กัด\nคุณสมชาย ใจดี");
  assert.equal(result.companyName, "ตัวอย่าง จำกัด");
  assert.deepEqual(result.companyNames, [{ language: "th", value: "ตัวอย่าง จำกัด" }]);
});
