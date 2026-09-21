import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  ERP_CATEGORIES,
  buildErpSummary,
  parseErpCategory,
  type ErpHeaderRow,
  type ErpLineRow,
} from "../src/estimate-erp.js";
import { parseExportEvent, parseMappings } from "../src/routes/estimate-erp.js";

const header: ErpHeaderRow = {
  id: 42,
  revision: 3,
  status: "Approved",
  owner_id: 7,
  row_version: Buffer.from("12345678"),
  canonical_total: 1000,
  overhead_total: 0,
  overhead_state: "Zero",
};

function line(overrides: Partial<ErpLineRow>): ErpLineRow {
  return {
    source_type: "CostItem",
    source_id: 1,
    description: "PLC",
    internal_category: "01 Hardware",
    amount: 1000,
    erp_category: "Hardware",
    mapping_row_version: null,
    copied_from_revision: null,
    manual_override: false,
    item: "PLC-01",
    model_part_number: "FX5U",
    supplier: "Supplier A",
    brand: "Mitsubishi",
    lead_time: null,
    quote_revision: "QT-01",
    unit_price: 1000,
    quantity: 1,
    unit: "pc",
    remark: null,
    ...overrides,
  };
}

test("ERP summary always returns the seven categories in fixed ERP order", () => {
  const summary = buildErpSummary(header, [line({})], true);
  assert.deepEqual(summary.categories.map((entry) => entry.category), ERP_CATEGORIES);
  assert.deepEqual(summary.categories.map((entry) => entry.amount), [1000, 0, 0, 0, 0, 0, 0]);
  assert.equal(summary.reconciled, true);
  assert.equal(summary.capabilities.canExport, true);
  assert.equal(summary.lines[0]?.modelPartNumber, "FX5U");
});

test("ERP summary covers every source ledger and contingency while reconciling the separate overhead footer", () => {
  const rows: ErpLineRow[] = [
    line({ source_type: "CostItem", source_id: 11, amount: 100, erp_category: "Hardware" }),
    line({ source_type: "ManhourLine", source_id: 12, amount: 200, erp_category: "Service" }),
    line({ source_type: "ExpenseLine", source_id: 13, amount: 300, erp_category: "Installation" }),
    line({ source_type: "OtherCostLine", source_id: 14, amount: 150, erp_category: "Training" }),
    line({ source_type: "Contingency", source_id: null, amount: 200, erp_category: "Unmapped" }),
  ];
  const summary = buildErpSummary({ ...header, overhead_total: 50, canonical_total: 1000 }, rows, true);
  assert.equal(summary.lines.length, 5);
  assert.equal(summary.classifiedTotal, 750);
  assert.deepEqual(summary.overhead, { state: "Zero", amount: 50 });
  assert.deepEqual(summary.unmapped, { amount: 200, lineCount: 1 });
  assert.equal(summary.difference, 0);
  assert.equal(summary.capabilities.canExport, false);
});

test("ERP reconciliation tolerates one satang and preserves mapping provenance", () => {
  const summary = buildErpSummary(
    { ...header, canonical_total: 100.01 },
    [line({ amount: 100, mapping_row_version: Buffer.from("abcdefgh"), copied_from_revision: 2 })],
    false,
  );
  assert.equal(summary.difference, -0.01);
  assert.equal(summary.reconciled, true);
  assert.equal(summary.capabilities.canEditMappings, false);
  assert.equal(summary.lines[0]?.mappingRowVersion, Buffer.from("abcdefgh").toString("base64"));
  assert.equal(summary.lines[0]?.copiedFromRevision, 2);
});

test("ERP export remains blocked until the overhead policy is resolved while the overhead feature is on", () => {
  const summary = buildErpSummary(
    { ...header, overhead_state: "Missing", overhead_total: null },
    [line({})],
    true,
    { overheadEnabled: true },
  );
  assert.equal(summary.reconciled, true);
  assert.equal(summary.capabilities.canExport, false);
});

test("ERP export ignores the missing overhead policy while the overhead feature is switched off", () => {
  const summary = buildErpSummary(
    { ...header, overhead_state: "Missing", overhead_total: null },
    [line({})],
    true,
    { overheadEnabled: false },
  );
  assert.equal(summary.capabilities.canExport, true);
  assert.equal(summary.overhead.amount, 0, "overhead stays reported as zero so the reconciliation footer is unchanged");
});

test("zero contingency is omitted and does not create a false unmapped blocker", () => {
  const summary = buildErpSummary(header, [
    line({}),
    line({ source_type: "Contingency", source_id: null, amount: 0, erp_category: "Unmapped" }),
  ], true);
  assert.equal(summary.lines.length, 1);
  assert.deepEqual(summary.unmapped, { amount: 0, lineCount: 0 });
  assert.equal(summary.capabilities.canExport, true);
});

