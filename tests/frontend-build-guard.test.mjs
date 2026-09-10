import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

test("build cannot replace a live frontend, but an isolated checkout can build", () => {
  const root = mkdtempSync(join(tmpdir(), "frontend-build-guard-"));
  const folder = join(root, "IoTTeamCenter", "TeamTest");
  mkdirSync(folder, { recursive: true });
  const run = () => spawnSync(process.execPath, ["scripts/guard-running-frontend-build.mjs"], {
    encoding: "utf8", env: { ...process.env, LOCALAPPDATA: root },
  });
  try {
    assert.equal(run().status, 0, "no managed runtime allows a build");
    const state = { ProcessId: process.pid, Entrypoint: resolve("node_modules/vinext/dist/cli.js") };
    writeFileSync(join(folder, "frontend.pid.json"), JSON.stringify(state));
    const blocked = run();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Build blocked/);
    writeFileSync(join(folder, "frontend.pid.json"), JSON.stringify({ ...state, Entrypoint: join(root, "another-checkout", "node_modules/vinext/dist/cli.js") }));
    assert.equal(run().status, 0, "a different checkout does not replace the running build");
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});
