import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import { crmAccess, crmDto, crmId, CRM_SCOPE, bindAccess, scopedOpportunity, type CrmRow } from "../crm.js";
import { ApiError } from "../errors.js";
import { positiveLong, requiredInteger } from "../http.js";
import { insertAudit } from "../audit.js";
import { contentTypeFor,deleteStoredFile,DOCUMENT_DOWNLOAD_RATE_LIMIT,DOCUMENT_UPLOAD_RATE_LIMIT,multipartText,readMultipartUpload,sendStoredFile,storageKey,uploadedFileName,validateFileExtension,writeStoredFile } from "../document-storage.js";

export function registerCrmDocumentRoutes(app: FastifyInstance,config: AppConfig,database: Database,users: CurrentUserService) {
  app.get("/api/v1/crm/inquiries/:id/source",async request=>{
    const actor=await crmAccess(database,users,request),id=positiveLong((request.params as {id:string}).id,"Inquiry");
    return (await database.query<CrmRow>(`SELECT o.id,o.opportunity_no,o.name,o.customer_id,s.name sales_owner_name,t.name technical_owner_name,i.customer_site_id,i.customer_contact_id FROM dbo.inquiries i JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id JOIN dbo.users s ON s.id=o.sales_owner_id LEFT JOIN dbo.users t ON t.id=o.technical_owner_id WHERE i.id=@id AND i.deleted_at IS NULL AND ${CRM_SCOPE}`,q=>bindAccess(q,actor).input("id",sql.BigInt,id))).recordset.map(r=>crmDto(r))[0]??null;
  });
  app.get("/api/v1/crm/documents",async request=>{
    const actor=await crmAccess(database,users,request),query=request.query as Record<string,string>;
    return (await database.query<CrmRow>(`SELECT d.id,d.customer_id,d.opportunity_id,d.activity_id,d.name,d.size_bytes,d.uploaded_at,u.name uploaded_by_name FROM dbo.crm_documents d JOIN dbo.users u ON u.id=d.uploaded_by LEFT JOIN dbo.crm_opportunities o ON o.id=d.opportunity_id WHERE (d.opportunity_id IS NULL OR ${CRM_SCOPE}) AND (@customer IS NULL OR d.customer_id=@customer) AND (@opportunity IS NULL OR d.opportunity_id=@opportunity) AND (@activity IS NULL OR d.activity_id=@activity) AND (@year IS NULL OR YEAR(d.uploaded_at)=@year) ORDER BY d.uploaded_at DESC`,q=>bindAccess(q,actor).input("customer",sql.BigInt,crmId(query.customerId,"Customer")).input("opportunity",sql.BigInt,crmId(query.opportunityId,"Opportunity")).input("activity",sql.BigInt,crmId(query.activityId,"Activity")).input("year",sql.Int,query.year?requiredInteger(Number(query.year),"Year",2000,2200):null))).recordset.map(r=>crmDto(r));
  });
  app.post("/api/v1/crm/documents",{config:{rateLimit:DOCUMENT_UPLOAD_RATE_LIMIT}},async(request,reply)=>{
    const actor=await crmAccess(database,users,request,"crm.activity.write");
    const upload=await readMultipartUpload(request,config.documentStorage.maxFileSizeBytes);
    const customer=positiveLong(multipartText(upload.values,"customerId",30,true),"Customer"),opportunity=crmId(multipartText(upload.values,"opportunityId",30,false),"Opportunity"),activity=crmId(multipartText(upload.values,"activityId",30,false),"Activity");
    // Authorize before writing bytes, then repeat under the transaction lock.
    const verify=async(tx: sql.Transaction)=>{
      if(opportunity){const o=await scopedOpportunity(bindAccess(new sql.Request(tx),actor),opportunity,true);if(Number(o.customer_id)!==customer)throw new ApiError(422,"invalid_reference","Customer mismatch.");}
      const q=new sql.Request(tx);q.input("customer",sql.BigInt,customer).input("activity",sql.BigInt,activity).input("opportunity",sql.BigInt,opportunity);
      if(!(await q.query(`SELECT id FROM dbo.customers WHERE id=@customer AND deleted_at IS NULL AND (@activity IS NULL OR EXISTS(SELECT 1 FROM dbo.crm_activities WHERE id=@activity AND customer_id=@customer AND (opportunity_id=@opportunity OR (opportunity_id IS NULL AND @opportunity IS NULL))))`)).recordset[0])throw new ApiError(422,"invalid_reference","Invalid document relationship.");
    };
    await database.transaction(verify);
    const name=uploadedFileName(upload.file.filename),key=storageKey(`crm/${customer}`,validateFileExtension(name)),contentType=contentTypeFor(name);
    const write=await writeStoredFile(config.documentStorage,key,upload.file.filepath);
    try {
      const result=await database.transaction(async tx=>{
        await verify(tx);const q=new sql.Request(tx);
        q.input("customer",sql.BigInt,customer).input("opportunity",sql.BigInt,opportunity).input("activity",sql.BigInt,activity).input("actor",sql.BigInt,actor.id).input("name",sql.NVarChar(500),name).input("key",sql.NVarChar(1000),key).input("type",sql.NVarChar(200),contentType).input("size",sql.BigInt,write.sizeBytes).input("sha",sql.Char(64),write.sha256);
        const row=(await q.query("INSERT dbo.crm_documents(customer_id,opportunity_id,activity_id,name,content_type,size_bytes,storage_key,sha256,uploaded_by) OUTPUT inserted.id,inserted.name VALUES(@customer,@opportunity,@activity,@name,@type,@size,@key,@sha,@actor)")).recordset[0]!;
        await insertAudit(tx,actor.id,opportunity?"CrmOpportunity":"Customer",opportunity??customer,"","DocumentAdded",null,{id:row.id,name,sha256:write.sha256});return crmDto(row);
      });return reply.code(201).send(result);
    }catch(error){if(!(error instanceof DatabaseCommitOutcomeUnknownError))await deleteStoredFile(config.documentStorage,key);throw error;}
  });
  app.get("/api/v1/crm/documents/:id/content",{config:{rateLimit:DOCUMENT_DOWNLOAD_RATE_LIMIT}},async(request,reply)=>{
    const actor=await crmAccess(database,users,request),id=positiveLong((request.params as {id:string}).id,"Document");
    const row=(await database.query<CrmRow>(`SELECT d.* FROM dbo.crm_documents d LEFT JOIN dbo.crm_opportunities o ON o.id=d.opportunity_id WHERE d.id=@id AND (d.opportunity_id IS NULL OR ${CRM_SCOPE})`,q=>bindAccess(q,actor).input("id",sql.BigInt,id))).recordset[0];
    if(!row)throw new ApiError(404,"crm_not_found","Document not found.");
    return sendStoredFile(request,reply,config.documentStorage,{storageKey:String(row.storage_key),fileName:String(row.name),contentType:String(row.content_type),sizeBytes:Number(row.size_bytes),sha256:String(row.sha256)});
  });
}
