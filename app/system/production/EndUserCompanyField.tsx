"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";

import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ApiClientError, apiRequest, type BootstrapData } from "../api-client";
import { Field, Icon, Modal } from "../ui";
import { CustomerEntryModal } from "./InquiryCustomerFields";

type Company = BootstrapData["customers"][number];
type Props = {
  bootstrap: BootstrapData;
  customerId: number;
  value: number | null;
  disabled?: boolean;
  onChange: (id: number | null) => void;
  refreshBootstrap: () => Promise<void>;
  notify: (message: string) => void;
};

export const canEditEndUser = (status: string) => !["closed", "cancelled", "canceled", "rejected"].includes(status.trim().toLowerCase());

export function EndUserCompanyField({ bootstrap, customerId, value, disabled, onChange, refreshBootstrap, notify }: Props) {
  const localizeCopy = useStaticCopy();
  const [created, setCreated] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const companies = useMemo(() => [...bootstrap.customers, ...created.filter((company) => !bootstrap.customers.some((item) => item.id === company.id))].sort((a, b) => a.name.localeCompare(b.name)), [bootstrap.customers, created]);
  const canCreate = bootstrap.permissions.includes("intake.write") || bootstrap.permissions.includes("master.write");
  return <>
    <Field label="End user / บริษัทผู้ใช้งานปลายทาง" span={2} hint="บริษัทที่ใช้งานจริง อาจต่างจากบริษัทที่เรารับงานด้วย · Optional; leave blank when unknown">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select aria-label={localizeCopy("End user / บริษัทผู้ใช้งานปลายทาง")} style={{ flex: "1 1 240px", minWidth: 0 }} disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
          <option value=""><LocalizedText text={"ยังไม่ระบุ / Not specified"} /></option>
          {value && !companies.some((company) => company.id === value) ? <option value={value}><LocalizedText text={"บริษัทที่เลือกไว้ / Selected company #"} />{value}</option> : null}
          {companies.map((company) => <option key={company.id} value={company.id}>{company.code} — {company.name}</option>)}
        </select>
        <button className="btn default" type="button" disabled={disabled || !customerId} onClick={() => onChange(customerId)}><LocalizedText text={"บริษัทเดียวกับผู้ว่าจ้าง / Same customer"} /></button>
        {canCreate ? <button className="btn default" type="button" disabled={disabled} onClick={() => setOpen(true)}><Icon name="plus" /><LocalizedText text={"เพิ่มบริษัท / New company"} /></button> : null}
      </div>
    </Field>
    {open && typeof document !== "undefined" ? createPortal(<CustomerEntryModal kind="customer" companyOnly customers={companies} directory={null} onClose={() => setOpen(false)} onRefresh={refreshBootstrap} onExistingCustomer={(company) => { onChange(company.id); setOpen(false); }} onExistingContact={() => undefined} onContactSaved={() => undefined} onCustomerSaved={(company) => {
      setCreated((current) => [...current, company]); onChange(company.id); setOpen(false);
      notify(`เพิ่มบริษัท / Company saved: ${company.name}`);
      void refreshBootstrap().catch(() => notify("บันทึกแล้ว แต่รีเฟรชรายการไม่สำเร็จ / Saved; refresh failed"));
    }} />, document.body) : null}
  </>;
}

export type EndUserRecord = { id: number; customerId?: number; customerName: string; endUserCustomerId?: number | null; endUserName?: string | null; endUserCode?: string | null; rowVersion: string; status: string };

export function EndUserEditModal({ kind, record, bootstrap, refreshBootstrap, notify, onClose, onSaved, reloadRecord }: {
  kind: "inquiries" | "projects"; record: EndUserRecord; bootstrap: BootstrapData;
  refreshBootstrap: () => Promise<void>; notify: (message: string) => void; onClose: () => void;
  onSaved: () => Promise<void>; reloadRecord: () => Promise<EndUserRecord>;
}) {
  const [current, setCurrent] = useState(record);
  const [value, setValue] = useState<number | null>(record.endUserCustomerId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const reload = async () => {
    setBusy(true);
    try { const latest = await reloadRecord(); setCurrent(latest); setValue(latest.endUserCustomerId ?? null); setNeedsReload(false); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ / Reload failed"); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || needsReload || !canEditEndUser(current.status)) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/${kind}/${current.id}/end-user`, { method: "PUT", body: JSON.stringify({ endUserCustomerId: value, rowVersion: current.rowVersion }) });
      await onSaved(); onClose(); notify("บันทึก End user แล้ว / End user saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ / Save failed");
      if (reason instanceof ApiClientError && reason.status === 409) setNeedsReload(true);
    } finally { setBusy(false); }
  };
  return <Modal title="แก้ไข End user / Edit end user" subtitle={`บริษัทที่รับงานด้วย / Contracting customer: ${current.customerName}`} size="lg" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={(event) => { void submit(event); }}>
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      {needsReload ? <div className="callout" role="alert">ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดและตรวจข้อมูลล่าสุดก่อนบันทึก / Reload and review the latest record before saving.<button className="btn default" type="button" disabled={busy} onClick={() => { void reload(); }}><LocalizedText text={"โหลดข้อมูลล่าสุด / Reload latest"} /></button></div> : null}
      {!canEditEndUser(current.status) ? <div className="callout">รายการนี้ปิดแล้ว ไม่สามารถแก้ไขได้ / This record is closed.</div> : null}
      <div className="form-grid two"><EndUserCompanyField bootstrap={bootstrap} customerId={current.customerId ?? 0} value={value} onChange={setValue} disabled={busy || needsReload || !canEditEndUser(current.status)} refreshBootstrap={refreshBootstrap} notify={notify} /></div>
      <p className="muted">{kind === "inquiries" ? "Project ใหม่จะรับ End user นี้ไปด้วย ส่วน Project ที่สร้างแล้วคงข้อมูลของตัวเอง / New projects inherit this value; existing projects keep their own end user." : "แก้เฉพาะ Project นี้ / Updates this project only."}</p>
      <div className="row-actions" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"ยกเลิก / Cancel"} /></button><button className="btn primary" type="submit" disabled={busy || needsReload || !canEditEndUser(current.status) || value === (current.endUserCustomerId ?? null)}>{busy ? "กำลังบันทึก… / Saving…" : "บันทึก / Save"}</button></div>
    </form>
  </Modal>;
}
