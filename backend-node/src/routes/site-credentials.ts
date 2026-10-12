import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import { openSecret, sealSecret, type VaultKeys } from "../credential-vault.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, optionalPositiveLong, optionalText, parseRowVersion, positiveLong } from "../http.js";
import { isProjectElevated } from "../project-scope.js";
import { permissionFor } from "../schedule-service.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

/**
 * Site credentials vault (credential.read / credential.reveal / credential.manage).
 *
 *   GET    /api/v1/credentials                   list: labels, users and hosts, never secrets
 *   POST   /api/v1/credentials                   add (encrypts the secret)
 *   PUT    /api/v1/credentials/:id               edit (rowVersion); a new secret only when one is sent
 *   POST   /api/v1/credentials/:id/reveal        the secret, once, logged with who, when and from where
 *   DELETE /api/v1/credentials/:id               remove (soft; the access log stays)
 *   GET    /api/v1/credentials/:id/access        the access log (credential.manage)
 *
 * A credential tied to a project can be revealed only by that project's people or elevated roles.
 */
const READ = "credential.read";
const REVEAL = "credential.reveal";
const MANAGE = "credential.manage";
export const CREDENTIAL_KINDS = ["Login", "WiFi", "VPN", "Database", "API", "License", "Other"] as const;
const REVEAL_RATE_LIMIT = { max: 30, timeWindow: "1 minute" } as const;

export type CredentialInput = {
  customerId: number; customerSiteId: number | null; assetId: number | null; projectId: number | null;
  kind: (typeof CREDENTIAL_KINDS)[number]; label: string; username: string; host: string; notes: string;
  /** Only present when the secret is set or changed. */
  secret: string | null;
};

function text(raw: Record<string, unknown>, key: string, maximum: number, label: string, required = false): string {
  const value = raw[key];
  if (value !== undefined && value !== null && typeof value !== "string") throw new ApiError(400, "validation_failed", `${label} must be text.`);
  const trimmed = (value ?? "").toString().trim();
  if (required && !trimmed) throw new ApiError(400, "validation_failed", `${label} is required.`);
  if (trimmed.length > maximum) throw new ApiError(400, "validation_failed", `${label} cannot exceed ${maximum} characters.`);
  return trimmed;
}

function idOrNull(raw: Record<string, unknown>, key: string, label: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number <= 0) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return number;
}

export function parseCredentialInput(raw: Record<string, unknown>, requireSecret: boolean): CredentialInput {
  const customerId = idOrNull(raw, "customerId", "Customer");
  if (!customerId) throw new ApiError(400, "validation_failed", "Customer is required.");
  const kind = text(raw, "kind", 20, "Kind", true);
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(kind)) throw new ApiError(400, "validation_failed", `Kind must be one of: ${CREDENTIAL_KINDS.join(", ")}.`);
  // The secret is taken exactly as typed: leading or trailing spaces can be part of a password.
  const rawSecret = raw.secret;
  if (rawSecret !== undefined && rawSecret !== null && typeof rawSecret !== "string") throw new ApiError(400, "validation_failed", "The secret must be text.");
  const secret = typeof rawSecret === "string" && rawSecret.length > 0 ? rawSecret : null;
  if (requireSecret && !secret) throw new ApiError(400, "validation_failed", "The secret is required.");
  return {
    customerId,
    customerSiteId: idOrNull(raw, "customerSiteId", "Customer site"),
    assetId: idOrNull(raw, "assetId", "Asset"),
    projectId: idOrNull(raw, "projectId", "Project"),
    kind: kind as CredentialInput["kind"],
    label: text(raw, "label", 200, "Label", true),
    username: text(raw, "username", 300, "Username"),
    host: text(raw, "host", 300, "Host / address"),
    notes: text(raw, "notes", 2000, "Notes"),
    secret,
  };
}

