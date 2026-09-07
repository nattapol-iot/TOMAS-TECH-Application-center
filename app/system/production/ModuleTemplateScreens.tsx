"use client";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useRef, useState } from "react";
import "./module-templates.css";
import { ModuleTemplateEditor } from "./ModuleTemplateEditor";
import {
  createModuleTemplate,
  listModuleTemplates,
  loadModuleTemplate,
  retireModuleTemplate,
  updateModuleTemplate,
  type BootstrapData,
  type ModuleTemplateDetail,
  type ModuleTemplateSummary,
} from "../api-client";
import {
  Badge,
  EmptyState,
  Icon,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  TablePageSize,
  Pagination,
} from "../ui";

type Props = { bootstrap: BootstrapData; notify: (message: string) => void };

const COST_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Engineering"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other Cost"],
];
const STALE_TEMPLATE_PRICE_DAYS = 180;

/* Module scope: price age is read when a row is rendered from freshly loaded data,
   never recomputed as a render side effect. */
const priceAgeInDays = (date: string | null) => date ? Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000) : null;
const formatMoney = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(value)) : "—";
const formatUpdated = (value: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
const toError = (error: unknown) => error instanceof Error ? error.message : "Unexpected error";

export function ProductionModuleTemplates({ bootstrap, notify }: Props) {
  const uiText = useUiText();
  const canRead = bootstrap.permissions.includes("estimate.read");
  const canEdit = bootstrap.permissions.includes("estimate.write");
  const canRetire = bootstrap.permissions.includes("master.write");
  const [items, setItems] = useState<ModuleTemplateSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [linePage, setLinePage] = useState(1);
  const [linePageSize, setLinePageSize] = useState(50);
  const loadSequence = useRef(0);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<ModuleTemplateDetail | null>(null);
  const [editor, setEditor] = useState<{ mode: "new" | "copy" | "edit"; template?: ModuleTemplateDetail } | null>(null);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listFailed, setListFailed] = useState(false);
  const hasFilters = Boolean(search || discipline || status);
  const clearFilters = () => { setSearch(""); setDiscipline(""); setStatus(""); setPage(1); };

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!canRead) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await listModuleTemplates({
        search: search || undefined,
        categoryCode: discipline || undefined,
        status: status || undefined,
        page, pageSize,
      });
      if (sequence !== loadSequence.current) return;
      setItems(result.items);
      setTotal(result.total);
      if (page > Math.max(1, Math.ceil(result.total / pageSize))) setPage(1);
      setError("");
      setListFailed(false);
    } catch (requestError) { if (sequence === loadSequence.current) { setError(toError(requestError)); setListFailed(true); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [canRead, search, discipline, status, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = async (id: number) => {
    setDetailError(""); setRetireConfirm(false);
    try { setSelected(await loadModuleTemplate(id)); setLinePage(1); }
    catch (requestError) { setError(toError(requestError)); }
  };

  const retire = async (template: ModuleTemplateDetail) => {
    setBusy(true);
    try {
      await retireModuleTemplate(template.id, template.rowVersion);
      notify(`${template.code} retired · existing estimates keep the lines they already have`);
      setSelected(null);
      await load();
    } catch (requestError) { setDetailError(toError(requestError)); }
    finally { setBusy(false); }
  };

  if (!canRead) {
    return <EmptyState icon="lock" title="No access" message="บัญชีนี้ไม่มีสิทธิ์อ่านคลัง Master Template" />;
  }

  return <div className="module-templates-page">
    <PageHeader
      eyebrow="Master data"
      title={uiText("Module Templates")}
      subtitle="คลังกลุ่มอุปกรณ์ที่ทีมสร้างเองแล้วดึงไปใช้ในใบเสนอราคาได้ทุกใบ"
      actions={<><button className="btn default sm" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>{canEdit ? <button className="btn primary" type="button" onClick={() => setEditor({ mode: "new" })}><Icon name="plus" /><LocalizedText text={"สร้าง Template"} /></button> : null}</>}
    />
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    <div className="module-template-guide"><span className="module-template-guide-icon"><Icon name="layers" /></span><div><strong><LocalizedText text={"สร้างชุด → เพิ่มรายการต่อ 1 ชุด → เลือกใช้ใน Estimate"} /></strong><p><LocalizedText text={"กดสร้าง Template หรือบันทึกจาก Estimate ด้วย Save as template • เมื่อต้องการใช้: Estimate → Cost Items → เลือกจาก Template → ระบุจำนวนชุด"} /></p></div></div>
    <Panel className="module-template-library" title="Template library" subtitle="ค้นหาและจัดการชุดอุปกรณ์สำหรับใบเสนอราคา" actions={<span className="pill blue">{loading ? "…" : total.toLocaleString()} {hasFilters ? <LocalizedText text={"รายการที่พบ"} /> : <LocalizedText text={"Template"} />}</span>} flush>
      <div className="module-template-filters">
        <div className="module-template-search"><span className="module-template-filter-label"><LocalizedText text={"ค้นหาเทมเพลต"} /></span>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหา code, ชื่อ, item, brand" />
        </div>
        <label className="module-template-filter"><span className="module-template-filter-label"><LocalizedText text={"Discipline"} /></span><span className="select-field">
        <select value={discipline} onChange={(event) => { setDiscipline(event.target.value); setPage(1); }}>
          <option value=""><LocalizedText text={"ทุก discipline"} /></option>
          {COST_CATEGORIES.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}
        </select>
        <Icon name="chevronDown" /></span></label>
        <label className="module-template-filter"><span className="module-template-filter-label"><LocalizedText text={"State"} /></span><span className="select-field">
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value=""><LocalizedText text={"ทุกสถานะ"} /></option>
          <option value="Active"><LocalizedText text={"ใช้งาน"} /></option>
          <option value="Draft"><LocalizedText text={"ฉบับร่าง"} /></option>
          <option value="Retired"><LocalizedText text={"เลิกใช้งาน"} /></option>
        </select>
        <Icon name="chevronDown" /></span></label>
      </div>
      <div className="module-template-controls"><div className="module-template-result" role="status">{hasFilters ? <><Icon name="filter" /><span><LocalizedText text={"ผลการค้นหา"} /></span><button className="btn ghost sm" type="button" onClick={clearFilters}><Icon name="x" /><LocalizedText text={"Clear filters"} /></button></> : <><Icon name="package" /><span><LocalizedText text={"เทมเพลตทั้งหมด"} /></span></>}</div><TablePageSize value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>
      {loading ? <div className="empty" role="status"><span className="spinner" /><LocalizedText text={"กำลังโหลดเทมเพลต…"} /></div> : listFailed ? <EmptyState icon="alertCircle" title="โหลดเทมเพลตไม่สำเร็จ" message="ลองโหลดข้อมูลอีกครั้ง" action={<button className="btn default" type="button" onClick={() => { void load(); }}><LocalizedText text={"ลองอีกครั้ง"} /></button>} /> : items.length ? <div className="table-wrap"><table className="module-template-table">
        <thead><tr>
          <th><LocalizedText text={"Template"} /></th>
          <th style={{ width: 150 }}><LocalizedText text={"Discipline"} /></th>
          <th style={{ width: 130 }}><LocalizedText text={"Project type"} /></th>
          <th className="num" style={{ width: 70 }}><LocalizedText text={"Lines"} /></th>
          <th className="num" style={{ width: 150 }}><LocalizedText text={"Reference total"} /></th>
          <th style={{ width: 150 }}><LocalizedText text={"Oldest price"} /></th>
          <th className="num" style={{ width: 70 }}><LocalizedText text={"Used"} /></th>
          <th style={{ width: 100 }}><LocalizedText text={"Status"} /></th>
          <th style={{ width: 170 }}><LocalizedText text={"ผู้สร้าง"} /></th>
          <th style={{ width: 200 }}><LocalizedText text={"Last Updated"} /></th>
          <th style={{ width: 80 }}><span className="sr-only"><LocalizedText text={"เปิดรายละเอียด"} /></span></th>
        </tr></thead>
        <tbody>{items.map((template) => {
          const age = priceAgeInDays(template.oldestPriceDate);
          return <tr key={template.id} className="link-row" onClick={() => { void open(template.id); }}>
            <td><div className="module-template-identity"><span className="module-template-item-icon"><Icon name="package" /></span><div className="cell-primary"><strong>{template.name}</strong><span className="module-template-code">{template.code}</span>{template.description ? <span>{template.description}</span> : null}</div></div></td>
            <td><span className="pill">{template.categoryCode}</span> {template.category}</td>
            <td>{template.projectType || "—"}</td>
            <td className="num">{template.lineCount}</td>
            <td className="num"><strong>{formatMoney(template.referenceTotal)}</strong><span className="module-template-unit"><LocalizedText text={"ต่อ 1 ชุด"} /></span></td>
            <td>{age !== null && age > STALE_TEMPLATE_PRICE_DAYS
              ? <span className="soft-warn">{formatDate(template.oldestPriceDate)} <LocalizedText text={"·"} /> {age} <LocalizedText text={"days"} /></span>
              : formatDate(template.oldestPriceDate)}</td>
            <td className="num">{template.usageCount}</td>
            <td><Badge tone={template.status === "Active" ? "green" : template.status === "Draft" ? "amber" : "slate"}><LocalizedText text={template.status === "Active" ? "Use" : template.status === "Draft" ? "Draft" : "เลิกใช้งาน"} /></Badge></td>
            <td><div className="cell-primary"><strong>{template.createdByName}</strong><span>{formatDate(template.createdAt)}</span></div></td>
            <td><div className="cell-primary"><strong>{template.updatedByName}</strong><span>{formatUpdated(template.updatedAt)}</span><span><LocalizedText text={"Revision"} /> {template.revision}</span></div></td>
            <td><button className="btn default sm" type="button" aria-label={`เปิดเทมเพลต ${template.code}`} onClick={(event) => { event.stopPropagation(); void open(template.id); }}><LocalizedText text={"เปิด"} /><Icon name="chevronRight" /></button></td>
          </tr>;
        })}</tbody>
      </table></div> : hasFilters ? <EmptyState icon="search" title="ไม่พบเทมเพลตที่ตรงกัน" message="ลองเปลี่ยนคำค้นหา หรือเลือก discipline และสถานะอื่น" action={<button className="btn default" type="button" onClick={clearFilters}><LocalizedText text={"Clear filters"} /></button>} /> : <EmptyState icon="package" title="ยังไม่มีเทมเพลต" message="กดสร้าง Template เพื่อเพิ่มชุดแรก หรือเปิดใบเสนอราคาแล้วกด Save as template ในแท็บ Cost Items" />}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} from={total ? (page - 1) * pageSize + 1 : 0} to={Math.min(page * pageSize, total)} total={total} onPage={setPage} />
    </Panel>

    {selected && !editor ? <Modal
      title={`${selected.code} · ${selected.name}`}
      subtitle={`${selected.lineCount} ${uiText("Items")} · ${uiText("Revision")} ${selected.revision} · ${uiText("Last updated by")} ${selected.updatedByName}`}
      size="wide"
      onClose={() => { if (!busy) setSelected(null); }}
      footer={<>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setSelected(null)}><LocalizedText text={"Close"} /></button>
        {canEdit ? <button className="btn default" type="button" disabled={busy} onClick={() => setEditor({ mode: "copy", template: selected })}><Icon name="copy" /><LocalizedText text={"คัดลอกเป็นชุดใหม่"} /></button> : null}
        {canRetire && selected.status !== "Retired"
          ? <button className="btn warn" type="button" disabled={busy} onClick={() => setRetireConfirm(true)}><Icon name="trash" /><LocalizedText text={"เลิกใช้งาน"} /></button>
          : null}
        <span className="spacer" />
        {canEdit && selected.status !== "Retired"
          ? <button className="btn primary" type="button" disabled={busy} onClick={() => setEditor({ mode: "edit", template: selected })}><Icon name="edit" /><LocalizedText text={"แก้ไขชุดและรายการ"} /></button>
          : null}
      </>}
    >
      {detailError ? <div className="info-strip red" role="alert">{detailError}</div> : null}
      {retireConfirm ? <div className="info-strip amber"><span><LocalizedText text={"เลิกใช้งานชุดนี้? ทีมจะเลือกใช้ใน Estimate ใหม่ไม่ได้ แต่ใบเดิมยังคงรายการไว้"} /></span><button type="button" className="btn default sm" disabled={busy} onClick={() => setRetireConfirm(false)}><LocalizedText text={"Cancelled"} /></button><button type="button" className="btn warn sm" disabled={busy} onClick={() => { void retire(selected); }}><LocalizedText text={"ยืนยันเลิกใช้งาน"} /></button></div> : null}
      <dl className="def-list module-template-summary"><div><dt><LocalizedText text={"Discipline"} /></dt><dd><span className="pill">{selected.categoryCode}</span> {selected.category}</dd></div>
        <div><dt><LocalizedText text={"Project type"} /></dt><dd>{selected.projectType || "—"}</dd></div>
        <div><dt><LocalizedText text="Reference total" /></dt><dd><strong>{formatMoney(selected.referenceTotal)}</strong><span className="module-template-summary-suffix"> <LocalizedText text={"/ 1 ชุด"} /></span></dd></div>
        <div><dt><LocalizedText text="Used in" /></dt><dd>{selected.usageCount} <LocalizedText text="Estimates" /></dd></div>
        <div><dt><LocalizedText text="Created by" /></dt><dd>{selected.createdByName}<time>{formatUpdated(selected.createdAt)}</time></dd></div>
        <div><dt><LocalizedText text="Last updated by" /></dt><dd>{selected.updatedByName}<time>{formatUpdated(selected.updatedAt)}</time></dd></div>
        <div><dt><LocalizedText text={"Revision"} /></dt><dd>{selected.revision}</dd></div>
        <div><dt><LocalizedText text={"Status"} /></dt><dd><Badge>{selected.status}</Badge></dd></div>
      </dl>
      {selected.lines.some((line) => !line.referencePriceDate || (priceAgeInDays(line.referencePriceDate) ?? 0) > STALE_TEMPLATE_PRICE_DAYS) ? <div className="info-strip amber"><Icon name="clock" /><span><LocalizedText text={"มีรายการที่ไม่ระบุวันที่ราคา หรือราคาเกิน 180 วัน ควรตรวจสอบราคาก่อนใช้ใน Estimate"} /></span></div> : null}
      {selected.description ? <div className="module-template-description"><Icon name="file" /><div><span><LocalizedText text="Template description" /></span><p>{selected.description}</p></div></div> : null}
      <div className="module-template-lines-head"><div><h3><LocalizedText text="Items in template" /></h3><p>{selected.lineCount} <LocalizedText text="Items" /> <LocalizedText text={"·"} /> <LocalizedText text="Quantity per set" /></p></div><TablePageSize value={linePageSize} onChange={(size) => { setLinePageSize(size); setLinePage(1); }} /></div>
      <div className="table-wrap module-template-detail-table"><table>
        <thead><tr><th style={{ width: 130 }}><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Description"} /></th><th style={{ width: 140 }}><LocalizedText text={"Discipline"} /></th><th style={{ width: 160 }}><LocalizedText text={"Supplier"} /></th><th className="num" style={{ width: 90 }}><LocalizedText text="Qty / set" /></th><th style={{ width: 80 }}><LocalizedText text={"Unit"} /></th><th className="num" style={{ width: 130 }}><LocalizedText text="Reference cost" /></th><th style={{ width: 120 }}><LocalizedText text={"Price date"} /></th></tr></thead>
        <tbody>{selected.lines.slice((linePage - 1) * linePageSize, linePage * linePageSize).map((line) => <tr key={line.id}>
          <td><strong className="mono">{line.itemCode}</strong></td>
          <td><div className="cell-primary"><strong>{line.description}</strong>{line.brand || line.model ? <span>{[line.brand, line.model].filter(Boolean).join(" · ")}</span> : null}</div></td>
          <td><span className="pill">{line.categoryCode}</span> {line.category}</td>
          <td>{line.supplierName ?? "—"}</td>
          <td className="num">{line.quantityPerModule}</td>
          <td>{line.unit}</td>
          <td className="num">{formatMoney(line.referenceUnitCost)}</td>
          <td>{formatDate(line.referencePriceDate)}</td>
        </tr>)}</tbody>
      </table></div>
      <Pagination page={linePage} pageCount={Math.max(1, Math.ceil(selected.lines.length / linePageSize))} from={selected.lines.length ? (linePage - 1) * linePageSize + 1 : 0} to={Math.min(linePage * linePageSize, selected.lines.length)} total={selected.lines.length} onPage={setLinePage} />
    </Modal> : null}

    {editor ? <ModuleTemplateEditor
      template={editor.template}
      duplicate={editor.mode === "copy"}
      suppliers={bootstrap.suppliers}
      onClose={() => setEditor(null)}
      onSave={async (values) => {
        let savedId: number;
        if (editor.mode === "edit" && editor.template) {
          await updateModuleTemplate(editor.template.id, { ...values, rowVersion: editor.template.rowVersion });
          savedId = editor.template.id;
        } else {
          savedId = (await createModuleTemplate(values)).id;
        }
        setEditor(null);
        notify(`${values.name} · ${uiText("บันทึก Template แล้ว")}`);
        await load();
        await open(savedId);
      }}
    /> : null}
  </div>;
}
