/** Per-tab and per-account navigation; never stores form data or credentials. */
export function viewStorageKey(userId: number): string {
  return `tomas-tech-view:${userId}`;
}

/** A screen's own address, so a menu entry can open in a new tab and Back returns to the last screen. */
export function viewHash(view: string, recordId?: number | null): string {
  if ((view === "estimates" || view === "inquiries") && Number.isSafeInteger(recordId) && Number(recordId) > 0) return `#/${view}/${recordId}`;
  return `#/${view}`;
}

/** Document addresses are shareable; singular fragments from existing emails remain valid. */
export function documentRoute(hash: string): { view: "estimates" | "inquiries"; id: number | null } | null {
  const match = /^#\/(estimates|inquiries)(?:\/([1-9]\d*))?$/.exec(hash) ?? /^#(estimate|inquiry)\/([1-9]\d*)$/.exec(hash);
  if (!match) return null;
  const id = match[2] ? Number(match[2]) : null;
  if (id !== null && !Number.isSafeInteger(id)) return null;
  return { view: match[1] === "estimate" || match[1] === "estimates" ? "estimates" : "inquiries", id };
}

/** The screen a "#/<view>" address names; null for any other fragment. */
export function viewFromHash(hash: string): string | null {
  return documentRoute(hash)?.view ?? /^#\/([a-z][a-z-]*)$/.exec(hash)?.[1] ?? null;
}

/** The screen a fragment opens, including the older "#activity" and "#support/<id>" links in sent emails. */
export function hashView(hash: string): string | null {
  if (/^#support(?:\/\d+)?$/.test(hash)) return "support";
  if (hash === "#activity") return "activity";
  return viewFromHash(hash);
}

/** Legacy CRM/project links are still consumed by their own followers. Document links stay in the address bar. */
export const RECORD_LINK = /^#(?:crm\/\d+|project\/\d+(?:\/task\/\d+)?)$/;

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
