# master

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `fbce5309`; generated, do not edit. [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/master/employees` | 266–381 |
| POST | `/api/v1/master/employees` | 383–406 |
| PUT | `/api/v1/master/employees/:id` | 408–446 |
| POST | `/api/v1/master/customers` | 448–497 |
| PUT | `/api/v1/master/customers/:id` | 499–587 |
| GET | `/api/v1/master/suppliers` | 591–644 |
| POST | `/api/v1/master/suppliers` | 646–683 |
| POST | `/api/v1/master/inventory-items` | 685–740 |
| POST | `/api/v1/master/engineering-rates` | 742–808 |
| POST | `/api/v1/master/suppliers/find-or-create` | 812–873 |
| PUT | `/api/v1/master/suppliers/:id` | 875–916 |
| DELETE | `/api/v1/master/suppliers/:id` | 918–945 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `filterValues` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 43–49 |
| `filterChoices` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 51–55 |
| `facetsOf` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 58–59 |
| `validation` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 114–116 |
| `requiredCode` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 118–124 |
| `email` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 126–132 |
| `booleanBody` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 134–137 |
| `nonnegativeDecimal` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 139–147 |
| `normalizedBrands` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 149–163 |
| `employeeInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 165–189 |
| `bindEmployee` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 191–208 |
| `syncEmployeeDirectoryUser` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 210–221 |
| `customerInput` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 223–250 |
| `bindCustomer` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 252–263 |
| `registerMasterRoutes` | [backend-node/src/routes/master.ts](<../../../backend-node/src/routes/master.ts>) | 265–946 |

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
