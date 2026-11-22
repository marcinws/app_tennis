<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pozostałe formaty meczu

- **Plan**: context/changes/remaining-match-formats/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Rollback poniżej 99253419 psuje mecze w nowych formatach

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/deployment/deploy-plan.md:97-108 (sekcja 7. Rollback)
- **Detail**: Starszy Worker ma `MATCH_FORMATS = [best_of_3_sets]`; mecz `two_sets_super_tiebreak` lub `short_sets` daje 500 na stronie (`[id].astro:46-51`) i przy zapisie (`log.ts:84-86`), telefon ponawia zapis. Zawężenie `matches_format_check` nie przejdzie na istniejących wierszach. Wiersz „Migracja bazy” mówi, że poprzednia wersja działa na nowym schemacie — to prawda tylko do pierwszego meczu w nowym formacie. Mecze bez przewag są bezpieczne (stary silnik obsługuje `withAdvantage`).
- **Fix**: Dopisać wiersz w Rollback w stylu wiersza S-04: rollback poniżej `99253419` niebezpieczny po pierwszym meczu w nowym formacie, tylko poprawka do przodu; zawężenie `check` wymaga decyzji o danych.
  - Strength: Ryzyko opisane tam, gdzie czyta się je przy awarii; zero zmian kodu.
  - Tradeoff: Opisuje ryzyko, nie usuwa go.
  - Confidence: HIGH — potwierdzone w kodzie sprzed S-05.
  - Blind spot: To drugi raz z rzędu (S-04, S-05) — kandydat na lekcję.
- **Decision**: FIXED

### F2 — Super tie-break używa słownictwa zwykłego tie-breaka

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/match/MatchRecorder.tsx:107-150; GameList.tsx:45; ManualGameScore.tsx:94-98
- **Detail**: W super tie-breaku tabela wyniku nadal pokazuje kolumnę „Gemy” 0:0, lista gemów ma podpis „Set 3”, a panel pisze „Tie-break dla …” i „w tie-breaku do 10”.
- **Fix**: Ukryć kolumnę „Gemy” w super tie-breaku, podpis „Super tie-break” w liście, w panelu „Super tie-break …”.
- **Decision**: FIXED

### F3 — Błędny komentarz w teście

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/scoring.test.ts:548
- **Detail**: Komentarz mówi „after 24 games”, a `setAll` to 12 gemów (48 akcji).
- **Fix**: „after 12 games”.
- **Decision**: FIXED

Triage: decyzje według rekomendacji, zgodnie z prośbą użytkownika w `change.md`.