test("mapping input enforces categories, source identifiers, concurrency versions and duplicates", () => {
  const version = Buffer.from("abcdefgh").toString("base64");
  assert.deepEqual(parseMappings([
    { sourceType: "CostItem", sourceId: 9, erpCategory: "License", mappingRowVersion: version },
    { sourceType: "Contingency", sourceId: null, erpCategory: "Service", mappingRowVersion: null },
  ]).map((mapping) => ({ ...mapping, mappingRowVersion: mapping.mappingRowVersion?.toString("base64") ?? null })), [
    { sourceType: "CostItem", sourceId: 9, erpCategory: "License", mappingRowVersion: version },
    { sourceType: "Contingency", sourceId: null, erpCategory: "Service", mappingRowVersion: null },
  ]);
  assert.throws(() => parseErpCategory("Maintianance"), /must be one of/);
  assert.throws(() => parseMappings([{ sourceType: "ExpenseLine", sourceId: null, erpCategory: "Service" }]), /Source id/);
  assert.throws(() => parseMappings([{ sourceType: "Contingency", sourceId: 1, erpCategory: "Service" }]), /must not have/);
  assert.throws(() => parseMappings([
    { sourceType: "CostItem", sourceId: 1, erpCategory: "Hardware" },
    { sourceType: "CostItem", sourceId: 1, erpCategory: "Software" },
  ]), /Duplicate/);
});

test("ERP export audit input requires the fixed template, safe filename and SHA-256", () => {
  const version = Buffer.from("abcdefgh").toString("base64");
  const workbook = Buffer.concat([Buffer.from("PK"), Buffer.alloc(198, 1)]);
  const checksum = createHash("sha256").update(workbook).digest("hex");
  const valid = { estimateRowVersion: version, templateVersion: "ERP_SUMMARY_V1", sha256: checksum, filename: "EST-001_R00.xlsx", fileBase64: workbook.toString("base64") };
  const parsed = parseExportEvent(valid);
  assert.equal(parsed.estimateRowVersion.toString("base64"), version);
  assert.throws(() => parseExportEvent({ ...valid, templateVersion: "ERP_SUMMARY_V2" }), /template version/);
  assert.throws(() => parseExportEvent({ ...valid, sha256: "bad" }), /SHA-256/);
  assert.throws(() => parseExportEvent({ ...valid, filename: "../test.xlsx" }), /filename/);
  assert.throws(() => parseExportEvent({ ...valid, sha256: "a".repeat(64) }), /does not match/);
});

test("migration locks mappings to a revision and records copy provenance", async () => {
  const [migration, revisionWorkflow] = await Promise.all([
    readFile(new URL("../../database/migrations/043_estimate_erp_cost_mapping.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/estimates.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /version = 43/);
  assert.match(migration, /trg_estimate_erp_mappings_current_revision_only/);
  assert.match(migration, /status NOT IN\(N'Draft',N'Engineering Input',N'Engineering Review',N'Revision Required'\)/);
  assert.match(migration, /copied_from_mapping_id/);
  assert.match(migration, /row_version rowversion NOT NULL/);
  for (const category of [...ERP_CATEGORIES, "Unmapped"]) assert.match(migration, new RegExp(`N'${category}'`));
  assert.match(revisionWorkflow, /copied_from_mapping_id,copied_from_revision/);
  assert.match(revisionWorkflow, /materializeErpMappings/);
  assert.match(revisionWorkflow, /erpMappings/);
  assert.match(revisionWorkflow, /estimate_erp_mapping_incomplete/);
  assert.match(revisionWorkflow, /INNER JOIN @copiedCosts/);
  assert.match(revisionWorkflow, /INNER JOIN @copiedManhours/);
  assert.match(revisionWorkflow, /INNER JOIN @copiedExpenses/);
  assert.match(revisionWorkflow, /INNER JOIN @copiedOtherCosts/);
});

test("writes to triggered estimate tables route OUTPUT into a table variable", async () => {
  // SQL Server rejects OUTPUT without INTO on any table with an enabled trigger (error 334), which the API surfaces as a bare 503.
  const triggered = ["estimate_erp_mappings", "cost_items", "manhour_lines", "expense_lines", "other_cost_lines", "estimate_revisions"];
  const routes = await Promise.all(["estimate-erp", "estimate-workspace-write", "estimate-cost-write", "estimates"].map((name) =>
    readFile(new URL(`../src/routes/${name}.ts`, import.meta.url), "utf8")));
  // Stay inside one template literal so an OUTPUT from a later statement is never attributed to an earlier write.
  const pattern = new RegExp(`(?:UPDATE|INSERT(?: INTO)?) dbo\\.(${triggered.join("|")})\\b[^\`]*?OUTPUT inserted\\.[^\\n]*`, "g");
  const writes = routes.flatMap((source) => source.match(pattern) ?? []);
  assert.ok(writes.some((write) => write.includes("dbo.estimate_erp_mappings")), "expected mapping writes to be covered");
  for (const write of writes) assert.match(write, /OUTPUT inserted\.[\w.,]+ INTO @\w+/, `OUTPUT without INTO fails with SQL error 334 on a triggered table:\n${write}`);
});

test("ERP export requires approval even when mapped and reconciled", () => {
  for (const status of ["Draft", "Engineering Input", "Engineering Review", "Revision Required", "Locked"]) {
    assert.equal(buildErpSummary({ ...header, status }, [line({})], false).capabilities.canExport, false, status);
  }
  assert.equal(buildErpSummary({ ...header, status: "Approved" }, [line({})], false).capabilities.canExport, true);
});
