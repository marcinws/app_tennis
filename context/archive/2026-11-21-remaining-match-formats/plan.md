# Pozostałe formaty meczu — plan implementacji

## Overview

Rodzic wybiera przy starcie meczu jeden z trzech formatów z FR-004: „do 2 wygranych setów” (już jest), „2 sety i super tie-break do 10” albo „krótkie sety do 4 gemów”. Wybiera też, czy gemy są z przewagami, czy bez (punkt decydujący przy 40:40). Tie-break jest zawsze z przewagą 2 punktów. To S-05 z `context/foundation/roadmap.md`.

## Current State Analysis

- Format to `MATCH_FORMATS` w `src/lib/services/matches.ts:3` (jeden wpis `best_of_3_sets`) i `FORMAT_RULES` w `src/lib/services/scoring.ts:35` (`gamesPerSet`, `tiebreakAt`, `tiebreakTo`, `setsToWin`). `Record<MatchFormatId, …>` wymusza reguły dla każdego formatu.
- Baza ma `check (format in ('best_of_3_sets'))` (`supabase/migrations/20261117140000_create_matches.sql:15`) i kolumnę `with_advantage boolean not null default true`. `authenticated` ma `insert` tylko na `(player_id, tournament_name, format, first_server)` (`20261117160000_restrict_columns_and_rls_initplan.sql`), więc formularz nie może dziś ustawić `with_advantage`.
- Trasa startu `src/pages/api/matches/index.ts` waliduje formularz przez `parseMatchStart` i wstawia mecz. Formularz `src/pages/matches/new.astro:107-118` renderuje radio z `MATCH_FORMATS`.
- `replayMatch` (`scoring.ts:129`) zamyka gem i set w `closeGame`; tie-break zaczyna się przy `tiebreakAt:tiebreakAt`, jego serwujący wynika z `tiebreakStarter` i liczby punktów. Reguły gema z przewagami i bez są już w `gameTarget` i `isReachableGameScore` (S-04), więc przełącznik przewag działa w silniku bez zmian.
- Panel ręcznego wyniku dostaje `tiebreakTo={FORMAT_RULES[format].tiebreakTo}` (`MatchRecorder.tsx:241`), czyli stały cel tie-breaka seta. Super tie-break ma inny cel (10), więc panel musi brać cel bieżącego tie-breaka ze stanu.
- Tabela wyniku pokazuje set jako gemy z punktami tie-breaka w indeksie górnym (`MatchRecorder.tsx:139-143`); lista gemów pokazuje tie-break jako „TB”.

## Desired End State

- Formularz „Nowy mecz” ma trzy formaty i wybór „Gemy z przewagami” (domyślnie) / „Gemy bez przewag (punkt decydujący)”.
- Mecz w krótkich setach: set wygrywa ten, kto pierwszy ma 4 gemy z przewagą 2; przy 4:4 tie-break do 7; mecz do 2 wygranych setów.
- Mecz „2 sety i super tie-break”: dwa sety jak w pierwszym formacie; przy 1:1 w setach zamiast trzeciego seta jest super tie-break do 10 z przewagą 2. Serwuje w nim ten, na kogo przypada kolejny gem; kolejność serwisów jak w tie-breaku.
- Ekran meczu pokazuje nagłówek „Super tie-break”, a zakończony super tie-break jako trzeci „set” z liczbą punktów (np. 10:8). Panel ręcznego wyniku w super tie-breaku liczy do 10. Lista gemów oznacza go „STB”.
- Mecz bez przewag liczy gem do 4 punktów bez równowagi; panel ręcznego wyniku nie pokazuje „AD”.
- Trasa startu odrzuca nieznany format (`format_invalid`) i nieznaną wartość przewag (`advantage_invalid`).

### Key Discoveries:

- Reguły gema bez przewag działają już w `replayMatch`, `gameTarget`, `isReachableGameScore`, `gamePointLabels`, panelu i liście gemów; brakuje tylko zapisu `with_advantage` przy starcie.
- Super tie-break to jedyna nowa mechanika: tie-break, który kończy mecz i nie jest poprzedzony gemami seta.
- `MatchRecorder` i trasa zapisu przebiegu biorą format z bazy i odrzucają nieznany (`[id].astro:47-50`, `log.ts:84`), więc nowe id muszą trafić jednocześnie do `MATCH_FORMATS`, `FORMAT_RULES` i `check` w bazie.

