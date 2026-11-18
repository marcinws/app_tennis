# Ręczny wynik gema i przebieg meczu — plan implementacji

## Overview

Rodzic, który przegapił część punktów, wpisuje ręcznie wynik bieżącego gema albo rozstrzyga gem z końcowym wynikiem (FR-007). Aplikacja przyjmuje tylko wyniki możliwe w formacie meczu. Pod wynikiem widać przebieg meczu jako listę gemów (FR-009). To S-04 z `context/foundation/roadmap.md`.

## Current State Analysis

- Przebieg meczu to lista akcji w `matches.events` (`jsonb`). Obecnie są dwa typy: `point` i `switch_server`. Stan meczu odtwarza `replayMatch` w `src/lib/services/scoring.ts:73`.
- Tę samą funkcję wywołują ekran (`src/components/match/MatchRecorder.tsx`, `useMemo`) i trasa zapisu `PUT /api/matches/[id]/log` (`src/pages/api/matches/[id]/log.ts:88-93`). Błąd odtworzenia trasa zwraca jako 400 `{ error: replay.error }`, a telefon pokazuje go jako „Serwer odrzucił zapis (…)”.
- `parseMatchActions` (`scoring.ts:167`) przepuszcza tylko znane kształty akcji. Każdy nowy typ trzeba dopisać tam, bo inaczej trasa i odczyt z telefonu odrzucą przebieg jako `invalid_log` albo uszkodzoną kopię.
- Kolejka na telefonie (`src/components/hooks/useMatchLog.ts`) zapisuje dowolną `MatchAction` przez `record` i cofa ostatnią przez `undo`. Nowa akcja dostaje ten sam zapis na telefonie, synchronizację, cofanie i konflikty bez zmian w kolejce.
- `replayMatch` nie zapamiętuje zakończonych gemów. Trzyma tylko bieżący gem, gemy bieżącego seta i zakończone sety.
- Kolumna `events` ma w bazie tylko ograniczenie długości (2000 akcji), więc nowy typ akcji nie wymaga migracji.

## Desired End State

- Pod przyciskiem „Cofnij” jest przycisk „Wpisz wynik gema”. Otwiera panel, w którym rodzic dotknięciami wybiera wynik bieżącego gema albo „Gem dla …” z wynikiem przegranego i zapisuje. W tie-breaku panel ma liczniki −/+.
- Wynik w trakcie gema zastępuje punkty bieżącego gema. Rozstrzygnięty gem zamyka gema jak ostatni punkt: zmienia serwującego, liczy set, tie-break i koniec meczu.
- „Cofnij” usuwa cały ręczny wpis jedną akcją.
- Panel nie pozwala wybrać wyniku niezgodnego z formatem. Trasa odrzuca taki wynik z 400 `invalid_game_score`.
- Sekcja „Przebieg meczu” pokazuje zakończone gemy pogrupowane według setów. Każdy wiersz zawiera numer gema, serwującego, zwycięzcę, wynik punktowy (w tie-breaku liczby), stan seta po gemie i znacznik „ręcznie” przy gemie z ręcznym wpisem.

### Key Discoveries:

- Zamknięcie gema i seta jest w jednym miejscu pętli `replayMatch` (`scoring.ts:104-135`). Ręczny wynik musi przejść przez tę samą ścieżkę, żeby serwujący i tie-break zachowywały się jak przy punktach (ryzyko S-04 w roadmapie).
- Serwujący w tie-breaku wynika z liczby rozegranych punktów (`tiebreakServer(starter, points.player + points.opponent)`, `scoring.ts:64`). Ręczny wynik tie-breaka 5:3 automatycznie daje właściwego serwującego.
- Trasa uruchamia `replayMatch` przed zapisem, więc walidacja w `scoring.ts` od razu obowiązuje na serwerze.
- Smoke (`scripts/smoke.mjs`) ma `saveCapturedMatchLog(baseRevision, events)` i po kroku „a log extending the stored one is saved” mecz konta A ma revision 2 i przebieg `[P, P]`.

## What We're NOT Doing

- Zapis gema jednym dotknięciem (FR-006, poza MVP). Rozstrzygnięcie gema idzie przez panel z wynikiem przegranego.
- Wpisywanie wyniku całego seta ani edycja gema z przeszłości. Ręczny wynik dotyczy tylko bieżącego gema lub tie-breaka; poprawki wcześniejszych gemów robi się cofaniem (FR-008).
- Zapamiętywanie liczby równowag w gemie z przewagami. „Gem dla X przy 40 przeciwnika” zapisuje się jako 5:3.
- Pozostałe formaty, super tie-break i przełącznik przewag w formularzu startu (S-05). Reguły korzystają z `FORMAT_RULES` i `withAdvantage`, więc S-05 je dziedziczy.
- Migracja bazy i zmiany w kolejce synchronizacji.
- Podsumowanie meczu i historia meczów (S-08, S-09). Lista gemów jest tylko na ekranie meczu.
- Testy przeglądarkowe (Playwright).

