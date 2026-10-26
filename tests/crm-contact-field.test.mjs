import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CRM_COPY } from "../app/system/production/crm-copy.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const screen = read("app/system/production/CrmScreens.tsx");
const picker = read("app/system/production/SearchSelect.tsx");
const crmCss = read("app/system/production/crm.css");
const globals = read("app/globals.css");

test("searchable CRM fields use the app's own list, not the browser's datalist", () => {
  // Chrome draws a datalist in its own dark box, one cut-off line per row, filtered to what is already typed.
  assert.doesNotMatch(screen, /<datalist|function SearchableSelect/);
  assert.doesNotMatch(picker, /<datalist/);
  assert.match(picker, /import \{ LookupMenu, handleMenuKeys, type MenuKeys \} from "\.\/CostItemLookup";/);
  assert.match(picker, /role="combobox" aria-autocomplete="list" aria-expanded=\{open\}/);
  // Two lines per entry, a clear button, and Enter while typing never submits the form around it.
  assert.match(picker, /<div className="lookup-main"><strong>\{option\.label\}<\/strong><\/div>\s*\{option\.detail \? <div className="lookup-meta"><span>\{option\.detail\}<\/span><\/div> : null\}/);
  assert.match(picker, /className="search-select-clear"/);
  assert.match(picker, /if \(event\.key === "Enter" && query !== null\) event\.preventDefault\(\);/);
  // The box shows the chosen entry; focusing it lists everything again instead of only the chosen one.
  assert.match(picker, /value=\{query \?\? selected\?\.label \?\? ""\}/);
  assert.match(picker, /const found = needle \? options\.filter/);
  assert.match(screen, /f\.options&&f\.searchable\?<SearchSelect value=\{text\(value\[f\.key\]\)\} options=\{f\.options\}/);
  for (const name of ["search-select", "search-select-clear", "search-select-toggle", "search-select-add"]) assert.match(globals, new RegExp(`\\.${name}[ ,{]`), name);
});

