import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import type { AppConfig } from "../config.js";
import { isProjectElevated, demandProjectScope } from "../project-scope.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseRowVersion, positiveLong, requiredText, requiredInteger } from "../http.js";
import { CRM_SCOPE, CRM_READ_JOINS, CRM_NEEDS_FOLLOWUP, CRM_ACTIVITY_TYPES, crmAccess, bindAccess, scopedOpportunity, crmDto, opportunityInput, validateCrmReferences, followupInput, crmAttention, crmText, crmId, crmChoice, type CrmRow } from "../crm.js";

const inputFields = { name:sql.NVarChar(300), customerId:sql.BigInt, siteId:sql.BigInt, contactId:sql.BigInt, salesOwnerId:sql.BigInt, technicalOwnerId:sql.BigInt, source:sql.NVarChar(40), need:sql.NVarChar(sql.MAX), scope:sql.NVarChar(sql.MAX), expectedValue:sql.Decimal(19,4), expectedClose:sql.Date, stage:sql.NVarChar(40), probability:sql.Int, competitor:sql.NVarChar(300), priority:sql.NVarChar(20), lostReason:sql.NVarChar(40), lostDetail:sql.NVarChar(2000), internalNote:sql.NVarChar(sql.MAX) };
const column = (name: string) => name.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
function stale(row: CrmRow, version: unknown) {
  if (!(row.row_version as Buffer).equals(parseRowVersion(version))) throw new ApiError(409,"concurrency_conflict","This record changed. Refresh before saving.");
}
async function activeOwner(q: sql.Request, id: number) {
  q.input("owner",sql.BigInt,id);
  if (!(await q.query("SELECT id FROM dbo.users WHERE id=@owner AND is_active=1 AND deleted_at IS NULL")).recordset[0]) throw new ApiError(422,"invalid_reference","Select an active owner.");
}
async function addFollowup(tx: sql.Transaction, actor: number, opportunity: number, body: CrmRow, activity: number | null = null) {
  const input=followupInput(body); await activeOwner(new sql.Request(tx),input.ownerId);
  const q=new sql.Request(tx); q.input("opportunity",sql.BigInt,opportunity).input("activity",sql.BigInt,activity).input("actor",sql.BigInt,actor);
  q.input("action",sql.NVarChar(1000),input.action).input("owner",sql.BigInt,input.ownerId).input("due",sql.Date,input.dueDate).input("priority",sql.NVarChar(20),input.priority).input("status",sql.NVarChar(30),input.status);
  const row=(await q.query(`INSERT dbo.crm_followups(opportunity_id,activity_id,action,owner_id,due_date,priority,status,created_by,updated_by) OUTPUT inserted.* VALUES(@opportunity,@activity,@action,@owner,@due,@priority,@status,@actor,@actor)`)).recordset[0]!;
  await insertAudit(tx,actor,"CrmOpportunity",opportunity,"","NextActionAdded",null,crmDto(row));
  return crmDto(row);
}

