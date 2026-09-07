# IoT Team Center Node.js API

This directory is the contract-compatible replacement for the ASP.NET Core API.
It uses Node.js, TypeScript, Fastify, SQL Server through ODBC Driver 18, the
existing Team Test/Entra identity contracts, and the existing database schema.

## Runtime state

The API is fully native Node.js. All 191 application routes—including Inquiry,
Estimate, Project, Material, Knowledge Hub, Sales Intake, Engineer Site Visit,
file upload/download, approvals, reporting, and administration—use Fastify and
SQL Server directly. There is no .NET compatibility gateway or runtime fallback.
SQL Server remains the single source of truth; no production data is copied.

## Commands

```powershell
npm install
npm run typecheck
npm test
npm run build
.\scripts\Start-TeamTestNode.ps1
```

The default Team Test origin is `http://127.0.0.1:5105`. Real secrets are loaded
from the existing DPAPI-protected Team Test runtime and are never written to an
environment file or repository file.

## Release rule

Run type checking, tests, build, health/readiness checks, and at least one
authenticated read/write/upload workflow against the release database before
pointing the LAN frontend at a new build.
