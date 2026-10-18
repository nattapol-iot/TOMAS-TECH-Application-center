import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/system/production/InquiryScreens.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("InquiryScreens.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const entry = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "InquiryCreate");
const compiled = ts.transpileModule(`${entry.getText(ast)}\nexports.Screen = InquiryCreate;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function harness() {
  const slots = [], writes = [], opened = [];
  let cursor = 0;
  const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const globals = {
    require: () => runtime,
    exports: {},
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef: () => ({ current: null }), useUiText: () => key => key,
    OWNER_ROLES: ["Engineer"], futureDate: () => "2026-11-01", today: () => "2026-10-18",
    PROJECT_TYPES: ["IoT"], INTEREST_GRADES: [], FILE_CATEGORIES: [], MAX_FILE_BYTES: 50_000_000,
    apiRequest: async () => [],
    createInquiry: async body => { writes.push(body); return { id: 91, number: "INQ-91" }; },
    uploadInquiryAttachment: async () => {}, assignmentDeliveryNote: () => "", toError: String,
    ...Object.fromEntries(["Icon", "LocalizedText", "PageHeader", "LoadError", "ExistingRfqWork", "Panel", "InquiryCustomerFields", "EndUserCompanyField", "Field"].map(name => [name, name])),
  };
  new Function(...Object.keys(globals), compiled)(...Object.values(globals));
  const props = { bootstrap: { user: { id: 7, name: "Sales" }, team: [{ id: 8, name: "Engineer", role: "Engineer" }], customers: [], permissions: [] }, notify: () => {}, refreshBootstrap: async () => {}, onCreated: id => opened.push(id), onBack: () => {} };
  const render = () => { cursor = 0; return globals.exports.Screen(props); };
  const find = (type, predicate = () => true) => nodes(render()).find(node => node.type === type && predicate(node.props));
  const fill = () => {
    find("InquiryCustomerFields").props.onChange(5, "Customer contact");
    nodes(find("Field", p => p.label === "Project Name")).find(n => n.type === "input").props.onChange({ target: { value: "Factory monitoring" } });
  };
  const submit = async () => { render().props.onSubmit({ preventDefault() {} }); for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { render, find, fill, submit, writes, opened };
}

const opportunity = { id: 42, opportunityNo: "OPP-42", customerId: 5, name: "Factory monitoring", rowVersion: "version42", need: "Track machines", scope: "Line A", salesOwnerName: "Sales", technicalOwnerId: 8 };

test("RFQ intake creates one Inquiry with the selected opportunity identity", async () => {
  const app = harness(); app.fill();
  app.find("ExistingRfqWork").props.onSelect(opportunity);
  await app.submit();
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].opportunityId, 42);
  assert.equal(app.writes[0].opportunityRowVersion, "version42");
  assert.equal(app.writes[0].requirement, "Track machines");
  assert.deepEqual(app.opened, [91]);
});

test("clearing a selected opportunity keeps the intake but submits no CRM relationship", async () => {
  const app = harness(); app.fill();
  app.find("ExistingRfqWork").props.onSelect(opportunity);
  app.find("button", p => p.children === "CRM.unlinkOpportunity").props.onClick();
  await app.submit();
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].projectName, opportunity.name);
  assert.equal("opportunityId" in app.writes[0], false);
  assert.equal("opportunityRowVersion" in app.writes[0], false);
});

test("opening a matched Inquiry respects draft confirmation and creates nothing", () => {
  const previous = globalThis.window;
  try {
    const app = harness(); app.fill();
    globalThis.window = { confirm: () => false };
    app.find("ExistingRfqWork").props.onOpen(77);
    assert.deepEqual(app.opened, []);
    globalThis.window.confirm = () => true;
    app.find("ExistingRfqWork").props.onOpen(77);
    assert.deepEqual(app.opened, [77]);
    assert.deepEqual(app.writes, []);
  } finally { globalThis.window = previous; }
});
