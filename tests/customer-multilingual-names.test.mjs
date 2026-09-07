import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("customer and site-contact names have durable Thai, English and Japanese columns", async () => {
  const [migration, fresh] = await Promise.all([
    read("../database/migrations/030_customer_multilingual_names.sql"),
    read("../database/scripts/020_deploy_fresh_database.sql"),
  ]);
  assert.match(migration, /ALTER TABLE dbo\.customers ADD[\s\S]*name_th nvarchar\(300\)[\s\S]*name_en nvarchar\(300\)[\s\S]*name_ja nvarchar\(300\)/);
  assert.match(migration, /ALTER TABLE dbo\.customer_site_contacts ADD[\s\S]*name_th nvarchar\(200\)[\s\S]*name_en nvarchar\(200\)[\s\S]*name_ja nvarchar\(200\)/);
  assert.match(migration, /VALUES \(30, N'Customer and contact names in Thai, English and Japanese'\)/);
  assert.match(fresh, /030_customer_multilingual_names\.sql/);
});

test("customer APIs read and write every localized name with contact role data", async () => {
  const [sales, master, bootstrap] = await Promise.all([
    read("../backend-node/src/routes/sales-customers.ts"),
    read("../backend-node/src/routes/master.ts"),
    read("../backend-node/src/routes/bootstrap.ts"),
  ]);
  for (const source of [sales, master, bootstrap]) {
    assert.match(source, /name_th/); assert.match(source, /name_en/); assert.match(source, /name_ja/);
  }
  assert.match(sales, /department,position/);
  assert.match(master, /contactNameTh/);
  assert.match(bootstrap, /contact_name_th/);
});

test("both customer entry surfaces expose all names and map multilingual OCR without overwriting position or department", async () => {
  const [inquiry, master] = await Promise.all([
    read("../app/system/production/InquiryCustomerFields.tsx"),
    read("../app/system/production/AdminAnalyticsScreens.tsx"),
  ]);
  for (const source of [inquiry, master]) {
    for (const key of ["nameTh", "nameEn", "nameJa", "position", "department"]) assert.match(source, new RegExp(key));
    assert.match(source, /localizedNamesFromCard/);
  }
  assert.match(inquiry, /contactNameTh/); assert.match(inquiry, /contactNameEn/); assert.match(inquiry, /contactNameJa/);
});

test("localized-name helper keeps each OCR language and uses English as the canonical compatibility name", async () => {
  const source = await read("../app/system/production/customer-localized-names.ts");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const names = helper.localizedNamesFromCard([
    { language: "th", value: "บริษัท ตัวอย่าง จำกัด" },
    { language: "en", value: "Example Co., Ltd." },
    { language: "ja", value: "サンプル株式会社" },
  ], "");
  assert.deepEqual({ ...names }, { nameTh: "บริษัท ตัวอย่าง จำกัด", nameEn: "Example Co., Ltd.", nameJa: "サンプル株式会社" });
  assert.equal(helper.canonicalLocalizedName(names), "Example Co., Ltd.");
});
