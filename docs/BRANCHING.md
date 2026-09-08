# Branching Strategy

Simplified Gitflow. Four branch types, one rule: **nothing lands on `main` except through a PR**.

## Branch types

| Branch | Purpose | Branches from | Merges into |
|--------|---------|---------------|-------------|
| `main` | Production — always deployable | — | — |
| `develop` | Integration — where features collect before release | `main` | `main` via PR |
| `feature/…` | Daily feature work | `develop` | `develop` via PR |
| `hotfix/…` | Urgent production fixes | `main` | `main` **and** `develop` via PR |
| `release/vX.Y.Z` | Release stabilisation (optional) | `develop` | `main` via PR |

## Naming conventions

```
feature/20260907-inspection-report
feature/PJ-123-pdf-export
hotfix/fix-sign-off-date
release/v2.1.0
```

## Normal workflow (planned work)

```
develop ──────────────────────────────────► develop
   └── feature/20260907-xyz               PR ──►
```

1. `git checkout develop && git pull`
2. `git checkout -b feature/YYYYMMDD-description`
3. Work, commit, push.
4. Open PR → `develop`. CI (`ci.yml` + `integration.yml`) must pass.
5. Merge to `develop` (squash or merge commit — team preference).
6. When `develop` is ready to ship, open PR `develop → main`.
7. 1 approving review + all checks pass → merge → deploy workflow fires.

## Hotfix workflow (urgent production fix)

```
main ──────────────────────────────────────► main
  └── hotfix/fix-description              PR ──►
                                          PR ──► develop (keep in sync)
```

1. `git checkout main && git pull`
2. `git checkout -b hotfix/description`
3. Fix, commit, push.
4. Open **two PRs**: one to `main`, one to `develop`.
5. Merge `main` PR first (with approval). Deploy fires automatically.
6. Merge `develop` PR to keep both in sync.

## Commit message format

```
type(scope): short description

feat(inspection-report): add PPTX export
fix(estimates): correct VAT rounding on line totals
chore(deps): update pdfjs-dist to 6.4
docs(branching): add hotfix workflow section
refactor(reports): extract shared section builder
test(material-flow): add receiving void scenario
```

Types: `feat` · `fix` · `hotfix` · `chore` · `docs` · `refactor` · `test`

## Branch protection (configure in GitHub Settings → Branches)

**`main`**
- Require PR before merging
- Require 1 approving review
- Require status checks: `lint-typecheck-test`, `backend-compile`, `docker-build`, `sql-integration`
- Block direct pushes (including admins)

**`develop`**
- Require PR before merging
- Require status checks: `lint-typecheck-test`, `backend-compile`
- No review required (CI gate is sufficient for integration speed)

## CI/CD overview

| Workflow | Triggers | Jobs |
|----------|----------|------|
| `ci.yml` | All PRs + pushes to `develop`, `feature/**`, `hotfix/**` | Lint/typecheck/test · Backend compile |
| `integration.yml` | PRs to `main` or `develop` only | Docker build · SQL integration |
| `deploy.yml` | Push to `main` | Deploy (manual approval gate in GitHub Environment) |
