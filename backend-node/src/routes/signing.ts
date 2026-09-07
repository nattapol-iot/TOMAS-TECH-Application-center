import sql from "mssql";
import { readFile } from "node:fs/promises";
import { loadSigningPdf, parsePlacement, validatePage, paintMarks, appendPdfCertificate, type MarkPlacement, type PdfMark } from "../signing-pdf.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  deleteStoredFile,
  DOCUMENT_DOWNLOAD_RATE_LIMIT,
  sendStoredFile,
  storageKey,
  writeStoredBuffer,
  resolveStoragePath,
} from "../document-storage.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, firstQueryValue, optionalBodyText, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import { insertAudit } from "../audit.js";
import { issueDocumentNumber } from "../document-number.js";
import { demandDrawingTask, loadDrawingApprovers } from "../drawing-workflow.js";
import { isProjectElevated } from "../project-scope.js";
import { buildSignatureCertificate, type CertificateSignature } from "../signing-certificate.js";
import {
  activeSpecimenId,
  appendSignEvent,
  clientIp,
  clientUserAgent,
  demandDocumentClass,
  demandDocumentScope,
  demandLocale,
  demandOwnerOrElevated,
  demandRowVersion,
  evaluateSigningAssurance,
  isSha256Hex,
  isVerifyCodeShape,
  loadSignableDocument,
  newVerifyCode,
  normalizeRevisionLabel,
  numberPrefix,
  requireReason,
  resolveStampAuthority,
  setDocumentState,
  verifyChain,
  type SignableDocumentContext,
} from "../signing-core.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

const DOCUMENT_ENTITY = "SignableDocument";

type ProjectDocumentSource = {
  id: number;
  projectId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
};

type StepContext = {
  id: number;
  requestId: number;
  documentId: number;
  stepNo: number;
  blockCode: string;
  requiredMark: string;
  companyStampId: number | null;
  assigneeUserId: number | null;
  assigneeRoleCode: string | null;
  anchorCode: string;
  stepState: string;
  templateOrdered: boolean;
  fileSha256: string;
  rowVersion: Buffer;
};

type FlowTemplateStep = {
  stepNo: number;
  blockCode: string;
  assigneeKind: string;
  assigneeRoleId: number | null;
  assigneeUserId: number | null;
  requiredMark: string;
  companyStampId: number | null;
  isOptional: boolean;
  parallelGroup: number | null;
  anchorCode: string;
  dueDays: number | null;
  minAmount: number | null;
  maxAmount: number | null;
};

function number(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * The stored bytes' identity. The signing service refuses to freeze a file whose
 * SHA-256 it does not have, because a signature that points at an unhashed file
 * points at nothing. `provider_etag` carried the hash before migration 018 gave
 * the table its own column, so both are read.
 */
async function loadProjectDocument(
  database: Database,
  projectDocumentId: number,
  transaction?: TransactionType,
): Promise<ProjectDocumentSource> {
  if (projectDocumentId <= 0) throw new ApiError(400, "project_document_required", "A stored document must be named.");
  const statement = `
    SELECT d.id, d.project_id, d.name, d.content_type, d.size_bytes, d.storage_key,
           COALESCE(d.sha256, d.provider_etag) AS sha256
    FROM dbo.project_docs d
    INNER JOIN dbo.projects p ON p.id = d.project_id AND p.deleted_at IS NULL
    WHERE d.id = @id AND d.deleted_at IS NULL;
  `;
  const bind = (request: InstanceType<typeof sql.Request>): void => {
    request.input("id", sql.BigInt, projectDocumentId);
  };
  let row: Record<string, unknown> | undefined;
  if (transaction) {
    const request = new sql.Request(transaction);
    bind(request);
    row = (await request.query<Record<string, unknown>>(statement)).recordset[0];
  } else {
    row = (await database.query<Record<string, unknown>>(statement, bind)).recordset[0];
  }
  if (!row) throw new ApiError(404, "project_document_not_found", "The stored document was not found.");
  const sha256 = text(row.sha256);
  if (!isSha256Hex(sha256)) {
    throw new ApiError(409, "content_hash_missing",
      "This stored document has no recorded SHA-256, so it cannot be frozen for signature. Re-upload it.");
  }
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    fileName: String(row.name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    storageKey: String(row.storage_key),
    sha256: sha256.toLowerCase(),
  };
}

async function freezeRevision(
  transaction: TransactionType,
  documentId: number,
  revisionLabel: string,
  source: ProjectDocumentSource,
  actorId: number,
): Promise<number> {
  const insert = new sql.Request(transaction);
  insert.input("document_id", sql.BigInt, documentId);
  insert.input("revision_label", sql.NVarChar(10), revisionLabel);
  insert.input("project_doc_id", sql.BigInt, source.id);
  insert.input("storage_key", sql.NVarChar(1000), source.storageKey);
  insert.input("file_name", sql.NVarChar(500), source.fileName);
  insert.input("content_type", sql.NVarChar(200), source.contentType);
  insert.input("size_bytes", sql.BigInt, source.sizeBytes);
  insert.input("sha256", sql.Char(64), source.sha256);
  insert.input("actor", sql.BigInt, actorId);
  const row = (await insert.query<{ id: number }>(`
    DECLARE @created TABLE (id bigint NOT NULL);
    INSERT INTO dbo.document_files (
      document_id, revision_label, source, project_doc_id, storage_key,
      file_name, content_type, size_bytes, sha256, frozen_by)
    OUTPUT inserted.id INTO @created(id)
    VALUES (
      @document_id, @revision_label, N'UPLOADED', @project_doc_id, @storage_key,
      @file_name, @content_type, @size_bytes, @sha256, @actor);
    SELECT id FROM @created;
  `)).recordset[0]!;
  return Number(row.id);
}

async function liveRequestId(transaction: TransactionType, documentId: number): Promise<number | null> {
  const request = new sql.Request(transaction);
  request.input("document_id", sql.BigInt, documentId);
  const row = (await request.query<{ id: number }>(`
    SELECT TOP (1) id FROM dbo.sign_requests WITH (UPDLOCK, HOLDLOCK)
    WHERE document_id = @document_id AND state IN (N'PENDING_SIGN', N'PARTIALLY_SIGNED')
    ORDER BY id DESC;
  `)).recordset[0];
  return row ? Number(row.id) : null;
}

async function loadActiveTemplate(
  transaction: TransactionType,
  documentClass: string,
): Promise<{ id: number; version: number; ordered: boolean; steps: FlowTemplateStep[] }> {
  const request = new sql.Request(transaction);
  request.input("doc_class", sql.NVarChar(30), documentClass);
  const rows = (await request.query<Record<string, unknown>>(`
    SELECT t.id, t.version, t.ordered,
           s.step_no, s.block_code, s.assignee_kind, s.assignee_role_id, s.assignee_user_id,
           s.required_mark, s.company_stamp_id, s.is_optional, s.parallel_group,
           s.anchor_code, s.due_days, s.min_amount, s.max_amount
    FROM dbo.sign_flow_templates t
    INNER JOIN dbo.sign_flow_steps s ON s.template_id = t.id
    WHERE t.doc_class = @doc_class AND t.status = N'ACTIVE'
    ORDER BY s.step_no;
  `)).recordset;
  if (rows.length === 0) {
    throw new ApiError(409, "no_active_flow", `No active signature flow is configured for ${documentClass}.`);
  }
  return {
    id: Number(rows[0]!.id),
    version: Number(rows[0]!.version),
    ordered: Boolean(rows[0]!.ordered),
    steps: rows.map((row) => ({
      stepNo: Number(row.step_no),
      blockCode: String(row.block_code),
      assigneeKind: String(row.assignee_kind),
      assigneeRoleId: number(row.assignee_role_id),
      assigneeUserId: number(row.assignee_user_id),
      requiredMark: String(row.required_mark),
      companyStampId: number(row.company_stamp_id),
      isOptional: Boolean(row.is_optional),
      parallelGroup: number(row.parallel_group),
      anchorCode: String(row.anchor_code),
      dueDays: number(row.due_days),
      minAmount: number(row.min_amount),
      maxAmount: number(row.max_amount),
    })),
  };
}

/** A banded step needs a value to compare. Without one the safe answer is to include the step, so a missing amount cannot skip an approval. */
function appliesToAmount(step: FlowTemplateStep, amount: number | null): boolean {
  if (step.minAmount === null && step.maxAmount === null) return true;
  const value = amount ?? Number.MAX_SAFE_INTEGER;
  if (step.minAmount !== null && value < step.minAmount) return false;
  if (step.maxAmount !== null && value > step.maxAmount) return false;
  return true;
}

async function activateSteps(transaction: TransactionType, requestId: number, ordered: boolean): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("request_id", sql.BigInt, requestId);
  await request.query(ordered
    ? `UPDATE s SET s.state = N'PENDING'
         FROM dbo.sign_steps s
        WHERE s.request_id = @request_id AND s.state = N'WAITING'
          AND NOT EXISTS (
              SELECT 1 FROM dbo.sign_steps earlier
               WHERE earlier.request_id = s.request_id
                 AND earlier.step_no < s.step_no
                 AND earlier.state IN (N'WAITING', N'PENDING')
                 AND (s.parallel_group IS NULL OR earlier.parallel_group IS NULL
                      OR s.parallel_group <> earlier.parallel_group));`
    : `UPDATE dbo.sign_steps SET state = N'PENDING' WHERE request_id = @request_id AND state = N'WAITING';`);
  await request.query(`INSERT dbo.notifications(user_id,kind,title,detail,entity_type,entity_id)
    SELECT s.assignee_user_id,N'SIGNING_ASSIGNED',N'Document awaiting your signature',d.doc_no+N' - '+s.block_code,N'SignStep',s.id
    FROM dbo.sign_steps s JOIN dbo.sign_requests rq ON rq.id=s.request_id JOIN dbo.signable_documents d ON d.id=rq.document_id
    WHERE s.request_id=@request_id AND s.state=N'PENDING' AND s.assignee_user_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM dbo.notifications n WHERE n.user_id=s.assignee_user_id AND n.kind=N'SIGNING_ASSIGNED' AND n.entity_type=N'SignStep' AND n.entity_id=s.id);`);
}

async function mandatoryStepsRemaining(transaction: TransactionType, requestId: number): Promise<number> {
  const request = new sql.Request(transaction);
  request.input("request_id", sql.BigInt, requestId);
  const row = (await request.query<{ remaining: number }>(`
    SELECT COUNT_BIG(*) AS remaining FROM dbo.sign_steps
    WHERE request_id = @request_id AND is_optional = 0 AND state <> N'SIGNED';
  `)).recordset[0]!;
  return Number(row.remaining);
}

