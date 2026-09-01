import sql from "mssql/msnodesqlv8.js";
export async function appendStockLedger(transaction, eventKey, transactionType, itemId, quantity, bucket, location, referenceNumber, projectId, unitCost, actorId, note, occurredOn) {
    const request = new sql.Request(transaction);
    request.input("key", sql.NVarChar(200), eventKey);
    request.input("type", sql.NVarChar(50), transactionType);
    request.input("item", sql.BigInt, itemId);
    request.input("qty", sql.Decimal(19, 4), quantity);
    request.input("bucket", sql.NVarChar(30), bucket);
    request.input("location", sql.NVarChar(100), location);
    request.input("reference", sql.NVarChar(100), referenceNumber);
    request.input("project", sql.BigInt, projectId);
    request.input("cost", sql.Decimal(19, 4), unitCost);
    request.input("note", sql.NVarChar(sql.MAX), note);
    request.input("actor", sql.BigInt, actorId);
    request.input("occurred", sql.DateTimeOffset, new Date(`${occurredOn}T00:00:00.000Z`));
    await request.query(`IF NOT EXISTS(SELECT 1 FROM dbo.stock_txns WHERE source_event_key=@key)
    INSERT INTO dbo.stock_txns(source_event_key,txn_type,item_id,qty,bucket,location,ref_no,project_id,unit_cost,note,created_by,occurred_at)
    VALUES(@key,@type,@item,@qty,@bucket,@location,@reference,@project,@cost,@note,@actor,@occurred);`);
}
//# sourceMappingURL=stock-ledger.js.map