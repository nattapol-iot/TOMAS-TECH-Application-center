"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addAssetEvent, createAsset, createAssetCabinet, deleteAsset, deleteAssetCabinet, getAsset, getAssetOptions, listAssets, listProjects,
  updateAsset, updateAssetCabinet,
  type AssetCabinet, type AssetCabinetInput, type AssetCategory, type AssetInput, type AssetOptions, type AssetStatus, type AssetWarranty,
  type InstalledAsset, type InstalledAssetDetail, type ProjectSummary,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { AssetCredentials } from "./SiteCredentials";
import { LocalizedText } from "../LocalizedText";
import {
  Badge, Drawer, EmptyState, Field, FilterChips, Icon, Modal, PageHeader, Pagination, Panel, SearchInput, Toolbar, type FilterItem, type Tone,
} from "../ui";

type Notify = (message: string) => void;

const CATEGORIES: AssetCategory[] = ["Gateway", "PLC", "HMI", "IPC", "Server", "Network", "Sensor", "Meter", "Camera", "Software", "Other"];
const STATUSES: AssetStatus[] = ["Active", "Spare", "Faulty", "Replaced", "Retired"];
const STATUS_TONE: Record<AssetStatus, Tone> = { Active: "green", Spare: "blue", Faulty: "red", Replaced: "slate", Retired: "slate" };
const WARRANTY_TONE: Record<AssetWarranty, Tone> = { none: "slate", expired: "red", expiring: "amber", covered: "green" };
const WARRANTY_KEY: Record<AssetWarranty, string> = {
  none: "Assets.warrantyNone", expired: "Assets.warrantyExpired", expiring: "Assets.warrantyExpiring", covered: "Assets.warrantyCovered",
};
const EVENT_TONE: Record<string, Tone> = {
  Installed: "green", Updated: "slate", StatusChanged: "violet", FirmwareChanged: "blue", Moved: "amber", Serviced: "blue",
  Replaced: "violet", Deployed: "blue", Note: "slate", Deleted: "red",
};
const PAGE_SIZE = 50;
/** The grouped view reads the register in location order; one page holds most departments' whole base. */
const GROUPED_PAGE_SIZE = 200;

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const categoryKey = (category: string) => `Assets.category.${category}`;
const statusKey = (status: string) => `Assets.status.${status}`;
const eventKey = (kind: string) => `Assets.event.${kind}`;

type Layout = "grouped" | "table";
/** A new asset may start inside a customer's cabinet; an existing one is edited as it is. */
type AssetTarget = InstalledAsset | { preset: Partial<AssetInput> };
type CabinetTarget = AssetCabinet | { preset: { customerId: number } };

/** The reader's last layout, a per-browser convenience; the page works without it. */
const LAYOUT_KEY = "installed-base.layout";
function readLayout(): Layout {
  try { return window.localStorage.getItem(LAYOUT_KEY) === "table" ? "table" : "grouped"; } catch { return "grouped"; }
}
function writeLayout(layout: Layout) {
  try { window.localStorage.setItem(LAYOUT_KEY, layout); } catch { /* storage unavailable: the default next time */ }
}

type CabinetGroup = { key: string; cabinet: AssetCabinet | { id: number; name: string } | null; assets: InstalledAsset[] };
type CustomerGroup = { customer: { id: number; code: string; name: string }; cabinets: CabinetGroup[]; loose: InstalledAsset[] };

/**
 * Customer -> cabinet -> equipment. Equipment outside any cabinet is its customer's last group. Empty
 * cabinets are drawn too when the page shows the whole register, so a new cabinet can be filled.
 */