## Implementation Approach

Ręczny wynik to trzecia akcja w przebiegu: `{ type: "game_score", player, opponent }`, z liczbą punktów każdej strony w bieżącym gemie lub tie-breaku. `replayMatch` podstawia te liczby za bieżące punkty, sprawdza, czy taki wynik jest osiągalny, i jeśli gem jest wygrany, zamyka go wspólną ścieżką z punktem. Ta sama pętla zapisuje rekord każdego zakończonego gema, z którego ekran buduje listę. Panel tłumaczy etykiety 0/15/30/40/AD na liczby, więc reguła osiągalności jest jedna, w czystej funkcji, wspólnej dla ekranu i trasy.

Reguła osiągalności dla gema do `target` punktów z wymaganą przewagą `lead` (gem z przewagami: 4 i 2, bez przewag: 4 i 1, tie-break: `tiebreakTo` i 2):

- **w trakcie** — żadna strona nie wygrała, a przy `lead` 2 obie mają najwyżej `target − 1` albo różnica wynosi najwyżej 1 (40:40, AD); przy `lead` 1 obie mają najwyżej `target − 1`;
- **wygrany** — zwycięzca wygrał, a wynik o jeden punkt zwycięzcy mniej jest poprawnym stanem w trakcie (gem kończy się dokładnie ostatnim punktem).

Przykłady dla gema z przewagami: 3:2, 3:3, 4:3, 4:4 i 6:5 w trakcie; 4:0, 4:2 i 5:3 wygrane; 5:0, 5:2 i 6:3 odrzucone, bo gem skończyłby się wcześniej. Bez przewag: 3:3 w trakcie, 4:3 wygrany, 4:4 i 5:3 odrzucone. W tie-breaku do 7: 6:6 i 8:7 w trakcie, 7:5 i 9:7 wygrane, 8:5 odrzucone.

## Phase 1: Reguły ręcznego wyniku i przebiegu gemów

### Overview

Czyste funkcje obsługują akcję `game_score` z walidacją według formatu i zapisują rekord każdego zakończonego gema. Wszystko pokrywają testy jednostkowe.

### Changes Required:

#### 1. Silnik wyniku

**File**: `src/lib/services/scoring.ts`

**Intent**: Dodać trzecią akcję, regułę osiągalności wyniku i przebieg gemów w jednym module, z którego korzystają ekran i trasa. Zamknięcie gema przez punkt i przez ręczny wynik ma iść tą samą ścieżką kodu, żeby serwujący, sety i tie-break nie mogły się rozjechać.

**Contract**:

- `MatchAction` dostaje wariant `{ type: "game_score"; player: number; opponent: number }` (liczby punktów w bieżącym gemie lub tie-breaku).
- `MAX_GAME_SCORE_POINTS = 99` — górna granica każdej liczby w `parseMatchActions`, żeby niezaufane wejście nie wnosiło dowolnych wartości.
- `isReachableGameScore(score: Score, target: number, lead: 1 | 2): boolean` — eksportowana reguła z sekcji Implementation Approach (używa jej też panel).
- `replayMatch`:
  - `game_score` podstawia punkty bieżącego gema (albo tie-breaka) i stosuje regułę z `target`/`lead` bieżącego trybu: gem `4` i `withAdvantage ? 2 : 1`, tie-break `rules.tiebreakTo` i `2`;
  - nieosiągalny wynik → `{ ok: false, error: "invalid_game_score", index }`;
  - osiągalny i wygrany wynik zamyka gem lub tie-break tą samą ścieżką co punkt; wynik w trakcie zostawia gem otwarty, a serwujący w gemie się nie zmienia;
  - `game_score` po końcu meczu → istniejące `action_after_match_end`;
  - typ błędu `ReplayMatchResult` rozszerza się o `"invalid_game_score"`.