export function registerCrmRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService) {
  const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:config.businessTimeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  app.get("/api/v1/crm/dashboard",async request=>{
    const actor=await crmAccess(database,users,request);
    return (await database.query<CrmRow>(`SELECT COUNT(*) [open],
      COALESCE(SUM(CASE WHEN ${CRM_NEEDS_FOLLOWUP} THEN 1 ELSE 0 END),0) NeedsFollowup,
      COALESCE(SUM(CASE WHEN f.due_date<@today THEN 1 ELSE 0 END),0) Overdue,
      COALESCE(SUM(CASE WHEN f.status='WaitingCustomer' THEN 1 ELSE 0 END),0) WaitingCustomer,
      COALESCE(SUM(CASE WHEN o.stage='REQUIREMENT' THEN 1 ELSE 0 END),0) REQUIREMENT,
      COALESCE(SUM(CASE WHEN o.stage='ESTIMATING' THEN 1 ELSE 0 END),0) ESTIMATING,
      COALESCE(SUM(CASE WHEN o.stage='PROPOSAL' THEN 1 ELSE 0 END),0) PROPOSAL,
      COALESCE(SUM(CASE WHEN o.stage='NEGOTIATION' THEN 1 ELSE 0 END),0) NEGOTIATION,
      COALESCE(SUM(CASE WHEN f.action IS NULL OR f.due_date<=@today OR ${CRM_NEEDS_FOLLOWUP} THEN 1 ELSE 0 END),0) actionable
      ${CRM_READ_JOINS} WHERE ${CRM_SCOPE} AND o.stage NOT IN('WON','LOST','ON_HOLD')`,q=>bindAccess(q,actor).input("today",sql.Date,today()))).recordset[0];
  });

  app.get("/api/v1/crm/options",async request=>{
    await crmAccess(database,users,request);
    return (await database.query<CrmRow>("SELECT * FROM dbo.crm_options ORDER BY kind,code")).recordset.map(r=>crmDto(r));
  });
  app.put("/api/v1/crm/options/:kind/:code",async request=>{
    const actor=await crmAccess(database,users,request,"crm.configure"), body=bodyObject(request.body);
    const params=request.params as {kind:string;code:string};
    crmChoice(params.kind,["source","lostReason","contactRole","stage"],"Option kind");
    const code=requiredText(params.code,40,"Code"), en=requiredText(body.labelEn,200,"English label"), th=requiredText(body.labelTh,200,"Thai label"), ja=requiredText(body.labelJa,200,"Japanese label");
    const quiet=body.quietDays==null || body.quietDays==="" ? null : requiredInteger(body.quietDays,"Quiet days",1,365);
    return database.transaction(async tx=>{
      const q=new sql.Request(tx); q.input("kind",sql.VarChar(30),params.kind).input("code",sql.NVarChar(40),code);
      const before=(await q.query("SELECT * FROM dbo.crm_options WITH(UPDLOCK,HOLDLOCK) WHERE kind=@kind AND code=@code")).recordset[0];
      if(before) stale(before,body.rowVersion);
      if(!before && params.kind==="stage") throw new ApiError(400,"validation_failed","Stage codes are fixed.");
      q.input("en",sql.NVarChar(200),en).input("th",sql.NVarChar(200),th).input("ja",sql.NVarChar(200),ja).input("quiet",sql.Int,quiet).input("active",sql.Bit,body.isActive!==false);
      await q.query(before ? "UPDATE dbo.crm_options SET label_en=@en,label_th=@th,label_ja=@ja,quiet_days=@quiet,is_active=@active WHERE kind=@kind AND code=@code" : "INSERT dbo.crm_options(kind,code,label_en,label_th,label_ja,quiet_days,is_active) VALUES(@kind,@code,@en,@th,@ja,@quiet,@active)");
      await insertAudit(tx,actor.id,"CrmConfiguration",0,code,"Updated",before,body); return {saved:true};
    });
  });

  app.get("/api/v1/crm/opportunities",async request=>{
    const actor=await crmAccess(database,users,request), query=request.query as Record<string,string>;
    const page=query.page?requiredInteger(Number(query.page),"Page",1,100000):1, size=query.pageSize?requiredInteger(Number(query.pageSize),"Page size",1,100):30;
    const result=await database.query<CrmRow>(`SELECT o.*,c.name customer_name,c.code customer_code,s.name sales_owner_name,t.name technical_owner_name,
      opt.quiet_days,a.last_activity,f.action next_action,f.due_date next_due,f.status next_status,f.owner_id next_owner_id,
      ed.estimate_due,COUNT(*) OVER() total_count
      FROM dbo.crm_opportunities o JOIN dbo.customers c ON c.id=o.customer_id JOIN dbo.users s ON s.id=o.sales_owner_id
      LEFT JOIN dbo.users t ON t.id=o.technical_owner_id LEFT JOIN dbo.crm_options opt ON opt.kind='stage' AND opt.code=o.stage
      OUTER APPLY(SELECT MAX(occurred_at) last_activity FROM dbo.crm_activities WHERE opportunity_id=o.id) a
      OUTER APPLY(SELECT TOP(1) action,due_date,status,owner_id FROM dbo.crm_followups WHERE opportunity_id=o.id AND status NOT IN('Done','Cancelled') ORDER BY due_date,id) f
      OUTER APPLY(SELECT MIN(e.due_date) estimate_due FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id WHERE i.opportunity_id=o.id AND e.deleted_at IS NULL AND e.status NOT IN('Approved','Locked')) ed
      WHERE ${CRM_SCOPE} AND (@customer IS NULL OR o.customer_id=@customer) AND (@stage=N'' OR o.stage=@stage)
      AND (@open=0 OR o.stage NOT IN('WON','LOST','ON_HOLD'))
      AND (@attention=N'' OR (o.stage NOT IN('WON','LOST','ON_HOLD') AND
        ((@attention='Overdue' AND f.due_date<@today) OR (@attention='WaitingCustomer' AND f.status='WaitingCustomer')
         OR (@attention='NeedsFollowup' AND ${CRM_NEEDS_FOLLOWUP}) OR (@attention='NoNextAction' AND f.action IS NULL)
         OR (@attention='NoActivity' AND a.last_activity IS NULL) OR (@attention='EstimateDueSoon' AND ed.estimate_due<=DATEADD(day,3,@today)))))
      AND (@owner IS NULL OR o.sales_owner_id=@owner OR o.technical_owner_id=@owner) AND (@year IS NULL OR YEAR(o.created_at)=@year)
      AND (@search=N'' OR o.name LIKE @search OR o.opportunity_no LIKE @search OR c.name LIKE @search OR c.code LIKE @search OR s.name LIKE @search OR t.name LIKE @search OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts co WHERE co.id=o.contact_id AND co.name LIKE @search))
      ORDER BY ${query.sort === "close" ? "o.expected_close" : "o.updated_at DESC"},o.id DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,q=>{
        bindAccess(q,actor).input("customer",sql.BigInt,crmId(query.customerId,"Customer")).input("owner",sql.BigInt,crmId(query.ownerId,"Owner"))
          .input("attention",sql.NVarChar(40),query.attention??"").input("today",sql.Date,today())
          .input("open",sql.Bit,query.open==="true")
          .input("stage",sql.NVarChar(40),query.stage??"").input("year",sql.Int,query.year ? requiredInteger(Number(query.year),"Year",2000,2200):null)
          .input("search",sql.NVarChar(400),query.search?`%${crmText(query.search,300)}%`:"").input("offset",sql.Int,(page-1)*size).input("size",sql.Int,size);
      });
    return {items:result.recordset.map(r=>({...crmDto(r,actor.permissions.includes("crm.commercial.read")),attention:crmAttention(r,today())})),total:Number(result.recordset[0]?.total_count??0),page,pageSize:size};
  });

  app.post("/api/v1/crm/opportunities",async(request,reply)=>{
    const actor=await crmAccess(database,users,request,"crm.write"),body=bodyObject(request.body);
    const input=opportunityInput(body,actor.permissions.includes("crm.commercial.read"));
    if(!actor.permissions.includes("crm.read.all") && !actor.permissions.includes("crm.read.team") && input.salesOwnerId!==actor.id && input.technicalOwnerId!==actor.id) throw new ApiError(403,"permission_denied","An owner must be you.");
    const row=await database.transaction(async tx=>{
      await validateCrmReferences(new sql.Request(tx),input);
      const q=new sql.Request(tx); q.input("actor",sql.BigInt,actor.id);
      for(const [key,type] of Object.entries(inputFields)) q.input(key,type,input[key as keyof typeof input]);
      const keys=Object.keys(inputFields);
      const r=(await q.query(`DECLARE @number nvarchar(80); SELECT @number=CONCAT(N'OPP-',code,N'-',YEAR(SYSUTCDATETIME()),N'-',NEXT VALUE FOR dbo.crm_opportunity_numbers) FROM dbo.customers WHERE id=@customerId;
        INSERT dbo.crm_opportunities(opportunity_no,${keys.map(column).join(",")},created_by,updated_by) OUTPUT inserted.* VALUES(@number,${keys.map(k=>`@${k}`).join(",")},@actor,@actor)`)).recordset[0]!;
      await insertAudit(tx,actor.id,"CrmOpportunity",Number(r.id),String(r.opportunity_no).slice(0,50),"Created",null,crmDto(r));
      await scopedOpportunity(bindAccess(new sql.Request(tx),actor),Number(r.id));
      if(body.nextAction) await addFollowup(tx,actor.id,Number(r.id),bodyObject(body.nextAction));
      return crmDto(r,actor.permissions.includes("crm.commercial.read"));
    }); return reply.code(201).send(row);
  });

  app.put("/api/v1/crm/opportunities/:id",async request=>{
    const actor=await crmAccess(database,users,request,"crm.write"),body=bodyObject(request.body),id=positiveLong((request.params as {id:string}).id,"Opportunity");
    return database.transaction(async tx=>{
      const before=await scopedOpportunity(bindAccess(new sql.Request(tx),actor),id,true); stale(before,body.rowVersion);
      const commercial=actor.permissions.includes("crm.commercial.read"); const input=opportunityInput({...crmDto(before),...body},commercial);
      if(input.customerId!==Number(before.customer_id))throw new ApiError(400,"validation_failed","An opportunity keeps its original customer. Create a new opportunity for another customer.");
      if(!commercial) input.expectedValue=before.expected_value==null?null:Number(before.expected_value);
      await validateCrmReferences(new sql.Request(tx),input);
      const q=new sql.Request(tx); q.input("actor",sql.BigInt,actor.id).input("id",sql.BigInt,id);
      for(const [key,type] of Object.entries(inputFields)) q.input(key,type,input[key as keyof typeof input]);
      const row=(await q.query(`UPDATE dbo.crm_opportunities SET stage_changed_at=CASE WHEN stage<>@stage THEN SYSUTCDATETIME() ELSE stage_changed_at END,${Object.keys(inputFields).map(k=>`${column(k)}=@${k}`).join(",")},updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE id=@id`)).recordset[0]!;
      await scopedOpportunity(bindAccess(new sql.Request(tx),actor),id);
      await insertAudit(tx,actor.id,"CrmOpportunity",id,String(row.opportunity_no).slice(0,50),before.stage!==row.stage ? `StageChanged:${row.stage}`:"Updated",crmDto(before),crmDto(row));
      return crmDto(row,commercial);
    });
  });

  app.get("/api/v1/crm/opportunities/:id",async request=>{
    const actor=await crmAccess(database,users,request),id=positiveLong((request.params as {id:string}).id,"Opportunity");
    return database.transaction(async tx=>{
      const row=await scopedOpportunity(bindAccess(new sql.Request(tx),actor),id),q=new sql.Request(tx); q.input("id",sql.BigInt,id).input("actor",sql.BigInt,actor.id).input("projectElevated",sql.Bit,isProjectElevated(await users.required(request)));
      const activities=(await q.query("SELECT a.*,u.name owner_name,f.action next_action,f.due_date next_due,fu.name next_owner_name FROM dbo.crm_activities a JOIN dbo.users u ON u.id=a.owner_id OUTER APPLY(SELECT TOP(1) action,due_date,owner_id FROM dbo.crm_followups WHERE activity_id=a.id ORDER BY due_date,id) f LEFT JOIN dbo.users fu ON fu.id=f.owner_id WHERE a.opportunity_id=@id ORDER BY a.occurred_at DESC,a.id DESC")).recordset;
      const followups=(await q.query("SELECT f.*,u.name owner_name FROM dbo.crm_followups f JOIN dbo.users u ON u.id=f.owner_id WHERE opportunity_id=@id ORDER BY CASE WHEN status IN('Done','Cancelled') THEN 1 ELSE 0 END,due_date,id")).recordset;
      const history=(await q.query("SELECT a.*,u.name actor_name FROM dbo.audit_log a JOIN dbo.users u ON u.id=a.actor_id WHERE entity_type=N'CrmOpportunity' AND entity_id=@id ORDER BY occurred_at DESC,id DESC")).recordset;
      const links=actor.permissions.includes("inquiry.read") ? (await q.query(`SELECT i.id inquiry_id,i.inquiry_no,i.status inquiry_status,i.due_date,e.id estimate_id,e.estimate_no,e.revision,e.status estimate_status,totals.total,p.id project_id,p.project_no,p.status project_status FROM dbo.inquiries i LEFT JOIN dbo.estimates e ON e.inquiry_id=i.id AND e.deleted_at IS NULL LEFT JOIN dbo.v_estimate_totals totals ON totals.estimate_id=e.id LEFT JOIN dbo.projects p ON p.estimate_id=e.id AND p.deleted_at IS NULL AND (@projectElevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) WHERE i.opportunity_id=@id AND i.deleted_at IS NULL`)).recordset:[];
      const commercial=actor.permissions.includes("crm.commercial.read");
      const visibleLinks=links.map(r=>{
        const visible={...r};
        if(!actor.permissions.includes("estimate.read"))for(const key of ["estimate_id","estimate_no","revision","estimate_status","total"])delete visible[key];
        if(!actor.permissions.includes("project.read"))for(const key of ["project_id","project_no","project_status"])delete visible[key];
        return crmDto(visible,commercial);
      });
      return {opportunity:crmDto(row,commercial),activities:activities.map(r=>crmDto(r)),followups:followups.map(r=>crmDto(r)),history:history.map(r=>crmDto(r,commercial)),links:visibleLinks};
    });
  });

  app.post("/api/v1/crm/opportunities/:id/followups",async(request,reply)=>{
    const actor=await crmAccess(database,users,request,"crm.write"),id=positiveLong((request.params as {id:string}).id,"Opportunity"),body=bodyObject(request.body);
    const result=await database.transaction(async tx=>{await scopedOpportunity(bindAccess(new sql.Request(tx),actor),id,true);return addFollowup(tx,actor.id,id,body);});return reply.code(201).send(result);
  });
  app.put("/api/v1/crm/opportunities/:id/followups/:followupId",async request=>{
    const actor=await crmAccess(database,users,request),params=request.params as {id:string;followupId:string},id=positiveLong(params.id,"Opportunity"),fid=positiveLong(params.followupId,"Follow-up"),body=bodyObject(request.body);
    return database.transaction(async tx=>{
      await scopedOpportunity(bindAccess(new sql.Request(tx),actor),id,true);
      const q=new sql.Request(tx);q.input("id",sql.BigInt,id).input("fid",sql.BigInt,fid).input("actor",sql.BigInt,actor.id);
      const before=(await q.query("SELECT * FROM dbo.crm_followups WITH(UPDLOCK,HOLDLOCK) WHERE id=@fid AND opportunity_id=@id")).recordset[0];
      if(!before) throw new ApiError(404,"crm_not_found","Follow-up not found.");
      if(Number(before.owner_id)!==actor.id&&!actor.permissions.includes("crm.write"))throw new ApiError(403,"permission_denied","Only the action owner may update it.");
      stale(before,body.rowVersion);const input=followupInput({...crmDto(before),...body});
      if(!actor.permissions.includes("crm.write") && input.ownerId!==Number(before.owner_id))throw new ApiError(403,"permission_denied","Reassigning a follow-up requires CRM write permission.");
      await activeOwner(new sql.Request(tx),input.ownerId);
      q.input("action",sql.NVarChar(1000),input.action).input("owner",sql.BigInt,input.ownerId).input("due",sql.Date,input.dueDate).input("priority",sql.NVarChar(20),input.priority).input("status",sql.NVarChar(30),input.status);
      const row=(await q.query("UPDATE dbo.crm_followups SET action=@action,owner_id=@owner,due_date=@due,priority=@priority,status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.* WHERE id=@fid AND opportunity_id=@id")).recordset[0]!;
      await insertAudit(tx,actor.id,"CrmOpportunity",id,"","NextActionChanged",crmDto(before),crmDto(row));return crmDto(row);
    });
  });

  app.get("/api/v1/crm/activities",async request=>{
    const actor=await crmAccess(database,users,request),query=request.query as Record<string,string>;
    const page=query.page?requiredInteger(Number(query.page),"Page",1,100000):1;
    const result=await database.query<CrmRow>(`SELECT a.*,u.name owner_name,c.name customer_name,o.name opportunity_name,COUNT(*) OVER() total_count,
      f.action next_action,f.due_date next_due,fu.name next_owner_name
      FROM dbo.crm_activities a JOIN dbo.customers c ON c.id=a.customer_id JOIN dbo.users u ON u.id=a.owner_id
      LEFT JOIN dbo.crm_opportunities o ON o.id=a.opportunity_id
      OUTER APPLY(SELECT TOP(1) action,due_date,owner_id FROM dbo.crm_followups WHERE activity_id=a.id ORDER BY due_date,id) f
      LEFT JOIN dbo.users fu ON fu.id=f.owner_id
      WHERE (a.opportunity_id IS NULL OR ${CRM_SCOPE}) AND (@customer IS NULL OR a.customer_id=@customer)
      AND (@year IS NULL OR YEAR(a.occurred_at)=@year) ORDER BY a.occurred_at DESC,a.id DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY`,
      q=>bindAccess(q,actor).input("customer",sql.BigInt,crmId(query.customerId,"Customer")).input("year",sql.Int,query.year?requiredInteger(Number(query.year),"Year",2000,2200):null).input("offset",sql.Int,(page-1)*30));
    return {items:result.recordset.map(r=>crmDto(r)),total:Number(result.recordset[0]?.total_count??0),page,pageSize:30};
  });
  app.post("/api/v1/crm/activities",async(request,reply)=>{
    const actor=await crmAccess(database,users,request,"crm.activity.write"),body=bodyObject(request.body);
    const opportunity=crmId(body.opportunityId,"Opportunity"),customer=requiredInteger(body.customerId,"Customer",1),contact=crmId(body.contactId,"Contact"),owner=requiredInteger(body.ownerId??actor.id,"Owner",1);
    const occurred=new Date(String(body.occurredAt));if(!Number.isFinite(occurred.getTime())||occurred.getTime()>Date.now()+86400000)throw new ApiError(400,"validation_failed","Activity date is invalid.");
    const type=crmChoice(body.activityType,CRM_ACTIVITY_TYPES,"Activity type"),summary=requiredText(body.summary,4000,"Summary");
    const result=await database.transaction(async tx=>{
      if(opportunity){const o=await scopedOpportunity(bindAccess(new sql.Request(tx),actor),opportunity,true);if(Number(o.customer_id)!==customer)throw new ApiError(422,"invalid_reference","Opportunity and customer do not match.");}
      await activeOwner(new sql.Request(tx),owner);
      const q=new sql.Request(tx);q.input("customer",sql.BigInt,customer).input("contact",sql.BigInt,contact);
      const valid=(await q.query(`SELECT c.id FROM dbo.customers c WHERE c.id=@customer AND c.is_active=1 AND c.deleted_at IS NULL AND (@contact IS NULL OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts co JOIN dbo.customer_sites s ON s.id=co.site_id WHERE co.id=@contact AND s.customer_id=c.id AND co.is_active=1 AND co.deleted_at IS NULL))`)).recordset[0];
      if(!valid)throw new ApiError(422,"invalid_reference","Customer or contact is invalid.");
      const inquiry=crmId(body.inquiryId,"Inquiry"),estimate=crmId(body.estimateId,"Estimate"),project=crmId(body.projectId,"Project");
      for(const [linked,permission] of [[inquiry,"inquiry.read"],[estimate,"estimate.read"],[project,"project.read"]] as const)if(linked&&!actor.permissions.includes(permission))throw new ApiError(403,"permission_denied","The related record is unavailable.");
      if(project)await demandProjectScope(database,await users.required(request),project,tx);
      q.input("opportunity",sql.BigInt,opportunity).input("inquiry",sql.BigInt,inquiry).input("estimate",sql.BigInt,estimate).input("project",sql.BigInt,project);
      const linkQuery=bindAccess(new sql.Request(tx),actor);linkQuery.input("customer",sql.BigInt,customer).input("opportunity",sql.BigInt,opportunity).input("inquiry",sql.BigInt,inquiry).input("estimate",sql.BigInt,estimate).input("project",sql.BigInt,project);
      const links=(await linkQuery.query(`SELECT CASE WHEN
        (@inquiry IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiries i LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE i.id=@inquiry AND i.customer_id=@customer AND i.deleted_at IS NULL AND (@opportunity IS NULL OR i.opportunity_id=@opportunity) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE})))
        AND (@estimate IS NULL OR EXISTS(SELECT 1 FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE e.id=@estimate AND i.customer_id=@customer AND e.deleted_at IS NULL AND (@opportunity IS NULL OR i.opportunity_id=@opportunity) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE})))
        AND (@project IS NULL OR EXISTS(SELECT 1 FROM dbo.projects p JOIN dbo.inquiries i ON i.id=p.inquiry_id LEFT JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id WHERE p.id=@project AND p.customer_id=@customer AND p.deleted_at IS NULL AND (@opportunity IS NULL OR i.opportunity_id=@opportunity) AND (i.opportunity_id IS NULL OR ${CRM_SCOPE}))) THEN 1 ELSE 0 END valid`)).recordset[0];
      if(!links?.valid)throw new ApiError(422,"invalid_reference","Related records must belong to this customer and opportunity.");
      q.input("owner",sql.BigInt,owner).input("actor",sql.BigInt,actor.id).input("type",sql.NVarChar(40),type).input("occurred",sql.DateTimeOffset,occurred).input("summary",sql.NVarChar(4000),summary).input("participants",sql.NVarChar(2000),crmText(body.participants,2000)).input("decision",sql.NVarChar(4000),crmText(body.decision)).input("actions",sql.NVarChar(4000),crmText(body.actionItems));
      const row=(await q.query("INSERT dbo.crm_activities(customer_id,opportunity_id,contact_id,inquiry_id,estimate_id,project_id,activity_type,occurred_at,owner_id,participants,summary,decision,action_items,created_by) OUTPUT inserted.* VALUES(@customer,@opportunity,@contact,@inquiry,@estimate,@project,@type,@occurred,@owner,@participants,@summary,@decision,@actions,@actor)")).recordset[0]!;
      await insertAudit(tx,actor.id,opportunity?"CrmOpportunity":"Customer",opportunity??customer,"","ActivityAdded",null,crmDto(row));
      if(body.nextAction){if(!opportunity)throw new ApiError(400,"validation_failed","A next action requires an opportunity.");await addFollowup(tx,actor.id,opportunity,bodyObject(body.nextAction),Number(row.id));}
      return crmDto(row);
    });return reply.code(201).send(result);
  });

  app.get("/api/v1/crm/my-work",async request=>{
    const actor=await crmAccess(database,users,request);
    const rows=(await database.query<CrmRow>(`SELECT f.*,o.name opportunity_name,o.opportunity_no,c.name customer_name FROM dbo.crm_followups f JOIN dbo.crm_opportunities o ON o.id=f.opportunity_id JOIN dbo.customers c ON c.id=o.customer_id WHERE f.owner_id=@actor AND f.status NOT IN('Done','Cancelled') AND o.stage NOT IN('WON','LOST','ON_HOLD') ORDER BY f.due_date,f.id`,q=>q.input("actor",sql.BigInt,actor.id))).recordset;
    const quiet=(await database.query<CrmRow>(`SELECT o.*,opt.quiet_days,a.last_activity,f.action next_action,f.due_date next_due,f.status next_status FROM dbo.crm_opportunities o LEFT JOIN dbo.crm_options opt ON opt.kind='stage' AND opt.code=o.stage OUTER APPLY(SELECT MAX(occurred_at) last_activity FROM dbo.crm_activities WHERE opportunity_id=o.id) a OUTER APPLY(SELECT TOP(1) action,due_date,status FROM dbo.crm_followups WHERE opportunity_id=o.id AND status NOT IN('Done','Cancelled') ORDER BY due_date,id) f WHERE (o.sales_owner_id=@actor OR o.technical_owner_id=@actor) AND o.stage NOT IN('WON','LOST','ON_HOLD')`,q=>q.input("actor",sql.BigInt,actor.id))).recordset;
    return {actions:rows.map(r=>crmDto(r)),attention:quiet.map(r=>({...crmDto(r,actor.permissions.includes("crm.commercial.read")),attention:crmAttention(r,today())})).filter(r=>r.attention.some(f=>["NeedsFollowup","NoNextAction"].includes(f)))};
  });
}