## What We're NOT Doing

- Własne schematy punktacji i inne warianty (np. Fast4 z tie-breakiem przy 3:3, mecze do 3 wygranych setów).
- Zmianę formatu lub przewag po rozpoczęciu meczu.
- Zmiany w kolejce synchronizacji i w typach akcji przebiegu.
- Podsumowanie i historię meczów (S-08, S-09).
- Testy przeglądarkowe (Playwright).

## Implementation Approach

`ScoringRules` dostaje `superTiebreakTo: number | null`. Gdy po zamknięciu seta mecz nie jest rozstrzygnięty, a obie strony mają po `setsToWin − 1` setów i format ma `superTiebreakTo`, `replayMatch` od razu otwiera super tie-break: `inTiebreak = true`, `superTiebreak = true`, `tiebreakStarter = server`. Cel bieżącego tie-breaka to `superTiebreak ? superTiebreakTo : tiebreakTo`. Zamknięcie super tie-breaka zapisuje set `{ player: 1|0, opponent: 0|1, tiebreak: points, superTiebreak: true }` i kończy mecz. Krótkie sety to sam wpis w `FORMAT_RULES`.

`MatchState` dostaje `tiebreakTo` (cel bieżącego tie-breaka) i `superTiebreak`, więc panel i etykiety biorą cel ze stanu, a nie z formatu.

Start meczu: `parseMatchStart` przyjmuje `withAdvantage` (`"true"`/`"false"` z radia), trasa wstawia `with_advantage`, migracja rozszerza `check` formatu i nadaje `insert (with_advantage)`.

## Phase 1: Reguły nowych formatów

### Overview

Czyste funkcje znają trzy formaty, super tie-break i wybór przewag przy starcie. Wszystko pokrywają testy jednostkowe.

### Changes Required:

#### 1. Formaty i start meczu

**File**: `src/lib/services/matches.ts`
**Intent**: Dodać dwa formaty i walidację przewag.
**Contract**:

- `MATCH_FORMATS` w kolejności: `best_of_3_sets` „Do 2 wygranych setów, tie-break przy 6:6”; `two_sets_super_tiebreak` „2 sety, przy 1:1 super tie-break do 10”; `short_sets` „Krótkie sety do 4 gemów, tie-break przy 4:4”.
- `MatchStart` dostaje `withAdvantage: boolean`; `parseMatchStart` przyjmuje `withAdvantage: string` (`"true"` → true, `"false"` → false, inne → `advantage_invalid`).
- `MATCH_ERROR_MESSAGES.advantage_invalid`: „Wybierz, czy gemy są z przewagami”.

#### 2. Silnik wyniku

**File**: `src/lib/services/scoring.ts`
**Intent**: Reguły krótkich setów i super tie-breaka.
**Contract**:

- `ScoringRules.superTiebreakTo: number | null`; `FORMAT_RULES`: `best_of_3_sets` bez zmian + `superTiebreakTo: null`; `two_sets_super_tiebreak` = `{ 6, 6, 7, 2, superTiebreakTo: 10 }`; `short_sets` = `{ gamesPerSet: 4, tiebreakAt: 4, tiebreakTo: 7, setsToWin: 2, superTiebreakTo: null }`.
- `SetScore.superTiebreak: boolean`; `MatchState.tiebreakTo: number` (cel bieżącego tie-breaka; poza tie-breakiem cel tie-breaka seta) i `MatchState.superTiebreak: boolean`; `GameRecord.superTiebreak: boolean`.
- Po zamknięciu seta bez końca meczu, przy `superTiebreakTo !== null` i stanie setów `setsToWin − 1 : setsToWin − 1` otwiera się super tie-break (starter = bieżący serwujący). Jego zamknięcie dopisuje set `1:0`/`0:1` z `tiebreak: points` i kończy mecz.
- `game_score` w super tie-breaku waliduje się z celem `superTiebreakTo` i przewagą 2.

