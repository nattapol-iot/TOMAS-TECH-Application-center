"use client";
import { useT as useStaticCopy } from "../i18n";
import { LocalizedText } from "../LocalizedText";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { BusinessCardExtraction } from "../../../lib/business-card";
import { apiRequest, type BootstrapData } from "../api-client";
import { Field, Icon, Modal } from "../ui";
import { BusinessCardScanner } from "./BusinessCardScanner";
import { canonicalLocalizedName, contactNameLines, localizedNamesFromCard, type ContactTitles } from "./customer-localized-names";

type Customer = BootstrapData["customers"][number];
type Contact = ContactTitles & { id: number; siteId: number; siteName: string; name: string; nameTh: string; nameEn: string; nameJa: string; email: string; phone: string; department: string; position: string };
type Directory = { sites: { id: number; code: string; name: string }[]; contacts: Contact[]; primaryContact: (ContactTitles & { name: string; nameTh: string; nameEn: string; nameJa: string; email: string; phone: string; department?: string; position?: string }) | null };
type Props = {
  customers: Customer[]; permissions: string[]; customerId: number; contact: string; disabled?: boolean;
  onChange: (customerId: number, contact: string) => void;
  refreshBootstrap: () => Promise<void>; notify: (message: string) => void;
};
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const errorText = (error: unknown) => error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง";

