"use client";
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, FilterChips, Icon, Pagination, Panel, SearchInput, TablePageSize, Toolbar, type FilterItem } from "../ui";
import { exportXlsx } from "../../../lib/export-xlsx";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { addPastedRows, asPlanned, asSubstitute, draftFromBom, draftFromPaste, draftFromPr, draftFromSheet, draftIssues, isBlankPrRow, moduleStatus, payloadLines, sheetRows, templateRows,
  type PrBomLine, type PrDraftRow, type PrModuleBudget, type PrModuleStatus, type PrRowKind, type PrSavedLine } from "../../../lib/pr-spreadsheet";
import { useEndpoint } from "./material-endpoint";
import { DateInput } from "../DateInput";

type ReleasedBom = { id: number; number: string; status: string; projectNumber: string; projectName: string };
type ErpOptions = { enabled: boolean; departments: Array<{ value: string; label: string }>; suggestedDepartment: string | null; message?: string };
type Workspace = { bom: { id: number; number: string; projectNumber: string; projectName: string }; lines: Array<PrBomLine & { purchaseRequired: number }>; modules: PrModuleBudget[] };
/** A draft PR reopened in the sheet: its header, its saved lines and the row version the save must still match. */
export type PrEditing = { id: number; number: string; rowVersion: string; bomId: number; priority: string; requiredDate: string; purpose: string;
  erpDepartment: string | null; lines: PrSavedLine[] };

