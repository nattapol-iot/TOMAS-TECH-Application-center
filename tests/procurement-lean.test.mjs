import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const material = read("app/system/production/MaterialScreens.tsx");
const shell = read("app/system/ProductionApp.tsx");
const boms = read("backend-node/src/routes/boms.ts");
const requisitions = read("backend-node/src/routes/purchase-requisitions.ts");
const editor = read("app/system/production/PurchaseRequestEditor.tsx");
const sheet = read("lib/pr-spreadsheet.ts");

test("the PR sheet reserves no stock here, asks no supplier of the engineer and labels the estimate price honestly", () => {
  // Stock is kept in the company ERP; reserving here was a separate request per line made before the PR, and a failed PR left them behind.
  assert.doesNotMatch(editor, /\/reservations/);
  assert.doesNotMatch(editor, /suppliers/);
  assert.match(sheet, /lineType: "Planned", bomLineId: row\.bomLineId, quantity: row\.quantity, unitPrice: row\.unitPrice, priceSource: "Estimate"/);
  assert.match(requisitions, /const priceSources = \["Estimate", /);
  assert.match(material, /setCreating\(true\)/);
  assert.doesNotMatch(material, /function CreatePrModal|function ConvertPrModal/);
});

test("an approved PR goes to the ERP, which picks suppliers and raises the PO; nothing is ordered in this app", () => {
  // The ERP's Purchasing does what the in-app review and ERP-PO record did.
  assert.doesNotMatch(material, /\/suppliers`|\/erp-order|function ErpOrderModal|missingSuppliers/);
  assert.doesNotMatch(requisitions, /purchase-requisitions\/:id\/suppliers|purchase-requisitions\/:id\/erp-order|PURCHASING_REVIEW_STEP/);
  assert.doesNotMatch(material, /\/convert`/);
  assert.doesNotMatch(requisitions, /purchase-requisitions\/:id\/convert|INSERT INTO dbo\.mat_pos/);
  // Final approval sends it as the requester; the requester can send it again, and opening it reads the ERP's status.
  assert.match(requisitions, /decided\.status === "Approved" && erp\)[\s\S]*sendToErp\(id, decided\.requestedBy/);
  assert.match(requisitions, /notifyUsers\(transaction, \[decided\.requestedBy\], "PR_ERP_SEND"/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{id\}\/erp-send`/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{id\}\/erp-sync`/);
  assert.match(editor, /\/api\/v1\/erp\/purchasing\/options/);
  assert.match(shell, /item\.entityType === "PurchaseRequisition"\) setView\("purchase"\)/);
});

test("a BOM line without an inventory item can still be requested", () => {
  assert.doesNotMatch(boms, /nonStock \? 0 :/);
  assert.match(boms, /remainingToRequest\(/);
  assert.match(requisitions, /remainingToRequest\(/);
  assert.doesNotMatch(requisitions, /"stock_available"/);
});

test("a BOM is generated from the material categories only", () => {
  assert.match(boms, /ci\.category_code IN\(\$\{MATERIAL_CATEGORIES\}\)/);
  assert.match(boms, /AND \$\{MATERIAL_LINE\} ORDER BY l\.section_code/);
});

test("a draft PR can be cancelled and nothing offers Request Changes", () => {
  assert.match(requisitions, /app\.post\("\/api\/v1\/purchase-requisitions\/:id\/cancel"/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{cancelItem\.id\}\/cancel/);
  assert.doesNotMatch(material, /Request Changes/);
  assert.doesNotMatch(requisitions, /"Request Changes"\]/);
});

test("approvals ask for a comment only when rejecting, and show the server's answer inside the dialog", () => {
  assert.doesNotMatch(material, /requireComment busy=/);
  assert.equal((material.match(/requireComment=\{[a-z.]+ === "Reject"\}/g) ?? []).length, 4);
  assert.match(material, /<ActionError message=\{error \?\? ""\} \/>/);
});

test("the PR screen reads every held role before showing Approve", () => {
  assert.match(material, /roles\.includes\(item\.currentApproverRole \?\? ""\)/);
  assert.doesNotMatch(material, /item\.currentApproverRole === bootstrap\.user\.role/);
});

test("the Approvals badge counts procurement approvals, not estimates in review", () => {
  assert.match(shell, /apiRequest<\{ waiting: number \}>\("\/api\/v1\/procurement\/approvals\/attention"\)/);
  assert.match(shell, /if \(view === "approvals"\) return procurementApprovalCount;/);
  assert.doesNotMatch(shell, /if \(view === "approvals"\) return bootstrap\.counts\.approvals;/);
});
