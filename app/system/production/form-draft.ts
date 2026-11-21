"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { confirmDialog } from "../dialogs";

/*
 * Pegasus 0.6, "never lose typed data", for the screens drawn in the Pegasus look. A form's fields keep what the person typed
 * in this browser (localStorage) while they type, so a refresh, a crash, a lost connection or a closed tab loses nothing:
 * the screen reopens the dialog with the draft after a reload. A save that succeeds clears the draft; so does Discard changes.
 * Leaving a form with unsaved changes asks with exactly two buttons, Keep editing and Discard changes (confirmLeave). Refresh
 * and tab close are never blocked, because the draft brings the input back.
 *
 * A field is stored only while it differs from the value the form started with, so a form opened and closed without a change
 * leaves nothing behind, and a field set back to its starting value drops out of the draft. Files are not kept: a browser
 * cannot put a chosen file back into a file input.
 */

const PREFIX = "tomas-tech-draft:";
/** A draft nobody came back to for two weeks is dropped. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Stored = { savedAt: number; values: Record<string, unknown> };

function store(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

/** The draft kept for a form, or null; an old or unreadable one is removed. */
export function readDraft(key: string): Stored | null {
  const storage = store();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || typeof parsed.values !== "object" || !parsed.values || Date.now() - parsed.savedAt > MAX_AGE_MS || !Object.keys(parsed.values).length) {
      storage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    try { storage.removeItem(PREFIX + key); } catch { /* storage unavailable */ }
    return null;
  }
}

/** True when the form has unsaved changes kept in this browser. */
export function hasDraft(key: string | null | undefined): boolean {
  return Boolean(key && readDraft(key));
}

/** The keys of every kept draft that starts with the prefix, without the storage prefix (to reopen a dialog after a reload). */
export function draftKeys(prefix: string): string[] {
  const storage = store();
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const full = storage.key(index);
      if (full?.startsWith(PREFIX + prefix)) keys.push(full.slice(PREFIX.length));
    }
  } catch { return []; }
  return keys.filter((key) => readDraft(key));
}

export function clearDraft(key: string | null | undefined) {
  if (!key) return;
  try { store()?.removeItem(PREFIX + key); } catch { /* storage unavailable */ }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function writeField(key: string, name: string, value: unknown, initial: unknown) {
  const storage = store();
  if (!storage) return;
  const values = { ...(readDraft(key)?.values ?? {}) };
  if (same(value, initial)) delete values[name]; else values[name] = value;
  try {
    if (Object.keys(values).length) storage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), values }));
    else storage.removeItem(PREFIX + key);
  } catch { /* quota or private mode: the form still works, it only forgets */ }
}

/**
 * useState for one field of a form, kept in the form's draft. `initial` is the value the form starts with (an empty field, or
 * the record's saved value); the field starts from the draft when there is one. With a null key the field is a plain state.
 */
export function useDraftField<T>(key: string | null, name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const kept = key ? readDraft(key)?.values : undefined;
    if (!kept || !(name in kept)) return initial;
    // A whole form kept as one object is laid over the starting one, so a field added since the draft was kept is not lost.
    return isRecord(initial) && isRecord(kept[name]) ? { ...initial, ...kept[name] } as T : kept[name] as T;
  });
  const initialText = JSON.stringify(initial);
  useEffect(() => {
    if (key) writeField(key, name, value, JSON.parse(initialText ?? "null"));
  }, [key, name, value, initialText]);
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => setValue(next), []);
  return [value, set];
}

/** The words of the unsaved-changes question (0.6, D.8 UnsavedChangesDialog), already translated by the caller's t. */
export type LeaveCopy = { title: string; body: string; keep: string; discard: string };
export const leaveCopy = (t: (key: string) => string): LeaveCopy => ({
  title: t("Form.unsavedTitle"), body: t("Form.unsavedBody"), keep: t("Form.keepEditing"), discard: t("Form.discard"),
});

/**
 * Before a form with unsaved changes closes: asks Keep editing or Discard changes. True means close (no changes, or the person
 * chose Discard changes, which also drops the draft); false means keep the form open. A panel holding several forms (a
 * document's comment, link and revision) passes all their keys and asks once.
 */
export async function confirmLeave(key: string | null | undefined | (string | null | undefined)[], copy: LeaveCopy): Promise<boolean> {
  const keys = (Array.isArray(key) ? key : [key]).filter((item): item is string => Boolean(item));
  const dirty = keys.filter((item) => hasDraft(item));
  if (!dirty.length) return true;
  const discard = await confirmDialog(copy.body, { title: copy.title, confirmText: copy.discard, cancelText: copy.keep, danger: true });
  if (discard) for (const item of dirty) clearDraft(item);
  return discard;
}
