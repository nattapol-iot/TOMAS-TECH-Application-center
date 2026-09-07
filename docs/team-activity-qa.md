# Team Activity testing review — 7 September 2026

The user requested an independent testing team, bug fixes, a summary and a commit. Three reviewers examined authorization and privacy, scoring and KPI completion, and the UI/reporting workflow. The parent integrated fixes and runs all heavy checks sequentially. Tests use disposable SQL databases; no business reporting obligations or scores are created in Team Test.

## Findings and fixes

| Severity | Reproduction and impact | Fix and regression |
| --- | --- | --- |
| High | On the private LAN HTTP origin, `crypto.randomUUID` is unavailable. Submitting a daily report throws before the error handler and leaves Save busy. | Generate RFC 4122 v4 request keys with `getRandomValues`, catch failures, restore controls and retain the same key on unchanged retries. UI tests exercise HTTP-compatible crypto and a failed key generator. |
| High | A project-only leader can read a member's global reporting-exception reason in member details. | Preserve the exempt date/status but redact the reason outside full-member scope. API checks compare employee, department manager and project leader responses. |
| High | An ACTIVE review with at least ten missing duty days and no UPDATE evidence cannot complete: quality requires evidence that does not exist. | Permit a documented zero-quality review without evidence only when all three scores are zero and the server confirms no UPDATE in that cycle. API tests reject bypasses, then complete a fully missing cycle with rating 1 and combined KPI 3.7 from base 4. |
| Medium | A KPI manager outside activity scope can reconstruct the hidden activity rating from the combined overall score. | Return no combined score when an eligible ACTIVE contribution is outside scope. Authorized department/Admin scores remain available; trial and insufficient-data reviews keep their existing base score. |
| Medium | Switching report targets preserves the previous task's form state and can submit that draft against a different task. Switching form/month/date can silently discard drafts. | Key forms by target and confirm before leaving a dirty draft. Tests cover declining and accepting a switch, target identity, and month changes. |
| Medium | A requested history/rule period above the date iterator's maximum throws an internal error instead of a validation response. | Validate the inclusive UTC date span first. API tests assert 400 for oversized history and reporting-rule requests. |

## Commit boundary

The checkout also contains earlier uncommitted Support, Reports, localization and other work. Activity changes are selected explicitly, including individual hunks in shared files. Migration 034 and its schema grants are included as migration 035's existing prerequisite; unrelated Support UI/API and other workspace edits are left intact and outside the activity commit. Existing staged changes are preserved. Temporary databases, build copies, logs and runtime settings are excluded.

## Validation

| Check | Result |
| --- | --- |
| Working-source SQL/API integration with restricted application permissions | 80/80 passed |
| Exact staged API release, same isolated integration | 80/80 passed |
| Exact selected commit source, same isolated integration | 80/80 passed |
| Backend unit suite | 86/86 passed |
| Working UI, performance, i18n and production/site-visit guardrails | 68/68 passed |
| Selected commit UI, i18n and applicable guardrails | 58/58 passed |
| Working and selected-commit frontend/backend TypeScript checks | Passed |
| Scoped lint and frontend/backend production builds | Passed |
| Remaining disposable ActivityCI databases | 0 |

The temporary commit-source check initially found that one existing signature-specimen guardrail loads a design document using a fixed path outside the repository. That external path is unavailable from the temporary snapshot. It was excluded from the 58 applicable snapshot checks; the same check passed in the normal working checkout's 68-test run. The snapshot reused installed dependencies and was removed after verification.

The previous broad repository run was not fully green: global lint included existing generated/backup errors, and the unrelated .NET inventory-flow test expected usable quantity 5 but received 6.0000. The activity review does not change inventory behavior or claim these existing failures are resolved.

## Managed release

Released the fixes to http://192.168.1.160:3000/#activity as API `20260906-175927-team-activity`, after a verified COPY_ONLY/CHECKSUM SQL backup. All 333 installed API artifacts match the tested release; all 12 served frontend JS/CSS assets match the production build. API reports ready at schema 35; frontend PID 15628 responds HTTP 200. Browser verification confirmed the latest Thai activity page, own-only employee data, session history and trial policy. Managed services remain running for authorized team use. Existing KPI remains in trial mode; no real reporting duties, quality awards or active policies were seeded.