- `MatchState.games` zostaje bez zmian; dochodzi `history: GameRecord[]`, chronologicznie:
  - `GameRecord { set: number; game: number; server: Side; winner: Side; points: Score; tiebreak: boolean; manual: boolean; setScore: Score }`;
  - `set` i `game` liczone od 1, `server` — serwujący gema w chwili jego zakończenia (po ewentualnych poprawkach), w tie-breaku serwujący jego pierwszego punktu;
  - `points` — końcowy wynik punktowy gema, `setScore` — gemy w secie po tym gemie (dla gema kończącego set: końcowy wynik seta, np. 6:4 albo 7:6);
  - `manual` jest `true`, gdy w tym gemie wystąpił `game_score`.
- `parseMatchActions` przyjmuje `game_score` z dwiema liczbami całkowitymi od 0 do `MAX_GAME_SCORE_POINTS`; inne wartości dają `{ ok: false }`. `sameActions`/`extendsActions` (wspólne `sameAction`) porównują też obie liczby.
- `gamePointLabels` bez zmian w kontrakcie; musi poprawnie pokazać stan po ręcznym wpisie (np. 4:3 → „AD”/„40”, 6:5 → „AD”/„40”).

#### 2. Testy reguł

**File**: `src/lib/services/scoring.test.ts`

**Intent**: Zablokować regułę osiągalności i przebieg gemów testami, zanim powstanie panel. Istniejące testy zostają.

**Contract**: przypadki:

- `isReachableGameScore` — wszystkie przykłady z sekcji Implementation Approach (z przewagami, bez przewag, tie-break), w tym odrzucone 5:0, 6:3, 5:3 bez przewag i 8:5 w tie-breaku.
- `replayMatch` z `game_score`:
  - 15:0 i wpis 3:2 → gem trwa, etykiety „40”/„30”, serwujący bez zmian;
  - wpis 4:2 → gem dla zawodnika, gemy 1:0, serwujący zmieniony;
  - bez przewag wpis 4:3 kończy gem, a 4:4 daje `invalid_game_score` z indeksem;
  - gem kończący set (5:4 i wygrany wpis) zamyka set 6:4;
  - w tie-breaku wpis 5:3 → serwujący jak po 8 punktach; wpis 7:5 kończy set 7:6 z `tiebreak: { 7, 5 }`; wpis kończący decydujący set daje zwycięzcę meczu;
  - `game_score` po końcu meczu → `action_after_match_end`;
  - cofnięcie (odcięcie ostatniej akcji) przywraca stan sprzed wpisu.
- `history`:
  - po kilku gemach z punktów: numery, serwujący, zwycięzcy, `points`, `setScore`, `tiebreak: false`, `manual: false`;
  - gem z ręcznym wpisem ma `manual: true`;
  - tie-break daje rekord z `tiebreak: true` i serwującym pierwszego punktu;
  - `switch_server` w trakcie gema zmienia `server` tego gema w rekordzie.
- `parseMatchActions`: poprawny `game_score`; ujemna, ułamkowa, większa niż 99 albo brakująca liczba → `{ ok: false }`; dodatkowe pola pomijane.
- `sameActions` i `extendsActions`: `game_score` z różnymi liczbami nie są równe.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Celowe zepsucie reguły osiągalności (akceptowanie każdego wygranego wyniku, np. 6:3 z przewagami) daje czerwony `npx vitest run src/lib/services/scoring.test.ts`; zmiana cofnięta
- Celowe pominięcie zmiany serwującego po gemie zamkniętym ręcznym wpisem daje czerwony `npx vitest run src/lib/services/scoring.test.ts`; zmiana cofnięta
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Faza nie ma kroków ręcznych.

---

## Phase 2: Panel ręcznego wyniku i lista gemów

### Overview

Na ekranie meczu rodzic wpisuje ręczny wynik dotknięciami i widzi przebieg meczu. Panel pokazuje tylko wyniki, które przejdą regułę z fazy 1.

### Changes Required:

#### 1. Panel ręcznego wyniku

**File**: `src/components/match/ManualGameScore.tsx` (nowy)

**Intent**: Wyspa-dziecko `MatchRecorder` z dużymi przyciskami zamiast pisania. Tłumaczy etykiety na liczby punktów i oddaje gotową akcję `game_score`, więc reguły zostają w `scoring.ts`.

**Contract**:

- Props: `{ state: MatchState; withAdvantage: boolean; tiebreakTo: number; names: Record<Side, string>; onSave(action: MatchAction): void; onCancel(): void }`.
- Gem zwykły, dwa tryby:
  - „W trakcie” — dla każdej strony 0/15/30/40, a z przewagami także „AD” (AD jednej strony oznacza 4:3; AD przy 40:40 tylko dla jednej strony naraz). Start od bieżącego wyniku;
  - „Gem dla …” — wybór zwycięzcy i wyniku przegranego 0/15/30/40; zapis 4:0/4:1/4:2, a przy 40 przegranego 5:3 z przewagami i 4:3 bez.
