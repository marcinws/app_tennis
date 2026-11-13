<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Automatyczne wdrażanie na Cloudflare Workers z GitHub Actions

- **Plan**: context/changes/ci-auto-deploy/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria re-run 2026-11-13: 1.2–1.5, 2.1, 2.2, 2.6, 3.1, 3.4 PASS; latest push run 43236290306 green with deploy `1a5510fb`. 3.2 is historical (active version has since moved on with the next CI deploy); evidence is the rehearsal run 43234181132 and the rollback annotation recorded in `deploy-plan.md`.

Post-triage verification 2026-11-13 (commit `b2302ce`): push run 43424094276 green, deployed `7db825d3` confirmed at 100% before smoke; rehearsal run 43424686749 failed on purpose, rolled back to `7db825d3`, post-rollback smoke passed.

## Findings

### F1 — Cloudflare token visible to every step of the deploy job

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:77-79
- **Detail**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are job-level `env`, so `npm ci` (dependency install scripts) and `npm run build` can read the deploy token. `allowScripts` in `package.json` narrows but does not remove the exposure.
- **Fix**: Move both variables into the `env` of the three wrangler steps only (record version, deploy, rollback).
- **Decision**: FIXED — CLOUDFLARE_* moved to the four wrangler steps

### F2 — Post-deploy check can pass against the previous version

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:104-116
- **Detail**: The wait loop and the production smoke only check that `/` answers and auth works. The old version answers the same way, so if the new version is not yet served at the edge the check is a false pass and a broken release would not be rolled back. The same applies to the post-rollback smoke.
- **Fix A ⭐ Recommended**: After `wrangler deploy`, poll `wrangler deployments status --json` until the 100% `version_id` equals the newly deployed version (from `wrangler deploy` output), then run smoke.
  - Strength: The check provably runs against the version it is judging, using the same `deployments status` call already in the job.
  - Tradeoff: Parsing the new version ID from `wrangler deploy` text output; a few more lines of bash.
  - Confidence: MED — status API confirms the control plane, not every edge location.
  - Blind spot: Edge propagation after the control plane switch is not measured.
- **Fix B**: Accept as is and note the limitation in the plan's Open Risks.
  - Strength: No extra complexity; `wrangler deploy` returns after the deployment is active and the rehearsal behaved correctly.
  - Tradeoff: A regression that only shows up on the new version could slip past the check.
  - Confidence: MED — observed propagation was seconds, but only on 3 runs.
  - Blind spot: Behaviour under Cloudflare incidents.
- **Decision**: FIXED (Fix A) — new step waits until the deployed version serves 100% before smoke

### F3 — Post-rollback smoke runs even when the rollback failed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:118-128
- **Detail**: `failure()` stays true after a failed `wrangler rollback`, so the following smoke tests the broken new version and its output can mislead whoever reads the log.
- **Fix**: Give the rollback step `id: rollback` and add `steps.rollback.outcome == 'success'` to the post-rollback smoke condition.
- **Decision**: FIXED — rollback has id; post-rollback smoke requires steps.rollback.outcome == 'success'

### F4 — Empty previous version silently disables rollback

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:96-100
- **Detail**: When no single version serves 100% (gradual rollout) the jq filter returns nothing and the rollback step is skipped; the only trace is `<none>` in the step log.
- **Fix**: Emit `::warning::` when the ID is empty so it shows in the run summary.
- **Decision**: FIXED — ::warning:: when no version serves 100%

### F5 — Production check depends on Supabase error wording

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:81
- **Detail**: The step expects `Invalid%20login%20credentials`; a rewording or an auth rate limit (`Too many requests`) would fail the check and trigger an unnecessary rollback. Already listed in the plan brief's Open Risks.
- **Fix**: Keep for the MVP; if it ever misfires, assert "error present and not `Supabase is not configured`" instead.
- **Decision**: ACCEPTED — keep for the MVP; listed in the plan brief's Open Risks

### F6 — README CI section still describes two jobs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: README.md (section "## CI")
- **Detail**: The plan only touched README's "Smoke test" section; "## CI" still says GitHub Actions runs two jobs and does not mention `deploy` or the rollback.
- **Fix**: Add a `deploy` bullet to README "## CI" (push to main deploys, production smoke, auto-rollback).
- **Decision**: FIXED — deploy job described in README "## CI"

### F7 — ci and smoke jobs use default GITHUB_TOKEN permissions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:15-16
- **Detail**: Only the new `deploy` job sets `permissions: contents: read`; the pre-existing jobs inherit the repository default token scope.
- **Fix**: Add `permissions: contents: read` at workflow level.
- **Decision**: FIXED — workflow-level permissions: contents: read

### F8 — One-off ESLint crash (exit 139) during review

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (`npm run lint`, local Windows, Node 26.13.0)
- **Detail**: Re-running criterion 1.5 once ended with exit code 139 (segmentation fault) and no output; three immediate re-runs passed with exit 0, and CI lint is green. Cause not investigated; not linked to files in this change.
- **Fix**: No change now; if it recurs, capture the crash output and investigate ESLint/Node 26 on Windows.
- **Decision**: ACCEPTED — no change; investigate if the crash recurs
