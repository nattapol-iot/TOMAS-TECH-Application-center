import { ensureDatabase, getD1 } from "../../../db/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getD1();
    await ensureDatabase(db);
    const [customers, suppliers, users, estimates, rates, checks, items, approvals] = await Promise.all([
      db.prepare("SELECT * FROM customers WHERE active = 1 ORDER BY name").all(),
      db.prepare("SELECT * FROM suppliers ORDER BY name").all(),
      db.prepare("SELECT * FROM users ORDER BY role, name").all(),
      db.prepare(`SELECT e.*, c.name AS customer_name, c.code AS customer_code, u.name AS engineer_name FROM estimates e JOIN customers c ON c.id=e.customer_id JOIN users u ON u.id=e.assigned_to ORDER BY e.updated_at DESC`).all(),
      db.prepare("SELECT * FROM labor_rates WHERE active = 1 ORDER BY workforce_type, discipline, work_type").all(),
      db.prepare("SELECT * FROM estimate_checklist WHERE estimate_id = 1 ORDER BY id").all(),
      db.prepare(`SELECT i.*, s.name AS supplier_name FROM cost_items i LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.estimate_id=1 ORDER BY i.sort_order`).all(),
      db.prepare(`SELECT a.*, u.name AS approver_name FROM approvals a JOIN users u ON u.id=a.approver_id WHERE a.estimate_id=1 ORDER BY a.sequence`).all(),
    ]);
    return Response.json({ customers: customers.results, suppliers: suppliers.results, users: users.results, estimates: estimates.results, laborRates: rates.results, checklist: checks.results, costItems: items.results, approvals: approvals.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load application data" }, { status: 500 });
  }
}