test("the deal's contact is searched by name, position, department or email, from active contacts only", () => {
  assert.match(screen, /\{key:"contactId",searchable:true,disabled:!value\.customerId,placeholder:"CRM\.searchContact",options:contactOptions,/);
  assert.match(screen, /filter\(r=>r\.isActive!==false&&\(!value\.siteId\|\|String\(r\.siteId\)===String\(value\.siteId\)\)\)/);
  assert.match(screen, /label:text\(r\.name\),detail:\[text\(r\.position\),text\(r\.department\),sites\.length>1\?text\(r\.siteName\):""\]\.filter\(Boolean\)\.join\(" · "\),searchText:text\(r\.email\)/);
  // People and customers in every CRM form are searchable too.
  assert.match(screen, /\{key:"salesOwnerId",required:true,searchable:true,placeholder:"CRM\.searchPerson",options:people\}/);
  assert.equal((screen.match(/\{key:"customerId",required:true,searchable:true,placeholder:"CRM\.searchCustomer",options:customerOptions\(bootstrap\)\}/g) ?? []).length, 2);
  assert.equal((screen.match(/\{key:"ownerId",required:true,searchable:true,placeholder:"CRM\.searchPerson",options:teamOptions\(bootstrap\)\}/g) ?? []).length, 2);
});

test("a contact that is not found is added from the list's last row with the typed name, then selected", () => {
  assert.match(screen, /const canAddContact=\["intake\.write","master\.write","crm\.contact\.write"\]\.some\(code=>bootstrap\.permissions\.includes\(code\)\)/);
  assert.match(screen, /addLabel:\(typed:string\)=>typed\?t\("CRM\.addContactNamed"\)\.replace\("\{name\}",typed\):t\("CRM\.addContact"\),onAdd:\(typed:string\)=>\{setAdded\(""\);setAdding\(typed\);\}/);
  assert.match(screen, /initialName=\{adding\}/);
  assert.match(screen, /useState\(\{name:initialName,position:"",/);
  assert.match(screen, /crmRequest<\{id:number;siteId:number\}>\(`\/api\/v1\/sales\/customers\/\$\{customerId\}\/contacts`,"POST",\{\[nameKey\]:name,position:draft\.position,email:draft\.email,phone:draft\.phone,siteId:/);
  assert.match(screen, /set\(\{\.\.\.value,contactId:contact\.id,siteId:/);
  // A name or email that already exists selects that contact instead of failing.
  assert.match(screen, /failure\.code==="duplicate_contact"/);
  assert.match(screen, /if\(match\)\{onAdded\(\{id:Number\(match\.id\),siteId:Number\(match\.siteId\)\},true\);return;\}/);
  // Enter adds the contact; it must not submit the deal form around it.
  assert.match(screen, /if\(event\.key==="Enter"\)\{event\.preventDefault\(\);add\(\);\}/);
  assert.match(screen, /next\.contactId="";setAdding\(null\);setAdded\(""\);/);
  for (const name of ["crm-quick-add", "crm-quick-add-actions", "crm-similar", "crm-field-link"]) assert.match(crmCss, new RegExp(`\\.${name} \\{`), name);
});

test("the new-deal form asks for what matters first and folds the rest", () => {
  // Customer beside its end user (never folded away: it carries forward to the Inquiry), then the name,
  // then site and contact side by side, then the owner and the close date.
  assert.match(screen, /<Fields fields=\{\[\{key:"customerId",required:true,searchable:true,disabled:Boolean\(value\.id\),placeholder:"CRM\.searchCustomer",options:companies\},\s*\{key:"endUserCustomerId",searchable:true,placeholder:"CRM\.searchEndUser",options:endUsers,/);
  assert.match(screen, /link:\{label:"CRM\.useCustomerAsEndUser",onClick:\(\)=>set\(\{\.\.\.value,endUserCustomerId:Number\(value\.customerId\)\}\)\}/);
  assert.match(screen, /\{key:"name",required:true,wide:true\}\]\} value=\{value\} set=\{update\}\/>/);
  assert.match(screen, /\{key:"siteId",options:sites\.map[^\n]*\n\s*\{key:"contactId",searchable:true/);
  // A new deal starts at New: the stage is asked only when editing or from another board column.
  assert.match(screen, /const create=!initial,showStage=!create\|\|Boolean\(defaultStage&&defaultStage!=="NEW"\);/);
  assert.match(screen, /\.\.\.\(showStage\?\[\{key:"stage",options:choice\("stage"\),required:true\}\]:\[\]\)/);
  // The first next action is saved with the deal (the API already accepts it), owned by the sales owner.
  assert.match(screen, /const body=create&&action\?\{\.\.\.deal,nextAction:\{action,ownerId:deal\.salesOwnerId,dueDate:nextActionDue\}\}:deal;/);
  assert.match(screen, /\{key:"nextActionDue",label:"CRM\.dueDate",type:"date",required:Boolean\(text\(value\.nextActionText\)\.trim\(\)\)\}/);
  // Similar open deals show under the name while typing; no browser pop-up on save.
  assert.doesNotMatch(screen, /window\.confirm\(`\$\{t\("CRM\.duplicateWarning"\)\}/);
  assert.match(screen, /useCrmData<CrmRecord\[\]>\(typedName\.length>=3\?`\/api\/v1\/crm\/opportunity-duplicates\?customerId=/);
  // Both owners side by side, then the close date and (for commercial readers) the deal value; the rest is folded.
  assert.match(screen, /\{key:"salesOwnerId",required:true,searchable:true,placeholder:"CRM\.searchPerson",options:people\},\s*\{key:"technicalOwnerId",searchable:true,placeholder:"CRM\.searchPerson",options:people\},\s*\{key:"expectedClose",type:"date"\},\s*\.\.\.\(bootstrap\.permissions\.includes\("crm\.commercial\.read"\)\?\[\{key:"expectedValue",type:"number"\}\]:\[\]\),/);
  assert.match(screen, /<summary>\{t\("CRM\.optionalDetails"\)\}<\/summary>\s*\{more\}/);
  assert.match(screen, /const endUsers=own\?\[\{\.\.\.own,detail:`\$\{own\.detail\} · \$\{t\("CRM\.sameAsCustomer"\)\}`\}/);
  assert.doesNotMatch(screen, /crm-end-user-actions|CRM\.waitingHint/);
});

test("every new string has English, Thai and Japanese", () => {
  const keys = ["CRM.searchList", "CRM.searchPerson", "CRM.searchContact", "CRM.searchCustomer", "CRM.searchEndUser", "CRM.noMatch", "CRM.clearChoice",
    "CRM.showList", "CRM.listCut", "CRM.addContact", "CRM.addContactNamed", "CRM.sameAsCustomer", "CRM.useCustomerAsEndUser", "CRM.endUserCustomerId", "CRM.duplicateInline", "CRM.contactNameRequired",
    "CRM.contactCheckFields", "CRM.contactAdded", "CRM.contactExisting", "CRM.newContact", "CRM.contactName", "CRM.action", "CRM.dueDate"];
  for (const key of keys) for (const language of ["en", "th", "jp"]) assert.ok(CRM_COPY[key]?.[language]?.trim(), `${key}: ${language}`);
  assert.match(CRM_COPY["CRM.listCut"].th, /\{shown\}.*\{total\}/);
});

test("the deal table fits the screen in five columns of two lines, and the filters say what they show", () => {
  // Presented to management (2026-10-25): ten fields in five columns instead of ten that scroll sideways.
  assert.match(screen, /<DealTable openInquiry=\{openInquiry\} rows=\{rows\} commercial=\{bootstrap\.permissions\.includes\("crm\.commercial\.read"\)\}/);
  assert.doesNotMatch(screen, /columns=\{\["opportunityNo","name","customerName","stage","inquiryNo","inquiryStatus","expectedValue"/);
  assert.match(screen, /<th>\{t\("CRM\.dealColumn"\)\}<\/th><th>\{t\("CRM\.customerName"\)\}<\/th><th>\{t\("CRM\.salesStage"\)\}<\/th>/);
  // The value only for people who may see it; a flag sits beside the owner rather than on a line of its own.
  assert.match(screen, /commercial&&r\.expectedValue!=null\?<><strong className="crm-deal-value">\{money\(r\.expectedValue\)\}<\/strong>/);
  assert.match(screen, /<span className="crm-deal-ownerline"><span className="crm-deal-owner">/);
  assert.match(crmCss, /\.crm-deal-table \{ table-layout: fixed; \}/);
  assert.match(crmCss, /\.crm-deal-table tbody td \{ white-space: normal; vertical-align: top; \}/);
  assert.match(screen, /label:t\("CRM\.allStages"\)/);
  assert.match(screen, /label:t\("CRM\.allOwners"\)/);
  assert.match(screen, /label:t\("CRM\.allFollowups"\)/);
  for (const key of ["CRM.dealColumn", "CRM.valueCloseColumn", "CRM.ownerNextColumn", "CRM.allStages", "CRM.allOwners", "CRM.allFollowups"])
    for (const language of ["en", "th", "jp"]) assert.ok(CRM_COPY[key]?.[language]?.trim(), `${key}: ${language}`);
});
