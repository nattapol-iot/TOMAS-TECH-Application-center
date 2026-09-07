"use client";

import { useT } from "./i18n";

/** Static interface copy; never pass user-entered content or API identifiers here. */
export function LocalizedText({ text }: { text: string }) {
  return useT()(text);
}
