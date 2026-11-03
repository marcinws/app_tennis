---
bootstrapped_at: 2026-11-03T10:37:31+01:00
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter
project_name: tennis-match-companion
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: tennis-match-companion
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack**

A solo developer shipping a small mobile-browser web app in three weeks of after-hours work needs an agent-friendly starter with auth and a database ready from day one. The 10x Astro Starter is the recommended default for a JavaScript/TypeScript web app and clears all four agent-friendly gates; email-and-password accounts (FR-001, FR-018) come from its built-in auth, and the scoring rules stay testable in typed TypeScript. Its bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. The starter does not cover recording a match under a weak connection (FR-011): that needs on-device persistence with later sync, built on top of the starter, and is the largest piece of custom work. Payments, realtime, AI and background jobs are out of scope. Deployment goes to Cloudflare Pages through GitHub Actions with auto-deploy on merge to main.

## Pre-scaffold verification

| Signal      | Value                                                           | Severity | Notes                                              |
| ----------- | --------------------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package | not run                                                         | —        | cmd_template starts with `git clone`; no `create-*` CLI |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-10-29       | fresh    | from card.docs_url                                 |

Local toolchain note: Node v24.21 is installed, while the starter's `.nvmrc` pins Node 26.13.0 and CI uses Node 26. Astro requires Node >=22.23.4, so v24.21 satisfies it; `npm run build` passed on v24.21. After the bootstrap, Node was upgraded to v26.13.0 to match `.nvmrc` and CI; `npm run build` and `npm run lint` pass on v26.13.0.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 51 files (excluding `node_modules`), plus `node_modules/`
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no `.gitignore` in cwd before the scaffold)
**.bootstrap-scaffold cleanup**: deleted

Notes:
- `.bootstrap-scaffold/.git/` was removed before the move, so the starter's history did not carry over.
- The first move of `node_modules` failed with `Permission denied` (a transient Windows file lock); a retry with PowerShell `Move-Item` succeeded.
- `npm install` installed 635 packages. npm did not run the install scripts of `esbuild@0.28.2` and `workerd@1.20261023.1`, because they are not yet covered by `allowScripts`.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 1, informational)
**Summary**: 0 CRITICAL, 0 HIGH, 17 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/8/0 direct of total 0/0/17/0

All 17 findings come from one advisory in the ESLint toolchain (dev dependencies only, not shipped to the browser or the Worker).

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

- **minimatch** `<11.0.1` (transitive): GHSA-g3hv-75wg-m249, "minimatch has potential denial of service via globparts amplification" (https://github.com/advisories/GHSA-g3hv-75wg-m249). This is the root cause of every other entry below.
- Direct packages affected through that chain: `eslint`, `@eslint/js`, `@eslint/compat`, `typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-astro`, `eslint-plugin-jsx-a11y`, `eslint-plugin-prettier`, `eslint-plugin-react`.
- Transitive packages affected: `@eslint-community/eslint-utils`, `@eslint/config-array`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`.
- Fix offered by npm: semver-major downgrades only (e.g. `eslint@4.0.0`, `typescript-eslint@8.36.0`), which would break the lint setup. Better to wait for an upstream release.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
