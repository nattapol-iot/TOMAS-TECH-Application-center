import type { AppConfig } from "./config.js";
import { runPendingMigrations } from "./migrate.js";

type MigrationRunner = (config: AppConfig, log: (message: string) => void) => Promise<void>;

export async function runConfiguredMigrations(
  config: AppConfig,
  log: (message: string) => void,
  runner: MigrationRunner = runPendingMigrations,
): Promise<void> {
  if (config.database.runMigrations === false) {
    log("[migrate] Disabled by explicit non-production configuration.");
    return;
  }
  await runner(config, log);
}
