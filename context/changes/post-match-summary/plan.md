# Podsumowanie po meczu — plan implementacji

## Overview

Rodzic po meczu widzi na jednym ekranie wynik, przebieg, cele z liczbą obserwacji i notatki (FR-016, US-01). Jeśli nazwa turnieju została pusta, może ją tam uzupełnić (FR-003). To S-08 z `context/foundation/roadmap.md`; domyka US-01 i główne kryterium sukcesu. S-09 użyje tego samego ekranu jako podglądu wcześniejszego meczu.

## Current State Analysis

- Ekran meczu `src/pages/matches/[id].astro` ładuje mecz, log akcji, obserwacje, notatki i cele, a wynik liczy wyspa `MatchRecorder` przez `replayMatch` (`src/lib/services/scoring.ts:139`). Końca meczu nie widać poza napisem „Mecz zakończony — wygrywa …”.
- `GameList` (`src/components/match/GameList.tsx`) renderuje przebieg z `state.history` bez stanu ani zdarzeń, więc da się go wyrenderować statycznie w `.astro`.
- `matches.tournament_name` może być `null`. `authenticated` ma na `matches` tylko `update (events, revision)` (`supabase/migrations/20261118120000_add_match_events.sql`), więc uzupełnienie nazwy wymaga nowego uprawnienia na kolumnę. Polityka `matches_update_own` już istnieje.
- `parseTournamentName` (`src/lib/services/matches.ts`) normalizuje nazwę, a puste pole daje `null`.
- Punkty, obserwacje i notatki mogą czekać na telefonie (`match-log:<id>` z `pending`, `match-notes:<id>`), więc serwer może mieć niepełny zapis.

## Desired End State

- `/matches/<id>/summary` pokazuje:
  - zawodnika, turniej, format, datę i wynik setów;
  - zwycięzcę albo „Mecz niedokończony”;
  - przebieg gemów;
  - cele z liczbą obserwacji;
  - notatki z godziną.
- Bez nazwy turnieju podsumowanie ma formularz „Uzupełnij nazwę turnieju”. Po zapisie nazwa jest widoczna, a formularz znika. Istniejącej nazwy nie da się tam zmienić.
- Ekran meczu ma link „Podsumowanie meczu”: wyróżniony po zakończeniu meczu i zwykły pod szczegółami meczu w każdej chwili.
- Gdy telefon ma niewysłane punkty lub notatki tego meczu, podsumowanie ostrzega o tym i linkuje do ekranu meczu, który je wyśle.
- Podsumowanie widzi wyłącznie właściciel. Cudzy mecz daje 404, a cudza nazwa turnieju nie da się uzupełnić.

### Key Discoveries:

- `replayMatch` i `GameList` są czyste, więc podsumowanie liczy wynik na serwerze bez wyspy React.
- Warunek „tylko gdy pusta” najprościej wymusić w trasie przez `update … .is("tournament_name", null)`. Zero zmienionych wierszy oznacza: nazwa już jest albo mecz jest cudzy.

## What We're NOT Doing

- Statystyki, procenty, wykresy (poza zakresem w PRD).
- Zmiana lub usunięcie istniejącej nazwy turnieju; edycja innych pól meczu.
- Ręczne „zakończenie” meczu (krecz, przerwanie). Niedokończony mecz po prostu ma takie podsumowanie.
- Lista wcześniejszych meczów i usuwanie (S-09).
- Odczyt niewysłanych danych z telefonu do podsumowania; jest tylko ostrzeżenie.
- Testy przeglądarkowe (Playwright).

## Implementation Approach

Statyczna strona `.astro` liczy wynik przez `replayMatch` i składa dane przez czyste funkcje z `src/lib/services/summary.ts`: tekst wyniku setów i cele z liczbą obserwacji. Formularz nazwy turnieju idzie trasą `POST /api/matches/[id]/tournament` z przekierowaniem `?error=`, jak formularze zawodników. Migracja dodaje tylko `grant update (tournament_name)`. Ostrzeżenie o danych na telefonie to mały `<script>` w stronie, który czyta oba klucze localStorage tymi samymi parserami co ekran meczu.

## Phase 1: Reguły podsumowania i uprawnienie

### Overview

Czyste funkcje podsumowania z testami, komunikaty błędów nazwy turnieju i migracja uprawnienia.

### Changes Required:

#### 1. Reguły podsumowania

