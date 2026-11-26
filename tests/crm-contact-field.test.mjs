import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CRM_COPY } from "../app/system/production/crm-copy.ts";
import { ApiClientError } from "../app/system/api-client.ts";
import { crmFailure, customerOption, isDirty, matchesSearch, missingFields, normalizeSearch, teamOptions } from "../app/system/production/crm-records.ts";

/*
 * The CRM forms and pickers on @tomas-tc/ui (CRM UX audit 2026-11-26). The first tests run the shared helpers; the rest
 * check that the screens use them (the kit itself is not loaded under node).
 */
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const screen = read("app/system/production/CrmScreens.tsx");
const forms = read("app/system/tomas-ui/CrmForms.tsx");
const records = read("app/system/production/crm-records.ts");
const crmCss = read("app/system/production/crm.css");

const ishida = {
  id: 4,
  code: "ISHIDA-THAILAND",
  name: "Ishida (Thailand) Co.,Ltd.",
  nameTh: "อิชิดะ (ประเทศไทย)",
  nameEn: "Ishida (Thailand) Co.,Ltd.",
  nameJa: "イシダ(タイランド)",
  shortName: "ISD",
  erpCode: "C000123",
  site: "Bangna",
};

test("a customer is found by its Thai, English and Japanese names, short name, code and ERP code, words in any order (CRM-12)", () => {
  const option = customerOption(ishida);
  assert.equal(option.value, "4");
  assert.equal(option.label, "Ishida (Thailand) Co.,Ltd.");
  // The second line tells look-alikes apart: code, ERP code and site.
  assert.equal(option.detail, "ISHIDA-THAILAND · ERP C000123 · Bangna");
  for (const typed of ["ishida", "ISHIDA", "  thailand   ishida ", "อิชิดะ", "イシダ", "isd", "c000123", "ishida-thai", "ＩＳＨＩＤＡ"]) assert.ok(matchesSearch(option, typed), typed);
  for (const typed of ["toyota", "ishida toyota"]) assert.ok(!matchesSearch(option, typed), typed);
  assert.ok(matchesSearch(option, ""), "an empty search lists everything");
  assert.equal(normalizeSearch("  A　 b  "), "a b");
  // An older API build without the short name or the ERP code still makes an entry.
  assert.equal(customerOption({ ...ishida, shortName: undefined, erpCode: null, site: "" }).detail, "ISHIDA-THAILAND");
});

test("people are found by name, department, nickname or email", () => {
  const [person] = teamOptions({ team: [{ id: 7, name: "Somchai Jaidee", department: "Sales", nickname: "Chai", email: "somchai@example.com" }] });
  assert.deepEqual([person.value, person.label, person.detail], ["7", "Somchai Jaidee", "Sales"]);
  for (const typed of ["somchai", "chai", "sales", "example.com"]) assert.ok(matchesSearch(person, typed), typed);
});

test("a refused save says what to fix: conflicts offer a reload, field errors point at the field (CRM-10)", () => {
  assert.deepEqual(crmFailure(new ApiClientError(409, "concurrency_conflict", "changed")), { key: "CRM.concurrency_conflict", conflict: true });
  assert.equal(crmFailure(new ApiClientError(422, "invalid_reference", "x")).key, "CRM.invalid_reference");
  assert.deepEqual(crmFailure(new ApiClientError(400, "crm_lost_reason_required", "x")), { key: "CRM.crm_lost_reason_required", field: "lostReason", detail: undefined });
  assert.equal(crmFailure(new ApiClientError(400, "crm_proposal_evidence_required", "x")).key, "CRM.evidenceHint");
  assert.equal(crmFailure(new ApiClientError(403, "something_else", "x")).key, "CRM.permission_denied");
  assert.deepEqual(crmFailure(new ApiClientError(400, "validation_failed", "Website must use HTTP or HTTPS.")), {
    key: "CRM.validation_failed",
    field: undefined,
    detail: "Website must use HTTP or HTTPS.",
  });
  assert.equal(crmFailure(new Error("network")).key, "CRM.error");
  for (const key of [
    "CRM.concurrency_conflict",
    "CRM.invalid_reference",
    "CRM.crm_lost_reason_required",
    "CRM.permission_denied",
    "CRM.validation_failed",
    "CRM.duplicate_contact",
    "CRM.invalid_transition",
    "CRM.crm_inquiry_exists",
    "CRM.crm_already_linked",
  ])
    for (const language of ["en", "th", "jp"]) assert.ok(CRM_COPY[key]?.[language]?.trim(), `${key}: ${language}`);
});

