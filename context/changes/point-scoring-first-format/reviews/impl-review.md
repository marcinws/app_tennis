<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Zapis punktów w pierwszym formacie

- **Plan**: context/changes/point-scoring-first-format/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Lost response and a new point give a false conflict

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matches/[id]/log.ts:123-126, src/components/hooks/useMatchLog.ts:113-168
- **Detail**: A save `[P]` with base 0 reaches the server (revision 1), but the response is lost, so the client sees `network_error`. The parent taps another point and the retry sends `[P,P]` with base 0. The stored `[P]` is not equal to `[P,P]`, so the route returns 409 and the screen shows "Mecz zmieniono na innym telefonie" although there is only one phone. Choosing "Wczytaj wersję z serwera" loses the newest points. This hits exactly the weak-network case that FR-011 covers.
- **Fix**: In the route, when the stored log is a prefix of the sent one, save conditionally on the stored revision (`revision = stored + 1`) and return 200. Add a pure function `extendsActions(stored, sent)` in `scoring.ts` with tests, and a smoke step (base 0, `[P,P]` after `[P]` at revision 1 → 200 revision 2).
  - Strength: Overwriting with an extension never drops a stored action, so it is safe whatever phone the actions came from; the client needs no change.
  - Tradeoff: A third path in the route; the extension case after an undo (`[P,P]` stored, `[P]` sent) is still a conflict.
  - Confidence: HIGH — both reviewers reproduced the sequence from the code.
  - Blind spot: A race between the reread and the second update is resolved by the same conditional `eq("revision", …)` and can at worst give a 409.
- **Decision**: FIXED — `extendsActions` in `scoring.ts` (6 tests), a third route path with a conditional save on the stored revision, smoke step "a log extending the stored one is saved"

### F2 — "Zapisano" stays on screen after a new point, and a request has no timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useMatchLog.ts:88-94, 188-190
- **Detail**: `changeActions` keeps the `saved` status, so after a tap the line still says "Zapisano" while the point is only on the phone. `fetch` has no timeout and only one request can be in flight, so a hanging request on a weak signal blocks the queue (`online`/`visibilitychange` do nothing while `inFlight`) and the line keeps saying "Zapisano". The plan defines "Zapisano" as "the server has the log".
- **Fix**: Set `waiting` (or a neutral "Zapisuję…" status) on every new action, and give `fetch` `signal: AbortSignal.timeout(10_000)`, so a timeout counts as `network_error` (retry).
- **Decision**: FIXED — status `waiting` after every action and after a save with new points, `AbortSignal.timeout(10 s)` on `fetch`

### F3 — "Wczytaj wersję z serwera" discards points without warning or a copy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLog.ts:263-273, src/components/match/MatchRecorder.tsx:137
- **Detail**: `keepServer` overwrites the only copy of the points that exist only on the phone. The alert does not say how many will be lost. In addition, the point buttons stay active during a conflict: a tap hides the alert, sends with a stale base, gets 409 and the alert comes back.
- **Fix**: Show the number of actions on the phone and on the server in the alert ("Na tym telefonie: N akcji, na serwerze: M"). Before `keepServer`, keep the discarded log under `match-log:<id>:discarded`. Disable the point buttons, "Cofnij" and "Zmień serwującego" until the conflict is resolved.
  - Strength: The choice is informed, nothing disappears irreversibly, and no flicker.
  - Tradeoff: Plus one storage key and a little more UI.
  - Confidence: HIGH — a local change in the hook and the island.
  - Blind spot: No UI for restoring the `:discarded` copy; it stays as evidence, like `:corrupt`.
- **Decision**: FIXED — counts in the alert (Polish plural), a `:discarded` copy before `keepServer`, buttons and `record`/`undo` locked during a conflict

