import { ensureDatabase, getD1 } from "../../../db/runtime";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { customerId?: number; projectName?: string; assignedTo?: number; leaderId?: number; managerId?: number; dueDate?: string; modules?: string[] };
    if (!payload.customerId || !payload.projectName?.trim() || !payload.assignedTo || !payload.leaderId || !payload.managerId || !payload.dueDate) return Response.json({ error: "Missing required estimate information" }, { status: 400 });
    const db = getD1(); await ensureDatabase(db);
    const customer = await db.prepare("SELECT code FROM customers WHERE id=?").bind(payload.customerId).first<{ code: string }>();
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
    const year = new Date().getFullYear();
    const sequence = await db.prepare("SELECT COALESCE(MAX(running_no),0)+1 AS next_no FROM estimates WHERE substr(estimate_no,5,3)=? AND substr(estimate_no,9,4)=?").bind(customer.code, String(year)).first<{ next_no: number }>();
    const runningNo = sequence?.next_no ?? 1;
    const estimateNo = `EST-${customer.code}-${year}-${String(runningNo).padStart(4,"0")}-R00`;
    const result = await db.prepare("INSERT INTO estimates (estimate_no,customer_id,running_no,revision,project_name,status,assigned_to,leader_id,manager_id,due_date,progress,selected_modules) VALUES (?,?,?,?,?,'Draft',?,?,?,?,0,?) RETURNING id,estimate_no").bind(estimateNo,payload.customerId,runningNo,0,payload.projectName.trim(),payload.assignedTo,payload.leaderId,payload.managerId,payload.dueDate,JSON.stringify(payload.modules ?? [])).first();
    const estimateId = Number((result as { id: number }).id);
    const checks = [["project","Project & customer information",15,1],["modules","Project modules selected",10,(payload.modules?.length ?? 0)>0?1:0],["equipment","Equipment and supplier cost",30,0],["manpower","Manpower plan",20,0],["external","External manpower quotation",15,0],["validation","Final cost validation",10,0]] as const;
    await db.batch(checks.map(([key,label,weight,complete]) => db.prepare("INSERT INTO estimate_checklist (estimate_id,checklist_key,label,weight,completed) VALUES (?,?,?,?,?)").bind(estimateId,key,label,weight,complete)));
    await db.batch([db.prepare("INSERT INTO approvals (estimate_id,stage,sequence,approver_id,status) VALUES (?,'Leader',1,?,'Pending')").bind(estimateId,payload.leaderId),db.prepare("INSERT INTO approvals (estimate_id,stage,sequence,approver_id,status) VALUES (?,'Manager',2,?,'Waiting')").bind(estimateId,payload.managerId)]);
    return Response.json({ estimate: result }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create estimate" }, { status: 500 }); }
}
