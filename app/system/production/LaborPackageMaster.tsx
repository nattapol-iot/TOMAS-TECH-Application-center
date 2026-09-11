"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError, createLaborPackage, listLaborPackages, loadLaborPackage, updateLaborPackage,
  type BootstrapData, type LaborPackageDetail, type LaborPackageInput, type LaborPackageSummary,
} from "../api-client";
import { Badge, EmptyState, Field, Icon, PageHeader, Pagination, Panel, SearchInput } from "../ui";
import { laborPackageInput, laborPackagePermissions, suggestedCopyCode } from "../../../lib/labor-package-master";

const PAGE_SIZE = 25;
const ERP_CATEGORIES = ["Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training"];
const messageOf = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถทำรายการได้";
const unavailableMessage = (error: unknown) => error instanceof ApiClientError && error.code === "labor_packages_unavailable" ? error.message : null;
const statusTone = (status: string): "green" | "amber" | "slate" => status === "Active" ? "green" : status === "Draft" ? "amber" : "slate";

export function LaborPackageMaster({ bootstrap, initialPackageId, onClose }: {
  bootstrap: BootstrapData;
  initialPackageId?: number;
  onClose?: () => void;
}) {
  const permission = useMemo(() => laborPackagePermissions(bootstrap.permissions), [bootstrap.permissions]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LaborPackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LaborPackageDetail | null>(null);
  const [draft, setDraft] = useState<LaborPackageInput | null>(null);
  const [copying, setCopying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [success, setSuccess] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  const loadDetail = useCallback(async (id: number, force = false) => {
    if (!force && dirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจาก Draft นี้หรือไม่?")) return;
    const sequence = ++detailSequence.current;
    setLoadingDetail(true);
    setError("");
    try {
      const detail = await loadLaborPackage(id);
      if (sequence !== detailSequence.current) return;
      setSelected(detail);
      setDraft(laborPackageInput(detail));
      setCopying(false);
      setDirty(false);
    } catch (requestError) {
      if (sequence === detailSequence.current) setError(messageOf(requestError));
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, [dirty]);

  useEffect(() => {
    const sequence = ++listSequence.current;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void listLaborPackages({ search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE })
        .then((result) => {
          if (sequence !== listSequence.current) return;
          setItems(result.items); setTotal(result.total); setUnavailable(""); setListError("");
        })
        .catch((requestError) => {
          if (sequence !== listSequence.current) return;
          const reason = unavailableMessage(requestError);
          setItems([]); setTotal(0); setUnavailable(reason ?? ""); setListError(reason ? "" : messageOf(requestError));
        })
        .finally(() => { if (sequence === listSequence.current) setLoadingList(false); });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [page, refreshKey, search, status]);

  const initialLoaded = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (initialPackageId && initialLoaded.current !== initialPackageId) {
      initialLoaded.current = initialPackageId;
      void loadDetail(initialPackageId, true);
    }
  }, [initialPackageId, loadDetail]);

  const refresh = () => {
    if (saving) return;
    setSuccess(""); setRefreshKey((value) => value + 1);
    if (selected && !copying) void loadDetail(selected.id);
  };
  const patchHeader = (change: Partial<LaborPackageInput>) => {
    setDraft((current) => current ? { ...current, ...change } : current); setDirty(true);
  };
  const patchLine = (index: number, change: Partial<LaborPackageInput["lines"][number]>) => {
    setDraft((current) => current ? { ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...change } : line) } : current);
    setDirty(true);
  };

  const save = async (publish: boolean) => {
    if (!draft || (!copying && !selected)) return;
    const snapshot = structuredClone(draft);
    setSaving(true); setError(""); setSuccess("");
    try {
      const input = { ...snapshot, status: publish ? "Active" : "Draft" };
      if (copying) {
        const created = await createLaborPackage(input);
        setSuccess(`สร้าง Draft ${created.code} แล้ว`); setRefreshKey((value) => value + 1);
        await loadDetail(created.id, true);
      } else if (selected) {
        await updateLaborPackage(selected.id, { ...input, rowVersion: selected.rowVersion });
        setSuccess(publish ? "เผยแพร่ Labor Package แล้ว" : "บันทึก Draft แล้ว"); setRefreshKey((value) => value + 1);
        await loadDetail(selected.id, true);
      }
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 409 && selected && !copying) {
        setError(`${messageOf(requestError)} — ข้อมูลที่กรอกยังอยู่ กดรีเฟรชหากต้องการโหลดฉบับล่าสุดก่อนแก้ไขอีกครั้ง`);
      } else setError(messageOf(requestError));
    } finally { setSaving(false); }
  };

  const startCopy = () => {
    if (!selected || !permission.canEditDraft) return;
    setDraft({ ...laborPackageInput(selected, "Draft"), code: suggestedCopyCode(selected.code), name: `${selected.name} (สำเนา)` });
    setCopying(true); setDirty(true); setSuccess(""); setError("");
  };
  const editable = Boolean(!saving && draft && permission.canEditDraft && (copying || selected?.status === "Draft"));

  return <>
    {!onClose ? <PageHeader eyebrow="ESTIMATE MASTER" title="Labor Package Master" subtitle="ค้นหา Draft ที่บันทึกไว้ แก้ไขกิจกรรม และเผยแพร่ให้ทีมประมาณราคาใช้งาน" actions={<button className="btn default" type="button" onClick={refresh}><Icon name="refresh" />รีเฟรช</button>} /> : null}
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    {listError ? <div className="info-strip red" role="alert">{listError}</div> : null}
    {success ? <div className="info-strip green"><Icon name="checkCircle" /><span>{success}</span></div> : null}
    {!permission.canEditDraft ? <div className="info-strip amber"><Icon name="lock" /><span>บัญชีนี้เปิดดูได้ แต่ยังไม่มีสิทธิ์แก้ไข Labor Package</span></div> : null}
    {unavailable ? <EmptyState icon="alertCircle" title="ฐานข้อมูลนี้ยังไม่มี Labor Package Master" message={unavailable} /> : <div className="form-grid two">
      <Panel title={`${total} packages`} subtitle="Draft, Active และ Retired" actions={<button className="btn ghost sm" type="button" onClick={refresh}><Icon name="refresh" />รีเฟรช</button>}>
        <div className="row" style={{ gap: 8 }}>
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหารหัส ชื่อ กิจกรรม หรือระดับ" />
          <select aria-label="สถานะ Package" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">ทุกสถานะ</option><option>Draft</option><option>Active</option><option>Retired</option></select>
        </div>
        {loadingList ? <div className="empty" role="status"><span className="spinner" />กำลังโหลด…</div> : items.length ? <div className="table-wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Package</th><th style={{ width: 90 }}>สถานะ</th><th className="num" style={{ width: 65 }}>กิจกรรม</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id && !copying ? "selected" : undefined}>
            <td><button className="btn ghost" type="button" disabled={saving} onClick={() => { void loadDetail(item.id); }}><strong>{item.code}</strong></button><div className="cell-primary"><span>{item.name}</span><span>{item.costType} · R{item.revision}</span></div></td>
            <td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td><td className="num">{item.lineCount}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon="search" title="ไม่พบ Labor Package" message="ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ" />}
        <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={Math.min(page * PAGE_SIZE, total)} total={total} onPage={setPage} />
      </Panel>

      <Panel title={copying ? "สร้าง Draft จาก Package" : selected ? `${selected.code} · ${selected.name}` : "รายละเอียด Package"} actions={onClose ? <button className="btn ghost sm" type="button" onClick={onClose}>ปิด</button> : undefined}>
        {loadingDetail ? <div className="empty" role="status"><span className="spinner" />กำลังโหลดรายละเอียด…</div> : !draft ? <EmptyState icon="package" title="เลือก Labor Package" message="เลือกจากรายการด้านซ้ายเพื่อดูรายละเอียดหรือแก้ไข Draft" /> : <>
          {!copying && selected?.status !== "Draft" ? <div className="info-strip"><Icon name="lock" /><span>{selected?.status === "Active" ? "Package ที่เผยแพร่แล้วแก้ไขไม่ได้ ให้สร้างสำเนาเป็น Draft หากต้องการปรับปรุง" : "Package ที่เลิกใช้งานแล้วเปิดดูได้อย่างเดียว"}</span></div> : null}
          <div className="form-grid two">
            <Field label="รหัส *"><input maxLength={40} value={draft.code} readOnly={!editable} onChange={(event) => patchHeader({ code: event.target.value.toUpperCase() })} /></Field>
            <Field label="ชื่อ Package *"><input maxLength={200} value={draft.name} readOnly={!editable} onChange={(event) => patchHeader({ name: event.target.value })} /></Field>
            <Field label="คำอธิบาย" span={2}><textarea maxLength={1000} value={draft.description ?? ""} readOnly={!editable} onChange={(event) => patchHeader({ description: event.target.value })} /></Field>
          </div>
          <div className="info-strip"><Icon name="package" /><span>{draft.costType} · {draft.department || "ทุกแผนก"} · {draft.projectType || "ทุกประเภทโครงการ"} · {draft.lines.length} กิจกรรม</span></div>
          <div className="table-wrap" style={{ maxHeight: onClose ? 390 : 520 }}><table className="sheet">
            <thead><tr><th>กิจกรรม</th><th className="num" style={{ width: 82 }}>จำนวนคน</th><th className="num" style={{ width: 105 }}>ระยะเวลา</th><th style={{ width: 132 }}>ERP</th></tr></thead>
            <tbody>{draft.lines.map((line, index) => <tr key={`${selected?.id ?? "copy"}-${index}`}>
              <td><input maxLength={300} value={line.activity} readOnly={!editable} onChange={(event) => patchLine(index, { activity: event.target.value })} /><div className="cell-primary"><span>{line.department} · {line.level}</span><span>{line.provider} · {line.rateBasis}{line.rateId ? ` · Rate #${line.rateId}` : ""}</span></div></td>
              <td><input className="num" type="number" min="0.01" step="0.01" value={line.defaultEngineers ?? 1} readOnly={!editable} aria-label={`จำนวน ${line.activity}`} onChange={(event) => patchLine(index, { defaultEngineers: Number(event.target.value) })} /></td>
              <td><input className="num" type="number" min="0.01" step="0.01" value={line.rateBasis === "Hourly" ? line.defaultHours ?? "" : line.defaultManDays ?? 1} readOnly={!editable} aria-label={`ระยะเวลา ${line.activity}`} onChange={(event) => patchLine(index, line.rateBasis === "Hourly" ? { defaultHours: Number(event.target.value) } : { defaultManDays: Number(event.target.value) })} /><small>{line.rateBasis === "Hourly" ? "ชั่วโมง" : "man-days"}</small></td>
              <td><select value={line.defaultErpCategory ?? ""} disabled={!editable} aria-label={`ERP ${line.activity}`} onChange={(event) => patchLine(index, { defaultErpCategory: event.target.value || null })}><option value="">Unmapped</option>{ERP_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></td>
            </tr>)}</tbody>
          </table></div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            {!copying && selected?.status === "Active" && permission.canEditDraft ? <button className="btn default" type="button" onClick={startCopy}><Icon name="copy" />สร้างสำเนา Draft</button> : null}
            {copying ? <button className="btn ghost" type="button" disabled={saving} onClick={() => { if (selected) { setDraft(laborPackageInput(selected)); setCopying(false); setDirty(false); } }}>ยกเลิกสำเนา</button> : null}
            {editable ? <button className="btn default" type="button" disabled={saving || !draft.code.trim() || !draft.name.trim()} onClick={() => { void save(false); }}><Icon name="check" />{saving ? "กำลังบันทึก…" : "บันทึก Draft"}</button> : null}
            {editable && !copying && permission.canPublish ? <button className="btn primary" type="button" disabled={saving || !draft.code.trim() || !draft.name.trim()} onClick={() => { void save(true); }}><Icon name="check" />เผยแพร่</button> : null}
          </div>
          {editable && !copying && !permission.canPublish ? <p className="muted">ให้ผู้ดูแล Master Data ตรวจสอบและเผยแพร่ Draft นี้ก่อนนำไปใช้</p> : null}
        </>}
      </Panel>
    </div>}
  </>;
}
