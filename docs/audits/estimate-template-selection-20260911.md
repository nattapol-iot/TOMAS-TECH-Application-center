# Estimate template selection — diagnosis and fix, 11 September 2026

Reported: a template cannot be selected or imported into Estimate Cost.

Worktree `C:/Work/IoT-template-selection-20260911`, branch
`claude/estimate-template-selection-20260911`, based on candidate commit `17b8fb4e`.
Frontend, API, database, migrations and deployment were not touched. Authentication
and every permission check are unchanged.

## Summary

Two separate things are wrong, and they look the same from the estimator's chair.

1. **The material/module template picker is broken for anyone who is not the
   estimate owner.** It always asked the API to put the new cost lines in the
   *estimate owner's* name. An engineer working a section assigned to them is not
   allowed to do that, so the apply was refused after the form had already been
   filled in. Fixed.
2. **The labor work package picker cannot work on this database at all.** Reusable
   labor packages need migration 044, and the live Team Test database is still at
   schema 43, so the API correctly answers `503 labor_packages_unavailable`. That
   is an environment fact, not a code defect, and applying the migration is out of
   scope here. What was wrong was the picker's own empty state, which told the
   estimator to go and build a package — at a button that answers 503 as well.
   The picker now says the library is unavailable on this database.

The same owner defect also sits in the labor picker (finding 2b), where it is
currently masked by the missing migration and would surface the moment 044 is
applied.

## Environment, verified live and read-only

| Probe | Result |
| --- | --- |
| `GET http://localhost:5116/health/live` | `200` `{"status":"ok","service":"IoTTeamCenter.NodeApi"}` |
| `GET http://localhost:5116/health/ready` | `200` `{"status":"ready","schemaVersion":43,"documentStorage":"available"}` |
| `GET http://localhost:5116/api/v1/module-templates` (no credentials) | `401 unauthenticated` |

`database/migrations/044_estimate_labor_masters.sql` exists in the repository and
has **not** been applied. Migration 044 is reserved rather than required, so the
API reports ready at schema 43 — that is intended.

No authenticated end-to-end reproduction was possible: this session has no Team
Test credentials and did not create any. Everything below is established from the
source and the route contracts, plus the unauthenticated probes above.

## Finding 1 — module template apply always claimed the estimate owner (fixed)

`ApplyModuleTemplateModal` posted the estimate header's owner as the owner of every
line it created:

```tsx
await onApply({ …, ownerId: workspace.header.ownerId, … });
```

`POST /api/v1/estimates/:id/apply-template`
(`backend-node/src/routes/estimate-cost-write.ts`) authorises that exactly as it
authorises a hand-typed line. For an actor who is not *elevated* — `elevated()` is
the estimate owner, an Engineering Manager or an Admin — the posted owner must be
the section assignment's `owner_id` or `support_id`:

```ts
if (ownerId !== Number(assignment!.owner_id) && ownerId !== Number(assignment!.support_id)) {
  throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a cost line to a user outside your assigned section.");
}
```

So for every engineer who is working an assigned section of somebody else's
estimate, the apply was refused with `403 cost_owner_forbidden` — after the
template had been chosen, the module named and the set count entered. The picker
has no owner field, so there was no way to correct it from the screen.

The rest of the Estimate Cost screen already gets this right: `CostItemEditor` and
`ManhourEditor` narrow the owner list to the current user when
`canEditAllSections` is false, and fall back to `bootstrap.user.id`. The picker
never adopted that rule.

**Fix.** The rule now lives in one place, `lib/estimate-ux.ts`:

```ts
export function estimateApplyOwnerId(capabilities, estimateOwnerId, currentUserId) {
  return capabilities.canEditAllSections ? estimateOwnerId : currentUserId;
}
```

`ownerId = actor.id` satisfies the API for an assigned engineer whether they are
the assignment's owner or its support, and the elevated case is unchanged, so the
estimate owner, Engineering Manager and Admin keep writing lines for the estimate
owner exactly as before.

## Finding 2 — labor package apply, same cause, stricter rule (fixed)

`ApplyLaborPackageModal` posted `ownerId: workspace.header.ownerId` too. The labor
lane is stricter still — `demandNewSection`
(`backend-node/src/routes/estimate-workspace-write.ts`) requires the posted owner
to be the actor themselves:

```ts
if (ownerId !== actor.id || !await hasSection(...)) {
  throw new ApiError(403, "estimate_section_forbidden", …);
}
```

so a non-elevated estimator could never apply a package, with no exception for the
support engineer. Fixed with the same shared rule. This is latent today: the
picker cannot reach the authorisation check while migration 044 is missing.

## Finding 3 — the picker offered templates it could not apply (fixed)

