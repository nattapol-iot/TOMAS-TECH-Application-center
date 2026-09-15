"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiRequest, checkAdminStorage, createSalesCustomerContact, listSalesCustomerContacts, loadNasSettings, removeSalesCustomerContact, saveNasSettings, testNasConnection, updateSalesCustomerContact, type BootstrapData, type NasConnectionTestResult, type NasSettingsInput, type NasSettingsResult, type PagedResult, type ProjectSummary, type SalesCustomerContact, type SalesCustomerContactPage, type StorageCheckResult } from "../api-client";
import { canManageEngineeringRates, canViewEngineeringRates } from "../../../backend-node/src/engineering-rate-access";
import type { BusinessCardExtraction } from "../../../lib/business-card";
import { BusinessCardScanner } from "./BusinessCardScanner";
import { canonicalLocalizedName, contactNameLines, localizedNameLines, localizedNamesFromCard, type ContactTitles, type LocalizedNames } from "./customer-localized-names";
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  TablePageSize,
  Tabs,
  Toolbar,
} from "../ui";

export type AdminAnalyticsProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
  teamTestMode?: boolean;
  onOpenInquiries?: () => void;
  embedded?: boolean;
};

type EngineeringRate = {
  id: number;
  level: string;
  department: string;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  rowVersion: string;
};

type AuditRow = {
  source: "Core" | "Material";
  id: number;
  actorId: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number;
  entityNumber: string;
  quantity: number | null;
  projectId: number | null;
  reason: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  occurredAt: string;
};

type InventoryValueReport = {
  asOf: string;
  slowMovingDays: number;
  valuationMethod: string;
  summary: {
    itemCount: number;
    usableValue: number;
    quarantineValue: number;
    totalValue: number;
    slowMovingItemCount: number;
    slowMovingValue: number;
  };
  items: {
    id: number;
    itemCode: string;
    partNumber: string;
    description: string;
    brand: string;
    unit: string;
    location: string;
    usable: number;
    quarantine: number;
    averageUnitCost: number;
    usableValue: number;
    quarantineValue: number;
    lastMovementAt: string | null;
    lastOutboundAt: string | null;
    inactiveDays: number;
    isSlowMoving: boolean;
  }[];
};

type SupplierPerformanceReport = {
  from: string;
  to: string;
  suppliers: {
    supplierId: number;
    supplierCode: string;
    supplierName: string;
    purchaseOrderCount: number;
    orderedQuantity: number;
    orderedValue: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    heldOrRejectedQuantity: number;
    receivedValue: number;
    openValue: number;
    fullyReceivedPurchaseOrderCount: number;
    completedWithExpectedDateCount: number;
    onTimeCompletedPurchaseOrderCount: number;
    fillRatePercent: number | null;
    acceptedFillRatePercent: number | null;
    defectRatePercent: number | null;
    onTimeRatePercent: number | null;
    averageCompletionLeadDays: number | null;
  }[];
};

type PrCycleTimeReport = {
  from: string;
  to: string;
  projectId: number | null;
  stages: {
    stage: string;
    completedCount: number;
    averageHours: number | null;
    minimumHours: number | null;
    maximumHours: number | null;
  }[];
  lifecycle: {
    prCount: number;
    averageCreatedToSubmittedHours: number | null;
    averageSubmittedToFinalApprovalHours: number | null;
    averageApprovalToFirstPurchaseOrderHours: number | null;
    averageCreatedToFirstPurchaseOrderHours: number | null;
  };
  statusCounts: Record<string, number>;
  durationBasis: string;
};

type ProjectCostReport = {
  project: { id: number; number: string; name: string; status: string; estimateNumber: string };
  budget: {
    approvedMaterial: number;
    approvedEngineering: number;
    approvedOutsource: number;
    approvedTransportation: number;
    approvedAccommodation: number;
    approvedOther: number;
    contingency: number;
    approvedEstimateTotal: number;
  };
  procurement: {
    poCommitted: number;
    receivedAtPoPrice: number;
    openPoCommitment: number;
    openPr: number;
    reserved: number;
  };
  actual: { materialConsumed: number };
  forecastExposure: number;
  remainingMaterialBudget: number;
  remainingMaterialBudgetAfterActual: number;
  remainingMaterialBudgetAfterForecast: number;
  accountingScope: string;
  forecastScope: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formatMoney = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(value);
const formatPercent = (value: number | null) => value === null ? "—" : `${formatNumber(value)}%`;
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : "—";
const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(new Date(value))
  : "—";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const today = () => businessDate(new Date());
const yearAgo = () => businessDate(new Date(Date.now() - 365 * 86_400_000));
const query = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
};

function LoadError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong><LocalizedText text={"Could not load"} /></strong>{message}</span>
      {retry ? <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button> : null}
    </div>
  );
}

function PermissionNotice({ permission }: { permission: string }) {
  return (
    <Panel>
      <EmptyState icon="lock" title="ไม่มีสิทธิ์เปิดหน้านี้" message={`บัญชีนี้ต้องมีสิทธิ์ ${permission} จึงจะอ่านข้อมูลจริงได้`} />
    </Panel>
  );
}