test("a form is changed only when a value differs, and required fields are checked before any request", () => {
  assert.equal(isDirty({ customerId: "", name: "A" }, { customerId: "", name: "A" }), false);
  assert.equal(isDirty({ customerId: "" }, { customerId: null, siteId: undefined }), false, "empty, absent and null are the same");
  assert.equal(isDirty({ customerId: "" }, { customerId: 4 }), true);
  assert.equal(isDirty({ name: "A" }, { name: "A ", extra: "" }), true);
  const fields = [{ key: "customerId", required: true }, { key: "name", required: true }, { key: "note" }, { key: "isActive", required: true, type: "checkbox" }];
  assert.deepEqual(missingFields(fields, { customerId: 4, name: "   " }), { name: "CRM.fieldRequired" });
  assert.deepEqual(missingFields(fields, { customerId: 4, name: "Line 3" }), {});
});

test("every CRM form and long list is the kit's, not the old app's (CRM-01, CRM-02)", () => {
  // The kit's searchable list: a search box inside the popup, two lines per entry, keyboard, clear, loading.
  assert.match(forms, /import \{[^}]*\bComboboxControl\b[^}]*\} from "@tomas-tc\/ui";/s);
  assert.match(forms, /<ComboboxControl[^]*?searchPlaceholder=\{t\("CRM\.searchList"\)\}/);
  assert.match(forms, /clearable=\{clearable \?\? !required\}/);
  assert.match(forms, /description: option\.detail \|\| undefined/);
  // A failed list says so and offers a retry, apart from "nothing found" and "loading".
  assert.match(forms, /\{failed \? \(\s*<p role="alert"[^]*?t\("CRM\.listFailed"\)[^]*?t\("CRM\.retry"\)/);
  // Word-by-word matching on top of the kit's substring filter.
  assert.match(forms, /keywords: typed && matchesSearch\(option, term\) \? `\$\{option\.keywords \?\? ""\} \$\{typed\}` : option\.keywords/);
  // Nothing from the old app is rendered inside the kit's root.
  assert.doesNotMatch(forms, /from "\.\.\/ui"|from "\.\.\/production\/(?!crm-records)/);
  assert.match(forms, /import \{ TomasUi \} from "\.\/TomasUi";/);
  // The screen loads the kit's parts lazily and imports only their types statically (lazy-screens.test.mjs).
  assert.doesNotMatch(screen, /from "@tomas-tc\/ui"/);
  assert.match(screen, /import type \{ FieldSpec \} from "\.\.\/tomas-ui\/CrmForms";/);
  for (const part of ["OpportunityDialog", "ActivityDialog", "ContactDialog", "CrmFormDialog", "ConfigurationDialog", "RemoveDialog", "PickerIsland", "DealActions"])
    assert.match(screen, new RegExp(`const ${part} = lazy\\(\\(\\) => crmKit\\(\\)\\.then\\(\\(m\\) => \\(\\{ default: m\\.${part} \\}\\)\\)\\);`), part);
  assert.doesNotMatch(screen, /SearchSelect|<select disabled=|function Editor\(|function Fields\(/);
  // The owner, customer and account-owner choices are searchable everywhere (Customer 360's edit included).
  assert.equal((screen.match(/\{ key: "accountOwnerId", searchable: true, placeholder: "CRM\.searchPerson", options: teamOptions\(/g) ?? []).length, 2);
  assert.match(screen, /<FilterPicker label="CRM\.ownerId" allLabel="CRM\.allOwners"/);
  assert.match(screen, /<FilterPicker label="CRM\.customerId" allLabel="CRM\.allCustomers"/);
});

test("one dialog shell: Save runs once, a changed form asks before closing, a guide card is not a click outside (CRM-10)", () => {
  assert.match(forms, /const requestClose = \(\) => \{\s*if \(busy\) return;\s*if \(dirty\) setAsking\(true\);\s*else onClose\(\);\s*\};/);
  assert.match(forms, /onOpenChange=\{\(open\) => \{\s*if \(!open\) requestClose\(\);\s*\}\}/);
  assert.match(forms, /<UnsavedChangesDialog\s+open=\{asking\}/);
  assert.match(forms, /if \(running\.current\) return;/);
  assert.match(forms, /disabled=\{busy \|\| submitDisabled\}/);
  assert.match(forms, /<form\s+id=\{formId\}\s+noValidate/);
  assert.match(forms, /onInteractOutside=\{\(event\) => \{\s*if \(onGuide\(event\.target\)\) event\.preventDefault\(\);\s*\}\}/);
  // The first field left empty takes the focus; a refusal keeps what was typed.
  assert.match(forms, /document\.getElementById\(`\$\{formId\}-\$\{first\}`\)\?\.focus\(\)/);
  assert.match(forms, /if \(next\.field\) form\.setErrors\(\{ \[next\.field\]: next\.key \}\);/);
  // Errors and hints are tied to their field for screen readers.
  assert.match(forms, /aria-describedby=\{describedBy\}/);
  assert.match(forms, /<p id=\{errorId\} role="alert" className="text-destructive text-xs">/);
});

test("another customer empties what belonged to the first one; the API checks it again (CRM-04)", () => {
  assert.match(forms, /const REFERENCE_KEYS = \["opportunityId", "contactId", "inquiryId", "estimateId", "projectId"\];/);
  assert.match(forms, /form\.patch\(\{ customerId: next, \.\.\.Object\.fromEntries\(REFERENCE_KEYS\.map\(\(k\) => \[k, ""\]\)\) \}\);/);
  assert.match(forms, /form\.patch\(\{ opportunityId: next, inquiryId: "", estimateId: "", projectId: "" \}\);/);
  assert.match(forms, /form\.patch\(\{ customerId: next, siteId: "", contactId: "" \}\);/);
  assert.match(forms, /setNotice\(cleared \? "CRM\.referencesCleared" : ""\);/);
  // The deal list for an activity comes from the API by what is typed, not the first 100 of the customer (CRM-05).
  assert.match(forms, /\/api\/v1\/crm\/opportunities\?\$\{new URLSearchParams\(\{ customerId: text\(value\.customerId\), search: typed, pageSize: "50"/);
  const route = read("backend-node/src/routes/crm.ts");
  assert.match(route, /"Related records must belong to this customer and opportunity\."/);
  assert.match(route, /"Opportunity and customer do not match\."/);
});

test("a contact needs a name in at least one language, and the form says so (CRM-19)", () => {
  assert.match(forms, /\{ key: "nameTh", hint: "CRM\.contactNameRule", maxLength: 200 \}/);
  assert.match(forms, /\["nameTh", "nameEn", "nameJa"\]\.some\(\(key\) => text\(v\[key\]\)\.trim\(\)\) \? \{\} : \{ nameTh: "CRM\.contactNameRequired" \}/);
  // The quick add in the deal form: Enter adds the contact, never saves the deal around it; a duplicate is selected.
  assert.match(forms, /if \(event\.key === "Enter"\) \{\s*event\.preventDefault\(\);\s*add\(\);\s*\}/);
  assert.match(forms, /failure\.code === "duplicate_contact"/);
  assert.match(forms, /link: \{ label: "CRM\.addContact", onClick: \(\) => setAdding\(""\) \}/);
});

test("activities are searched and filtered on the server, every page reachable, counts over the same scope (CRM-03, CRM-07)", () => {
  assert.match(
    screen,
    /`\/api\/v1\/crm\/activities\?\$\{params\(\{ page: String\(page\), pageSize: String\(pageSize\), customerId: customerId \? String\(customerId\) : customer, ownerId: owner, activityType: type, search, from, to, year: year \?\? "" \}\)\}`/,
  );
  assert.match(screen, /value: Number\(shown\?\.types\?\.\[key\] \?\? 0\)/);
  assert.doesNotMatch(screen, /rows\.filter\(\(r\) => r\.activityType === type\)\.length/, "no type count from the rows on screen");
  // Customer and contact lists no longer count "with industry / with email" over one page.
  assert.doesNotMatch(screen, /CRM\.withIndustry|CRM\.withEmail|CRM\.withOwner|CRM\.withRole/);
  // The board asks for the next 100 instead of stopping at the first page (CRM-05).
  assert.match(screen, /const boardList = useCrmPages\(boardBase,/);
  assert.match(records, /Promise\.all\(Array\.from\(\{ length: pages \}, \(_, index\) => apiRequest<CrmPage>\(`\$\{base\}&page=\$\{index \+ 1\}`\)\)\)/);
  // Loading keeps the last result on screen instead of flashing "nothing found" (CRM-06).
  assert.match(records, /shown: url \? \(result\?\.value \?\? null\) : null/);
});

test("the deal page leads with one next step; won and lost end the stage rail (CRM-09, CRM-14, CRM-17)", () => {
  assert.match(screen, /<DealActions primary=\{primary\} others=\{others\} moreLabel=\{t\("CRM\.moreActions"\)\} \/>/);
  assert.match(forms, /<DropdownMenuItem key=\{action\.id\} data-guide=\{action\.guide\} onSelect=\{action\.onSelect\}>/);
  assert.match(screen, /className=\{`outcome\$\{stage === "WON" \? " won" : stage === "LOST" \? " lost" : ""\}`\}/);
  assert.match(screen, /const OPEN_STAGES = stages\.filter\(\(code\) => !\["WON", "LOST", "ON_HOLD"\]\.includes\(code\)\);/);
  // History and links read in the reader's language and clock, never as raw ISO text or raw status codes.
  assert.match(screen, /\{text\(r\.actorName\)\} · \{formatMoment\(r\.occurredAt, lang\)\}/);
  assert.match(screen, /t\(text\(r\.inquiryStatus\) === "Approved" \? "CRM\.costApproved" : text\(r\.inquiryStatus\)\)/);
  assert.match(records, /timeZone: BUSINESS_TIME_ZONE/);
});

test("the deal table keeps five columns and says when a value or a date is not given (CRM-15)", () => {
  assert.match(screen, /t\(commercial \? "CRM\.valueCloseColumn" : "CRM\.expectedClose"\)/);
  assert.match(screen, /t\("CRM\.valueNotSpecified"\)/);
  assert.match(screen, /`\$\{t\("CRM\.closeShort"\)\} \$\{formatDay\(r\.expectedClose, lang\) \|\| t\("CRM\.notSpecified"\)\}`/);
  assert.match(crmCss, /\.crm-deal-table \{\s*table-layout: fixed;\s*\}/);
  // The old form styles left with the old forms.
  assert.doesNotMatch(crmCss, /\.crm-form-grid|\.crm-quick-add|\.crm-field-link|\.crm-check-field/);
  for (const name of ["crm-refreshing", "crm-attention", "crm-next-step", "crm-history-changes", "crm-activity-context", "crm-type-chips"]) assert.match(crmCss, new RegExp(`\\.${name}[ ,{]`), name);
});
