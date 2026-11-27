<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Awaria Supabase Auth nie wygląda jak wylogowanie

- **Plan**: context/changes/auth-outage-looks-signed-out/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Zakres: `327b731..de5e430`. W diffie są tylko pliki z planu (`src/lib/services/auth.ts`, `auth.test.ts`, `src/middleware.ts`) i folder zmiany. Kontrakt fazy 1 (reguła klasyfikacji, sygnatura, 9 przypadków testowych) i fazy 2 (treść logów, 503 + `Retry-After: 5`, JSON albo tekst, `locals.user = null` przy błędzie) jest zrealizowany dosłownie. Granice „What We're NOT Doing” są zachowane. Ścieżki błędów auth-js sprawdzone w `GoTrueClient.js:2721-2729`: każdy `AuthError` wraca jako `{ user: null, error }`, a wyjątek innego typu jest rzucany dalej i kończy się logowanym 500 Astro. Nic nie ginie po cichu. Kryteria automatyczne: `npm test` 288/288, `astro check`, lint, build i CI na PR #18 przechodzą. Kroki ręczne 2.5 i 2.6 potwierdził użytkownik.

## Findings

### F1 — Rozgałęzienie middleware nie ma testu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:38-65
- **Detail**: Testy obejmują tylko `classifyAuthError`. Przejście od wyniku do odpowiedzi (503 albo przekierowanie albo `next()`, JSON albo tekst, rozróżnienie trasy chronionej i publicznej) sprawdzono tylko ręcznie. Regresja, np. odwrócenie warunku `isProtected`, nie zatrzymałaby CI. Test smoke obejmuje wyłącznie ścieżkę bez awarii.
- **Fix**: Wydzielić czystą decyzję `authDecision(outcome, isProtected, hasUser) → "next" | "redirect" | "unavailable_json" | "unavailable_text"` do `src/lib/services/auth.ts` i przetestować ją tabelą.
- **Decision**: FIXED — authDecision extracted to src/lib/services/auth.ts with a 6-case table test (red on a stub, green after); middleware uses it

### F2 — CLAUDE.md opisuje middleware sprzed zmiany

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:38
- **Detail**: Sekcja „Logowanie” mówi tylko, że middleware „przekierowuje niezalogowanych”. Następny agent nie dowie się, że awaria Auth daje 503 `auth_unavailable` i że kod `getUser()` nie może ignorować `error`.
- **Fix**: Dopisać jedno zdanie: przy niedostępnym Supabase Auth (`classifyAuthError` → `unavailable`) chronione trasy dostają 503 `auth_unavailable` z logiem `Supabase Auth unavailable`, a nie przekierowanie.
- **Decision**: FIXED — CLAUDE.md "Logowanie" describes the 503 auth_unavailable path

### F3 — Strona 503 to goły tekst

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:19-22
- **Detail**: Rodzic, który odświeży stronę meczu w trakcie awarii, zobaczy sam tekst bez layoutu i bez przycisku ponowienia. Kolejka w localStorage przetrwa, więc dane są bezpieczne. Plan wybrał ten wariant celowo, to jest tylko kwestia UX.
- **Fix**: Na razie zostawić. Gdy powstanie `src/pages/500.astro` (przyczyna nr 5 z audytu), oprzeć na nim także tę odpowiedź.
- **Decision**: DEFERRED — follow-up queued in follow-ups/review-fixes.md (with audit root cause 5)