#### 3. Testy

**File**: `src/lib/services/scoring.test.ts`, `src/lib/services/matches.test.ts`
**Intent**: Pokryć nowe reguły.
**Contract**:

- Krótkie sety: 4:0 zamyka set; 4:3 nie; 5:3 zamyka; 4:4 otwiera tie-break do 7; mecz kończy się po 2 setach.
- Super tie-break: przy 1:1 w setach `inTiebreak` i `superTiebreak` są true, `tiebreakTo` 10, serwuje kolejny w rotacji; 9:9 trwa, 10:8 i 11:9 kończą mecz; 10:9 trwa; trzeci set ma `superTiebreak: true` i `tiebreak` z punktami; po nim akcja daje `action_after_match_end`; przy 2:0 w setach nie ma super tie-breaka.
- `game_score` w super tie-breaku: 7:5 przyjęte (w trakcie), 10:8 kończy mecz, 11:8 odrzucone.
- `switch_server` w super tie-breaku odwraca startera; `history` ma rekord `superTiebreak: true`.
- Format bez przewag w krótkich setach: przy 3:3 punkt kończy gem.
- `parseMatchStart`: `"true"`/`"false"` przyjęte, `""` i `"yes"` dają `advantage_invalid`; nowe id formatów przyjęte.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie warunku otwarcia super tie-breaka daje czerwony test; zmiana cofnięta
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

## Phase 2: Start meczu i ekran w nowych formatach

### Overview

Migracja, trasa startu, formularz i ekran meczu obsługują nowe formaty i wybór przewag.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261121120000_add_match_formats.sql`
**Intent**: Dopuścić nowe formaty i zapis przewag z formularza.
**Contract**: `alter table public.matches drop constraint matches_format_check, add constraint matches_format_check check (format in ('best_of_3_sets', 'two_sets_super_tiebreak', 'short_sets'));` oraz `grant insert (with_advantage) on public.matches to authenticated;`. Komentarz o zgodności z `MATCH_FORMATS`. Bez zmian RLS (polityki już `(select auth.uid())`).

#### 2. Trasa startu

**File**: `src/pages/api/matches/index.ts`
**Intent**: Przyjąć i zapisać przewagi.
**Contract**: schemat formularza dostaje `with_advantage: z.string()`; `parseMatchStart` z `withAdvantage`; `insert` z `with_advantage`.

#### 3. Formularz

**File**: `src/pages/matches/new.astro`
**Intent**: Wybór przewag.
**Contract**: fieldset „Gemy” z radiami `with_advantage` = `true` „Z przewagami” (zaznaczone) i `false` „Bez przewag (punkt decydujący)”, w stylu istniejących radio.

#### 4. Ekran meczu

**File**: `src/components/match/MatchRecorder.tsx`, `src/components/match/GameList.tsx`
**Intent**: Super tie-break na ekranie.
**Contract**:

- Nagłówek kolumny punktów: „Super tie-break”, gdy `state.superTiebreak`; zakończony set z `superTiebreak` pokazuje w komórce `tiebreak[side]` (punkty) zamiast gemów, bez indeksu górnego.
- Panel dostaje `tiebreakTo={state.tiebreakTo}`.
- Lista gemów: numer „STB” i kolumna „Set” z „–” dla rekordu `superTiebreak`.

#### 5. Strona meczu

**File**: `src/pages/matches/[id].astro`
**Intent**: Pokazać, czy gemy są z przewagami.
**Contract**: w szczegółach meczu pod formatem wiersz „Gemy”: „z przewagami” / „bez przewag”.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: mecz „2 sety i super tie-break” przy 1:1 w setach pokazuje „Super tie-break”, liczy do 10, a po nim mecz jest zakończony
- Na telefonie: mecz w krótkich setach z gemami bez przewag kończy gem punktem przy 40:40 i set przy 4 gemach

## Phase 3: Smoke i wdrożenie

### Overview

Smoke sprawdza nowe formaty na trasie startu i przewagi na trasie zapisu; migracja trafia na produkcję przed merge.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`
**Intent**: Sprawdzić zapis formatu i przewag w CI.
**Contract**:

