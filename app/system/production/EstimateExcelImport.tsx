"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { useEffect, useState } from "react";
import { apiRequest, downloadNamedFile, type BootstrapData, type EstimateCostWorkspace } from "../api-client";
import { Modal, Icon } from "../ui";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { parseEstimateWorkbook, type EstimateImportPreview, type EstimateImportLine } from "../../../lib/estimate-excel-import";

const money = (n: number) => n.toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type ImportRecord = { sourceName: string; sourceHash: string; originalAvailable?: boolean; sourceRevision: string; revision: number; sourceTotal: number; references: EstimateImportLine[]; created: { kind: string; id: number }[]; alreadyImported?: boolean };

export function EstimateImportHistory({ estimateId }: { estimateId: number }) {
  const localizeCopy = useStaticCopy();
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [downloadError, setDownloadError] = useState("");
  const downloadOriginal = async (record: ImportRecord) => {
    setDownloadError("");
    try {
      const file = await downloadNamedFile(`/api/v1/estimates/${estimateId}/excel-imports/${record.revision}/${record.sourceHash}/content`);
      const url = URL.createObjectURL(file.blob); const link = document.createElement("a"); link.href = url; link.download = file.fileName ?? record.sourceName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : "Download failed"); }
  };
  useEffect(() => { let alive = true; void apiRequest<ImportRecord[]>(`/api/v1/estimates/${estimateId}/excel-imports`).then(r => { if (alive) setRecords(r); }).catch(() => undefined); return () => { alive = false; }; }, [estimateId]);
  if (!records.length) return null;
  return <details className="panel" style={{ padding: 16, marginTop: 16 }}><summary><LocalizedText text={"ประวัตินำเข้า Excel และอุปกรณ์ลูกค้าจัดหา ("} />{records.length}<LocalizedText text={")"} /></summary>{downloadError ? <p role="alert">{downloadError}</p> : null}{records.map((r, i) => <div key={i} style={{ marginTop: 12 }}><strong>{r.sourceName}</strong>{r.originalAvailable ? <button className="btn default sm" type="button" onClick={() => { void downloadOriginal(r); }}><Icon name="download" />Original Excel · R{String(r.revision).padStart(2, "0")}</button> : <span className="muted"> · ไม่ได้เก็บต้นฉบับ / Original not stored</span>}<p><LocalizedText text={"ไฟล์"} /> {r.sourceRevision || localizeCopy("ไม่ระบุ revision")} <LocalizedText text={"→ ระบบ R"} />{String(r.revision).padStart(2, "0")} <LocalizedText text={"· ต้นทุน"} /> {money(r.sourceTotal)} <LocalizedText text={"บาท"} /></p>{r.references.map((l, n) => <p key={n}><LocalizedText text={"ลูกค้าจัดหา:"} /> {l.description} {l.model} <LocalizedText text={"·"} /> {l.quantity} {l.unit} <LocalizedText text={"· ไม่นับเป็นต้นทุนซื้อ"} /></p>)}</div>)}</details>;
}

