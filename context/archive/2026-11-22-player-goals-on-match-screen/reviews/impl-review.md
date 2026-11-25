<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cele zawodnika na ekranie meczu

- **Plan**: context/changes/player-goals-on-match-screen/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-22
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
| Success Criteria    | WARNING |

Automatyczne kryteria (2026-11-22): `npm test`, `npm run lint`, `npx astro check`, `npm run build`, `node --check scripts/smoke.mjs` — wszystkie exit 0. Ręczne 2.5, 2.6, 3.3–3.7 potwierdzone przez użytkownika („ok działa”) i dziennik wdrożeń `de3b6a9a`.

Dodatki poza planem, nieszkodliwe: `matches/new.astro` dociąga `players(id, name)` (konsekwencja `Match.player.id`), `revoke execute` na funkcji wyzwalacza, `formnovalidate` na „Zakończ”, 400 przy braku `action`.

## Findings

### F1 — Wyzwalacz limitu zależy od uprawnienia update (name) na players

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261122120000_create_player_goals.sql:50
- **Detail**: `select … for update` na `public.players` w funkcji `security invoker` wymaga, by `authenticated` miało UPDATE na co najmniej jednej kolumnie `players` (dziś `update (name)` z 20261117160000). Odebranie tego uprawnienia w przyszłości (np. niezmienne imiona) sprawi, że każde dodanie celu da 42501 → ogólne 500. Zależność nie jest nigdzie zapisana.
- **Fix**: Dopisać komentarz przy blokadzie w migracji, że wymaga `update (name)` na `players` dla `authenticated` (migracja już wdrożona, więc zmiana tylko w komentarzu pliku nie wpływa na bazę; alternatywnie notka w CLAUDE.md/lessons).
- **Decision**: FIXED (komentarz przy blokadzie i przy uprawnieniach players)

### F2 — Smoke nie obejmuje zmiany i zakończenia celu ani limitu z bazy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:188-246, 350-355
- **Detail**: Trasa `POST /api/players/[id]/goals/[goalId]` (save/end) nie ma kroku smoke, w tym blokady drugiego konta przy zakończeniu cudzego celu i zwolnienia miejsca po zakończeniu. Czwarty cel odrzuca liczenie w trasie, więc wyzwalacz w bazie (gwarancja przy równoczesnych zapisach) nie jest wykonywany w CI, choć Testing Strategy mówi „limit z bazy”. Plan świadomie zostawił save/end telefonowi, bo id celu trzeba wyjąć z HTML.
- **Fix A ⭐ Recommended**: Dodać kroki smoke: wyjąć id celu z `/players/<id>` (regex po `action="/api/players/<id>/goals/<uuid>"`), drugie konto kończy cel A → `goal_not_found`; konto A zmienia tekst → 302; kończy cel → 302; dodaje nowy → 302 (miejsce zwolnione).
  - Strength: Pokrywa jedyną trasę zapisu celów bez testu i jej RLS między kontami, tym samym wzorcem co odczyt `playerAId` z formularza zmiany imienia.
  - Tradeoff: Kilka kroków więcej i zależność od znacznika HTML formularza.
  - Confidence: HIGH — smoke już wyciąga id zawodnika z HTML formularza.
  - Blind spot: Wyzwalacz nadal nie jest wykonywany (wymagałby dwóch równoczesnych żądań albo bezpośredniego insertu przez PostgREST).
- **Fix B**: Zostawić jak jest; save/end i limit sprawdzone na telefonie.
  - Strength: Zero pracy; zgodne z decyzją planu.
  - Tradeoff: Regresja w trasie save/end albo w RLS update przejdzie przez CI niezauważona.
  - Confidence: MED — trasa jest prosta, ale RLS update to granica bezpieczeństwa.
  - Blind spot: Przyszłe zmiany polityk `player_goals`.
- **Decision**: FIXED via Fix A (kroki smoke: zmiana, zakończenie, zwolnienie miejsca, blokada drugiego konta)

### F3 — Trasa zmiany celu odbiega od wzorca sąsiadów przy błędach

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/players/[id]/goals/[goalId].ts:25-27, 58-59
- **Detail**: Zły `action` daje gołe 400 (sąsiedzi przekierowują z kodem), a zero zmienionych wierszy daje przekierowanie `goal_not_found` (w `api/players/[id].ts` jest 404). Oba przypadki osiągalne tylko spreparowanym żądaniem albo nieaktualną stroną; nic nie wycieka.
- **Fix**: Zostawić; dopisać jednozdaniowy komentarz, że `goal_not_found` to przekierowanie, bo nieaktualna strona (cel zakończony w innej karcie) jest zwykłym przypadkiem użytkownika.
- **Decision**: FIXED (komentarz w trasie)

### F4 — Tekst zakończonego celu można zmienić bezpośrednio przez PostgREST

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261122120000_create_player_goals.sql:27-31
- **Detail**: Polityka update nie warunkuje `active`; trasa pilnuje `.eq("active", true)`. Dotyczy wyłącznie własnych danych właściciela. Może mieć znaczenie w S-07/S-08, jeśli obserwacje mają się odnosić do niezmiennej treści celu.
- **Fix**: Bez zmian teraz; rozważyć przy planie S-07 (obserwacje przy celach).
- **Decision**: FIXED (pytanie w Unknowns S-07 w roadmapie)

### F5 — Indeks obejmuje zakończone cele

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261122120000_create_player_goals.sql:13
- **Detail**: Wszystkie zapytania filtrują `active = true`, a zakończone cele zostają na zawsze. Indeks częściowy `(player_id, created_at) where active` byłby mniejszy. Przy skali MVP bez znaczenia.
- **Fix**: Bez zmian; wrócić, jeśli liczba celów urośnie.
- **Decision**: SKIPPED
