import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

// A vinext production process retains its build manifest in memory. Rebuilding
// its dist directory removes the chunks it still serves and can change auth mode.
if (process.env.LOCALAPPDATA) {
  const statePath = join(process.env.LOCALAPPDATA, "IoTTeamCenter", "TeamTest", "frontend.pid.json");
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const entrypoint = resolve("node_modules/vinext/dist/cli.js").toLowerCase();
  if (state?.Entrypoint && resolve(state.Entrypoint).toLowerCase() === entrypoint) {
    const pid = Number(state.ProcessId);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid managed frontend PID; verify the runtime state before building.");
    let running = true;
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === "ESRCH") running = false; else throw error; }
    if (running) {
      throw new Error("Build blocked: this workspace serves the running Team Test frontend. Stop it with scripts/Stop-TeamTestLanFrontend.ps1 first, then use scripts/Start-TeamTestLanFrontend.ps1 to rebuild with the correct Team Test settings and restart. Run verification builds in a separate checkout.");
    }
  }
}