async function loadStep(transaction: TransactionType, stepId: number): Promise<StepContext> {
  const request = new sql.Request(transaction);
  request.input("step_id", sql.BigInt, stepId);
  const row = (await request.query<Record<string, unknown>>(`
    SELECT s.id, s.request_id, rq.document_id, s.step_no, s.block_code, s.required_mark,
           s.company_stamp_id, s.assignee_user_id, role.code AS assignee_role, s.anchor_code,
           s.state, rq.state AS request_state, t.ordered, f.sha256, s.row_version
    FROM dbo.sign_steps s WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.sign_requests rq ON rq.id = s.request_id
    INNER JOIN dbo.sign_flow_templates t ON t.id = rq.template_id
    INNER JOIN dbo.document_files f ON f.id = rq.document_file_id
    LEFT JOIN dbo.roles role ON role.id = s.assignee_role_id
    WHERE s.id = @step_id;
  `)).recordset[0];
  if (!row) throw new ApiError(404, "step_not_found", "The signature step was not found.");
  const requestState = String(row.request_state);
  if (requestState !== "PENDING_SIGN" && requestState !== "PARTIALLY_SIGNED") {
    throw new ApiError(409, "request_closed", `This signature request is ${requestState} and can no longer be decided.`);
  }
  return {
    id: Number(row.id),
    requestId: Number(row.request_id),
    documentId: Number(row.document_id),
    stepNo: Number(row.step_no),
    blockCode: String(row.block_code),
    requiredMark: String(row.required_mark),
    companyStampId: number(row.company_stamp_id),
    assigneeUserId: number(row.assignee_user_id),
    assigneeRoleCode: text(row.assignee_role),
    anchorCode: String(row.anchor_code),
    stepState: String(row.state),
    templateOrdered: Boolean(row.ordered),
    fileSha256: String(row.sha256),
    rowVersion: row.row_version as Buffer,
  };
}

function demandStepIsMine(step: StepContext, actor: CurrentUser): void {
  if (step.stepState !== "PENDING") {
    throw new ApiError(409, "step_not_pending", `This step is ${step.stepState} and cannot be decided.`);
  }
  const mine = step.assigneeUserId === actor.id
    || (step.assigneeUserId === null && step.assigneeRoleCode === actor.role);
  if (!mine) throw new ApiError(403, "step_not_assigned", "This signature step is not waiting for you.");
}

async function insertMark(
  transaction: TransactionType,
  input: {
    stepId: number;
    kind: string;
    specimenId?: number | null;
    companyStampId?: number | null;
    stampAuthorityId?: number | null;
    anchorCode: string;
    textValue?: string | null;
    scanProjectDocumentId?: number | null;
    placement?: MarkPlacement | null;
  },
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("step_id", sql.BigInt, input.stepId);
  request.input("kind", sql.NVarChar(20), input.kind);
  request.input("specimen_id", sql.BigInt, input.specimenId ?? null);
  request.input("stamp_id", sql.BigInt, input.companyStampId ?? null);
  request.input("authority_id", sql.BigInt, input.stampAuthorityId ?? null);
  request.input("anchor_code", sql.NVarChar(50), input.anchorCode);
  request.input("text_value", sql.NVarChar(200), input.textValue ?? null);
  request.input("scan_id", sql.BigInt, input.scanProjectDocumentId ?? null);
  request.input("page",sql.Int,input.placement?.page ?? null);
  for(const key of ["x","y","width","height"] as const) request.input(key,sql.Decimal(9,6),input.placement?.[key] ?? null);
  await request.query(`
    INSERT INTO dbo.signature_marks (
      sign_step_id, kind, specimen_id, company_stamp_id, stamp_authority_id,
      anchor_code, text_value, scan_project_doc_id,page_no,pos_x,pos_y,width,height)
    VALUES (@step_id, @kind, @specimen_id, @stamp_id, @authority_id, @anchor_code, @text_value, @scan_id,@page,@x,@y,@width,@height);
  `);
}

async function closeStep(
  transaction: TransactionType,
  stepId: number,
  state: string,
  decision: string,
  reason: string | null,
  actorId: number,
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("step_id", sql.BigInt, stepId);
  request.input("state", sql.NVarChar(20), state);
  request.input("decision", sql.NVarChar(20), decision);
  request.input("reason", sql.NVarChar(sql.MAX), reason);
  request.input("actor", sql.BigInt, actorId);
  const result = await request.query(`
    UPDATE dbo.sign_steps
       SET state = @state, decision = @decision, reason = @reason,
           decided_by = @actor, decided_at = SYSUTCDATETIME(),
           -- A role-assigned step is first-to-act-wins: claim it for the person
           -- who actually decided, so the record names a human.
           assignee_user_id = COALESCE(assignee_user_id, @actor)
     WHERE id = @step_id AND state = N'PENDING';
  `);
  if ((result.rowsAffected[0] ?? 0) === 0) {
    throw new ApiError(409, "step_not_pending", "This step is no longer waiting for a decision.");
  }
}

async function setRequestState(transaction: TransactionType, requestId: number, state: string): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("request_id", sql.BigInt, requestId);
  request.input("state", sql.NVarChar(30), state);
  await request.query("UPDATE dbo.sign_requests SET state = @state WHERE id = @request_id;");
}

async function closeRequest(
  transaction: TransactionType,
  requestId: number,
  state: string,
  reason: string | null,
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("request_id", sql.BigInt, requestId);
  request.input("state", sql.NVarChar(30), state);
  request.input("reason", sql.NVarChar(sql.MAX), reason);
  await request.query(`
    UPDATE dbo.sign_requests SET state = @state, closed_at = SYSUTCDATETIME(), close_reason = @reason
     WHERE id = @request_id;
  `);
}

async function frozenSource(transaction: TransactionType, config: AppConfig, fileId: number) {
  const query=new sql.Request(transaction);query.input("file",sql.BigInt,fileId);
  const file=(await query.query<{storage_key:string;content_type:string;sha256:string}>("SELECT storage_key,content_type,sha256 FROM dbo.document_files WHERE id=@file;")).recordset[0];
  if(!file) throw new ApiError(404,"file_not_found","Frozen revision not found.");
  const bytes=await readFile(resolveStoragePath(config.documentStorage,file.storage_key));
  return {...file,bytes};
}

async function placedArtwork(transaction: TransactionType, config: AppConfig, requestId: number): Promise<PdfMark[]> {
  const query=new sql.Request(transaction);query.input("request",sql.BigInt,requestId);
  const rows=(await query.query<{page_no:number|null;pos_x:number;pos_y:number;width:number;height:number;image_key:string;label:string}>(`
    SELECT m.page_no,m.pos_x,m.pos_y,m.width,m.height,
      COALESCE(CASE WHEN m.kind=N'INITIAL' THEN sp.initials_image_key END,sp.image_key,stamp.image_key) image_key,
      CONCAT(s.block_code,N' / ',m.kind,N' / ',u.name,N' / ',CONVERT(nvarchar(30),s.decided_at,126)) label
    FROM dbo.signature_marks m JOIN dbo.sign_steps s ON s.id=m.sign_step_id
    JOIN dbo.users u ON u.id=s.decided_by
    LEFT JOIN dbo.signature_specimens sp ON sp.id=m.specimen_id
    LEFT JOIN dbo.company_stamps stamp ON stamp.id=m.company_stamp_id
    WHERE s.request_id=@request AND s.state=N'SIGNED' AND m.kind IN(N'SIGNATURE',N'INITIAL',N'STAMP') ORDER BY s.step_no,m.id;
  `)).recordset;
  return Promise.all(rows.map(async row=>({label:row.label,png:await readFile(resolveStoragePath(config.documentStorage,row.image_key)),placement:row.page_no===null?null:{page:Number(row.page_no),x:Number(row.pos_x),y:Number(row.pos_y),width:Number(row.width),height:Number(row.height)}})));
}

