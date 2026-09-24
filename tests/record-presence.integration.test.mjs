import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const forced = process.env.IOT_RUN_SQL_INTEGRATION === "1";

async function sqlServerIsAvailable() {
  const server = process.env.IOT_SQL_SERVER || "localhost";
  try {
    await execFileAsync("sqlcmd", ["-S", server, "-b", "-C", "-E", "-Q", "SET NOCOUNT ON; SELECT 1;"], { timeout: 15_000, windowsHide: true });
    return true;
  } catch (error) {
    if (forced) throw error;
    return false;
  }
}

/* The SQL the API sends, taken from the route module rather than copied, so this test
   can never pass against text the server no longer runs. */
async function dumpRouteSql(directory) {
  const script = `const m = await import(${JSON.stringify(new URL("backend-node/src/routes/record-presence.ts", root).href)});
    const { writeFileSync } = await import("node:fs");
    writeFileSync(${JSON.stringify(join(directory, "estimate-changes.sql"))}, m.ESTIMATE_CHANGES);
    writeFileSync(${JSON.stringify(join(directory, "presence-beat-estimate.sql"))}, m.PRESENCE_BEAT.Estimate);`;
  await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("backend-node/", root)), timeout: 60_000, windowsHide: true,
  });
}

test("a write still open during one beat is reported by the next, under READ_COMMITTED_SNAPSHOT", { timeout: 300_000 }, async (context) => {
  if (process.env.IOT_SKIP_SQL_INTEGRATION === "1") { context.skip("IOT_SKIP_SQL_INTEGRATION=1"); return; }
  if (!(await sqlServerIsAvailable())) {
    context.skip("SQL Server/sqlcmd is unavailable; set IOT_RUN_SQL_INTEGRATION=1 in SQL-backed CI to make availability mandatory.");
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "record-presence-sql-"));
  try {
    await dumpRouteSql(directory);
    const script = fileURLToPath(new URL("tests/integration/record-presence-cursor.ps1", root));
    const executable = process.platform === "win32" ? "powershell.exe" : "pwsh";
    const args = [...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []), "-NoLogo", "-NoProfile", "-File", script,
      "-Server", process.env.IOT_SQL_SERVER || "localhost", "-SqlDirectory", directory];
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: fileURLToPath(root), timeout: 280_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    context.diagnostic(stdout.trim());
    assert.match(stdout, /Record presence cursor semantics passed/);
    if (stderr.trim()) context.diagnostic(stderr.trim());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
