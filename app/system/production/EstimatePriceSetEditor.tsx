"use client";
import { useState } from "react";
import { apiRequest, type BootstrapData, type EstimateCostItem, type EstimateCostWorkspace } from "../api-client";
import { Field, Modal } from "../ui";
export function EstimatePriceSetEditor({workspace,bootstrap,members,header,onClose,onSaved}:{workspace:EstimateCostWorkspace;bootstrap:BootstrapData;members:EstimateCostItem[];header?:EstimateCostItem;onClose:()=>void;onSaved:()=>Promise<void>}){
 const [name,setName]=useState(header?.description??"Equipment Set A");
 const [quantity,setQuantity]=useState(header?.quantity??1);
 const [price,setPrice]=useState(header?.unitCost??members.reduce((sum,line)=>sum+line.lineTotal,0));
 const [supplier,setSupplier]=useState(header?.supplierId??members[0]?.supplierId??0);
 const [reference,setReference]=useState(header?.referenceNumber??members[0]?.referenceNumber??"");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const valid=members.length>0&&name.trim()&&reference.trim()&&supplier>0&&quantity>0&&quantity<=1000000&&price>0&&price<=1000000000;
 const save=async()=>{if(!valid||busy)return;setBusy(true);setError("");try{await apiRequest(`/api/v1/estimates/${workspace.header.id}/price-sets`,{method:"POST",body:JSON.stringify({estimateRowVersion:workspace.header.rowVersion,setKey:header?.priceSetKey,lineIds:members.map(line=>line.id),name,quantity,unitCost:price,supplierId:supplier,referenceNumber:reference})});await onSaved();onClose();}catch(error){setError(error instanceof Error?error.message:"Save failed");}finally{setBusy(false);}};
 return <Modal size="xl" title={header?"แก้ไขราคาเซ็ต / Edit Set Price":"รวมเป็นเซ็ต / Set Price"} onClose={onClose} footer={<><button type="button" className="btn default" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy||!valid} onClick={()=>void save()}>Save set</button></>}>
 {error?<div role="alert" className="info-strip red">{error}</div>:null}
 <div className="info-strip">ราคาเซ็ตแทนที่ราคารายชิ้นที่เลือก ไม่นับซ้ำ • จำนวนอุปกรณ์ด้านล่างเป็นจำนวนต่อ 1 เซ็ต</div>
 <div className="form-grid two"><Field label="ชื่อเซ็ต / Set name"><input maxLength={500} value={name} onChange={e=>setName(e.target.value)} /></Field><Field label="Supplier"><select value={supplier} onChange={e=>setSupplier(Number(e.target.value))}><option value={0}>เลือกผู้ขาย</option>{bootstrap.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="ราคา / Set (THB)"><input type="number" min="0.0001" step="0.0001" value={price} onChange={e=>setPrice(Number(e.target.value))}/></Field><Field label="จำนวนเซ็ต / Sets"><input type="number" min="0.0001" step="0.0001" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></Field><Field label="อ้างอิงใบเสนอราคา / Quotation reference"><input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></Field><Field label="รวมราคาเซ็ต / Total"><input readOnly value={(quantity*price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}/></Field></div>
 <div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Qty / Set</th><th>Total Qty</th><th>Unit</th><th>Price</th></tr></thead><tbody>{members.map(line=><tr key={line.id}><td>{line.itemCode}</td><td>{line.description}</td><td>{line.quantityPerSet??line.quantity}</td><td>{(line.quantityPerSet??line.quantity)*quantity}</td><td>{line.unit}</td><td>รวมในราคาเซ็ต</td></tr>)}</tbody></table></div>
 </Modal>;
}
