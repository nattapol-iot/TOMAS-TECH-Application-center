import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_LABOR_PACKAGES,
  STANDARD_LABOR_SOURCE_DATE,
  STANDARD_SUPPORT_COST_TEMPLATES,
  laborReferenceTotal,
  supportReferenceTotal,
} from "../src/standard-labor-cost-masters.js";

const labor = Object.fromEntries(STANDARD_LABOR_PACKAGES.map((item) => [item.code, laborReferenceTotal(item)]));
const support = Object.fromEntries(STANDARD_SUPPORT_COST_TEMPLATES.map((item) => [item.code, supportReferenceTotal(item)]));
const amount = (values: Record<string, number>, code: string): number => {
  const value = values[code];
  assert.notEqual(value, undefined, `Missing standard master ${code}`);
  return value!;
};

test("standard labor library preserves the approved Excel arithmetic", () => {
  assert.equal(STANDARD_LABOR_SOURCE_DATE, "2026-09-10");
  assert.equal(amount(labor, "LP-STD-SW-DEVELOPMENT"), 192_500);
  assert.equal(amount(labor, "LP-STD-SW-SITE"), 63_000);
  assert.equal(amount(support, "MT-LAB-SW-SITE-SUPPORT"), 90_000);
  assert.equal(amount(labor, "LP-STD-SW-DEVELOPMENT") + amount(labor, "LP-STD-SW-SITE") + amount(support, "MT-LAB-SW-SITE-SUPPORT"), 345_500);

  assert.equal(amount(labor, "LP-STD-ME-DESIGN"), 490_000);
  assert.equal(amount(labor, "LP-STD-ME-SITE"), 136_500);
  assert.equal(amount(support, "MT-LAB-ME-SUPPORT"), 90_200);
  assert.equal(amount(labor, "LP-STD-ME-DESIGN") + amount(labor, "LP-STD-ME-SITE") + amount(support, "MT-LAB-ME-SUPPORT"), 716_700);

  assert.equal(amount(labor, "LP-STD-EE-DESIGN") + amount(labor, "LP-STD-EE-SITE") + amount(support, "MT-LAB-EE-INTERNAL-SUPPORT"), 64_550);
  assert.equal(amount(labor, "LP-STD-EE-SUB-IN") + amount(support, "MT-LAB-EE-SUB-IN-SUPPORT"), 17_600);
  assert.equal(amount(labor, "LP-STD-EE-SUB-OUT") + amount(support, "MT-LAB-EE-SUB-OUT-SUPPORT"), 235_400);
  assert.equal(amount(labor, "LP-STD-ME-SUB-ASSY") + amount(support, "MT-LAB-ME-SUB-ASSY-SUPPORT"), 379_500);
  assert.equal(amount(labor, "LP-STD-ME-SUB-PACK") + amount(support, "MT-LAB-ME-SUB-PACK-SUPPORT"), 66_000);
  assert.equal(amount(labor, "LP-STD-ME-SUB-DELIVERY") + amount(support, "MT-LAB-ME-SUB-DELIVERY-SUPPORT"), 222_750);
});

test("person-days are aggregate quantities and supporting costs stay outside labor", () => {
  const softwareSite = STANDARD_LABOR_PACKAGES.find((item) => item.code === "LP-STD-SW-SITE")!;
  assert.deepEqual(softwareSite.lines.map((line) => line.manDays), [4, 8, 6]);
  assert.ok(softwareSite.lines.every((line) => line.engineers === 1));
  assert.ok(STANDARD_SUPPORT_COST_TEMPLATES.flatMap((item) => item.lines).every((line) => ["08", "09", "10"].includes(line.categoryCode)));
  assert.ok(!STANDARD_LABOR_PACKAGES.flatMap((item) => item.lines).some((line) => /accommodation|transport|tool|safety/i.test(line.activity)));
});

test("standard codes and support item codes are unique for idempotent installation and estimate use", () => {
  const masterCodes = [...STANDARD_LABOR_PACKAGES, ...STANDARD_SUPPORT_COST_TEMPLATES].map((item) => item.code);
  assert.equal(new Set(masterCodes).size, masterCodes.length);
  assert.ok(masterCodes.every((code) => code.length <= 40));

  const itemCodes = STANDARD_SUPPORT_COST_TEMPLATES.flatMap((template) => template.lines.map((line) => line.itemCode));
  assert.equal(new Set(itemCodes).size, itemCodes.length);
  assert.ok(itemCodes.every((code) => code.length <= 100));
});
