import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { estimateBusinessDate } from "../lib/estimate-ux.ts";

const root = new URL("../", import.meta.url);

test("the business day is the Bangkok date, not the UTC date, before 07:00", () => {
  // 00:30 on 6 October in Bangkok is still 5 October in UTC.
  assert.equal(estimateBusinessDate(new Date("2026-10-05T17:30:00.000Z")), "2026-10-06");
  assert.equal(estimateBusinessDate(new Date("2026-10-05T16:59:59.000Z")), "2026-10-05");
});

test("form defaults take today from the configured business day", async () => {
  // Stamp and grant validity, CRM convert due date, Master Plan start, My Work and procurement dates.
  for (const path of [
    "app/system/production/SigningScreens.tsx",
    "app/system/production/CrmScreens.tsx",
    "app/system/production/ProjectPlanFields.tsx",
    "app/system/production/PlanningPricingScreens.tsx",
    "app/system/production/MaterialScreens.tsx",
  ]) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/, path);
    // A browser-offset date is only right on devices set to Bangkok time. (A datetime-local
    // default that keeps the time, slice(0,16), is local by design and is not matched.)
    assert.doesNotMatch(source, /getTimezoneOffset\(\)[\s\S]{0,120}toISOString\(\)\.slice\(0, ?10\)/, path);
    assert.match(source, /estimateBusinessDate\(.*process\.env\.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?\?\? ?"Asia\/Bangkok"\)/, path);
  }
});