The picker lists templates filtered only by `status=Active`. It did not consider
which estimate sections the estimator may write, and the list shows a template's
*primary* discipline while the API checks **every distinct discipline across the
template's lines**. A template whose lines reach into a section the estimator does
not hold was therefore selectable, previewable and only refused at apply time with
`403 estimate_section_forbidden`.

**Fix.** `moduleTemplateApplyBlocker()` in `lib/estimate-ux.ts` reads every loaded
line's `categoryCode`, and the modal shows the reason and disables Apply as soon as
a template is selected. It mirrors the existing `packageApplyBlocker()` in
`lib/labor-master.ts`, including the retired / unpublished / empty cases.

Nothing was relaxed: a draft template is still invisible to the picker and still
refused by the API with `module_template_not_published`, and publishing still
requires `master.write`.

## Finding 4 — labor packages are blocked by migration 044 (documented, UI clarified)

The API's handling is already correct and was left alone
(`backend-node/src/routes/labor-packages.ts`):

```ts
throw new ApiError(503, "labor_packages_unavailable",
  "Reusable labor packages need database migration 044, which this database does not have yet. …");
```

The picker showed that message, and then also rendered
*"No labor package is published yet. Build one from an existing work package with
Save as labor package."* — which reads as an empty library and sends the estimator
at a button that answers 503 as well.

**Fix.** A `503 labor_packages_unavailable` is now distinguished from an empty
library by its error code and rendered as an explicit unavailable state carrying
the API's own message; the search controls and the build-one call to action are
not shown.

**Still blocked.** Reusable labor packages remain unusable until migration 044 is
applied to the Team Test database. That is a remote schema change and was not
performed. No missing table was masked, faked or worked around.

## Finding 5 — the same owner pattern in sibling import paths (observed, not fixed)

`ownerId: workspace.header.ownerId` also appears in three other Estimate Cost
paths that were outside this assignment's boundary:

| Path | Site | Backend rule |
| --- | --- | --- |
| Copy Previous Estimate | `EstimateScreens.tsx` `onCopyFrom` | `estimate-copy.ts` — same `cost_owner_forbidden` check |
| Legacy Excel import | `EstimateScreens.tsx` `ImportCostItemsModal` seeds | `POST /cost-items` — same check |
| Price Library pick | `EstimateScreens.tsx` `costSeedFromLine(record.item, workspace.header.ownerId, …)` | `POST /cost-items` — same check |

The Cost Items and Man-hour quick-add rows compute `defaultOwnerId` from the
estimate owner without the capability filter the editors apply, but there the row
carries an owner select, so the estimator can correct it.

These are the same defect and each is a one-line change with the shared helper.
They belong to the copy, Excel-import and price-library features rather than to
template selection, so they are recorded here for whoever owns those flows rather
than changed in this branch.

## Checked and found sound

- Authentication: unauthenticated `/api/v1/module-templates` still `401`. No
  credential, token or signing secret was read or created.
- Published/active filtering and revision control on both template types.
- Row-version handling on the apply path — unchanged.
- List and total pagination share one filter text (already pinned by
  `backend-node/tests/module-template-contract.test.ts`).

## Changes

| File | Change |
| --- | --- |
| `lib/estimate-ux.ts` | New `estimateApplyOwnerId`, `estimateForbiddenSections`, `moduleTemplateApplyBlocker`. |
| `app/system/production/EstimateScreens.tsx` | `ApplyModuleTemplateModal` takes `currentUserId`, resolves the apply owner through the shared rule, and shows a blocker before the form is filled in. |
| `app/system/production/LaborPackagePicker.tsx` | Same owner rule; `503 labor_packages_unavailable` rendered as an unavailable state instead of an empty library. |
| `tests/estimate-template-selection.test.mjs` | New — the owner rule, the section rule, and a source guard against reintroducing `ownerId: workspace.header.ownerId` in either picker. |

## Verification

| Check | Result |
| --- | --- |
| `npm test` (lint + typecheck + full frontend suite) | **276 pass, 0 fail, 0 skipped** |
| `npm run typecheck` | clean |
| `npm run build:local` (isolated worktree, managed frontend untouched) | exit 0, build complete |
| New suite `tests/estimate-template-selection.test.mjs` | 8 pass |
| Negative control on the source guard | reverting the template picker to `ownerId: workspace.header.ownerId` fails the suite by name (`ApplyModuleTemplateModal line 54 …`); reverted back |

Backend sources were read but not modified, so `backend-node` tests were not run.

## Candidate integration

Codex integrated the reviewed frontend changes and regression tests into the local
candidate on 2026-09-11. Candidate `npm test` passed lint, typecheck and all 276
tests. Evidence: `.omx/runtime/template-integration-test.log`.
The running frontend at http://127.0.0.1:3010 returned HTTP 200 and served the
updated EstimateScreens module containing both owner resolution and template
blocker helpers. API readiness returned ready, schemaVersion 43. No database
migration was performed. Authenticated browser application remains unverified.
