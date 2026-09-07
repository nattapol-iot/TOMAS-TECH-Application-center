import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import { ApiError } from "../errors.js";
import { dateOnly } from "../http.js";
import { taskRow, resolveTasks } from "../schedule-service.js";
import { DASHBOARD_ROLES, overdueTask, type ExecutiveData, type ExecutiveTask } from "../executive-dashboard-model.js";

type Row = Record<string, unknown>;
const n = (r: Row, key: string) => Number(r[key] ?? 0);
const s = (r: Row, key: string) => String(r[key] ?? "");
const d = (r: Row, key: string) => dateOnly(r[key] as Date | string | null) ?? null;

export function registerExecutiveDashboardRoutes(app: FastifyInstance, db: Database, users: CurrentUserService) {
  app.get("/api/v1/dashboard/management", async request => {
    const actor = await users.required(request);
    if (!DASHBOARD_ROLES.includes(actor.role)) throw new ApiError(403, "dashboard_forbidden", "Management dashboard access is required.");
    // This endpoint grants reporting only. Additional signing roles never expand reporting scope.
    const executive = ["Management", "CEO", "Admin"].includes(actor.role);
    const result = await db.query<Row>(`
      SET NOCOUNT ON;
      DECLARE @granted TABLE(code nvarchar(100));
      INSERT @granted SELECT p.code FROM dbo.users u JOIN dbo.role_permissions rp ON rp.role_id=u.role_id JOIN dbo.permissions p ON p.id=rp.permission_id WHERE u.id=@actor;
      INSERT @granted SELECT code FROM dbo.user_signing_permissions WHERE user_id=@actor;
      DECLARE @projects TABLE(id bigint PRIMARY KEY);
      INSERT @projects SELECT p.id FROM dbo.projects p
      WHERE p.deleted_at IS NULL AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'project.read'))
      AND (@executive=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR (@role=N'Engineering Manager' AND @department<>N'' AND EXISTS(SELECT 1 FROM dbo.users u WHERE u.department=@department AND u.deleted_at IS NULL
          AND (u.id=p.manager_id OR u.id=p.lead_engineer_id OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=u.id))))
        OR (@role=N'Sales Manager' AND @department<>N'' AND EXISTS(SELECT 1 FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id JOIN dbo.users u ON u.id=i.created_by
          WHERE e.id=p.estimate_id AND u.department=@department AND u.deleted_at IS NULL)));
      DECLARE @inquiries TABLE(id bigint PRIMARY KEY);
      INSERT @inquiries SELECT i.id FROM dbo.inquiries i WHERE i.deleted_at IS NULL
      AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'inquiry.read'))
      AND (@executive=1 OR i.created_by=@actor OR i.estimate_owner_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.projects p JOIN @projects scope ON scope.id=p.id JOIN dbo.estimates e ON e.id=p.estimate_id WHERE e.inquiry_id=i.id)
        OR (@role IN(N'Engineering Manager',N'Sales Manager') AND @department<>N'' AND EXISTS(SELECT 1 FROM dbo.users u WHERE u.deleted_at IS NULL AND u.department=@department
          AND ((@role=N'Sales Manager' AND u.id=i.created_by) OR (@role=N'Engineering Manager' AND u.id=i.estimate_owner_id)))));
      DECLARE @estimates TABLE(id bigint PRIMARY KEY);
      INSERT @estimates SELECT e.id FROM dbo.estimates e WHERE e.deleted_at IS NULL AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'estimate.read'))
      AND EXISTS(SELECT 1 FROM @inquiries i WHERE i.id=e.inquiry_id);
      SELECT p.id,p.inquiry_id,p.project_no number,p.name,p.customer_id,c.name customer,u.department,p.manager_id,u.name manager,p.status,p.start_date,p.target_delivery,p.progress,
        CASE WHEN @executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'estimate.read') THEN totals.total END budget,
        CASE WHEN @executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'estimate.read') THEN totals.material_total END material_budget
      FROM @projects scope JOIN dbo.projects p ON p.id=scope.id JOIN dbo.customers c ON c.id=p.customer_id JOIN dbo.users u ON u.id=p.manager_id
      LEFT JOIN dbo.v_estimate_totals totals ON totals.estimate_id=p.estimate_id;
      SELECT i.id,i.inquiry_no number,i.project_name name,i.customer_id,c.name customer,u.department,i.estimate_owner_id owner_id,u.name owner,
        i.status,i.inquiry_date date,i.due_date,i.project_probability probability
      FROM @inquiries scope JOIN dbo.inquiries i ON i.id=scope.id JOIN dbo.customers c ON c.id=i.customer_id JOIN dbo.users u ON u.id=i.estimate_owner_id;
      SELECT e.id,e.inquiry_id,e.estimate_no number,e.project_name name,e.customer_id,u.department,u.name owner,e.status,e.created_date date,e.due_date,t.total cost
      FROM @estimates scope JOIN dbo.estimates e ON e.id=scope.id JOIN dbo.users u ON u.id=e.owner_id JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id;
      SELECT t.* FROM dbo.schedule_tasks t JOIN @projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL
        AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.read'));
      SELECT pic.task_id,pic.user_id FROM dbo.schedule_task_pics pic JOIN dbo.schedule_tasks t ON t.id=pic.task_id JOIN @projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL;
      SELECT holiday_date FROM dbo.holidays;
      SELECT pr.id,pr.project_id,pr.pr_no number,N'PR' kind,N'' supplier,u.name owner,pr.status,pr.created_at date,pr.required_date due_date,
        COALESCE((SELECT SUM(line_total) FROM dbo.mat_pr_lines l WHERE l.pr_id=pr.id),0) value,
        CONVERT(decimal(19,4),0) open_value,0 held,
        CAST(CASE WHEN pr.status=N'In Approval' AND pr.requested_by<>@actor AND EXISTS(SELECT 1 FROM @granted WHERE code=N'procurement.approve') AND EXISTS(
          SELECT 1 FROM dbo.mat_pr_approval_steps st WHERE st.pr_id=pr.id AND st.status=N'Current' AND (st.approver_id=@actor OR (st.approver_id IS NULL AND st.approver_role=@role))) THEN 1 ELSE 0 END AS bit) waiting_me
      FROM dbo.mat_prs pr JOIN @projects scope ON scope.id=pr.project_id JOIN dbo.users u ON u.id=pr.requested_by WHERE pr.deleted_at IS NULL
        AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'procurement.read'))
      UNION ALL
      SELECT po.id,po.project_id,po.po_no,N'PO',sup.name,N'',po.status,po.order_date,po.expected_date,
        COALESCE(v.value,0),COALESCE(v.open_value,0),0,CAST(0 AS bit)
      FROM dbo.mat_pos po JOIN @projects scope ON scope.id=po.project_id JOIN dbo.suppliers sup ON sup.id=po.supplier_id
      OUTER APPLY(SELECT SUM(l.qty*l.unit_price) value,SUM(CASE WHEN l.qty>COALESCE(rc.qty,0) THEN (l.qty-COALESCE(rc.qty,0))*l.unit_price ELSE 0 END) open_value
        FROM dbo.mat_po_lines l OUTER APPLY(SELECT SUM(gl.received_qty) qty FROM dbo.grn_lines gl JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' WHERE gl.po_line_id=l.id) rc WHERE l.po_id=po.id) v
      WHERE po.deleted_at IS NULL AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'procurement.read'))
      UNION ALL
      SELECT g.id,po.project_id,g.grn_no,N'GRN',sup.name,u.name,g.status,g.received_date,NULL,COALESCE(v.value,0),0,COALESCE(v.held,0),CAST(0 AS bit)
      FROM dbo.grns g JOIN dbo.mat_pos po ON po.id=g.po_id AND po.deleted_at IS NULL JOIN @projects scope ON scope.id=po.project_id
      JOIN dbo.suppliers sup ON sup.id=g.supplier_id JOIN dbo.users u ON u.id=g.created_by
      OUTER APPLY(SELECT SUM(l.received_qty*pl.unit_price) value,SUM(l.damaged_qty+l.rejected_qty) held FROM dbo.grn_lines l JOIN dbo.mat_po_lines pl ON pl.id=l.po_line_id WHERE l.grn_id=g.id) v
      WHERE @executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'inventory.read');
      SELECT u.id,u.name,u.department,cap.days_per_week capacity FROM dbo.users u LEFT JOIN dbo.resource_capacity cap ON cap.user_id=u.id
      WHERE u.is_active=1 AND u.deleted_at IS NULL AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.read'))
      AND (@executive=1 OR u.id=@actor OR (@role IN(N'Engineering Manager',N'Sales Manager') AND @department<>N'' AND u.department=@department)
        OR EXISTS(SELECT 1 FROM dbo.project_members m JOIN @projects p ON p.id=m.project_id WHERE m.user_id=u.id)
        OR EXISTS(SELECT 1 FROM dbo.projects p JOIN @projects scope ON scope.id=p.id WHERE p.manager_id=u.id OR p.lead_engineer_id=u.id));
      SELECT N'Inquiry' kind,i.id,i.estimate_owner_id owner_id,COALESCE(e.start_date,i.inquiry_date) start_date,COALESCE(e.end_date,i.due_date) end_date,e.man_days
      FROM dbo.inquiries i JOIN @inquiries scope ON scope.id=i.id LEFT JOIN dbo.resource_effort e ON e.entity_type=N'Inquiry' AND e.entity_id=i.id
      WHERE i.status NOT IN(N'Closed',N'Cancelled',N'Rejected') AND NOT EXISTS(SELECT 1 FROM dbo.resource_task_sources s WHERE s.inquiry_id=i.id)
        AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.read'))
      UNION ALL
      SELECT N'Estimate',e.id,o.user_id,COALESCE(re.start_date,e.created_date),COALESCE(re.end_date,e.due_date),re.man_days/o.owner_count
      FROM dbo.estimates e JOIN @estimates scope ON scope.id=e.id LEFT JOIN dbo.resource_effort re ON re.entity_type=N'Estimate' AND re.entity_id=e.id
      CROSS APPLY(SELECT user_id,COUNT(*) OVER() owner_count FROM (SELECT a.owner_id user_id FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id UNION SELECT a.support_id FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id AND a.support_id IS NOT NULL UNION SELECT e.owner_id WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id)) owners) o
      WHERE e.status NOT IN(N'Closed',N'Cancelled',N'Approved',N'Locked') AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.read'));
      SELECT t.id,t.inquiry_id,t.title,t.execution_status,t.plan_start,t.plan_end,t.man_days,t.assignee_id,t.percent_done,t.actual_end,t.updated_at,t.state,t.pending_plan
      FROM dbo.resource_tasks t JOIN @inquiries scope ON scope.id=t.inquiry_id WHERE t.state IN(N'Approved',N'Closed') AND (@executive=1 OR EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.read'));
      SELECT CONCAT(N'SIGN-',st.id) [key],doc.doc_no number,doc.title name,u.name owner,N'Sign' kind,N'signing' destination,doc.project_id,de.inquiry_id,
        COALESCE(st.due_date,rq.due_date) due,rq.created_at since,doc.amount
      FROM dbo.sign_steps st JOIN dbo.sign_requests rq ON rq.id=st.request_id JOIN dbo.signable_documents doc ON doc.id=rq.document_id JOIN dbo.users u ON u.id=rq.initiator_id
      LEFT JOIN dbo.estimates de ON de.id=doc.estimate_id
      WHERE st.state=N'PENDING' AND rq.state IN(N'PENDING_SIGN',N'PARTIALLY_SIGNED') AND st.required_mark<>N'PAPER'
        AND EXISTS(SELECT 1 FROM @granted WHERE code=N'signing.read')
        AND (st.assignee_user_id=@actor OR (st.assignee_user_id IS NULL AND st.assignee_role_id=(SELECT id FROM dbo.roles WHERE code=@role)))
        AND ((doc.project_id IS NULL AND de.inquiry_id IS NULL) OR EXISTS(SELECT 1 FROM @projects p WHERE p.id=doc.project_id) OR EXISTS(SELECT 1 FROM @inquiries i WHERE i.id=de.inquiry_id))
      UNION ALL
      SELECT CONCAT(N'PLAN-',t.id),CONCAT(N'TASK-',t.id),t.title,u.name,N'Plan review',N'resources',t.project_id,t.inquiry_id,t.plan_end,t.created_at,NULL
      FROM dbo.resource_tasks t JOIN dbo.users u ON u.id=t.proposed_by
      WHERE t.pending_plan IS NOT NULL AND EXISTS(SELECT 1 FROM @granted WHERE code=N'schedule.plan')
        AND (EXISTS(SELECT 1 FROM @projects p WHERE p.id=t.project_id) OR EXISTS(SELECT 1 FROM @inquiries i WHERE i.id=t.inquiry_id));
      -- Active primary-role PMs may be filter options even before their first assignment.
      -- This directory does not expand the project reporting scope above.
      SELECT u.id,u.name,u.department FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id
      WHERE r.code=N'Project Manager' AND u.is_active=1 AND u.deleted_at IS NULL
        AND (@executive=1 OR u.id=@actor
          OR (@role IN(N'Engineering Manager',N'Sales Manager') AND @department<>N'' AND u.department=@department)
          OR EXISTS(SELECT 1 FROM dbo.projects p JOIN @projects scope ON scope.id=p.id WHERE p.manager_id=u.id))
      ORDER BY u.name,u.id;
    `, q => q.input("actor", sql.BigInt, actor.id).input("role", sql.NVarChar(50), actor.role)
      .input("department", sql.NVarChar(100), actor.department.trim()).input("executive", sql.Bit, executive));
    const rows = (index: number) => result.recordsets[index] as Row[];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const holidays = new Set(rows(5).map(r => d(r,"holiday_date")!));
    const data: ExecutiveData = {
      asOf: new Date().toISOString(), today, mode: executive ? "executive" : "manager", scope: executive ? "Company" : actor.role === "Project Manager" ? "Managed projects" : actor.department || "Assigned records",
      projects: rows(0).map(r => ({id:n(r,"id"),inquiryId:n(r,"inquiry_id"),number:s(r,"number"),name:s(r,"name"),customerId:n(r,"customer_id"),customer:s(r,"customer"),department:s(r,"department"),managerId:n(r,"manager_id"),manager:s(r,"manager"),status:s(r,"status"),start:d(r,"start_date")!,due:d(r,"target_delivery")!,progress:n(r,"progress"),budget:r.budget==null?null:n(r,"budget"),materialBudget:r.material_budget==null?null:n(r,"material_budget"),forecast:null,overdue:0,blocked:0,taskCount:0,unknownSchedule:false,plannedProgress:null})),
      inquiries:rows(1).map(r=>({id:n(r,"id"),number:s(r,"number"),name:s(r,"name"),customerId:n(r,"customer_id"),customer:s(r,"customer"),department:s(r,"department"),ownerId:n(r,"owner_id"),owner:s(r,"owner"),status:s(r,"status"),date:d(r,"date")!,due:d(r,"due_date")!,probability:n(r,"probability")})),
      estimates:rows(2).map(r=>({id:n(r,"id"),inquiryId:n(r,"inquiry_id"),number:s(r,"number"),name:s(r,"name"),customerId:n(r,"customer_id"),department:s(r,"department"),owner:s(r,"owner"),status:s(r,"status"),date:d(r,"date")!,due:d(r,"due_date")!,cost:n(r,"cost")})),
      tasks:[],procurement:rows(6).map(r=>({id:n(r,"id"),projectId:n(r,"project_id"),number:s(r,"number"),kind:s(r,"kind") as "PR"|"PO"|"GRN",supplier:s(r,"supplier"),owner:s(r,"owner"),status:s(r,"status"),date:d(r,"date")!,due:d(r,"due_date"),value:n(r,"value"),openValue:n(r,"open_value"),held:n(r,"held"),waitingMe:Boolean(r.waiting_me)})),
      team:rows(7).map(r=>({id:n(r,"id"),name:s(r,"name"),department:s(r,"department"),capacity:r.capacity==null?null:n(r,"capacity")})),
      projectManagers:rows(11).map(r=>({id:n(r,"id"),name:s(r,"name"),department:s(r,"department")})),
      efforts:rows(8).map(r=>({kind:s(r,"kind") as "Inquiry"|"Estimate",id:n(r,"id"),ownerId:n(r,"owner_id"),start:d(r,"start_date"),end:d(r,"end_date"),manDays:r.man_days==null?null:n(r,"man_days")})),
      actions:rows(10).map(r=>({key:s(r,"key"),number:s(r,"number"),name:s(r,"name"),owner:s(r,"owner"),kind:s(r,"kind"),destination:s(r,"destination") as "signing"|"resources",projectId:r.project_id==null?null:n(r,"project_id"),inquiryId:r.inquiry_id==null?null:n(r,"inquiry_id"),due:d(r,"due"),since:d(r,"since"),amount:r.amount==null?null:n(r,"amount")})),
      holidays:[...holidays],warnings:[],
    };
    const schedule = rows(3).map(r=>taskRow(r as Row & {row_version:Buffer}));
    for (const p of data.projects) {
      const source = schedule.filter(t=>t.projectId===p.id);
      try {
        const resolved=resolveTasks(source,holidays);
        const leaves:ExecutiveTask[]=source.filter(t=>!resolved.byId.get(t.id)!.children.length && t.kind!=="phase").map(t=>{
          const r=resolved.byId.get(t.id)!;
          return {id:t.id,projectId:p.id,inquiryId:null,name:t.name,status:r.status,start:r.planStart,due:r.planFinish,baselineDue:t.baselineFinish,forecast:r.forecastFinish,completed:r.actualFinish,milestone:t.isMilestone,progress:r.percentComplete,manDays:t.planManDays,owners:rows(4).filter(pic=>n(pic,"task_id")===t.id).map(pic=>n(pic,"user_id"))};
        });
        data.tasks.push(...leaves); p.taskCount=leaves.length; p.overdue=leaves.filter(t=>overdueTask(t,today)).length; p.blocked=leaves.filter(t=>t.status==="Blocked").length;
        p.forecast=leaves.map(t=>t.completed??t.forecast??t.due).filter((v):v is string=>!!v).sort().at(-1)??null;
        p.unknownSchedule=leaves.some(t=>!t.start||!t.due);
        const weights=leaves.reduce((sum,t)=>sum+Math.max(1,t.manDays),0);
        if(weights) { p.progress=leaves.reduce((sum,t)=>sum+t.progress*Math.max(1,t.manDays),0)/weights;
          p.plannedProgress=leaves.every(t=>t.start&&t.due)?leaves.reduce((sum,t)=>sum+Math.max(0,Math.min(1,(Date.parse(today)-Date.parse(t.start!)+86400000)/(Date.parse(t.due!)-Date.parse(t.start!)+86400000)))*100*Math.max(1,t.manDays),0)/weights:null; }
      } catch { p.unknownSchedule=true;data.warnings.push(p.number); }
    }
    for(const r of rows(9)) data.tasks.push({id:-n(r,"id"),projectId:null,inquiryId:n(r,"inquiry_id"),name:s(r,"title"),status:s(r,"execution_status"),start:d(r,"plan_start"),due:d(r,"plan_end"),baselineDue:null,forecast:null,completed:d(r,"actual_end"),milestone:false,progress:n(r,"percent_done"),manDays:n(r,"man_days"),owners:[n(r,"assignee_id")]});
    return data;
  });
}
