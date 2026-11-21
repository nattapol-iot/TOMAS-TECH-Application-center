import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the scanner offers import and rear-camera controls and reads the card through copilot, not on the device", async () => {
  const [scanner, customerForm, customerMaster, packageJson, route] = await Promise.all([
    read("../app/system/production/BusinessCardScanner.tsx"),
    read("../app/system/production/InquiryCustomerFields.tsx"),
    read("../app/system/production/AdminAnalyticsScreens.tsx"),
    read("../package.json"),
    read("../backend-node/src/routes/business-cards.ts"),
  ]);
  assert.match(scanner, /data-business-card-source="import"[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp/);
  assert.match(scanner, /data-business-card-source="camera"[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(scanner, /scanBusinessCardViaBackend\(image,/);
  // The card leaves the device now, so the heading must not claim otherwise.
  assert.doesNotMatch(scanner, /ไม่อัปโหลดรูป|บนเครื่องนี้|tesseract/i);
  assert.match(scanner, /ส่งรูปให้ Copilot/);
  assert.doesNotMatch(packageJson, /tesseract/);
  assert.match(route, /kind: "namecard"/);
  assert.match(customerForm, /<BusinessCardScanner disabled=\{busy\} onApply=\{applyBusinessCard\}/);
  assert.match(customerMaster, /!customer \? <BusinessCardScanner disabled=\{busy\} onApply=\{applyBusinessCard\}/);
});
