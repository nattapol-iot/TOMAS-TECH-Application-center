"use client";

import { API_BASE_URL } from "./api-origin";
import {
  TMT_ID_LOGIN_PATH,
  TMT_ID_LOGOUT_PATH,
  TMT_ID_ME_PATH,
  TMT_ID_ME_TIMEOUT_MS,
} from "./tmt-id.constants";
import type { TmtIdSessionState, TmtIdUser } from "./tmt-id.types";

export function currentAppPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

// A full-page navigation, never fetch: the browser has to follow the provider's
// redirects itself and let it set cookies on its own origin, which an XHR
// cannot do.
export function redirectToTmtIdLogin(next: string): void {
  window.location.assign(
    `${API_BASE_URL}${TMT_ID_LOGIN_PATH}?next=${encodeURIComponent(next)}`,
  );
}

export function redirectToTmtIdLogout(): void {
  window.location.assign(`${API_BASE_URL}${TMT_ID_LOGOUT_PATH}`);
}

export async function loadTmtIdSession(): Promise<TmtIdSessionState> {
  const response = await fetch(`${API_BASE_URL}${TMT_ID_ME_PATH}`, {
    // The session lives in a cookie the API origin owns, so a split-origin
    // deployment only sends it when the request opts into credentials.
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TMT_ID_ME_TIMEOUT_MS),
  });
  if (response.status === 401) return { status: "signed-out" };
  // Any other failure is an outage, not a verdict on the visitor, so the
  // workspace renders instead of bouncing the person to the provider.
  if (!response.ok) return { status: "unavailable" };
  return { status: "signed-in", user: (await response.json()) as TmtIdUser };
}