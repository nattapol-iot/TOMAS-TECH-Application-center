"use client";

import { useId, useState } from "react";
import { Icon } from "../ui";
import { LookupMenu, handleMenuKeys, type MenuKeys } from "./CostItemLookup";

/*
 * Pick several people from a long list by typing: the chosen ones sit above the box as
 * removable chips, and the dropdown shows only those not chosen yet. Shared by schedule
 * PICs and project customer contacts, so both behave and read the same.
 */

export type PickerOption = { id: number; label: string; detail?: string; searchText?: string };
const MATCH_LIMIT = 50;

export function SearchMultiPicker({ options, value, onChange, label, placeholder, removeLabel, noMatchText, allChosenText }: {
  options: PickerOption[]; value: number[]; onChange: (value: number[]) => void;
  /** Already translated: the caller owns its copy. */
  label: string; placeholder: string; removeLabel: string; noMatchText: string; allChosenText: string;
}) {
  const menuId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const chosen = value.map(id => options.find(option => option.id === id)).filter((option): option is PickerOption => Boolean(option));
  const needle = query.trim().toLocaleLowerCase();
  const matches = options.filter(option => !value.includes(option.id)
    && (!needle || `${option.label} ${option.detail ?? ""} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(needle))).slice(0, MATCH_LIMIT);
  const open = focused && !dismissed;
  const highlighted = Math.min(active, Math.max(0, matches.length - 1));
  const pick = (index: number) => { const option = matches[index]; if (!option) return; onChange([...value, option.id]); setQuery(""); setActive(0); };
  const keys: MenuKeys = { open, count: matches.length, active: highlighted, setActive, pick, close: () => setDismissed(true), show: () => setDismissed(false) };
  return <div className="search-multi-picker">
    {chosen.length ? <ul className="project-contact-chips">{chosen.map(option => <li key={option.id}>
      <span><strong>{option.label}</strong>{option.detail ? <small className="muted"> · {option.detail}</small> : null}</span>
      <button className="icon-btn" type="button" aria-label={`${removeLabel} ${option.label}`} title={removeLabel} onClick={() => onChange(value.filter(id => id !== option.id))}><Icon name="x" /></button>
    </li>)}</ul> : null}
    <input className="project-contact-search" ref={setAnchor} value={query} placeholder={placeholder} aria-label={label}
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? menuId : undefined} autoComplete="off"
      onChange={(event) => { setQuery(event.target.value); setActive(0); setDismissed(false); }}
      onFocus={() => { setFocused(true); setDismissed(false); }} onBlur={() => setFocused(false)}
      onKeyDown={(event) => { handleMenuKeys(event, keys); }} />
    {open ? <LookupMenu id={menuId} anchor={anchor} minWidth={320} label={label}>
      {matches.map((option, index) => <button type="button" key={option.id} role="option" tabIndex={-1} aria-selected={index === highlighted}
        className={`lookup-option${index === highlighted ? " active" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => pick(index)}>
        <div className="lookup-main"><strong>{option.label}</strong></div>
        {option.detail ? <div className="lookup-meta"><span>{option.detail}</span></div> : null}
      </button>)}
      {!matches.length ? <div className="lookup-status">{value.length && value.length >= options.length ? allChosenText : noMatchText}</div> : null}
    </LookupMenu> : null}
  </div>;
}