type CredentialRow = {
  id: number | string; customer_id: number | string; customer_name: string; customer_site_id: number | string | null; customer_site_name: string | null;
  asset_id: number | string | null; asset_no: string | null; asset_name: string | null; project_id: number | string | null;
  project_no: string | null; kind: string; label: string; username: string; host: string; notes: string;
  updated_at: Date; updated_by_name: string; secret_changed_at: Date; last_revealed_at: Date | null; last_revealed_by: string | null;
  can_reveal_scope: number; row_version: Buffer;
};

export const CREDENTIAL_SELECT = `
  SELECT c.id, c.customer_id, cu.name AS customer_name, c.customer_site_id, cs.name AS customer_site_name,
         c.asset_id, a.asset_no, a.name AS asset_name, c.project_id, p.project_no, c.kind, c.label, c.username, c.host, c.notes,
         c.updated_at, uu.name AS updated_by_name, c.secret_changed_at, last.occurred_at AS last_revealed_at, last.user_name AS last_revealed_by,
         CASE WHEN c.project_id IS NULL OR @elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = c.project_id AND m.user_id = @actor)
              THEN 1 ELSE 0 END AS can_reveal_scope,
         c.row_version
  FROM dbo.site_credentials c
  INNER JOIN dbo.customers cu ON cu.id = c.customer_id
  INNER JOIN dbo.users uu ON uu.id = c.updated_by
  LEFT JOIN dbo.customer_sites cs ON cs.id = c.customer_site_id
  LEFT JOIN dbo.installed_assets a ON a.id = c.asset_id
  LEFT JOIN dbo.projects p ON p.id = c.project_id
  OUTER APPLY (
    SELECT TOP (1) x.occurred_at, u.name AS user_name FROM dbo.site_credential_access x INNER JOIN dbo.users u ON u.id = x.user_id
    WHERE x.credential_id = c.id AND x.action = N'Revealed' ORDER BY x.occurred_at DESC, x.id DESC
  ) last`;

/**
 * For an asset: its own credentials, plus (includeSiteWide) the ones for its customer site or the
 * whole customer that belong to no particular asset. Otherwise: by customer and customer site.
 */
export const CREDENTIAL_LIST_SQL = `
  ${CREDENTIAL_SELECT}
  WHERE c.deleted_at IS NULL
    AND (@customer IS NULL OR c.customer_id = @customer)
    AND (
      (@asset IS NOT NULL AND (c.asset_id = @asset
        OR (@include_site_wide = 1 AND c.asset_id IS NULL AND (c.customer_site_id IS NULL OR c.customer_site_id = @customer_site))))
      OR (@asset IS NULL AND (@customer_site IS NULL OR c.customer_site_id = @customer_site)))
    AND (@search IS NULL OR c.label LIKE N'%' + @search + N'%' OR c.username LIKE N'%' + @search + N'%' OR c.host LIKE N'%' + @search + N'%')
  ORDER BY cu.name, c.label
  OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY;`;

export const CREDENTIAL_REFERENCES_SQL = `
  SELECT
    (SELECT COUNT(*) FROM dbo.customers WHERE id = @customer AND deleted_at IS NULL) AS customer_ok,
    CASE WHEN @customer_site IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.customer_sites WHERE id = @customer_site AND customer_id = @customer AND deleted_at IS NULL) END AS site_ok,
    CASE WHEN @asset IS NULL THEN 1 ELSE
      (SELECT COUNT(*) FROM dbo.installed_assets WHERE id = @asset AND customer_id = @customer AND deleted_at IS NULL) END AS asset_ok,
    CASE WHEN @project IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM dbo.projects WHERE id = @project AND deleted_at IS NULL) END AS project_ok;`;

export const CREDENTIAL_INSERT_SQL = `
  INSERT dbo.site_credentials (customer_id, customer_site_id, asset_id, project_id, kind, label, username, host,
    secret_cipher, secret_iv, secret_tag, key_id, notes, created_by, updated_by)
  OUTPUT inserted.id
  VALUES (@customer, @customer_site, @asset, @project, @kind, @label, @username, @host,
    0x00, 0x000000000000000000000000, 0x00000000000000000000000000000000, 0, @notes, @actor, @actor);`;