**File**: `src/lib/services/summary.ts`, `src/lib/services/summary.test.ts`

**Intent**: Tekst wyniku i lista celów w jednym testowalnym miejscu.

**Contract**:

- `setScoresText(state)` → np. `"6:4 3:6 7:6(5)"` z perspektywy zawodnika. Tie-break seta pokazuje w nawiasie punkty przegranego tie-breaka, a super tie-break pokazuje się jako `"[10:8]"`. Pusty mecz to `"0:0"`.
- `summaryGoals(goals, observations, matchCreatedAt)` → `{ id, text, count }[]`: cele z obserwacjami w meczu oraz cele aktywne utworzone przed startem meczu, od najstarszego. Liczba może być 0.
- `hasPendingLocalData(rawLog, rawNotes)` → `true`, gdy kopia logu na telefonie ma `pending` albo kolejka notatek nie jest pusta. Uszkodzona kopia też daje `true`, bo ekran meczu ją obsłuży.

#### 2. Komunikaty

**File**: `src/lib/services/matches.ts` (+ test)

**Intent**: Stałe komunikaty dla formularza nazwy turnieju.

**Contract**: `MATCH_ERROR_MESSAGES` dostaje `tournament_empty` „Wpisz nazwę turnieju” i `tournament_already_set` „Nazwa turnieju jest już uzupełniona”.

#### 3. Migracja

**File**: `supabase/migrations/20261125140000_allow_tournament_name_update.sql`

**Intent**: Trasa uzupełnia tylko `tournament_name`, więc tylko ta kolumna dostaje `update` (lekcja „Uprawnienia tylko na kolumny z formularza”).

**Contract**: `grant update (tournament_name) on public.matches to authenticated;`. Istniejący `check` długości i polityka `matches_update_own` pozostają.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

---

## Phase 2: Ekran podsumowania i uzupełnienie turnieju

### Overview

Strona podsumowania, trasa nazwy turnieju i linki z ekranu meczu.

### Changes Required:

#### 1. Trasa nazwy turnieju

**File**: `src/pages/api/matches/[id]/tournament.ts`

**Intent**: Uzupełnienie pustej nazwy turnieju z formularza.

**Contract**: `POST` z polem `tournament_name`. Waliduje `z.uuid()` i `parseTournamentName`; `null` → `tournament_empty`. Wykonuje `update({ tournament_name }).eq("id").is("tournament_name", null).select("id")`. Zero wierszy → `tournament_already_set`, a błąd bazy → log i 500. Sukces przekierowuje na `/matches/<id>/summary`, błąd na `/matches/<id>/summary?error=<kod>`.

#### 2. Strona podsumowania

**File**: `src/pages/matches/[id]/summary.astro`

**Intent**: Wszystko o meczu na jednym ekranie, bez wyspy React.

**Contract**:

- Ładuje mecz (404 dla cudzego), obserwacje, notatki i cele zawodnika (aktywne plus obserwowane w meczu). Błąd odczytu → log i 500, jak na ekranie meczu.
- Wynik: `replayMatch`; niepoprawny log → log i 500.
- Sekcje „Wynik” (sety, zwycięzca albo „Mecz niedokończony”), „Cele” (`summaryGoals`), „Notatki” (godzina i treść albo „Brak notatek”), „Przebieg meczu” (`GameList` bez `client:*`).
- Formularz nazwy turnieju tylko przy `tournament_name === null`, z komunikatem z `?error=`.
- Ukryte ostrzeżenie „Część zapisu czeka na telefonie — otwórz mecz, żeby ją wysłać” z linkiem do meczu. Pokazuje je `<script>`, gdy `hasPendingLocalData` zwraca `true`.
- Linki „Wróć do meczu” i „Nowy mecz”.

#### 3. Linki z ekranu meczu

**File**: `src/components/match/MatchRecorder.tsx`, `src/pages/matches/[id].astro`

**Intent**: Droga do podsumowania po meczu i w każdej chwili.

**Contract**: `MatchRecorder` przy `state.winner` pokazuje pod napisem o zwycięzcy wyróżniony link „Zobacz podsumowanie”. Strona meczu ma zwykły link „Podsumowanie meczu” obok „Nowy mecz”.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: po zakończonym meczu link prowadzi do podsumowania z poprawnym wynikiem, celami z liczbą obserwacji i notatkami; uzupełnienie pustej nazwy turnieju działa

---

## Phase 3: Smoke i wdrożenie

