import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const load = async (path) => {
  const compiled = ts.transpileModule(await read(path), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
};

test("a supplier code suggested from a card reads like the codes already in the master", async () => {
  const { supplierCodeFromName, SUPPLIER_CODE_MAX_LENGTH } = await load("../lib/supplier-code.ts");

  // Names taken from the shapes the supplier master already holds.
  assert.equal(supplierCodeFromName("Keyence (Thailand) CO.,LTD."), "KEYENCE");
  assert.equal(supplierCodeFromName("KPT1993 Co., Ltd."), "KPT1993");
  assert.equal(supplierCodeFromName("KPT1993 Co., Ltd. (Head Office)"), "KPT1993");
  assert.equal(supplierCodeFromName("Meijidenki"), "MEIJIDENKI");
  assert.equal(supplierCodeFromName("Omron Automation Systems"), "OMRON-AUTOMATION-SYSTEMS");

  // Never longer than the column, and never left ending on a separator.
  const long = supplierCodeFromName("Advanced Industrial Automation Technology Systems Limited");
  assert.ok(long.length <= SUPPLIER_CODE_MAX_LENGTH, long);
  assert.doesNotMatch(long, /-$/);

  // Nothing usable must produce an empty suggestion rather than a junk code, so the
  // person types the code themselves instead of saving a meaningless one.
  for (const name of ["", "   ", "co., ltd.", "!!!"]) {
    assert.equal(supplierCodeFromName(name), "", JSON.stringify(name));
  }
});

test("the supplier form scans a card and only fills blank fields", async () => {
  const screens = await read("../app/system/production/CoreScreens.tsx");
  const start = screens.indexOf("function SupplierCreateForm");
  assert.ok(start > -1, "SupplierCreateForm not found");
  const form = screens.slice(start, screens.indexOf("function InventoryItemMasterTab", start));

  assert.match(form, /<BusinessCardScanner disabled=\{busy\} onApply=\{applyBusinessCard\} \/>/);
  // A card carries no supplier code, so the code is suggested from the company name.
  assert.match(form, /key: "code", value: supplierCodeFromName\(result\.companyName\)/);
  // Category is never guessed from a card.
  assert.doesNotMatch(form, /key: "category", value: result\./);
  // Typed values always win over scanned ones.
  assert.match(form, /fields\.filter\(\(field\) => field\.value && !form\[field\.key\]\.trim\(\)\)/);
  // The controlled form has to be cleared explicitly after a successful save.
  assert.match(form, /setForm\(\{ \.\.\.BLANK_SUPPLIER \}\)\)/);
});

test("the scanner accepts a dragged card everywhere it is used", async () => {
  const scanner = await read("../app/system/production/BusinessCardScanner.tsx");
  assert.match(scanner, /onDragOver=\{dragOver\}/);
  assert.match(scanner, /onDragLeave=\{dragLeave\}/);
  assert.match(scanner, /onDrop=\{dropped\}/);
  // Only an image is scanned; anything else reports why instead of failing silently.
  assert.match(scanner, /dataTransfer\?\.files \?\? \[\]\)\].find\(\(item\) => item\.type\.startsWith\("image\/"\)\)/);
  assert.match(scanner, /if \(!file\) \{ setError/);
  // A drop while a scan is running must not start a second one.
  assert.match(scanner, /if \(disabled \|\| busy\) return;/);
  // Dragging over a child element must not flicker the highlight off.
  assert.match(scanner, /currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
});

test("an engineer can register the supplier an estimate needs, but not edit the master record", async () => {
  const [route, screens] = await Promise.all([
    read("../backend-node/src/routes/master.ts"),
    read("../app/system/production/CoreScreens.tsx"),
  ]);
  const createStart = route.indexOf('app.post("/api/v1/master/suppliers"');
  assert.ok(createStart > -1, "supplier create route not found");
  // Stop at the next route registration; several master routes sit between this one
  // and find-or-create, and they legitimately still demand master.write.
  const create = route.slice(createStart, route.indexOf("\n  app.", createStart));
  assert.match(create, /demandPermission\(request, "estimate\.write"\)/);
  assert.doesNotMatch(create, /demandPermission\(request, "master\.write"\)/);

  // Editing and deleting a supplier stay master-data work.
  for (const anchor of ['app.put("/api/v1/master/suppliers/:id"', 'app.delete("/api/v1/master/suppliers/:id"']) {
    const at = route.indexOf(anchor);
    assert.ok(at > -1, anchor);
    assert.match(route.slice(at, at + 400), /demandPermission\(request, "master\.write"\)/, anchor);
  }

  // The button follows the same rule the API enforces.
  assert.match(screens, /canCreate=\{canWrite \|\| bootstrap\.permissions\.includes\("estimate\.write"\)\}/);
  assert.match(screens, /\{canCreate \? <button className="btn primary" type="button" onClick=\{\(\) => setCreateOpen\(true\)\}/);
});
