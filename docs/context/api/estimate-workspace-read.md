# estimate-workspace-read

[Module](../modules/estimate.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `6b6809b`; generated, do not edit. [backend-node/src/routes/estimate-workspace-read.ts](<../../../backend-node/src/routes/estimate-workspace-read.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/estimates/:id/cost-workspace` | 27–195 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `todayIn` | [backend-node/src/routes/estimate-workspace-read.ts](<../../../backend-node/src/routes/estimate-workspace-read.ts>) | 12–16 |
| `shiftDays` | [backend-node/src/routes/estimate-workspace-read.ts](<../../../backend-node/src/routes/estimate-workspace-read.ts>) | 18–20 |
| `registerEstimateWorkspaceReadRoute` | [backend-node/src/routes/estimate-workspace-read.ts](<../../../backend-node/src/routes/estimate-workspace-read.ts>) | 26–196 |

## Direct local dependencies

- [backend-node/src/feature-flags.ts](<../../../backend-node/src/feature-flags.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.cost_items`, `dbo.customers`, `dbo.estimate_assignments`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_revisions`, `dbo.estimates`, `dbo.expense_lines`, `dbo.fn_estimate_validation`, `dbo.inquiries`, `dbo.manhour_lines`, `dbo.other_cost_lines`, `dbo.permissions`, `dbo.role_permissions`, `dbo.roles`, `dbo.suppliers`, `dbo.users`, `dbo.v_estimate_totals`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
