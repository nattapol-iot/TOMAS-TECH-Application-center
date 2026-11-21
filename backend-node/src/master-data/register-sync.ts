import sql from "mssql";
import type { Database } from "../db.js";
import { MASTER_KINDS } from "../erp-master-data.js";
import type { ErpMasterSync } from "../erp-master-sync.js";
import { REGISTER_SYNC_ACCOUNT_EMAIL, REGISTER_SYNC_FIRST_RUN_MS, REGISTER_SYNC_INTERVAL_MS } from "./constants.js";

export type RegisterSchedule = { start: () => void; stop: () => void };

/**
 * Runs the customer and supplier register sync on its own, shortly after start and then hourly, under the master data
 * sync account. Opening the screens still syncs too; the shared 15-minute lease keeps the two from running at once.
 */
export function createRegisterSchedule(registers: ErpMasterSync, database: Database, onError: (error: unknown) => void): RegisterSchedule {
  let timer: NodeJS.Timeout | null = null, firstRun: NodeJS.Timeout | null = null, running = false;

  const run = async () => {
    const account = (await database.query<{ id: number | string }>(`SELECT id FROM dbo.users WHERE email=@email;`,
      (request) => request.input("email", sql.NVarChar(256), REGISTER_SYNC_ACCOUNT_EMAIL))).recordset[0];
    if (!account) throw new Error("The master data sync account is missing; apply migration 122.");
    // Master answers with the API key alone, so the account needs no TMT ID subject.
    const actor = { id: Number(account.id), entraObjectId: "" };
    for (const kind of MASTER_KINDS) {
      const outcome = await registers.sync(kind, actor, false);
      if (outcome.state === "failed") onError(new Error(`${kind}: ${outcome.message ?? "sync failed"}`));
    }
  };

  const tick = () => {
    if (running) return;
    running = true;
    void run().catch(onError).finally(() => { running = false; });
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, REGISTER_SYNC_INTERVAL_MS);
      timer.unref();
      firstRun = setTimeout(tick, REGISTER_SYNC_FIRST_RUN_MS);
      firstRun.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      if (firstRun) clearTimeout(firstRun);
      timer = null;
      firstRun = null;
    },
  };
}
