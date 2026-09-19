import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseRowVersion, positiveLong, requiredText, requiredInteger } from "../http.js";
import { isProjectElevated } from "../project-scope.js";
import { reportElevated } from "../unified-report-service.js";
import { localizedNameInput } from "./sales-customers.js";
import { crmAccess, crmDto, crmId, crmText, CRM_SCOPE, bindAccess, type CrmRow } from "../crm.js";

export function registerCrmCustomerRoutes(app: FastifyInstance,database: Database,users: CurrentUserService) {
  app.get("/api/v1/crm/customers",async request=>{
    await crmAccess(database,users,request); const query=request.query as Record<string,string>;
    const page=query.page?requiredInteger(Number(query.page),"Page",1,100000):1,size=query.pageSize?requiredInteger(Number(query.pageSize),"Page size",1,100):10;
    const result=await database.query<CrmRow>(`SELECT c.*,u.name account_owner_name,COUNT(*) OVER() total_count FROM dbo.customers c LEFT JOIN dbo.users u ON u.id=c.account_owner_id WHERE c.deleted_at IS NULL AND (@search=N'' OR c.name LIKE @search OR c.code LIKE @search OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts co JOIN dbo.customer_sites s ON s.id=co.site_id WHERE s.customer_id=c.id AND co.name LIKE @search)) ORDER BY c.name,c.id OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,q=>q.input("search",sql.NVarChar(400),query.search?`%${crmText(query.search,300)}%`:"").input("offset",sql.Int,(page-1)*size).input("size",sql.Int,size));
    return {items:result.recordset.map(r=>crmDto(r)),total:Number(result.recordset[0]?.total_count??0),page,pageSize:size};
  });
  app.get("/api/v1/crm/customers/:id",async request=>{
    const actor=await crmAccess(database,users,request),id=positiveLong((request.params as {id:string}).id,"Customer"),query=request.query as Record<string,string>;
    return database.transaction(async tx=>{
      const user=await users.required(request);
      const q=bindAccess(new sql.Request(tx),actor); q.input("projectElevated",sql.Bit,isProjectElevated(user)).input("reportElevated",sql.Bit,reportElevated(user)).input("projectRead",sql.Bit,actor.permissions.includes("project.read")).input("inquiryRead",sql.Bit,actor.permissions.includes("inquiry.read")).input("id",sql.BigInt,id).input("year",sql.Int,query.year?requiredInteger(Number(query.year),"Year",2000,2200):null);
      const customer=(await q.query("SELECT c.*,u.name account_owner_name FROM dbo.customers c LEFT JOIN dbo.users u ON u.id=c.account_owner_id WHERE c.id=@id AND c.deleted_at IS NULL")).recordset[0];
      if(!customer)throw new ApiError(404,"crm_not_found","Customer not found.");
      const sites=(await q.query("SELECT * FROM dbo.customer_sites WHERE customer_id=@id AND deleted_at IS NULL ORDER BY CASE WHEN code='MAIN' THEN 0 ELSE 1 END,name")).recordset;
      const contacts=(await q.query("SELECT co.*,s.customer_id,s.name site_name FROM dbo.customer_site_contacts co JOIN dbo.customer_sites s ON s.id=co.site_id WHERE s.customer_id=@id AND co.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY co.is_primary DESC,co.name")).recordset;
      const inquiries=actor.permissions.includes("inquiry.read")?(await q.query(`SELECT i.id,i.inquiry_no,i.project_name,i.status,i.due_date,i.opportunity_id,i.customer_site_id FROM dbo.inquiries i LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE i.customer_id=@id AND i.deleted_at IS NULL AND (@year IS NULL OR YEAR(i.inquiry_date)=@year) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE}) ORDER BY i.inquiry_date DESC`)).recordset:[];
      const estimates=actor.permissions.includes("estimate.read")?(await q.query(`SELECT e.id,e.estimate_no,e.revision,e.status,e.due_date,totals.total FROM dbo.estimates e LEFT JOIN dbo.v_estimate_totals totals ON totals.estimate_id=e.id JOIN dbo.inquiries i ON i.id=e.inquiry_id LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE i.customer_id=@id AND e.deleted_at IS NULL AND (@year IS NULL OR YEAR(e.created_date)=@year) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE}) ORDER BY e.created_date DESC`)).recordset:[];
      const projects=actor.permissions.includes("project.read")?(await q.query(`SELECT p.id,p.project_no,p.name,p.status,p.progress,p.target_delivery,p.po_no,i.customer_site_id FROM dbo.projects p JOIN dbo.inquiries i ON i.id=p.inquiry_id LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE p.customer_id=@id AND p.deleted_at IS NULL AND (@projectElevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) AND (@year IS NULL OR YEAR(p.start_date)=@year) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE}) ORDER BY p.start_date DESC`)).recordset:[];
      const service=actor.permissions.includes("report.read")?(await q.query(`SELECT h.id,h.report_no,r.title,r.revision,r.state status,r.report_date,h.project_id,h.inquiry_id
        FROM dbo.unified_reports h JOIN dbo.unified_report_revisions r ON r.report_id=h.id AND r.revision=h.current_revision
        LEFT JOIN dbo.projects p ON p.id=h.project_id LEFT JOIN dbo.inquiries i ON i.id=h.inquiry_id
        WHERE h.report_type=N'SERVICE' AND (@year IS NULL OR YEAR(r.report_date)=@year) AND
        ((p.customer_id=@id AND p.deleted_at IS NULL AND @projectRead=1 AND (@reportElevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)))
        OR (i.customer_id=@id AND i.deleted_at IS NULL AND @inquiryRead=1 AND (@reportElevated=1 OR i.created_by=@actor OR i.estimate_owner_id=@actor OR r.prepared_by=@actor OR r.reviewer_id=@actor OR r.approver_id=@actor))) ORDER BY r.report_date DESC,h.id DESC`)).recordset:[];
      return {service:service.map(r=>crmDto(r)),customer:crmDto(customer),sites:sites.map(r=>crmDto(r)),contacts:contacts.map(r=>crmDto(r)),inquiries:inquiries.map(r=>crmDto(r)),estimates:estimates.map(r=>crmDto(r,actor.permissions.includes("crm.commercial.read"))),projects:projects.map(r=>crmDto(r))};
    });
  });
  app.put("/api/v1/crm/customers/:id",async request=>{
    const actor=await crmAccess(database,users,request,"crm.contact.write"),id=positiveLong((request.params as {id:string}).id,"Customer"),body=bodyObject(request.body);
    return database.transaction(async tx=>{
      const q=new sql.Request(tx); q.input("id",sql.BigInt,id).input("actor",sql.BigInt,actor.id);
      const before=(await q.query("SELECT * FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")).recordset[0];
      if(!before)throw new ApiError(404,"crm_not_found","Customer not found.");
      if(!(before.row_version as Buffer).equals(parseRowVersion(body.rowVersion)))throw new ApiError(409,"concurrency_conflict","Refresh before saving.");
      const owner=crmId(body.accountOwnerId,"Account owner");
      if(owner){q.input("owner",sql.BigInt,owner);if(!(await q.query("SELECT id FROM dbo.users WHERE id=@owner AND is_active=1 AND deleted_at IS NULL")).recordset[0])throw new ApiError(422,"invalid_reference","Select an active owner.");}else q.input("owner",sql.BigInt,null);
      const website=crmText(body.website,500);if(website&&!/^https?:\/\//i.test(website))throw new ApiError(400,"validation_failed","Website must use HTTP or HTTPS.");
      const names=localizedNameInput(body,"","name",300,"Customer name",true);
      q.input("th",sql.NVarChar(300),names.nameTh).input("en",sql.NVarChar(300),names.nameEn).input("ja",sql.NVarChar(300),names.nameJa);
      q.input("name",sql.NVarChar(300),names.name).input("short",sql.NVarChar(100),crmText(body.shortName,100)).input("industry",sql.NVarChar(200),crmText(body.industry,200)).input("country",sql.NVarChar(120),crmText(body.country,120)).input("website",sql.NVarChar(500),website).input("site",sql.NVarChar(300),crmText(body.site,300)).input("active",sql.Bit,body.isActive!==false);
      const row=(await q.query("UPDATE dbo.customers SET name=@name,name_th=@th,name_en=@en,name_ja=@ja,short_name=@short,industry=@industry,country=@country,website=@website,site=@site,account_owner_id=@owner,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE id=@id")).recordset[0]!;
      await insertAudit(tx,actor.id,"Customer",id,String(row.code),"Updated",crmDto(before),crmDto(row));return crmDto(row);
    });
  });
  app.get("/api/v1/crm/contacts",async request=>{
    await crmAccess(database,users,request);const query=request.query as Record<string,string>,page=query.page?requiredInteger(Number(query.page),"Page",1,100000):1,size=query.pageSize?requiredInteger(Number(query.pageSize),"Page size",1,100):10;
    const result=await database.query<CrmRow>(`SELECT co.*,s.name site_name,s.customer_id,c.name customer_name,COUNT(*) OVER() total_count FROM dbo.customer_site_contacts co JOIN dbo.customer_sites s ON s.id=co.site_id JOIN dbo.customers c ON c.id=s.customer_id WHERE co.deleted_at IS NULL AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND (@customer IS NULL OR c.id=@customer) AND (@search=N'' OR co.name LIKE @search OR co.email LIKE @search OR c.name LIKE @search) ORDER BY co.name,co.id OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,q=>q.input("customer",sql.BigInt,crmId(query.customerId,"Customer")).input("search",sql.NVarChar(400),query.search?`%${crmText(query.search,300)}%`:"").input("offset",sql.Int,(page-1)*size).input("size",sql.Int,size));
    return {items:result.recordset.map(r=>crmDto(r)),total:Number(result.recordset[0]?.total_count??0),page,pageSize:size};
  });
  app.put("/api/v1/crm/contacts/:id/metadata",async request=>{
    const actor=await crmAccess(database,users,request,"crm.contact.write"),id=positiveLong((request.params as {id:string}).id,"Contact"),body=bodyObject(request.body);
    return database.transaction(async tx=>{
      const q=new sql.Request(tx);q.input("id",sql.BigInt,id).input("actor",sql.BigInt,actor.id).input("role",sql.NVarChar(40),crmText(body.contactRole,40)||"Other");
      const before=(await q.query("SELECT * FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL")).recordset[0];
      if(!before)throw new ApiError(404,"crm_not_found","Contact not found.");
      if(!(before.row_version as Buffer).equals(parseRowVersion(body.rowVersion)))throw new ApiError(409,"concurrency_conflict","Refresh before saving.");
      if(!(await q.query("SELECT code FROM dbo.crm_options WHERE kind='contactRole' AND code=@role AND is_active=1")).recordset[0])throw new ApiError(422,"invalid_reference","Invalid contact role.");
      q.input("note",sql.NVarChar(4000),crmText(body.note)).input("message",sql.NVarChar(200),crmText(body.messagingAddress,200)).input("active",sql.Bit,body.isActive!==false);
      const row=(await q.query("UPDATE dbo.customer_site_contacts SET contact_role=@role,note=@note,messaging_address=@message,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE id=@id")).recordset[0]!;
      await insertAudit(tx,actor.id,"CustomerSiteContact",id,"",body.isActive===false?"Deactivated":"Updated",crmDto(before),crmDto(row));return crmDto(row);
    });
  });
  for (const method of ["post","put"] as const) app[method](`/api/v1/crm/customers/:id/sites${method==="put"?"/:siteId":""}`,async(request,reply)=>{
    const actor=await crmAccess(database,users,request,"crm.contact.write"),id=positiveLong((request.params as {id:string}).id,"Customer"),body=bodyObject(request.body);
    const result=await database.transaction(async tx=>{
      const q=new sql.Request(tx);q.input("id",sql.BigInt,id).input("actor",sql.BigInt,actor.id).input("code",sql.NVarChar(40),requiredText(body.code,40,"Site code")).input("name",sql.NVarChar(300),requiredText(body.name,300,"Site name")).input("address",sql.NVarChar(1000),crmText(body.address,1000)).input("province",sql.NVarChar(120),crmText(body.province,120)).input("country",sql.NVarChar(120),crmText(body.country,120)).input("note",sql.NVarChar(sql.MAX),crmText(body.accessNote));
      if(!(await q.query("SELECT id FROM dbo.customers WHERE id=@id AND is_active=1 AND deleted_at IS NULL")).recordset[0])throw new ApiError(422,"invalid_reference","Customer is unavailable.");
      let before=null;
      if(method==="put"){
        q.input("siteId",sql.BigInt,positiveLong((request.params as {siteId:string}).siteId,"Site"));
        before=(await q.query("SELECT * FROM dbo.customer_sites WITH(UPDLOCK,HOLDLOCK) WHERE id=@siteId AND customer_id=@id AND deleted_at IS NULL")).recordset[0];
        if(!before)throw new ApiError(404,"crm_not_found","Site not found.");
        if(!(before.row_version as Buffer).equals(parseRowVersion(body.rowVersion)))throw new ApiError(409,"concurrency_conflict","Refresh before saving.");
      }
      const row=(await q.query(method==="post"?"INSERT dbo.customer_sites(customer_id,code,name,address,province,country,access_note,created_by,updated_by) OUTPUT inserted.* VALUES(@id,@code,@name,@address,@province,@country,@note,@actor,@actor)":"UPDATE dbo.customer_sites SET name=@name,address=@address,province=@province,country=@country,access_note=@note,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE id=@siteId AND customer_id=@id")).recordset[0]!;
      await insertAudit(tx,actor.id,"CustomerSite",Number(row.id),String(row.code),method==="post"?"Created":"Updated",before?crmDto(before):null,crmDto(row));return crmDto(row);
    });return reply.code(method==="post"?201:200).send(result);
  });
}
