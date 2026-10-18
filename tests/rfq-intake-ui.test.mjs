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
function harness({ save, upload } = {}) {
  const slots = [], writes = [], opened = [], uploads = [];
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
    createInquiry: async body => { writes.push(body); return save ? save(body) : { id: 91, number: "INQ-91" }; },
    uploadInquiryAttachment: async (id, queued) => { uploads.push({ id, queued }); await upload?.(id, queued); }, assignmentDeliveryNote: () => "", toError: String,
    formatFileSize: size => `${size} bytes`,
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
  const change = (label, value) => nodes(find("Field", p => p.label === label)).find(n => ["input", "select", "textarea"].includes(n.type)).props.onChange({ target: { value } });
  return { render, find, fill, change, submit, writes, opened, uploads };
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

test("reorganized sections retain assignment, optional details and queued RFQ files", async () => {
  const app = harness(); app.fill();
  app.change("Estimate Owner", "9");
  app.change("กำหนดตอบกลับ / Estimate due", "2026-11-12");
  app.change("CRM.customerRfq", "RFQ-24");
  app.change("Scope Summary", "Two production lines");
  app.change("Remark", "Coordinate shutdown");
  app.change("Project Probability", "60");
  const file = { name: "customer-rfq.pdf", size: 1024 };
  app.find("input", p => p.type === "file").props.onChange({ target: { files: [file], value: "" } });
  await app.submit();
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].estimateOwnerId, 9);
  assert.equal(app.writes[0].dueDate, "2026-11-12");
  assert.equal(app.writes[0].rfqNo, "RFQ-24");
  assert.equal(app.writes[0].scopeSummary, "Two production lines");
  assert.equal(app.writes[0].remark, "Coordinate shutdown");
  assert.equal(app.writes[0].projectProbability, 60);
  assert.deepEqual(app.uploads, [{ id: 91, queued: { file, category: "Customer RFQ" } }]);
  assert.deepEqual(app.opened, [91]);
});

test("the save action cannot create another Inquiry while its request is pending", async () => {
  let finish;
  const app = harness({ save: () => new Promise(resolve => { finish = resolve; }) }); app.fill();
  await app.submit();
  assert.equal(app.find("fieldset").props.disabled, true);
  assert.equal(app.find("button", p => p.type === "submit").props.disabled, true);
  await app.submit();
  assert.equal(app.writes.length, 1);
  finish({ id: 91, number: "INQ-91" });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(app.find("fieldset").props.disabled, false);
  assert.deepEqual(app.opened, [91]);
});

test("a failed attachment still opens the already-created Inquiry instead of creating again", async () => {
  const app = harness({ upload: async () => { throw new Error("upload failed"); } }); app.fill();
  app.find("input", p => p.type === "file").props.onChange({ target: { files: [{ name: "drawing.pdf", size: 100 }], value: "" } });
  await app.submit();
  assert.equal(app.writes.length, 1);
  assert.deepEqual(app.opened, [91]);
});
