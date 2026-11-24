#!/usr/bin/env node
/*
 * Builds public/templates/customer-schedule.xlsx, the file Projects > Plan > "Export Excel for the customer" fills, from
 * the team's master Gantt workbook (owner 2026-11-24: "[PJ260210] … 08. Schedule/【Gantt chart】Project schedule … R1.xlsx").
 *
 *   node scripts/build-customer-schedule-template.mjs "<master .xlsx>"
 *
 * The master keeps its look, formulas, conditional-format Gantt bars, Display Week scroll bar and help comments. Taken
 * out: links to other workbooks, SharePoint metadata, broken names (#REF!), the calculation chain, and the master's own
 * project (titles, rows and every shared string). Each sheet keeps one row per kind (heading, group, task) as the
 * pattern lib/customer-schedule-template.ts copies for the plan's rows, and the conditional formats are folded into one
 * range per rule that the fill stretches to the last row.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-customer-schedule-template.mjs "<master .xlsx>"');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "public/templates/customer-schedule.xlsx");
const zip = unzipSync(new Uint8Array(readFileSync(source)));
const text = (name) => strFromU8(zip[name]);
const put = (name, value) => (zip[name] = strToU8(value));
const fail = (message) => {
  throw new Error(`customer schedule template: ${message}`);
};

// 1. Parts the customer file does not need.
const dropped = Object.keys(zip).filter((name) => /^customXml\/|^xl\/externalLinks\/|^xl\/calcChain\.xml$|^docProps\/custom\.xml$/.test(name));
for (const name of dropped) delete zip[name];
put("[Content_Types].xml", text("[Content_Types].xml").replace(/<Override PartName="\/(customXml\/[^"]+|xl\/externalLinks\/[^"]+|xl\/calcChain\.xml|docProps\/custom\.xml)"[^>]*\/>/g, ""));
put("_rels/.rels", text("_rels/.rels").replace(/<Relationship [^>]*Target="docProps\/custom\.xml"[^>]*\/>/g, ""));
put("xl/_rels/workbook.xml.rels", text("xl/_rels/workbook.xml.rels").replace(/<Relationship [^>]*Target="(?:\.\.\/customXml\/[^"]+|externalLinks\/[^"]+|calcChain\.xml)"[^>]*\/>/g, ""));

// 2. The workbook: no outside links, no broken names, recalculated when opened.
let workbook = text("xl/workbook.xml")
  .replace(/<mc:AlternateContent[^>]*><mc:Choice Requires="x15"><x15ac:absPath[^>]*\/><\/mc:Choice><\/mc:AlternateContent>/, "")
  .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, "")
  .replace(/<definedName [^>]*>[^<]*<\/definedName>/g, (name) => {
    const key = name.match(/name="([^"]+)"/)[1];
    return key === "prevWBS" || key.startsWith("_xlnm.") ? name : "";
  })
  .replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191028" fullCalcOnLoad="1"/>');
if (/\[\d+\]|#REF!/.test(workbook.match(/<definedNames>[\s\S]*<\/definedNames>/)?.[0] ?? "")) fail("a broken name is left");
put("xl/workbook.xml", workbook);

// 3. Shared strings become inline text in the rows kept, so none of the master's own project travels in the template.
const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => [...match[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((part) => part[1]).join(""));
put("xl/sharedStrings.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');

const letters = (ref) => ref.replace(/\d+$/, "");
const columnIndex = (name) => [...name].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);

/** One sheet: rows 1-7 kept (text inline), pattern rows emptied, conditional formats folded. */
function sheet(path, spec) {
  let xml = text(path);
  const start = xml.indexOf("<sheetData>") + "<sheetData>".length,
    end = xml.indexOf("</sheetData>");
  const rows = [...xml.slice(start, end).matchAll(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>|<row r="(\d+)"[^>]*\/>/g)];
  const kept = [];
  for (const match of rows) {
    const number = Number(match[1] ?? match[2]);
    let row = match[0];
    if (number <= 7) {
      row = row.replace(/<c r="([A-Z]+\d+)"( s="\d+")? t="s"><v>(\d+)<\/v><\/c>/g, (_, ref, style, index) => {
        // The project's own title, customer, number and lead are left blank; the copyright and labels stay.
        const value = (number <= 3 && letters(ref) === "A") || (number === 5 && letters(ref) === "C") ? "" : shared[Number(index)];
        return value ? `<c r="${ref}"${style ?? ""} t="inlineStr"><is><t xml:space="preserve">${value}</t></is></c>` : `<c r="${ref}"${style ?? ""}/>`;
      });
      kept.push(row);
      continue;
    }
    const kind = Object.entries(spec.patterns).find(([, rowNumber]) => rowNumber === number)?.[0];
    if (!kind) continue;
    // The pattern: every cell empty, one style for the day cells (the master has a stray one here and there).
    const dayStyle = row.match(new RegExp(`<c r="${spec.firstDay}${number}" s="(\\d+)"`))?.[1] ?? fail(`no ${spec.firstDay}${number}`);
    row = row
      .replace(/ outlineLevel="\d+"/, "")
      .replace(/<c r="([A-Z]+)(\d+)"( s="\d+")?[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (_, column, rowNumber, style) =>
        columnIndex(column) > columnIndex(spec.firstDay) ? `<c r="${column}${rowNumber}" s="${dayStyle}"/>` : `<c r="${column}${rowNumber}"${style ?? ""}/>`,
      );
    kept.push(row);
  }
  xml = xml.slice(0, start) + kept.join("") + xml.slice(end);

  // Conditional formats: the first rule of each kind, over one range from row 8 (or 6) to the last pattern row.
  const last = Math.max(...Object.values(spec.patterns));
  const blocks = [...xml.matchAll(/<conditionalFormatting[^>]*>[\s\S]*?<\/conditionalFormatting>/g)].map((match) => match[0]);
  const rules = blocks.flatMap((block) => [...block.matchAll(/<cfRule[\s\S]*?<\/cfRule>/g)].map((match) => ({ rule: match[0], sqref: block.match(/sqref="([^"]+)"/)[1] })));
  const pick = (test) => rules.find(test)?.rule ?? fail(`${path}: a conditional format is missing`);
  const dataBar = pick((item) => item.rule.includes('type="dataBar"'));
  const today = pick((item) => item.rule.includes("$6=TODAY()") && /^[A-Z]+6:[A-Z]+7$/.test(item.sqref));
  const todayRows = pick((item) => item.rule.includes("$6=TODAY()") && !/^[A-Z]+6:[A-Z]+7$/.test(item.sqref));
  const progress = pick((item) => item.rule.includes("ROUNDDOWN("));
  const bar = pick((item) => item.rule.includes("NOT(ISBLANK("));
  const day = spec.firstDay,
    lastDay = spec.lastDay;
  const folded = [
    [`${spec.percent}8:${spec.percent}${last}`, dataBar],
    [`${day}6:${lastDay}7`, today],
    [`${day}6:${lastDay}${last}`, todayRows],
    [`${day}8:${lastDay}${last}`, progress],
    [`${day}8:${lastDay}${last}`, bar],
  ]
    .map(([sqref, rule]) => `<conditionalFormatting sqref="${sqref}">${rule}</conditionalFormatting>`)
    .join("");
  const firstBlock = xml.indexOf("<conditionalFormatting");
  xml = xml.replace(/<conditionalFormatting[^>]*>[\s\S]*?<\/conditionalFormatting>/g, "");
  xml = xml.slice(0, firstBlock) + folded + xml.slice(firstBlock);
  // The data bar's 2010 settings, kept for the one bar left.
  const barId = dataBar.match(/<x14:id>([^<]+)<\/x14:id>/)?.[1] ?? fail("no data bar id");
  xml = xml.replace(/<x14:conditionalFormattings>[\s\S]*?<\/x14:conditionalFormattings>/, (all) => {
    const entry = [...all.matchAll(/<x14:conditionalFormatting [\s\S]*?<\/x14:conditionalFormatting>/g)].map((match) => match[0]).find((item) => item.includes(barId)) ?? fail("no 2010 data bar");
    return `<x14:conditionalFormattings>${entry.replace(/<xm:sqref>[^<]*<\/xm:sqref>/, `<xm:sqref>${spec.percent}8:${spec.percent}${last}</xm:sqref>`)}</x14:conditionalFormattings>`;
  });
  xml = xml
    .replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/, "")
    .replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="A1:${lastDay}${last}"/>`)
    .replace(/<selection [^>]*\/>/g, (selection) => selection.replace(/activeCell="[A-Z]+\d+"/, 'activeCell="B8"').replace(/sqref="[^"]+"/, 'sqref="B8"'))
    // Opens at the top, wherever the master was scrolled to.
    .replace(/(<sheetView [^>]*?) topLeftCell="[A-Z]+\d+"/, "$1");
  if (spec.rebuildWeeks) xml = weekHeaders(xml, spec);
  if (/ t="s"/.test(xml)) fail(`${path}: a shared string is left`);
  put(path, xml);
}

const columnName = (index) => {
  let name = "";
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
};
/**
 * Rows 4 and 5 over the days, seven columns a week from the first day: the master's "Task list" has a four-day week at
 * FH:FK, which put every later Week label and Monday on a Friday.
 */
function weekHeaders(xml, spec) {
  const first = columnIndex(spec.firstDay),
    last = columnIndex(spec.lastDay);
  const firstMonday = Number(xml.match(new RegExp(`<c r="${spec.firstDay}6"[^>]*>(?:<f>[^<]*</f>)?<v>(\\d+)</v>`))?.[1] ?? fail("no first date"));
  for (const row of [4, 5]) {
    xml = xml.replace(new RegExp(`<row r="${row}"[^>]*>[\\s\\S]*?</row>`), (line) => {
      const styles = Array.from(
        { length: 7 },
        (_, offset) => line.match(new RegExp(`<c r="${columnName(first + offset)}${row}" s="(\\d+)"`))?.[1] ?? fail(`no style ${columnName(first + offset)}${row}`),
      );
      const before = [...line.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)].filter((cell) => columnIndex(cell[1]) < first).map((cell) => cell[0]);
      const days = [];
      for (let column = first; column <= last; column++) {
        const offset = (column - first) % 7,
          week = (column - first - offset) / 7,
          ref = `${columnName(column)}${row}`,
          style = ` s="${styles[offset]}"`,
          day = columnName(column);
        if (offset || column + 6 > last) days.push(`<c r="${ref}"${style}/>`);
        else if (row === 4) days.push(`<c r="${ref}"${style} t="str"><f>"Week "&amp;(${day}6-($C$4-WEEKDAY($C$4,1)+2))/7+1</f><v>Week ${week + 1}</v></c>`);
        else days.push(`<c r="${ref}"${style}><f>${day}6</f><v>${firstMonday + week * 7}</v></c>`);
      }
      return `${line.slice(0, line.indexOf(">") + 1)}${before.join("")}${days.join("")}</row>`;
    });
  }
  const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):[A-Z]+\d+"\/>/g)]
    .filter((merge) => !((merge[2] === "4" || merge[2] === "5") && columnIndex(merge[1]) >= first))
    .map((merge) => merge[0]);
  for (let column = first; column + 6 <= last; column += 7) for (const row of [4, 5]) merges.push(`<mergeCell ref="${columnName(column)}${row}:${columnName(column + 6)}${row}"/>`);
  return xml.replace(/<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/, `<mergeCells count="${merges.length}">${merges.join("")}</mergeCells>`);
}

sheet("xl/worksheets/sheet1.xml", { firstDay: "K", lastDay: "KY", percent: "H", patterns: { heading: 8, task: 9 } });
sheet("xl/worksheets/sheet2.xml", { firstDay: "J", lastDay: "GX", percent: "G", patterns: { heading: 8, group: 9, task: 10 }, rebuildWeeks: true });

// Help notes on the header row stay; a note anyone left on a plan row is the master project's own, so it goes.
for (const [comments, drawing] of [
  ["xl/comments1.xml", "xl/drawings/vmlDrawing1.vml"],
  ["xl/comments2.xml", "xl/drawings/vmlDrawing2.vml"],
]) {
  put(
    comments,
    text(comments)
      .replace(/<comment ref="[A-Z]+(\d+)"[\s\S]*?<\/comment>/g, (note, row) => (Number(row) >= 8 ? "" : note))
      .replace(/<author>(?!Vertex42)[^<]*<\/author>/g, "<author>TOMAS TECH</author>"),
  );
  put(
    drawing,
    text(drawing).replace(/<v:shape [\s\S]*?<\/v:shape>/g, (shape) => (shape.includes('ObjectType="Note"') && Number(shape.match(/<x:Row>(\d+)<\/x:Row>/)?.[1] ?? 0) >= 7 ? "" : shape)),
  );
}

// No one's name in the file's properties; the sheet list is left to Excel.
put(
  "docProps/core.xml",
  text("docProps/core.xml")
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>Project Schedule</dc:title>")
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy>TOMAS TECH</cp:lastModifiedBy>"),
);
put(
  "docProps/app.xml",
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>TOMAS TECH</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>',
);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, zipSync(zip, { level: 9 }));
console.log(`wrote ${target} (${readFileSync(target).length} bytes; dropped ${dropped.length} parts)`);
