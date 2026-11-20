/**
 * A backup of the database before a deploy changes its schema or data (owner rule, 2026-11-20: back up before migrating).
 *
 * The deploy's one-off migration container runs this with the owner login, only when a migration is pending. The file goes to
 * the SQL Server's own default backup directory, on the database host. It is a COPY_ONLY backup, so it does not disturb a
 * scheduled backup chain. If it cannot be written, nothing is migrated and the deploy stops with the old containers running.
 * Files are not removed here: clearing old ones is the database host's job.
 */

/** The file name after the database's name: the first pending migration and the UTC time, e.g. `_before_migration_109_20261120T013000Z.bak`. */
export function migrationBackupSuffix(firstPending: number, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/[.][0-9]+Z$/, "Z");
  return `_before_migration_${String(firstPending).padStart(3, "0")}_${stamp}.bak`;
}

/**
 * One batch: the instance's backup directory (Windows or Linux paths; the data file's directory when it has none), a full COPY_ONLY backup with page checksums, then a
 * verify. The verify needs a server permission the migration login may not hold, so a refused verify is reported, not fatal:
 * the backup itself was already written with CHECKSUM.
 */
export const MIGRATION_BACKUP_SQL = `SET NOCOUNT ON;
DECLARE @directory nvarchar(4000)=CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
-- An instance with no default backup directory (LocalDB, some containers): beside the database's own data file.
DECLARE @data nvarchar(4000)=(SELECT TOP(1) physical_name FROM sys.database_files WHERE type=0 ORDER BY file_id);
IF @directory IS NULL OR LEN(@directory)=0
  SET @directory=CASE WHEN CHARINDEX(N'/',@data)>0 THEN LEFT(@data,LEN(@data)-CHARINDEX(N'/',REVERSE(@data))) ELSE LEFT(@data,LEN(@data)-CHARINDEX(NCHAR(92),REVERSE(@data))) END;
IF @directory IS NULL OR LEN(@directory)=0 THROW 51900,'No backup directory could be found on this SQL Server. No migration was applied.',1;
DECLARE @separator nchar(1)=CASE WHEN CHARINDEX(N'/',@directory)>0 THEN N'/' ELSE NCHAR(92) END;
IF RIGHT(@directory,1)<>@separator SET @directory=@directory+@separator;
DECLARE @database sysname=DB_NAME();
DECLARE @path nvarchar(4000)=@directory+REPLACE(REPLACE(REPLACE(@database,N'/',N'_'),NCHAR(92),N'_'),N':',N'_')+@suffix;
BACKUP DATABASE @database TO DISK=@path WITH COPY_ONLY,CHECKSUM,INIT;
DECLARE @verified bit=0;
BEGIN TRY RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM; SET @verified=1; END TRY BEGIN CATCH SET @verified=0; END CATCH;
SELECT @path path,@verified verified;`;

/** Runs the batch with `@suffix` bound and gives back its last row. */
export type BackupQuery = (statement: string, suffix: string) => Promise<{ path?: unknown; verified?: unknown } | undefined>;
export type MigrationBackup = { path: string; verified: boolean };

export async function backupBeforeMigrations(query: BackupQuery, firstPending: number, log: (message: string) => void, now = new Date()): Promise<MigrationBackup> {
  log(`[migrate] Backing up the database before migration ${firstPending}...`);
  const row = await query(MIGRATION_BACKUP_SQL, migrationBackupSuffix(firstPending, now));
  const path = typeof row?.path === "string" ? row.path : "";
  if (!path) throw new Error("The backup before migration reported no file. No migration was applied.");
  const verified = row?.verified === true || row?.verified === 1 || row?.verified === "1";
  log(`[migrate] ✓ Backup written on the database host: ${path}${verified ? " (verified)" : " (written with CHECKSUM; the verify step was refused to this login)"}`);
  return { path, verified };
}
