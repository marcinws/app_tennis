<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ręczny wynik gema i przebieg meczu

- **Plan**: context/changes/manual-game-score-and-game-list/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

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

### F1 — Rollback poniżej f1549bc3 psuje mecze z game_score

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/deployment/deploy-plan.md:97 (sekcja 7. Rollback); skutki w src/pages/matches/[id].astro:53-58, src/lib/services/match-sync.ts:65-67
- **Detail**: Kod sprzed S-04 odrzuca akcję `game_score` w `parseMatchActions`. Po ręcznym `wrangler rollback` do e46635c0 każdy mecz z ręcznym gemem daje 500 „Nie udało się wczytać meczu”, a telefon przenosi lokalną kopię do `:corrupt`. Automatyczny rollback w CI jest bezpieczny (smoke produkcyjny niczego nie zapisuje). Dziennik mówi tylko „bez migracji”, choć S-04 zmienia format zapisu przebiegu. Pokrewne: karta otwarta przed wdrożeniem ponawia zapis z `invalid_response` po 409 z `game_score`, aż do przeładowania (bez utraty danych).
- **Fix**: Dopisać w sekcji Rollback wiersz: nowy typ akcji = zmiana formatu danych; rollback poniżej f1549bc3 niebezpieczny, gdy istnieje mecz z `game_score` — tylko poprawka do przodu. Opcjonalnie lekcja przez /10x-lesson.
  - Strength: Dokumentuje ryzyko w miejscu, które czyta się przy awarii; zero zmian kodu.
  - Tradeoff: Nie usuwa ryzyka, tylko je opisuje.
  - Confidence: HIGH — potwierdzone w kodzie parsera sprzed S-04.
  - Blind spot: Nie sprawdzono, czy na produkcji istnieje już mecz z `game_score` (test na telefonie prawdopodobnie go utworzył).
- **Decision**: FIXED

### F2 — Grupy przycisków panelu bez etykiety dla czytnika ekranu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/match/ManualGameScore.tsx:177-213
- **Detail**: Rzędy przycisków `aria-pressed` (0/15/30/40/AD) leżą pod `<p>` z nazwą, który nie jest z nimi powiązany; czytnik ogłasza „15, wciśnięty” bez informacji, czyj to wynik.
- **Fix**: Owinąć każdy rząd (także rząd trybów) w `role="group"` z `aria-labelledby` wskazującym `<p>` z nazwą.
- **Decision**: FIXED

### F3 — Fokus znika po zamknięciu panelu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/match/MatchRecorder.tsx:211-241
- **Detail**: Przycisk „Wpisz wynik gema” ma `aria-expanded`, ale nie `aria-controls`; panel nie ma id ani etykiety. Po Zapisz/Anuluj panel znika z fokusem w środku, więc fokus spada na `<body>`.
- **Fix**: Nadać panelowi `id` i `aria-label`, dodać `aria-controls` na przycisku i po zamknięciu oddać fokus przyciskowi przez ref.
- **Decision**: FIXED

### F4 — „Gem dla …” domyślnie zapisuje 40:0

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/match/ManualGameScore.tsx:82
- **Detail**: Wynik przegranego w trybie „Gem dla …” startuje od 0, a nie od bieżącego wyniku. Dwa dotknięcia (Gem dla X, Zapisz) zapisują 4:0, nawet gdy na tablicy było 30:30 — nieuważny zapis gubi punkty przeciwnika.
- **Fix**: Po wyborze „Gem dla X” ustawić wynik przegranego na min(bieżące punkty przeciwnika, 3).
- **Decision**: FIXED

### F5 — Panel powtarza reguły gema z scoring.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/match/ManualGameScore.tsx:85-86, 108-110
- **Detail**: Panel sam wylicza `target`/`lead`, które `replayMatch` też wylicza (scoring.ts:195-196); `other()` jest skopiowane do obu nowych komponentów. Serwer waliduje ponownie, więc rozjazd dałby tylko aktywne „Zapisz” kończące się 400.
- **Fix**: Wyeksportować z scoring.ts `gameTarget(inTiebreak, tiebreakTo, withAdvantage)` i `other`, użyć ich w panelu i liście.
- **Decision**: FIXED

### F6 — Nieaktualny komentarz o rozmiarze przebiegu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/matches/[id]/log.ts:7
- **Detail**: Komentarz mówi „about 72 KB”; z `game_score` (ok. 48 B na akcję) największy poprawny przebieg to ok. 96 KB, nadal poniżej limitu 131072.
- **Fix**: Zmienić komentarz na „about 96 KB”.
- **Decision**: FIXED

### F7 — Drobne odstępstwa wyglądu od planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/match/GameList.tsx:16-22, 71; ManualGameScore.tsx:218
- **Detail**: Tie-break w liście ma numer „TB” zamiast 13; gem bez przewag wygrany 4:3 ma opis „przy 40:40” (plan: przykład „gem przy AD”); opis wyniku w panelu stoi nad przyciskami, plan mówił „pod Zapisz”. Znaczenie poprawne, test na telefonie przeszedł.
- **Fix**: Zaakceptować jako adaptacje i dopisać jedno zdanie do planu.
- **Decision**: FIXED
