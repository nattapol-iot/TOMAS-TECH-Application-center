/** Per-tab and per-account navigation; never stores form data or credentials. */
export function viewStorageKey(userId: number): string {
  return `tomas-tech-view:${userId}`;
}

/** A screen's own address, so a menu entry can open in a new tab and Back returns to the last screen. */
export function viewHash(view: string): string {
  return `#/${view}`;
}

/** The screen a "#/<view>" address names; null for any other fragment. */
export function viewFromHash(hash: string): string | null {
  return /^#\/([a-z][a-z-]*)$/.exec(hash)?.[1] ?? null;
}

/** The screen a fragment opens, including the older "#activity" and "#support/<id>" links in sent emails. */
export function hashView(hash: string): string | null {
  if (/^#support(?:\/\d+)?$/.test(hash)) return "support";
  if (hash === "#activity") return "activity";
  return viewFromHash(hash);
}

/** Emailed links to one record. Their followers open the record and then clear the fragment. */
export const RECORD_LINK = /^#(?:estimate|inquiry|crm)\/\d+$/;

/** A click the app handles itself; Ctrl, Cmd, Shift, Alt and other buttons are left to the browser (new tab, new window). */
export function isPlainClick(event: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

export function restoredView<T extends string>(
  saved: string | null,
  allowed: readonly T[],
  hash: string,
  verifyCode: string | undefined,
  fallback: T,
  normalize: (view: string) => string = view => view,
): T {
  // Explicit links take precedence, including when their target is forbidden.
  const requested = verifyCode ? "documents" : hashView(hash) ?? saved;
  const target = requested === null ? null : normalize(requested);
  return allowed.find(view => view === target) ?? fallback;
}
