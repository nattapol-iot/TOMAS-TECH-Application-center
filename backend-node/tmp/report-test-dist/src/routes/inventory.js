import sql from "mssql/msnodesqlv8.js";
import { booleanQuery, optionalText, positiveLong } from "../http.js";
export function registerInventoryRoutes(app, database, users) {
    app.get("/api/v1/inventory/items", async (request) => {
        await users.demandPermission(request, "inventory.read");
        const query = request.query;
        const search = optionalText(query.search, 200, "Search");
        const reorderOnly = booleanQuery(query.reorderOnly);
        const result = await database.query(`
      SELECT item_id, item_code, part_no, description, brand, unit, location,
             usable, quarantine, reserved, available, on_order, avg_unit_cost, reorder_level
      FROM dbo.v_item_balances
      WHERE (@search IS NULL OR item_code LIKE N'%' + @search + N'%'
             OR part_no LIKE N'%' + @search + N'%'
             OR description LIKE N'%' + @search + N'%'
             OR brand LIKE N'%' + @search + N'%')
        AND (@reorder_only = 0 OR available <= reorder_level)
      ORDER BY CASE WHEN available <= reorder_level THEN 0 ELSE 1 END, item_code;
    `, (sqlRequest) => {
            sqlRequest.input("search", sql.NVarChar(200), search);
            sqlRequest.input("reorder_only", sql.Bit, reorderOnly);
        });
        return result.recordset.map((row) => ({
            itemId: Number(row.item_id), itemCode: row.item_code, partNumber: row.part_no, description: row.description,
            brand: row.brand, unit: row.unit, location: row.location, usable: Number(row.usable),
            quarantine: Number(row.quarantine), reserved: Number(row.reserved), available: Number(row.available),
            onOrder: Number(row.on_order), averageUnitCost: Number(row.avg_unit_cost), reorderLevel: Number(row.reorder_level),
        }));
    });
    app.get("/api/v1/inventory/items/:itemId/ledger", async (request) => {
        await users.demandPermission(request, "inventory.read");
        const itemId = positiveLong(request.params.itemId, "Item id");
        const result = await database.query(`
      SELECT t.id, t.txn_type, t.qty, t.bucket, t.location, t.ref_no, t.project_id,
             t.note, t.occurred_at, u.name AS by_name
      FROM dbo.stock_txns t
      INNER JOIN dbo.users u ON u.id = t.created_by
      WHERE t.item_id = @item_id
      ORDER BY t.occurred_at DESC, t.id DESC;
    `, (sqlRequest) => sqlRequest.input("item_id", sql.BigInt, itemId));
        return result.recordset.map((row) => ({
            id: Number(row.id), type: row.txn_type, qty: Number(row.qty), bucket: row.bucket,
            location: row.location, reference: row.ref_no, projectId: row.project_id === null ? null : Number(row.project_id),
            note: row.note, occurredAt: row.occurred_at, by: row.by_name,
        }));
    });
}
//# sourceMappingURL=inventory.js.map