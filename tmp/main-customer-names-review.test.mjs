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

test("Main review: OCR saves all six names while preserving typed text", async () => {
 const form = mountForm(salesFile, "CustomerEntryModal", salesProps);
 form.change("Company name English", "Typed Company");
 form.scan({companyNames:[{language:"th",value:"บริษัท ทดสอบ"},{language:"en",value:"OCR Company"},{language:"ja",value:"テスト株式会社"}],contactNames:[{language:"th",value:"สมชาย"},{language:"en",value:"Somchai"},{language:"ja",value:"ソムチャイ"}]});
 await form.submit();
 const b=form.requests[0].body;
 assert.equal(b.nameTh,"บริษัท ทดสอบ"); assert.equal(b.nameEn,"Typed Company"); assert.equal(b.nameJa,"テスト株式会社");
 assert.equal(b.contactNameTh,"สมชาย"); assert.equal(b.contactNameEn,"Somchai"); assert.equal(b.contactNameJa,"ソムチャイ");
});
test("Main review: Master restores, edits and clears individual name languages", async () => {
 const names={nameTh:"บริษัท ทดสอบ",nameEn:"Company",nameJa:"テスト株式会社",contactNameTh:"สมชาย",contactNameEn:"Somchai",contactNameJa:"ソムチャイ"};
 const form=mountForm(masterFile,"CustomerModal",{...masterProps,customer:{id:12,code:"TEST",name:"Company",contact:"Somchai",rowVersion:"original",...names}});
 for(const [k,v] of Object.entries(names)) assert.equal(form.input(k).props.value,v);
 form.change("nameTh","บริษัท ใหม่"); form.change("contactNameJa",""); await form.submit();
 const b=form.requests[0].body;
 assert.equal(b.nameTh,"บริษัท ใหม่");assert.equal(b.nameEn,"Company");assert.equal(b.nameJa,"テスト株式会社");
 assert.equal(b.contactNameTh,"สมชาย");assert.equal(b.contactNameEn,"Somchai");assert.equal(b.contactNameJa,"");assert.equal(b.rowVersion,"original");
});