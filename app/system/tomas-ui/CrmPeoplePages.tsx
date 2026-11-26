"use client";
/*
 * Customers, Customer 360, contacts, activities and documents on @tomas-tc/ui (CRM list and detail pages, owner
 * 2026-11-26: "ย้ายหน้ารายการและรายละเอียด CRM ไปใช้ @tomas-tc/ui"). The calls, permissions, row versions and screen links
 * are the ones the old pages used; only the markup is the kit's. The company register panel (ErpMasterPanel) and the
 * new-customer dialog (CustomerModal) are old app parts, so they sit beside the kit's roots, never inside one.
 */
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, NamedIcon, SearchInput, Tabs, TabsList, TabsTrigger } from "@tomas-tc/ui";
import { useRef, useState, type ReactNode } from "react";
import { apiRequest, downloadCrmDocument, uploadCrmDocument, type BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import { useLinkedControl } from "../screen-link";
import { CustomerModal } from "../production/AdminAnalyticsScreens";
import { ErpMasterPanel } from "../production/ErpMasterPanel";
import { CRM_COPY } from "../production/crm-copy";
import { crmFailure, crmRequest, customerOptions, formatDay, formatMoment, teamOptions, text, useCrmData, type CrmPage, type CrmRecord, type CustomerDetail } from "../production/crm-records";
import { ActivityDialog, ContactDialog, CrmFormDialog, EntityPicker, RemoveDialog, type FieldSpec } from "./CrmForms";
import {
  Chips,
  EmptyBlock,
  FilterSelect,
  LoadError,
  LoadingRows,
  OpenLink,
  PagingBar,
  RecordTable,
  Section,
  StatusBadge,
  SummaryBar,
  Toolbar,
  money,
  type Column,
  type TableStates,
} from "./CrmKitParts";
import { TomasUi } from "./TomasUi";

const params = (values: Record<string, string>) => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== ""));
export const ACTIVITY_TYPES = ["Meeting", "Call", "Email", "SiteVisit", "CustomerUpdate", "InternalDiscussion", "MessageLINE", "Note", "Other"];

/** The words a table's states use, in the reader's language. */
export function useTableStates(): TableStates {
  const t = useT();
  return { loading: t("CRM.loading"), failed: t("CRM.loadFailed"), retry: t("CRM.retry") };
}
/** A code's words: a CRM code when the CRM copy has it (stages, statuses), the app's dictionary otherwise. */
export function useCodeLabel() {
  const t = useT();
  return (code: string) => (!code ? "—" : CRM_COPY[`CRM.${code}`] ? t(`CRM.${code}`) : t(code === "Approved" ? "CRM.costApproved" : code));
}
/** Paging over rows the page already holds (Customer 360's tabs, documents). */
function useLocalPage<Row>(rows: Row[]) {
  const [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10);
  const pages = Math.max(1, Math.ceil(rows.length / perPage)),
    current = Math.min(page, pages);
  return {
    rows: rows.slice((current - 1) * perPage, current * perPage),
    paging: {
      page: current,
      perPage,
      total: rows.length,
      onPage: setPage,
      onPerPage: (n: number) => {
        setPerPage(n);
        setPage(1);
      },
    },
  };
}

/* ------------------------------------------------------------------ documents */