export const CREDENTIAL_SET_SECRET_SQL = `
  UPDATE dbo.site_credentials
  SET secret_cipher = @cipher, secret_iv = @iv, secret_tag = @tag, key_id = @key_id, secret_changed_at = SYSUTCDATETIME()
  WHERE id = @id;`;

export const CREDENTIAL_UPDATE_SQL = `
  UPDATE dbo.site_credentials
  SET customer_id = @customer, customer_site_id = @customer_site, asset_id = @asset, project_id = @project, kind = @kind,
      label = @label, username = @username, host = @host, notes = @notes, updated_by = @actor, updated_at = SYSUTCDATETIME()
  WHERE id = @id;`;

export const CREDENTIAL_LOG_SQL = `INSERT dbo.site_credential_access (credential_id, user_id, action, client_ip) VALUES (@id, @actor, @action, @ip);`;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

function credentialDto(row: CredentialRow, canReveal: boolean) {
  return {
    id: Number(row.id),
    customer: { id: Number(row.customer_id), name: row.customer_name },
    customerSite: row.customer_site_id === null ? null : { id: Number(row.customer_site_id), name: row.customer_site_name ?? "" },
    asset: row.asset_id === null ? null : { id: Number(row.asset_id), assetNo: row.asset_no ?? "", name: row.asset_name ?? "" },
    project: row.project_id === null ? null : { id: Number(row.project_id), projectNo: row.project_no ?? "" },
    kind: row.kind, label: row.label, username: row.username, host: row.host, notes: row.notes,
    updatedAt: iso(row.updated_at), updatedBy: row.updated_by_name, secretChangedAt: iso(row.secret_changed_at),
    lastRevealedAt: iso(row.last_revealed_at), lastRevealedBy: row.last_revealed_by,
    canReveal: canReveal && row.can_reveal_scope === 1,
    rowVersion: row.row_version.toString("base64"),
  };
}

function bindInput(request: sql.Request, input: CredentialInput): sql.Request {
  return request
    .input("customer", sql.BigInt, input.customerId)
    .input("customer_site", sql.BigInt, input.customerSiteId)
    .input("asset", sql.BigInt, input.assetId)
    .input("project", sql.BigInt, input.projectId)
    .input("kind", sql.NVarChar(20), input.kind)
    .input("label", sql.NVarChar(200), input.label)
    .input("username", sql.NVarChar(300), input.username)
    .input("host", sql.NVarChar(300), input.host)
    .input("notes", sql.NVarChar(2000), input.notes);
}

async function checkReferences(transaction: TransactionType, input: CredentialInput): Promise<void> {
  const row = (await bindInput(new sql.Request(transaction), input).query<Record<string, number>>(CREDENTIAL_REFERENCES_SQL)).recordset[0]!;
  if (!row.customer_ok) throw new ApiError(422, "credential_customer_unavailable", "The customer does not exist.");
  if (!row.site_ok) throw new ApiError(422, "credential_site_unavailable", "The customer site does not belong to this customer.");
  if (!row.asset_ok) throw new ApiError(422, "credential_asset_unavailable", "The asset is not this customer's.");
  if (!row.project_ok) throw new ApiError(422, "credential_project_unavailable", "The project does not exist.");
}

async function storeSecret(transaction: TransactionType, vault: VaultKeys, id: number, secret: string): Promise<void> {
  const sealed = sealSecret(vault, id, secret);
  await new sql.Request(transaction)
    .input("id", sql.BigInt, id)
    .input("cipher", sql.VarBinary(sql.MAX), sealed.cipher)
    .input("iv", sql.VarBinary(12), sealed.iv)
    .input("tag", sql.VarBinary(16), sealed.tag)
    .input("key_id", sql.TinyInt, sealed.keyId)
    .query(CREDENTIAL_SET_SECRET_SQL);
}

