import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isPublishedName, parseFolderInfo, readDownloadCatalog } from "../src/routes/download-center.js";

test("download center hides files nobody means to publish", () => {
  for (const name of ["TMTDesk-Setup.exe", "คู่มือ.pdf", "driver v2.zip"]) assert.equal(isPublishedName(name), true, name);
  for (const name of ["_info.json", ".DS_Store", "#recycle", "~$report.docx", "copy.part", "big.crdownload", "Thumbs.db", "desktop.ini", ""]) {
    assert.equal(isPublishedName(name), false, name);
  }
});

test("download center tolerates a hand-written or broken _info.json", () => {
  assert.deepEqual(parseFolderInfo("not json"), {});
  assert.deepEqual(parseFolderInfo("[]"), {});
  const info = parseFolderInfo(String.fromCharCode(0xfeff) + `{ "title": "โปรแกรม", "order": 1, "files": { "a.exe": { "title": "A", "version": "1.2", "recommended": true }, "bad": 5 } }`);
  assert.equal(info.title, "โปรแกรม");
  assert.equal(info.order, 1);
  assert.deepEqual(Object.keys(info.files ?? {}), ["a.exe"]);
  assert.equal(info.files?.["a.exe"]?.recommended, true);
});

test("download center lists categories and files with their metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "download-center-"));
  try {
    assert.deepEqual(await readDownloadCatalog(join(root, "missing")), []);

    const software = join(root, "Software");
    await mkdir(software);
    await writeFile(join(software, "TMTDesk-Setup.exe"), "setup");
    await writeFile(join(software, "TMTDesk-Portable.exe"), "portable!");
    await writeFile(join(software, "old.part"), "x");
    await writeFile(join(software, "_info.json"), JSON.stringify({
      title: "โปรแกรม", order: 1,
      files: { "TMTDesk-Setup.exe": { title: "TMTDesk (ติดตั้ง)", version: "0.4.0", recommended: true } },
    }));
    await mkdir(join(root, "Manuals"));
    await writeFile(join(root, "Manuals", "guide.pdf"), "pdf");
    await mkdir(join(root, "#recycle"));

    const catalog = await readDownloadCatalog(root);
    assert.deepEqual(catalog.map((c) => c.folder), ["Software", "Manuals"]);
    const [first] = catalog;
    assert.equal(first?.title, "โปรแกรม");
    assert.deepEqual(first?.files.map((f) => f.name), ["TMTDesk-Setup.exe", "TMTDesk-Portable.exe"]);
    assert.equal(first?.files[0]?.version, "0.4.0");
    assert.equal(first?.files[0]?.recommended, true);
    assert.equal(first?.files[1]?.title, "TMTDesk-Portable.exe");
    assert.equal(first?.files[1]?.sizeBytes, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
