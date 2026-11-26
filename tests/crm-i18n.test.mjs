import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CRM_COPY } from "../app/system/production/crm-copy.ts";

test("CRM copy provides nonempty Thai, English and Japanese for every key", () => {
  for (const [key, labels] of Object.entries(CRM_COPY))
    for (const language of ["th", "en", "jp"]) {
      assert.ok(labels[language]?.trim(), `${key}: ${language}`);
      assert.ok(!labels[language].includes("\uFFFD"), `${key}: invalid Unicode`);
    }
});

test("CRM literal UI keys, stages and follow-up statuses have translations", () => {
  // The screens and their forms on @tomas-tc/ui: every literal CRM key, whether t() is called on it or a component translates it.
  const source = [
    "../app/system/production/CrmScreens.tsx",
    "../app/system/tomas-ui/CrmForms.tsx",
    "../app/system/production/crm-records.ts",
    "../app/system/tomas-ui/CrmPages.tsx",
    "../app/system/tomas-ui/CrmPeoplePages.tsx",
    "../app/system/tomas-ui/CrmKitParts.tsx",
  ]
    .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
    .join("\n");
  const keys = [...source.matchAll(/"(CRM\.[A-Za-z_]+)"/g)].map((match) => match[1]);
  for (const key of [
    ...keys,
    ...[
      "NEW",
      "QUALIFICATION",
      "REQUIREMENT",
      "ESTIMATING",
      "PROPOSAL",
      "NEGOTIATION",
      "WON",
      "LOST",
      "ON_HOLD",
      "Open",
      "WaitingCustomer",
      "WaitingInternal",
      "WaitingSupplier",
      "Done",
      "Cancelled",
    ].map((code) => `CRM.${code}`),
  ])
    assert.ok(CRM_COPY[key], key);
});

test("handover and direct inquiry follow-up copy resolves in all languages", () => {
  for (const file of ["ProjectHandover.tsx", "InquirySalesFollowup.tsx", "CoreScreens.tsx", "InquiryScreens.tsx", "ExistingRfqWork.tsx"]) {
    const source = readFileSync(new URL(`../app/system/production/${file}`, import.meta.url), "utf8");
    for (const [, key] of source.matchAll(/"(CRM\.[A-Za-z]+)"/g)) assert.ok(CRM_COPY[key], `${file}: ${key}`);
  }
  for (const reason of ["projectExists", "sourceUnavailable", "awaitCostApproval", "awaitWon", "recordPo"]) assert.ok(CRM_COPY[`CRM.${reason}`]);
  assert.equal(CRM_COPY["CRM.costApproved"].en, "Cost approved");
});
