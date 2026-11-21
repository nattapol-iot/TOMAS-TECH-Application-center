"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { Icon } from "../ui";

/*
 * The Pegasus select (DESIGN.md D.3) for the screens drawn in the Pegasus look: a button that shows the chosen entry and
 * opens a list drawn by the app, with a check on the chosen entry, instead of the browser's own list. It takes the same
 * <option> children and the same value / onChange as a <select>, so a screen swaps the tag and nothing else; onChange gets
 * an object with target.value like the browser's event.
 *
 * A hidden native <select> repeats the value, name and required, so a form's checks (checkFields bubbles, "Please choose"),
 * FormData and form rules keep working. It is inert: a screen reader and the Tab key only meet the button.
 *
 * Keys: Enter, Space or the arrows open the list; arrows, Home and End move; Enter or Space picks; Escape closes without
 * closing the dialog around it; typing jumps to the entry that starts with the letters. A list longer than eight entries
 * gets a search box. Clicking the chosen entry again empties a field that is not required and has an empty entry. The list
 * closes when anything outside it scrolls. Inside a native <dialog> the list is drawn in the dialog, so it stays above it.
 */

type Option = { value: string; label: ReactNode; text: string; disabled: boolean; hidden: boolean };

/** What onChange receives: the same shape as the browser's change event where screens read it. */
export type PgSelectChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

type Props = {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: PgSelectChange) => void;
  children?: ReactNode;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Shown when no entry matches the value. Already translated; "Select" by default. */
  placeholder?: string;
  /** The search box; on by default for a list longer than eight entries. */
  searchable?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  [data: `data-${string}`]: string | undefined;
};

/** The plain text of an option's label, for typing and search. */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; text?: unknown };
    if (props.children !== undefined) return textOf(props.children);
    return typeof props.text === "string" ? props.text : "";
  }
  return "";
}

/** The entries of a select's <option> children; an option without a value attribute takes its text, as the browser does. */
export function readOptions(children: ReactNode, into: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: ReactNode; disabled?: boolean; hidden?: boolean };
    if (child.type === Fragment || child.type === "optgroup") {
      readOptions(props.children, into);
      return;
    }
    if (child.type !== "option") return;
    const text = textOf(props.children);
    into.push({ value: props.value === undefined || props.value === null ? text : String(props.value), label: props.children, text, disabled: Boolean(props.disabled), hidden: Boolean(props.hidden) });
  });
  return into;
}

