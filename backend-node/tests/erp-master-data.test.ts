import assert from "node:assert/strict";
import test from "node:test";
import { addressLine, appParty, coreKey, customerCodeFor, masterListArguments, MasterShapeError, matchParty, nameKey, readMasterPage, supplierCodeFor,
  taxKey, websiteOf } from "../src/erp-master-data.js";

test("a register page keeps each keyed record once, cut to the columns, with the ERP's cursor and time", () => {
  const page = readMasterPage("customers", {
    customers: [
      { customer_id: 101, customer_code: "C-1", name_en: "  ABC   Co., Ltd. ", tax_id: "0105540000001", is_active: true, merged_into: null, updated_at: "2026-11-01T00:00:00Z" },
      { customer_id: 102, customer_code: "C-2", name: "บริษัท สยาม จำกัด", is_active: 0, merged_into: 101 },
      { customer_id: 101, customer_code: "C-1", name_en: "ABC Co., Ltd. (renamed)" },
      { customer_code: "C-3", name_en: "code but no id" }, { name_en: "no key" }, null, "text",
    ],
    next_cursor: "abc", server_time: "2026-11-05T05:00:00Z",
  });
  // Keyed by customer_id: the ERP lets people edit customer_code (ERP team, 2026-11-04).
  assert.deepEqual(page.records.map((record) => [record.key, record.code, record.nameEn, record.nameTh, record.isActive, record.mergedInto]), [
    ["101", "C-1", "ABC Co., Ltd. (renamed)", "", true, null],
    ["102", "C-2", "", "บริษัท สยาม จำกัด", false, "101"],
  ]);
  assert.equal(page.nextCursor, "abc"); assert.equal(page.serverTime, "2026-11-05T05:00:00Z");
  assert.match(page.records[0]!.hash, /^[0-9a-f]{64}$/);
  assert.equal(readMasterPage("customers", { customers: [{ customer_id: 9, customer_code: "X", name_en: "A".repeat(400) }] }).records[0]!.nameEn.length, 300);
  // The same record read twice has the same hash, so an unchanged record is not applied again.
  const again = readMasterPage("customers", { customers: [{ customer_id: 101, customer_code: "C-1", name_en: "ABC Co., Ltd. (renamed)" }] });
  assert.equal(again.records[0]!.hash, page.records[0]!.hash);
});

test("suppliers are keyed by their ERP id, numbers included, and may carry only the search tool's name", () => {
  const page = readMasterPage("suppliers", { suppliers: [{ supplier_id: 41, supplier_code: "SUP-041", supplier_name: "Omron Electronics", approval_status: "APPROVED" }] });
  assert.deepEqual([page.records[0]!.key, page.records[0]!.code, page.records[0]!.nameEn, page.records[0]!.approvalStatus], ["41", "SUP-041", "Omron Electronics", "APPROVED"]);
  assert.equal(page.nextCursor, null); assert.equal(page.serverTime, null);
  // A merge into itself is no merge.
  assert.equal(readMasterPage("suppliers", { suppliers: [{ supplier_id: "7", merged_into: "7" }] }).records[0]!.mergedInto, null);
});

test("an answer without the register is refused whole", () => {
  assert.throws(() => readMasterPage("customers", { items: [] }), MasterShapeError);
  assert.throws(() => readMasterPage("suppliers", null), /suppliers_list without a "suppliers" list/);
  // Records keyed only by code, as migration 099 assumed, are a shape this code no longer reads: nothing is stored.
  assert.throws(() => readMasterPage("customers", { customers: [{ customer_code: "C-1", name_en: "ABC" }] }), /customers_list without customer_id/);
  assert.deepEqual(readMasterPage("customers", { customers: [], next_cursor: null }).records, [], "an empty page is a page");
});

test("the first round reads everything; later rounds ask what changed since the ERP's own time, closed and merged included", () => {
  assert.deepEqual(masterListArguments(null, null), { limit: 200 });
  assert.deepEqual(masterListArguments(null, "p2"), { limit: 200, cursor: "p2" });
  assert.deepEqual(masterListArguments("2026-11-05T05:00:00Z", null), { limit: 200, updated_since: "2026-11-05T05:00:00Z", include_inactive: true });
});