async function produceOutput(
  transaction: TransactionType,
  database: Database,
  config: AppConfig,
  requestId: number,
  document: SignableDocumentContext,
  actor: CurrentUser,
): Promise<string> {
  const chain = await verifyChain(database, requestId, transaction);

  const headerRequest = new sql.Request(transaction);
  headerRequest.input("request_id", sql.BigInt, requestId);
  const header = (await headerRequest.query<Record<string, unknown>>(`
    SELECT f.id AS file_id,f.content_type,f.revision_label, f.file_name, f.sha256, owner.name AS owner_name,
           CASE WHEN p.id IS NULL THEN NULL ELSE p.project_no + N' · ' + p.name END AS project_label
    FROM dbo.sign_requests rq
    INNER JOIN dbo.document_files f ON f.id = rq.document_file_id
    INNER JOIN dbo.signable_documents d ON d.id = rq.document_id
    INNER JOIN dbo.users owner ON owner.id = d.owner_id
    LEFT JOIN dbo.projects p ON p.id = d.project_id
    WHERE rq.id = @request_id;
  `)).recordset[0]!;

  const signatureRequest = new sql.Request(transaction);
  signatureRequest.input("request_id", sql.BigInt, requestId);
  const signatures: CertificateSignature[] = (await signatureRequest.query<Record<string, unknown>>(`
    SELECT s.step_no, s.block_code, s.required_mark, u.name AS signer_name, r.code AS signer_role,
           delegated.name AS delegated_from, stamp.code AS stamp_code,
           (SELECT TOP (1) e.auth_evidence FROM dbo.sign_events e
             WHERE e.sign_step_id = s.id AND e.auth_evidence IS NOT NULL ORDER BY e.seq DESC) AS auth_evidence,
           s.decided_at
    FROM dbo.sign_steps s
    LEFT JOIN dbo.users u ON u.id = s.decided_by
    LEFT JOIN dbo.roles r ON r.id = u.role_id
    LEFT JOIN dbo.users delegated ON delegated.id = s.delegated_from_id
    LEFT JOIN dbo.company_stamps stamp ON stamp.id = s.company_stamp_id
    WHERE s.request_id = @request_id AND s.state = N'SIGNED'
    ORDER BY s.step_no;
  `)).recordset.map((row) => ({
    stepNo: Number(row.step_no),
    blockCode: String(row.block_code),
    requiredMark: String(row.required_mark),
    signerName: text(row.signer_name) ?? "—",
    signerRole: text(row.signer_role),
    delegatedFromName: text(row.delegated_from),
    stampCode: text(row.stamp_code),
    authEvidence: text(row.auth_evidence),
    decidedAt: row.decided_at === null ? null : new Date(row.decided_at as string),
  }));

  const verifyCode = newVerifyCode();
  // Render only specimens referenced by completed marks, never a user's current specimen.
  // The resulting immutable certificate is authorized by document scope; raw specimen routes remain private.
  const marksQuery = new sql.Request(transaction); marksQuery.input("request_id", sql.BigInt, requestId);
  const artwork = (await marksQuery.query<{step_no:number;signature_key:string|null;stamp_key:string|null}>(`
    SELECT s.step_no,
      COALESCE(CASE WHEN m.kind=N'INITIAL' THEN sp.initials_image_key END,sp.image_key) signature_key,
      stamp.image_key stamp_key
    FROM dbo.sign_steps s JOIN dbo.signature_marks m ON m.sign_step_id=s.id
    LEFT JOIN dbo.signature_specimens sp ON sp.id=m.specimen_id
    LEFT JOIN dbo.company_stamps stamp ON stamp.id=m.company_stamp_id
    WHERE s.request_id=@request_id AND s.state=N'SIGNED' AND m.kind IN (N'INITIAL',N'SIGNATURE',N'STAMP');
  `)).recordset;
  for (const art of artwork) {
    const signature = signatures.find(s => s.stepNo === Number(art.step_no));
    if (!signature) continue;
    if (art.signature_key) signature.signaturePngBase64 = (await readFile(resolveStoragePath(config.documentStorage, art.signature_key))).toString("base64");
    if (art.stamp_key) signature.stampPngBase64 = (await readFile(resolveStoragePath(config.documentStorage, art.stamp_key))).toString("base64");
  }
  const legalEntity = process.env.SIGNING_LEGAL_ENTITY?.trim() || "TOMAS TECH Co., Ltd.";
  const verifyBaseUrl = (process.env.SIGNING_VERIFY_BASE_URL?.trim() || `${config.corsOrigins[0] ?? ""}/verify`).replace(/\/+$/, "");
  let bytes = buildSignatureCertificate({
    documentNo: document.documentNo,
    revisionLabel: String(header.revision_label),
    documentClass: document.documentClass,
    documentLocale: document.documentLocale,
    title: document.title,
    projectLabel: text(header.project_label),
    ownerName: String(header.owner_name),
    legalEntity,
    sourceFileName: String(header.file_name),
    sourceSha256: String(header.sha256),
    chainHead: chain.head,
    eventCount: chain.count,
    verifyCode,
    // The frontend reads the code from the query string, so the printed link
    // and QR resolve to a real page rather than a path nobody serves.
    verifyUrl: `${verifyBaseUrl}?code=${verifyCode}`,
    completedAt: new Date(),
    signatures,
  });

  const positioned=await placedArtwork(transaction,config,requestId);
  const usePdf=positioned.some(mark=>mark.placement!==null);
  if(usePdf) {
    const source=await frozenSource(transaction,config,Number(header.file_id));
    const pdf=await loadSigningPdf(source.bytes,source.content_type,source.sha256);
    await paintMarks(pdf,positioned);
    await appendPdfCertificate(pdf,positioned,{number:document.documentNo,revision:String(header.revision_label),verifyCode,hash:source.sha256,chain:chain.head});
    bytes=Buffer.from(await pdf.save());
  }
  const key = storageKey("signing/outputs", usePdf ? ".pdf" : ".html");
  const write = await writeStoredBuffer(config.documentStorage, key, bytes);

  const insert = new sql.Request(transaction);
  insert.input("request_id", sql.BigInt, requestId);
  insert.input("storage_key", sql.NVarChar(1000), key);
  insert.input("file_name", sql.NVarChar(500), `${document.documentNo}-${String(header.revision_label)}-${usePdf?"signed.pdf":"signature-certificate.html"}`);
  insert.input("content_type", sql.NVarChar(200), usePdf ? "application/pdf" : "text/html; charset=utf-8");
  insert.input("size_bytes", sql.BigInt, write.sizeBytes);
  insert.input("sha256", sql.Char(64), write.sha256);
  insert.input("verify_code", sql.NVarChar(24), verifyCode);
  insert.input("actor", sql.BigInt, actor.id);
  await insert.query(`
    INSERT INTO dbo.signed_documents (
      request_id, storage_key, file_name, content_type, size_bytes, sha256, verify_code, page_count, produced_by)
    VALUES (@request_id, @storage_key, @file_name, @content_type, @size_bytes, @sha256, @verify_code, NULL, @actor);
  `);
  return key;
}