export function EstimateExcelImport({ workspace, bootstrap, onClose, onImported, onLegacy }: { workspace: EstimateCostWorkspace; bootstrap: BootstrapData; onClose: () => void; onImported: () => Promise<void>; onLegacy: () => void }) {
  const localizeCopy = useStaticCopy();
  const [preview, setPreview] = useState<EstimateImportPreview | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [reading, setReading] = useState(false); const [hours, setHours] = useState(8);
  const [date, setDate] = useState("");
  const choose = async (file?: File) => {
    if (!file) return; setReading(true); setError(""); setPreview(null); setOriginalFile(null); setFileName(file.name);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("เลือกไฟล์ .xlsx หรือใช้ตัวนำเข้าตารางทั่วไปสำหรับ CSV/TSV");
      const p = parseEstimateWorkbook(await readWorkbookSheets(file), file.name);
      if (!p) throw new Error("ไม่พบชีต Summary cost สำหรับฟอร์มบริษัท หากเป็นตาราง Header แถวแรก ให้ใช้ตัวนำเข้าตารางทั่วไป");
      for (const l of p.lines) {
        const supplier = bootstrap.suppliers.find(s => [s.name, s.code].some(v => v.trim().toLowerCase() === l.supplierName.toLowerCase()));
        if (supplier) l.supplierId = supplier.id;
      }
      setPreview(p); setDate(p.sourceDate); setOriginalFile(file);
    } catch (e) { setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้"); } finally { setReading(false); }
  };
  const duplicates = preview?.lines.filter(l => l.kind !== "reference" && (workspace.costItems.some(c => c.itemCode.toLowerCase() === l.itemCode.toLowerCase() || (c.module === l.module && c.description === l.description && c.model === l.model && c.brand === l.brand)) || workspace.manhourLines.some(c => c.package === l.module && c.activity === l.description))) ?? [];
  const locked = !["Draft", "Engineering Input", "Revision Required"].includes(workspace.header.status);
  const canImport = preview && !preview.errors.length && !duplicates.length && !locked && date && hours > 0 && hours <= 24 && !busy && !reading;
  const submit = async () => {
    if (!canImport || !originalFile) return; setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("payload", JSON.stringify({ estimateRowVersion: workspace.header.rowVersion, sourceName: fileName, sourceRevision: preview.sourceRevision, sourceDate: date, sourceTotal: preview.sourceTotal, hoursPerDay: hours, lines: preview.lines }));
      body.append("file", originalFile);
      await apiRequest(`/api/v1/estimates/${workspace.header.id}/excel-import`, { method: "POST", body }, 180_000);
      await onImported(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ ทั้งชุดยังไม่ถูกบันทึก"); } finally { setBusy(false); }
  };
  return <Modal title="นำเข้า Excel Estimate Cost" subtitle="เลือกไฟล์บริษัท ตรวจรายการและยอดรวม แล้วบันทึกทั้งชุด" size="xl" onClose={() => { if (!busy && !reading) onClose(); }} footer={<><button type="button" className="btn default" disabled={busy || reading} onClick={onClose}><LocalizedText text={"ยกเลิก"} /></button><button type="button" className="btn primary" disabled={!canImport} onClick={() => { void submit(); }}><Icon name="upload" />{busy ? localizeCopy("กำลังบันทึกทั้งชุด…") : localizeCopy("ยืนยันนำเข้า {count} รายการ").replace("{count}", String(preview?.lines.length ?? 0))}</button></>}>
    <div className="info-strip"><strong><LocalizedText text={"ปลายทาง:"} /> {workspace.header.number} <LocalizedText text={"·"} /> {workspace.header.projectName}</strong><span>R{String(workspace.header.revision).padStart(2, "0")}</span></div>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "16px 0" }}><label><LocalizedText text={"ไฟล์ Estimate Cost (.xlsx)"} /><input aria-label={localizeCopy("ไฟล์ Estimate Cost")} type="file" accept=".xlsx" disabled={busy || reading} onChange={e => { void choose(e.target.files?.[0]); }} /></label><button className="btn default" type="button" disabled={busy || reading} onClick={onLegacy}><LocalizedText text={"ตารางทั่วไป / CSV / TSV"} /></button></div>
    {reading && <p role="status"><LocalizedText text={"กำลังอ่าน Summary และชีตรายละเอียด…"} /></p>}
    {error && <div role="alert" className="callout danger">{localizeCopy(error)}</div>}
    {locked && <div className="callout warning"><LocalizedText text={"Estimate นี้ถูกล็อก กรุณาสร้าง revision ก่อนนำเข้า"} /></div>}
    {preview && <>
      <h3>{preview.project}</h3><p>{preview.customer} <LocalizedText text={"· ไฟล์"} /> {preview.sourceRevision || localizeCopy("ไม่ระบุ revision")}</p>
      <div className="form-grid two"><label><LocalizedText text={"วันที่ราคาจากต้นฉบับ"} /><input aria-label={localizeCopy("วันที่ราคาจากต้นฉบับ")} type="date" value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label><label><LocalizedText text={"ชั่วโมงต่อวันสำหรับค่าแรง"} /><input aria-label={localizeCopy("ชั่วโมงต่อวันสำหรับค่าแรง")} type="number" min="0.01" max="24" step="0.01" value={hours} disabled={busy} onChange={e => setHours(Number(e.target.value))} /></label></div>
      <div className="info-strip" style={{ margin: "16px 0" }}><strong><LocalizedText text={"Summary"} /> {money(preview.sourceTotal)} <LocalizedText text={"บาท"} /></strong><strong><LocalizedText text={"นำเข้า"} /> {money(preview.total)} <LocalizedText text={"บาท"} /></strong><span><LocalizedText text={"ส่วนต่าง"} /> {money(preview.total - preview.sourceTotal)} <LocalizedText text={"บาท"} /></span></div>
      <p><LocalizedText text={"อุปกรณ์/ค่าใช้จ่าย"} /> {preview.lines.filter(l => l.kind === "cost").length} <LocalizedText text={"· ค่าแรง"} /> {preview.lines.filter(l => l.kind === "manhour").length} <LocalizedText text={"· ลูกค้าจัดหา"} /> {preview.lines.filter(l => l.kind === "reference").length}</p>
      {preview.errors.map((e, i) => <div key={i} className="callout danger" role="alert">{e}</div>)}
      {duplicates.length > 0 && <div className="callout danger" role="alert"><LocalizedText text={"พบรายการเดิม"} /> {duplicates.length} <LocalizedText text={"รายการ เช่น"} /> {duplicates.slice(0, 3).map(l => l.itemCode).join(", ")} <LocalizedText text={"กรุณาตรวจ revision ปลายทางเพื่อไม่เพิ่มต้นทุนซ้ำ"} /></div>}
      <details><summary><LocalizedText text={"รายการที่ไม่นำเข้า ("} />{preview.excluded.length}<LocalizedText text={") และข้อควรตรวจ"} /></summary>{preview.warnings.map((w, i) => <p key={i}>{w}</p>)}{preview.excluded.map((w, i) => <p key={`e${i}`}>{w}</p>)}<p><LocalizedText text={"ผู้ขายที่ยังไม่ตรงกับข้อมูลหลักจะเก็บชื่อต้นฉบับไว้ในหมายเหตุ ค่าแรงใช้ 1 คน × จำนวนวันใน Excel × อัตราเดิม"} /></p></details>
      <div className="table-wrap tall" style={{ marginTop: 16 }}><table><thead><tr><th><LocalizedText text={"บันทึกเป็น"} /></th><th><LocalizedText text={"หมวดงาน / รายการ"} /></th><th><LocalizedText text={"ต้นทาง"} /></th><th className="num"><LocalizedText text={"จำนวน"} /></th><th className="num"><LocalizedText text={"ราคาต่อหน่วย"} /></th><th className="num"><LocalizedText text={"รวม"} /></th></tr></thead><tbody>{preview.lines.map((l, i) => <tr key={i}><td>{l.kind === "manhour" ? localizeCopy("Man-hour") : l.kind === "reference" ? localizeCopy("ลูกค้าจัดหา") : localizeCopy("Cost Item")}</td><td><strong>{l.module}</strong><div>{l.description} {l.model}</div></td><td>{l.source}</td><td className="num">{l.quantity} {l.unit}</td><td className="num">{money(l.unitCost)}</td><td className="num">{money(l.quantity * l.unitCost)}</td></tr>)}</tbody></table></div>
      <p><LocalizedText text={"รายการลูกค้าจัดหาเก็บในประวัตินำเข้า ไม่นับเป็นต้นทุนซื้อ การนำเข้าไม่อนุมัติราคาและไม่เปลี่ยนสถานะ Project"} /></p>
    </>}
  </Modal>;
}