function groupAssets(items: InstalledAsset[], options: AssetOptions | null, customerId: string, includeEmpty: boolean): CustomerGroup[] {
  const groups = new Map<number, CustomerGroup>();
  const customerGroup = (customer: CustomerGroup["customer"]) => {
    const existing = groups.get(customer.id);
    if (existing) return existing;
    const created: CustomerGroup = { customer, cabinets: [], loose: [] };
    groups.set(customer.id, created);
    return created;
  };
  const cabinetGroup = (group: CustomerGroup, cabinet: { id: number; name: string }) => {
    const key = String(cabinet.id);
    const existing = group.cabinets.find((item) => item.key === key);
    if (existing) return existing;
    const created: CabinetGroup = { key, cabinet: options?.cabinets.find((item) => item.id === cabinet.id) ?? cabinet, assets: [] };
    group.cabinets.push(created);
    return created;
  };
  for (const asset of items) {
    const group = customerGroup(asset.customer);
    if (asset.cabinet) cabinetGroup(group, asset.cabinet).assets.push(asset);
    else group.loose.push(asset);
  }
  if (includeEmpty && options) {
    for (const cabinet of options.cabinets) {
      if (customerId && String(cabinet.customerId) !== customerId) continue;
      const customer = options.customers.find((item) => item.id === cabinet.customerId);
      if (customer) cabinetGroup(customerGroup(customer), cabinet);
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  for (const group of groups.values()) group.cabinets.sort((a, b) => byName(a.cabinet?.name ?? "", b.cabinet?.name ?? ""));
  return [...groups.values()].sort((a, b) => byName(a.customer.name, b.customer.name));
}

/** Customer equipment and software: what is installed where, its warranty and its history. */
export function InstalledBaseScreen({ canManage, canSeeCredentials, notify }: { canManage: boolean; canSeeCredentials: boolean; notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric" }), [lang]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [warranty, setWarranty] = useState("");
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listAssets>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AssetOptions | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<AssetTarget | null>(null);
  const [cabinetEditing, setCabinetEditing] = useState<CabinetTarget | null>(null);
  const pageSize = layout === "grouped" ? GROUPED_PAGE_SIZE : PAGE_SIZE;

  useEffect(() => {
    let active = true;
    getAssetOptions().then((value) => { if (active) setOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [revision]);

  const query = search.trim();
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      listAssets({
        page, pageSize, search: query || undefined, customerId: customerId ? Number(customerId) : undefined,
        category: category ?? undefined, status: status ?? undefined, warranty: warranty || undefined,
        sort: layout === "grouped" ? "location" : undefined,
      })
        .then((value) => { if (active) { setResult(value); setError(null); } })
        .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    }, query ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, pageSize, query, customerId, category, status, warranty, layout, revision]);

  const reset = (apply: () => void) => { apply(); setPage(1); };
  const changeLayout = (next: Layout) => { writeLayout(next); reset(() => setLayout(next)); };
  const statusChips: FilterItem[] = STATUSES.map((value) => ({ key: value, label: statusKey(value), value: result?.facets.status[value] ?? 0, tone: STATUS_TONE[value] }));
  const categoryChips: FilterItem[] = CATEGORIES
    .map((value) => ({ key: value, label: categoryKey(value), value: result?.facets.category[value] ?? 0, tone: "blue" as Tone }))
    .filter((item) => item.value > 0 || item.key === category);
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const narrowed = Boolean(query || status || category || warranty);
  // Empty cabinets only make sense beside the whole register; under a filter they would read as matches.
  const groups = result && layout === "grouped" ? groupAssets(result.items, options, customerId, !narrowed && total <= pageSize) : [];
  const nothing = !result || (layout === "grouped" ? groups.length === 0 : result.items.length === 0);
  const refresh = () => setRevision((value) => value + 1);

  return (
    <div className="stack installed-base">
      <PageHeader title="Installed Base" subtitle="Assets.subtitle"
        actions={canManage ? <>
          <button className="btn default" type="button" disabled={!options || options.customers.length === 0}
            onClick={() => setCabinetEditing({ preset: { customerId: Number(customerId) || options?.customers[0]?.id || 0 } })}>
            <Icon name="grid" /><LocalizedText text={"Assets.newCabinet"} />
          </button>
          <button className="btn primary" type="button" onClick={() => setEditing({ preset: customerId ? { customerId: Number(customerId) } : {} })}>
            <Icon name="plus" /><LocalizedText text={"Assets.new"} />
          </button>
        </> : undefined} />

      <Toolbar>
        <div className="seg-control" role="group" aria-label={t("Assets.layout")}>
          <button type="button" className={layout === "grouped" ? "on" : ""} aria-pressed={layout === "grouped"} onClick={() => changeLayout("grouped")}>
            <LocalizedText text={"Assets.layoutGrouped"} />
          </button>
          <button type="button" className={layout === "table" ? "on" : ""} aria-pressed={layout === "table"} onClick={() => changeLayout("table")}>
            <LocalizedText text={"Assets.layoutTable"} />
          </button>
        </div>
        <SearchInput value={search} onChange={(value) => reset(() => setSearch(value))} placeholder="Assets.search" />
        <label className="select-field">
          <span className="sr-only">{t("Assets.customer")}</span>
          <select value={customerId} onChange={(event) => reset(() => setCustomerId(event.target.value))}>
            <option value="">{t("Assets.allCustomers")}</option>
            {(options?.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="select-field">
          <span className="sr-only">{t("Assets.warranty")}</span>
          <select value={warranty} onChange={(event) => reset(() => setWarranty(event.target.value))}>
            <option value="">{t("Assets.anyWarranty")}</option>
            {(["expired", "expiring", "covered", "none"] as AssetWarranty[]).map((value) => <option key={value} value={value}>{t(WARRANTY_KEY[value])}</option>)}
          </select>
        </label>
      </Toolbar>
      <div className="installed-base-filters">
        <FilterChips items={statusChips} active={status} onPick={(key) => reset(() => setStatus(key))} label="Assets.status" />
        {categoryChips.length > 0 ? <FilterChips items={categoryChips} active={category} onPick={(key) => reset(() => setCategory(key))} label="Assets.category" /> : null}
      </div>

      {error ? (
        <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
          action={<button className="btn default" type="button" onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} /></Panel>
      ) : !result ? (
        <Panel><EmptyState icon="clock" title="Loading…" message="Assets.loading" /></Panel>
      ) : nothing ? (
        <Panel><EmptyState icon="cpu" title={total === 0 && !query && !customerId && !status && !category && !warranty ? "Assets.emptyTitle" : "Assets.noMatchTitle"}
          message={canManage ? "Assets.emptyManage" : "Assets.emptyMessage"} /></Panel>
      ) : layout === "grouped" ? (
        <>
          {groups.map((group) => {
            const count = group.cabinets.reduce((sum, item) => sum + item.assets.length, 0) + group.loose.length;
            return (
              <section className="panel asset-customer" key={group.customer.id}>
                <div className="panel-head asset-customer-head">
                  <div>
                    <h2><Icon name="users" /> {group.customer.name}{group.customer.code ? <span className="asset-customer-code">{group.customer.code}</span> : null}</h2>
                    <p>{group.cabinets.length} <LocalizedText text={"Assets.cabinets"} /> · {count} <LocalizedText text={"Assets.items"} /></p>
                  </div>
                  {canManage ? (
                    <button className="btn default sm" type="button" onClick={() => setCabinetEditing({ preset: { customerId: group.customer.id } })}>
                      <Icon name="plus" /><LocalizedText text={"Assets.newCabinet"} />
                    </button>
                  ) : null}
                </div>
                <div className="panel-body asset-cabinets">
                  {group.cabinets.map((item) => (
                    <CabinetSection key={item.key} cabinet={item.cabinet} assets={item.assets} canManage={canManage} dateFormat={dateFormat}
                      onOpen={setOpenId}
                      onAdd={() => setEditing({ preset: {
                        customerId: group.customer.id, cabinetId: item.cabinet?.id ?? null,
                        customerSiteId: item.cabinet && "customerSite" in item.cabinet ? item.cabinet.customerSite?.id ?? null : null,
                      } })}
                      onEdit={item.cabinet && "rowVersion" in item.cabinet ? () => setCabinetEditing(item.cabinet as AssetCabinet) : undefined} />
                  ))}
                  {group.loose.length > 0 ? (
                    <CabinetSection cabinet={null} assets={group.loose} canManage={canManage} dateFormat={dateFormat} onOpen={setOpenId}
                      onAdd={() => setEditing({ preset: { customerId: group.customer.id, cabinetId: null } })} />
                  ) : null}
                </div>
              </section>
            );
          })}
          {total > pageSize ? (
            <Pagination page={page} pageCount={pageCount} from={(page - 1) * pageSize + 1} to={Math.min(page * pageSize, total)} total={total} onPage={setPage} />
          ) : null}
        </>
      ) : (
        <section className="panel">
          <div className="panel-body flush">
            <AssetTable assets={result.items} showCustomer dateFormat={dateFormat} onOpen={setOpenId} />
            {total > pageSize ? (
              <Pagination page={page} pageCount={pageCount} from={(page - 1) * pageSize + 1} to={Math.min(page * pageSize, total)} total={total} onPage={setPage} />
            ) : null}
          </div>
        </section>
      )}

      {openId !== null ? (
        <AssetDrawer id={openId} revision={revision} dateFormat={dateFormat} notify={notify} canSeeCredentials={canSeeCredentials}
          onClose={() => setOpenId(null)}
          onEdit={(asset) => setEditing(asset)}
          onChanged={refresh} />
      ) : null}
      {editing !== null && options ? (
        <AssetEditor asset={"preset" in editing ? null : editing} preset={"preset" in editing ? editing.preset : {}} options={options} notify={notify}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); setOpenId(saved.id); refresh(); }} />
      ) : null}
      {cabinetEditing !== null && options ? (
        <CabinetEditor cabinet={"preset" in cabinetEditing ? null : cabinetEditing} preset={"preset" in cabinetEditing ? cabinetEditing.preset : null}
          options={options} notify={notify} onClose={() => setCabinetEditing(null)}
          onSaved={() => { setCabinetEditing(null); refresh(); }} />
      ) : null}
    </div>
  );
}

/** One cabinet of a customer (or the customer's equipment outside any cabinet), folded open by default. */
function CabinetSection({ cabinet, assets, canManage, dateFormat, onOpen, onAdd, onEdit }: {
  cabinet: CabinetGroup["cabinet"]; assets: InstalledAsset[]; canManage: boolean; dateFormat: Intl.DateTimeFormat;
  onOpen: (id: number) => void; onAdd: () => void; onEdit?: () => void;
}) {
  const t = useT();
  const full = cabinet && "rowVersion" in cabinet ? cabinet : null;
  const where = [full?.customerSite?.name, full?.locationDetail].filter(Boolean).join(" · ");
  // Buttons sit in the <summary>; without this a click would also fold the cabinet.
  const act = (event: React.MouseEvent, run: () => void) => { event.preventDefault(); event.stopPropagation(); run(); };
  return (
    <details className={`asset-cabinet${cabinet ? "" : " loose"}`} open>
      <summary>
        <Icon name="chevronDown" className="asset-cabinet-chevron" />
        <Icon name={cabinet ? "grid" : "package"} />
        <span className="asset-cabinet-title">
          <strong>{cabinet ? cabinet.name : t("Assets.noCabinet")}</strong>
          {where ? <span>{where}</span> : null}
        </span>
        <span className="asset-cabinet-count">{assets.length} <LocalizedText text={"Assets.items"} /></span>
        {canManage ? (
          <span className="asset-cabinet-actions">
            <button className="btn default sm" type="button" onClick={(event) => act(event, onAdd)}>
              <Icon name="plus" /><LocalizedText text={cabinet ? "Assets.addToCabinet" : "Assets.new"} />
            </button>
            {onEdit ? (
              <button className="icon-btn" type="button" aria-label={t("Assets.editCabinet")} title={t("Assets.editCabinet")} onClick={(event) => act(event, onEdit)}>
                <Icon name="edit" />
              </button>
            ) : null}
          </span>
        ) : null}
      </summary>
      {assets.length > 0
        ? <AssetTable assets={assets} showCustomer={false} dateFormat={dateFormat} onOpen={onOpen} />
        : <p className="asset-cabinet-empty"><LocalizedText text={"Assets.cabinetEmpty"} /></p>}
    </details>
  );
}

function AssetTable({ assets, showCustomer, dateFormat, onOpen }: {
  assets: InstalledAsset[]; showCustomer: boolean; dateFormat: Intl.DateTimeFormat; onOpen: (id: number) => void;
}) {
  const t = useT();
  return (
    <div className="table-wrap">
      <table className={`grid installed-base-table${showCustomer ? "" : " compact"}`}>
        <colgroup>
          <col />{showCustomer ? <col style={{ width: 220 }} /> : null}<col style={{ width: 200 }} /><col style={{ width: 140 }} />
          <col style={{ width: 110 }} /><col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th><LocalizedText text={"Assets.asset"} /></th>
            {showCustomer ? <th><LocalizedText text={"Assets.customer"} /></th> : null}
            <th><LocalizedText text={"Assets.modelSerial"} /></th>
            <th><LocalizedText text={"Assets.version"} /></th>
            <th><LocalizedText text={"Assets.status"} /></th>
            <th><LocalizedText text={"Assets.warranty"} /></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const where = [asset.cabinet?.name, asset.customerSite?.name, asset.locationDetail].filter(Boolean).join(" · ");
            return (
              <tr key={asset.id} className="clickable" onClick={() => onOpen(asset.id)}>
                <td>
                  <div className="cell-primary">
                    <strong title={asset.name}>
                      {asset.monitorProgram ? <i className={`asset-live ${asset.monitorProgram.isRunning ? "on" : "off"}`} aria-hidden="true" /> : null}
                      {asset.name}
                    </strong>
                    <span><span className="mono">{asset.assetNo}</span> · {t(categoryKey(asset.category))}{asset.ipAddress ? ` · ${asset.ipAddress}` : ""}</span>
                  </div>
                </td>
                {showCustomer ? (
                  <td>
                    <div className="cell-primary">
                      <span title={asset.customer.name}>{asset.customer.name}</span>
                      <span title={where}>{where || "—"}</span>
                    </div>
                  </td>
                ) : null}
                <td>
                  <div className="cell-primary">
                    <span title={[asset.manufacturer, asset.model].filter(Boolean).join(" ")}>{[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "—"}</span>
                    <span className="mono" title={asset.serialNo}>{asset.serialNo || "—"}</span>
                  </div>
                </td>
                <td><span className="mono" title={asset.firmwareVersion}>{asset.firmwareVersion || "—"}</span></td>
                <td><Badge tone={STATUS_TONE[asset.status]}><LocalizedText text={statusKey(asset.status)} /></Badge></td>
                <td>
                  {asset.warrantyUntil ? (
                    <div className="cell-primary">
                      <span>{dateFormat.format(new Date(`${asset.warrantyUntil}T00:00:00`))}</span>
                      {asset.warranty !== "covered" ? <span><Badge tone={WARRANTY_TONE[asset.warranty]}><LocalizedText text={WARRANTY_KEY[asset.warranty]} /></Badge></span> : null}
                    </div>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CabinetEditor({ cabinet, preset, options, notify, onClose, onSaved }: {
  cabinet: AssetCabinet | null; preset: { customerId: number } | null; options: AssetOptions; notify: Notify; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState<AssetCabinetInput>(() => (cabinet
    ? { customerId: cabinet.customerId, customerSiteId: cabinet.customerSite?.id ?? null, name: cabinet.name, locationDetail: cabinet.locationDetail, notes: cabinet.notes }
    : { customerId: preset?.customerId || options.customers[0]?.id || 0, customerSiteId: null, name: "", locationDetail: "", notes: "" }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AssetCabinetInput>(key: K, next: AssetCabinetInput[K]) => setValue((current) => ({ ...current, [key]: next }));
  const sites = options.customerSites.filter((site) => site.customerId === value.customerId);
  // Its equipment belongs to its customer: a cabinet with equipment stays with that customer.
  const customerLocked = Boolean(cabinet && cabinet.assetCount > 0);
  const valid = value.customerId > 0 && value.name.trim().length > 0;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); onSaved(); } catch (reason) { notify(errorText(reason)); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (cabinet) await updateAssetCabinet(cabinet.id, { ...value, rowVersion: cabinet.rowVersion });
    else await createAssetCabinet(value);
    notify(t(cabinet ? "Assets.cabinetSaved" : "Assets.cabinetCreated"));
  });
  const remove = () => {
    if (!cabinet || !window.confirm(t("Assets.cabinetDeleteConfirm").replace("{name}", cabinet.name))) return;
    void run(async () => { await deleteAssetCabinet(cabinet.id); notify(t("Assets.cabinetDeleted")); });
  };

  return (
    <Modal title={cabinet ? "Assets.editCabinet" : "Assets.newCabinet"} subtitle={cabinet ? undefined : "Assets.newCabinetHint"} onClose={onClose}
      footer={<>
        {cabinet ? (
          <button className="btn danger" type="button" disabled={busy || cabinet.assetCount > 0} title={cabinet.assetCount > 0 ? t("Assets.cabinetNotEmpty") : undefined} onClick={remove}>
            <Icon name="trash" /><LocalizedText text={"Assets.deleteCabinet"} />
          </button>
        ) : null}
        <span className="spacer" />
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={!valid || busy} onClick={() => void save()}><Icon name="check" /><LocalizedText text={"Save"} /></button>
      </>}>
      <div className="form-grid two">
        <Field label="Assets.cabinetName" hint="Assets.cabinetNameHint" span={2}>
          <input value={value.name} maxLength={200} onChange={(event) => set("name", event.target.value)} placeholder="MDB-01" />
        </Field>
        <Field label="Assets.customer" hint={customerLocked ? "Assets.cabinetCustomerLocked" : undefined} span={2}>
          <select value={value.customerId || ""} disabled={customerLocked}
            onChange={(event) => setValue((current) => ({ ...current, customerId: Number(event.target.value), customerSiteId: null }))}>
            {options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </Field>
        <Field label="Assets.customerSite" span={2}>
          <select value={value.customerSiteId ?? ""} onChange={(event) => set("customerSiteId", event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("Assets.noSite")}</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </Field>
        <Field label="Assets.location" span={2}>
          <input value={value.locationDetail} maxLength={300} onChange={(event) => set("locationDetail", event.target.value)} placeholder={t("Assets.cabinetLocationPlaceholder")} />
        </Field>
        <Field label="Assets.notes" span={2}>
          <textarea rows={2} maxLength={1000} value={value.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AssetDrawer({ id, revision, dateFormat, notify, canSeeCredentials, onClose, onEdit, onChanged }: {
  id: number; revision: number; dateFormat: Intl.DateTimeFormat; notify: Notify; canSeeCredentials: boolean;
  onClose: () => void; onEdit: (asset: InstalledAsset) => void; onChanged: () => void;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), [lang]);
  const [detail, setDetail] = useState<InstalledAssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"Note" | "Serviced">("Note");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    let active = true;
    getAsset(id)
      .then((value) => { if (active) { setDetail(value); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [id, revision, local]);

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await addAssetEvent(id, noteKind, note.trim());
      setNote("");
      setLocal((value) => value + 1);
      onChanged();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!detail || !window.confirm(t("Assets.deleteConfirm").replace("{name}", `${detail.assetNo} ${detail.name}`))) return;
    setBusy(true);
    try {
      await deleteAsset(id);
      notify(t("Assets.deleted"));
      onChanged();
      onClose();
    } catch (reason) {
      notify(errorText(reason));
      setBusy(false);
    }
  };
  const date = (value: string | null) => (value ? dateFormat.format(new Date(`${value}T00:00:00`)) : "—");

  return (
    <Drawer title={detail ? `${detail.assetNo} · ${detail.name}` : "Installed Base"} subtitle={detail ? detail.customer.name : undefined} onClose={onClose} width={640}
      footer={detail?.canManage ? (
        <>
          <button className="btn danger" type="button" disabled={busy} onClick={() => void remove()}><Icon name="trash" /><LocalizedText text={"Assets.delete"} /></button>
          <span className="spacer" />
          <button className="btn primary" type="button" disabled={busy} onClick={() => onEdit(detail)}><Icon name="edit" /><LocalizedText text={"Edit"} /></button>
        </>
      ) : undefined}>
      {error ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : !detail ? <EmptyState icon="clock" title="Loading…" message="Assets.loading" />
        : (
          <div className="stack asset-detail">
            <div className="asset-detail-badges">
              <Badge tone={STATUS_TONE[detail.status]}><LocalizedText text={statusKey(detail.status)} /></Badge>
              <Badge tone="blue"><LocalizedText text={categoryKey(detail.category)} /></Badge>
              {detail.warrantyUntil ? <Badge tone={WARRANTY_TONE[detail.warranty]}><LocalizedText text={WARRANTY_KEY[detail.warranty]} /></Badge> : null}
              {detail.monitorProgram ? (
                <Badge tone={detail.monitorProgram.isRunning ? "green" : "red"} dot>
                  {detail.monitorProgram.name} · <LocalizedText text={detail.monitorProgram.isRunning ? "Assets.running" : "Assets.stopped"} />
                </Badge>
              ) : null}
            </div>
            <dl className="asset-facts">
              <dt><LocalizedText text={"Assets.customer"} /></dt><dd>{detail.customer.name}{detail.customerSite ? ` · ${detail.customerSite.name}` : ""}</dd>
              <dt><LocalizedText text={"Assets.cabinet"} /></dt><dd>{detail.cabinet?.name || t("Assets.noCabinet")}</dd>
              <dt><LocalizedText text={"Assets.location"} /></dt><dd>{detail.locationDetail || "—"}</dd>
              <dt><LocalizedText text={"Assets.project"} /></dt><dd>{detail.project ? `${detail.project.projectNo} · ${detail.project.name}` : "—"}</dd>
              <dt><LocalizedText text={"Assets.manufacturerModel"} /></dt><dd>{[detail.manufacturer, detail.model].filter(Boolean).join(" ") || "—"}</dd>
              <dt><LocalizedText text={"Assets.serial"} /></dt><dd className="mono">{detail.serialNo || "—"}</dd>
              <dt><LocalizedText text={"Assets.ip"} /></dt><dd className="mono">{detail.ipAddress || "—"}</dd>
              <dt><LocalizedText text={"Assets.version"} /></dt><dd className="mono">{detail.firmwareVersion || "—"}</dd>
              <dt><LocalizedText text={"Assets.repository"} /></dt><dd className="mono">{detail.repository || "—"}</dd>
              <dt><LocalizedText text={"Assets.monitor"} /></dt>
              <dd>{detail.monitorSite ? `${detail.monitorSite.name}${detail.monitorProgram ? ` · ${detail.monitorProgram.name}` : ""}` : "—"}</dd>
              <dt><LocalizedText text={"Assets.installedOn"} /></dt><dd>{date(detail.installedOn)}</dd>
              <dt><LocalizedText text={"Assets.warrantyUntil"} /></dt><dd>{date(detail.warrantyUntil)}</dd>
              {detail.replacedBy ? <><dt><LocalizedText text={"Assets.replacedBy"} /></dt><dd className="mono">{detail.replacedBy.assetNo}</dd></> : null}
              <dt><LocalizedText text={"Assets.notes"} /></dt><dd className="asset-notes">{detail.notes || "—"}</dd>
            </dl>

            {canSeeCredentials ? <AssetCredentials asset={detail} notify={notify} /> : null}

            <section>
              <h3 className="asset-section-title"><LocalizedText text={"Assets.timeline"} /></h3>
              {detail.canManage ? (
                <div className="asset-note-form">
                  <select value={noteKind} onChange={(event) => setNoteKind(event.target.value as "Note" | "Serviced")} aria-label={t("Assets.eventKind")}>
                    <option value="Note">{t(eventKey("Note"))}</option>
                    <option value="Serviced">{t(eventKey("Serviced"))}</option>
                  </select>
                  <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={t("Assets.notePlaceholder")}
                    onKeyDown={(event) => { if (event.key === "Enter") void saveNote(); }} />
                  <button className="btn default" type="button" disabled={busy || !note.trim()} onClick={() => void saveNote()}><Icon name="plus" /><LocalizedText text={"Assets.addNote"} /></button>
                </div>
              ) : null}
              <ul className="asset-timeline">
                {detail.events.map((event) => (
                  <li key={event.id}>
                    <Badge tone={EVENT_TONE[event.kind] ?? "slate"}><LocalizedText text={eventKey(event.kind)} /></Badge>
                    <div>
                      <strong>{event.summary}</strong>
                      <span>{event.actor ?? t("Assets.system")} · {timeFormat.format(new Date(event.occurredAt))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
    </Drawer>
  );
}

function emptyInput(options: AssetOptions, preset: Partial<AssetInput>): AssetInput {
  return {
    customerId: options.customers[0]?.id ?? 0, customerSiteId: null, cabinetId: null, projectId: null, monitorSiteId: null, monitorProgramId: null,
    category: "Gateway", name: "", manufacturer: "", model: "", serialNo: "", locationDetail: "", ipAddress: "", firmwareVersion: "",
    repository: "", installedOn: null, warrantyUntil: null, status: "Active", replacedById: null, notes: "",
    ...preset,
  };
}

function inputOf(asset: InstalledAsset): AssetInput {
  return {
    customerId: asset.customer.id, customerSiteId: asset.customerSite?.id ?? null, cabinetId: asset.cabinet?.id ?? null,
    projectId: asset.project?.id ?? null,
    monitorSiteId: asset.monitorSite?.id ?? null, monitorProgramId: asset.monitorProgram?.id ?? null, category: asset.category,
    name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNo: asset.serialNo, locationDetail: asset.locationDetail,
    ipAddress: asset.ipAddress, firmwareVersion: asset.firmwareVersion, repository: asset.repository, installedOn: asset.installedOn,
    warrantyUntil: asset.warrantyUntil, status: asset.status, replacedById: asset.replacedBy?.id ?? null, notes: asset.notes,
  };
}

function AssetEditor({ asset, preset, options, notify, onClose, onSaved }: {
  asset: InstalledAsset | null; preset: Partial<AssetInput>; options: AssetOptions; notify: Notify; onClose: () => void; onSaved: (asset: InstalledAsset) => void;
}) {
  const t = useT();
  const [value, setValue] = useState<AssetInput>(() => (asset ? inputOf(asset) : emptyInput(options, preset)));
  const [project, setProject] = useState<{ id: number; label: string } | null>(asset?.project ? { id: asset.project.id, label: `${asset.project.projectNo} · ${asset.project.name}` } : null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AssetInput>(key: K, next: AssetInput[K]) => setValue((current) => ({ ...current, [key]: next }));

  useEffect(() => {
    if (!projectSearch.trim()) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      listProjects({ page: 1, pageSize: 20, search: projectSearch.trim() })
        .then((result) => { if (active) setProjectOptions(result.items); })
        .catch(() => { if (active) setProjectOptions([]); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [projectSearch]);

  const sites = options.customerSites.filter((site) => site.customerId === value.customerId);
  // A cabinet of this customer, at the chosen site or not tied to one.
  const cabinets = options.cabinets.filter((cabinet) => cabinet.customerId === value.customerId
    && (!value.customerSiteId || !cabinet.customerSite || cabinet.customerSite.id === value.customerSiteId));
  const chooseCabinet = (id: number | null) => {
    const cabinet = options.cabinets.find((item) => item.id === id);
    setValue((current) => ({ ...current, cabinetId: id, customerSiteId: cabinet?.customerSite?.id ?? current.customerSiteId }));
  };
  const chooseSite = (id: number | null) => setValue((current) => {
    const cabinet = options.cabinets.find((item) => item.id === current.cabinetId);
    const fits = !cabinet || !cabinet.customerSite || !id || cabinet.customerSite.id === id;
    return { ...current, customerSiteId: id, cabinetId: fits ? current.cabinetId : null };
  });
  const programs = options.monitorPrograms.filter((program) => program.siteId === value.monitorSiteId);
  const valid = value.customerId > 0 && value.name.trim().length > 0
    && (!value.installedOn || !value.warrantyUntil || value.warrantyUntil >= value.installedOn)
    && (!value.repository || /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value.repository));

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const input = { ...value, projectId: project?.id ?? null, replacedById: value.status === "Replaced" ? value.replacedById : null };
      const saved = asset ? await updateAsset(asset.id, { ...input, rowVersion: asset.rowVersion }) : await createAsset(input);
      notify(t(asset ? "Assets.saved" : "Assets.created"));
      onSaved(saved);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={asset ? "Assets.edit" : "Assets.new"} subtitle={asset ? asset.assetNo : "Assets.newHint"} size="lg" onClose={onClose}
      footer={<>
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={!valid || busy} onClick={() => void save()}><Icon name="check" /><LocalizedText text={"Save"} /></button>
      </>}>
      <div className="form-grid">
        <Field label="Assets.name" span={2}>
          <input value={value.name} maxLength={200} onChange={(event) => set("name", event.target.value)} placeholder="Edge Gateway — Line 3" />
        </Field>
        <Field label="Assets.category">
          <select value={value.category} onChange={(event) => set("category", event.target.value as AssetCategory)}>
            {CATEGORIES.map((item) => <option key={item} value={item}>{t(categoryKey(item))}</option>)}
          </select>
        </Field>
        <Field label="Assets.status">
          <select value={value.status} onChange={(event) => set("status", event.target.value as AssetStatus)}>
            {STATUSES.map((item) => <option key={item} value={item}>{t(statusKey(item))}</option>)}
          </select>
        </Field>

        <Field label="Assets.customer" span={2}>
          <select value={value.customerId || ""} onChange={(event) => setValue((current) => ({ ...current, customerId: Number(event.target.value), customerSiteId: null, cabinetId: null }))}>
            {options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </Field>
        <Field label="Assets.customerSite" span={2}>
          <select value={value.customerSiteId ?? ""} onChange={(event) => chooseSite(event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("Assets.noSite")}</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </Field>
        <Field label="Assets.cabinet" hint={cabinets.length === 0 ? "Assets.noCabinetsYet" : undefined} span={2}>
          <select value={value.cabinetId ?? ""} onChange={(event) => chooseCabinet(event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("Assets.noCabinet")}</option>
            {cabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinet.name}{cabinet.customerSite ? ` · ${cabinet.customerSite.name}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Assets.location" hint="Assets.locationHint" span={2}>
          <input value={value.locationDetail} maxLength={300} onChange={(event) => set("locationDetail", event.target.value)} />
        </Field>
        <Field label="Assets.project" span={2}>
          <div className="asset-project-picker">
            {project ? (
              <div className="asset-project-chosen"><span>{project.label}</span>
                <button className="icon-btn" type="button" aria-label={t("Assets.clearProject")} onClick={() => setProject(null)}><Icon name="x" /></button>
              </div>
            ) : (
              <>
                <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder={t("Assets.projectSearch")} />
                {projectSearch.trim() && projectOptions.length > 0 ? (
                  <ul className="asset-project-options">
                    {projectOptions.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => { setProject({ id: item.id, label: `${item.number} · ${item.name}` }); setProjectSearch(""); }}>
                          <span className="mono">{item.number}</span> {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </Field>

        <Field label="Assets.manufacturer"><input value={value.manufacturer} maxLength={150} onChange={(event) => set("manufacturer", event.target.value)} /></Field>
        <Field label="Assets.model"><input value={value.model} maxLength={150} onChange={(event) => set("model", event.target.value)} /></Field>
        <Field label="Assets.serial"><input value={value.serialNo} maxLength={150} onChange={(event) => set("serialNo", event.target.value)} /></Field>
        <Field label="Assets.ip"><input value={value.ipAddress} maxLength={100} onChange={(event) => set("ipAddress", event.target.value)} placeholder="192.168.1.10" /></Field>
        <Field label="Assets.version"><input value={value.firmwareVersion} maxLength={100} onChange={(event) => set("firmwareVersion", event.target.value)} /></Field>
        <Field label="Assets.repository" hint="Assets.repositoryHint">
          <input value={value.repository} maxLength={100} onChange={(event) => set("repository", event.target.value.trim())} placeholder="fts-plc-collect-data" />
        </Field>
        <Field label="Assets.installedOn"><input type="date" value={value.installedOn ?? ""} onChange={(event) => set("installedOn", event.target.value || null)} /></Field>
        <Field label="Assets.warrantyUntil"><input type="date" value={value.warrantyUntil ?? ""} min={value.installedOn ?? undefined} onChange={(event) => set("warrantyUntil", event.target.value || null)} /></Field>

        <Field label="Assets.monitorSite" span={2}>
          <select value={value.monitorSiteId ?? ""} onChange={(event) => setValue((current) => ({ ...current, monitorSiteId: event.target.value ? Number(event.target.value) : null, monitorProgramId: null }))}>
            <option value="">{t("Assets.notMonitored")}</option>
            {options.monitorSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </Field>
        <Field label="Assets.monitorProgram" hint="Assets.monitorProgramHint" span={2}>
          <select value={value.monitorProgramId ?? ""} disabled={!value.monitorSiteId} onChange={(event) => set("monitorProgramId", event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("Assets.noProgram")}</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name} · {program.agentName}</option>)}
          </select>
        </Field>
        <Field label="Assets.notes" span={4}>
          <textarea rows={3} maxLength={2000} value={value.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
