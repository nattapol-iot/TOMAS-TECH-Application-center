# master

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `4e791abf`; generated, do not edit. [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/master/employees` | 169–224 |
| POST | `/api/v1/master/employees` | 226–245 |
| PUT | `/api/v1/master/employees/:id` | 247–277 |
| POST | `/api/v1/master/customers` | 279–296 |
| PUT | `/api/v1/master/customers/:id` | 298–343 |
| POST | `/api/v1/master/suppliers` | 345–376 |
| POST | `/api/v1/master/inventory-items` | 378–425 |
| POST | `/api/v1/master/engineering-rates` | 427–485 |
| POST | `/api/v1/master/suppliers/find-or-create` | 489–538 |
| PUT | `/api/v1/master/suppliers/:id` | 540–576 |
| DELETE | `/api/v1/master/suppliers/:id` | 578–604 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 41–43 |
| `requiredCode` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 45–51 |
| `email` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 53–59 |
| `booleanBody` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 61–64 |
| `nonnegativeDecimal` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 66–74 |
| `normalizedBrands` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 76–87 |
| `employeeInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 89–113 |
| `bindEmployee` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 115–124 |
| `syncEmployeeDirectoryUser` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 126–135 |
| `customerInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 137–158 |
| `bindCustomer` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 160–166 |
| `registerMasterRoutes` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 168–605 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.employees`, `dbo.engineering_rates`, `dbo.mat_items`, `dbo.roles`, `dbo.supplier_quotations`, `dbo.suppliers`, `dbo.sync_employee_directory_user`, `dbo.user_business_roles`, `dbo.user_effective_permissions`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