/** Documents of a customer, a deal or one activity: upload (for those who log activities), the list, download on the name. */
export function DocumentsPanel({
  bootstrap,
  customerId,
  opportunityId,
  activityId,
  year,
  bare,
}: {
  bootstrap: BootstrapData;
  customerId: number;
  opportunityId?: number;
  activityId?: number;
  year?: string;
  bare?: boolean;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    states = useTableStates(),
    input = useRef<HTMLInputElement>(null);
  const state = useCrmData<CrmRecord[]>(
    `/api/v1/crm/documents?${params({ customerId: String(customerId), opportunityId: opportunityId ? String(opportunityId) : "", activityId: activityId ? String(activityId) : "", year: year ?? "" })}`,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writable = bootstrap.permissions.includes("crm.activity.write");
  const local = useLocalPage(state.shown ?? []);
  const download = async (r: CrmRecord) => {
    setError("");
    try {
      const blob = await downloadCrmDocument(Number(r.id)),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = text(r.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("CRM.downloadFailed");
    }
  };
  const upload = (file: File) => {
    setBusy(true);
    setError("");
    void uploadCrmDocument(file, customerId, opportunityId, activityId)
      .then(state.refresh)
      .catch((failure: unknown) => setError(crmFailure(failure).key === "CRM.error" ? "CRM.uploadFailed" : crmFailure(failure).key))
      .finally(() => setBusy(false));
  };
  const columns: Column<CrmRecord>[] = [
    { key: "name", label: t("CRM.recordName"), render: (r) => <OpenLink onOpen={() => void download(r)}>{text(r.name)}</OpenLink> },
    { key: "by", label: t("CRM.uploadedByName"), render: (r) => text(r.uploadedByName) || "—" },
    { key: "at", label: t("CRM.uploadedAt"), render: (r) => formatMoment(r.uploadedAt, lang) || "—" },
    { key: "size", label: t("CRM.sizeBytes"), className: "text-right tabular-nums", render: (r) => Number(r.sizeBytes ?? 0).toLocaleString("en-US") },
  ];
  const action = writable ? (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} data-guide="crm.upload" onClick={() => input.current?.click()}>
        <NamedIcon name={busy ? "loader-circle" : "upload"} className={busy ? "size-4 animate-spin" : "size-4"} />
        {t(busy ? "CRM.uploading" : "CRM.upload")}
      </Button>
    </>
  ) : null;
  const body = (
    <>
      {error ? (
        <p role="alert" className="px-4 pt-3 text-sm text-destructive">
          {t(error)}
        </p>
      ) : null}
      <RecordTable
        label={t("CRM.documents")}
        columns={columns}
        rows={local.rows}
        rowKey={(r) => text(r.id)}
        loading={state.loading}
        failed={state.error}
        onRetry={state.refresh}
        states={states}
        paging={local.paging}
        empty={<EmptyBlock icon="file" title={t("CRM.noDocuments")} hint={t(writable ? "CRM.noDocumentsHint" : "CRM.noRecordsHint")} />}
      />
    </>
  );
  return bare ? (
    <div className="grid gap-2">
      <div className="flex justify-end">{action}</div>
      {body}
    </div>
  ) : (
    <Section title={t("CRM.documents")} actions={action} flush>
      {body}
    </Section>
  );
}

/* ------------------------------------------------------------------ activities */

/** The activity form; this side keeps the API call. */
export function ActivityEditor({
  bootstrap,
  customerId,
  opportunityId,
  onClose,
  onSaved,
}: {
  bootstrap: BootstrapData;
  customerId?: number;
  opportunityId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ActivityDialog
      bootstrap={bootstrap}
      customerId={customerId}
      opportunityId={opportunityId}
      onClose={onClose}
      onSave={async (v) => {
        const next = text(v.action).trim() ? { action: v.action, ownerId: v.nextOwnerId, dueDate: v.dueDate } : undefined;
        await crmRequest("/api/v1/crm/activities", "POST", { ...v, occurredAt: new Date(text(v.occurredAt)).toISOString(), nextAction: next });
        onSaved();
      }}
    />
  );
}

/* One activity: when, what, who, and (on the activity list) which customer and deal it belongs to, each a link (CRM-13). */
export function ActivityTimeline({
  rows,
  bootstrap,
  empty,
  openOpportunity,
  openCustomer,
}: {
  rows: CrmRecord[];
  bootstrap: BootstrapData;
  empty: ReactNode;
  openOpportunity?: (id: number) => void;
  openCustomer?: (id: number) => void;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    [documents, setDocuments] = useState<CrmRecord | null>(null);
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <ol className="grid divide-y">
        {rows.map((r) => (
          <li key={text(r.id)} className="grid gap-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatMoment(r.occurredAt, lang)}</span>
              <StatusBadge code="Open" label={t(`CRM.${text(r.activityType)}`)} />
              <span>{text(r.ownerName)}</span>
            </div>
            {openCustomer || openOpportunity ? (
              <p className="flex flex-wrap items-center gap-1 text-xs">
                {openCustomer ? (
                  <OpenLink onOpen={() => openCustomer(Number(r.customerId))}>
                    {text(r.customerName)}
                    {r.customerCode ? ` (${text(r.customerCode)})` : ""}
                  </OpenLink>
                ) : null}
                {r.opportunityId && openOpportunity ? (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <OpenLink onOpen={() => openOpportunity(Number(r.opportunityId))}>
                      {text(r.opportunityNo) || t("CRM.sourceOpportunity")} · {text(r.opportunityName)}
                    </OpenLink>
                  </>
                ) : null}
              </p>
            ) : null}
            <h3 className="text-sm font-semibold text-foreground">{text(r.summary)}</h3>
            {r.decision ? <p className="text-sm text-foreground/80">{text(r.decision)}</p> : null}
            {r.actionItems ? <p className="text-sm text-foreground/80">{text(r.actionItems)}</p> : null}
            {r.participants ? (
              <p className="text-xs text-muted-foreground">
                {t("CRM.participants")}: {text(r.participants)}
              </p>
            ) : null}
            {r.nextAction ? (
              <p className="text-xs">
                <span className="text-muted-foreground">{t("CRM.action")}:</span> {text(r.nextAction)} · {text(r.nextOwnerName)} · {formatDay(r.nextDue, lang)}
              </p>
            ) : null}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setDocuments(r)}>
                <NamedIcon name="file-text" className="size-4" />
                {t("CRM.documents")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {documents ? (
        <Dialog open onOpenChange={(open) => !open && setDocuments(null)}>
          <DialogContent className="flex max-h-[min(92vh,900px)] flex-col gap-0 p-0 sm:max-w-4xl">
            <DialogHeader className="border-b px-6 pt-5 pb-3 pr-12">
              <DialogTitle>{t("CRM.documents")}</DialogTitle>
              <DialogDescription>{text(documents.summary)}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <DocumentsPanel
                bootstrap={bootstrap}
                customerId={Number(documents.customerId)}
                opportunityId={documents.opportunityId ? Number(documents.opportunityId) : undefined}
                activityId={Number(documents.id)}
                bare
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/* The activity timeline, searched and filtered on the server (CRM-03): words in the summary, the customer or the deal,
   the customer, the owner, the type and a date range, every page reachable. The type counts read the same filters
   (but the type), and each count is the filter it names (CRM-07). */
export function ActivitiesPanel({
  bootstrap,
  customerId,
  year,
  openOpportunity,
  openCustomer,
}: {
  bootstrap: BootstrapData;
  customerId?: number;
  year?: string;
  openOpportunity?: (id: number) => void;
  openCustomer?: (id: number) => void;
}) {
  const t = useT(),
    states = useTableStates();
  const [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(30),
    [add, setAdd] = useState(false);
  const [search, setSearch] = useState(""),
    [customer, setCustomer] = useState(""),
    [owner, setOwner] = useState(""),
    [type, setType] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  useLinkedControl(customerId ? null : "q", search, reset(setSearch));
  const state = useCrmData<CrmPage & { types?: Record<string, number>; allTypes?: number }>(
    `/api/v1/crm/activities?${params({ page: String(page), pageSize: String(perPage), customerId: customerId ? String(customerId) : customer, ownerId: owner, activityType: type, search, from, to, year: year ?? "" })}`,
  );
  const shown = state.shown,
    rows = shown?.items ?? [],
    writable = bootstrap.permissions.includes("crm.activity.write");
  const filtered = Boolean(search || customer || owner || type || from || to);
  const clear = () => {
    setSearch("");
    setCustomer("");
    setOwner("");
    setType("");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const empty = filtered ? (
    <EmptyBlock
      title={t("CRM.empty")}
      hint={t("CRM.emptyHint")}
      action={
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          {t("CRM.clearFilters")}
        </Button>
      }
    />
  ) : (
    <EmptyBlock
      icon="calendar"
      title={t(customerId ? "CRM.noActivitiesCustomer" : "CRM.noActivities")}
      hint={t(writable ? "CRM.noActivitiesHint" : "CRM.noActivitiesReadOnly")}
      action={
        writable ? (
          <Button type="button" size="sm" onClick={() => setAdd(true)}>
            <NamedIcon name="plus" className="size-4" />
            {t("CRM.addActivity")}
          </Button>
        ) : null
      }
    />
  );
  return (
    <>
      <TomasUi>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3" data-guide="crm.activity.types">
            <Chips
              label={t("CRM.activityType")}
              items={ACTIVITY_TYPES.filter((key) => Number(shown?.types?.[key] ?? 0) > 0 || type === key).map((key) => ({
                key,
                label: t(`CRM.${key}`),
                value: Number(shown?.types?.[key] ?? 0),
                tone: "blue",
              }))}
              active={type}
              onPick={reset(setType)}
            />
            <span className="text-xs text-muted-foreground">{t("CRM.activitiesInScope").replace("{n}", String(shown?.allTypes ?? shown?.total ?? 0))}</span>
          </div>
          <Toolbar guide="crm.activity.filters">
            <SearchInput className="w-64" value={search} placeholder={t("CRM.searchActivities")} aria-label={t("CRM.searchActivities")} onValueChange={reset(setSearch)} />
            {customerId ? null : (
              <div className="w-56">
                <EntityPicker ariaLabel={t("CRM.customerId")} placeholder={t("CRM.allCustomers")} value={customer} options={customerOptions(bootstrap)} clearable onChange={reset(setCustomer)} />
              </div>
            )}
            <div className="w-52">
              <EntityPicker ariaLabel={t("CRM.ownerId")} placeholder={t("CRM.allOwners")} value={owner} options={teamOptions(bootstrap)} clearable onChange={reset(setOwner)} />
            </div>
            <FilterSelect label={t("CRM.activityType")} allLabel={t("CRM.allTypes")} value={type} onChange={reset(setType)} options={ACTIVITY_TYPES.map((s) => ({ value: s, label: t(`CRM.${s}`) }))} />
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("CRM.from")}
              <Input type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} />
            </Label>
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("CRM.to")}
              <Input type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} />
            </Label>
            {filtered ? (
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                {t("CRM.clearFilters")}
              </Button>
            ) : null}
            <span className="flex-1" />
            {writable ? (
              <Button type="button" data-guide="crm.addActivity" onClick={() => setAdd(true)}>
                <NamedIcon name="plus" className="size-4" />
                {t("CRM.addActivity")}
              </Button>
            ) : null}
          </Toolbar>
          <Section title={`${shown?.total ?? 0} ${t("CRM.activities")}`} subtitle={filtered ? t("CRM.filteredResults") : undefined} flush>
            {state.error ? <LoadError message={states.failed} retryLabel={states.retry} onRetry={state.refresh} /> : null}
            {state.loading && !rows.length ? <LoadingRows label={states.loading} /> : null}
            {rows.length || !state.loading ? (
              <div className={state.loading ? "opacity-60 transition-opacity" : undefined} aria-busy={state.loading || undefined}>
                <ActivityTimeline bootstrap={bootstrap} rows={rows} empty={state.error ? null : empty} openOpportunity={openOpportunity} openCustomer={customerId ? undefined : openCustomer} />
              </div>
            ) : null}
            {shown && rows.length ? (
              <PagingBar
                paging={{
                  page,
                  perPage,
                  total: shown.total,
                  onPage: setPage,
                  onPerPage: (n) => {
                    setPerPage(n);
                    setPage(1);
                  },
                }}
              />
            ) : null}
          </Section>
        </div>
      </TomasUi>
      {add ? <ActivityEditor bootstrap={bootstrap} customerId={customerId} onClose={() => setAdd(false)} onSaved={state.refresh} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ contacts */

export function ContactsPanel({ bootstrap, customerId }: { bootstrap: BootstrapData; customerId?: number }) {
  const t = useT(),
    states = useTableStates(),
    codeLabel = useCodeLabel();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [remove, setRemove] = useState<CrmRecord | null>(null);
  useLinkedControl(customerId ? null : "q", search, (v) => {
    setSearch(v);
    setPage(1);
  });
  const state = useCrmData<CrmPage>(`/api/v1/crm/contacts?${params({ search, page: String(page), pageSize: String(perPage), customerId: customerId ? String(customerId) : "" })}`),
    writable = bootstrap.permissions.includes("crm.contact.write");
  const shown = state.shown,
    rows = shown?.items ?? [];
  const columns: Column<CrmRecord>[] = [
    { key: "name", label: t("CRM.recordName"), render: (r) => (writable ? <OpenLink onOpen={() => setEdit(r)}>{text(r.name) || "—"}</OpenLink> : text(r.name) || "—") },
    ...(customerId ? [] : [{ key: "customer", label: t("CRM.customerName"), render: (r: CrmRecord) => text(r.customerName) || "—" }]),
    { key: "position", label: t("CRM.position"), className: "max-[720px]:hidden", render: (r) => text(r.position) || "—" },
    { key: "department", label: t("CRM.department"), className: "max-[720px]:hidden", render: (r) => text(r.department) || "—" },
    { key: "email", label: t("CRM.email"), render: (r) => text(r.email) || "—" },
    { key: "phone", label: t("CRM.phone"), className: "max-[720px]:hidden", render: (r) => text(r.phone) || "—" },
    { key: "role", label: t("CRM.contactRole"), render: (r) => (r.contactRole ? <StatusBadge code={text(r.contactRole)} label={codeLabel(text(r.contactRole))} /> : "—") },
    ...(writable
      ? [
          {
            key: "actions",
            label: t("Actions"),
            className: "w-12",
            render: (r: CrmRecord) => (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("CRM.remove")} ${text(r.name)}`} title={t("CRM.remove")} onClick={() => setRemove(r)}>
                <NamedIcon name="trash-2" className="size-4" />
              </Button>
            ),
          },
        ]
      : []),
  ];
  const newContact = () => setEdit({ customerId: customerId ?? "" });
  return (
    <>
      <TomasUi>
        <div className="grid gap-3">
          <Toolbar>
            <SearchInput
              className="w-72"
              value={search}
              placeholder={t("CRM.searchContacts")}
              aria-label={t("CRM.searchContacts")}
              onValueChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <span className="flex-1" />
            {writable ? (
              <Button type="button" onClick={newContact}>
                <NamedIcon name="plus" className="size-4" />
                {t("CRM.newContact")}
              </Button>
            ) : null}
          </Toolbar>
          <Section title={`${shown?.total ?? 0} ${t("CRM Contacts")}`} flush>
            <RecordTable
              label={t("CRM Contacts")}
              columns={columns}
              rows={rows}
              rowKey={(r) => text(r.id)}
              loading={state.loading}
              failed={state.error}
              onRetry={state.refresh}
              states={states}
              paging={
                shown
                  ? {
                      page,
                      perPage,
                      total: shown.total,
                      onPage: setPage,
                      onPerPage: (n) => {
                        setPerPage(n);
                        setPage(1);
                      },
                    }
                  : null
              }
              empty={
                search ? (
                  <EmptyBlock
                    title={t("CRM.empty")}
                    hint={t("CRM.emptyHintSearch")}
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
                        {t("CRM.clearFilters")}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyBlock
                    icon="users"
                    title={t("CRM.noContacts")}
                    hint={t(writable ? "CRM.noContactsHint" : "CRM.noRecordsHint")}
                    action={
                      writable ? (
                        <Button type="button" size="sm" onClick={newContact}>
                          {t("CRM.newContact")}
                        </Button>
                      ) : null
                    }
                  />
                )
              }
            />
          </Section>
        </div>
      </TomasUi>
      {remove ? (
        <RemoveDialog
          title="CRM.removeContact"
          name={text(remove.name)}
          hint="CRM.removeContactHint"
          blocked={remove.isPrimary === true ? "CRM.primary_contact_protected" : undefined}
          onClose={() => setRemove(null)}
          onRemove={async () => {
            await apiRequest(`/api/v1/sales/customers/${remove.customerId}/contacts/${remove.id}?${new URLSearchParams({ rowVersion: text(remove.rowVersion) })}`, { method: "DELETE" });
            setPage((p) => (rows.length === 1 ? Math.max(1, p - 1) : p));
            state.refresh();
          }}
        />
      ) : null}
      {edit ? (
        <ContactDialog
          bootstrap={bootstrap}
          initial={{ ...edit, nameEn: edit.nameEn || (!edit.nameTh && !edit.nameJa ? edit.name : "") }}
          onClose={() => setEdit(null)}
          onReload={() => {
            setEdit(null);
            state.refresh();
          }}
          onSave={async (v) => {
            await crmRequest(`/api/v1/sales/customers/${v.customerId}/contacts${edit.id ? `/${edit.id}` : ""}`, edit.id ? "PUT" : "POST", { ...v, siteId: v.siteId || undefined });
            state.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ customers */

/* A customer from Pegasus ERP keeps the ERP name, address and open/closed state (migration 099); the server keeps them as well. */
function customerFields(record: CrmRecord, bootstrap: BootstrapData): FieldSpec[] {
  const erp = Boolean(record.erpCustomerCode);
  return [
    { key: "nameTh", disabled: erp },
    { key: "nameEn", disabled: erp },
    { key: "nameJa" },
    { key: "shortName", hint: "CRM.shortNameHint" },
    { key: "industry" },
    { key: "country" },
    { key: "website", type: "url" },
    { key: "accountOwnerId", searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap) },
    { key: "site", wide: true, disabled: erp },
    { key: "isActive", type: "checkbox", disabled: erp },
  ];
}
const erpIntro = (record: CrmRecord) => (record.erpCustomerCode ? { lines: ["ErpMaster.lockedHint"] } : undefined);
function CustomerEditor({
  customer,
  bootstrap,
  onClose,
  onSaved,
  onReload,
}: {
  customer: CrmRecord;
  bootstrap: BootstrapData;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onReload: () => void;
}) {
  return (
    <CrmFormDialog
      title="CRM.editCustomer"
      description={`${text(customer.code)} · ${text(customer.name)}`}
      size="lg"
      initial={{ ...customer, nameEn: customer.nameEn || (!customer.nameTh && !customer.nameJa ? customer.name : "") }}
      intro={erpIntro(customer)}
      fields={customerFields(customer, bootstrap)}
      onClose={onClose}
      onReload={onReload}
      onSave={async (v) => {
        await crmRequest(`/api/v1/crm/customers/${customer.id}`, "PUT", v);
        await onSaved();
      }}
    />
  );
}

export function CustomerListPage({ bootstrap, open, refreshBootstrap }: { bootstrap: BootstrapData; refreshBootstrap?: () => Promise<void>; open: (id: number) => void }) {
  const t = useT(),
    states = useTableStates();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10),
    [add, setAdd] = useState(false),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [remove, setRemove] = useState<CrmRecord | null>(null);
  useLinkedControl("q", search, (v) => {
    setSearch(v);
    setPage(1);
  });
  const state = useCrmData<CrmPage>(`/api/v1/crm/customers?${params({ search, page: String(page), pageSize: String(perPage) })}`),
    writable = bootstrap.permissions.includes("crm.contact.write");
  const shown = state.shown,
    rows = shown?.items ?? [];
  const columns: Column<CrmRecord>[] = [
    { key: "code", label: t("CRM.code"), className: "font-mono text-xs", render: (r) => text(r.code) },
    {
      key: "name",
      label: t("CRM.recordName"),
      className: "max-w-0 w-[34%]",
      render: (r) => (
        <OpenLink className="block truncate" title={text(r.name)} onOpen={() => open(Number(r.id))}>
          {text(r.name) || "—"}
        </OpenLink>
      ),
    },
    { key: "erp", label: t("CRM.erpCustomerCode"), className: "font-mono text-xs", render: (r) => text(r.erpCustomerCode) || "—" },
    { key: "industry", label: t("CRM.industry"), className: "max-[720px]:hidden", render: (r) => text(r.industry) || "—" },
    { key: "site", label: t("CRM.site"), className: "max-[720px]:hidden", render: (r) => text(r.site) || "—" },
    { key: "owner", label: t("CRM.accountOwnerName"), className: "max-[720px]:hidden", render: (r) => text(r.accountOwnerName) || "—" },
    ...(writable
      ? [
          {
            key: "actions",
            label: t("Actions"),
            className: "w-24",
            render: (r: CrmRecord) => (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("Edit")} ${text(r.name)}`} title={t("Edit")} onClick={() => setEdit(r)}>
                  <NamedIcon name="pencil" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("CRM.remove")} ${text(r.name)}`} title={t("CRM.remove")} onClick={() => setRemove(r)}>
                  <NamedIcon name="trash-2" className="size-4" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <ErpMasterPanel
        kind="customers"
        onChanged={async () => {
          state.refresh();
          await refreshBootstrap?.();
        }}
      />
      <TomasUi>
        <div className="grid gap-3">
          <Toolbar>
            <SearchInput
              className="w-80"
              value={search}
              placeholder={t("CRM.searchCustomers")}
              aria-label={t("CRM.searchCustomers")}
              onValueChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <span className="flex-1" />
            {writable ? (
              <Button type="button" onClick={() => setAdd(true)}>
                <NamedIcon name="plus" className="size-4" />
                {t("CRM.newCustomer")}
              </Button>
            ) : null}
          </Toolbar>
          <Section title={`${shown?.total ?? 0} ${t("CRM Customers")}`} guide="crm.customer-list" flush>
            <RecordTable
              label={t("CRM Customers")}
              columns={columns}
              rows={rows}
              rowKey={(r) => text(r.id)}
              loading={state.loading}
              failed={state.error}
              onRetry={state.refresh}
              states={states}
              paging={
                shown
                  ? {
                      page,
                      perPage,
                      total: shown.total,
                      onPage: setPage,
                      onPerPage: (n) => {
                        setPerPage(n);
                        setPage(1);
                      },
                    }
                  : null
              }
              empty={
                search ? (
                  <EmptyBlock
                    title={t("CRM.empty")}
                    hint={t("CRM.emptyHintSearch")}
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
                        {t("CRM.clearFilters")}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyBlock icon="building-2" title={t("CRM.noCustomers")} hint={t("CRM.noCustomersHint")} />
                )
              }
            />
          </Section>
        </div>
      </TomasUi>
      {remove ? (
        <RemoveDialog
          title="CRM.removeCustomer"
          name={text(remove.name)}
          hint="CRM.removeCustomerHint"
          onClose={() => setRemove(null)}
          onRemove={async () => {
            await apiRequest(`/api/v1/crm/customers/${remove.id}?${new URLSearchParams({ rowVersion: text(remove.rowVersion) })}`, { method: "DELETE" });
            setPage((p) => (rows.length === 1 ? Math.max(1, p - 1) : p));
            state.refresh();
            await refreshBootstrap?.();
          }}
        />
      ) : null}
      {add ? (
        <CustomerModal
          customer={null}
          onClose={() => setAdd(false)}
          onSaved={async () => {
            setAdd(false);
            await refreshBootstrap?.();
            state.refresh();
          }}
        />
      ) : null}
      {edit ? (
        <CustomerEditor
          customer={edit}
          bootstrap={bootstrap}
          onClose={() => setEdit(null)}
          onReload={() => {
            setEdit(null);
            state.refresh();
          }}
          onSaved={async () => {
            await refreshBootstrap?.();
            state.refresh();
          }}
        />
      ) : null}
    </>
  );
}

const CUSTOMER_TABS = ["overview", "contacts", "activities", "opportunities", "inquiries", "estimates", "projects", "service", "documents"];

/** Customer 360: who the customer is, then one tab per kind of record; the year narrows every tab that has a date. */
export function CustomerPage({
  id,
  bootstrap,
  refreshBootstrap,
  openOpportunity,
  openInquiry,
  openEstimate,
  openProject,
}: {
  id: number;
  bootstrap: BootstrapData;
  refreshBootstrap?: () => Promise<void>;
  openOpportunity: (id: number) => void;
  openInquiry: (id: number) => void;
  openEstimate: (id: number) => void;
  openProject: (id: number) => void;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    states = useTableStates(),
    codeLabel = useCodeLabel();
  const [tab, setTab] = useState("overview"),
    [year, setYear] = useState(""),
    [oppPage, setOppPage] = useState(1),
    [oppSize, setOppSize] = useState(10),
    [editor, setEditor] = useState<string | null>(null),
    [siteEdit, setSiteEdit] = useState<CrmRecord | null>(null);
  const state = useCrmData<CustomerDetail>(`/api/v1/crm/customers/${id}${year ? `?year=${year}` : ""}`);
  // Every deal of the customer, a page at a time (CRM-05), and the open ones with a next action, soonest first.
  const opps = useCrmData<CrmPage>(`/api/v1/crm/opportunities?${params({ customerId: String(id), page: String(oppPage), pageSize: String(oppSize), year })}`);
  const followups = useCrmData<CrmPage>(`/api/v1/crm/opportunities?${params({ customerId: String(id), open: "true", sort: "due", pageSize: "20", year })}`);
  const activities = useCrmData<CrmPage>(`/api/v1/crm/activities?${params({ customerId: String(id), pageSize: "1", year })}`);
  const detail = state.shown,
    customer = detail?.customer;
  const inquiries = useLocalPage(detail?.inquiries ?? []),
    estimates = useLocalPage(detail?.estimates ?? []),
    projects = useLocalPage(detail?.projects ?? []),
    service = useLocalPage(detail?.service ?? []),
    sites = useLocalPage(detail?.sites ?? []),
    next = useLocalPage((followups.shown?.items ?? []).filter((o) => o.nextAction));
  const writable = bootstrap.permissions.includes("crm.contact.write");
  const latest = activities.shown?.items?.[0];
  const noRecords = <EmptyBlock title={t("CRM.noRecords")} hint={t("CRM.noRecordsHint")} />;
  const status = (r: CrmRecord) => (r.status ? <StatusBadge code={text(r.status)} label={codeLabel(text(r.status))} /> : "—");
  if (!customer)
    return (
      <TomasUi>
        <Section flush>{state.error ? <LoadError message={states.failed} retryLabel={states.retry} onRetry={state.refresh} /> : <LoadingRows label={states.loading} />}</Section>
      </TomasUi>
    );
  const counts: Record<string, number> = {
    opportunities: opps.shown?.total ?? 0,
    inquiries: detail?.inquiries.length ?? 0,
    estimates: detail?.estimates.length ?? 0,
    projects: detail?.projects.length ?? 0,
  };
  return (
    <>
      <TomasUi>
        <div className="grid gap-3">
          <Section>
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-12 place-items-center rounded-md bg-primary/10 text-base font-semibold text-primary" aria-hidden="true">
                {text(customer.name).slice(0, 2).toUpperCase()}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="truncate text-lg font-semibold text-foreground">{text(customer.name)}</h2>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{text(customer.code)}</span>
                  {customer.erpCustomerCode ? <span className="font-mono"> · ERP {text(customer.erpCustomerCode)}</span> : null} · {text(customer.accountOwnerName) || t("CRM.noAccountOwner")} ·{" "}
                  {text(customer.site) || "—"}
                </p>
              </div>
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("CRM.year")}
                <Input
                  type="number"
                  min={2000}
                  max={2200}
                  className="w-28"
                  value={year}
                  placeholder={t("CRM.allYears")}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setOppPage(1);
                  }}
                />
              </Label>
              {writable ? (
                <Button type="button" variant="outline" onClick={() => setEditor("customer")}>
                  <NamedIcon name="pencil" className="size-4" />
                  {t("CRM.editCustomer")}
                </Button>
              ) : null}
            </div>
            {year ? <p className="mt-2 text-xs text-muted-foreground">{t("CRM.yearScope").replace("{year}", year)}</p> : null}
          </Section>
          <Tabs value={tab} onValueChange={setTab}>
            <div className="overflow-x-auto">
              <TabsList>
                {CUSTOMER_TABS.map((k) => (
                  <TabsTrigger key={k} value={k} data-tab={k}>
                    {t(`CRM.${k}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          {tab === "overview" ? (
            <>
              <SummaryBar
                label={t("CRM.overview")}
                cells={["opportunities", "inquiries", "estimates", "projects"].map((k) => ({ key: k, label: t(`CRM.${k}`), value: counts[k] ?? 0, tone: null, pressed: false }))}
                onPick={(key) => setTab(key)}
              />
              <Section title={t("CRM.lastActivity")}>
                {latest ? (
                  <p className="text-sm">
                    {text(latest.summary)} <span className="text-xs text-muted-foreground">· {formatMoment(latest.occurredAt, lang)}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("CRM.noActivitiesYet")}</p>
                )}
              </Section>
              <Section title={t("CRM.followups")} subtitle={followups.shown && followups.shown.total > followups.shown.items.length ? t("CRM.followupsFirst") : undefined} flush>
                <RecordTable
                  label={t("CRM.followups")}
                  columns={[
                    { key: "name", label: t("CRM.recordName"), render: (r) => <OpenLink onOpen={() => openOpportunity(Number(r.id))}>{text(r.name)}</OpenLink> },
                    { key: "next", label: t("CRM.nextAction"), render: (r) => text(r.nextAction) },
                    { key: "due", label: t("CRM.nextDue"), render: (r) => formatDay(r.nextDue, lang) || "—" },
                  ]}
                  rows={next.rows}
                  rowKey={(r) => text(r.id)}
                  loading={followups.loading}
                  failed={followups.error}
                  onRetry={followups.refresh}
                  states={states}
                  paging={next.paging}
                  empty={<EmptyBlock icon="check-check" title={t("CRM.noFollowups")} hint={t("CRM.noFollowupsHint")} />}
                />
              </Section>
              <Section
                title={t("CRM.sites")}
                flush
                actions={
                  writable ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSiteEdit(null);
                        setEditor("site");
                      }}
                    >
                      <NamedIcon name="plus" className="size-4" />
                      {t("CRM.newSite")}
                    </Button>
                  ) : null
                }
              >
                <RecordTable
                  label={t("CRM.sites")}
                  columns={[
                    {
                      key: "name",
                      label: t("CRM.recordName"),
                      render: (r) =>
                        writable ? (
                          <OpenLink
                            onOpen={() => {
                              setSiteEdit(r);
                              setEditor("site");
                            }}
                          >
                            {text(r.name)}
                          </OpenLink>
                        ) : (
                          text(r.name)
                        ),
                    },
                    { key: "address", label: t("CRM.address"), render: (r) => text(r.address) || "—" },
                    { key: "province", label: t("CRM.province"), className: "max-[720px]:hidden", render: (r) => text(r.province) || "—" },
                    { key: "country", label: t("CRM.country"), className: "max-[720px]:hidden", render: (r) => text(r.country) || "—" },
                  ]}
                  rows={sites.rows}
                  rowKey={(r) => text(r.id)}
                  states={states}
                  paging={sites.paging}
                  empty={<EmptyBlock icon="map-pin" title={t("CRM.noSites")} hint={t("CRM.noSitesHint")} />}
                />
              </Section>
            </>
          ) : null}
          {tab === "opportunities" ? (
            <Section flush>
              <RecordTable
                label={t("CRM.opportunities")}
                columns={[
                  { key: "name", label: t("CRM.recordName"), render: (r) => <OpenLink onOpen={() => openOpportunity(Number(r.id))}>{text(r.name)}</OpenLink> },
                  { key: "no", label: t("CRM.opportunityNo"), className: "font-mono text-xs", render: (r) => text(r.opportunityNo) },
                  { key: "stage", label: t("CRM.salesStage"), render: (r) => <StatusBadge code={text(r.stage)} label={codeLabel(text(r.stage))} /> },
                  { key: "next", label: t("CRM.nextAction"), className: "max-[720px]:hidden", render: (r) => text(r.nextAction) || t("CRM.NoNextAction") },
                ]}
                rows={opps.shown?.items ?? []}
                rowKey={(r) => text(r.id)}
                loading={opps.loading}
                failed={opps.error}
                onRetry={opps.refresh}
                states={states}
                paging={
                  opps.shown
                    ? {
                        page: oppPage,
                        perPage: oppSize,
                        total: opps.shown.total,
                        onPage: setOppPage,
                        onPerPage: (n) => {
                          setOppSize(n);
                          setOppPage(1);
                        },
                      }
                    : null
                }
                empty={<EmptyBlock icon="briefcase" title={t("CRM.noDealsCustomer")} hint={t("CRM.noDealsHint")} />}
              />
            </Section>
          ) : null}
          {tab === "inquiries" ? (
            <Section flush>
              <RecordTable
                label={t("CRM.inquiries")}
                columns={[
                  { key: "no", label: t("CRM.inquiryNo"), render: (r) => <OpenLink onOpen={() => openInquiry(Number(r.id))}>{text(r.inquiryNo)}</OpenLink> },
                  { key: "name", label: t("CRM.projectName"), render: (r) => text(r.projectName) || "—" },
                  { key: "status", label: t("CRM.status"), render: status },
                  { key: "due", label: t("CRM.dueDate"), render: (r) => formatDay(r.dueDate, lang) || "—" },
                ]}
                rows={inquiries.rows}
                rowKey={(r) => text(r.id)}
                states={states}
                paging={inquiries.paging}
                empty={noRecords}
              />
            </Section>
          ) : null}
          {tab === "estimates" ? (
            <Section flush>
              <RecordTable
                label={t("CRM.estimates")}
                columns={[
                  { key: "no", label: t("CRM.estimateNo"), render: (r) => <OpenLink onOpen={() => openEstimate(Number(r.id))}>{text(r.estimateNo)}</OpenLink> },
                  { key: "rev", label: t("CRM.revision"), render: (r) => `R${text(r.revision)}` },
                  { key: "status", label: t("CRM.status"), render: status },
                  { key: "total", label: t("CRM.total"), className: "text-right tabular-nums", render: (r) => money(r.total) },
                ]}
                rows={estimates.rows}
                rowKey={(r) => text(r.id)}
                states={states}
                paging={estimates.paging}
                empty={noRecords}
              />
            </Section>
          ) : null}
          {tab === "projects" ? (
            <Section flush>
              <RecordTable
                label={t("CRM.projects")}
                columns={[
                  { key: "no", label: t("CRM.projectNo"), render: (r) => <OpenLink onOpen={() => openProject(Number(r.id))}>{text(r.projectNo)}</OpenLink> },
                  { key: "name", label: t("CRM.recordName"), render: (r) => text(r.name) || "—" },
                  { key: "status", label: t("CRM.status"), render: status },
                  { key: "target", label: t("CRM.targetDelivery"), render: (r) => formatDay(r.targetDelivery, lang) || "—" },
                ]}
                rows={projects.rows}
                rowKey={(r) => text(r.id)}
                states={states}
                paging={projects.paging}
                empty={noRecords}
              />
            </Section>
          ) : null}
          {tab === "service" ? (
            <Section title={t("CRM.service")} subtitle={t("CRM.serviceHistory")} flush>
              <RecordTable
                label={t("CRM.service")}
                columns={[
                  {
                    key: "no",
                    label: t("CRM.reportNo"),
                    render: (r) => <OpenLink onOpen={() => (r.projectId ? openProject(Number(r.projectId)) : openInquiry(Number(r.inquiryId)))}>{text(r.reportNo)}</OpenLink>,
                  },
                  { key: "title", label: t("CRM.reportTitle"), render: (r) => text(r.title) || "—" },
                  { key: "rev", label: t("CRM.revision"), render: (r) => text(r.revision) },
                  { key: "status", label: t("CRM.status"), render: status },
                  { key: "date", label: t("CRM.reportDate"), render: (r) => formatDay(r.reportDate, lang) || "—" },
                ]}
                rows={service.rows}
                rowKey={(r) => text(r.id)}
                states={states}
                paging={service.paging}
                empty={noRecords}
              />
            </Section>
          ) : null}
        </div>
      </TomasUi>
      {tab === "contacts" ? <ContactsPanel bootstrap={bootstrap} customerId={id} /> : null}
      {tab === "activities" ? <ActivitiesPanel bootstrap={bootstrap} customerId={id} year={year} openOpportunity={openOpportunity} /> : null}
      {tab === "documents" ? (
        <TomasUi>
          <DocumentsPanel bootstrap={bootstrap} customerId={id} year={year} />
        </TomasUi>
      ) : null}
      {editor === "customer" ? (
        <CustomerEditor
          customer={customer}
          bootstrap={bootstrap}
          onClose={() => setEditor(null)}
          onReload={() => {
            setEditor(null);
            state.refresh();
          }}
          onSaved={async () => {
            await refreshBootstrap?.();
            state.refresh();
          }}
        />
      ) : null}
      {editor === "site" ? (
        <CrmFormDialog
          title={siteEdit ? "CRM.editSite" : "CRM.newSite"}
          description={text(customer.name)}
          initial={siteEdit ?? { country: customer.country }}
          fields={[
            { key: "code", required: true, maxLength: 40 },
            { key: "name", label: "CRM.siteName", required: true },
            { key: "address", wide: true },
            { key: "province" },
            { key: "country" },
            { key: "accessNote", type: "textarea", wide: true },
          ]}
          onClose={() => setEditor(null)}
          onReload={() => {
            setEditor(null);
            state.refresh();
          }}
          onSave={async (v) => {
            await crmRequest(`/api/v1/crm/customers/${id}/sites${siteEdit ? `/${siteEdit.id}` : ""}`, siteEdit ? "PUT" : "POST", v);
            state.refresh();
          }}
        />
      ) : null}
    </>
  );
}
