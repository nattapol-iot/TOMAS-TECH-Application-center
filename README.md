# IoT Team Center — Engineering Estimate Cost Management System

Internal engineering application for TOMAS TECH: register customer inquiries,
prepare and review engineering estimate cost, reuse supplier prices and control
revisions — replacing the current Excel-based estimate process.

The system controls **internal engineering cost only**. It contains no gross
margin, profit margin, selling price, markup or commercial quotation
calculation anywhere.

## Feature specification

[FEATURES.md](FEATURES.md) is the single reference for the back end: domain model,
numbering standards, every calculation and validation rule, workflows, roles,
the suggested tables and endpoints, and what is still mock.

## Application code

| Path | Contents |
| --- | --- |
| `app/system/App.tsx` | Shell: login, sidebar, global search, notifications, language, routing |
| `app/system/data.ts` | Demonstration dataset (customers, inquiries, estimates, price library, quotations, audit log, rates) |
| `app/system/calc.ts` | Centralised calculation rules, price age, validation and revision comparison |
| `app/system/ui.tsx` | Shared primitives — icons, badges, panels, tabs, drawers, modals, charts |
| `app/system/screens/` | Dashboard, Inquiry, Estimate list, Estimate workspace, Price, Admin screens |
| `app/globals.css` | Design system — navy sidebar, blue primary, green/orange/red status, dense tables |

Material cost is captured in three levels: **discipline** (Hardware, Software,
Electrical, Mechanical, Robot …) → **main module** (Main Control Box, In-feed
Conveyor …) → **items**. Each discipline is a sub-tab of the cost sheet, each
module can be created, renamed and deleted, and items are typed straight into
the sheet under their module.

Effort follows the same shape: **cost type** (Engineering cost / Installation
cost, each with its own standard rate) → **work package** (Site Installation,
Commissioning …) → **activities and expenses**. A work package holds the
man-hour it needs plus the travel, accommodation and per diem that come with it,
and man-hour bought from a supplier carries its supplier and quotation number
instead of a master rate.

Screens included: Login · Dashboard · Inquiry List · Create Inquiry · Inquiry
Detail · Meeting Log · Estimate Cost List · Estimate Cost Workspace · Add Cost
Item · Engineering Man-hour · Other Project Cost · Multi-Engineer Assignment ·
Estimate Validation · Revision History · Create Revision · Compare Revision ·
Engineering Review · Price Library · Price Search Popup · Price History ·
Supplier Quotation · Waiting Supplier Price · Import Excel · Copy Previous
Estimate · Customers · Projects · Reports · Master Data · Engineering Rate
Master · Audit Log · Settings.

All screens are driven by the in-repo dataset; wiring them to the API routes
under `app/api/` and the Drizzle schema in `db/schema.ts` is the next step.

---

## Platform notes (vinext starter)

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
