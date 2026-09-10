import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export type SqlIntegrationEnvironment = Readonly<Record<string, string | undefined>>;

export type SqlIntegrationConfig = Readonly<{
  backendRoot: string;
  repoRoot: string;
  databaseName: string;
  storageRoot: string;
  freshDatabaseScript: string;
  applicationLoginScript: string;
  connectionString: string;
  sqlcmdArgs: readonly string[];
  sqlcmdOptions: Readonly<{
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "pipe";
  }>;
}>;

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(testsDirectory, "..");
const repoRoot = resolve(backendRoot, "..");

function isLoopbackSqlServer(server: string): boolean {
  const match = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?:\\[A-Za-z0-9_$-]+|,(\d{1,5}))?$/i.exec(server);
  if (!match) return false;
  if (match[1]!.startsWith("127.")) {
    const octets = match[1]!.split(".").map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  }
  const port = match[2] === undefined ? undefined : Number(match[2]);
  return port === undefined || (port >= 1 && port <= 65_535);
}

function requiredValue(environment: SqlIntegrationEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required for SQL integration tests.`);
  if (/[\0\r\n]/.test(value)) throw new Error(`${name} contains unsupported control characters.`);
  return value;
}

function quoteConnectionStringValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function createSqlIntegrationConfig(
  scope: string,
  environment: SqlIntegrationEnvironment = process.env,
  uniqueId: string = randomUUID().replaceAll("-", ""),
): SqlIntegrationConfig {
  if (environment.IOT_RUN_SQL_INTEGRATION !== "1") {
    throw new Error("Set IOT_RUN_SQL_INTEGRATION=1 to run SQL integration tests.");
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(scope)) throw new Error("SQL integration scope is invalid.");
  if (!/^[a-f0-9]{32}$/i.test(uniqueId)) throw new Error("SQL integration unique id must contain 32 hexadecimal characters.");

  const server = requiredValue(environment, "IOT_SQL_TEST_SERVER");
  if (!isLoopbackSqlServer(server)) {
    throw new Error("IOT_SQL_TEST_SERVER must identify a loopback SQL Server instance.");
  }
  const user = requiredValue(environment, "IOT_SQL_TEST_USER");
  const password = requiredValue(environment, "IOT_SQL_TEST_PASSWORD");
  const databaseName = `IoTTeamCenter_${scope}CI_${uniqueId.toLowerCase()}`;

  return {
    backendRoot,
    repoRoot,
    databaseName,
    storageRoot: resolve(backendRoot, "tmp", databaseName),
    freshDatabaseScript: resolve(repoRoot, "database/scripts/020_deploy_fresh_database.sql"),
    applicationLoginScript: resolve(repoRoot, "database/scripts/010_application_login.sql"),
    connectionString: [
      `Server=${quoteConnectionStringValue(server)}`,
      `Database=${databaseName}`,
      `User ID=${quoteConnectionStringValue(user)}`,
      `Password=${quoteConnectionStringValue(password)}`,
      "Encrypt=true",
      "TrustServerCertificate=true",
    ].join(";"),
    sqlcmdArgs: ["-S", server, "-U", user, "-C", "-I", "-b"],
    sqlcmdOptions: {
      // 020_deploy_fresh_database.sql contains repo-relative :r directives.
      // sqlcmd resolves those from its process cwd, not from the absolute -i file.
      cwd: repoRoot,
      env: { ...process.env, SQLCMDPASSWORD: password },
      stdio: "pipe",
    },
  };
}