export function registerSigningRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  // -------------------------------------------------------------------------
  // Inbox — every signable class in one list. This reads sign_steps and nothing
  // else: it does not know what a drawing is, which is the proof the service is
  // horizontal rather than eight module features.
  // -------------------------------------------------------------------------
  app.get("/api/v1/signing/inbox", async (request) => {
    await users.demandPermission(request, "signing.read");
    const actor = await users.required(request);

    const waiting = (await database.query<Record<string, unknown>>(`
      DECLARE @today date = CONVERT(date, SYSUTCDATETIME());
      SELECT s.id AS step_id, s.step_no, total.step_count, s.block_code, s.required_mark,
             stamp.code AS stamp_code, s.due_date, s.row_version,
             rq.id AS request_id, rq.created_at, rq.due_date AS request_due,
             d.id AS document_id, d.doc_no, d.doc_class, d.title, d.amount,
             p.project_no, p.name AS project_name, f.revision_label,
             rq.initiator_id, initiator.name AS initiator_name,
             CASE WHEN s.assignee_user_id IS NULL THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS assigned_by_role,
             CASE WHEN s.company_stamp_id IS NULL THEN CAST(1 AS bit) WHEN EXISTS (
                 SELECT 1 FROM dbo.stamp_authorities a
                 LEFT JOIN dbo.roles ar ON ar.id = a.role_id
                 WHERE a.company_stamp_id = s.company_stamp_id AND a.revoked_at IS NULL
                   AND a.valid_from <= @today AND (a.valid_to IS NULL OR a.valid_to >= @today)
                   AND (a.doc_class IS NULL OR a.doc_class = d.doc_class)
                   AND (a.user_id = @actor OR ar.code = @role)
             ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS holds_authority,
             (SELECT MIN(a.valid_to) FROM dbo.stamp_authorities a
               LEFT JOIN dbo.roles ar ON ar.id = a.role_id
              WHERE a.company_stamp_id = s.company_stamp_id AND a.revoked_at IS NULL
                AND (a.doc_class IS NULL OR a.doc_class = d.doc_class)
                AND (a.user_id = @actor OR ar.code = @role)) AS authority_valid_to
      FROM dbo.sign_steps s
      INNER JOIN dbo.sign_requests rq ON rq.id = s.request_id
      INNER JOIN dbo.signable_documents d ON d.id = rq.document_id
      INNER JOIN dbo.document_files f ON f.id = rq.document_file_id
      INNER JOIN dbo.users initiator ON initiator.id = rq.initiator_id
      LEFT JOIN dbo.projects p ON p.id = d.project_id
      LEFT JOIN dbo.company_stamps stamp ON stamp.id = s.company_stamp_id
      CROSS APPLY (SELECT COUNT(*) AS step_count FROM dbo.sign_steps a2 WHERE a2.request_id = rq.id) total
      WHERE s.state = N'PENDING' AND rq.state IN (N'PENDING_SIGN', N'PARTIALLY_SIGNED')
        AND s.required_mark <> N'PAPER'
        AND (s.assignee_user_id = @actor
             OR (s.assignee_user_id IS NULL AND s.assignee_role_id = (SELECT id FROM dbo.roles WHERE code = @role)))
      ORDER BY CASE WHEN s.due_date IS NULL THEN 1 ELSE 0 END, s.due_date, rq.created_at;
    `, (bind) => {
      bind.input("actor", sql.BigInt, actor.id);
      bind.input("role", sql.NVarChar(50), actor.role);
    })).recordset.map((row) => ({
      stepId: Number(row.step_id),
      stepNo: Number(row.step_no),
      totalSteps: Number(row.step_count),
      blockCode: String(row.block_code),
      requiredMark: String(row.required_mark),
      stampCode: text(row.stamp_code),
      holdsStampAuthority: Boolean(row.holds_authority),
      stampAuthorityValidTo: row.authority_valid_to ?? null,
      requestId: Number(row.request_id),
      documentId: Number(row.document_id),
      documentNo: String(row.doc_no),
      documentClass: String(row.doc_class),
      title: String(row.title),
      projectNumber: text(row.project_no),
      projectName: text(row.project_name),
      amount: number(row.amount),
      revisionLabel: String(row.revision_label),
      initiatorId: Number(row.initiator_id),
      initiatorName: String(row.initiator_name),
      requestedAt: row.created_at,
      dueDate: row.due_date ?? row.request_due ?? null,
      assignedByRole: Boolean(row.assigned_by_role),
      rowVersion: (row.row_version as Buffer).toString("base64"),
    }));

    const returnedToMe = await listDocuments(database, actor, {
      extra: `AND d.owner_id = @actor AND d.signing_state IN (N'DRAFT', N'REJECTED')
              AND EXISTS (SELECT 1 FROM dbo.sign_requests r2 WHERE r2.document_id = d.id)`,
      pageSize: 100,
    });
    const initiatedByMe = await listDocuments(database, actor, {
      extra: `AND d.signing_state IN (N'PENDING_SIGN', N'PARTIALLY_SIGNED')
              AND EXISTS (SELECT 1 FROM dbo.sign_requests r2 WHERE r2.document_id = d.id AND r2.initiator_id = @actor)`,
      pageSize: 100,
    });

    const signedRecently = (await database.query<{ signed: number }>(`
      SELECT COUNT_BIG(*) AS signed FROM dbo.sign_steps
      WHERE decided_by = @actor AND state = N'SIGNED' AND decided_at >= DATEADD(day, -30, SYSUTCDATETIME());
    `, (bind) => bind.input("actor", sql.BigInt, actor.id))).recordset[0]!;

    return {
      waitingMe: waiting,
      returnedToMe: returnedToMe.items,
      initiatedByMe: initiatedByMe.items,
      signedLast30Days: Number(signedRecently.signed),
      hasSpecimen: (await activeSpecimenId(database, actor.id)) !== null,
    };
  });

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------
  app.get("/api/v1/signing/documents", async (request) => {
    await users.demandPermission(request, "signing.read");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const state = firstQueryValue(query.state);
    const docClass = firstQueryValue(query.docClass);
    if (docClass) demandDocumentClass(docClass);
    return listDocuments(database, actor, {
      state: state ?? null,
      docClass: docClass ?? null,
      search: firstQueryValue(query.search) ?? null,
      page: clampedInteger(query.page, 1, 1, 10_000),
      pageSize: clampedInteger(query.pageSize, 50, 1, 200),
      withTotal: true,
    });
  });

  app.post("/api/v1/signing/documents", async (request, reply) => {
    await users.demandPermission(request, "signing.request");
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const documentClass = demandDocumentClass(body.documentClass);
    const documentLocale = demandLocale(body.documentLocale);
    const title = optionalBodyText(body.title, 500, "Title");
    const revisionLabel = normalizeRevisionLabel(body.revisionLabel);
    const projectDocumentId = requiredInteger(body.projectDocumentId, "Project document id", 1);
    const taskId = documentClass === "DRAWING" ? requiredInteger(body.taskId, "Design task id", 1) : null;
    const amount = body.amount === null || body.amount === undefined ? null : Number(body.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      throw new ApiError(400, "invalid_amount", "The amount cannot be negative.");
    }

    const created = await database.transaction(async (transaction) => {
      const source = await loadProjectDocument(database, projectDocumentId, transaction);
      const { demandProjectScope } = await import("../project-scope.js");
      await demandProjectScope(database, actor, source.projectId, transaction);
      if (taskId !== null) await demandDrawingTask(transaction, source.projectId, taskId, actor.id);

      const documentNo = await issueDocumentNumber(transaction, numberPrefix(documentClass), new Date().toISOString().slice(0, 10));
      const insert = new sql.Request(transaction);
      insert.input("doc_no", sql.NVarChar(40), documentNo);
      insert.input("doc_class", sql.NVarChar(30), documentClass);
      insert.input("title", sql.NVarChar(500), title ?? source.fileName);
      insert.input("project_id", sql.BigInt, source.projectId);
      insert.input("estimate_id", sql.BigInt, body.estimateId === undefined ? null : body.estimateId);
      insert.input("locale", sql.Char(2), documentLocale);
      insert.input("amount", sql.Decimal(18, 2), amount);
      insert.input("owner", sql.BigInt, taskId !== null ? actor.id : body.ownerId ? Number(body.ownerId) : actor.id);
      insert.input("task", sql.BigInt, taskId);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number }>(`
        INSERT INTO dbo.signable_documents (
          doc_no, doc_class, title, project_id, estimate_id, document_locale, amount, owner_id, signing_state, created_by, schedule_task_id)
        OUTPUT inserted.id
        VALUES (@doc_no, @doc_class, @title, @project_id, @estimate_id, @locale, @amount, @owner, N'DRAFT', @actor, @task);
      `)).recordset[0]!;
      const documentId = Number(row.id);
      const fileId = await freezeRevision(transaction, documentId, revisionLabel, source, actor.id);
      await setDocumentState(transaction, documentId, "DRAFT", fileId);
      await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, documentId, documentNo, "Created", null,
        { documentClass, revisionLabel, sha256: source.sha256, projectId: source.projectId, taskId });
      return { id: documentId, documentNo, revisionLabel, fileId };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);

    return reply.status(201).header("Location", `/api/v1/signing/documents/${created.id}`).send(created);
  });

  app.get("/api/v1/signing/documents/:documentId", async (request) => {
    await users.demandPermission(request, "signing.read");
    const actor = await users.required(request);
    const documentId = positiveLong((request.params as { documentId?: string }).documentId, "Document id");
    const document = await loadSignableDocument(database, documentId);
    await demandDocumentScope(database, document, actor);

    const summary = (await listDocuments(database, actor, { extra: "AND d.id = @document_id", documentId, pageSize: 1 })).items[0];
    if (!summary) throw new ApiError(404, "document_not_found", "The signable document was not found.");

    const revisions = (await database.query<Record<string, unknown>>(`
      SELECT f.id, f.revision_label, f.source, f.project_doc_id, pd.project_id, f.file_name, f.content_type,
             f.size_bytes, f.sha256, f.page_count, f.rendered_from_entity, f.rendered_from_id,
             f.frozen_at, u.name AS frozen_by_name, rq.id AS request_id, rq.state AS request_state
      FROM dbo.document_files f
      INNER JOIN dbo.users u ON u.id = f.frozen_by
      LEFT JOIN dbo.project_docs pd ON pd.id = f.project_doc_id
      OUTER APPLY (SELECT TOP (1) r.id, r.state FROM dbo.sign_requests r WHERE r.document_file_id = f.id ORDER BY r.id DESC) rq
      WHERE f.document_id = @document_id ORDER BY f.id DESC;
    `, (bind) => bind.input("document_id", sql.BigInt, documentId))).recordset.map((row) => ({
      id: Number(row.id),
      revisionLabel: String(row.revision_label),
      source: String(row.source),
      projectDocumentId: number(row.project_doc_id),
      projectId: number(row.project_id),
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes),
      sha256: String(row.sha256),
      pageCount: number(row.page_count),
      renderedFromEntity: text(row.rendered_from_entity),
      renderedFromId: number(row.rendered_from_id),
      frozenAt: row.frozen_at,
      frozenByName: String(row.frozen_by_name),
      requestId: number(row.request_id),
      requestState: text(row.request_state),
    }));

    const requests = await listRequests(database, documentId);
    const live = requests.find((item) => item.state === "PENDING_SIGN" || item.state === "PARTIALLY_SIGNED") ?? null;
    const latest = live ?? requests[0] ?? null;
    const latestId = latest ? Number(latest.id) : null;
    const events = latestId === null ? [] : await listEvents(database, latestId);
    const chain = latestId === null
      ? { verified: false, head: "", count: 0 }
      : await verifyChain(database, latestId);
    const output = latestId === null ? null : await loadOutput(database, latestId);

    return {
      document: summary,
      revisions,
      liveRequest: live,
      closedRequests: requests.filter((item) => item.state !== "PENDING_SIGN" && item.state !== "PARTIALLY_SIGNED"),
      events,
      output,
      chainVerified: chain.verified,
    };
  });

  /**
   * Freeze a new revision. This is the rule that stops a signature surviving the
   * file it was placed on: the live request is superseded, every unsigned step is
   * voided, and signed steps stay attached to the old file only. Marks are never
   * carried forward.
   */
  app.post("/api/v1/signing/documents/:documentId/revisions", async (request) => {
    await users.demandPermission(request, "signing.request");
    const actor = await users.required(request);
    const documentId = positiveLong((request.params as { documentId?: string }).documentId, "Document id");
    const body = bodyObject(request.body);
    const revisionLabel = normalizeRevisionLabel(body.revisionLabel);
    const expected = parseRowVersion(body.rowVersion);
    const projectDocumentId = requiredInteger(body.projectDocumentId, "Project document id", 1);

    return database.transaction(async (transaction) => {
      const document = await loadSignableDocument(database, documentId, transaction, true);
      await demandDocumentScope(database, document, actor, transaction);
      demandOwnerOrElevated(document, actor);
      demandRowVersion(document.rowVersion, expected);

      const source = await loadProjectDocument(database, projectDocumentId, transaction);
      if (document.documentClass === "DRAWING") {
        if (actor.id !== document.ownerId) throw new ApiError(403, "drawing_member_required", "Only the drawing Member may upload its revision.");
        await demandDrawingTask(transaction, document.projectId!, document.scheduleTaskId!, actor.id);
      }
      if (document.projectId !== null && source.projectId !== document.projectId) {
        throw new ApiError(400, "project_mismatch", "The replacement file belongs to a different project.");
      }

      const superseded = await liveRequestId(transaction, documentId);
      if (superseded !== null) {
        const voidSteps = new sql.Request(transaction);
        voidSteps.input("request_id", sql.BigInt, superseded);
        await voidSteps.query(`
          UPDATE dbo.sign_steps SET state = N'VOIDED'
           WHERE request_id = @request_id AND state IN (N'WAITING', N'PENDING');
        `);
        await closeRequest(transaction, superseded, "SUPERSEDED", `Superseded by revision ${revisionLabel}`);
        await appendSignEvent(transaction, {
          requestId: superseded,
          actorId: actor.id,
          action: "REQUEST_SUPERSEDED",
          payload: {
            new_revision: revisionLabel,
            new_sha256: source.sha256,
            rule: "unsigned steps voided; signed marks stay on the superseded file",
          },
        });
      }

      const fileId = await freezeRevision(transaction, documentId, revisionLabel, source, actor.id);
      await setDocumentState(transaction, documentId, "DRAFT", fileId);
      await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, documentId, document.documentNo, "Revision frozen", null,
        { revisionLabel, sha256: source.sha256, supersededRequestId: superseded });
      return { documentId, fileId, revisionLabel, supersededRequestId: superseded };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.post("/api/v1/signing/documents/:documentId/request", async (request) => {
    await users.demandPermission(request, "signing.request");
    const actor = await users.required(request);
    const documentId = positiveLong((request.params as { documentId?: string }).documentId, "Document id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);

    return database.transaction(async (transaction) => {
      const document = await loadSignableDocument(database, documentId, transaction, true);
      await demandDocumentScope(database, document, actor, transaction);
      demandOwnerOrElevated(document, actor);
      demandRowVersion(document.rowVersion, expected);
      if (document.currentFileId === null) {
        throw new ApiError(409, "no_frozen_file", "Freeze a document revision before requesting signatures.");
      }
      if (document.signingState !== "DRAFT" && document.signingState !== "REJECTED") {
        throw new ApiError(409, "request_already_open", `This document is ${document.signingState}; a new request cannot be opened.`);
      }
      if ((await liveRequestId(transaction, documentId)) !== null) {
        throw new ApiError(409, "request_already_open", "A signature request is already running on this document.");
      }

      const template = await loadActiveTemplate(transaction, document.documentClass);
      const drawing = document.documentClass === "DRAWING";
      if (drawing) {
        if (actor.id !== document.ownerId) throw new ApiError(403, "drawing_member_required", "Only the drawing Member may submit this drawing.");
        if (!document.scheduleTaskId || !document.projectId) throw new ApiError(409, "drawing_task_required", "Import this drawing from an assigned project task first.");
        await demandDrawingTask(transaction, document.projectId, document.scheduleTaskId, actor.id);
      }
      const drawingPeople = drawing ? await loadDrawingApprovers(transaction, document.projectId!, document.ownerId) : null;
      const drawingStampId = drawing && body.companyStampId != null ? requiredInteger(body.companyStampId, "Company stamp id", 1) : null;
      if (drawingStampId) {
        const approver = { ...actor, id: drawingPeople!.APPROVED_BY };
        // Resolve using the actual manager's role, not the submitting member's role.
        const roleQuery = new sql.Request(transaction); roleQuery.input("id", sql.BigInt, approver.id);
        approver.role = (await roleQuery.query<{code: string}>(`SELECT r.code FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@id;`)).recordset[0]!.code;
        if (!await resolveStampAuthority(transaction, drawingStampId, "DRAWING", approver)) throw new ApiError(409, "drawing_stamp_authority_missing", "The project Manager does not hold authority for this stamp.");
      }
      const steps = template.steps.filter((step) => appliesToAmount(step, document.amount)).sort((a, b) => a.stepNo - b.stepNo);
      if (steps.length === 0) throw new ApiError(409, "no_applicable_steps", "No step of the active flow applies to this document.");

      const insertRequest = new sql.Request(transaction);
      insertRequest.input("document_id", sql.BigInt, documentId);
      insertRequest.input("file_id", sql.BigInt, document.currentFileId);
      insertRequest.input("template_id", sql.BigInt, template.id);
      insertRequest.input("template_version", sql.Int, template.version);
      insertRequest.input("actor", sql.BigInt, actor.id);
      insertRequest.input("due_date", sql.Date, body.dueDate ? String(body.dueDate).slice(0, 10) : null);
      const requestId = Number((await insertRequest.query<{ id: number }>(`
        DECLARE @created TABLE (id bigint NOT NULL);
        INSERT INTO dbo.sign_requests (document_id, document_file_id, template_id, template_version, initiator_id, due_date, state)
        OUTPUT inserted.id INTO @created(id)
        VALUES (@document_id, @file_id, @template_id, @template_version, @actor, @due_date, N'PENDING_SIGN');
        SELECT id FROM @created;
      `)).recordset[0]!.id);

      let stepNo = 0;
      for (const step of steps) {
        stepNo += 1;
        const assigneeUserId = drawingPeople ? drawingPeople[step.blockCode as keyof typeof drawingPeople] ?? null : step.assigneeKind === "OWNER"
          ? document.ownerId
          : step.assigneeKind === "NAMED"
            ? step.assigneeUserId
            : step.assigneeKind === "PROJECT_MANAGER"
              ? document.projectManagerId
              : null;
        if (step.assigneeKind === "PROJECT_MANAGER" && assigneeUserId === null) {
          throw new ApiError(409, "project_manager_unknown",
            "This flow assigns a step to the project manager, but the document is not attached to a project.");
        }
        // A step assigned to a named person with no specimen would be
        // unsignable. Fail here with their name rather than parking the
        // document in a state nobody can move.
        if (assigneeUserId !== null && step.requiredMark !== "PAPER"
          && (await activeSpecimenId(database, assigneeUserId, transaction)) === null) {
          throw new ApiError(409, "specimen_required", "A signer on this flow has not created their signature yet.",
            { stepNo, blockCode: step.blockCode, userId: assigneeUserId });
        }

        const insertStep = new sql.Request(transaction);
        insertStep.input("request_id", sql.BigInt, requestId);
        insertStep.input("step_no", sql.Int, stepNo);
        insertStep.input("block_code", sql.NVarChar(30), step.blockCode);
        insertStep.input("required_mark", sql.NVarChar(20), drawingStampId && step.blockCode === "APPROVED_BY" ? "SIGNATURE_STAMP" : step.requiredMark);
        insertStep.input("stamp_id", sql.BigInt, drawingStampId && step.blockCode === "APPROVED_BY" ? drawingStampId : step.companyStampId);
        insertStep.input("assignee_user_id", sql.BigInt, assigneeUserId);
        insertStep.input("assignee_role_id", sql.BigInt, !drawingPeople && step.assigneeKind === "ROLE" ? step.assigneeRoleId : null);
        insertStep.input("is_optional", sql.Bit, step.isOptional);
        insertStep.input("parallel_group", sql.Int, step.parallelGroup);
        insertStep.input("anchor_code", sql.NVarChar(50), step.anchorCode);
        insertStep.input("due_date", sql.Date, step.dueDays === null
          ? null
          : new Date(Date.now() + step.dueDays * 86_400_000).toISOString().slice(0, 10));
        await insertStep.query(`
          INSERT INTO dbo.sign_steps (
            request_id, step_no, block_code, required_mark, company_stamp_id,
            assignee_user_id, assignee_role_id, is_optional, parallel_group, anchor_code, due_date, state)
          VALUES (
            @request_id, @step_no, @block_code, @required_mark, @stamp_id,
            @assignee_user_id, @assignee_role_id, @is_optional, @parallel_group, @anchor_code, @due_date, N'WAITING');
        `);
      }

      await activateSteps(transaction, requestId, template.ordered);
      await setDocumentState(transaction, documentId, "PENDING_SIGN");

      const fileRequest = new sql.Request(transaction);
      fileRequest.input("file_id", sql.BigInt, document.currentFileId);
      const frozen = (await fileRequest.query<Record<string, unknown>>(`
        SELECT revision_label, source, sha256, size_bytes FROM dbo.document_files WHERE id = @file_id;
      `)).recordset[0]!;
      // Event 1 is the frozen file, so the chain starts from the bytes the first
      // signer will see rather than from the request record.
      await appendSignEvent(transaction, {
        requestId,
        actorId: actor.id,
        action: "FILE_FROZEN",
        payload: {
          revision: String(frozen.revision_label),
          sha256: String(frozen.sha256),
          size_bytes: String(Number(frozen.size_bytes)),
          source: String(frozen.source),
        },
      });
      await appendSignEvent(transaction, {
        requestId,
        actorId: actor.id,
        action: "REQUEST_OPENED",
        payload: {
          template_id: String(template.id),
          template_version: String(template.version),
          steps: String(stepNo),
        },
      });
      await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, documentId, document.documentNo, "Signature requested", null,
        { requestId, templateVersion: template.version, steps: stepNo });
      return { requestId, steps: stepNo, templateVersion: template.version };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  // -------------------------------------------------------------------------
  // Step decisions
  // -------------------------------------------------------------------------
  app.get("/api/v1/signing/documents/:documentId/preview", {config:{rateLimit:DOCUMENT_DOWNLOAD_RATE_LIMIT}}, async(request,reply)=>{
    await users.demandPermission(request,"signing.read");const actor=await users.required(request);
    const id=positiveLong((request.params as {documentId:string}).documentId,"Document id");
    const query=request.query as {fileId?:string;stepId?:string};
    const fileId=positiveLong(query.fileId,"Revision id");
    const stepId=query.stepId?positiveLong(query.stepId,"Step id"):null;
    const result=await database.transaction(async transaction=>{
      const document=await loadSignableDocument(database,id,transaction);
      await demandDocumentScope(database,document,actor,transaction);
      const check=new sql.Request(transaction);check.input("file",sql.BigInt,fileId);check.input("document",sql.BigInt,id);
      const file=(await check.query<{request_id:number|null}>(`SELECT (SELECT TOP(1) id FROM dbo.sign_requests WHERE document_file_id=f.id ORDER BY id DESC) request_id FROM dbo.document_files f WHERE f.id=@file AND f.document_id=@document;`)).recordset[0];
      if(!file) throw new ApiError(404,"file_not_found","Revision not found in this document.");
      const source=await frozenSource(transaction,config,fileId);
      const pdf=await loadSigningPdf(source.bytes,source.content_type,source.sha256);
      const marks=file.request_id?await placedArtwork(transaction,config,Number(file.request_id)):[];
      await paintMarks(pdf,marks);
      let specimen: {id:number;imageBase64:string}|null=null;let stampImageBase64:string|null=null;
      if(stepId) {
        await users.demandPermission(request,"signing.sign");
        const step=await loadStep(transaction,stepId);demandStepIsMine(step,actor);
        if(step.documentId!==id || step.fileSha256.toLowerCase()!==source.sha256.toLowerCase() || step.requestId!==Number(file.request_id)) throw new ApiError(409,"revision_changed","Reload the current signing revision.");
        const specimenId=await activeSpecimenId(database,actor.id,transaction);
        if(specimenId!==null) {
          const imageQuery=new sql.Request(transaction);imageQuery.input("id",sql.BigInt,specimenId);imageQuery.input("initial",sql.Bit,step.requiredMark==="INITIAL");
          const image=(await imageQuery.query<{image_key:string}>("SELECT COALESCE(CASE WHEN @initial=1 THEN initials_image_key END,image_key) image_key FROM dbo.signature_specimens WHERE id=@id;")).recordset[0]!;
          specimen={id:specimenId,imageBase64:(await readFile(resolveStoragePath(config.documentStorage,image.image_key))).toString("base64")};
        }
        if(step.companyStampId && step.requiredMark==="SIGNATURE_STAMP") {
          const authority=await resolveStampAuthority(transaction,step.companyStampId,document.documentClass,actor);
          if(authority===null) throw new ApiError(403,"stamp_authority_missing","You cannot preview/apply this stamp without current authority.");
          const stampQuery=new sql.Request(transaction);stampQuery.input("id",sql.BigInt,step.companyStampId);
          const stamp=(await stampQuery.query<{image_key:string}>("SELECT image_key FROM dbo.company_stamps WHERE id=@id;")).recordset[0]!;
          stampImageBase64=(await readFile(resolveStoragePath(config.documentStorage,stamp.image_key))).toString("base64");
        }
      }
      return {pdfBase64:Buffer.from(await pdf.save()).toString("base64"),sourceSha256:source.sha256,pageCount:pdf.getPageCount(),specimen,stampImageBase64,legacyMarkCount:marks.filter(m=>!m.placement).length};
    },sql.ISOLATION_LEVEL.READ_COMMITTED);
    return reply.header("Cache-Control","no-store").send(result);
  });

  app.post("/api/v1/signing/steps/:stepId/sign", async (request) => {
    await users.demandPermission(request, "signing.sign");
    const actor = await users.required(request);
    // Evaluated before anything is written: a stale credential must fail the
    // request, not leave a half-signed step behind.
    const assurance = evaluateSigningAssurance(request);
    const stepId = positiveLong((request.params as { stepId?: string }).stepId, "Step id");
    const body = bodyObject(request.body);
    const expected = parseRowVersion(body.rowVersion);
    const note = optionalBodyText(body.note, 4_000, "Note");
    const placement=parsePlacement(body.placement);
    const stampPlacement=parsePlacement(body.stampPlacement);
    const ip = clientIp(request);
    const userAgent = clientUserAgent(request);

    let writtenKey: string | null = null;
    try {
      const result = await database.transaction(async (transaction) => {
        const step = await loadStep(transaction, stepId);
        const document = await loadSignableDocument(database, step.documentId, transaction, true);
        await demandDocumentScope(database, document, actor, transaction);
        demandRowVersion(step.rowVersion, expected);
        demandStepIsMine(step, actor);
        if (step.requiredMark === "PAPER") {
          throw new ApiError(409, "paper_step", "This block is signed on paper. Attach the scanned copy instead.");
        }
        const specimenId = await activeSpecimenId(database, actor.id, transaction);
        if (specimenId === null) {
          throw new ApiError(409, "specimen_required", "Create your signature in Preferences before signing.");
        }

        if(placement || stampPlacement) {
          if(!placement || body.sourceSha256!==step.fileSha256 || Number(body.previewSpecimenId)!==specimenId) throw new ApiError(409,"preview_changed","Reload the preview: the frozen file or your signature has changed.");
          const fileQuery=new sql.Request(transaction);fileQuery.input("request",sql.BigInt,step.requestId);
          const fileId=Number((await fileQuery.query<{document_file_id:number}>("SELECT document_file_id FROM dbo.sign_requests WHERE id=@request;")).recordset[0]!.document_file_id);
          const source=await frozenSource(transaction,config,fileId);
          const pdf=await loadSigningPdf(source.bytes,source.content_type,source.sha256);
          validatePage(pdf,placement);if(stampPlacement) validatePage(pdf,stampPlacement);
          if(step.requiredMark==="SIGNATURE_STAMP" && !stampPlacement) throw new ApiError(400,"stamp_placement_required","Place the company stamp as well as your signature.");
          if(step.requiredMark!=="SIGNATURE_STAMP" && stampPlacement) throw new ApiError(400,"unexpected_stamp","This step does not permit a company stamp.");
        }

        let stampAuthorityId: number | null = null;
        if (step.requiredMark === "SIGNATURE_STAMP") {
          if (step.companyStampId === null) {
            throw new ApiError(500, "stamp_missing", "This block requires a company stamp but names none.");
          }
          stampAuthorityId = await resolveStampAuthority(transaction, step.companyStampId, document.documentClass, actor);
          if (stampAuthorityId === null) {
            throw new ApiError(403, "stamp_authority_missing",
              "You do not hold a live authority to apply this company stamp to this document class.");
          }
        }

        await insertMark(transaction, {
          stepId,
          kind: step.requiredMark === "INITIAL" ? "INITIAL" : "SIGNATURE",
          specimenId,
          anchorCode: step.anchorCode,
          placement,
        });
        await insertMark(transaction, {
          stepId,
          kind: "DATE",
          anchorCode: step.anchorCode,
          textValue: new Date().toISOString().slice(0, 10),
        });
        if (stampAuthorityId !== null) {
          await insertMark(transaction, {
            stepId,
            kind: "STAMP",
            companyStampId: step.companyStampId,
            stampAuthorityId,
            anchorCode: "stamp:MAIN",
            placement:stampPlacement,
          });
        }

        await closeStep(transaction, stepId, "SIGNED", "SIGNED", note, actor.id);
        await activateSteps(transaction, step.requestId, step.templateOrdered);
        await appendSignEvent(transaction, {
          requestId: step.requestId,
          stepId,
          actorId: actor.id,
          action: "STEP_SIGNED",
          payload: {
            block: step.blockCode,
            required_mark: step.requiredMark,
            specimen_id: String(specimenId),
            file_sha256: step.fileSha256,
            placement:placement?JSON.stringify(placement):null,
            stamp_placement:stampPlacement?JSON.stringify(stampPlacement):null,
            note,
          },
          ip,
          userAgent,
          assurance,
        });
        if (stampAuthorityId !== null) {
          await appendSignEvent(transaction, {
            requestId: step.requestId,
            stepId,
            actorId: actor.id,
            action: "STAMP_APPLIED",
            payload: {
              stamp_id: String(step.companyStampId),
              authority_id: String(stampAuthorityId),
              applied_by: actor.name,
            },
            ip,
            userAgent,
            assurance,
          });
        }

        const complete = (await mandatoryStepsRemaining(transaction, step.requestId)) === 0;
        if (complete) {
          await closeRequest(transaction, step.requestId, "SIGNED", null);
          await setDocumentState(transaction, step.documentId, "SIGNED");
          writtenKey = await produceOutput(transaction, database, config, step.requestId, document, actor);
          await appendSignEvent(transaction, {
            requestId: step.requestId,
            actorId: actor.id,
            action: "REQUEST_COMPLETED",
            payload: { output_storage_key_set: "true" },
            ip,
            assurance,
          });
        } else {
          await setRequestState(transaction, step.requestId, "PARTIALLY_SIGNED");
          await setDocumentState(transaction, step.documentId, "PARTIALLY_SIGNED");
        }

        await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, step.documentId, document.documentNo, "Signed", null,
          { stepId, blockCode: step.blockCode, requiredMark: step.requiredMark, stampAuthorityId, evidence: assurance.evidence, complete });
        return { stepId, state: "SIGNED", requestComplete: complete };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return result;
    } catch (error) {
      if (writtenKey) {
        if (error instanceof DatabaseCommitOutcomeUnknownError) {
          request.log.fatal({ err: error.originalError, storageKey: writtenKey },
            "Signature certificate commit outcome unknown; preserving storage file");
        } else {
          await deleteStoredFile(config.documentStorage, writtenKey);
        }
      }
      throw error;
    }
  });

  /**
   * Return goes to the document owner, not to the previous signer: the owner is
   * the person who can actually fix the file. It closes this round — the owner
   * then uploads a new revision or opens a fresh request on the same frozen file
   * — and signed steps stay as history against the file they were placed on.
   */
  app.post("/api/v1/signing/steps/:stepId/return", (request) =>
    decideStep(request, "signing.sign", "RETURNED", "VOIDED", "VOIDED", "DRAFT", "STEP_RETURNED", true));

  app.post("/api/v1/signing/steps/:stepId/reject", (request) =>
    decideStep(request, "signing.reject", "REJECTED", "REJECTED", "REJECTED", "REJECTED", "STEP_REJECTED", false));

  async function decideStep(
    request: FastifyRequest,
    permission: string,
    decision: string,
    stepState: string,
    requestState: string,
    documentState: string,
    action: string,
    requireAssignee: boolean,
  ): Promise<unknown> {
    await users.demandPermission(request, permission);
    const actor = await users.required(request);
    const stepId = positiveLong((request.params as { stepId?: string }).stepId, "Step id");
    const body = bodyObject(request.body);
    const reason = requireReason(body.reason, "reason_required");
    const expected = parseRowVersion(body.rowVersion);
    const ip = clientIp(request);
    const userAgent = clientUserAgent(request);

    return database.transaction(async (transaction) => {
      const step = await loadStep(transaction, stepId);
      const document = await loadSignableDocument(database, step.documentId, transaction, true);
      await demandDocumentScope(database, document, actor, transaction);
      demandRowVersion(step.rowVersion, expected);
      if (requireAssignee) demandStepIsMine(step, actor);
      else if (step.stepState !== "PENDING") {
        throw new ApiError(409, "step_not_pending", `This step is ${step.stepState} and cannot be decided.`);
      }

      await closeStep(transaction, stepId, stepState, decision, reason, actor.id);
      const voidOthers = new sql.Request(transaction);
      voidOthers.input("request_id", sql.BigInt, step.requestId);
      voidOthers.input("step_id", sql.BigInt, stepId);
      await voidOthers.query(`
        UPDATE dbo.sign_steps SET state = N'VOIDED'
         WHERE request_id = @request_id AND id <> @step_id AND state IN (N'WAITING', N'PENDING');
      `);
      await closeRequest(transaction, step.requestId, requestState, reason);
      await setDocumentState(transaction, step.documentId, documentState);
      await appendSignEvent(transaction, {
        requestId: step.requestId,
        stepId,
        actorId: actor.id,
        action,
        payload: {
          block: step.blockCode,
          reason,
          returned_to: decision === "RETURNED" ? String(document.ownerId) : null,
        },
        ip,
        userAgent,
      });
      await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, step.documentId, document.documentNo, decision, null,
        { stepId, blockCode: step.blockCode, reason });
      return { stepId, state: stepState, documentState };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  }

  /**
   * Delegation reassigns the step; it never signs on someone's behalf. The
   * delegate's own name and specimen appear on the paper, and the principal is
   * recorded as delegated_from so the certificate can say who asked.
   */
  app.post("/api/v1/signing/steps/:stepId/delegate", async (request) => {
    await users.demandPermission(request, "signing.sign");
    const actor = await users.required(request);
    const stepId = positiveLong((request.params as { stepId?: string }).stepId, "Step id");
    const body = bodyObject(request.body);
    const toUserId = requiredInteger(body.toUserId, "Delegate id", 1);
    const reason = requireReason(body.reason, "reason_required");
    const expected = parseRowVersion(body.rowVersion);
    if (toUserId === actor.id) throw new ApiError(400, "delegate_self", "You cannot delegate a step to yourself.");

    return database.transaction(async (transaction) => {
      const step = await loadStep(transaction, stepId);
      const document = await loadSignableDocument(database, step.documentId, transaction);
      await demandDocumentScope(database, document, actor, transaction);
      demandRowVersion(step.rowVersion, expected);
      demandStepIsMine(step, actor);

      const check = new sql.Request(transaction);
      check.input("user_id", sql.BigInt, toUserId);
      const candidate = (await check.query<Record<string, unknown>>(`
        SELECT u.name,
               CASE WHEN EXISTS (SELECT 1 FROM dbo.role_permissions rp
                    INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                    WHERE rp.role_id = u.role_id AND p.code = N'signing.sign')
                    THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS can_sign,
               CASE WHEN EXISTS (SELECT 1 FROM dbo.signature_specimens s
                    WHERE s.user_id = u.id AND s.active_to IS NULL)
                    THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS has_specimen
        FROM dbo.users u WHERE u.id = @user_id AND u.deleted_at IS NULL AND u.is_active = 1;
      `)).recordset[0];
      if (!candidate) throw new ApiError(404, "delegate_not_found", "The delegate is not an active user.");
      if (!candidate.can_sign) throw new ApiError(409, "delegate_cannot_sign", `${String(candidate.name)} does not hold the signing permission.`);
      if (!candidate.has_specimen) throw new ApiError(409, "delegate_specimen_required", `${String(candidate.name)} has not created a signature yet.`);

      const update = new sql.Request(transaction);
      update.input("step_id", sql.BigInt, stepId);
      update.input("to_user", sql.BigInt, toUserId);
      update.input("actor", sql.BigInt, actor.id);
      const updated = await update.query(`
        UPDATE dbo.sign_steps SET assignee_user_id = @to_user, delegated_from_id = @actor
         WHERE id = @step_id AND state = N'PENDING';
      `);
      if ((updated.rowsAffected[0] ?? 0) === 0) {
        throw new ApiError(409, "step_not_pending", "This step is no longer waiting for a decision.");
      }

      await appendSignEvent(transaction, {
        requestId: step.requestId,
        stepId,
        actorId: actor.id,
        action: "STEP_DELEGATED",
        payload: { block: step.blockCode, to_user_id: String(toUserId), reason },
        ip: clientIp(request),
        userAgent: clientUserAgent(request),
      });
      await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, step.documentId, document.documentNo, "Delegated", null,
        { stepId, blockCode: step.blockCode, toUserId, reason });
      return { stepId, assigneeUserId: toUserId };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  /**
   * A customer block in v1. The internal signer prints, the customer signs on
   * paper, someone scans it back and attaches it here. The document then reaches
   * SIGNED honestly instead of parking in PARTIALLY_SIGNED forever, and the
   * certificate says "signed on paper" rather than claiming an electronic
   * signature nobody made.
   */
  app.post("/api/v1/signing/steps/:stepId/paper", async (request) => {
    await users.demandPermission(request, "signing.sign");
    const actor = await users.required(request);
    const stepId = positiveLong((request.params as { stepId?: string }).stepId, "Step id");
    const body = bodyObject(request.body);
    const scanId = requiredInteger(body.scanProjectDocumentId, "Scan document id", 1);
    const expected = parseRowVersion(body.rowVersion);
    const note = optionalBodyText(body.note, 4_000, "Note");
    const ip = clientIp(request);

    let writtenKey: string | null = null;
    try {
      return await database.transaction(async (transaction) => {
        const step = await loadStep(transaction, stepId);
        const document = await loadSignableDocument(database, step.documentId, transaction, true);
        await demandDocumentScope(database, document, actor, transaction);
        demandRowVersion(step.rowVersion, expected);
        if (step.requiredMark !== "PAPER") {
          throw new ApiError(409, "not_a_paper_step", "This block is signed in the system, not on paper.");
        }
        if (step.stepState !== "PENDING") {
          throw new ApiError(409, "step_not_pending", `This step is ${step.stepState} and cannot be closed.`);
        }
        const scan = await loadProjectDocument(database, scanId, transaction);
        if (document.projectId !== null && scan.projectId !== document.projectId) {
          throw new ApiError(400, "project_mismatch", "The scan belongs to a different project.");
        }

        await insertMark(transaction, { stepId, kind: "PAPER", anchorCode: step.anchorCode, scanProjectDocumentId: scan.id });
        await closeStep(transaction, stepId, "SIGNED", "SIGNED", note, actor.id);
        await activateSteps(transaction, step.requestId, step.templateOrdered);
        await appendSignEvent(transaction, {
          requestId: step.requestId,
          stepId,
          actorId: actor.id,
          action: "PAPER_ATTACHED",
          payload: {
            block: step.blockCode,
            scan_document_id: String(scan.id),
            scan_sha256: scan.sha256,
            uploaded_by: actor.name,
            note,
          },
          ip,
          userAgent: clientUserAgent(request),
        });

        const complete = (await mandatoryStepsRemaining(transaction, step.requestId)) === 0;
        if (complete) {
          await closeRequest(transaction, step.requestId, "SIGNED", null);
          await setDocumentState(transaction, step.documentId, "SIGNED");
          writtenKey = await produceOutput(transaction, database, config, step.requestId, document, actor);
          await appendSignEvent(transaction, {
            requestId: step.requestId,
            actorId: actor.id,
            action: "REQUEST_COMPLETED",
            payload: { output_storage_key_set: "true" },
            ip,
          });
        }
        await insertAudit(transaction, actor.id, DOCUMENT_ENTITY, step.documentId, document.documentNo,
          "Paper signature attached", null, { stepId, blockCode: step.blockCode, scanDocumentId: scan.id, complete });
        return { stepId, state: "SIGNED", requestComplete: complete };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    } catch (error) {
      if (writtenKey) {
        if (error instanceof DatabaseCommitOutcomeUnknownError) {
          request.log.fatal({ err: error.originalError, storageKey: writtenKey },
            "Signature certificate commit outcome unknown; preserving storage file");
        } else {
          await deleteStoredFile(config.documentStorage, writtenKey);
        }
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // Output and verification
  // -------------------------------------------------------------------------
  app.get(
    "/api/v1/signing/requests/:requestId/output",
    { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
      await users.demandPermission(request, "signing.read");
      const actor = await users.required(request);
      const requestId = positiveLong((request.params as { requestId?: string }).requestId, "Request id");
      const row = (await database.query<Record<string, unknown>>(`
        SELECT o.storage_key, o.file_name, o.content_type, o.size_bytes, o.sha256, rq.document_id
        FROM dbo.signed_documents o
        INNER JOIN dbo.sign_requests rq ON rq.id = o.request_id
        WHERE o.request_id = @request_id;
      `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset[0];
      if (!row) throw new ApiError(404, "output_not_found", "This signature request has not produced a signed output.");

      const document = await loadSignableDocument(database, Number(row.document_id));
      await demandDocumentScope(database, document, actor);
      return sendStoredFile(request, reply, config.documentStorage, {
        storageKey: String(row.storage_key),
        fileName: String(row.file_name),
        contentType: String(row.content_type),
        sizeBytes: Number(row.size_bytes),
        sha256: String(row.sha256),
      }, { inline: true });
    });

  app.get("/api/v1/signing/verify/:code", async (request) => {
    // v1 is internal-only, matching the platform's identity assumption
    // (RDL-008). Whether /verify should be reachable from outside the network at
    // all is RDL-036 — a QR nobody can open is decoration.
    await users.demandPermission(request, "signing.read");
    const code = (request.params as { code?: string }).code;
    if (!isVerifyCodeShape(code)) {
      throw new ApiError(400, "invalid_verify_code", "A verification code looks like TC-XXXX-XXXX-XXXX.");
    }
    const row = (await database.query<Record<string, unknown>>(`
      SELECT rq.id AS request_id, d.doc_no, f.revision_label, d.doc_class, d.title, p.name AS project_name,
             f.sha256 AS source_sha, o.sha256 AS output_sha, rq.closed_at
      FROM dbo.signed_documents o
      INNER JOIN dbo.sign_requests rq ON rq.id = o.request_id
      INNER JOIN dbo.signable_documents d ON d.id = rq.document_id
      INNER JOIN dbo.document_files f ON f.id = rq.document_file_id
      LEFT JOIN dbo.projects p ON p.id = d.project_id
      WHERE o.verify_code = @code;
    `, (bind) => bind.input("code", sql.NVarChar(24), code))).recordset[0];
    if (!row) throw new ApiError(404, "verify_code_not_found", "No signed document carries that verification code.");

    const requestId = Number(row.request_id);
    const chain = await verifyChain(database, requestId);
    const blocks = (await database.query<Record<string, unknown>>(`
      SELECT s.block_code, u.name AS signer_name, r.code AS signer_role, s.required_mark,
             stamp.code AS stamp_code, s.decided_at,
             (SELECT TOP (1) e.auth_evidence FROM dbo.sign_events e
               WHERE e.sign_step_id = s.id AND e.auth_evidence IS NOT NULL ORDER BY e.seq DESC) AS auth_evidence
      FROM dbo.sign_steps s
      LEFT JOIN dbo.users u ON u.id = s.decided_by
      LEFT JOIN dbo.roles r ON r.id = u.role_id
      LEFT JOIN dbo.company_stamps stamp ON stamp.id = s.company_stamp_id
      WHERE s.request_id = @request_id AND s.state = N'SIGNED' ORDER BY s.step_no;
    `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset.map((block) => ({
      blockCode: String(block.block_code),
      signerName: text(block.signer_name) ?? "—",
      signerRole: text(block.signer_role),
      requiredMark: String(block.required_mark),
      stampCode: text(block.stamp_code),
      authEvidence: text(block.auth_evidence),
      decidedAt: block.decided_at ?? null,
    }));

    return {
      valid: chain.verified,
      documentNo: String(row.doc_no),
      revisionLabel: String(row.revision_label),
      documentClass: String(row.doc_class),
      title: String(row.title),
      projectName: text(row.project_name),
      legalEntity: process.env.SIGNING_LEGAL_ENTITY?.trim() || "TOMAS TECH Co., Ltd.",
      completedAt: row.closed_at ?? null,
      sourceSha256: String(row.source_sha),
      outputSha256: String(row.output_sha),
      chainHead: chain.head,
      chainVerified: chain.verified,
      blocks,
      statement: "A statement of what IoT Team Center recorded. Identity comes from the company Microsoft sign-in, "
        + "not from a certification authority, and this is not a certificate issued by one.",
    };
  });
}

// ---------------------------------------------------------------------------
// Shared read models
// ---------------------------------------------------------------------------

async function listDocuments(
  database: Database,
  actor: CurrentUser,
  options: {
    state?: string | null;
    docClass?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
    extra?: string;
    documentId?: number;
    withTotal?: boolean;
  },
): Promise<{ items: Record<string, unknown>[]; page: number; pageSize: number; total: number }> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  const scope = `
    WHERE (@state IS NULL OR d.signing_state = @state)
      AND (@doc_class IS NULL OR d.doc_class = @doc_class)
      AND (@search IS NULL OR d.doc_no LIKE @search OR d.title LIKE @search)
      AND (@elevated = 1 OR d.owner_id = @actor
           OR EXISTS (SELECT 1 FROM dbo.projects p2 WHERE p2.id = d.project_id
                      AND (p2.manager_id = @actor OR p2.lead_engineer_id = @actor
                           OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p2.id AND m.user_id = @actor)))
           OR EXISTS (SELECT 1 FROM dbo.sign_requests r2
                      INNER JOIN dbo.sign_steps s2 ON s2.request_id = r2.id
                      WHERE r2.document_id = d.id
                        AND (r2.initiator_id = @actor OR s2.assignee_user_id = @actor OR s2.decided_by = @actor)))
      ${options.extra ?? ""}
  `;
  const bind = (request: InstanceType<typeof sql.Request>): void => {
    request.input("state", sql.NVarChar(30), options.state ?? null);
    request.input("doc_class", sql.NVarChar(30), options.docClass ?? null);
    request.input("search", sql.NVarChar(520), options.search ? `%${options.search.trim()}%` : null);
    request.input("actor", sql.BigInt, actor.id);
    request.input("elevated", sql.Bit, isProjectElevated(actor));
    request.input("document_id", sql.BigInt, options.documentId ?? null);
    request.input("offset", sql.Int, (page - 1) * pageSize);
    request.input("page_size", sql.Int, pageSize);
  };

  const rows = (await database.query<Record<string, unknown>>(`
    SELECT d.id, d.doc_no, d.doc_class, d.title, d.project_id, p.project_no, p.name AS project_name,
           d.estimate_id, e.estimate_no, d.document_locale, d.amount,
           d.owner_id, owner.name AS owner_name, d.signing_state, d.schedule_task_id,
           f.revision_label, f.sha256, live.id AS live_request_id,
           ISNULL(live.signed_steps, 0) AS signed_steps, ISNULL(live.total_steps, 0) AS total_steps,
           live.due_date, d.updated_at, d.row_version
    FROM dbo.signable_documents d
    INNER JOIN dbo.users owner ON owner.id = d.owner_id
    LEFT JOIN dbo.projects p ON p.id = d.project_id
    LEFT JOIN dbo.estimates e ON e.id = d.estimate_id
    LEFT JOIN dbo.document_files f ON f.id = d.current_file_id
    OUTER APPLY (
      SELECT TOP (1) rq.id, rq.due_date,
             (SELECT COUNT(*) FROM dbo.sign_steps s WHERE s.request_id = rq.id AND s.state = N'SIGNED') AS signed_steps,
             (SELECT COUNT(*) FROM dbo.sign_steps s WHERE s.request_id = rq.id AND s.state <> N'VOIDED') AS total_steps
      FROM dbo.sign_requests rq WHERE rq.document_id = d.id ORDER BY rq.id DESC
    ) live
    ${scope}
    ORDER BY d.updated_at DESC, d.id DESC
    OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
  `, bind)).recordset.map((row) => ({
    id: Number(row.id),
    documentNo: String(row.doc_no),
    documentClass: String(row.doc_class),
    title: String(row.title),
    projectId: number(row.project_id),
    projectNumber: text(row.project_no),
    projectName: text(row.project_name),
    estimateId: number(row.estimate_id),
    estimateNumber: text(row.estimate_no),
    documentLocale: String(row.document_locale),
    amount: number(row.amount),
    ownerId: Number(row.owner_id),
    scheduleTaskId: number(row.schedule_task_id),
    ownerName: String(row.owner_name),
    signingState: String(row.signing_state),
    currentRevisionLabel: text(row.revision_label),
    currentSha256: text(row.sha256),
    liveRequestId: number(row.live_request_id),
    signedStepCount: Number(row.signed_steps),
    totalStepCount: Number(row.total_steps),
    dueDate: row.due_date ?? null,
    updatedAt: row.updated_at,
    rowVersion: (row.row_version as Buffer).toString("base64"),
  }));

  let total = rows.length;
  if (options.withTotal) {
    const counted = (await database.query<{ total: number }>(
      `SELECT COUNT_BIG(*) AS total FROM dbo.signable_documents d ${scope};`, bind)).recordset[0]!;
    total = Number(counted.total);
  }
  return { items: rows, page, pageSize, total };
}

async function listRequests(database: Database, documentId: number): Promise<Record<string, unknown>[]> {
  const requests = (await database.query<Record<string, unknown>>(`
    SELECT rq.id, rq.document_file_id, f.revision_label, rq.template_id, rq.template_version,
           u.name AS initiator_name, rq.due_date, rq.state, rq.created_at, rq.closed_at, rq.close_reason, rq.row_version
    FROM dbo.sign_requests rq
    INNER JOIN dbo.document_files f ON f.id = rq.document_file_id
    INNER JOIN dbo.users u ON u.id = rq.initiator_id
    WHERE rq.document_id = @document_id ORDER BY rq.id DESC;
  `, (bind) => bind.input("document_id", sql.BigInt, documentId))).recordset;

  const details: Record<string, unknown>[] = [];
  for (const request of requests) {
    details.push({
      id: Number(request.id),
      documentFileId: Number(request.document_file_id),
      revisionLabel: String(request.revision_label),
      templateId: Number(request.template_id),
      templateVersion: Number(request.template_version),
      initiatorName: String(request.initiator_name),
      dueDate: request.due_date ?? null,
      state: String(request.state),
      createdAt: request.created_at,
      closedAt: request.closed_at ?? null,
      closeReason: text(request.close_reason),
      steps: await listSteps(database, Number(request.id)),
      rowVersion: (request.row_version as Buffer).toString("base64"),
    });
  }
  return details;
}

async function listSteps(database: Database, requestId: number): Promise<Record<string, unknown>[]> {
  const marks = new Map<number, Record<string, unknown>[]>();
  for (const mark of (await database.query<Record<string, unknown>>(`
    SELECT m.id, m.sign_step_id, m.kind, stamp.code AS stamp_code, m.stamp_authority_id, m.anchor_code,
           m.page_no, m.pos_x, m.pos_y, m.text_value, m.scan_project_doc_id, m.rendered_at
    FROM dbo.signature_marks m
    INNER JOIN dbo.sign_steps s ON s.id = m.sign_step_id
    LEFT JOIN dbo.company_stamps stamp ON stamp.id = m.company_stamp_id
    WHERE s.request_id = @request_id ORDER BY m.id;
  `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset) {
    const stepId = Number(mark.sign_step_id);
    const list = marks.get(stepId) ?? [];
    list.push({
      id: Number(mark.id),
      kind: String(mark.kind),
      stampCode: text(mark.stamp_code),
      stampAuthorityId: number(mark.stamp_authority_id),
      anchorCode: text(mark.anchor_code),
      pageNo: number(mark.page_no),
      posX: number(mark.pos_x),
      posY: number(mark.pos_y),
      textValue: text(mark.text_value),
      scanDocumentId: number(mark.scan_project_doc_id),
      renderedAt: mark.rendered_at,
    });
    marks.set(stepId, list);
  }

  return (await database.query<Record<string, unknown>>(`
    SELECT s.id, s.step_no, s.block_code, s.required_mark, stamp.code AS stamp_code,
           s.assignee_user_id, assignee.name AS assignee_name, role.code AS assignee_role,
           delegated.name AS delegated_from, s.is_optional, s.parallel_group, s.anchor_code, s.due_date,
           s.state, s.decision, s.reason, decided.name AS decided_by_name, s.decided_at, s.row_version
    FROM dbo.sign_steps s
    LEFT JOIN dbo.company_stamps stamp ON stamp.id = s.company_stamp_id
    LEFT JOIN dbo.users assignee ON assignee.id = s.assignee_user_id
    LEFT JOIN dbo.roles role ON role.id = s.assignee_role_id
    LEFT JOIN dbo.users delegated ON delegated.id = s.delegated_from_id
    LEFT JOIN dbo.users decided ON decided.id = s.decided_by
    WHERE s.request_id = @request_id ORDER BY s.step_no;
  `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset.map((row) => ({
    id: Number(row.id),
    stepNo: Number(row.step_no),
    blockCode: String(row.block_code),
    requiredMark: String(row.required_mark),
    stampCode: text(row.stamp_code),
    assigneeUserId: number(row.assignee_user_id),
    assigneeName: text(row.assignee_name),
    assigneeRole: text(row.assignee_role),
    delegatedFromName: text(row.delegated_from),
    isOptional: Boolean(row.is_optional),
    parallelGroup: number(row.parallel_group),
    anchorCode: String(row.anchor_code),
    dueDate: row.due_date ?? null,
    state: String(row.state),
    decision: text(row.decision),
    reason: text(row.reason),
    decidedByName: text(row.decided_by_name),
    decidedAt: row.decided_at ?? null,
    marks: marks.get(Number(row.id)) ?? [],
    rowVersion: (row.row_version as Buffer).toString("base64"),
  }));
}

async function listEvents(database: Database, requestId: number): Promise<Record<string, unknown>[]> {
  return (await database.query<Record<string, unknown>>(`
    SELECT e.seq, e.action, u.name AS actor_name, s.step_no, e.detail, e.ip,
           e.auth_evidence, e.auth_at, e.payload_hash, e.prev_hash, e.hash, e.occurred_at
    FROM dbo.sign_events e
    LEFT JOIN dbo.users u ON u.id = e.actor_id
    LEFT JOIN dbo.sign_steps s ON s.id = e.sign_step_id
    WHERE e.request_id = @request_id ORDER BY e.seq;
  `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset.map((row) => ({
    seq: Number(row.seq),
    action: String(row.action),
    actorName: text(row.actor_name),
    stepNo: number(row.step_no),
    detail: text(row.detail),
    ip: text(row.ip),
    authEvidence: text(row.auth_evidence),
    authAt: row.auth_at ?? null,
    payloadHash: String(row.payload_hash),
    prevHash: text(row.prev_hash),
    hash: String(row.hash),
    occurredAt: row.occurred_at,
  }));
}

async function loadOutput(database: Database, requestId: number): Promise<Record<string, unknown> | null> {
  const row = (await database.query<Record<string, unknown>>(`
    SELECT o.id, o.file_name, o.content_type, o.size_bytes, o.sha256, o.verify_code, o.page_count, o.produced_at
    FROM dbo.signed_documents o WHERE o.request_id = @request_id;
  `, (bind) => bind.input("request_id", sql.BigInt, requestId))).recordset[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    sha256: String(row.sha256),
    verifyCode: String(row.verify_code),
    pageCount: number(row.page_count),
    producedAt: row.produced_at,
  };
}
