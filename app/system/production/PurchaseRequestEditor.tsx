"use client";
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, FilterChips, Icon, Pagination, Panel, SearchInput, TablePageSize, Toolbar, type FilterItem } from "../ui";
import { exportXlsx } from "../../../lib/export-xlsx";
import { readWorkbookSheets } from "../../../lib/import-spreadsheet";
import { readPrForm } from "../../../lib/pr-form";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { type PurchaseUnits, unitLabel, unitOnSheet } from "../../../lib/purchase-units";
import { addPastedRows, afterEdit, asPlanned, blankPrRows, draftFromPaste, draftFromPr, draftFromPrForm, draftFromSheet, draftIssues, insertBlankPrRow, isBlankPrRow, moduleStatus, payloadLines, rowFromBomLine, sheetRows, startingPrRows, templateRows,
  togglePart, withoutRows, type PrBomLine, type PrDraftRow, type PrModuleBudget, type PrModuleStatus, type PrRowKind, type PrSavedLine } from "../../../lib/pr-spreadsheet";
import { useEndpoint } from "./material-endpoint";
import { DateInput } from "../DateInput";

type ReleasedBom = { id: number; number: string; status: string; projectNumber: string; projectName: string };
type ErpOptions = { enabled: boolean; departments: Array<{ value: string; label: string }>; suggestedDepartment: string | null; message?: string };
type Workspace = { bom: { id: number; number: string; projectId: number; projectNumber: string; projectName: string }; lines: Array<PrBomLine & { purchaseRequired: number }>; modules: PrModuleBudget[] };
/** A draft PR reopened in the sheet: its header, its saved lines and the row version the save must still match. */
export type PrEditing = { id: number; number: string; rowVersion: string; bomId: number; priority: string; requiredDate: string; purpose: string;
  erpDepartment: string | null; unitId?: number | null; overBudgetReason?: string | null; lines: PrSavedLine[] };

