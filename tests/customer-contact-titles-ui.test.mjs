import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Drive the real form handlers with controlled React state and no network writes.
function mountForm(file, exportName, props, initialState = []) {
  const slots = [...initialState], requests = [];
  let cursor = 0, tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef: () => ({ current: null }), useEffect() {}, useMemo: callback => callback(),
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: hooks, "react-dom": { createPortal: value => value },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../api-client": { async apiRequest(url, options) { requests.push({ url, body: JSON.parse(options.body) }); return { code: "TEST" }; } },
    "./BusinessCardScanner": { BusinessCardScanner: "scanner" },
    "../ui": new Proxy({}, { get: (_, name) => name }),
    "../i18n": { useT: () => value => value },
    "../LocalizedText": { LocalizedText: "localized" },
    "./customer-localized-names": loadNames(),
  };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", `${code}\nexports.Subject = ${exportName};`)(name => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, mod, mod.exports);
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
  const render = () => { cursor = 0; tree = mod.exports.Subject(props); };
  const input = name => nodes(tree).find(node => ["input", "textarea"].includes(node.type) && (node.props.name === name || node.props["aria-label"] === name));
  render();
  return {
    requests, input,
    nodes: () => nodes(tree),
    change(name, value) { assert.ok(input(name), `Missing ${name}`); input(name).props.onChange({ target: { value } }); render(); },
    scan(data) {
      const scanner = nodes(tree).find(node => node.type === "scanner");
      assert.ok(scanner);
      scanner.props.onApply({ companyName: "", contactName: "", email: "", phone: "", address: "", department: "", position: "", ...data });
      render();
    },
    async submit() { nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {}, stopPropagation() {} }); for (let i = 0; i < 8; i++) await Promise.resolve(); render(); },
  };
}

function loadNames() {
  const source = readFileSync(new URL("../app/system/production/customer-localized-names.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", code)(loaded, loaded.exports);
  return loaded.exports;
}
const salesFile = "../app/system/production/InquiryCustomerFields.tsx";
const masterFile = "../app/system/production/AdminAnalyticsScreens.tsx";
const salesProps = { kind: "customer", customers: [], directory: null, onClose() {}, onCustomerSaved() {}, onContactSaved() {} };
const masterProps = { customer: null, onClose() {}, async onSaved() {} };
const titleInputs = ["คำนำหน้าผู้ติดต่อ ภาษาไทย", "Contact title English", "Contact title Japanese"];

test("customer and standalone contact save separately typed titles without changing canonical names", async () => {
  for (const kind of ["customer", "contact"]) {
    const form = mountForm(salesFile, "CustomerEntryModal", { ...salesProps, kind, customer: { id: 42 } });
    form.change(titleInputs[0], "ดร."); form.change(titleInputs[1], " Prof. "); form.change(titleInputs[2], "様");
    form.scan({ companyName: "Example", contactNames: [{ language: "en", value: "Alex" }, { language: "ja", value: "山田" }] });
    assert.equal(form.input(titleInputs[1]).props.value, " Prof. ");
    await form.submit();
    const body = form.requests[0].body;
    const prefix = kind === "customer" ? "contactTitle" : "title";
    assert.equal(body[`${prefix}Th`], "ดร."); assert.equal(body[`${prefix}En`], "Prof."); assert.equal(body[`${prefix}Ja`], "様");
    assert.equal(body[kind === "customer" ? "contact" : "name"], "Alex");
  }
});

test("Master editing restores titles and clears each title while preserving row version and legacy contact", async () => {
  const customer = { id: 42, code: "EX", name: "Example", contact: "Alex", rowVersion: "rv", contactTitleTh: "ดร.", contactTitleEn: "Dr.", contactTitleJa: "様" };
  const form = mountForm(masterFile, "CustomerModal", { ...masterProps, customer });
  for (const [field, expected] of [["contactTitleTh", "ดร."], ["contactTitleEn", "Dr."], ["contactTitleJa", "様"]]) {
    assert.equal(form.input(field).props.value, expected); form.change(field, "");
  }
  await form.submit();
  const body = form.requests[0].body;
  for (const field of ["contactTitleTh", "contactTitleEn", "contactTitleJa"]) assert.equal(body[field], "");
  assert.equal(body.rowVersion, "rv"); assert.equal(body.contact, "Alex");
});

test("title alone requires a contact name on both customer forms", async () => {
  for (const [file, component, props, companyField, titleField] of [[salesFile, "CustomerEntryModal", salesProps, "Company name English", titleInputs[0]], [masterFile, "CustomerModal", masterProps, "nameEn", "contactTitleEn"]]) {
    const form = mountForm(file, component, props);
    form.change(companyField, "Example"); form.change(titleField, "Dr.");
    await form.submit(); assert.equal(form.requests.length, 0);
  }
});

test("company-only entry omits all personal titles", async () => {
  const form = mountForm(salesFile, "CustomerEntryModal", { ...salesProps, companyOnly: true });
  for (const field of titleInputs) assert.equal(form.input(field), undefined);
  form.scan({ companyName: "Example", contactName: "Alex" }); await form.submit();
  for (const field of ["contactTitleTh", "contactTitleEn", "contactTitleJa", "contact"]) assert.equal(form.requests[0].body[field], undefined);
});

test("contact display prefixes TH/EN and suffixes JA without inventing missing languages", () => {
  const helper = loadNames();
  const names = { nameTh: "สมชาย", nameEn: "Alex", nameJa: "山田", titleTh: "นาย", titleEn: "Mr.", titleJa: "様" };
  assert.deepEqual(helper.contactNameLines(names).map(line => line.value), ["นาย สมชาย", "Mr. Alex", "山田 様"]);
  assert.equal(helper.canonicalLocalizedName(names), "Alex");
  assert.deepEqual(helper.contactNameLines({ nameTh: "", nameEn: "", nameJa: "", titleEn: "Dr.", titleJa: "様" }, "Alex"), [{ language: "EN", value: "Dr. Alex" }]);
  assert.deepEqual(helper.contactNameLines({ nameTh: "", nameEn: "", nameJa: "", titleEn: "Dr." }), []);
});

test("directory shows titles while choosing a contact keeps the canonical Inquiry contact unchanged", () => {
  const updates = [];
  const contact = { id: 7, siteId: 2, siteName: "Main", name: "Alex", nameTh: "", nameEn: "Alex", nameJa: "山田", titleEn: "Dr.", titleJa: "様", email: "", phone: "", department: "", position: "" };
  const form = mountForm(salesFile, "InquiryCustomerFields", {
    customers: [{ id: 42, code: "EX", name: "Example" }], customerId: 42, contact: "", permissions: [],
    onChange: (...args) => updates.push(args), refreshBootstrap: async () => {}, notify() {},
  }, [[], { customerId: 42, value: { sites: [], contacts: [contact], primaryContact: null } }]);
  const picker = form.nodes().find(node => node.type === "select" && node.props["aria-label"] === "เลือกผู้ติดต่อที่บันทึกไว้");
  const option = form.nodes().find(node => node.type === "option" && node.props.value === "7");
  assert.match(option.props.children, /Dr\. Alex \/ 山田 様/);
  picker.props.onChange({ target: { value: "7" } });
  assert.deepEqual(updates, [[42, "Alex"]]);
});
