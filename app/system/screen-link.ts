"use client";
/* Every screen's place and filters live in the address bar (lib/remembered-view.ts screenHash), so the address is
   always a link a teammate can open on the same tab, record and filters; a screen's filters are also remembered
   for each person. The app shell owns "#/<view>" (and an Estimate's or Inquiry's record); a screen owns what
   follows it through these hooks. A screen reads its place when it mounts: the shell remounts it when Back,
   Forward or a pasted link changes the place of the screen already open. */

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { baseHash, screenPlace, screenTail } from "../../lib/remembered-view";

/** What the screen on show has put in the address. `fromLink`: it opened on a link that named a place or filters. */
export type ScreenLinkState = { view: string; path: string[]; params: Record<string, string>; opened: Record<string, string>; fromLink: boolean };
export type ScreenLinkValue = {
  view: string;
  /** The shell's part of the address for this screen, e.g. "#/projects" or "#/estimates/42". */
  base: string;
  userId: number;
  state: MutableRefObject<ScreenLinkState>;
};

const ScreenLinkContext = createContext<ScreenLinkValue | null>(null);

export function ScreenLinkProvider({ value, children }: { value: ScreenLinkValue; children: ReactNode }) {
  return createElement(ScreenLinkContext.Provider, { value }, children);
}

/** The screen's place and filters, read from the address the first time one of its hooks asks. */
function current(link: ScreenLinkValue): ScreenLinkState {
  if (link.state.current.view !== link.view) link.state.current = screenPlace(window.location.hash, link.view, link.base);
  return link.state.current;
}

/** Puts the screen's place and filters in the address; while the shell is still opening the screen, it adds them itself. */
function write(link: ScreenLinkValue, how: "push" | "replace") {
  const state = current(link);
  const next = link.base + screenTail(state.path, state.params);
  if (baseHash(window.location.hash) !== link.base || window.location.hash === next) return;
  window.history[how === "push" ? "pushState" : "replaceState"](null, "", window.location.pathname + window.location.search + next);
}

/**
 * The screen's place, such as its tab and the record it has open, as path segments: the place the screen opened on
 * (from its link), and a function that names a new place in the address. The screen keeps its own state; moving
 * to another place is a history entry, so Back returns to the last one, and `replace` corrects the address without one.
 */
export function useScreenPlace(): [string[], (path: readonly (string | number | null | undefined)[], how?: "push" | "replace") => void] {
  const link = useContext(ScreenLinkContext);
  const [opened] = useState<string[]>(() => (link ? current(link).path : []));
  const place = useCallback((next: readonly (string | number | null | undefined)[], how: "push" | "replace" = "push") => {
    if (!link) return;
    const value = next.filter((part) => part !== null && part !== undefined && part !== "").map(String);
    const state = current(link);
    if (state.path.join("/") === value.join("/")) return;
    state.path = value;
    write(link, how);
  }, [link]);
  return [opened, place];
}

/** An id in the place, e.g. 42 from ["plan", "42"]; null when it is missing or not a positive whole number. */
export const placeId = (path: readonly string[], index: number) => (/^[1-9]\d{0,15}$/.test(path[index] ?? "") ? Number(path[index]) : null);

/** A filter value that may be absent, e.g. the chosen team. */
export const optionalTextLink: LinkCodec<string | null> = { parse: (text) => text || null, format: (value) => value ?? "" };

/** How a filter's value is written in the address and remembered. parse returns null for text it cannot read. */
export type LinkCodec<T> = { parse: (text: string) => T | null; format: (value: T) => string };
export const textLink: LinkCodec<string> = { parse: (text) => text, format: (value) => value };
export const flagLink: LinkCodec<boolean> = { parse: (text) => (text === "1" ? true : text === "0" ? false : null), format: (value) => (value ? "1" : "0") };
export const numberLink: LinkCodec<number> = { parse: (text) => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : null), format: String };
/** An id or nothing: "" in the address is no choice. */
export const idLink: LinkCodec<number | null> = { parse: (text) => (/^[1-9]\d{0,15}$/.test(text) ? Number(text) : null), format: (value) => (value === null ? "" : String(value)) };
export const listLink: LinkCodec<string[]> = {
  parse: (text) => text.split(",").map((part) => { try { return decodeURIComponent(part); } catch { return part; } }).filter(Boolean),
  format: (value) => value.map(encodeURIComponent).join(","),
};
export function choiceLink<T extends string>(choices: readonly T[]): LinkCodec<T> {
  return { parse: (text) => ((choices as readonly string[]).includes(text) ? (text as T) : null), format: (value) => value };
}
export function optionalChoiceLink<T extends string>(choices: readonly T[]): LinkCodec<T | null> {
  return { parse: (text) => ((choices as readonly string[]).includes(text) ? (text as T) : null), format: (value) => value ?? "" };
}

