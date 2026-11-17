<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Lista zawodników — plan implementacji

- **Plan**: context/changes/player-roster/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated criteria re-run 2026-11-17: `npm test` 14/14, `npm run lint` 0, `npx astro check` 0 errors, `npm run build` 0, `node --check scripts/smoke.mjs` 0, prettier check 0, 3 × `create policy`, `/players` and `/api/players` in `PROTECTED_ROUTES`. PR #1 CI green (smoke 19/19), deploy `b0ffd4e` green (production smoke 5/5). Manual 3.5–3.7 confirmed by the user (RLS and policies in the panel, phone test: add, rename, duplicate rejected).

## Findings

### F1 — `?error=` shows any text from the URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/players.astro:25
- **Detail**: The page shows the `error` query parameter in the alert box. Astro escapes it, so there is no XSS, but anyone can craft a link that shows their own message in the app (content spoofing, e.g. "Sesja wygasła, zadzwoń pod…"). The routes redirect with full message text (`src/pages/api/players/index.ts:11`, `[id].ts:16`). The auth pages from the starter use the same pattern.
- **Fix A ⭐ Recommended**: Redirect with an error code (`?error=duplicate`, `name_empty`, `name_too_long`, `not_configured`) and map codes to fixed Polish messages on the page; unknown codes show nothing
  - Strength: Removes the spoofing class for `/players`; the message text stays in one place.
  - Tradeoff: `parsePlayerName` returns message text, so it needs an error code (or a lookup) — a change to the domain function and its test.
  - Confidence: HIGH — small, local change; smoke only checks the `/players?error=` prefix.
  - Blind spot: Auth pages keep the pattern unless fixed separately.
- **Fix B**: Leave as is and fix it together with the auth pages in a later change
  - Strength: One consistent fix for all pages.
  - Tradeoff: Spoofing stays possible on production until then.
  - Confidence: MED — risk is low for a single-user MVP.
  - Blind spot: No owner or date for the follow-up.
- **Decision**: FIXED (Fix A) — error codes in `?error=`, fixed messages via `playerErrorMessage`; branch `player-roster-review-fixes`

### F2 — Default grants include TRUNCATE and anon privileges on `players`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116120000_create_players.sql
- **Detail**: Production check (`information_schema.role_table_grants`): `anon` and `authenticated` have `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` on `public.players` (Supabase default). RLS denies `anon` all rows and denies `delete`, but RLS does not cover `TRUNCATE`. PostgREST does not expose `TRUNCATE`, so this is defence in depth, not an open hole.
- **Fix**: New migration `revoke all on public.players from anon; revoke truncate, references, trigger, delete on public.players from authenticated;` — through a branch, PR and `db push` before merge (procedure 3.5)
  - Strength: Grants match the policies; a future access path cannot truncate the table.
  - Tradeoff: A second migration and a PR cycle; the same rule should apply to every next table.
  - Confidence: HIGH — revoke on a table without dependent grants is safe; smoke covers select/insert/update.
  - Blind spot: Whether later slices need `delete` (plan says no delete for now).
- **Decision**: FIXED — migration `20261117120000_restrict_players_grants.sql`; branch `player-roster-review-fixes`, needs `db push` before merge

### F3 — Smoke 404 check does not confirm the name stayed unchanged

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:116
- **Detail**: "second account cannot rename first account's player" checks only status 404. A 404 caused by something other than RLS (e.g. a broken route) would also pass; the list is not re-read as account A.
- **Fix**: After B's attempt, sign in as A again and check `/players` still has "Smoke Player" and no "Smoke Hijacked".
- **Decision**: FIXED — smoke signs in as A again and checks the name is unchanged; branch `player-roster-review-fixes`

### F4 — Bad form content type gives a generic 500

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/players/index.ts:12
- **Detail**: `request.formData()` throws on a missing or wrong content type, before zod validation; Astro logs it and returns 500 instead of 400. No evidence is lost. Same in `[id].ts:22`.
- **Fix**: Leave as is; only the app's own forms post here.
- **Decision**: SKIPPED

### F5 — Production-only Supabase settings are not covered by CI

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/deployment/deploy-plan.md (3.4a)
- **Detail**: After deploy `/players` returned 500 (`PGRST002`) because the production project's Data API exposed no schema; local Supabase in CI uses `supabase/config.toml`, where `public` is exposed. The plan's risk list did not mention project settings outside the repo. Fixed in the panel and recorded as step 3.4a; production smoke still only checks the anonymous redirect, so it cannot catch this.
- **Fix**: Record as a lesson: production Supabase project settings (Data API, auth) are not in the repo — check them before the first deploy of a slice that adds a table; consider a read-only production smoke step that hits a table through PostgREST.
  - Strength: The next table-adding slice (S-02) starts with the check instead of a production 500.
  - Tradeoff: A read-only table check in production smoke needs a signed-in session or an anon-readable endpoint, which this project avoids.
  - Confidence: MED — the lesson is cheap; the smoke step needs design.
  - Blind spot: Other panel settings that differ from `config.toml` were not audited.
- **Decision**: ACCEPTED-AS-RULE: Ustawienia projektu Supabase poza repo
