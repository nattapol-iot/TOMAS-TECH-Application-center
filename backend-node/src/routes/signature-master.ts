import { createReadStream } from "node:fs";
import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  deleteStoredFile,
  DOCUMENT_DOWNLOAD_RATE_LIMIT,
  DOCUMENT_UPLOAD_RATE_LIMIT,
  resolveStoragePath,
  storageKey,
  writeStoredBuffer,
} from "../document-storage.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, optionalBodyText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { insertAudit } from "../audit.js";
import { demandDocumentClass, requireReason } from "../signing-core.js";
import type { CurrentUserService } from "../users.js";

/**
 * Signature specimens, company stamps and flow templates.
 *
 * The specimen and stamp images are the sensitive part of this feature: a
 * downloadable seal is a forgery kit, and a colleague's signature image is the
 * same problem with a different name. There is therefore no route that returns
 * another person's specimen or a stamp's source artwork — the only image route
 * here serves the caller their own specimen, and the render pipeline reads the
 * rest server-side.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function decodePng(value: unknown, code: string): Buffer {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, code, "A PNG image is required.");
  // Accept a data: URL prefix so a canvas toDataURL() result can be posted
  // without the client having to strip it.
  let payload = value.trim();
  const comma = payload.indexOf(",");
  if (payload.toLowerCase().startsWith("data:") && comma > 0) payload = payload.slice(comma + 1);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    throw new ApiError(400, code, "The image is not valid base64.");
  }
  if (bytes.length === 0) throw new ApiError(400, code, "The image is empty.");
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, code, `The image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`);
  }
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new ApiError(400, code,
      "Only PNG images are accepted, so a signature can be rendered with a transparent background.");
  }
  return bytes;
}

export function registerSignatureMasterRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  // -------------------------------------------------------------------------
  // My signature — a preference, not a security ceremony
  // -------------------------------------------------------------------------
  app.get("/api/v1/me/signature", async (request) => {
    const actor = await users.required(request);
    const history = (await database.query<Record<string, unknown>>(`
      SELECT s.id, s.version, s.source,
             CASE WHEN s.initials_image_key IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS has_initials,
             s.initials_text, s.active_from, s.active_to,
             (SELECT COUNT(*) FROM dbo.signature_marks m WHERE m.specimen_id = s.id) AS used_in_documents
      FROM dbo.signature_specimens s WHERE s.user_id = @actor ORDER BY s.version DESC;
    `, (bind) => bind.input("actor", sql.BigInt, actor.id))).recordset.map((row) => ({
      id: Number(row.id),
      version: Number(row.version),
      source: String(row.source),
      hasInitials: Boolean(row.has_initials),
      initialsText: row.initials_text === null ? null : String(row.initials_text),
      activeFrom: row.active_from,
      activeTo: row.active_to ?? null,
      usedInDocuments: Number(row.used_in_documents),
    }));
    return { active: history.find((item) => item.activeTo === null) ?? null, history };
  });

  /**
   * Replacing a specimen never changes a document already signed: the old version
   * is retired, not overwritten, and every past mark keeps pointing at the
   * version that was actually used.
   */
  app.put(
    "/api/v1/me/signature",
    { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } },
    async (request) => {
      const actor = await users.required(request);
      const body = bodyObject(request.body);
      const source = String(body.source ?? "");
      if (source !== "DRAWN" && source !== "UPLOADED" && source !== "TYPED") {
        throw new ApiError(400, "invalid_source", "The specimen source must be DRAWN, UPLOADED or TYPED.");
      }
      const image = decodePng(body.imageBase64, "image_required");
      const initials = body.initialsBase64 === undefined || body.initialsBase64 === null
        ? null
        : decodePng(body.initialsBase64, "invalid_initials_image");
      const initialsText = optionalBodyText(body.initialsText, 10, "Initials");

      const imageKey = storageKey("signing/specimens", ".png");
      const initialsKey = initials ? storageKey("signing/specimens", ".png") : null;
      const written: string[] = [];
      try {
        await writeStoredBuffer(config.documentStorage, imageKey, image);
        written.push(imageKey);
        if (initials && initialsKey) {
          await writeStoredBuffer(config.documentStorage, initialsKey, initials);
          written.push(initialsKey);
        }

        return await database.transaction(async (transaction) => {
          const current = new sql.Request(transaction);
          current.input("actor", sql.BigInt, actor.id);
          const nextVersion = Number((await current.query<{ version: number }>(`
            SELECT ISNULL(MAX(version), 0) AS version FROM dbo.signature_specimens WITH (UPDLOCK, HOLDLOCK)
            WHERE user_id = @actor;
          `)).recordset[0]!.version) + 1;

          const retire = new sql.Request(transaction);
          retire.input("actor", sql.BigInt, actor.id);
          await retire.query(`
            UPDATE dbo.signature_specimens SET active_to = SYSUTCDATETIME()
            WHERE user_id = @actor AND active_to IS NULL;
          `);

          const insert = new sql.Request(transaction);
          insert.input("actor", sql.BigInt, actor.id);
          insert.input("version", sql.Int, nextVersion);
          insert.input("source", sql.NVarChar(20), source);
          insert.input("image_key", sql.NVarChar(1000), imageKey);
          insert.input("initials_key", sql.NVarChar(1000), initialsKey);
          insert.input("initials_text", sql.NVarChar(10), initialsText);
          const specimenId = Number((await insert.query<{ id: number }>(`
            DECLARE @created TABLE (id bigint NOT NULL);
            INSERT INTO dbo.signature_specimens (user_id, version, source, image_key, initials_image_key, initials_text)
            OUTPUT inserted.id INTO @created(id)
            VALUES (@actor, @version, @source, @image_key, @initials_key, @initials_text);
            SELECT id FROM @created;
          `)).recordset[0]!.id);

          await insertAudit(transaction, actor.id, "SignatureSpecimen", specimenId, `v${nextVersion}`, "Replaced", null,
            { source, version: nextVersion, hasInitials: initialsKey !== null });
          written.length = 0;
          return { id: specimenId, version: nextVersion, source };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      } catch (error) {
        for (const key of written) {
          if (error instanceof DatabaseCommitOutcomeUnknownError) {
            request.log.fatal({ err: error.originalError, storageKey: key },
              "Specimen commit outcome unknown; preserving storage file");
          } else {
            await deleteStoredFile(config.documentStorage, key).catch(() => undefined);
          }
        }
        throw error;
      }
    });

  /** The caller's own specimen, and nobody else's. There is deliberately no route that takes a user id. */
  app.get(
    "/api/v1/me/signature/preview",
    { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
      const actor = await users.required(request);
      const wantInitials = booleanQuery((request.query as Record<string, unknown>).initials);
      const row = (await database.query<Record<string, unknown>>(`
        SELECT TOP (1) image_key, initials_image_key FROM dbo.signature_specimens
        WHERE user_id = @actor AND active_to IS NULL;
      `, (bind) => bind.input("actor", sql.BigInt, actor.id))).recordset[0];
      if (!row) throw new ApiError(404, "specimen_not_found", "You have not created a signature yet.");
      const key = wantInitials
        ? (row.initials_image_key === null ? null : String(row.initials_image_key))
        : String(row.image_key);
      if (!key) throw new ApiError(404, "specimen_not_found", "No initials have been drawn.");
      reply.header("Content-Type", "image/png");
      reply.header("Cache-Control", "no-store");
      return reply.send(createReadStream(resolveStoragePath(config.documentStorage, key)));
    });

  // -------------------------------------------------------------------------
  // Company stamps
  // -------------------------------------------------------------------------
  app.get("/api/v1/master/company-stamps", async (request) => {
    await users.demandPermission(request, "signing.read");
    const authorities = new Map<number, Record<string, unknown>[]>();
    for (const row of (await database.query<Record<string, unknown>>(`
      SELECT a.company_stamp_id, a.id,
             CASE WHEN a.role_id IS NULL THEN N'USER' ELSE N'ROLE' END AS holder_kind,
             COALESCE(a.role_id, a.user_id) AS holder_id,
             COALESCE(r.name, u.name) AS holder_name,
             a.doc_class, granter.name AS granted_by_name, a.valid_from, a.valid_to, a.revoked_at,
             (SELECT COUNT(*) FROM dbo.signature_marks m WHERE m.stamp_authority_id = a.id) AS used_count
      FROM dbo.stamp_authorities a
      INNER JOIN dbo.users granter ON granter.id = a.granted_by
      LEFT JOIN dbo.roles r ON r.id = a.role_id
      LEFT JOIN dbo.users u ON u.id = a.user_id
      ORDER BY a.company_stamp_id, CASE WHEN a.role_id IS NULL THEN 1 ELSE 0 END, a.id;
    `)).recordset) {
      const stampId = Number(row.company_stamp_id);
      const list = authorities.get(stampId) ?? [];
      list.push({
        id: Number(row.id),
        holderKind: String(row.holder_kind),
        holderId: Number(row.holder_id),
        holderName: String(row.holder_name),
        documentClass: row.doc_class === null ? null : String(row.doc_class),
        grantedByName: String(row.granted_by_name),
        validFrom: row.valid_from,
        validTo: row.valid_to ?? null,
        revokedAt: row.revoked_at ?? null,
        usedCount: Number(row.used_count),
      });
      authorities.set(stampId, list);
    }

    return (await database.query<Record<string, unknown>>(`
      SELECT s.id, s.code, s.name_th, s.name_en, s.name_ja, s.legal_entity,
             CASE WHEN s.image_key IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS has_image,
             s.scope_json, r.name AS custodian_role, s.valid_from, s.valid_to, s.status,
             (SELECT COUNT(*) FROM dbo.signature_marks m WHERE m.company_stamp_id = s.id) AS applied_count,
             s.row_version
      FROM dbo.company_stamps s
      INNER JOIN dbo.roles r ON r.id = s.custodian_role_id
      ORDER BY CASE WHEN s.status = N'ACTIVE' THEN 0 ELSE 1 END, s.code;
    `)).recordset.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      nameTh: String(row.name_th),
      nameEn: String(row.name_en),
      nameJa: String(row.name_ja),
      legalEntity: String(row.legal_entity),
      hasImage: Boolean(row.has_image),
      scope: JSON.parse(String(row.scope_json)) as string[],
      custodianRole: String(row.custodian_role),
      validFrom: row.valid_from,
      validTo: row.valid_to ?? null,
      status: String(row.status),
      appliedCount: Number(row.applied_count),
      authorities: authorities.get(Number(row.id)) ?? [],
      rowVersion: (row.row_version as Buffer).toString("base64"),
    }));
  });

  app.post("/api/v1/master/company-stamps", async (request, reply) => {
    // Admin configures the drawer the seal lives in. It cannot put itself in the
    // list of people allowed to use it: that is signing.stamp.grant, which Admin
    // does not hold, and a trigger enforces the same rule in data.
    await users.demandPermission(request, "signing.master");
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const code = requiredText(body.code, 20, "Stamp code").toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(code)) {
      throw new ApiError(400, "invalid_code", "A stamp code is letters, digits and hyphens.");
    }
    const nameTh = requiredText(body.nameTh, 200, "Thai name");
    const nameEn = requiredText(body.nameEn, 200, "English name");
    const nameJa = requiredText(body.nameJa, 200, "Japanese name");
    const legalEntity = requiredText(body.legalEntity, 200, "Legal entity");
    const custodianRole = requiredText(body.custodianRole, 50, "Custodian role");
    const validFrom = parseDateOnly(body.validFrom, "Valid from")!;
    const validTo = parseDateOnly(body.validTo, "Valid to", true);
    const scope = [...new Set((Array.isArray(body.scope) ? body.scope : []).map((item) => String(item).trim().toUpperCase()))];
    if (scope.length === 0) throw new ApiError(400, "scope_required", "A stamp must name the document classes it covers.");
    for (const documentClass of scope) demandDocumentClass(documentClass);
    if (validTo && validTo < validFrom) throw new ApiError(400, "invalid_validity", "The validity window ends before it starts.");

    const created = await database.transaction(async (transaction) => {
      const role = new sql.Request(transaction);
      role.input("code", sql.NVarChar(50), custodianRole);
      const roleRow = (await role.query<{ id: number }>(
        "SELECT id FROM dbo.roles WHERE code = @code AND is_active = 1;")).recordset[0];
      if (!roleRow) {
        throw new ApiError(400, "custodian_role_unknown",
          "The custodian role does not exist. Somebody must be answerable for a seal in the real world.");
      }
      const insert = new sql.Request(transaction);
      insert.input("code", sql.NVarChar(20), code);
      insert.input("name_th", sql.NVarChar(200), nameTh);
      insert.input("name_en", sql.NVarChar(200), nameEn);
      insert.input("name_ja", sql.NVarChar(200), nameJa);
      insert.input("legal_entity", sql.NVarChar(200), legalEntity);
      insert.input("scope", sql.NVarChar(sql.MAX), JSON.stringify(scope));
      insert.input("custodian", sql.BigInt, Number(roleRow.id));
      insert.input("valid_from", sql.Date, validFrom);
      insert.input("valid_to", sql.Date, validTo);
      insert.input("actor", sql.BigInt, actor.id);
      const id = Number((await insert.query<{ id: number }>(`
        INSERT INTO dbo.company_stamps (
          code, name_th, name_en, name_ja, legal_entity, scope_json,
          custodian_role_id, valid_from, valid_to, status, created_by)
        OUTPUT inserted.id
        VALUES (@code, @name_th, @name_en, @name_ja, @legal_entity, @scope,
                @custodian, @valid_from, @valid_to, N'ACTIVE', @actor);
      `)).recordset[0]!.id);
      await insertAudit(transaction, actor.id, "CompanyStamp", id, code, "Created", null,
        { code, legalEntity, scope, custodianRole, validFrom, validTo });
      return { id, code };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);

    return reply.status(201).header("Location", `/api/v1/master/company-stamps/${created.id}`).send(created);
  });

  /**
   * Setting the seal artwork is the one stamp change Admin may not make on its
   * own: it is what actually appears on a customer's paper. It requires the
   * Manager permission, and the image is stored where no route can serve it.
   */
  app.put(
    "/api/v1/master/company-stamps/:stampId/image",
    { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } },
    async (request) => {
      await users.demandPermission(request, "signing.stamp.grant");
      const actor = await users.required(request);
      const stampId = positiveLong((request.params as { stampId?: string }).stampId, "Stamp id");
      const body = bodyObject(request.body);
      const image = decodePng(body.imageBase64, "image_required");
      const expected = parseRowVersion(body.rowVersion);

      const key = storageKey("signing/stamps", ".png");
      let stored = false;
      try {
        await writeStoredBuffer(config.documentStorage, key, image);
        stored = true;
        const result = await database.transaction(async (transaction) => {
          const update = new sql.Request(transaction);
          update.input("stamp_id", sql.BigInt, stampId);
          update.input("image_key", sql.NVarChar(1000), key);
          update.input("row_version", sql.VarBinary(8), expected);
          const updated = await update.query(`
            UPDATE dbo.company_stamps SET image_key = @image_key, updated_at = SYSUTCDATETIME()
             WHERE id = @stamp_id AND row_version = @row_version;
          `);
          if ((updated.rowsAffected[0] ?? 0) === 0) {
            throw new ApiError(409, "concurrent_update", "The stamp changed since it was loaded. Reload and try again.");
          }
          await insertAudit(transaction, actor.id, "CompanyStamp", stampId, String(stampId), "Artwork replaced", null,
            { sizeBytes: image.length });
          return { id: stampId };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        stored = false;
        return result;
      } finally {
        if (stored) await deleteStoredFile(config.documentStorage, key).catch(() => undefined);
      }
    });

  /**
   * Who may borrow the seal, granted by whom, until when. The physical world
   * already answers this question; the system models it and adds the one
   * improvement it can — the seal can never be borrowed anonymously.
   */
  app.post("/api/v1/master/company-stamps/:stampId/authorities", async (request, reply) => {
    await users.demandPermission(request, "signing.stamp.grant");
    const actor = await users.required(request);
    const stampId = positiveLong((request.params as { stampId?: string }).stampId, "Stamp id");
    const body = bodyObject(request.body);
    const holderKind = String(body.holderKind ?? "");
    if (holderKind !== "ROLE" && holderKind !== "USER") {
      throw new ApiError(400, "invalid_holder", "A grant is held by a ROLE or a USER.");
    }
    const documentClass = body.documentClass === undefined || body.documentClass === null || body.documentClass === ""
      ? null
      : demandDocumentClass(body.documentClass);
    const validFrom = parseDateOnly(body.validFrom, "Valid from")!;
    const validTo = parseDateOnly(body.validTo, "Valid to", true);
    if (validTo && validTo < validFrom) throw new ApiError(400, "invalid_validity", "The validity window ends before it starts.");

    const created = await database.transaction(async (transaction) => {
      let roleId: number | null = null;
      let userId: number | null = null;
      if (holderKind === "ROLE") {
        // Role grants are named by their code so the caller never needs an
        // internal id. Admin is refused here with a clear message; a trigger
        // enforces the same rule so it cannot be bypassed.
        const holderRole = requiredText(body.holderRole, 50, "Role");
        if (holderRole === "Admin") {
          throw new ApiError(400, "admin_cannot_hold_stamp",
            "The Admin role cannot hold company stamp authority. Admin configures the system; the business signs.");
        }
        const role = new sql.Request(transaction);
        role.input("code", sql.NVarChar(50), holderRole);
        const row = (await role.query<{ id: number }>(
          "SELECT id FROM dbo.roles WHERE code = @code AND is_active = 1;")).recordset[0];
        if (!row) throw new ApiError(400, "role_unknown", "That role does not exist.");
        roleId = Number(row.id);
      } else {
        userId = requiredInteger(body.holderId, "Holder id", 1);
      }

      const insert = new sql.Request(transaction);
      insert.input("stamp_id", sql.BigInt, stampId);
      insert.input("role_id", sql.BigInt, roleId);
      insert.input("user_id", sql.BigInt, userId);
      insert.input("doc_class", sql.NVarChar(30), documentClass);
      insert.input("actor", sql.BigInt, actor.id);
      insert.input("valid_from", sql.Date, validFrom);
      insert.input("valid_to", sql.Date, validTo);
      const id = Number((await insert.query<{ id: number }>(`
        DECLARE @created TABLE (id bigint NOT NULL);
        INSERT INTO dbo.stamp_authorities (company_stamp_id, role_id, user_id, doc_class, granted_by, valid_from, valid_to)
        OUTPUT inserted.id INTO @created(id)
        VALUES (@stamp_id, @role_id, @user_id, @doc_class, @actor, @valid_from, @valid_to);
        SELECT id FROM @created;
      `)).recordset[0]!.id);

      // Granting stamp authority notifies the custodian, so it can never happen
      // quietly.
      const notify = new sql.Request(transaction);
      notify.input("stamp_id", sql.BigInt, stampId);
      notify.input("actor", sql.BigInt, actor.id);
      await notify.query(`
        INSERT INTO dbo.notifications (user_id, kind, title, detail, entity_type, entity_id)
        SELECT u.id, N'STAMP_AUTHORITY_GRANTED', N'Company stamp authority granted',
               CONCAT(N'Stamp ', s.code, N' authority granted by ', granter.name), N'CompanyStamp', s.id
        FROM dbo.company_stamps s
        INNER JOIN dbo.users granter ON granter.id = @actor
        INNER JOIN dbo.users u ON u.role_id = s.custodian_role_id
        WHERE s.id = @stamp_id AND u.deleted_at IS NULL AND u.is_active = 1;
      `);

      await insertAudit(transaction, actor.id, "StampAuthority", id, String(stampId), "Granted", null,
        { stampId, holderKind, roleId, userId, documentClass, validFrom, validTo });
      return { id };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);

    return reply.status(201)
      .header("Location", `/api/v1/master/company-stamps/${stampId}/authorities/${created.id}`)
      .send(created);
  });

  app.post("/api/v1/master/company-stamps/:stampId/authorities/:authorityId/revoke", async (request) => {
    await users.demandPermission(request, "signing.stamp.grant");
    const actor = await users.required(request);
    const params = request.params as { stampId?: string; authorityId?: string };
    const stampId = positiveLong(params.stampId, "Stamp id");
    const authorityId = positiveLong(params.authorityId, "Authority id");
    const reason = requireReason(bodyObject(request.body).reason, "reason_required");

    return database.transaction(async (transaction) => {
      // Revocation is not retroactive: documents already stamped stay stamped,
      // and their marks keep naming the grant that permitted them.
      const update = new sql.Request(transaction);
      update.input("authority_id", sql.BigInt, authorityId);
      update.input("stamp_id", sql.BigInt, stampId);
      update.input("reason", sql.NVarChar(sql.MAX), reason);
      const updated = await update.query(`
        UPDATE dbo.stamp_authorities SET revoked_at = SYSUTCDATETIME(), revoke_reason = @reason
         WHERE id = @authority_id AND company_stamp_id = @stamp_id AND revoked_at IS NULL;
      `);
      if ((updated.rowsAffected[0] ?? 0) === 0) {
        throw new ApiError(404, "authority_not_found", "That stamp authority does not exist or is already revoked.");
      }
      await insertAudit(transaction, actor.id, "StampAuthority", authorityId, String(stampId), "Revoked", null,
        { stampId, reason });
      return { id: authorityId, revoked: true };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  // -------------------------------------------------------------------------
  // Flow templates — the only place the eight document classes differ
  // -------------------------------------------------------------------------
  app.get("/api/v1/master/signature-flows", async (request) => {
    await users.demandPermission(request, "signing.read");
    const steps = new Map<number, Record<string, unknown>[]>();
    for (const row of (await database.query<Record<string, unknown>>(`
      SELECT s.template_id, s.id, s.step_no, s.block_code, s.assignee_kind,
             r.code AS assignee_role, u.name AS assignee_name, s.required_mark, stamp.code AS stamp_code,
             s.is_optional, s.parallel_group, s.anchor_code, s.due_days, s.min_amount, s.max_amount
      FROM dbo.sign_flow_steps s
      LEFT JOIN dbo.roles r ON r.id = s.assignee_role_id
      LEFT JOIN dbo.users u ON u.id = s.assignee_user_id
      LEFT JOIN dbo.company_stamps stamp ON stamp.id = s.company_stamp_id
      ORDER BY s.template_id, s.step_no;
    `)).recordset) {
      const templateId = Number(row.template_id);
      const list = steps.get(templateId) ?? [];
      list.push({
        id: Number(row.id),
        stepNo: Number(row.step_no),
        blockCode: String(row.block_code),
        assigneeKind: String(row.assignee_kind),
        assigneeRole: row.assignee_role === null ? null : String(row.assignee_role),
        assigneeName: row.assignee_name === null ? null : String(row.assignee_name),
        requiredMark: String(row.required_mark),
        stampCode: row.stamp_code === null ? null : String(row.stamp_code),
        isOptional: Boolean(row.is_optional),
        parallelGroup: row.parallel_group === null ? null : Number(row.parallel_group),
        anchorCode: String(row.anchor_code),
        dueDays: row.due_days === null ? null : Number(row.due_days),
        minAmount: row.min_amount === null ? null : Number(row.min_amount),
        maxAmount: row.max_amount === null ? null : Number(row.max_amount),
      });
      steps.set(templateId, list);
    }

    // A running request pins the template version it started on, so an admin
    // editing a flow can see how many live requests they are not affecting.
    return (await database.query<Record<string, unknown>>(`
      SELECT t.id, t.doc_class, t.version, t.ordered, t.no_same_person, t.return_target,
             t.allow_manager_skip, t.status,
             (SELECT COUNT(*) FROM dbo.sign_requests rq
               WHERE rq.template_id = t.id AND rq.state IN (N'PENDING_SIGN', N'PARTIALLY_SIGNED')) AS running
      FROM dbo.sign_flow_templates t ORDER BY t.doc_class, t.version DESC;
    `)).recordset.map((row) => ({
      id: Number(row.id),
      documentClass: String(row.doc_class),
      version: Number(row.version),
      ordered: Boolean(row.ordered),
      noSamePerson: Boolean(row.no_same_person),
      returnTarget: String(row.return_target),
      allowManagerSkip: Boolean(row.allow_manager_skip),
      status: String(row.status),
      runningRequests: Number(row.running),
      steps: steps.get(Number(row.id)) ?? [],
    }));
  });
}
