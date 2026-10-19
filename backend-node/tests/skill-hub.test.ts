import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildInstallerScript, readSkillCatalog } from "../src/routes/skill-hub.js";

test("skill catalog validates metadata and publishes bounded regular files", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-hub-"));
  try {
    assert.deepEqual(await readSkillCatalog(root), []);
    const entry = { slug: "example-skill", title: "Example", description: "Description", category: "Tools", targets: ["claude", "codex"] };
    await writeFile(join(root, "catalog.json"), JSON.stringify({ skills: [entry,
      { ...entry, slug: "../escape" }, { ...entry, slug: "Bad-slug" }, { ...entry, slug: "x" },
      { ...entry, slug: "a".repeat(64) }, { ...entry, slug: "bad-target", targets: ["other"] },
      { ...entry, slug: "empty-target", targets: [] }, { ...entry, slug: "no-metadata", title: null },
      { ...entry, slug: "missing-skill" }, entry] }));
    const folder = join(root, entry.slug);
    await mkdir(join(folder, "references", "nested", "too-deep"), { recursive: true });
    await mkdir(join(folder, ".hidden"));
    await mkdir(join(root, "missing-skill"));
    await writeFile(join(root, "missing-skill", "README.md"), "Not a skill");
    await writeFile(join(folder, "SKILL.md"), "# Example\nภาษาไทย");
    await writeFile(join(folder, "references", "guide.md"), "Guide");
    await writeFile(join(folder, "references", "nested", "allowed.md"), "Depth 2");
    await writeFile(join(folder, "references", "nested", "too-deep", "hidden.md"), "Too deep");
    await writeFile(join(folder, ".secret"), "Hidden");
    await writeFile(join(folder, ".hidden", "secret.md"), "Hidden directory");
    await writeFile(join(folder, "large.txt"), Buffer.alloc(256 * 1024 + 1));
    const skills = await readSkillCatalog(root);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]?.title, entry.title);
    assert.deepEqual(skills[0]?.targets, entry.targets);
    assert.deepEqual(skills[0]?.files.map((file) => file.path).sort(), ["SKILL.md", "references/guide.md", "references/nested/allowed.md"].sort());
    assert.equal(skills[0]?.files.find((file) => file.path === "SKILL.md")?.content, "# Example\nภาษาไทย");
    for (const name of ["one", "two", "three", "four"]) await writeFile(join(folder, `${name}.txt`), Buffer.alloc(256 * 1024, 65));
    assert.deepEqual(await readSkillCatalog(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("installer is ASCII CRLF with an exact UTF-8 JSON payload after its last marker", () => {
  const files = [{ path: "SKILL.md", content: "# ทดสอบ\n::SKILL-PAYLOAD::\n日本語" }, { path: "references/guide.md", content: "Guide" }];
  for (const target of ["claude", "codex"] as const) {
    const script = buildInstallerScript("example-skill", target, files);
    assert.ok(script.startsWith("@echo off\r\nsetlocal\r\n"));
    assert.equal(script.replaceAll("\r\n", "").includes("\n"), false);
    assert.equal(script.replaceAll("\r\n", "").includes("\r"), false);
    // The whole installer is ASCII: the Thai text travels only inside the base64 payload.
    assert.equal([...script].every((character) => character.charCodeAt(0) < 0x80), true);
    const marker = "\r\n::SKILL-PAYLOAD::\r\n";
    assert.ok(script.includes(marker));
    const payload = script.slice(script.lastIndexOf(marker) + marker.length).trim();
    assert.deepEqual(JSON.parse(Buffer.from(payload, "base64").toString("utf8")), files);
    assert.ok(script.includes(`.${target}\\skills\\example-skill`));
    assert.ok(script.includes("$marker[$marker.Count - 1]"));
    assert.ok(script.includes("exit /b %SKILL_HUB_EXIT%"));
  }
});

test("installer rejects traversal, absolute paths and Windows path aliases", () => {
  for (const path of ["../escape", "references/../../escape", "a..b", "/absolute", "\\absolute", "C:\\escape", "C:escape", "folder\\..\\escape", "file:stream", ".hidden", "folder./file", "NUL.txt", ""]) {
    assert.throws(() => buildInstallerScript("example-skill", "codex", [{ path, content: "x" }]), /Unsafe/);
  }
  assert.throws(() => buildInstallerScript("../escape", "codex", []), /Invalid/);
});
