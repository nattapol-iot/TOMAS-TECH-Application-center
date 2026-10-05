// The least-privilege role iot_team_app_role, compared with what the Node API actually runs.
//
//   node scripts/app-role-grants.mjs           list the gaps (exit 1 when there are any)
//   node scripts/app-role-grants.mjs --write   regenerate the migration grant block at the end of 010
//   node scripts/app-role-grants.mjs --usage   print the API's usage as JSON (scripts/Test-AppRoleGrantsLocalDb.ps1)
//
// Usage is read from the SQL text in backend-node/src: FROM/JOIN, INSERT, UPDATE, DELETE,
// MERGE and EXEC on dbo objects, plus the columns each UPDATE assigns. Grants are what
// database/scripts/010_application_login.sql leaves: its own matrix, then every migration's
// grant replayed in order by the generated block at its end. Migrations grant only to a role
// that already exists, and 010's REVOKEs narrow the role first, so 010 alone must re-apply them.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOGIN_SCRIPT = "database/scripts/010_application_login.sql";
const BLOCK_START = "-- BEGIN GENERATED MIGRATION GRANTS";
const BLOCK_END = "-- END GENERATED MIGRATION GRANTS";
const ROLE = /\[?iot_team_app_role\]?/i;

const walk = (dir, extension) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, extension) : path.endsWith(extension) ? [path] : [];
});
const text = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const name = (value) => value.replace(/[[\]]/g, "").toLowerCase();
const migrationFiles = (root) => walk(join(root, "database", "migrations"), ".sql")
  .filter((path) => /^\d{3}_/.test(path.split(/[\\/]/).pop()))
  .sort();

/** Tables, views, functions and procedures the migrations create. */
export function databaseObjects(root) {
  const objects = new Map();
  for (const file of migrationFiles(root)) {
    for (const match of text(file).matchAll(/\bCREATE\s+(?:OR\s+ALTER\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|PROC)\s+(?:\[?dbo\]?\.)\[?(\w+)\]?/gi)) {
      objects.set(name(match[2]), match[1].toUpperCase().replace(/^PROC$/, "PROCEDURE"));
    }
  }
  return objects;
}

