import { CHART_SERIES_TOKEN, TOKEN_KIND_ORDER, TOKEN_KIND_TITLES, TOKEN_PREFIX_KINDS } from "../config/design-system.constants";
import type { DesignToken, TokenFamily, TokenKind } from "../types/design-system.types";

function rootDeclarations(): Map<string, string> {
  const declared = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin sheets (web fonts) refuse to be read; they declare no tokens.
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ":root") continue;
      for (const name of Array.from(rule.style)) if (name.startsWith("--")) declared.set(name, rule.style.getPropertyValue(name).trim());
    }
  }
  return declared;
}

function kindOf(name: string, resolved: string): TokenKind {
  const prefixed = TOKEN_PREFIX_KINDS.find(([prefix]) => name.startsWith(prefix));
  if (prefixed) return prefixed[1];
  return CSS.supports("color", resolved) ? "color" : "size";
}

function familyOf(token: DesignToken): Pick<TokenFamily, "key" | "title"> {
  if (token.kind !== "color") return { key: token.kind, title: TOKEN_KIND_TITLES[token.kind] };
  if (token.declared.startsWith("var(")) return { key: "color:alias", title: "DS.aliasColors" };
  if (CHART_SERIES_TOKEN.test(token.name)) return { key: "color:chart", title: "DS.chartColors" };
  const family = token.name.slice(2).split("-")[0];
  return { key: `color:${family}`, title: `--${family}-*` };
}

/** Every custom property on :root, as the browser resolves it now, so the page follows globals.css without a copy. */
export function readTokenFamilies(): TokenFamily[] {
  const computed = getComputedStyle(document.documentElement);
  const families = new Map<string, TokenFamily>();
  for (const [name, declared] of rootDeclarations()) {
    const resolved = computed.getPropertyValue(name).trim();
    const token: DesignToken = { name, declared, resolved, kind: kindOf(name, resolved) };
    const { key, title } = familyOf(token);
    const family = families.get(key) ?? { key, kind: token.kind, title, tokens: [] };
    family.tokens.push(token);
    families.set(key, family);
  }
  return [...families.values()].sort((a, b) => TOKEN_KIND_ORDER.indexOf(a.kind) - TOKEN_KIND_ORDER.indexOf(b.kind));
}
