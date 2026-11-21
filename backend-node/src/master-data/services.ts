import type { Database } from "../db.js";
import type { TmtIdConfig } from "../config.js";
import type { TokenSource } from "../tmt-id/token-vault.js";
import { createMasterDataClient } from "./client.js";
import { createHolidaySync, type HolidaySync } from "./holiday-sync.js";
import { createOwnRecordReader, type OwnRecordReader } from "./own-record.js";
import { createRateSource, type RateSource } from "./rate-source.js";

/** What the app reads from tmt-master-data; null when MASTER_DATA_URL and MASTER_DATA_API_KEY are unset. */
export type MasterData = { holidays: HolidaySync; rates: RateSource; ownRecord: OwnRecordReader | null };

export function createMasterData(settings: TmtIdConfig, database: Database, tokens: TokenSource | null,
  onError: (error: unknown, what: string) => void): MasterData | null {
  const client = createMasterDataClient(settings);
  if (!client) return null;
  return {
    holidays: createHolidaySync(client, database, (error) => onError(error, "holiday sync")),
    rates: createRateSource(client),
    // Without the token vault there is no person's token to send, so master cannot be asked for anyone's own record.
    ownRecord: tokens ? createOwnRecordReader(client, tokens, (error) => onError(error, "own record")) : null,
  };
}
