import { ensureDatabase, getD1 } from "../../../../db/runtime";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { estimateId?: number; action?: "submit"|"approve"|"return"; stage?: "Leader"|"Manager"; comment?: string };
    if (!payload.estimateId || !payload.action) return Response.json({ error: "Estimate and action are required" }, { status: 400 });
    const db = getD1(); await ensureDatabase(db);
    if (payload.action === "return" && !payload.comment?.trim()) return Response.json({ error: "Return reason is required" }, { status: 400 });
    if (payload.action === "submit") await db.prepare("UPDATE estimates SET status='Leader review', progress=100, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.estimateId).run();
    if (payload.action === "return") await db.batch([db.prepare("UPDATE estimates SET status='Returned', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.estimateId),db.prepare("UPDATE approvals SET status='Returned', comment=?, acted_at=CURRENT_TIMESTAMP WHERE estimate_id=? AND stage=?").bind(payload.comment,payload.estimateId,payload.stage||"Leader")]);
    if (payload.action === "approve" && payload.stage === "Leader") await db.batch([db.prepare("UPDATE approvals SET status='Approved', acted_at=CURRENT_TIMESTAMP WHERE estimate_id=? AND stage='Leader'").bind(payload.estimateId),db.prepare("UPDATE approvals SET status='Pending' WHERE estimate_id=? AND stage='Manager'").bind(payload.estimateId),db.prepare("UPDATE estimates SET status='Manager approval', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.estimateId)]);
    if (payload.action === "approve" && payload.stage === "Manager") await db.batch([db.prepare("UPDATE approvals SET status='Approved', acted_at=CURRENT_TIMESTAMP WHERE estimate_id=? AND stage='Manager'").bind(payload.estimateId),db.prepare("UPDATE estimates SET status='Approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.estimateId)]);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update workflow" }, { status: 500 }); }
}