### F4 — A corrupt phone copy is replaced silently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLog.ts:219-233
- **Detail**: A corrupt copy (e.g. one longer than 2000 actions) goes to the console and to `:corrupt`, the server version is loaded, and the line says "Zapisano". Any pending points in that copy disappear without a visible signal.
- **Fix**: After a corrupt copy, set `status: error` with "kopia na telefonie była uszkodzona" until the next successful save.
- **Decision**: FIXED — status "Uwaga: kopia na telefonie była uszkodzona" until the next successful save (phone-side errors no longer say "ponawiam")

### F5 — The log route reads the body without a size limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/matches/[id]/log.ts:43-49
- **Detail**: `request.json()` reads and parses the whole body (up to 100 MB on Cloudflare) before the 2000-action limit is checked. A logged-in client can send a few MB and exceed the CPU limit (1102 instead of a 4xx). Only the account owner can reach it.
- **Fix**: Reject `Content-Length` above 128 KB with 413 `{ error: "payload_too_large" }` before parsing (the largest valid log is ~72 KB).
- **Decision**: FIXED — 413 `payload_too_large` for `Content-Length` above 128 KB

### F6 — Input bounds: action limit in the client and `base_revision` without a maximum

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLog.ts:252-254, src/pages/api/matches/[id]/log.ts:9
- **Detail**: `record` does not check `MAX_MATCH_ACTIONS` (repeated "Zmień serwującego" can exceed it, and then the server answers `invalid_log` and the copy is corrupt after a reload). `base_revision` above 2^31-1 gives a Postgres error → 500 and endless retrying.
- **Fix**: In `record`, ignore an action at the limit (and disable the buttons), and in the zod schema add `.max(2147483646)` to `base_revision`.
- **Decision**: FIXED — `record` ignored and buttons locked at 2000 actions with a note, `base_revision.max(2147483646)`

### F7 — Other 4xx statuses are retried indefinitely

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/match-sync.ts:246
- **Detail**: 403, 413 and 415 fall under `retry` and are retried every 30 s with "Błąd zapisu (http_403), ponawiam", although a retry will not help.
- **Fix**: Treat every 4xx other than 401/409 as `rejected`; update the test.
- **Decision**: FIXED — every 4xx other than 401/409 → `rejected`; tests for 403/413/415 and 503

### F8 — `isMatchFormatId` is defined three times

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/matches.ts:49, src/pages/api/matches/[id]/log.ts:31, src/pages/matches/[id].astro:21
- **Detail**: Two local copies of the function that already exists in `matches.ts`; S-05 adds formats and three places can drift apart.
- **Fix**: Export `isMatchFormatId` from `matches.ts` and use it in the route and on the page.
- **Decision**: FIXED — `isMatchFormatId` exported from `matches.ts`, the copies in the route and on the page removed

### F9 — The owner can bypass the route through PostgREST

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261118120000_add_match_events.sql:4-10
- **Detail**: The `update (events, revision)` grant lets the owner write `events` directly through PostgREST with their own JWT, bypassing `parseMatchActions` and `replayMatch` (e.g. `[1,2]`). The page then returns 500 for that match. This only affects the owner's own data.
- **Fix**: Accept it as a known limitation (the owner can only break their own match); the page and route do not hide it (log + 500).
- **Decision**: ACCEPTED — known limitation: the owner can only break their own match, and the page and route log it and return 500

### F10 — Phone copies are never deleted, and two tabs overwrite each other

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useMatchLog.ts:66-76
- **Detail**: `match-log:*` keys stay after sync and after sign-out (on a shared phone the next user's browser keeps the previous account's logs; the storage quota fills over time, which shows up as a storage error). Two tabs of the same match overwrite one key without a `storage` listener.
- **Fix**: Remove the key after a save with `pending: false` (the server is then the source of truth); leave two tabs as a known limitation.
- **Decision**: FIXED — the key is removed after a full save; two tabs left as a known limitation

## Triage

- Fixed: F1, F2, F3, F4, F5, F6, F7, F8, F10 (9)
- Accepted: F9 (1)
- Gates after fixes: `npm test` 127/127, `npm run lint`, `npx astro check` 0 errors, `npm run build`, `node --check scripts/smoke.mjs`.
