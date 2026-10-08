# schedule-templates

[Module](../modules/planning.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `2704cff8`; generated, do not edit. [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/schedule-templates` | 78–95 |
| POST | `/api/v1/schedule-templates` | 97–113 |
| PUT | `/api/v1/schedule-templates/:id` | 115–133 |
| DELETE | `/api/v1/schedule-templates/:id` | 135–147 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `optionalDays` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 23–29 |
| `parseTemplate` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 31–48 |
| `writeRows` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 50–60 |
| `lockTemplate` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 63–69 |
| `demandUniqueName` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 71–75 |
| `registerScheduleTemplateRoutes` | [backend-node/src/routes/schedule-templates.ts](<../../../backend-node/src/routes/schedule-templates.ts>) | 77–148 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.schedule_template_rows`, `dbo.schedule_templates`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
