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
  const match = /^#\/(estimates|inquiries)(?:\/([1-9]\d*))?(?:\?.*)?$/.exec(hash) ?? /^#(estimate|inquiry)\/([1-9]\d*)$/.exec(hash);
  if (!match) return null;
  const id = match[2] ? Number(match[2]) : null;
  if (id !== null && !Number.isSafeInteger(id)) return null;
  return { view: match[1] === "estimate" || match[1] === "estimates" ? "estimates" : "inquiries", id };
}

/**
 * A full screen address: "#/<view>", then the screen's own place (a tab, an open record) as path segments, then
 * its filters as a query, e.g. "#/projects/plan/42/task/77?team=Application%20Team". Copied from the address bar,
 * it opens the same place for a teammate (their own permissions still apply).
 */
export type ScreenAddress = { view: string; path: string[]; params: Record<string, string> };

export function parseScreenHash(hash: string): ScreenAddress | null {
  const match = /^#\/([a-z][a-z-]*)((?:\/[^/?#]+)*)\/?(?:\?([^#]*))?$/.exec(hash);
  if (!match) return null;
  const decode = (part: string) => { try { return decodeURIComponent(part); } catch { return part; } };
  const path = match[2] ? match[2].slice(1).split("/").map(decode) : [];
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(match[3] ?? "")) if (value !== "") params[key] = value;
  return { view: match[1]!, path, params };
}

/** The address for a screen's place and filters; empty filters are left out and the rest are in name order, so a link reads the same however it was made. */
export function screenHash(view: string, path: readonly (string | number)[] = [], params: Record<string, string | null | undefined> = {}): string {
  const tail = path.map(String).filter(Boolean).map(encodeURIComponent).join("/");
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .sort(([a], [b]) => a.localeCompare(b, "en"))).toString();
  return `#/${view}${tail ? `/${tail}` : ""}${query ? `?${query}` : ""}`;
}

/** What follows the shell's part of an address: a screen's place as "/a/b" and its filters as "?x=1"; empty when it has neither. */
export function screenTail(path: readonly (string | number)[], params: Record<string, string | null | undefined>): string {
  return screenHash("x", path, params).slice(3);
}

/**
 * The place and filters an address gives the screen `view`, whose shell part is `base` ("#/projects", or
 * "#/estimates/42" with its record first in the path). fromLink: the address named a place or filters, so it
 * opens exactly that rather than the filters the person used last.
 */
export function screenPlace(hash: string, view: string, base: string): { view: string; path: string[]; params: Record<string, string>; fromLink: boolean } {
  const address = parseScreenHash(hash);
  const own = address?.view === view ? address : null;
  const path = own ? own.path.slice(base === `#/${view}` ? 0 : 1) : [];
  const params = own?.params ?? {};
  return { view, path, params, fromLink: path.length > 0 || Object.keys(params).length > 0 };
}

/** The part of an address the app shell owns: the screen, and for an Estimate or Inquiry its record. A screen's own place and filters follow it. */
export function baseHash(hash: string): string | null {
  const document = documentRoute(hash);
  if (document) return viewHash(document.view, document.id);
  const address = parseScreenHash(hash);
  return address ? viewHash(address.view) : null;
}

/** The screen a "#/<view>" address names (with or without its own place and filters); null for any other fragment. */
export function viewFromHash(hash: string): string | null {
  return documentRoute(hash)?.view ?? parseScreenHash(hash)?.view ?? null;
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
