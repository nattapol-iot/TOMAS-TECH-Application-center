"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, downloadHistoricalPrSource } from "../api-client";
import { Badge, EmptyState, Field, Icon, KpiCard, Modal, Panel } from "../ui";
import type { HistoricalWorkbook } from "../../../backend-node/src/historical-pr";
import { useT, currentLocale } from "../i18n";
import { historicalPrComparison } from "../../../lib/historical-pr-reconciliation";

type Link = { estimateLineId: number | null; replacementKey: string | null };
type Summary = { id: number; projectId: number | null; projectNumber: string; projectName: string; documentReference: string; revision: number;
  sourceName: string; createdAt: string; importedBy: string; lineCount: number; totals: HistoricalWorkbook["totals"]; unmapped: number; awaitingReplacement: number };
type Preview = { workbook: HistoricalWorkbook; project: { id: number | null; number: string; name: string }; documentReference: string;
  existingId: number | null; existingRevision: number | null; duplicateId: number | null };
type Detail = { id: number; projectId: number | null; documentReference: string; revision: number; isCurrent: boolean; rowVersion: string; workbook: HistoricalWorkbook;
  links: Record<string, Link>; versions: { id: number; revision: number; isCurrent: boolean; createdAt: string }[];
  estimateLines: { id: number; module: string; itemCode: string; description: string; quantity: number; unitCost: number; unit: string; estimateNumber: string; revision: number }[] };
const cash = (v: number) => v.toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorText = (e: unknown) => e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ";
const post = (data: unknown) => ({ method: "POST", body: JSON.stringify(data) });
const date = (v: string) => new Date(v).toLocaleString(currentLocale());
function ErrorMessage({ message }: { message: string }) {
  const t = useT(); return message ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{t(message)}</span></div> : null; }
function Totals({ totals }: { totals: HistoricalWorkbook["totals"] }) {
  const t = useT();
  return <><div className="kpi-grid four">
    <KpiCard label={t("PO อนุมัติแล้ว")} value={cash(totals.approved)} note={t("บาท · ตามสถานะในไฟล์")} icon="checkCircle" tone="green" />
    <KpiCard label={t("PO รออนุมัติ")} value={cash(totals.pending)} note={t("บาท")} icon="clock" tone="amber" />
    <KpiCard label={t("PO ยกเลิกเดิม")} value={cash(totals.cancelled)} note={t("บาท · เก็บรายการไว้จับคู่ PO ทดแทน")} icon="refresh" tone="violet" />
    <KpiCard label={t("ยอด PO ที่ยังมีผล")} value={cash(totals.active)} note={t("บาท · อนุมัติแล้ว + รออนุมัติ")} icon="chart" tone="blue" />
  </div>{totals.unknown > 0 ? <p>{t("ยอดที่ยังไม่ทราบสถานะ PO:")}{" "}{cash(totals.unknown)} {t("บาท")}</p> : null}</>;
}

