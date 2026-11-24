import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { documentSource } from "../lib/project-documents.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("a project document's source comes from the handover remark or the plan export (task doc 5.5)", () => {
  // The remarks project-handover.ts writes: a copied attachment, and a snapshot made when the project was created.
  const copied = (type, no) => `Source: ${type} ${no}; attachment 4; version 1; category Drawing. Copied when project was created.`;
  assert.equal(documentSource({ remark: copied("Inquiry", "INQ-26-014"), documentType: "Drawing" }), "inquiry");
  assert.equal(documentSource({ remark: copied("SalesIntake", "SI-26-003"), documentType: "Drawing" }), "inquiry");
  assert.equal(documentSource({ remark: copied("SiteVisit", "SV-26-031"), documentType: "Photo" }), "siteVisit");
  assert.equal(documentSource({ remark: copied("SupplierQuotation", "Q-77"), documentType: "Supplier quotation" }), "estimate");
  assert.equal(documentSource({ remark: "Source: Inquiry INQ-26-014. Snapshot when project was created.", documentType: "Specification" }), "inquiry");
  assert.equal(documentSource({ remark: "Source: Estimate E-26-112 revision 2. Snapshot when project was created.", documentType: "Estimate cost" }), "estimate");
  assert.equal(documentSource({ remark: "Source: SiteVisitReport R-26-009 revision 1; SiteVisit SV-26-031. Snapshot when project was created.", documentType: "Report" }), "siteVisit");
  // The customer schedule export (PlanSheet.tsx); a hand upload that only shares its type stays an upload.
  assert.equal(documentSource({ remark: "Exported from the plan on 2026-11-24", documentType: "Customer schedule" }), "plan");
  assert.equal(documentSource({ remark: null, documentType: "Customer schedule" }), "upload");
  assert.equal(documentSource({ remark: "Inquiry notes typed by hand later", documentType: "Note" }), "upload");
  assert.equal(documentSource({ remark: "Source: somewhere else", documentType: "Drawing" }), "upload");
  assert.equal(documentSource({ remark: "sent to customer", documentType: "Drawing" }), "upload");
});

test("the project page's Documents tab: folders with counts, sources, search and many files at once", async () => {
  const tab = await source("app/system/production/ProjectDocumentsTab.tsx");
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /shownTab === "documents" \? <ProjectDocumentsTab project=\{item\} canWrite=\{canWrite\} notify=\{notify\} \/> : null/);
  for (const mark of ["projectDocs.folders", "projectDocs.sources", "projectDocs.drop"]) assert.ok(tab.includes(`data-guide="${mark}"`), mark);
  assert.match(tab, /<input\s+ref=\{picker\}\s+type="file"\s+multiple/);
  // One file at a time, each with its own folder and type; a refused one says why and the rest go on.
  assert.match(tab, /for \(const item of ready\) \{/);
  assert.match(tab, /uploadProjectDocument\(project\.id, \{ file: item\.file, folderCode: item\.folderCode, documentType: item\.documentType\.trim\(\) \}\)/);
  assert.doesNotMatch(tab, /className=\{[^}]*"empty"/, "the app's .empty class would turn a folder into a placeholder box");
});
