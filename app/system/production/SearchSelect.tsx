"use client";

import { useId, useState } from "react";
import { Icon } from "../ui";
import { LookupMenu, handleMenuKeys, type MenuKeys } from "./CostItemLookup";

/*
 * Choose one entry from a long list by typing. The list is drawn by the app, not the
 * browser's datalist (which Chrome paints in its own dark box, one cut-off line per row,
 * and filters down to the text already in the box). Two lines per entry, arrow keys and
 * Enter, a clear button, and an optional last row that adds what was typed as a new entry.
 * The single-choice sibling of SearchMultiPicker; both use the cost item lookup's menu,
 * so every search list in the app looks and behaves alike.
 */

export type SearchSelectOption = { value: string; label: string; detail?: string; searchText?: string };
const MATCH_LIMIT = 50;

export function SearchSelect({ value, options, onChange, label, placeholder, noMatchText, clearLabel, showLabel, moreText, required, disabled, addLabel, onAdd }: {
  value: string; options: SearchSelectOption[]; onChange: (value: string) => void;
  /** Already translated: the caller owns its copy. */
  label: string; placeholder: string; noMatchText: string; clearLabel: string; showLabel: string;
  /** Shown when the list is cut; "{shown}" and "{total}" are filled in. */
  moreText: string;
  required?: boolean; disabled?: boolean;
  /** A last row that adds a new entry from what was typed (empty when nothing was). */
  addLabel?: (typed: string) => string; onAdd?: (typed: string) => void;
}) {
  const menuId = useId();
  // null while the box shows the chosen entry; text while the person is typing a search.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const selected = options.find(option => option.value === value);
  const typed = (query ?? "").trim();
  const needle = typed.toLocaleLowerCase();
  const found = needle ? options.filter(option => `${option.label} ${option.detail ?? ""} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(needle)) : options;
  const matches = found.slice(0, MATCH_LIMIT);
  const adds = Boolean(onAdd && addLabel);
  const count = matches.length + (adds ? 1 : 0);
  const highlighted = Math.min(active, Math.max(0, count - 1));
  const close = () => { setOpen(false); setQuery(null); };
  const pick = (index: number) => {
    if (adds && index === matches.length) { onAdd?.(typed); close(); return; }
    const option = matches[index];
    if (!option) return;
    onChange(option.value);
    close();
  };
  // Opening the list starts on the chosen entry, so the arrow keys move from there.
  const openList = () => { setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };
  const keys: MenuKeys = { open, count, active: highlighted, setActive, pick, close, show: openList };
  const show = () => { if (disabled) return; anchor?.focus(); openList(); };
  return <div className={`search-select${disabled ? " disabled" : ""}`}>
    <input ref={setAnchor} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={label} autoComplete="off" required={required} disabled={disabled} placeholder={placeholder} value={query ?? selected?.label ?? ""}
      /* Room for the clear and toggle buttons; inline so a form grid's input padding cannot override it. */
      style={{ paddingRight: value && !disabled ? 60 : 34 }}
      onFocus={(event) => { event.currentTarget.select(); openList(); }}
      onBlur={close}
      onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (handleMenuKeys(event, keys)) return;
        // Enter while searching never submits the form around the box.
        if (event.key === "Enter" && query !== null) event.preventDefault();
      }} />
    {value && !disabled ? <button type="button" className="search-select-clear" aria-label={clearLabel} title={clearLabel}
      onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setQuery(null); anchor?.focus(); }}><Icon name="x" /></button> : null}
    <button type="button" className="search-select-toggle" tabIndex={-1} aria-label={showLabel} title={showLabel} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) close(); else show(); }}><Icon name="chevronDown" /></button>
    {open && !disabled ? <LookupMenu id={menuId} anchor={anchor} minWidth={300} label={label}>
      {matches.map((option, index) => <button type="button" key={option.value} role="option" tabIndex={-1} aria-selected={option.value === value}
        className={`lookup-option${index === highlighted ? " active" : ""}${option.value === value ? " chosen" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => pick(index)}>
        <div className="lookup-main"><strong>{option.label}</strong></div>
        {option.detail ? <div className="lookup-meta"><span>{option.detail}</span></div> : null}
      </button>)}
      {!matches.length ? <div className="lookup-status">{noMatchText}</div> : null}
      {found.length > matches.length ? <div className="lookup-hint">{moreText.replace("{shown}", String(matches.length)).replace("{total}", String(found.length))}</div> : null}
      {adds ? <button type="button" role="option" tabIndex={-1} aria-selected={false}
        className={`lookup-option search-select-add${highlighted === matches.length ? " active" : ""}`} onMouseEnter={() => setActive(matches.length)} onClick={() => pick(matches.length)}>
        <div className="lookup-main"><Icon name="plus" /><strong>{addLabel?.(typed)}</strong></div>
      </button> : null}
    </LookupMenu> : null}
  </div>;
}