export function HistoricalPrPanel({ canImport, notify }: { canImport: boolean; notify: (message: string) => void }) {
  const t = useT();
  const [items, setItems] = useState<Summary[]>([]), [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [importing, setImporting] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    apiRequest<Summary[]>("/api/v1/historical-pr", { signal: controller.signal }).then(data => { if (active) { setItems(data); setError(""); } })
      .catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [tick]);
  const refresh = () => { setLoading(true); setTick(n => n + 1); };
  const visible = items.filter(i => `${i.documentReference} ${i.projectNumber} ${i.projectName} ${i.sourceName}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <Panel title={t("PR ย้อนหลัง")} subtitle={t("ประวัติ PR / PO จาก Excel พร้อมจับคู่ Estimate และรายการทดแทน")}>
      <div className="toolbar">
        <input aria-label={t("ค้นหา PR ย้อนหลัง")} placeholder={t("ค้นหาเลข Project หรือชื่อไฟล์ PR…")} value={search} onChange={e => setSearch(e.target.value)} />
        <button type="button" className="btn ghost" disabled={loading} onClick={refresh}><Icon name="refresh" />{t("Refresh")}</button>
        {canImport ? <button type="button" className="btn primary" onClick={() => setImporting(true)}><Icon name="upload" />{t("Import PR ย้อนหลัง")}</button> : null}
      </div>
      <ErrorMessage message={error} />
      {loading ? <p role="status">{t("กำลังโหลด PR ย้อนหลัง…")}</p> : visible.length ? <div className="table-wrap"><table><thead><tr><th>{t("PR / ไฟล์เดิม")}</th><th>{t("Project")}</th><th>{t("รายการ")}</th><th>{t("PO อนุมัติแล้ว")}</th><th>{t("รออนุมัติ")}</th><th>{t("การจับคู่")}</th><th>{t("นำเข้าโดย")}</th><th>{t("เปิด")}</th></tr></thead><tbody>
        {visible.map(i => <tr key={i.id}><td><strong>{i.documentReference}</strong><small className="muted">{t("Historical · ไฟล์รุ่น")}{" "}{i.revision}</small></td><td><strong>{i.projectNumber}</strong>{i.projectId === null ? <Badge tone="amber">{t("รอเชื่อม Project")}</Badge> : null}<small className="muted">{i.projectName}</small></td><td className="num">{i.lineCount}</td><td className="num">{cash(i.totals.approved)}</td><td className="num">{cash(i.totals.pending)}</td><td><small>{i.unmapped} {t("รายการยังไม่จับคู่ Estimate")}</small><small className="muted">{i.awaitingReplacement} {t("รายการรอจับคู่ PO ทดแทน")}</small></td><td>{i.importedBy}<small className="muted">{date(i.createdAt)}</small></td><td><button className="btn ghost sm" type="button" onClick={() => setSelected(i.id)}><Icon name="eye" />{t("ดูรายการ")}</button></td></tr>)}
      </tbody></table></div> : !error ? <EmptyState icon="upload" title={t("ยังไม่มี PR ย้อนหลังที่ตรงกับการค้นหา")} message={t("นำเข้าไฟล์ PR เดิมเพื่อค้นประวัติและเชื่อมรายการกับ Estimate")} /> : null}
    </Panel>
    {importing ? <ImportModal onClose={() => setImporting(false)} onCreated={id => { setImporting(false); refresh(); setSelected(id); notify(t("เปิด PR ย้อนหลังเรียบร้อย")); }} /> : null}
    {selected ? <HistoryDetail key={selected} id={selected} canEdit={canImport} onSelect={setSelected} onClose={() => { setSelected(null); refresh(); }} notify={notify} /> : null}
  </>;
}

function filePayload(file: File): Promise<{ sourceName: string; fileBase64: string }> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) return Promise.reject(new Error("เลือกไฟล์ .xlsx ขนาดไม่เกิน 8 MB"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
    reader.onload = () => resolve({ sourceName: file.name, fileBase64: String(reader.result).split(",")[1] ?? "" }); reader.readAsDataURL(file);
  });
}
function ImportModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null), [reference, setReference] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function inspect() {
    if (!file) return; setBusy(true); setError(""); setPreview(null);
    try { const payload = await filePayload(file); const p = await apiRequest<Preview>("/api/v1/historical-pr/preview", post({ ...payload, ...(reference.trim() ? { documentReference: reference } : {}) })); setPreview(p); setReference(p.documentReference); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function save() {
    if (!file || !preview) return;
    if (preview.duplicateId) { onCreated(preview.duplicateId); return; }
    setBusy(true); setError("");
    try { const result = await apiRequest<{ id: number }>("/api/v1/historical-pr", post({ ...await filePayload(file), documentReference: preview.documentReference, expectedCurrentId: preview.existingId })); onCreated(result.id); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Modal title={t("Import PR ย้อนหลัง")} subtitle={t("รองรับฟอร์ม PR เดิมของทีม · เลือกไฟล์แล้วตรวจรายการก่อนนำเข้า")} size="xl" onClose={() => { if (!busy) onClose(); }} footer={<>
    <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{t("ปิด")}</button>
    <button type="button" className="btn ghost" disabled={!file || busy} onClick={() => void inspect()}>{busy ? t("กำลังดำเนินการ…") : t("ตรวจไฟล์ / Preview")}</button>
    <button type="button" className="btn primary" disabled={!preview || busy} onClick={() => void save()}>{preview?.duplicateId ? t("เปิดรายการที่นำเข้าแล้ว") : preview?.existingId ? t("บันทึกเป็นไฟล์รุ่นใหม่") : t("ยืนยันนำเข้า")}</button>
  </>}>
    <Field label={t("ไฟล์ PR (.xlsx)")}><input type="file" accept=".xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setReference(""); setError(""); }} /></Field>
    <Field label={t("อ้างอิง PR เดิม / ชื่อชุดเอกสาร")}><input value={reference} maxLength={200} disabled={busy} placeholder={t("อ่านจาก Document Ref. หรือชื่อไฟล์")} onChange={e => { setReference(e.target.value); setPreview(null); }} /><small>{t("ถ้านำเข้าไฟล์อัปเดตของ PR เดิม ให้ใช้อ้างอิงเดียวกันเพื่อเก็บเป็นรุ่นใหม่")}</small></Field>
    <ErrorMessage message={error} />
    {preview ? <>
      <h3>{preview.project.number} {t("·")}{" "}{preview.project.name}</h3>
      {preview.project.id === null ? <div className="callout">{t("ยังไม่มี Project เลขนี้ในระบบ จะเก็บประวัติด้วยเลขเดิมและสถานะ “รอเชื่อม Project”")}</div> : null}
      <p>{t("พบ")}{" "}{preview.workbook.lines.length} {t("รายการ · ขีดกลาง = ออก PR แล้ว · Cancelled = ยกเลิกเฉพาะ PO เดิม")}</p>
      <Totals totals={preview.workbook.totals} />
      {preview.duplicateId ? <div className="callout">{t("ไฟล์นี้นำเข้าแล้ว ระบบจะเปิดรายการเดิมให้")}</div> : preview.existingId ? <div className="callout">{t("มีเอกสารอ้างอิงนี้อยู่แล้ว รุ่น")}{" "}{preview.existingRevision} {t("การบันทึกจะใช้ไฟล์นี้เป็นรุ่นล่าสุด และเก็บไฟล์กับการจับคู่รุ่นเดิมไว้ในประวัติ กรุณาจับคู่รายการของรุ่นใหม่อีกครั้ง")}</div> : null}
      <p>{t("บันทึกเป็นประวัติย้อนหลัง สถานะรับของยังไม่ทราบจนกว่าจะมีหลักฐานรับของ")}</p>
      {preview.workbook.warnings.length ? <details><summary>{t("ข้อมูลที่ควรตรวจ (")}{" "}{preview.workbook.warnings.length}{" "}{t(")")}</summary><ul>{preview.workbook.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details> : null}
      <LinesTable workbook={preview.workbook} />
    </> : <p>{t("ระบบจะจับ Project จากเลขในไฟล์ และเก็บรายการทุก revision รวมถึง Item ของ PO ที่ยกเลิก")}</p>}
  </Modal>;
}

function LinesTable({ workbook, expanded = false }: { workbook: HistoricalWorkbook; expanded?: boolean }) {
  const t = useT();
  return <div className={`table-wrap tall historical-pr-lines${expanded ? " expanded" : ""}`}><table><thead><tr><th>{t("Rev. / แถว")}</th><th>{t("Item / รายละเอียด")}</th><th>{t("จำนวน")}</th><th>{t("Supplier / QT")}</th><th>{t("ราคา/หน่วย")}</th><th>{t("Total price")}</th><th>{t("Actual cost เดิม")}</th><th>{t("PO / สถานะ")}</th></tr></thead><tbody>
    {workbook.lines.map(l => <tr key={l.key}><td>{l.revision}<small className="muted">{l.key}<br />{l.issuedBy} {t("·")}{" "}{l.issuedDate || t("ไม่ระบุวันที่")}</small></td><td><strong>{l.partNumber}</strong><small style={{ whiteSpace: "pre-wrap" }} className="muted">{l.description}</small>{l.prIssued ? <small>{t("ออก PR แล้ว")}</small> : null}</td><td className="num">{l.quantity} {l.unit}</td><td>{l.supplier}<small className="muted">{l.quotation}</small></td><td className="num">{cash(l.unitPrice)}</td><td className="num">{cash(l.totalPrice)}</td><td className="num">{l.actualCost === null ? l.actualCostText || t("ไม่ระบุ") : cash(l.actualCost)}</td><td>{l.poNumber || t("ยังไม่มีเลข PO")}<small><Badge tone={l.status === "Approved" ? "green" : l.status === "Cancelled" ? "violet" : "amber"}>{l.poStatus || t("ไม่ทราบสถานะ")}</Badge></small>{l.status === "Cancelled" ? <small>{t("Item ยังใช้งาน · รอเชื่อม PO ทดแทน")}</small> : null}</td></tr>)}
  </tbody></table></div>;
}

function HistoryDetail({ id, canEdit, onSelect, onClose, notify }: { id: number; canEdit: boolean; onSelect: (id: number) => void; onClose: () => void; notify: (m: string) => void }) {
  const t = useT();
  const [detail, setDetail] = useState<Detail | null>(null), [links, setLinks] = useState<Record<string, Link>>({});
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await apiRequest<Detail>(`/api/v1/historical-pr/${id}`, { ...(signal ? { signal } : {}) }); if (signal?.aborted) return; setDetail(data); setLinks(data.links); setError(""); }
    catch (e) { if (!signal?.aborted) setError(errorText(e)); } finally { if (!signal?.aborted) setLoading(false); }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Detail>(`/api/v1/historical-pr/${id}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setDetail(data); setLinks(data.links); setError(""); } })
      .catch(e => { if (!controller.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  async function save() {
    if (!detail) return; setBusy(true); setError("");
    try { await apiRequest(`/api/v1/historical-pr/${id}/links`, { method: "PUT", body: JSON.stringify({ rowVersion: detail.rowVersion, links }) }); notify(t("บันทึกการจับคู่แล้ว")); await load(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function download() {
    if (!detail) return; setBusy(true); setError("");
    try { const blob = await downloadHistoricalPrSource(id); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = detail.workbook.sourceName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function linkProject() {
    if (!detail) return; setBusy(true); setError("");
    try { await apiRequest(`/api/v1/historical-pr/${id}/link-project`, post({ rowVersion: detail.rowVersion })); await load(); notify(t("เชื่อม Project แล้ว")); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const update = (key: string, value: Partial<Link>) => setLinks(current => ({ ...current, [key]: { ...(current[key] ?? { estimateLineId: null, replacementKey: null }), ...value } }));
  const dirty = detail !== null && JSON.stringify(links) !== JSON.stringify(detail.links);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);
  const discardChanges = () => !dirty || window.confirm(t("มีการจับคู่ที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?"));
  const close = () => { if (!busy && discardChanges()) onClose(); };
  const staleKeys = detail?.workbook.lines.filter(line => links[line.key]?.estimateLineId && !detail.estimateLines.some(candidate => candidate.id === links[line.key]?.estimateLineId)).map(line => line.key) ?? [];
  const editable = canEdit && detail?.isCurrent && !busy && !loading;
  return <Modal title={detail?.documentReference ?? t("PR ย้อนหลัง")} subtitle={t("Historical PR · เก็บรายละเอียดต้นฉบับและประวัติ PO")} size="wide" onClose={close} footer={<>
    <button className="btn ghost" type="button" disabled={busy} onClick={close}>{t("ปิด")}</button>
    <button className="btn ghost" type="button" disabled={busy || loading || !detail} onClick={() => void download()}><Icon name="download" />{t("ไฟล์ต้นฉบับ")}</button>
    {canEdit && detail?.isCurrent ? <button className="btn primary" type="button" disabled={!editable || !dirty || staleKeys.length > 0} onClick={() => void save()}>{t("บันทึกการจับคู่")}</button> : null}
  </>}>
    <ErrorMessage message={error} />{error ? <button className="btn ghost" type="button" onClick={() => { if (discardChanges()) void load(); }}>{t("ลองโหลดใหม่")}</button> : null}
    {loading ? <p role="status">{t("กำลังโหลด…")}</p> : detail ? <div className="historical-pr-detail">
      <div className="historical-pr-context">
        <Field label={t("ประวัติไฟล์นำเข้า")}><select disabled={busy} value={id} onChange={e => { if (discardChanges()) onSelect(Number(e.target.value)); }}>{detail.versions.map(v => <option key={v.id} value={v.id}>{t("รุ่น")}{" "}{v.revision}{v.isCurrent ? t(" (ล่าสุด)") : t(" (ประวัติ)")} {t("·")}{" "}{date(v.createdAt)}</option>)}</select></Field>
        <div className="historical-pr-project-summary">
          <span>{t("Project")}</span>
          <strong>{detail.workbook.projectNumber}</strong>
          <small>{detail.workbook.projectName} {t("·")}{" "}{detail.workbook.lines.length} {t("รายการ")}</small>
        </div>
      </div>
      {detail.projectId === null ? <div className="callout"><span>{t("รอเชื่อม Project")}{" "}{detail.workbook.projectNumber} {t("· เมื่อสร้างโครงการด้วยเลขนี้แล้ว กดเชื่อมเพื่อจับคู่ Estimate")}</span>{canEdit && detail.isCurrent ? <button className="btn ghost" type="button" disabled={busy || dirty} onClick={() => void linkProject()}>{t("เชื่อม Project")}</button> : null}</div> : null}
      <Totals totals={detail.workbook.totals} />
      <LinesTable workbook={detail.workbook} expanded />
      <h3>{t("จับคู่ Estimate / Module และ PO ทดแทน")}</h3>
      {dirty ? <p role="status">{t("มีการจับคู่ที่ยังไม่ได้บันทึก")}</p> : null}
      {staleKeys.length ? <div className="callout danger" role="alert">{t("Estimate เปลี่ยน revision แล้ว มี")}{" "}{staleKeys.length} {t("รายการที่ต้องจับคู่ใหม่ หรือเลือก “ยังไม่จับคู่” ก่อนบันทึก")}</div> : null}
      <p>{t("เลือก Estimate line ให้ตรงรายการ และเลือก Item จาก PO ใหม่สำหรับ PO ที่ยกเลิก สถานะรับของและ Stock ต้องตรวจจากข้อมูลรับของแยกต่างหาก")}</p>
      {!detail.estimateLines.length ? <p>{t("Project นี้ยังไม่มีรายการใน Estimate revision ปัจจุบัน สามารถกลับมาจับคู่ภายหลังได้")}</p> : null}
      <div className="table-wrap historical-pr-mapping"><table><thead><tr><th>{t("Item เดิม")}</th><th>{t("Estimate / Module")}</th><th>{t("Item จาก PO ทดแทน")}</th></tr></thead><tbody>{detail.workbook.lines.map(l => <tr key={l.key}><td>{l.partNumber}<small className="muted">{l.key} {t("·")}{" "}{l.poNumber}</small></td><td><select aria-label={`Estimate ${l.key}`} disabled={!editable} value={links[l.key]?.estimateLineId ?? ""} onChange={e => update(l.key, { estimateLineId: e.target.value ? Number(e.target.value) : null })}><option value="">{t("ยังไม่จับคู่")}</option>{staleKeys.includes(l.key) ? <option value={links[l.key]?.estimateLineId ?? ""}>{t("รายการ Estimate เดิมไม่อยู่ใน revision ปัจจุบัน")}</option> : null}{detail.estimateLines.map(c => <option key={c.id} value={c.id}>{c.estimateNumber} {t("R")}{" "}{c.revision} {t("·")}{" "}{c.module} {t("·")}{" "}{c.itemCode} {t("·")}{" "}{c.description}</option>)}</select></td><td>{l.status === "Cancelled" ? <select aria-label={`${t("Item จาก PO ทดแทน")} ${l.key}`} disabled={!editable} value={links[l.key]?.replacementKey ?? ""} onChange={e => update(l.key, { replacementKey: e.target.value || null })}><option value="">{t("ยังไม่ระบุ / PO ใหม่อยู่นอกไฟล์นี้")}</option>{detail.workbook.lines.filter(t => ["Approved", "Pending"].includes(t.status) && t.poNumber && t.poNumber !== l.poNumber).map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.poNumber} · {candidate.partNumber} · {candidate.description}</option>)}</select> : "—"}</td></tr>)}</tbody></table></div>
      <h3>{t("เทียบงบเฉพาะรายการที่จับคู่ในไฟล์นี้")}</h3>
      <p>{t("ยอดด้านล่างไม่รวม PO ที่ยกเลิกและไม่รวม PR จากเอกสารอื่น จึงยังไม่ใช่ต้นทุนรวมทั้ง Project")}</p>
      <div className="table-wrap"><table><thead><tr><th>{t("Estimate / Module")}</th><th>{t("งบ Estimate line")}</th><th>{t("PO อนุมัติ + รออนุมัติที่จับคู่")}</th><th>{t("ส่วนต่างจากงบ")}</th></tr></thead><tbody>{detail.estimateLines.filter(c => detail.workbook.lines.some(l => links[l.key]?.estimateLineId === c.id)).map(c => {
        const { amount, budget, variance, quotedRows } = historicalPrComparison(detail.workbook.lines, links, c);
        return <tr key={c.id}><td>{c.module} {t("·")}{" "}{c.itemCode}</td><td className="num">{cash(budget)}</td><td className="num">{cash(amount)}{quotedRows ? <small className="muted">{t("ใช้ราคาอ้างอิง")}{" "}{quotedRows} {t("รายการที่ยังไม่มี Actual cost")}</small> : null}</td><td className="num">{variance === null ? t("ยังไม่มีงบสำหรับเปรียบเทียบ") : cash(variance)}</td></tr>;
      })}</tbody></table></div>
    </div> : null}
  </Modal>;
}
