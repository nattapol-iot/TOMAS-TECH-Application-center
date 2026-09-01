import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["app/system/screens", "app/system/production"];
const i18nFile = "app/system/i18n.ts";
const i18nSource = ts.createSourceFile(i18nFile, fs.readFileSync(i18nFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const dictionary = new Set();

function textOfName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText();
}

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function visitDictionary(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText() === "DICTIONARY" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property)) dictionary.add(textOfName(property.name));
    }
  }
  ts.forEachChild(node, visitDictionary);
}
visitDictionary(i18nSource);

const files = roots.flatMap((root) => fs.readdirSync(root)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => path.join(root, file)));

const findings = [];
const seen = new Set();
function add(file, node, kind, value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || !/[A-Za-z\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF]/.test(normalized)) return;
  if (dictionary.has(normalized)) return;
  const line = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()).line + 1;
  const key = `${file}:${line}:${kind}:${normalized}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ file: file.replaceAll("\\", "/"), line, kind, value: normalized });
}

const translatedComponents = new Map([
  ["PageHeader", new Set(["eyebrow", "title", "subtitle"])],
  ["Panel", new Set(["title", "subtitle"])],
  ["KpiCard", new Set(["label", "note"])],
  ["SearchInput", new Set(["placeholder"])],
  ["Field", new Set(["label", "hint"])],
  ["Select", new Set(["label"])],
  ["EmptyState", new Set(["title", "message"])],
  ["Modal", new Set(["title"])],
  ["Drawer", new Set(["title"])],
]);

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "uiText"].includes(node.expression.text)) {
      const value = node.arguments[0] && literal(node.arguments[0]);
      if (value !== undefined) add(file, node, "translation-call", value);
    }
    if (ts.isPropertyAssignment(node) && textOfName(node.name) === "label") {
      const value = literal(node.initializer);
      if (value !== undefined) add(file, node, "label-property", value);
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText();
      const props = translatedComponents.get(tag);
      if (props) {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !props.has(attr.name.text) || !attr.initializer) continue;
          let value;
          if (ts.isStringLiteral(attr.initializer)) value = attr.initializer.text;
          else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) value = literal(attr.initializer.expression);
          if (value !== undefined) add(file, attr, `${tag}.${attr.name.text}`, value);
        }
      }
    }
    if (ts.isJsxText(node)) {
      const parent = node.parent;
      const tag = ts.isJsxElement(parent) ? parent.openingElement.tagName.getText() : "";
      if (tag !== "LocalizedText") add(file, node, `jsx-text:${tag}`, node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const grouped = Object.groupBy(findings, (entry) => entry.file);
const summary = Object.entries(grouped)
  .map(([file, entries]) => ({ file, count: entries.length }))
  .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
console.log(JSON.stringify({ dictionarySize: dictionary.size, files: files.length, findings: findings.length, summary, details: findings }, null, 2));
