import sql from "mssql";
import type { Database } from "../db.js";
import type { MasterDataClient } from "./client.js";
import { EMPLOYEE_DIRECTORY_MIN_PEOPLE, EMPLOYEE_SYNC_FIRST_RUN_MS, EMPLOYEE_SYNC_INTERVAL_MS, MASTER_DATA_PATHS } from "./constants.js";
import { planEmployeeSync, type LocalEmployee } from "./employee-plan.js";

export type EmployeeSync = { start: () => void; stop: () => void };

const APPLY = `
  UPDATE employee SET name_en=change.name_en, name_th=change.name_th, nickname=change.nickname,
    master_lineworks_id=change.master_key, master_synced_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME()
  FROM dbo.employees employee
  JOIN OPENJSON(@changes) WITH (id bigint, master_key nvarchar(100) '$.masterKey', name_en nvarchar(200) '$.nameEn',
    name_th nvarchar(200) '$.nameTh', nickname nvarchar(100) '$.nickname') change ON change.id = employee.id
  WHERE employee.deleted_at IS NULL;
  UPDATE dbo.employees SET is_active=0, updated_at=SYSUTCDATETIME()
  WHERE deleted_at IS NULL AND is_active=1 AND master_lineworks_id IS NOT NULL
    AND id IN (SELECT CONVERT(bigint, [value]) FROM OPENJSON(@deactivate));`;

/** Names, nicknames and who has left, from master's employee directory: shortly after start, then hourly. */
export function createEmployeeSync(client: MasterDataClient, database: Database, onError: (error: unknown) => void): EmployeeSync {
  let timer: NodeJS.Timeout | null = null, firstRun: NodeJS.Timeout | null = null, running = false;

  const run = async () => {
    const directory = await client.listAll(`${MASTER_DATA_PATHS.employees}?limit=500`);
    // A short answer is an outage or a narrowed key, never the company emptying out; nobody is switched off on it.
    if (directory.length < EMPLOYEE_DIRECTORY_MIN_PEOPLE) return;
    const local = (await database.query<{ id: number | string; email: string; name_en: string; name_th: string; nickname: string; is_active: boolean; master_lineworks_id: string | null }>(
      `SELECT id,email,name_en,name_th,nickname,is_active,master_lineworks_id FROM dbo.employees WHERE deleted_at IS NULL;`)).recordset
      .map((row): LocalEmployee => ({ id: Number(row.id), email: row.email, nameEn: row.name_en, nameTh: row.name_th, nickname: row.nickname,
        isActive: Boolean(row.is_active), masterKey: row.master_lineworks_id }));
    const plan = planEmployeeSync(local, directory);
    if (!plan.changes.length && !plan.deactivate.length) return;
    await database.query(APPLY, (request) => {
      request.input("changes", sql.NVarChar(sql.MAX), JSON.stringify(plan.changes));
      request.input("deactivate", sql.NVarChar(sql.MAX), JSON.stringify(plan.deactivate));
    });
  };

  const tick = () => {
    if (running) return;
    running = true;
    void run().catch(onError).finally(() => { running = false; });
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, EMPLOYEE_SYNC_INTERVAL_MS);
      timer.unref();
      firstRun = setTimeout(tick, EMPLOYEE_SYNC_FIRST_RUN_MS);
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