const EMPTY: never[] = [];
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const quantity = (value: number) => Number(value).toLocaleString(currentLocale(), { maximumFractionDigits: 4 });
const inDays = (days: number) => estimateBusinessDate(new Date(Date.now() + days * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const KIND_TONE: Record<PrRowKind, "blue" | "violet" | "amber"> = { Planned: "blue", Substitute: "violet", Unplanned: "amber" };
const KIND_LABEL: Record<PrRowKind, string> = { Planned: "ตรงแผน", Substitute: "ทดแทน", Unplanned: "นอกแผน" };
const LEVEL_TONE = { ok: "green", manager: "amber", management: "red" } as const;
const FIELD_LABEL = { itemCode: "Item code", partNumber: "Part No.", description: "Description", brand: "Brand", unit: "Unit" } as const;
const ITEM_FIELDS = Object.keys(FIELD_LABEL);

// With the department head + final approver route an overrun adds nobody; the approver gives a reason. Without it, the share decides.
function budgetNote(status: PrModuleStatus, routed: boolean): string {
  if (status.level === "ok") return "อยู่ในงบ";
  if (routed) return "เกินงบ · ผู้อนุมัติต้องใส่เหตุผล";
  return status.level === "manager" ? "เกินงบไม่เกิน 10% · PM อนุมัติ" : "เกินงบเกิน 10% · Engineering Manager อนุมัติเพิ่ม";
}

/**
 * A full-page PR sheet for many lines. Most of what is bought is not the estimate's own item, and no price here is the real one (owner 2026-11-19),
 * so a new PR starts as empty rows: the engineer types or pastes what is really bought and names the module that pays. The estimate's lines sit in
 * a reference panel; one brought into the sheet stays tied to its line until it is typed over, when it buys something in the line's place. Prices
 * are approximate, for checking each module's budget; Purchasing finds the real ones in the ERP.
 * No supplier here: once approved, the PR goes to the ERP, where Purchasing chooses it and raises the PO.
 * With `editing`, the same sheet reopens a draft (one taken back from the ERP, say) on its own BOM and saves over it.
 * Many items at once (owner 2026-11-19): rows copied from Excel are pasted straight in, blank rows are added ten at a time and left out of
 * the save when unused, Enter moves down a column, and one button saves the PR and sends it for approval.
 */
/** A PR started from a BOM: the BOM, and the lines ticked on it (none = an empty sheet for that BOM). */
export type PrStart = { bomId: number; lineIds: number[]; unitId?: number | null };
export type PrSaved = { number: string; submitted: boolean; submitError?: string };
export function PurchaseRequestEditor({ released, editing, start, onClose, onCreated }: { bootstrap: BootstrapData; released: ReleasedBom[]; editing?: PrEditing; start?: PrStart; onClose: () => void; onCreated: (saved: PrSaved) => void }) {
  const t = useT();
  const [bomId, setBomId] = useState(start?.bomId ?? 0);
  const effectiveBomId = editing?.bomId ?? (bomId || released[0]?.id || 0);
  // An edited draft's own lines are left out of what the BOM has requested, so they show as still open to it.
  const workspace = useEndpoint<Workspace | null>(effectiveBomId ? `/api/v1/boms/${effectiveBomId}${editing ? `?exceptPr=${editing.id}` : ""}` : null, null);
  const lines = useMemo(() => new Map((workspace.data?.lines ?? EMPTY).map((line) => [line.id, { ...line, remaining: Number(line.purchaseRequired) }])), [workspace.data]);
  const modules = useMemo(() => (workspace.data?.modules ?? EMPTY).map((module) => module.module), [workspace.data]);
  // A BOM with one module charges every typed row to it; with several, the engineer says which.
  const onlyModule = modules.length === 1 ? modules[0]! : "";
  // A new sheet is one empty row, or the lines ticked on the BOM it was started from.
  const startingRows = useMemo(() => editing ? draftFromPr(editing.lines, [...lines.values()])
    : startingPrRows([...lines.values()], start && start.bomId === effectiveBomId ? start.lineIds : [], onlyModule, "start"), [editing, lines, onlyModule, start, effectiveBomId]);
  // The rows the engineer has touched, for this BOM only; until then a new sheet is its starting rows.
  const [draft, setDraft] = useState<{ bomId: number; rows: PrDraftRow[] } | null>(null);
  const rows = draft && draft.bomId === effectiveBomId ? draft.rows : startingRows;
  const setRows = (next: PrDraftRow[]) => setDraft({ bomId: effectiveBomId, rows: next });
  // Typing another item over a row from the estimate, or more than the estimate still needs, makes it a purchase in that line's place.
  const update = (key: string, patch: Partial<PrDraftRow>) => setRows(rows.map((row) => row.key !== key ? row
    : afterEdit({ ...row, ...patch }, row.bomLineId === null ? undefined : lines.get(row.bomLineId), ITEM_FIELDS.some((field) => field in patch))));
  // The Unit the request is for (a drawing number and a name under one of the BOM's modules); none for a request that belongs to no Unit.
  const projectId = workspace.data?.bom.projectId ?? 0;
  const units = useEndpoint<PurchaseUnits | null>(projectId ? `/api/v1/projects/${projectId}/purchase-units` : null, null);
  const [unitChoice, setUnitChoice] = useState<{ bomId: number; unitId: number | null } | null>(null);
  const unitId = unitChoice && unitChoice.bomId === effectiveBomId ? unitChoice.unitId : editing?.unitId ?? (start && start.bomId === effectiveBomId ? start.unitId ?? null : null);
  const unit = units.data?.units.find((item) => item.id === unitId) ?? null;
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
  // The estimate's lines, for reference: hidden until asked for (owner 2026-11-20).
  const [showEstimate, setShowEstimate] = useState(false);
  // The PR-Form's own columns (material, treatment, detail, need-by, link): shown on demand, and open on a draft that has any.
  const [formChoice, setFormChoice] = useState<boolean | null>(null);
  const showForm = formChoice ?? Boolean(editing?.lines.some((line) => line.material || line.treatment || line.detail || line.needBy || line.attachmentUrl));
  const sheet = useRef<HTMLDivElement>(null);

  // Blank rows wait to be typed into; they are not part of the PR until someone does.
  const live = useMemo(() => rows.filter((row) => !isBlankPrRow(row)), [rows]);
  const issues = useMemo(() => draftIssues(live, lines, modules), [live, lines, modules]);
  // A typed row with no module yet is asked for one (below); it is not counted against a budget until then.
  const statuses = useMemo(() => moduleStatus(live.filter((row) => modules.some((name) => name.toLocaleLowerCase() === row.module.toLocaleLowerCase())), workspace.data?.modules ?? EMPTY), [live, modules, workspace.data]);
  // Every typed row is bought: a row not wanted is removed, not unticked.
  const selected = live;
  const total = selected.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const needsManagement = statuses.some((status) => status.level === "management");
  const visible = rows.filter((row) => (!module || row.module.toLocaleLowerCase() === module.toLocaleLowerCase())
    && (!search.trim() || `${row.itemCode} ${row.partNumber} ${row.description} ${row.brand}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chips: FilterItem[] = statuses.map((status) => ({ key: status.module, label: status.module, value: status.lines, tone: LEVEL_TONE[status.level] }));
  const kinds = (kind: PrRowKind) => selected.filter((row) => row.lineType === kind).length;

  // The module a new row is charged to until the engineer says otherwise: the filter in use, the Unit's module, or the BOM's only one.
  const newRowModule = module ?? (unit?.module || onlyModule);
  // The Unit's budget with this sheet counted. A draft being edited is already among the Unit's requests, so what it had saved comes out first.
  const ownSaved = editing && editing.unitId === unit?.id ? editing.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0) : 0;
  const unitBudget = unit ? unitOnSheet(unit, total, ownSaved) : null;
  // More than the Unit or a Module has: the requester says why before the request can be sent for approval.
  const overBudget = Boolean(unitBudget?.over) || statuses.some((status) => status.level !== "ok" && status.thisRequest > 0);
  const [justification, setJustification] = useState(editing?.overBudgetReason ?? "");
  const needsReason = overBudget && !justification.trim();
  // Choosing a Unit charges the rows that have no module yet to the Unit's module.
  const chooseUnit = (next: number | null) => {
    setUnitChoice({ bomId: effectiveBomId, unitId: next });
    const chosen = units.data?.units.find((item) => item.id === next);
    if (chosen) setRows(rows.map((row) => row.lineType === "Unplanned" && !row.module ? { ...row, module: chosen.module } : row));
  };
  // After a new row is drawn: its cell in the column the person was in (its part number by default).
  const focusRow = (key: string, column = 2) => window.setTimeout(() => {
    const row = sheet.current?.querySelector<HTMLTableRowElement>(`tr[data-row="${key}"]`);
    row?.cells[column]?.querySelector<HTMLInputElement>("input, select")?.focus(); row?.scrollIntoView({ block: "nearest" });
  }, 0);
  const addUnplanned = (count: number, focusColumn?: number) => {
    const added = blankPrRows(count, newRowModule, String(Date.now()));
    setRows([...rows, ...added]);
    setSearch(""); setPage(Math.ceil((visible.length + 1) / pageSize));
    focusRow(added[0]!.key, focusColumn);
  };
  // The + at the end of a row opens an empty row right under it, charged to the same module (owner 2026-11-20).
  const insertBelow = (row: PrDraftRow) => {
    const next = insertBlankPrRow(rows, row.key, module ?? (row.module || onlyModule), String(Date.now()));
    setRows(next.rows); setSearch("");
    const inView = next.rows.filter((item) => !module || item.module.toLocaleLowerCase() === module.toLocaleLowerCase());
    setPage(Math.floor(inView.findIndex((item) => item.key === next.key) / pageSize) + 1);
    focusRow(next.key);
  };
  // An estimate line goes into the sheet above the empty rows, prefilled; the engineer then types what is really bought over it.
  const pull = (pulled: PrBomLine[]) => {
    const stamp = String(Date.now());
    const filled = rows.filter((row) => !isBlankPrRow(row));
    for (const line of pulled) filled.push(rowFromBomLine(line, filled, stamp));
    setRows([...filled, ...rows.filter(isBlankPrRow)]); setSearch("");
  };
  const estimateLines = [...lines.values()].filter((line) => !module || line.module.toLocaleLowerCase() === module.toLocaleLowerCase());
  const pullable = estimateLines.filter((line) => line.remaining > 0 && !rows.some((row) => row.bomLineId === line.id));
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
    const field = next?.cells[cell.cellIndex]?.querySelector<HTMLInputElement>("input");
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
      // The team's PR-Form is read by its labels; of a workbook with a sheet per Unit, the sheet of the chosen Unit's drawing.
      const forms = readPrForm(sheets, file.name).forms;
      const form = forms.find((item) => unit?.drawingNo && item.drawingNo.toLocaleLowerCase() === unit.drawingNo.toLocaleLowerCase()) ?? forms[0];
      const read = form ? draftFromPrForm(form, [...lines.values()], modules, unit?.module ?? "")
        : sheets.map((sheet) => draftFromSheet(sheetRows(sheet.cells), [...lines.values()], modules)).find((result) => result && result.rows.length);
      if (!read || !read.rows.length) { setError(t("ไม่พบตารางรายการในไฟล์ (ต้องมีหัวคอลัมน์ Description หรือ Part No. และ Qty หรือเป็นฟอร์ม TOMAS PR)")); return; }
      setRows(read.rows.filter((row) => row.selected)); setModule(null); setSearch(""); setPage(1); setServerIssue(null);
      const count = (kind: PrRowKind) => read.rows.filter((row) => row.lineType === kind).length;
      setNotice(`${form ? `${t("อ่านจาก sheet")} ${form.sheet} · ` : ""}${t("นำเข้าแล้ว")} ${read.rows.length} · ${t(KIND_LABEL.Planned)} ${count("Planned")} · ${t(KIND_LABEL.Substitute)} ${count("Substitute")} · ${t(KIND_LABEL.Unplanned)} ${count("Unplanned")}${read.skipped ? ` · ${t("ข้ามแถวที่ไม่มีจำนวน")} ${read.skipped}` : ""}${read.cancelled ? ` · ${t("ข้ามรายการที่ยกเลิก")} ${read.cancelled}` : ""}`);
    } catch (readError) { setError(readError instanceof Error ? readError.message : String(readError)); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  };
  // Saves the PR as a draft and, with `send`, submits it for approval in the same press. A PR that saved but could not be
  // submitted stays a draft: the list says so, and Submit is on its row.
  const submit = async (send: boolean) => {
    setBusy(true); setError(""); setServerIssue(null);
    try {
      const fields = { priority, requiredDate, purpose: purpose || undefined, erpDepartment: department || undefined, unitId, lines: payloadLines(live) };
      type Saved = { id: number; number: string; rowVersion: string };
      const saved = editing
        ? await apiRequest<Saved>(`/api/v1/purchase-requisitions/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...fields, rowVersion: editing.rowVersion }) })
        : await apiRequest<Saved>("/api/v1/purchase-requisitions/", { method: "POST", body: JSON.stringify({ bomId: effectiveBomId, ...fields }) });
      if (!send) { onCreated({ number: saved.number, submitted: false }); return; }
      try {
        await apiRequest(`/api/v1/purchase-requisitions/${saved.id}/submit`, { method: "POST", body: JSON.stringify({ rowVersion: saved.rowVersion, comment: "Submitted from the PR sheet", justification: overBudget ? justification.trim() : undefined }) });
        onCreated({ number: saved.number, submitted: true });
      } catch (sendError) { onCreated({ number: saved.number, submitted: false, submitError: sendError instanceof Error ? sendError.message : String(sendError) }); }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      // "Line n" counts the typed rows in screen order; point at that row.
      const line = Number(/^Line (\d+):/.exec(message)?.[1] ?? 0);
      const row = line ? selected[line - 1] : undefined;
      if (row) { setServerIssue({ key: row.key, message }); const index = visible.findIndex((item) => item.key === row.key); if (index >= 0) setPage(Math.floor(index / pageSize) + 1); }
      setError(message);
    } finally { setBusy(false); }
  };

  return (
    <Panel title={editing ? editing.number : "ขอซื้อ (PR)"} subtitle={editing ? "แก้ไข PR ฉบับร่าง แล้วกด 'ส่งขออนุมัติ' หรือ 'บันทึกร่าง' ไว้ก่อน" : "พิมพ์หรือวางรายการที่จะซื้อจริง แล้วเลือก Module ที่ใช้งบ รายการใน Estimate ใช้อ้างอิงและดึงมาใช้ได้ · ราคาเป็นราคาประมาณเพื่อเทียบงบ ราคาจริงฝ่ายจัดซื้อหาใน ERP"}
      actions={<button className="btn ghost" type="button" onClick={onClose} disabled={busy}><Icon name="arrowLeft" /><LocalizedText text={"กลับไปรายการ PR"} /></button>}>
      <div className="form-grid two">
        <Field label="Released BOM" guide="pr.bom"><select value={effectiveBomId} disabled={Boolean(editing)} onChange={(event) => { setBomId(Number(event.target.value)); setModule(null); setPage(1); setNotice(""); setServerIssue(null); }}>
          {editing ? <option value={editing.bomId}>{workspace.data ? `${workspace.data.bom.number} · ${workspace.data.bom.projectNumber} · ${workspace.data.bom.projectName}` : "…"}</option>
            : <><option value={0}>{t("Select BOM…")}</option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} · {bom.projectNumber} · {bom.projectName}</option>)}</>}</select></Field>
        {units.data?.units.length ? <Field label="Unit ที่ขอซื้อให้" guide="pr.unit" hint={unit ? `Module ${unit.module}` : undefined}><select value={unitId ?? 0} onChange={(event) => chooseUnit(Number(event.target.value) || null)}>
          <option value={0}>{t("ไม่ระบุ Unit")}</option>{units.data.units.map((item) => <option key={item.id} value={item.id}>{unitLabel(item)} ({item.module})</option>)}</select></Field> : null}
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
          <button className="btn ghost" type="button" onClick={() => addUnplanned(1)} disabled={!modules.length}><Icon name="plus" /><LocalizedText text={"เพิ่มแถว"} /></button>
          <button className="btn ghost" type="button" onClick={() => addUnplanned(10)} disabled={!modules.length}><Icon name="plus" /><LocalizedText text={"เพิ่ม 10 แถว"} /></button>
          <button className="btn ghost" type="button" data-guide="pr.paste" aria-expanded={pasting} disabled={!modules.length} onClick={() => { setPasting(!pasting); window.setTimeout(() => pasteBox.current?.focus(), 0); }}><Icon name="copy" /><LocalizedText text={"วางจาก Excel"} /></button>
          <button className="btn ghost" type="button" data-guide="pr.form-fields" aria-pressed={showForm} onClick={() => setFormChoice(!showForm)}><Icon name="table" /><LocalizedText text={"ช่อง PR-Form"} /></button>
          <button className="btn ghost" type="button" data-guide="pr.estimate" aria-expanded={showEstimate} disabled={!lines.size} onClick={() => setShowEstimate(!showEstimate)}><Icon name="layers" /><LocalizedText text={"รายการใน Estimate"} /> ({lines.size})</button>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={download}><Icon name="download" /><LocalizedText text={"ดาวน์โหลด Excel"} /></button>
          <button className="btn ghost" type="button" data-guide="pr.import" onClick={() => fileInput.current?.click()}><Icon name="upload" /><LocalizedText text={"นำเข้า Excel"} /></button>
          <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => { void upload(event.target.files?.[0]); }} />
        </Toolbar>
        {pasting ? <div className="pr-paste">
          <textarea ref={pasteBox} rows={2} value="" readOnly aria-label={t("วางจาก Excel")} placeholder={t("คลิกที่นี่แล้วกด Ctrl+V เพื่อวางแถวที่คัดลอกจาก Excel")}
            onPaste={(event) => { event.preventDefault(); pasteRows(event.clipboardData.getData("text/plain")); }} />
          <small><LocalizedText text={"คัดลอกหัวคอลัมน์มาด้วยก็ได้ (Description, Part No., Qty, Unit, Unit price, Brand, Remark) ถ้าไม่มีหัวคอลัมน์ ให้เรียง Part No. · รายละเอียด · ยี่ห้อ · จำนวน · หน่วย · ราคาต่อหน่วย · หมายเหตุ หรือวางลงในช่องใดของตารางก็ได้"} /></small>
        </div> : null}
        {noModule.length ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>{noModule.length} <LocalizedText text={"แถวยังไม่ได้เลือก Module ที่ใช้งบ"} /></strong></span>
          <select value="" aria-label={t("ตั้ง Module ให้ทุกแถวที่ยังว่าง")} onChange={(event) => { const name = event.target.value; if (name) setRows(rows.map((row) => noModule.some((item) => item.key === row.key) ? { ...row, module: name } : row)); }}>
            <option value="">{t("ตั้ง Module ให้ทุกแถวที่ยังว่าง")}</option>{modules.map((name) => <option key={name} value={name}>{name}</option>)}</select></div> : null}
        {showEstimate && lines.size ? <div className="pr-estimate">
          <div className="pr-estimate-head"><strong><LocalizedText text={"รายการใน Estimate"} /></strong><small><LocalizedText text={"ใช้อ้างอิง กด 'ดึงมาใช้' เพื่อใส่ลงตาราง แล้วพิมพ์ทับเป็นของที่ซื้อจริงได้"} /></small><span className="spacer" />
            <button className="btn ghost sm" type="button" disabled={!pullable.length} onClick={() => pull(pullable)}><Icon name="download" />{t("ดึงทั้งหมดที่เหลือ")} ({pullable.length})</button></div>
          <div className="table-wrap"><table><thead><tr><th className="pg-acts"><span className="sr-only"><LocalizedText text={"Action"} /></span></th><th><LocalizedText text={"Module"} /></th><th><LocalizedText text={"Part No."} /></th>
            <th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th><th className="num"><LocalizedText text={"เหลือต้องซื้อ"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"ราคา Estimate"} /></th></tr></thead>
            <tbody>{estimateLines.map((line) => { const inSheet = rows.some((row) => row.bomLineId === line.id); return <tr key={line.id} className={line.remaining > 0 ? undefined : "row-muted"}>
              <td className="pg-acts"><button className="btn ghost sm" type="button" onClick={() => pull([line])}><Icon name="plus" /><LocalizedText text={"ดึงมาใช้"} /></button></td>
              <td>{line.module}{line.sectionCode === "OUT" ? <small className="muted"><LocalizedText text={"Outsource"} /></small> : null}</td><td className="mono">{line.partNumber || line.itemCode || "—"}</td><td className="wrap">{line.description}</td><td>{line.brand || "—"}</td>
              <td className="num">{line.remaining > 0 ? quantity(line.remaining) : <Badge tone="green">{t("ขอซื้อครบแล้ว")}</Badge>}{inSheet ? <small className="muted"><LocalizedText text={"อยู่ในใบนี้แล้ว"} /></small> : null}</td>
              <td>{line.unit}</td><td className="num">{money(line.estimatedUnitCost)}</td></tr>; })}</tbody></table></div>
        </div> : null}
        {chips.length ? <FilterChips items={chips} active={module} onPick={(key) => { setModule(key); setPage(1); }} label="งบตาม Module" /> : null}
        {statuses.some((status) => status.thisRequest > 0) ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"งบ Estimate"} /></th>
          <th className="num"><LocalizedText text={"PR ก่อนหน้า"} /></th><th className="num"><LocalizedText text={"PR นี้"} /></th><th className="num"><LocalizedText text={"คงเหลือหลัง PR นี้"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
          <tbody>{statuses.filter((status) => status.thisRequest > 0).map((status) => <tr key={status.module}><td><strong>{status.module}</strong></td><td className="num">{money(status.budget)}</td>
            <td className="num">{money(status.requested)}</td><td className="num">{money(status.thisRequest)}</td><td className="num">{money(status.budget - status.requested - status.thisRequest)}</td>
            <td><Badge tone={LEVEL_TONE[status.level]}>{t(budgetNote(status, Boolean(approvers)))}{status.level !== "ok" && Number.isFinite(status.percent) ? ` (${status.percent.toFixed(1)}%)` : ""}</Badge></td></tr>)}</tbody></table></div> : null}
        {unit && unitBudget ? <div className={`pr-unit-budget${unitBudget.over ? " over" : ""}`} role="status" data-guide="pr.unit-budget">
          <strong>Unit {unitLabel(unit)}</strong><span><LocalizedText text={"งบของ Unit"} /> {money(unitBudget.budget)}</span><span><LocalizedText text={"PR ก่อนหน้า"} /> {money(unitBudget.requestedElsewhere)}</span>
          <span><LocalizedText text={"PR นี้"} /> {money(unitBudget.thisRequest)}</span><span><LocalizedText text={"คงเหลือ"} /> <strong>{money(unitBudget.remaining)}</strong></span>
          {unitBudget.over ? <small><LocalizedText text={"เกินงบของ Unit ผู้อนุมัติต้องใส่เหตุผล"} /></small> : null}</div> : null}
        {rows.length ? <div className="table-wrap tall" data-guide="pr.lines" ref={sheet}><table className={`pr-plan-table${showForm ? " with-form" : ""}`}>
          {/* An ERP line grid: fixed columns, the description takes what is left, and a control fills its cell. */}
          <colgroup>{[84, 120, 130, 0, 84, 130, 92, 54, 104, 110, ...(showForm ? [110, 110, 150, 140, 150] : []), 110, 128].map((width, index) => <col key={index} style={width ? { width } : undefined} />)}</colgroup>
          <thead><tr><th><LocalizedText text={"Source"} /></th>
          <th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Part No."} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th>
          <th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit"} /></th><th className="num"><LocalizedText text={"ราคาประมาณ"} /></th>
          <th className="num"><LocalizedText text={"มูลค่า"} /></th>
          {showForm ? <><th><LocalizedText text={"วัสดุ"} /></th><th><LocalizedText text={"การชุบ/ผิว"} /></th><th><LocalizedText text={"รายละเอียดเพิ่ม"} /></th>
            <th><LocalizedText text={"ต้องการภายใน"} /></th><th><LocalizedText text={"Link แบบ/ใบเสนอราคา"} /></th></> : null}
          <th><LocalizedText text={"Remark"} /></th><th><span className="sr-only"><LocalizedText text={"Action"} /></span></th></tr></thead>
          <tbody>{shown.map((row) => {
            const line = row.bomLineId === null ? undefined : lines.get(row.bomLineId);
            const issue = (serverIssue?.key === row.key ? serverIssue.message : undefined) ?? issues.get(row.key);
            // What is wrong with the row shows under its description.
            const note = (field: string) => field === "description" && issue ? <small className="red-text" role="alert">{t(issue)}</small> : null;
            const cell = (field: "itemCode" | "partNumber" | "description" | "brand" | "unit", maxLength: number) =>
              <td className="pg-in"><input {...grid} maxLength={maxLength} value={row[field]} aria-label={t(FIELD_LABEL[field])} onChange={(event) => update(row.key, { [field]: event.target.value })} />{note(field)}</td>;
            // The PR-Form's own fields, typed like the rest of the row.
            const formCell = (field: "material" | "treatment" | "detail" | "attachmentUrl", maxLength: number, label: string) =>
              <td className="pg-in"><input {...grid} maxLength={maxLength} value={row[field] ?? ""} aria-label={t(label)} onChange={(event) => update(row.key, { [field]: event.target.value })} /></td>;
            const parent = row.parentKey ? rows.find((item) => item.key === row.parentKey) : undefined;
            const rowAction = (icon: "refresh" | "trash", label: string, onClick: () => void) => <button className={icon === "trash" ? "pg-act danger" : "pg-act"} type="button" title={t(label)} aria-label={t(label)} onClick={onClick}><Icon name={icon} /></button>;
            return <tr key={row.key} data-row={row.key} className={parent ? "pr-part" : undefined}>
              {/* Where the row came from: typed in, or an estimate line (still its own item, or something bought in its place). */}
              <td>{row.lineType === "Unplanned" ? (isBlankPrRow(row) ? null : <span className="muted"><LocalizedText text={"กรอกเอง"} /></span>) : <Badge tone={KIND_TONE[row.lineType]}>{t(KIND_LABEL[row.lineType])}</Badge>}{line?.sectionCode === "OUT" ? <small className="muted"><LocalizedText text={"Outsource"} /></small> : null}{row.lineType === "Substitute" && line ? <small className="muted"><LocalizedText text={"แทน"} /> {line.itemCode || line.partNumber || line.description}</small> : null}{parent ? <small className="pr-part-of"><LocalizedText text={"ส่วนของ"} /> {parent.partNumber || parent.description || parent.itemCode}</small> : null}</td>
              {cell("itemCode", 100)}{cell("partNumber", 200)}{cell("description", 500)}{cell("brand", 200)}
              {row.lineType === "Unplanned" ? <td className="pg-in"><select value={row.module} aria-label={t("Module")} onChange={(event) => update(row.key, { module: event.target.value })}>
                <option value="">{t("Select…")}</option>{modules.map((name) => <option key={name} value={name}>{name}</option>)}</select></td> : <td>{row.module}</td>}
              <td className="pg-in num"><div className="pg-qty"><input {...grid} type="number" min="0" step="0.0001" value={row.quantity} aria-label={t("Qty")}
                onChange={(event) => update(row.key, { quantity: Number(event.target.value) })} />{row.lineType === "Planned" && line ? <small className="muted">/ {quantity(line.remaining)}</small> : null}</div></td>
              {cell("unit", 50)}
              <td className="pg-in num"><input {...grid} type="number" min="0" step="0.0001" value={row.unitPrice} aria-label={t("ราคาประมาณ/หน่วย")}
                onChange={(event) => update(row.key, { unitPrice: Number(event.target.value) })} /></td>
              <td className="num">{money(row.quantity * row.unitPrice)}</td>
              {showForm ? <>{formCell("material", 200, "วัสดุ")}{formCell("treatment", 200, "การชุบ/ผิว")}{formCell("detail", 500, "รายละเอียดเพิ่ม")}
                <td className="pg-in"><input {...grid} type="date" value={row.needBy ?? ""} aria-label={t("ต้องการภายใน")} onChange={(event) => update(row.key, { needBy: event.target.value })} /></td>
                {formCell("attachmentUrl", 500, "Link แบบ/ใบเสนอราคา")}</> : null}
              <td className="pg-in"><input {...grid} maxLength={500} value={row.remark} aria-label={t("Remark")} onChange={(event) => update(row.key, { remark: event.target.value })} /></td>
              {/* Add and remove sit in the same place on every row; the way back to the estimate's item follows when there is one. */}
              <td className="pg-acts">
                <button className="pg-act" type="button" title={t("แทรกแถวใต้แถวนี้")} aria-label={t("แทรกแถวใต้แถวนี้")} onClick={() => insertBelow(row)}><Icon name="plus" /></button>
                {/* A row becomes a part of the line above it (valves under their manifold), as on the PR-Form; pressed again it is a line of its own. */}
                <button className={`pg-act${parent ? " on" : ""}`} type="button" data-guide="pr.part" aria-pressed={Boolean(parent)} title={t(parent ? "แยกเป็นรายการหลัก" : "เป็นชิ้นส่วนของแถวบน")} aria-label={t(parent ? "แยกเป็นรายการหลัก" : "เป็นชิ้นส่วนของแถวบน")} onClick={() => setRows(togglePart(rows, row.key))}><Icon name="gitBranch" /></button>
                {rowAction("trash", "ลบแถว", () => setRows(withoutRows(rows, new Set([row.key]))))}
                {row.lineType === "Substitute" && line ? rowAction("refresh", "ใช้ตาม Estimate", () => setRows(rows.map((item) => item.key === row.key ? asPlanned(row, line) : item))) : null}
              </td>
            </tr>;
          })}</tbody>
          {/* The table ends in an add-row line, so a new line is one press from where the engineer is typing. */}
          {modules.length && currentPage === pageCount ? <tfoot><tr><td colSpan={showForm ? 17 : 12}><button className="pr-add-line" type="button" onClick={() => addUnplanned(1)}><Icon name="plus" /><LocalizedText text={"เพิ่มแถว"} /></button></td></tr></tfoot> : null}
          </table></div> : <EmptyState icon="layers" title="ยังไม่มีรายการในใบนี้" message="กด 'เพิ่มแถว' 'วางจาก Excel' หรือดึงจากรายการใน Estimate" />}
        {visible.length > pageSize ? <Pagination page={currentPage} pageCount={pageCount} from={(currentPage - 1) * pageSize + 1} to={Math.min(currentPage * pageSize, visible.length)} total={visible.length} onPage={setPage} /> : null}
        <div className="pr-plan-summary" aria-label={t("Purchase plan summary")} data-guide="pr.summary">
          <div><span><LocalizedText text={"รายการที่ซื้อ"} /></span><strong>{selected.length}</strong><small>{t(KIND_LABEL.Planned)} {kinds("Planned")} · {t(KIND_LABEL.Substitute)} {kinds("Substitute")} · {t(KIND_LABEL.Unplanned)} {kinds("Unplanned")}</small></div>
          <div><span><LocalizedText text={"ต้องแก้ก่อนส่ง"} /></span><strong>{issues.size}</strong><small><LocalizedText text={"แถวที่มีข้อความสีแดง"} /></small></div>
          <div><span><LocalizedText text={"ผู้อนุมัติ"} /></span><strong data-guide="pr.approvers">{approvers ? approvers.map((approver) => approver.name).join(" → ") : needsManagement ? "PM + EM" : "PM"}</strong><small><LocalizedText text={"แล้วส่งเข้า ERP อัตโนมัติ"} /></small></div>
          <div className="accent"><span><LocalizedText text={"ยอดขอซื้อ (ประมาณ)"} /></span><strong>{money(total)}</strong><TablePageSize value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>
        </div>
        {overBudget ? <label className={`pr-over-reason${needsReason ? " missing" : ""}`} data-guide="pr.over-reason">
          <span><Icon name="alertTriangle" /><LocalizedText text={"ใบนี้เกินงบ ใส่เหตุผลให้ผู้อนุมัติอ่านก่อนส่งขออนุมัติ"} /></span>
          <textarea rows={2} maxLength={2000} value={justification} onChange={(event) => setJustification(event.target.value)} placeholder={t("เช่น ราคาขึ้นจากตอนประเมิน หรือลูกค้าขอเพิ่มงาน")} /></label> : null}
        <Toolbar>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
          <button className="btn ghost" type="button" disabled={busy || !selected.length || issues.size > 0} onClick={() => { void submit(false); }}><LocalizedText text={"Save Draft"} /></button>
          <button className="btn primary" type="button" data-guide="pr.submit" disabled={busy || !selected.length || issues.size > 0 || needsReason} onClick={() => { void submit(true); }}>
            <Icon name="send" />{busy ? <LocalizedText text={"Saving…"} /> : <>{t("ส่งขออนุมัติ")} ({selected.length})</>}</button>
        </Toolbar>
      </> : <EmptyState icon="layers" title="No released BOM" message="Release a BOM before creating a requisition" />}
    </Panel>
  );
}