const EMPTY: never[] = [];
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const quantity = (value: number) => Number(value).toLocaleString(currentLocale(), { maximumFractionDigits: 4 });
const inDays = (days: number) => estimateBusinessDate(new Date(Date.now() + days * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const KIND_TONE: Record<PrRowKind, "blue" | "violet" | "amber"> = { Planned: "blue", Substitute: "violet", Unplanned: "amber" };
const KIND_LABEL: Record<PrRowKind, string> = { Planned: "ตรงแผน", Substitute: "ทดแทน", Unplanned: "นอกแผน" };
const LEVEL_TONE = { ok: "green", manager: "amber", management: "red" } as const;
const FIELD_LABEL = { itemCode: "Item code", partNumber: "Part No.", description: "Description", brand: "Brand", unit: "Unit" } as const;

// With the department head + final approver route an overrun adds nobody; the approver gives a reason. Without it, the share decides.
function budgetNote(status: PrModuleStatus, routed: boolean): string {
  if (status.level === "ok") return "อยู่ในงบ";
  if (routed) return "เกินงบ · ผู้อนุมัติต้องใส่เหตุผล";
  return status.level === "manager" ? "เกินงบไม่เกิน 10% · PM อนุมัติ" : "เกินงบเกิน 10% · Engineering Manager อนุมัติเพิ่ม";
}

/**
 * A full-page PR sheet for many lines. The engineer starts from everything the BOM still needs, changes what differs (another make, an item the
 * estimate missed), or round-trips the sheet through Excel; each module's budget decides whether an overrun needs more than the PM's approval.
 * No supplier here: once approved, the PR goes to the ERP, where Purchasing chooses it and raises the PO.
 * With `editing`, the same sheet reopens a draft (one taken back from the ERP, say) on its own BOM and saves over it.
 * Many items at once (owner 2026-11-19): rows copied from Excel are pasted straight in, blank rows are added ten at a time and left out of
 * the save when unused, Enter moves down a column, and one button saves the PR and sends it for approval.
 */
export type PrSaved = { number: string; submitted: boolean; submitError?: string };
export function PurchaseRequestEditor({ released, editing, onClose, onCreated }: { bootstrap: BootstrapData; released: ReleasedBom[]; editing?: PrEditing; onClose: () => void; onCreated: (saved: PrSaved) => void }) {
  const t = useT();
  const [bomId, setBomId] = useState(0);
  const effectiveBomId = editing?.bomId ?? (bomId || released[0]?.id || 0);
  // An edited draft's own lines are left out of what the BOM has requested, so they show as still open to it.
  const workspace = useEndpoint<Workspace | null>(effectiveBomId ? `/api/v1/boms/${effectiveBomId}${editing ? `?exceptPr=${editing.id}` : ""}` : null, null);
  const lines = useMemo(() => new Map((workspace.data?.lines ?? EMPTY).map((line) => [line.id, { ...line, remaining: Number(line.purchaseRequired) }])), [workspace.data]);
  const modules = useMemo(() => (workspace.data?.modules ?? EMPTY).map((module) => module.module), [workspace.data]);
  const startingRows = useMemo(() => editing ? draftFromPr(editing.lines, [...lines.values()]) : draftFromBom([...lines.values()]), [editing, lines]);
  // The rows the engineer has touched, for this BOM only; until then the sheet is what the BOM still needs.
  const [draft, setDraft] = useState<{ bomId: number; rows: PrDraftRow[] } | null>(null);
  const rows = draft && draft.bomId === effectiveBomId ? draft.rows : startingRows;
  const setRows = (next: PrDraftRow[]) => setDraft({ bomId: effectiveBomId, rows: next });
  const update = (key: string, patch: Partial<PrDraftRow>) => setRows(rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  const [priority, setPriority] = useState(editing?.priority ?? "Normal");
  const [requiredDate, setRequiredDate] = useState(editing ? editing.requiredDate.slice(0, 10) : inDays(14));
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  // The ERP files the PR under one of its departments; the person's own is preselected when it matches.
  const erpOptions = useEndpoint<ErpOptions | null>("/api/v1/erp/purchasing/options", null);
  const [erpDepartment, setErpDepartment] = useState<string | null>(editing?.erpDepartment ?? null);
  const department = erpDepartment ?? erpOptions.data?.suggestedDepartment ?? "";
  // Who approves: the person's department head and the final approver; null on a server still on the PM / Engineering Manager route.
  const route = useEndpoint<{ approvers: { step: string; name: string }[] | null } | null>("/api/v1/purchase-requisitions/approval-route", null);
  const approvers = route.data?.approvers ?? null;
  const [module, setModule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverIssue, setServerIssue] = useState<{ key: string; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  // Blank rows wait to be typed into; they are not part of the PR until someone does.
  const live = useMemo(() => rows.filter((row) => !isBlankPrRow(row)), [rows]);
  const issues = useMemo(() => draftIssues(live, lines, modules), [live, lines, modules]);
  const statuses = useMemo(() => moduleStatus(live, workspace.data?.modules ?? EMPTY), [live, workspace.data]);
  const selected = live.filter((row) => row.selected);
  const total = selected.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const needsManagement = statuses.some((status) => status.level === "management");
  const visible = rows.filter((row) => (!module || row.module.toLocaleLowerCase() === module.toLocaleLowerCase())
    && (!search.trim() || `${row.itemCode} ${row.partNumber} ${row.description} ${row.brand}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chips: FilterItem[] = statuses.map((status) => ({ key: status.module, label: status.module, value: status.lines, tone: LEVEL_TONE[status.level] }));
  const kinds = (kind: PrRowKind) => selected.filter((row) => row.lineType === kind).length;

  // The module a new unplanned row is charged to until the engineer says otherwise: the filter in use, or the BOM's first.
  const newRowModule = module ?? modules[0] ?? "";
  const addUnplanned = (count: number, focusColumn?: number) => {
    const stamp = Date.now();
    const added: PrDraftRow[] = Array.from({ length: count }, (_, index) => ({ key: `new-${stamp}-${index}`, selected: true, lineType: "Unplanned", bomLineId: null, module: newRowModule,
      itemCode: "", partNumber: "", description: "", brand: "", unit: "pcs", quantity: 1, coveredQuantity: null, unitPrice: 0, remark: "" }));
    setRows([...rows, ...added]);
    setSearch(""); setPage(Math.ceil((visible.length + 1) / pageSize));
    // After the new rows are drawn: the first one's cell in the column the person was in (its description by default).
    window.setTimeout(() => {
      const row = sheet.current?.querySelector<HTMLTableRowElement>(`tr[data-row="${added[0]!.key}"]`);
      const cell = row?.cells[focusColumn ?? 4]?.querySelector<HTMLInputElement>("input:not([type='checkbox']), select");
      cell?.focus(); row?.scrollIntoView({ block: "nearest" });
    }, 0);
  };
  // Rows copied from Excel join the sheet: a BOM item updates its row, anything else becomes a new line.
  const pasteRows = (pasted: string) => {
    setError(""); setNotice(""); setServerIssue(null);
    const read = draftFromPaste(pasted, [...lines.values()], modules, newRowModule);
    if (!read?.rows.length) { setError(t("ไม่พบรายการในข้อมูลที่วาง ต้องมีคอลัมน์รายละเอียดหรือ Part No. และคอลัมน์จำนวน")); return; }
    setRows(addPastedRows(rows, read.rows, String(Date.now())));
    setModule(null); setSearch(""); setPasting(false); setPage(Math.max(1, Math.ceil((live.length + read.rows.length) / pageSize)));
    const count = (kind: PrRowKind) => read.rows.filter((row) => row.lineType === kind).length;
    setNotice(`${t("วางแล้ว")} ${read.rows.length} · ${t(KIND_LABEL.Planned)} ${count("Planned")} · ${t(KIND_LABEL.Substitute)} ${count("Substitute")} · ${t(KIND_LABEL.Unplanned)} ${count("Unplanned")}${read.skipped ? ` · ${t("ข้ามแถวที่ไม่มีจำนวน")} ${read.skipped}` : ""}`);
  };
  // Enter moves down the column like a spreadsheet (Shift+Enter up); on the last row it opens a new line.
  const moveDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    if (event.key !== "Enter") return;
    const cell = target.closest("td"), row = target.closest("tr");
    if (!cell || !row) return;
    event.preventDefault();
    const next = (event.shiftKey ? row.previousElementSibling : row.nextElementSibling) as HTMLTableRowElement | null;
    const field = next?.cells[cell.cellIndex]?.querySelector<HTMLInputElement>("input:not([type='checkbox'])");
    if (field) { field.focus(); field.select(); }
    else if (!next && !event.shiftKey && modules.length && currentPage === pageCount) addUnplanned(1, cell.cellIndex);
  };
  const pasteCells = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(pasted.trim())) return;
    event.preventDefault(); pasteRows(pasted);
  };
  const grid = { onKeyDown: moveDown, onPaste: pasteCells };
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  const noModule = live.filter((row) => row.lineType === "Unplanned" && !modules.some((name) => name.toLocaleLowerCase() === row.module.toLocaleLowerCase()));
  const download = () => {
    const bom = workspace.data?.bom; if (!bom) return;
    exportXlsx(templateRows(`PR · ${bom.number} · ${bom.projectNumber} ${bom.projectName}`, live, lines), `PR_${bom.number}_${inDays(0)}.xlsx`);
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
  // Saves the PR as a draft and, with `send`, submits it for approval in the same press. A PR that saved but could not be
  // submitted stays a draft: the list says so, and Submit is on its row.
  const submit = async (send: boolean) => {
    setBusy(true); setError(""); setServerIssue(null);
    try {
      const fields = { priority, requiredDate, purpose: purpose || undefined, erpDepartment: department || undefined, lines: payloadLines(live) };
      type Saved = { id: number; number: string; rowVersion: string };
      const saved = editing
        ? await apiRequest<Saved>(`/api/v1/purchase-requisitions/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...fields, rowVersion: editing.rowVersion }) })
        : await apiRequest<Saved>("/api/v1/purchase-requisitions/", { method: "POST", body: JSON.stringify({ bomId: effectiveBomId, ...fields }) });
      if (!send) { onCreated({ number: saved.number, submitted: false }); return; }
      try {
        await apiRequest(`/api/v1/purchase-requisitions/${saved.id}/submit`, { method: "POST", body: JSON.stringify({ rowVersion: saved.rowVersion, comment: "Submitted from the PR sheet" }) });
        onCreated({ number: saved.number, submitted: true });
      } catch (sendError) { onCreated({ number: saved.number, submitted: false, submitError: sendError instanceof Error ? sendError.message : String(sendError) }); }
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
    <Panel title={editing ? editing.number : "ขอซื้อ (PR)"} subtitle={editing ? "แก้ไข PR ฉบับร่าง แล้วกด 'ส่งขออนุมัติ' หรือ 'บันทึกร่าง' ไว้ก่อน" : "เริ่มจากรายการที่ BOM ยังต้องซื้อ เปลี่ยนรุ่นหรือเพิ่มของนอกแผนได้ ภายในงบของ Module ไม่ต้องขออนุมัติเพิ่ม · อนุมัติแล้วส่งเข้า ERP ให้ฝ่ายจัดซื้อ"}
      actions={<button className="btn ghost" type="button" onClick={onClose} disabled={busy}><Icon name="arrowLeft" /><LocalizedText text={"กลับไปรายการ PR"} /></button>}>
      <div className="form-grid two">
        <Field label="Released BOM" guide="pr.bom"><select value={effectiveBomId} disabled={Boolean(editing)} onChange={(event) => { setBomId(Number(event.target.value)); setModule(null); setPage(1); setNotice(""); setServerIssue(null); }}>
          {editing ? <option value={editing.bomId}>{workspace.data ? `${workspace.data.bom.number} · ${workspace.data.bom.projectNumber} · ${workspace.data.bom.projectName}` : "…"}</option>
            : <><option value={0}>{t("Select BOM…")}</option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} · {bom.projectNumber} · {bom.projectName}</option>)}</>}</select></Field>
        <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="Normal">{t("Normal")}</option><option value="High">{t("High")}</option><option value="Emergency">{t("Emergency")}</option></select></Field>
        <Field label="Required date" guide="pr.required"><DateInput value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field>
        <Field label="Purpose"><input maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={t("Project material / site requirement")} /></Field>
        {erpOptions.data?.enabled && erpOptions.data.departments.length ? <Field label="แผนกใน ERP"><select value={department} onChange={(event) => setErpDepartment(event.target.value)}>
          <option value="">{t("Select…")}</option>{erpOptions.data.departments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field> : null}
      </div>
      {workspace.error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{workspace.error}</span></div> : null}
      {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{error}</span></div> : null}
      {notice ? <div className="callout success" role="status"><Icon name="checkCircle" /><span>{notice}</span></div> : null}
      {workspace.loading && !workspace.data ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading from production API…"} /></div> : workspace.data ? <>
        <Toolbar>
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหา รหัส / Part No. / รายละเอียด / ยี่ห้อ" />
          <button className="btn ghost" type="button" onClick={() => addUnplanned(1)} disabled={!modules.length}><Icon name="plus" /><LocalizedText text={"เพิ่มรายการนอกแผน"} /></button>
          <button className="btn ghost" type="button" onClick={() => addUnplanned(10)} disabled={!modules.length}><Icon name="plus" /><LocalizedText text={"เพิ่ม 10 แถว"} /></button>
          <button className="btn ghost" type="button" data-guide="pr.paste" aria-expanded={pasting} disabled={!modules.length} onClick={() => { setPasting(!pasting); window.setTimeout(() => pasteBox.current?.focus(), 0); }}><Icon name="copy" /><LocalizedText text={"วางจาก Excel"} /></button>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={download}><Icon name="download" /><LocalizedText text={"ดาวน์โหลด Excel"} /></button>
          <button className="btn ghost" type="button" onClick={() => fileInput.current?.click()}><Icon name="upload" /><LocalizedText text={"นำเข้า Excel"} /></button>
          <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { void upload(event.target.files?.[0]); }} />
        </Toolbar>
        {pasting ? <div className="pr-paste">
          <textarea ref={pasteBox} rows={2} value="" readOnly aria-label={t("วางจาก Excel")} placeholder={t("คลิกที่นี่แล้วกด Ctrl+V เพื่อวางแถวที่คัดลอกจาก Excel")}
            onPaste={(event) => { event.preventDefault(); pasteRows(event.clipboardData.getData("text/plain")); }} />
          <small><LocalizedText text={"คัดลอกหัวคอลัมน์มาด้วยก็ได้ (Description, Part No., Qty, Unit, Unit price, Brand, Remark) ถ้าไม่มีหัวคอลัมน์ ให้เรียง Part No. · รายละเอียด · ยี่ห้อ · จำนวน · หน่วย · ราคาต่อหน่วย · หมายเหตุ หรือวางลงในช่องใดของตารางก็ได้"} /></small>
        </div> : null}
        {noModule.length ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>{noModule.length} <LocalizedText text={"แถวนอกแผนยังไม่ได้เลือก Module"} /></strong></span>
          <select value="" aria-label={t("ตั้ง Module ให้ทุกแถวที่ยังว่าง")} onChange={(event) => { const name = event.target.value; if (name) setRows(rows.map((row) => noModule.some((item) => item.key === row.key) ? { ...row, module: name } : row)); }}>
            <option value="">{t("ตั้ง Module ให้ทุกแถวที่ยังว่าง")}</option>{modules.map((name) => <option key={name} value={name}>{name}</option>)}</select></div> : null}
        {chips.length ? <FilterChips items={chips} active={module} onPick={(key) => { setModule(key); setPage(1); }} label="งบตาม Module" /> : null}
        {statuses.some((status) => status.thisRequest > 0) ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"งบ Estimate"} /></th>
          <th className="num"><LocalizedText text={"PR ก่อนหน้า"} /></th><th className="num"><LocalizedText text={"PR นี้"} /></th><th className="num"><LocalizedText text={"คงเหลือหลัง PR นี้"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
          <tbody>{statuses.filter((status) => status.thisRequest > 0).map((status) => <tr key={status.module}><td><strong>{status.module}</strong></td><td className="num">{money(status.budget)}</td>
            <td className="num">{money(status.requested)}</td><td className="num">{money(status.thisRequest)}</td><td className="num">{money(status.budget - status.requested - status.thisRequest)}</td>
            <td><Badge tone={LEVEL_TONE[status.level]}>{t(budgetNote(status, Boolean(approvers)))}{status.level !== "ok" && Number.isFinite(status.percent) ? ` (${status.percent.toFixed(1)}%)` : ""}</Badge></td></tr>)}</tbody></table></div> : null}
        {rows.length ? <div className="table-wrap tall" data-guide="pr.lines" ref={sheet}><table className="pr-plan-table"><thead><tr>
          {/* Ticks or clears every row: what the two toolbar buttons did. */}
          <th><input type="checkbox" checked={live.length > 0 && selected.length === live.length} aria-label={t("ซื้อทั้งหมดที่เหลือ")} title={t("ซื้อทั้งหมดที่เหลือ")}
            onChange={(event) => setRows(rows.map((row) => ({ ...row, selected: event.target.checked })))} /></th><th><LocalizedText text={"ประเภท"} /></th>
          <th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Part No."} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th>
          <th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"Unit price"} /></th>
          <th className="num"><LocalizedText text={"มูลค่า"} /></th><th><LocalizedText text={"Remark"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead>
          <tbody>{shown.map((row) => {
            const line = row.bomLineId === null ? undefined : lines.get(row.bomLineId);
            const issue = (serverIssue?.key === row.key ? serverIssue.message : undefined) ?? (row.selected ? issues.get(row.key) : undefined);
            const editable = row.lineType !== "Planned";
            const cell = (field: "itemCode" | "partNumber" | "description" | "brand" | "unit", width: number, maxLength: number) => editable
              ? <input {...grid} style={{ width }} maxLength={maxLength} disabled={!row.selected} value={row[field]} aria-label={t(FIELD_LABEL[field])} onChange={(event) => update(row.key, { [field]: event.target.value })} />
              : <span>{row[field] || "—"}</span>;
            return <tr key={row.key} data-row={row.key} className={row.selected ? undefined : "row-muted"}>
              <td><input type="checkbox" checked={row.selected} onChange={(event) => update(row.key, { selected: event.target.checked })} aria-label={t("ซื้อรายการนี้")} /></td>
              <td><Badge tone={KIND_TONE[row.lineType]}>{t(KIND_LABEL[row.lineType])}</Badge>{row.lineType === "Substitute" && line ? <small className="muted"><LocalizedText text={"แทน"} /> {line.itemCode || line.partNumber || line.description}</small> : null}</td>
              <td>{cell("itemCode", 110, 100)}</td><td>{cell("partNumber", 120, 200)}</td>
              <td>{cell("description", 220, 500)}{issue ? <small className="red-text" role="alert">{t(issue)}</small> : null}</td>
              <td>{cell("brand", 100, 200)}</td>
              <td>{row.lineType === "Unplanned" ? <select value={row.module} disabled={!row.selected} aria-label={t("Module")} onChange={(event) => update(row.key, { module: event.target.value })}>
                <option value="">{t("Select…")}</option>{modules.map((name) => <option key={name} value={name}>{name}</option>)}</select> : row.module}</td>
              <td className="num"><input {...grid} style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!row.selected} value={row.quantity} aria-label={t("Qty")}
                onChange={(event) => update(row.key, { quantity: Number(event.target.value) })} />{row.lineType === "Planned" && line ? <small className="muted">/ {quantity(line.remaining)}</small> : null}</td>
              <td>{cell("unit", 64, 50)}</td>
              <td className="num"><input {...grid} style={{ width: 110 }} type="number" min="0" step="0.0001" disabled={!row.selected} value={row.unitPrice} aria-label={t("Unit price")}
                onChange={(event) => update(row.key, { unitPrice: Number(event.target.value) })} /></td>
              <td className="num">{money(row.quantity * row.unitPrice)}</td>
              <td><input {...grid} style={{ width: 140 }} maxLength={500} disabled={!row.selected} value={row.remark} aria-label={t("Remark")} onChange={(event) => update(row.key, { remark: event.target.value })} /></td>
              <td><div className="table-actions">
                {row.lineType === "Planned" ? <button className="btn ghost sm" type="button" onClick={() => update(row.key, asSubstitute(row))}><Icon name="refresh" /><LocalizedText text={"เปลี่ยนรุ่น"} /></button> : null}
                {row.lineType === "Substitute" && line ? <button className="btn ghost sm" type="button" onClick={() => update(row.key, asPlanned(row, line))}><Icon name="refresh" /><LocalizedText text={"ใช้ตาม Estimate"} /></button> : null}
                {row.lineType === "Unplanned" ? <button className="btn ghost sm" type="button" onClick={() => setRows(rows.filter((item) => item.key !== row.key))}><Icon name="x" /><LocalizedText text={"ลบแถว"} /></button> : null}
              </div></td>
            </tr>;
          })}</tbody></table></div> : <EmptyState icon="layers" title="BOM นี้ขอซื้อครบแล้ว" message="ใช้ 'เพิ่มรายการนอกแผน' 'วางจาก Excel' หรือนำเข้า Excel หากต้องซื้อของเพิ่ม" />}
        {visible.length > pageSize ? <Pagination page={currentPage} pageCount={pageCount} from={(currentPage - 1) * pageSize + 1} to={Math.min(currentPage * pageSize, visible.length)} total={visible.length} onPage={setPage} /> : null}
        <div className="pr-plan-summary" aria-label={t("Purchase plan summary")} data-guide="pr.summary">
          <div><span><LocalizedText text={"รายการที่ซื้อ"} /></span><strong>{selected.length}</strong><small>{t(KIND_LABEL.Planned)} {kinds("Planned")} · {t(KIND_LABEL.Substitute)} {kinds("Substitute")} · {t(KIND_LABEL.Unplanned)} {kinds("Unplanned")}</small></div>
          <div><span><LocalizedText text={"ต้องแก้ก่อนส่ง"} /></span><strong>{issues.size}</strong><small><LocalizedText text={"แถวที่มีข้อความสีแดง"} /></small></div>
          <div><span><LocalizedText text={"ผู้อนุมัติ"} /></span><strong data-guide="pr.approvers">{approvers ? approvers.map((approver) => approver.name).join(" → ") : needsManagement ? "PM + EM" : "PM"}</strong><small><LocalizedText text={"แล้วส่งเข้า ERP อัตโนมัติ"} /></small></div>
          <div className="accent"><span><LocalizedText text={"ยอดขอซื้อ"} /></span><strong>{money(total)}</strong><TablePageSize value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>
        </div>
        <Toolbar>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
          <button className="btn ghost" type="button" disabled={busy || !selected.length || issues.size > 0} onClick={() => { void submit(false); }}><LocalizedText text={"Save Draft"} /></button>
          <button className="btn primary" type="button" data-guide="pr.submit" disabled={busy || !selected.length || issues.size > 0} onClick={() => { void submit(true); }}>
            <Icon name="send" />{busy ? <LocalizedText text={"Saving…"} /> : <>{t("ส่งขออนุมัติ")} ({selected.length})</>}</button>
        </Toolbar>
      </> : <EmptyState icon="layers" title="No released BOM" message="Release a BOM before creating a requisition" />}
    </Panel>
  );
}
