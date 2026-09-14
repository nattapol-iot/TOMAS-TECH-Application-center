# sales-customers

[Module](../modules/master.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `32e38249`; generated, do not edit. [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/sales/customers/:customerId/contacts` | 219–232 |
| POST | `/api/v1/sales/customers` | 234–275 |
| POST | `/api/v1/sales/customers/:customerId/contacts` | 277–287 |
| PUT | `/api/v1/sales/customers/:customerId/contacts/:contactId` | 289–328 |
| DELETE | `/api/v1/sales/customers/:customerId/contacts/:contactId` | 330–348 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `clean` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 18–21 |
| `localizedNameInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 23–36 |
| `contactTitleInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 39–45 |
| `email` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 47–53 |
| `customerCodeFromName` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 64–69 |
| `generatedCustomerCode` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 72–74 |
| `customerCodeVariant` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 76–79 |
| `salesCustomerInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 80–96 |
| `salesContactInput` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 98–100 |
| `demandSalesCustomerPermission` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 102–110 |
| `activeCustomer` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 112–118 |
| `contactSite` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 120–137 |
| `createContact` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 139–152 |
| `syncPrimaryCustomerContact` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 163–186 |
| `activeContact` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 189–197 |
| `syncCustomerHeader` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 201–206 |
| `assertContactUnique` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 208–217 |
| `registerSalesCustomerRoutes` | [backend-node/src/routes/sales-customers.ts](<../../../backend-node/src/routes/sales-customers.ts>) | 218–349 |

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
