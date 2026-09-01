import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Drive the real form handlers with controlled React state and no network writes.
function mountForm(file, exportName, props) {
  const slots = [], requests = [];
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
    "./customer-localized-names": {
      canonicalLocalizedName: (names, fallback = "") => names.nameEn.trim() || names.nameTh.trim() || names.nameJa.trim() || fallback.trim(),
      localizedNamesFromCard(candidates, fallback) {
        const result = { nameTh: "", nameEn: "", nameJa: "" };
        for (const candidate of candidates ?? []) result[candidate.language === "th" ? "nameTh" : candidate.language === "ja" ? "nameJa" : "nameEn"] ||= candidate.value.trim();
        if (!result.nameTh && !result.nameEn && !result.nameJa && fallback.trim()) result[/\p{Script=Thai}/u.test(fallback) ? "nameTh" : /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(fallback) ? "nameJa" : "nameEn"] = fallback.trim();
        return result;
      },
      localizedNameLines: names => Object.entries(names).filter(([, value]) => value).map(([language, value]) => ({ language, value })),
    },
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
const salesFile = "../app/system/production/InquiryCustomerFields.tsx";
const masterFile = "../app/system/production/AdminAnalyticsScreens.tsx";
const salesProps = { kind: "customer", customers: [], directory: null, onClose() {}, onCustomerSaved() {} };
const masterProps = { customer: null, onClose() {}, async onSaved() {} };

test("sales customer OCR keeps a manual role while saving the extracted department and primary contact", async () => {
  const form = mountForm(salesFile, "CustomerEntryModal", salesProps);
  form.change("ตำแหน่งผู้ติดต่อ", "Senior engineer");
  form.scan({ companyName: "Example", contactName: "山田 太郎", position: "Engineer", department: "技術部" });
  assert.equal(form.input("ตำแหน่งผู้ติดต่อ").props.value, "Senior engineer");
  assert.equal(form.input("แผนกผู้ติดต่อ").props.value, "技術部");
  assert.equal(form.input("Company name English").props.value, "Example");
  assert.equal(form.input("Primary contact Japanese").props.value, "山田 太郎");
  await form.submit();
  assert.equal(form.requests[0].body.position, "Senior engineer");
  assert.equal(form.requests[0].body.department, "技術部");
  assert.equal(form.requests[0].body.contact, "山田 太郎");
});

test("company-only End user OCR cannot submit hidden contact or role data", async () => {
  const form = mountForm(salesFile, "CustomerEntryModal", { ...salesProps, companyOnly: true });
  form.scan({ companyName: "Example", contactName: "Jane", email: "jane@example.test", position: "Manager", department: "Sales" });
  for (const field of ["ชื่อผู้ติดต่อหลัก ภาษาไทย", "Primary contact English", "Primary contact Japanese", "ตำแหน่งผู้ติดต่อ", "แผนกผู้ติดต่อ"]) assert.equal(form.input(field), undefined);
  await form.submit();
  for (const field of ["contact", "email", "phone", "department", "position"]) assert.equal(form.requests[0].body[field], undefined);
});

test("master create fills role data without replacing typed department and requires the person's name", async () => {
  const form = mountForm(masterFile, "CustomerModal", masterProps);
  form.change("department", "แผนกควบคุม");
  form.scan({ companyName: "Example", contactName: "สมชาย", department: "Sales", position: "ผู้จัดการ" });
  assert.equal(form.input("department").props.value, "แผนกควบคุม");
  assert.equal(form.input("contactNameTh").props.value, "สมชาย");
  await form.submit();
  assert.equal(form.requests[0].body.department, "แผนกควบคุม");
  assert.equal(form.requests[0].body.position, "ผู้จัดการ");
});

test("master editing restores saved roles and explicitly clears removed values", async () => {
  const customer = { id: 123, rowVersion: "version", code: "EX", name: "Example", contact: "Jane", department: "Sales", position: "Manager" };
  const form = mountForm(masterFile, "CustomerModal", { ...masterProps, customer });
  assert.equal(form.input("department").props.value, "Sales");
  assert.equal(form.input("position").props.value, "Manager");
  form.change("department", ""); form.change("position", "");
  await form.submit();
  assert.equal(form.requests[0].url, "/api/v1/master/customers/123");
  assert.equal(form.requests[0].body.department, "");
  assert.equal(form.requests[0].body.position, "");
  assert.equal(form.requests[0].body.rowVersion, "version");
});

test("neither customer form sends role data without a named contact", async () => {
  for (const [file, component, props, field] of [
    [salesFile, "CustomerEntryModal", salesProps, "แผนกผู้ติดต่อ"],
    [masterFile, "CustomerModal", masterProps, "department"],
  ]) {
    const form = mountForm(file, component, props);
    form.change(field, "Engineering");
    await form.submit();
    assert.equal(form.requests.length, 0);
  }
});
