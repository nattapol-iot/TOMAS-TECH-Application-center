# sales-customers

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1e58594b`; generated, do not edit. [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/sales/customers/:customerId/contacts` | 164–177 |
| POST | `/api/v1/sales/customers` | 179–199 |
| POST | `/api/v1/sales/customers/:customerId/contacts` | 201–211 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 18–21 |
| `localizedNameInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 23–36 |
| `contactTitleInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 39–45 |
| `email` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 47–53 |
| `salesCustomerInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 55–71 |
| `salesContactInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 73–75 |
| `demandSalesCustomerPermission` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 77–85 |
| `activeCustomer` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 87–93 |
| `contactSite` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 95–112 |
| `createContact` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 114–127 |
| `syncPrimaryCustomerContact` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 138–161 |
| `registerSalesCustomerRoutes` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 163–212 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_site_contacts`, `dbo.customer_sites`, `dbo.customers`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
