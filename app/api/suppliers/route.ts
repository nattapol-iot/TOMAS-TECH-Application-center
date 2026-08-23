import { ensureDatabase, getD1 } from "../../../db/runtime";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { code?: string; name?: string; category?: string; contactName?: string; email?: string; phone?: string };
    if (!payload.code?.trim() || !payload.name?.trim()) return Response.json({ error: "Supplier code and name are required" }, { status: 400 });
    const db = getD1(); await ensureDatabase(db);
    const supplier = await db.prepare("INSERT INTO suppliers (code,name,category,contact_name,email,phone) VALUES (?,?,?,?,?,?) RETURNING *").bind(payload.code.trim().toUpperCase(),payload.name.trim(),payload.category?.trim()||"General",payload.contactName?.trim()||"",payload.email?.trim()||"",payload.phone?.trim()||"").first();
    return Response.json({ supplier }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create supplier" }, { status: 500 }); }
}
