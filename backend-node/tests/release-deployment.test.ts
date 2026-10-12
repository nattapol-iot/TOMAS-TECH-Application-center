import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { artifactStorageKey, deployableAssetKind, deploymentBlocker, storeArtifact, type ProgramState } from "../src/release-deployment.js";
import { parseHeartbeat } from "../src/site-monitor.js";

const ready: ProgramState = { removed: false, agentRevoked: false, siteActive: true, agentOnline: true, allowsControl: true, repository: "collector" };

test("only a .zip or an .exe from a release can be installed", () => {
  assert.equal(deployableAssetKind("collector-1.2.0.zip"), "zip");
  assert.equal(deployableAssetKind("Collector.EXE"), "exe");
  for (const name of ["setup.msi", "notes.txt", "", ".hidden.zip", "../x.zip", "a/b.zip", "a\\b.exe"]) {
    assert.equal(deployableAssetKind(name), null, name);
  }
});

test("a program takes an update only when it is monitored, linked, controllable and, to approve, online", () => {
  assert.equal(deploymentBlocker(ready, "request"), null);
  assert.equal(deploymentBlocker(ready, "approve"), null);
  // A request may wait for an offline machine; the approval queues the command and needs it online.
  assert.equal(deploymentBlocker({ ...ready, agentOnline: false }, "request"), null);
  assert.equal(deploymentBlocker({ ...ready, agentOnline: false }, "approve")?.code, "monitor_agent_offline");
  assert.equal(deploymentBlocker({ ...ready, repository: "" }, "request")?.code, "monitor_program_no_repository");
  assert.equal(deploymentBlocker({ ...ready, allowsControl: false }, "request")?.code, "monitor_control_disabled");
  assert.equal(deploymentBlocker({ ...ready, siteActive: false }, "approve")?.code, "monitor_site_inactive");
  assert.equal(deploymentBlocker({ ...ready, removed: true }, "approve")?.code, "monitor_program_not_found");
  assert.equal(deploymentBlocker({ ...ready, agentRevoked: true }, "request")?.code, "monitor_program_not_found");
});

test("release copies are stored under a fresh folder with a safe name", () => {
  const key = artifactStorageKey("collector 1.2.0?.zip", new Date("2026-10-12T00:00:00Z"));
  assert.match(key, /^monitor-deployments\/2026\/10\/[0-9a-f-]{36}\/collector 1\.2\.0_\.zip$/);
  assert.notEqual(artifactStorageKey("a.zip"), artifactStorageKey("a.zip"));
});

test("a release file is stored with its SHA-256, and a short or long download is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "deploy-artifact-"));
  const storage = { mode: "Local" as const, rootPath: root, maxFileSizeBytes: 1_048_576 };
  try {
    const bytes = Buffer.from("PK release bytes");
    const stored = await storeArtifact(storage, "monitor-deployments/t/a/collector.zip", new Response(bytes).body, bytes.length);
    assert.equal(stored.sizeBytes, bytes.length);
    assert.equal(stored.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(await readFile(join(root, "monitor-deployments", "t", "a", "collector.zip")), bytes);

    await assert.rejects(storeArtifact(storage, "monitor-deployments/t/b/short.zip", new Response(bytes).body, bytes.length + 5), { code: "monitor_artifact_size_mismatch" });
    await assert.rejects(storeArtifact(storage, "monitor-deployments/t/c/long.zip", new Response(bytes).body, bytes.length - 5), { code: "monitor_artifact_size_mismatch" });
    await assert.rejects(storeArtifact(storage, "monitor-deployments/t/d/huge.zip", new Response(bytes).body, 600 * 1024 * 1024), { code: "monitor_artifact_too_large" });
    // Nothing half-written is left behind.
    assert.deepEqual(await readdir(join(root, "monitor-deployments", "t", "b")), []);
    assert.deepEqual(await readdir(join(root, "monitor-deployments", "t", "c")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("heartbeats carry each program's version, empty from older agents", () => {
  const parsed = parseHeartbeat({
    batchId: "0b2f1c9e-8a5b-4f3e-9d7a-1c2b3a4d5e6f",
    programs: [
      { key: "collector", name: "Collector", isRunning: true, version: " 1.2.0 " },
      { key: "old", name: "Old agent program", isRunning: false },
    ],
  });
  assert.equal(parsed.programs[0]!.version, "1.2.0");
  assert.equal(parsed.programs[1]!.version, "");
});