- Tie-break — liczniki −/+ dla obu stron, start od bieżącego wyniku.
- „Zapisz” aktywne tylko dla wyniku, który przechodzi `isReachableGameScore`; pod nim krótki opis wyniku (np. „Gem dla Ola, 40:30”). „Anuluj” zamyka panel bez zapisu.
- Komponenty `Button` z `@/components/ui`, klasy przez `cn()`.

#### 2. Lista gemów

**File**: `src/components/match/GameList.tsx` (nowy)

**Intent**: Pokazać przebieg meczu (FR-009) z `state.history`, bez osobnego stanu.

**Contract**:

- Props: `{ history: GameRecord[]; names: Record<Side, string>; withAdvantage: boolean }`.
- Sekcja z nagłówkiem „Przebieg meczu”, pogrupowana według setów („Set 1”, „Set 2”…), gemy chronologicznie.
- Wiersz: numer gema, serwujący, zwycięzca, wynik punktowy z perspektywy zawodnika i przeciwnika (etykiety tenisowe, np. 40:30, „gem przy AD”; w tie-breaku liczby, np. 7:5), stan seta po gemie i znacznik „ręcznie”, gdy `manual`.
- Gdy nie ma zakończonych gemów, sekcja się nie wyświetla.

#### 3. Ekran meczu

**File**: `src/components/match/MatchRecorder.tsx`

**Intent**: Dodać przycisk otwierający panel i listę gemów, z tymi samymi blokadami co dla punktów.

**Contract**:

- Przycisk „Wpisz wynik gema” w rzędzie z „Cofnij” i „Zmień serwującego”, aktywny dla tych samych warunków co przyciski punktów (`canScore`).
- Panel otwiera się pod przyciskami i zamyka po „Zapisz” (przez `record`) albo „Anuluj”; zamyka się też, gdy `canScore` stanie się fałszywe (konflikt, koniec meczu).
- `GameList` pod przyciskami, nad linią stanu synchronizacji.
- Komunikat błędu odtworzenia obejmuje `invalid_game_score` („akcja nr N: wynik gema niezgodny z formatem”).

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na telefonie: wpis w trakcie gema (np. 30:15) zmienia wynik, a następne punkty liczą się od niego
- Na telefonie: „Gem dla …” przy 40 przegranego zamyka gem, zmienia serwującego i pojawia się w „Przebiegu meczu” ze znacznikiem „ręcznie”; „Cofnij” usuwa cały wpis
- Na telefonie: w tie-breaku liczniki −/+ działają, a „Zapisz” jest nieaktywne dla wyniku niemożliwego (np. 8:5)

**Implementation Note**: Po fazie poczekaj na potwierdzenie testu na telefonie przed fazą 3.

---

## Phase 3: Smoke i wdrożenie

### Overview

Smoke potwierdza, że trasa przyjmuje przebieg z ręcznym gemem i odrzuca wynik niezgodny z formatem. Zmiana trafia na produkcję przez gałąź i PR.

### Changes Required:

#### 1. Kroki smoke

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić nowy typ akcji na prawdziwej trasie w CI.

**Contract**: dwa kroki konta A zaraz po „match page renders after saving the log” (mecz ma wtedy revision 2 i przebieg `[P, P]`, bo kroki z 409 i 400 niczego nie zapisują):

- „a manual game score is saved” — `saveCapturedMatchLog(2, [P, P, { type: "game_score", player: 4, opponent: 0 }])` → 200 z `"revision":3`;
- „a game score impossible in the format is rejected” — `saveCapturedMatchLog(3, [P, P, { type: "game_score", player: 6, opponent: 3 }])` → 400 z `invalid_game_score`.

Kolejność kroków przed nimi zostaje bez zmian; kroki konta B i produkcyjne bez zmian.

#### 2. Dziennik wdrożeń

**File**: `context/deployment/deploy-plan.md`

**Intent**: Wpis do dziennika po wdrożeniu, jak przy S-03.

**Contract**: nowy wiersz tabeli „Dziennik wdrożeń” z wersją, commitem i wynikiem smoke produkcyjnego.

### Success Criteria:

#### Automated Verification:

- Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- CI na PR zielone (`ci`, `smoke`, w tym oba nowe kroki): `gh pr checks <nr>`
- Po merge job `deploy` i smoke produkcyjny zielone: `gh run view <id>`

#### Manual Verification:

