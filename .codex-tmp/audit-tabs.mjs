import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["app/system/screens", "app/system/production"];
const files = ["app/system/App.tsx", "app/system/ProductionApp.tsx", ...roots.flatMap((root) => fs.readdirSync(root).filter((file) => file.endsWith(".tsx")).map((file) => path.join(root, file)))];
const i18nFile = "app/system/i18n.ts";
const i18nSource = ts.createSourceFile(i18nFile, fs.readFileSync(i18nFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const dictionary = new Set();
function nameText(name) { return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText(); }
function literal(node) { return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined; }
function dictVisit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText() === "DICTIONARY" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p)) dictionary.add(nameText(p.name));
  }
  ts.forEachChild(node, dictVisit);
}
dictVisit(i18nSource);

const found = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  function index(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const list = declarations.get(node.name.text) ?? [];
      list.push(node.initializer);
      declarations.set(node.name.text, list);
    }
    ts.forEachChild(node, index);
  }
  index(source);
  function collect(node, seenIdentifiers = new Set()) {
    if (ts.isPropertyAssignment(node) && nameText(node.name) === "label") {
      const value = literal(node.initializer);
      if (value !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        found.push({ file: file.replaceAll("\\", "/"), line, value, translated: dictionary.has(value) });
      }
    }
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seenIdentifiers.has(node.text)) {
      const next = new Set(seenIdentifiers).add(node.text);
      for (const initializer of declarations.get(node.text)) collect(initializer, next);
      return;
    }
    ts.forEachChild(node, (child) => collect(child, seenIdentifiers));
  }
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText() === "Tabs") {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name.text === "tabs" && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            collect(attr.initializer.expression);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const unique = [...new Map(found.map((row) => [row.value, row])).values()].sort((a, b) => a.value.localeCompare(b.value));
console.log(JSON.stringify({ occurrences: found.length, unique: unique.length, missing: unique.filter((x) => !x.translated).length, rows: unique }, null, 2));
