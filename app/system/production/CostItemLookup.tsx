"use client";
import { useEffect, useId, useLayoutEffect, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lookupCostItems, type BootstrapData, type CostItemLookupField, type CostItemLookupRecord } from "../api-client";
import { currentLocale } from "../i18n";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import { costItemPatchFromLookup, filterSuppliers, lookupQueryReady, matchSupplierExactly, type CostItemLookupPatch } from "../../../lib/cost-item-lookup";
import { Icon } from "../ui";

/* Search-as-you-type for the cost item form. Typing in Item code, Description
   or Brand asks the API for parts we have priced before (every estimate plus the
   imported purchase history) and a pick fills the whole line — code, text,
   brand/model, supplier, unit, last unit cost and the reference — exactly like
   "Use price" in the Price Library, without leaving the row. The Supplier box
   filters the bootstrap supplier list the same way.

   The menu is rendered through a portal because both hosts clip: the sheet
   cell hides overflow and the modal body scrolls. Enter/Escape stop bubbling
   only while the menu is open, so the quick row still saves on Enter and
   cancels on Escape once the list is closed. */

const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const shortDate = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(parsed);
};

const LOOKUP_DEBOUNCE_MS = 220;
const LOOKUP_LIMIT = 12;
const MENU_MAX_HEIGHT = 340;
const lookupCache = new Map<string, CostItemLookupRecord[]>();

/* ── anchored menu ─────────────────────────────────────────────────────── */

/** Fixed-position style that hangs the menu under the anchor, or above it when the viewport runs out. */
function placeUnder(anchor: HTMLElement | null, minWidth: number): CSSProperties | null {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(rect.width, minWidth);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom;
  const flip = spaceBelow < Math.min(MENU_MAX_HEIGHT, 220) && rect.top > spaceBelow;
  return flip
    ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, rect.top - 12) }
    : { left, width, top: rect.bottom + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, spaceBelow - 12) };
}

/* Mounted only while open; the anchor arrives as state (callback ref on the
   input), so the first position is measured on mount and only scroll/resize
   (plus one settle frame) re-measure. */
function LookupMenu({ id, anchor, minWidth, label, children }: { id: string; anchor: HTMLElement | null; minWidth: number; label: string; children: ReactNode }) {
  const [style, setStyle] = useState<CSSProperties | null>(() => placeUnder(anchor, minWidth));
  useLayoutEffect(() => {
    const place = () => setStyle(placeUnder(anchor, minWidth));
    const frame = window.requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor, minWidth]);
  if (!style || typeof document === "undefined") return null;
  /* mousedown is swallowed so the input keeps focus (and the menu stays) until the click lands. */
  return createPortal(<div id={id} className="lookup-menu" role="listbox" tabIndex={-1} aria-label={label} style={style} onMouseDown={(event) => event.preventDefault()}>{children}</div>, document.body);
}

type MenuKeys = { open: boolean; count: number; active: number; setActive: (index: number) => void; pick: (index: number) => void; close: () => void; show: () => void };

/** Shared arrow/Enter/Escape handling. Returns true when the key was consumed by the menu. */
function handleMenuKeys(event: KeyboardEvent<HTMLInputElement>, keys: MenuKeys): boolean {
  if (event.nativeEvent.isComposing) return false;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!keys.open) { keys.show(); return true; }
    if (keys.count) keys.setActive((keys.active + 1) % keys.count);
    return true;
  }
  if (event.key === "ArrowUp") {
    if (!keys.open) return false;
    event.preventDefault();
    if (keys.count) keys.setActive((keys.active - 1 + keys.count) % keys.count);
    return true;
  }
  if (event.key === "Enter" && keys.open && keys.count) {
    event.preventDefault();
    event.stopPropagation();
    keys.pick(keys.active);
    return true;
  }
  if (event.key === "Escape" && keys.open) {
    event.preventDefault();
    event.stopPropagation();
    keys.close();
    return true;
  }
  if (event.key === "Tab" && keys.open) keys.close();
  return false;
}

/* ── cost item type-ahead ──────────────────────────────────────────────── */

type LookupResult = { key: string; items: CostItemLookupRecord[]; error: boolean };

const textOfField = (patch: CostItemLookupPatch, field: CostItemLookupField) => field === "itemCode" ? patch.itemCode : field === "brand" ? patch.brand : patch.description;