test("names meet across spelling, punctuation and legal form, in English and Thai", () => {
  assert.equal(nameKey("DAIICHI JITSUGYO (THAILAND) CO.,LTD"), nameKey("Daiichi Jitsugyo (Thailand) Co., Ltd."));
  assert.equal(coreKey("ABC Company Limited"), coreKey("ABC Co., Ltd."));
  assert.equal(coreKey("Siam Cement Public Company Limited"), coreKey("SIAM CEMENT PCL"));
  assert.equal(coreKey("บริษัท เอบีซี จำกัด (มหาชน)"), coreKey("เอบีซี"));
  assert.equal(coreKey("บจก. เอบีซี"), "เอบีซี");
  assert.notEqual(coreKey("ABC Engineering"), coreKey("ABC"));
  assert.equal(taxKey("0-1055-36000-00-0"), "0105536000000");
  assert.equal(taxKey("12-34"), "", "too few digits to identify a company");
});

test("one tax ID or one name links; several, a doubtful one or a taken one wait for an Admin; nothing alike is added", () => {
  const parties = [
    appParty(1, ["Daiichi Jitsugyo (Thailand)"], "", null),
    appParty(2, ["Twin Industries"], "", null),
    appParty(3, ["TWIN INDUSTRIES CO., LTD."], "", null),
    appParty(4, ["Thai Yamaha"], "", null),
    appParty(5, ["Omron"], "0105536000000", null),
    appParty(6, ["Linked Elsewhere Co., Ltd."], "", "C-OTHER"),
    appParty(7, ["Same Name Ltd."], "0105500000007", null),
  ];
  const match = (nameEn: string, taxId = "", key = "C-NEW", nameTh = "") => matchParty({ key, nameEn, nameTh, taxId }, parties);
  assert.deepEqual(match("DAIICHI JITSUGYO (THAILAND) CO., LTD."), { kind: "link", id: 1 });
  assert.deepEqual(match("Omron Electronics Co., Ltd.", "0-1055-36000-00-0"), { kind: "link", id: 5 }, "a tax ID links whatever the name");
  assert.deepEqual(match("Twin Industries Co., Ltd."), { kind: "review", ids: [2, 3] });
  assert.deepEqual(match("Thai Yamaha Motor Co., Ltd."), { kind: "review", ids: [4] }, "a short app name inside the ERP's full one is doubtful");
  assert.deepEqual(match("Linked Elsewhere Company Limited"), { kind: "review", ids: [6] }, "the only match already belongs to another ERP record");
  assert.deepEqual(match("Linked Elsewhere Company Limited", "", "C-OTHER"), { kind: "link", id: 6 }, "its own ERP record links again");
  assert.deepEqual(match("Same Name Ltd.", "0105500000099"), { kind: "review", ids: [7] }, "the same name under another tax ID is another branch or company");
  assert.deepEqual(match("Brand New Factory Co., Ltd."), { kind: "create" });
  assert.deepEqual(match("", "", "C-9", "บริษัท ใหม่ จำกัด"), { kind: "create" });
  assert.deepEqual(match("Co., Ltd."), { kind: "create" }, "a name of legal words only resembles nothing");
});

test("records added from the ERP keep its code when the app can hold it, and never take a code twice", () => {
  const taken = new Set(["C-0001", "ABC-TRADING"]);
  assert.equal(customerCodeFor({ key: "102", code: "C-0002", nameEn: "ABC", nameTh: "" }, taken), "C-0002");
  assert.equal(customerCodeFor({ key: "101", code: "C-0001", nameEn: "ABC Trading Co., Ltd.", nameTh: "" }, taken), "ABC-TRADING-2");
  assert.equal(customerCodeFor({ key: "103", code: "ลูกค้า 1", nameEn: "", nameTh: "ลูกค้า" }, taken), "CUS-1");
  assert.equal(supplierCodeFor({ key: "41", code: "SUP-041", nameEn: "Omron", nameTh: "" }, taken), "SUP-041");
  assert.equal(supplierCodeFor({ key: "42", code: "", nameEn: "Misumi Thailand", nameTh: "" }, taken), "MT");
  assert.equal(supplierCodeFor({ key: "43", code: "SUP-041", nameEn: "Mitsu Trading", nameTh: "" }, taken), "MT-2");
});

test("the registered address and website take the shapes the customer screens accept", () => {
  assert.equal(addressLine({ address: "1 Rama 4 Road", province: "Bangkok", postalCode: "10110" }), "1 Rama 4 Road Bangkok 10110");
  assert.equal(addressLine({ address: "x".repeat(400), province: "", postalCode: "" }).length, 300);
  assert.equal(websiteOf("www.example.co.th"), "https://www.example.co.th");
  assert.equal(websiteOf("http://example.com/a"), "http://example.com/a");
  assert.equal(websiteOf("not a site"), "");
});
