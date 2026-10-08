"use client";
import { useMemo, useRef, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, FilterChips, Icon, Pagination, Panel, SearchInput, TablePageSize, Toolbar, type FilterItem } from "../ui";
import { exportXlsx } from "../../../lib/export-xlsx";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { asPlanned, asSubstitute, draftFromBom, draftFromSheet, draftIssues, moduleStatus, payloadLines, sheetRows, templateRows,
  type PrBomLine, type PrDraftRow, type PrModuleBudget, type PrModuleStatus, type PrRowKind } from "../../../lib/pr-spreadsheet";
import { useEndpoint } from "./material-endpoint";

type ReleasedBom = { id: number; number: string; status: string; projectNumber: string; projectName: string };
type Workspace = { bom: { id: number; number: string; projectNumber: string; projectName: string }; lines: Array<PrBomLine & { purchaseRequired: number }>; modules: PrModuleBudget[] };

const EMPTY: never[] = [];
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const quantity = (value: number) => Number(value).toLocaleString(currentLocale(), { maximumFractionDigits: 4 });
const inDays = (days: number) => estimateBusinessDate(new Date(Date.now() + days * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const KIND_TONE: Record<PrRowKind, "blue" | "violet" | "amber"> = { Planned: "blue", Substitute: "violet", Unplanned: "amber" };
const KIND_LABEL: Record<PrRowKind, string> = { Planned: "ตรงแผน", Substitute: "ทดแทน", Unplanned: "นอกแผน" };
const LEVEL_TONE = { ok: "green", manager: "amber", management: "red" } as const;
const FIELD_LABEL = { itemCode: "Item code", partNumber: "Part No.", description: "Description", brand: "Brand", unit: "Unit" } as const;

function budgetNote(status: PrModuleStatus): string {
  if (status.level === "ok") return "อยู่ในงบ";
  return status.level === "manager" ? "เกินงบไม่เกิน 10% · PM อนุมัติ" : "เกินงบเกิน 10% · Engineering Manager อนุมัติเพิ่ม";
}

/**
 * A full-page PR sheet for many lines. The engineer starts from everything the BOM still needs, changes what differs (another make, an item the
 * estimate missed), or round-trips the sheet through Excel; each module's budget decides whether an overrun needs more than the PM's approval.
 * No supplier here: Purchasing chooses it at Purchasing Review.
 */
export function PurchaseRequestEditor({ released, onClose, onCreated }: { bootstrap: BootstrapData; released: ReleasedBom[]; onClose: () => void; onCreated: (number: string) => void }) {
  const t = useT();
  const [bomId, setBomId] = useState(0);
  const effectiveBomId = bomId || released[0]?.id || 0;
  const workspace = useEndpoint<Workspace | null>(effectiveBomId ? `/api/v1/boms/${effectiveBomId}` : null, null);
  const lines = useMemo(() => new Map((workspace.data?.lines ?? EMPTY).map((line) => [line.id, { ...line, remaining: Number(line.purchaseRequired) }])), [workspace.data]);
  const modules = useMemo(() => (workspace.data?.modules ?? EMPTY).map((module) => module.module), [workspace.data]);
  const startingRows = useMemo(() => draftFromBom([...lines.values()]), [lines]);
  // The rows the engineer has touched, for this BOM only; until then the sheet is what the BOM still needs.
  const [draft, setDraft] = useState<{ bomId: number; rows: PrDraftRow[] } | null>(null);
  const rows = draft && draft.bomId === effectiveBomId ? draft.rows : startingRows;
  const setRows = (next: PrDraftRow[]) => setDraft({ bomId: effectiveBomId, rows: next });
  const update = (key: string, patch: Partial<PrDraftRow>) => setRows(rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  const [priority, setPriority] = useState("Normal");
  const [requiredDate, setRequiredDate] = useState(inDays(14));
  const [purpose, setPurpose] = useState("");
  const [module, setModule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverIssue, setServerIssue] = useState<{ key: string; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => draftIssues(rows, lines, modules), [rows, lines, modules]);
  const statuses = useMemo(() => moduleStatus(rows, workspace.data?.modules ?? EMPTY), [rows, workspace.data]);
  const selected = rows.filter((row) => row.selected);
  const total = selected.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const needsManagement = statuses.some((status) => status.level === "management");
  const visible = rows.filter((row) => (!module || row.module.toLocaleLowerCase() === module.toLocaleLowerCase())
    && (!search.trim() || `${row.itemCode} ${row.partNumber} ${row.description} ${row.brand}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chips: FilterItem[] = statuses.map((status) => ({ key: status.module, label: status.module, value: status.lines, tone: LEVEL_TONE[status.level] }));
  const kinds = (kind: PrRowKind) => selected.filter((row) => row.lineType === kind).length;

  const addUnplanned = () => {
    const key = `new-${Date.now()}`;
    setRows([...rows, { key, selected: true, lineType: "Unplanned", bomLineId: null, module: module ?? modules[0] ?? "", itemCode: "", partNumber: "", description: "", brand: "",
      unit: "pcs", quantity: 1, coveredQuantity: null, unitPrice: 0, remark: "" }]);
    setSearch(""); setPage(Math.ceil((visible.length + 1) / pageSize));
  };
  const download = () => {
    const bom = workspace.data?.bom; if (!bom) return;
    exportXlsx(templateRows(`PR · ${bom.number} · ${bom.projectNumber} ${bom.projectName}`, rows, lines), `PR_${bom.number}_${inDays(0)}.xlsx`);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(""); setNotice("");
    try {
      const sheets = await readWorkbookSheets(file);
      const read = sheets.map((sheet) => draftFromSheet(sheetRows(sheet.cells), [...lines.values()], modules)).find((result) => result && result.rows.length);
      if (!read) { setError(t("ไม่พบตารางรายการในไฟล์ (ต้องมีหัวคอลัมน์ Description หรือ Part No. และ Qty หรือเป็นฟอร์ม TOMAS PR)")); return; }
      setRows(read.rows); setModule(null); setSearch(""); setPage(1); setServerIssue(null);
      const count = (kind: PrRowKind) => read.rows.filter((row) => row.lineType === kind).length;
      setNotice(`${t("นำเข้าแล้ว")} ${read.rows.length} · ${t(KIND_LABEL.Planned)} ${count("Planned")} · ${t(KIND_LABEL.Substitute)} ${count("Substitute")} · ${t(KIND_LABEL.Unplanned)} ${count("Unplanned")}${read.skipped ? ` · ${t("ข้ามแถวที่ไม่มีจำนวน")} ${read.skipped}` : ""}`);
    } catch (readError) { setError(readError instanceof Error ? readError.message : String(readError)); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  };
  const submit = async () => {
    setBusy(true); setError(""); setServerIssue(null);
    try {
      const created = await apiRequest<{ number: string }>("/api/v1/purchase-requisitions/", { method: "POST", body: JSON.stringify({ bomId: effectiveBomId, priority, requiredDate, purpose: purpose || undefined, lines: payloadLines(rows) }) });
      onCreated(created.number);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      // "Line n" counts the ticked rows in screen order; point at that row.
      const line = Number(/^Line (\d+):/.exec(message)?.[1] ?? 0);
      const row = line ? selected[line - 1] : undefined;
      if (row) { setServerIssue({ key: row.key, message }); const index = visible.findIndex((item) => item.key === row.key); if (index >= 0) setPage(Math.floor(index / pageSize) + 1); }
      setError(message);
    } finally { setBusy(false); }
  };

  return (
    <Panel title="ขอซื้อ (PR)" subtitle="เริ่มจากรายการที่ BOM ยังต้องซื้อ เปลี่ยนรุ่นหรือเพิ่มของนอกแผนได้ ภายในงบของ Module ไม่ต้องขออนุมัติเพิ่ม · Supplier ให้ฝ่ายจัดซื้อเลือก"
      actions={<button className="btn ghost" type="button" onClick={onClose} disabled={busy}><Icon name="arrowLeft" /><LocalizedText text={"กลับไปรายการ PR"} /></button>}>
      <div className="form-grid two">
        <Field label="Released BOM"><select value={effectiveBomId} onChange={(event) => { setBomId(Number(event.target.value)); setModule(null); setPage(1); setNotice(""); setServerIssue(null); }}>
          <option value={0}>{t("Select BOM…")}</option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} · {bom.projectNumber} · {bom.projectName}</option>)}</select></Field>
        <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="Normal">{t("Normal")}</option><option value="High">{t("High")}</option><option value="Emergency">{t("Emergency")}</option></select></Field>
        <Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field>
        <Field label="Purpose"><input maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={t("Project material / site requirement")} /></Field>
      </div>
      {workspace.error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{workspace.error}</span></div> : null}
      {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{error}</span></div> : null}
      {notice ? <div className="callout success" role="status"><Icon name="checkCircle" /><span>{notice}</span></div> : null}
      {workspace.loading && !workspace.data ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading from production API…"} /></div> : workspace.data ? <>
        <Toolbar>
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหา รหัส / Part No. / รายละเอียด / ยี่ห้อ" />
          <button className="btn ghost" type="button" onClick={() => setRows(rows.map((row) => ({ ...row, selected: true })))}><Icon name="checkCircle" /><LocalizedText text={"ซื้อทั้งหมดที่เหลือ"} /></button>
          <button className="btn ghost" type="button" onClick={() => setRows(rows.map((row) => ({ ...row, selected: false })))}><Icon name="x" /><LocalizedText text={"ไม่เลือกเลย"} /></button>
          <button className="btn ghost" type="button" onClick={addUnplanned} disabled={!modules.length}><Icon name="plus" /><LocalizedText text={"เพิ่มรายการนอกแผน"} /></button>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={download}><Icon name="download" /><LocalizedText text={"ดาวน์โหลด Excel"} /></button>
          <button className="btn ghost" type="button" onClick={() => fileInput.current?.click()}><Icon name="upload" /><LocalizedText text={"นำเข้า Excel"} /></button>
          <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { void upload(event.target.files?.[0]); }} />
        </Toolbar>
        {chips.length ? <FilterChips items={chips} active={module} onPick={(key) => { setModule(key); setPage(1); }} label="งบตาม Module" /> : null}
        {statuses.some((status) => status.thisRequest > 0) ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"งบ Estimate"} /></th>
          <th className="num"><LocalizedText text={"PR ก่อนหน้า"} /></th><th className="num"><LocalizedText text={"PR นี้"} /></th><th className="num"><LocalizedText text={"คงเหลือหลัง PR นี้"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
          <tbody>{statuses.filter((status) => status.thisRequest > 0).map((status) => <tr key={status.module}><td><strong>{status.module}</strong></td><td className="num">{money(status.budget)}</td>
            <td className="num">{money(status.requested)}</td><td className="num">{money(status.thisRequest)}</td><td className="num">{money(status.budget - status.requested - status.thisRequest)}</td>
            <td><Badge tone={LEVEL_TONE[status.level]}>{t(budgetNote(status))}{status.level !== "ok" && Number.isFinite(status.percent) ? ` (${status.percent.toFixed(1)}%)` : ""}</Badge></td></tr>)}</tbody></table></div> : null}
        {rows.length ? <div className="table-wrap tall"><table className="pr-plan-table"><thead><tr><th><LocalizedText text={"Use"} /></th><th><LocalizedText text={"ประเภท"} /></th>
          <th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Part No."} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th>
          <th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"Unit price"} /></th>
          <th className="num"><LocalizedText text={"มูลค่า"} /></th><th><LocalizedText text={"Remark"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead>
          <tbody>{shown.map((row) => {
            const line = row.bomLineId === null ? undefined : lines.get(row.bomLineId);
            const issue = (serverIssue?.key === row.key ? serverIssue.message : undefined) ?? (row.selected ? issues.get(row.key) : undefined);
            const editable = row.lineType !== "Planned";
            const cell = (field: "itemCode" | "partNumber" | "description" | "brand" | "unit", width: number, maxLength: number) => editable
              ? <input style={{ width }} maxLength={maxLength} disabled={!row.selected} value={row[field]} aria-label={t(FIELD_LABEL[field])} onChange={(event) => update(row.key, { [field]: event.target.value })} />
              : <span>{row[field] || "—"}</span>;
            return <tr key={row.key} className={row.selected ? undefined : "row-muted"}>
              <td><input type="checkbox" checked={row.selected} onChange={(event) => update(row.key, { selected: event.target.checked })} aria-label={t("ซื้อรายการนี้")} /></td>
              <td><Badge tone={KIND_TONE[row.lineType]}>{t(KIND_LABEL[row.lineType])}</Badge>{row.lineType === "Substitute" && line ? <small className="muted"><LocalizedText text={"แทน"} /> {line.itemCode || line.partNumber || line.description}</small> : null}</td>
              <td>{cell("itemCode", 110, 100)}</td><td>{cell("partNumber", 120, 200)}</td>
              <td>{cell("description", 220, 500)}{issue ? <small className="red-text" role="alert">{t(issue)}</small> : null}</td>
              <td>{cell("brand", 100, 200)}</td>
              <td>{row.lineType === "Unplanned" ? <select value={row.module} disabled={!row.selected} aria-label={t("Module")} onChange={(event) => update(row.key, { module: event.target.value })}>
                <option value="">{t("Select…")}</option>{modules.map((name) => <option key={name} value={name}>{name}</option>)}</select> : row.module}</td>
              <td className="num"><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!row.selected} value={row.quantity} aria-label={t("Qty")}
                onChange={(event) => update(row.key, { quantity: Number(event.target.value) })} />{row.lineType === "Planned" && line ? <small className="muted">/ {quantity(line.remaining)}</small> : null}</td>
              <td>{cell("unit", 64, 50)}</td>
              <td className="num"><input style={{ width: 110 }} type="number" min="0" step="0.0001" disabled={!row.selected} value={row.unitPrice} aria-label={t("Unit price")}
                onChange={(event) => update(row.key, { unitPrice: Number(event.target.value) })} /></td>
              <td className="num">{money(row.quantity * row.unitPrice)}</td>
              <td><input style={{ width: 140 }} maxLength={500} disabled={!row.selected} value={row.remark} aria-label={t("Remark")} onChange={(event) => update(row.key, { remark: event.target.value })} /></td>
              <td><div className="table-actions">
                {row.lineType === "Planned" ? <button className="btn ghost sm" type="button" onClick={() => update(row.key, asSubstitute(row))}><Icon name="refresh" /><LocalizedText text={"เปลี่ยนรุ่น"} /></button> : null}
                {row.lineType === "Substitute" && line ? <button className="btn ghost sm" type="button" onClick={() => update(row.key, asPlanned(row, line))}><Icon name="refresh" /><LocalizedText text={"ใช้ตาม Estimate"} /></button> : null}
                {row.lineType === "Unplanned" ? <button className="btn ghost sm" type="button" onClick={() => setRows(rows.filter((item) => item.key !== row.key))}><Icon name="x" /><LocalizedText text={"ลบแถว"} /></button> : null}
              </div></td>
            </tr>;
          })}</tbody></table></div> : <EmptyState icon="layers" title="BOM นี้ขอซื้อครบแล้ว" message="ใช้ 'เพิ่มรายการนอกแผน' หรือนำเข้า Excel หากต้องซื้อของเพิ่ม" />}
        {visible.length > pageSize ? <Pagination page={currentPage} pageCount={pageCount} from={(currentPage - 1) * pageSize + 1} to={Math.min(currentPage * pageSize, visible.length)} total={visible.length} onPage={setPage} /> : null}
        <div className="pr-plan-summary" aria-label={t("Purchase plan summary")}>
          <div><span><LocalizedText text={"รายการที่ซื้อ"} /></span><strong>{selected.length}</strong><small>{t(KIND_LABEL.Planned)} {kinds("Planned")} · {t(KIND_LABEL.Substitute)} {kinds("Substitute")} · {t(KIND_LABEL.Unplanned)} {kinds("Unplanned")}</small></div>
          <div><span><LocalizedText text={"ต้องแก้ก่อนส่ง"} /></span><strong>{issues.size}</strong><small><LocalizedText text={"แถวที่มีข้อความสีแดง"} /></small></div>
          <div><span><LocalizedText text={"ผู้อนุมัติ"} /></span><strong>{needsManagement ? "PM + EM" : "PM"}</strong><small><LocalizedText text={"แล้วฝ่ายจัดซื้อเลือก Supplier"} /></small></div>
          <div className="accent"><span><LocalizedText text={"ยอดขอซื้อ"} /></span><strong>{money(total)}</strong><TablePageSize value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>
        </div>
        <Toolbar>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
          <button className="btn primary" type="button" disabled={busy || !selected.length || issues.size > 0} onClick={() => { void submit(); }}>
            <Icon name="check" />{busy ? <LocalizedText text={"กำลังสร้าง PR…"} /> : <>{t("สร้าง PR")} ({selected.length})</>}</button>
        </Toolbar>
      </> : <EmptyState icon="layers" title="No released BOM" message="Release a BOM before creating a requisition" />}
    </Panel>
  );
}