export function PgSelect({ value: controlled, defaultValue, onChange, children, name, id, required, disabled, className, title, placeholder, searchable, ...rest }: Props) {
  const t = useT();
  const listId = useId();
  const [own, setOwn] = useState(String(defaultValue ?? ""));
  const value = controlled === undefined ? own : String(controlled ?? "");
  const options = readOptions(children);
  const visible = options.filter((option) => !option.hidden);
  const selected = options.find((option) => option.value === value);
  const withSearch = searchable ?? visible.length > 8;
  // Where the list is drawn while it is open: the native dialog around the button (top layer) or the body.
  const [host, setHost] = useState<Element | null>(null);
  const open = host !== null;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? visible.filter((option) => option.text.toLocaleLowerCase().includes(needle)) : visible;
  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let count = 0, index = from; count < shown.length; count += 1, index = (index + step + shown.length) % shown.length) if (!shown[index]?.disabled) return index;
    return -1;
  };

  const openList = () => setHost(trigger.current?.closest("dialog") ?? document.body);
  const close = (focusButton: boolean) => {
    setHost(null);
    setQuery("");
    setPlace(null);
    if (focusButton) trigger.current?.focus();
  };
  const show = (startQuery = "") => {
    if (disabled) return;
    const start = visible.findIndex((option) => option.value === value);
    setActive(start >= 0 && !startQuery ? start : 0);
    setQuery(startQuery);
    openList();
  };
  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    const clears = option.value === value && option.value !== "" && !required && visible.some((item) => item.value === "" && !item.disabled);
    const next = clears ? "" : option.value;
    close(true);
    if (next === value) return;
    if (controlled === undefined) setOwn(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } });
  };
  const jump = (char: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 700 ? char : typed.current.text + char, at: now };
    const prefix = typed.current.text.toLocaleLowerCase();
    const index = visible.findIndex((option) => !option.disabled && option.text.toLocaleLowerCase().startsWith(prefix));
    if (index < 0) return;
    if (!open) {
      setQuery("");
      openList();
    }
    setActive(index);
  };

  const onKey = (event: KeyboardEvent<HTMLElement>, fromSearch: boolean) => {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    const letter = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) {
        event.preventDefault();
        show();
      } else if (letter && key !== " ") {
        event.preventDefault();
        if (withSearch) show(key);
        else jump(key);
      }
      return;
    }
    if (key === "ArrowDown") {
      event.preventDefault();
      const next = firstEnabled((active + 1) % Math.max(1, shown.length), 1);
      if (next >= 0) setActive(next);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      const next = firstEnabled((active - 1 + shown.length) % Math.max(1, shown.length), -1);
      if (next >= 0) setActive(next);
    } else if (key === "Home" && !fromSearch) {
      event.preventDefault();
      setActive(Math.max(0, firstEnabled(0, 1)));
    } else if (key === "End" && !fromSearch) {
      event.preventDefault();
      setActive(Math.max(0, firstEnabled(shown.length - 1, -1)));
    } else if (key === "Enter" || (key === " " && !fromSearch)) {
      event.preventDefault();
      event.stopPropagation();
      choose(shown[active]);
    }
    // Escape closes the list only: the dialog around it checks defaultPrevented, a native <dialog> skips its cancel.
    else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (key === "Tab") {
      event.preventDefault();
      close(true);
    } else if (letter && !fromSearch) {
      event.preventDefault();
      jump(key);
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && (panel.current?.contains(next) || trigger.current?.contains(next))) return;
    if (open) close(false);
  };

  // Place the list under the button (above it when there is no room), as wide as the button and at least 176px.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const height = panel.current?.offsetHeight ?? 0;
    const below = window.innerHeight - rect.bottom - 8;
    const up = below < height && rect.top - 8 > below;
    const width = Math.max(rect.width, 176);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPlace(up ? { left, width, bottom: window.innerHeight - rect.top + 4 } : { left, width, top: rect.bottom + 4 });
  }, [open, shown.length]);

  // On open: the search box takes the keys, and the chosen entry sits in the middle of the list. Moving later keeps the
  // highlighted row in view (below).
  const placed = place !== null;
  useEffect(() => {
    if (!open || !placed) return;
    if (withSearch) search.current?.focus({ preventScroll: true });
    const box = list.current,
      chosen = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && chosen) box.scrollTop = chosen.offsetTop - box.clientHeight / 2 + chosen.offsetHeight / 2;
  }, [open, placed, withSearch]);

  useEffect(() => {
    const box = list.current,
      row = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [active]);

  // A press outside, a scroll outside the list or a resize closes it (D.3).
  useEffect(() => {
    if (!open) return;
    const shut = () => {
      setHost(null);
      setQuery("");
      setPlace(null);
    };
    const outside = (target: EventTarget | null) => !(target instanceof Node && (panel.current?.contains(target) || trigger.current?.contains(target)));
    const press = (event: PointerEvent) => {
      if (outside(event.target)) shut();
    };
    const scroll = (event: Event) => {
      if (outside(event.target)) shut();
    };
    document.addEventListener("pointerdown", press, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  const muted = !selected || (selected.value === "" && (required || selected.disabled));
  const activeId = open && active >= 0 && shown[active] ? `${listId}-${active}` : undefined;

  return (
    <span className={`pg-select${className ? ` ${className}` : ""}`} data-open={open || undefined}>
      <button
        ref={trigger}
        type="button"
        id={id}
        className="pg-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={withSearch ? undefined : activeId}
        aria-required={required || undefined}
        disabled={disabled}
        title={title}
        {...rest}
        onClick={() => {
          if (open) close(true);
          else show();
        }}
        onKeyDown={(event) => onKey(event, false)}
        onBlur={onBlur}
      >
        <span className={`pg-select-value${muted ? " placeholder" : ""}`}>{selected ? selected.label : (placeholder ?? t("Form.select"))}</span>
        <Icon name="chevronDown" />
      </button>
      <select className="pg-select-native" tabIndex={-1} inert name={name} required={required} disabled={disabled} value={value} onChange={() => undefined}>
        <option value="" />
        {value ? <option value={value} /> : null}
      </select>
      {host
        ? createPortal(
            <div
              ref={panel}
              role="presentation"
              className="pg-skin pg-select-panel"
              style={place ?? { visibility: "hidden", top: 0, left: 0 }}
              onMouseDown={(event) => {
                if (event.target !== search.current) event.preventDefault();
              }}
            >
              {withSearch ? (
                <div className="pg-select-search">
                  <input
                    ref={search}
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    aria-label={t("Form.search")}
                    placeholder={t("Form.search")}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    }}
                    onKeyDown={(event) => onKey(event, true)}
                    onBlur={onBlur}
                  />
                </div>
              ) : null}
              <div ref={list} id={listId} className="pg-select-list" role="listbox" aria-label={rest["aria-label"]}>
                {shown.map((option, index) => (
                  <button
                    type="button"
                    tabIndex={-1}
                    key={`${option.value}-${index}`}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    className={`pg-select-option${index === active ? " active" : ""}${option.value === value ? " chosen" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                  >
                    <span className="pg-select-check">{option.value === value ? <Icon name="check" /> : null}</span>
                    <span className="pg-select-label">{option.label || " "}</span>
                  </button>
                ))}
                {!shown.length ? <div className="pg-select-empty">{t("Form.noResults")}</div> : null}
              </div>
            </div>,
            host,
          )
        : null}
    </span>
  );
}