/** What the API does to each dbo object, and which columns its UPDATE statements assign. */
export function apiUsage(root) {
  const operations = new Map(), updateColumns = new Map();
  const record = (object, operation) => {
    const key = name(object);
    if (!operations.has(key)) operations.set(key, new Set());
    operations.get(key).add(operation);
  };
  const assign = (object, setClause) => {
    const key = name(object);
    if (!updateColumns.has(key)) updateColumns.set(key, new Set());
    for (const match of setClause.matchAll(/(?:^|,)\s*(?:\w+\.)?\[?(\w+)\]?\s*=/g)) updateColumns.get(key).add(match[1].toLowerCase());
  };
  for (const file of walk(join(root, "backend-node", "src"), ".ts")) {
    const source = text(file);
    for (const m of source.matchAll(/\b(?:FROM|JOIN|APPLY)\s+dbo\.(\w+)/gi)) record(m[1], "SELECT");
    for (const m of source.matchAll(/\bINSERT\s+(?:INTO\s+)?dbo\.(\w+)/gi)) record(m[1], "INSERT");
    for (const m of source.matchAll(/\bDELETE\s+(?:TOP\s*\(\d+\)\s+)?(?:FROM\s+)?dbo\.(\w+)/gi)) record(m[1], "DELETE");
    for (const m of source.matchAll(/\bMERGE\s+(?:INTO\s+)?dbo\.(\w+)/gi)) ["SELECT", "INSERT", "UPDATE"].forEach((op) => record(m[1], op));
    for (const m of source.matchAll(/\bEXEC(?:UTE)?\s+dbo\.(\w+)/gi)) record(m[1], "EXECUTE");
    for (const m of source.matchAll(/\.execute(?:<[^>]*>)?\(\s*["'`]dbo\.(\w+)/g)) record(m[1], "EXECUTE");
    for (const m of source.matchAll(/\bUPDATE\s+(?:TOP\s*\(\d+\)\s+)?dbo\.(\w+)(?:\s+WITH\s*\([^)]*\))?\s+SET\s+([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bOUTPUT\b|;|`)/gi)) {
      record(m[1], "UPDATE");
      assign(m[1], m[2]);
    }
    // UPDATE alias SET ... FROM dbo.table alias
    for (const m of source.matchAll(/\bUPDATE\s+(\w+)\s+SET\s+([\s\S]*?)\bFROM\s+dbo\.(\w+)\s+(?:AS\s+)?(\w+)/gi)) {
      if (name(m[1]) !== name(m[4])) continue;
      record(m[3], "UPDATE");
      assign(m[3], m[2]);
    }
    for (const m of source.matchAll(/\bDELETE\s+(\w+)\s+FROM\s+dbo\.(\w+)\s+(?:AS\s+)?(\w+)/gi)) {
      if (name(m[1]) === name(m[3])) record(m[2], "DELETE");
    }
  }
  return { operations, updateColumns };
}

/** Every iot_team_app_role grant statement in a file, in order (EXEC(N'...') unwrapped). */
function grantStatements(file) {
  const statements = [];
  for (const line of text(file).split("\n")) {
    if (!ROLE.test(line)) continue;
    const wrapped = line.match(/EXEC\s*\(\s*N'((?:[^']|'')*)'\s*\)/i);
    const statement = (wrapped ? wrapped[1].replace(/''/g, "'") : line).trim();
    const grant = statement.match(/\b(?:GRANT|REVOKE|DENY)\b[^;]*?\b(?:TO|FROM)\s+\[?iot_team_app_role\]?\s*;?/i);
    if (grant) statements.push(grant[0].replace(/;?$/, ";"));
  }
  return statements;
}

function splitPermissions(list) {
  const parts = [];
  let depth = 0, current = "";
  for (const character of list) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) { parts.push(current); current = ""; } else current += character;
  }
  return [...parts, current].map((part) => part.trim()).filter(Boolean);
}

/** The role's object and column permissions after 010 (its own matrix, then the generated migration replay). */
export function roleGrants(root) {
  const grants = new Map();
  // 010 alone is what a host runs when it switches off sa; its generated block carries the migrations' grants.
  const files = [resolve(root, LOGIN_SCRIPT)];
  for (const file of files) {
    for (const statement of grantStatements(file)) {
      const parsed = statement.match(/^(GRANT|REVOKE|DENY)\s+(.+?)\s+ON\s+(?:OBJECT::)?(?:\[?dbo\]?\.)\[?(\w+)\]?\s+(?:TO|FROM)\s/i);
      if (!parsed) continue; // schema- or database-level statements
      const [, verb, list, object] = parsed;
      const key = name(object);
      if (!grants.has(key)) grants.set(key, { operations: new Set(), columns: new Map() });
      const entry = grants.get(key);
      for (const permission of splitPermissions(list)) {
        const columnGrant = permission.match(/^(\w+)\s*\(([^)]*)\)$/);
        const operation = (columnGrant ? columnGrant[1] : permission).toUpperCase();
        const columns = columnGrant ? columnGrant[2].split(",").map((column) => name(column.trim())) : [];
        if (verb.toUpperCase() === "GRANT") {
          if (!columnGrant) entry.operations.add(operation);
          else {
            if (!entry.columns.has(operation)) entry.columns.set(operation, new Set());
            columns.forEach((column) => entry.columns.get(operation).add(column));
          }
        } else if (!columnGrant) {
          entry.operations.delete(operation);
          entry.columns.delete(operation);
        } else {
          columns.forEach((column) => entry.columns.get(operation)?.delete(column));
        }
      }
    }
  }
  return grants;
}

/** Operations (and update columns) the API needs that the role does not have. */
export function grantGaps(root) {
  const objects = databaseObjects(root);
  const { operations, updateColumns } = apiUsage(root);
  const grants = roleGrants(root);
  const gaps = [];
  for (const [object, needed] of [...operations].sort(([a], [b]) => a.localeCompare(b))) {
    if (!objects.has(object)) continue; // temp tables, CTEs, table variables
    const granted = grants.get(object) ?? { operations: new Set(), columns: new Map() };
    for (const operation of needed) {
      if (granted.operations.has(operation)) continue;
      if (operation === "UPDATE" && granted.columns.has("UPDATE")) {
        const allowed = granted.columns.get("UPDATE");
        const missing = [...(updateColumns.get(object) ?? [])].filter((column) => !allowed.has(column));
        if (missing.length) gaps.push(`${object}: UPDATE (${missing.join(", ")})`);
        continue;
      }
      gaps.push(`${object}: ${operation}`);
    }
  }
  return gaps;
}

export function replayScript(root) {
  const lines = [
    BLOCK_START,
    "-- Generated by `node scripts/app-role-grants.mjs --write` from database/migrations; do not edit.",
    "-- Every migration's iot_team_app_role grant, in migration order. Migrations grant only to a role",
    "-- that already exists, and the REVOKEs above narrow the role, so a role created or normalized",
    "-- here after the migrations ran gets them again.",
  ];
  for (const file of migrationFiles(root)) {
    const statements = grantStatements(file);
    if (!statements.length) continue;
    lines.push("", `-- ${relative(root, file).replace(/\\/g, "/")}`, ...statements, "GO");
  }
  lines.push(BLOCK_END);
  return lines.join("\n");
}

/** 010 with its generated block replaced by the current one (appended when absent). */
export function loginScriptWithReplay(root) {
  const current = text(resolve(root, LOGIN_SCRIPT));
  const start = current.indexOf(BLOCK_START), end = current.indexOf(BLOCK_END);
  const before = start === -1 ? `${current.trimEnd()}\n\n` : current.slice(0, start);
  const after = end === -1 ? "\n" : current.slice(end + BLOCK_END.length);
  return `${before}${replayScript(root)}${after}`;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (process.argv.includes("--write")) {
    const path = join(root, LOGIN_SCRIPT);
    const crlf = readFileSync(path, "utf8").includes("\r\n");
    const updated = loginScriptWithReplay(root);
    writeFileSync(path, crlf ? updated.replace(/\n/g, "\r\n") : updated);
    console.log(`updated the generated block in ${LOGIN_SCRIPT}`);
  } else if (process.argv.includes("--usage")) {
    const objects = databaseObjects(root);
    const { operations, updateColumns } = apiUsage(root);
    const usage = [...operations].filter(([object]) => objects.has(object))
      .map(([object, ops]) => ({ object, kind: objects.get(object), operations: [...ops].sort(), updateColumns: [...(updateColumns.get(object) ?? [])].sort() }));
    console.log(JSON.stringify(usage));
  } else {
    const gaps = grantGaps(root);
    console.log(gaps.length ? gaps.join("\n") : "iot_team_app_role covers every statement the API runs.");
    process.exitCode = gaps.length ? 1 : 0;
  }
}