export function CostItemLookupInput({ field, value, onChange, onPick, suppliers, inputRef, onKeyDown, onFocus, onBlur, ...inputProps }: {
  field: Exclude<CostItemLookupField, "supplier">;
  value: string;
  onChange: (text: string) => void;
  onPick: (patch: CostItemLookupPatch, record: CostItemLookupRecord) => void;
  suppliers: BootstrapData["suppliers"];
  /** Callback ref for callers that need to focus the input (the quick row focuses Item code on open). */
  inputRef?: (node: HTMLInputElement | null) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">) {
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [activeState, setActiveState] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const query = value.trim();
  const cacheKey = `${field}|${query.toLocaleLowerCase()}`;
  const ready = lookupQueryReady(value);
  const wanted = focused && ready && dismissedFor !== value;

  /* Cached queries are answered during render; only a miss schedules a debounced request. */
  const cached = wanted ? lookupCache.get(cacheKey) : undefined;
  useEffect(() => {
    if (!wanted || lookupCache.has(cacheKey)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingKey(cacheKey);
      lookupCostItems({ q: query, field, limit: LOOKUP_LIMIT }, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          if (lookupCache.size > 200) lookupCache.clear();
          lookupCache.set(cacheKey, response.items);
          setResult({ key: cacheKey, items: response.items, error: false });
        })
        .catch(() => { if (!controller.signal.aborted) setResult({ key: cacheKey, items: [], error: true }); })
        .finally(() => { if (!controller.signal.aborted) setLoadingKey((current) => current === cacheKey ? null : current); });
    }, LOOKUP_DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [wanted, cacheKey, query, field]);

  const loading = wanted && !cached && loadingKey === cacheKey;
  const items = cached ?? (result?.key === cacheKey ? result.items : []);
  const settled = Boolean(cached) || (result?.key === cacheKey && !loading);
  const open = wanted && (loading || settled);
  /* The highlighted row is keyed on the query, so a new query starts at the top without an effect. */
  const active = activeState.key === cacheKey ? activeState.index : 0;
  const setActive = (index: number) => setActiveState({ key: cacheKey, index });

  const pick = (index: number) => {
    const record = items[index];
    if (!record) return;
    const patch = costItemPatchFromLookup(record, suppliers);
    setDismissedFor(textOfField(patch, field));
    onPick(patch, record);
  };
  const keys: MenuKeys = { open, count: items.length, active, setActive, pick, close: () => setDismissedFor(value), show: () => setDismissedFor(null) };
  const kindLabel = (kind: CostItemLookupRecord["sourceKind"]) => kind === "Estimate" ? copy("Estimate เดิม", "Past estimate", "過去見積") : copy("ซื้อจริง", "Purchased", "購入実績");

  return <>
    <input
      {...inputProps}
      ref={(node) => { setAnchor(node); inputRef?.(node); }}
      value={value}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      autoComplete="off"
      onChange={(event) => { setDismissedFor(null); onChange(event.target.value); }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      onKeyDown={(event) => { if (!handleMenuKeys(event, keys)) onKeyDown?.(event); }}
    />
    {open ? <LookupMenu id={menuId} anchor={anchor} minWidth={420} label={copy("รายการที่เคยประเมิน", "Previously priced items", "過去の見積項目")}>
      {items.map((item, index) => <button type="button" key={item.key} role="option" tabIndex={-1} aria-selected={index === active} className={`lookup-option${index === active ? " active" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => pick(index)}>
        <div className="lookup-main"><strong className="mono">{item.itemCode}</strong><span className="lookup-desc">{item.description}</span>{item.brand || item.model ? <em>{[item.brand, item.model].filter(Boolean).join(" · ")}</em> : null}</div>
        <div className="lookup-meta">
          <span className={`pill ${item.sourceKind === "Estimate" ? "blue" : "green"}`}>{kindLabel(item.sourceKind)}</span>
          <span>{item.supplierName ?? copy("ไม่ระบุ supplier", "No supplier", "仕入先なし")}</span>
          <strong className="lookup-price">{money(item.unitCost)} / {item.unit}</strong>
          {item.priceDate ? <span>{shortDate(item.priceDate)}</span> : null}
          <span className="muted">{item.sourceNumber}</span>
          {item.uses > 1 ? <span className="muted">×{item.uses}</span> : null}
        </div>
      </button>)}
      {loading && !items.length ? <div className="lookup-status"><span className="spinner" />{copy("กำลังค้นหา…", "Searching…", "検索中…")}</div> : null}
      {settled && !items.length ? <div className="lookup-status">{result?.error ? copy("ค้นหาไม่สำเร็จ พิมพ์ต่อได้ตามปกติ", "Search failed; keep typing as usual.", "検索に失敗しました。そのまま入力できます。") : copy("ไม่พบรายการเดิม พิมพ์ต่อได้เลย", "No previous item matches; keep typing.", "一致する過去項目はありません。")}</div> : null}
      {items.length ? <div className="lookup-hint">{copy("Enter ใช้รายการนี้ทั้งแถว · Esc ปิด", "Enter fills the whole line · Esc closes", "Enter で行全体に反映 · Esc で閉じる")}</div> : null}
    </LookupMenu> : null}
  </>;
}

/* ── supplier type-ahead ───────────────────────────────────────────────── */

export function SupplierLookupInput({ suppliers, value, onChange, onKeyDown, onFocus, onBlur, ...inputProps }: {
  suppliers: BootstrapData["suppliers"];
  value: number | undefined;
  onChange: (supplierId: number | undefined) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">) {
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeState, setActiveState] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const selected = value ? suppliers.find((supplier) => supplier.id === value) : undefined;
  const selectedLabel = selected ? selected.name : value ? `${copy("Supplier #", "Supplier #", "仕入先 #")}${value} ${copy("(ไม่ใช้งานแล้ว)", "(inactive)", "(無効)")}` : "";
  const shown = editing ? text : selectedLabel;
  const needle = editing ? text : "";
  const options = filterSuppliers(suppliers, needle, LOOKUP_LIMIT);
  const withClear = !needle.trim() && Boolean(value);
  const count = options.length + (withClear ? 1 : 0);
  const open = focused && !dismissed && count > 0;
  const active = activeState.key === needle ? activeState.index : 0;
  const setActive = (index: number) => setActiveState({ key: needle, index });

  const commit = (supplierId: number | undefined) => {
    onChange(supplierId);
    setEditing(false);
    setDismissed(true);
  };
  const pick = (index: number) => {
    if (withClear && index === 0) { commit(undefined); return; }
    const option = options[withClear ? index - 1 : index];
    if (option) commit(option.id);
  };
  const keys: MenuKeys = { open, count, active, setActive, pick, close: () => setDismissed(true), show: () => setDismissed(false) };

  return <>
    <input
      {...inputProps}
      ref={setAnchor}
      value={shown}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      autoComplete="off"
      onChange={(event) => {
        const next = event.target.value;
        setText(next); setEditing(true); setDismissed(false);
        if (!next.trim() && value) onChange(undefined);
      }}
      onFocus={(event) => { setFocused(true); setDismissed(false); setText(selectedLabel); setEditing(false); event.target.select(); onFocus?.(event); }}
      onBlur={(event) => {
        setFocused(false);
        if (editing) {
          const exact = matchSupplierExactly(suppliers, text);
          if (exact) onChange(exact.id);
          else if (!text.trim()) onChange(undefined);
          setEditing(false);
        }
        onBlur?.(event);
      }}
      onKeyDown={(event) => { if (!handleMenuKeys(event, keys)) onKeyDown?.(event); }}
    />
    {open ? <LookupMenu id={menuId} anchor={anchor} minWidth={280} label={copy("เลือก supplier", "Choose a supplier", "仕入先を選択")}>
      {withClear ? <button type="button" role="option" tabIndex={-1} aria-selected={active === 0} className={`lookup-option compact${active === 0 ? " active" : ""}`} onMouseEnter={() => setActive(0)} onClick={() => pick(0)}><span className="muted"><Icon name="x" /> {copy("ไม่ระบุ supplier", "No supplier", "仕入先なし")}</span></button> : null}
      {options.map((supplier, offset) => { const index = offset + (withClear ? 1 : 0); return <button type="button" key={supplier.id} role="option" tabIndex={-1} aria-selected={index === active} className={`lookup-option compact${index === active ? " active" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => pick(index)}><strong>{supplier.name}</strong><span className="muted mono">{supplier.code}</span>{supplier.category ? <span className="muted">{supplier.category}</span> : null}</button>; })}
      {needle.trim() && options.length === LOOKUP_LIMIT ? <div className="lookup-hint">{copy("พิมพ์เพิ่มเพื่อกรองให้แคบลง", "Keep typing to narrow the list", "さらに入力して絞り込み")}</div> : null}
    </LookupMenu> : null}
    {focused && editing && needle.trim() && !options.length ? <LookupMenu id={`${menuId}-empty`} anchor={anchor} minWidth={280} label={copy("เลือก supplier", "Choose a supplier", "仕入先を選択")}><div className="lookup-status">{copy("ไม่พบ supplier นี้ในทะเบียน เพิ่มได้ที่ Master Data", "No such supplier in the register; add it under Master Data.", "登録にない仕入先です。マスタデータで追加してください。")}</div></LookupMenu> : null}
  </>;
}
