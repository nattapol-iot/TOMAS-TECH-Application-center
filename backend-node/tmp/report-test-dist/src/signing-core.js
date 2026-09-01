import { createHash, randomBytes } from "node:crypto";
import sql from "mssql/msnodesqlv8.js";
import { ApiError } from "./errors.js";
import { demandProjectScope, isProjectElevated } from "./project-scope.js";
/**
 * Document signing (DSN-TC-005).
 *
 * Signing is not approving. An approval is a decision about a *record*; a
 * signature is a mark placed on one exact *file*, identified by its SHA-256.
 * The two are produced by one user action wherever both apply, but they are
 * stored separately and neither replaces the other.
 */
export const DOCUMENT_CLASSES = [
    "DRAWING", "SPEC", "MANUAL", "MAT_APPROVE",
    "QUOTATION", "PR_PO", "UAT_ACCEPT", "SERVICE_RPT",
];
/** None of these collide with the INQ / EST / PJ / BOM / PR / PO / GRN / MIR / ADJ sequences. */
const NUMBER_PREFIX = {
    DRAWING: "DWG", SPEC: "SPC", MANUAL: "MAN", MAT_APPROVE: "MTA",
    QUOTATION: "QT", PR_PO: "PRD", UAT_ACCEPT: "UAT", SERVICE_RPT: "SVR",
};
export function numberPrefix(documentClass) {
    return NUMBER_PREFIX[documentClass];
}
export function demandDocumentClass(value) {
    if (typeof value !== "string" || !DOCUMENT_CLASSES.includes(value)) {
        throw new ApiError(400, "unknown_document_class", `The document class must be one of ${DOCUMENT_CLASSES.join(", ")}.`);
    }
    return value;
}
export function demandLocale(value) {
    if (value !== "th" && value !== "en" && value !== "ja") {
        throw new ApiError(400, "invalid_locale", "The document locale must be th, en or ja.");
    }
    return value;
}
export function normalizeRevisionLabel(value) {
    const label = (typeof value === "string" && value.trim() ? value.trim() : "R00").toUpperCase();
    if (label.length < 2 || label.length > 10 || label[0] !== "R" || !/^\d+$/.test(label.slice(1))) {
        throw new ApiError(400, "invalid_revision_label", "A revision label is R followed by digits, for example R00.");
    }
    return label;
}
export function requireReason(value, code) {
    const reason = typeof value === "string" ? value.trim() : "";
    if (!reason)
        throw new ApiError(400, code, "A reason is required and is kept in the event chain.");
    if (reason.length > 4_000)
        throw new ApiError(400, code, "The reason must be 4000 characters or fewer.");
    return reason;
}
export function isSha256Hex(value) {
    return typeof value === "string" && value.length === 64 && /^[0-9a-fA-F]+$/.test(value);
}
export function canonicalPayload(fields) {
    return fields
        .filter(([, value]) => value !== null && value !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, value]) => `${key}=${String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n")}\n`)
        .join("");
}
export function sha256Hex(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
export function chainHash(previousHash, payloadHash) {
    return sha256Hex(`${previousHash ?? ""}|${payloadHash}`);
}
/** Crockford-style, with the ambiguous characters removed so a code read off a printed page cannot be mistyped as a different one. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newVerifyCode() {
    const bytes = randomBytes(12);
    const characters = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
    return `TC-${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8, 12)}`;
}
export function isVerifyCodeShape(value) {
    return typeof value === "string" && /^TC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(value);
}
/** datetimeoffset(0) keeps whole seconds only; hash and store the same value. */
function truncateToSecond(value) {
    return new Date(Math.floor(value.getTime() / 1_000) * 1_000);
}
const DEFAULT_MAX_AUTH_AGE_SECONDS = 300;
export function evaluateSigningAssurance(request) {
    const identity = request.identity;
    if (!identity)
        throw new ApiError(401, "unauthenticated", "Authentication is required.");
    // Never available in Production; labelled as such in the chain forever.
    if (identity.mode === "Development")
        return { evidence: "development", authenticatedAt: new Date() };
    if (identity.mode === "TeamTest")
        return { evidence: "team-test", authenticatedAt: new Date() };
    const maxAgeSeconds = Math.min(3_600, Math.max(60, Number(process.env.SIGNING_MAX_AUTH_AGE_SECONDS) || DEFAULT_MAX_AUTH_AGE_SECONDS));
    const requireAuthTime = process.env.SIGNING_REQUIRE_AUTH_TIME === "true";
    // auth_time is the identity provider asserting when the human last
    // authenticated interactively — the strong form. It needs the optional claim
    // on the API app registration.
    if (identity.authTime)
        return freshOrThrow("entra-auth_time", identity.authTime, maxAgeSeconds);
    if (requireAuthTime) {
        throw new ApiError(401, "auth_time_required", "This deployment requires the identity provider to assert when you last signed in. Add the auth_time optional claim to the API app registration.");
    }
    // A silent refresh also produces a recent iat, so this evidences a live
    // session rather than a live human. Recorded honestly as the weaker label.
    if (identity.issuedAt)
        return freshOrThrow("entra-token-iat", identity.issuedAt, maxAgeSeconds);
    throw new ApiError(401, "reauthentication_required", "The access token does not state when it was issued, so your presence cannot be evidenced. Sign in again and retry.");
}
function freshOrThrow(evidence, unixSeconds, maxAgeSeconds) {
    const authenticatedAt = new Date(unixSeconds * 1_000);
    const ageSeconds = (Date.now() - authenticatedAt.getTime()) / 1_000;
    // A token dated in the future is a clock problem, not evidence.
    if (ageSeconds < -300 || ageSeconds > maxAgeSeconds) {
        throw new ApiError(401, "reauthentication_required", `Signing requires a sign-in from the last ${Math.round(maxAgeSeconds / 60)} minutes. Sign in again and retry.`, { evidence, ageSeconds: Math.round(ageSeconds), maxAgeSeconds });
    }
    return { evidence, authenticatedAt };
}
export async function loadSignableDocument(database, documentId, transaction, forUpdate = false) {
    const statement = `
    SELECT d.id, d.doc_no, d.doc_class, d.title, d.project_id, d.estimate_id, d.document_locale,
           d.amount, d.owner_id, d.current_file_id, d.signing_state, d.row_version, p.manager_id, d.schedule_task_id
    FROM dbo.signable_documents d ${forUpdate ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
    LEFT JOIN dbo.projects p ON p.id = d.project_id
    WHERE d.id = @document_id;
  `;
    const bind = (request) => {
        request.input("document_id", sql.BigInt, documentId);
    };
    let row;
    if (transaction) {
        const request = new sql.Request(transaction);
        bind(request);
        row = (await request.query(statement)).recordset[0];
    }
    else {
        row = (await database.query(statement, bind)).recordset[0];
    }
    if (!row)
        throw new ApiError(404, "document_not_found", "The signable document was not found.");
    return {
        id: Number(row.id),
        documentNo: String(row.doc_no),
        documentClass: String(row.doc_class),
        title: String(row.title),
        projectId: row.project_id === null ? null : Number(row.project_id),
        estimateId: row.estimate_id === null ? null : Number(row.estimate_id),
        documentLocale: String(row.document_locale),
        amount: row.amount === null ? null : Number(row.amount),
        ownerId: Number(row.owner_id),
        currentFileId: row.current_file_id === null ? null : Number(row.current_file_id),
        signingState: String(row.signing_state),
        rowVersion: row.row_version,
        projectManagerId: row.manager_id === null || row.manager_id === undefined ? null : Number(row.manager_id),
        scheduleTaskId: row.schedule_task_id == null ? null : Number(row.schedule_task_id),
    };
}
/**
 * A signable document is visible to the people working on it. When it hangs off
 * a project, project assignment decides; otherwise the owner, the initiator of
 * its request, its signers and elevated roles can see it.
 */
export async function demandDocumentScope(database, document, actor, transaction) {
    if (document.projectId !== null) {
        await demandProjectScope(database, actor, document.projectId, transaction);
        return;
    }
    if (isProjectElevated(actor) || document.ownerId === actor.id)
        return;
    const statement = `
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM dbo.sign_requests rq
      INNER JOIN dbo.sign_steps s ON s.request_id = rq.id
      WHERE rq.document_id = @document_id
        AND (rq.initiator_id = @actor OR s.assignee_user_id = @actor OR s.decided_by = @actor)
    ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS allowed;
  `;
    const bind = (request) => {
        request.input("document_id", sql.BigInt, document.id);
        request.input("actor", sql.BigInt, actor.id);
    };
    let row;
    if (transaction) {
        const request = new sql.Request(transaction);
        bind(request);
        row = (await request.query(statement)).recordset[0];
    }
    else {
        row = (await database.query(statement, bind)).recordset[0];
    }
    if (!row?.allowed) {
        throw new ApiError(403, "record_access_denied", "You are not the owner of this document and not assigned to its signature flow.");
    }
}
export function demandRowVersion(actual, expected) {
    if (actual.length !== expected.length || !actual.equals(expected)) {
        throw new ApiError(409, "concurrent_update", "The record changed since it was loaded. Reload and try again.");
    }
}
export function demandOwnerOrElevated(document, actor) {
    if (document.ownerId === actor.id || isProjectElevated(actor))
        return;
    throw new ApiError(403, "document_owner_required", "Only the document owner can change its revisions or open a signature request.");
}
/** Appends one link to a request's hash chain. */
export async function appendSignEvent(transaction, input) {
    const head = new sql.Request(transaction);
    head.input("request_id", sql.BigInt, input.requestId);
    const previous = (await head.query(`
    SELECT TOP (1) seq, hash FROM dbo.sign_events WITH (UPDLOCK, HOLDLOCK)
    WHERE request_id = @request_id ORDER BY seq DESC;
  `)).recordset[0];
    const seq = previous ? Number(previous.seq) + 1 : 1;
    const previousHash = previous ? String(previous.hash) : null;
    // datetimeoffset(0) stores whole seconds, so the value that comes back out is
    // not the value that went in unless the milliseconds are dropped first. Hash
    // what the database will actually hold, or the chain fails its own check.
    const occurredAt = truncateToSecond(new Date());
    const authAt = input.assurance ? truncateToSecond(input.assurance.authenticatedAt) : null;
    const fields = [
        ["request_id", String(input.requestId)],
        ["seq", String(seq)],
        ["action", input.action],
        ["step_id", input.stepId === null || input.stepId === undefined ? null : String(input.stepId)],
        ["actor_id", input.actorId === null || input.actorId === undefined ? null : String(input.actorId)],
        ["occurred_at", occurredAt.toISOString()],
        ["auth_evidence", input.assurance?.evidence ?? null],
        ["auth_at", authAt ? authAt.toISOString() : null],
        ["ip", input.ip ?? null],
        ...Object.entries(input.payload).map(([key, value]) => [`p.${key}`, value]),
    ];
    const payloadHash = sha256Hex(canonicalPayload(fields));
    const hash = chainHash(previousHash, payloadHash);
    const detail = Object.keys(input.payload).length === 0 ? null : JSON.stringify(input.payload);
    const insert = new sql.Request(transaction);
    insert.input("request_id", sql.BigInt, input.requestId);
    insert.input("seq", sql.Int, seq);
    insert.input("step_id", sql.BigInt, input.stepId ?? null);
    insert.input("actor_id", sql.BigInt, input.actorId ?? null);
    insert.input("action", sql.NVarChar(40), input.action);
    insert.input("detail", sql.NVarChar(sql.MAX), detail);
    insert.input("ip", sql.NVarChar(64), input.ip?.slice(0, 64) ?? null);
    insert.input("user_agent", sql.NVarChar(400), input.userAgent?.slice(0, 400) ?? null);
    insert.input("auth_evidence", sql.NVarChar(40), input.assurance?.evidence ?? null);
    insert.input("auth_at", sql.DateTimeOffset, authAt);
    insert.input("payload_hash", sql.Char(64), payloadHash);
    insert.input("prev_hash", sql.Char(64), previousHash);
    insert.input("hash", sql.Char(64), hash);
    insert.input("occurred_at", sql.DateTimeOffset, occurredAt);
    await insert.query(`
    INSERT INTO dbo.sign_events (
      request_id, seq, sign_step_id, actor_id, action, detail, ip, user_agent,
      auth_evidence, auth_at, payload_hash, prev_hash, hash, occurred_at)
    VALUES (
      @request_id, @seq, @step_id, @actor_id, @action, @detail, @ip, @user_agent,
      @auth_evidence, @auth_at, @payload_hash, @prev_hash, @hash, @occurred_at);
  `);
    return hash;
}
/**
 * Re-computes the chain in front of whoever is looking. This is a user action on
 * the record screen and the verification page, not an admin tool: a claim of
 * integrity nobody can check is not worth making.
 */
export async function verifyChain(database, requestId, transaction) {
    const statement = `
    SELECT e.seq, e.sign_step_id, e.actor_id, e.action, e.detail, e.ip,
           e.auth_evidence, e.auth_at, e.payload_hash, e.prev_hash, e.hash, e.occurred_at
    FROM dbo.sign_events e WHERE e.request_id = @request_id ORDER BY e.seq;
  `;
    const bind = (request) => {
        request.input("request_id", sql.BigInt, requestId);
    };
    let rows;
    if (transaction) {
        const request = new sql.Request(transaction);
        bind(request);
        rows = (await request.query(statement)).recordset;
    }
    else {
        rows = (await database.query(statement, bind)).recordset;
    }
    let verified = true;
    let previous = null;
    let head = "";
    for (const row of rows) {
        const detail = row.detail === null || row.detail === undefined
            ? null
            : JSON.parse(String(row.detail));
        const fields = [
            ["request_id", String(requestId)],
            ["seq", String(Number(row.seq))],
            ["action", String(row.action)],
            ["step_id", row.sign_step_id === null ? null : String(Number(row.sign_step_id))],
            ["actor_id", row.actor_id === null ? null : String(Number(row.actor_id))],
            ["occurred_at", new Date(row.occurred_at).toISOString()],
            ["auth_evidence", row.auth_evidence === null ? null : String(row.auth_evidence)],
            ["auth_at", row.auth_at === null ? null : new Date(row.auth_at).toISOString()],
            ["ip", row.ip === null ? null : String(row.ip)],
            ...(detail ? Object.entries(detail).map(([key, value]) => [`p.${key}`, value]) : []),
        ];
        const expectedPayloadHash = sha256Hex(canonicalPayload(fields));
        const storedPrevious = row.prev_hash === null ? null : String(row.prev_hash);
        if (expectedPayloadHash !== String(row.payload_hash)
            || storedPrevious !== previous
            || chainHash(previous, String(row.payload_hash)) !== String(row.hash)) {
            verified = false;
        }
        previous = String(row.hash);
        head = String(row.hash);
    }
    return { verified: verified && rows.length > 0, head, count: rows.length };
}
/**
 * Does this person hold a live authority to apply this stamp to this class of
 * document today? Returns the grant that permitted it, because at audit time the
 * question is whether they were allowed to, not only whether they did.
 */
export async function resolveStampAuthority(transaction, companyStampId, documentClass, actor) {
    const request = new sql.Request(transaction);
    request.input("stamp_id", sql.BigInt, companyStampId);
    request.input("doc_class", sql.NVarChar(30), documentClass);
    request.input("actor", sql.BigInt, actor.id);
    request.input("role", sql.NVarChar(50), actor.role);
    const row = (await request.query(`
    DECLARE @today date = CONVERT(date, SYSUTCDATETIME());
    SELECT TOP (1) a.id
    FROM dbo.stamp_authorities a
    INNER JOIN dbo.company_stamps s ON s.id = a.company_stamp_id
    LEFT JOIN dbo.roles r ON r.id = a.role_id
    WHERE a.company_stamp_id = @stamp_id
      AND a.revoked_at IS NULL
      AND a.valid_from <= @today AND (a.valid_to IS NULL OR a.valid_to >= @today)
      AND (a.doc_class IS NULL OR a.doc_class = @doc_class)
      AND (a.user_id = @actor OR r.code = @role)
      AND s.status = N'ACTIVE'
      AND s.valid_from <= @today AND (s.valid_to IS NULL OR s.valid_to >= @today)
      AND EXISTS (SELECT 1 FROM OPENJSON(s.scope_json) scope WHERE scope.value = @doc_class)
    -- A named grant is more specific than a role grant, so it is reported first
    -- when a person holds both.
    ORDER BY CASE WHEN a.user_id IS NOT NULL THEN 0 ELSE 1 END, a.id;
  `)).recordset[0];
    return row ? Number(row.id) : null;
}
export async function activeSpecimenId(database, userId, transaction) {
    const statement = "SELECT TOP (1) id FROM dbo.signature_specimens WHERE user_id = @user_id AND active_to IS NULL;";
    const bind = (request) => {
        request.input("user_id", sql.BigInt, userId);
    };
    let row;
    if (transaction) {
        const request = new sql.Request(transaction);
        bind(request);
        row = (await request.query(statement)).recordset[0];
    }
    else {
        row = (await database.query(statement, bind)).recordset[0];
    }
    return row ? Number(row.id) : null;
}
export async function setDocumentState(transaction, documentId, signingState, currentFileId = null) {
    const request = new sql.Request(transaction);
    request.input("document_id", sql.BigInt, documentId);
    request.input("state", sql.NVarChar(30), signingState);
    request.input("current_file_id", sql.BigInt, currentFileId);
    await request.query(`
    UPDATE dbo.signable_documents
       SET signing_state = @state,
           current_file_id = COALESCE(@current_file_id, current_file_id),
           updated_at = SYSUTCDATETIME()
     WHERE id = @document_id;
  `);
}
export function clientIp(request) {
    return request.ip || "unknown";
}
export function clientUserAgent(request) {
    const value = request.headers["user-agent"];
    const agent = Array.isArray(value) ? value[0] : value;
    return agent && agent.length > 0 ? agent : null;
}
//# sourceMappingURL=signing-core.js.map