async function log(transaction: TransactionType, id: number, actor: CurrentUser, action: string, ip: string | null): Promise<void> {
  await new sql.Request(transaction)
    .input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("action", sql.NVarChar(20), action)
    .input("ip", sql.NVarChar(64), ip ? ip.slice(0, 64) : null)
    .query(CREDENTIAL_LOG_SQL);
}

export function registerSiteCredentialRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  const vault = () => {
    if (!config.credentialVault) throw new ApiError(503, "credential_vault_not_configured", "The credentials vault has no key configured on this server.");
    return config.credentialVault;
  };
  const credentialId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).id, "Credential");
  const scopeInputs = (request: sql.Request, actor: CurrentUser) => request
    .input("actor", sql.BigInt, actor.id).input("elevated", sql.Bit, isProjectElevated(actor));

  const readOne = async (id: number, actor: CurrentUser, transaction?: TransactionType): Promise<CredentialRow> => {
    const query = `${CREDENTIAL_SELECT} WHERE c.id = @id AND c.deleted_at IS NULL;`;
    const result = transaction
      ? await scopeInputs(new sql.Request(transaction), actor).input("id", sql.BigInt, id).query<CredentialRow>(query)
      : await database.query<CredentialRow>(query, (request) => scopeInputs(request, actor).input("id", sql.BigInt, id));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "credential_not_found", "The credential was not found.");
    return row;
  };

  app.get("/api/v1/credentials", async (request) => {
    await users.demandPermission(request, READ);
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const search = optionalText(query.search, 200, "Search");
    const result = await database.query<CredentialRow>(CREDENTIAL_LIST_SQL, (sqlRequest) => scopeInputs(sqlRequest, actor)
      .input("customer", sql.BigInt, optionalPositiveLong(query.customerId, "Customer"))
      .input("customer_site", sql.BigInt, optionalPositiveLong(query.customerSiteId, "Customer site"))
      .input("asset", sql.BigInt, optionalPositiveLong(query.assetId, "Asset"))
      .input("include_site_wide", sql.Bit, query.includeSiteWide === "true")
      .input("search", sql.NVarChar(200), search));
    const [canReveal, canManage] = await Promise.all([permissionFor(database, actor.id, REVEAL), permissionFor(database, actor.id, MANAGE)]);
    return {
      items: result.recordset.map((row) => credentialDto(row, canReveal)),
      canManage, canReveal, vaultReady: Boolean(config.credentialVault), kinds: CREDENTIAL_KINDS,
    };
  });

  app.post("/api/v1/credentials", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const keys = vault();
    const input = parseCredentialInput(bodyObject(request.body), true);
    const id = await database.transaction(async (transaction) => {
      await checkReferences(transaction, input);
      const inserted = await bindInput(new sql.Request(transaction), input).input("actor", sql.BigInt, actor.id)
        .query<{ id: number | string }>(CREDENTIAL_INSERT_SQL);
      const newId = Number(inserted.recordset[0]!.id);
      // Sealed after the insert: the row id is bound into the ciphertext.
      await storeSecret(transaction, keys, newId, input.secret!);
      await log(transaction, newId, actor, "Created", request.ip || null);
      await insertAudit(transaction, actor.id, "SiteCredential", newId, input.label.slice(0, 50), "Created", null,
        { ...input, secret: "[encrypted]" });
      return newId;
    });
    return reply.code(201).send(credentialDto(await readOne(id, actor), await permissionFor(database, actor.id, REVEAL)));
  });

  app.put("/api/v1/credentials/:id", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = credentialId(request);
    const raw = bodyObject(request.body);
    const rowVersion = parseRowVersion(raw.rowVersion);
    const input = parseCredentialInput(raw, false);
    const keys = input.secret ? vault() : null;
    await database.transaction(async (transaction) => {
      const current = await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query<{ label: string; row_version: Buffer }>(`SELECT label, row_version FROM dbo.site_credentials WITH (UPDLOCK) WHERE id = @id AND deleted_at IS NULL;`);
      const before = current.recordset[0];
      if (!before) throw new ApiError(404, "credential_not_found", "The credential was not found.");
      if (!before.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "The credential was changed by someone else. Reload it and try again.");
      await checkReferences(transaction, input);
      await bindInput(new sql.Request(transaction), input).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).query(CREDENTIAL_UPDATE_SQL);
      if (keys && input.secret) await storeSecret(transaction, keys, id, input.secret);
      await log(transaction, id, actor, input.secret ? "SecretChanged" : "Updated", request.ip || null);
      await insertAudit(transaction, actor.id, "SiteCredential", id, input.label.slice(0, 50), input.secret ? "Secret changed" : "Updated",
        { label: before.label }, { ...input, secret: input.secret ? "[encrypted]" : undefined });
    });
    return credentialDto(await readOne(id, actor), await permissionFor(database, actor.id, REVEAL));
  });

  app.post("/api/v1/credentials/:id/reveal", { config: { rateLimit: REVEAL_RATE_LIMIT } }, async (request, reply) => {
    await users.demandPermission(request, REVEAL);
    const actor = await users.required(request);
    const keys = vault();
    const id = credentialId(request);
    const secret = await database.transaction(async (transaction) => {
      const row = await readOne(id, actor, transaction);
      if (row.can_reveal_scope !== 1) throw new ApiError(403, "credential_project_scope", "This credential belongs to a project you are not part of.");
      const sealed = await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query<{ secret_cipher: Buffer; secret_iv: Buffer; secret_tag: Buffer; key_id: number }>(
          `SELECT secret_cipher, secret_iv, secret_tag, key_id FROM dbo.site_credentials WHERE id = @id;`);
      const stored = sealed.recordset[0]!;
      const value = openSecret(keys, id, { cipher: stored.secret_cipher, iv: stored.secret_iv, tag: stored.secret_tag, keyId: Number(stored.key_id) });
      // Logged in the same transaction: a reveal that is not recorded does not happen.
      await log(transaction, id, actor, "Revealed", request.ip || null);
      return value;
    });
    request.log.info({ actorId: actor.id, credentialId: id }, "Site credential revealed");
    reply.header("Cache-Control", "no-store");
    return { secret };
  });

  app.delete("/api/v1/credentials/:id", async (request, reply) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = credentialId(request);
    await database.transaction(async (transaction) => {
      const current = await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query<{ label: string }>(`SELECT label FROM dbo.site_credentials WITH (UPDLOCK) WHERE id = @id AND deleted_at IS NULL;`);
      const row = current.recordset[0];
      if (!row) throw new ApiError(404, "credential_not_found", "The credential was not found.");
      // The secret is destroyed, not just hidden: a removed credential can never be revealed again.
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).query(`
        UPDATE dbo.site_credentials SET deleted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME(),
          secret_cipher = 0x00, secret_iv = 0x000000000000000000000000, secret_tag = 0x00000000000000000000000000000000, key_id = 0
        WHERE id = @id;`);
      await log(transaction, id, actor, "Deleted", request.ip || null);
      await insertAudit(transaction, actor.id, "SiteCredential", id, row.label.slice(0, 50), "Deleted", { label: row.label }, null);
    });
    return reply.code(204).send();
  });

  app.get("/api/v1/credentials/:id/access", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = credentialId(request);
    await readOne(id, actor);
    const result = await database.query<{ action: string; occurred_at: Date; user_name: string; client_ip: string | null }>(`
      SELECT TOP (100) x.action, x.occurred_at, u.name AS user_name, x.client_ip
      FROM dbo.site_credential_access x INNER JOIN dbo.users u ON u.id = x.user_id
      WHERE x.credential_id = @id ORDER BY x.occurred_at DESC, x.id DESC;
    `, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    return {
      items: result.recordset.map((row) => ({ action: row.action, at: row.occurred_at.toISOString(), user: row.user_name, ip: row.client_ip })),
    };
  });
}

