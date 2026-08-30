import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const script = new URL("tests/integration/full-material-flow.ps1", root);
const forced = process.env.IOT_RUN_SQL_INTEGRATION === "1";

async function sqlServerIsAvailable() {
  const server = process.env.IOT_SQL_SERVER || "localhost";
  const args = ["-S", server, "-b", "-C", "-Q", "SET NOCOUNT ON; SELECT 1;"];
  if (process.env.IOT_SQL_USER) args.push("-U", process.env.IOT_SQL_USER);
  else args.push("-E");
  try {
    const env = { ...process.env };
    if (process.env.IOT_SQL_USER && process.env.IOT_SQL_PASSWORD) {
      env.SQLCMDPASSWORD = process.env.IOT_SQL_PASSWORD;
    }
    await execFileAsync("sqlcmd", args, { env, timeout: 15_000, windowsHide: true });
    return true;
  } catch (error) {
    if (forced) throw error;
    return false;
  }
}

test("fresh database completes the full material, schedule, and reporting flow", { timeout: 360_000 }, async (context) => {
  if (process.env.IOT_SKIP_SQL_INTEGRATION === "1") {
    context.skip("IOT_SKIP_SQL_INTEGRATION=1");
    return;
  }
  if (!(await sqlServerIsAvailable())) {
    context.skip("SQL Server/sqlcmd is unavailable; set IOT_RUN_SQL_INTEGRATION=1 in SQL-backed CI to make availability mandatory.");
    return;
  }

  const executable = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const scriptPath = fileURLToPath(script);
  const args = process.platform === "win32"
    ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
    : ["-NoLogo", "-NoProfile", "-File", scriptPath];
  const { stdout, stderr } = await execFileAsync(executable, args, {
    cwd: fileURLToPath(root),
    env: process.env,
    timeout: 350_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  assert.match(stdout, /Full material flow, schedule, reports, stock balance, and actual cost passed/);
  if (stderr.trim()) context.diagnostic(stderr.trim());
});