const rememberKey = (link: ScreenLinkValue, name: string) => `tomas-tech-linked:${link.userId}:${link.view}:${name}`;

/**
 * A filter that is part of the screen's link and, unless `remember` is false (free-text search, say), remembered for
 * this person: a link that names a place or filters opens exactly that; otherwise the screen opens on the filters
 * last used here. A value equal to `fallback` is left out of both.
 */
export function useLinkedState<T>(name: string | null, fallback: T, codec: LinkCodec<T>, options: { remember?: boolean; legacy?: () => T | null } = {}): [T, (value: T) => void] {
  // A null name is plain state: a part used in several places links only where it is the one on screen.
  const context = useContext(ScreenLinkContext);
  const link = name === null ? null : context;
  const remember = options.remember ?? true;
  const empty = codec.format(fallback);
  const [value, setValueState] = useState<T>(() => {
    if (!link || name === null) return fallback;
    const state = current(link);
    const linked = state.opened[name];
    if (state.fromLink) return linked === undefined ? fallback : codec.parse(linked) ?? fallback;
    let remembered: T | null = null;
    if (remember) {
      try { const text = window.localStorage.getItem(rememberKey(link, name)); remembered = text === null ? options.legacy?.() ?? null : codec.parse(text); }
      catch { /* Remembered filters are a convenience when storage is blocked. */ }
    }
    return remembered ?? fallback;
  });
  // The value on show is on the address too (a remembered one included), so the screen's link shows what the screen
  // shows; the filter comes off when this part of the screen closes, e.g. on another tab.
  useEffect(() => {
    if (!link || name === null) return;
    const state = current(link);
    const text = codec.format(value);
    if (text !== empty && state.params[name] !== text) state.params = { ...state.params, [name]: text };
    write(link, "replace");
    return () => {
      if (link.state.current !== state || state.params[name] === undefined) return;
      const params = { ...state.params };
      delete params[name];
      state.params = params;
    };
  }, [link, name, value, codec, empty]);
  const setValue = useCallback((next: T) => {
    setValueState(next);
    if (!link || name === null) return;
    const state = current(link);
    const text = codec.format(next);
    const params = { ...state.params };
    if (text === empty) delete params[name]; else params[name] = text;
    state.params = params;
    if (remember) {
      try { if (text === empty) window.localStorage.removeItem(rememberKey(link, name)); else window.localStorage.setItem(rememberKey(link, name), text); }
      catch { /* Remembered filters are a convenience when storage is blocked. */ }
    }
    write(link, "replace");
  }, [link, name, codec, empty, remember]);
  return [value, setValue];
}

/**
 * Links a field whose owner keeps its state (the shared Tabs, Select, SearchInput, FilterChips and SegmentBar take
 * a `link` name): its value goes on the screen's link, and with `remember` it is remembered for this person. When
 * the screen opens, a value from its link (or the remembered one) is handed to onChange once; `valid` drops one the
 * field cannot show. A value equal to `empty` is left out of the link.
 */
export function useLinkedControl(name: string | null | undefined, value: string, onChange: (value: string) => void,
  options: { remember?: boolean; empty?: string; valid?: (value: string) => boolean } = {}) {
  const context = useContext(ScreenLinkContext);
  const link = name ? context : null;
  const remember = Boolean(options.remember), empty = options.empty ?? "";
  const [initial] = useState<string | null>(() => {
    if (!link || !name) return null;
    const state = current(link);
    if (state.fromLink) return state.opened[name] ?? null;
    if (!remember) return null;
    try { return window.localStorage.getItem(rememberKey(link, name)); } catch { return null; }
  });
  const handed = useRef(false);
  const valid = options.valid;
  useEffect(() => {
    if (handed.current) return;
    handed.current = true;
    if (initial !== null && initial !== value && (!valid || valid(initial))) onChange(initial);
  }, [initial, value, valid, onChange]);
  useEffect(() => {
    if (!link || !name) return;
    const state = current(link);
    const params = { ...state.params };
    if (value === empty) delete params[name]; else params[name] = value;
    state.params = params;
    // The first pass still shows the field's starting value while a linked or remembered one is being handed over.
    if (remember && (handed.current || initial === null)) {
      try { if (value === empty) window.localStorage.removeItem(rememberKey(link, name)); else window.localStorage.setItem(rememberKey(link, name), value); }
      catch { /* Remembered filters are a convenience when storage is blocked. */ }
    }
    write(link, "replace");
    return () => {
      if (link.state.current !== state || state.params[name] === undefined) return;
      const rest = { ...state.params };
      delete rest[name];
      state.params = rest;
    };
  }, [link, name, value, empty, remember, initial]);
}
