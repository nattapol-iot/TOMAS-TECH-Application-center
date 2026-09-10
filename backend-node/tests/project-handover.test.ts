import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStoredDirectory, removeEmptyStoredDirectory } from "../src/document-storage.js";
import { handoverFolder } from "../src/project-handover.js";

test("photographed customer specifications and drawings retain their business folder", () => {
  assert.equal(handoverFolder("Drawing", "image/png"), "02");
  assert.equal(handoverFolder(" Layout ", "image/jpeg"), "02");
  assert.equal(handoverFolder("Customer RFQ", "image/png"), "06");
  assert.equal(handoverFolder("Customer Requirement", "application/pdf"), "06");
  assert.equal(handoverFolder("PO", "image/jpeg"), "05");
});

test("site evidence uses report and media folders while unknown documents remain references", () => {
  assert.equal(handoverFolder("Measurement", "text/plain"), "10");
  assert.equal(handoverFolder("Email / Meeting Note", "application/pdf"), "10");
  assert.equal(handoverFolder("Photo", "image/jpeg"), "13");
  assert.equal(handoverFolder("Other", "video/mp4"), "13");
  assert.equal(handoverFolder("Unknown Category", "application/pdf"), "14");
});

test("rollback folder cleanup prunes empty directories but preserves untracked files", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "handover-folders-"));
  const storage = { mode: "Local" as const, rootPath, maxFileSizeBytes: 1024 };
  try {
    await createStoredDirectory(storage, "projects/1/02/2026/09");
    await createStoredDirectory(storage, "projects/1/14");
    await writeFile(join(rootPath, "projects/1/14/keep.txt"), "preserve me");
    await removeEmptyStoredDirectory(storage, "projects/1");
    await assert.rejects(stat(join(rootPath, "projects/1/02")), { code: "ENOENT" });
    assert.equal(await readFile(join(rootPath, "projects/1/14/keep.txt"), "utf8"), "preserve me");
    await rm(join(rootPath, "projects/1/14/keep.txt"));
    await removeEmptyStoredDirectory(storage, "projects/1");
    await assert.rejects(stat(join(rootPath, "projects/1")), { code: "ENOENT" });
    await removeEmptyStoredDirectory(storage, "projects/1");
  } finally { await rm(rootPath, { recursive: true, force: true }); }
});