export function ProductionCustomers({ bootstrap, notify, refreshBootstrap, onOpenInquiries, embedded = false }: AdminAnalyticsProps) {
  const uiText = useUiText();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<BootstrapData["customers"][number] | null>(null);
  const [contactsCustomer, setContactsCustomer] = useState<BootstrapData["customers"][number] | null>(null);
  const customers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return bootstrap.customers;
    return bootstrap.customers.filter((customer) => `${customer.code} ${customer.name} ${customer.nameTh} ${customer.nameEn} ${customer.nameJa} ${customer.industry} ${customer.contact} ${customer.contactNameTh} ${customer.contactNameEn} ${customer.contactNameJa} ${customer.contactTitleTh ?? ""} ${customer.contactTitleEn ?? ""} ${customer.contactTitleJa ?? ""} ${customer.position ?? ""} ${customer.department ?? ""} ${customer.email} ${customer.phone} ${customer.site}`.toLocaleLowerCase().includes(needle));
  }, [bootstrap.customers, search]);
  const pageCount = Math.max(1, Math.ceil(customers.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const from = customers.length ? (resolvedPage - 1) * pageSize + 1 : 0;
  const to = Math.min(resolvedPage * pageSize, customers.length);
  const visibleCustomers = customers.slice(from ? from - 1 : 0, to);
  const canRead = bootstrap.permissions.includes("master.read");
  const canWrite = bootstrap.permissions.includes("master.write");

  if (!canRead) return <PermissionNotice permission="master.read" />;
  return (
    <>
      {!embedded ? <PageHeader
        eyebrow="MASTER DATA"
        title={uiText("Customers")}
        subtitle="Customer master shared by inquiry, estimate and reporting."
        actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add customer"} /></button> : undefined}
      /> : null}
      <Toolbar>
        {embedded && canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add customer"} /></button> : null}
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search customer code, name or industry…" />
      </Toolbar>
      <Panel title={`${customers.length} customers`} flush>
        {customers.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table>
          <thead><tr><th><LocalizedText text={"Code"} /></th><th><LocalizedText text={"Customer"} /></th><th><LocalizedText text={"Industry"} /></th><th><LocalizedText text={"Main contact"} /></th><th><LocalizedText text={"Email"} /></th><th><LocalizedText text={"Phone"} /></th><th><LocalizedText text={"Site"} /></th><th className="num"><LocalizedText text={"Inquiries"} /></th><th className="num"><LocalizedText text={"Open estimates"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead>
          <tbody>{visibleCustomers.map((customer) => <tr key={customer.id}>
            <td><strong className="mono">{customer.code}</strong></td>
            <td><LocalizedNameStack names={customer} fallback={customer.name} /></td>
            <td>{customer.industry || "—"}</td>
            <td>{customer.contact ? <LocalizedNameStack names={{ nameTh: customer.contactNameTh, nameEn: customer.contactNameEn, nameJa: customer.contactNameJa }} titles={{ titleTh: customer.contactTitleTh, titleEn: customer.contactTitleEn, titleJa: customer.contactTitleJa }} fallback={customer.contact} /> : "—"}{customer.position || customer.department ? <div className="muted">{[customer.position, customer.department].filter(Boolean).join(" · ")}</div> : null}</td>
            <td className="muted">{customer.email || "—"}</td>
            <td className="mono">{customer.phone || "—"}</td>
            <td>{customer.site || "—"}</td>
            <td className="num">{customer.inquiries}</td>
            <td className="num">{customer.openEstimates}</td>
            <td><div className="row-actions">
              {canWrite ? <button className="icon-btn" type="button" aria-label={`Edit ${customer.name}`} onClick={() => setEditingCustomer(customer)}><Icon name="edit" /></button> : null}
              <button className="icon-btn" type="button" aria-label={`People at ${customer.name}`} onClick={() => setContactsCustomer(customer)}><Icon name="users" /></button>
              {onOpenInquiries ? <button className="icon-btn" type="button" aria-label={`Open inquiries for ${customer.name}`} onClick={onOpenInquiries}><Icon name="chevronRight" /></button> : null}
            </div></td>
          </tr>)}</tbody>
        </table><Pagination page={resolvedPage} pageCount={pageCount} from={from} to={to} total={customers.length} onPage={setPage} /></div> : <EmptyState icon="users" title="No customer found" message="ปรับคำค้นหา หรือเพิ่มลูกค้ารายแรกเมื่อมีสิทธิ์ master.write" />}
      </Panel>
      {createOpen ? <CustomerModal customer={null} onClose={() => setCreateOpen(false)} onSaved={async (code) => {
        setCreateOpen(false);
        await refreshBootstrap?.();
        notify(`${code} created`);
      }} /> : null}
      {editingCustomer ? <CustomerModal customer={editingCustomer} onClose={() => setEditingCustomer(null)} onSaved={async (code) => {
        setEditingCustomer(null);
        await refreshBootstrap?.();
        notify(`${code} updated`);
      }} /> : null}
      {contactsCustomer ? <CustomerContactsModal
        customer={contactsCustomer}
        canWrite={canWrite}
        notify={notify}
        onClose={() => setContactsCustomer(null)}
        onChanged={async () => { await refreshBootstrap?.(); }}
      /> : null}
    </>
  );
}

type ContactFormState = {
  nameTh: string; nameEn: string; nameJa: string;
  titleTh: string; titleEn: string; titleJa: string;
  department: string; position: string; email: string; phone: string;
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  nameTh: "", nameEn: "", nameJa: "",
  titleTh: "", titleEn: "", titleJa: "",
  department: "", position: "", email: "", phone: "",
};

// A company keeps as many people as it needs. They belong to a site, so the form offers the
// site list and falls back to the MAIN site the API creates for a company that has none.
function CustomerContactsModal({ customer, canWrite, notify, onClose, onChanged }: {
  customer: BootstrapData["customers"][number];
  canWrite: boolean;
  notify: (message: string) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState<SalesCustomerContactPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SalesCustomerContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);
  const [siteId, setSiteId] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await listSalesCustomerContacts(customer.id));
      setError("");
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [customer.id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const closeForm = () => {
    setCreating(false); setEditing(null); setMakePrimary(false);
    setForm(EMPTY_CONTACT_FORM); setSiteId("");
  };
  const openCreate = () => {
    setEditing(null); setCreating(true); setMakePrimary(false);
    setForm(EMPTY_CONTACT_FORM);
    setSiteId(page?.sites[0] ? String(page.sites[0].id) : "");
  };
  const openEdit = (contact: SalesCustomerContact) => {
    setCreating(false); setEditing(contact); setMakePrimary(contact.isPrimary);
    setForm({
      nameTh: contact.nameTh, nameEn: contact.nameEn, nameJa: contact.nameJa,
      titleTh: contact.titleTh, titleEn: contact.titleEn, titleJa: contact.titleJa,
      department: contact.department, position: contact.position,
      email: contact.email, phone: contact.phone,
    });
    setSiteId(String(contact.siteId));
  };

  const set = (key: keyof ContactFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  // Only the person's own fields come off the card here. The company is already chosen,
  // so companyName and address on the extraction are deliberately ignored.
  const applyBusinessCard = (result: BusinessCardExtraction) => {
    const contactNames = localizedNamesFromCard(result.contactNames, result.contactName);
    const fields: { key: keyof ContactFormState; value: string; label: string }[] = [
      { key: "nameTh", value: contactNames.nameTh, label: "ชื่อผู้ติดต่อ (ไทย)" },
      { key: "nameEn", value: contactNames.nameEn, label: "Contact name (English)" },
      { key: "nameJa", value: contactNames.nameJa, label: "担当者名 (日本語)" },
      { key: "department", value: result.department, label: "แผนก" },
      { key: "position", value: result.position, label: "ตำแหน่ง" },
      { key: "email", value: result.email, label: "อีเมล" },
      { key: "phone", value: result.phone, label: "โทรศัพท์" },
    ];
    const fillable = fields.filter((field) => field.value && !form[field.key].trim());
    if (fillable.length) setForm((current) => {
      const next = { ...current };
      for (const field of fillable) if (!next[field.key].trim()) next[field.key] = field.value;
      return next;
    });
    return fillable.map((field) => field.label);
  };
  const resolvedName = canonicalLocalizedName({ nameTh: form.nameTh, nameEn: form.nameEn, nameJa: form.nameJa }, editing?.name);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedName) { setError("กรุณาระบุชื่อผู้ติดต่ออย่างน้อยหนึ่งภาษา"); return; }
    setBusy(true);
    setError("");
    try {
      const input = {
        name: resolvedName,
        nameTh: form.nameTh.trim(), nameEn: form.nameEn.trim(), nameJa: form.nameJa.trim(),
        titleTh: form.titleTh.trim(), titleEn: form.titleEn.trim(), titleJa: form.titleJa.trim(),
        department: form.department.trim(), position: form.position.trim(),
        email: form.email.trim(), phone: form.phone.trim(),
      };
      if (editing) {
        await updateSalesCustomerContact(customer.id, editing.id, { ...input, rowVersion: editing.rowVersion, isPrimary: makePrimary });
        notify(`${resolvedName} updated`);
      } else {
        await createSalesCustomerContact(customer.id, { ...input, ...(siteId ? { siteId: Number(siteId) } : {}) });
        notify(`${resolvedName} added`);
      }
      closeForm();
      await load();
      await onChanged();
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (contact: SalesCustomerContact) => {
    if (!window.confirm(`ต้องการนำ ${contact.name} ออกจากรายชื่อผู้ติดต่อของ ${customer.name} หรือไม่`)) return;
    setBusy(true);
    setError("");
    try {
      await removeSalesCustomerContact(customer.id, contact.id, contact.rowVersion);
      notify(`${contact.name} removed`);
      closeForm();
      await load();
      await onChanged();
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const contacts = page?.contacts ?? [];
  const multiSite = (page?.sites.length ?? 0) > 1;
  return (
    <Modal title={`People at ${customer.name}`} subtitle="ผู้ติดต่อทุกคนของบริษัทนี้ บันทึกแยกรายบุคคลพร้อม Audit trail" size="xl" onClose={onClose}>
      {error ? <LoadError message={error} /> : null}
      {canWrite && !creating && !editing ? <Toolbar><button className="btn primary" type="button" onClick={openCreate}><Icon name="plus" /><LocalizedText text={"Add person"} /></button></Toolbar> : null}
      {creating || editing ? <form onSubmit={(event) => { void submit(event); }}>
        {creating ? <BusinessCardScanner disabled={busy} onApply={applyBusinessCard} /> : null}
        <div className="form-grid two">
          <Field label="ชื่อผู้ติดต่อ (ไทย)" hint="กรอกอย่างน้อย 1 ภาษา"><input name="nameTh" maxLength={200} value={form.nameTh} onChange={(event) => set("nameTh", event.target.value)} /></Field>
          <Field label="Contact name (English)"><input name="nameEn" maxLength={200} value={form.nameEn} onChange={(event) => set("nameEn", event.target.value)} /></Field>
          <Field label="担当者名 (日本語)"><input name="nameJa" maxLength={200} value={form.nameJa} onChange={(event) => set("nameJa", event.target.value)} /></Field>
          <Field label="คำนำหน้า (ไทย)"><input name="titleTh" maxLength={50} value={form.titleTh} onChange={(event) => set("titleTh", event.target.value)} /></Field>
          <Field label="Title (English)"><input name="titleEn" maxLength={50} value={form.titleEn} onChange={(event) => set("titleEn", event.target.value)} /></Field>
          <Field label="敬称 (日本語)"><input name="titleJa" maxLength={50} value={form.titleJa} onChange={(event) => set("titleJa", event.target.value)} /></Field>
          <Field label="Department"><input name="department" maxLength={200} value={form.department} onChange={(event) => set("department", event.target.value)} /></Field>
          <Field label="Position"><input name="position" maxLength={200} value={form.position} onChange={(event) => set("position", event.target.value)} /></Field>
          <Field label="Email"><input name="email" type="email" maxLength={256} value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
          <Field label="Phone"><input name="phone" maxLength={100} value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
          {!editing && multiSite ? <Field label="Site"><select name="siteId" value={siteId} onChange={(event) => setSiteId(event.target.value)}>{(page?.sites ?? []).map((site) => <option key={site.id} value={String(site.id)}>{site.name}</option>)}</select></Field> : null}
          {editing ? <Field label="Main contact" hint="ผู้ติดต่อหลักของบริษัทมีได้คนเดียวต่อสถานที่"><label className="check"><input name="isPrimary" type="checkbox" checked={makePrimary} disabled={editing.isPrimary} onChange={(event) => setMakePrimary(event.target.checked)} /><span><LocalizedText text={"Set as main contact"} /></span></label></Field> : null}
        </div>
        <div className="modal-actions">
          <button className="btn default" type="button" disabled={busy} onClick={closeForm}><LocalizedText text={"Cancel"} /></button>
          <button className="btn primary" type="submit" disabled={busy || !resolvedName}><LocalizedText text={busy ? "Saving…" : "Save"} /></button>
        </div>
      </form> : null}
      {loading ? <EmptyState icon="users" title="Loading…" message="กำลังโหลดรายชื่อผู้ติดต่อ" /> : contacts.length ? <div className="table-wrap"><table>
        <thead><tr><th><LocalizedText text={"Contact"} /></th><th><LocalizedText text={"Role"} /></th><th><LocalizedText text={"Email"} /></th><th><LocalizedText text={"Phone"} /></th>{multiSite ? <th><LocalizedText text={"Site"} /></th> : null}{canWrite ? <th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th> : null}</tr></thead>
        <tbody>{contacts.map((contact) => <tr key={contact.id}>
          <td><LocalizedNameStack names={contact} titles={contact} fallback={contact.name} />{contact.isPrimary ? <div><Badge tone="blue">Main contact</Badge></div> : null}</td>
          <td>{[contact.position, contact.department].filter(Boolean).join(" · ") || "—"}</td>
          <td className="muted">{contact.email || "—"}</td>
          <td className="mono">{contact.phone || "—"}</td>
          {multiSite ? <td>{contact.siteName}</td> : null}
          {canWrite ? <td><div className="row-actions">
            <button className="icon-btn" type="button" aria-label={`Edit ${contact.name}`} disabled={busy} onClick={() => openEdit(contact)}><Icon name="edit" /></button>
            <button className="icon-btn" type="button" aria-label={`Remove ${contact.name}`} disabled={busy || contact.isPrimary} onClick={() => { void remove(contact); }}><Icon name="trash" /></button>
          </div></td> : null}
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="users" title="No contact yet" message="เพิ่มผู้ติดต่อคนแรกของบริษัทนี้เมื่อมีสิทธิ์ master.write" />}
    </Modal>
  );
}
function LocalizedNameStack({ names, fallback, titles }: { names: LocalizedNames; fallback: string; titles?: ContactTitles }) {
  const lines = titles ? contactNameLines({ ...names, ...titles }, fallback) : localizedNameLines(names);
  if (!lines.length) return <strong>{fallback}</strong>;
  return <span className="localized-name-stack">{lines.map((line) => <span key={line.language}><small>{line.language}</small><strong>{line.value}</strong></span>)}</span>;
}

function CustomerModal({ customer, onClose, onSaved }: {
  customer: BootstrapData["customers"][number] | null;
  onClose: () => void;
  onSaved: (code: string) => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    code: customer?.code ?? "",
    nameTh: customer?.nameTh ?? "",
    nameEn: customer?.nameEn ?? "",
    nameJa: customer?.nameJa ?? "",
    contactNameTh: customer?.contactNameTh ?? "",
    contactNameEn: customer?.contactNameEn ?? "",
    contactNameJa: customer?.contactNameJa ?? "",
    contactTitleTh: customer?.contactTitleTh ?? "",
    contactTitleEn: customer?.contactTitleEn ?? "",
    contactTitleJa: customer?.contactTitleJa ?? "",
    department: customer?.department ?? "",
    position: customer?.position ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    industry: customer?.industry ?? "",
    site: customer?.site ?? "",
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const companyName = canonicalLocalizedName({ nameTh: form.nameTh, nameEn: form.nameEn, nameJa: form.nameJa }, customer?.name);
  const contactName = canonicalLocalizedName({ nameTh: form.contactNameTh, nameEn: form.contactNameEn, nameJa: form.contactNameJa }, customer?.contact);
  const applyBusinessCard = (result: BusinessCardExtraction) => {
    const companyNames = localizedNamesFromCard(result.companyNames, result.companyName);
    const contactNames = localizedNamesFromCard(result.contactNames, result.contactName);
    const fields: { key: keyof typeof form; value: string; label: string }[] = [
      { key: "nameTh", value: companyNames.nameTh, label: "ชื่อบริษัท (ไทย)" },
      { key: "nameEn", value: companyNames.nameEn, label: "Company name (English)" },
      { key: "nameJa", value: companyNames.nameJa, label: "会社名 (日本語)" },
      { key: "contactNameTh", value: contactNames.nameTh, label: "ชื่อผู้ติดต่อ (ไทย)" },
      { key: "contactNameEn", value: contactNames.nameEn, label: "Contact name (English)" },
      { key: "contactNameJa", value: contactNames.nameJa, label: "担当者名 (日本語)" },
      { key: "department", value: result.department, label: "แผนก" },
      { key: "position", value: result.position, label: "ตำแหน่ง" },
      { key: "email", value: result.email, label: "อีเมล" },
      { key: "phone", value: result.phone, label: "โทรศัพท์" },
      { key: "site", value: result.address, label: "ที่อยู่" },
    ];
    const fillable = fields.filter((field) => field.value && !form[field.key].trim());
    if (fillable.length) setForm((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => {
      const suggestion = fillable.find((field) => field.key === key)?.value;
      return [key, suggestion && !String(value).trim() ? suggestion : value];
    })) as typeof current);
    return fillable.map((field) => field.label);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyName) { setError("กรุณาระบุชื่อบริษัทอย่างน้อยหนึ่งภาษา"); return; }
    if (!contactName && (form.department.trim() || form.position.trim() || form.contactTitleTh.trim() || form.contactTitleEn.trim() || form.contactTitleJa.trim())) {
      setError("กรุณาระบุชื่อผู้ติดต่อ เพื่อบันทึกคำนำหน้า ตำแหน่ง และแผนกของบุคคลนี้");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const input = {
        ...(customer ? { rowVersion: customer.rowVersion } : {}),
        code: form.code.trim(),
        name: companyName,
        nameTh: form.nameTh.trim(), nameEn: form.nameEn.trim(), nameJa: form.nameJa.trim(),
        contact: contactName || undefined,
        contactNameTh: form.contactNameTh.trim(), contactNameEn: form.contactNameEn.trim(), contactNameJa: form.contactNameJa.trim(),
        contactTitleTh: form.contactTitleTh.trim(), contactTitleEn: form.contactTitleEn.trim(), contactTitleJa: form.contactTitleJa.trim(),
        department: form.department.trim(),
        position: form.position.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        industry: form.industry.trim() || undefined,
        site: form.site.trim() || undefined,
      };
      const saved = await apiRequest<{ code: string }>(customer ? `/api/v1/master/customers/${customer.id}` : "/api/v1/master/customers", {
        method: customer ? "PUT" : "POST",
        body: JSON.stringify(input),
      });
      await onSaved(saved.code);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={customer ? "Edit customer" : "New customer"} subtitle={customer ? "แก้ไข Customer master พร้อมบันทึก Audit trail" : "บันทึกลง customer master ใน SQL Server"} size="lg" onClose={onClose}>
      <form onSubmit={(event) => { void submit(event); }}>
        {error ? <LoadError message={error} /> : null}
        {!customer ? <BusinessCardScanner disabled={busy} onApply={applyBusinessCard} /> : null}
        <div className="form-grid two">
          <Field label="Customer code"><input name="code" required maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" value={form.code} onChange={(event) => set("code", event.target.value)} /></Field>
          <Field label="ชื่อบริษัท (ไทย)" hint={customer && !form.nameTh && !form.nameEn && !form.nameJa ? `ชื่อเดิม: ${customer.name}` : "กรอกอย่างน้อย 1 ภาษา"}><input name="nameTh" maxLength={300} value={form.nameTh} onChange={(event) => set("nameTh", event.target.value)} /></Field>
          <Field label="Company name (English)"><input name="nameEn" maxLength={300} value={form.nameEn} onChange={(event) => set("nameEn", event.target.value)} /></Field>
          <Field label="会社名 (日本語)"><input name="nameJa" maxLength={300} value={form.nameJa} onChange={(event) => set("nameJa", event.target.value)} /></Field>
          <Field label="ชื่อผู้ติดต่อ (ไทย)"><input name="contactNameTh" maxLength={200} value={form.contactNameTh} onChange={(event) => set("contactNameTh", event.target.value)} /></Field>
          <Field label="Contact name (English)" hint={customer?.contact && !form.contactNameTh && !form.contactNameEn && !form.contactNameJa ? `ชื่อเดิม: ${customer.contact}` : undefined}><input name="contactNameEn" maxLength={200} value={form.contactNameEn} onChange={(event) => set("contactNameEn", event.target.value)} /></Field>
          <Field label="担当者名 (日本語)"><input name="contactNameJa" maxLength={200} value={form.contactNameJa} onChange={(event) => set("contactNameJa", event.target.value)} /></Field>
          <Field label="คำนำหน้าผู้ติดต่อ (ไทย)" hint="เลือกหรือพิมพ์เองได้ เว้นว่างได้"><input name="contactTitleTh" aria-label={localizeCopy("คำนำหน้าผู้ติดต่อ ภาษาไทย")} maxLength={50} list="master-contact-titles-th" value={form.contactTitleTh} onChange={(event) => set("contactTitleTh", event.target.value)} /><datalist id="master-contact-titles-th">{["นาย", "นาง", "นางสาว", "ดร."].map((title) => <option key={title} value={title} />)}</datalist></Field>
          <Field label="Contact title (English)"><input name="contactTitleEn" aria-label={localizeCopy("Contact title English")} maxLength={50} list="master-contact-titles-en" value={form.contactTitleEn} onChange={(event) => set("contactTitleEn", event.target.value)} /><datalist id="master-contact-titles-en">{["Mr.", "Ms.", "Mrs.", "Dr."].map((title) => <option key={title} value={title} />)}</datalist></Field>
          <Field label="敬称 (日本語)" hint="แสดงหลังชื่อภาษาญี่ปุ่น"><input name="contactTitleJa" aria-label={localizeCopy("Contact title Japanese")} maxLength={50} list="master-contact-titles-ja" value={form.contactTitleJa} onChange={(event) => set("contactTitleJa", event.target.value)} /><datalist id="master-contact-titles-ja">{["様", "さん", "先生"].map((title) => <option key={title} value={title} />)}</datalist></Field>
          <Field label="ตำแหน่ง / Position"><input name="position" maxLength={200} value={form.position} onChange={(event) => set("position", event.target.value)} /></Field>
          <Field label="แผนก / Department"><input name="department" maxLength={200} value={form.department} onChange={(event) => set("department", event.target.value)} /></Field>
          <Field label="Email"><input name="email" type="email" maxLength={256} value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
          <Field label="Phone"><input name="phone" maxLength={100} value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
          <Field label="Industry"><input name="industry" maxLength={200} value={form.industry} onChange={(event) => set("industry", event.target.value)} /></Field>
          <Field label="Site" span={2}><input name="site" maxLength={300} value={form.site} onChange={(event) => set("site", event.target.value)} /></Field>
        </div>
        <div className="production-document-submit"><span /><div className="row-actions"><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="submit" disabled={busy || !companyName}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : customer ? "Save changes" : "Create customer"}</button></div></div>
      </form>
    </Modal>
  );
}

type ReportTab = "inventory" | "suppliers" | "pr-cycle" | "project-cost";

export function ProductionReports({ bootstrap }: AdminAnalyticsProps) {
  const uiText = useUiText();
  const [tab, setTab] = useState<ReportTab>("inventory");
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState(0);
  const [inventory, setInventory] = useState<InventoryValueReport | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierPerformanceReport | null>(null);
  const [prCycle, setPrCycle] = useState<PrCycleTimeReport | null>(null);
  const [projectCost, setProjectCost] = useState<ProjectCostReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reportRequest = useRef(0);
  const canReport = bootstrap.permissions.includes("report.read");
  const canInventory = bootstrap.permissions.includes("inventory.read");
  const canProcurement = bootstrap.permissions.includes("procurement.read");
  const canProject = bootstrap.permissions.includes("project.read");
  const tabs = useMemo<{ id: ReportTab; label: string }[]>(() => [
    ...(canInventory ? [{ id: "inventory" as const, label: "Inventory Value" }] : []),
    ...(canProcurement ? [{ id: "suppliers" as const, label: "Supplier Performance" }, { id: "pr-cycle" as const, label: "PR Cycle Time" }] : []),
    ...(canProject ? [{ id: "project-cost" as const, label: "Project Cost" }] : []),
  ], [canInventory, canProcurement, canProject]);
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? tab;

  useEffect(() => {
    if (!canProject) return;
    void apiRequest<PagedResult<ProjectSummary>>("/api/v1/projects/?page=1&pageSize=100")
      .then((result) => {
        setProjects(result.items);
        setProjectId((current) => current || result.items[0]?.id || 0);
      })
      .catch(() => setProjects([]));
  }, [canProject]);

  const load = useCallback(async () => {
    if (!canReport) return;
    const requestId = ++reportRequest.current;
    setLoading(true);
    setError("");
    if (activeTab === "inventory") setInventory(null);
    if (activeTab === "suppliers") setSuppliers(null);
    if (activeTab === "pr-cycle") setPrCycle(null);
    if (activeTab === "project-cost") setProjectCost(null);
    try {
      if (activeTab === "inventory") {
        const value = await apiRequest<InventoryValueReport>(`/api/v1/reports/inventory-value${query({ asOf: to, slowMovingDays: 90 })}`);
        if (reportRequest.current === requestId) setInventory(value);
      }
      if (activeTab === "suppliers") {
        const value = await apiRequest<SupplierPerformanceReport>(`/api/v1/reports/supplier-performance${query({ from, to })}`);
        if (reportRequest.current === requestId) setSuppliers(value);
      }
      if (activeTab === "pr-cycle") {
        const value = await apiRequest<PrCycleTimeReport>(`/api/v1/reports/pr-cycle-time${query({ from, to })}`);
        if (reportRequest.current === requestId) setPrCycle(value);
      }
      if (activeTab === "project-cost" && projectId) {
        const value = await apiRequest<ProjectCostReport>(`/api/v1/reports/project-cost${query({ projectId })}`);
        if (reportRequest.current === requestId) setProjectCost(value);
      }
    } catch (requestError) {
      if (reportRequest.current === requestId) setError(toError(requestError));
    } finally {
      if (reportRequest.current === requestId) setLoading(false);
    }
  }, [activeTab, canReport, from, projectId, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!canReport) return <PermissionNotice permission="report.read" />;
  if (!tabs.length) return <PermissionNotice permission="inventory.read, procurement.read หรือ project.read" />;
  return (
    <>
      <PageHeader eyebrow="LIVE ANALYTICS" title={uiText("Summary Reports")} subtitle="รายงานคำนวณจาก SQL ledger และเอกสารจริงตามสิทธิ์ของผู้ใช้" meta={<Badge tone="green"><LocalizedText text={"Production API"} /></Badge>} />
      <Tabs<ReportTab> tabs={tabs} active={activeTab} onChange={setTab} />
      <Toolbar>
        {activeTab !== "project-cost" ? <>
          {activeTab !== "inventory" ? <label className="field"><span><LocalizedText text={"From"} /></span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label> : null}
          <label className="field"><span>{activeTab === "inventory" ? "As of" : "To"}</span><input type="date" value={to} min={activeTab === "inventory" ? undefined : from} max={today()} onChange={(event) => setTo(event.target.value)} /></label>
        </> : <label className="select-field"><span className="sr-only"><LocalizedText text={"Project"} /></span><select value={projectId} onChange={(event) => setProjectId(Number(event.target.value))} aria-label={uiText("Project")}><option value={0}><LocalizedText text={"Select project"} /></option>{projects.map((project) => <option key={project.id} value={project.id}>{project.number} <LocalizedText text={"·"} /> {project.name}</option>)}</select><Icon name="chevronDown" /></label>}
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading || (activeTab === "project-cost" && !projectId)}><Icon name="refresh" />{loading ? <LocalizedText text={"Loading…"} /> : <LocalizedText text={"Refresh"} />}</button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      {activeTab === "inventory" ? <InventoryReportView report={inventory} loading={loading} /> : null}
      {activeTab === "suppliers" ? <SupplierReportView report={suppliers} loading={loading} /> : null}
      {activeTab === "pr-cycle" ? <PrCycleReportView report={prCycle} loading={loading} /> : null}
      {activeTab === "project-cost" ? <ProjectCostReportView report={projectCost} loading={loading} projectSelected={Boolean(projectId)} /> : null}
    </>
  );
}

function InventoryReportView({ report, loading }: { report: InventoryValueReport | null; loading: boolean }) {
  const uiText = useUiText();
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading live report…"} /></div> : <EmptyState icon="chart" title={uiText("No report loaded")} message="เลือกวันที่แล้วกด Refresh" />}</Panel>;
  return <>
    <div className="kpi-grid four">
      <KpiCard label="Inventory value" value={formatMoney(report.summary.totalValue)} note={`As of ${formatDate(report.asOf)}`} tone="blue" icon="database" />
      <KpiCard label="Usable" value={formatMoney(report.summary.usableValue)} note={`${report.summary.itemCount} items`} tone="green" icon="package" />
      <KpiCard label="Quarantine" value={formatMoney(report.summary.quarantineValue)} note="Held inventory value" tone="amber" icon="alertTriangle" />
      <KpiCard label="Slow moving" value={formatMoney(report.summary.slowMovingValue)} note={`${report.summary.slowMovingItemCount} items · ${report.slowMovingDays} days`} tone="violet" icon="clock" />
    </div>
    <Panel title="Inventory valuation" subtitle={report.valuationMethod} flush>{report.items.length ? <div className="table-wrap"><table>
      <thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Location"} /></th><th><LocalizedText text={"Usable"} /></th><th><LocalizedText text={"Quarantine"} /></th><th><LocalizedText text={"Avg. cost"} /></th><th><LocalizedText text={"Total value"} /></th><th><LocalizedText text={"Last movement"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
      <tbody>{report.items.map((item) => <tr key={item.id}><td><strong className="mono">{item.itemCode}</strong><div className="muted">{item.partNumber}</div></td><td><strong>{item.description}</strong><div className="muted">{item.brand}</div></td><td>{item.location || "—"}</td><td>{formatNumber(item.usable)} {item.unit}</td><td>{formatNumber(item.quarantine)} {item.unit}</td><td>{formatMoney(item.averageUnitCost)}</td><td><strong>{formatMoney(item.usableValue + item.quarantineValue)}</strong></td><td>{formatDateTime(item.lastMovementAt)}</td><td><Badge tone={item.isSlowMoving ? "amber" : "green"}>{item.isSlowMoving ? `${item.inactiveDays} days` : "Moving"}</Badge></td></tr>)}</tbody>
    </table></div> : <EmptyState icon="package" title="No inventory value" message="ยังไม่มี stock transaction ถึงวันที่รายงาน" />}</Panel>
  </>;
}

function SupplierReportView({ report, loading }: { report: SupplierPerformanceReport | null; loading: boolean }) {
  const uiText = useUiText();
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading live report…"} /></div> : <EmptyState icon="truck" title={uiText("No report loaded")} message="เลือกช่วงเวลาแล้วกด Refresh" />}</Panel>;
  return <Panel title="Supplier performance" subtitle={`${formatDate(report.from)} – ${formatDate(report.to)}`} flush>{report.suppliers.length ? <div className="table-wrap"><table>
    <thead><tr><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"POs"} /></th><th><LocalizedText text={"Ordered"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Open"} /></th><th><LocalizedText text={"Fill rate"} /></th><th><LocalizedText text={"Accepted"} /></th><th><LocalizedText text={"Defect"} /></th><th><LocalizedText text={"On time"} /></th><th><LocalizedText text={"Lead days"} /></th></tr></thead>
    <tbody>{report.suppliers.map((item) => <tr key={item.supplierId}><td><strong>{item.supplierName}</strong><div className="muted mono">{item.supplierCode}</div></td><td>{item.purchaseOrderCount}</td><td>{formatMoney(item.orderedValue)}</td><td>{formatMoney(item.receivedValue)}</td><td>{formatMoney(item.openValue)}</td><td>{formatPercent(item.fillRatePercent)}</td><td>{formatPercent(item.acceptedFillRatePercent)}</td><td>{formatPercent(item.defectRatePercent)}</td><td>{formatPercent(item.onTimeRatePercent)}</td><td>{item.averageCompletionLeadDays === null ? "—" : formatNumber(item.averageCompletionLeadDays)}</td></tr>)}</tbody>
  </table></div> : <EmptyState icon="truck" title="No supplier activity" message="ไม่พบ Purchase Order ในช่วงวันที่นี้" />}</Panel>;
}

function PrCycleReportView({ report, loading }: { report: PrCycleTimeReport | null; loading: boolean }) {
  const uiText = useUiText();
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading live report…"} /></div> : <EmptyState icon="clock" title={uiText("No report loaded")} message="เลือกช่วงเวลาแล้วกด Refresh" />}</Panel>;
  const hours = (value: number | null) => value === null ? "—" : `${formatNumber(value)} h`;
  return <>
    <div className="kpi-grid four">
      <KpiCard label="PR count" value={report.lifecycle.prCount} note={`${formatDate(report.from)} – ${formatDate(report.to)}`} tone="blue" icon="file" />
      <KpiCard label="Create → Submit" value={hours(report.lifecycle.averageCreatedToSubmittedHours)} note="Average elapsed" tone="slate" icon="clock" />
      <KpiCard label="Submit → Approve" value={hours(report.lifecycle.averageSubmittedToFinalApprovalHours)} note="Average elapsed" tone="violet" icon="checkCircle" />
      <KpiCard label="Create → PO" value={hours(report.lifecycle.averageCreatedToFirstPurchaseOrderHours)} note="Average elapsed" tone="green" icon="truck" />
    </div>
    <Panel title="Approval stage duration" subtitle={report.durationBasis} flush>{report.stages.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Stage"} /></th><th><LocalizedText text={"Completed"} /></th><th><LocalizedText text={"Average"} /></th><th><LocalizedText text={"Minimum"} /></th><th><LocalizedText text={"Maximum"} /></th></tr></thead><tbody>{report.stages.map((stage) => <tr key={stage.stage}><td><strong>{stage.stage}</strong></td><td>{stage.completedCount}</td><td>{hours(stage.averageHours)}</td><td>{hours(stage.minimumHours)}</td><td>{hours(stage.maximumHours)}</td></tr>)}</tbody></table></div> : <EmptyState icon="clock" title="No completed stages" message="ยังไม่มีขั้นตอนอนุมัติที่เสร็จในช่วงวันที่นี้" />}</Panel>
    {Object.keys(report.statusCounts).length ? <Panel title="PR status"><div className="kpi-grid four">{Object.entries(report.statusCounts).map(([status, count]) => <KpiCard key={status} label={status} value={count} icon="file" />)}</div></Panel> : null}
  </>;
}

function ProjectCostReportView({ report, loading, projectSelected }: { report: ProjectCostReport | null; loading: boolean; projectSelected: boolean }) {
  const uiText = useUiText();
  if (!projectSelected) return <Panel><EmptyState icon="folder" title="Select a project" message="เลือกโครงการเพื่อคำนวณต้นทุนจาก estimate, procurement และ stock ledger" /></Panel>;
  if (!report) return <Panel>{loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading live report…"} /></div> : <EmptyState icon="chart" title={uiText("No report loaded")} message="กด Refresh เพื่อลองอีกครั้ง" />}</Panel>;
  return <>
    <PageHeader title={`${report.project.number} · ${report.project.name}`} subtitle={`Estimate ${report.project.estimateNumber}`} meta={<Badge>{report.project.status}</Badge>} />
    <div className="kpi-grid four">
      <KpiCard label="Approved estimate" value={formatMoney(report.budget.approvedEstimateTotal)} note="Total approved budget" tone="blue" icon="file" />
      <KpiCard label="Material actual" value={formatMoney(report.actual.materialConsumed)} note="Net MIR issue / return" tone="violet" icon="package" />
      <KpiCard label="Forecast exposure" value={formatMoney(report.forecastExposure)} note="Actual + commitments" tone="amber" icon="trendingUp" />
      <KpiCard label="Remaining material" value={formatMoney(report.remainingMaterialBudgetAfterForecast)} note="After forecast exposure" tone={report.remainingMaterialBudgetAfterForecast < 0 ? "red" : "green"} icon="chart" />
    </div>
    <div className="grid-2">
      <Panel title="Approved budget"><div className="settings-list">
        {Object.entries(report.budget).map(([label, value]) => <div key={label}><span className="setting-icon blue"><Icon name="file" /></span><span><strong>{label}</strong><small><LocalizedText text={"Approved estimate"} /></small></span><strong>{formatMoney(value)}</strong></div>)}
      </div></Panel>
      <Panel title="Procurement exposure"><div className="settings-list">
        {Object.entries(report.procurement).map(([label, value]) => <div key={label}><span className="setting-icon amber"><Icon name="truck" /></span><span><strong>{label}</strong><small><LocalizedText text={"Procurement ledger"} /></small></span><strong>{formatMoney(value)}</strong></div>)}
      </div></Panel>
    </div>
    <div className="callout info"><Icon name="database" /><span><strong><LocalizedText text={"Accounting scope"} /></strong>{report.accountingScope}<br />{report.forecastScope}</span></div>
  </>;
}

export function ProductionEngineeringRates({ bootstrap, notify, refreshBootstrap, embedded = false }: AdminAnalyticsProps) {
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<EngineeringRate>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canRead = bootstrap.permissions.includes("master.read") && bootstrap.user.roles.some(canViewEngineeringRates);
  const canWrite = bootstrap.permissions.includes("master.write") && bootstrap.user.roles.some(canManageEngineeringRates);
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setResult(await apiRequest<PagedResult<EngineeringRate>>(`/api/v1/admin/engineering-rates${query({ page, pageSize, search, activeOnly })}`));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [activeOnly, canRead, page, pageSize, search]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  if (!canRead) return <PermissionNotice permission="Management role" />;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    {!embedded ? <PageHeader eyebrow="COST MASTER" title={uiText("Engineering Rate")} subtitle="อัตราที่มีผลตามช่วงวันที่จาก SQL Server" actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New Rate"} /></button> : undefined} /> : null}
    <Toolbar>{embedded && canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New Rate"} /></button> : null}<SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search level, department or creator…" /><label className="checkbox-row"><input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPage(1); }} /><LocalizedText text={"Enabled records only"} /></label><button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} rate records`} subtitle="Effective-dated engineering and installation rates" flush>{result.items.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table>
      <thead><tr><th><LocalizedText text={"Level"} /></th><th><LocalizedText text={"Department"} /></th><th><LocalizedText text={"Engineering / hour"} /></th><th><LocalizedText text={"Engineering / day"} /></th><th><LocalizedText text={"Installation / hour"} /></th><th><LocalizedText text={"Installation / day"} /></th><th><LocalizedText text={"Effective"} /></th><th><LocalizedText text={"Created by"} /></th><th><LocalizedText text={"Status"} /></th></tr></thead>
      <tbody>{result.items.map((rate) => <tr key={rate.id}><td><strong>{rate.level}</strong></td><td>{rate.department}</td><td>{formatMoney(rate.engineeringHourly)}</td><td>{formatMoney(rate.engineeringDaily)}</td><td>{formatMoney(rate.installationHourly)}</td><td>{formatMoney(rate.installationDaily)}</td><td>{formatDate(rate.effectiveFrom)} – {formatDate(rate.effectiveTo)}</td><td><strong>{rate.createdByName}</strong><div className="muted">{formatDateTime(rate.createdAt)}</div></td><td><Badge tone={rate.isActive ? "green" : "slate"}>{rate.isActive ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody>
    </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="chart" title="No engineering rates" message="เพิ่มอัตราแรกเมื่อมีสิทธิ์ master.write" />}</Panel>
    {createOpen ? <CreateRateModal team={bootstrap.team} onClose={() => setCreateOpen(false)} onCreated={async (label) => { setCreateOpen(false); notify(`${label} created`); await load(); try { await refreshBootstrap?.(); } catch { setError("บันทึกอัตราแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า"); } }} /> : null}
  </>;
}

function CreateRateModal({ team, onClose, onCreated }: { team: BootstrapData["team"]; onClose: () => void; onCreated: (label: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const optional = (name: string) => text(name) || undefined;
    setBusy(true);
    setError("");
    try {
      const input = {
        level: text("level"), department: text("department"),
        engineeringHourly: Number(text("engineeringHourly")), engineeringDaily: Number(text("engineeringDaily")),
        installationHourly: Number(text("installationHourly")), installationDaily: Number(text("installationDaily")),
        effectiveFrom: text("effectiveFrom"), effectiveTo: optional("effectiveTo"),
      };
      const created = await apiRequest<{ level: string; department: string }>("/api/v1/master/engineering-rates", { method: "POST", body: JSON.stringify(input) });
      await onCreated(`${created.department} · ${created.level}`);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="New engineering rate" subtitle="ช่วงวันที่และอัตราซ้ำซ้อนจะถูกตรวจใน transaction" size="lg" onClose={onClose}><form onSubmit={(event) => { void submit(event); }}>
    {error ? <LoadError message={error} /> : null}
    <div className="form-grid two">
      <datalist id="master-rate-levels">{[...new Set(team.map((member) => member.level).filter(Boolean))].sort().map((level) => <option key={level} value={level} />)}</datalist>
      <datalist id="master-rate-departments">{[...new Set(team.map((member) => member.department).filter(Boolean))].sort().map((department) => <option key={department} value={department} />)}</datalist>
      <Field label="Level"><input name="level" required maxLength={100} list="master-rate-levels" /></Field><Field label="Department"><input name="department" required maxLength={100} list="master-rate-departments" /></Field>
      <Field label="Engineering hourly"><input name="engineeringHourly" type="number" min={0} step="0.0001" required /></Field><Field label="Engineering daily"><input name="engineeringDaily" type="number" min={0} step="0.0001" required /></Field>
      <Field label="Installation hourly"><input name="installationHourly" type="number" min={0} step="0.0001" required /></Field><Field label="Installation daily"><input name="installationDaily" type="number" min={0} step="0.0001" required /></Field>
      <Field label="Effective from"><input name="effectiveFrom" type="date" required max="9999-12-31" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field><Field label="Effective to"><input name="effectiveTo" type="date" min={effectiveFrom} max="9999-12-31" /></Field>
    </div><div className="production-document-submit"><span /><div className="row-actions"><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create rate"}</button></div></div>
  </form></Modal>;
}

export function ProductionAuditLog({ bootstrap }: AdminAnalyticsProps) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<AuditRow>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("All sources");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRead = bootstrap.permissions.includes("audit.read");
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setResult(await apiRequest<PagedResult<AuditRow>>(`/api/v1/admin/audit${query({ page, pageSize: 50, search, source: source === "All sources" ? undefined : source, entityType })}`));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [canRead, entityType, page, search, source]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  if (!canRead) return <PermissionNotice permission="audit.read" />;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <PageHeader eyebrow="IMMUTABLE LEDGER" title={uiText("Audit Log")} subtitle="รวม Core audit และ Material audit แบบ read-only จากฐานข้อมูลจริง" meta={<Badge tone="green"><LocalizedText text={"Append only"} /></Badge>} />
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search document, action, actor or reason…" /><Select label="Source" value={source} options={["All sources", "Core", "Material"]} onChange={(value) => { setSource(value); setPage(1); }} /><label className="field"><span><LocalizedText text={"Entity"} /></span><input value={entityType} maxLength={50} placeholder={localizeCopy("e.g. Estimate")} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} /></label><button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} audit events`} subtitle="This endpoint is read-only; both audit ledgers remain append-only" flush>{result.items.length ? <div className="table-wrap"><table>
      <thead><tr><th><LocalizedText text={"Occurred"} /></th><th><LocalizedText text={"Source"} /></th><th><LocalizedText text={"Entity"} /></th><th><LocalizedText text={"Action"} /></th><th><LocalizedText text={"Actor"} /></th><th><LocalizedText text={"Project / Qty"} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Change"} /></th></tr></thead>
      <tbody>{result.items.map((row) => <tr key={`${row.source}-${row.id}`}><td className="muted">{formatDateTime(row.occurredAt)}</td><td><Badge tone={row.source === "Material" ? "violet" : "blue"}>{row.source}</Badge></td><td><strong>{row.entityType}</strong><div className="muted mono">{row.entityNumber || `#${row.entityId}`}</div></td><td><Badge>{row.action}</Badge></td><td><strong>{row.actorName}</strong><div className="muted">{row.actorRole}</div></td><td>{row.projectId ? <div><LocalizedText text={"Project #"} />{row.projectId}</div> : "—"}{row.quantity !== null ? <div className="muted"><LocalizedText text={"Qty"} /> {formatNumber(row.quantity)}</div> : null}</td><td>{row.reason || "—"}</td><td>{row.beforeJson || row.afterJson ? <details><summary><LocalizedText text={"View JSON"} /></summary>{row.beforeJson ? <><strong><LocalizedText text={"Before"} /></strong><pre>{row.beforeJson}</pre></> : null}{row.afterJson ? <><strong><LocalizedText text={"After"} /></strong><pre>{row.afterJson}</pre></> : null}</details> : "—"}</td></tr>)}</tbody>
    </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="shield" title="No audit events" message="ไม่พบเหตุการณ์ตามตัวกรองนี้" />}</Panel>
  </>;
}

const EMPTY_NAS_SETTINGS: NasSettingsInput = { server: "", share: "", destinationPath: "", username: "" };

function StorageCheckPanel({ canWrite, notify }: { canWrite: boolean; notify: (message: string) => void }) {
  const [result, setResult] = useState<StorageCheckResult | null>(null);
  const [settings, setSettings] = useState<NasSettingsResult | null>(null);
  const [form, setForm] = useState<NasSettingsInput>(EMPTY_NAS_SETTINGS);
  const [connection, setConnection] = useState<NasConnectionTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const uncPreview = form.server && form.share
    ? `\\\\${form.server}\\${form.share}${form.destinationPath ? `\\${form.destinationPath.replaceAll("/", "\\")}` : ""}`
    : "";

  useEffect(() => {
    void loadNasSettings().then((value) => {
      setSettings(value);
      if (value.draft) setForm({ server: value.draft.server, share: value.draft.share, destinationPath: value.draft.destinationPath, username: value.draft.username });
    }).catch((error) => setErr(String(error instanceof Error ? error.message : error)));
  }, []);

  const run = async () => {
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await checkAdminStorage()); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };

  const set = (key: keyof NasSettingsInput, value: string) => { setForm((current) => ({ ...current, [key]: value })); setConnection(null); };
  const test = async () => {
    setBusy(true); setErr(""); setConnection(null);
    try { setConnection(await testNasConnection(form)); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setSaving(true); setErr("");
    try {
      const draft = await saveNasSettings(form);
      setSettings((current) => ({ active: current?.active ?? { mode: "Local", rootPath: "" }, draft }));
      notify("บันทึกการตั้งค่า NAS แล้ว");
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  return (
    <>
    <Panel title="NAS connection & destination" subtitle="กำหนดปลายทางไว้ที่จุดเดียว แล้วทดสอบ Server ก่อนนำไปใช้กับ Document Storage">
      <div className="form-grid two">
        <Field label="NAS Server / IP"><input value={form.server} placeholder="100.64.0.53" onChange={(event) => set("server", event.target.value)} /></Field>
        <Field label="Share name"><input value={form.share} placeholder="IoT Department" onChange={(event) => set("share", event.target.value)} /></Field>
        <Field label="Destination path" span={2} hint="โฟลเดอร์ใต้ Share เช่น IoT Team Center/Projects"><input value={form.destinationPath} placeholder="IoT Team Center" onChange={(event) => set("destinationPath", event.target.value)} /></Field>
        <Field label="NAS username"><input value={form.username} autoComplete="username" onChange={(event) => set("username", event.target.value)} /></Field>
        <Field label="Password"><input value="จัดการที่ Server Secret" disabled aria-label="NAS password is managed on the server" /></Field>
      </div>
      {uncPreview ? <div className="info-strip" style={{ marginTop: 14 }}><Icon name="folder" /><span><strong>ปลายทางที่ต้องการใช้</strong><br /><small style={{ wordBreak: "break-all" }}>{uncPreview}</small></span></div> : null}
      <div className="row-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn ghost" type="button" disabled={busy || !form.server || !form.share || !form.destinationPath || !form.username} onClick={() => { void test(); }}><Icon name="refresh" />{busy ? "Testing…" : "Test server"}</button>
        <button className="btn primary" type="button" disabled={!canWrite || saving || !form.server || !form.share || !form.destinationPath || !form.username} onClick={() => { void save(); }}><Icon name="check" />{saving ? "Saving…" : "Save settings"}</button>
      </div>
      {connection ? <div className={`callout ${connection.ok ? "info" : "error"}`} style={{ marginTop: 12 }}><Icon name={connection.ok ? "checkCircle" : "alertTriangle"} /><span>{connection.ok ? <>เชื่อมต่อ SMB Port 445 สำเร็จใน {connection.durationMs} ms<br /><small>{connection.uncPath}</small></> : connection.error}</span></div> : null}
      {settings?.draft ? <div className="callout info" style={{ marginTop: 12 }}><Icon name="clock" /><span><strong>บันทึกเป็น Draft แล้ว</strong><br /><small>บันทึกล่าสุดโดย {settings.draft.updatedByName} · {formatDateTime(settings.draft.updatedAt)} ค่านี้จะเป็น Active หลังฝั่ง Server Apply/Deploy สำเร็จ</small></span></div> : null}
      <div className="info-strip" style={{ marginTop: 14 }}><Icon name="shield" />Password ไม่ถูกส่งกลับ Browser และยังคงจัดการด้วย Server Secret</div>
    </Panel>
    <Panel
      title="Active document storage"
      subtitle="ทดสอบ write-read-delete ไฟล์จริงบน storage path ที่ backend ใช้งานอยู่"
      actions={<button className="btn ghost sm" type="button" disabled={busy} onClick={() => { void run(); }}>{busy ? <><span className="spinner" /> Testing…</> : <><Icon name="refresh" /> Run storage test</>}</button>}
    >
      <div className="settings-list">
        {result ? (<>
          <div>
            <span className={`setting-icon ${result.ok ? "green" : "red"}`}><Icon name={result.ok ? "database" : "alertTriangle"} /></span>
            <span><strong>{result.mode === "Nas" ? "NAS (Network Share)" : "Local disk"}</strong><small style={{ wordBreak: "break-all" }}>{result.rootPath}</small></span>
            <Badge tone={result.ok ? "green" : "red"}>{result.ok ? `OK · ${result.durationMs} ms` : "FAILED"}</Badge>
          </div>
          {result.error && <div className="callout error" style={{ marginTop: 8 }}><Icon name="alertTriangle" /><span>{result.error}</span></div>}
        </>) : (
          <div><span className="setting-icon slate"><Icon name="database" /></span><span><strong>ยังไม่ได้ทดสอบ</strong><small>กด Run storage test เพื่อเขียน อ่าน และลบไฟล์ทดสอบบน storage ที่ใช้งานจริง</small></span></div>
        )}
        {err && <div className="callout error"><Icon name="alertTriangle" /><span>{err}</span></div>}
      </div>
    </Panel>
    </>
  );
}

export function ProductionSettings({ bootstrap, notify, teamTestMode = false }: AdminAnalyticsProps) {
  const uiText = useUiText();
  const endpoint = (() => { try { return new URL(API_BASE_URL).origin; } catch { return "Not configured"; } })();
  return <>
    <PageHeader eyebrow="RUNTIME STATUS" title={uiText("Settings")} subtitle="ตรวจสถานะระบบและกำหนดปลายทางจัดเก็บเอกสารของ NAS" meta={<Badge tone={teamTestMode ? "amber" : "green"}>{teamTestMode ? "Team Test" : "Production"}</Badge>} />
    <div className="grid-2">
      <Panel title="Signed-in identity" subtitle="Resolved by the API and SQL user registry"><div className="settings-list">
        <div><span className="setting-icon blue"><Icon name="user" /></span><span><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></span><Badge>{bootstrap.user.role}</Badge></div>
        <div><span className="setting-icon violet"><Icon name="users" /></span><span><strong>{bootstrap.user.department || "No department"}</strong><small><LocalizedText text={"Database user ID"} /> {bootstrap.user.id}</small></span><Badge tone={bootstrap.user.isActive ? "green" : "red"}>{bootstrap.user.isActive ? "Active" : "Disabled"}</Badge></div>
      </div></Panel>
      <Panel title="Live connections" subtitle="Verified by the successful bootstrap request"><div className="settings-list">
        <div><span className="setting-icon green"><Icon name="database" /></span><span><strong><LocalizedText text={"SQL Server via API"} /></strong><small><LocalizedText text={"Bootstrap, master and permissions loaded successfully"} /></small></span><Badge tone="green"><LocalizedText text={"Connected"} /></Badge></div>
        <div><span className="setting-icon blue"><Icon name="globe" /></span><span><strong><LocalizedText text={"API origin"} /></strong><small>{endpoint}</small></span><Badge tone="green"><LocalizedText text={"Configured"} /></Badge></div>
        <div><span className="setting-icon amber"><Icon name="clock" /></span><span><strong><LocalizedText text={"Business timezone"} /></strong><small>{BUSINESS_TIME_ZONE}</small></span><Badge tone="blue">{"Active"}</Badge></div>
        <div><span className="setting-icon violet"><Icon name="shield" /></span><span><strong><LocalizedText text={"Authentication"} /></strong><small>{teamTestMode ? "Temporary LAN Team Test session" : "Microsoft Entra ID access token"}</small></span><Badge tone={teamTestMode ? "amber" : "green"}>{teamTestMode ? "UAT only" : "Entra"}</Badge></div>
      </div></Panel>
    </div>
    <StorageCheckPanel canWrite={bootstrap.permissions.includes("master.write")} notify={notify} />
    <Panel title={`Permissions (${bootstrap.permissions.length})`} subtitle="สิทธิ์ RBAC ที่ API ส่งให้บัญชีปัจจุบัน"><div className="chip-select">{bootstrap.permissions.map((permission) => <Badge key={permission} tone="slate">{permission}</Badge>)}</div></Panel>
    <div className="callout info"><Icon name="settings" /><span><strong><LocalizedText text={"Configuration ownership"} /></strong><LocalizedText text={"ค่า connection string, Entra, CORS และ host ถูกจัดการที่ server environment เพื่อไม่ให้ browser แก้ไขความปลอดภัยของ Production ได้"} /></span></div>
  </>;
}