- Na telefonie na produkcji: ręczny gem zapisuje się przy włączonej i wyłączonej sieci, a po powrocie sieci linia stanu pokazuje „Zapisano”
- Dziennik wdrożeń uzupełniony w `context/deployment/deploy-plan.md`

**Implementation Note**: Zmiana nie ma migracji, ale idzie przez gałąź i PR, żeby CI uruchomiło smoke przed wdrożeniem. Merge na `main` to wdrożenie — tylko za zgodą.

---

## Testing Strategy

### Unit Tests:

- Reguła osiągalności dla trzech trybów (gem z przewagami, bez przewag, tie-break) z przykładami brzegowymi.
- `replayMatch`: ręczny wynik w trakcie i rozstrzygający, w secie i tie-breaku, koniec meczu, cofanie, serwujący.
- `history`: numery, serwujący po `switch_server`, tie-break, znacznik ręczny.
- `parseMatchActions` i porównania dla nowego typu.

### Integration Tests:

- Smoke: zapis przebiegu z ręcznym gemem (200) i odrzucenie niemożliwego wyniku (400 `invalid_game_score`) na trasie z lokalnym Supabase w CI.

### Manual Testing Steps:

1. Rozpocznij mecz, zdobądź punkt, otwórz „Wpisz wynik gema” i ustaw 30:15 — wynik się zmienia, kolejne dotknięcie liczy się od 30:15.
2. Otwórz panel, wybierz „Gem dla przeciwnika” z 40 zawodnika — gem zamknięty, serwujący zmieniony, w „Przebiegu meczu” wiersz ze znacznikiem „ręcznie”.
3. „Cofnij” — wpis znika w całości, lista gemów też.
4. Dojdź do 6:6, w tie-breaku wpisz 5:3 — serwujący zgodny z kolejnością tie-breaka; 8:5 ma nieaktywne „Zapisz”.
5. Wyłącz sieć, wpisz ręczny gem, włącz sieć — linia stanu wraca do „Zapisano”.

## Performance Considerations

`replayMatch` przebiega listę akcji raz i dopisuje jeden rekord na gem; przy limicie 2000 akcji koszt na ekranie i w trasie Workera pozostaje pomijalny.

## Migration Notes

Brak migracji. Istniejące przebiegi mają tylko akcje `point` i `switch_server`, które odtwarzają się jak dotąd. Telefon ze starym kodem w otwartej karcie nie zna `game_score`; po przeładowaniu strony dostaje nowy kod z serwera.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-04), PRD: `context/foundation/prd.md` (FR-007, FR-009)
- Poprzedni plan: `context/archive/2026-11-18-point-scoring-first-format/plan.md`
- Silnik wyniku: `src/lib/services/scoring.ts:73`
- Trasa zapisu: `src/pages/api/matches/[id]/log.ts:88`
- Ekran meczu: `src/components/match/MatchRecorder.tsx`
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły ręcznego wyniku i przebiegu gemów

#### Automated

- [x] 1.1 Testy przechodzą: `npm test`
- [x] 1.2 Celowe zepsucie reguły osiągalności daje czerwony test; zmiana cofnięta
- [x] 1.3 Celowe pominięcie zmiany serwującego po ręcznym gemie daje czerwony test; zmiana cofnięta
- [x] 1.4 Lint przechodzi: `npm run lint`
- [x] 1.5 Typy przechodzą: `npx astro check`

### Phase 2: Panel ręcznego wyniku i lista gemów

#### Automated

- [ ] 2.1 Testy przechodzą: `npm test`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Typy przechodzą: `npx astro check`
- [ ] 2.4 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.5 Na telefonie: wpis w trakcie gema zmienia wynik, a następne punkty liczą się od niego
- [ ] 2.6 Na telefonie: „Gem dla …” zamyka gem, zmienia serwującego, trafia do „Przebiegu meczu” ze znacznikiem „ręcznie”; „Cofnij” usuwa wpis
- [ ] 2.7 Na telefonie: liczniki tie-breaka działają, a „Zapisz” jest nieaktywne dla wyniku niemożliwego

### Phase 3: Smoke i wdrożenie

#### Automated

- [ ] 3.1 Składnia smoke poprawna: `node --check scripts/smoke.mjs`
- [ ] 3.2 CI na PR zielone, w tym oba nowe kroki smoke
- [ ] 3.3 Po merge job `deploy` i smoke produkcyjny zielone

#### Manual

- [ ] 3.4 Na telefonie na produkcji: ręczny gem zapisuje się przy włączonej i wyłączonej sieci
- [ ] 3.5 Dziennik wdrożeń uzupełniony
