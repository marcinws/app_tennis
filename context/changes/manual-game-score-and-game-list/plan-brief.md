# Ręczny wynik gema i przebieg meczu — Plan Brief

> Full plan: `context/changes/manual-game-score-and-game-list/plan.md`

## What & Why

Rodzic, który przegapił punkty, może ręcznie wpisać wynik gema, a aplikacja odrzuca wyniki niemożliwe w formacie meczu (FR-007). Na ekranie meczu widać przebieg jako listę gemów (FR-009). To S-04 z roadmapy; zastępuje też zapis gema jednym dotknięciem (FR-006), który jest poza MVP.

## Starting Point

S-03 zapisuje mecz jako listę akcji (`point`, `switch_server`) w `matches.events`, odtwarzaną przez `replayMatch` na ekranie i w trasie zapisu. Kolejka na telefonie, cofanie i konflikty działają dla każdej akcji. `replayMatch` nie zapamiętuje zakończonych gemów.

## Desired End State

Przycisk „Wpisz wynik gema” otwiera panel z dużymi przyciskami 0/15/30/40/AD albo „Gem dla …” (w tie-breaku liczniki −/+). Zapis zmienia bieżący wynik albo zamyka gem jak ostatni punkt, z tą samą zmianą serwującego. „Cofnij” usuwa wpis. Pod wynikiem sekcja „Przebieg meczu” pokazuje gemy w setach z serwującym, zwycięzcą, wynikiem, stanem seta i znacznikiem „ręcznie”.

## Key Decisions Made

| Decision         | Choice                                                                                                     | Why (1 sentence)                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Znaczenie wpisu  | Ustawia wynik bieżącego gema; wynik wygrywający zamyka gem                                                 | Pokrywa przegapione punkty i rozstrzygnięcie gema jedną akcją z jednym cofnięciem   |
| Model danych     | Nowa akcja `game_score { player, opponent }` w istniejącym przebiegu                                       | Synchronizacja, cofanie i konflikty działają bez zmian; brak migracji               |
| Walidacja        | Panel oferuje tylko poprawne wyniki; `replayMatch` odrzuca resztę jako `invalid_game_score` (400 w trasie) | Jedna reguła osiągalności wspólna dla ekranu i serwera                              |
| Gem z przewagami | „Gem dla X przy 40 przeciwnika” = 5:3, bez liczby równowag                                                 | Proste dotknięcia na korcie zamiast wpisywania liczb                                |
| Tie-break        | Wpis liczbami (−/+), wygrany tylko od 7 z 2 punktami przewagi                                              | Przegapione punkty w tie-breaku też się zdarzają; serwujący wynika z liczby punktów |
| Lista gemów      | Numer, serwujący, zwycięzca, wynik, stan seta, pogrupowane w sety                                          | Widać przełamania i przebieg seta                                                   |
| Oznaczenie       | Znacznik „ręcznie” przy gemie z ręcznym wpisem                                                             | Odróżnia gem obserwowany od uzupełnionego                                           |
| UI               | Panel pod przyciskami, bez okna modalnego                                                                  | Duże cele dotyku, bez nowego komponentu Dialog                                      |
| Testy            | Unit + 2 kroki smoke + test na telefonie                                                                   | Ten sam wzorzec co S-03; reguła sprawdzona na trasie w CI                           |

## Scope

**In scope:**

- Akcja `game_score`, reguła osiągalności, rekord zakończonych gemów w `replayMatch`
- Panel ręcznego wyniku i sekcja „Przebieg meczu” na ekranie meczu
- Dwa kroki smoke, wdrożenie przez gałąź i PR

**Out of scope:**

- Gem jednym dotknięciem (FR-006), wynik całego seta, edycja dawnych gemów
- Liczba równowag w gemie, pozostałe formaty i przełącznik przewag (S-05)
- Migracja, zmiany kolejki synchronizacji, podsumowanie i historia meczów (S-08, S-09), Playwright

## Architecture / Approach

Panel tłumaczy etykiety na liczby punktów i zapisuje akcję przez istniejące `record`. `replayMatch` podstawia liczby za bieżące punkty, sprawdza osiągalność (gem: 4 punkty, przewaga 2 albo 1; tie-break: `tiebreakTo`, przewaga 2) i zamyka gem wspólną ścieżką z punktem, dopisując rekord do `state.history`. Trasa wywołuje tę samą funkcję, więc niemożliwy wynik dostaje 400.

## Phases at a Glance

| Phase                                       | What it delivers                          | Key risk                                                         |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| 1. Reguły ręcznego wyniku i przebiegu gemów | `game_score`, walidacja, `history`, testy | Ręczny gem rozjedzie się z punktem w serwującym lub tie-breaku   |
| 2. Panel ręcznego wyniku i lista gemów      | Panel z dotknięciami i „Przebieg meczu”   | Panel za ciasny na telefonie                                     |
| 3. Smoke i wdrożenie                        | 2 kroki smoke, PR, wdrożenie, dziennik    | Stary kod w otwartej karcie nie zna nowej akcji do przeładowania |

**Prerequisites:** S-03 wdrożone (jest).
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Gem z przewagami zapisany ręcznie nie zawiera liczby równowag; lista pokazuje go jako wygrany przy 40 przeciwnika.
- Telefon ze starym kodem w otwartej karcie potraktuje przebieg z `game_score` jako błędny do czasu przeładowania strony.

## Success Criteria (Summary)

- Rodzic koryguje przegapione punkty albo rozstrzyga gem kilkoma dotknięciami, a serwujący i wynik seta zgadzają się z kortem.
- Wynik niemożliwy w formacie nie da się zapisać ani na telefonie, ani przez trasę.
- Przebieg meczu widać jako listę gemów z oznaczeniem gemów uzupełnionych ręcznie.
