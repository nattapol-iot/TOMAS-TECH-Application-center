import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
import { ApiError } from "../errors.js";
import { insertAudit } from "../audit.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import { bodyObject, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { assigned, elevated, estimateAssignees, lockEditableEstimate, touchEstimate, validateReferences } from "./estimate-cost-write.js";
export function setNumber(value: unknown, label: string, max=1000000000): number {
 if(typeof value!=="number" || !Number.isFinite(value) || value<=0 || value>max || Math.abs(value*10000-Math.round(value*10000))>0.001) throw new ApiError(400,"validation_failed",label+" must be positive with up to 4 decimals.");
 return value;
}
export type SetMember={id:number; module:string; category_code:string; price_set_key:string|null; is_price_set:boolean; qty:number; qty_per_set:number|null};
export function validateSetMembers(rows:SetMember[], ids:number[]) {
 if(!ids.length || ids.length>500 || new Set(ids).size!==ids.length || ids.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new ApiError(400,"validation_failed","Select 1–500 unique items.");
 if(rows.length!==ids.length || rows.some(row=>!ids.includes(Number(row.id))))throw new ApiError(409,"concurrency_conflict","Items changed. Reload.");
 if(rows.some(row=>row.price_set_key))throw new ApiError(409,"already_in_set","An item already belongs to a set.");
 if(rows.some(row=>row.module!==rows[0]!.module||row.category_code!==rows[0]!.category_code))throw new ApiError(400,"mixed_modules","Select items in the same module and discipline.");
}
export function registerEstimatePriceSetRoutes(app:FastifyInstance,database:Database,users:CurrentUserService){
 app.post("/api/v1/estimates/:id/price-sets",async request=>{
  await users.demandPermission(request,"estimate.write");const actor=await users.required(request);
  const id=positiveLong((request.params as {id:string}).id,"Estimate");const body=bodyObject(request.body);
  const name=requiredText(body.name,500,"Set name"), reference=requiredText(body.referenceNumber,200,"Quotation reference");
  const quantity=requiredInteger(body.quantity,"Set quantity",1,1000000),price=setNumber(body.unitCost,"Set price");
  if(quantity*price>999999999999999)throw new ApiError(400,"validation_failed","Set total too large.");
  const supplier=requiredInteger(body.supplierId,"Supplier",1);
  const key=body.setKey===undefined?randomUUID():requiredText(body.setKey,36,"Set key");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))throw new ApiError(400,"validation_failed","Invalid set key.");
  const editing=body.setKey!==undefined;
  const ids=Array.isArray(body.lineIds)?body.lineIds as number[]:[];
  const changes=Array.isArray(body.components)?body.components.map(value=>{const row=bodyObject(value);return {id:requiredInteger(row.id,"Item",1),qty:requiredInteger(row.quantityPerSet,"Qty per set",1,1000000000),unit:requiredText(row.unit,50,"Unit")};}):[];
  const additions=Array.isArray(body.newItems)?body.newItems.map(value=>{const row=bodyObject(value);return {code:requiredText(row.itemCode,100,"Item code"),description:requiredText(row.description,500,"Description"),qty:requiredInteger(row.quantityPerSet,"Qty per set",1,1000000000),unit:requiredText(row.unit,50,"Unit")};}):[];
  if(changes.length>500||additions.length>500||new Set(changes.map(row=>row.id)).size!==changes.length)throw new ApiError(400,"validation_failed","Too many or duplicate components.");
  return database.transaction(async transaction=>{
   const estimate=await lockEditableEstimate(transaction,id,parseRowVersion(body.estimateRowVersion));
   if(!elevated(actor,estimate)&&!assigned(actor,await estimateAssignees(transaction,id,estimate.revision)))throw new ApiError(403,"estimate_section_forbidden","No assignment to this estimate.");
   await validateReferences(transaction,actor.id,supplier);
   const q=new sql.Request(transaction);q.input("id",sql.BigInt,id);q.input("revision",sql.Int,estimate.revision);q.input("key",sql.UniqueIdentifier,key);q.input("ids",sql.NVarChar(sql.MAX),JSON.stringify(ids));q.input("actor",sql.BigInt,actor.id);
   const rows=(await q.query<SetMember & {owner_id:number;category:string}>(`SELECT * FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND ${editing?"price_set_key=@key":"id IN(SELECT TRY_CONVERT(bigint,value) FROM OPENJSON(@ids))"};`)).recordset;
   const members=editing?rows.filter(row=>!row.is_price_set):rows;
   if(editing){if(!rows.some(row=>row.is_price_set)||!members.length)throw new ApiError(409,"set_changed","Set changed. Reload.");}else validateSetMembers(rows,ids);
   if(changes.some(change=>!members.some(row=>Number(row.id)===change.id)))throw new ApiError(409,"set_changed","A component no longer belongs to this set.");
   if(members.length+additions.length>500)throw new ApiError(400,"validation_failed","A set supports at most 500 components.");
   for(const row of members){const perSet=changes.find(change=>change.id===Number(row.id))?.qty??Number(editing?row.qty_per_set:row.qty);requiredInteger(perSet,"Qty per set",1,1000000000);requiredInteger(perSet*quantity,"Total component quantity",1,1000000000);}
   for(const row of additions)requiredInteger(row.qty*quantity,"Total component quantity",1,1000000000);
   q.input("name",sql.NVarChar(500),name);q.input("reference",sql.NVarChar(200),reference);q.input("qty",sql.Decimal(19,4),quantity);q.input("price",sql.Decimal(19,4),price);q.input("supplier",sql.BigInt,supplier);
   if(!editing){
    q.input("module",sql.NVarChar(200),members[0]!.module);q.input("category_code",sql.Char(2),members[0]!.category_code);q.input("category",sql.NVarChar(100),rows[0]!.category);q.input("code",sql.NVarChar(100),"SET-"+key);
    await q.query(`INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,qty,unit,unit_cost,price_source,reference_no,supplier_id,owner_id,status,created_by,updated_by,price_set_key,is_price_set,sort_order)
     SELECT @id,@revision,@category_code,@category,N'',@module,@code,@name,N'',N'',@qty,N'Set',@price,N'Supplier Quotation',@reference,@supplier,@actor,N'Active',@actor,@actor,@key,1,MIN(sort_order) FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision AND id IN(SELECT TRY_CONVERT(bigint,value) FROM OPENJSON(@ids));`);
   }else await q.query(`UPDATE dbo.cost_items SET description=@name,qty=@qty,unit_cost=@price,supplier_id=@supplier,reference_no=@reference,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@id AND revision=@revision AND price_set_key=@key AND is_price_set=1 AND deleted_at IS NULL;`);
   await q.query(`UPDATE dbo.cost_items SET price_set_key=@key,qty_per_set=${editing?"qty_per_set":"qty"},qty=${editing?"qty_per_set":"qty"}*@qty,unit_cost=0,supplier_id=@supplier,reference_no=@reference,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@id AND revision=@revision AND deleted_at IS NULL AND ${editing?"price_set_key=@key AND is_price_set=0":"id IN(SELECT TRY_CONVERT(bigint,value) FROM OPENJSON(@ids))"};`);
   for(const component of changes){
    const update=new sql.Request(transaction);update.input("estimate",sql.BigInt,id);update.input("revision",sql.Int,estimate.revision);update.input("line",sql.BigInt,component.id);update.input("key",sql.UniqueIdentifier,key);update.input("per_set",sql.Decimal(19,4),component.qty);update.input("total",sql.Decimal(19,4),component.qty*quantity);update.input("unit",sql.NVarChar(50),component.unit);update.input("actor",sql.BigInt,actor.id);
    await update.query(`UPDATE dbo.cost_items SET qty_per_set=@per_set,qty=@total,unit=@unit,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@estimate AND revision=@revision AND id=@line AND price_set_key=@key AND is_price_set=0 AND deleted_at IS NULL;`);
   }
   for(const component of additions){
    const insert=new sql.Request(transaction);insert.input("estimate",sql.BigInt,id);insert.input("revision",sql.Int,estimate.revision);insert.input("key",sql.UniqueIdentifier,key);insert.input("code",sql.NVarChar(100),component.code);insert.input("description",sql.NVarChar(500),component.description);insert.input("per_set",sql.Decimal(19,4),component.qty);insert.input("total",sql.Decimal(19,4),component.qty*quantity);insert.input("unit",sql.NVarChar(50),component.unit);insert.input("actor",sql.BigInt,actor.id);
    await insert.query(`INSERT dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,qty,unit,unit_cost,price_source,reference_no,supplier_id,owner_id,status,created_by,updated_by,price_set_key,is_price_set,qty_per_set,sort_order)
     SELECT estimate_id,revision,category_code,category,N'',module,@code,@description,N'',N'',@total,@unit,0,price_source,reference_no,supplier_id,@actor,N'Active',@actor,@actor,@key,0,@per_set,sort_order FROM dbo.cost_items WHERE estimate_id=@estimate AND revision=@revision AND price_set_key=@key AND is_price_set=1 AND deleted_at IS NULL;`);
   }
   const after=(await q.query(`SELECT * FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision AND price_set_key=@key AND deleted_at IS NULL;`)).recordset;
   await insertAudit(transaction,actor.id,"Estimate",id,estimate.estimate_no,editing?"Price set updated":"Price set created",{lines:rows},{lines:after});
   await assertEstimateTotals(transaction,id);return {setKey:key,estimateRowVersion:(await touchEstimate(transaction,id,actor.id)).toString("base64")};
  });
 });
 app.put("/api/v1/estimates/:id/cost-items/:lineId/quantity",async request=>{
  await users.demandPermission(request,"estimate.write");const actor=await users.required(request);const params=request.params as {id:string;lineId:string};const id=positiveLong(params.id,"Estimate"),lineId=positiveLong(params.lineId,"Item");const body=bodyObject(request.body);const quantity=requiredInteger(body.quantity,"Quantity",1,1000000000),unit=requiredText(body.unit,50,"Unit");
  return database.transaction(async transaction=>{
   const estimate=await lockEditableEstimate(transaction,id,parseRowVersion(body.estimateRowVersion));
   if(!elevated(actor,estimate)&&!assigned(actor,await estimateAssignees(transaction,id,estimate.revision)))throw new ApiError(403,"cost_line_forbidden","No assignment to this estimate.");
   const q=new sql.Request(transaction);q.input("id",sql.BigInt,id);q.input("revision",sql.Int,estimate.revision);q.input("line",sql.BigInt,lineId);q.input("actor",sql.BigInt,actor.id);q.input("qty",sql.Decimal(19,4),quantity);q.input("unit",sql.NVarChar(50),unit);
   const before=(await q.query(`SELECT * FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND id=@line AND deleted_at IS NULL;`)).recordset[0];
   if(!before||!before.row_version.equals(parseRowVersion(body.lineRowVersion)))throw new ApiError(409,"concurrency_conflict","Item changed. Reload and try again.");
   q.input("key",sql.UniqueIdentifier,before.price_set_key??null);
   const groupBefore=before.price_set_key?(await q.query(`SELECT * FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND price_set_key=@key AND deleted_at IS NULL;`)).recordset:[before];
   if(before.is_price_set){
    for(const member of groupBefore.filter(row=>!row.is_price_set))requiredInteger(Number(member.qty_per_set)*quantity,"Total component quantity",1,1000000000);
    await q.query(`UPDATE dbo.cost_items SET qty=qty_per_set*@qty,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@id AND revision=@revision AND price_set_key=@key AND is_price_set=0 AND deleted_at IS NULL;`);
   }
   let perSet:number|null=null;
   if(before.price_set_key&&!before.is_price_set){const header=groupBefore.find(row=>row.is_price_set);if(!header)throw new ApiError(409,"set_changed","Set header missing.");perSet=requiredInteger(quantity/Number(header.qty),"Quantity per set (total divided by number of sets)",1,1000000000);}
   q.input("per_set",sql.Decimal(19,4),perSet);
   await q.query(`UPDATE dbo.cost_items SET qty=@qty,unit=@unit,qty_per_set=@per_set,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@id AND revision=@revision AND id=@line AND deleted_at IS NULL;`);
   const after=(await q.query(`SELECT * FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision AND (id=@line OR price_set_key=@key) AND deleted_at IS NULL;`)).recordset;
   await insertAudit(transaction,actor.id,"CostItem",lineId,estimate.estimate_no,"Quantity and unit updated",{lines:groupBefore},{lines:after});await assertEstimateTotals(transaction,id);return {estimateRowVersion:(await touchEstimate(transaction,id,actor.id)).toString("base64")};
  });
 });
 app.post("/api/v1/estimates/:id/price-set-detach",async request=>{
  await users.demandPermission(request,"estimate.write");const actor=await users.required(request);const id=positiveLong((request.params as {id:string}).id,"Estimate");const b=bodyObject(request.body);const lineId=requiredInteger(b.lineId,"Item",1);
  return database.transaction(async transaction=>{
   const e=await lockEditableEstimate(transaction,id,parseRowVersion(b.estimateRowVersion));if(!elevated(actor,e)&&!assigned(actor,await estimateAssignees(transaction,id,e.revision)))throw new ApiError(403,"estimate_section_forbidden","No assignment.");
   const q=new sql.Request(transaction);q.input("id",sql.BigInt,id);q.input("revision",sql.Int,e.revision);q.input("line",sql.BigInt,lineId);q.input("actor",sql.BigInt,actor.id);
   const before=(await q.query(`SELECT * FROM dbo.cost_items WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@id AND revision=@revision AND id=@line AND price_set_key IS NOT NULL AND is_price_set=0 AND deleted_at IS NULL;`)).recordset[0];if(!before)throw new ApiError(409,"set_changed","Item is not in a set.");
   q.input("key",sql.UniqueIdentifier,before.price_set_key);
   const groupBefore=(await q.query(`SELECT * FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision AND price_set_key=@key AND deleted_at IS NULL;`)).recordset;
   await q.query(`UPDATE dbo.cost_items SET price_set_key=NULL,qty_per_set=NULL,unit_cost=0,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@line AND estimate_id=@id AND revision=@revision;
    UPDATE header SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() FROM dbo.cost_items header WHERE header.estimate_id=@id AND header.revision=@revision AND header.is_price_set=1 AND header.deleted_at IS NULL AND header.price_set_key=@key AND NOT EXISTS(SELECT 1 FROM dbo.cost_items member WHERE member.estimate_id=@id AND member.revision=@revision AND member.price_set_key=header.price_set_key AND member.is_price_set=0 AND member.deleted_at IS NULL);`);
   const groupAfter=(await q.query(`SELECT * FROM dbo.cost_items WHERE estimate_id=@id AND revision=@revision AND (price_set_key=@key OR id=@line);`)).recordset;
   await insertAudit(transaction,actor.id,"CostItem",lineId,e.estimate_no,"Removed from price set",{lines:groupBefore},{lines:groupAfter,unitCost:0,requiresPriceReview:true});await assertEstimateTotals(transaction,id);return {estimateRowVersion:(await touchEstimate(transaction,id,actor.id)).toString("base64")};
  });
 });
}
