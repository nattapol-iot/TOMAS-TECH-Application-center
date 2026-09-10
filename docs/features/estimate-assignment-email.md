# Estimate assignment email

Estimate owners, Engineering Managers and Administrators can create an assignment
for any unassigned cost section from the **Assignment** tab. A section can be
assigned before it has cost lines. The write is concurrency checked and audited.

When an assignment is created, the responsible engineer and optional support
engineer are notified. On a later edit, only people newly added to the assignment
are notified; status, progress, comment and due-date-only edits do not generate
duplicate mail.

The database transaction commits before email delivery. A Microsoft Graph outage
therefore cannot roll back or lose an assignment. The API response and frontend
toast distinguish `sent`, `failed`, `disabled`, and `not_required` delivery states.
There is currently no durable retry queue: a failed response tells the coordinator
to notify the assignee manually.

## Microsoft Graph production configuration

Use a dedicated confidential application and sender mailbox. Grant the application
permission `Mail.Send`, obtain tenant admin consent, and restrict the application's
Exchange Online scope to the dedicated sender mailbox. Microsoft documents the
[`POST /users/{id}/sendMail`](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
contract and [Exchange Online application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).

Supply secrets only through the API host's protected configuration channel:

```text
Email__Mode=MicrosoftGraph
Email__TenantId=<TENANT_GUID>
Email__ClientId=<CONFIDENTIAL_APP_CLIENT_GUID>
Email__ClientSecret=<SECRET>
Email__SenderUser=iot-team-center@tomastc.com
Email__ApplicationBaseUrl=https://<FRONTEND_HOST>
```

The service uses the OAuth 2.0 client-credentials flow with the
`https://graph.microsoft.com/.default` scope. Token and send requests time out
after ten seconds. Access tokens are cached in process memory and secrets are never
written to source, logs, SQL Server or the frontend.

Team Test launchers explicitly set `Email__Mode=Disabled`; this prevents UAT actions
from emailing real employees. Enable and test production mail only after the sender
mailbox, permission scope and administrator consent have been approved.
