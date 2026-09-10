import sql from "mssql/msnodesqlv8.js";
import type { Transaction } from "mssql";
import type { AppConfig } from "./config.js";
import { resolveStoragePath, storageKey, writeStoredBuffer, writeStoredFile } from "./document-storage.js";
import { ApiError } from "./errors.js";

/** Explicit document categories win over media type (a photographed drawing is still a drawing). */
export function handoverFolder(category: string, contentType: string): string {
  const name = category.trim().toLowerCase();
  if (["drawing", "layout"].includes(name)) return "02";
  if (["estimate", "estimate cost"].includes(name)) return "03";
  if (["quote", "quotation", "supplier quotation"].includes(name)) return "04";
  if (["po", "purchase order"].includes(name)) return "05";
  if (["customer rfq", "customer requirement", "specification", "customer standard", "equipment list"].includes(name)) return "06";
  if (["report", "meeting record", "email / meeting note", "measurement", "site visit report"].includes(name)) return "10";
  if (["manual", "manual and document"].includes(name)) return "11";
  if (["photo", "video"].includes(name) || /^(image|video)\//.test(contentType)) return "13";
  return "14";
}

type SourceFile = {
  id: number; source_type: string; source_no: string; name: string; category: string;
  content_type: string; size_bytes: number; storage_key: string; sha256: string | null;
  version: number; uploaded_by: number; uploaded_at: Date;
};

/** All metadata is committed with the project. The caller owns cleanup of newly written keys on rollback. */
export async function transferProjectDocuments(
  transaction: Transaction, storage: AppConfig["documentStorage"],
  projectId: number, inquiryId: number, estimateId: number, actorId: number, writtenKeys: string[],
): Promise<number> {
  const query = new sql.Request(transaction);
  query.input("inquiry", sql.BigInt, inquiryId);
  query.input("estimate", sql.BigInt, estimateId);
  // Resolve both the current Inquiry-first flow and legacy report-derived Inquiry links.
  const links = `
    DECLARE @intakes TABLE(id bigint PRIMARY KEY);
    DECLARE @visits TABLE(id bigint PRIMARY KEY);
    INSERT INTO @intakes SELECT i.id FROM dbo.sales_intakes i
    WHERE i.deleted_at IS NULL AND (i.related_inquiry_id=@inquiry OR EXISTS(
      SELECT 1 FROM dbo.site_visit_links l WHERE l.source_type=N'SalesIntake' AND l.source_id=i.id
      AND l.target_type=N'Inquiry' AND l.target_id=@inquiry));
    INSERT INTO @visits SELECT v.id FROM dbo.site_visits v
    WHERE v.deleted_at IS NULL AND (v.intake_id IN(SELECT id FROM @intakes) OR EXISTS(
      SELECT 1 FROM dbo.site_visit_links l WHERE l.target_type=N'Inquiry' AND l.target_id=@inquiry
      AND ((l.source_type=N'SiteVisit' AND l.source_id=v.id) OR (l.source_type=N'SiteVisitReport'
        AND l.source_id IN(SELECT id FROM dbo.site_visit_reports WHERE visit_id=v.id)))));
    INSERT INTO @intakes SELECT DISTINCT v.intake_id FROM dbo.site_visits v
      JOIN dbo.sales_intakes i ON i.id=v.intake_id AND i.deleted_at IS NULL
      WHERE v.id IN(SELECT id FROM @visits) AND v.intake_id NOT IN(SELECT id FROM @intakes);
  `;
  const blocked = (await query.query<{ name: string }>(`${links}
    SELECT TOP(1) name FROM (
      SELECT a.name FROM dbo.sales_intake_attachments a WHERE a.intake_id IN(SELECT id FROM @intakes)
        AND a.deleted_at IS NULL AND a.scan_status NOT IN(N'Clean',N'Skipped')
      UNION ALL SELECT a.name FROM dbo.site_visit_attachments a WHERE a.visit_id IN(SELECT id FROM @visits)
        AND a.deleted_at IS NULL AND a.scan_status NOT IN(N'Clean',N'Skipped')
    ) blocked;
  `)).recordset[0];
  if (blocked) throw new ApiError(409, "handover_document_not_ready", `Review the source attachment before creating the project: ${blocked.name}`);
  const sources = (await query.query<SourceFile>(`${links}
    SELECT a.id,N'Inquiry' source_type,i.inquiry_no source_no,a.name,a.category,a.content_type,
      a.size_bytes,a.storage_key,a.sha256,1 version,a.uploaded_by,a.uploaded_at
    FROM dbo.inquiry_attachments a JOIN dbo.inquiries i ON i.id=a.inquiry_id
    WHERE a.inquiry_id=@inquiry AND a.deleted_at IS NULL
    UNION ALL
    SELECT a.id,N'SalesIntake',i.intake_no,a.name,a.category,a.content_type,a.size_bytes,a.storage_key,
      a.sha256,a.version,a.uploaded_by,a.uploaded_at
    FROM dbo.sales_intake_attachments a JOIN dbo.sales_intakes i ON i.id=a.intake_id
    WHERE a.intake_id IN(SELECT id FROM @intakes) AND a.deleted_at IS NULL AND a.scan_status IN(N'Clean',N'Skipped')
    UNION ALL
    SELECT a.id,N'SiteVisit',v.visit_no,a.name,a.category,a.content_type,a.size_bytes,a.storage_key,
      a.sha256,a.version,a.uploaded_by,a.uploaded_at
    FROM dbo.site_visit_attachments a JOIN dbo.site_visits v ON v.id=a.visit_id
    WHERE a.visit_id IN(SELECT id FROM @visits) AND a.deleted_at IS NULL AND a.scan_status IN(N'Clean',N'Skipped')
    UNION ALL
    SELECT q.id,N'SupplierQuotation',q.quotation_no,q.file_name,N'Supplier quotation',q.content_type,
      q.size_bytes,q.storage_key,q.sha256,1,q.uploaded_by,q.uploaded_at
    FROM dbo.supplier_quotations q WHERE q.inquiry_id=@inquiry AND q.status=N'Active';
  `)).recordset;
  // Keep a synchronous handover bounded while it holds the source revision locks.
  if (sources.length > 200 || sources.reduce((total, file) => total + Number(file.size_bytes), 0) > 500 * 1024 * 1024) {
    throw new ApiError(422, "handover_too_large", "Automatic handover supports up to 200 source files and 500 MB per project. Reduce the source set before creating the project.");
  }

  let count = 0;
  async function record(name: string, category: string, contentType: string, folder: string, key: string,
    write: { sizeBytes: number; sha256: string }, remark: string, uploader = actorId, uploadedAt: Date | null = null) {
    const insert = new sql.Request(transaction);
    insert.input("project", sql.BigInt, projectId); insert.input("folder", sql.Char(2), folder);
    insert.input("name", sql.NVarChar(500), name); insert.input("type", sql.NVarChar(100), category);
    insert.input("mime", sql.NVarChar(200), contentType); insert.input("key", sql.NVarChar(1000), key);
    insert.input("size", sql.BigInt, write.sizeBytes); insert.input("hash", sql.NVarChar(500), write.sha256);
    insert.input("remark", sql.NVarChar(sql.MAX), remark); insert.input("actor", sql.BigInt, uploader);
    insert.input("at", sql.DateTimeOffset, uploadedAt);
    await insert.query(`INSERT INTO dbo.project_docs(project_id,folder_code,name,document_type,content_type,
      size_bytes,storage_key,provider_etag,uploaded_by,uploaded_at,remark)
      VALUES(@project,@folder,@name,@type,@mime,@size,@key,@hash,@actor,COALESCE(@at,SYSUTCDATETIME()),@remark);`);
    count++;
  }
  for (const source of sources) {
    const folder = handoverFolder(source.category, source.content_type);
    const extension = /\.[a-z0-9]+$/i.exec(source.name)?.[0] ?? ".bin";
    const key = storageKey(`projects/${projectId}/${folder}`, extension);
    const write = await writeStoredFile(storage, key, resolveStoragePath(storage, source.storage_key));
    writtenKeys.push(key);
    if (write.sizeBytes !== Number(source.size_bytes) || (source.sha256 && write.sha256 !== source.sha256.trim().toLowerCase())) {
      throw new ApiError(409, "document_integrity_failed", `Source document failed integrity verification: ${source.name}`);
    }
    await record(source.name, source.category, source.content_type, folder, key, write,
      `Source: ${source.source_type} ${source.source_no}; attachment ${source.id}; version ${source.version}; category ${source.category}. Copied when project was created.`,
      Number(source.uploaded_by), source.uploaded_at);
  }

  async function snapshot(name: string, folder: string, category: string, data: Record<string, unknown>, source: string) {
    const key = storageKey(`projects/${projectId}/${folder}`, ".txt");
    const contents = Buffer.from(`${source}\nSnapshot at project creation: ${new Date().toISOString()}\n\n${JSON.stringify(data, null, 2)}\n`, "utf8");
    const write = await writeStoredBuffer(storage, key, contents);
    writtenKeys.push(key);
    await record(name, category, "text/plain", folder, key, write, `Source: ${source}. Snapshot when project was created.`);
  }
  const inquiry = (await query.query<Record<string, unknown>>(`SELECT i.inquiry_no,c.name customer_name,i.contact,
    i.project_name,i.rfq_no,i.requirement,i.background,i.scope_summary,i.technical,i.standard,i.special,
    i.site_location,i.target_delivery,i.remark FROM dbo.inquiries i JOIN dbo.customers c ON c.id=i.customer_id
    WHERE i.id=@inquiry;`)).recordset[0]!;
  await snapshot(`${inquiry.inquiry_no}-requirements.txt`, "06", "Specification", inquiry, `Inquiry ${inquiry.inquiry_no}`);
  const estimate = (await query.query<Record<string, unknown>>(`SELECT e.estimate_no,e.revision,e.project_name,e.status,
    t.material_total,t.engineering_total,t.outsource_total,t.transportation_total,t.accommodation_total,
    t.other_total,t.contingency_total,t.total FROM dbo.estimates e
    JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id WHERE e.id=@estimate;`)).recordset[0]!;
  await snapshot(`${estimate.estimate_no}-R${estimate.revision}-summary.txt`, "03", "Estimate cost", estimate, `Estimate ${estimate.estimate_no} revision ${estimate.revision}`);
  const reports = (await query.query<Record<string, unknown>>(`${links}
    SELECT r.report_no,r.current_revision,r.status,v.visit_no,rv.visit_summary,rv.customer_requirement,
      rv.existing_condition,rv.findings_summary,rv.measurement_summary,rv.root_cause,rv.recommended_solution,
      rv.proposed_scope,rv.assumption,rv.exclusion,rv.risk,rv.safety_concern,rv.customer_additional_request,
      rv.engineer_conclusion,rv.sales_follow_up,rv.next_step,r.reviewed_at,r.review_comment,
      r.customer_acknowledged_by,r.customer_acknowledged_at
    FROM dbo.site_visit_reports r JOIN dbo.site_visits v ON v.id=r.visit_id
    JOIN dbo.site_visit_report_revisions rv ON rv.report_id=r.id AND rv.revision=r.current_revision AND rv.status=N'Approved'
    WHERE r.visit_id IN(SELECT id FROM @visits) AND r.status IN(N'Approved',N'Acknowledged');
  `)).recordset;
  for (const report of reports) {
    await snapshot(`${report.report_no}-R${report.current_revision}.txt`, "10", "Site visit report", report,
      `SiteVisitReport ${report.report_no} revision ${report.current_revision}; SiteVisit ${report.visit_no}`);
  }
  return count;
}