- `startMatchForCapturedPlayer` wysyła domyślnie `with_advantage: "true"`.
- Nowy krok „unknown advantage value is rejected” — `with_advantage: "maybe"` → 302 `/matches/new?error=advantage_invalid`.
- Nowy krok „a short-set match without advantage starts” — `format: "short_sets", with_advantage: "false"` → 302 na `/matches/<id>`; id zapamiętane osobno.
- Nowy krok „a game won at 40:40 is accepted without advantage” — zapis `[game_score 4:3]` do tego meczu z revision 0 → 200; i „advantage scores are rejected without advantage” — `[game_score 5:3]` z revision 1 → 400 `invalid_game_score`.
- Kolejność pozostałych kroków bez zmian.

#### 2. Wdrożenie

**Intent**: Migracja przed kodem.
**Contract**: gałąź i PR; po zielonym CI użytkownik uruchamia `npx supabase db push` na produkcji (punkt 3.5 `deploy-plan.md`), potem merge; wpis w dzienniku wdrożeń.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone, w tym nowe kroki smoke

#### Manual Verification:

- `npx supabase db push` na produkcji przed merge
- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie na produkcji: start meczu w każdym formacie, z przewagami i bez
- Dziennik wdrożeń uzupełniony

## Testing Strategy

- Jednostkowe: reguły formatów, super tie-break, walidacja startu (faza 1).
- Smoke w CI: trasa startu z nowymi polami i reguła przewag na trasie zapisu (faza 3).
- Ręczne na telefonie: super tie-break i krótkie sety bez przewag.

## Performance Considerations

Bez zmian: `replayMatch` pozostaje liniowy względem liczby akcji.

## Migration Notes

Migracja addytywna: rozszerza `check` i dodaje uprawnienie. Poprzednia wersja Workera działa na nowym schemacie, dopóki nikt nie utworzy meczu w nowym formacie; po tym rollback poniżej wersji z S-05 daje 500 na stronie takiego meczu (jak przy `game_score`, sekcja Rollback w `deploy-plan.md`).

## References

- `context/foundation/prd.md` — FR-004, „Reguły formatów”
- `context/foundation/roadmap.md` — S-05
- `context/archive/2026-11-18-manual-game-score-and-game-list/` — S-04, reguły gema bez przewag
- `context/foundation/lessons.md` — uprawnienia tylko na kolumny z formularza

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły nowych formatów

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — f3f2268
- [x] 1.2 Celowe zepsucie warunku otwarcia super tie-breaka daje czerwony test; zmiana cofnięta — f3f2268
- [x] 1.3 Lint przechodzi: `npm run lint` — f3f2268
- [x] 1.4 Typy przechodzą: `npx astro check` — f3f2268

### Phase 2: Start meczu i ekran w nowych formatach

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — 980e788
- [x] 2.2 Lint przechodzi: `npm run lint` — 980e788
- [x] 2.3 Typy przechodzą: `npx astro check` — 980e788
- [x] 2.4 Build przechodzi: `npm run build` — 980e788

#### Manual

- [x] 2.5 Na telefonie: super tie-break przy 1:1 w setach, do 10, kończy mecz — 980e788
- [x] 2.6 Na telefonie: krótkie sety bez przewag — punkt przy 40:40 kończy gem, set przy 4 gemach — 980e788

### Phase 3: Smoke i wdrożenie

#### Automated

- [x] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs` — 72264d1
- [x] 3.2 CI na PR zielone, w tym nowe kroki smoke — ad78830

#### Manual

- [x] 3.3 `npx supabase db push` na produkcji przed merge — ad78830
- [x] 3.4 Po merge job `deploy` i smoke produkcyjny zielone — ad78830
- [x] 3.5 Na telefonie na produkcji: start meczu w każdym formacie, z przewagami i bez — ad78830
- [x] 3.6 Dziennik wdrożeń uzupełniony — ad78830
