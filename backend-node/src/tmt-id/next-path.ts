const PLACEHOLDER_ORIGIN = "https://next.invalid";
const PROTOCOL_RELATIVE = /^[/\\]{2}/;
const MAXIMUM_LENGTH = 2048;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// A relative path is the only safe redirect target for ?next: an absolute URL,
// a protocol-relative "//host" (which "/\host" also becomes once the browser
// normalizes backslashes), or an embedded control character all let a caller
// aim the post-login redirect at another origin.
export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const raw = value.trim();
  if (!raw.startsWith("/")) return "/";
  if (raw.length > MAXIMUM_LENGTH) return "/";
  if (PROTOCOL_RELATIVE.test(raw)) return "/";
  if (raw.includes("\\")) return "/";
  if (hasControlCharacter(raw)) return "/";
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}