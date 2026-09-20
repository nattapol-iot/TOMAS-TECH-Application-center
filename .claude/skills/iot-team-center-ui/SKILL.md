---
name: iot-team-center-ui
description: Build or change a screen in the IoT Team Center frontend. Use when editing anything under app/system/**, adding a panel, table, modal or filter bar, fixing layout or responsive behaviour, or when a screen shows the wrong language. Carries this repo's design tokens, shared components, i18n rules and the traps that have actually broken screens here.
---

# IoT Team Center — screen work

The frontend is a single design system in `app/globals.css` plus shared components in
`app/system/ui.tsx`. Screens live in `app/system/production/*.tsx`. Before writing any CSS or any
user-visible string, read this.

## The one rule that prevents most rework

**Do not invent tokens, colours, sizes or components.** Every screen that has read as "a different
product" did so because a module invented its own. Check `app/globals.css` and `app/system/ui.tsx`
first; add to them only when the shape genuinely does not exist yet.

## Tokens (`app/globals.css`, `:root`)

| Group | Names |
|---|---|
| Neutrals | `--n-0` `--n-25` `--n-50` `--n-100` `--n-150` `--n-200` `--n-300` `--n-400` `--n-500` `--n-600` `--n-700` `--n-800` `--n-900` |
| Semantic | `--ink` `--ink-soft` `--muted` `--line` `--line-soft` `--surface` |
| Accents | `--blue` `--blue-hover` `--blue-soft` `--blue-line` `--blue-text`, and the same `-soft/-line/-text` triple for `green` `amber` `red` `violet` |
| Type | `--fs-3xs` 10 · `--fs-2xs` 11 · `--fs-xs` 12 · `--fs-sm` 13 · `--fs-md` 14 · `--fs-lg` 16 · `--fs-xl` 19 · `--fs-2xl` 24 |
| Radius | `--r-xs` 4 · `--r-sm` 6 · `--r-md` 8 · `--r-lg` 12 · `--r-pill` |
| Charts | `--c1` … `--c8` |

**`--navy` and `--text` do not exist.** They appear in older module stylesheets and silently fall
through to a hardcoded fallback, or to nothing at all. If you see them, you are looking at a
module that predates the token set; replace them with `--ink` / `--ink-soft`.

Audit a stylesheet you touched: `grep -c "#[0-9a-fA-F]\{3,6\}" <file>` should be 0 or close to it.

## Shared components (`app/system/ui.tsx`)

`Icon` `Badge` `Pill` `Avatar` `Person` `PageHeader` `Panel` `KpiCard` `SummaryTile` `Progress`
`ProgressCell` `Tabs` `Toolbar` `SearchInput` `Select` `Field` `EmptyState` `Modal` `Drawer` `Menu`
`BarChart` `HBarList` `Donut` `LineChart` `Sparkline` `Toast` `StatusLegend` `GridControls`
`TablePageSize` `usePaged` `Pagination`

`Modal` sizes: `sm` 460 · `md` 640 · `lg` 940 · `xl` 1240 · `wide` 92vw · `full`. A dialog with an
editable table of more than about six columns needs `xl`; `lg` puts the arithmetic behind a
horizontal scrollbar.

`Panel`, `Field`, `EmptyState`, `Modal` and `SearchInput` **translate their own props** — pass the
English key, never a pre-translated string.

## Breakpoints

`1280` `1180` `980` `900` `760` `720` `640` `620` `460`. The common ladder is **1280 / 980 / 720 /
620**; `.kpi-grid` already goes 4 → 2 (≤1280) → 1 (≤720). Reuse an existing breakpoint rather than
adding a ninth.

## Overviews

Dense and chart-based, not rows of large number cards. A stacked bar or small bars beat one card
per figure, and every segment or chip should set the filter it describes. `.kpi-grid` + `KpiCard`
is still right for a handful of genuinely headline counts.

## i18n — the rule that breaks screens most often

`app/system/i18n.ts` holds `DICTIONARY`, merged in this order with the module copy files — later
spreads win on a duplicate key, so check for an existing entry before adding one:

```
app/system/production/historical-pr-copy.ts
app/system/estimate-workspace-copy.ts
app/system/site-visit-copy.ts
app/system/operations-workspace-copy.ts
app/system/remaining-workspace-copy.ts
app/system/input-hints-copy.ts
app/system/final-workspace-copy.ts
app/system/production/crm-copy.ts          ← merged last
```

`app/system/production/labor-package-copy.ts` is **not** merged: `LaborPackageMaster` carries its
own dictionary and its own `t`, which falls back to the key with no alias map at all.

Rendering a string:

- JSX text → `<LocalizedText text={"English key"} />`
- an attribute (`placeholder`, `title`) or an `<option>` → `const t = useT();` then `t("key")`
- component props (`Panel title`, `Field label`, `EmptyState message`) → pass the key, the
  component translates

**Three ways a string silently stays English:**

1. **Bare JSX text or a bare attribute** — never reaches the dictionary at all.
2. **A template literal** — `` subtitle={`${n} lines in "${name}"`} `` can never be a key. Restructure:
   keep the values outside and translate only the fixed words.
3. **Wrapped but with no entry** — `translate()` returns `entry.en ?? key`, so a missing entry
   looks exactly like a working English string. This is the one that hides.

Resolution order (`translate()` in `i18n.ts`): **exact key first**, then an alias map built from
every `key`, `en`, `th` and `jp` value, normalised as
`trim().replace(/\s+/g," ").replace(/\s*\*$/,"").toLocaleLowerCase("en")`, **first insertion
wins**.

Consequences:

- Two keys differing only in case collide. `"Engineering Cost"` resolved to an eyebrow key with no
  `en` and printed the key itself; matching the existing `"Engineering cost"` was the whole fix.
- Never add a one- or two-character key — it hijacks the alias map.
- A key's `th`/`jp` values alias too, so renaming a key is not enough to free a word.
- One key cannot carry two meanings. `"Effective"` is a date-window column header; the rate status
  badge needed its own words rather than a second meaning welded onto it.

**Before finishing, check coverage rather than reading.** Extract the keys a file asks for and
resolve them the way `translate()` does — exact, then normalised alias. A missing entry is
invisible in an English session.

## Tables

- `tbody td` and `thead th` are `white-space: nowrap` by default; `td.wrap` opts out.
- `.cell-primary` gives a two-line cell with ellipsis — but **ellipsis needs a bounded column**.
  With the default `table-layout: auto` a non-wrapping cell sets its own width and pushes the
  table past its container. Fix by making the table `table-layout: fixed`, not by removing nowrap.
- `.sheet` is the editable spreadsheet style: `table-layout: fixed` **and `tbody td { padding: 0 }`**
  so an input fills the cell edge to edge. A `.sheet` table that shows mostly text will have its
  figures sitting flat against the column rules — restore padding for that table, or wrap the
  content in `.cell-text`.
- With `.sheet`, declared `<th>` widths are authoritative and `width: 100%` makes them proportional
  when the container is wider. Set `minWidth` on the table for the sum of the columns.
- Frozen columns: copy the `.cost-sheet` / `.manhour-sheet` pattern. **Rows that span the table
  (group bands, "add" links, subtotals) have no frozen cell, so their text slides through the
  pinned zone** — pin their first cell at `left: 0` too.
- Hiding columns behind a toggle: keep a `columnCount` and check every row type renders the same
  number of cells. Header, data, variant rows and any inline draft row must all agree.

## Modals holding a master-detail

Two panes that each scroll inside a body that also scrolls gives the user two scrollbars and no
idea which one they are driving. Let the dialog set the height, give the panes
`flex: 1; min-height: 0`, and put a `min-height` floor under them so a run of info strips makes the
body scroll instead of crushing the panes.

## Data shapes worth knowing before designing

- **A cost item's discipline and module are columns on the row** (`cost_items.category_code`,
  `cost_items.module`) — there is no module or discipline table. An empty module or an empty
  discipline cannot be stored, which is deliberate and stated in the UI: *"Main Module จะถูกบันทึกจริง
  เมื่อ Item แรกถูกสร้าง เพื่อไม่ให้เกิดโมดูลว่างในฐานข้อมูล"*. The same holds for man-hour work packages. So a
  filter bar over these can only report what exists; it must not present empty containers as if
  they were real.
- Permissions resolve through `dbo.user_effective_roles` / `dbo.user_effective_permissions`. Never
  join `role_id` on the user row — that reads the primary role only and hides everything granted
  by an additional role.

## React constraints in this repo

- `react-hooks/set-state-in-effect` is enforced. Derive at render instead:
  `const active = valid(x) ? x : fallback;` rather than an effect that corrects state.
- jsx-a11y is enforced. Do not put `role="tablist"` on a `<nav>`; the shared `Tabs` uses `<div>`.
  A clickable row is `<tr className="clickable" onClick={...}>` — that pattern already passes.

## Editing these files

`EstimateScreens.tsx` is ~240KB of dense single-line JSX. Edit it with a script that asserts an
exact match count and fails loudly, not with a loose regex:

- The working copy is **CRLF**. Normalise to `\n`, edit, write back CRLF.
- Python's `io.open(...).read()` uses universal newlines and silently converts CRLF→LF. Pass
  `newline=""` for **both** read and write, or use Node.
- Anchoring on `"<th"` also matches `<thead>`. Anchor on something unambiguous and verify the
  match count before writing.

## Finishing

Run once, at the end, one at a time — this machine has 15 GB RAM:

```
npx tsc --noEmit
npx eslint <changed files>
node --test --test-isolation=none tests/*.test.mjs
```

`tests/production-guardrails.test.mjs` pins UI strings, menu entries and class names. If a
guardrail breaks, check whether the assertion was too tight before changing the screen back — an
assertion pinning a whole `className` attribute will break the moment a second class is added.