export function InquiryCustomerFields({ customers, permissions, customerId, contact, disabled, onChange, refreshBootstrap, notify }: Props) {
  const localizeCopy = useStaticCopy();
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [directory, setDirectory] = useState<{ customerId: number; value: Directory } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedKey, setSelectedKey] = useState("");
  const [modal, setModal] = useState<"customer" | "contact" | null>(null);
  const canCreate = permissions.includes("intake.write") || permissions.includes("master.write");
  const allCustomers = useMemo(() => [...customers, ...createdCustomers.filter((created) => !customers.some((item) => item.id === created.id))].sort((a, b) => a.name.localeCompare(b.name)), [customers, createdCustomers]);
  const currentCustomer = allCustomers.find((item) => item.id === customerId);
  const activeDirectory = directory?.customerId === customerId ? directory.value : null;
  const contactChoices = activeDirectory ? [
    ...(activeDirectory.primaryContact?.name && !activeDirectory.contacts.some((entry) => normalize(entry.name) === normalize(activeDirectory.primaryContact!.name) && normalize(entry.email) === normalize(activeDirectory.primaryContact!.email) && normalize(entry.phone) === normalize(activeDirectory.primaryContact!.phone)) ? [{ ...activeDirectory.primaryContact, key: "primary", siteName: "ผู้ติดต่อหลัก" }] : []),
    ...activeDirectory.contacts.map((entry) => ({ ...entry, key: String(entry.id) })),
  ] : [];
  const selected = contactChoices.find((entry) => entry.key === selectedKey);

  useEffect(() => {
    let cancelled = false;
    if (!customerId) return;
    void apiRequest<Directory>(`/api/v1/sales/customers/${customerId}/contacts`)
      .then((value) => { if (!cancelled) setDirectory({ customerId, value }); })
      .catch((error) => { if (!cancelled) setLoadError(errorText(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, revision]);

  const chooseCustomer = (id: number, name = "") => { setSelectedKey(""); setLoadError(""); setLoading(id > 0); setDirectory(null); setRevision((value) => value + 1); onChange(id, name); };
  const reloadContacts = () => { setLoading(!!customerId); setLoadError(""); setRevision((value) => value + 1); };
  const refreshAfterSave = () => { void refreshBootstrap().catch(() => notify("บันทึกแล้ว แต่รีเฟรชรายการไม่สำเร็จ ข้อมูลใหม่ยังเลือกใช้ได้ในฟอร์มนี้")); };
  return <>
    <Field label="บริษัทที่รับงานด้วย / Contracting customer *" span={2}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select aria-label={localizeCopy("ลูกค้า / บริษัท")} required disabled={disabled} style={{ flex: "1 1 240px", minWidth: 0 }} value={customerId} onChange={(event) => chooseCustomer(Number(event.target.value))}>
          <option value={0}>เลือกบริษัทลูกค้า</option>
          {allCustomers.map((item) => <option key={item.id} value={item.id}>{item.code} — {[item.nameTh, item.nameEn, item.nameJa].filter(Boolean).join(" / ") || item.name}</option>)}
        </select>
        {canCreate ? <button className="btn default" type="button" disabled={disabled} onClick={() => setModal("customer")}><Icon name="plus" />ลูกค้าใหม่</button> : null}
      </div>
      {!allCustomers.length ? <small>ยังไม่มีข้อมูลลูกค้า{canCreate ? " กดลูกค้าใหม่เพื่อเริ่มรับเรื่อง" : " กรุณาให้ผู้มีสิทธิ์เพิ่มข้อมูลลูกค้า"}</small> : null}
    </Field>
    <Field label="ผู้ติดต่อของเรื่องนี้" span={2}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select aria-label={localizeCopy("เลือกผู้ติดต่อที่บันทึกไว้")} disabled={disabled || !customerId || loading} style={{ flex: "1 1 240px", minWidth: 0 }} value={selectedKey} onChange={(event) => { const key = event.target.value; setSelectedKey(key); const entry = contactChoices.find((item) => item.key === key); onChange(customerId, entry?.name ?? ""); }}>
          <option value="">{!customerId ? "เลือกบริษัทก่อน" : loading ? "กำลังโหลดผู้ติดต่อ…" : "เลือกผู้ติดต่อ หรือกรอกชื่อด้านล่าง"}</option>
          {contactChoices.map((entry) => <option key={entry.key} value={entry.key}>{[contactNameLines(entry, entry.name).map((line) => line.value).join(" / "), entry.position, entry.department, entry.siteName, entry.email].filter(Boolean).join(" · ")}</option>)}
        </select>
        {canCreate ? <button className="btn default" type="button" disabled={disabled || !customerId || loading || !activeDirectory || !!loadError} onClick={() => setModal("contact")}><Icon name="plus" />ผู้ติดต่อใหม่</button> : null}
      </div>
      <input aria-label={localizeCopy("ชื่อผู้ติดต่อสำหรับ Inquiry นี้")} disabled={disabled || !customerId} maxLength={200} placeholder={localizeCopy("ชื่อผู้ติดต่อ (กรอกเฉพาะเรื่องนี้ได้)")} value={contact} onChange={(event) => { setSelectedKey(""); onChange(customerId, event.target.value); }} />
      {selected ? <small>{[selected.position, selected.department, selected.email, selected.phone].filter(Boolean).join(" · ") || "ยังไม่มีอีเมลหรือเบอร์โทร"}</small> : <small>กดผู้ติดต่อใหม่เพื่อบันทึกไว้ใช้ซ้ำในงานถัดไป</small>}
      {customerId && loadError ? <div role="alert"><span>{loadError}</span> <button type="button" className="btn ghost" onClick={reloadContacts}>โหลดผู้ติดต่ออีกครั้ง</button></div> : null}
    </Field>
    {modal && typeof document !== "undefined" ? createPortal(
      <CustomerEntryModal kind={modal} customer={currentCustomer} customers={allCustomers} directory={activeDirectory} onClose={() => setModal(null)} onRefresh={() => { reloadContacts(); return refreshBootstrap(); }}
        onExistingCustomer={(item) => { chooseCustomer(item.id); setModal(null); }}
        onExistingContact={(item) => { setSelectedKey(String(item.id)); onChange(customerId, item.name); setModal(null); }}
        onCustomerSaved={(item) => { setCreatedCustomers((current) => [...current, item]); chooseCustomer(item.id, item.contact || ""); setModal(null); notify(`เพิ่มลูกค้า ${item.name} แล้ว`); refreshAfterSave(); }}
        onContactSaved={(item) => { setDirectory((current) => current?.customerId === customerId ? { customerId, value: { ...current.value, sites: current.value.sites.some((site) => site.id === item.siteId) ? current.value.sites : [...current.value.sites, { id: item.siteId, code: "MAIN", name: item.siteName }], contacts: [...current.value.contacts, item] } } : current); setSelectedKey(String(item.id)); onChange(customerId, item.name); setModal(null); notify(`เพิ่มผู้ติดต่อ ${item.name} แล้ว`); refreshAfterSave(); }} />,
      document.body,
    ) : null}
  </>;
}

export function CustomerEntryModal({ kind, companyOnly = false, customer, customers, directory, onClose, onRefresh, onExistingCustomer, onExistingContact, onCustomerSaved, onContactSaved }: {
  kind: "customer" | "contact"; companyOnly?: boolean; customer?: Customer; customers: Customer[]; directory: Directory | null;
  onClose: () => void; onRefresh: () => Promise<void>; onExistingCustomer: (item: Customer) => void; onExistingContact: (item: Contact) => void;
  onCustomerSaved: (item: Customer) => void; onContactSaved: (item: Contact) => void;
}) {
  const localizeCopy = useStaticCopy();
  const isCustomer = kind === "customer";
  const [form, setForm] = useState({ nameTh: "", nameEn: "", nameJa: "", code: "", contactNameTh: "", contactNameEn: "", contactNameJa: "", titleTh: "", titleEn: "", titleJa: "", email: "", phone: "", site: "", siteId: "", department: "", position: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    modalRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const keepFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const controls = [...(modalRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']") ?? [])].filter((element) => !element.matches(":disabled"));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const applyBusinessCard = (result: BusinessCardExtraction) => {
    const companyNames = localizedNamesFromCard(result.companyNames, result.companyName);
    const contactNames = localizedNamesFromCard(result.contactNames, result.contactName);
    const fields: { key: keyof typeof form; value: string; label: string }[] = isCustomer
      ? [
          { key: "nameTh", value: companyNames.nameTh, label: "ชื่อบริษัท (ไทย)" },
          { key: "nameEn", value: companyNames.nameEn, label: "Company name (English)" },
          { key: "nameJa", value: companyNames.nameJa, label: "会社名 (日本語)" },
          ...(!companyOnly ? [
            { key: "contactNameTh" as const, value: contactNames.nameTh, label: "ชื่อผู้ติดต่อ (ไทย)" },
            { key: "contactNameEn" as const, value: contactNames.nameEn, label: "Contact name (English)" },
            { key: "contactNameJa" as const, value: contactNames.nameJa, label: "担当者名 (日本語)" },
            { key: "email" as const, value: result.email, label: "อีเมล" },
            { key: "phone" as const, value: result.phone, label: "โทรศัพท์" },
            { key: "department" as const, value: result.department, label: "แผนก" },
            { key: "position" as const, value: result.position, label: "ตำแหน่ง" },
          ] : []),
          { key: "site", value: result.address, label: "ที่อยู่" },
        ]
      : [
          { key: "nameTh", value: contactNames.nameTh, label: "ชื่อผู้ติดต่อ (ไทย)" },
          { key: "nameEn", value: contactNames.nameEn, label: "Contact name (English)" },
          { key: "nameJa", value: contactNames.nameJa, label: "担当者名 (日本語)" },
          { key: "email", value: result.email, label: "อีเมล" },
          { key: "phone", value: result.phone, label: "โทรศัพท์" },
          { key: "department", value: result.department, label: "แผนก" },
          { key: "position", value: result.position, label: "ตำแหน่ง" },
        ];
    const fillable = fields.filter((field) => field.value && !form[field.key].trim());
    if (fillable.length) setForm((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => {
      const suggestion = fillable.find((field) => field.key === key)?.value;
      return [key, suggestion && !String(value).trim() ? suggestion : value];
    })) as typeof current);
    return fillable.map((field) => field.label);
  };
  const companyName = canonicalLocalizedName({ nameTh: form.nameTh, nameEn: form.nameEn, nameJa: form.nameJa });
  const contactName = canonicalLocalizedName(isCustomer
    ? { nameTh: form.contactNameTh, nameEn: form.contactNameEn, nameJa: form.contactNameJa }
    : { nameTh: form.nameTh, nameEn: form.nameEn, nameJa: form.nameJa });
  const name = normalize(isCustomer ? companyName : contactName);
  const code = normalize(form.code);
  const email = normalize(form.email);
  const similarCustomers = isCustomer ? customers.filter((item) => (name.length >= 2 && normalize([item.name, item.nameTh, item.nameEn, item.nameJa].join(" ")).includes(name)) || (code.length > 0 && normalize(item.code) === code)).slice(0, 5) : [];
  const similarContacts = !isCustomer ? (directory?.contacts ?? []).filter((item) => (name.length >= 2 && normalize([item.name, item.nameTh, item.nameEn, item.nameJa].join(" ")).includes(name)) || (email.length > 0 && normalize(item.email) === email)).slice(0, 5) : [];
  const close = () => { if (!busy) onClose(); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    if (isCustomer && !companyName) { setError("กรุณาระบุชื่อบริษัทอย่างน้อยหนึ่งภาษา"); return; }
    if (!isCustomer && !contactName) { setError("กรุณาระบุชื่อผู้ติดต่ออย่างน้อยหนึ่งภาษา"); return; }
    if (isCustomer && !companyOnly && !contactName && (form.email.trim() || form.phone.trim() || form.department.trim() || form.position.trim() || form.titleTh.trim() || form.titleEn.trim() || form.titleJa.trim())) {
      setError("กรุณาระบุชื่อผู้ติดต่อหลัก เพื่อบันทึกคำนำหน้า ข้อมูลการติดต่อ ตำแหน่ง และแผนกของบุคคลนี้");
      return;
    }
    setBusy(true); setError("");
    try {
      if (isCustomer) {
        const saved = await apiRequest<Customer>("/api/v1/sales/customers", { method: "POST", body: JSON.stringify({ name: companyName, nameTh: form.nameTh.trim(), nameEn: form.nameEn.trim(), nameJa: form.nameJa.trim(), code: form.code.trim() || undefined, ...(!companyOnly ? { contact: contactName || undefined, contactNameTh: form.contactNameTh.trim(), contactNameEn: form.contactNameEn.trim(), contactNameJa: form.contactNameJa.trim(), contactTitleTh: form.titleTh.trim(), contactTitleEn: form.titleEn.trim(), contactTitleJa: form.titleJa.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, department: form.department.trim(), position: form.position.trim() } : {}), site: form.site.trim() || undefined }) });
        onCustomerSaved(saved);
      } else {
        const saved = await apiRequest<Contact>(`/api/v1/sales/customers/${customer!.id}/contacts`, { method: "POST", body: JSON.stringify({ name: contactName, nameTh: form.nameTh.trim(), nameEn: form.nameEn.trim(), nameJa: form.nameJa.trim(), titleTh: form.titleTh.trim(), titleEn: form.titleEn.trim(), titleJa: form.titleJa.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, department: form.department.trim() || undefined, position: form.position.trim() || undefined, siteId: form.siteId ? Number(form.siteId) : undefined }) });
        onContactSaved(saved);
      }
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setBusy(false); }
  };
  return <div ref={modalRef} role="presentation" onKeyDown={keepFocus}><Modal title={isCustomer ? companyOnly ? "เพิ่มบริษัท End user / New company" : "เพิ่มลูกค้าใหม่" : "เพิ่มผู้ติดต่อใหม่"} subtitle={isCustomer ? "บันทึกในข้อมูลบริษัทกลาง แล้วเลือกใช้ได้ทันที" : customer?.name} size="lg" onClose={close}>
    <form onSubmit={(event) => { void submit(event); }}>
      {error ? <div className="callout danger" role="alert"><span>{error}</span><button className="btn ghost" type="button" disabled={busy} onClick={() => { void onRefresh().catch((reason) => setError(errorText(reason))); }}>รีเฟรชข้อมูลที่มีอยู่</button></div> : null}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <BusinessCardScanner disabled={busy} onApply={applyBusinessCard} />
        <div className="form-grid two">
          <Field label={`${isCustomer ? "ชื่อบริษัท" : "ชื่อผู้ติดต่อ"} (ไทย)`} hint="กรอกอย่างน้อย 1 ภาษา"><input aria-label={`${isCustomer ? "ชื่อบริษัท" : "ชื่อผู้ติดต่อ"} ภาษาไทย`} maxLength={isCustomer ? 300 : 200} value={form.nameTh} onChange={(event) => set("nameTh", event.target.value)} /></Field>
          <Field label={`${isCustomer ? "Company name" : "Contact name"} (English)`}><input aria-label={`${isCustomer ? "Company name" : "Contact name"} English`} maxLength={isCustomer ? 300 : 200} value={form.nameEn} onChange={(event) => set("nameEn", event.target.value)} /></Field>
          <Field label={`${isCustomer ? "会社名" : "担当者名"} (日本語)`}><input aria-label={`${isCustomer ? "会社名" : "担当者名"} 日本語`} maxLength={isCustomer ? 300 : 200} value={form.nameJa} onChange={(event) => set("nameJa", event.target.value)} /></Field>
          {isCustomer ? <><Field label="รหัสลูกค้า" hint="เว้นว่างเพื่อให้ระบบสร้างรหัส"><input aria-label={localizeCopy("รหัสลูกค้า")} maxLength={30} value={form.code} onChange={(event) => set("code", event.target.value)} /></Field>{!companyOnly ? <>
            <Field label="ชื่อผู้ติดต่อหลัก (ไทย)"><input aria-label={localizeCopy("ชื่อผู้ติดต่อหลัก ภาษาไทย")} maxLength={200} value={form.contactNameTh} onChange={(event) => set("contactNameTh", event.target.value)} /></Field>
            <Field label="Primary contact (English)"><input aria-label={localizeCopy("Primary contact English")} maxLength={200} value={form.contactNameEn} onChange={(event) => set("contactNameEn", event.target.value)} /></Field>
            <Field label="担当者名 (日本語)"><input aria-label={localizeCopy("Primary contact Japanese")} maxLength={200} value={form.contactNameJa} onChange={(event) => set("contactNameJa", event.target.value)} /></Field>
          </> : null}</> : <Field label="สถานที่ / สาขา"><select aria-label={localizeCopy("สถานที่ของผู้ติดต่อ")} value={form.siteId} onChange={(event) => set("siteId", event.target.value)}><option value="">สำนักงานหลัก (Main office)</option>{directory?.sites.filter((site) => site.code.toUpperCase() !== "MAIN").map((site) => <option key={site.id} value={site.id}>{site.code} — {site.name}</option>)}</select></Field>}
          {!companyOnly ? <>
            <Field label="คำนำหน้าผู้ติดต่อ (ไทย)" hint="เลือกหรือพิมพ์เองได้ เว้นว่างได้"><input aria-label={localizeCopy("คำนำหน้าผู้ติดต่อ ภาษาไทย")} maxLength={50} list="inquiry-contact-titles-th" value={form.titleTh} onChange={(event) => set("titleTh", event.target.value)} /><datalist id="inquiry-contact-titles-th">{["นาย", "นาง", "นางสาว", "ดร."].map((title) => <option key={title} value={title} />)}</datalist></Field>
            <Field label="Contact title (English)"><input aria-label={localizeCopy("Contact title English")} maxLength={50} list="inquiry-contact-titles-en" value={form.titleEn} onChange={(event) => set("titleEn", event.target.value)} /><datalist id="inquiry-contact-titles-en">{["Mr.", "Ms.", "Mrs.", "Dr."].map((title) => <option key={title} value={title} />)}</datalist></Field>
            <Field label="敬称 (日本語)" hint="แสดงหลังชื่อภาษาญี่ปุ่น"><input aria-label={localizeCopy("Contact title Japanese")} maxLength={50} list="inquiry-contact-titles-ja" value={form.titleJa} onChange={(event) => set("titleJa", event.target.value)} /><datalist id="inquiry-contact-titles-ja">{["様", "さん", "先生"].map((title) => <option key={title} value={title} />)}</datalist></Field>
          </> : null}
          {!companyOnly ? <><Field label="อีเมลผู้ติดต่อ"><input aria-label={localizeCopy("อีเมลผู้ติดต่อ")} type="email" maxLength={256} value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
          <Field label="เบอร์โทรผู้ติดต่อ"><input aria-label={localizeCopy("เบอร์โทรผู้ติดต่อ")} type="tel" maxLength={100} value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field></> : null}
          {!companyOnly ? <><Field label="ตำแหน่ง / Position"><input aria-label={localizeCopy("ตำแหน่งผู้ติดต่อ")} maxLength={200} value={form.position} onChange={(event) => set("position", event.target.value)} /></Field><Field label="แผนก / Department"><input aria-label={localizeCopy("แผนกผู้ติดต่อ")} maxLength={200} value={form.department} onChange={(event) => set("department", event.target.value)} /></Field></> : null}
          {isCustomer ? <Field label="ที่อยู่ / สถานที่" span={2}><textarea aria-label={localizeCopy("ที่อยู่ลูกค้า")} maxLength={300} rows={2} value={form.site} onChange={(event) => set("site", event.target.value)} /></Field> : null}
        </div>
        {similarCustomers.length || similarContacts.length ? <div className="callout" style={{ display: "block", marginTop: 12 }}><strong>พบข้อมูลใกล้เคียง เลือกใช้ได้โดยไม่ต้องสร้างซ้ำ</strong>{similarCustomers.map((item) => <div key={item.id}><button className="btn ghost" type="button" onClick={() => onExistingCustomer(item)}>{item.code} — {item.name} · เลือกบริษัทนี้</button></div>)}{similarContacts.map((item) => <div key={item.id}><button className="btn ghost" type="button" onClick={() => onExistingContact(item)}>{contactNameLines(item, item.name).map((line) => line.value).join(" / ")} <LocalizedText text={"·"} /> {item.siteName}{item.email ? ` · ${item.email}` : ""} · เลือกคนนี้</button></div>)}</div> : null}
        <div className="production-document-submit"><span /><div className="row-actions"><button className="btn ghost" type="button" onClick={close}><LocalizedText text={"ยกเลิก"} /></button><button className="btn primary" type="submit" disabled={busy || !(isCustomer ? companyName : contactName)}><Icon name="check" />{busy ? "กำลังบันทึก…" : "บันทึกและเลือกใช้"}</button></div></div>
      </fieldset>
    </form>
  </Modal></div>;
}