### Overview

Kroki smoke dla podsumowania i trasy nazwy turnieju, PR, `db push` i wdrożenie.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: CI sprawdza podsumowanie, uzupełnienie nazwy i izolację kont.

**Contract**:

- **Konto A:**
  - podsumowanie meczu z obserwacjami i notatką → 200 z treścią notatki i celu;
  - podsumowanie meczu w krótkich setach (bez nazwy turnieju) → 200 z formularzem;
  - pusta nazwa → `?error=tournament_empty`;
  - nazwa „Smoke Open” → 302 na podsumowanie, a strona pokazuje nazwę;
  - drugie uzupełnienie → `?error=tournament_already_set`.
- **Konto B:**
  - podsumowanie meczu A → 404;
  - uzupełnienie nazwy w meczu A → `?error=tournament_already_set`, a nazwa A się nie zmienia.
- **Tryb `production`:** anonimowe podsumowanie → przekierowanie na logowanie.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone, w tym nowe kroki smoke

#### Manual Verification:

- `npx supabase db push` na produkcji przed merge, potwierdzony przez `npx supabase migration list --linked`
- Po merge job `deploy` i smoke produkcyjny zielone
- Na telefonie na produkcji: podsumowanie prawdziwego meczu poprawne
- Dziennik wdrożeń uzupełniony

---

## Testing Strategy

### Unit Tests:

- `setScoresText`:
  - pusty mecz;
  - mecz w toku (bieżący set z gemami);
  - set z tie-breakiem;
  - super tie-break;
  - zwycięstwo przeciwnika.
- `summaryGoals`:
  - cel z obserwacjami, ale zakończony;
  - aktywny cel utworzony po starcie meczu (pominięty);
  - aktywny cel bez obserwacji (0);
  - kolejność od najstarszego.
- `hasPendingLocalData`:
  - brak kopii;
  - kopia logu `pending: false` / `true`;
  - kolejka notatek pusta / niepusta;
  - uszkodzony JSON.

### Integration Tests:

- Kroki smoke z fazy 3.

### Manual Testing Steps:

1. Zagraj krótki mecz do końca z obserwacjami i notatką i otwórz podsumowanie z linku.
2. Na meczu bez nazwy turnieju uzupełnij nazwę i sprawdź, że formularz znika.
3. Dodaj punkt w trybie samolotowym, a potem otwórz podsumowanie: powinno pokazać się ostrzeżenie.

## Migration Notes

Tylko `grant update (tournament_name)`. Wycofanie kodu jest bezpieczne, bo poprzednia wersja nie używa tego uprawnienia. Wymaga `npx supabase db push` przed merge.

## References

- Wzorzec formularza z `?error=`: `src/pages/api/players/[id].ts`, `src/pages/players.astro`
- Ekran meczu i zapytania: `src/pages/matches/[id].astro`
- Poprzedni wycinek: `context/archive/2026-11-25-in-match-observations-and-notes/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły podsumowania i uprawnienie

#### Automated

- [x] 1.1 Testy przechodzą: `npm test` — 6938e5e
- [x] 1.2 Lint przechodzi: `npm run lint` — 6938e5e
- [x] 1.3 Typy przechodzą: `npx astro check` — 6938e5e

### Phase 2: Ekran podsumowania i uzupełnienie turnieju

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` — 423abcf
- [x] 2.2 Lint przechodzi: `npm run lint` — 423abcf
- [x] 2.3 Typy przechodzą: `npx astro check` — 423abcf
- [x] 2.4 Build przechodzi: `npm run build` — 423abcf

#### Manual

- [ ] 2.5 Na telefonie: po zakończonym meczu link prowadzi do podsumowania z poprawnym wynikiem, celami z liczbą obserwacji i notatkami; uzupełnienie pustej nazwy turnieju działa

### Phase 3: Smoke i wdrożenie

#### Automated

- [x] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs` — 5f2e1cc
- [x] 3.2 CI na PR zielone, w tym nowe kroki smoke — 5f2e1cc

#### Manual

- [ ] 3.3 `npx supabase db push` na produkcji przed merge, potwierdzony przez `npx supabase migration list --linked`
- [ ] 3.4 Po merge job `deploy` i smoke produkcyjny zielone
- [ ] 3.5 Na telefonie na produkcji: podsumowanie prawdziwego meczu poprawne
- [ ] 3.6 Dziennik wdrożeń uzupełniony
