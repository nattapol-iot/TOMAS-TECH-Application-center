# AI change workflow

[Context index](../../AGENTS.md)

## Minimal read packet

Read AGENTS.md → one module card → one API card → selected function body and the helpers it calls. The module and API maps provide source ranges; use a symbol search if line numbers drift. Expand to a second module only when an actual dependency crosses its boundary.

Example task prompt:

> อ่าน AGENTS.md ก่อน แก้ปัญหา Copy Estimate โดยเริ่มที่ docs/context/modules/estimate-copy.md อ่านเฉพาะ handler และ helper ที่เกี่ยวข้อง รักษาสิทธิ์ transaction และต้นทางเดิม รันทดสอบเฉพาะเรื่อง แล้วอัปเดต context เมื่อจบ

Do not auto-import every module into AGENTS.md or CLAUDE.md. Avoid reading COORDINATION.md, FEATURES.md and all historical audits at session startup. Search those only for a specific unresolved requirement.

## Before editing

- Check repository root, branch, git status and remote. Preserve unrelated work. Folder names and old PID records do not establish the active checkout.
- Choose function, its caller, API contract and database objects. A shared screen is not exclusively owned by one module.
- Keep permission, record scope, rowVersion, monetary guard, revision, audit and file identity behavior intact unless the task explicitly changes them.
- Treat requests, design proposals, implemented code and deployment evidence as different states.

## How-to guide — part of every user-facing change

The owner's rule (2026-11-02): a new feature or function ships with its How-to guide, in the same PR.

1. Open `app/system/production/guide-catalog.ts`. Find the guide for the flow you changed, or add a new guide with an `area`, its `permissions`, its `views` and steps in Thai, English and Japanese.
2. Mark every element a step points at: `data-guide="area.thing"` on the element, or the `guide` prop on `Field`, `Panel` or `SearchInput`. Tabs are reached as `[data-tab="id"]`.
3. A redesign keeps the marks, or moves them to the new element. Do not delete a step because its button moved.
4. A new menu screen needs a guide, or a one-line reason in `NO_GUIDE`.
5. Run `node --test tests/guides.test.mjs`. It checks every target, every language, and every menu screen.

## Focused verification

Read current package.json scripts first. Root `npm test` currently runs lint, typecheck and root tests; it does **not** build. The command definition is the evidence for what actually runs.

```powershell
# One root test; select the actual filename from the module card
node --test tests/estimate-copy-assignment-contract.test.mjs
# One backend test, from backend-node/
node --import tsx --test tests/estimate-copy-route.test.ts
```

Run heavier checks sequentially according to AGENTS.md. Root tests can invoke SQL integration; inspect flags and target safeguards before running them. Unit/static checks do not replace authenticated UAT. For document-only updates, validate links, routing coverage and generated reproducibility instead of rebuilding the application.

## Keep context current

From the repository root:

```powershell
node docs/context/generate.mjs
git diff -- AGENTS.md docs/context
```

The generator uses the already installed TypeScript parser. It does not connect to databases or execute application code. It replaces only the PROJECT-CONTEXT marker block in AGENTS.md and regenerates module cards, API cards and the schema map. Rules outside the marker block are preserved. CLAUDE.md imports AGENTS.md; PROJECT_CONTEXT.md is only a compatibility pointer. It rejects unassigned route files. When adding a route, update the module mapping in generate.mjs; when deleting a route, remove its obsolete card explicitly after review. Curated ARCHITECTURE.md, WORKFLOW.md and ANALYSIS.md must be maintained manually.

Do not edit generated cards by hand. Snapshot is HEAD at generation time; uncommitted source changes are included in extraction. Commit code and regenerated context together, and use git diff as the authority when working-tree changes exist.

## Context limits

AST extraction covers literal `get/post/put/patch/delete/head/options` calls and named top-level functions/arrows. It does not establish dynamic endpoints, nested callbacks, helper write sets or runtime availability. Tables are literal dbo references, not an ERD. Test lists are filename-selected candidates, not proof of coverage. Generated links point to source files; line ranges are human/tool hints.
