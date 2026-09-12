/** Per-tab and per-account navigation; never stores form data or credentials. */
export function viewStorageKey(userId: number): string {
  return `tomas-tech-view:${userId}`;
}

export function restoredView<T extends string>(
  saved: string | null,
  allowed: readonly T[],
  hash: string,
  verifyCode: string | undefined,
  fallback: T,
): T {
  // Explicit links take precedence, including when their target is forbidden.
  const requested = verifyCode ? "documents"
    : /^#support(?:\/\d+)?$/.test(hash) ? "support"
    : hash === "#activity" ? "activity" : saved;
  return allowed.find(view => view === requested) ?? fallback;
}
