# IoT Team Center - Claude Instructions

## Before working

1. Read `COORDINATION.md` before inspecting or editing implementation files.
2. Check the Active claims table and add a claim before editing any file.
3. Do not edit files claimed by another agent. Record a question in the Discussion section instead.
4. Work only in this worktree unless the user explicitly asks for another path.

## Project commands

- Install dependencies: `npm install`
- Start the frontend: `npm run dev`
- Run lint: `npm run lint`
- Run TypeScript checks: `npm run typecheck`
- Run the full frontend test suite: `npm test`

## Working rules

- Keep changes additive and narrowly scoped to the requested task.
- Preserve existing Team Test, API, database, and deployment conventions.
- Do not apply migrations, restart shared services, create real signatures, or write real customer data without explicit user approval.
- Do not modify generated output or `dist/` unless the task specifically requires a release artifact.
- Run the narrowest relevant validation after each edit, then release the claim in `COORDINATION.md`.
- Sign and date coordination entries as `Claude, YYYY-MM-DD HH:mm`.

## Source of truth

- Product and domain requirements: `FEATURES.md` and the relevant file under `docs/`.
- Shared agent coordination: `COORDINATION.md`.
- Frontend: `app/`.
- Node backend: `backend-node/`.
- Database migrations and scripts: `database/`.
