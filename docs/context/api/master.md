# master

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `056c73a4`; generated, do not edit. [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/master/employees` | 168–223 |
| POST | `/api/v1/master/employees` | 225–244 |
| PUT | `/api/v1/master/employees/:id` | 246–276 |
| POST | `/api/v1/master/customers` | 278–295 |
| PUT | `/api/v1/master/customers/:id` | 297–340 |
| POST | `/api/v1/master/suppliers` | 342–371 |
| POST | `/api/v1/master/inventory-items` | 373–420 |
| POST | `/api/v1/master/engineering-rates` | 422–480 |
| POST | `/api/v1/master/suppliers/find-or-create` | 484–533 |
| PUT | `/api/v1/master/suppliers/:id` | 535–569 |
| DELETE | `/api/v1/master/suppliers/:id` | 571–596 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `validation` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 40–42 |
| `requiredCode` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 44–50 |
| `email` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 52–58 |
| `booleanBody` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 60–63 |
| `nonnegativeDecimal` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 65–73 |
| `normalizedBrands` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 75–86 |
| `employeeInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 88–112 |
| `bindEmployee` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 114–123 |
| `syncEmployeeDirectoryUser` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 125–134 |
| `customerInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 136–157 |
| `bindCustomer` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 159–165 |
| `registerMasterRoutes` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 167–597 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/engineering-rate-access.ts](<../../../backend-node/src/engineering-rate-access.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customers`, `dbo.employees`, `dbo.engineering_rates`, `dbo.mat_items`, `dbo.permissions`, `dbo.role_permissions`, `dbo.roles`, `dbo.supplier_quotations`, `dbo.suppliers`, `dbo.sync_employee_directory_user`, `dbo.user_business_roles`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
