/*
 * Scopes the @tomas-tc/ui stylesheet to the screens that use it (app/system/tomas-ui/tomas-ui-island.css).
 *
 * The package ships Tailwind's preflight and its tokens on :root, html and body. Loaded as they are, they would restyle
 * every screen of the app, and the app's own unlayered rules (button, input, table, h1 …) would beat the package's
 * layered utilities. So, for that one file only, after Tailwind has built it:
 * - every @layer block is unwrapped, in order, so the package's rules are unlayered like the app's;
 * - :root, :host, html and body become the island root, .tui;
 * - every other selector is put under .tui, which also lifts it one class above the app's element rules.
 * @keyframes, @property, @font-face and @page are left as they are: they style nothing by themselves.
 */
export const TOMAS_UI_ROOT = ".tui";
const ISLAND = /tomas-ui-island\.css$/;
const ROOTS = /^(?::root|:host|html|body)(?![\w-])/;
const KEEP = new Set(["keyframes", "-webkit-keyframes", "property", "font-face", "page", "counter-style"]);

/** One selector of a list, under the island root. */
export function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(TOMAS_UI_ROOT) && !/^\.tui[\w-]/.test(trimmed)) return trimmed;
  if (ROOTS.test(trimmed)) {
    const rest = trimmed.replace(ROOTS, "");
    // :root:has(x) and html:has(x) keep their condition on the island root; ":root .x" keeps its descendant.
    return `${TOMAS_UI_ROOT}${rest}`;
  }
  return `${TOMAS_UI_ROOT} ${trimmed}`;
}

/** Splits a selector list on its top-level commas (not the ones inside :is(), :where() or [attr="a,b"]). */
export function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (quote) {
      if (char === quote && list[index - 1] !== "\\") quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function insideKept(node) {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === "atrule" && KEEP.has(parent.name.toLowerCase())) return true;
  return false;
}

/** @type {import("postcss").PluginCreator<{ match?: RegExp }>} */
export default function tomasUiScope(options = {}) {
  const match = options.match ?? ISLAND;
  return {
    postcssPlugin: "tomas-ui-scope",
    OnceExit(root) {
      const file = root.source?.input?.file ?? "";
      if (!match.test(file.replace(/\\/g, "/"))) return;
      // Unwrap from the inside out so nested layers keep their order.
      const layers = [];
      root.walkAtRules("layer", (rule) => {
        layers.push(rule);
      });
      for (const rule of layers.reverse()) {
        if (rule.nodes && rule.nodes.length) rule.replaceWith(rule.nodes);
        else rule.remove();
      }
      root.walkRules((rule) => {
        if (insideKept(rule)) return;
        const scoped = [...new Set(splitSelectors(rule.selector).map(scopeSelector))];
        rule.selector = scoped.join(",\n");
      });
    },
  };
}
tomasUiScope.postcss = true;
