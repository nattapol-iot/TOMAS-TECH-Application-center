"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { Icon } from "../ui";

/*
 * The header funnel (DESIGN.md D.7 column filter, Pegasus 0.3) for a list that is filtered on the server: a small funnel
 * beside the column name, faint until it is hovered or a filter is on (then primary). It opens a popover with "All" first
 * and one row per value the server offers (with its count); a row toggles, so several values can be chosen. A search row
 * shows for more than eight values, and "Clear" shows while the column is filtered. Escape, a press or a scroll outside,
 * or a resize closes it. Only the value-list kind is built: none of these lists has an amount column for a range.
 */

export type FilterOption = { value: string; label?: string; count?: number };

export function ColumnFilter({
  column,
  options,
  value,
  onChange,
  guide,
}: {
  /** The column's name, already translated: it names the funnel ("Filter Status") and the search ("Search Status"). */
  column: string;
  options: FilterOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** A click-through guide mark (production/guide-catalog.ts). */
  guide?: string;
}) {
  const t = useT();
  const [host, setHost] = useState<Element | null>(null);
  const open = host !== null;
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const active = value.length > 0;
  const withSearch = options.length > 8;
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? options.filter((option) => (option.label ?? option.value).toLocaleLowerCase().includes(needle)) : options;
  const label = t("Form.filterColumn").replace("{column}", column);

  const close = (focusButton: boolean) => {
    setHost(null);
    setQuery("");
    setPlace(null);
    if (focusButton) button.current?.focus();
  };
  const toggle = (item: string) => onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item]);
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && (panel.current?.contains(next) || button.current?.contains(next))) return;
    if (open) close(false);
  };

  // Under the funnel (above it when there is no room), kept inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = panel.current?.offsetWidth ?? 176;
    const height = panel.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 8;
    setPlace(below < height && rect.top - 8 > below ? { left, bottom: window.innerHeight - rect.top + 4 } : { left, top: rect.bottom + 4 });
  }, [open, shown.length]);

  // The search takes the keys when there is one, otherwise the first row.
  const placed = place !== null;
  useEffect(() => {
    if (!open || !placed) return;
    (withSearch ? search.current : first.current)?.focus({ preventScroll: true });
  }, [open, placed, withSearch]);

  useEffect(() => {
    if (!open) return;
    const shut = () => {
      setHost(null);
      setQuery("");
      setPlace(null);
    };
    const outside = (target: EventTarget | null) => !(target instanceof Node && (panel.current?.contains(target) || button.current?.contains(target)));
    const press = (event: PointerEvent) => {
      if (outside(event.target)) shut();
    };
    const scroll = (event: Event) => {
      if (outside(event.target)) shut();
    };
    // Escape closes the popover only: the dialog around a list checks defaultPrevented.
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      shut();
      button.current?.focus();
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`pg-col-filter${active ? " active" : ""}`}
        title={label}
        aria-label={active ? `${label} (${value.length})` : label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-guide={guide}
        onClick={() => {
          if (open) close(true);
          else setHost(button.current?.closest("dialog") ?? document.body);
        }}
      >
        <Icon name="filter" />
      </button>
      {host
        ? createPortal(
            <div ref={panel} role="dialog" aria-label={label} className="pg-skin pg-select-panel pg-filter-panel" style={place ?? { visibility: "hidden", top: 0, left: 0 }} onBlur={onBlur}>
              {withSearch ? (
                <div className="pg-select-search">
                  <input
                    ref={search}
                    aria-label={t("Form.filterSearch").replace("{column}", column)}
                    placeholder={t("Form.filterSearch").replace("{column}", column)}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="pg-filter-list">
                <button ref={first} type="button" className={`pg-filter-option${active ? "" : " chosen"}`} aria-pressed={!active} onClick={() => onChange([])}>
                  <Icon name="check" />
                  <span>{t("Form.filterAll")}</span>
                </button>
                {shown.map((option) => {
                  const chosen = value.includes(option.value);
                  return (
                    <button key={option.value} type="button" className={`pg-filter-option${chosen ? " chosen" : ""}`} aria-pressed={chosen} onClick={() => toggle(option.value)}>
                      <Icon name="check" />
                      <span>{option.label ?? (option.value || t("Form.filterBlank"))}</span>
                      {option.count === undefined ? null : <span className="pg-filter-count">{option.count}</span>}
                    </button>
                  );
                })}
                {!shown.length ? <div className="pg-select-empty">{t("Form.noResults")}</div> : null}
              </div>
              {active ? (
                <div className="pg-filter-foot">
                  <button type="button" className="pg-filter-clear" onClick={() => onChange([])}>
                    {t("Form.filterClear")}
                  </button>
                </div>
              ) : null}
            </div>,
            host,
          )
        : null}
    </>
  );
}
